"use strict";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { createUpstreamCache } = require("../lib/upstream-cache");

function mockResponse(status, body, headers = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get(name) {
        return headers[name.toLowerCase()] || headers[name] || null;
      },
    },
    async text() {
      if (body == null) return "";
      return typeof body === "string" ? body : JSON.stringify(body);
    },
  };
}

describe("shared upstream cache", () => {
  let calls;
  let cache;
  let clock;

  beforeEach(() => {
    calls = 0;
    clock = 1_000_000;
    cache = createUpstreamCache({
      now: () => clock,
      fetchImpl: async (url, opts) => {
        calls += 1;
        if (opts?.headers?.["If-None-Match"] === '"etag-1"') {
          return mockResponse(304, null, { etag: '"etag-1"' });
        }
        return mockResponse(
          200,
          {
            data: [{ id: "s1", region: "eu-west" }],
            meta: { refreshSeconds: 60, stale: false },
          },
          { etag: '"etag-1"' }
        );
      },
    });
  });

  it("first request may refresh upstream", async () => {
    const body = await cache.getSnapshot();
    assert.equal(calls, 1);
    assert.equal(body.data.length, 1);
  });

  it("second request within TTL does not refresh again", async () => {
    await cache.getSnapshot();
    const before = calls;
    const body = await cache.getSnapshot();
    assert.equal(calls, before);
    assert.equal(body._cache, true);
  });

  it("parallel expired requests trigger only one refresh", async () => {
    cache._seedSnapshot(
      { data: [], meta: { refreshSeconds: 60 } },
      { fetchedAt: clock - 120_000, etag: '"old"' }
    );
    // Force expired + no matching etag short-circuit for this test by clearing etag
    cache._snapshotCache.etag = null;

    calls = 0;
    const results = await Promise.all([
      cache.getSnapshot(),
      cache.getSnapshot(),
      cache.getSnapshot(),
      cache.getSnapshot(),
      cache.getSnapshot(),
      cache.getSnapshot(),
      cache.getSnapshot(),
      cache.getSnapshot(),
      cache.getSnapshot(),
      cache.getSnapshot(),
    ]);
    assert.equal(calls, 1);
    assert.ok(results.every((r) => Array.isArray(r.data)));
  });

  it("preserves ETag / 304 handling", async () => {
    await cache.getSnapshot();
    assert.equal(cache._snapshotCache.etag, '"etag-1"');
    clock += 120_000;
    const before = calls;
    const body = await cache.getSnapshot();
    assert.equal(calls, before + 1);
    assert.ok(body.data);
  });

  it("caches live network stats from /v1/stats", async () => {
    let statsCalls = 0;
    const statsCache = createUpstreamCache({
      now: () => clock,
      fetchImpl: async (url) => {
        if (String(url).includes("/v1/stats")) {
          statsCalls += 1;
          return mockResponse(
            200,
            {
              data: {
                serverCount: 10,
                playerCount: 100,
                officialServerCount: 4,
                communityServerCount: 6,
              },
              meta: { refreshSeconds: 60, stale: false },
            },
            { etag: '"stats-1"' }
          );
        }
        return mockResponse(200, { data: [], meta: { refreshSeconds: 60 } });
      },
    });
    const first = await statsCache.getLiveStats();
    assert.equal(statsCalls, 1);
    assert.equal(first.data.playerCount, 100);
    const second = await statsCache.getLiveStats();
    assert.equal(statsCalls, 1);
    assert.equal(second._cache, true);
  });
});
