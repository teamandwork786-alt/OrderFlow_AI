import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/api/tests/sql/**/*.test.ts"],
    globalSetup: ["apps/api/tests/support/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false
  }
});
