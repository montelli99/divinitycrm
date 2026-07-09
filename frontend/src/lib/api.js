// API helper — local JWT auth
const API_BASE = 'https://divinitycrm-ggi5.onrender.com/api';

function getToken() {
  try {
    return localStorage.getItem('divinity_token');
  } catch (e) {
    return null;
  }
}

function setToken(token) {
  try {
    localStorage.setItem('divinity_token', token);
  } catch (e) {
    console.warn('localStorage write failed', e.message);
  }
}

function setUser(user) {
  try {
    localStorage.setItem('divinity_user', JSON.stringify(user));
  } catch (e) {
    console.warn('localStorage write failed', e.message);
  }
}

function clearToken() {
  try {
    localStorage.removeItem('divinity_token');
    localStorage.removeItem('divinity_user');
  } catch (e) {}
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
  login: async (email, password) => {
    const result = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    setToken(result.token);
    setUser(result.user);
    return result;
  },

  // Leads
  getLeads: (params) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/leads${qs ? '?' + qs : ''}`);
  },
  getLead: (id) => request(`/leads/${id}`),
  createLead: (data) => request('/leads', { method: 'POST', body: JSON.stringify(data) }),
  importLeads: (data) => request('/leads/import', { method: 'POST', body: JSON.stringify(data) }),
  updateLead: (id, data) => request(`/leads/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteLead: (id) => request(`/leads/${id}`, { method: 'DELETE' }),
  getTransitions: (id) => request(`/leads/${id}/transitions`),
  advanceLead: (id, toStage) => request(`/leads/${id}/advance`, { method: 'POST', body: JSON.stringify({ to_stage: toStage }) }),
  spawnPokemon: (id) => request(`/leads/${id}/pokemon`, { method: 'POST' }),
  addReminder: (leadId, data) => request(`/leads/${leadId}/reminders`, { method: 'POST', body: JSON.stringify(data) }),

  // Pipeline
  getPipeline: (filter) => request(filter ? `/pipeline?filter=${encodeURIComponent(filter)}` : '/pipeline'),
  getToday: () => request('/pipeline/today'),
  getStats: () => request('/pipeline/stats'),
  getProfitRadar: () => request('/pipeline/profit-radar'),

  // Contracts
  getClauses: () => request('/contracts/clauses'),
  getClause: (id) => request(`/contracts/clauses/${id}`),
  generateContract: (data) => request('/contracts/generate', { method: 'POST', body: JSON.stringify(data) }),
  getContractTemplates: () => request('/contracts/templates'),
  getContractTemplate: (id) => request(`/contracts/templates/${id}`),
  generateContractFromTemplate: (data) => request('/contracts/generate-from-template', { method: 'POST', body: JSON.stringify(data) }),
  getContract: (id) => request(`/contracts/${id}`),
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
  getUnderwritingHistory: (leadId) => request(`/calculator/history${leadId ? `?leadId=${encodeURIComponent(leadId)}` : ''}`),
  checkBuyBox: (data) => request('/calculator/buybox', { method: 'POST', body: JSON.stringify(data) }),
  getLeadForCalc: (id) => request(`/calculator/lead/${id}`),
  calculateClosingCosts: (data) => request('/calculator/closing-costs', { method: 'POST', body: JSON.stringify(data) }),
  getStateFees: (state) => request(`/calculator/closing-costs/state-fees${state ? `?state=${encodeURIComponent(state)}` : ''}`),
  analyzeMidTerm: (data) => request('/calculator/midterm', { method: 'POST', body: JSON.stringify(data) }),
  analyzeMidTermForLead: (id) => request(`/calculator/midterm/lead/${id}`, { method: 'POST' }),
  getMidTermMarkets: (city) => request(`/calculator/midterm/markets${city ? `?city=${encodeURIComponent(city)}` : ''}`),
  analyzeDoc: (data) => request('/calculator/doc-analyze', { method: 'POST', body: JSON.stringify(data) }),
  quickBuyBoxForLead: (id) => request(`/calculator/buybox-check/${id}`, { method: 'POST' }),
  analyzeRentRoll: (data) => request('/calculator/rentroll-analyze', { method: 'POST', body: JSON.stringify(data) }),
  analyzePL: (data) => request('/calculator/pl-analyze', { method: 'POST', body: JSON.stringify(data) }),
  analyzeTax: (data) => request('/calculator/tax-analyze', { method: 'POST', body: JSON.stringify(data) }),

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
  getTeamDashboard: () => request('/admin/dashboard'),

  // Notifications
  getNotifications: (filter = 'all') => request(`/notifications?filter=${filter}`),
  getUnreadCount: () => request('/notifications/unread-count'),
  markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () => request('/notifications/read-all', { method: 'POST' }),
  archiveNotification: (id) => request(`/notifications/${id}/archive`, { method: 'POST' }),

  // Training Docs (underwriting, handoff, stages)
  getUnderwritingDocs: () => request('/training-docs/underwriting'),
  getHandoffDocs: () => request('/training-docs/handoff'),
  getStageDocs: () => request('/training-docs/stages'),

  // Teleprompter
  markTeleprompterSent: (data) => request('/teleprompter/mark-sent', { method: 'POST', body: JSON.stringify(data) }),
};

export { getToken, setToken, clearToken };
