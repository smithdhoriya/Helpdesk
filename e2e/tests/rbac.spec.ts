import { expect, test } from "@playwright/test";

import { login } from "./support/auth";
import { ADMIN, AGENT } from "./support/test-users";

test.describe("Role-based access control", () => {
  test("admin can access the Users page", async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);

    await page.goto("/users");

    await expect(page).toHaveURL("/users");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
  });

  test("agent is redirected from /users to the dashboard, not to /login", async ({
    page,
  }) => {
    await login(page, AGENT.email, AGENT.password);

    await page.goto("/users");

    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
  });

  test("agent can access the dashboard", async ({ page }) => {
    await login(page, AGENT.email, AGENT.password);

    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
  });

  test("shows the Users nav link for an admin", async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);

    await expect(page.getByRole("link", { name: "Users" })).toBeVisible();
  });

  test("hides the Users nav link for an agent", async ({ page }) => {
    await login(page, AGENT.email, AGENT.password);

    await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);
  });
});
