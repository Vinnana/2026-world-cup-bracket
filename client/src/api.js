import axios from 'axios';

const API_BASE =
  import.meta.env.VITE_API_URL ||
  'https://two026-world-cup-bracket.onrender.com';

const api = axios.create({
  baseURL: `${API_BASE}/api`
});

// Attach token automatically
api.interceptors.request.use(config => {
  const token = localStorage.getItem('wc2026_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-logout on 401 — stale/invalid token means the session is dead.
// Don't intercept 401s from login/register (those are wrong-password errors, not session issues).
api.interceptors.response.use(
  res => res,
  err => {
    const url = err.config?.url || '';
    const isAuthCall = url.includes('/auth/login') || url.includes('/auth/register');
    if (err.response?.status === 401 && !isAuthCall && localStorage.getItem('wc2026_token')) {
      localStorage.removeItem('wc2026_token');
      localStorage.removeItem('wc2026_user');
      // Full reload clears all React state and sends user to login
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

/* ---------------- AUTH ---------------- */
export const auth = {
  register: (username, password) =>
    api.post('/auth/register', { username, password }),

  login: (username, password) =>
    api.post('/auth/login', { username, password }),

  admins: () => api.get('/auth/admins'),

  changePassword: (current_password, new_password) =>
    api.post('/auth/change-password', { current_password, new_password }),

  changeUsername: (new_username, password) =>
    api.post('/auth/change-username', { new_username, password }),

  requestReset: (username) =>
    api.post('/auth/request-reset', { username }),
};

/* ---------------- BRACKETS ---------------- */
export const brackets = {
  all: () => api.get('/brackets'),
  my: () => api.get('/brackets/my'),
  save: (picks) => api.post('/brackets', { picks }),
  results: () => api.get('/brackets/results'),
};

/* ---------------- TOURNAMENT ---------------- */
export const tournament = {
  data: () => api.get('/tournament'),
}

/* ---------------- SCORE PICKS ---------------- */
export const picks = {
  /** User's own picks + annotations */
  my: () => api.get('/picks/my'),
  /** Save/update picks. picks = [{ match_id, home_goals, away_goals }] */
  save: (picksArr) => api.post('/picks', { picks: picksArr }),
  /** All matches with results map */
  matches: () => api.get('/picks/matches'),
  /** Score-based leaderboard */
  leaderboard: () => api.get('/picks/leaderboard'),
  /** All users' picks (visible once locked or if admin) */
  all: () => api.get('/picks/all'),
  /** Clear the current user's own picks (only while picks are open) */
  clearMine: () => api.delete('/picks/my'),
  /** Delete a single score pick by match_id */
  deletePick: (match_id) => api.delete(`/picks/my/${match_id}`),
};

/* ---------------- LIVE SCORES ---------------- */
// Proxied through our server (avoids CORS + 45-second cache)
export const liveScores = {
  get: () => api.get('/live'),
}

/* ---------------- ADMIN ---------------- */
export const admin = {
  settings: () => api.get('/admin/settings'),
  lock: (locked, lock_time) =>
    api.post('/admin/lock', { locked, lock_time }),

  groupResult: (group, first, second, third, third_advanced) =>
    api.post('/admin/group-result', {
      group,
      first,
      second,
      third,
      third_advanced
    }),

  knockoutResult: (match_id, home_team, away_team, winner, round) =>
    api.post('/admin/knockout-result', {
      match_id,
      home_team,
      away_team,
      winner,
      round
    }),

  deleteResult: (match_id) =>
    api.delete(`/admin/result/${match_id}`),

  users: () => api.get('/admin/users'),

  promote: (user_id) =>
    api.post('/admin/promote', { user_id }),

  setPassword: (user_id, new_password) =>
    api.post('/admin/set-password', { user_id, new_password }),

  setAutoFetch: (enabled) =>
    api.post('/admin/auto-fetch', { enabled }),

  fetchNow: () =>
    api.post('/admin/fetch-now'),

  /* Score-prediction admin */
  matchScore: (match_id, home_goals, away_goals, home_team, away_team) =>
    api.post('/admin/match-score', { match_id, home_goals, away_goals, home_team, away_team }),

  deleteMatchScore: (match_id) =>
    api.delete(`/admin/match-score/${match_id}`),

  matchScores: () =>
    api.get('/admin/match-scores'),

  picksLock: (locked, lock_time) =>
    api.post('/admin/picks-lock', { locked, lock_time }),

  /** Save/clear the auto-lock schedule without immediately locking */
  picksSchedule: (lock_time) =>
    api.post('/admin/picks-lock-schedule', { lock_time }),

  knockoutOpen: (open) =>
    api.post('/admin/knockout-open', { open }),

  knockoutLock: (locked, lock_time) =>
    api.post('/admin/knockout-lock', { locked, lock_time }),

  /** Save/clear the knockout auto-lock schedule without immediately locking */
  knockoutSchedule: (lock_time) =>
    api.post('/admin/knockout-lock-schedule', { lock_time }),

  report: () =>
    api.get('/admin/report'),

  clearUserPicks: (user_id) =>
    api.delete(`/admin/user-picks/${user_id}`),

  /** Get a user's score picks + bracket picks */
  getUserPicks: (user_id) =>
    api.get(`/admin/user-picks/${user_id}`),

  /** Upsert one score pick for a user */
  setUserScorePick: (user_id, match_id, home_goals, away_goals) =>
    api.post(`/admin/user-picks/${user_id}/score`, { match_id, home_goals, away_goals }),

  /** Delete one score pick for a user */
  deleteUserScorePick: (user_id, match_id) =>
    api.delete(`/admin/user-picks/${user_id}/score/${match_id}`),

  /** Save a user's full bracket (bypasses lock) */
  setUserBracket: (user_id, picks) =>
    api.post(`/admin/user-bracket/${user_id}`, { picks }),

  deleteUser: (user_id) =>
    api.delete(`/admin/users/${user_id}`),

  createUser: (username, password) =>
    api.post('/admin/create-user', { username, password }),
};

export default api;