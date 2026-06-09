import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth } from '../api'
import { useAuth } from '../context/AuthContext'
import Logo from '../components/Logo'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await auth.login(username, password)
      login(res.data.token, res.data.user)
      navigate('/bracket')
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-5">
            <Logo />
          </div>
          <h1 className="text-2xl font-black text-white leading-tight">
            2026 FIFA World Cup<br />
            <span className="text-fifa-gold">Score Picks</span>
          </h1>
          <p className="text-gray-400 mt-2 text-sm">Sign in to enter your predictions</p>
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
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button className="btn-primary w-full" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
          <p className="text-center text-sm text-gray-500 mt-4">
            <Link to="/forgot-password" className="text-fifa-gold hover:underline">Forgot password?</Link>
          </p>
          <p className="text-center text-sm text-gray-500 mt-2">
            No account?{' '}
            <Link to="/register" className="text-fifa-gold hover:underline">Register here</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
