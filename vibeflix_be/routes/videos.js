import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import Video from "../models/Video.js";
import Series from "../models/Series.js";
import Favorite from "../models/Favorite.js";
import { thumbnailDir, uploadDir } from "../server.js";
import { requireAdmin, authenticate } from "../middleware/authMiddleware.js";
import { v4 as uuidv4 } from 'uuid';
import ffmpegPath from "ffmpeg-static";
import { path as ffprobePath } from "ffprobe-static";
import Ffmpeg from "fluent-ffmpeg";

Ffmpeg.setFfmpegPath(ffmpegPath);
Ffmpeg.setFfprobePath(ffprobePath);

const router = express.Router();

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

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function generateThumbnail(videoPath, outputPath) {
    const duration = await getVideoDuration(videoPath);
    const seconds  = (duration && Math.floor(duration / 2)) || 5;
    return new Promise((resolve) => {
        Ffmpeg(videoPath)
            .seekInput(seconds).frames(1)
            .outputOptions("-vf", "scale=320:-1")
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

// ─── Smart multi-field search — escapes the term then applies a per-word
//     regex across title, description, tags, studios, actors, characters.
//     Each word must match at least one field (AND between words, OR across fields).
function applySmartSearch(query, search) {
    if (!search?.trim()) return;
    const terms = search.trim().split(/\s+/).filter(Boolean);
    const termClauses = terms.map(term => {
        // Escape special regex chars so user input is treated as a literal string
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const r = new RegExp(escaped, 'i');
        return {
            $or: [
                { title:       r },
                { description: r },
                { tags:        r },
                { studios:     r },
                { actors:      r },
                { characters:  r },
            ],
        };
    });
    if (termClauses.length === 1) {
        // Single word: merge $or directly (avoids wrapping in $and unnecessarily)
        query.$or = termClauses[0].$or;
    } else {
        // Multiple words: each must match somewhere
        query.$and = (query.$and || []).concat(termClauses);
    }
}

// ─── Build MongoDB query from filter params ───────────────────────────────────
function buildFilterQuery(params, userFavoriteIds = null) {
    const {
        exceptSeries, tags, tagsExclude,
        studios, studiosExclude,
        actors, actorsExclude,
        characters, charactersExclude,
        year, favorite, search,
        filterMode = 'or',
        dateFrom,
    } = params;

    const op    = filterMode === 'and' ? '$all' : '$in';
    const query = exceptSeries === 'true' ? { seriesId: null } : {};

    const applyField = (f, inc, exc) => {
        const c = {};
        if (inc) c[op]      = inc.split(',').filter(Boolean);
        if (exc) c['$nin']  = exc.split(',').filter(Boolean);
        if (Object.keys(c).length) query[f] = c;
    };

    applyField('tags',       tags,       tagsExclude);
    applyField('studios',    studios,    studiosExclude);
    applyField('actors',     actors,     actorsExclude);
    applyField('characters', characters, charactersExclude);

    if (year)     query.year      = parseInt(year);
    if (dateFrom) query.updatedAt = { $gte: new Date(dateFrom) };
    if (search)   applySmartSearch(query, search);

    if (favorite === 'true') {
        query._id = { $in: userFavoriteIds ?? [] };
    }

    return query;
}

/** Annotate a list of Mongoose video docs with isFavorite per user */
function annotateWithFavorites(videos, favoriteIdSet) {
    return videos.map(v => ({
        ...v.toObject(),
        isFavorite: favoriteIdSet.has(v._id.toString()),
    }));
}

// ─── GET /api/videos ─────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
    try {
        const { page = 1, limit = 20, sortBy = 'updatedAt', order = 'desc' } = req.query;
        const sortOrder = order === 'asc' ? 1 : -1;

        // Resolve user favorites once for both filter and annotation
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

// ─── PATCH /api/videos/:id/view ───────────────────────────────────────────────
router.patch('/:id/view', async (req, res) => {
    try {
        const video = await Video.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } }, { new: true });
        if (!video) return res.status(404).json({ error: 'Video not found' });
        res.json({ success: true, views: video.views });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─── GET /api/videos/:id ──────────────────────────────────────────────────────
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
router.post('/upload', requireAdmin, upload.single('video'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No video file uploaded' });

        const { title, description, tags, studios, actors, characters, year, seriesId, episodeNumber, seasonNumber } = req.body;

        const videoPath        = path.join(uploadDir, req.file.filename);
        const thumbnailFileName = `THUMB-${uuidv4()}.jpg`;
        const thumbnailPath     = path.join(thumbnailDir, thumbnailFileName);

        await generateThumbnail(videoPath, thumbnailPath);
        const duration = await getVideoDuration(videoPath);
        const stats    = fs.statSync(videoPath);

        const videoData = {
            title:         title?.trim() || req.file.originalname,
            description:   description?.trim() || '',
            tags:          tags        ? JSON.parse(tags)        : [],
            studios:       studios     ? JSON.parse(studios)     : [],
            actors:        actors      ? JSON.parse(actors)      : [],
            characters:    characters  ? JSON.parse(characters)  : [],
            year:          year        ? parseInt(year)          : null,
            videoPath:     req.file.filename,
            thumbnailPath: thumbnailFileName,
            duration,
            fileSize:      stats.size,
            seriesId:      seriesId || null,
            episodeNumber: episodeNumber ? parseInt(episodeNumber) : null,
            seasonNumber:  seasonNumber  ? parseInt(seasonNumber)  : null,
        };

        const newVideo = await new Video(videoData).save();
        if (newVideo.seriesId) await rebuildSeriesMetadata(newVideo.seriesId);

        res.status(201).json({ success: true, message: seriesId ? 'Episode uploaded' : 'Video uploaded', video: newVideo });
    } catch (error) {
        console.error('Error uploading video:', error);
        if (req.file) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
        res.status(500).json({ error: error.message });
    }
});

// ─── PUT /api/videos/:id  [admin only] ───────────────────────────────────────
router.put('/:id', requireAdmin, async (req, res) => {
    try {
        const oldVideo = await Video.findById(req.params.id);
        if (!oldVideo) return res.status(404).json({ error: 'Video not found' });

        const video = await Video.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });

        if (oldVideo.seriesId) await rebuildSeriesMetadata(oldVideo.seriesId);
        if (video.seriesId && String(video.seriesId) !== String(oldVideo.seriesId)) {
            await rebuildSeriesMetadata(video.seriesId);
        }

        res.json({ success: true, message: 'Video updated', video });
    } catch (error) {
        res.status(400).json({ error: error.message });
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

        const seriesId = video.seriesId;
        try { const p = path.join(uploadDir, video.videoPath); if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {}
        try { if (video.thumbnailPath) { const p = path.join(thumbnailDir, video.thumbnailPath); if (fs.existsSync(p)) fs.unlinkSync(p); } } catch (_) {}

        await Promise.all([
            Video.findByIdAndDelete(req.params.id),
            Favorite.deleteMany({ itemId: req.params.id, itemType: 'video' }),
        ]);
        if (seriesId) await rebuildSeriesMetadata(seriesId);

        res.json({ success: true, message: 'Video deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─── PUT /api/videos/:id/replace-video  [admin only] ─────────────────────────
router.put('/:id/replace-video', requireAdmin, upload.single('video'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No video file uploaded' });

        const video = await Video.findById(req.params.id);
        if (!video) { fs.unlinkSync(req.file.path); return res.status(404).json({ error: 'Video not found' }); }

        try { const old = path.join(uploadDir, video.videoPath); if (fs.existsSync(old)) fs.unlinkSync(old); } catch (_) {}

        const newThumb = `THUMB-${uuidv4()}.jpg`;
        await generateThumbnail(path.join(uploadDir, req.file.filename), path.join(thumbnailDir, newThumb));
        const duration = await getVideoDuration(path.join(uploadDir, req.file.filename));
        const stats    = fs.statSync(path.join(uploadDir, req.file.filename));

        const { title, description, tags, studios, actors, characters, year, seriesId, episodeNumber, seasonNumber } = req.body;
        const updateData = { videoPath: req.file.filename, thumbnailPath: newThumb, duration, fileSize: stats.size };
        if (title !== undefined)       updateData.title         = title.trim();
        if (description !== undefined) updateData.description   = description.trim();
        if (tags)        updateData.tags         = JSON.parse(tags);
        if (studios)     updateData.studios      = JSON.parse(studios);
        if (actors)      updateData.actors       = JSON.parse(actors);
        if (characters)  updateData.characters   = JSON.parse(characters);
        if (year !== undefined)        updateData.year          = year ? parseInt(year) : null;
        if (seriesId !== undefined)    updateData.seriesId      = seriesId || null;
        if (episodeNumber) updateData.episodeNumber = parseInt(episodeNumber);
        if (seasonNumber)  updateData.seasonNumber  = parseInt(seasonNumber);

        const updated = await Video.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
        if (updated.seriesId) await rebuildSeriesMetadata(updated.seriesId);

        res.json({ success: true, message: 'Video replaced', video: updated });
    } catch (error) {
        if (req.file) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
        res.status(500).json({ error: error.message });
    }
});

// ─── GET /api/videos/:id/stream ──────────────────────────────────────────────
router.get('/:id/stream', async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) return res.status(404).json({ error: 'Video not found' });

        let videoPath = video.videoPath;
        const { quality } = req.query;
        if (quality && video.resolutions?.length) {
            const r = video.resolutions.find(r => r.quality === quality);
            if (r) videoPath = r.path;
        }

        const videoFilePath = path.join(uploadDir, videoPath);
        if (!fs.existsSync(videoFilePath)) return res.status(404).json({ error: 'Video file not found' });

        const stat     = fs.statSync(videoFilePath);
        const fileSize = stat.size;
        const range    = req.headers.range;

        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end   = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunk = end - start + 1;
            res.writeHead(206, {
                'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges':  'bytes',
                'Content-Length': chunk,
                'Content-Type':   'video/mp4',
            });
            fs.createReadStream(videoFilePath, { start, end }).pipe(res);
        } else {
            res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': 'video/mp4' });
            fs.createReadStream(videoFilePath).pipe(res);
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─── Metadata endpoints ───────────────────────────────────────────────────────
router.get('/metadata/tags',       async (req, res) => { try { res.json((await Video.distinct('tags')).filter(Boolean).sort());       } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/metadata/studios',    async (req, res) => { try { res.json((await Video.distinct('studios')).filter(Boolean).sort());    } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/metadata/actors',     async (req, res) => { try { res.json((await Video.distinct('actors')).filter(Boolean).sort());     } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/metadata/characters', async (req, res) => { try { res.json((await Video.distinct('characters')).filter(Boolean).sort()); } catch (e) { res.status(500).json({ error: e.message }); } });

export default router;