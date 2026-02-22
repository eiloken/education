import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import fs from 'fs';
import dotenv from 'dotenv';
import videoRoutes from './routes/videos.js';
import seriesRoutes from './routes/series.js';

dotenv.config();

export let uploadDir = process.env.ABS_UPLOAD_PATH;
export let thumbnailDir = process.env.ABS_THUMBNAIL_PATH;

if (!fs.existsSync(uploadDir)) {
    try {
        fs.mkdirSync(uploadDir, { recursive: true });
    } catch (err) {
        console.error('Could not create upload directory', err);
        process.exit(1);
    }
}

try {
    fs.accessSync(uploadDir, fs.constants.W_OK | fs.constants.R_OK);
    console.log(`✅ Upload directory exists: ${uploadDir}`);
} catch (error) {
    console.error('Could not access upload directory', error);
    process.exit(1);
}

if (!fs.existsSync(thumbnailDir)) {
    try {
        fs.mkdirSync(thumbnailDir, { recursive: true });
    } catch (err) {
        console.error('Could not create thumbnail directory', err);
        process.exit(1);
    }
}

try {
    fs.accessSync(thumbnailDir, fs.constants.W_OK | fs.constants.R_OK);
    console.log(`✅ Thumbnail directory exists: ${thumbnailDir}`);
} catch (error) {
    console.error('Could not access thumbnail directory', error);
    process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/movies', express.static(uploadDir));
app.use('/api/thumbnails', express.static(thumbnailDir));

mongoose.connect(process.env.MONGODB_URL || 'mongodb://localhost:27017/vibeflix')
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Could not connect to MongoDB', err));

app.use('/api/videos', videoRoutes);
app.use('/api/series', seriesRoutes);

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Vibeflix API is healthy',
        timeStamp: new Date().toISOString()
    });
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        error: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});