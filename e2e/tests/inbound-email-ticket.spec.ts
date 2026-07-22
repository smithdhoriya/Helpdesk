import { expect, test } from "@playwright/test";

import { loginAndWaitForHome } from "../support/auth";
import { AGENT_EMAIL, AGENT_PASSWORD } from "../support/env";
import { createTestTicket } from "../support/tickets";

test.describe("Inbound email creates a ticket", () => {
  test.beforeEach(async ({ page }) => {
    // Ticket viewing isn't admin-gated — any authenticated user (admin or
    // agent) can see it, so an agent session exercises that access model.
    await loginAndWaitForHome(page, AGENT_EMAIL, AGENT_PASSWORD);
  });

  test("a ticket created via the inbound email webhook appears in the list and detail views", async ({
    page,
  }) => {
    const ticket = await createTestTicket(page);

    await page.goto("/tickets");

    const row = page.getByRole("row", { name: new RegExp(ticket.subject) });
    await expect(row).toBeVisible();
    await expect(
      row.getByRole("cell", { name: ticket.senderEmail }),
    ).toBeVisible();
    await expect(
      row.getByRole("cell", { name: "open", exact: true }),
    ).toBeVisible();
    await expect(
      row.getByRole("cell", { name: "Uncategorized" }),
    ).toBeVisible();

    await row.click();

    await expect(page).toHaveURL(`/tickets/${ticket.id}`);
    await expect(page.getByText(ticket.subject, { exact: true })).toBeVisible();
    await expect(page.getByText(`From ${ticket.senderEmail}`)).toBeVisible();
    await expect(page.getByText(ticket.body)).toBeVisible();
  });
});
