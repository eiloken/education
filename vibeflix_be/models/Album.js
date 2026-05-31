import mongoose from "mongoose";

const albumSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    tags: [{ type: String, trim: true }],
    studios: [{ type: String, trim: true }],
    actors: [{ type: String, trim: true }],
    characters: [{ type: String, trim: true }],
    year: { type: Number },
    coverPath: { type: String, default: null }, // manual cover override; null = auto from images
}, { timestamps: true });

albumSchema.index({ title: 'text', description: 'text' });
albumSchema.index({ tags: 1 });
albumSchema.index({ studios: 1 });
albumSchema.index({ actors: 1 });
albumSchema.index({ characters: 1 });
albumSchema.index({ year: 1 });

export default mongoose.model('Album', albumSchema);
