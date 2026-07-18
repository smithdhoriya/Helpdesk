import { expect, test } from "@playwright/test";

import { ADMIN } from "./support/test-users";

const GENERIC_CREDENTIALS_ERROR = "Invalid email or password";

test.describe("Login", () => {
  test("signs in with valid admin credentials and redirects to the dashboard", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(ADMIN.email);
    await page.getByLabel("Password").fill(ADMIN.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.waitForURL("/");
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
  });

  test("shows a generic error for a wrong password and stays on the login page", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(ADMIN.email);
    await page.getByLabel("Password").fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("alert")).toHaveText(GENERIC_CREDENTIALS_ERROR);
    await expect(page).toHaveURL("/login");
  });

  test("shows the same generic error for an unknown email as for a wrong password (no user enumeration)", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("no-such-user@example.com");
    await page.getByLabel("Password").fill("whatever-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    const unknownEmailError = await page.getByRole("alert").textContent();
    await expect(page).toHaveURL("/login");

    expect(unknownEmailError).toBe(GENERIC_CREDENTIALS_ERROR);
  });

  test("requires both email and password before making a network request", async ({
    page,
  }) => {
    let signInRequests = 0;
    await page.route("**/sign-in/email", (route) => {
      signInRequests += 1;
      return route.continue();
    });

    await page.goto("/login");
    await page.getByRole("button", { name: "Sign in" }).click();

    // Both fields render a validation error inline (exact copy is an
    // implementation detail we don't want to pin down here); what matters is
    // that submission is blocked client-side with no network call.
    await expect(page.getByRole("alert")).toHaveCount(2);
    await expect(page).toHaveURL("/login");
    expect(signInRequests).toBe(0);
  });

  test("treats a whitespace-only email as empty, without making a network request", async ({
    page,
  }) => {
    let signInRequests = 0;
    await page.route("**/sign-in/email", (route) => {
      signInRequests += 1;
      return route.continue();
    });

    await page.goto("/login");
    // The <input type="email"> sanitizes a whitespace-only value down to "",
    // so this exercises the same "required" path as an empty field.
    await page.getByLabel("Email").fill("   ");
    await page.getByLabel("Password").fill("some-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page).toHaveURL("/login");
    expect(signInRequests).toBe(0);
  });

  const nativelyRejectedEmails: Array<{ label: string; email: string }> = [
    { label: "malformed email", email: "notanemail" },
    { label: "SQL-injection-style email", email: "' OR '1'='1" },
    { label: "script-tag email", email: "<script>alert(1)</script>" },
  ];

  for (const { label, email } of nativelyRejectedEmails) {
    test(`rejects a ${label} before it ever reaches the server, without crashing`, async ({
      page,
    }) => {
      const dialogs: string[] = [];
      page.on("dialog", (dialog) => {
        dialogs.push(dialog.message());
        void dialog.dismiss();
      });

      let signInRequests = 0;
      await page.route("**/sign-in/email", (route) => {
        signInRequests += 1;
        return route.continue();
      });

      await page.goto("/login");
      const emailInput = page.getByLabel("Email");
      await emailInput.fill(email);
      await page.getByLabel("Password").fill("some-password");
      await page.getByRole("button", { name: "Sign in" }).click();

      // None of these are valid `type="email"` values (no "@"), so the
      // browser's own HTML5 constraint validation blocks the submit before
      // React/zod ever sees it - no form submission, no network request.
      expect(
        await emailInput.evaluate((el: HTMLInputElement) => el.validity.valid),
      ).toBe(false);

      expect(signInRequests).toBe(0);
      await expect(page).toHaveURL("/login");
      expect(dialogs).toEqual([]);
    });
  }

  const invalidCredentialInputs: Array<{ label: string; password: string }> = [
    { label: "whitespace-only password", password: "   " },
    { label: "SQL-injection-style password", password: "' OR '1'='1" },
    { label: "script-tag password", password: "<script>alert(1)</script>" },
  ];

  for (const { label, password } of invalidCredentialInputs) {
    test(`treats a ${label} as an ordinary invalid credential, without crashing`, async ({
      page,
    }) => {
      const dialogs: string[] = [];
      page.on("dialog", (dialog) => {
        dialogs.push(dialog.message());
        void dialog.dismiss();
      });

      await page.goto("/login");
      await page.getByLabel("Email").fill(ADMIN.email);
      await page.getByLabel("Password").fill(password);

      const responsePromise = page.waitForResponse((response) =>
        response.url().includes("/sign-in/email"),
      );
      await page.getByRole("button", { name: "Sign in" }).click();
      const response = await responsePromise;

      expect(response.status()).toBeLessThan(500);
      await expect(page.getByRole("alert")).toHaveText(
        GENERIC_CREDENTIALS_ERROR,
      );
      await expect(page).toHaveURL("/login");
      expect(dialogs).toEqual([]);
    });
  }
});
