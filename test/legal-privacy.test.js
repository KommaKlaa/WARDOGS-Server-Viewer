"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const publicDir = path.join(root, "public");

function read(...parts) {
  return fs.readFileSync(path.join(...parts), "utf8");
}

const indexHtml = read(publicDir, "index.html");
const legalHtml = read(publicDir, "legal.html");
const privacyHtml = read(publicDir, "privacy.html");
const impressumHtml = read(publicDir, "impressum.html");
const datenschutzHtml = read(publicDir, "datenschutz.html");
const styleCss = read(publicDir, "style.css");
const appJs = read(publicDir, "app.js");
const i18nJs = read(publicDir, "i18n.js");
const legalPageJs = read(publicDir, "legal-page.js");
const serverJs = read(root, "server.js");
const packageJson = read(root, "package.json");

const FRONTEND_SOURCES = [indexHtml, legalHtml, privacyHtml, styleCss, appJs, i18nJs, legalPageJs];
const ALL_APP_SOURCES = [...FRONTEND_SOURCES, serverJs, packageJson];

const TRACKING_MARKERS = [
  "google-analytics",
  "googletagmanager",
  "gtag(",
  "GTM-",
  "matomo",
  "facebook.net",
  "fbevents",
  "hotjar",
  "clarity.ms",
  "plausible.io",
  "doubleclick",
];

const REMOTE_FONT_MARKERS = [
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "use.typekit.net",
  "fonts.bunny.net",
];

const FAKE_ADDRESS_MARKERS = [
  "Musterstraße",
  "Musterstrasse",
  "Example Street",
  "123 Main Street",
  "Postfach",
  "P.O. Box",
  "PO Box",
];

describe("legal and privacy pages", () => {
  it("IMPRINT_PAGE_EXISTS", () => {
    assert.ok(fs.existsSync(path.join(publicDir, "legal.html")));
    assert.ok(fs.existsSync(path.join(publicDir, "impressum.html")));
    assert.match(legalHtml, /Impressum/);
    assert.match(legalHtml, /Legal Notice/);
    assert.match(impressumHtml, /legal\.html/);
  });

  it("PRIVACY_PAGE_EXISTS", () => {
    assert.ok(fs.existsSync(path.join(publicDir, "privacy.html")));
    assert.ok(fs.existsSync(path.join(publicDir, "datenschutz.html")));
    assert.match(privacyHtml, /Datenschutzerklärung|Privacy Notice/);
    assert.match(datenschutzHtml, /privacy\.html/);
  });

  it("SUPPORT_EMAIL_PRESENT", () => {
    // Local/desktop edition: main UI uses GitHub support, not mailto.
    assert.match(indexHtml, /footerLocalSupport|GitHub Issues/);
    assert.equal(indexHtml.includes("mailto:dev@lusor.eu"), false);
    // Legacy legal pages may still mention the old contact until fully retired.
    assert.match(legalHtml + privacyHtml, /dev@lusor\.eu/);
  });

  it("LEGAL_PLACEHOLDER_VISIBLE", () => {
    for (const src of [legalHtml, privacyHtml]) {
      assert.match(src, /\[NAME DES BETREIBERS\]/);
      assert.match(src, /\[LADUNGSFÄHIGE ANSCHRIFT\]/);
      assert.match(src, /\[PLZ ORT\]/);
      assert.match(src, /\[LAND\]/);
    }
  });

  it("NO_FAKE_POSTAL_ADDRESS", () => {
    const blob = legalHtml + "\n" + privacyHtml;
    for (const marker of FAKE_ADDRESS_MARKERS) {
      assert.equal(blob.includes(marker), false, `unexpected fake address marker: ${marker}`);
    }
  });

  it("NO_ANALYTICS", () => {
    const blob = ALL_APP_SOURCES.join("\n").toLowerCase();
    for (const marker of TRACKING_MARKERS) {
      assert.equal(blob.includes(marker.toLowerCase()), false, `analytics marker: ${marker}`);
    }
  });

  it("NO_REMOTE_FONTS", () => {
    const blob = FRONTEND_SOURCES.join("\n");
    for (const marker of REMOTE_FONT_MARKERS) {
      assert.equal(blob.includes(marker), false, `remote font marker: ${marker}`);
    }
    assert.match(styleCss, /Segoe UI/);
  });

  it("NO_REMOTE_TRACKING", () => {
    const blob = FRONTEND_SOURCES.join("\n").toLowerCase();
    assert.equal(blob.includes("facebook.com/tr"), false);
    assert.equal(blob.includes("connect.facebook.net"), false);
    assert.equal(/src=["']https?:\/\//.test(indexHtml + legalHtml + privacyHtml), false);
    assert.equal(/href=["']https?:\/\/fonts\./.test(blob), false);
  });

  it("LOCALSTORAGE_AUDITED", () => {
    assert.match(appJs, /SETTINGS_KEY|wardogs-viewer-settings-v1/);
    assert.equal(/localStorage\.getItem\(\s*["']wardogs-debug["']\s*\)/.test(appJs), false);
    assert.match(i18nJs, /wardogs-language/);
    assert.equal(appJs.includes("sessionStorage"), false);
    assert.match(privacyHtml, /wardogs-storage-consent/);
    assert.match(privacyHtml, /wardogs-language/);
    assert.match(privacyHtml, /wardogs-viewer-settings-v1/);
    assert.equal(privacyHtml.includes("wardogs-debug"), false);
  });

  it("OPTIONAL_STORAGE = EXPLICIT_OPT_IN", () => {
    assert.match(indexHtml, /id="rememberSettings"/);
    assert.match(i18nJs, /Remember settings on this device/);
    assert.match(i18nJs, /Einstellungen auf diesem Gerät speichern/);
    assert.match(privacyHtml, /granted-v1/);
    assert.match(privacyHtml, /ausdrücklich|explicitly/i);
  });

  it("PRIVACY_PAGE_MATCHES_IMPLEMENTATION", () => {
    assert.match(privacyHtml, /keine eigenen Cookies|does not set its own cookies/i);
    assert.match(privacyHtml, /keine Analyse|No analytics/i);
    assert.match(privacyHtml, /Third-Party-Fonts|third-party fonts/i);
    assert.match(privacyHtml, /MemoryStore|in-memory/i);
    assert.match(privacyHtml, /240/);
    assert.match(privacyHtml, /60/);
  });

  it("COOKIES / ANALYTICS / TRACKING / REMOTE_FONTS negatives", () => {
    assert.equal(serverJs.toLowerCase().includes("set-cookie"), false);
    assert.equal(packageJson.includes("cookie-parser"), false);
  });

  it("LEGAL_ADDRESS_PLACEHOLDER = PRESENT", () => {
    assert.match(legalHtml, /\[LADUNGSFÄHIGE ANSCHRIFT\]/);
    assert.match(privacyHtml, /\[LADUNGSFÄHIGE ANSCHRIFT\]/);
  });

  it("RATE_LIMIT_PRIVACY_AUDITED", () => {
    assert.match(serverJs, /express-rate-limit/);
    assert.match(serverJs, /windowMs:\s*60_000/);
    assert.match(serverJs, /max:\s*240/);
    assert.match(privacyHtml, /express-rate-limit/);
    assert.match(privacyHtml, /MemoryStore|Arbeitsspeicher|in-memory/i);
    assert.match(privacyHtml, /request\.ip|Client-IP|client IP/i);
  });

  it("WARDOG_API_SERVER_SIDE_ONLY", () => {
    assert.match(serverJs, /https:\/\/api\.wardogservers\.com/);
    assert.match(appJs, /fetch\("\/api\/regions"\)/);
    assert.match(appJs, /fetch\(`\/api\/server\//);
    assert.match(appJs, /const listUrl = "\/api\/servers"/);
    assert.match(appJs, /await fetch\(listUrl\)/);
    const browserFetchToUpstream = /fetch\(\s*[`'"]https:\/\/api\.wardogservers\.com/.test(appJs);
    assert.equal(browserFetchToUpstream, false);
    assert.match(privacyHtml, /\/api\/\.\.\./);
    assert.match(privacyHtml, /api\.wardogservers\.com/);
  });

  it("FOOTER_LINKS", () => {
    assert.match(indexHtml, /footerLocalSupport|GitHub Issues/);
    assert.match(indexHtml, /wardogservers\.com/);
    assert.equal(indexHtml.includes("mailto:dev@lusor.eu"), false);
  });

  it("DESKTOP_ONE_CLICK_LAUNCHER", () => {
    const bat = path.join(root, "Start WARDOGS Viewer.bat");
    assert.ok(fs.existsSync(bat));
    const batText = fs.readFileSync(bat, "utf8");
    assert.match(batText, /WARDOGS_DESKTOP=1/);
    assert.match(batText, /node server\.js/);
    assert.match(serverJs, /WARDOGS_DESKTOP/);
    assert.match(serverJs, /openBrowser/);
  });

  it("DE_LEGAL", () => {
    assert.match(i18nJs, /legalNotice:\s*"Impressum"/);
    assert.match(i18nJs, /privacy:\s*"Datenschutz"/);
    assert.match(legalHtml, /Angaben zum Betreiber/);
    assert.match(privacyHtml, /Verantwortlicher/);
  });

  it("EN_LEGAL", () => {
    assert.match(i18nJs, /legalNotice:\s*"Legal Notice"/);
    assert.match(i18nJs, /privacy:\s*"Privacy"/);
    assert.match(legalHtml, /Legal Notice/);
    assert.match(privacyHtml, /Privacy Notice/);
  });
});
