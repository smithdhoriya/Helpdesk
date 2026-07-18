import { expect, test } from "@playwright/test";

import { loginAndWaitForHome, logout } from "../support/auth";
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
});
