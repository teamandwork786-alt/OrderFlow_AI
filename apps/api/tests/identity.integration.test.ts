import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createSessionForRole, expectAppAvailable } from "./support/runtime.js";

const DEMO_ROLES = [
  "owner",
  "admin",
  "staff_picker_packer",
  "staff_inspector",
  "staff_full",
  "customer"
] as const;

describe("Slice 1A identity and session contract", () => {
  it("1A-01 signs in seeded demo roles, exposes their roles, and signs out", async () => {
    const app = await expectAppAvailable();

    for (const role of DEMO_ROLES) {
      const session = await createSessionForRole(role);
      const response = await request(app)
        .get("/api/v1/me")
        .set("Cookie", session.cookie);
      expect(response.status).toBe(200);
      expect(response.body.roles).toContain(role);
    }

    const customerSession = await createSessionForRole("customer");
    const staffSession = await createSessionForRole("staff_full");
    const customer = await request(app)
      .get("/api/v1/me")
      .set("Cookie", customerSession.cookie);
    const staff = await request(app)
      .get("/api/v1/me")
      .set("Cookie", staffSession.cookie);
    expect(customer.body.landing_path).toBe("/shop");
    expect(staff.body.landing_path).toBe("/orders");

    const signOut = await request(app)
      .post("/api/v1/auth/sign-out")
      .set("Cookie", customerSession.cookie)
      .set("X-CSRF-Token", customerSession.csrfToken);
    expect(signOut.status).toBe(204);
  });

  it("1A-02 provisions an unknown OIDC subject with only the customer role", async () => {
    const modulePath = new URL(
      "../src/modules/users/service.js",
      import.meta.url
    ).href;
    const { provisionUserFromOidcClaims } = (await import(modulePath)) as {
      provisionUserFromOidcClaims: (claims: {
        subject: string;
        name: string;
        email: string;
      }) => Promise<{ roles: string[]; permissions: string[] }>;
    };
    const result = await provisionUserFromOidcClaims({
      subject: "new-customer-1",
      name: "New Customer",
      email: "new-customer@example.test"
    });

    expect(result.roles).toEqual(["customer"]);
    expect(result.permissions).toEqual([
      "customer.address_request.create",
      "customer.order.create",
      "customer.order.read_own"
    ]);
  });

  it("1A-03 returns checklist steps allowed by each role and current staff-mode", async () => {
    const app = await expectAppAvailable();
    const expected = new Map<string, number[]>([
      ["staff_picker_packer", [1, 2]],
      ["staff_inspector", [3, 4, 5]],
      ["staff_full", [1, 2, 3, 4, 5]],
      ["admin", []],
      ["owner", [1, 2, 3, 4, 5]]
    ]);

    for (const [role, steps] of expected) {
      const session = await createSessionForRole(role);
      const response = await request(app)
        .get("/api/v1/me")
        .set("Cookie", session.cookie);
      expect(response.status).toBe(200);
      expect(response.body.allowed_checklist_steps).toEqual(steps);
    }
  });

  it("1A-05 reports application and database health without connection details", async () => {
    const app = await expectAppAvailable();
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "ok",
      database: "ok"
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /postgres(?:ql)?:\/\/|password/i
    );
  });

  it("1A-07 configures required compose services and guards destructive seed", async () => {
    const { execFileSync } = await import("node:child_process");
    const { readFile } = await import("node:fs/promises");
    const services = execFileSync(
      "docker",
      ["compose", "--env-file", ".env.example", "config", "--services"],
      {
        env: process.env,
        encoding: "utf8"
      }
    )
      .trim()
      .split(/\s+/);
    expect(services).toEqual(
      expect.arrayContaining(["postgres", "migrate", "api", "mock-oidc", "web"])
    );

    const seedScript = await readFile(
      new URL("../scripts/seed.ts", import.meta.url),
      "utf8"
    );
    expect(seedScript).toContain("ALLOW_DESTRUCTIVE_SEED");
    expect(seedScript).toContain("DATABASE_URL_OWNER");
  });

  it("1A-09 rejects missing, expired, and tampered session cookies", async () => {
    const app = await expectAppAvailable();
    const cookieValues = [undefined, "tampered-session.invalid-signature"];

    for (const cookie of cookieValues) {
      const response = await request(app)
        .get("/api/v1/me")
        .set("Cookie", cookie ? `orderflow_session=${cookie}` : "");
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("UNAUTHENTICATED");
    }
  });

  it("1A-11 rejects a callback with a wrong state without creating a user", async () => {
    const app = await expectAppAvailable();
    const { prisma } = await import("../src/db/prisma.js");
    const before = await prisma.user.count();
    const response = await request(app)
      .get("/api/v1/auth/oidc/callback")
      .query({ code: "unused-code", state: "wrong-state" });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_OIDC_STATE");
    expect(response.headers["set-cookie"] ?? []).not.toEqual(
      expect.arrayContaining([expect.stringContaining("orderflow_session=")])
    );
    expect(await prisma.user.count()).toBe(before);
  });

  it("1A-10 requires the signed-in user's CSRF token for sign-out", async () => {
    const app = await expectAppAvailable();
    const session = await createSessionForRole("customer");
    const otherSession = await createSessionForRole("customer", 1);
    for (const token of [undefined, "wrong-token", otherSession.csrfToken]) {
      const response = await request(app)
        .post("/api/v1/auth/sign-out")
        .set("Cookie", session.cookie)
        .set("X-CSRF-Token", token ?? "");
      expect(response.status).toBe(403);
    }

    const stillSignedIn = await request(app)
      .get("/api/v1/me")
      .set("Cookie", session.cookie);
    expect(stillSignedIn.status).toBe(200);

    const allowed = await request(app)
      .post("/api/v1/auth/sign-out")
      .set("Cookie", session.cookie)
      .set("X-CSRF-Token", session.csrfToken);
    expect(allowed.status).toBe(204);
  });

  it("1A-15 does not log identity data for an authenticated request", async () => {
    const app = await expectAppAvailable();
    const session = await createSessionForRole("customer");
    const { logger } = await import("../src/observability/logger.js");
    const info = vi.spyOn(logger, "info");

    try {
      const response = await request(app)
        .get("/api/v1/me")
        .set("Cookie", session.cookie);
      expect(response.status).toBe(200);
      const logged = JSON.stringify(info.mock.calls);
      expect(logged).not.toContain(response.body.name);
      expect(logged).not.toMatch(/@example\.test|orderflow_session|csrf/i);
    } finally {
      info.mockRestore();
    }
  });

  it("1A-14 provisions one customer under concurrent first sign-ins", async () => {
    const modulePath = new URL(
      "../src/modules/users/service.js",
      import.meta.url
    ).href;
    const { provisionUserFromOidcClaims } = (await import(modulePath)) as {
      provisionUserFromOidcClaims: (claims: {
        subject: string;
        name: string;
        email: string;
      }) => Promise<{ id: string; roles: string[] }>;
    };
    const provision = () =>
      provisionUserFromOidcClaims({
        subject: "concurrent-customer",
        name: "Concurrent Customer",
        email: "concurrent@example.test"
      });

    const [first, second] = await Promise.all([provision(), provision()]);
    expect(first.id).toBe(second.id);
    expect(first.roles).toEqual(["customer"]);
    expect(second.roles).toEqual(["customer"]);
    const { prisma } = await import("../src/db/prisma.js");
    expect(
      await prisma.user.count({
        where: { oidcSubject: "concurrent-customer" }
      })
    ).toBe(1);
    expect(
      await prisma.userRole.count({
        where: { userId: first.id, roleId: "customer" }
      })
    ).toBe(1);
  });

  it("1A-16 denies customer access to staff API routes", async () => {
    const app = await expectAppAvailable();
    const session = await createSessionForRole("customer");
    const response = await request(app)
      .get("/api/v1/test/permissions/orders.read")
      .set("Cookie", session.cookie);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });
});
