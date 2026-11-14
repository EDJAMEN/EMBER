import { expect, test } from "@playwright/test";

const PAGES = [
  { path: "/", heading: "Good morning, team", nav: "Overview" },
  { path: "/alerts", heading: "Settlement proximity alerts", nav: "Alerts" },
  { path: "/analytics", heading: "Burn-zone analytics", nav: "Analytics" },
  { path: "/calendar", heading: "Burning calendar", nav: "Burn calendar" },
  { path: "/detections", heading: "Thermal hotspot detections", nav: "Detections" },
  { path: "/ingestion", heading: "NASA FIRMS ingestion", nav: "Ingestion" },
];

for (const { path, heading } of PAGES) {
  test(`${path} renders without errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);

    await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
    await expect(page.locator(".ember-stat-grid .ember-stat")).toHaveCount(4);

    // One card radius, one control radius (DESIGN-CONSISTENCY.md).
    await expect(page.locator(".ember-stat-grid")).toHaveCSS("border-radius", "6px");
    const control = page.locator(".ember-export-button").first();
    if ((await control.count()) > 0) await expect(control).toHaveCSS("border-radius", "5px");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
}

test("navigation reaches every page", async ({ page }) => {
  await page.goto("/");
  for (const { path, heading, nav } of PAGES.slice(1)) {
    await page.getByRole("link", { name: nav, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
  }
});

test("live/sample toggle keeps the map mounted", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "LIVE" }).click();
  await expect(page.locator(".ember-map-canvas")).toBeVisible();
  await page.getByRole("button", { name: "SAMPLE" }).click();
  await expect(page.locator(".ember-map-canvas")).toBeVisible();
});
