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
        .slice(0, 100); // cap length for filesystem safety
}

function getDestPaths(series, ep) {
    const folder   = sanitize(series?.title || 'No Series');
    const season   = String(ep.seasonNumber || 1).padStart(2, '0');
    const epNum    = String(ep.episodeNumber || 0).padStart(2, '0');
    const epTitle  = sanitize(ep.title || 'Episode');
    const ext      = path.extname(ep.videoPath || '') || '.mp4';
    const filename = `S${season}E${epNum} - ${epTitle}${ext}`;
    return { folder, filename };
}

function freeSpaceBytes(dir) {
    try {
        // Node 18.12+ — works on Linux, macOS, Windows
        const s = fs.statfsSync(dir);
        return s.bfree * s.bsize;
    } catch {
        return Infinity; // can't check — let it proceed, copy will fail naturally
    }
}

function copyStream(src, dest) {
    return new Promise((resolve, reject) => {
        const rd = fs.createReadStream(src);
        const wr = fs.createWriteStream(dest);
        const cleanup = (err) => {
            rd.destroy();
            wr.destroy();
            try { fs.unlinkSync(dest); } catch (_) {} // remove partial file
            reject(err);
        };
        rd.on('error', cleanup);
        wr.on('error', cleanup);
        wr.on('finish', resolve);
        rd.pipe(wr);
    });
}

async function runBackup(backupDir) {
    try {
        fs.mkdirSync(backupDir, { recursive: true });

        // Load all videos + their series
        const videos    = await Video.find({ videoPath: { $exists: true, $ne: null } }).lean();
        const seriesIds = [...new Set(videos.map(v => v.seriesId?.toString()).filter(Boolean))];
        const seriesMap = {};
        if (seriesIds.length) {
            const list = await Series.find({ _id: { $in: seriesIds } }).lean();
            list.forEach(s => (seriesMap[s._id.toString()] = s));
        }

        state.total = videos.length;
        broadcast();

        // ── Disk-space preflight ───────────────────────────────────────────────
        const neededBytes = videos.reduce((s, v) => s + (v.fileSize || 0), 0);
        const freeBytes   = freeSpaceBytes(backupDir);
        const toGB        = (b) => (b / 1_073_741_824).toFixed(2) + ' GB';

        if (freeBytes !== Infinity && freeBytes < neededBytes * 1.05) { // 5% buffer
            throw new Error(
                `Not enough disk space — need ~${toGB(neededBytes)}, only ${toGB(freeBytes)} free on backup volume`
            );
        }

        // ── Copy loop ──────────────────────────────────────────────────────────
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
            const destPath   = path.join(destFolder, filename);

            // ── Skip if already backed up with same size ───────────────────────
            if (fs.existsSync(destPath)) {
                try {
                    const srcSize  = fs.statSync(srcPath).size;
                    const destSize = fs.statSync(destPath).size;
                    if (srcSize === destSize) {
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
                // Surface disk-full errors prominently
                const isSpace = /ENOSPC|no space/i.test(msg);
                state.errors.push(isSpace
                    ? `❌ Disk full — stopped at: ${filename}`
                    : `Copy failed [${filename}]: ${msg}`
                );
                state.failed++;
                state.done++;

                if (isSpace) {
                    state.status = 'error';
                    state.stopRequested = true; // abort remaining files
                }
            }

            broadcast();
        }

        if (state.status === 'running') {
            state.status = state.failed > 0 ? 'done_with_errors' : 'done';
        }
    } catch (err) {
        state.errors.push(err.message);
        state.status = 'error';
    } finally {
        state.running     = false;
        state.currentFile = null;
        state.finishedAt  = new Date().toISOString();
        broadcast();
    }
}

// ─── GET /api/backup/status  (SSE — real-time progress) ──────────────────────
router.get('/status', requireAdmin, (req, res) => {
    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.flushHeaders();

    // Immediately push current state so the client doesn't wait
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

    // Reset state
    state = {
        running: true, stopRequested: false,
        total: 0, done: 0, failed: 0, skipped: 0,
        currentFile: null, errors: [],
        startedAt: new Date().toISOString(), finishedAt: null,
        status: 'running',
    };
    broadcast();

    res.json({ success: true, message: 'Backup started' });

    // Fire-and-forget — progress goes via SSE
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