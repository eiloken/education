import mongoose from "mongoose";

const favoriteSchema = new mongoose.Schema({
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    itemId:   { type: mongoose.Schema.Types.ObjectId, required: true },
    itemType: { type: String, enum: ['video', 'series'], required: true },
}, { timestamps: true });

// Prevent duplicate favorites
favoriteSchema.index({ userId: 1, itemId: 1, itemType: 1 }, { unique: true });
// Efficient count queries (most-favorited leaderboard)
favoriteSchema.index({ itemId: 1, itemType: 1 });
// User's full list
favoriteSchema.index({ userId: 1, itemType: 1, createdAt: -1 });

export default mongoose.model('Favorite', favoriteSchema);