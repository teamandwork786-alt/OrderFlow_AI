/** Permission keys and seeded roles (architecture section 12). Mirrors migration 0002_reference_data. */

export const PERMISSIONS = [
  'orders.read',
  'order.address.read',
  'order.address.update',
  'checklist.update',
  'dispatch.create',
  'delivery.confirm',
  'refund.apply',
  'refund.read',
  'refund.review',
  'order.exception.record',
  'report.view',
  'audit.read',
  'users.manage',
  'system.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: PERMISSIONS,
  staff: ['orders.read', 'order.address.read', 'checklist.update', 'refund.apply', 'refund.read'],
  cap_dispatch: ['dispatch.create'],
  cap_delivery: ['delivery.confirm'],
  cap_report: ['report.view'],
  cap_address_update: ['order.address.update'],
};

/** Effective permissions are the union of the user's roles. A user with no roles has none. */
export function effectivePermissions(roleKeys: readonly string[]): Set<Permission> {
  const out = new Set<Permission>();
  for (const key of roleKeys) for (const p of ROLE_PERMISSIONS[key] ?? []) out.add(p);
  return out;
}

export function hasPermission(roleKeys: readonly string[], permission: Permission): boolean {
  return effectivePermissions(roleKeys).has(permission);
}

/** Only an owner may grant or revoke the owner role (enforced in the service, not only the UI). */
export function canChangeRole(actorRoleKeys: readonly string[], targetRoleKey: string): boolean {
  if (!hasPermission(actorRoleKeys, 'users.manage')) return false;
  return targetRoleKey !== 'owner' || actorRoleKeys.includes('owner');
}
