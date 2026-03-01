import express from "express";
import fs from "fs";
import path from "path";
import Series from "../models/Series.js";
import Video from "../models/Video.js";
import { thumbnailDir } from "../server.js";
import { v4 as uuidv4 } from "uuid";
import multer from "multer";

const router = express.Router();

const thumbnailStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, thumbnailDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `SERIES-THUMB-${uuidv4()}${ext}`);
    }
});

const uploadThumb = multer({
    storage: thumbnailStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|webp/;
        allowed.test(path.extname(file.originalname).toLowerCase())
            ? cb(null, true)
            : cb(new Error('Only image files are allowed for thumbnails'));
    }
});

// ─── Build MongoDB query from filter params ───────────────────────────────────
function buildFilterQuery(params) {
    const {
        tags, tagsExclude,
        studios, studiosExclude,
        actors, actorsExclude,
        characters, charactersExclude,
        year, favorite, search,
        filterMode = 'or',
        dateFrom   // ISO string — filter updatedAt >= dateFrom (for trending/weekly)
    } = params;

    const op = filterMode === 'and' ? '$all' : '$in';
    const query = {};

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
// GET /api/series
// ─────────────────────────────────────────────
router.get("/", async (req, res) => {
    try {
        const { page = 1, limit = 50, sortBy = 'updatedAt', order = 'desc' } = req.query;
        const query = buildFilterQuery(req.query);
        const sortOrder = order === 'asc' ? 1 : -1;

        const [series, count] = await Promise.all([
            Series.find(query)
                .sort({ [sortBy]: sortOrder })
                .limit(parseInt(limit))
                .skip((parseInt(page) - 1) * parseInt(limit)),
            Series.countDocuments(query)
        ]);

        const seriesWithCounts = await Promise.all(
            series.map(async (s) => {
                const episodeCount = await Video.countDocuments({ seriesId: s._id });
                const seasons = await Video.distinct('seasonNumber', { seriesId: s._id });
                return { ...s.toObject(), episodeCount, seasonCount: seasons.filter(Boolean).length || 1 };
            })
        );

        res.json({
            series: seriesWithCounts,
            totalPages:  Math.ceil(count / parseInt(limit)),
            currentPage: parseInt(page),
            total:       count
        });
    } catch (error) {
        console.error('Error fetching series:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────
// GET /api/series/:id  — with episodes
// ─────────────────────────────────────────────
router.get("/:id", async (req, res) => {
    try {
        const series = await Series.findById(req.params.id);
        if (!series) return res.status(404).json({ error: 'Series not found' });

        const episodes = await Video.find({ seriesId: series._id }).sort({ seasonNumber: 1, episodeNumber: 1 });
        const seasons  = [...new Set(episodes.map(e => e.seasonNumber || 1))].sort((a, b) => a - b);

        res.json({ series, episodes, seasons });
    } catch (error) {
        console.error('Error fetching series:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────
// POST /api/series
// ─────────────────────────────────────────────
router.post("/", uploadThumb.single('thumbnail'), async (req, res) => {
    try {
        const { title, description, tags, studios, actors, characters, year } = req.body;
        if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });

        const seriesData = {
            title:       title.trim(),
            description: description?.trim() || '',
            tags:        tags       ? JSON.parse(tags)       : [],
            studios:     studios    ? JSON.parse(studios)    : [],
            actors:      actors     ? JSON.parse(actors)     : [],
            characters:  characters ? JSON.parse(characters) : [],
            year:        year       ? parseInt(year)         : null
        };
        if (req.file) seriesData.thumbnailPath = req.file.filename;

        const newSeries = await new Series(seriesData).save();
        res.status(201).json({ success: true, message: 'Series created', series: newSeries });
    } catch (error) {
        console.error('Error creating series:', error);
        if (req.file) { try { fs.unlinkSync(path.join(thumbnailDir, req.file.filename)); } catch (_) {} }
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────
// PUT /api/series/:id
// ─────────────────────────────────────────────
router.put("/:id", uploadThumb.single('thumbnail'), async (req, res) => {
    try {
        const series = await Series.findById(req.params.id);
        if (!series) return res.status(404).json({ error: 'Series not found' });

        const { title, description, tags, studios, actors, characters, year } = req.body;
        const updateData = {};
        if (title       !== undefined) updateData.title       = title.trim();
        if (description !== undefined) updateData.description = description.trim();
        if (tags)       updateData.tags       = JSON.parse(tags);
        if (studios)    updateData.studios    = JSON.parse(studios);
        if (actors)     updateData.actors     = JSON.parse(actors);
        if (characters) updateData.characters = JSON.parse(characters);
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
        console.error('Error updating series:', error);
        if (req.file) { try { fs.unlinkSync(path.join(thumbnailDir, req.file.filename)); } catch (_) {} }
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────
// PATCH /api/series/:id/favorite
// ─────────────────────────────────────────────
router.patch("/:id/favorite", async (req, res) => {
    try {
        const series = await Series.findById(req.params.id);
        if (!series) return res.status(404).json({ error: 'Series not found' });
        series.isFavorite = !series.isFavorite;
        await series.save();
        res.json({ success: true, message: 'Favorite toggled', series });
    } catch (error) {
        console.error('Error toggling favorite:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────
// DELETE /api/series/:id
// ─────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
    try {
        const series = await Series.findById(req.params.id);
        if (!series) return res.status(404).json({ error: 'Series not found' });

        await Video.deleteMany({ seriesId: series._id });

        if (series.thumbnailPath) {
            const p = path.join(thumbnailDir, series.thumbnailPath);
            if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch (_) {} }
        }

        await Series.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Series and episodes deleted' });
    } catch (error) {
        console.error('Error deleting series:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────
// GET /api/series/:id/episodes
// ─────────────────────────────────────────────
router.get("/:id/episodes", async (req, res) => {
    try {
        const { season } = req.query;
        const query = { seriesId: req.params.id };
        if (season) query.seasonNumber = parseInt(season);
        const episodes = await Video.find(query).sort({ seasonNumber: 1, episodeNumber: 1 });
        res.json(episodes);
    } catch (error) {
        console.error('Error fetching episodes:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─── Metadata endpoints ───────────────────────────────────────────────────────
router.get('/metadata/:id/tags', async (req, res) => {
    try { res.json((await Series.findById(req.params.id).distinct('tags').catch(() => [])).filter(Boolean).sort()); }
    catch (e) { res.status(500).json({ error: e.message }); }
});
router.get('/metadata/:id/studios', async (req, res) => {
    try { res.json((await Series.findById(req.params.id).distinct('studios').catch(() => [])).filter(Boolean).sort()); }
    catch (e) { res.status(500).json({ error: e.message }); }
});
router.get('/metadata/:id/actors', async (req, res) => {
    try { res.json((await Series.findById(req.params.id).distinct('actors').catch(() => [])).filter(Boolean).sort()); }
    catch (e) { res.status(500).json({ error: e.message }); }
});
router.get('/metadata/:id/characters', async (req, res) => {
    try { res.json((await Series.findById(req.params.id).distinct('characters').catch(() => [])).filter(Boolean).sort()); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;