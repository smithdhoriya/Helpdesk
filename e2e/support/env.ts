import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const envTestPath = path.resolve(dirname, "../../server/.env.test");

/**
 * Minimal `.env` parser for `server/.env.test`. Avoids pulling in a dotenv
 * dependency just for a handful of `KEY="value"` lines read at test time.
 */
function parseEnvFile(filePath: string): Record<string, string> {
  const contents = readFileSync(filePath, "utf-8");
  const values: Record<string, string> = {};

  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([\w.-]+)\s*=\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    const value = rawValue.replace(/^["']|["']$/g, "");
    values[key] = value;
  }

  return values;
}

const serverTestEnv = parseEnvFile(envTestPath);

function required(key: string): string {
  const value = serverTestEnv[key];
  if (!value) {
    throw new Error(
      `${key} is missing from server/.env.test — required to run the E2E auth suite.`,
    );
  }
  return value;
}

export const PORT = required("PORT");
export const ADMIN_EMAIL = required("ADMIN_EMAIL");
export const ADMIN_PASSWORD = required("ADMIN_PASSWORD");
export const AGENT_EMAIL = required("AGENT_EMAIL");
export const AGENT_PASSWORD = required("AGENT_PASSWORD");
export const INBOUND_EMAIL_WEBHOOK_SECRET = required(
  "INBOUND_EMAIL_WEBHOOK_SECRET",
);
