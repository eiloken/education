import mongoose from "mongoose";

const videoSchema = new mongoose.Schema({
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
    uploadDate: {
        type: Date,
        default: Date.now
    },
    year: {
        type: Number
    },
    videoPath: {
        type: String,
        required: true
    },
    thumbnailPath: {
        type: String
    },
    duration: {
        type: Number // in seconds
    },
    fileSize: {
        type: Number // in bytes
    },
    resolutions: [{
        quality: String, // 1080p, 720p, 480p, etc
        path: String
    }],
    views: {
        type: Number,
        default: 0
    },
    isFavorite: {
        type: Boolean,
        default: false
    },
    // Series membership — null means standalone video
    seriesId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Series',
        default: null
    },
    episodeNumber: {
        type: Number,
        default: null
    },
    seasonNumber: {
        type: Number,
        default: null
    }
}, {
    timestamps: true
});

// Indexes for efficient querying
videoSchema.index({ title: 'text', description: 'text' });
videoSchema.index({ tags: 1 });
videoSchema.index({ studios: 1 });
videoSchema.index({ actors: 1 });
videoSchema.index({ characters: 1 });
videoSchema.index({ year: 1 });
videoSchema.index({ uploadDate: -1 });
videoSchema.index({ isFavorite: 1 });
videoSchema.index({ seriesId: 1, seasonNumber: 1, episodeNumber: 1 });

export default mongoose.model('Video', videoSchema);