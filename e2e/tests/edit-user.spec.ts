import { expect, test } from "@playwright/test";

import { login, loginAndWaitForHome, logout } from "../support/auth";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "../support/env";
import { createTestUser } from "../support/users";

test.describe("Edit user", () => {
  test.beforeEach(async ({ page }) => {
    await loginAndWaitForHome(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  test("opens pre-filled with the row's current name and email", async ({
    page,
  }) => {
    const testUser = await createTestUser(page);

    await page.goto("/users");
    await page.getByRole("button", { name: `Edit ${testUser.name}` }).click();

    const dialog = page.getByRole("dialog", { name: "Edit User" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Name")).toHaveValue(testUser.name);
    await expect(dialog.getByLabel("Email")).toHaveValue(testUser.email);
    await expect(dialog.getByLabel("Password")).toHaveValue("");
    await expect(
      dialog.getByText("Leave blank to keep the current password."),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Save Changes" }),
    ).toBeVisible();
  });

  test("saving edited name and email updates the table row and closes the dialog", async ({
    page,
  }) => {
    const testUser = await createTestUser(page);
    const updatedName = `${testUser.name} Updated`;
    const updatedEmail = `updated-${testUser.email}`;

    await page.goto("/users");
    await page.getByRole("button", { name: `Edit ${testUser.name}` }).click();

    const dialog = page.getByRole("dialog", { name: "Edit User" });
    await dialog.getByLabel("Name").fill(updatedName);
    await dialog.getByLabel("Email").fill(updatedEmail);
    await dialog.getByRole("button", { name: "Save Changes" }).click();

    await expect(dialog).not.toBeVisible();

    const row = page.getByRole("row", { name: new RegExp(updatedName) });
    await expect(row).toBeVisible();
    await expect(row.getByRole("cell", { name: updatedEmail })).toBeVisible();
    // Exact match: `updatedName` starts with `testUser.name`, so a substring
    // match on `Edit ${testUser.name}` would also match the renamed row's
    // own edit button.
    await expect(
      page.getByRole("button", { name: `Edit ${testUser.name}`, exact: true }),
    ).toHaveCount(0);
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

  test("shows an inline error and keeps the dialog open for a too-short password", async ({
    page,
  }) => {
    const testUser = await createTestUser(page);

    await page.goto("/users");
    await page.getByRole("button", { name: `Edit ${testUser.name}` }).click();

    const dialog = page.getByRole("dialog", { name: "Edit User" });
    await dialog.getByLabel("Password").fill("short");
    await dialog.getByRole("button", { name: "Save Changes" }).click();

    await expect(
      dialog.getByText("Password must be at least 8 characters"),
    ).toBeVisible();
    await expect(dialog.getByLabel("Password")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(dialog).toBeVisible();
  });

  test("shows an inline error and keeps the dialog open when the email is already taken", async ({
    page,
  }) => {
    const testUser = await createTestUser(page);
    const otherUser = await createTestUser(page);

    await page.goto("/users");
    await page.getByRole("button", { name: `Edit ${testUser.name}` }).click();

    const dialog = page.getByRole("dialog", { name: "Edit User" });
    await dialog.getByLabel("Email").fill(otherUser.email);
    await dialog.getByRole("button", { name: "Save Changes" }).click();

    await expect(
      dialog.getByText("A user with this email already exists"),
    ).toBeVisible();
    await expect(dialog).toBeVisible();

    // The underlying table is aria-hidden while the modal is open, so close
    // it before checking that the row still shows the original, unchanged
    // email.
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).not.toBeVisible();

    const row = page.getByRole("row", { name: new RegExp(testUser.name) });
    await expect(row.getByRole("cell", { name: testUser.email })).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Edit ${testUser.name}`, exact: true }),
    ).toBeVisible();
  });
});
