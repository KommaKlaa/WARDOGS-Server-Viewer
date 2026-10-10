/**
 * Browser preference storage with explicit opt-in consent.
 * Browser: window.WardogsStorage | Node: module.exports
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.WardogsStorage = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const CONSENT_KEY = "wardogs-storage-consent";
  const CONSENT_VALUE = "granted-v1";
  const LANGUAGE_KEY = "wardogs-language";
  const SETTINGS_KEY = "wardogs-viewer-settings-v1";
  const LEGACY_DEBUG_KEY = "wardogs-debug";

  const CONVENIENCE_KEYS = [CONSENT_KEY, LANGUAGE_KEY, SETTINGS_KEY, LEGACY_DEBUG_KEY];

  function getStore(storage) {
    if (storage) return storage;
    try {
      if (typeof localStorage !== "undefined") return localStorage;
    } catch {
      /* ignore */
    }
    return null;
  }

  function hasStorageConsent(storage) {
    const store = getStore(storage);
    if (!store) return false;
    try {
      return store.getItem(CONSENT_KEY) === CONSENT_VALUE;
    } catch {
      return false;
    }
  }

  function removeKey(store, key) {
    try {
      store.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  function clearConvenienceStorage(storage) {
    const store = getStore(storage);
    if (!store) return { cleared: false, keys: [] };
    const cleared = [];
    for (const key of CONVENIENCE_KEYS) {
      try {
        if (store.getItem(key) != null) cleared.push(key);
      } catch {
        /* ignore */
      }
      removeKey(store, key);
    }
    return { cleared: true, keys: cleared };
  }

  /**
   * Legacy migration: never treat old convenience values as consent.
   * Always remove wardogs-debug. Without granted-v1, wipe language/settings too.
   */
  function migrateLegacyStorage(storage) {
    const store = getStore(storage);
    if (!store) {
      return { consented: false, wipedLegacy: false, removedDebug: false };
    }

    let removedDebug = false;
    try {
      if (store.getItem(LEGACY_DEBUG_KEY) != null) {
        removedDebug = true;
      }
    } catch {
      /* ignore */
    }
    removeKey(store, LEGACY_DEBUG_KEY);

    if (hasStorageConsent(store)) {
      return { consented: true, wipedLegacy: false, removedDebug };
    }

    let wipedLegacy = false;
    for (const key of [LANGUAGE_KEY, SETTINGS_KEY, CONSENT_KEY]) {
      try {
        if (store.getItem(key) != null) wipedLegacy = true;
      } catch {
        /* ignore */
      }
      removeKey(store, key);
    }
    return { consented: false, wipedLegacy, removedDebug };
  }

  function grantStorageConsent(storage) {
    const store = getStore(storage);
    if (!store) return false;
    try {
      store.setItem(CONSENT_KEY, CONSENT_VALUE);
      removeKey(store, LEGACY_DEBUG_KEY);
      return true;
    } catch {
      return false;
    }
  }

  function revokeStorageConsent(storage) {
    return clearConvenienceStorage(storage);
  }

  function readLanguage(storage) {
    if (!hasStorageConsent(storage)) return null;
    const store = getStore(storage);
    if (!store) return null;
    try {
      return store.getItem(LANGUAGE_KEY);
    } catch {
      return null;
    }
  }

  function writeLanguage(lang, storage) {
    if (!hasStorageConsent(storage)) return false;
    const store = getStore(storage);
    if (!store) return false;
    try {
      store.setItem(LANGUAGE_KEY, String(lang));
      return true;
    } catch {
      return false;
    }
  }

  function readSettingsJson(storage) {
    if (!hasStorageConsent(storage)) return null;
    const store = getStore(storage);
    if (!store) return null;
    try {
      return store.getItem(SETTINGS_KEY);
    } catch {
      return null;
    }
  }

  function writeSettingsJson(json, storage) {
    if (!hasStorageConsent(storage)) return false;
    const store = getStore(storage);
    if (!store) return false;
    try {
      store.setItem(SETTINGS_KEY, String(json));
      return true;
    } catch {
      return false;
    }
  }

  function listStoredKeys(storage) {
    const store = getStore(storage);
    if (!store || typeof store.length !== "number") {
      // Map-like mock used in tests
      if (store && store.data && typeof store.data === "object") {
        return Object.keys(store.data);
      }
      return [];
    }
    const keys = [];
    try {
      for (let i = 0; i < store.length; i += 1) {
        const k = store.key(i);
        if (k) keys.push(k);
      }
    } catch {
      /* ignore */
    }
    return keys;
  }

  return {
    CONSENT_KEY,
    CONSENT_VALUE,
    LANGUAGE_KEY,
    SETTINGS_KEY,
    LEGACY_DEBUG_KEY,
    CONVENIENCE_KEYS,
    hasStorageConsent,
    clearConvenienceStorage,
    migrateLegacyStorage,
    grantStorageConsent,
    revokeStorageConsent,
    readLanguage,
    writeLanguage,
    readSettingsJson,
    writeSettingsJson,
    listStoredKeys,
  };
});
