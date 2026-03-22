import mongoose from "mongoose";

const watchHistorySchema = new mongoose.Schema({
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true },
    videoId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Video', required: true },
    progress: { type: Number, default: 0 },   // seconds watched
    duration: { type: Number, default: 0 },   // snapshot of video duration
}, { timestamps: true });

// One record per user + video (upserted on every progress save)
watchHistorySchema.index({ userId: 1, videoId: 1 }, { unique: true });
// Efficient "recent history" list queries
watchHistorySchema.index({ userId: 1, updatedAt: -1 });

export default mongoose.model('WatchHistory', watchHistorySchema);