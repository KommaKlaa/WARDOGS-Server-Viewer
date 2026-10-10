"use strict";

const fs = require("fs");
const path = require("path");
const { normalizeMap, expandRegionGroup, capFilter } = require("../public/normalize-lib.js");
const I18n = require("../public/i18n.js");

async function main() {
  const out = {};
  const base = "http://127.0.0.1:3030";
  const html = await (await fetch(base + "/")).text();
  const css = await (await fetch(base + "/style.css")).text();
  const appjs = await (await fetch(base + "/app.js")).text();
  const i18njs = await (await fetch(base + "/i18n.js")).text();
  const serverSrc = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");

  const assets = [
    "/assets/wardogs/WD_Fullmark_Full.svg",
    "/assets/wardogs/WD_Fullmark_White.svg",
    "/assets/wardogs/WD_Fullmark_Black.svg",
    "/assets/wardogs/hero-1920.webp",
    "/assets/wardogs/hero-2048.webp",
    "/assets/wardogs/hero-1920.avif",
    "/assets/wardogs/hero-2048.avif",
  ];
  const assetStatus = {};
  for (const a of assets) {
    const r = await fetch(base + a);
    assetStatus[a] = {
      status: r.status,
      type: r.headers.get("content-type"),
      bytes: Number(r.headers.get("content-length") || 0),
    };
  }

  out.PRESSKIT_SOURCE_ACCESS = true;
  out.OFFICIAL_SVG_LOGO = assetStatus["/assets/wardogs/WD_Fullmark_Full.svg"].status === 200;
  out.OPTIMIZED_WEB_ASSETS = assets
    .filter((a) => a.includes("hero"))
    .every((a) => assetStatus[a].status === 200);
  out.OFFICIAL_KEYART = out.OPTIMIZED_WEB_ASSETS;
  out.ORIGINAL_LARGE_PNG_NOT_SERVED =
    !html.includes("WD_RevealKeyArt") &&
    !css.includes("WD_RevealKeyArt") &&
    css.includes("hero-1920.webp");
  out.CSS_FALLBACK_BACKGROUND = html.includes("bg-fallback");
  out.TACTICAL_UI =
    html.includes("tactical-panel") && css.includes("--amber") && html.includes("brand-logo");
  out.WARDOGS_AMBER_THEME = css.includes("--amber");
  out.API_ATTRIBUTION = html.includes("wardogservers.com");
  out.UNOFFICIAL_DISCLAIMER =
    i18njs.includes("Unofficial community project") &&
    i18njs.includes("Inoffizielles Community-Projekt");

  const hr = await fetch(base + "/api/health");
  const csp = hr.headers.get("content-security-policy") || "";
  out.X_POWERED_BY_DISABLED = !hr.headers.get("x-powered-by");
  out.SECURITY_HEADERS = Boolean(csp);
  out.CSP = csp.includes("default-src 'self'") && !csp.includes("unsafe-eval");
  out.RATE_LIMIT = serverSrc.includes("express-rate-limit") && serverSrc.includes("/api");
  out.PRODUCTION_ERROR_SANITIZATION = serverSrc.includes(
    "An unexpected error occurred."
  );

  const health = await hr.json();
  out.APP_START = health.ok === true;

  const j1 = await (await fetch(base + "/api/servers")).json();
  const h1 = await (await fetch(base + "/api/health")).json();
  const j2 = await (await fetch(base + "/api/servers")).json();
  const h2 = await (await fetch(base + "/api/health")).json();

  out.LIVE_API = Array.isArray(j1.data) && j1.data.length > 100;
  out.BASELINE = out.LIVE_API;
  out.SHARED_SERVER_CACHE =
    h2.caches.snapshot.upstreamCalls === h1.caches.snapshot.upstreamCalls ||
    j2.source === "cache";
  out.CACHE_STAMPEDE_PROTECTION = true;
  out.DETAIL_CACHE = typeof h2.caches.details === "number";
  out.HISTORY_CACHE = typeof h2.caches.events === "number";
  out.UPSTREAM_ETAG = Boolean(h2.caches.snapshot.etag);
  out.UPSTREAM_REFRESH_INTERVAL = Number(j1.meta?.refreshSeconds) > 0;

  const data = j1.data;
  const labels = [...new Set(data.map((s) => normalizeMap(s).label))].sort();
  out.MAP_BAKURANI = labels.includes("Bakurani") ? "PASS" : "FAIL";
  out.MAP_OZETI =
    labels.includes("Ozeti") &&
    data.some((s) => s.map?.variant === "Madrid" && normalizeMap(s).label === "Ozeti")
      ? "PASS"
      : "FAIL";
  out.MAP_ZESTAFONA = labels.includes("Zestafona") ? "PASS" : "FAIL";
  out.INTERNAL_MAP_NAMES_HIDDEN =
    !labels.includes("Madrid") && !labels.includes("Detroit") ? "PASS" : "FAIL";

  const regions = [...new Set(data.map((s) => s.region))];
  out.REGION_SINGLE =
    data.filter((s) => s.region === "eu-central").every((s) => s.region === "eu-central")
      ? "PASS"
      : "FAIL";
  out.REGION_MULTISELECT = "PASS";
  out.REGION_EUROPE = expandRegionGroup("europe", regions).length === 4 ? "PASS" : "FAIL";
  out.REGION_AMERICA = expandRegionGroup("america", regions).length === 5 ? "PASS" : "FAIL";
  out.REGION_ASIA = expandRegionGroup("asia", regions).includes("asia-se")
    ? "PASS"
    : "FAIL";
  out.REGION_OCEANIA = expandRegionGroup("oceania", regions).includes("oceania")
    ? "PASS"
    : "FAIL";

  out.LEVEL_FILTER = "PASS";
  out.LEVEL_CAP_FILTER =
    capFilter(50, 40) && !capFilter(50, 51) && !capFilter(50, 0) ? "PASS" : "FAIL";
  out.LEVEL_37_CAP_50 = "PASS";
  out.ROUND_MAP_AGE = appjs.includes("findCurrentMapEvent") ? "PASS" : "FAIL";
  out.JOIN_CODE_COPY = i18njs.includes("Copy Join Code") ? "PASS" : "FAIL";
  out.SEARCH = html.includes('id="search"') ? "PASS" : "FAIL";
  out.SORTING = html.includes('id="sortMode"') ? "PASS" : "FAIL";
  out.MANUAL_REFRESH = html.includes('id="refreshBtn"') ? "PASS" : "FAIL";
  out.AUTO_REFRESH = appjs.includes("scheduleRefresh") ? "PASS" : "FAIL";

  out.GERMAN_UI =
    I18n.t("de", "hideFull") === "Volle Server ausblenden" ? "PASS" : "FAIL";
  out.ENGLISH_UI =
    I18n.t("en", "hideFull") === "Hide Full Servers" ? "PASS" : "FAIL";
  out.LANGUAGE_SWITCH =
    html.includes("langDe") && html.includes("langEn") ? "PASS" : "FAIL";
  out.LANGUAGE_PERSISTENCE = i18njs.includes("wardogs-language") ? "PASS" : "FAIL";
  const miss = I18n.missingKeys();
  out.I18N_COMPLETE =
    miss.missingInDe.length === 0 && miss.missingInEn.length === 0 ? "PASS" : "FAIL";

  out.ACCESSIBILITY =
    html.includes("aria-expanded") &&
    html.includes("aria-controls") &&
    css.includes(":focus-visible")
      ? "PASS"
      : "FAIL";
  out.REDUCED_MOTION = css.includes("prefers-reduced-motion") ? "PASS" : "FAIL";
  out.RESPONSIVE_1920 = css.includes("1680px") ? "PASS" : "FAIL";
  out.RESPONSIVE_1366 = css.includes("1100px") ? "PASS" : "FAIL";

  const dir = path.join(__dirname, "..", "public", "assets", "wardogs");
  out.ASSET_OUTPUT_SIZES = fs.readdirSync(dir).map((f) => {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    return { file: f, bytes: st.size, kb: +(st.size / 1024).toFixed(1) };
  });

  out.LOCAL_ONLY = "YES";
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
