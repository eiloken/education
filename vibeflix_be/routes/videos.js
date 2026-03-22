import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import Video from "../models/Video.js";
import Series from "../models/Series.js";
import Favorite from "../models/Favorite.js";
import { MAX_TRANSCODE_RES, MAX_TRANSCODE_JOBS, thumbnailDir, uploadDir } from "../server.js";
import { requireAdmin, authenticate } from "../middleware/authMiddleware.js";
import { v4 as uuidv4 } from 'uuid';
import ffmpegPath from "ffmpeg-static";
import { path as ffprobePath } from "ffprobe-static";
import Ffmpeg from "fluent-ffmpeg";

Ffmpeg.setFfmpegPath(ffmpegPath);
Ffmpeg.setFfprobePath(ffprobePath);

const router = express.Router();

// ─── Multer ───────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename:    (req, file, cb) => cb(null, `VID_${uuidv4()}${path.extname(file.originalname)}`),
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /mp4|mkv|avi|mov|wmv|flv|webm/;
        const ok = allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype);
        ok ? cb(null, true) : cb(new Error('Only video files are allowed!'));
    },
});

const uploadWithThumb = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, file.fieldname === 'thumbnail' ? thumbnailDir : uploadDir),
        filename:    (req, file, cb) => {
            if (file.fieldname === 'thumbnail') {
                cb(null, `THUMB-${uuidv4()}${path.extname(file.originalname) || '.jpg'}`);
            } else {
                cb(null, `VID_${uuidv4()}${path.extname(file.originalname)}`);
            }
        },
    }),
    limits: { fileSize: 10 * 1024 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.fieldname === 'thumbnail') { cb(null, true); return; }
        const allowed = /mp4|mkv|avi|mov|wmv|flv|webm/;
        const ok = allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype);
        ok ? cb(null, true) : cb(new Error('Only video files are allowed!'));
    },
});

// ─── HLS Queue State ──────────────────────────────────────────────────────────
const transcodeQueue = [];   // { videoId, videoPath, resolve, reject }[]
let   activeJobs     = 0;
const activeCommands = new Map(); // videoId (string) → Ffmpeg command | null

// ─── Rich Queue Display State ─────────────────────────────────────────────────
const jobMeta     = new Map(); // id → { title, thumbnailPath }
const jobProgress = new Map(); // id → { plannedResolutions[], currentResolution, resolutionPercent, completedResolutions[] }
const recentlyDone = [];       // last 20: { videoId, title, thumbnailPath, completedAt, success, labels?, error? }
const queueSseSet  = new Set();
const _progThrottle = new Map();

function broadcastQueue() {
    const payload = `data: ${JSON.stringify(getQueueStatus())}\n\n`;
    for (const res of queueSseSet) { try { res.write(payload); } catch (_) {} }
}

function emitQueueProgress(videoId) {
    const id  = videoId.toString();
    const now = Date.now();
    if (now - (_progThrottle.get(id) || 0) < 900) return;
    _progThrottle.set(id, now);
    broadcastQueue();
}

// ─── Hardware Encoder Detection ───────────────────────────────────────────────
// Runs once at startup, caches result for the process lifetime.
// Priority: NVIDIA NVENC → AMD AMF → Intel QSV → Apple VideoToolbox → CPU

let _hwEncoder = null;

const HW_CANDIDATES = [
    {
        label:   'NVIDIA NVENC',
        encoder: 'h264_nvenc',
        // Decode on CUDA, keep frames in GPU memory for the encoder
        extraInputArgs: ['-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda'],
        extraOutputArgs: [
            '-rc',           'vbr',
            '-rc-lookahead', '32',
            '-spatial_aq',   '1',
            '-temporal_aq',  '1',
            '-b_ref_mode',   'middle',
        ],
        // NVENC needs its own scale filter to keep frames on-GPU
        scaleFilter: (h) => `scale_cuda=-2:'min(${h},ih)'`,
    },
    {
        label:   'AMD AMF',
        encoder: 'h264_amf',
        extraInputArgs: [],
        extraOutputArgs: [
            '-quality', 'balanced',
            '-rc',      'vbr_peak',
        ],
        scaleFilter: (h) => `scale=-2:'min(${h},ih)'`,
    },
    {
        label:   'Intel QSV',
        encoder: 'h264_qsv',
        extraInputArgs: ['-hwaccel', 'qsv', '-hwaccel_output_format', 'qsv'],
        extraOutputArgs: [
            '-preset',         'medium',
            '-global_quality', '23',  // QSV uses global_quality instead of CRF
        ],
        scaleFilter: (h) => `scale_qsv=-2:'min(${h},ih)'`,
    },
    {
        label:   'Apple VideoToolbox',
        encoder: 'h264_videotoolbox',
        extraInputArgs: [],
        extraOutputArgs: [
            '-q:v',      '65',  // 0–100 scale (not CRF)
            '-realtime', '0',
        ],
        scaleFilter: (h) => `scale=-2:'min(${h},ih)'`,
    },
];

const CPU_FALLBACK = {
    label:   'CPU (libx264)',
    encoder: 'libx264',
    extraInputArgs: [],
    extraOutputArgs: [
        '-preset', 'faster',
        '-crf',    '23',
    ],
    scaleFilter: (h) => `scale=-2:'min(${h},ih)'`,
};

/**
 * Test whether a named FFmpeg encoder works on this machine.
 * Spawns a tiny 1-frame null transcode — fast and leaves no files.
 */
function testEncoder(encoderName) {
    return new Promise((resolve) => {
        const proc = spawn(ffmpegPath, [
            '-f', 'lavfi', '-i', 'nullsrc=size=64x64:rate=1',
            '-vframes', '1',
            '-c:v', encoderName,
            '-f', 'null', '-',
        ], { stdio: 'pipe' });

        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            proc.kill();
            resolve(false);
        }, 5000);

        proc.on('close', (code) => {
            clearTimeout(timer);
            if (!timedOut) resolve(code === 0);
        });
        proc.on('error', () => {
            clearTimeout(timer);
            resolve(false);
        });
    });
}

/**
 * Detect the best available encoder and cache the result.
 * Returns the cached result on subsequent calls — detection only runs once.
 */
async function detectHWEncoder() {
    if (_hwEncoder) return _hwEncoder;

    for (const candidate of HW_CANDIDATES) {
        if (await testEncoder(candidate.encoder)) {
            console.log(`🎮 Hardware encoder: ${candidate.label} (${candidate.encoder})`);
            _hwEncoder = candidate;
            return _hwEncoder;
        }
    }

    console.log('⚙️  No hardware encoder found — using CPU (libx264)');
    _hwEncoder = CPU_FALLBACK;
    return _hwEncoder;
}

// Warm up detection at startup so the first transcode doesn't wait for it
detectHWEncoder().catch(() => {});

// ─── General Helpers ──────────────────────────────────────────────────────────
async function generateThumbnail(videoPath, outputPath) {
    const duration = await getVideoDuration(videoPath);
    const seconds  = (duration && Math.floor(duration / 2)) || 5;
    return new Promise((resolve) => {
        Ffmpeg(videoPath)
            .seekInput(seconds).frames(1)
            .outputOptions('-vf', 'scale=320:-1')
            .output(outputPath)
            .on('end',   () => resolve(true))
            .on('error', (err) => { console.error('Thumbnail error:', err); resolve(false); })
            .run();
    });
}

async function getVideoDuration(videoPath) {
    return new Promise((resolve) => {
        Ffmpeg.ffprobe(videoPath, (err, meta) => err ? resolve(0) : resolve(meta.format.duration));
    });
}

async function rebuildSeriesMetadata(seriesId) {
    if (!seriesId) return;
    const videos = await Video.find({ seriesId });
    const uniq = (field) => [...new Set(videos.flatMap(v => v[field] || []).filter(Boolean))].sort();
    await Series.findByIdAndUpdate(seriesId, {
        tags: uniq('tags'), studios: uniq('studios'),
        actors: uniq('actors'), characters: uniq('characters'),
    });
}

function deleteHlsFolder(videoId) {
    const hlsDir = path.join(uploadDir, 'hls', videoId.toString());
    if (fs.existsSync(hlsDir)) {
        try { fs.rmSync(hlsDir, { recursive: true, force: true }); } catch (_) {}
    }
}

// ─── HLS Transcode ────────────────────────────────────────────────────────────
/**
 * Transcodes a video into HLS segments at up to 3 quality levels using the
 * best available hardware encoder, falling back to CPU if none is detected.
 */
async function transcodeToHLS(videoPath, videoId) {
    // Run ffprobe and encoder detection in parallel — saves ~1s per job
    const [meta, hw] = await Promise.all([
        new Promise((resolve, reject) => {
            Ffmpeg.ffprobe(videoPath, (err, m) => (err ? reject(err) : resolve(m)));
        }),
        detectHWEncoder(),
    ]);

    const srcHeight = meta.streams.find(s => s.codec_type === 'video')?.height ?? 0;

    const LADDER = [
        { label: '480p',  height: 480,  videoBr: '1200k', audioBr: '128k' },
        { label: '720p',  height: 720,  videoBr: '2500k', audioBr: '128k' },
        { label: '1080p', height: 1080, videoBr: '5000k', audioBr: '192k' },
    ];

    const eligible = LADDER.filter(q => q.height <= srcHeight && q.height <= MAX_TRANSCODE_RES);
    const rungs = eligible.length > 0
        ? eligible.slice(-3)
        : [{ label: `${srcHeight}p`, height: srcHeight, videoBr: '800k', audioBr: '96k' }];

    const hlsBase = path.join(uploadDir, 'hls', videoId);
    fs.mkdirSync(hlsBase, { recursive: true });

    const generatedLabels = [];

    // Initialise progress entry so the UI knows what resolutions to expect
    jobProgress.set(videoId, {
        plannedResolutions:    rungs.map(r => r.label),
        currentResolution:     null,
        resolutionPercent:     0,
        completedResolutions:  [],
    });
    broadcastQueue();

    for (const q of rungs) {
        if (!activeCommands.has(videoId)) {
            throw new Error(`Job cancelled for ${videoId}`);
        }

        // Tell the UI which resolution we're starting
        jobProgress.set(videoId, {
            ...jobProgress.get(videoId),
            currentResolution:  q.label,
            resolutionPercent:  0,
        });
        broadcastQueue();

        const qDir = path.join(hlsBase, q.label);
        fs.mkdirSync(qDir, { recursive: true });

        await new Promise((resolve, reject) => {
            const cmd = Ffmpeg(videoPath)
                .inputOptions(hw.extraInputArgs)
                .outputOptions([
                    `-vf`,       hw.scaleFilter(q.height),
                    `-c:v`,      hw.encoder,
                    ...hw.extraOutputArgs,
                    `-maxrate`,  q.videoBr,
                    `-bufsize`,  `${parseInt(q.videoBr) * 2}k`,
                    `-c:a`,      `aac`,
                    `-b:a`,      q.audioBr,
                    `-ar`,       `48000`,
                    `-hls_time`,             `6`,
                    `-hls_playlist_type`,    `vod`,
                    `-hls_flags`,            `independent_segments`,
                    `-hls_segment_filename`, path.join(qDir, 'seg%03d.ts'),
                ])
                .output(path.join(qDir, 'index.m3u8'))
                .on('progress', (prog) => {
                    const pct = Math.min(Math.round(prog.percent || 0), 99);
                    jobProgress.set(videoId, { ...jobProgress.get(videoId), resolutionPercent: pct });
                    emitQueueProgress(videoId);
                })
                .on('end',   () => resolve())
                .on('error', (err) => {
                    console.error(`  ✖ [${videoId}] ${q.label} failed via ${hw.label}:`, err.message);
                    reject(err);
                });

            activeCommands.set(videoId, cmd);
            cmd.run();
        });

        // Mark this resolution as fully done
        const cur = jobProgress.get(videoId) || {};
        jobProgress.set(videoId, {
            ...cur,
            resolutionPercent:   100,
            completedResolutions: [...(cur.completedResolutions || []), q.label],
        });
        broadcastQueue();

        generatedLabels.push(q.label);
        console.log(`  ✔ [${videoId}] ${q.label} via ${hw.label}`);
    }

    const META = {
        '480p':  { bw: 1400000, res: '854x480'   },
        '720p':  { bw: 2700000, res: '1280x720'  },
        '1080p': { bw: 5200000, res: '1920x1080' },
    };

    let master = '#EXTM3U\n#EXT-X-VERSION:3\n\n';
    for (const q of rungs) {
        const m = META[q.label] ?? { bw: 1000000, res: `x${q.height}` };
        master += `#EXT-X-STREAM-INF:BANDWIDTH=${m.bw},RESOLUTION=${m.res},NAME="${q.label}"\n`;
        master += `${q.label}/index.m3u8\n\n`;
    }
    fs.writeFileSync(path.join(hlsBase, 'master.m3u8'), master);

    return generatedLabels;
}

// ─── Queue Helpers ────────────────────────────────────────────────────────────
function drainQueue() {
    while (activeJobs < MAX_TRANSCODE_JOBS && transcodeQueue.length > 0) {
        const job = transcodeQueue.shift();
        activeJobs++;
        runJob(job);
    }
}

async function runJob({ videoId, videoPath, resolve, reject }) {
    try {
        await Video.findByIdAndUpdate(videoId, { hlsStatus: 'processing' });
        activeCommands.set(videoId.toString(), null);
        broadcastQueue(); // job moved from queued → active

        const labels = await transcodeToHLS(videoPath, videoId.toString());

        // Record as successful completion
        const meta = jobMeta.get(videoId.toString()) || {};
        recentlyDone.push({ videoId: videoId.toString(), ...meta, completedAt: new Date().toISOString(), success: true, labels });
        if (recentlyDone.length > 20) recentlyDone.shift();

        const resolutions = labels.map(label => ({
            quality: label,
            path:    `hls/${videoId}/${label}/index.m3u8`,
        }));

        await Video.findByIdAndUpdate(videoId, {
            hlsStatus:   'ready',
            hlsPath:     `hls/${videoId}`,
            resolutions,
        });

        console.log(`✅ HLS ready [${videoId}]: ${labels.join(', ')}`);
        resolve(labels);
    } catch (err) {
        const cancelled = err.message?.includes('cancelled');
        console[cancelled ? 'log' : 'error'](
            `${cancelled ? '⏹' : '❌'} HLS ${cancelled ? 'cancelled' : 'failed'} [${videoId}]: ${err.message}`
        );
        if (!cancelled) {
            const meta = jobMeta.get(videoId.toString()) || {};
            recentlyDone.push({ videoId: videoId.toString(), ...meta, completedAt: new Date().toISOString(), success: false, error: err.message });
            if (recentlyDone.length > 20) recentlyDone.shift();
        }
        await Video.findByIdAndUpdate(videoId, {
            hlsStatus: cancelled ? 'none' : 'failed',
        }).catch(() => {});
        reject(err);
    } finally {
        const id = videoId.toString();
        activeCommands.delete(id);
        jobProgress.delete(id);
        _progThrottle.delete(id);
        activeJobs--;
        broadcastQueue(); // job finished
        drainQueue();
    }
}

function startHLSJob(videoId, videoPath) {
    const id = videoId.toString();
    const alreadyQueued = transcodeQueue.some(j => j.videoId.toString() === id);
    const alreadyActive = activeCommands.has(id);

    if (alreadyQueued || alreadyActive) {
        console.log(`⏭ [${id}] already queued or processing — skipped`);
        return Promise.resolve([]);
    }

    Video.findByIdAndUpdate(videoId, { hlsStatus: 'pending' }).catch(() => {});

    // Best-effort metadata prefetch for the UI (fire-and-forget)
    if (!jobMeta.has(id)) {
        Video.findById(videoId, 'title thumbnailPath').lean()
            .then(v => { if (v) jobMeta.set(id, { title: v.title, thumbnailPath: v.thumbnailPath }); })
            .catch(() => {});
    }

    return new Promise((resolve, reject) => {
        transcodeQueue.push({ videoId, videoPath, resolve, reject });
        console.log(`📥 [${id}] queued (position ${transcodeQueue.length}, active: ${activeJobs}/${MAX_TRANSCODE_JOBS})`);
        broadcastQueue(); // notify SSE subscribers of new queue entry
        drainQueue();
    });
}

function cancelHLSJob(videoId) {
    const id = videoId.toString();

    const idx = transcodeQueue.findIndex(j => j.videoId.toString() === id);
    if (idx !== -1) {
        const [job] = transcodeQueue.splice(idx, 1);
        job.resolve([]);
        console.log(`🗑 [${id}] removed from queue`);
        broadcastQueue();
        return true;
    }

    const cmd = activeCommands.get(id);
    if (cmd !== undefined) {
        if (cmd) { try { cmd.kill('SIGKILL'); } catch (_) {} }
        console.log(`⏹ [${id}] FFmpeg process killed`);
        broadcastQueue();
        return true;
    }

    return false;
}

function getQueueStatus() {
    const processingList = [...activeCommands.keys()].map(id => ({
        videoId: id,
        status:  'processing',
        ...(jobMeta.get(id)     || {}),
        ...(jobProgress.get(id) || {}),
    }));
    const queuedList = transcodeQueue.map((j, i) => ({
        videoId:  j.videoId.toString(),
        status:   'queued',
        position: i + 1,
        ...(jobMeta.get(j.videoId.toString()) || {}),
    }));
    return {
        active:    activeJobs,
        maxActive: MAX_TRANSCODE_JOBS,
        queued:    transcodeQueue.length,
        encoder:   _hwEncoder?.label ?? 'detecting…',
        // legacy scalar arrays kept for backward compat
        activeIds: [...activeCommands.keys()],
        queuedIds: transcodeQueue.map(j => j.videoId.toString()),
        // rich lists for the UI
        processingList,
        queuedList,
        recentlyDone: recentlyDone.slice().reverse().slice(0, 10),
    };
}

// ─── Search / Filter Helpers ──────────────────────────────────────────────────
function applySmartSearch(query, search) {
    if (!search?.trim()) return;
    const terms = search.trim().split(/\s+/).filter(Boolean);
    const termClauses = terms.map(term => {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const r = new RegExp(escaped, 'i');
        return {
            $or: [
                { title: r }, { description: r }, { tags: r },
                { studios: r }, { actors: r }, { characters: r },
            ],
        };
    });
    if (termClauses.length === 1) {
        query.$or = termClauses[0].$or;
    } else {
        query.$and = (query.$and || []).concat(termClauses);
    }
}

function buildFilterQuery(params, userFavoriteIds = null) {
    const {
        tags, tagsExclude, studios, studiosExclude,
        actors, actorsExclude, characters, charactersExclude,
        year, favorite, search, filterMode = 'or', dateFrom,
        durationFilter, hlsFilter,
    } = params;

    const op    = filterMode === 'and' ? '$all' : '$in';
    const query = {};

    const applyField = (f, inc, exc) => {
        const c = {};
        if (inc) c[op]     = inc.split(',').filter(Boolean);
        if (exc) c['$nin'] = exc.split(',').filter(Boolean);
        if (Object.keys(c).length) query[f] = c;
    };

    applyField('tags',       tags,       tagsExclude);
    applyField('studios',    studios,    studiosExclude);
    applyField('actors',     actors,     actorsExclude);
    applyField('characters', characters, charactersExclude);

    if (year)     query.year      = parseInt(year);
    if (dateFrom) query.updatedAt = { $gte: new Date(dateFrom) };
    if (search)   applySmartSearch(query, search);

    // Duration buckets: short < 15 min | medium 15–60 min | long > 60 min
    if (durationFilter === 'short')  query.duration = { $gt: 0, $lt: 900 };
    if (durationFilter === 'medium') query.duration = { $gte: 900, $lt: 3600 };
    if (durationFilter === 'long')   query.duration = { $gte: 3600 };

    // HLS transcoding filter: 'transcoded' | 'not_transcoded' | '' (all)
    if (hlsFilter === 'transcoded')     query.hlsStatus = 'ready';
    if (hlsFilter === 'not_transcoded') query.hlsStatus = { $in: ['none', 'failed'] };

    if (favorite === 'true') {
        query._id = { $in: userFavoriteIds ?? [] };
    }

    return query;
}

function annotateWithFavorites(videos, favoriteIdSet) {
    return videos.map(v => ({
        ...v.toObject(),
        isFavorite: favoriteIdSet.has(v._id.toString()),
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

// ─── GET /api/videos ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 20, sortBy = 'updatedAt', order = 'desc' } = req.query;
        const sortOrder = order === 'asc' ? 1 : -1;

        let userFavIds = null;
        let favSet     = new Set();
        if (req.user) {
            const favs = await Favorite.find({ userId: req.user._id, itemType: 'video' }, 'itemId');
            userFavIds = favs.map(f => f.itemId);
            favSet     = new Set(userFavIds.map(id => id.toString()));
        }

        const query = buildFilterQuery(req.query, userFavIds);
        const [videos, count] = await Promise.all([
            Video.find(query)
                .sort({ [sortBy]: sortOrder })
                .limit(parseInt(limit))
                .skip((parseInt(page) - 1) * parseInt(limit)),
            Video.countDocuments(query),
        ]);

        res.json({
            videos:      annotateWithFavorites(videos, favSet),
            totalPages:  Math.ceil(count / parseInt(limit)),
            currentPage: parseInt(page),
            total:       count,
        });
    } catch (error) {
        console.error('Error listing videos:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─── GET /api/videos/transcode-queue  [admin only] ───────────────────────────
router.get('/transcode-queue', requireAdmin, (req, res) => {
    res.json(getQueueStatus());
});

// ─── GET /api/videos/transcode-queue/stream  [admin SSE] ─────────────────────
router.get('/transcode-queue/stream', requireAdmin, (req, res) => {
    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.flushHeaders();

    // Immediately push the current state so the client doesn't wait
    res.write(`data: ${JSON.stringify(getQueueStatus())}\n\n`);

    queueSseSet.add(res);
    req.on('close', () => queueSseSet.delete(res));
});

// ─── GET /api/videos/metadata/* ──────────────────────────────────────────────
async function metaAgg(field) {
    return Video.aggregate([
        { $unwind: `$${field}` },
        { $match:  { [field]: { $nin: [null, ''] } } },
        { $group:  { _id: `$${field}`, count: { $sum: 1 } } },
        { $sort:   { _id: 1 } },
    ]);
}

router.get('/metadata/tags',       async (req, res) => { try { res.json((await metaAgg('tags')).map(r => ({ value: r._id, count: r.count })));       } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/metadata/studios',    async (req, res) => { try { res.json((await metaAgg('studios')).map(r => ({ value: r._id, count: r.count })));    } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/metadata/actors',     async (req, res) => { try { res.json((await metaAgg('actors')).map(r => ({ value: r._id, count: r.count })));     } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/metadata/characters', async (req, res) => { try { res.json((await metaAgg('characters')).map(r => ({ value: r._id, count: r.count }))); } catch (e) { res.status(500).json({ error: e.message }); } });

// ─── PATCH /api/videos/:id/view ──────────────────────────────────────────────
router.patch('/:id/view', async (req, res) => {
    try {
        const video = await Video.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } }, { new: true });
        if (!video) return res.status(404).json({ error: 'Video not found' });
        res.json({ success: true, views: video.views });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─── GET /api/videos/:id/download  ───────────────────────────────────────────
router.get('/:id/download', async (req, res) => {
    try {
        const video = await Video.findById(req.params.id).populate('seriesId', 'title');
        if (!video) return res.status(404).json({ error: 'Video not found' });

        const src = path.join(uploadDir, video.videoPath);
        if (!fs.existsSync(src)) return res.status(404).json({ error: 'Video file not found on disk' });

        const san    = (s) => (s || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().slice(0, 100);
        const series = video.seriesId;
        const season = String(video.seasonNumber || 1).padStart(2, '0');
        const ep     = String(video.episodeNumber || 0).padStart(2, '0');
        const ext    = path.extname(video.videoPath) || '.mp4';
        const name   = series
            ? `${san(series.title)} S${season}E${ep} - ${san(video.title)}${ext}`
            : `${san(video.title)}${ext}`;

        const { size } = fs.statSync(src);
        res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Length', size);
        fs.createReadStream(src).pipe(res);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/videos/:id ─────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
    try {
        const video = await Video.findById(req.params.id).populate('seriesId', 'title thumbnailPath');
        if (!video) return res.status(404).json({ error: 'Video not found' });

        let isFavorite = false;
        if (req.user) {
            isFavorite = !!(await Favorite.exists({ userId: req.user._id, itemId: video._id, itemType: 'video' }));
        }

        res.json({ video: { ...video.toObject(), isFavorite } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─── POST /api/videos/upload  [admin only] ────────────────────────────────────
router.post('/upload', requireAdmin, uploadWithThumb.fields([{ name: 'video', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]), async (req, res) => {
    let videoFile;
    try {
        if (!req.files?.video?.[0]) return res.status(400).json({ error: 'No video file uploaded' });

        videoFile = req.files.video[0];
        const thumbFile = req.files.thumbnail?.[0];

        const {
            title, seriesTitle,
            description, tags, studios, actors, characters, year,
            seriesId, episodeNumber, seasonNumber,
        } = req.body;

        const videoPath = path.join(uploadDir, videoFile.filename);

        let thumbnailFileName;
        if (thumbFile) {
            thumbnailFileName = thumbFile.filename;
        } else {
            thumbnailFileName = `THUMB-${uuidv4()}.jpg`;
            await generateThumbnail(videoPath, path.join(thumbnailDir, thumbnailFileName));
        }

        const duration = await getVideoDuration(videoPath);
        const stats    = fs.statSync(videoPath);

        const parsedTags       = tags       ? JSON.parse(tags)       : [];
        const parsedStudios    = studios    ? JSON.parse(studios)    : [];
        const parsedActors     = actors     ? JSON.parse(actors)     : [];
        const parsedCharacters = characters ? JSON.parse(characters) : [];
        const parsedYear       = year       ? parseInt(year)         : null;
        const videoTitle       = title?.trim() || videoFile.originalname.replace(/\.[^.]+$/, '');

        let resolvedSeriesId      = seriesId || null;
        let resolvedEpisodeNumber = episodeNumber ? parseInt(episodeNumber) : null;
        let resolvedSeasonNumber  = seasonNumber  ? parseInt(seasonNumber)  : null;
        let autoCreatedSeries     = null;

        if (!resolvedSeriesId) {
            const seriesTitleValue = seriesTitle?.trim() || videoTitle;
            autoCreatedSeries = await new Series({
                title:         seriesTitleValue,
                description:   description?.trim() || '',
                tags:          parsedTags,
                studios:       parsedStudios,
                actors:        parsedActors,
                characters:    parsedCharacters,
                year:          parsedYear,
                thumbnailPath: thumbnailFileName,
            }).save();
            resolvedSeriesId      = autoCreatedSeries._id;
            resolvedEpisodeNumber = 1;
            resolvedSeasonNumber  = 1;
        } else {
            if (!resolvedEpisodeNumber) {
                const lastEp = await Video.findOne({ seriesId: resolvedSeriesId })
                    .sort({ episodeNumber: -1 })
                    .select('episodeNumber');
                resolvedEpisodeNumber = (lastEp?.episodeNumber || 0) + 1;
            }
            if (!resolvedSeasonNumber) resolvedSeasonNumber = 1;
        }

        const newVideo = await new Video({
            title:         videoTitle,
            description:   description?.trim() || '',
            tags:          parsedTags,
            studios:       parsedStudios,
            actors:        parsedActors,
            characters:    parsedCharacters,
            year:          parsedYear,
            videoPath:     videoFile.filename,
            thumbnailPath: thumbnailFileName,
            duration,
            fileSize:      stats.size,
            seriesId:      resolvedSeriesId,
            episodeNumber: resolvedEpisodeNumber,
            seasonNumber:  resolvedSeasonNumber,
        }).save();

        if (!autoCreatedSeries) {
            const series = await Series.findById(resolvedSeriesId);
            if (series && !series.thumbnailPath) {
                await Series.findByIdAndUpdate(resolvedSeriesId, { thumbnailPath: thumbnailFileName });
            }
            await rebuildSeriesMetadata(resolvedSeriesId);
        }

        startHLSJob(newVideo._id, videoPath).catch(() => {});

        res.status(201).json({
            success: true,
            message: autoCreatedSeries ? 'Video uploaded and series created' : 'Episode uploaded',
            video:   newVideo,
            series:  autoCreatedSeries || { _id: resolvedSeriesId },
            autoCreatedSeries: !!autoCreatedSeries,
        });
    } catch (error) {
        console.error('Error uploading video:', error);
        if (videoFile) { try { fs.unlinkSync(videoFile.path); } catch (_) {} }
        res.status(500).json({ error: error.message });
    }
});

// ─── PUT /api/videos/:id  [admin only] ───────────────────────────────────────
router.put('/:id', requireAdmin, async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) return res.status(404).json({ error: 'Video not found' });

        const { title, description, tags, studios, actors, characters, year, seriesId, episodeNumber, seasonNumber } = req.body;
        const updateData = {};

        if (title         !== undefined) updateData.title         = title.trim();
        if (description   !== undefined) updateData.description   = description.trim();
        if (tags)          updateData.tags         = JSON.parse(tags);
        if (studios)       updateData.studios      = JSON.parse(studios);
        if (actors)        updateData.actors       = JSON.parse(actors);
        if (characters)    updateData.characters   = JSON.parse(characters);
        if (year          !== undefined) updateData.year          = year ? parseInt(year) : null;
        if (seriesId      !== undefined) updateData.seriesId      = seriesId || null;
        if (episodeNumber !== undefined) updateData.episodeNumber = episodeNumber ? parseInt(episodeNumber) : null;
        if (seasonNumber  !== undefined) updateData.seasonNumber  = seasonNumber  ? parseInt(seasonNumber)  : null;

        const updated = await Video.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
        await rebuildSeriesMetadata(updated.seriesId);
        res.json({ success: true, message: 'Video updated', video: updated });
    } catch (error) {
        console.error('Error updating video:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─── PUT /api/videos/:id/replace-video  [admin only] ─────────────────────────
router.put('/:id/replace-video', requireAdmin, upload.single('video'), async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) return res.status(404).json({ error: 'Video not found' });
        if (!req.file) return res.status(400).json({ error: 'No video file uploaded' });

        cancelHLSJob(req.params.id);

        const oldPath = path.join(uploadDir, video.videoPath);
        if (fs.existsSync(oldPath)) { try { fs.unlinkSync(oldPath); } catch (_) {} }

        deleteHlsFolder(req.params.id);

        const videoPath = path.join(uploadDir, req.file.filename);
        const duration  = await getVideoDuration(videoPath);
        const stats     = fs.statSync(videoPath);

        const updated = await Video.findByIdAndUpdate(req.params.id,
            {
                videoPath:   req.file.filename,
                duration,
                fileSize:    stats.size,
                hlsStatus:   'none',
                hlsPath:     null,
                resolutions: [],
            },
            { new: true }
        );

        startHLSJob(updated._id, videoPath).catch(() => {});

        res.json({ success: true, message: 'Video replaced', video: updated });
    } catch (error) {
        if (req.file) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
        res.status(500).json({ error: error.message });
    }
});

// ─── PATCH /api/videos/:id/favorite  [requires login] ────────────────────────
router.patch('/:id/favorite', authenticate, async (req, res) => {
    try {
        const existing = await Favorite.findOne({ userId: req.user._id, itemId: req.params.id, itemType: 'video' });
        if (existing) {
            await Favorite.findByIdAndDelete(existing._id);
            return res.json({ success: true, isFavorite: false });
        }
        await new Favorite({ userId: req.user._id, itemId: req.params.id, itemType: 'video' }).save();
        res.json({ success: true, isFavorite: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─── DELETE /api/videos/:id  [admin only] ────────────────────────────────────
router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) return res.status(404).json({ error: 'Video not found' });

        cancelHLSJob(req.params.id);

        const videoPath = path.join(uploadDir, video.videoPath);
        if (fs.existsSync(videoPath)) { try { fs.unlinkSync(videoPath); } catch (_) {} }

        if (video.thumbnailPath) {
            const thumbPath = path.join(thumbnailDir, video.thumbnailPath);
            if (fs.existsSync(thumbPath)) { try { fs.unlinkSync(thumbPath); } catch (_) {} }
        }

        deleteHlsFolder(req.params.id);

        const seriesId = video.seriesId;
        await Favorite.deleteMany({ itemId: video._id, itemType: 'video' });
        await Video.findByIdAndDelete(req.params.id);

        if (seriesId) {
            const remaining = await Video.countDocuments({ seriesId });
            if (remaining === 0) {
                const series = await Series.findById(seriesId);
                if (series?.thumbnailPath) {
                    const p = path.join(thumbnailDir, series.thumbnailPath);
                    if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch (_) {} }
                }
                await Favorite.deleteMany({ itemId: seriesId, itemType: 'series' });
                await Series.findByIdAndDelete(seriesId);
            } else {
                await rebuildSeriesMetadata(seriesId);
            }
        }

        res.json({ success: true, message: 'Video deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─── GET /api/videos/:id/stream  (raw range stream — HLS fallback) ───────────
router.get('/:id/stream', async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) return res.status(404).json({ error: 'Video not found' });

        const videoPath = path.join(uploadDir, video.videoPath);
        if (!fs.existsSync(videoPath)) return res.status(404).json({ error: 'Video file not found' });

        const stat     = fs.statSync(videoPath);
        const fileSize = stat.size;
        const range    = req.headers.range;

        const ext = path.extname(video.videoPath).toLowerCase();
        const mimeMap = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.mov': 'video/quicktime' };
        const contentType = mimeMap[ext] || 'video/mp4';

        if (range) {
            const [rawStart, rawEnd] = range.replace(/bytes=/, '').split('-');
            const start = parseInt(rawStart, 10);
            const CHUNK = 10 * 1024 * 1024;
            const end   = rawEnd
                ? Math.min(parseInt(rawEnd, 10), fileSize - 1)
                : Math.min(start + CHUNK, fileSize - 1);

            res.writeHead(206, {
                'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges':  'bytes',
                'Content-Length': end - start + 1,
                'Content-Type':   contentType,
                'Cache-Control':  'no-store',
            });
            fs.createReadStream(videoPath, { start, end }).pipe(res);
        } else {
            res.writeHead(200, {
                'Content-Length': fileSize,
                'Content-Type':   contentType,
                'Accept-Ranges':  'bytes',
                'Cache-Control':  'no-store',
            });
            fs.createReadStream(videoPath).pipe(res);
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─── GET /api/videos/:id/hls/master.m3u8 ─────────────────────────────────────
router.get('/:id/hls/master.m3u8', async (req, res) => {
    try {
        const video = await Video.findById(req.params.id).select('hlsStatus');
        if (!video) return res.status(404).json({ error: 'Video not found' });
        if (video.hlsStatus !== 'ready') return res.status(404).json({ error: 'HLS not ready', status: video.hlsStatus });

        const masterPath = path.join(uploadDir, 'hls', req.params.id, 'master.m3u8');
        if (!fs.existsSync(masterPath)) return res.status(404).json({ error: 'Master playlist missing' });

        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Access-Control-Allow-Origin', '*');
        fs.createReadStream(masterPath).pipe(res);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/videos/:id/hls/:quality/index.m3u8 ─────────────────────────────
router.get('/:id/hls/:quality/index.m3u8', async (req, res) => {
    try {
        const playlistPath = path.join(uploadDir, 'hls', req.params.id, req.params.quality, 'index.m3u8');
        if (!fs.existsSync(playlistPath)) return res.status(404).send('Not found');

        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Access-Control-Allow-Origin', '*');
        fs.createReadStream(playlistPath).pipe(res);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/videos/:id/hls/:quality/:segment ───────────────────────────────
router.get('/:id/hls/:quality/:segment', async (req, res) => {
    try {
        if (!req.params.segment.endsWith('.ts')) return res.status(400).send('Bad request');

        const segPath = path.join(uploadDir, 'hls', req.params.id, req.params.quality, req.params.segment);
        if (!fs.existsSync(segPath)) return res.status(404).send('Not found');

        const stat = fs.statSync(segPath);
        res.setHeader('Content-Type', 'video/MP2T');
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.setHeader('Access-Control-Allow-Origin', '*');
        fs.createReadStream(segPath).pipe(res);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/videos/:id/hls-status ──────────────────────────────────────────
router.get('/:id/hls-status', async (req, res) => {
    try {
        const video = await Video.findById(req.params.id).select('hlsStatus resolutions');
        if (!video) return res.status(404).json({ error: 'Video not found' });
        res.json({ hlsStatus: video.hlsStatus, resolutions: video.resolutions });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/videos/:id/transcode  [admin only] ────────────────────────────
router.post('/:id/transcode', requireAdmin, async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) return res.status(404).json({ error: 'Video not found' });

        const videoPath = path.join(uploadDir, video.videoPath);
        if (!fs.existsSync(videoPath)) return res.status(404).json({ error: 'Source file not found' });

        if (video.hlsStatus === 'failed') {
            deleteHlsFolder(req.params.id);
        }

        startHLSJob(video._id, videoPath).catch(() => {});

        res.json({ success: true, message: 'Transcoding queued', status: 'pending' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── DELETE /api/videos/:id/transcode  [admin only] ──────────────────────────
router.delete('/:id/transcode', requireAdmin, async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) return res.status(404).json({ error: 'Video not found' });

        cancelHLSJob(req.params.id);
        deleteHlsFolder(req.params.id);

        await Video.findByIdAndUpdate(req.params.id, {
            hlsStatus: 'none', hlsPath: null, resolutions: [],
        });

        res.json({ success: true, message: 'HLS removed — falling back to raw stream' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/videos/:id/thumbnails/generate ────────────────────────────────
router.post('/:id/thumbnails/generate', requireAdmin, async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) return res.status(404).json({ error: 'Video not found' });

        const videoPath = path.join(uploadDir, video.videoPath);
        if (!fs.existsSync(videoPath)) return res.status(404).json({ error: 'Video file not found' });

        const count      = Math.min(parseInt(req.body.count) || 5, 10);
        const duration   = await getVideoDuration(videoPath);
        const prefix     = `THUMB-GEN-${video._id}-`;
        const thumbnails = [];

        const rangeStart = duration > 10 ? 2 : 0;
        const rangeEnd   = duration > 10 ? duration - 4 : duration * 0.9;
        const usable     = Math.max(rangeEnd - rangeStart, 1);

        const timesSet = new Set();
        let attempts = 0;
        while (timesSet.size < count && attempts < count * 20) {
            timesSet.add(Math.floor(rangeStart + Math.random() * usable));
            attempts++;
        }
        while (timesSet.size < count) {
            timesSet.add(Math.floor((usable / (count + 1)) * (timesSet.size + 1) + rangeStart));
        }
        const sortedTimes = [...timesSet].sort((a, b) => a - b);

        for (let i = 0; i < sortedTimes.length; i++) {
            const seconds  = sortedTimes[i];
            const filename = `${prefix}${i}.jpg`;
            const outPath  = path.join(thumbnailDir, filename);
            await new Promise((resolve) => {
                Ffmpeg(videoPath)
                    .seekInput(seconds).frames(1)
                    .outputOptions('-vf', 'scale=320:-1')
                    .output(outPath)
                    .on('end', resolve)
                    .on('error', resolve)
                    .run();
            });
            if (fs.existsSync(outPath)) thumbnails.push({ filename, ts: seconds });
        }

        res.json({ success: true, thumbnails });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─── POST /api/videos/:id/thumbnails/apply ───────────────────────────────────
router.post('/:id/thumbnails/apply', requireAdmin, async (req, res) => {
    try {
        const { filename, syncSeries } = req.body;
        const prefix = `THUMB-GEN-${req.params.id}-`;

        if (!filename.startsWith(prefix))
            return res.status(400).json({ error: 'Invalid thumbnail filename' });

        const video = await Video.findById(req.params.id);
        if (!video) return res.status(404).json({ error: 'Video not found' });

        const srcPath = path.join(thumbnailDir, filename);
        if (!fs.existsSync(srcPath))
            return res.status(404).json({ error: 'Thumbnail file not found — regenerate and try again' });

        const newFilename = `THUMB-${uuidv4()}.jpg`;
        fs.copyFileSync(srcPath, path.join(thumbnailDir, newFilename));

        if (video.thumbnailPath) {
            try { const p = path.join(thumbnailDir, video.thumbnailPath); if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {}
        }

        try {
            fs.readdirSync(thumbnailDir)
                .filter(f => f.startsWith(prefix))
                .forEach(f => { try { fs.unlinkSync(path.join(thumbnailDir, f)); } catch (_) {} });
        } catch (_) {}

        const updated = await Video.findByIdAndUpdate(req.params.id, { thumbnailPath: newFilename }, { new: true });

        if (syncSeries && video.seriesId) {
            await Series.findByIdAndUpdate(video.seriesId, { thumbnailPath: newFilename });
        }

        res.json({ success: true, thumbnailPath: newFilename, video: updated });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;