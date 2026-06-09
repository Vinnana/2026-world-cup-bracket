import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const link = (to, label) => (
    <Link
      to={to}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        pathname === to
          ? 'bg-fifa-gold text-gray-950'
          : 'text-gray-300 hover:text-white hover:bg-gray-800'
      }`}
    >
      {label}
    </Link>
  )

  return (
    <nav className="bg-fifa-blue border-b border-gray-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-bold text-lg text-fifa-gold">
          🦏 WC 2026 Bracket 🇳🇵
        </Link>
        {user && (
          <div className="flex items-center gap-1 flex-wrap">
            {link('/bracket', 'My Bracket')}
            {link('/all', 'All Brackets')}
            {link('/leaderboard', 'Leaderboard')}
            {link('/faq', 'Rules')}
            {!!user.is_admin && link('/admin', '⚙ Admin')}
            <Link
              to="/account"
              title="Account & password settings"
              className="ml-2 text-sm text-gray-400 hover:text-white flex items-center gap-1"
            >
              <span aria-hidden>⚙️</span>{user.username}
            </Link>
            <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-white">
              Sign out
            </button>
          </div>
        )}
      </div>
    </nav>
  )
}
