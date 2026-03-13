import express from 'express';
import Favorite from '../models/Favorite.js';
import Video from '../models/Video.js';
import Series from '../models/Series.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

// ─── GET /api/favorites  — paginated list of user's favorites ─────────────────
router.get('/', authenticate, async (req, res) => {
    try {
        const { itemType, page = 1, limit = 40 } = req.query;
        const query = { userId: req.user._id };
        if (itemType) query.itemType = itemType;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [favs, total] = await Promise.all([
            Favorite.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
            Favorite.countDocuments(query),
        ]);

        // Hydrate items in one batch per type
        const videoIds  = favs.filter(f => f.itemType === 'video').map(f => f.itemId);
        const seriesIds = favs.filter(f => f.itemType === 'series').map(f => f.itemId);

        const [videos, seriesList] = await Promise.all([
            videoIds.length  ? Video.find({ _id: { $in: videoIds } }).lean()  : [],
            seriesIds.length ? Series.find({ _id: { $in: seriesIds } }).lean() : [],
        ]);

        const videoMap  = Object.fromEntries(videos.map(v => [v._id.toString(), v]));
        const seriesMap = Object.fromEntries(seriesList.map(s => [s._id.toString(), s]));

        const items = favs.map(f => {
            const item = f.itemType === 'video'
                ? videoMap[f.itemId.toString()]
                : seriesMap[f.itemId.toString()];
            if (!item) return null;
            return { ...item, _type: f.itemType, isFavorite: true, favoritedAt: f.createdAt };
        }).filter(Boolean);

        res.json({ items, total, totalPages: Math.ceil(total / parseInt(limit)), currentPage: parseInt(page) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── POST /api/favorites/toggle  — add or remove a favorite ──────────────────
router.post('/toggle', authenticate, async (req, res) => {
    try {
        const { itemId, itemType } = req.body;
        if (!itemId || !itemType) return res.status(400).json({ error: 'itemId and itemType are required' });
        if (!['video', 'series'].includes(itemType)) return res.status(400).json({ error: 'Invalid itemType' });

        const existing = await Favorite.findOne({ userId: req.user._id, itemId, itemType });
        if (existing) {
            await Favorite.findByIdAndDelete(existing._id);
            return res.json({ success: true, isFavorite: false });
        }
        await new Favorite({ userId: req.user._id, itemId, itemType }).save();
        res.json({ success: true, isFavorite: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── GET /api/favorites/ids  — lightweight id list for client-side annotation ─
router.get('/ids', authenticate, async (req, res) => {
    try {
        const favs = await Favorite.find({ userId: req.user._id }, 'itemId itemType');
        res.json({
            favorites: favs.map(f => ({ itemId: f.itemId.toString(), itemType: f.itemType }))
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;