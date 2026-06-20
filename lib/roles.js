// =============================================
// ROLES.JS — Fuente única de verdad de roles (backend)
// Agregar un rol nuevo = editar SOLO este archivo
// =============================================

// Orden de jerarquía, de menor a mayor poder
export const ROLES = {
  usuario:  { level: 0, label: 'Usuario'  },
  list_mod: { level: 1, label: 'Mod'      },
  admin:    { level: 2, label: 'Admin'    },
  manager:  { level: 3, label: 'Manager'  },
  owner:    { level: 4, label: 'Owner'    },
};

// Grupos de permisos — todo el backend referencia estos grupos, nunca arrays sueltos
export const SANCTIONS_ROLES = ['list_mod', 'admin', 'manager', 'owner']; // gestionar sanciones + panel admin
export const POINTS_ROLES    = ['admin', 'manager', 'owner'];            // editar puntos
export const MANAGER_ROLES   = ['manager', 'owner'];                     // panel manager (antes owner.js)
export const OWNER_ROLES     = ['owner'];                                // exclusivo del owner

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