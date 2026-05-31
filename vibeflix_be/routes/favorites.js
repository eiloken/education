import express from 'express';
import Favorite from '../models/Favorite.js';
import Video from '../models/Video.js';
import Series from '../models/Series.js';
import Album from '../models/Album.js';
import AlbumImage from '../models/AlbumImage.js';
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
        const albumIds  = favs.filter(f => f.itemType === 'album' ).map(f => f.itemId);
        const albumImageIds = favs.filter(f => f.itemType === 'albumImage').map(f => f.itemId); 

        const [videos, seriesDocs, albumDocs, albumImageDocs] = await Promise.all([
            videoIds.length  ? Video.find({ _id: { $in: videoIds  } }, 'title thumbnailPath').lean() : [],
            seriesIds.length ? Series.find({ _id: { $in: seriesIds } }, 'title thumbnailPath').lean() : [],
            albumIds.length 
                ? Album.aggregate([
                    { $match: { _id: { $in: albumIds } } },
                    {
                        $lookup: {
                            from: 'albumimages',
                            localField: '_id',
                            foreignField: 'albumId',
                            as: 'imgs',
                            pipeline: [{ $sort: { order: 1, createdAt: 1 } }, { $limit: 4 }],
                        },
                    },
                    {
                        $addFields: {
                            imageCount: { $size: '$imgs' },
                            totalViews: { $sum: '$imgs.views' },
                            // Up to 4 random image paths for the card mosaic
                            sampleImages: {
                                $map: {
                                    input: { $slice: ['$imgs', 4] },
                                    as: 'img',
                                    in: '$$img.imagePath',
                                },
                            },
                        },
                    },
                    { $project: { title: 1, coverPatch: 1, imageCount: 1, totalViews: 1, sampleImages: 1 } },
                ])
                : [],
            albumImageIds.length ? AlbumImage.find({ _id: { $in: albumImageIds } }, 'imagePath title views albumId').lean() : [],
        ]);

        const videoMap = Object.fromEntries(videos.map(v => [v._id.toString(), { ...v,  _type: 'video' }]));
        const seriesMap = Object.fromEntries(seriesDocs.map(s => [s._id.toString(), { ...s, _type: 'series' }]));
        const albumMap  = Object.fromEntries(albumDocs.map(a  => [a._id.toString(), { ...a, _type: 'album'  }]));
        const albumImageMap = Object.fromEntries((albumImageDocs || []).map(img => [img._id.toString(), { ...img, _type: 'albumImage' }]));
        
        const items = favs.map(fav => {
            const sid = fav.itemId.toString();
            const base = fav.itemType === 'video'
                ? videoMap[sid]
                : fav.itemType === 'series'
                    ? seriesMap[sid]
                    : fav.itemType === 'album'
                        ? albumMap[sid]
                        : fav.itemType === 'albumImage'
                            ? albumImageMap[sid]
                            : null;
            if (!base) return null;
            return { ...base, _id: fav.itemId, favoritedAt: fav.createdAt };
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