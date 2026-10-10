/**
 * Shared WARDOGS map/region normalization (browser + Node tests).
 * UMD-style: window.WardogsNormalize or module.exports.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.WardogsNormalize = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Player-facing names keyed by lowercased raw API map.variant (and aliases).
  const MAP_BY_RAW = {
    bakurani: { id: "bakurani", label: "Bakurani" },
    madrid: { id: "ozeti", label: "Ozeti" },
    ozeti: { id: "ozeti", label: "Ozeti" },
    detroit: { id: "zestafona", label: "Zestafona" },
    zestafona: { id: "zestafona", label: "Zestafona" },
  };

  const REGION_GROUPS = [
    {
      id: "europe",
      title: "Europa",
      presetLabel: "Europa",
      ids: ["eu-west", "eu-central", "eu-east", "eu-south"],
    },
    {
      id: "america",
      title: "Amerika gesamt",
      presetLabel: "Amerika",
      ids: ["na-east", "na-central", "na-west", "na-north", "south-america"],
    },
    {
      id: "north-america",
      title: "Nordamerika",
      presetLabel: "Nordamerika",
      ids: ["na-east", "na-central", "na-west", "na-north"],
    },
    {
      id: "south-america",
      title: "Südamerika",
      presetLabel: "Südamerika",
      ids: ["south-america"],
    },
    {
      id: "asia",
      title: "Asien",
      presetLabel: "Asien",
      // Live API currently uses asia-se; asia-southeast kept as alias membership.
      ids: ["asia-east", "asia-southeast", "asia-se", "asia-west"],
    },
    {
      id: "oceania",
      title: "Ozeanien",
      presetLabel: "Ozeanien",
      ids: ["oceania"],
    },
  ];

  function extractRawMap(input) {
    if (input == null) {
      return { rawVariant: null, rawBase: null };
    }
    if (typeof input === "string") {
      return { rawVariant: input, rawBase: null };
    }
    if (typeof input !== "object") {
      return { rawVariant: null, rawBase: null };
    }
    // Server object
    if (input.map && typeof input.map === "object") {
      return {
        rawVariant: input.map.variant ?? null,
        rawBase: input.map.base ?? null,
      };
    }
    // Already a map-ish object or history after/before
    if ("variant" in input || "rawVariant" in input || "map" in input) {
      const rawVariant =
        input.rawVariant ??
        input.variant ??
        (typeof input.map === "string" ? input.map : null);
      const rawBase = input.rawBase ?? input.base ?? input.world ?? null;
      return { rawVariant, rawBase };
    }
    return { rawVariant: null, rawBase: null };
  }

  function titleCaseFallback(value) {
    return String(value)
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ");
  }

  /**
   * Normalize a server, map object, history after/before, or raw variant string.
   */
  function normalizeMap(input) {
    const { rawVariant, rawBase } = extractRawMap(input);
    const key = String(rawVariant || "")
      .trim()
      .toLowerCase();

    if (key && MAP_BY_RAW[key]) {
      return {
        id: MAP_BY_RAW[key].id,
        label: MAP_BY_RAW[key].label,
        rawVariant,
        rawBase,
      };
    }

    if (rawVariant) {
      return {
        id: key,
        label: titleCaseFallback(rawVariant),
        rawVariant,
        rawBase,
      };
    }

    if (rawBase) {
      const baseKey = String(rawBase).trim().toLowerCase();
      return {
        id: baseKey,
        label: titleCaseFallback(rawBase),
        rawVariant,
        rawBase,
      };
    }

    return {
      id: "unknown",
      label: "Unbekannt",
      rawVariant: null,
      rawBase: null,
    };
  }

  function migrateMapFilterValue(value) {
    if (!value) return "";
    return normalizeMap(value).id === "unknown" ? "" : normalizeMap(value).id;
  }

  /**
   * Canonical: [] means ALL regions => no upstream region param.
   */
  function buildUpstreamRegionParam(selectedRegions) {
    if (!Array.isArray(selectedRegions) || selectedRegions.length === 0) {
      return null;
    }
    return selectedRegions.join(",");
  }

  function expandRegionGroup(groupId, availableRegionIds) {
    if (groupId === "all") return [];
    const group = REGION_GROUPS.find((g) => g.id === groupId);
    if (!group) return [];
    if (!Array.isArray(availableRegionIds) || availableRegionIds.length === 0) {
      // Prefer live asia-se over alias asia-southeast when API list is not ready.
      return group.ids.filter((id) => id !== "asia-southeast");
    }
    return group.ids.filter((id) => availableRegionIds.includes(id));
  }

  function findCurrentMapEvent(events, serverOrMap) {
    const currentId = normalizeMap(serverOrMap).id;
    if (!currentId || currentId === "unknown") return null;
    const list = Array.isArray(events) ? events : [];
    return (
      list.find((e) => {
        if (!e || e.kind !== "map") return false;
        const after = e.after;
        const raw =
          (after && typeof after === "object" && after.map) ||
          (typeof after === "string" ? after : null);
        if (!raw) return false;
        return normalizeMap(raw).id === currentId;
      }) || null
    );
  }

  /**
   * Level-Cap filter (upper bound only).
   * capSetting: "any" | number | numeric string
   * max: server level.max (0/null = unrestricted upper bound)
   *
   * "any" matches everything including unrestricted.
   * A specific cap requires max > 0 AND max <= selectedMaximum.
   */
  function capFilter(capSetting, max) {
    if (capSetting == null || capSetting === "" || capSetting === "any") {
      return true;
    }
    const limit = Number(capSetting);
    if (!Number.isFinite(limit) || limit < 1) return true;

    if (max == null || max === 0) return false;
    const maxNum = Number(max);
    if (!Number.isFinite(maxNum) || maxNum <= 0) return false;
    return maxNum <= limit;
  }

  /**
   * Resolve UI level-cap selection + optional custom value to a capFilter setting.
   */
  function resolveLevelCapSetting(levelCapFilter, customLevelCap) {
    if (!levelCapFilter || levelCapFilter === "any") return "any";
    if (levelCapFilter === "custom") {
      const n = Number(customLevelCap);
      if (!Number.isFinite(n) || n < 1) return "any";
      return Math.min(Math.floor(n), 10000);
    }
    const n = Number(levelCapFilter);
    if (!Number.isFinite(n) || n < 1) return "any";
    return n;
  }

  /**
   * Public join slots: maxPlayers minus current players minus reserved slots.
   */
  function computeFreeSlots(server) {
    const max = Number(server?.maxPlayers) || 0;
    const players = Number(server?.players) || 0;
    const reserved = Math.max(0, Number(server?.reservedPlayers) || 0);
    return Math.max(0, max - players - reserved);
  }

  /**
   * Primary ruleset from API rulesets[] (standard | infantry-only | hardcore).
   */
  function primaryRuleset(server) {
    const list = Array.isArray(server?.rulesets)
      ? server.rulesets.map((r) => String(r || "").toLowerCase())
      : [];
    if (list.includes("infantry-only")) return "infantry-only";
    if (list.includes("hardcore")) return "hardcore";
    if (list.includes("standard")) return "standard";
    return list[0] || "standard";
  }

  return {
    MAP_BY_RAW,
    REGION_GROUPS,
    normalizeMap,
    migrateMapFilterValue,
    buildUpstreamRegionParam,
    expandRegionGroup,
    findCurrentMapEvent,
    capFilter,
    resolveLevelCapSetting,
    computeFreeSlots,
    primaryRuleset,
  };
});
