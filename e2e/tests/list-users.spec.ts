import { expect, test } from "@playwright/test";

import { loginAndWaitForHome } from "../support/auth";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "../support/env";
import { createTestUser } from "../support/users";

test.describe("List users", () => {
  test.beforeEach(async ({ page }) => {
    await loginAndWaitForHome(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  test("shows the users table with the expected columns and the seeded admin", async ({
    page,
  }) => {
    await page.goto("/users");

    await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Email" }),
    ).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Role" })).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Joined" }),
    ).toBeVisible();

    const adminRow = page.getByRole("row", { name: new RegExp(ADMIN_EMAIL) });
    await expect(adminRow).toBeVisible();
    // Exact + case-sensitive: the seeded admin's *name* is "Admin", so a
    // case-insensitive match would also match the Name cell, not just Role.
    await expect(
      adminRow.getByRole("cell", { name: "admin", exact: true }),
    ).toBeVisible();
  });

  test("lists a newly created user with its name, email, role, and join date", async ({
    page,
  }) => {
    const testUser = await createTestUser(page);

    await page.goto("/users");

    // Computed in the browser (not Node) so it matches the locale the
    // component itself renders with, rather than the test runner's locale.
    const todayFormatted = await page.evaluate(() =>
      new Date().toLocaleDateString(),
    );

    const row = page.getByRole("row", { name: new RegExp(testUser.name) });
    await expect(row).toBeVisible();
    await expect(row.getByRole("cell", { name: testUser.email })).toBeVisible();
    await expect(
      row.getByRole("cell", { name: "agent", exact: true }),
    ).toBeVisible();
    await expect(
      row.getByRole("cell", { name: todayFormatted }),
    ).toBeVisible();
  });
});
