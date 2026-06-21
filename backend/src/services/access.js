const TEAM_VIEW_ROLES = new Set(['admin', 'closer', 'lead_manager']);
const TEAM_ASSIGN_ROLES = new Set(['admin', 'closer', 'lead_manager']);
const TEAM_MANAGE_ROLES = new Set(['admin', 'lead_manager']);

const TEAM_VIEW_EMAILS = new Set([
  'montelliscottrei@gmail.com',
  'homewithkaylamauser@gmail.com',
]);

function isTeamViewer({ role, email } = {}) {
  return TEAM_VIEW_ROLES.has(role) || TEAM_VIEW_EMAILS.has(email);
}

function canAssignLeads({ role, email } = {}) {
  return TEAM_ASSIGN_ROLES.has(role) || TEAM_VIEW_EMAILS.has(email);
}

function canManageTeam({ role, email } = {}) {
  return TEAM_MANAGE_ROLES.has(role) || email === 'montelliscottrei@gmail.com';
}

module.exports = {
  TEAM_VIEW_ROLES,
  TEAM_ASSIGN_ROLES,
  TEAM_MANAGE_ROLES,
  TEAM_VIEW_EMAILS,
  isTeamViewer,
  canAssignLeads,
  canManageTeam,
};
