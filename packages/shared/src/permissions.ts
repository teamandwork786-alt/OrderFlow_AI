export const ROLE_PERMISSIONS = {
  owner: [
    "orders.read",
    "order.address.read",
    "order.address.update",
    "dispatch.create",
    "delivery.confirm",
    "refund.apply",
    "refund.read",
    "refund.review",
    "order.exception.record",
    "report.view",
    "audit.read",
    "users.manage",
    "system.manage",
    "checklist.steps_1_2",
    "checklist.steps_3_5",
    "orders.create",
    "payment.confirm",
    "order.cancel",
    "products.manage",
    "product.stock.report",
    "product.stock.review",
    "settings.owner"
  ],
  admin: [
    "orders.read",
    "order.address.read",
    "order.address.update",
    "dispatch.create",
    "delivery.confirm",
    "refund.apply",
    "refund.read",
    "refund.review",
    "order.exception.record",
    "report.view",
    "audit.read",
    "users.manage",
    "system.manage",
    "checklist.steps_1_2",
    "checklist.steps_3_5",
    "orders.create",
    "payment.confirm",
    "order.cancel",
    "products.manage",
    "product.stock.report",
    "product.stock.review"
  ],
  staff_picker_packer: [
    "orders.read",
    "order.address.read",
    "checklist.steps_1_2",
    "refund.apply",
    "refund.read",
    "order.exception.record",
    "product.stock.report"
  ],
  staff_inspector: [
    "orders.read",
    "order.address.read",
    "checklist.steps_3_5",
    "refund.apply",
    "refund.read",
    "order.exception.record",
    "product.stock.report"
  ],
  staff_full: [
    "orders.read",
    "order.address.read",
    "checklist.steps_1_2",
    "checklist.steps_3_5",
    "refund.apply",
    "refund.read",
    "order.exception.record",
    "product.stock.report"
  ],
  cap_dispatch: ["dispatch.create"],
  cap_delivery: ["delivery.confirm"],
  cap_report: ["report.view"],
  cap_order_intake: ["orders.create"],
  customer: [
    "customer.order.create",
    "customer.order.read_own",
    "customer.address_request.create"
  ]
} as const;

export type RoleKey = keyof typeof ROLE_PERMISSIONS;
export type PermissionKey = (typeof ROLE_PERMISSIONS)[RoleKey][number];

export const ROLE_KEYS = Object.keys(ROLE_PERMISSIONS) as RoleKey[];
export const PERMISSION_KEYS = [
  ...new Set(Object.values(ROLE_PERMISSIONS).flat())
] as PermissionKey[];

export function permissionsForRoles(
  roles: readonly string[],
  adminCanPerformStaffTasks = false
): PermissionKey[] {
  const permissions = new Set<PermissionKey>();
  for (const role of roles) {
    if (!isRoleKey(role)) continue;
    for (const permission of ROLE_PERMISSIONS[role]) {
      if (
        role === "admin" &&
        !adminCanPerformStaffTasks &&
        (permission === "checklist.steps_1_2" ||
          permission === "checklist.steps_3_5")
      ) {
        continue;
      }
      permissions.add(permission);
    }
  }
  return [...permissions].sort();
}

export function canPerformStep(
  roles: readonly string[],
  step: number,
  adminCanPerformStaffTasks = false
): boolean {
  if (!Number.isInteger(step) || step < 1 || step > 5) return false;
  if (roles.includes("owner")) return true;
  const requiredPermission =
    step <= 2 ? "checklist.steps_1_2" : "checklist.steps_3_5";
  return permissionsForRoles(roles, adminCanPerformStaffTasks).includes(
    requiredPermission
  );
}

export function landingPathForRoles(
  roles: readonly string[]
): "/shop" | "/orders" {
  return roles.includes("customer") ? "/shop" : "/orders";
}

export function isRoleKey(role: string): role is RoleKey {
  return Object.hasOwn(ROLE_PERMISSIONS, role);
}

export function hasPermission(
  permissions: readonly string[],
  permission: string
): boolean {
  return permissions.includes(permission);
}
