import express from "express";
import fs from "fs";
import path from "path";
import Series from "../models/Series.js";
import Video from "../models/Video.js";
import { thumbnailDir } from "../server.js";
import { v4 as uuidv4 } from "uuid";
import multer from "multer";
import sharp from "sharp"; // optional: for thumbnail resizing

const router = express.Router();

// Multer for series thumbnail uploads
const thumbnailStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, thumbnailDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `SERIES-THUMB-${uuidv4()}${ext}`);
    }
});

const uploadThumb = multer({
    storage: thumbnailStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|webp/;
        if (allowed.test(path.extname(file.originalname).toLowerCase())) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed for thumbnails'));
        }
    }
});

// ─────────────────────────────────────────────
// GET /api/series  — list all series with filters
// ─────────────────────────────────────────────
router.get("/", async (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            tags,
            studios,
            actors,
            characters,
            year,
            favorite,
            search,
            sortBy = 'createdAt',
            order = 'desc'
        } = req.query;

        const query = {};

        if (tags) query.tags = { $in: tags.split(",") };
        if (studios) query.studios = { $in: studios.split(",") };
        if (actors) query.actors = { $in: actors.split(",") };
        if (characters) query.characters = { $in: characters.split(",") };
        if (year) query.year = parseInt(year);
        if (favorite === 'true') query.isFavorite = true;
        if (search) query.$text = { $search: search };

        const sortOrder = order === 'asc' ? 1 : -1;
        const series = await Series.find(query)
            .sort({ [sortBy]: sortOrder })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit));

        const count = await Series.countDocuments(query);

        // Attach episode counts for each series
        const seriesWithCounts = await Promise.all(
            series.map(async (s) => {
                const episodeCount = await Video.countDocuments({ seriesId: s._id });
                const seasons = await Video.distinct('seasonNumber', { seriesId: s._id });
                return {
                    ...s.toObject(),
                    episodeCount,
                    seasonCount: seasons.filter(Boolean).length || 1
                };
            })
        );

        res.json({
            series: seriesWithCounts,
            totalPages: Math.ceil(count / parseInt(limit)),
            currentPage: parseInt(page),
            total: count
        });
    } catch (error) {
        console.error('Error fetching series:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────
// GET /api/series/:id  — get single series with episodes
// ─────────────────────────────────────────────
router.get("/:id", async (req, res) => {
    try {
        const series = await Series.findById(req.params.id);
        if (!series) return res.status(404).json({ error: 'Series not found' });

        const episodes = await Video.find({ seriesId: series._id })
            .sort({ seasonNumber: 1, episodeNumber: 1 });

        const seasons = [...new Set(episodes.map(e => e.seasonNumber || 1))].sort((a, b) => a - b);

        res.json({
            series,
            episodes,
            seasons
        });
    } catch (error) {
        console.error('Error fetching series:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────
// POST /api/series  — create new series
// ─────────────────────────────────────────────
router.post("/", uploadThumb.single('thumbnail'), async (req, res) => {
    try {
        const {
            title,
            description,
            tags,
            studios,
            actors,
            characters,
            year
        } = req.body;

        if (!title?.trim()) {
            return res.status(400).json({ error: 'Title is required' });
        }

        const seriesData = {
            title: title.trim(),
            description: description?.trim() || '',
            tags: tags ? JSON.parse(tags) : [],
            studios: studios ? JSON.parse(studios) : [],
            actors: actors ? JSON.parse(actors) : [],
            characters: characters ? JSON.parse(characters) : [],
            year: year ? parseInt(year) : null
        };

        if (req.file) {
            seriesData.thumbnailPath = req.file.filename;
        }

        const series = new Series(seriesData);
        const newSeries = await series.save();

        res.status(201).json({ success: true, message: 'Series created successfully', series: newSeries });
    } catch (error) {
        console.error('Error creating series:', error);
        if (req.file) {
            try { fs.unlinkSync(path.join(thumbnailDir, req.file.filename)); } catch (_) {}
        }
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────
// PUT /api/series/:id  — update series metadata
// ─────────────────────────────────────────────
router.put("/:id", uploadThumb.single('thumbnail'), async (req, res) => {
    try {
        const series = await Series.findById(req.params.id);
        if (!series) return res.status(404).json({ error: 'Series not found' });

        const {
            title,
            description,
            tags,
            studios,
            actors,
            characters,
            year
        } = req.body;

        const updateData = {};
        if (title !== undefined) updateData.title = title.trim();
        if (description !== undefined) updateData.description = description.trim();
        if (tags) updateData.tags = JSON.parse(tags);
        if (studios) updateData.studios = JSON.parse(studios);
        if (actors) updateData.actors = JSON.parse(actors);
        if (characters) updateData.characters = JSON.parse(characters);
        if (year !== undefined) updateData.year = year ? parseInt(year) : null;

        if (req.file) {
            // Delete old thumbnail if it exists
            if (series.thumbnailPath) {
                const oldThumbPath = path.join(thumbnailDir, series.thumbnailPath);
                if (fs.existsSync(oldThumbPath)) {
                    try { fs.unlinkSync(oldThumbPath); } catch (_) {}
                }
            }
            updateData.thumbnailPath = req.file.filename;
        }

        const updated = await Series.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        );

        res.json({ success: true, message: 'Series updated successfully', series: updated });
    } catch (error) {
        console.error('Error updating series:', error);
        if (req.file) {
            try { fs.unlinkSync(path.join(thumbnailDir, req.file.filename)); } catch (_) {}
        }
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────
// PATCH /api/series/:id/favorite  — toggle favorite
// ─────────────────────────────────────────────
router.patch("/:id/favorite", async (req, res) => {
    try {
        const series = await Series.findById(req.params.id);
        if (!series) return res.status(404).json({ error: 'Series not found' });

        series.isFavorite = !series.isFavorite;
        await series.save();

        res.json({ success: true, message: 'Favorite status toggled successfully', series });
    } catch (error) {
        console.error('Error toggling favorite:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────
// DELETE /api/series/:id  — delete series and all its episodes
// ─────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
    try {
        const series = await Series.findById(req.params.id);
        if (!series) return res.status(404).json({ error: 'Series not found' });

        // Delete all episodes
        await Video.deleteMany({ seriesId: series._id });

        // Delete series thumbnail
        if (series.thumbnailPath) {
            const thumbPath = path.join(thumbnailDir, series.thumbnailPath);
            if (fs.existsSync(thumbPath)) {
                try { fs.unlinkSync(thumbPath); } catch (_) {}
            }
        }

        await Series.findByIdAndDelete(req.params.id);

        res.json({ success: true, message: 'Series and all episodes deleted successfully' });
    } catch (error) {
        console.error('Error deleting series:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────
// GET /api/series/:id/episodes  — get episodes, optionally filtered by season
// ─────────────────────────────────────────────
router.get("/:id/episodes", async (req, res) => {
    try {
        const { season } = req.query;
        const query = { seriesId: req.params.id };
        if (season) query.seasonNumber = parseInt(season);

        const episodes = await Video.find(query)
            .sort({ seasonNumber: 1, episodeNumber: 1 });

        res.json(episodes);
    } catch (error) {
        console.error('Error fetching episodes:', error);
        res.status(500).json({ error: error.message });
    }
});

// get all tags available in series
router.get('/metadata/:id/tags', async (req, res) => {
    try {
        const seriesTags = await Series.findById(req.params.id).distinct('tags').catch(() => []);
        const tags = seriesTags.filter(Boolean).sort();
        
        res.json(tags);
    } catch (error) {
        console.error('Error fetching tags:', error);
        res.status(500).json({ error: error.message });
    }
});

// get all studios available in series
router.get('/metadata/:id/studios', async (req, res) => {
    try {
        const seriesStudios = await Series.findById(req.params.id).distinct('studios').catch(() => []);
        const studios = seriesStudios.filter(Boolean).sort();

        res.json(studios);
    } catch (error) {
        console.error('Error fetching studios:', error);
        res.status(500).json({ error: error.message });
    }
});

// get all actors available in series
router.get('/metadata/:id/actors', async (req, res) => {
    try {
        const seriesActors = await Series.findById(req.params.id).distinct('actors').catch(() => []);
        const actors = seriesActors.filter(Boolean).sort();

        res.json(actors);
    } catch (error) {
        console.error('Error fetching actors:', error);
        res.status(500).json({ error: error.message });
    }
});

// get all characters available in series
router.get('/metadata/:id/characters', async (req, res) => {
    try {
        const seriesChars = await Series.findById(req.params.id).distinct('characters').catch(() => []);
        const characters = seriesChars.filter(Boolean).sort();
        
        res.json(characters);
    } catch (error) {
        console.error('Error fetching characters:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;