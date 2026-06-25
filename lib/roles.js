// ROLES.JS

export const ROLES = {
  usuario:  { level: 0, label: 'Usuario'  },
  list_mod: { level: 1, label: 'Mod'      },
  admin:    { level: 2, label: 'Admin'    },
  manager:  { level: 3, label: 'Manager'  },
  owner:    { level: 4, label: 'Owner'    },
};

export const SANCTIONS_ROLES        = ['list_mod', 'admin', 'manager', 'owner'];
export const STAFF_SANCTIONS_ROLES  = ['admin', 'manager', 'owner'];
export const POINTS_ROLES           = ['admin', 'manager', 'owner'];
export const MANAGER_ROLES          = ['manager', 'owner'];
export const OWNER_ROLES            = ['owner'];

export function roleLevel(role) {
  return ROLES[role]?.level ?? -1;
}

export function hasRole(userRole, allowedRoles) {
  return allowedRoles.includes(userRole);
}

export function isValidRole(role) {
  return Object.keys(ROLES).includes(role);
}

export function allRoleKeys() {
  return Object.keys(ROLES);
}