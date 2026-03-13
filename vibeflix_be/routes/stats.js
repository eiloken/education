import express from "express";
import Video from "../models/Video.js";
import Series from "../models/Series.js";
import Favorite from "../models/Favorite.js";
import UserActivity from "../models/UserActivity.js";

const router = express.Router();
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// GET /api/stats
router.get("/", async (req, res) => {
    try {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const [
            totalVideos, totalSeries,
            totalFavorites,
            viewsAgg, storageAgg, durationAgg,
            topVideos, recentVideos, uploadsByMonth,
            topTags, topActors, topStudios,
            topSeries,
            // New: per-user favorites leaderboard
            mostFavoritedVideos, mostFavoritedSeries,
            // New: active users by hour (last 7 days)
            activeByHour,
        ] = await Promise.all([
            Video.countDocuments(),
            Series.countDocuments(),

            // Platform-wide total favorites count (engagement metric)
            Favorite.countDocuments(),

            Video.aggregate([{ $group: { _id: null, total: { $sum: "$views"    } } }]),
            Video.aggregate([{ $group: { _id: null, total: { $sum: "$fileSize" } } }]),
            Video.aggregate([{ $group: { _id: null, total: { $sum: "$duration" } } }]),

            Video.find({}, { title: 1, views: 1, thumbnailPath: 1, duration: 1 })
                .sort({ views: -1 }).limit(10).lean(),

            Video.find({}, { title: 1, createdAt: 1, fileSize: 1, duration: 1 })
                .sort({ createdAt: -1 }).limit(8).lean(),

            Video.aggregate([
                { $match: { createdAt: { $gte: oneYearAgo } } },
                { $group: {
                    _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
                    count: { $sum: 1 }, views: { $sum: "$views" },
                }},
                { $sort: { "_id.year": 1, "_id.month": 1 } },
            ]),

            Video.aggregate([
                { $unwind: "$tags" },
                { $group: { _id: "$tags", count: { $sum: 1 }, views: { $sum: "$views" } } },
                { $sort: { count: -1 } }, { $limit: 10 },
            ]),
            Video.aggregate([
                { $unwind: "$actors" },
                { $group: { _id: "$actors", count: { $sum: 1 }, views: { $sum: "$views" } } },
                { $sort: { views: -1 } }, { $limit: 10 },
            ]),
            Video.aggregate([
                { $unwind: "$studios" },
                { $group: { _id: "$studios", count: { $sum: 1 }, views: { $sum: "$views" } } },
                { $sort: { count: -1 } }, { $limit: 8 },
            ]),

            Video.aggregate([
                { $match: { seriesId: { $ne: null } } },
                { $group: { _id: "$seriesId", episodeCount: { $sum: 1 }, totalViews: { $sum: "$views" } } },
                { $sort: { totalViews: -1 } }, { $limit: 5 },
                { $lookup: { from: "series", localField: "_id", foreignField: "_id", as: "series" } },
                { $unwind: "$series" },
                { $project: { title: "$series.title", episodeCount: 1, totalViews: 1 } },
            ]),

            // ── Most favorited videos (by number of users who hearted them) ──
            Favorite.aggregate([
                { $match: { itemType: 'video' } },
                { $group: { _id: '$itemId', favoriteCount: { $sum: 1 } } },
                { $sort: { favoriteCount: -1 } },
                { $limit: 10 },
                { $lookup: { from: 'videos', localField: '_id', foreignField: '_id', as: 'video' } },
                { $unwind: '$video' },
                { $project: { title: '$video.title', thumbnailPath: '$video.thumbnailPath', views: '$video.views', favoriteCount: 1 } },
            ]),

            // ── Most favorited series ─────────────────────────────────────────
            Favorite.aggregate([
                { $match: { itemType: 'series' } },
                { $group: { _id: '$itemId', favoriteCount: { $sum: 1 } } },
                { $sort: { favoriteCount: -1 } },
                { $limit: 5 },
                { $lookup: { from: 'series', localField: '_id', foreignField: '_id', as: 'series' } },
                { $unwind: '$series' },
                { $project: { title: '$series.title', thumbnailPath: '$series.thumbnailPath', favoriteCount: 1 } },
            ]),

            // ── Active users by hour of day (last 7 days, unique sessions) ───
            UserActivity.aggregate([
                { $match: { timestamp: { $gte: sevenDaysAgo } } },
                { $group: { _id: { hour: '$hour', session: '$sessionId' } } },
                { $group: { _id: '$_id.hour', sessions: { $sum: 1 } } },
                { $sort: { '_id': 1 } },
            ]),
        ]);

        // Fill all 24 hours even if no data
        const hourMap = Object.fromEntries(activeByHour.map(h => [h._id, h.sessions]));
        const activeByHourFull = Array.from({ length: 24 }, (_, h) => ({
            hour:     h,
            label:    `${String(h).padStart(2, '0')}:00`,
            sessions: hourMap[h] ?? 0,
        }));

        res.json({
            overview: {
                totalVideos,
                totalSeries,
                totalFavorites,     // platform-wide favorite actions
                totalViews:    viewsAgg[0]?.total    || 0,
                totalStorage:  storageAgg[0]?.total  || 0,
                totalDuration: durationAgg[0]?.total || 0,
            },
            topVideos,
            recentVideos,
            uploadsByMonth: uploadsByMonth.map(d => ({
                label:   `${MONTHS[d._id.month - 1]} ${String(d._id.year).slice(2)}`,
                uploads: d.count,
                views:   d.views,
            })),
            topTags:    topTags.map(t    => ({ name: t._id, count: t.count, views: t.views })),
            topActors:  topActors.map(a  => ({ name: a._id, count: a.count, views: a.views })),
            topStudios: topStudios.map(s => ({ name: s._id, count: s.count, views: s.views })),
            topSeries,
            mostFavoritedVideos,
            mostFavoritedSeries,
            activeByHour: activeByHourFull,
        });
    } catch (err) {
        console.error("Stats error:", err);
        res.status(500).json({ error: err.message });
    }
});

export default router;