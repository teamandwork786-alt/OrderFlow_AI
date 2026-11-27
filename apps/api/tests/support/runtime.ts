import { randomUUID } from "node:crypto";
import type { Application } from "express";
import { expect } from "vitest";

type AppModule = {
  createApp: () => Application;
};

export interface TestSession {
  cookie: string;
  csrfToken: string;
}

export async function createTestApp(): Promise<Application> {
  const modulePath = new URL("../../src/app.js", import.meta.url).href;
  const appModule = (await import(modulePath)) as AppModule;
  return appModule.createApp();
}

export async function expectAppAvailable(): Promise<Application> {
  const app = await createTestApp();
  expect(app).toBeDefined();
  return app;
}

export function requireDatabaseUrl(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must point to an isolated Slice 1A test database`);
  }
  return value;
}

export async function createSessionForRole(
  roleId: string,
  userIndex = 0
): Promise<TestSession> {
  const { prisma } = await import("../../src/db/prisma.js");
  let users = await prisma.user.findMany({
    where: { userRoles: { some: { roleId } } },
    orderBy: { oidcSubject: "asc" },
    take: userIndex + 1,
    select: { id: true }
  });
  while (users.length <= userIndex) {
    await insertTestUserForRole(roleId);
    users = await prisma.user.findMany({
      where: { userRoles: { some: { roleId } } },
      orderBy: { oidcSubject: "asc" },
      take: userIndex + 1,
      select: { id: true }
    });
  }
  const user = users[userIndex];
  if (!user) throw new Error(`No test identity is assigned the ${roleId} role`);
  return createSessionForUser(user.id);
}

export async function createSessionForUser(
  userId: string
): Promise<TestSession> {
  const [{ sessionStore }, { config }] = await Promise.all([
    import("../../src/modules/auth/session.js"),
    import("../../src/config.js")
  ]);
  const session = sessionStore.create(userId, config.SESSION_SECRET);
  return {
    cookie: `orderflow_session=${session.sessionId}`,
    csrfToken: session.csrfToken
  };
}

export async function createUserForRole(roleId: string): Promise<string> {
  const { prisma } = await import("../../src/db/prisma.js");
  const existing = await prisma.user.findFirst({
    where: { userRoles: { some: { roleId } } },
    select: { id: true }
  });
  if (existing) return existing.id;

  return insertTestUserForRole(roleId);
}

async function insertTestUserForRole(roleId: string): Promise<string> {
  const { prisma } = await import("../../src/db/prisma.js");
  const unique = randomUUID();
  const user = await prisma.user.create({
    data: {
      oidcSubject: `slice-1a-test-${roleId}-${unique}`,
      name: "Slice 1A test identity",
      email: `slice-1a-${unique}@example.test`,
      userRoles: { create: { roleId } }
    },
    select: { id: true }
  });
  return user.id;
}
