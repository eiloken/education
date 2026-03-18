import dotenv     from 'dotenv';
dotenv.config();

import express    from 'express';
import mongoose   from 'mongoose';
import cors       from 'cors';
import fs         from 'fs';
import session    from 'express-session';
import MongoStore from 'connect-mongo';
import User       from './models/User.js';
import videoRoutes    from './routes/videos.js';
import seriesRoutes   from './routes/series.js';
import statsRoutes    from './routes/stats.js';
import authRoutes     from './routes/auth.js';
import favoritesRoutes from './routes/favorites.js';
import activityRoutes  from './routes/activity.js';

export let uploadDir    = process.env.ABS_UPLOAD_PATH;
export let thumbnailDir = process.env.ABS_THUMBNAIL_PATH;
export const MAX_TRANSCODE_RES = parseInt(process.env.MAX_TRANSCODE_RES || 1080);
export const MAX_TRANSCODE_JOBS = parseInt(process.env.MAX_TRANSCODE_JOBS || 1);

for (const [label, dir] of [['upload', uploadDir], ['thumbnail', thumbnailDir]]) {
    if (!fs.existsSync(dir)) {
        try { fs.mkdirSync(dir, { recursive: true }); }
        catch (err) { console.error(`Could not create ${label} directory`, err); process.exit(1); }
    }
    try { fs.accessSync(dir, fs.constants.W_OK | fs.constants.R_OK); console.log(`✅ ${label} dir: ${dir}`); }
    catch (err) { console.error(`Could not access ${label} directory`, err); process.exit(1); }
}

const MONGO_URL  = process.env.MONGODB_URL || 'mongodb://localhost:27017/vibeflix';
const CLIENT_URL = process.env.CLIENT_URL  || 'http://localhost:5173';

const app  = express();
const PORT = process.env.PORT || 5001;

// ── CORS ───────────────────────────────────────────────────────────────────────
app.use(cors({
    origin:      CLIENT_URL,
    credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Session ────────────────────────────────────────────────────────────────────
app.use(session({
    secret:            process.env.SESSION_SECRET || 'vibeflix-change-this-secret',
    resave:            false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: MONGO_URL }),
    cookie: {
        secure:   process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge:   24 * 60 * 60 * 1000, // 24 h
    },
}));

// ── Session → req.user ─────────────────────────────────────────────────────────
// Replaces passport.deserializeUser — attaches the user object on every request.
app.use(async (req, res, next) => {
    if (req.session?.userId) {
        try {
            req.user = await User.findById(req.session.userId).lean() || undefined;
        } catch { /* ignore — db might not be ready yet */ }
    }
    next();
});

// ── Database ───────────────────────────────────────────────────────────────────
mongoose.connect(MONGO_URL)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// ── Static files ───────────────────────────────────────────────────────────────
app.use('/api/movies',     express.static(uploadDir));
app.use('/api/thumbnails', express.static(thumbnailDir));

// ── Routes ─────────────────────────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api/activity',  activityRoutes);
app.use('/api/stats',     statsRoutes);
app.use('/api/videos',    videoRoutes);
app.use('/api/series',    seriesRoutes);

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Vibeflix API is healthy', timeStamp: new Date().toISOString() });
});

// ── Global error handler ───────────────────────────────────────────────────────
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    console.error(err.stack);
    res.status(500).json({
        error: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message,
    });
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));