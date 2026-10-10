"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const I18n = require("../public/i18n.js");

describe("i18n", () => {
  it("has de and en dictionaries", () => {
    assert.ok(I18n.translations.de);
    assert.ok(I18n.translations.en);
  });

  it("has matching keys in both languages", () => {
    const { missingInDe, missingInEn } = I18n.missingKeys();
    assert.deepEqual(missingInDe, []);
    assert.deepEqual(missingInEn, []);
  });

  it("falls back unknown language to English", () => {
    assert.equal(I18n.normalizeLang("fr"), "en");
    assert.equal(I18n.t("fr", "search"), I18n.translations.en.search);
  });

  it("detects German navigator language", () => {
    assert.equal(I18n.detectNavigatorLanguage("de-DE"), "de");
    assert.equal(I18n.detectNavigatorLanguage("en-US"), "en");
  });

  it("stored language overrides navigator only with consent", () => {
    const store = {
      data: {
        [I18n.CONSENT_KEY]: I18n.CONSENT_VALUE,
        [I18n.LANGUAGE_KEY]: "en",
      },
      getItem(k) {
        return Object.prototype.hasOwnProperty.call(this.data, k)
          ? this.data[k]
          : null;
      },
    };
    assert.equal(
      I18n.resolveInitialLanguage({
        storage: store,
        navigatorLanguage: "de-DE",
      }),
      "en"
    );
  });

  it("ignores stored language without consent", () => {
    const store = {
      data: { [I18n.LANGUAGE_KEY]: "en" },
      getItem(k) {
        return Object.prototype.hasOwnProperty.call(this.data, k)
          ? this.data[k]
          : null;
      },
    };
    assert.equal(
      I18n.resolveInitialLanguage({
        storage: store,
        navigatorLanguage: "de-DE",
      }),
      "de"
    );
  });

  it("uses navigator when no stored language", () => {
    const store = {
      getItem() {
        return null;
      },
    };
    assert.equal(
      I18n.resolveInitialLanguage({
        storage: store,
        navigatorLanguage: "de-CH",
      }),
      "de"
    );
  });

  it("has required gaming terms", () => {
    assert.equal(I18n.t("de", "colFreeSlots"), "Freie Plätze");
    assert.equal(I18n.t("de", "colLevelRestriction"), "Levelgrenze");
    assert.equal(I18n.t("en", "copyJoinCode"), "Copy join code");
    assert.equal(I18n.t("de", "copyJoinCode"), "Beitrittscode kopieren");
  });
});
