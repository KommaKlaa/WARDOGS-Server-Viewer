"use strict";

const express = require("express");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { exec } = require("child_process");
const { createUpstreamCache } = require("./lib/upstream-cache");
const { createAppUpdate } = require("./lib/app-update");

const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PROD = NODE_ENV === "production";
const IS_DESKTOP =
  process.env.WARDOGS_DESKTOP === "1" ||
  process.env.WARDOGS_OPEN_BROWSER === "1";
// Prefer runtime PORT when provided; local fallback 3030.
const PORT = Number(process.env.PORT) || 3030;
// Desktop/local: always bind localhost. Hosting/reverse-proxy: HOST optional.
const HOST =
  process.env.HOST ||
  (IS_DESKTOP ? "127.0.0.1" : IS_PROD ? null : "127.0.0.1");
const UPSTREAM = "https://api.wardogservers.com";

function openBrowser(url) {
  const safe = String(url).replace(/"/g, "");
  if (process.platform === "win32") {
    exec(`cmd /c start "" "${safe}"`);
  } else if (process.platform === "darwin") {
    exec(`open "${safe}"`);
  } else {
    exec(`xdg-open "${safe}"`);
  }
}

const INSTANCE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOIN_CODE_RE =
  /^(?:[0-9]{1,64}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

const cache = createUpstreamCache({
  upstreamBase: UPSTREAM,
  userAgent: "WardogsViewer/0.4 (community; local)",
});

const appUpdate = createAppUpdate({
  rootDir: path.join(__dirname),
});

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

// Conservative trust-proxy: disabled by default.
// Behind a reverse proxy set TRUST_PROXY=1 (hop count) only after verifying topology.
if (process.env.TRUST_PROXY != null && String(process.env.TRUST_PROXY).trim() !== "") {
  const raw = String(process.env.TRUST_PROXY).trim();
  if (raw === "true" || raw === "1") {
    app.set("trust proxy", 1);
  } else if (/^\d+$/.test(raw)) {
    app.set("trust proxy", Number(raw));
  } else if (raw !== "false" && raw !== "0") {
    app.set("trust proxy", raw);
  }
}

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'"],
        "style-src": ["'self'"],
        "img-src": ["'self'", "data:"],
        "font-src": ["'self'"],
        "connect-src": ["'self'"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        "frame-ancestors": ["'none'"],
        "form-action": ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: "rate_limited",
      message: "Too many API requests. Please slow down.",
    },
  },
});

app.use("/api", apiLimiter);

function sendError(res, status, code, message, err) {
  if (!IS_PROD && err) {
    console.error(err);
  } else if (IS_PROD && err) {
    console.error(code || "error", status);
  }
  const safeMessage =
    IS_PROD && status >= 500
      ? "An unexpected error occurred."
      : message || "Request failed";
  res.status(status).json({
    error: { code: code || "error", message: safeMessage },
  });
}

app.get("/api/servers", async (req, res) => {
  try {
    const data = await cache.getSnapshot();
    let servers = Array.isArray(data.data) ? data.data : [];

    const regionRaw = String(req.query.region || "").trim();
    const selectedRegions = regionRaw
      ? regionRaw
          .split(",")
          .map((r) => r.trim())
          .filter(Boolean)
      : [];

    if (process.env.WARDOGS_DEBUG === "1") {
      console.log("[WARDOGS-DEBUG]", {
        SELECTED_REGIONS: selectedRegions,
        UPSTREAM_REGION_PARAM: selectedRegions.length
          ? selectedRegions.join(",")
          : null,
        CACHE: cache.getStats(),
      });
    }

    if (selectedRegions.length) {
      const allow = new Set(selectedRegions);
      servers = servers.filter((s) => allow.has(s.region));
    }

    const stale = Boolean(
      data._stale ||
        data.meta?.stale ||
        data._warning === "rate_limited_using_cache" ||
        data._warning === "upstream_unavailable_using_cache"
    );
    const meta = {
      ...(data.meta || {}),
      stale,
      refreshSeconds: Number(data.meta?.refreshSeconds) || 180,
      fetchedAt:
        data.meta?.fetchedAt ||
        (cache.getStats().snapshot.fetchedAt
          ? new Date(cache.getStats().snapshot.fetchedAt).toISOString()
          : new Date().toISOString()),
    };

    res.json({
      data: servers,
      meta,
      warning: data._warning || null,
      source: data._cache || stale ? "cache" : "live",
      regionFilter: selectedRegions,
      upstreamRegionParam: selectedRegions.length
        ? selectedRegions.join(",")
        : null,
    });
  } catch (err) {
    sendError(
      res,
      err.status || 503,
      err.code || "upstream_error",
      err.message || "Failed to load servers",
      err
    );
  }
});

app.get("/api/server/:serverId/detail", async (req, res) => {
  const id = String(req.params.serverId || "").trim();
  if (!INSTANCE_ID_RE.test(id)) {
    return sendError(
      res,
      400,
      "bad_request",
      "Detail lookup requires a valid instance UUID (id)."
    );
  }

  try {
    const result = await cache.getServerDetail(id);
    if (result.status === 404) {
      return sendError(
        res,
        404,
        "not_found",
        "Server not found in current snapshot."
      );
    }
    if (!result.body || result.status >= 400) {
      return sendError(
        res,
        result.status === 429 ? 429 : 502,
        result.body?.error?.code || "upstream_error",
        result.body?.error?.message || `Upstream error ${result.status}`
      );
    }
    res.json({
      data: result.body.data,
      meta: result.body.meta || null,
      cached: result.cached,
    });
  } catch (err) {
    sendError(
      res,
      err.status || 503,
      err.code || "upstream_error",
      err.message || "Failed to load server detail",
      err
    );
  }
});

app.get("/api/server/:serverId/events", async (req, res) => {
  const joinCode = String(req.params.serverId || "").trim();
  if (!JOIN_CODE_RE.test(joinCode)) {
    return sendError(
      res,
      400,
      "bad_request",
      "Events lookup requires a valid join code (serverId)."
    );
  }

  try {
    const result = await cache.getServerEvents(joinCode);
    if (result.status === 404) {
      return res.json({
        data: { server: null, events: [] },
        meta: null,
        missing: true,
        cached: result.cached,
      });
    }
    if (!result.body || result.status >= 400) {
      return sendError(
        res,
        result.status === 429 ? 429 : 502,
        result.body?.error?.code || "upstream_error",
        result.body?.error?.message || `Upstream error ${result.status}`
      );
    }
    res.json({
      data: result.body.data,
      meta: result.body.meta || null,
      history: result.body.history || null,
      cached: result.cached,
    });
  } catch (err) {
    sendError(
      res,
      err.status || 503,
      err.code || "upstream_error",
      err.message || "Failed to load server events",
      err
    );
  }
});

app.get("/api/regions", async (_req, res) => {
  try {
    const data = await cache.getRegions();
    res.json({
      data: data.data || [],
      meta: data.meta || null,
      warning: data._warning || null,
      source: data._cache ? "cache" : "live",
    });
  } catch (err) {
    sendError(
      res,
      err.status || 503,
      err.code || "upstream_error",
      err.message || "Failed to load regions",
      err
    );
  }
});

app.get("/api/health", (_req, res) => {
  const stats = cache.getStats();
  const payload = {
    ok: true,
    env: NODE_ENV,
    upstream: UPSTREAM,
    version: appUpdate.getVersionInfo().localVersion,
    desktop: IS_DESKTOP,
    caches: {
      snapshot: stats.snapshot,
      regions: stats.regions,
      details: stats.details,
      events: stats.events,
      detailTtlMs: stats.detailTtlMs,
      eventsTtlMs: stats.eventsTtlMs,
      regionsTtlMs: stats.regionsTtlMs,
    },
  };
  // Debug metrics only when explicitly enabled (not public by default).
  if (process.env.WARDOGS_DEBUG === "1") {
    payload.debug = {
      scheduler: stats.scheduler,
      metrics: stats.metrics,
    };
  }
  res.json(payload);
});

app.get("/api/app/version", (_req, res) => {
  res.json({ ok: true, ...appUpdate.getVersionInfo() });
});

app.get("/api/app/update-check", async (_req, res) => {
  try {
    const result = await appUpdate.checkForUpdate();
    res.json(result);
  } catch (err) {
    sendError(
      res,
      err.status || 502,
      err.code || "update_check_failed",
      err.message || "Update check failed",
      err
    );
  }
});

app.post("/api/app/update-apply", async (req, res) => {
  // Only allow local self-update (desktop / localhost tooling).
  const ip = String(req.ip || "");
  const local =
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "::ffff:127.0.0.1" ||
    IS_DESKTOP;
  if (!local) {
    return sendError(res, 403, "forbidden", "Update apply is only available locally.");
  }
  try {
    const result = await appUpdate.applyUpdate({
      downloadUrl: req.body?.downloadUrl || null,
    });
    res.json(result);
    if (result.applied && result.restartRequired) {
      appUpdate.scheduleRestart();
    }
  } catch (err) {
    sendError(
      res,
      err.status || 502,
      err.code || "update_apply_failed",
      err.message || "Update apply failed",
      err
    );
  }
});

app.use(
  express.static(path.join(__dirname, "public"), {
    // Desktop self-updates must not leave users on a cached shell for an hour.
    maxAge: IS_DESKTOP ? 0 : IS_PROD ? "1h" : 0,
    etag: true,
    setHeaders(res, filePath) {
      if (IS_DESKTOP || /\.(html|js|css)$/i.test(filePath)) {
        res.setHeader("Cache-Control", "no-cache, must-revalidate");
      }
    },
  })
);

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use((err, _req, res, _next) => {
  sendError(res, 500, "internal_error", "An unexpected error occurred.", err);
});

// Direct `node server.js` / local desktop start.
// Some hosts may import the exported app instead of calling listen.
if (require.main === module) {
  const onListen = () => {
    const hostLabel = !HOST || HOST === "127.0.0.1" ? "localhost" : HOST;
    const url = `http://${hostLabel}:${PORT}`;
    console.log(`WARDOGS Server Viewer listening on ${url} (${NODE_ENV})`);
    if (IS_DESKTOP) {
      console.log("");
      console.log("  Viewer is running locally.");
      console.log("  Keep this window open while you use it.");
      console.log("  Close this window to quit.");
      console.log("");
      // Slight delay so the HTTP server is ready before the browser hits it.
      setTimeout(() => openBrowser(url), 400);
    }
  };
  if (HOST) app.listen(PORT, HOST, onListen);
  else app.listen(PORT, onListen);
}

// Default export is the Express app (for hosts that mount it without listen).
module.exports = app;
module.exports.app = app;
module.exports.cache = cache;
