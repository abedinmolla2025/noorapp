const ADMIN_ROLES = new Set(["admin", "super_admin"]);

export function hasAdminAccess(userId: string | null | undefined, roles: readonly string[]): boolean {
  return Boolean(userId && roles.some((role) => ADMIN_ROLES.has(role)));
}

export function hasSuperAdminAccess(userId: string | null | undefined, roles: readonly string[]): boolean {
  return Boolean(userId && roles.includes("super_admin"));
}
