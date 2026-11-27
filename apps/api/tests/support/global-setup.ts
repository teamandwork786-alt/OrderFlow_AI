import { spawnSync } from "node:child_process";

export default function setup(): void {
  const ownerDatabaseUrl = process.env.IDENTITY_TEST_DATABASE_OWNER_URL;
  if (!ownerDatabaseUrl) {
    throw new Error(
      "IDENTITY_TEST_DATABASE_OWNER_URL must point to an isolated Slice 1A test database"
    );
  }

  const result = spawnSync("npm", ["run", "db:migrate"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL_OWNER: ownerDatabaseUrl },
    stdio: "inherit"
  });
  if (result.error) {
    throw new Error("Could not start the Slice 1A test database migration.", {
      cause: result.error
    });
  }
  if (result.status !== 0) {
    throw new Error(
      `Slice 1A test database migration failed with exit code ${result.status ?? "unknown"}.`
    );
  }
}
