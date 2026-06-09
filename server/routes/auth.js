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
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
  res.json({ token, user: payload })
})

router.post('/login', async (req, res) => {
  const user = db.getUserByUsername(req.body.username?.trim())
  if (!user) return res.status(401).json({ error: 'Invalid credentials' })
  const valid = await bcrypt.compare(req.body.password, user.password_hash)
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' })
  const payload = { id: user.id, username: user.username, is_admin: user.is_admin }
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
  res.json({ token, user: payload })
})


router.get('/users', (req, res) => {
  res.json(db.getAllUsers().map(u => ({ id: u.id, username: u.username, is_admin: u.is_admin })))
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
