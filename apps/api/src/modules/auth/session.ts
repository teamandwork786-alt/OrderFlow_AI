import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { CookieOptions } from "express";
import type { AppConfig } from "../../config.js";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export interface SessionRecord {
  userId: string;
  csrfToken: string;
  expiresAt: number;
}

export interface SessionCredential extends SessionRecord {
  sessionId: string;
}

const sessions = new Map<string, SessionRecord>();

export const sessionStore = {
  create(userId: string, secret: string): SessionCredential {
    const nonce = randomBytes(32).toString("base64url");
    const sessionId = `${nonce}.${signSessionId(nonce, secret)}`;
    const record = {
      userId,
      csrfToken: randomBytes(32).toString("base64url"),
      expiresAt: Date.now() + SESSION_TTL_MS
    };
    sessions.set(sessionId, record);
    return { sessionId, ...record };
  },
  get(sessionId: string, secret: string): SessionRecord | undefined {
    if (!isValidSessionId(sessionId, secret)) return undefined;
    const record = sessions.get(sessionId);
    if (record && record.expiresAt <= Date.now()) {
      sessions.delete(sessionId);
      return undefined;
    }
    return record;
  },
  delete(sessionId: string): void {
    sessions.delete(sessionId);
  }
};

export function sessionCookieOptions(config: AppConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.SESSION_COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS
  };
}

export function csrfTokensMatch(
  expected: string,
  supplied: string | undefined
): boolean {
  if (!supplied) return false;
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return (
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

export const sessionCookieName = "orderflow_session";

function signSessionId(nonce: string, secret: string): string {
  return createHmac("sha256", secret).update(nonce).digest("base64url");
}

function isValidSessionId(sessionId: string, secret: string): boolean {
  const [nonce, signature, extra] = sessionId.split(".");
  if (!nonce || !signature || extra !== undefined) return false;
  const expected = Buffer.from(signSessionId(nonce, secret));
  const supplied = Buffer.from(signature);
  return (
    expected.length === supplied.length && timingSafeEqual(expected, supplied)
  );
}
