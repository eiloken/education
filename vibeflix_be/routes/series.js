import express from "express";
import fs from "fs";
import path from "path";
import Series from "../models/Series.js";
import Video from "../models/Video.js";
import Favorite from "../models/Favorite.js";
import { thumbnailDir } from "../server.js";
import { requireAdmin, authenticate } from "../middleware/authMiddleware.js";
import { v4 as uuidv4 } from "uuid";
import multer from "multer";

const router = express.Router();

const thumbnailStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, thumbnailDir),
    filename:    (req, file, cb) => cb(null, `SERIES-THUMB-${uuidv4()}${path.extname(file.originalname)}`),
});

const uploadThumb = multer({
    storage: thumbnailStorage,
    limits:  { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        /jpeg|jpg|png|webp/.test(path.extname(file.originalname).toLowerCase())
            ? cb(null, true)
            : cb(new Error('Only image files are allowed for thumbnails'));
    },
});

// ─── Build MongoDB query from filter params ───────────────────────────────────
function buildFilterQuery(params, userFavIds = null) {
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
    if (search)   query.$text     = { $search: search };
    if (dateFrom) query.updatedAt = { $gte: new Date(dateFrom) };

    if (favorite === 'true') {
        query._id = { $in: userFavIds ?? [] };
    }

    return query;
}

// ─── GET /api/series ─────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
    try {
        const { page = 1, limit = 50, sortBy = 'updatedAt', order = 'desc' } = req.query;
        const sortOrder = order === 'asc' ? 1 : -1;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const lim  = parseInt(limit);

        let userFavIds = null;
        let favSet     = new Set();
        if (req.user) {
            const favs = await Favorite.find({ userId: req.user._id, itemType: 'series' }, 'itemId');
            userFavIds = favs.map(f => f.itemId);
            favSet     = new Set(userFavIds.map(id => id.toString()));
        }

        const query = buildFilterQuery(req.query, userFavIds);

        const pipeline = [
            { $match: query },
            { $lookup: { from: 'videos', localField: '_id', foreignField: 'seriesId', as: 'episodes' } },
            {
                $addFields: {
                    episodeCount: { $size: '$episodes' },
                    totalViews:   { $sum: '$episodes.views' },
                    seasonCount:  {
                        $max: [1, {
                            $size: {
                                $filter: {
                                    input: { $setUnion: '$episodes.seasonNumber' },
                                    as: 's',
                                    cond: { $gt: ['$$s', null] },
                                },
                            },
                        }],
                    },
                },
            },
            { $project: { episodes: 0 } },
            { $sort: { [sortBy === 'views' ? 'totalViews' : sortBy]: sortOrder } },
            { $facet: { data: [{ $skip: skip }, { $limit: lim }], count: [{ $count: 'total' }] } },
        ];

        const [result] = await Series.aggregate(pipeline);
        const series = (result?.data ?? []).map(s => ({
            ...s,
            isFavorite: favSet.has(s._id.toString()),
        }));
        const total = result?.count?.[0]?.total ?? 0;

        res.json({ series, totalPages: Math.ceil(total / lim), currentPage: parseInt(page), total });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─── GET /api/series/:id  — with episodes ────────────────────────────────────
router.get("/:id", async (req, res) => {
    try {
        const series = await Series.findById(req.params.id);
        if (!series) return res.status(404).json({ error: 'Series not found' });

        const episodes = await Video.find({ seriesId: series._id }).sort({ seasonNumber: 1, episodeNumber: 1 });
        const seasons  = [...new Set(episodes.map(e => e.seasonNumber || 1))].sort((a, b) => a - b);

        let isFavorite = false;
        if (req.user) {
            isFavorite = !!(await Favorite.exists({ userId: req.user._id, itemId: series._id, itemType: 'series' }));
        }

        // Annotate episodes with user favorites
        let epFavSet = new Set();
        if (req.user) {
            const epFavs = await Favorite.find({ userId: req.user._id, itemType: 'video' }, 'itemId');
            epFavSet = new Set(epFavs.map(f => f.itemId.toString()));
        }
        const annotatedEpisodes = episodes.map(ep => ({
            ...ep.toObject(),
            isFavorite: epFavSet.has(ep._id.toString()),
        }));

        res.json({ series: { ...series.toObject(), isFavorite }, episodes: annotatedEpisodes, seasons });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─── POST /api/series  [admin only] ──────────────────────────────────────────
router.post("/", requireAdmin, uploadThumb.single('thumbnail'), async (req, res) => {
    try {
        const { title, description, tags, studios, actors, characters, year } = req.body;
        if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });

        const data = {
            title:       title.trim(),
            description: description?.trim() || '',
            tags:        tags        ? JSON.parse(tags)        : [],
            studios:     studios     ? JSON.parse(studios)     : [],
            actors:      actors      ? JSON.parse(actors)      : [],
            characters:  characters  ? JSON.parse(characters)  : [],
            year:        year        ? parseInt(year)          : null,
        };
        if (req.file) data.thumbnailPath = req.file.filename;

        const newSeries = await new Series(data).save();
        res.status(201).json({ success: true, message: 'Series created', series: newSeries });
    } catch (error) {
        if (req.file) { try { fs.unlinkSync(path.join(thumbnailDir, req.file.filename)); } catch (_) {} }
        res.status(500).json({ error: error.message });
    }
});

// ─── PUT /api/series/:id  [admin only] ───────────────────────────────────────
router.put("/:id", requireAdmin, uploadThumb.single('thumbnail'), async (req, res) => {
    try {
        const series = await Series.findById(req.params.id);
        if (!series) return res.status(404).json({ error: 'Series not found' });

        const { title, description, tags, studios, actors, characters, year } = req.body;
        const updateData = {};
        if (title       !== undefined) updateData.title       = title.trim();
        if (description !== undefined) updateData.description = description.trim();
        if (tags)        updateData.tags       = JSON.parse(tags);
        if (studios)     updateData.studios    = JSON.parse(studios);
        if (actors)      updateData.actors     = JSON.parse(actors);
        if (characters)  updateData.characters = JSON.parse(characters);
        if (year        !== undefined) updateData.year = year ? parseInt(year) : null;

        if (req.file) {
            if (series.thumbnailPath) {
                const old = path.join(thumbnailDir, series.thumbnailPath);
                if (fs.existsSync(old)) { try { fs.unlinkSync(old); } catch (_) {} }
            }
            updateData.thumbnailPath = req.file.filename;
        }

        const updated = await Series.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
        res.json({ success: true, message: 'Series updated', series: updated });
    } catch (error) {
        if (req.file) { try { fs.unlinkSync(path.join(thumbnailDir, req.file.filename)); } catch (_) {} }
        res.status(500).json({ error: error.message });
    }
});

// ─── PATCH /api/series/:id/favorite  [requires login] ────────────────────────
router.patch("/:id/favorite", authenticate, async (req, res) => {
    try {
        const existing = await Favorite.findOne({ userId: req.user._id, itemId: req.params.id, itemType: 'series' });
        if (existing) {
            await Favorite.findByIdAndDelete(existing._id);
            return res.json({ success: true, isFavorite: false });
        }
        await new Favorite({ userId: req.user._id, itemId: req.params.id, itemType: 'series' }).save();
        res.json({ success: true, isFavorite: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─── DELETE /api/series/:id  [admin only] ────────────────────────────────────
router.delete("/:id", requireAdmin, async (req, res) => {
    try {
        const series = await Series.findById(req.params.id);
        if (!series) return res.status(404).json({ error: 'Series not found' });

        // Get episode IDs to clean up their favorites
        const episodes = await Video.find({ seriesId: series._id }, '_id');
        const episodeIds = episodes.map(e => e._id);

        await Promise.all([
            Video.deleteMany({ seriesId: series._id }),
            Favorite.deleteMany({ itemId: series._id, itemType: 'series' }),
            Favorite.deleteMany({ itemId: { $in: episodeIds }, itemType: 'video' }),
        ]);

        if (series.thumbnailPath) {
            const p = path.join(thumbnailDir, series.thumbnailPath);
            if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch (_) {} }
        }

        await Series.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Series and all episodes deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─── GET /api/series/:id/episodes ────────────────────────────────────────────
router.get("/:id/episodes", async (req, res) => {
    try {
        const { season } = req.query;
        const query = { seriesId: req.params.id };
        if (season) query.seasonNumber = parseInt(season);
        const episodes = await Video.find(query).sort({ seasonNumber: 1, episodeNumber: 1 });
        res.json(episodes);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─── Metadata endpoints ───────────────────────────────────────────────────────
router.get('/metadata/:id/tags',       async (req, res) => { try { res.json((await Series.findById(req.params.id).distinct('tags')).filter(Boolean).sort());       } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/metadata/:id/studios',    async (req, res) => { try { res.json((await Series.findById(req.params.id).distinct('studios')).filter(Boolean).sort());    } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/metadata/:id/actors',     async (req, res) => { try { res.json((await Series.findById(req.params.id).distinct('actors')).filter(Boolean).sort());     } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/metadata/:id/characters', async (req, res) => { try { res.json((await Series.findById(req.params.id).distinct('characters')).filter(Boolean).sort()); } catch (e) { res.status(500).json({ error: e.message }); } });

export default router;