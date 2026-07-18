import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(dirname, "../server");

export default function globalSetup() {
  if (!existsSync(path.join(serverDir, ".env.test"))) {
    throw new Error(
      "server/.env.test is missing. Copy server/.env.test.example to " +
        "server/.env.test and fill in real values before running E2E tests.",
    );
  }

  // `prisma migrate deploy` creates the `helpdesk_test` database if it
  // doesn't exist yet, then applies any pending migrations.
  execSync("bun run db:test:migrate", { cwd: serverDir, stdio: "inherit" });

  // Idempotent: skips creating the admin user if it already exists.
  execSync("bun run db:test:seed", { cwd: serverDir, stdio: "inherit" });
}
