import express from "express";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import sharp from "sharp";

// archiver is CJS-only — must use createRequire in an ESM project
const require = createRequire(import.meta.url);
const archiver = require("archiver");
import Album from "../models/Album.js";
import AlbumImage from "../models/AlbumImage.js";
import Favorite from "../models/Favorite.js";
import { imagesDir } from "../server.js";
import { requireAdmin, authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// ─── Thumbnail directory ──────────────────────────────────────────────────────
// Per-image thumbs live in <imagesDir>/thumbs/, always stored as JPEG.
let thumbsDir;
try {
    thumbsDir = path.join(imagesDir, 'thumbs');
    if (!fs.existsSync(thumbsDir)) fs.mkdirSync(thumbsDir, { recursive: true });
} catch (e) {
    console.warn('[albums] Could not create thumbs dir:', e.message);
}

// ── Generate a 400px thumbnail for a single image file ────────────────────────
async function generateThumb(filename) {
    if (!thumbsDir) return;
    const src  = path.join(imagesDir, filename);
    const base = filename.replace(/\.[^.]+$/, '');
    const dst  = path.join(thumbsDir, base + '.jpg');
    if (!fs.existsSync(src)) return;
    try {
        await sharp(src)
            .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 75, progressive: true })
            .toFile(dst);
    } catch (e) {
        console.warn('[albums] generateThumb failed for', filename, e.message);
    }
}

// ── Generate a composite mosaic cover for an album — picks up to 4 random imgs ─
async function generateAlbumMosaic(albumId) {
    try {
        // Pick up to 4 random images via reservoir sampling
        const all = await AlbumImage.find({ albumId }, 'imagePath').lean();
        if (!all.length) return;
        const sample = all.length <= 4
            ? all
            : [0,1,2,3].map(() => all.splice(Math.floor(Math.random() * all.length), 1)[0]);

        const paths = sample
            .map(img => path.join(imagesDir, img.imagePath))
            .filter(p => fs.existsSync(p));
        if (!paths.length) return;

        // Fixed output resolution — 600×400 JPEG, quality 80
        const W = 600, H = 400;
        const n = paths.length;
        const composites = [];

        if (n === 1) {
            composites.push({
                input: await sharp(paths[0]).resize(W, H, { fit: 'cover', position: 'centre' }).toBuffer(),
                left: 0, top: 0,
            });
        } else if (n === 2) {
            const hw = Math.floor(W / 2);
            for (let i = 0; i < 2; i++) {
                composites.push({
                    input: await sharp(paths[i]).resize(hw, H, { fit: 'cover', position: 'centre' }).toBuffer(),
                    left: i * hw, top: 0,
                });
            }
        } else if (n === 3) {
            const hw = Math.floor(W / 2), hh = Math.floor(H / 2);
            composites.push({ input: await sharp(paths[0]).resize(hw, H,  { fit: 'cover', position: 'centre' }).toBuffer(), left: 0,  top: 0  });
            composites.push({ input: await sharp(paths[1]).resize(hw, hh, { fit: 'cover', position: 'centre' }).toBuffer(), left: hw, top: 0  });
            composites.push({ input: await sharp(paths[2]).resize(hw, hh, { fit: 'cover', position: 'centre' }).toBuffer(), left: hw, top: hh });
        } else {
            const hw = Math.floor(W / 2), hh = Math.floor(H / 2);
            const pos = [[0,0],[hw,0],[0,hh],[hw,hh]];
            for (let i = 0; i < 4; i++) {
                composites.push({
                    input: await sharp(paths[i]).resize(hw, hh, { fit: 'cover', position: 'centre' }).toBuffer(),
                    left: pos[i][0], top: pos[i][1],
                });
            }
        }

        const outFile = `ALBUM-MOSAIC-${albumId}.jpg`;
        const outPath = path.join(imagesDir, outFile);

        await sharp({ create: { width: W, height: H, channels: 3, background: { r: 30, g: 41, b: 59 } } })
            .composite(composites)
            .jpeg({ quality: 80 })
            .toFile(outPath);

        // mosaicPath IS the cover — single field, single image
        await Album.findByIdAndUpdate(albumId, { mosaicPath: outFile, coverPath: outFile });
    } catch (e) {
        console.warn('[albums] generateAlbumMosaic failed for', albumId, e.message);
    }
}

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
                },
            },
            // mosaicPath/coverPath are real fields on Album — keep them; exclude only the joined imgs array
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

// ─── GET /api/albums/thumb/:filename — serve pre-generated thumbnail only ──────
// If the thumb doesn't exist yet (legacy images), redirect to the original.
// Generation happens only at upload time or via POST /generate-thumbs.
router.get('/thumb/:filename', (req, res) => {
    if (!thumbsDir) return res.redirect(`/api/images/${req.params.filename}`);
    const base      = req.params.filename.replace(/\.[^.]+$/, '');
    const thumbPath = path.join(thumbsDir, base + '.jpg');

    if (fs.existsSync(thumbPath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.sendFile(thumbPath);
    }

    // Thumb not generated yet — redirect to original, no processing
    res.redirect(`/api/images/${req.params.filename}`);
});

// ─── POST /api/albums/generate-thumbs [admin] — batch-generate missing thumbs ──
// Runs sequentially (one at a time) to avoid overwhelming the server.
// Returns a stream of Server-Sent Events so the client can show progress.
router.post('/generate-thumbs', requireAdmin, async (req, res) => {
    if (!thumbsDir) return res.status(503).json({ error: 'thumbsDir not available' });

    // Use SSE so the client gets live progress without polling
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
        const images = await AlbumImage.find({}, 'imagePath').lean();
        const total = images.length;
        let done = 0, skipped = 0, errors = 0;

        send({ type: 'start', total });

        for (const img of images) {
            const base      = img.imagePath.replace(/\.[^.]+$/, '');
            const thumbPath = path.join(thumbsDir, base + '.jpg');

            if (fs.existsSync(thumbPath)) {
                skipped++;
            } else {
                try {
                    await generateThumb(img.imagePath);
                    done++;
                } catch {
                    errors++;
                }
            }

            // Send progress every 10 images to avoid flooding
            if ((done + skipped + errors) % 10 === 0) {
                send({ type: 'progress', done, skipped, errors, total });
            }
        }

        // Also regenerate all album mosaics that are missing
        const albums = await Album.find({ mosaicPath: { $in: [null, undefined, ''] } }, '_id').lean();
        send({ type: 'mosaics', count: albums.length });
        for (const album of albums) {
            await generateAlbumMosaic(album._id);
        }

        send({ type: 'done', done, skipped, errors, total });
    } catch (e) {
        send({ type: 'error', message: e.message });
    } finally {
        res.end();
    }
});

// ─── POST /api/albums/:id/generate-mosaic [admin] ─────────────────────────────
router.post('/:id/generate-mosaic', requireAdmin, async (req, res) => {
    try {
        await generateAlbumMosaic(req.params.id);
        const album = await Album.findById(req.params.id).lean();
        res.json({ success: true, mosaicPath: album?.mosaicPath });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── GET /api/albums/:id/download — zip selected images ──────────────────────
// Query: ?ids=id1,id2,id3  (omit for all images)
router.get("/:id/download", async (req, res) => {
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

// helper — accepts both a real array (JSON body) and a JSON-stringified string (form body)
function parseArr(v) {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') { try { return JSON.parse(v); } catch { return []; } }
    return [];
}

// ─── POST /api/albums [admin] ─────────────────────────────────────────────────
router.post("/", requireAdmin, async (req, res) => {
    try {
        const { title, description, tags, studios, actors, characters, year } = req.body;
        if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
        const data = {
            title: title.trim(),
            description: description?.trim() || '',
            tags:       parseArr(tags),
            studios:    parseArr(studios),
            actors:     parseArr(actors),
            characters: parseArr(characters),
            year: year ? parseInt(year) : null,
        };
        const album = await new Album(data).save();
        res.status(201).json({ success: true, album });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── PUT /api/albums/:id [admin] ──────────────────────────────────────────────
router.put("/:id", requireAdmin, async (req, res) => {
    try {
        const album = await Album.findById(req.params.id);
        if (!album) return res.status(404).json({ error: 'Album not found' });

        const { title, description, tags, studios, actors, characters, year } = req.body;
        const upd = {};
        if (title       !== undefined) upd.title       = title.trim();
        if (description !== undefined) upd.description = description.trim();
        if (tags)       upd.tags       = parseArr(tags);
        if (studios)    upd.studios    = parseArr(studios);
        if (actors)     upd.actors     = parseArr(actors);
        if (characters) upd.characters = parseArr(characters);
        if (year        !== undefined) upd.year = year ? parseInt(year) : null;

        const updated = await Album.findByIdAndUpdate(req.params.id, upd, { new: true, runValidators: true });
        res.json({ success: true, album: updated });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── POST /api/albums/:id/refresh-cover [admin] — re-roll random mosaic cover ─
router.post('/:id/refresh-cover', requireAdmin, async (req, res) => {
    try {
        await generateAlbumMosaic(req.params.id);
        const album = await Album.findById(req.params.id).lean();
        res.json({ success: true, mosaicPath: album?.mosaicPath, coverPath: album?.coverPath });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── DELETE /api/albums/:id [admin] ───────────────────────────────────────────
router.delete("/:id", requireAdmin, async (req, res) => {
    try {
        const album = await Album.findById(req.params.id);
        if (!album) return res.status(404).json({ error: 'Album not found' });

        const images = await AlbumImage.find({ albumId: album._id }, 'imagePath').lean();

        // Delete all image files + their thumbnails
        for (const img of images) {
            try { fs.unlinkSync(path.join(imagesDir, img.imagePath)); } catch (_) {}
            if (thumbsDir) {
                const thumbBase = img.imagePath.replace(/\.[^.]+$/, '');
                try { fs.unlinkSync(path.join(thumbsDir, thumbBase + '.jpg')); } catch (_) {}
            }
        }
        if (album.mosaicPath) { try { fs.unlinkSync(path.join(imagesDir, album.mosaicPath)); } catch (_) {} }

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

        // Fire-and-forget: generate per-image thumbs + refresh album mosaic
        Promise.allSettled([
            ...req.files.map(f => generateThumb(f.filename)),
            generateAlbumMosaic(album._id),
        ]).catch(() => {});

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
            // Remove thumb if it exists
            if (thumbsDir) {
                const thumbBase = img.imagePath.replace(/\.[^.]+$/, '');
                try { fs.unlinkSync(path.join(thumbsDir, thumbBase + '.jpg')); } catch (_) {}
            }
        }
        await AlbumImage.deleteMany({ _id: { $in: imageIds }, albumId: req.params.id });
        // Refresh mosaic asynchronously
        generateAlbumMosaic(req.params.id).catch(() => {});
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