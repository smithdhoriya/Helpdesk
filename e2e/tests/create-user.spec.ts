import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { loginAndWaitForHome, logout } from "../support/auth";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "../support/env";

test.describe("Create user", () => {
  test.beforeEach(async ({ page }) => {
    await loginAndWaitForHome(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  test("opens empty with a Create User heading and submit button", async ({
    page,
  }) => {
    await page.goto("/users");
    await page.getByRole("button", { name: "Create User" }).click();

    const dialog = page.getByRole("dialog", { name: "Create User" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText("Add a new agent to the helpdesk."),
    ).toBeVisible();
    await expect(dialog.getByLabel("Name")).toHaveValue("");
    await expect(dialog.getByLabel("Email")).toHaveValue("");
    await expect(dialog.getByLabel("Password")).toHaveValue("");
    await expect(
      dialog.getByRole("button", { name: "Create User" }),
    ).toBeVisible();
  });

  test("filling out and submitting the form adds the new agent to the users table", async ({
    page,
  }) => {
    const unique = randomUUID().slice(0, 8);
    const name = `New User ${unique}`;
    const email = `new-user-${unique}@example.com`;

    await page.goto("/users");
    await page.getByRole("button", { name: "Create User" }).click();

    const dialog = page.getByRole("dialog", { name: "Create User" });
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByLabel("Email").fill(email);
    await dialog.getByLabel("Password").fill("password123");
    await dialog.getByRole("button", { name: "Create User" }).click();

    await expect(dialog).not.toBeVisible();

    const row = page.getByRole("row", { name: new RegExp(name) });
    await expect(row).toBeVisible();
    await expect(row.getByRole("cell", { name: email })).toBeVisible();
    // New users are always provisioned with the agent role (the server
    // hardcodes it on create), regardless of what the form submits.
    await expect(
      row.getByRole("cell", { name: "agent", exact: true }),
    ).toBeVisible();
  });

  test("a newly created user can sign in with the given credentials", async ({
    page,
  }) => {
    const unique = randomUUID().slice(0, 8);
    const name = `New User ${unique}`;
    const email = `new-user-${unique}@example.com`;
    const password = "password123";

    await page.goto("/users");
    await page.getByRole("button", { name: "Create User" }).click();

    const dialog = page.getByRole("dialog", { name: "Create User" });
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByLabel("Email").fill(email);
    await dialog.getByLabel("Password").fill(password);
    await dialog.getByRole("button", { name: "Create User" }).click();
    await expect(dialog).not.toBeVisible();

    await logout(page);

    await loginAndWaitForHome(page, email, password);
  });
});
