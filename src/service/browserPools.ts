import { chromium, type Browser } from "playwright";

let browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({
      headless: false,
      slowMo: 1700,
      args: [
        "--no-sandbox",
        "--disable-gpu",
        "--force-time-zone=Asia/Makassar",
        "--disable-dev-shm-usage",
      ],
    });
  }
  return browser;
}
