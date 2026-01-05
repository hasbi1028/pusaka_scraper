import { EventSource } from "eventsource";
global.EventSource = EventSource as any;

import PocketBase from "pocketbase";
import { scrapeUser } from "./service/scraper";

const pb = new PocketBase(Bun.env.PUBLIC_PB_URL! || "http://localhost:8090/");
pb.autoCancellation(false);

// =======================
// CONFIG
// =======================
const MAX_CONCURRENCY = Bun.env.CONCURRENCY! || 8;
const HEARTBEAT_MS = Bun.env.HEARTBEAT! || 17000;
const STALE_MS = Bun.env.STALE! || 30_000;
const MAX_RETRY = Bun.env.RETRY! || 3;

// =======================
// STATE
// =======================
let running = 0;
let draining = false;

const jobQueue: any[] = [];
const enqueuedJobs = new Set<string>();

// =======================
// UTILS
// =======================
function log(event: string, data: any = {}) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      event,
      running,
      queue: jobQueue.length,
      ...data,
    }),
  );
}

// =======================
// STALE JOB RECOVERY
// =======================
async function recoverStaleJobs() {
  log("recovery_start");

  const stale = await pb.collection("pusaka").getFullList({
    filter: "status='running'",
  });

  const now = Date.now();

  for (const job of stale) {
    const hb = job.heartbeat ? new Date(job.heartbeat).getTime() : 0;
    if (now - hb > STALE_MS) {
      await pb.collection("pusaka").update(job.id, {
        status: "pending",
        error: "Recovered from stale worker",
      });
      log("recovered_job", { jobId: job.id, nip: job.nip });
    }
  }
}

// =======================
// HEARTBEAT
// =======================
function startHeartbeat(job: any) {
  let lastProgress = Date.now();

  const markProgress = () => {
    lastProgress = Date.now();
  };

  const sendHeartbeat = async () => {
    try {
      await pb.collection("pusaka").update(job.id, {
        heartbeat: new Date().toISOString(),
        progress_age_ms: Date.now() - lastProgress,
      });
    } catch {}
  };

  sendHeartbeat();
  const interval = setInterval(sendHeartbeat, HEARTBEAT_MS);

  return {
    markProgress,
    stop: () => clearInterval(interval),
  };
}

// =======================
// JOB HANDLER
// =======================
async function handleJob(job: any) {
  const start = Date.now();
  log("job_start", { jobId: job.id, nip: job.nip });

  await pb.collection("pusaka").update(job.id, { status: "running" });

  const hb = startHeartbeat(job);

  try {
    const res = await scrapeUser({
      nip: job.nip,
      password: job.password,
      onProgress: hb.markProgress,
    });

    if (res.status !== "OK") {
      throw res;
    }

    await pb.collection("pusaka").update(job.id, {
      nip: res.nip,
      nama: job.nama || "",
      tanggal: res.tanggal || "",
      jam_masuk: res.jamMasuk || "",
      jam_pulang: res.jamPulang || "",
      status: "success",
      error: "",
      duration_ms: Date.now() - start,
    });

    log("job_success", { jobId: job.id, nip: job.nip });
  } catch (err: any) {
    const retry = (job.retry ?? 0) + 1;
    const retryable = ["TIMEOUT", "SELECTOR"].includes(err?.errorType) ?? false;

    await pb.collection("pusaka").update(job.id, {
      status: retry >= MAX_RETRY || !retryable ? "failed" : "pending",
      retry,
      error: err?.error || err?.message || "Unknown error",
      duration_ms: Date.now() - start,
    });

    log("job_error", {
      jobId: job.id,
      nip: job.nip,
      retry,
      error: err?.errorType || err?.message,
    });
  } finally {
    hb.stop();
    enqueuedJobs.delete(job.id);
  }
}

// =======================
// QUEUE DRAIN LOOP
// =======================
async function processQueue() {
  if (draining) return;
  draining = true;

  try {
    while (running < MAX_CONCURRENCY && jobQueue.length > 0) {
      const job = jobQueue.shift();
      if (!job) break;

      running++;

      handleJob(job)
        .catch(() => {})
        .finally(() => {
          running--;
          processQueue();
        });
    }
  } finally {
    draining = false;
  }
}

// =======================
// SSE SUBSCRIBE
// =======================
function subscribeJobs() {
  log("sse_subscribe");

  pb.collection("pusaka").subscribe("*", (e) => {
    if (e.action !== "update") return;

    const job = e.record;
    if (job.status !== "pending") return;
    if (enqueuedJobs.has(job.id)) return;

    enqueuedJobs.add(job.id);
    jobQueue.push(job);

    // fairness: job retry kecil dulu
    jobQueue.sort((a, b) => (a.retry ?? 0) - (b.retry ?? 0));

    log("job_enqueued", { jobId: job.id, nip: job.nip });
    processQueue();
  });
}

// =======================
// REALTIME START
// =======================
async function startRealtime() {
  await recoverStaleJobs();
  subscribeJobs();

  pb.realtime.onDisconnect = () => {
    log("sse_disconnect");
    setTimeout(startRealtime, 2000);
  };
}

// =======================
// BOOTSTRAP
// =======================
console.log("🟢 Worker Orchestrator started");

await pb
  .collection("users")
  .authWithPassword("199210282025211017", "qwerty1028");

await startRealtime();
