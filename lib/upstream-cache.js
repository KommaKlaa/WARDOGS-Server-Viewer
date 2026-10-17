"use strict";

/**
 * Shared upstream cache with single-flight / stampede protection
 * and ONE global request scheduler for all api.wardogservers.com calls.
 */

const { createUpstreamScheduler } = require("./upstream-scheduler");

function createUpstreamCache({
  fetchImpl,
  upstreamBase = "https://api.wardogservers.com",
  requestTimeoutMs = 15000,
  userAgent = "WardogsViewer/0.3 (community)",
  detailTtlMs = 10 * 60_000,
  eventsTtlMs = 2 * 60_000,
  regionsTtlMs = 30 * 60_000,
  rankingTtlMs = 5 * 60_000,
  maxConcurrentUpstream = 2,
  minRequestStartIntervalMs = 350,
  now = () => Date.now(),
  wait,
  scheduler,
} = {}) {
  const fetchFn = fetchImpl || fetch;

  const sched =
    scheduler ||
    createUpstreamScheduler({
      maxConcurrent: maxConcurrentUpstream,
      minStartIntervalMs: minRequestStartIntervalMs,
      now,
      wait,
    });

  const snapshotCache = {
    etag: null,
    body: null,
    fetchedAt: 0,
    upstreamCalls: 0,
  };
  const regionsCache = {
    etag: null,
    body: null,
    fetchedAt: 0,
    upstreamCalls: 0,
  };
  const liveStatsCache = {
    etag: null,
    body: null,
    fetchedAt: 0,
    upstreamCalls: 0,
  };

  /** @type {Map<string, { expires: number, etag: string|null, body: any, status: number }>} */
  const detailCache = new Map();
  /** @type {Map<string, { expires: number, etag: string|null, body: any, status: number }>} */
  const eventsCache = new Map();
  /** @type {Map<string, { expires: number, etag: string|null, body: any, status: number }>} */
  const rankingCache = new Map();

  let snapshotInFlight = null;
  let regionsInFlight = null;
  let liveStatsInFlight = null;
  /** @type {Map<string, Promise<any>>} */
  const detailInFlight = new Map();
  /** @type {Map<string, Promise<any>>} */
  const eventsInFlight = new Map();
  /** @type {Map<string, Promise<any>>} */
  const rankingInFlight = new Map();

  const metrics = {
    DETAIL_CACHE_HIT: 0,
    DETAIL_CACHE_MISS: 0,
    HISTORY_CACHE_HIT: 0,
    HISTORY_CACHE_MISS: 0,
    SNAPSHOT_CACHE_HIT: 0,
    RANKING_CACHE_HIT: 0,
    RANKING_CACHE_MISS: 0,
  };

  async function upstreamFetch(urlPath, { etag = null, query = "" } = {}) {
    const url = `${upstreamBase}${urlPath}${query}`;
    const headers = {
      Accept: "application/json",
      "User-Agent": userAgent,
    };
    if (etag) headers["If-None-Match"] = etag;

    return sched.schedule(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        return await fetchFn(url, { headers, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    });
  }

  async function readJsonOrNull(res) {
    if (res.status === 304) return null;
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      const err = new Error("Invalid JSON from upstream");
      err.status = 502;
      throw err;
    }
  }

  function withStaleMeta(body, warning) {
    const meta = {
      ...(body?.meta || {}),
      stale: true,
      fetchedAt: body?.meta?.fetchedAt || new Date(snapshotCache.fetchedAt || now()).toISOString(),
    };
    return {
      ...body,
      meta,
      _cache: true,
      _warning: warning,
      _stale: true,
    };
  }

  function snapshotTtlMs() {
    const refresh = Number(snapshotCache.body?.meta?.refreshSeconds);
    if (Number.isFinite(refresh) && refresh > 0) return refresh * 1000;
    return 180_000;
  }

  function liveStatsTtlMs() {
    const refresh = Number(liveStatsCache.body?.meta?.refreshSeconds);
    if (Number.isFinite(refresh) && refresh > 0) return refresh * 1000;
    return snapshotTtlMs();
  }

  function isSnapshotFresh() {
    if (!snapshotCache.body) return false;
    return now() - snapshotCache.fetchedAt < snapshotTtlMs();
  }

  async function refreshSnapshot() {
    snapshotCache.upstreamCalls += 1;
    let res;
    try {
      res = await upstreamFetch("/v1/snapshot", { etag: snapshotCache.etag });
    } catch (err) {
      if (snapshotCache.body) {
        return withStaleMeta(snapshotCache.body, "upstream_unavailable_using_cache");
      }
      const e = new Error(
        err.name === "AbortError" ? "Upstream timeout" : "Upstream unavailable"
      );
      e.status = 503;
      throw e;
    }

    if (res.status === 304 && snapshotCache.body) {
      snapshotCache.fetchedAt = now();
      return snapshotCache.body;
    }

    if (res.status === 429) {
      if (snapshotCache.body) {
        return withStaleMeta(snapshotCache.body, "rate_limited_using_cache");
      }
      const body = await readJsonOrNull(res);
      const e = new Error(body?.error?.message || "Upstream rate limited");
      e.status = 429;
      e.code = body?.error?.code || "rate_limited";
      throw e;
    }

    if (res.status === 503) {
      if (snapshotCache.body) {
        return withStaleMeta(snapshotCache.body, "upstream_unavailable_using_cache");
      }
      const e = new Error("Upstream snapshot unavailable");
      e.status = 503;
      throw e;
    }

    if (!res.ok) {
      if (snapshotCache.body) {
        return withStaleMeta(snapshotCache.body, "upstream_unavailable_using_cache");
      }
      const body = await readJsonOrNull(res);
      const e = new Error(body?.error?.message || `Upstream error ${res.status}`);
      e.status = res.status === 429 ? 429 : 502;
      e.code = body?.error?.code || null;
      throw e;
    }

    const body = await readJsonOrNull(res);
    snapshotCache.etag = res.headers.get("etag");
    snapshotCache.body = body;
    snapshotCache.fetchedAt = now();
    return body;
  }

  async function getSnapshot() {
    if (isSnapshotFresh()) {
      metrics.SNAPSHOT_CACHE_HIT += 1;
      return { ...snapshotCache.body, _cache: true };
    }

    if (snapshotInFlight) {
      return snapshotInFlight;
    }

    snapshotInFlight = refreshSnapshot().finally(() => {
      snapshotInFlight = null;
    });
    return snapshotInFlight;
  }

  async function getRegions() {
    if (regionsCache.body && now() - regionsCache.fetchedAt < regionsTtlMs) {
      return { ...regionsCache.body, _cache: true };
    }

    if (regionsInFlight) return regionsInFlight;

    regionsInFlight = (async () => {
      if (regionsCache.body && now() - regionsCache.fetchedAt < regionsTtlMs) {
        return { ...regionsCache.body, _cache: true };
      }

      regionsCache.upstreamCalls += 1;
      let res;
      try {
        res = await upstreamFetch("/v1/regions", { etag: regionsCache.etag });
      } catch (err) {
        if (regionsCache.body) {
          return {
            ...regionsCache.body,
            _cache: true,
            _warning: "upstream_unavailable_using_cache",
          };
        }
        const e = new Error(
          err.name === "AbortError" ? "Upstream timeout" : "Upstream unavailable"
        );
        e.status = 503;
        throw e;
      }

      if (res.status === 304 && regionsCache.body) {
        regionsCache.fetchedAt = now();
        return regionsCache.body;
      }

      if (res.status === 429 || !res.ok) {
        if (regionsCache.body) {
          return {
            ...regionsCache.body,
            _cache: true,
            _warning:
              res.status === 429
                ? "rate_limited_using_cache"
                : "upstream_unavailable_using_cache",
            _stale: true,
          };
        }
        const body = await readJsonOrNull(res);
        const e = new Error(body?.error?.message || `Upstream error ${res.status}`);
        e.status = res.status === 429 ? 429 : 502;
        e.code = body?.error?.code || null;
        throw e;
      }

      const body = await readJsonOrNull(res);
      regionsCache.etag = res.headers.get("etag");
      regionsCache.body = body;
      regionsCache.fetchedAt = now();
      return body;
    })().finally(() => {
      regionsInFlight = null;
    });

    return regionsInFlight;
  }

  /**
   * Network totals from GET /v1/stats (players/servers online).
   * Named separately from getStats() which returns local cache metrics.
   */
  async function getLiveStats() {
    if (liveStatsCache.body && now() - liveStatsCache.fetchedAt < liveStatsTtlMs()) {
      return { ...liveStatsCache.body, _cache: true };
    }

    if (liveStatsInFlight) return liveStatsInFlight;

    liveStatsInFlight = (async () => {
      if (liveStatsCache.body && now() - liveStatsCache.fetchedAt < liveStatsTtlMs()) {
        return { ...liveStatsCache.body, _cache: true };
      }

      liveStatsCache.upstreamCalls += 1;
      let res;
      try {
        res = await upstreamFetch("/v1/stats", { etag: liveStatsCache.etag });
      } catch (err) {
        if (liveStatsCache.body) {
          return {
            ...liveStatsCache.body,
            _cache: true,
            _warning: "upstream_unavailable_using_cache",
            _stale: true,
          };
        }
        const e = new Error(
          err.name === "AbortError" ? "Upstream timeout" : "Upstream unavailable"
        );
        e.status = 503;
        throw e;
      }

      if (res.status === 304 && liveStatsCache.body) {
        liveStatsCache.fetchedAt = now();
        return liveStatsCache.body;
      }

      if (res.status === 429 || !res.ok) {
        if (liveStatsCache.body) {
          return {
            ...liveStatsCache.body,
            _cache: true,
            _warning:
              res.status === 429
                ? "rate_limited_using_cache"
                : "upstream_unavailable_using_cache",
            _stale: true,
          };
        }
        const body = await readJsonOrNull(res);
        const e = new Error(body?.error?.message || `Upstream error ${res.status}`);
        e.status = res.status === 429 ? 429 : 502;
        e.code = body?.error?.code || null;
        throw e;
      }

      const body = await readJsonOrNull(res);
      liveStatsCache.etag = res.headers.get("etag");
      liveStatsCache.body = body;
      liveStatsCache.fetchedAt = now();
      return body;
    })().finally(() => {
      liveStatsInFlight = null;
    });

    return liveStatsInFlight;
  }

  function staleDetail(entry) {
    if (!entry?.body) return null;
    return { status: entry.status, body: entry.body, cached: true, stale: true };
  }

  async function getServerDetail(instanceId) {
    const cached = detailCache.get(instanceId);
    if (cached && cached.expires > now()) {
      metrics.DETAIL_CACHE_HIT += 1;
      return { status: cached.status, body: cached.body, cached: true };
    }

    if (detailInFlight.has(instanceId)) {
      return detailInFlight.get(instanceId);
    }

    metrics.DETAIL_CACHE_MISS += 1;

    const promise = (async () => {
      const fresh = detailCache.get(instanceId);
      if (fresh && fresh.expires > now()) {
        metrics.DETAIL_CACHE_HIT += 1;
        metrics.DETAIL_CACHE_MISS = Math.max(0, metrics.DETAIL_CACHE_MISS - 1);
        return { status: fresh.status, body: fresh.body, cached: true };
      }

      let res;
      try {
        res = await upstreamFetch(`/v1/servers/${encodeURIComponent(instanceId)}`, {
          etag: fresh?.etag || null,
        });
      } catch (err) {
        const stale = staleDetail(fresh);
        if (stale) return stale;
        const e = new Error(
          err.name === "AbortError" ? "Upstream timeout" : "Upstream unavailable"
        );
        e.status = 503;
        throw e;
      }

      if (res.status === 304 && fresh?.body) {
        fresh.expires = now() + detailTtlMs;
        return { status: fresh.status, body: fresh.body, cached: true };
      }

      if (res.status === 429) {
        const stale = staleDetail(fresh);
        if (stale) return stale;
        const body = await readJsonOrNull(res);
        const e = new Error(body?.error?.message || "Upstream rate limited");
        e.status = 429;
        throw e;
      }

      const body = await readJsonOrNull(res);
      const entry = {
        expires: now() + detailTtlMs,
        etag: res.headers.get("etag"),
        body,
        status: res.status,
      };
      if (res.ok || res.status === 404) {
        detailCache.set(instanceId, entry);
      }
      return { status: res.status, body, cached: false };
    })().finally(() => {
      detailInFlight.delete(instanceId);
    });

    detailInFlight.set(instanceId, promise);
    return promise;
  }

  async function getServerEvents(joinCode) {
    const cached = eventsCache.get(joinCode);
    if (cached && cached.expires > now()) {
      metrics.HISTORY_CACHE_HIT += 1;
      return { status: cached.status, body: cached.body, cached: true };
    }

    if (eventsInFlight.has(joinCode)) {
      return eventsInFlight.get(joinCode);
    }

    metrics.HISTORY_CACHE_MISS += 1;

    const promise = (async () => {
      const fresh = eventsCache.get(joinCode);
      if (fresh && fresh.expires > now()) {
        metrics.HISTORY_CACHE_HIT += 1;
        metrics.HISTORY_CACHE_MISS = Math.max(0, metrics.HISTORY_CACHE_MISS - 1);
        return { status: fresh.status, body: fresh.body, cached: true };
      }

      let res;
      try {
        res = await upstreamFetch(
          `/v1/history/servers/${encodeURIComponent(joinCode)}/events`,
          { etag: fresh?.etag || null, query: "?limit=100" }
        );
      } catch (err) {
        if (fresh?.body) {
          return { status: fresh.status, body: fresh.body, cached: true, stale: true };
        }
        const e = new Error(
          err.name === "AbortError" ? "Upstream timeout" : "Upstream unavailable"
        );
        e.status = 503;
        throw e;
      }

      if (res.status === 304 && fresh?.body) {
        fresh.expires = now() + eventsTtlMs;
        return { status: fresh.status, body: fresh.body, cached: true };
      }

      if (res.status === 429) {
        if (fresh?.body) {
          return { status: fresh.status, body: fresh.body, cached: true, stale: true };
        }
        const body = await readJsonOrNull(res);
        const e = new Error(body?.error?.message || "Upstream rate limited");
        e.status = 429;
        throw e;
      }

      const body = await readJsonOrNull(res);
      const entry = {
        expires: now() + eventsTtlMs,
        etag: res.headers.get("etag"),
        body,
        status: res.status,
      };
      if (res.ok || res.status === 404) {
        eventsCache.set(joinCode, entry);
      }
      return { status: res.status, body, cached: false };
    })().finally(() => {
      eventsInFlight.delete(joinCode);
    });

    eventsInFlight.set(joinCode, promise);
    return promise;
  }

  function rankingCacheKey(window, type, limit) {
    return `${window}|${type}|${limit}`;
  }

  async function getServerRanking({
    window = "24h",
    type = "all",
    limit = 15,
  } = {}) {
    const win = ["24h", "7d", "30d"].includes(String(window))
      ? String(window)
      : "24h";
    const typ = ["all", "official", "community"].includes(String(type))
      ? String(type)
      : "all";
    const lim = Math.max(1, Math.min(50, Math.floor(Number(limit) || 15)));
    const key = rankingCacheKey(win, typ, lim);

    const cached = rankingCache.get(key);
    if (cached && cached.expires > now()) {
      metrics.RANKING_CACHE_HIT += 1;
      return { status: cached.status, body: cached.body, cached: true };
    }

    if (rankingInFlight.has(key)) {
      return rankingInFlight.get(key);
    }

    metrics.RANKING_CACHE_MISS += 1;

    const promise = (async () => {
      const fresh = rankingCache.get(key);
      let res;
      try {
        res = await upstreamFetch("/v1/history/servers/ranking", {
          etag: fresh?.etag || null,
          query: `?window=${encodeURIComponent(win)}&type=${encodeURIComponent(typ)}&limit=${lim}`,
        });
      } catch (err) {
        if (fresh?.body) {
          return { status: fresh.status, body: fresh.body, cached: true, stale: true };
        }
        const e = new Error(
          err.name === "AbortError" ? "Upstream timeout" : "Upstream unavailable"
        );
        e.status = 503;
        throw e;
      }

      if (res.status === 304 && fresh?.body) {
        fresh.expires = now() + rankingTtlMs;
        return { status: fresh.status, body: fresh.body, cached: true };
      }

      if (res.status === 429 || !res.ok) {
        if (fresh?.body) {
          return {
            status: fresh.status,
            body: fresh.body,
            cached: true,
            stale: true,
          };
        }
        const body = await readJsonOrNull(res);
        const e = new Error(body?.error?.message || `Upstream error ${res.status}`);
        e.status = res.status === 429 ? 429 : 502;
        e.code = body?.error?.code || null;
        throw e;
      }

      const body = await readJsonOrNull(res);
      const entry = {
        expires: now() + rankingTtlMs,
        etag: res.headers.get("etag"),
        body,
        status: res.status,
      };
      rankingCache.set(key, entry);
      return { status: res.status, body, cached: false };
    })().finally(() => {
      rankingInFlight.delete(key);
    });

    rankingInFlight.set(key, promise);
    return promise;
  }

  function getStats() {
    const schedState = sched.getState();
    return {
      snapshot: {
        hasBody: Boolean(snapshotCache.body),
        etag: snapshotCache.etag,
        fetchedAt: snapshotCache.fetchedAt,
        upstreamCalls: snapshotCache.upstreamCalls,
        inFlight: Boolean(snapshotInFlight),
        ttlMs: snapshotCache.body ? snapshotTtlMs() : null,
      },
      regions: {
        hasBody: Boolean(regionsCache.body),
        upstreamCalls: regionsCache.upstreamCalls,
        ttlMs: regionsTtlMs,
      },
      liveStats: {
        hasBody: Boolean(liveStatsCache.body),
        upstreamCalls: liveStatsCache.upstreamCalls,
        ttlMs: liveStatsCache.body ? liveStatsTtlMs() : null,
      },
      details: detailCache.size,
      events: eventsCache.size,
      rankings: rankingCache.size,
      detailTtlMs,
      eventsTtlMs,
      regionsTtlMs,
      rankingTtlMs,
      scheduler: schedState,
      metrics: {
        ...schedState.metrics,
        ...metrics,
      },
    };
  }

  /** Test helper */
  function _seedSnapshot(body, { etag = '"test"', fetchedAt = now() } = {}) {
    snapshotCache.body = body;
    snapshotCache.etag = etag;
    snapshotCache.fetchedAt = fetchedAt;
  }

  function _seedDetail(instanceId, body, { status = 200, expires } = {}) {
    detailCache.set(instanceId, {
      expires: expires != null ? expires : now() + detailTtlMs,
      etag: null,
      body,
      status,
    });
  }

  function _seedEvents(joinCode, body, { status = 200, expires } = {}) {
    eventsCache.set(joinCode, {
      expires: expires != null ? expires : now() + eventsTtlMs,
      etag: null,
      body,
      status,
    });
  }

  function _seedRegions(body, { fetchedAt = now() } = {}) {
    regionsCache.body = body;
    regionsCache.fetchedAt = fetchedAt;
  }

  function _seedLiveStats(body, { etag = '"live-stats"', fetchedAt = now() } = {}) {
    liveStatsCache.body = body;
    liveStatsCache.etag = etag;
    liveStatsCache.fetchedAt = fetchedAt;
  }

  return {
    getSnapshot,
    getRegions,
    getLiveStats,
    getServerDetail,
    getServerEvents,
    getServerRanking,
    getStats,
    scheduler: sched,
    detailTtlMs,
    eventsTtlMs,
    regionsTtlMs,
    rankingTtlMs,
    maxConcurrentUpstream,
    minRequestStartIntervalMs,
    _seedSnapshot,
    _seedDetail,
    _seedEvents,
    _seedRegions,
    _seedLiveStats,
    _snapshotCache: snapshotCache,
    _liveStatsCache: liveStatsCache,
    _detailCache: detailCache,
    _eventsCache: eventsCache,
    _metrics: metrics,
  };
}

module.exports = { createUpstreamCache };
