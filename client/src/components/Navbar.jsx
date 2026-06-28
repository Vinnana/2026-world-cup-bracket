import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Logo from './Logo'

const displayName = (u) => u.replace(/@.+$/, '')

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)

  function handleLogout() {
    logout()
    navigate('/login')
    setOpen(false)
  }

  const isActive = (to) => pathname === to

  function DesktopLink({ to, label }) {
    return (
      <Link
        to={to}
        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
          isActive(to) ? 'bg-fifa-gold text-gray-950' : 'text-gray-300 hover:text-white hover:bg-gray-800'
        }`}
      >
        {label}
      </Link>
    )
  }

  function MobileLink({ to, label }) {
    return (
      <Link
        to={to}
        onClick={() => setOpen(false)}
        className={`flex items-center px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
          isActive(to) ? 'bg-fifa-gold text-gray-950' : 'text-gray-200 hover:bg-gray-700'
        }`}
      >
        {label}
      </Link>
    )
  }

  return (
    <nav className="bg-fifa-blue border-b border-gray-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
        <Link to="/" className="flex-shrink-0" onClick={() => setOpen(false)}>
          <Logo />
        </Link>

        {user && (
          <>
            {/* Desktop */}
            <div className="hidden md:flex items-center gap-1 flex-wrap justify-end">
              <DesktopLink to="/picks"          label="⚽ My Picks" />
              <DesktopLink to="/bracket"        label="🏆 My Bracket" />
              <DesktopLink to="/all"            label="All Picks" />
              <DesktopLink to="/brackets"       label="All Brackets" />
              <DesktopLink to="/bracket-report" label="📑 Report" />
              <DesktopLink to="/overall"        label="🏆 Overall LB" />
              <DesktopLink to="/leaderboard"    label="📋 GS LB" />
              <DesktopLink to="/faq"            label="Rules" />
              {!!user.is_admin && <DesktopLink to="/admin" label="⚙ Admin" />}

              <Link
                to="/account"
                title="Account settings"
                className="ml-1 text-sm text-gray-400 hover:text-white flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
              >
                <span aria-hidden className="text-base">⚙️</span>
                <span>{displayName(user.username)}</span>
              </Link>
              <button
                onClick={handleLogout}
                className="text-sm text-gray-500 hover:text-white px-2 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
              >
                Sign out
              </button>
            </div>

            {/* Mobile: pinned links + hamburger */}
            <div className="md:hidden flex items-center gap-1">
              <Link
                to="/all"
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  isActive('/all') ? 'bg-fifa-gold text-gray-950' : 'text-gray-300 hover:text-white hover:bg-gray-800'
                }`}
              >
                All Picks
              </Link>
              <Link
                to="/overall"
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  isActive('/overall') ? 'bg-fifa-gold text-gray-950' : 'text-gray-300 hover:text-white hover:bg-gray-800'
                }`}
              >
                🏆 Overall LB
              </Link>
              <button
                onClick={() => setOpen(v => !v)}
                className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
                aria-label={open ? 'Close menu' : 'Open menu'}
              >
                {open ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Mobile dropdown */}
      {user && open && (
        <div className="md:hidden border-t border-gray-800 bg-fifa-blue px-4 pb-4 pt-2">
          <div className="space-y-0.5">
            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold px-4 pt-3 pb-1">Tournament</p>
            <MobileLink to="/all"            label="📊 All Picks" />
            <MobileLink to="/brackets"       label="🗂 All Brackets" />
            <MobileLink to="/bracket-report" label="📑 Bracket Report" />

            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold px-4 pt-3 pb-1">My Picks</p>
            <MobileLink to="/picks"   label="⚽ My Score Picks" />
            <MobileLink to="/bracket" label="🏆 My Bracket" />

            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold px-4 pt-3 pb-1">Leaderboards</p>
            <MobileLink to="/overall"     label="🏆 Overall Leaderboard" />
            <MobileLink to="/leaderboard" label="📋 Group Stage Leaderboard" />

            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold px-4 pt-3 pb-1">Info</p>
            <MobileLink to="/faq" label="📖 Rules" />
            {!!user.is_admin && <MobileLink to="/admin" label="⚙ Admin" />}
          </div>

          <div className="mt-3 pt-3 border-t border-gray-800 flex items-center justify-between">
            <Link
              to="/account"
              onClick={() => setOpen(false)}
              className="text-sm text-gray-400 hover:text-white flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <span>⚙️</span>
              <span>Account</span>
            </Link>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-white px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}
