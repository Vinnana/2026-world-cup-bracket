import axios from 'axios';

const API_BASE =
  import.meta.env.VITE_API_URL ||
  'https://two026-world-cup-bracket.onrender.com';

const api = axios.create({
  baseURL: `${API_BASE}/api`
});

export const auth = api;
export const brackets = api;
export const tournament = api;
export const admin = api;

api.interceptors.request.use(config => {
  const token = localStorage.getItem('wc2026_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export const auth = {
  register: (username, password) => api.post('/auth/register', { username, password }),
  login: (username, password) => api.post('/auth/login', { username, password }),
  users: () => api.get('/auth/users'),
  changePassword: (current_password, new_password) =>
    api.post('/auth/change-password', { current_password, new_password }),
  requestReset: (username) => api.post('/auth/request-reset', { username }),
}

export const brackets = {
  all: () => api.get('/brackets'),
  my: () => api.get('/brackets/my'),
  save: (picks) => api.post('/brackets', { picks }),
  results: () => api.get('/brackets/results'),
}

export const tournament = {
  data: () => api.get('/tournament'),
}

export const admin = {
  settings: () => api.get('/admin/settings'),
  lock: (locked, lock_time) => api.post('/admin/lock', { locked, lock_time }),
  groupResult: (group, first, second, third, third_advanced) =>
    api.post('/admin/group-result', { group, first, second, third, third_advanced }),
  knockoutResult: (match_id, home_team, away_team, winner, round) =>
    api.post('/admin/knockout-result', { match_id, home_team, away_team, winner, round }),
  deleteResult: (match_id) => api.delete(`/admin/result/${match_id}`),
  users: () => api.get('/admin/users'),
  promote: (user_id) => api.post('/admin/promote', { user_id }),
  setPassword: (user_id, new_password) => api.post('/admin/set-password', { user_id, new_password }),
  setAutoFetch: (enabled) => api.post('/admin/auto-fetch', { enabled }),
  fetchNow: () => api.post('/admin/fetch-now'),
}

export default api
