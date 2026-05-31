import mongoose from "mongoose";

const albumImageSchema = new mongoose.Schema({
    albumId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Album', required: true },
    imagePath: { type: String, required: true },   // filename in imagesDir
    title:     { type: String, trim: true },
    views:     { type: Number, default: 0 },
    fileSize:  { type: Number, default: 0 },       // bytes
    width:     { type: Number },
    height:    { type: Number },
    order:     { type: Number, default: 0 },       // for display ordering
}, { timestamps: true });

albumImageSchema.index({ albumId: 1, order: 1, createdAt: -1 });

export default mongoose.model('AlbumImage', albumImageSchema);
