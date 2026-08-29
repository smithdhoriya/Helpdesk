import { expect, test } from "@playwright/test";

import { login, loginAndWaitForHome, logout } from "../support/auth";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "../support/env";
import { createTestUser } from "../support/users";

// Form rendering, validation, and inline server-error surfacing are covered by
// component tests (UserForm.test.tsx, Users.test.tsx) against a mocked API.
// What's left for E2E is the real auth round-trip: that a password edit
// persisted through Better Auth actually changes what credentials work.
test.describe("Edit user", () => {
  test.beforeEach(async ({ page }) => {
    await loginAndWaitForHome(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  test("leaving the password blank keeps the original password working", async ({
    page,
  }) => {
    const testUser = await createTestUser(page);
    const updatedName = `${testUser.name} Renamed`;

    await page.goto("/users");
    await page.getByRole("button", { name: `Edit ${testUser.name}` }).click();

    const dialog = page.getByRole("dialog", { name: "Edit User" });
    await dialog.getByLabel("Name").fill(updatedName);
    // Password intentionally left blank.
    await dialog.getByRole("button", { name: "Save Changes" }).click();
    await expect(dialog).not.toBeVisible();

    await logout(page);

    await loginAndWaitForHome(page, testUser.email, testUser.password);
  });

  test("providing a new password changes it, and the old password stops working", async ({
    page,
  }) => {
    const testUser = await createTestUser(page);
    const newPassword = "brand-new-password";

    await page.goto("/users");
    await page.getByRole("button", { name: `Edit ${testUser.name}` }).click();

    const dialog = page.getByRole("dialog", { name: "Edit User" });
    await dialog.getByLabel("Password").fill(newPassword);
    await dialog.getByRole("button", { name: "Save Changes" }).click();
    await expect(dialog).not.toBeVisible();

    await logout(page);

    await login(page, testUser.email, testUser.password);
    await expect(page.getByRole("alert").last()).toHaveText(
      "Invalid email or password",
    );
    await expect(page).toHaveURL("/login");

    await loginAndWaitForHome(page, testUser.email, newPassword);
  });
});
