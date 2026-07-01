

const ROLE_META = {
  usuario:  { label: 'Usuario',  icon: 'fa-user',       color: '#64748b' },
  list_mod: { label: 'Mod',      icon: 'fa-shield',     color: '#8b5cf6' },
  admin:    { label: 'Admin',    icon: 'fa-shield-alt', color: '#ef4444' },
  manager:  { label: 'Manager',  icon: 'fa-crown',      color: '#a855f7' },
  owner:    { label: 'Owner',    icon: 'fa-crown',      color: '#f59e0b' },
};

const ROLE_ORDER = ['usuario', 'list_mod', 'admin', 'manager', 'owner'];

const SANCTIONS_ROLES       = ['list_mod', 'admin', 'manager', 'owner'];
const STAFF_SANCTIONS_ROLES = ['admin', 'manager', 'owner'];
const MANAGER_ROLES         = ['manager', 'owner'];
const OWNER_ROLES           = ['owner'];

function getRoleMeta(role) {
  return ROLE_META[role] || ROLE_META.usuario;
}

function userHasRole(role, allowedRoles) {
  return allowedRoles.includes(role);
}

function isAdminRole(role)            { return userHasRole(role, SANCTIONS_ROLES); }
function isSanctionsStaffRole(role)    { return userHasRole(role, STAFF_SANCTIONS_ROLES); }
function isManagerRole(role)          { return userHasRole(role, MANAGER_ROLES); }
function isOwnerRole(role)            { return userHasRole(role, OWNER_ROLES); }

window.ROLE_META             = ROLE_META;
window.ROLE_ORDER            = ROLE_ORDER;
window.SANCTIONS_ROLES       = SANCTIONS_ROLES;
window.STAFF_SANCTIONS_ROLES = STAFF_SANCTIONS_ROLES;
window.MANAGER_ROLES         = MANAGER_ROLES;
window.OWNER_ROLES           = OWNER_ROLES;
window.getRoleMeta           = getRoleMeta;
window.isAdminRole           = isAdminRole;
window.isSanctionsStaffRole  = isSanctionsStaffRole;
window.isManagerRole         = isManagerRole;
window.isOwnerRole           = isOwnerRole;