import express from "express";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";

// archiver is CJS-only — must use createRequire in an ESM project
const require = createRequire(import.meta.url);
const archiver = require("archiver");
import Album from "../models/Album.js";
import AlbumImage from "../models/AlbumImage.js";
import Favorite from "../models/Favorite.js";
import { imagesDir } from "../server.js";
import { requireAdmin, authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// ─── Multer — image upload ────────────────────────────────────────────────────
const imageStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, imagesDir),
    filename:    (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        cb(null, `IMG-${uuidv4()}${ext}`);
    },
});

const uploadImages = multer({
    storage: imageStorage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB per image
    fileFilter: (req, file, cb) => {
        /jpeg|jpg|png|webp|gif|avif/.test(path.extname(file.originalname).toLowerCase())
            ? cb(null, true)
            : cb(new Error('Only image files are allowed'));
    },
});

const uploadCover = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, imagesDir),
        filename:    (req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
            cb(null, `ALBUM-COVER-${uuidv4()}${ext}`);
        },
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        /jpeg|jpg|png|webp/.test(path.extname(file.originalname).toLowerCase())
            ? cb(null, true)
            : cb(new Error('Only image files are allowed for cover'));
    },
});

// ─── Smart multi-field search ─────────────────────────────────────────────────
function applySmartSearch(query, search) {
    if (!search?.trim()) return;
    const terms = search.trim().split(/\s+/).filter(Boolean);
    const clauses = terms.map(term => {
        const r = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        return { $or: [{ title: r }, { description: r }, { tags: r }, { studios: r }, { actors: r }, { characters: r }] };
    });
    if (clauses.length === 1) query.$or = clauses[0].$or;
    else query.$and = (query.$and || []).concat(clauses);
}

function buildQuery(params, userFavIds = null) {
    const { tags, tagsExclude, studios, studiosExclude, actors, actorsExclude,
            characters, charactersExclude, year, favorite, search, filterMode = 'or', dateFrom } = params;
    const op = filterMode === 'and' ? '$all' : '$in';
    const query = {};
    const applyField = (f, inc, exc) => {
        const c = {};
        if (inc) c[op]    = inc.split(',').filter(Boolean);
        if (exc) c['$nin'] = exc.split(',').filter(Boolean);
        if (Object.keys(c).length) query[f] = c;
    };
    applyField('tags', tags, tagsExclude);
    applyField('studios', studios, studiosExclude);
    applyField('actors', actors, actorsExclude);
    applyField('characters', characters, charactersExclude);
    if (year)     query.year = parseInt(year);
    if (dateFrom) query.updatedAt = { $gte: new Date(dateFrom) };
    if (search)   applySmartSearch(query, search);
    if (favorite === 'true') query._id = { $in: userFavIds ?? [] };
    return query;
}

// ─── GET /api/albums ──────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
    try {
        const { page = 1, limit = 40, sortBy = 'updatedAt', order = 'desc' } = req.query;
        const skip      = (parseInt(page) - 1) * parseInt(limit);
        const lim       = parseInt(limit);
        const sortOrder = order === 'asc' ? 1 : -1;

        let userFavIds = null;
        let favSet = new Set();
        if (req.user) {
            const favs = await Favorite.find({ userId: req.user._id, itemType: 'album' }, 'itemId');
            userFavIds = favs.map(f => f.itemId);
            favSet = new Set(userFavIds.map(id => id.toString()));
        }

        const query = buildQuery(req.query, userFavIds);

        const sortField = sortBy === 'views' ? 'totalViews' : sortBy;

        const pipeline = [
            { $match: query },
            { $lookup: { from: 'albumimages', localField: '_id', foreignField: 'albumId', as: 'imgs' } },
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
            { $project: { imgs: 0 } },
            { $sort: { [sortField]: sortOrder } },
            { $facet: { data: [{ $skip: skip }, { $limit: lim }], count: [{ $count: 'total' }] } },
        ];

        const [result] = await Album.aggregate(pipeline);
        const albums = (result?.data ?? []).map(a => ({
            ...a,
            isFavorite: favSet.has(a._id.toString()),
        }));
        const total = result?.count?.[0]?.total ?? 0;

        res.json({ albums, totalPages: Math.ceil(total / lim), currentPage: parseInt(page), total });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── Metadata endpoints ───────────────────────────────────────────────────────
router.get('/metadata/tags', async (req, res) => { try { res.json((await Album.distinct('tags')).filter(Boolean).sort()); } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/metadata/studios', async (req, res) => { try { res.json((await Album.distinct('studios')).filter(Boolean).sort()); } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/metadata/actors', async (req, res) => { try { res.json((await Album.distinct('actors')).filter(Boolean).sort()); } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/metadata/characters', async (req, res) => { try { res.json((await Album.distinct('characters')).filter(Boolean).sort()); } catch (e) { res.status(500).json({ error: e.message }); } });

// ─── GET /api/albums/:id/download — zip selected images ──────────────────────
// Query: ?ids=id1,id2,id3  (omit for all images)
router.get("/:id/download", authenticate, async (req, res) => {
    try {
        const album = await Album.findById(req.params.id).lean();
        if (!album) return res.status(404).json({ error: 'Album not found' });

        let query = { albumId: req.params.id };
        if (req.query.ids) {
            const ids = req.query.ids.split(',').filter(Boolean);
            query._id = { $in: ids };
        }

        const images = await AlbumImage.find(query).sort({ order: 1, createdAt: 1 }).lean();
        if (!images.length) return res.status(404).json({ error: 'No images found' });

        const safeName = album.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}.zip"`);

        const archive = archiver('zip', { zlib: { level: 1 } }); // low compression for images
        archive.on('error', (err) => { console.error('Archiver error:', err); res.end(); });
        archive.pipe(res);

        for (const img of images) {
            const filePath = path.join(imagesDir, img.imagePath);
            if (fs.existsSync(filePath)) {
                const ext = path.extname(img.imagePath);
                const name = img.title
                    ? `${img.title.replace(/[^a-z0-9]/gi, '_')}${ext}`
                    : img.imagePath;
                archive.file(filePath, { name });
            }
        }

        await archive.finalize();
    } catch (e) {
        if (!res.headersSent) res.status(500).json({ error: e.message });
    }
});

// ─── GET /api/albums/:id — with all images ────────────────────────────────────
router.get("/:id", async (req, res) => {
    try {
        const album = await Album.findById(req.params.id).lean();
        if (!album) return res.status(404).json({ error: 'Album not found' });

        const images = await AlbumImage.find({ albumId: album._id })
            .sort({ order: 1, createdAt: 1 })
            .lean();

        let imgFavSet = new Set();
        if (req.user) {
            const imgFavs = await Favorite.find(
                { userId: req.user._id, itemType: 'albumImage' },
                'itemId'
            ).lean();
            imgFavSet = new Set(imgFavs.map(f => f.itemId.toString()));
        }
        const annotatedImages = images.map(img => ({
            ...img,
            isFavorite: imgFavSet.has(img._id.toString()),
        }));

        let isFavorite = false;
        if (req.user) {
            isFavorite = !!(await Favorite.exists({ userId: req.user._id, itemId: album._id, itemType: 'album' }));
        }

        const totalViews = images.reduce((sum, img) => sum + (img.views || 0), 0);

        res.json({ album: { ...album, isFavorite, totalViews }, images: annotatedImages });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── POST /api/albums [admin] ─────────────────────────────────────────────────
router.post("/", requireAdmin, uploadCover.single('cover'), async (req, res) => {
    try {
        const { title, description, tags, studios, actors, characters, year } = req.body;
        if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
        const data = {
            title: title.trim(),
            description: description?.trim() || '',
            tags:       tags       ? JSON.parse(tags)       : [],
            studios:    studios    ? JSON.parse(studios)    : [],
            actors:     actors     ? JSON.parse(actors)     : [],
            characters: characters ? JSON.parse(characters) : [],
            year: year ? parseInt(year) : null,
        };
        if (req.file) data.coverPath = req.file.filename;
        const album = await new Album(data).save();
        res.status(201).json({ success: true, album });
    } catch (e) {
        if (req.file) { try { fs.unlinkSync(path.join(imagesDir, req.file.filename)); } catch (_) {} }
        res.status(500).json({ error: e.message });
    }
});

// ─── PUT /api/albums/:id [admin] ──────────────────────────────────────────────
router.put("/:id", requireAdmin, uploadCover.single('cover'), async (req, res) => {
    try {
        const album = await Album.findById(req.params.id);
        if (!album) return res.status(404).json({ error: 'Album not found' });

        const { title, description, tags, studios, actors, characters, year, removeCover } = req.body;
        const upd = {};
        if (title       !== undefined) upd.title       = title.trim();
        if (description !== undefined) upd.description = description.trim();
        if (tags)       upd.tags       = JSON.parse(tags);
        if (studios)    upd.studios    = JSON.parse(studios);
        if (actors)     upd.actors     = JSON.parse(actors);
        if (characters) upd.characters = JSON.parse(characters);
        if (year        !== undefined) upd.year = year ? parseInt(year) : null;

        if (req.file) {
            if (album.coverPath) { try { fs.unlinkSync(path.join(imagesDir, album.coverPath)); } catch (_) {} }
            upd.coverPath = req.file.filename;
        } else if (removeCover === 'true') {
            if (album.coverPath) { try { fs.unlinkSync(path.join(imagesDir, album.coverPath)); } catch (_) {} }
            upd.coverPath = null;
        }

        const updated = await Album.findByIdAndUpdate(req.params.id, upd, { new: true, runValidators: true });
        res.json({ success: true, album: updated });
    } catch (e) {
        if (req.file) { try { fs.unlinkSync(path.join(imagesDir, req.file.filename)); } catch (_) {} }
        res.status(500).json({ error: e.message });
    }
});

// ─── DELETE /api/albums/:id [admin] ───────────────────────────────────────────
router.delete("/:id", requireAdmin, async (req, res) => {
    try {
        const album = await Album.findById(req.params.id);
        if (!album) return res.status(404).json({ error: 'Album not found' });

        const images = await AlbumImage.find({ albumId: album._id }, 'imagePath').lean();

        // Delete all image files
        for (const img of images) {
            try { fs.unlinkSync(path.join(imagesDir, img.imagePath)); } catch (_) {}
        }
        if (album.coverPath) { try { fs.unlinkSync(path.join(imagesDir, album.coverPath)); } catch (_) {} }

        await AlbumImage.deleteMany({ albumId: album._id });
        await Favorite.deleteMany({ itemId: album._id, itemType: 'album' });
        await Album.findByIdAndDelete(req.params.id);

        res.json({ success: true, message: 'Album and all images deleted' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── POST /api/albums/:id/images — upload multiple images [admin] ─────────────
router.post("/:id/images", requireAdmin, uploadImages.array('images', 200), async (req, res) => {
    try {
        const album = await Album.findById(req.params.id);
        if (!album) return res.status(404).json({ error: 'Album not found' });
        if (!req.files?.length) return res.status(400).json({ error: 'No images uploaded' });

        // Get current max order
        const last = await AlbumImage.findOne({ albumId: album._id }).sort({ order: -1 }).lean();
        let order = (last?.order ?? -1) + 1;

        const docs = req.files.map(file => ({
            albumId:   album._id,
            imagePath: file.filename,
            fileSize:  file.size,
            order:     order++,
        }));

        const inserted = await AlbumImage.insertMany(docs);
        res.status(201).json({ success: true, count: inserted.length, images: inserted });
    } catch (e) {
        // Clean up uploaded files on error
        for (const f of (req.files || [])) {
            try { fs.unlinkSync(path.join(imagesDir, f.filename)); } catch (_) {}
        }
        res.status(500).json({ error: e.message });
    }
});

// ─── DELETE /api/albums/:id/images — delete selected images [admin] ───────────
// Body: { imageIds: string[] }
router.delete("/:id/images", requireAdmin, async (req, res) => {
    try {
        const { imageIds } = req.body;
        if (!Array.isArray(imageIds) || !imageIds.length) return res.status(400).json({ error: 'imageIds required' });

        const images = await AlbumImage.find({ _id: { $in: imageIds }, albumId: req.params.id }, 'imagePath').lean();
        for (const img of images) {
            try { fs.unlinkSync(path.join(imagesDir, img.imagePath)); } catch (_) {}
        }
        await AlbumImage.deleteMany({ _id: { $in: imageIds }, albumId: req.params.id });
        res.json({ success: true, deleted: images.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── PATCH /api/albums/:id/favorite [auth] ────────────────────────────────────
router.patch("/:id/favorite", authenticate, async (req, res) => {
    try {
        const existing = await Favorite.findOne({ userId: req.user._id, itemId: req.params.id, itemType: 'album' });
        if (existing) {
            await Favorite.findByIdAndDelete(existing._id);
            return res.json({ success: true, isFavorite: false });
        }
        await new Favorite({ userId: req.user._id, itemId: req.params.id, itemType: 'album' }).save();
        res.json({ success: true, isFavorite: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── PATCH /api/albums/images/:imageId/view — record image view ───────────────
router.patch("/images/:imageId/view", async (req, res) => {
    try {
        await AlbumImage.findByIdAndUpdate(req.params.imageId, { $inc: { views: 1 } });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.patch("/images/:imageId/favorite", authenticate, async (req, res) => {
    try {
        const existing = await Favorite.findOne({
            userId:   req.user._id,
            itemId:   req.params.imageId,
            itemType: 'albumImage',
        });
        if (existing) {
            await Favorite.findByIdAndDelete(existing._id);
            return res.json({ success: true, isFavorite: false });
        }
        await new Favorite({
            userId:   req.user._id,
            itemId:   req.params.imageId,
            itemType: 'albumImage',
        }).save();
        res.json({ success: true, isFavorite: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;