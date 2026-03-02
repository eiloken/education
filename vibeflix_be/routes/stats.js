import express from "express";
import Video from "../models/Video.js";
import Series from "../models/Series.js";

const router = express.Router();

// GET /api/stats
router.get("/", async (req, res) => {
    try {
        const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        const [
            totalVideos, totalSeries,
            totalFavoriteVideos, totalFavoriteSeries,
            viewsAgg, storageAgg, durationAgg,
            topVideos, recentVideos, uploadsByMonth,
            topTags, topActors, topStudios,
            resolutionBreakdown, topSeries,
        ] = await Promise.all([
            Video.countDocuments(),
            Series.countDocuments(),
            Video.countDocuments({ isFavorite: true }),
            Series.countDocuments({ isFavorite: true }),

            Video.aggregate([{ $group: { _id: null, total: { $sum: "$views" } } }]),
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
                    count: { $sum: 1 }, views: { $sum: "$views" }
                }},
                { $sort: { "_id.year": 1, "_id.month": 1 } }
            ]),

            Video.aggregate([
                { $unwind: "$tags" },
                { $group: { _id: "$tags", count: { $sum: 1 }, views: { $sum: "$views" } } },
                { $sort: { count: -1 } }, { $limit: 10 }
            ]),

            Video.aggregate([
                { $unwind: "$actors" },
                { $group: { _id: "$actors", count: { $sum: 1 }, views: { $sum: "$views" } } },
                { $sort: { views: -1 } }, { $limit: 10 }
            ]),

            Video.aggregate([
                { $unwind: "$studios" },
                { $group: { _id: "$studios", count: { $sum: 1 }, views: { $sum: "$views" } } },
                { $sort: { count: -1 } }, { $limit: 8 }
            ]),

            Video.aggregate([
                { $unwind: { path: "$resolutions", preserveNullAndEmptyArrays: true } },
                { $group: { _id: { $ifNull: ["$resolutions.quality", "Original"] }, count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]),

            Video.aggregate([
                { $match: { seriesId: { $ne: null } } },
                { $group: { _id: "$seriesId", episodeCount: { $sum: 1 }, totalViews: { $sum: "$views" } } },
                { $sort: { totalViews: -1 } }, { $limit: 5 },
                { $lookup: { from: "series", localField: "_id", foreignField: "_id", as: "series" } },
                { $unwind: "$series" },
                { $project: { title: "$series.title", episodeCount: 1, totalViews: 1 } }
            ]),
        ]);

        res.json({
            overview: {
                totalVideos, totalSeries,
                totalFavorites: totalFavoriteVideos + totalFavoriteSeries,
                totalViews:    viewsAgg[0]?.total    || 0,
                totalStorage:  storageAgg[0]?.total  || 0,
                totalDuration: durationAgg[0]?.total || 0,
            },
            topVideos, recentVideos,
            uploadsByMonth: uploadsByMonth.map(d => ({
                label: `${MONTHS[d._id.month - 1]} ${String(d._id.year).slice(2)}`,
                uploads: d.count,
                views: d.views,
            })),
            topTags:    topTags.map(t    => ({ name: t._id, count: t.count, views: t.views })),
            topActors:  topActors.map(a  => ({ name: a._id, count: a.count, views: a.views })),
            topStudios: topStudios.map(s => ({ name: s._id, count: s.count, views: s.views })),
            resolutionBreakdown: resolutionBreakdown.map(r => ({ name: r._id, value: r.count })),
            topSeries,
        });
    } catch (err) {
        console.error("Stats error:", err);
        res.status(500).json({ error: err.message });
    }
});

export default router;