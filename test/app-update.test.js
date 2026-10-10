"use strict";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  createAppUpdate,
  compareSemver,
} = require("../lib/app-update");

describe("app update", () => {
  it("compares semver correctly", () => {
    assert.equal(compareSemver("0.3.1", "0.4.0"), -1);
    assert.equal(compareSemver("0.4.0", "0.4.0"), 0);
    assert.equal(compareSemver("1.0.0", "0.9.9"), 1);
    assert.equal(compareSemver("v0.4.1", "0.4.0"), 1);
  });

  it("reports local version and unconfigured update source", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "wd-upd-"));
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ version: "0.4.0" })
    );
    fs.writeFileSync(
      path.join(root, "update-config.json"),
      JSON.stringify({ githubOwner: "", githubRepo: "" })
    );
    const api = createAppUpdate({ rootDir: root });
    const info = api.getVersionInfo();
    assert.equal(info.localVersion, "0.4.0");
    assert.equal(info.updateConfigured, false);

    const check = await api.checkForUpdate();
    assert.equal(check.configured, false);
    assert.equal(check.updateAvailable, false);
    assert.equal(check.message, "update_not_configured");
  });

  it("detects available GitHub release", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "wd-upd2-"));
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ version: "0.4.0" })
    );
    fs.writeFileSync(
      path.join(root, "update-config.json"),
      JSON.stringify({ githubOwner: "example", githubRepo: "wardogs-viewer" })
    );

    const api = createAppUpdate({
      rootDir: root,
      fetchImpl: async () => ({
        ok: true,
        async json() {
          return {
            tag_name: "v0.5.0",
            html_url: "https://github.com/example/wardogs-viewer/releases/tag/v0.5.0",
            zipball_url: "https://example.test/zip",
            assets: [],
          };
        },
      }),
    });

    const check = await api.checkForUpdate();
    assert.equal(check.configured, true);
    assert.equal(check.updateAvailable, true);
    assert.equal(check.remoteVersion, "0.5.0");
    assert.equal(check.localVersion, "0.4.0");
  });
});

describe("i18n update strings", () => {
  const I18n = require("../public/i18n.js");

  it("has matching update keys in DE/EN", () => {
    const { missingInDe, missingInEn } = I18n.missingKeys();
    assert.deepEqual(missingInDe, []);
    assert.deepEqual(missingInEn, []);
    assert.match(I18n.t("de", "versionUpdateNow"), /aktualisieren/i);
    assert.match(I18n.t("en", "versionUpdateNow"), /Update now/i);
    assert.match(I18n.t("de", "brandTagline"), /LIVE SERVER/);
  });
});
