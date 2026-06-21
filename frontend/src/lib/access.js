const TEAM_VIEW_ROLES = new Set(['admin', 'closer', 'lead_manager']);
const TEAM_ASSIGN_ROLES = new Set(['admin', 'closer', 'lead_manager']);

const TEAM_VIEW_EMAILS = new Set([
  'montelliscottrei@gmail.com',
  'homewithkaylamauser@gmail.com',
]);

export function canViewTeam(user) {
  return !!user && (TEAM_VIEW_ROLES.has(user.role) || TEAM_VIEW_EMAILS.has(user.email));
}

export function canAssignLeads(user) {
  return !!user && (TEAM_ASSIGN_ROLES.has(user.role) || TEAM_VIEW_EMAILS.has(user.email));
}

export function canManageTeam(user) {
  return !!user && (user.role === 'admin' || user.role === 'lead_manager' || user.email === 'montelliscottrei@gmail.com');
}
