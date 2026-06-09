import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { auth } from '../api'

export default function ForgotPassword() {
  const [username, setUsername] = useState('')
  const [admins, setAdmins] = useState([])
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    auth.users()
      .then(res => setAdmins(res.data.filter(u => u.is_admin).map(u => u.username)))
      .catch(() => {})
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    try {
      await auth.requestReset(username)
      setSubmitted(true)
    } finally {
      setLoading(false)
    }
  }

  const adminLabel = admins.length
    ? `your admin (${admins.join(', ')})`
    : 'your admin'

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🔑</div>
          <h1 className="text-3xl font-bold text-fifa-gold">Forgot Password</h1>
        </div>
        <div className="card">
          {submitted ? (
            <div className="text-center space-y-4">
              <p className="text-green-400 text-sm">✓ Reset request sent.</p>
              <p className="text-gray-300 text-sm">
                Ask <span className="font-semibold text-white">{adminLabel}</span> to set a new
                password for you. They’ll see your request in the admin panel and share a new
                password with you directly.
              </p>
              <Link to="/login" className="btn-primary inline-block">Back to Sign In</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-gray-400">
                Enter your username and we’ll flag it for {adminLabel} to reset.
              </p>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Username</label>
                <input className="input" value={username} onChange={e => setUsername(e.target.value)} required autoFocus />
              </div>
              <button className="btn-primary w-full" disabled={loading || !username.trim()}>
                {loading ? 'Sending…' : 'Request password reset'}
              </button>
              <p className="text-center text-sm text-gray-500">
                <Link to="/login" className="text-fifa-gold hover:underline">Back to Sign In</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
