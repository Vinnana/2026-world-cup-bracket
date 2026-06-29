import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import Navbar from './components/Navbar'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import Account from './pages/Account'
import ScorePicks from './pages/ScorePicks'
import MyBracket from './pages/MyBracket'
import AllPicks from './pages/AllPicks'
import Leaderboard from './pages/Leaderboard'
import OverallLeaderboard from './pages/OverallLeaderboard'
import FAQ from './pages/FAQ'
import Admin from './pages/Admin'
import AllBrackets from './pages/AllBrackets'
import BracketReport from './pages/BracketReport'

function ProtectedRoute({ children, adminOnly }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && !user.is_admin) return <Navigate to="/picks" replace />
  return children
}

function AppRoutes() {
  const { user, loading } = useAuth()
  if (loading) return null

  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/login"          element={user ? <Navigate to="/picks" /> : <Login />} />
        <Route path="/register"       element={user ? <Navigate to="/picks" /> : <Register />} />
        <Route path="/forgot-password" element={user ? <Navigate to="/picks" /> : <ForgotPassword />} />
        <Route path="/account"        element={<ProtectedRoute><Account /></ProtectedRoute>} />
        <Route path="/picks"          element={<ProtectedRoute><ScorePicks /></ProtectedRoute>} />
        <Route path="/bracket"        element={<ProtectedRoute><MyBracket /></ProtectedRoute>} />
        <Route path="/all"            element={<ProtectedRoute><AllPicks /></ProtectedRoute>} />
        <Route path="/leaderboard"    element={<ProtectedRoute><Leaderboard /></ProtectedRoute>} />
        <Route path="/overall"        element={<ProtectedRoute><OverallLeaderboard /></ProtectedRoute>} />
        <Route path="/faq"            element={<ProtectedRoute><FAQ /></ProtectedRoute>} />
        <Route path="/brackets"        element={<ProtectedRoute><AllBrackets /></ProtectedRoute>} />
        <Route path="/bracket-report" element={<ProtectedRoute><BracketReport /></ProtectedRoute>} />
        <Route path="/admin"          element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>} />
        <Route path="*"               element={<Navigate to={user ? '/all' : '/login'} replace />} />
      </Routes>
    </>
  )
}

export default function App() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // When a new SW takes control, reload immediately to pull in fresh assets.
    // Guard flag prevents a double-reload if the injected autoUpdate script also fires.
    let reloading = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return
      reloading = true
      window.location.reload()
    })

    // Proactively ask the SW to check for an update.
    // iOS PWA never does this in the background, so we do it ourselves:
    //   • every time the app comes to the foreground (visibilitychange)
    //   • every 60 s while the app is open
    const checkForUpdate = () => {
      navigator.serviceWorker.getRegistration()
        .then(reg => reg?.update())
        .catch(() => {/* offline — ignore */})
    }

    const onVisible = () => { if (document.visibilityState === 'visible') checkForUpdate() }
    document.addEventListener('visibilitychange', onVisible)
    const interval = setInterval(checkForUpdate, 60_000)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(interval)
    }
  }, [])

  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
