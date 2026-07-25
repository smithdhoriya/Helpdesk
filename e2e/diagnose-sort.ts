import { chromium } from "@playwright/test";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

  await page.goto("http://localhost:5173/login");
  await page.getByLabel(/email/i).fill("admin@example.com");
  await page.getByLabel(/password/i).fill("password123");
  await page.getByRole("button", { name: /sign in|log in/i }).click();

  await page.waitForURL(/\/(tickets)?$/, { timeout: 10000 }).catch(() => {});
  await page.goto("http://localhost:5173/tickets");
  await page.waitForSelector("table");
  await page.waitForTimeout(500);

  const subjectCellSelector = "table tbody tr td:first-child";

  const before = await page.locator(subjectCellSelector).allTextContents();
  console.log("BEFORE (default createdAt desc), first 5 subjects:");
  console.log(before.slice(0, 5));

  const requests: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/tickets")) requests.push(req.url());
  });

  const subjectHeaderButton = page.getByRole("button", { name: "Subject" });
  await subjectHeaderButton.click();

  await page.waitForTimeout(1000);

  const after = await page.locator(subjectCellSelector).allTextContents();
  console.log("\nAFTER clicking Subject header, first 5 subjects:");
  console.log(after.slice(0, 5));

  const ariaSort = await page
    .locator("table thead th", { hasText: "Subject" })
    .getAttribute("aria-sort");
  console.log("\naria-sort on Subject header after click:", ariaSort);

  console.log("\n/api/tickets requests fired after click:");
  console.log(requests);

  const changed = JSON.stringify(before) !== JSON.stringify(after);
  console.log("\nRows changed order:", changed);

  const isSortedAsc = after.every(
    (v, i, arr) => i === 0 || arr[i - 1].localeCompare(v) <= 0
  );
  console.log("Rows are alphabetically ascending after click:", isSortedAsc);

  if (consoleErrors.length) {
    console.log("\nConsole/page errors observed:");
    console.log(consoleErrors.slice(0, 20));
  } else {
    console.log("\nNo console/page errors observed.");
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
