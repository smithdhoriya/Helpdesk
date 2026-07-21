import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";

import { API_URL } from "./config";

export type TestUser = {
  id: string;
  name: string;
  email: string;
  password: string;
};

/**
 * Creates a fresh agent user via the API (`POST /api/users`), using the
 * given page's already-authenticated admin session. Tests that edit a
 * user — especially its password — use a freshly created user rather than
 * the shared seeded ADMIN/AGENT accounts, since the suite runs fully
 * parallel and mutating a shared account's credentials would break other
 * tests relying on it. The random suffix keeps the name/email unique across
 * concurrent test runs.
 */
export async function createTestUser(
  page: Page,
  overrides: Partial<Pick<TestUser, "name" | "email" | "password">> = {},
): Promise<TestUser> {
  const unique = randomUUID().slice(0, 8);
  const name = overrides.name ?? `Test User ${unique}`;
  const email = overrides.email ?? `test-user-${unique}@example.com`;
  const password = overrides.password ?? "password123";

  const response = await page.request.post(`${API_URL}/api/users`, {
    data: { name, email, password },
  });

  if (!response.ok()) {
    throw new Error(
      `Failed to create test user via API: ${response.status()} ${await response.text()}`,
    );
  }

  const body = await response.json();
  return { id: body.id, name, email, password };
}
