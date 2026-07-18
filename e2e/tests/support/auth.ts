import { expect, type Page } from "@playwright/test";

/**
 * Logs in through the real UI form and waits for the post-login redirect to
 * the dashboard to complete, so callers can rely on the session being fully
 * established (not just the form submitted) before continuing.
 */
export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

/** Signs out via the NavBar button and waits for the redirect to /login. */
export async function logout(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("/login");
}
