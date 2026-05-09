import express from "express";
import fs from "fs";
import path from "path";
import Video from "../models/Video.js";
import Series from "../models/Series.js";
import { backupDir, uploadDir } from "../server.js";
import { requireAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

// ── In-memory backup state (singleton per server process) ─────────────────────
let state = {
    running: false,
    stopRequested: false,
    total: 0,
    done: 0,
    failed: 0,
    skipped: 0,
    currentFile: null,
    errors: [],
    startedAt: null,
    finishedAt: null,
    status: 'idle', // idle | running | stopped | done | done_with_errors | error
};

const sseClients = new Set();

function broadcast() {
    const msg = `data: ${JSON.stringify(state)}\n\n`;
    for (const res of sseClients) {
        try { res.write(msg); } catch (_) {}
    }
}

function sanitize(name) {
    return (name || 'Unknown')
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 100);
}

function getDestPaths(series, ep) {
    const folder = sanitize(series?.title || 'No Series');
    const season = String(ep.seasonNumber || 1).padStart(2, '0');
    const epNum = String(ep.episodeNumber || 0).padStart(2, '0');
    const epTitle = sanitize(ep.title || 'Episode');
    const ext = path.extname(ep.videoPath || '') || '.mp4';
    const filename = `S${season}E${epNum} - ${epTitle}${ext}`;
    return { folder, filename };
}

function freeSpaceBytes(dir) {
    try {
        const s = fs.statfsSync(dir);
        return s.bfree * s.bsize;
    } catch {
        return Infinity;
    }
}

function copyStream(src, dest) {
    return new Promise((resolve, reject) => {
        const rd = fs.createReadStream(src);
        const wr = fs.createWriteStream(dest);
        const cleanup = (err) => {
            rd.destroy();
            wr.destroy();
            try { fs.unlinkSync(dest); } catch (_) {}
            reject(err);
        };
        rd.on('error', cleanup);
        wr.on('error', cleanup);
        wr.on('finish', resolve);
        rd.pipe(wr);
    });
}

/**
 * FIX #4: Recursively mirror a directory from src to dest.
 * Skips files that already exist with the same size (same skip logic as raw
 * video backup). Returns { copied, skipped, failed } counts.
 */
async function mirrorDirectory(srcDir, destDir, label) {
    let copied = 0, skipped = 0, failed = 0;

    if (!fs.existsSync(srcDir)) return { copied, skipped, failed };

    // Walk the source tree
    const walk = (dir) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const files = [];
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                files.push(...walk(full));
            } else {
                files.push(full);
            }
        }
        return files;
    };

    let allFiles;
    try {
        allFiles = walk(srcDir);
    } catch (err) {
        return { copied: 0, skipped: 0, failed: 1 };
    }

    for (const srcFile of allFiles) {
        if (state.stopRequested) break;

        const rel = path.relative(srcDir, srcFile);
        const destFile = path.join(destDir, rel);
        const relLabel = `${label}/${rel}`;

        state.currentFile = relLabel;
        broadcast();

        // Skip if already backed up with the same size
        if (fs.existsSync(destFile)) {
            try {
                if (fs.statSync(srcFile).size === fs.statSync(destFile).size) {
                    skipped++;
                    continue;
                }
            } catch (_) {}
        }

        try {
            fs.mkdirSync(path.dirname(destFile), { recursive: true });
            await copyStream(srcFile, destFile);
            copied++;
        } catch (err) {
            const msg = err.message || String(err);
            const isSpace = /ENOSPC|no space/i.test(msg);
            state.errors.push(isSpace
                ? `❌ Disk full — stopped at HLS: ${relLabel}`
                : `HLS copy failed [${relLabel}]: ${msg}`
            );
            failed++;
            if (isSpace) {
                state.status = 'error';
                state.stopRequested = true;
            }
        }

        broadcast();
    }

    return { copied, skipped, failed };
}

async function runBackup(backupDir) {
    try {
        fs.mkdirSync(backupDir, { recursive: true });

        const videos = await Video.find({ videoPath: { $exists: true, $ne: null } }).lean();
        const seriesIds = [...new Set(videos.map(v => v.seriesId?.toString()).filter(Boolean))];
        const seriesMap = {};
        if (seriesIds.length) {
            const list = await Series.find({ _id: { $in: seriesIds } }).lean();
            list.forEach(s => (seriesMap[s._id.toString()] = s));
        }

        // FIX #4: Count both raw files and HLS-ready videos so the progress
        // total reflects all work that will be done.
        const hlsVideos = videos.filter(v => v.hlsStatus === 'ready' && v.hlsPath);
        state.total = videos.length + hlsVideos.length;
        broadcast();

        // ── Disk-space preflight ───────────────────────────────────────────────
        // Estimate raw sizes + rough HLS size (HLS is typically ~1.2× the raw)
        const rawBytes = videos.reduce((s, v) => s + (v.fileSize || 0), 0);
        const hlsEstimatedBytes = hlsVideos.reduce((s, v) => s + (v.fileSize || 0) * 1.2, 0);
        const neededBytes = rawBytes + hlsEstimatedBytes;
        const freeBytes = freeSpaceBytes(backupDir);
        const toGB = (b) => (b / 1_073_741_824).toFixed(2) + ' GB';

        if (freeBytes !== Infinity && freeBytes < neededBytes * 1.05) {
            throw new Error(
                `Not enough disk space — need ~${toGB(neededBytes)}, only ${toGB(freeBytes)} free on backup volume`
            );
        }

        // ── Raw video copy loop ────────────────────────────────────────────────
        for (const video of videos) {
            if (state.stopRequested) {
                state.status = 'stopped';
                break;
            }

            const series = seriesMap[video.seriesId?.toString()] || null;
            const { folder, filename } = getDestPaths(series, video);
            const srcPath = path.join(uploadDir, video.videoPath);

            state.currentFile = `${folder}/${filename}`;
            broadcast();

            if (!fs.existsSync(srcPath)) {
                state.errors.push(`Source file missing: ${video.videoPath}`);
                state.failed++;
                state.done++;
                broadcast();
                continue;
            }

            const destFolder = path.join(backupDir, folder);
            const destPath = path.join(destFolder, filename);

            if (fs.existsSync(destPath)) {
                try {
                    if (fs.statSync(srcPath).size === fs.statSync(destPath).size) {
                        state.skipped++;
                        state.done++;
                        broadcast();
                        continue;
                    }
                } catch (_) {}
            }

            try {
                fs.mkdirSync(destFolder, { recursive: true });
                await copyStream(srcPath, destPath);
                state.done++;
            } catch (err) {
                const msg = err.message || String(err);
                const isSpace = /ENOSPC|no space/i.test(msg);
                state.errors.push(isSpace
                    ? `❌ Disk full — stopped at: ${filename}`
                    : `Copy failed [${filename}]: ${msg}`
                );
                state.failed++;
                state.done++;

                if (isSpace) {
                    state.status = 'error';
                    state.stopRequested = true;
                }
            }

            broadcast();
        }

        // ── FIX #4: HLS transcode data backup ─────────────────────────────────
        // Mirror each video's HLS folder into a parallel `_hls` tree inside the
        // backup, preserving the same series/episode folder structure so it's
        // easy to find next to the raw file.
        if (!state.stopRequested) {
            for (const video of hlsVideos) {
                if (state.stopRequested) {
                    state.status = 'stopped';
                    break;
                }

                const series = seriesMap[video.seriesId?.toString()] || null;
                const { folder, filename } = getDestPaths(series, video);
                // Strip extension to get a base name for the HLS folder
                const hlsBaseName = filename.replace(/\.[^.]+$/, '');

                const srcHlsDir  = path.join(uploadDir, 'hls', video._id.toString());
                // Stored alongside the raw video under a sibling `_hls` directory
                const destHlsDir = path.join(backupDir, folder, '_hls', hlsBaseName);

                state.currentFile = `${folder}/_hls/${hlsBaseName}/…`;
                broadcast();

                const { copied, skipped, failed } = await mirrorDirectory(
                    srcHlsDir,
                    destHlsDir,
                    `${folder}/_hls/${hlsBaseName}`
                );

                state.skipped += skipped;
                state.failed += failed;
                state.done++;

                if (failed > 0) {
                    // Errors were already pushed inside mirrorDirectory
                }

                broadcast();
            }
        }

        if (state.status === 'running') {
            state.status = state.failed > 0 ? 'done_with_errors' : 'done';
        }
    } catch (err) {
        state.errors.push(err.message);
        state.status = 'error';
    } finally {
        state.running = false;
        state.currentFile = null;
        state.finishedAt = new Date().toISOString();
        broadcast();
    }
}

// ─── GET /api/backup/status  (SSE — real-time progress) ──────────────────────
router.get('/status', requireAdmin, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    res.write(`data: ${JSON.stringify(state)}\n\n`);

    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
});

// ─── GET /api/backup/state  (one-shot poll) ───────────────────────────────────
router.get('/state', requireAdmin, (_req, res) => res.json(state));

// ─── POST /api/backup/start ───────────────────────────────────────────────────
router.post('/start', requireAdmin, async (req, res) => {
    if (state.running) {
        return res.status(409).json({ error: 'A backup is already in progress' });
    }

    if (!backupDir) {
        return res.status(500).json({ error: 'Backup directory not configured' });
    }

    state = {
        running: true, stopRequested: false,
        total: 0, done: 0, failed: 0, skipped: 0,
        currentFile: null, errors: [],
        startedAt: new Date().toISOString(), finishedAt: null,
        status: 'running',
    };
    broadcast();

    res.json({ success: true, message: 'Backup started' });

    runBackup(backupDir).catch(console.error);
});

// ─── POST /api/backup/stop ────────────────────────────────────────────────────
router.post('/stop', requireAdmin, (req, res) => {
    if (!state.running) {
        return res.status(400).json({ error: 'No backup is currently running' });
    }
    state.stopRequested = true;
    res.json({ success: true, message: 'Stop requested — current file will finish before halting' });
});

export default router;