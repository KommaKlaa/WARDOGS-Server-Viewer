"use strict";

/**
 * Single global upstream HTTP scheduler.
 * Enforces concurrency, min start spacing, and 429 backoff for ALL upstream calls.
 */

function parseRetryAfterHeader(value, fromMs) {
  if (value == null || value === "") return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d+(\.\d+)?$/.test(raw)) {
    return fromMs + Number(raw) * 1000;
  }
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) return parsed;
  return null;
}

function consecutiveBackoffMs(consecutive429) {
  // 1st→5s, 2nd→10s, 3rd→20s, 4th→40s, then cap 60s
  const n = Math.max(1, Number(consecutive429) || 1);
  const ms = 5000 * 2 ** (n - 1);
  return Math.min(60_000, ms);
}

function createUpstreamScheduler({
  maxConcurrent = 2,
  minStartIntervalMs = 350,
  now = () => Date.now(),
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms))),
} = {}) {
  let active = 0;
  let lastStartAt = 0;
  let rateLimitUntil = 0;
  let consecutive429 = 0;
  /** @type {Array<{ run: Function, resolve: Function, reject: Function }>} */
  const queue = [];
  let loopRunning = false;

  const metrics = {
    UPSTREAM_REQUEST_TOTAL: 0,
    UPSTREAM_429_TOTAL: 0,
    UPSTREAM_QUEUE_DEPTH: 0,
    UPSTREAM_ACTIVE: 0,
  };

  function syncQueueMetric() {
    metrics.UPSTREAM_QUEUE_DEPTH = queue.length;
    metrics.UPSTREAM_ACTIVE = active;
  }

  function note429(res) {
    consecutive429 += 1;
    metrics.UPSTREAM_429_TOTAL += 1;
    const header =
      res && res.headers && typeof res.headers.get === "function"
        ? res.headers.get("retry-after") || res.headers.get("Retry-After")
        : null;
    const fromRetry = parseRetryAfterHeader(header, now());
    const until =
      fromRetry != null ? fromRetry : now() + consecutiveBackoffMs(consecutive429);
    rateLimitUntil = Math.max(rateLimitUntil, until);
  }

  function noteSuccess() {
    consecutive429 = 0;
  }

  function schedule(run) {
    return new Promise((resolve, reject) => {
      queue.push({ run, resolve, reject });
      syncQueueMetric();
      pump();
    });
  }

  async function pump() {
    if (loopRunning) return;
    loopRunning = true;
    try {
      while (queue.length > 0) {
        if (active >= maxConcurrent) {
          await wait(20);
          continue;
        }

        const waitRate = Math.max(0, rateLimitUntil - now());
        const waitSpacing = Math.max(0, lastStartAt + minStartIntervalMs - now());
        const delay = Math.max(waitRate, waitSpacing);
        if (delay > 0) {
          await wait(delay);
          continue;
        }

        const job = queue.shift();
        if (!job) break;
        syncQueueMetric();

        active += 1;
        lastStartAt = now();
        metrics.UPSTREAM_REQUEST_TOTAL += 1;
        syncQueueMetric();

        Promise.resolve()
          .then(() => job.run())
          .then(
            (res) => {
              if (res && res.status === 429) note429(res);
              else if (res && (res.ok || res.status === 304 || res.status === 404)) {
                noteSuccess();
              }
              job.resolve(res);
            },
            (err) => job.reject(err)
          )
          .finally(() => {
            active -= 1;
            syncQueueMetric();
            pump();
          });
      }
    } finally {
      loopRunning = false;
      if (queue.length > 0 && active < maxConcurrent) {
        queueMicrotask(() => pump());
      }
    }
  }

  function getState() {
    return {
      active,
      queueDepth: queue.length,
      lastStartAt,
      rateLimitUntil,
      consecutive429,
      maxConcurrent,
      minStartIntervalMs,
      metrics: { ...metrics },
    };
  }

  /** Test helper */
  function _setRateLimitUntil(ts) {
    rateLimitUntil = ts;
  }

  return {
    schedule,
    note429,
    noteSuccess,
    parseRetryAfterHeader,
    consecutiveBackoffMs,
    getState,
    _setRateLimitUntil,
    metrics,
  };
}

module.exports = {
  createUpstreamScheduler,
  parseRetryAfterHeader,
  consecutiveBackoffMs,
};
