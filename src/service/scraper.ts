import fs from "fs";
import type { Page, BrowserContext } from "playwright";
import { getBrowser } from "./browserPools";

// =======================
// TYPES
// =======================
type ScrapeUserInput = {
  nip: string;
  password: string;
  headless?: boolean;
  onProgress?: () => void;
};

type ScrapeResult =
  | {
      status: "OK";
      nip: string;
      tanggal: string;
      jamMasuk: string | null;
      jamPulang: string | null;
    }
  | {
      status: "ERROR";
      nip: string;
      errorType:
        | "LOGIN_FAILED"
        | "TIMEOUT"
        | "SELECTOR"
        | "BLOCKED"
        | "UNKNOWN";
      error: string;
    };

// =======================
// UTILS
// =======================
function log(nip: string, msg: string, data: Record<string, any> = {}) {
  // Hanya tampilkan log ekstraksi sukses
  if (msg.includes("extracted successfully")) {
    const ts = new Date().toLocaleTimeString();
    console.log(`[${ts}] [SUCCESS] ${nip} | Masuk: ${data.jamMasuk || '--:--'}, Pulang: ${data.jamPulang || '--:--'}`);
  }
}

function logError(nip: string, msg: string, err: any) {
  const ts = new Date().toLocaleTimeString();
  const errMsg = err?.message || err || 'Unknown error';
  console.error(`[${ts}] [FAILED]  ${nip} | ${msg}: ${errMsg}`);
}

async function humanDelay(min = 800, max = 2200) {
  const delay = Math.floor(Math.random() * (max - min) + min);
  await new Promise((r) => setTimeout(r, delay));
}

async function safeGoto(page: Page, url: string, nip: string, retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      log(nip, `Goto ${url} (${i + 1})`);
      await page.goto(url, { timeout: 15_000, waitUntil: "load" });
      return true;
    } catch (e: any) {
      log(nip, `Goto failed: ${e.message}`);
      await humanDelay();
    }
  }
  return false;
}

// =======================
// STEALTH
// =======================
async function applyStealth(context: BrowserContext) {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });

    (globalThis as any).chrome = {
      runtime: {},
    };

    Object.defineProperty(navigator, "languages", {
      get: () => ["id-ID", "id"],
    });

    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4, 5],
    });
  });
}

// =======================
// MAIN SCRAPER
// =======================
export async function scrapeUser(
  input: ScrapeUserInput
): Promise<ScrapeResult> {
  const { nip, password, onProgress, headless = true } = input;
  const browser = await getBrowser(headless);
  const statePath = `state/state-${nip}.json`;

  // Device fingerprint (semi-mobile)
  const userAgent = `Mozilla/5.0 (Linux; Android ${Math.floor(
    Math.random() * 5 + 10
  )}; Pixel ${Math.floor(
    Math.random() * 5 + 5
  )}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${Math.floor(
    Math.random() * 20 + 110
  )}.0.0.0 Mobile Safari/537.36`;

  const device = {
    userAgent,
    viewport: { width: 393, height: 1451 },
    deviceScaleFactor: 2.75,
    hasTouch: true,
    permissions: ["geolocation"],
  };

  let context: BrowserContext | null = null;

  try {
    context = await browser.newContext(
      fs.existsSync(statePath) ? { ...device, storageState: statePath } : device
    );

    await applyStealth(context);

    // block heavy assets
    await context.route("**/*", (route) => {
      const t = route.request().resourceType();
      if (["image", "media", "font"].includes(t)) return route.abort();
      route.continue();
    });

    const page = await context.newPage();

    // =======================
    // OPEN PAGE
    // =======================
    const ok = await safeGoto(
      page,
      "https://pusaka-v3.kemenag.go.id/profile/presence",
      nip
    );
    if (!ok) {
      log(nip, "Goto presence page failed", { url: page.url() });
      return {
        status: "ERROR",
        nip,
        errorType: "TIMEOUT",
        error: "Gagal membuka halaman presensi",
      };
    }

    onProgress?.();
    await page.waitForLoadState("networkidle");
    await humanDelay();

    // =======================
    // LOGIN (IF NEEDED)
    // =======================
    if (page.url().includes("/login")) {
      log(nip, "Session expired, performing re-login");

      if (!nip || !password) {
        throw new Error("NIP atau Password kosong, tidak bisa login");
      }

      await page.fill('[name="email"]', String(nip));
      await humanDelay(300, 800);
      await page.fill('[name="password"]', String(password));
      await humanDelay(300, 800);
      await page.click("button[type=submit]");

      try {
        await page.waitForURL("https://pusaka-v3.kemenag.go.id/**", {
          timeout: 20_000,
          waitUntil: "networkidle",
        });
        log(nip, "Login successful, saving session state");
      } catch (e: any) {
        logError(nip, "Login failed or blocked", e);
        return {
          status: "ERROR",
          nip,
          errorType: "LOGIN_FAILED",
          error: "Login gagal atau diblokir",
        };
      }

      await context.storageState({ path: statePath });
      await safeGoto(
        page,
        "https://pusaka-v3.kemenag.go.id/profile/presence",
        nip
      );
    }

    onProgress?.();

    // =======================
    // OPEN RIWAYAT PRESENSI (RETRY)
    // =======================
    let opened = false;
    for (let i = 0; i < 3; i++) {
      try {
        await page.waitForLoadState("networkidle");
        await humanDelay();

        log(nip, "Attempting to click Riwayat Presensi", { attempt: i + 1 });
        const btn = page
          .locator(
            "button:has-text('Riwayat Presensi'), a:has-text('Riwayat Presensi')"
          )
          .first();

        await btn.click();
        await page.waitForSelector("div.bg-slate-50", { timeout: 15_000 });
        opened = true;
        log(nip, "Riwayat Presensi opened successfully");
        break;
      } catch (e: any) {
        log(nip, "Retry clicking Riwayat Presensi", { attempt: i + 1, error: e.message });
        await page.reload({ waitUntil: "networkidle" });
      }
    }

    if (!opened) {
      logError(nip, "Failed to open Riwayat Presensi after retries", null);
      return {
        status: "ERROR",
        nip,
        errorType: "SELECTOR",
        error: "Tidak bisa membuka Riwayat Presensi",
      };
    }

    onProgress?.();

    // =======================
    // EXTRACT DATA
    // =======================
    log(nip, "Extracting presence data from page");
    const box = page.locator("div.bg-slate-50").first();

    const tanggal =
      (await box.locator("p").first().textContent())?.trim() || "";

    const jamMasuk =
      (
        await box
          .locator('div:has(p:has-text("Jam Masuk")) p.font-bold')
          .first()
          .textContent()
      )?.trim() || null;

    const jamPulang =
      (
        await box
          .locator('div:has(p:has-text("Jam Pulang")) p.font-bold')
          .first()
          .textContent()
          .catch(() => null)
      )?.trim() || null;

    log(nip, "Data extracted successfully", { tanggal, jamMasuk, jamPulang });
    onProgress?.();

    return {
      status: "OK",
      nip,
      tanggal,
      jamMasuk,
      jamPulang,
    };
  } catch (e: any) {
    logError(nip, "Uncaught scraping exception", e);
    return {
      status: "ERROR",
      nip,
      errorType: "UNKNOWN",
      error: e?.message || "Unknown error",
    };
  } finally {
    if (context) await context.close();
  }
}
