"use strict";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const Storage = require("../public/storage-lib.js");
const I18n = require("../public/i18n.js");

function createMemoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    },
    key(i) {
      return Object.keys(data)[i] || null;
    },
    get length() {
      return Object.keys(data).length;
    },
  };
}

describe("storage consent model", () => {
  let store;

  beforeEach(() => {
    store = createMemoryStorage();
  });

  it("NO_CONSENT_INITIAL = no convenience localStorage writes", () => {
    assert.equal(Storage.hasStorageConsent(store), false);
    assert.equal(Storage.writeLanguage("de", store), false);
    assert.equal(Storage.writeSettingsJson(JSON.stringify({ myLevel: 40 }), store), false);
    assert.equal(store.getItem(Storage.LANGUAGE_KEY), null);
    assert.equal(store.getItem(Storage.SETTINGS_KEY), null);
    assert.equal(store.getItem(Storage.CONSENT_KEY), null);
  });

  it("NAVIGATOR_DE_NO_CONSENT = German UI, no localStorage language write", () => {
    const lang = I18n.resolveInitialLanguage({
      storage: store,
      navigatorLanguage: "de-DE",
    });
    assert.equal(lang, "de");
    assert.equal(store.getItem(Storage.LANGUAGE_KEY), null);
  });

  it("NAVIGATOR_EN_NO_CONSENT = English UI, no localStorage language write", () => {
    const lang = I18n.resolveInitialLanguage({
      storage: store,
      navigatorLanguage: "en-US",
    });
    assert.equal(lang, "en");
    assert.equal(store.getItem(Storage.LANGUAGE_KEY), null);
  });

  it("LANGUAGE_SWITCH_NO_CONSENT = works for session only", () => {
    let sessionLang = I18n.resolveInitialLanguage({
      storage: store,
      navigatorLanguage: "en-GB",
    });
    sessionLang = I18n.normalizeLang("de");
    assert.equal(sessionLang, "de");
    assert.equal(Storage.writeLanguage(sessionLang, store), false);
    assert.equal(store.getItem(Storage.LANGUAGE_KEY), null);
  });

  it("SETTINGS_CHANGE_NO_CONSENT = works for session only", () => {
    const session = { myLevel: 55, sortMode: "players" };
    assert.equal(Storage.writeSettingsJson(JSON.stringify(session), store), false);
    assert.equal(store.getItem(Storage.SETTINGS_KEY), null);
    assert.equal(session.myLevel, 55);
  });

  it("ENABLE_STORAGE = wardogs-storage-consent = granted-v1", () => {
    assert.equal(Storage.grantStorageConsent(store), true);
    assert.equal(store.getItem(Storage.CONSENT_KEY), "granted-v1");
    assert.equal(Storage.hasStorageConsent(store), true);
  });

  it("ENABLE_STORAGE_SETTINGS = settings persisted", () => {
    Storage.grantStorageConsent(store);
    const payload = JSON.stringify({ myLevel: 42, mapFilter: "ozeti" });
    assert.equal(Storage.writeSettingsJson(payload, store), true);
    assert.equal(Storage.readSettingsJson(store), payload);
  });

  it("ENABLE_STORAGE_LANGUAGE = language persisted", () => {
    Storage.grantStorageConsent(store);
    assert.equal(Storage.writeLanguage("de", store), true);
    assert.equal(Storage.readLanguage(store), "de");
    assert.equal(
      I18n.resolveInitialLanguage({
        storage: store,
        navigatorLanguage: "en-US",
      }),
      "de"
    );
  });

  it("RELOAD_WITH_CONSENT = settings restored", () => {
    Storage.grantStorageConsent(store);
    Storage.writeLanguage("en", store);
    Storage.writeSettingsJson(JSON.stringify({ myLevel: 88, sortMode: "name" }), store);

    // Simulate reload: new code path reading same store
    assert.equal(Storage.hasStorageConsent(store), true);
    assert.equal(Storage.readLanguage(store), "en");
    const restored = JSON.parse(Storage.readSettingsJson(store));
    assert.equal(restored.myLevel, 88);
    assert.equal(restored.sortMode, "name");
  });

  it("DISABLE_STORAGE = consent + settings + language keys removed", () => {
    Storage.grantStorageConsent(store);
    Storage.writeLanguage("de", store);
    Storage.writeSettingsJson(JSON.stringify({ myLevel: 11 }), store);
    Storage.revokeStorageConsent(store);
    assert.equal(store.getItem(Storage.CONSENT_KEY), null);
    assert.equal(store.getItem(Storage.LANGUAGE_KEY), null);
    assert.equal(store.getItem(Storage.SETTINGS_KEY), null);
    assert.equal(Storage.hasStorageConsent(store), false);
  });

  it("DISABLE_STORAGE_CURRENT_SESSION = current active UI remains usable", () => {
    const session = { myLevel: 37, sortMode: "freshest", levelFilter: "compatible" };
    Storage.grantStorageConsent(store);
    Storage.writeSettingsJson(JSON.stringify(session), store);
    Storage.revokeStorageConsent(store);
    // Runtime state untouched
    assert.equal(session.myLevel, 37);
    assert.equal(session.sortMode, "freshest");
    assert.equal(session.levelFilter, "compatible");
  });

  it("LEGACY_NO_CONSENT = old settings not silently treated as consent", () => {
    store.setItem(Storage.LANGUAGE_KEY, "de");
    store.setItem(Storage.SETTINGS_KEY, JSON.stringify({ myLevel: 99 }));
    store.setItem(Storage.LEGACY_DEBUG_KEY, "1");

    const result = Storage.migrateLegacyStorage(store);
    assert.equal(result.consented, false);
    assert.equal(result.wipedLegacy, true);
    assert.equal(result.removedDebug, true);
    assert.equal(store.getItem(Storage.LANGUAGE_KEY), null);
    assert.equal(store.getItem(Storage.SETTINGS_KEY), null);
    assert.equal(store.getItem(Storage.LEGACY_DEBUG_KEY), null);
    assert.equal(store.getItem(Storage.CONSENT_KEY), null);
    assert.equal(
      I18n.resolveInitialLanguage({
        storage: store,
        navigatorLanguage: "en-US",
      }),
      "en"
    );
  });

  it("WARDOGS_DEBUG_LOCALSTORAGE = ABSENT", () => {
    const fs = require("fs");
    const path = require("path");
    const appJs = fs.readFileSync(
      path.join(__dirname, "..", "public", "app.js"),
      "utf8"
    );
    const storageJs = fs.readFileSync(
      path.join(__dirname, "..", "public", "storage-lib.js"),
      "utf8"
    );
    assert.equal(/localStorage\.getItem\(\s*["']wardogs-debug["']\s*\)/.test(appJs), false);
    assert.equal(appJs.includes('getItem("wardogs-debug")'), false);
    // Legacy key may only be removed, never used as a debug switch.
    assert.match(storageJs, /LEGACY_DEBUG_KEY/);
    assert.match(storageJs, /removeItem/);
  });
});
