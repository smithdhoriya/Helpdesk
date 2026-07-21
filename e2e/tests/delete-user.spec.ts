import { expect, test } from "@playwright/test";

import { API_URL } from "../support/config";
import { login, loginAndWaitForHome, logout } from "../support/auth";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "../support/env";
import { createTestUser } from "../support/users";

test.describe("Delete user", () => {
  test.beforeEach(async ({ page }) => {
    await loginAndWaitForHome(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  test("clicking delete on a non-admin row opens a confirmation dialog with that user's name", async ({
    page,
  }) => {
    const testUser = await createTestUser(page);

    await page.goto("/users");
    await page
      .getByRole("button", { name: `Delete ${testUser.name}` })
      .click();

    const dialog = page.getByRole("dialog", { name: "Delete User" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText(`Delete ${testUser.name}? This can't be undone.`),
    ).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Delete", exact: true }),
    ).toBeVisible();
  });

  test("cancelling closes the dialog without deleting the user", async ({
    page,
  }) => {
    const testUser = await createTestUser(page);

    await page.goto("/users");
    await page
      .getByRole("button", { name: `Delete ${testUser.name}` })
      .click();

    const dialog = page.getByRole("dialog", { name: "Delete User" });
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).not.toBeVisible();

    await expect(
      page.getByRole("row", { name: new RegExp(testUser.name) }),
    ).toBeVisible();
  });

  test("confirming deletes the user, closing the dialog and removing the row", async ({
    page,
  }) => {
    const testUser = await createTestUser(page);

    await page.goto("/users");
    await page
      .getByRole("button", { name: `Delete ${testUser.name}` })
      .click();

    const dialog = page.getByRole("dialog", { name: "Delete User" });
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(dialog).not.toBeVisible();

    await expect(
      page.getByRole("row", { name: new RegExp(testUser.name) }),
    ).toHaveCount(0);
  });

  test("a deleted user can no longer sign in", async ({ page }) => {
    const testUser = await createTestUser(page);

    await page.goto("/users");
    await page
      .getByRole("button", { name: `Delete ${testUser.name}` })
      .click();

    const dialog = page.getByRole("dialog", { name: "Delete User" });
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(dialog).not.toBeVisible();

    await logout(page);

    await login(page, testUser.email, testUser.password);

    // Better Auth's sign-in hook rejects soft-deleted users with a distinct
    // message rather than the generic "Invalid email or password", even
    // though the password is correct.
    await expect(page.getByRole("alert").last()).toHaveText(
      "This account has been deactivated.",
    );
    await expect(page).toHaveURL("/login");
  });

  test("the admin row's delete button is disabled, and the API rejects deleting an admin directly", async ({
    page,
  }) => {
    await page.goto("/users");

    const adminRow = page.getByRole("row", { name: new RegExp(ADMIN_EMAIL) });
    const deleteButton = adminRow.getByRole("button", { name: /^Delete / });
    await expect(deleteButton).toBeDisabled();

    // Disabled, so clicking it can't open a dialog.
    await expect(page.getByRole("dialog")).not.toBeVisible();

    // Defense-in-depth: confirm the server enforces this too, independent of
    // the disabled UI control.
    const users = await page.request
      .get(`${API_URL}/api/users`)
      .then((res) => res.json());
    const admin = users.find(
      (user: { email: string }) => user.email === ADMIN_EMAIL,
    );

    const response = await page.request.delete(
      `${API_URL}/api/users/${admin.id}`,
    );
    expect(response.status()).toBe(403);
    expect(await response.json()).toEqual({
      error: "Admin users cannot be deleted",
    });
  });
});
