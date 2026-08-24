import { expect, test } from "@playwright/test";

import { API_URL } from "../support/config";
import { loginAndWaitForHome } from "../support/auth";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "../support/env";
import { createTestTicket } from "../support/tickets";
import { createTestUser } from "../support/users";

test.describe("Assign a ticket to an agent", () => {
  test.beforeEach(async ({ page }) => {
    // Assigning isn't admin-gated (any authenticated user can PATCH a
    // ticket), but creating the target agent via `createTestUser` hits
    // `POST /api/users`, which is admin-only — so the whole test runs as
    // admin for simplicity rather than juggling two sessions.
    await loginAndWaitForHome(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  test("assigning to an agent persists across reload", async ({ page }) => {
    const ticket = await createTestTicket(page);
    const agent = await createTestUser(page);

    await page.goto(`/tickets/${ticket.id}`);

    const assignedTo = page.getByRole("combobox", { name: "Assigned to" });
    await expect(assignedTo).toContainText("Unassigned");

    await assignedTo.click();
    await page.getByRole("option", { name: agent.name }).click();

    await expect(assignedTo).toContainText(agent.name);

    await page.reload();

    await expect(
      page.getByRole("combobox", { name: "Assigned to" }),
    ).toContainText(agent.name);
  });

  test("unassigning clears the assignment and persists across reload", async ({
    page,
  }) => {
    const ticket = await createTestTicket(page);
    const agent = await createTestUser(page);

    await page.goto(`/tickets/${ticket.id}`);

    const assignedTo = page.getByRole("combobox", { name: "Assigned to" });
    await assignedTo.click();
    await page.getByRole("option", { name: agent.name }).click();
    await expect(assignedTo).toContainText(agent.name);

    await assignedTo.click();
    await page.getByRole("option", { name: "Unassigned" }).click();
    await expect(assignedTo).toContainText("Unassigned");

    await page.reload();

    await expect(
      page.getByRole("combobox", { name: "Assigned to" }),
    ).toContainText("Unassigned");
  });

  test("PATCH with a nonexistent agent id returns 400", async ({ page }) => {
    const ticket = await createTestTicket(page);

    const response = await page.request.patch(
      `${API_URL}/api/tickets/${ticket.id}`,
      { data: { assignedTo: "not-a-real-agent-id" } },
    );

    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({ error: "Agent not found" });
  });

  test("PATCH on a nonexistent ticket returns 404", async ({ page }) => {
    const response = await page.request.patch(
      `${API_URL}/api/tickets/not-a-real-ticket-id`,
      { data: { assignedTo: null } },
    );

    expect(response.status()).toBe(404);
    expect(await response.json()).toEqual({ error: "Ticket not found" });
  });
});
