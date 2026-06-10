import { useState } from 'react'
import { auth } from '../api'
import { useAuth } from '../context/AuthContext'

export default function Account() {
  const { user, login } = useAuth()

  // ── Change username ────────────────────────────────────────────────────────
  const [newUsername,  setNewUsername]  = useState('')
  const [unPw,         setUnPw]         = useState('')
  const [unMsg,        setUnMsg]        = useState(null)
  const [unLoading,    setUnLoading]    = useState(false)

  async function handleUsernameSubmit(e) {
    e.preventDefault()
    setUnMsg(null)
    setUnLoading(true)
    try {
      const res = await auth.changeUsername(newUsername.trim(), unPw)
      // Server re-issues a fresh token with the new username — update the session
      login(res.data.token, res.data.user)
      setUnMsg({ type: 'ok', text: `✓ Username changed to "${res.data.user.username}"` })
      setNewUsername(''); setUnPw('')
    } catch (err) {
      setUnMsg({ type: 'err', text: err.response?.data?.error || 'Failed to change username' })
    } finally {
      setUnLoading(false)
    }
  }

  // ── Change password ────────────────────────────────────────────────────────
  const [current, setCurrent] = useState('')
  const [next,    setNext]    = useState('')
  const [confirm, setConfirm] = useState('')
  const [pwMsg,   setPwMsg]   = useState(null)
  const [pwLoading, setPwLoading] = useState(false)

  async function handlePasswordSubmit(e) {
    e.preventDefault()
    setPwMsg(null)
    if (next !== confirm) return setPwMsg({ type: 'err', text: 'New passwords do not match' })
    setPwLoading(true)
    try {
      await auth.changePassword(current, next)
      setPwMsg({ type: 'ok', text: '✓ Password changed' })
      setCurrent(''); setNext(''); setConfirm('')
    } catch (err) {
      setPwMsg({ type: 'err', text: err.response?.data?.error || 'Failed to change password' })
    } finally {
      setPwLoading(false)
    }
  }

  return (
    <div className="max-w-sm mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Account</h1>
        <p className="text-sm text-gray-400">
          Signed in as <span className="text-fifa-gold font-medium">{user?.username}</span>
        </p>
      </div>

      {/* ── Change username ── */}
      <div className="card">
        <h2 className="font-semibold text-fifa-gold mb-4">Change username</h2>
        <form onSubmit={handleUsernameSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">New username</label>
            <input
              className="input"
              value={newUsername}
              onChange={e => setNewUsername(e.target.value)}
              placeholder={user?.username}
              required
              minLength={2}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Confirm with your password</label>
            <input
              className="input"
              type="password"
              value={unPw}
              onChange={e => setUnPw(e.target.value)}
              required
            />
          </div>
          {unMsg && (
            <p className={`text-sm ${unMsg.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
              {unMsg.text}
            </p>
          )}
          <button className="btn-primary w-full" disabled={unLoading || !newUsername.trim()}>
            {unLoading ? 'Saving…' : 'Update username'}
          </button>
        </form>
      </div>

      {/* ── Change password ── */}
      <div className="card">
        <h2 className="font-semibold text-fifa-gold mb-4">Change password</h2>
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Current password</label>
            <input className="input" type="password" value={current} onChange={e => setCurrent(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">New password</label>
            <input className="input" type="password" value={next} onChange={e => setNext(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Confirm new password</label>
            <input className="input" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
          </div>
          {pwMsg && (
            <p className={`text-sm ${pwMsg.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
              {pwMsg.text}
            </p>
          )}
          <button className="btn-primary w-full" disabled={pwLoading}>
            {pwLoading ? 'Saving…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  )
}
