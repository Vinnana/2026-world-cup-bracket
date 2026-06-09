import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth } from '../api'
import { useAuth } from '../context/AuthContext'

export default function Register() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    if (password !== confirm) return setError('Passwords do not match')
    setError('')
    setLoading(true)
    try {
      const res = await auth.register(username, password)
      login(res.data.token, res.data.user)
      navigate('/bracket')
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🦏 🇳🇵</div>
          <h1 className="text-3xl font-bold text-fifa-gold">Join the Bracket</h1>
          <p className="text-gray-400 mt-2">Create your account to enter picks</p>
        </div>
        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Username</label>
              <input className="input" value={username} onChange={e => setUsername(e.target.value)} required autoFocus />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Password</label>
              <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Confirm Password</label>
              <input className="input" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button className="btn-primary w-full" disabled={loading}>
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>
          <p className="text-center text-sm text-gray-500 mt-4">
            Already have an account?{' '}
            <Link to="/login" className="text-fifa-gold hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
