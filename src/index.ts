import { scrapeUser } from "./service/scraper";
import { EventSource } from "eventsource";

type ClaimedJob = {
  id: string;
  nip: string;
  nama?: string;
  password: string;
  retry?: number;
};

type ClaimResponse = {
  job: ClaimedJob | null;
};

const API_BASE = Bun.env.API_BASE_URL || "http://localhost:5173";
const WORKER_TOKEN = Bun.env.WORKER_TOKEN || "dev-worker-token";
const WORKER_ID = Bun.env.WORKER_ID || `worker-${Math.random().toString(36).slice(2, 8)}`;

function envInt(name: string, fallback: number): number {
  const raw = Bun.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

let activeConcurrency = envInt("CONCURRENCY", 5);
const HEARTBEAT_MS = envInt("HEARTBEAT", 17_000);

let running = 0;

function log(event: string, data: Record<string, unknown> = {}) {
  const ts = new Date().toLocaleTimeString();
  const active = `[Active: ${running}/${activeConcurrency}]`;
  const jobId = data.jobId ? `| Job: ${String(data.jobId).slice(0, 6)}...` : '';
  const nip = data.nip ? `| NIP: ${data.nip}` : '';
  
  console.log(`${active} [${ts}] ${event.toUpperCase().padEnd(12)} ${nip} ${jobId}`);
}

function logError(event: string, err: any, data: Record<string, unknown> = {}) {
  const ts = new Date().toLocaleTimeString();
  const active = `[Active: ${running}/${activeConcurrency}]`;
  const msg = err?.message || err;
  
  console.error(`${active} [${ts}] ERROR: ${event.toUpperCase()} | ${msg}`);
}

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Worker-Token": WORKER_TOKEN,
      ...(init.headers || {}),
    },
  });

  if (!res.ok && res.status !== 204) {
    const body = await res.text();
    throw new Error(`API ${path} failed (${res.status}): ${body}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

async function claimJob(): Promise<ClaimedJob | null> {
  const body = (await api("/api/v1/worker/jobs/claim", {
    method: "POST",
    body: JSON.stringify({ worker_id: WORKER_ID }),
  })) as ClaimResponse;

  return body.job;
}

async function getSettings(): Promise<{ headless: boolean, maxConcurrency: number }> {
  try {
    const res = await api("/api/v1/admin/settings");
    return {
      headless: !res.headedMode,
      maxConcurrency: res.maxConcurrency || 5
    };
  } catch {
    return { headless: true, maxConcurrency: 5 };
  }
}

async function runJob(job: ClaimedJob) {
  const start = Date.now();
  let lastProgress = Date.now();
  let timer: ReturnType<typeof setInterval> | null = null;

  const sendHeartbeat = async () => {
    await api(`/api/v1/worker/jobs/${job.id}/heartbeat`, {
      method: "POST",
      body: JSON.stringify({ progress_age_ms: Date.now() - lastProgress }),
    });
  };

  try {
    log("job_start", { jobId: job.id, nip: job.nip });
    await sendHeartbeat();
    timer = setInterval(() => {
      sendHeartbeat().catch((err) => {
        logError("heartbeat_error", err, { jobId: job.id });
      });
    }, HEARTBEAT_MS);

    // Ambil setting terbaru
    const settings = await getSettings();
    activeConcurrency = settings.maxConcurrency;

    const result = await scrapeUser({
      nip: job.nip,
      password: job.password,
      headless: settings.headless,
      onProgress: () => {
        lastProgress = Date.now();
      },
    });

    if (result.status === "OK") {
      await api(`/api/v1/worker/jobs/${job.id}/success`, {
        method: "POST",
        body: JSON.stringify({
          tanggal: result.tanggal || "",
          jam_masuk: result.jamMasuk || "",
          jam_pulang: result.jamPulang || "",
          duration_ms: Date.now() - start,
        }),
      });

      log("job_success", { jobId: job.id, nip: job.nip });
    } else {
      await api(`/api/v1/worker/jobs/${job.id}/fail`, {
        method: "POST",
        body: JSON.stringify({
          error_type: result.errorType,
          error_message: result.error,
          duration_ms: Date.now() - start,
        }),
      });

      log("job_failed", { jobId: job.id, nip: job.nip, errorType: result.errorType });
    }
  } catch (err: any) {
    log("job_error", { jobId: job.id, nip: job.nip, error: err?.message || "unknown" });
  } finally {
    if (timer) clearInterval(timer);
    running--;
    processQueue();
  }
}

async function processQueue() {
  const settings = await getSettings();
  activeConcurrency = settings.maxConcurrency;

  if (running >= activeConcurrency) {
    log("queue_skip", { reason: "at_max_concurrency" });
    return;
  }

  try {
    const job = await claimJob();
    if (job) {
      log("job_claimed", { jobId: job.id, nip: job.nip });
      running++;
      runJob(job);
      if (running < activeConcurrency) {
        processQueue();
      }
    } else {
      log("queue_empty");
    }
  } catch (err: any) {
    logError("claim_error", err);
  }
}

function startSSE() {
  const sseUrl = new URL(`${API_BASE}/api/v1/worker/jobs/stream`);
  sseUrl.searchParams.set("token", WORKER_TOKEN);

  log("sse_connecting", { url: sseUrl.toString() });
  
  const es = new EventSource(sseUrl.toString());

  es.onopen = () => {
    log("sse_open", { status: "connected" });
  };

  es.addEventListener("update", () => {
    log("sse_update_received", { action: "checking_queue" });
    processQueue();
  });

  es.addEventListener("connected", (e) => {
    log("sse_event_connected", { data: e.data });
    processQueue();
  });

  es.onerror = (err: any) => {
    logError("sse_connection_error", err);
  };
}

log("worker_started", { apiBase: API_BASE, maxConcurrency: activeConcurrency });

setTimeout(startSSE, 3000);

setInterval(processQueue, 5 * 60 * 1000);
