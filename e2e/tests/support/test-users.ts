import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Test credentials come from `server/.env.test` (loaded via `--env-file` for
// the API/seed script). We parse the same file here instead of hardcoding or
// duplicating credentials, so the client and server always agree on the same
// admin/agent accounts that `global-setup.ts` just seeded.
const dirname = path.dirname(fileURLToPath(import.meta.url));
const envTestPath = path.resolve(dirname, "../../../server/.env.test");

function parseEnvFile(filePath: string): Record<string, string> {
  const content = readFileSync(filePath, "utf-8");
  const values: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }

  return values;
}

function readTestEnv(): Record<string, string> {
  if (!existsSync(envTestPath)) {
    throw new Error(
      `Expected ${envTestPath} to exist. Copy server/.env.test.example to ` +
        "server/.env.test and fill in real values before running E2E tests.",
    );
  }
  return parseEnvFile(envTestPath);
}

const env = readTestEnv();

function required(key: string): string {
  const value = env[key];
  if (!value) {
    throw new Error(
      `Missing ${key} in server/.env.test. It's required to run the auth ` +
        "E2E suite (see server/.env.test.example).",
    );
  }
  return value;
}

export const ADMIN = {
  email: required("ADMIN_EMAIL"),
  password: required("ADMIN_PASSWORD"),
};

export const AGENT = {
  email: required("AGENT_EMAIL"),
  password: required("AGENT_PASSWORD"),
};
