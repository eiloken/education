import express from 'express';
import WatchHistory from '../models/WatchHistory.js';
import Video from '../models/Video.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

// ─── POST /api/history/progress  — upsert watch progress ─────────────────────
// Body: { videoId, progress, duration }
router.post('/progress', authenticate, async (req, res) => {
    try {
        const { videoId, progress, duration } = req.body;
        if (!videoId) return res.status(400).json({ error: 'videoId is required' });

        const prog = Math.floor(progress || 0);
        const dur  = Math.floor(duration  || 0);

        // Only persist if the user has actually watched something meaningful
        if (prog <= 5) return res.json({ success: true, skipped: true });

        await WatchHistory.findOneAndUpdate(
            { userId: req.user._id, videoId },
            { progress: prog, duration: dur },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        // ── Cap history at 50 entries per user ────────────────────────────────
        const LIMIT = 50;
        const count = await WatchHistory.countDocuments({ userId: req.user._id, progress: { $gt: 0 } });
        if (count > LIMIT) {
            // Find the oldest entries beyond the limit and delete them
            const overflow = await WatchHistory.find(
                { userId: req.user._id, progress: { $gt: 0 } },
                '_id'
            ).sort({ updatedAt: 1 }).limit(count - LIMIT).lean();

            if (overflow.length > 0) {
                await WatchHistory.deleteMany({ _id: { $in: overflow.map(e => e._id) } });
            }
        }

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── DELETE /api/history/progress/:videoId  — clear progress for a video ──────
// Called when playback ends (video finished) so next watch starts fresh
router.delete('/progress/:videoId', authenticate, async (req, res) => {
    try {
        await WatchHistory.findOneAndUpdate(
            { userId: req.user._id, videoId: req.params.videoId },
            { progress: 0 },
            { new: true }
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── DELETE /api/history/:videoId  — remove history entry entirely ────────────
router.delete('/:videoId', authenticate, async (req, res) => {
    try {
        await WatchHistory.findOneAndDelete({ userId: req.user._id, videoId: req.params.videoId });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── GET /api/history  — paginated watch history, newest first ────────────────
router.get('/', authenticate, async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [entries, total] = await Promise.all([
            WatchHistory.find({ userId: req.user._id, progress: { $gt: 0 } })
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            WatchHistory.countDocuments({ userId: req.user._id, progress: { $gt: 0 } }),
        ]);

        if (entries.length === 0) {
            return res.json({ items: [], total: 0, totalPages: 0, currentPage: parseInt(page) });
        }

        // Hydrate video details in one query
        const videoIds = entries.map(e => e.videoId);
        const videos   = await Video.find(
            { _id: { $in: videoIds } },
            'title thumbnailPath duration seriesId'
        ).lean();
        const videoMap = Object.fromEntries(videos.map(v => [v._id.toString(), v]));

        const items = entries.map(e => {
            const video = videoMap[e.videoId.toString()];
            if (!video) return null;
            const dur = e.duration || video.duration || 0;
            return {
                historyId:     e._id,
                videoId:       e.videoId,
                progress:      e.progress,
                duration:      dur,
                progressPct:   dur > 0 ? Math.min(e.progress / dur, 1) : 0,
                watchedAt:     e.updatedAt,
                title:         video.title,
                thumbnailPath: video.thumbnailPath,
                seriesId:      video.seriesId,
            };
        }).filter(Boolean);

        res.json({
            items,
            total,
            totalPages:  Math.ceil(total / parseInt(limit)),
            currentPage: parseInt(page),
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── GET /api/history/progress/:videoId  — single-video progress lookup ───────
router.get('/progress/:videoId', authenticate, async (req, res) => {
    try {
        const entry = await WatchHistory.findOne(
            { userId: req.user._id, videoId: req.params.videoId },
            'progress duration'
        ).lean();
        res.json({ progress: entry?.progress ?? 0, duration: entry?.duration ?? 0 });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;