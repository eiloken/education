import express        from 'express';
import crypto         from 'crypto';
import User           from '../models/User.js';
import UserRequest    from '../models/UserRequest.js';
import { authenticate, requireAdmin } from '../middleware/authMiddleware.js';
import { sendApprovalEmail, sendRejectionEmail } from '../config/mailer.js';

const router = express.Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generates a readable temporary password: e.g. "Kx7#mP2@" */
function generateTempPassword(length = 12) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
    return Array.from(crypto.randomBytes(length))
        .map(b => chars[b % chars.length])
        .join('');
}

const STRONG_PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get('/me', (req, res) => {
    if (!req.user) return res.json({ user: null });
    const { password, ...safe } = req.user;  // never expose hash
    res.json({ user: safe });
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password)
            return res.status(400).json({ error: 'Username and password are required' });

        const user = await User.findOne({ username: username.toLowerCase().trim() });
        if (!user || !user.comparePassword(password))
            return res.status(401).json({ error: 'Invalid username or password' });

        if (!user.isActive)
            return res.status(403).json({ error: 'Account has been deactivated' });

        // Regenerate session to prevent fixation
        req.session.regenerate((err) => {
            if (err) return res.status(500).json({ error: 'Session error' });
            req.session.userId = user._id.toString();
            req.session.save((err2) => {
                if (err2) return res.status(500).json({ error: 'Session save error' });
                const { password: _pw, ...safe } = user.toObject();
                res.json({ user: safe, requirePasswordChange: user.requirePasswordChange });
            });
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
});

// ─── POST /api/auth/change-password  (must be logged in) ─────────────────────
router.post('/change-password', authenticate, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword)
            return res.status(400).json({ error: 'Both currentPassword and newPassword are required' });

        if (!STRONG_PASSWORD_RE.test(newPassword))
            return res.status(400).json({
                error: 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character',
            });

        const user = await User.findById(req.user._id);
        if (!await user.comparePassword(currentPassword))
            return res.status(401).json({ error: 'Current password is incorrect' });

        user.password = newPassword;          // pre-save hook re-hashes
        user.requirePasswordChange = false;
        await user.save();

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── POST /api/auth/request  (public: submit account request) ─────────────────
router.post('/request', async (req, res) => {
    try {
        const { username, email, reason } = req.body;

        if (!username || !email || !reason)
            return res.status(400).json({ error: 'username, email, and reason are required' });

        if (!/^[a-zA-Z0-9_]{3,30}$/.test(username))
            return res.status(400).json({ error: 'Username must be 3–30 alphanumeric characters or underscores' });

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
            return res.status(400).json({ error: 'Invalid email address' });

        if (reason.trim().length < 10)
            return res.status(400).json({ error: 'Please provide a meaningful reason (at least 10 characters)' });

        // Check for conflicts in both users and pending requests
        const [existingUser, existingRequest] = await Promise.all([
            User.findOne({ $or: [{ username: username.toLowerCase() }, { email: email.toLowerCase() }] }),
            UserRequest.findOne({ $or: [{ username: username.toLowerCase() }, { email: email.toLowerCase() }] }),
        ]);

        if (existingUser)
            return res.status(409).json({ error: 'Username or email is already registered' });

        if (existingRequest)
            return res.status(409).json({ error: 'A request with this username or email is already pending' });

        await new UserRequest({ username, email, reason }).save();
        res.json({ success: true, message: 'Your request has been submitted. You will receive an email if approved.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── GET /api/auth/requests  (admin: list requests) ───────────────────────────
router.get('/requests', authenticate, requireAdmin, async (req, res) => {
    try {
        const { status = 'pending', page = 1, limit = 50 } = req.query;
        const query = status === 'all' ? {} : { status };
        const skip  = (parseInt(page) - 1) * parseInt(limit);

        const [requests, total] = await Promise.all([
            UserRequest.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
            UserRequest.countDocuments(query),
        ]);

        res.json({ requests, total, totalPages: Math.ceil(total / parseInt(limit)) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── POST /api/auth/requests/:id/approve  (admin) ─────────────────────────────
router.post('/requests/:id/approve', authenticate, requireAdmin, async (req, res) => {
    try {
        const request = await UserRequest.findById(req.params.id);
        if (!request)           return res.status(404).json({ error: 'Request not found' });
        if (request.status !== 'pending')
            return res.status(400).json({ error: `Request is already ${request.status}` });

        // Re-check for conflicts (username/email may have been taken while request was pending)
        const conflict = await User.findOne({
            $or: [{ username: request.username }, { email: request.email }]
        });
        if (conflict)
            return res.status(409).json({ error: 'Username or email is already taken by an existing account' });

        const tempPassword = generateTempPassword();

        // Create user with temp password — pre-save hook hashes it
        await new User({
            username: request.username,
            email:    request.email,
            password: tempPassword,          // plain here; hashed by pre-save
            requirePasswordChange: true,
        }).save();

        request.status = 'approved';
        await request.save();

        // Fire-and-forget email (don't fail the response if mail is misconfigured)
        sendApprovalEmail(request.email, request.username, tempPassword)
            .catch(err => console.error('Approval email failed:', err));

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── POST /api/auth/requests/:id/reject  (admin) ──────────────────────────────
router.post('/requests/:id/reject', authenticate, requireAdmin, async (req, res) => {
    try {
        const request = await UserRequest.findById(req.params.id);
        if (!request)           return res.status(404).json({ error: 'Request not found' });
        if (request.status !== 'pending')
            return res.status(400).json({ error: `Request is already ${request.status}` });

        request.status = 'rejected';
        await request.save();

        sendRejectionEmail(request.email, request.username)
            .catch(err => console.error('Rejection email failed:', err));

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── GET /api/auth/users  (admin: list accounts) ──────────────────────────────
router.get('/users', authenticate, requireAdmin, async (req, res) => {
    try {
        const users = await User.find({}, '-password -__v').sort({ createdAt: -1 });
        res.json({ users });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── PATCH /api/auth/users/:id/role  (admin) ──────────────────────────────────
router.patch('/users/:id/role', authenticate, requireAdmin, async (req, res) => {
    try {
        const { role } = req.body;
        if (!['admin', 'user'].includes(role))
            return res.status(400).json({ error: 'Invalid role' });
        if (req.params.id === req.user._id.toString())
            return res.status(400).json({ error: 'Cannot change your own role' });

        const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true, select: '-password' });
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ success: true, user });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── PATCH /api/auth/users/:id/active  (admin: deactivate / reactivate) ───────
router.patch('/users/:id/active', authenticate, requireAdmin, async (req, res) => {
    try {
        const { isActive } = req.body;
        if (typeof isActive !== 'boolean')
            return res.status(400).json({ error: 'isActive must be a boolean' });
        if (req.params.id === req.user._id.toString())
            return res.status(400).json({ error: 'Cannot deactivate your own account' });

        const user = await User.findByIdAndUpdate(req.params.id, { isActive }, { new: true, select: '-password' });
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ success: true, user });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;