// Shared settings for the end-to-end scripts. Override with environment variables.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

export const BASE = process.env.BASE_URL ?? "http://localhost:3000";
export const OUT = process.env.E2E_OUT ?? "tests/e2e/.out"; // screenshots
export const FIXTURES = "tests/e2e/fixtures";
export const INBOUND_SECRET = process.env.INBOUND_EMAIL_SECRET ?? "change-me-inbound-secret";
export const CRON_SECRET = process.env.CRON_SECRET ?? "dev-cron-secret";
mkdirSync(OUT, { recursive: true });

/** uses Playwright's bundled Chromium, or CHROMIUM_PATH if set */
export const launch = () => chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

/** Click and wait for `done` to appear; retries if the click landed before the page finished hydrating. */
export async function clickUntil(page, button, done, tries = 3) {
  for (let i = 1; ; i++) {
    await page.click(button);
    try { await page.locator(done).first().waitFor({ timeout: 8000 }); return; } catch (e) { if (i >= tries) throw e; }
  }
}
