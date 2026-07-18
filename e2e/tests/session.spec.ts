import { expect, test } from "@playwright/test";

import { login } from "./support/auth";
import { ADMIN } from "./support/test-users";

test.describe("Session behavior", () => {
  test("redirects to /login when visiting the dashboard while unauthenticated", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL("/login");
  });

  test("redirects to /login when visiting /users directly while unauthenticated", async ({
    page,
  }) => {
    await page.goto("/users");
    await expect(page).toHaveURL("/login");
  });

  test("redirects an already-authenticated user away from /login back to the dashboard", async ({
    page,
  }) => {
    await login(page, ADMIN.email, ADMIN.password);

    await page.goto("/login");

    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
  });

  test("keeps the session after reloading a protected route", async ({
    page,
  }) => {
    await login(page, ADMIN.email, ADMIN.password);

    await page.reload();

    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
  });

  test("shows a loading indicator while the session is being verified", async ({
    page,
  }) => {
    // Deliberately slow down the session check so the pending window is wide
    // enough to reliably observe, instead of racing a `waitForTimeout`.
    await page.route("**/get-session", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });

    await page.goto("/");

    await expect(page.getByRole("status", { name: "Loading" })).toBeVisible();
    // No session exists yet, so once the (slow) check resolves it lands on
    // /login rather than hanging on the spinner forever.
    await page.waitForURL("/login");
  });
});
