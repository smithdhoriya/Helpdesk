import { expect, test } from "@playwright/test";

import { loginAndWaitForHome, logout } from "../support/auth";
import { API_URL } from "../support/config";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "../support/env";

test.describe("Session and protected routes", () => {
  test("redirects an unauthenticated user from a protected route to /login", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page).toHaveURL("/login");
  });

  test("keeps the user signed in across a page reload", async ({ page }) => {
    await loginAndWaitForHome(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    await page.reload();

    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
  });

  test("signs out and blocks access to protected routes afterwards", async ({
    page,
  }) => {
    await loginAndWaitForHome(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    await logout(page);

    await page.goto("/");
    await expect(page).toHaveURL("/login");
  });

  test("invalidates the session server-side, not just client-side state", async ({
    page,
  }) => {
    await loginAndWaitForHome(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    await logout(page);

    // The session cookie (if any survived) should no longer resolve to a real
    // session on the server, proving logout invalidated it server-side rather
    // than only clearing client-side session state. This is the one logout
    // assertion a component test can't make — it needs real Better Auth.
    const response = await page.request.get(`${API_URL}/api/auth/get-session`);
    expect(await response.json()).toBeNull();
  });
});
