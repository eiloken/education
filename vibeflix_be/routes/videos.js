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
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `VID_${uuidv4()}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 * 1024 // 10GB max file size
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /mp4|mkv|avi|mov|wmv|flv|webm/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only video files are allowed!'));
        }
    }
});

async function generateThumbnail(videoPath, outputPath) {
    return new Promise((resolve) => {
        Ffmpeg(videoPath)
            .seekInput(5)
            .frames(1)
            .outputOptions("-vf", "scale=320:-1")
            .output(outputPath)
            .on('end', () => resolve(true))
            .on('error', (err) => {
                console.error('Error generating thumbnail:', err);
                resolve(false);
            })
            .run();
    });
}

async function getVideoDuration(videoPath) {
    return new Promise((resolve) => {
        Ffmpeg.ffprobe(videoPath, (err, metadata) => {
            if (err) {
                console.error('Error getting video duration:', err);
                resolve(0);
            } else {
                resolve(metadata.format.duration);
            }
        });
    });
}

async function rebuildSeriesMetadata(seriesId) {
    if (!seriesId) return;

    const series = await Series.findById(seriesId);
    if (!series) return;

    const videos = await Video.find({ seriesId });
    const collectUnique = (field) => {
        return [...new Set(
            videos.flatMap(v => v[field] || []).filter(Boolean)
        )].sort();
    };

    const updatedData = {
        tags: collectUnique('tags'),
        studios: collectUnique('studios'),
        actors: collectUnique('actors'),
        characters: collectUnique('characters')
    };

    await Series.findByIdAndUpdate(seriesId, updatedData);
}

// ─────────────────────────────────────────────
// POST /api/videos/upload  — upload video file
// ─────────────────────────────────────────────
router.post('/upload', upload.single('video'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No video file uploaded' });
        }

        const {
            title,
            description,
            tags,
            studios,
            actors,
            characters,
            year,
            seriesId,
            episodeNumber,
            seasonNumber
        } = req.body;

        // Validate series exists if provided
        if (seriesId) {
            const series = await Series.findById(seriesId);
            if (!series) {
                fs.unlinkSync(req.file.path);
                return res.status(400).json({ error: 'Series not found' });
            }
        }

        const videoFileName = req.file.filename;
        const videoPath = path.join(uploadDir, videoFileName);
        const thumbnailFileName = `THUMB-${uuidv4()}.jpg`;
        const thumbnailPath = path.join(thumbnailDir, thumbnailFileName);

        await generateThumbnail(videoPath, thumbnailPath);
        const duration = await getVideoDuration(videoPath);
        const stats = fs.statSync(videoPath);

        const videoData = {
            title: title?.trim() || req.file.originalname,
            description: description?.trim() || '',
            tags: tags ? JSON.parse(tags) : [],
            studios: studios ? JSON.parse(studios) : [],
            actors: actors ? JSON.parse(actors) : [],
            characters: characters ? JSON.parse(characters) : [],
            year: year ? parseInt(year) : null,
            videoPath: videoFileName,
            thumbnailPath: thumbnailFileName,
            duration,
            fileSize: stats.size,
            seriesId: seriesId || null,
            episodeNumber: episodeNumber ? parseInt(episodeNumber) : null,
            seasonNumber: seasonNumber ? parseInt(seasonNumber) : null
        };

        const video = new Video(videoData);
        const newVideo = await video.save();

        if (newVideo.seriesId) {
            await rebuildSeriesMetadata(newVideo.seriesId);
        }

        res.status(201).json({
            success: true,
            message: seriesId ? 'Episode uploaded successfully' : 'Video uploaded successfully',
            video: newVideo
        });
    } catch (error) {
        console.error('Error uploading video:', error);
        if (req.file) {
            try { fs.unlinkSync(req.file.path); } catch (_) {}
        }
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────
// GET /api/videos  — list standalone videos (no series episodes)
// ─────────────────────────────────────────────
router.get("/", async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            exceptSeries,
            tags,
            studios,
            actors,
            characters,
            year,
            favorite,
            search,
            sortBy = 'uploadDate',
            order = 'desc'
        } = req.query;

        // Only return standalone videos (not series episodes)
        const query = exceptSeries === 'true' ? { seriesId: null } : {};

        if (tags) query.tags = { $in: tags.split(",") };
        if (studios) query.studios = { $in: studios.split(",") };
        if (actors) query.actors = { $in: actors.split(",") };
        if (characters) query.characters = { $in: characters.split(",") };
        if (year) query.year = parseInt(year);
        if (favorite === 'true') query.isFavorite = true;
        if (search) query.$text = { $search: search };

        const sortOrder = order === 'asc' ? 1 : -1;

        const videos = await Video.find(query)
            .sort({ [sortBy]: sortOrder })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit));

        const count = await Video.countDocuments(query);

        res.json({
            videos,
            totalPages: Math.ceil(count / parseInt(limit)),
            currentPage: parseInt(page),
            total: count
        });
    } catch (error) {
        console.error('Error listing videos:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────
// PUT /:id/replace-video  — replace video file + update metadata
// ─────────────────────────────────────────────
router.put('/:id/replace-video', upload.single('video'), async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) return res.status(404).json({ error: 'Video not found' });
        if (!req.file) return res.status(400).json({ error: 'No video file provided' });

        const newVideoFileName = req.file.filename;
        const newVideoPath = path.join(uploadDir, newVideoFileName);
        const newThumbnailFileName = `THUMB-${uuidv4()}.jpg`;
        const newThumbnailPath = path.join(thumbnailDir, newThumbnailFileName);

        await generateThumbnail(newVideoPath, newThumbnailPath);
        const duration = await getVideoDuration(newVideoPath);
        const stats = fs.statSync(newVideoPath);

        // Delete old files
        try {
            const oldVideoFilePath = path.join(uploadDir, video.videoPath);
            if (fs.existsSync(oldVideoFilePath)) fs.unlinkSync(oldVideoFilePath);
        } catch (_) {}
        try {
            if (video.thumbnailPath) {
                const oldThumbPath = path.join(thumbnailDir, video.thumbnailPath);
                if (fs.existsSync(oldThumbPath)) fs.unlinkSync(oldThumbPath);
            }
        } catch (_) {}

        const { title, description, tags, studios, actors, characters, year, seriesId, episodeNumber, seasonNumber } = req.body;

        const updateData = {
            videoPath: newVideoFileName,
            thumbnailPath: newThumbnailFileName,
            duration,
            fileSize: stats.size
        };

        if (title !== undefined) updateData.title = title.trim();
        if (description !== undefined) updateData.description = description.trim();
        if (tags) updateData.tags = JSON.parse(tags);
        if (studios) updateData.studios = JSON.parse(studios);
        if (actors) updateData.actors = JSON.parse(actors);
        if (characters) updateData.characters = JSON.parse(characters);
        if (year !== undefined) updateData.year = year ? parseInt(year) : null;
        if (seriesId !== undefined) updateData.seriesId = seriesId || null;
        if (episodeNumber) updateData.episodeNumber = parseInt(episodeNumber);
        if (seasonNumber) updateData.seasonNumber = parseInt(seasonNumber);

        const updatedVideo = await Video.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
        
        if (updatedVideo.seriesId) {
            await rebuildSeriesMetadata(updatedVideo.seriesId);
        }
        
        res.json({ success: true, message: 'Video replaced successfully', video: updatedVideo });
    } catch (error) {
        console.error('Error replacing video:', error);
        if (req.file) {
            try { fs.unlinkSync(req.file.path); } catch (_) {}
        }
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────
// GET /api/videos/:id  — get single video
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
// PUT /api/videos/:id  — update video metadata
// ─────────────────────────────────────────────
router.put('/:id', async (req, res) => {
    try {
        const oldVideo = await Video.findById(req.params.id);
        if (!oldVideo) return res.status(404).json({ error: 'Video not found' });

        const video = await Video.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        if (oldVideo.seriesId) {
            await rebuildSeriesMetadata(oldVideo.seriesId);
        }

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
// PATCH /api/videos/:id/favorite  — toggle favorite
// ─────────────────────────────────────────────
router.patch('/:id/favorite', async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) return res.status(404).json({ error: 'Video not found' });
        video.isFavorite = !video.isFavorite;
        await video.save();

        res.json({ success: true, message: 'Favorite toggled successfully', video });
    } catch (error) {
        console.error('Error toggling favorite:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────
// DELETE /api/videos/:id  — delete video
// ─────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) return res.status(404).json({ error: 'Video not found' });

        const seriesId = video.seriesId;

        // Delete video file
        try {
            const videoFilePath = path.join(uploadDir, video.videoPath);
            if (fs.existsSync(videoFilePath)) fs.unlinkSync(videoFilePath);
        } catch (_) {}
        // Delete thumbnail
        try {
            if (video.thumbnailPath) {
                const thumbPath = path.join(thumbnailDir, video.thumbnailPath);
                if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
            }
        } catch (_) {}

        await Video.findByIdAndDelete(req.params.id);

        if (seriesId) {
            await rebuildSeriesMetadata(seriesId);
        }
        res.json({ success: true, message: 'Video deleted successfully' });
    } catch (error) {
        console.error('Error deleting video:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────
// GET /api/videos/:id/stream  — stream video with range support
// ─────────────────────────────────────────────
router.get('/:id/stream', async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) return res.status(404).json({ error: 'Video not found' });

        const { quality } = req.query;
        let videoPath = video.videoPath;

        if (quality && video.resolutions?.length) {
            const resolution = video.resolutions.find(r => r.quality === quality);
            if (resolution) videoPath = resolution.path;
        }

        const videoFilePath = path.join(uploadDir, videoPath);
        if (!fs.existsSync(videoFilePath)) return res.status(404).json({ error: 'Video file not found' });

        const stat = fs.statSync(videoFilePath);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;
            const file = fs.createReadStream(videoFilePath, { start, end });
            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': 'video/mp4'
            });
            file.pipe(res);
        } else {
            res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': 'video/mp4' });
            fs.createReadStream(videoFilePath).pipe(res);
        }

        video.views += 1;
        await video.save();
    } catch (error) {
        console.error('Error streaming video:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────
// Metadata endpoints — aggregate from both Video and Series collections
// ─────────────────────────────────────────────

router.get('/metadata/tags', async (req, res) => {
    try {
        const videoTags = await Video.distinct('tags');
        const tags = videoTags.filter(Boolean).sort();
        res.json(tags);
    } catch (error) {
        console.error('Error fetching tags:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/metadata/studios', async (req, res) => {
    try {
        const videoStudios = await Video.distinct('studios');
        const studios = videoStudios.filter(Boolean).sort();
        res.json(studios);
    } catch (error) {
        console.error('Error fetching studios:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/metadata/actors', async (req, res) => {
    try {
        const videoActors = await Video.distinct('actors');
        const actors = videoActors.filter(Boolean).sort();
        res.json(actors);
    } catch (error) {
        console.error('Error fetching actors:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/metadata/characters', async (req, res) => {
    try {
        const videoChars = await Video.distinct('characters');
        const characters = videoChars.filter(Boolean).sort();
        res.json(characters);
    } catch (error) {
        console.error('Error fetching characters:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;