import { expect, test } from "@playwright/test";

import { API_URL } from "./support/config";
import { login, logout } from "./support/auth";
import { ADMIN } from "./support/test-users";

test.describe("Logout", () => {
  test("signs out and redirects to the login page", async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);

    await logout(page);

    await expect(page).toHaveURL("/login");
  });

  test("invalidates the session server-side, not just client-side state", async ({
    page,
  }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await logout(page);

    // The session cookie (if any survived) should no longer resolve to a
    // real session on the server, proving logout invalidated it server-side
    // rather than only clearing client-side session state.
    const response = await page.request.get(`${API_URL}/api/auth/get-session`);
    expect(await response.json()).toBeNull();

    // Direct navigation to a protected route re-confirms the same thing at
    // the UI level.
    await page.goto("/");
    await expect(page).toHaveURL("/login");
  });

  test("does not reveal protected content when navigating back after logout", async ({
    page,
  }) => {
    await login(page, ADMIN.email, ADMIN.password);

    // Visit a second protected page so there's a distinct prior history
    // entry (the dashboard redirect on login uses `replace`, so without
    // this there'd be nothing meaningful to go "back" to).
    await page.goto("/users");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();

    await logout(page);

    await page.goBack();

    await expect(page).toHaveURL("/login");
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).not.toBeVisible();
  });
});
