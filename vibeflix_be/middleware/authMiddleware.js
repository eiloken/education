/**
 * authenticate   — requires a valid session user (401 otherwise)
 * requireAdmin   — requires role === 'admin' (403 otherwise)
 * optionalAuth   — never blocks; just lets req.user flow through if present
 */

export const authenticate = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!req.user.isActive) return res.status(403).json({ error: 'Account is deactivated' });
    next();
};

export const requireAdmin = (req, res, next) => {
    if (!req.user)                    return res.status(401).json({ error: 'Authentication required' });
    if (req.user.role !== 'admin')    return res.status(403).json({ error: 'Admin access required' });
    next();
};

// eslint-disable-next-line no-unused-vars
export const optionalAuth = (req, res, next) => next();