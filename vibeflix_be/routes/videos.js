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

// Combined multer for upload route: routes video→uploadDir, thumbnail→thumbnailDir
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

function applySmartSearch(query, search) {
    if (!search?.trim()) return;
    const terms = search.trim().split(/\s+/).filter(Boolean);
    const termClauses = terms.map(term => {
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

// ─── GET /api/videos ─────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
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
// All videos belong to a series. If no seriesId is provided, a new series is
// auto-created. `seriesTitle` sets the series name; falls back to video title.
router.post('/upload', requireAdmin, uploadWithThumb.fields([{name:'video',maxCount:1},{name:'thumbnail',maxCount:1}]), async (req, res) => {
    let videoFile;
    try {
        if (!req.files?.video?.[0]) return res.status(400).json({ error: 'No video file uploaded' });

        videoFile = req.files.video[0];
        const thumbFile = req.files.thumbnail?.[0];

        // ── Accept both a separate seriesTitle and the episode title ──────────
        const {
            title, seriesTitle,
            description, tags, studios, actors, characters, year,
            seriesId, episodeNumber, seasonNumber,
        } = req.body;

        const videoPath = path.join(uploadDir, videoFile.filename);

        // Use the user-supplied thumbnail, or auto-generate one from the video
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

        // ── Resolve series: use provided one, or auto-create ─────────────────
        let resolvedSeriesId      = seriesId || null;
        let resolvedEpisodeNumber = episodeNumber ? parseInt(episodeNumber) : null;
        let resolvedSeasonNumber  = seasonNumber  ? parseInt(seasonNumber)  : null;
        let autoCreatedSeries     = null;

        if (!resolvedSeriesId) {
            // seriesTitle is the user-supplied name for the new series; falls back to videoTitle
            const seriesTitleValue = seriesTitle?.trim() || videoTitle;

            autoCreatedSeries = await new Series({
                title:        seriesTitleValue,
                description:  description?.trim() || '',
                tags:         parsedTags,
                studios:      parsedStudios,
                actors:       parsedActors,
                characters:   parsedCharacters,
                year:         parsedYear,
                thumbnailPath: thumbnailFileName,
            }).save();
            resolvedSeriesId      = autoCreatedSeries._id;
            resolvedEpisodeNumber = 1;
            resolvedSeasonNumber  = 1;
        } else {
            // Assign next episode number if not provided
            if (!resolvedEpisodeNumber) {
                const lastEp = await Video.findOne({ seriesId: resolvedSeriesId })
                    .sort({ episodeNumber: -1 })
                    .select('episodeNumber');
                resolvedEpisodeNumber = (lastEp?.episodeNumber || 0) + 1;
            }
            if (!resolvedSeasonNumber) resolvedSeasonNumber = 1;
        }

        const videoData = {
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
        };

        const newVideo = await new Video(videoData).save();

        // Sync series thumbnail if the series has none yet (existing series)
        if (!autoCreatedSeries) {
            const series = await Series.findById(resolvedSeriesId);
            if (series && !series.thumbnailPath) {
                await Series.findByIdAndUpdate(resolvedSeriesId, { thumbnailPath: thumbnailFileName });
            }
            await rebuildSeriesMetadata(resolvedSeriesId);
        }

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

        if (title       !== undefined) updateData.title       = title.trim();
        if (description !== undefined) updateData.description = description.trim();
        if (tags)        updateData.tags       = JSON.parse(tags);
        if (studios)     updateData.studios    = JSON.parse(studios);
        if (actors)      updateData.actors     = JSON.parse(actors);
        if (characters)  updateData.characters = JSON.parse(characters);
        if (year        !== undefined) updateData.year          = year ? parseInt(year) : null;
        if (seriesId    !== undefined) updateData.seriesId      = seriesId || null;
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

        const oldPath = path.join(uploadDir, video.videoPath);
        if (fs.existsSync(oldPath)) { try { fs.unlinkSync(oldPath); } catch (_) {} }

        const videoPath = path.join(uploadDir, req.file.filename);
        const duration  = await getVideoDuration(videoPath);
        const stats     = fs.statSync(videoPath);

        const updated = await Video.findByIdAndUpdate(req.params.id,
            { videoPath: req.file.filename, duration, fileSize: stats.size },
            { new: true }
        );
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

        const videoPath = path.join(uploadDir, video.videoPath);
        if (fs.existsSync(videoPath)) { try { fs.unlinkSync(videoPath); } catch (_) {} }

        if (video.thumbnailPath) {
            const thumbPath = path.join(thumbnailDir, video.thumbnailPath);
            if (fs.existsSync(thumbPath)) { try { fs.unlinkSync(thumbPath); } catch (_) {} }
        }

        const seriesId = video.seriesId;
        await Favorite.deleteMany({ itemId: video._id, itemType: 'video' });
        await Video.findByIdAndDelete(req.params.id);

        // Rebuild series metadata; delete series if no episodes remain
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

// ─── GET /api/videos/:id/stream ──────────────────────────────────────────────
router.get('/:id/stream', async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) return res.status(404).json({ error: 'Video not found' });

        const videoPath = path.join(uploadDir, video.videoPath);
        if (!fs.existsSync(videoPath)) return res.status(404).json({ error: 'Video file not found' });

        const stat    = fs.statSync(videoPath);
        const fileSize = stat.size;
        const range   = req.headers.range;

        if (range) {
            const parts  = range.replace(/bytes=/, '').split('-');
            const start  = parseInt(parts[0], 10);
            const end    = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunkSize = end - start + 1;
            const file   = fs.createReadStream(videoPath, { start, end });
            const head   = {
                'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges':  'bytes',
                'Content-Length': chunkSize,
                'Content-Type':   'video/mp4',
            };
            res.writeHead(206, head);
            file.pipe(res);
        } else {
            const head = { 'Content-Length': fileSize, 'Content-Type': 'video/mp4' };
            res.writeHead(200, head);
            fs.createReadStream(videoPath).pipe(res);
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─── POST /api/videos/:id/thumbnails/generate ────────────────────────────────
router.post('/:id/thumbnails/generate', requireAdmin, async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) return res.status(404).json({ error: 'Video not found' });

        const videoPath = path.join(uploadDir, video.videoPath);
        if (!fs.existsSync(videoPath)) return res.status(404).json({ error: 'Video file not found' });

        const count    = Math.min(parseInt(req.body.count) || 5, 10);
        const duration = await getVideoDuration(videoPath);
        const prefix   = `THUMB-GEN-${video._id}-`;
        const thumbnails = [];

        // Pick `count` random timestamps spread across the usable range, then sort
        // them so the strip appears in chronological order for the user.
        const rangeStart = duration > 10 ? 2 : 0;
        const rangeEnd   = duration > 10 ? duration - 4 : duration * 0.9;
        const usable     = Math.max(rangeEnd - rangeStart, 1);

        const timesSet = new Set();
        let attempts = 0;
        while (timesSet.size < count && attempts < count * 20) {
            timesSet.add(Math.floor(rangeStart + Math.random() * usable));
            attempts++;
        }
        // Pad with evenly-spaced fallbacks if the range is too short for unique randoms
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
                    .outputOptions("-vf", "scale=320:-1")
                    .output(outPath)
                    .on('end', resolve)
                    .on('error', resolve)
                    .run();
            });
            // Push an object {filename, ts} so the frontend can display timestamps
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

// ─── Metadata endpoints ── return { value, count }[] for filter sidebar ───────
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

export default router;