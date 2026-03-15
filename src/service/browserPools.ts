import { chromium, type Browser } from "playwright";

let browser: Browser | null = null;
let currentHeadlessMode: boolean = true;

export async function getBrowser(headless: boolean = true): Promise<Browser> {
  // Jika browser sudah ada tapi modenya berubah, tutup dulu
  if (browser && currentHeadlessMode !== headless) {
    console.log(`[SYSTEM] Mode browser berubah ke ${headless ? 'Headless' : 'Headed'}, me-restart browser...`);
    await browser.close();
    browser = null;
  }

  if (!browser) {
    currentHeadlessMode = headless;
    browser = await chromium.launch({
      headless: headless,
      slowMo: headless ? 1700 : 500, // Jika headed, buat sedikit lebih cepat agar enak dilihat
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

export async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}
