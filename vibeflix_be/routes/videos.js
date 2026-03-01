import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import Video from "../models/Video.js";
import Series from "../models/Series.js";
import { thumbnailDir, uploadDir } from "../server.js";
import { v4 as uuidv4 } from 'uuid';
import ffmpegPath from "ffmpeg-static";
import { path as ffprobePath } from "ffprobe-static";
import Ffmpeg from "fluent-ffmpeg";

Ffmpeg.setFfmpegPath(ffmpegPath);
Ffmpeg.setFfprobePath(ffprobePath);

const router = express.Router();

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `VID_${uuidv4()}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /mp4|mkv|avi|mov|wmv|flv|webm/;
        const ok = allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype);
        ok ? cb(null, true) : cb(new Error('Only video files are allowed!'));
    }
});

async function generateThumbnail(videoPath, outputPath) {
    return new Promise((resolve) => {
        Ffmpeg(videoPath)
            .seekInput(5).frames(1)
            .outputOptions("-vf", "scale=320:-1")
            .output(outputPath)
            .on('end', () => resolve(true))
            .on('error', (err) => { console.error('Thumbnail error:', err); resolve(false); })
            .run();
    });
}

async function getVideoDuration(videoPath) {
    return new Promise((resolve) => {
        Ffmpeg.ffprobe(videoPath, (err, metadata) => {
            err ? resolve(0) : resolve(metadata.format.duration);
        });
    });
}

async function rebuildSeriesMetadata(seriesId) {
    if (!seriesId) return;
    const series = await Series.findById(seriesId);
    if (!series) return;
    const videos = await Video.find({ seriesId });
    const collectUnique = (field) => [...new Set(videos.flatMap(v => v[field] || []).filter(Boolean))].sort();
    await Series.findByIdAndUpdate(seriesId, {
        tags: collectUnique('tags'),
        studios: collectUnique('studios'),
        actors: collectUnique('actors'),
        characters: collectUnique('characters')
    });
}

// ─── Build MongoDB query from filter params ───────────────────────────────────
function buildFilterQuery(params) {
    const {
        exceptSeries, tags, tagsExclude,
        studios, studiosExclude,
        actors, actorsExclude,
        characters, charactersExclude,
        year, favorite, search,
        filterMode = 'or',
        dateFrom   // ISO string — filter updatedAt >= dateFrom (for trending/weekly)
    } = params;

    const op = filterMode === 'and' ? '$all' : '$in';
    // exceptSeries='true'  → standalone videos only (seriesId: null)
    // exceptSeries='false' → ALL videos including series episodes
    // exceptSeries absent  → all videos (no filter)
    const query = exceptSeries === 'true' ? { seriesId: null } : {};

    const applyField = (queryField, include, exclude) => {
        const conditions = {};
        if (include) conditions[op]     = include.split(',').filter(Boolean);
        if (exclude) conditions['$nin'] = exclude.split(',').filter(Boolean);
        if (Object.keys(conditions).length > 0) query[queryField] = conditions;
    };

    applyField('tags',       tags,       tagsExclude);
    applyField('studios',    studios,    studiosExclude);
    applyField('actors',     actors,     actorsExclude);
    applyField('characters', characters, charactersExclude);

    if (year)               query.year       = parseInt(year);
    if (favorite === 'true') query.isFavorite = true;
    if (search)             query.$text      = { $search: search };
    if (dateFrom)           query.updatedAt  = { $gte: new Date(dateFrom) };

    return query;
}

// ─────────────────────────────────────────────
// POST /api/videos/upload
// ─────────────────────────────────────────────
router.post('/upload', upload.single('video'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No video file uploaded' });

        const { title, description, tags, studios, actors, characters, year, seriesId, episodeNumber, seasonNumber } = req.body;

        if (seriesId) {
            const series = await Series.findById(seriesId);
            if (!series) { fs.unlinkSync(req.file.path); return res.status(400).json({ error: 'Series not found' }); }
        }

        const videoFileName    = req.file.filename;
        const videoPath        = path.join(uploadDir, videoFileName);
        const thumbnailFileName = `THUMB-${uuidv4()}.jpg`;
        const thumbnailPath    = path.join(thumbnailDir, thumbnailFileName);

        await generateThumbnail(videoPath, thumbnailPath);
        const duration = await getVideoDuration(videoPath);
        const stats = fs.statSync(videoPath);

        const videoData = {
            title:         title?.trim() || req.file.originalname,
            description:   description?.trim() || '',
            tags:          tags       ? JSON.parse(tags)       : [],
            studios:       studios    ? JSON.parse(studios)    : [],
            actors:        actors     ? JSON.parse(actors)     : [],
            characters:    characters ? JSON.parse(characters) : [],
            year:          year       ? parseInt(year)         : null,
            videoPath:     videoFileName,
            thumbnailPath: thumbnailFileName,
            duration,
            fileSize:      stats.size,
            seriesId:      seriesId || null,
            episodeNumber: episodeNumber ? parseInt(episodeNumber) : null,
            seasonNumber:  seasonNumber  ? parseInt(seasonNumber)  : null
        };

        const video = new Video(videoData);
        const newVideo = await video.save();
        if (newVideo.seriesId) await rebuildSeriesMetadata(newVideo.seriesId);

        res.status(201).json({ success: true, message: seriesId ? 'Episode uploaded' : 'Video uploaded', video: newVideo });
    } catch (error) {
        console.error('Error uploading video:', error);
        if (req.file) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────
// GET /api/videos  — list videos with include/exclude filters
// ─────────────────────────────────────────────
router.get("/", async (req, res) => {
    try {
        const { page = 1, limit = 20, sortBy = 'updatedAt', order = 'desc' } = req.query;
        const query = buildFilterQuery(req.query);
        const sortOrder = order === 'asc' ? 1 : -1;

        const [videos, count] = await Promise.all([
            Video.find(query)
                .sort({ [sortBy]: sortOrder })
                .limit(parseInt(limit))
                .skip((parseInt(page) - 1) * parseInt(limit)),
            Video.countDocuments(query)
        ]);

        res.json({
            videos,
            totalPages:  Math.ceil(count / parseInt(limit)),
            currentPage: parseInt(page),
            total:       count
        });
    } catch (error) {
        console.error('Error listing videos:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────
// PATCH /api/videos/:id/view  — increment view count (called by player after 30 s)
// ─────────────────────────────────────────────
router.patch('/:id/view', async (req, res) => {
    try {
        const video = await Video.findByIdAndUpdate(
            req.params.id,
            { $inc: { views: 1 } },
            { new: true }
        );
        if (!video) return res.status(404).json({ error: 'Video not found' });
        res.json({ success: true, views: video.views });
    } catch (error) {
        console.error('Error tracking view:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────
// GET /api/videos/:id
// ─────────────────────────────────────────────
router.get('/:id', async (req, res) => {
    try {
        const video = await Video.findById(req.params.id).populate('seriesId', 'title thumbnailPath');
        if (!video) return res.status(404).json({ error: 'Video not found' });
        res.json({ video });
    } catch (error) {
        console.error('Error getting video:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────
// PUT /api/videos/:id  — update metadata
// ─────────────────────────────────────────────
router.put('/:id', async (req, res) => {
    try {
        const oldVideo = await Video.findById(req.params.id);
        if (!oldVideo) return res.status(404).json({ error: 'Video not found' });

        const video = await Video.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });

        if (oldVideo.seriesId) await rebuildSeriesMetadata(oldVideo.seriesId);
        if (video.seriesId && String(video.seriesId) !== String(oldVideo.seriesId)) {
            await rebuildSeriesMetadata(video.seriesId);
        }

        res.json({ success: true, message: 'Video updated successfully', video });
    } catch (error) {
        console.error('Error updating video:', error);
        res.status(400).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────
// PATCH /api/videos/:id/favorite
// ─────────────────────────────────────────────
router.patch('/:id/favorite', async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) return res.status(404).json({ error: 'Video not found' });
        video.isFavorite = !video.isFavorite;
        await video.save();
        res.json({ success: true, message: 'Favorite toggled', video });
    } catch (error) {
        console.error('Error toggling favorite:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────
// DELETE /api/videos/:id
// ─────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) return res.status(404).json({ error: 'Video not found' });

        const seriesId = video.seriesId;
        try { const p = path.join(uploadDir, video.videoPath); if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {}
        try { if (video.thumbnailPath) { const p = path.join(thumbnailDir, video.thumbnailPath); if (fs.existsSync(p)) fs.unlinkSync(p); } } catch (_) {}

        await Video.findByIdAndDelete(req.params.id);
        if (seriesId) await rebuildSeriesMetadata(seriesId);

        res.json({ success: true, message: 'Video deleted' });
    } catch (error) {
        console.error('Error deleting video:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────
// PUT /api/videos/:id/replace-video
// ─────────────────────────────────────────────
router.put('/:id/replace-video', upload.single('video'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No video file uploaded' });

        const video = await Video.findById(req.params.id);
        if (!video) { fs.unlinkSync(req.file.path); return res.status(404).json({ error: 'Video not found' }); }

        // Delete old file
        try { const old = path.join(uploadDir, video.videoPath); if (fs.existsSync(old)) fs.unlinkSync(old); } catch (_) {}

        const newThumb = `THUMB-${uuidv4()}.jpg`;
        await generateThumbnail(path.join(uploadDir, req.file.filename), path.join(thumbnailDir, newThumb));
        const duration = await getVideoDuration(path.join(uploadDir, req.file.filename));
        const stats = fs.statSync(path.join(uploadDir, req.file.filename));

        const { title, description, tags, studios, actors, characters, year, seriesId, episodeNumber, seasonNumber } = req.body;
        const updateData = { videoPath: req.file.filename, thumbnailPath: newThumb, duration, fileSize: stats.size };
        if (title !== undefined)       updateData.title       = title.trim();
        if (description !== undefined) updateData.description = description.trim();
        if (tags)       updateData.tags       = JSON.parse(tags);
        if (studios)    updateData.studios    = JSON.parse(studios);
        if (actors)     updateData.actors     = JSON.parse(actors);
        if (characters) updateData.characters = JSON.parse(characters);
        if (year !== undefined)       updateData.year         = year ? parseInt(year) : null;
        if (seriesId !== undefined)   updateData.seriesId     = seriesId || null;
        if (episodeNumber) updateData.episodeNumber = parseInt(episodeNumber);
        if (seasonNumber)  updateData.seasonNumber  = parseInt(seasonNumber);

        const updatedVideo = await Video.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
        if (updatedVideo.seriesId) await rebuildSeriesMetadata(updatedVideo.seriesId);

        res.json({ success: true, message: 'Video replaced successfully', video: updatedVideo });
    } catch (error) {
        console.error('Error replacing video:', error);
        if (req.file) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────
// GET /api/videos/:id/stream  — stream with range support
// NOTE: view count is now tracked by PATCH /:id/view (called from frontend after 30 s)
// ─────────────────────────────────────────────
router.get('/:id/stream', async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) return res.status(404).json({ error: 'Video not found' });

        const { quality } = req.query;
        let videoPath = video.videoPath;
        if (quality && video.resolutions?.length) {
            const res_ = video.resolutions.find(r => r.quality === quality);
            if (res_) videoPath = res_.path;
        }

        const videoFilePath = path.join(uploadDir, videoPath);
        if (!fs.existsSync(videoFilePath)) return res.status(404).json({ error: 'Video file not found' });

        const stat     = fs.statSync(videoFilePath);
        const fileSize = stat.size;
        const range    = req.headers.range;

        if (range) {
            const parts   = range.replace(/bytes=/, '').split('-');
            const start   = parseInt(parts[0], 10);
            const end     = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunk   = (end - start) + 1;
            const file    = fs.createReadStream(videoFilePath, { start, end });
            res.writeHead(206, {
                'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges':  'bytes',
                'Content-Length': chunk,
                'Content-Type':   'video/mp4'
            });
            file.pipe(res);
        } else {
            res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': 'video/mp4' });
            fs.createReadStream(videoFilePath).pipe(res);
        }

        // ✅ Views are now incremented by PATCH /:id/view after 30 s of playback.
        //    Do NOT increment here to avoid counting bots, range-preloads, skips, etc.
    } catch (error) {
        console.error('Error streaming video:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─── Metadata endpoints ───────────────────────────────────────────────────────
router.get('/metadata/tags', async (req, res) => {
    try { res.json((await Video.distinct('tags')).filter(Boolean).sort()); }
    catch (e) { res.status(500).json({ error: e.message }); }
});
router.get('/metadata/studios', async (req, res) => {
    try { res.json((await Video.distinct('studios')).filter(Boolean).sort()); }
    catch (e) { res.status(500).json({ error: e.message }); }
});
router.get('/metadata/actors', async (req, res) => {
    try { res.json((await Video.distinct('actors')).filter(Boolean).sort()); }
    catch (e) { res.status(500).json({ error: e.message }); }
});
router.get('/metadata/characters', async (req, res) => {
    try { res.json((await Video.distinct('characters')).filter(Boolean).sort()); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;