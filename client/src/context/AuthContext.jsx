import { createContext, useContext, useState, useEffect, useRef } from 'react'

const AuthContext = createContext(null)

// Auto-logout after 4 hours of inactivity (no clicks/keypresses/touches)
const INACTIVITY_MS = 4 * 60 * 60 * 1000

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)
  const timerRef              = useRef(null)

  // ── Restore session on mount ──────────────────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem('wc2026_user')
    if (stored) {
      try { setUser(JSON.parse(stored)) } catch {}
    }
    setLoading(false)
  }, [])

  // ── Inactivity timer ──────────────────────────────────────────────────────
  function resetTimer() {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      // Only fire if user is actually logged in
      if (localStorage.getItem('wc2026_token')) {
        clearSession()
        window.location.href = '/login'
      }
    }, INACTIVITY_MS)
  }

  useEffect(() => {
    if (!user) return  // don't run timer when logged out
    const events = ['click', 'keydown', 'touchstart', 'mousemove', 'scroll']
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }))
    resetTimer()  // start the timer on login
    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer))
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [user])

  // ── Session helpers ───────────────────────────────────────────────────────
  function clearSession() {
    localStorage.removeItem('wc2026_token')
    localStorage.removeItem('wc2026_user')
    setUser(null)
    if (timerRef.current) clearTimeout(timerRef.current)
  }

  function login(token, userData) {
    // Always clear any previous session first — prevents stale state if
    // a different user logs in on the same device without explicit logout
    clearSession()
    localStorage.setItem('wc2026_token', token)
    localStorage.setItem('wc2026_user', JSON.stringify(userData))
    setUser(userData)
  }

  function logout() {
    clearSession()
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
