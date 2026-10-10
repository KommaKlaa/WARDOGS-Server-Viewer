"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeMap,
  buildUpstreamRegionParam,
  expandRegionGroup,
  findCurrentMapEvent,
  capFilter,
  resolveLevelCapSetting,
  REGION_GROUPS,
} = require("../public/normalize-lib.js");

describe("normalizeMap", () => {
  it("maps Bakurani -> Bakurani", () => {
    const n = normalizeMap("Bakurani");
    assert.equal(n.id, "bakurani");
    assert.equal(n.label, "Bakurani");
    assert.equal(n.rawVariant, "Bakurani");
  });

  it("maps Madrid -> Ozeti", () => {
    const n = normalizeMap({ map: { variant: "Madrid", base: "Europe" } });
    assert.equal(n.id, "ozeti");
    assert.equal(n.label, "Ozeti");
    assert.equal(n.rawVariant, "Madrid");
  });

  it("maps Detroit -> Zestafona", () => {
    const n = normalizeMap("Detroit");
    assert.equal(n.id, "zestafona");
    assert.equal(n.label, "Zestafona");
  });

  it("unknown map stays readable fallback", () => {
    const n = normalizeMap("FutureMapX");
    assert.equal(n.id, "futuremapx");
    assert.equal(n.label, "FutureMapX");
    assert.notEqual(n.id, "bakurani");
    assert.notEqual(n.id, "ozeti");
    assert.notEqual(n.id, "zestafona");
  });
});

describe("region helpers", () => {
  const live = [
    "asia-east",
    "asia-se",
    "asia-west",
    "eu-central",
    "eu-east",
    "eu-south",
    "eu-west",
    "na-central",
    "na-east",
    "na-north",
    "na-west",
    "oceania",
    "south-america",
  ];

  it("expands Europa", () => {
    assert.deepEqual(expandRegionGroup("europe", live).sort(), [
      "eu-central",
      "eu-east",
      "eu-south",
      "eu-west",
    ]);
  });

  it("expands Amerika", () => {
    assert.deepEqual(expandRegionGroup("america", live).sort(), [
      "na-central",
      "na-east",
      "na-north",
      "na-west",
      "south-america",
    ]);
  });

  it("expands Asien with live asia-se", () => {
    assert.deepEqual(expandRegionGroup("asia", live).sort(), [
      "asia-east",
      "asia-se",
      "asia-west",
    ]);
  });

  it("empty selectedRegions => no region query param", () => {
    assert.equal(buildUpstreamRegionParam([]), null);
    assert.equal(buildUpstreamRegionParam(null), null);
  });

  it("builds comma-separated upstream region param", () => {
    assert.equal(
      buildUpstreamRegionParam(["eu-west", "eu-central"]),
      "eu-west,eu-central"
    );
  });

  it("defines expected group presets", () => {
    assert.ok(REGION_GROUPS.some((g) => g.id === "europe"));
    assert.ok(REGION_GROUPS.some((g) => g.id === "america"));
    assert.ok(REGION_GROUPS.some((g) => g.id === "asia"));
  });
});

describe("map age event matching", () => {
  it("matches history Madrid event to live Ozeti/Madrid server", () => {
    const server = { map: { variant: "Madrid", base: "Europe" } };
    const events = [
      {
        at: "2026-10-03T12:00:00.000Z",
        kind: "map",
        before: { map: "Bakurani" },
        after: { map: "Madrid", world: "Europe" },
      },
      {
        at: "2026-10-03T10:00:00.000Z",
        kind: "map",
        before: { map: "Detroit" },
        after: { map: "Bakurani" },
      },
    ];
    const hit = findCurrentMapEvent(events, server);
    assert.ok(hit);
    assert.equal(hit.after.map, "Madrid");
    assert.equal(normalizeMap(hit.after.map).label, "Ozeti");
  });
});

describe("capFilter", () => {
  it("any allows unrestricted max=0", () => {
    assert.equal(capFilter("any", 0), true);
  });

  it("50 matches max 30/40/50 and rejects 51/100/0/null", () => {
    assert.equal(capFilter(50, 30), true);
    assert.equal(capFilter(50, 40), true);
    assert.equal(capFilter(50, 50), true);
    assert.equal(capFilter(50, 51), false);
    assert.equal(capFilter(50, 100), false);
    assert.equal(capFilter(50, 0), false);
    assert.equal(capFilter(50, null), false);
  });

  it("100 matches 50/100 and rejects 150", () => {
    assert.equal(capFilter(100, 50), true);
    assert.equal(capFilter(100, 100), true);
    assert.equal(capFilter(100, 150), false);
  });

  it("resolveLevelCapSetting handles custom", () => {
    assert.equal(resolveLevelCapSetting("custom", 75), 75);
    assert.equal(resolveLevelCapSetting("50", null), 50);
    assert.equal(resolveLevelCapSetting("any", 75), "any");
  });
});

describe("level 37 + restricted-compatible + cap 50", () => {
  function normalizeBound(value) {
    if (value == null || value === 0) return null;
    return Number(value);
  }
  function hasEffectiveRestriction(level) {
    if (!level) return false;
    return normalizeBound(level.min) != null || normalizeBound(level.max) != null;
  }
  function isLevelCompatible(level, userLevel) {
    if (!hasEffectiveRestriction(level)) return true;
    const min = normalizeBound(level.min);
    const max = normalizeBound(level.max);
    if (min != null && userLevel < min) return false;
    if (max != null && userLevel > max) return false;
    return true;
  }
  function passesCombo(level, userLevel, cap) {
    const restricted = hasEffectiveRestriction(level);
    const compatible = isLevelCompatible(level, userLevel);
    if (!(restricted && compatible)) return false;
    return capFilter(cap, level.max);
  }

  const user = 37;
  const cap = 50;

  it("excludes max=30 (incompatible for 37)", () => {
    assert.equal(passesCombo({ min: 0, max: 30 }, user, cap), false);
  });
  it("includes max=40", () => {
    assert.equal(passesCombo({ min: 0, max: 40 }, user, cap), true);
  });
  it("includes min=20 max=50", () => {
    assert.equal(passesCombo({ min: 20, max: 50 }, user, cap), true);
  });
  it("excludes min=38 max=50", () => {
    assert.equal(passesCombo({ min: 38, max: 50 }, user, cap), false);
  });
  it("excludes max=100 (cap)", () => {
    assert.equal(passesCombo({ min: 0, max: 100 }, user, cap), false);
  });
  it("excludes unrestricted 0/0", () => {
    assert.equal(passesCombo({ min: 0, max: 0 }, user, cap), false);
  });
});
