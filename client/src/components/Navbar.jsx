import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Logo from './Logo'

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
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
        {/* Logo */}
        <Link to="/" className="flex-shrink-0">
          <Logo />
        </Link>

        {user && (
          <div className="flex items-center gap-1 flex-wrap justify-end">
            {link('/picks', '⚽ My Picks')}
            {link('/all', 'All Picks')}
            {link('/leaderboard', 'Leaderboard')}
            {link('/faq', 'Rules')}
            {!!user.is_admin && link('/admin', '⚙ Admin')}

            {/* Account link */}
            <Link
              to="/account"
              title="Account & password settings"
              className="ml-1 text-sm text-gray-400 hover:text-white flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <span aria-hidden className="text-base">⚙️</span>
              <span>{user.username}</span>
            </Link>

            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-white px-2 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </nav>
  )
}
