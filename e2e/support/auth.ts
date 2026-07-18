import { expect, type Page } from "@playwright/test";

/**
 * Fills and submits the login form, then waits for the post-login redirect
 * to "/" (the app only navigates once `useSession()` picks up the new
 * session, so this is not instantaneous after the request resolves).
 */
export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
}

export async function loginAndWaitForHome(
  page: Page,
  email: string,
  password: string,
) {
  await login(page, email, password);
  await expect(page).toHaveURL("/");
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(page).toHaveURL("/login");
}
