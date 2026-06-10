import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import db from '../database.js'
import { JWT_SECRET, requireAuth } from '../middleware/auth.js'

const router = Router()

router.post('/register', async (req, res) => {
  const { username, password } = req.body
  if (!username?.trim() || !password) {
    return res.status(400).json({ error: 'Username and password required' })
  }
  if (db.getUserByUsername(username.trim())) {
    return res.status(409).json({ error: 'Username already taken' })
  }
  const password_hash = await bcrypt.hash(password, 10)
  const user = db.createUser({ username: username.trim(), password_hash })
  const payload = { id: user.id, username: user.username, is_admin: user.is_admin }
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' })
  res.json({ token, user: payload })
})

router.post('/login', async (req, res) => {
  const user = db.getUserByUsername(req.body.username?.trim())
  if (!user) return res.status(401).json({ error: 'Invalid credentials' })
  const valid = await bcrypt.compare(req.body.password, user.password_hash)
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' })
  const payload = { id: user.id, username: user.username, is_admin: user.is_admin }
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' })
  res.json({ token, user: payload })
})


// Returns only admin usernames — used by the forgot-password page so users
// know who to contact. Does NOT expose the full user list or non-admin accounts.
router.get('/admins', (req, res) => {
  res.json(
    db.getAllUsers()
      .filter(u => u.is_admin)
      .map(u => ({ username: u.username }))
  )
})

// Change your own username (must supply current password to confirm identity).
router.post('/change-username', requireAuth, async (req, res) => {
  const { new_username, password } = req.body
  if (!new_username?.trim()) return res.status(400).json({ error: 'New username is required' })
  if (!password) return res.status(400).json({ error: 'Password is required to confirm identity' })

  const trimmed = new_username.trim()
  if (trimmed.length < 2) return res.status(400).json({ error: 'Username must be at least 2 characters' })
  if (!/^[a-zA-Z0-9_. -]+$/.test(trimmed)) {
    return res.status(400).json({ error: 'Username can only contain letters, numbers, spaces, . _ -' })
  }

  // Check not already taken (case-insensitive)
  const existing = db.getAllUsers().find(
    u => u.username.toLowerCase() === trimmed.toLowerCase() && u.id !== req.user.id
  )
  if (existing) return res.status(409).json({ error: 'Username already taken' })

  const user = db.getUserById(req.user.id)
  if (!user) return res.status(404).json({ error: 'User not found' })

  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) return res.status(401).json({ error: 'Incorrect password' })

  db.changeUsername(req.user.id, trimmed)

  // Re-issue token with updated username so session stays valid
  const payload = { id: user.id, username: trimmed, is_admin: user.is_admin }
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' })
  res.json({ success: true, token, user: payload })
})

// Change your own password (must supply current password).
router.post('/change-password', requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Current and new password required' })
  }
  if (String(new_password).length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters' })
  }
  const user = db.getUserById(req.user.id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  const valid = await bcrypt.compare(current_password, user.password_hash)
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' })
  db.setPassword(user.id, await bcrypt.hash(new_password, 10))
  res.json({ success: true })
})

// Locked-out user flags that they need an admin to reset their password.
// Always responds success so usernames can't be probed.
router.post('/request-reset', (req, res) => {
  const username = req.body.username?.trim()
  if (username) db.requestReset(username)
  res.json({ success: true })
})

export default router
