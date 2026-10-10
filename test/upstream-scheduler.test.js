"use strict";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  createUpstreamScheduler,
  parseRetryAfterHeader,
  consecutiveBackoffMs,
} = require("../lib/upstream-scheduler");
const { createUpstreamCache } = require("../lib/upstream-cache");

function mockResponse(status, body, headers = {}) {
  const headerMap = {};
  for (const [k, v] of Object.entries(headers)) {
    headerMap[k.toLowerCase()] = v;
  }
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get(name) {
        return headerMap[String(name).toLowerCase()] || null;
      },
    },
    async text() {
      if (body == null) return "";
      return typeof body === "string" ? body : JSON.stringify(body);
    },
  };
}

describe("upstream scheduler", () => {
  let clock;
  let waits;

  beforeEach(() => {
    clock = 1_000_000;
    waits = [];
  });

  function makeSched(opts = {}) {
    return createUpstreamScheduler({
      maxConcurrent: 2,
      minStartIntervalMs: 350,
      now: () => clock,
      wait: async (ms) => {
        waits.push(ms);
        clock += ms;
      },
      ...opts,
    });
  }

  it("GLOBAL_CONCURRENCY_MAX_2", async () => {
    const sched = makeSched();
    let active = 0;
    let peak = 0;
    const startJob = () =>
      sched.schedule(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await Promise.resolve();
        active -= 1;
        return mockResponse(200, { ok: true });
      });

    await Promise.all([startJob(), startJob(), startJob(), startJob(), startJob()]);
    assert.ok(peak <= 2, `peak concurrency ${peak}`);
  });

  it("MIN_START_INTERVAL_350MS", async () => {
    const starts = [];
    const sched = makeSched({ maxConcurrent: 1 });
    const job = () =>
      sched.schedule(async () => {
        starts.push(clock);
        return mockResponse(200, {});
      });
    await job();
    await job();
    await job();
    assert.ok(starts[1] - starts[0] >= 350);
    assert.ok(starts[2] - starts[1] >= 350);
  });

  it("429_RETRY_AFTER_SECONDS", () => {
    const until = parseRetryAfterHeader("12", 1_000_000);
    assert.equal(until, 1_000_000 + 12_000);
  });

  it("429_RETRY_AFTER_HTTP_DATE", () => {
    const date = new Date(1_000_000 + 30_000).toUTCString();
    const until = parseRetryAfterHeader(date, 1_000_000);
    assert.equal(until, 1_000_000 + 30_000);
  });

  it("429_BACKOFF_5S", () => {
    assert.equal(consecutiveBackoffMs(1), 5_000);
  });

  it("429_BACKOFF_10S", () => {
    assert.equal(consecutiveBackoffMs(2), 10_000);
  });

  it("429_BACKOFF_MAX_60S", () => {
    assert.equal(consecutiveBackoffMs(4), 40_000);
    assert.equal(consecutiveBackoffMs(5), 60_000);
    assert.equal(consecutiveBackoffMs(10), 60_000);
  });

  it("applies Retry-After and blocks further starts", async () => {
    const sched = makeSched({ maxConcurrent: 1 });
    await sched.schedule(async () => mockResponse(429, {}, { "retry-after": "5" }));
    const state = sched.getState();
    assert.equal(state.consecutive429, 1);
    assert.equal(state.rateLimitUntil, clock + 5_000);

    const starts = [];
    const p = sched.schedule(async () => {
      starts.push(clock);
      return mockResponse(200, {});
    });
    await p;
    assert.ok(starts[0] >= state.rateLimitUntil);
  });
});

describe("upstream cache hardening", () => {
  let clock;
  let calls;
  let urls;

  beforeEach(() => {
    clock = 2_000_000;
    calls = 0;
    urls = [];
  });

  function makeCache(handler) {
    return createUpstreamCache({
      now: () => clock,
      wait: async (ms) => {
        clock += ms;
      },
      detailTtlMs: 10 * 60_000,
      eventsTtlMs: 2 * 60_000,
      regionsTtlMs: 30 * 60_000,
      maxConcurrentUpstream: 2,
      minRequestStartIntervalMs: 350,
      fetchImpl: async (url) => {
        calls += 1;
        urls.push(url);
        return handler(url);
      },
    });
  }

  it("429_STALE_CACHE_FALLBACK", async () => {
    let mode = "ok";
    const cache = makeCache(() => {
      if (mode === "ok") {
        return mockResponse(
          200,
          { data: [{ id: "a" }], meta: { refreshSeconds: 60 } },
          { etag: '"e1"' }
        );
      }
      return mockResponse(429, { error: { message: "slow down" } }, { "retry-after": "5" });
    });
    await cache.getSnapshot();
    clock += 120_000;
    mode = "429";
    const body = await cache.getSnapshot();
    assert.equal(body._warning, "rate_limited_using_cache");
    assert.equal(body.meta.stale, true);
    assert.equal(body.data[0].id, "a");
  });

  it("MANUAL_REFRESH_NO_BYPASS", async () => {
    const cache = makeCache(() =>
      mockResponse(
        200,
        { data: [], meta: { refreshSeconds: 120 } },
        { etag: '"x"' }
      )
    );
    await cache.getSnapshot();
    const before = calls;
    // Manual / repeated getSnapshot within refreshSeconds must not hit upstream.
    await cache.getSnapshot();
    await cache.getSnapshot();
    assert.equal(calls, before);
  });

  it("DETAIL_CACHE_10_MIN", async () => {
    const cache = makeCache(() =>
      mockResponse(200, { data: { id: "s1", level: { min: 0, max: 50 } } })
    );
    await cache.getServerDetail("s1");
    const before = calls;
    clock += 9 * 60_000;
    const again = await cache.getServerDetail("s1");
    assert.equal(again.cached, true);
    assert.equal(calls, before);
    clock += 2 * 60_000;
    await cache.getServerDetail("s1");
    assert.equal(calls, before + 1);
  });

  it("HISTORY_CACHE_2_MIN", async () => {
    const cache = makeCache(() =>
      mockResponse(200, { data: { events: [{ type: "map", at: "2026-10-03T18:00:00Z" }] } })
    );
    await cache.getServerEvents("join1");
    const before = calls;
    clock += 90_000;
    assert.equal((await cache.getServerEvents("join1")).cached, true);
    assert.equal(calls, before);
    clock += 40_000;
    await cache.getServerEvents("join1");
    assert.equal(calls, before + 1);
  });

  it("REGIONS_CACHE", async () => {
    const cache = makeCache(() =>
      mockResponse(200, { data: [{ id: "eu-west" }] })
    );
    await cache.getRegions();
    const before = calls;
    clock += 20 * 60_000;
    await cache.getRegions();
    assert.equal(calls, before);
    clock += 15 * 60_000;
    await cache.getRegions();
    assert.equal(calls, before + 1);
  });

  it("DETAIL_INFLIGHT_DEDUP", async () => {
    let inflight = 0;
    let peak = 0;
    const cache = makeCache(async () => {
      inflight += 1;
      peak = Math.max(peak, inflight);
      await Promise.resolve();
      inflight -= 1;
      return mockResponse(200, { data: { id: "dup" } });
    });
    const results = await Promise.all([
      cache.getServerDetail("dup"),
      cache.getServerDetail("dup"),
      cache.getServerDetail("dup"),
    ]);
    assert.equal(calls, 1);
    assert.ok(peak <= 1);
    assert.ok(results.every((r) => r.body?.data?.id === "dup"));
  });

  it("HISTORY_INFLIGHT_DEDUP", async () => {
    const cache = makeCache(async () => {
      await Promise.resolve();
      return mockResponse(200, { data: { events: [] } });
    });
    await Promise.all([
      cache.getServerEvents("j9"),
      cache.getServerEvents("j9"),
      cache.getServerEvents("j9"),
    ]);
    assert.equal(calls, 1);
  });
});

describe("frontend pacing contracts", () => {
  const fs = require("fs");
  const path = require("path");
  const appJs = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");

  it("FILTER_CHANGE_NO_SNAPSHOT_REFETCH", () => {
    // Filter/sort/language path uses refreshView, not loadServers.
    assert.match(appJs, /async function refreshView/);
    assert.match(appJs, /setLanguage\(lang,/);
    assert.ok(appJs.includes("refreshView({ allowEnrichment"));
  });

  it("LANGUAGE_CHANGE_NO_UPSTREAM_REFETCH", () => {
    assert.match(appJs, /function setLanguage\(lang,/);
    assert.match(appJs, /if \(refresh\) refreshView\(\)/);
    // Language buttons call setLanguage only — not loadServers.
    assert.match(
      appJs,
      /langDe\.addEventListener\("click", \(\) => setLanguage\("de"\)\)/
    );
    assert.match(
      appJs,
      /langEn\.addEventListener\("click", \(\) => setLanguage\("en"\)\)/
    );
  });

  it("SORT_CHANGE_NO_UPSTREAM_REFETCH", () => {
    assert.match(appJs, /els\.sortMode/);
    assert.match(appJs, /const onChange = \(\) => \{/);
    assert.match(appJs, /saveSettings\(\);\s*\n\s*refreshView\(\);/);
    assert.ok(!/sortMode[\s\S]{0,80}loadServers\(/.test(appJs));
  });

  it("ONE_AUTO_REFRESH_TIMER", () => {
    assert.match(appJs, /function scheduleRefresh\(\)/);
    assert.match(appJs, /if \(refreshTimer\) clearTimeout\(refreshTimer\)/);
    assert.match(appJs, /refreshTimer = setTimeout/);
    assert.match(appJs, /function startAgeClock\(\)/);
    assert.match(appJs, /if \(clockTimer\) clearInterval\(clockTimer\)/);
    // Age clock updates from cached mapAt only.
    const ageClock = appJs.match(
      /function startAgeClock\(\) \{[\s\S]*?\n  \}/
    );
    assert.ok(ageClock, "startAgeClock block present");
    assert.match(ageClock[0], /renderCachedView\(\)/);
    assert.equal(ageClock[0].includes("loadServers"), false);
    assert.equal(ageClock[0].includes("refreshView"), false);
  });

  it("MAP_AGE_COUNTS_WITHOUT_HISTORY_REFETCH", () => {
    assert.match(appJs, /Date\.now\(\) - at/);
    assert.match(appJs, /renderCachedView\(\)/);
    assert.match(appJs, /no history refetch/i);
  });

  it("enrichment window reduced", () => {
    assert.match(appJs, /ENRICH_CANDIDATE_LIMIT = 50/);
    assert.match(appJs, /ENRICH_CONCURRENCY = 2/);
  });
});
