import jwt from 'jsonwebtoken'
import db from '../database.js'

export const JWT_SECRET = process.env.JWT_SECRET || 'wc2026-bracket-secret-change-in-prod'

export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'No token provided' })
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    // Double-check user still exists in DB with the same username.
    // Prevents stale tokens from matching a newly-created user who happened
    // to get the same numeric ID after a server redeploy / data reset.
    const user = db.getUserById(payload.id)
    if (!user || user.username !== payload.username) {
      return res.status(401).json({ error: 'Session expired — please sign in again' })
    }
    req.user = { id: user.id, username: user.username, is_admin: user.is_admin }
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

// Sets req.user if a valid token is present, but does not require one.
export function optionalAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET)
      const user = db.getUserById(payload.id)
      // Only trust the token if the user still exists with matching username
      if (user && user.username === payload.username) {
        req.user = { id: user.id, username: user.username, is_admin: user.is_admin }
      }
    } catch { /* ignore */ }
  }
  next()
}

export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.user.is_admin) return res.status(403).json({ error: 'Admin only' })
    next()
  })
}
