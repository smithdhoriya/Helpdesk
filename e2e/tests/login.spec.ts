import { expect, test } from "@playwright/test";

import { login, loginAndWaitForHome } from "../support/auth";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "../support/env";

test.describe("Login form", () => {
  test("shows validation errors when submitting an empty form", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /sign in/i }).click();

    // Both fields fail client-side (zod) validation, each rendering its own
    // role="alert" error message next to the input.
    await expect(page.getByLabel("Email")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(page.getByLabel("Password")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(page.getByRole("alert")).toHaveCount(2);
    await expect(page).toHaveURL("/login");
  });

  test("does not submit with a malformed email", async ({ page }) => {
    await page.goto("/login");

    const emailInput = page.getByLabel("Email");
    await emailInput.fill("notanemail");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: /sign in/i }).click();

    // The <input type="email"> blocks native submission before the zod
    // resolver ever runs, so the form stays on /login either way.
    await expect(page).toHaveURL("/login");
    await expect(emailInput).toHaveJSProperty("validity.valid", false);
  });

  test("shows an error for an incorrect password", async ({ page }) => {
    await login(page, ADMIN_EMAIL, "not-the-right-password");

    // Better Auth returns the same generic message for both a wrong
    // password and an unknown email, so it doesn't leak which one is wrong.
    await expect(page.getByRole("alert").last()).toHaveText(
      "Invalid email or password",
    );
    await expect(page).toHaveURL("/login");
  });

  test("shows an error for an unknown email", async ({ page }) => {
    await login(page, "no-such-user@example.com", "password123");

    await expect(page.getByRole("alert").last()).toHaveText(
      "Invalid email or password",
    );
    await expect(page).toHaveURL("/login");
  });

  test("logs in with valid credentials and redirects to the dashboard", async ({
    page,
  }) => {
    await loginAndWaitForHome(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
  });

  test("redirects an already-authenticated user away from /login", async ({
    page,
  }) => {
    await loginAndWaitForHome(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    await page.goto("/login");

    await expect(page).toHaveURL("/");
  });
});
