import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Navbar from './components/Navbar'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import Account from './pages/Account'
import MyBracket from './pages/MyBracket'
import AllBrackets from './pages/AllBrackets'
import Leaderboard from './pages/Leaderboard'
import FAQ from './pages/FAQ'
import Admin from './pages/Admin'

function ProtectedRoute({ children, adminOnly }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && !user.is_admin) return <Navigate to="/bracket" replace />
  return children
}

function AppRoutes() {
  const { user, loading } = useAuth()
  if (loading) return null

  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/bracket" /> : <Login />} />
        <Route path="/register" element={user ? <Navigate to="/bracket" /> : <Register />} />
        <Route path="/forgot-password" element={user ? <Navigate to="/bracket" /> : <ForgotPassword />} />
        <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
        <Route path="/bracket" element={<ProtectedRoute><MyBracket /></ProtectedRoute>} />
        <Route path="/all" element={<ProtectedRoute><AllBrackets /></ProtectedRoute>} />
        <Route path="/leaderboard" element={<ProtectedRoute><Leaderboard /></ProtectedRoute>} />
        <Route path="/faq" element={<ProtectedRoute><FAQ /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to={user ? '/leaderboard' : '/login'} replace />} />
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
