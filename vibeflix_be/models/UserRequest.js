import mongoose from "mongoose";

const requestSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
    reason:   { type: String, required: true, trim: true, maxlength: 1000 },
    status:   { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    // TTL field — MongoDB auto-deletes documents 7 days after this date
    expiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
}, { timestamps: true });

// Auto-purge 7 days after creation (expireAfterSeconds:0 means "at expiresAt exactly")
requestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
requestSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('UserRequest', requestSchema);
