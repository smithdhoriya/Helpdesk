import { expect, test } from "@playwright/test";

import { loginAndWaitForHome } from "../support/auth";
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  AGENT_EMAIL,
  AGENT_PASSWORD,
} from "../support/env";

test.describe("Admin-only access", () => {
  test("admin sees the Users nav link and can access /users", async ({
    page,
  }) => {
    await loginAndWaitForHome(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    const usersLink = page.getByRole("link", { name: "Users" });
    await expect(usersLink).toBeVisible();

    await usersLink.click();

    await expect(page).toHaveURL("/users");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
  });

  test("agent does not see the Users nav link and is redirected away from /users", async ({
    page,
  }) => {
    await loginAndWaitForHome(page, AGENT_EMAIL, AGENT_PASSWORD);

    await expect(page.getByRole("link", { name: "Users" })).not.toBeVisible();

    await page.goto("/users");

    // AdminRoute redirects non-admins back to "/".
    await expect(page).toHaveURL("/");
  });
});
