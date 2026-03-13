import express from 'express';
import UserActivity from '../models/UserActivity.js';

const router = express.Router();

// POST /api/activity/ping
// Called by frontend when user is active (mouse/keyboard events, debounced).
// Rate-limiting is intentionally loose — one ping every ~2 minutes per session is fine.
router.post('/ping', async (req, res) => {
    try {
        const now = new Date();
        await new UserActivity({
            userId:    req.user?._id ?? null,
            sessionId: req.sessionID,
            hour:      now.getHours(),
            date:      now.toISOString().slice(0, 10),
            timestamp: now,
        }).save();
        res.json({ success: true });
    } catch (e) {
        // Non-critical — don't error to the client
        res.json({ success: false });
    }
});

export default router;