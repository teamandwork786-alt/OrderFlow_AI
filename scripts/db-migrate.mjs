import { spawnSync } from "node:child_process";
import process from "node:process";

const result = spawnSync("bash", ["scripts/db-migrate.sh"], {
  stdio: "inherit",
  env: process.env
});

if (result.error) {
  process.stderr.write("Database migration command could not start.\n");
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
