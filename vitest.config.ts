import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "apps/api/tests/**/*.test.ts",
      "apps/mock-oidc/tests/**/*.test.ts",
      "apps/web/tests/unit/**/*.test.ts"
    ],
    exclude: ["apps/api/tests/sql/**"],
    globalSetup: ["apps/api/tests/support/global-setup.ts"],
    setupFiles: ["apps/api/tests/support/test-env.ts"],
    testTimeout: 15_000,
    hookTimeout: 15_000
  }
});
