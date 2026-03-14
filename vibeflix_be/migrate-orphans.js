/**
 * migrate-orphans.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Finds every Video with seriesId = null and creates a Series for each one,
 * then re-links the video as Episode 1 / Season 1 of that series.
 *
 * Usage (from your project root, same folder as .env):
 *   node migrate-orphans.js
 *
 * Reads the same .env your server uses — no extra config needed.
 * Safe to re-run — skips videos that already have a seriesId.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import dotenv   from 'dotenv';
dotenv.config();          // loads .env exactly like server.js does

import mongoose from 'mongoose';

// ─── Inline model definitions (mirror your real schemas) ─────────────────────

const videoSchema = new mongoose.Schema({
    title:         { type: String, required: true, trim: true },
    description:   { type: String, trim: true },
    tags:          [{ type: String, trim: true }],
    studios:       [{ type: String, trim: true }],
    actors:        [{ type: String, trim: true }],
    characters:    [{ type: String, trim: true }],
    uploadDate:    { type: Date, default: Date.now },
    year:          Number,
    videoPath:     { type: String, required: true },
    thumbnailPath: String,
    duration:      Number,
    fileSize:      Number,
    resolutions:   [{ quality: String, path: String }],
    views:         { type: Number, default: 0 },
    isFavorite:    { type: Boolean, default: false },
    seriesId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Series', default: null },
    episodeNumber: { type: Number, default: null },
    seasonNumber:  { type: Number, default: null },
}, { timestamps: true });

const seriesSchema = new mongoose.Schema({
    title:         { type: String, required: true, trim: true },
    description:   { type: String, trim: true },
    tags:          [{ type: String, trim: true }],
    studios:       [{ type: String, trim: true }],
    actors:        [{ type: String, trim: true }],
    characters:    [{ type: String, trim: true }],
    year:          Number,
    thumbnailPath: String,
    isFavorite:    { type: Boolean, default: false },
    totalSeasons:  { type: Number, default: 1 },
}, { timestamps: true });

// Use existing models if already registered (safe for re-import)
const Video  = mongoose.models.Video  || mongoose.model('Video',  videoSchema);
const Series = mongoose.models.Series || mongoose.model('Series', seriesSchema);

// ─── Main ─────────────────────────────────────────────────────────────────────

async function migrate() {
    const uri = process.env.MONGODB_URL || 'mongodb://localhost:27017/vibeflix';

    console.log('🔌  Connecting to MongoDB…');
    await mongoose.connect(uri);
    console.log('✅  Connected.\n');

    // Find all orphaned videos
    const orphans = await Video.find({ seriesId: null }).sort({ createdAt: 1 });

    if (orphans.length === 0) {
        console.log('🎉  No orphaned videos found — nothing to migrate.');
        await mongoose.disconnect();
        return;
    }

    console.log(`🎬  Found ${orphans.length} orphaned video(s). Starting migration…\n`);

    let created = 0;
    let skipped = 0;
    let failed  = 0;

    for (const video of orphans) {
        try {
            // Double-check it's still orphaned (in case of concurrent runs)
            if (video.seriesId) { skipped++; continue; }

            // Check if a series with this exact title already exists and has no episodes
            // (can happen if migration was partially run before)
            let series = await Series.findOne({ title: video.title });
            const existingEpisodes = series
                ? await Video.countDocuments({ seriesId: series._id })
                : 0;

            if (series && existingEpisodes > 0) {
                // A real series already exists with this name — append as next episode
                const maxEp = await Video.findOne({ seriesId: series._id })
                    .sort({ episodeNumber: -1 })
                    .select('episodeNumber');
                const nextEp = (maxEp?.episodeNumber || 0) + 1;

                await Video.findByIdAndUpdate(video._id, {
                    seriesId:      series._id,
                    episodeNumber: nextEp,
                    seasonNumber:  1,
                });

                console.log(`  ↩  [appended]  "${video.title}" → existing series "${series.title}" as E${nextEp}`);
                created++;
            } else {
                // Create a fresh series
                if (!series) {
                    series = await new Series({
                        title:         video.title,
                        description:   video.description  || '',
                        tags:          video.tags         || [],
                        studios:       video.studios      || [],
                        actors:        video.actors       || [],
                        characters:    video.characters   || [],
                        year:          video.year         || null,
                        thumbnailPath: video.thumbnailPath || null,
                    }).save();
                }

                await Video.findByIdAndUpdate(video._id, {
                    seriesId:      series._id,
                    episodeNumber: 1,
                    seasonNumber:  1,
                });

                console.log(`  ✔  [created]   "${video.title}" → new series (id: ${series._id})`);
                created++;
            }
        } catch (err) {
            console.error(`  ✘  [failed]    "${video.title}": ${err.message}`);
            failed++;
        }
    }

    console.log(`\n────────────────────────────────────────`);
    console.log(`  Migrated : ${created}`);
    console.log(`  Skipped  : ${skipped}`);
    console.log(`  Failed   : ${failed}`);
    console.log(`────────────────────────────────────────`);

    if (failed === 0) {
        console.log('\n🎉  Migration complete — all orphans now belong to a series.');
    } else {
        console.log('\n⚠️   Migration finished with errors. Check output above.');
    }

    await mongoose.disconnect();
}

migrate().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});