import { describe, expect, it } from "vitest";
import request from "supertest";
import {
  hasPermission,
  ROLE_KEYS,
  ROLE_PERMISSIONS,
  PERMISSION_KEYS,
  permissionsForRoles
} from "@orderflow/shared";
import {
  createSessionForRole,
  createTestApp,
  createUserForRole
} from "./support/runtime.js";

describe("Slice 1A permission contract", () => {
  it("1A-04 matches the migrated role permissions and excludes retired keys", async () => {
    const { prisma } = await import("../src/db/prisma.js");
    const roles = await prisma.role.findMany({
      include: { rolePermissions: { include: { permission: true } } }
    });
    const migratedPermissions = Object.fromEntries(
      roles.map((role) => [
        role.id,
        role.rolePermissions.map((grant) => grant.permission.id).sort()
      ])
    );
    const sharedPermissions = Object.fromEntries(
      ROLE_KEYS.map((role) => [role, [...ROLE_PERMISSIONS[role]].sort()])
    );
    expect(migratedPermissions).toEqual(sharedPermissions);
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual(
      [
        "owner",
        "admin",
        "staff_picker_packer",
        "staff_inspector",
        "staff_full",
        "cap_dispatch",
        "cap_delivery",
        "cap_report",
        "cap_order_intake",
        "customer"
      ].sort()
    );
    expect(Object.keys(ROLE_PERMISSIONS)).not.toContain("staff");
    expect(Object.keys(ROLE_PERMISSIONS)).not.toContain("cap_address_update");
    expect(PERMISSION_KEYS).not.toContain("checklist.update");
    expect(roles.map((role) => role.id)).not.toContain("staff");
    expect(roles.map((role) => role.id)).not.toContain("cap_address_update");
    const databasePermissionKeys = await prisma.permission.findMany({
      select: { id: true }
    });
    expect(databasePermissionKeys.map(({ id }) => id).sort()).toEqual(
      [...PERMISSION_KEYS].sort()
    );
  });

  it("1A-12 enforces the PRD permission matrix including default Admin checklist denial", async () => {
    for (const role of ROLE_KEYS) {
      const effectivePermissions = permissionsForRoles([role]);
      for (const permission of PERMISSION_KEYS) {
        const isDisabledAdminChecklistPermission =
          role === "admin" &&
          (permission === "checklist.steps_1_2" ||
            permission === "checklist.steps_3_5");
        expect(hasPermission(effectivePermissions, permission)).toBe(
          ROLE_PERMISSIONS[role].includes(permission) &&
            !isDisabledAdminChecklistPermission
        );
      }
    }
    expect(permissionsForRoles(["admin"])).not.toContain("checklist.steps_1_2");
    expect(permissionsForRoles(["admin"])).not.toContain("checklist.steps_3_5");
    expect(permissionsForRoles(["admin"], true)).toContain(
      "checklist.steps_1_2"
    );
    expect(ROLE_PERMISSIONS.owner).toContain("settings.owner");
    expect(ROLE_PERMISSIONS.admin).not.toContain("settings.owner");

    const app = await createTestApp();
    for (const role of ROLE_KEYS) {
      const session = await createSessionForRole(role);
      const expectedPermissions = permissionsForRoles([role]);
      const responses = await Promise.all(
        PERMISSION_KEYS.map((permission) =>
          request(app)
            .get(`/api/v1/test/permissions/${encodeURIComponent(permission)}`)
            .set("Cookie", session.cookie)
        )
      );
      responses.forEach((response, index) => {
        const permission = PERMISSION_KEYS[index];
        if (!permission) throw new Error("Permission matrix index is invalid.");
        const allowed = expectedPermissions.includes(permission);
        expect(response.status).toBe(allowed ? 200 : 403);
        if (!allowed) {
          expect(response.body.error.code).toBe("FORBIDDEN");
        }
      });
    }
  }, 60_000);

  it("1A-13 refuses assigning customer and staff roles to the same account", async () => {
    const { prisma } = await import("../src/db/prisma.js");
    const { assignRole } = await import("../src/modules/users/service.js");
    const customerId = await createUserForRole("customer");
    const staffId = await createUserForRole("staff_full");

    await expect(assignRole(customerId, "staff_full")).rejects.toMatchObject({
      code: "ROLE_COMBINATION_NOT_ALLOWED"
    });
    await expect(assignRole(staffId, "customer")).rejects.toMatchObject({
      code: "ROLE_COMBINATION_NOT_ALLOWED"
    });
    await prisma.$disconnect();
  });
});
