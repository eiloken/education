import mongoose from "mongoose";

// Each ping writes one document. Lightweight — kept for 30 days via TTL.
const activitySchema = new mongoose.Schema({
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    sessionId: { type: String },
    hour:      { type: Number, min: 0, max: 23 }, // hour-of-day the ping arrived
    date:      { type: String },                   // YYYY-MM-DD
    timestamp: { type: Date, default: Date.now },
});

// Auto-purge documents older than 30 days
activitySchema.index({ timestamp: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });
activitySchema.index({ hour: 1 });
activitySchema.index({ userId: 1, date: 1 });

export default mongoose.model('UserActivity', activitySchema);