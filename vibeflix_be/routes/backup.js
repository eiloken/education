import express from "express";
import fs from "fs";
import path from "path";
import Video from "../models/Video.js";
import Series from "../models/Series.js";
import { backupDir, uploadDir } from "../server.js";
import { requireAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

// ── In-memory backup state ────────────────────────────────────────────────────
let backupState = {
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
    mode: 'both',   // both | raw | hls
};

// ── In-memory restore state ───────────────────────────────────────────────────
let restoreState = {
    running: false,
    total: 0,
    done: 0,
    failed: 0,
    skipped: 0,
    currentFile: null,
    errors: [],
    startedAt: null,
    finishedAt: null,
    status: 'idle', // idle | running | done | done_with_errors | error
};

const backupSseClients  = new Set();
const restoreSseClients = new Set();

function broadcastBackup() {
    const msg = `data: ${JSON.stringify(backupState)}\n\n`;
    for (const res of backupSseClients) { try { res.write(msg); } catch (_) {} }
}

function broadcastRestore() {
    const msg = `data: ${JSON.stringify(restoreState)}\n\n`;
    for (const res of restoreSseClients) { try { res.write(msg); } catch (_) {} }
}

// ── Shared helpers ─────────────────────────────────────────────────────────────
function sanitize(name) {
    return (name || 'Unknown')
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 100);
}

/** Destination paths for a series episode */
function getSeriesDestPaths(series, ep) {
    const folder   = sanitize(series?.title || 'No Series');
    const season   = String(ep.seasonNumber || 1).padStart(2, '0');
    const epNum    = String(ep.episodeNumber || 0).padStart(2, '0');
    const epTitle  = sanitize(ep.title || 'Episode');
    const ext      = path.extname(ep.videoPath || '') || '.mp4';
    const filename = `S${season}E${epNum} - ${epTitle}${ext}`;
    return { folder, filename };
}

/** Destination paths for a standalone (no-series) video */
function getStandaloneDestPaths(video) {
    const title    = sanitize(video.title || 'Video');
    const ext      = path.extname(video.videoPath || '') || '.mp4';
    return { folder: 'Standalone', filename: `${title}${ext}` };
}

/** Resolve folder + filename for any video */
function resolveDestPaths(video, seriesMap) {
    const series = seriesMap[video.seriesId?.toString()] || null;
    return video.seriesId
        ? getSeriesDestPaths(series, video)
        : getStandaloneDestPaths(video);
}

function freeSpaceBytes(dir) {
    try {
        const s = fs.statfsSync(dir);
        return s.bfree * s.bsize;
    } catch { return Infinity; }
}

function copyStream(src, dest) {
    return new Promise((resolve, reject) => {
        const rd = fs.createReadStream(src);
        const wr = fs.createWriteStream(dest);
        const cleanup = (err) => {
            rd.destroy(); wr.destroy();
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
 * Recursively mirror srcDir → destDir.
 * Skips files that already exist with the same byte-size.
 * Uses a shared state ref + broadcast function so it works for both
 * backup and restore progress reporting.
 */
async function mirrorDirectory(srcDir, destDir, label, stateRef, broadcastFn) {
    let copied = 0, skipped = 0, failed = 0;
    if (!fs.existsSync(srcDir)) return { copied, skipped, failed };

    const walk = (dir) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const files   = [];
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) files.push(...walk(full));
            else files.push(full);
        }
        return files;
    };

    let allFiles;
    try { allFiles = walk(srcDir); }
    catch { return { copied: 0, skipped: 0, failed: 1 }; }

    for (const srcFile of allFiles) {
        if (stateRef.stopRequested) break;

        const rel      = path.relative(srcDir, srcFile);
        const destFile = path.join(destDir, rel);

        stateRef.currentFile = `${label}/${rel}`;
        broadcastFn();

        if (fs.existsSync(destFile)) {
            try {
                if (fs.statSync(srcFile).size === fs.statSync(destFile).size) {
                    skipped++; continue;
                }
            } catch (_) {}
        }

        try {
            fs.mkdirSync(path.dirname(destFile), { recursive: true });
            await copyStream(srcFile, destFile);
            copied++;
        } catch (err) {
            const msg     = err.message || String(err);
            const isSpace = /ENOSPC|no space/i.test(msg);
            stateRef.errors.push(isSpace
                ? `❌ Disk full — stopped at: ${label}/${rel}`
                : `Copy failed [${label}/${rel}]: ${msg}`
            );
            failed++;
            if (isSpace) {
                stateRef.status       = 'error';
                stateRef.stopRequested = true;
            }
        }
        broadcastFn();
    }
    return { copied, skipped, failed };
}

// ── Metadata JSON helpers ──────────────────────────────────────────────────────
/**
 * Write one JSON file per series (series-<id>.json) plus a standalone.json
 * for videos not belonging to any series. These files allow restoring the full
 * database from a backup.
 */
async function writeMetadata(videos, seriesMap, mode, dir) {
    const metaDir = path.join(dir, '_metadata');
    fs.mkdirSync(metaDir, { recursive: true });

    const now = new Date().toISOString();

    // Group by series
    const bySeriesId = {};
    const standalone = [];
    for (const v of videos) {
        const sid = v.seriesId?.toString();
        if (sid) {
            if (!bySeriesId[sid]) bySeriesId[sid] = [];
            bySeriesId[sid].push(v);
        } else {
            standalone.push(v);
        }
    }

    // One JSON per series
    for (const [sid, eps] of Object.entries(bySeriesId)) {
        const series   = seriesMap[sid];
        const episodes = eps.map(ep => {
            const { folder, filename } = getSeriesDestPaths(series, ep);
            const hlsBase = filename.replace(/\.[^.]+$/, '');
            return {
                ...ep,
                _id:      ep._id.toString(),
                seriesId: sid,
                backupVideoRelPath: `${folder}/${filename}`,
                backupHlsRelPath:   `${folder}/_hls/${hlsBase}`,
            };
        });

        fs.writeFileSync(
            path.join(metaDir, `series-${sid}.json`),
            JSON.stringify({
                exportedAt: now,
                mode,
                series: { ...series, _id: series._id.toString() },
                episodes,
            }, null, 2),
            'utf8'
        );
    }

    // Standalone JSON (all non-series videos in one file)
    if (standalone.length > 0) {
        const standaloneWithPaths = standalone.map(v => {
            const { folder, filename } = getStandaloneDestPaths(v);
            const hlsBase = filename.replace(/\.[^.]+$/, '');
            return {
                ...v,
                _id:      v._id.toString(),
                seriesId: null,
                backupVideoRelPath: `${folder}/${filename}`,
                backupHlsRelPath:   `${folder}/_hls/${hlsBase}`,
            };
        });

        fs.writeFileSync(
            path.join(metaDir, 'standalone.json'),
            JSON.stringify({ exportedAt: now, mode, videos: standaloneWithPaths }, null, 2),
            'utf8'
        );
    }
}

// ── Backup runner ─────────────────────────────────────────────────────────────
async function runBackup(dir, mode) {
    try {
        fs.mkdirSync(dir, { recursive: true });

        const allVideos = await Video.find({ videoPath: { $exists: true, $ne: null } }).lean();
        const seriesIds = [...new Set(allVideos.map(v => v.seriesId?.toString()).filter(Boolean))];
        const seriesMap = {};
        if (seriesIds.length) {
            const list = await Series.find({ _id: { $in: seriesIds } }).lean();
            list.forEach(s => (seriesMap[s._id.toString()] = s));
        }

        const hlsVideos = allVideos.filter(v => v.hlsStatus === 'ready' && v.hlsPath);

        const doRaw = mode === 'both' || mode === 'raw';
        const doHls = mode === 'both' || mode === 'hls';

        backupState.total = (doRaw ? allVideos.length : 0) + (doHls ? hlsVideos.length : 0);
        broadcastBackup();

        // ── Always write metadata JSON ─────────────────────────────────────────
        backupState.currentFile = '_metadata/ (writing JSON manifests…)';
        broadcastBackup();
        await writeMetadata(allVideos, seriesMap, mode, dir);

        // ── Disk-space preflight ───────────────────────────────────────────────
        const rawBytes  = doRaw ? allVideos.reduce((s, v) => s + (v.fileSize || 0), 0) : 0;
        const hlsBytes  = doHls ? hlsVideos.reduce((s, v) => s + (v.fileSize || 0) * 1.2, 0) : 0;
        const needed    = rawBytes + hlsBytes;
        const free      = freeSpaceBytes(dir);
        const toGB      = b => (b / 1_073_741_824).toFixed(2) + ' GB';

        if (free !== Infinity && free < needed * 1.05) {
            throw new Error(
                `Not enough disk space — need ~${toGB(needed)}, only ${toGB(free)} free on backup volume`
            );
        }

        // ── Raw video copy loop ────────────────────────────────────────────────
        if (doRaw) {
            for (const video of allVideos) {
                if (backupState.stopRequested) { backupState.status = 'stopped'; break; }

                const { folder, filename } = resolveDestPaths(video, seriesMap);
                const srcPath  = path.join(uploadDir, video.videoPath);
                const destPath = path.join(dir, folder, filename);

                backupState.currentFile = `${folder}/${filename}`;
                broadcastBackup();

                if (!fs.existsSync(srcPath)) {
                    backupState.errors.push(`Source file missing: ${video.videoPath}`);
                    backupState.failed++; backupState.done++;
                    broadcastBackup();
                    continue;
                }

                if (fs.existsSync(destPath)) {
                    try {
                        if (fs.statSync(srcPath).size === fs.statSync(destPath).size) {
                            backupState.skipped++; backupState.done++;
                            broadcastBackup();
                            continue;
                        }
                    } catch (_) {}
                }

                try {
                    fs.mkdirSync(path.dirname(destPath), { recursive: true });
                    await copyStream(srcPath, destPath);
                    backupState.done++;
                } catch (err) {
                    const msg     = err.message || String(err);
                    const isSpace = /ENOSPC|no space/i.test(msg);
                    backupState.errors.push(isSpace
                        ? `❌ Disk full — stopped at: ${filename}`
                        : `Copy failed [${filename}]: ${msg}`
                    );
                    backupState.failed++; backupState.done++;
                    if (isSpace) { backupState.status = 'error'; backupState.stopRequested = true; }
                }
                broadcastBackup();
            }
        }

        // ── HLS transcode copy loop ────────────────────────────────────────────
        if (doHls && !backupState.stopRequested) {
            for (const video of hlsVideos) {
                if (backupState.stopRequested) { backupState.status = 'stopped'; break; }

                const { folder, filename } = resolveDestPaths(video, seriesMap);
                const hlsBase    = filename.replace(/\.[^.]+$/, '');
                const srcHlsDir  = path.join(uploadDir, 'hls', video._id.toString());
                const destHlsDir = path.join(dir, folder, '_hls', hlsBase);

                backupState.currentFile = `${folder}/_hls/${hlsBase}/…`;
                broadcastBackup();

                const { skipped, failed } = await mirrorDirectory(
                    srcHlsDir, destHlsDir,
                    `${folder}/_hls/${hlsBase}`,
                    backupState, broadcastBackup
                );

                backupState.skipped += skipped;
                backupState.failed  += failed;
                backupState.done++;
                broadcastBackup();
            }
        }

        if (backupState.status === 'running') {
            backupState.status = backupState.failed > 0 ? 'done_with_errors' : 'done';
        }
    } catch (err) {
        backupState.errors.push(err.message);
        backupState.status = 'error';
    } finally {
        backupState.running     = false;
        backupState.currentFile = null;
        backupState.finishedAt  = new Date().toISOString();
        broadcastBackup();
    }
}

// ── Restore runner ─────────────────────────────────────────────────────────────
async function runRestore(dir) {
    try {
        const metaDir = path.join(dir, '_metadata');
        if (!fs.existsSync(metaDir)) {
            throw new Error('No _metadata folder found — make sure the backup was created with this version of the app');
        }

        const jsonFiles = fs.readdirSync(metaDir).filter(f => f.endsWith('.json'));
        if (!jsonFiles.length) throw new Error('No metadata JSON files found in _metadata/');

        // Parse all files first to get total count
        const parsedFiles = [];
        let totalEntries  = 0;
        for (const f of jsonFiles) {
            const raw  = JSON.parse(fs.readFileSync(path.join(metaDir, f), 'utf8'));
            const entries = raw.episodes || raw.videos || [];
            parsedFiles.push({ filename: f, data: raw, entries });
            totalEntries += entries.length;
        }
        restoreState.total = totalEntries;
        broadcastRestore();

        for (const { filename, data, entries } of parsedFiles) {
            if (restoreState.status === 'error') break;

            const mode  = data.mode || 'both';
            const doRaw = mode === 'both' || mode === 'raw';
            const doHls = mode === 'both' || mode === 'hls';

            // ── Upsert series ─────────────────────────────────────────────────
            let resolvedSeriesId = null;
            if (data.series) {
                restoreState.currentFile = `Checking series: ${data.series.title}`;
                broadcastRestore();

                let existingSeries = null;

                // Try by original _id first
                try { existingSeries = await Series.findById(data.series._id); } catch (_) {}

                // Fall back to title match
                if (!existingSeries) {
                    existingSeries = await Series.findOne({ title: data.series.title });
                }

                if (!existingSeries) {
                    const { _id, ...seriesData } = data.series;
                    try {
                        existingSeries = await Series.create({ _id, ...seriesData });
                    } catch (e) {
                        // Duplicate key on _id race — fetch again
                        existingSeries = await Series.findById(data.series._id);
                    }
                }
                resolvedSeriesId = existingSeries._id;
            }

            // ── Upsert videos ─────────────────────────────────────────────────
            for (const entry of entries) {
                if (restoreState.status === 'error') break;

                restoreState.currentFile = entry.title || entry._id;
                broadcastRestore();

                try {
                    // Check DB by original _id
                    let existingVideo = null;
                    try { existingVideo = await Video.findById(entry._id); } catch (_) {}

                    // Fallback: match by title + series membership
                    if (!existingVideo) {
                        existingVideo = await Video.findOne({
                            title:    entry.title,
                            seriesId: resolvedSeriesId ?? null,
                        });
                    }

                    // ── Copy raw video file if missing from uploadDir ──────────
                    if (doRaw && entry.backupVideoRelPath) {
                        const destVideo = path.join(uploadDir, entry.videoPath);
                        const srcVideo  = path.join(dir, entry.backupVideoRelPath);

                        if (!fs.existsSync(destVideo) && fs.existsSync(srcVideo)) {
                            fs.mkdirSync(path.dirname(destVideo), { recursive: true });
                            await copyStream(srcVideo, destVideo);
                        }
                    }

                    // ── Copy HLS folder if missing ────────────────────────────
                    let restoredHlsStatus = entry.hlsStatus;
                    let restoredHlsPath   = entry.hlsPath;

                    if (doHls && entry.backupHlsRelPath && entry.hlsStatus === 'ready') {
                        const destHlsDir = path.join(uploadDir, 'hls', entry._id);
                        const srcHlsDir  = path.join(dir, entry.backupHlsRelPath);
                        const masterDest = path.join(destHlsDir, 'master.m3u8');

                        if (!fs.existsSync(masterDest) && fs.existsSync(srcHlsDir)) {
                            await mirrorDirectory(
                                srcHlsDir, destHlsDir,
                                `hls/${entry._id}`,
                                restoreState, broadcastRestore
                            );
                            restoredHlsPath   = `hls/${entry._id}`;
                            restoredHlsStatus = 'ready';
                        }
                    }

                    // ── Create or update DB record ────────────────────────────
                    if (!existingVideo) {
                        const { _id, backupVideoRelPath, backupHlsRelPath, ...videoData } = entry;
                        await Video.create({
                            _id,
                            ...videoData,
                            seriesId:  resolvedSeriesId ?? null,
                            hlsPath:   restoredHlsPath,
                            hlsStatus: restoredHlsStatus,
                        });
                    } else {
                        // Only patch HLS fields if we just restored them
                        if (restoredHlsStatus === 'ready' && existingVideo.hlsStatus !== 'ready') {
                            await Video.findByIdAndUpdate(existingVideo._id, {
                                hlsPath:   restoredHlsPath,
                                hlsStatus: 'ready',
                            });
                        }
                        restoreState.skipped++;
                    }

                    restoreState.done++;
                } catch (err) {
                    restoreState.errors.push(`Failed [${entry.title}]: ${err.message}`);
                    restoreState.failed++;
                    restoreState.done++;
                }
                broadcastRestore();
            }
        }

        if (restoreState.status === 'running') {
            restoreState.status = restoreState.failed > 0 ? 'done_with_errors' : 'done';
        }
    } catch (err) {
        restoreState.errors.push(err.message);
        restoreState.status = 'error';
    } finally {
        restoreState.running     = false;
        restoreState.currentFile = null;
        restoreState.finishedAt  = new Date().toISOString();
        broadcastRestore();
    }
}

// ─── Backup routes ─────────────────────────────────────────────────────────────

// SSE stream
router.get('/status', requireAdmin, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write(`data: ${JSON.stringify(backupState)}\n\n`);
    backupSseClients.add(res);
    req.on('close', () => backupSseClients.delete(res));
});

// One-shot poll
router.get('/state', requireAdmin, (_req, res) => res.json(backupState));

// Start backup  –  body: { mode: 'both' | 'raw' | 'hls' }
router.post('/start', requireAdmin, async (req, res) => {
    if (backupState.running) {
        return res.status(409).json({ error: 'A backup is already in progress' });
    }
    if (!backupDir) {
        return res.status(500).json({ error: 'Backup directory not configured on the server' });
    }

    const mode = ['both', 'raw', 'hls'].includes(req.body?.mode) ? req.body.mode : 'both';

    backupState = {
        running: true, stopRequested: false,
        total: 0, done: 0, failed: 0, skipped: 0,
        currentFile: null, errors: [],
        startedAt: new Date().toISOString(), finishedAt: null,
        status: 'running', mode,
    };
    broadcastBackup();

    res.json({ success: true, message: 'Backup started', mode });
    runBackup(backupDir, mode).catch(console.error);
});

// Stop backup
router.post('/stop', requireAdmin, (req, res) => {
    if (!backupState.running) {
        return res.status(400).json({ error: 'No backup is currently running' });
    }
    backupState.stopRequested = true;
    res.json({ success: true, message: 'Stop requested — current file will finish before halting' });
});

// ─── Restore routes ────────────────────────────────────────────────────────────

// SSE stream
router.get('/restore-status', requireAdmin, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write(`data: ${JSON.stringify(restoreState)}\n\n`);
    restoreSseClients.add(res);
    req.on('close', () => restoreSseClients.delete(res));
});

// One-shot poll
router.get('/restore-state', requireAdmin, (_req, res) => res.json(restoreState));

// Start restore (always restores from the configured backupDir)
router.post('/restore', requireAdmin, async (req, res) => {
    if (restoreState.running) {
        return res.status(409).json({ error: 'A restore is already in progress' });
    }
    if (!backupDir) {
        return res.status(500).json({ error: 'Backup directory not configured on the server' });
    }

    restoreState = {
        running: true,
        total: 0, done: 0, failed: 0, skipped: 0,
        currentFile: null, errors: [],
        startedAt: new Date().toISOString(), finishedAt: null,
        status: 'running',
    };
    broadcastRestore();

    res.json({ success: true, message: 'Restore started' });
    runRestore(backupDir).catch(console.error);
});

export default router;