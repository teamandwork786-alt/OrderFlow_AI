import { describe, expect, it, vi } from "vitest";
import { sessionStore } from "../src/modules/auth/session.js";

describe("Slice 1A session expiry", () => {
  it("1A-09 expires a valid session after twelve hours", () => {
    vi.useFakeTimers();
    try {
      const secret = "slice-1a-test-session-secret-with-sufficient-length";
      const session = sessionStore.create(
        "00000000-0000-4000-8000-000000000001",
        secret
      );
      expect(sessionStore.get(session.sessionId, secret)).toBeDefined();

      vi.advanceTimersByTime(12 * 60 * 60 * 1000);

      expect(sessionStore.get(session.sessionId, secret)).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
