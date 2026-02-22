import mongoose from "mongoose";

const seriesSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    tags: [{
        type: String,
        trim: true
    }],
    studios: [{
        type: String,
        trim: true
    }],
    actors: [{
        type: String,
        trim: true
    }],
    characters: [{
        type: String,
        trim: true
    }],
    year: {
        type: Number
    },
    thumbnailPath: {
        type: String
    },
    isFavorite: {
        type: Boolean,
        default: false
    },
    totalSeasons: {
        type: Number,
        default: 1
    }
}, {
    timestamps: true
});

// Indexes for efficient querying
seriesSchema.index({ title: 'text', description: 'text' });
seriesSchema.index({ tags: 1 });
seriesSchema.index({ studios: 1 });
seriesSchema.index({ actors: 1 });
seriesSchema.index({ characters: 1 });
seriesSchema.index({ year: 1 });
seriesSchema.index({ isFavorite: 1 });

export default mongoose.model('Series', seriesSchema);