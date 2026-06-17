// API helper — local JWT auth
const API_BASE = import.meta.env.VITE_API_BASE || '/api';

function getToken() {
  return localStorage.getItem('divinity_token');
}

function setToken(token) {
  localStorage.setItem('divinity_token', token);
}

function clearToken() {
  localStorage.removeItem('divinity_token');
  localStorage.removeItem('divinity_user');
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${API_BASE}${path}`, { headers, ...options });

  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

export const api = {
  // Auth
  login: (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  // Leads
  getLeads: (params) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/leads${qs ? '?' + qs : ''}`);
  },
  getLead: (id) => request(`/leads/${id}`),
  createLead: (data) => request('/leads', { method: 'POST', body: JSON.stringify(data) }),
  updateLead: (id, data) => request(`/leads/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteLead: (id) => request(`/leads/${id}`, { method: 'DELETE' }),
  getTransitions: (id) => request(`/leads/${id}/transitions`),
  advanceLead: (id, toStage) => request(`/leads/${id}/advance`, { method: 'POST', body: JSON.stringify({ to_stage: toStage }) }),
  addReminder: (leadId, data) => request(`/leads/${leadId}/reminders`, { method: 'POST', body: JSON.stringify(data) }),

  // Pipeline
  getPipeline: () => request('/pipeline'),
  getToday: () => request('/pipeline/today'),
  getStats: () => request('/pipeline/stats'),

  // Contracts
  getClauses: () => request('/contracts/clauses'),
  getClause: (id) => request(`/contracts/clauses/${id}`),
  generateContract: (data) => request('/contracts/generate', { method: 'POST', body: JSON.stringify(data) }),
  sendRabbitSign: (data) => request('/contracts/send-rabbitsign', { method: 'POST', body: JSON.stringify(data) }),
  getContracts: () => request('/contracts'),

  // Scripts
  getScripts: (category) => request(`/scripts${category ? '?category=' + category : ''}`),
  fillScript: (data) => request('/scripts/fill', { method: 'POST', body: JSON.stringify(data) }),

  // Users
  getMe: () => request('/users/me'),
  updateMe: (data) => request('/users/me', { method: 'PATCH', body: JSON.stringify(data) }),
};

export { getToken, setToken, clearToken };
