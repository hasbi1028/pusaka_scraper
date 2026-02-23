import { scrapeUser } from "./service/scraper";

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

const API_BASE = Bun.env.API_BASE_URL || "http://localhost:8080";
const WORKER_TOKEN = Bun.env.WORKER_TOKEN || "dev-worker-token";
const WORKER_ID = Bun.env.WORKER_ID || `worker-${Math.random().toString(36).slice(2, 8)}`;

function envInt(name: string, fallback: number): number {
  const raw = Bun.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const MAX_CONCURRENCY = envInt("CONCURRENCY", 4);
const HEARTBEAT_MS = envInt("HEARTBEAT", 17_000);
const IDLE_POLL_MS = envInt("IDLE_POLL_MS", 1500);

let running = 0;

function log(event: string, data: Record<string, unknown> = {}) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      event,
      running,
      workerId: WORKER_ID,
      ...data,
    }),
  );
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
    body: JSON.stringify({ worker_id: WORKER_ID, capacity: Math.max(1, MAX_CONCURRENCY - running) }),
  })) as ClaimResponse;

  return body.job;
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
        log("heartbeat_error", { jobId: job.id, error: err.message });
      });
    }, HEARTBEAT_MS);

    const result = await scrapeUser({
      nip: job.nip,
      password: job.password,
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
      return;
    }

    const retryable = ["TIMEOUT", "SELECTOR"].includes(result.errorType);
    await api(`/api/v1/worker/jobs/${job.id}/fail`, {
      method: "POST",
      body: JSON.stringify({
        error_type: result.errorType,
        error_message: result.error,
        duration_ms: Date.now() - start,
        retryable,
      }),
    });

    log("job_failed", {
      jobId: job.id,
      nip: job.nip,
      errorType: result.errorType,
      retryable,
    });
  } catch (err: any) {
    try {
      await api(`/api/v1/worker/jobs/${job.id}/fail`, {
        method: "POST",
        body: JSON.stringify({
          error_type: "WORKER_ERROR",
          error_message: err?.message || "unknown worker error",
          duration_ms: Date.now() - start,
          retryable: true,
        }),
      });
    } catch {}

    log("job_error", {
      jobId: job.id,
      nip: job.nip,
      error: err?.message || "unknown",
    });
  } finally {
    if (timer) clearInterval(timer);
  }
}

async function loop() {
  while (true) {
    try {
      if (running >= MAX_CONCURRENCY) {
        await Bun.sleep(250);
        continue;
      }

      const job = await claimJob();
      if (!job) {
        await Bun.sleep(IDLE_POLL_MS);
        continue;
      }

      running++;
      runJob(job)
        .catch((err) => {
          log("run_job_crash", { error: err.message });
        })
        .finally(() => {
          running--;
        });
    } catch (err: any) {
      log("poll_error", { error: err?.message || "unknown" });
      await Bun.sleep(2000);
    }
  }
}

log("worker_started", { apiBase: API_BASE, maxConcurrency: MAX_CONCURRENCY });
await loop();
