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
  spawnPokemon: (id) => request(`/leads/${id}/pokemon`, { method: 'POST' }),
  addReminder: (leadId, data) => request(`/leads/${leadId}/reminders`, { method: 'POST', body: JSON.stringify(data) }),

  // Pipeline
  getPipeline: () => request('/pipeline'),
  getToday: () => request('/pipeline/today'),
  getStats: () => request('/pipeline/stats'),
  getProfitRadar: () => request('/pipeline/profit-radar'),

  // Contracts
  getClauses: () => request('/contracts/clauses'),
  getClause: (id) => request(`/contracts/clauses/${id}`),
  generateContract: (data) => request('/contracts/generate', { method: 'POST', body: JSON.stringify(data) }),
  sendRabbitSign: (data) => request('/contracts/send-rabbitsign', { method: 'POST', body: JSON.stringify(data) }),
  getContracts: () => request('/contracts'),

  // Scripts
  getScripts: (category) => request(`/scripts${category ? '?category=' + category : ''}`),
  fillScript: (data) => request('/scripts/fill', { method: 'POST', body: JSON.stringify(data) }),
  getStagePrompt: (leadId, stage) => request(`/scripts/prompts/stage/${leadId}/${stage}`),
  getScriptShortcuts: () => request('/scripts/prompts/shortcuts'),
  fillTemplate: (leadId, shortcut) => request('/scripts/prompts/fill', { method: 'POST', body: JSON.stringify({ lead_id: leadId, shortcut }) }),

  // Users
  getMe: () => request('/users/me'),
  updateMe: (data) => request('/users/me', { method: 'PATCH', body: JSON.stringify(data) }),

  // Calculator
  analyzeDeal: (data) => request('/calculator/analyze', { method: 'POST', body: JSON.stringify(data) }),
  checkBuyBox: (data) => request('/calculator/buybox', { method: 'POST', body: JSON.stringify(data) }),
  getLeadForCalc: (id) => request(`/calculator/lead/${id}`),

  // Training
  getTrainingModules: () => request('/training'),
  getTrainingModule: (id) => request(`/training/${id}`),

  // Pipeline Health
  getPipelineHealth: () => request('/pipeline/health'),

  // Follow-ups
  getFollowUps: (leadId) => request(`/leads/${leadId}/followups`),
  createFollowUp: (leadId, data) => request(`/leads/${leadId}/followups`, { method: 'POST', body: JSON.stringify(data) }),
  completeFollowUp: (leadId, followUpId) => request(`/leads/${leadId}/followups/${followUpId}`, { method: 'PATCH', body: JSON.stringify({ completed: true }) }),

  // Student Roster (admin)
  getStudents: () => request('/users/students'),
  getStudentStats: (id) => request(`/users/students/${id}/stats`),
  getRoster: () => request('/users/roster'),
  getRosterDetail: (id) => request(`/users/roster/${id}`),
  setVacation: (userId, data) => request(`/users/${userId}/vacation`, { method: 'POST', body: JSON.stringify(data) }),
  endVacation: (userId) => request(`/users/${userId}/vacation/end`, { method: 'POST' }),
  reassignLead: (data) => request('/users/reassign', { method: 'POST', body: JSON.stringify(data) }),
  bulkReassign: (data) => request('/users/reassign/bulk', { method: 'POST', body: JSON.stringify(data) }),

  // Google OAuth
  getGoogleAuthUrl: () => request('/auth/google/url'),
  getGoogleStatus: () => request('/auth/google/status'),
  disconnectGoogle: () => request('/auth/google/disconnect', { method: 'POST' }),

  // Admin Dashboard
  getAdminDashboard: () => request('/admin/dashboard'),
};

export { getToken, setToken, clearToken };
