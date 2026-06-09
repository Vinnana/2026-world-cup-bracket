import { useState } from 'react'
import { auth } from '../api'
import { useAuth } from '../context/AuthContext'

export default function Account() {
  const { user } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState(null) // { type: 'ok'|'err', text }
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setMsg(null)
    if (next !== confirm) return setMsg({ type: 'err', text: 'New passwords do not match' })
    setLoading(true)
    try {
      await auth.changePassword(current, next)
      setMsg({ type: 'ok', text: '✓ Password changed' })
      setCurrent(''); setNext(''); setConfirm('')
    } catch (err) {
      setMsg({ type: 'err', text: err.response?.data?.error || 'Failed to change password' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-sm mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-1">Account</h1>
      <p className="text-sm text-gray-400 mb-6">Signed in as <span className="text-fifa-gold font-medium">{user?.username}</span></p>

      <div className="card">
        <h2 className="font-semibold text-fifa-gold mb-4">Change password</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
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
          {msg && (
            <p className={`text-sm ${msg.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>{msg.text}</p>
          )}
          <button className="btn-primary w-full" disabled={loading}>
            {loading ? 'Saving…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  )
}
