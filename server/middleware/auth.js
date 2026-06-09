import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'wc2026-bracket-secret-change-in-prod'

export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'No token provided' })
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

// Sets req.user if a valid token is present, but does not require one.
export function optionalAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]
  if (token) {
    try { req.user = jwt.verify(token, JWT_SECRET) } catch { /* ignore */ }
  }
  next()
}

export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.user.is_admin) return res.status(403).json({ error: 'Admin only' })
    next()
  })
}

export { JWT_SECRET }
