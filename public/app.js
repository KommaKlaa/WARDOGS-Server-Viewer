(() => {
  "use strict";

  const ENRICH_CONCURRENCY = 2;
  const DISPLAY_LIMIT = 80;
  const ENRICH_CANDIDATE_LIMIT = 50;
  const DEFAULT_REFRESH_SECONDS = 180;
  const DEFAULT_MY_LEVEL = 37;

  const Normalize = window.WardogsNormalize;
  const I18n = window.WardogsI18n;
  const StorageApi = window.WardogsStorage;
  if (!Normalize) {
    throw new Error("normalize-lib.js missing — load before app.js");
  }
  if (!I18n) {
    throw new Error("i18n.js missing — load before app.js");
  }
  if (!StorageApi) {
    throw new Error("storage-lib.js missing — load before app.js");
  }

  const STORAGE_KEY = StorageApi.SETTINGS_KEY;

  const {
    normalizeMap,
    migrateMapFilterValue,
    buildUpstreamRegionParam,
    expandRegionGroup,
    findCurrentMapEvent,
    capFilter,
    resolveLevelCapSetting,
    computeFreeSlots,
    primaryRuleset,
    REGION_GROUPS,
  } = Normalize;

  // Wipe legacy convenience keys unless explicit opt-in consent exists.
  StorageApi.migrateLegacyStorage();

  let storageConsent = StorageApi.hasStorageConsent();

  let currentLang = I18n.resolveInitialLanguage({
    navigatorLanguage:
      typeof navigator !== "undefined" ? navigator.language : "en",
  });

  function t(key, vars) {
    return I18n.t(currentLang, key, vars);
  }

  const REGION_LABEL_KEYS = {
    "eu-west": "regionEuWest",
    "eu-central": "regionEuCentral",
    "eu-east": "regionEuEast",
    "eu-south": "regionEuSouth",
    "na-east": "regionNaEast",
    "na-central": "regionNaCentral",
    "na-west": "regionNaWest",
    "na-north": "regionNaNorth",
    "south-america": "regionSouthAmerica",
    "asia-east": "regionAsiaEast",
    "asia-southeast": "regionAsiaSoutheast",
    "asia-se": "regionAsiaSoutheast",
    "asia-west": "regionAsiaWest",
    oceania: "regionOceania",
  };

  const GROUP_TITLE_KEYS = {
    europe: "europe",
    america: "americaTotal",
    "north-america": "northAmerica",
    "south-america": "southAmerica",
    asia: "asia",
    oceania: "oceania",
  };

  const GROUP_PRESET_KEYS = {
    europe: "europe",
    america: "america",
    "north-america": "northAmerica",
    "south-america": "southAmerica",
    asia: "asia",
    oceania: "oceania",
  };

  const els = {
    apiStatus: document.getElementById("apiStatus"),
    lastRefresh: document.getElementById("lastRefresh"),
    visibleCount: document.getElementById("visibleCount"),
    networkPlayers: document.getElementById("networkPlayers"),
    networkServers: document.getElementById("networkServers"),
    staleBanner: document.getElementById("staleBanner"),
    search: document.getElementById("search"),
    mapFilter: document.getElementById("mapFilter"),
    serverType: document.getElementById("serverType"),
    passwordFilter: document.getElementById("passwordFilter"),
    rulesetFilter: document.getElementById("rulesetFilter"),
    infantryOnlyToggle: document.getElementById("infantryOnlyToggle"),
    myLevel: document.getElementById("myLevel"),
    levelFilter: document.getElementById("levelFilter"),
    levelCapFilter: document.getElementById("levelCapFilter"),
    customLevelCap: document.getElementById("customLevelCap"),
    customLevelCapWrap: document.getElementById("customLevelCapWrap"),
    maxAge: document.getElementById("maxAge"),
    minFree: document.getElementById("minFree"),
    sortMode: document.getElementById("sortMode"),
    hideFull: document.getElementById("hideFull"),
    hideEmpty: document.getElementById("hideEmpty"),
    refreshBtn: document.getElementById("refreshBtn"),
    serverBody: document.getElementById("serverBody"),
    regionToggle: document.getElementById("regionToggle"),
    regionPanel: document.getElementById("regionPanel"),
    regionSummary: document.getElementById("regionSummary"),
    regionPresets: document.getElementById("regionPresets"),
    regionGroups: document.getElementById("regionGroups"),
    regionSelectAll: document.getElementById("regionSelectAll"),
    regionClear: document.getElementById("regionClear"),
    regionApply: document.getElementById("regionApply"),
    langDe: document.getElementById("langDe"),
    langEn: document.getElementById("langEn"),
    ageInfoBtn: document.getElementById("ageInfoBtn"),
    rememberSettings: document.getElementById("rememberSettings"),
    updateBanner: document.getElementById("updateBanner"),
    appVersionLocal: document.getElementById("appVersionLocal"),
    updateStatusText: document.getElementById("updateStatusText"),
    updateMetaText: document.getElementById("updateMetaText"),
    updateCheckBtn: document.getElementById("updateCheckBtn"),
    updateApplyBtn: document.getElementById("updateApplyBtn"),
    updateLaterBtn: document.getElementById("updateLaterBtn"),
    updateReleaseLink: document.getElementById("updateReleaseLink"),
    rankingPanel: document.getElementById("rankingPanel"),
    rankingToggleBtn: document.getElementById("rankingToggleBtn"),
    rankingBody: document.getElementById("rankingBody"),
    rankingWindow: document.getElementById("rankingWindow"),
    rankingType: document.getElementById("rankingType"),
    rankingRefreshBtn: document.getElementById("rankingRefreshBtn"),
    rankingChart: document.getElementById("rankingChart"),
  };

  /** @type {any} */
  let updateInfo = null;
  let updateDismissedRemote = null;

  /** @type {any[]} */
  let allServers = [];
  /** @type {string[]} */
  let availableRegionIds = [];
  /** @type {string[]} */
  let selectedRegions = [];
  /** @type {string[]} */
  let draftRegions = [];
  /** @type {Record<string, any>} */
  let enrichments = {};
  /** @type {Set<string>} */
  let enrichInFlight = new Set();
  let refreshTimer = null;
  let refreshSeconds = DEFAULT_REFRESH_SECONDS;
  let renderToken = 0;
  let clockTimer = null;
  let pendingMap = "";

  const defaultSettings = {
    myLevel: DEFAULT_MY_LEVEL,
    selectedRegions: [],
    mapFilter: "",
    serverType: "all",
    passwordFilter: "all",
    rulesetFilter: "all",
    hideFull: false,
    hideEmpty: false,
    levelFilter: "all",
    levelCapFilter: "any",
    customLevelCap: 75,
    maxAge: "",
    minFree: "",
    sortMode: "freshest",
    search: "",
    rankingCollapsed: false,
  };

  function regionLabel(id) {
    const key = REGION_LABEL_KEYS[id];
    if (key) return t(key);
    return String(id || "")
      .split(/[-_]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function groupTitle(group) {
    return t(GROUP_TITLE_KEYS[group.id] || group.title);
  }

  function groupPresetLabel(group) {
    return t(GROUP_PRESET_KEYS[group.id] || group.presetLabel);
  }

  function setLanguage(lang, { persist = true, refresh = true } = {}) {
    currentLang = I18n.normalizeLang(lang);
    if (persist && storageConsent) {
      StorageApi.writeLanguage(currentLang);
    }
    I18n.applyDom(currentLang);
    if (els.langDe) {
      els.langDe.setAttribute("aria-pressed", currentLang === "de" ? "true" : "false");
    }
    if (els.langEn) {
      els.langEn.setAttribute("aria-pressed", currentLang === "en" ? "true" : "false");
    }
    updateSelectOptionLabels();
    updateRegionSummary();
    if (!els.regionPanel.classList.contains("hidden")) renderRegionPanel();
    renderUpdateBanner();
    if (lastLiveStats) renderLiveStats(lastLiveStats);
    if (rankingRows.length) renderRankingChart(rankingRows);
    setRankingCollapsed(
      Boolean(els.rankingPanel?.classList.contains("is-collapsed")),
      { persist: false }
    );
    if (refresh) refreshView();
  }

  function updateSelectOptionLabels() {
    const mapFirst = els.mapFilter.querySelector('option[value=""]');
    if (mapFirst) mapFirst.textContent = t("allMaps");

    const typeMap = {
      all: "allServers",
      official: "official",
      community: "community",
    };
    [...els.serverType.options].forEach((opt) => {
      const key = typeMap[opt.value];
      if (key) opt.textContent = t(key);
    });

    const passwordMap = {
      all: "passwordFilterAll",
      open: "passwordFilterOpen",
      locked: "passwordFilterLocked",
    };
    if (els.passwordFilter) {
      [...els.passwordFilter.options].forEach((opt) => {
        const key = passwordMap[opt.value];
        if (key) opt.textContent = t(key);
      });
    }

    const rulesetMap = {
      all: "rulesetAll",
      standard: "rulesetStandard",
      "infantry-only": "rulesetInfantryOnly",
      hardcore: "rulesetHardcore",
    };
    if (els.rulesetFilter) {
      [...els.rulesetFilter.options].forEach((opt) => {
        const key = rulesetMap[opt.value];
        if (key) opt.textContent = t(key);
      });
    }

    const levelMap = {
      all: "levelFilterAll",
      compatible: "levelFilterCompatible",
      "restricted-compatible": "levelFilterRestrictedCompatible",
      unrestricted: "levelFilterUnrestricted",
      incompatible: "levelFilterIncompatible",
    };
    [...els.levelFilter.options].forEach((opt) => {
      const key = levelMap[opt.value];
      if (key) opt.textContent = t(key);
    });

    const capMap = {
      any: "levelCapAny",
      50: "levelCap50",
      100: "levelCap100",
      150: "levelCap150",
      200: "levelCap200",
      300: "levelCap300",
      500: "levelCap500",
      1000: "levelCap1000",
      custom: "levelCapCustom",
    };
    [...els.levelCapFilter.options].forEach((opt) => {
      const key = capMap[opt.value];
      if (key) opt.textContent = t(key);
    });

    const ageMap = {
      "": "any",
      10: "age10",
      20: "age20",
      30: "age30",
      45: "age45",
      60: "age60",
    };
    [...els.maxAge.options].forEach((opt) => {
      const key = ageMap[opt.value];
      if (key) opt.textContent = t(key);
    });

    const freeAny = els.minFree.querySelector('option[value=""]');
    if (freeAny) freeAny.textContent = t("any");

    const sortMap = {
      freshest: "sortFreshest",
      players: "sortPlayers",
      free: "sortFree",
      name: "sortName",
    };
    [...els.sortMode.options].forEach((opt) => {
      const key = sortMap[opt.value];
      if (key) opt.textContent = t(key);
    });

    const rankingWindowMap = {
      "24h": "rankingWindow24h",
      "7d": "rankingWindow7d",
      "30d": "rankingWindow30d",
    };
    if (els.rankingWindow) {
      [...els.rankingWindow.options].forEach((opt) => {
        const key = rankingWindowMap[opt.value];
        if (key) opt.textContent = t(key);
      });
    }
    if (els.rankingType) {
      const rankingTypeMap = {
        all: "allServers",
        official: "official",
        community: "community",
      };
      [...els.rankingType.options].forEach((opt) => {
        const key = rankingTypeMap[opt.value];
        if (key) opt.textContent = t(key);
      });
    }
  }

  function migrateSettings(raw) {
    const incoming = raw && typeof raw === "object" ? raw : {};
    const settings = { ...defaultSettings, ...incoming };

    if (!Array.isArray(incoming.selectedRegions)) {
      if (typeof incoming.region === "string" && incoming.region) {
        settings.selectedRegions = [incoming.region];
      } else {
        settings.selectedRegions = [];
      }
    } else {
      settings.selectedRegions = [...incoming.selectedRegions];
    }

    if (incoming.levelFilter == null) {
      if (incoming.onlyCompatible === true) settings.levelFilter = "compatible";
      else settings.levelFilter = "all";
    }

    if (incoming.levelCapFilter == null) {
      settings.levelCapFilter = "any";
    }
    if (incoming.customLevelCap == null) {
      settings.customLevelCap = 75;
    } else {
      settings.customLevelCap = Math.max(
        1,
        Math.min(10000, Math.floor(Number(incoming.customLevelCap) || 75))
      );
    }

    if (incoming.myLevel == null && incoming.userLevel == null) {
      // Keep default 37 only when no prior level was stored.
      settings.myLevel = DEFAULT_MY_LEVEL;
    } else if (incoming.myLevel == null && incoming.userLevel != null) {
      settings.myLevel = Number(incoming.userLevel) || DEFAULT_MY_LEVEL;
    } else {
      settings.myLevel = Number(incoming.myLevel) || DEFAULT_MY_LEVEL;
    }

    // Migrate legacy raw map names (Madrid/Detroit) and labels to normalized ids.
    if (incoming.mapFilter) {
      settings.mapFilter = migrateMapFilterValue(incoming.mapFilter);
    }

    // Drop obsolete single-region key from persisted shape.
    delete settings.region;
    delete settings.onlyCompatible;

    return settings;
  }

  function collectSettings() {
    return {
      myLevel: Number(els.myLevel.value) || DEFAULT_MY_LEVEL,
      selectedRegions: [...selectedRegions],
      mapFilter: els.mapFilter.value,
      serverType: els.serverType.value,
      passwordFilter: els.passwordFilter?.value || "all",
      rulesetFilter: els.rulesetFilter?.value || "all",
      hideFull: els.hideFull.checked,
      hideEmpty: els.hideEmpty.checked,
      levelFilter: els.levelFilter.value || "all",
      levelCapFilter: els.levelCapFilter.value || "any",
      customLevelCap: Math.max(
        1,
        Math.min(10000, Math.floor(Number(els.customLevelCap.value) || 75))
      ),
      maxAge: els.maxAge.value,
      minFree: els.minFree.value,
      sortMode: els.sortMode.value,
      search: els.search.value,
      rankingCollapsed: Boolean(
        els.rankingPanel?.classList.contains("is-collapsed")
      ),
    };
  }

  function loadSettings() {
    if (!storageConsent) return { ...defaultSettings };
    try {
      const raw = StorageApi.readSettingsJson();
      if (!raw) return { ...defaultSettings };
      return migrateSettings(JSON.parse(raw));
    } catch {
      return { ...defaultSettings };
    }
  }

  function saveSettings() {
    if (!storageConsent) return;
    StorageApi.writeSettingsJson(JSON.stringify(collectSettings()));
  }

  function syncRememberCheckbox() {
    if (els.rememberSettings) {
      els.rememberSettings.checked = storageConsent;
    }
  }

  function enableStoragePersistence() {
    StorageApi.grantStorageConsent();
    storageConsent = true;
    syncRememberCheckbox();
    StorageApi.writeLanguage(currentLang);
    saveSettings();
  }

  function disableStoragePersistence() {
    StorageApi.revokeStorageConsent();
    storageConsent = false;
    syncRememberCheckbox();
    // Keep current runtime UI state; do not reset filters until reload.
  }

  function syncCustomCapVisibility() {
    const isCustom = els.levelCapFilter.value === "custom";
    els.customLevelCapWrap.classList.toggle("hidden", !isCustom);
  }

  function syncInfantryOnlyToggle() {
    if (!els.infantryOnlyToggle || !els.rulesetFilter) return;
    els.infantryOnlyToggle.checked = els.rulesetFilter.value === "infantry-only";
  }

  function setRankingCollapsed(collapsed, { persist = true } = {}) {
    if (!els.rankingPanel || !els.rankingToggleBtn) return;
    const isCollapsed = Boolean(collapsed);
    els.rankingPanel.classList.toggle("is-collapsed", isCollapsed);
    els.rankingToggleBtn.setAttribute(
      "aria-expanded",
      isCollapsed ? "false" : "true"
    );
    els.rankingToggleBtn.setAttribute(
      "title",
      isCollapsed ? t("rankingExpand") : t("rankingCollapse")
    );
    if (persist) saveSettings();
  }

  function applySettings(settings) {
    els.myLevel.value = String(settings.myLevel ?? DEFAULT_MY_LEVEL);
    els.serverType.value = settings.serverType || "all";
    if (els.passwordFilter) {
      els.passwordFilter.value = settings.passwordFilter || "all";
    }
    if (els.rulesetFilter) {
      els.rulesetFilter.value = settings.rulesetFilter || "all";
    }
    syncInfantryOnlyToggle();
    els.hideFull.checked = Boolean(settings.hideFull);
    els.hideEmpty.checked = Boolean(settings.hideEmpty);
    els.levelFilter.value = settings.levelFilter || "all";
    els.levelCapFilter.value = settings.levelCapFilter || "any";
    els.customLevelCap.value = String(
      Math.max(1, Math.min(10000, Math.floor(Number(settings.customLevelCap) || 75)))
    );
    els.maxAge.value = settings.maxAge || "";
    els.minFree.value = settings.minFree || "";
    els.sortMode.value = settings.sortMode || "freshest";
    els.search.value = settings.search || "";
    selectedRegions = Array.isArray(settings.selectedRegions)
      ? [...settings.selectedRegions]
      : [];
    draftRegions = [...selectedRegions];
    pendingMap = migrateMapFilterValue(settings.mapFilter || "") || "";
    setRankingCollapsed(Boolean(settings.rankingCollapsed), { persist: false });
    syncCustomCapVisibility();
    updateRegionSummary();
  }

  function setApiStatus(state, key) {
    const text =
      key === "OK" || key === "apiOnline"
        ? t("apiOnline")
        : key === "LOADING" || key === "apiLoading"
          ? t("apiLoading")
          : key === "ERROR" || key === "apiError"
            ? t("apiError")
            : key === "DEGRADED" || key === "apiDegraded"
              ? t("apiDegraded")
              : key;
    els.apiStatus.textContent = text;
    els.apiStatus.className = "badge";
    if (state === "ok") els.apiStatus.classList.add("badge-ok");
    else if (state === "err") els.apiStatus.classList.add("badge-err");
    else els.apiStatus.classList.add("badge-load");
  }

  function mapName(server) {
    const n = normalizeMap(server);
    return n.id === "unknown" ? t("unknown") : n.label;
  }

  function mapId(server) {
    return normalizeMap(server).id;
  }

  function freeSlots(server) {
    return computeFreeSlots(server);
  }

  function rulesetLabel(ruleset) {
    if (ruleset === "infantry-only") return t("rulesetInfantryOnly");
    if (ruleset === "hardcore") return t("rulesetHardcore");
    if (ruleset === "standard") return t("rulesetStandard");
    return ruleset || t("rulesetStandard");
  }

  function formatDuration(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
  }

  function classifyAge(seconds) {
    if (seconds == null || Number.isNaN(seconds)) return null;
    const mins = seconds / 60;
    if (mins <= 10) return "fresh";
    if (mins <= 30) return "running";
    if (mins <= 50) return "late";
    return "veryLate";
  }

  function ageClass(label) {
    if (label === "fresh") return "age-fresh";
    if (label === "running") return "age-running";
    if (label === "late") return "age-late";
    if (label === "veryLate") return "age-very-late";
    return "age-unknown";
  }

  function normalizeBound(value) {
    if (value == null || value === 0) return null;
    return Number(value);
  }

  function hasEffectiveRestriction(level) {
    if (!level) return false;
    const min = normalizeBound(level.min);
    const max = normalizeBound(level.max);
    return min != null || max != null;
  }

  function isUnrestrictedLevel(level) {
    return !hasEffectiveRestriction(level);
  }

  function isLevelCompatible(level, userLevel) {
    if (isUnrestrictedLevel(level)) return true;
    const min = normalizeBound(level.min);
    const max = normalizeBound(level.max);
    if (min != null && userLevel < min) return false;
    if (max != null && userLevel > max) return false;
    return true;
  }

  function formatLevelLimit(level) {
    if (isUnrestrictedLevel(level)) return t("noRestriction");
    const min = normalizeBound(level.min);
    const max = normalizeBound(level.max);
    if (min != null && max != null) return t("levelRange", { min, max });
    if (min != null) return `${t("minLevel")} ${min}`;
    if (max != null) return `${t("maxLevel")} ${max}`;
    return t("noRestriction");
  }

  function getMapAgeSeconds(enrichment) {
    if (!enrichment || enrichment.mapAt == null) return null;
    const at = Date.parse(enrichment.mapAt);
    if (Number.isNaN(at)) return null;
    return Math.max(0, (Date.now() - at) / 1000);
  }

  function serverStatus(server) {
    if (server.passwordProtected) return { text: t("lock"), cls: "status-locked" };
    const free = freeSlots(server);
    if ((Number(server.maxPlayers) || 0) > 0 && free <= 0) {
      return { text: t("full"), cls: "status-full" };
    }
    if ((Number(server.players) || 0) === 0) {
      return { text: t("empty"), cls: "status-empty" };
    }
    return { text: t("open"), cls: "status-open" };
  }

  function uniqueIds(ids) {
    return [...new Set(ids.filter(Boolean))];
  }

  function knownGroupIds() {
    return new Set(REGION_GROUPS.flatMap((g) => g.ids));
  }

  function availableInGroup(group) {
    return group.ids.filter((id) => availableRegionIds.includes(id));
  }

  function otherRegionIds() {
    const known = knownGroupIds();
    return availableRegionIds.filter((id) => !known.has(id));
  }

  function arraysEqualAsSets(a, b) {
    if (a.length !== b.length) return false;
    const setB = new Set(b);
    return a.every((x) => setB.has(x));
  }

  function updateRegionSummary() {
    if (!selectedRegions.length || selectedRegions.length === availableRegionIds.length) {
      els.regionSummary.textContent = t("allRegions");
      return;
    }

    for (const group of REGION_GROUPS) {
      const ids = availableInGroup(group);
      if (ids.length && arraysEqualAsSets(selectedRegions, ids)) {
        els.regionSummary.textContent = `${groupPresetLabel(group)} (${ids.length})`;
        return;
      }
    }

    if (selectedRegions.length <= 2) {
      els.regionSummary.textContent = selectedRegions.map(regionLabel).join(" + ");
      return;
    }

    els.regionSummary.textContent = t("regionsCount", { n: selectedRegions.length });
  }

  function commitSelectedRegions(nextIds, { close = true } = {}) {
    let next = uniqueIds(nextIds);
    if (availableRegionIds.length && next.length === availableRegionIds.length) {
      next = [];
    }
    selectedRegions = next;
    draftRegions = [...selectedRegions];
    updateRegionSummary();
    if (close) closeRegionPanel();
    saveSettings();
    refreshView();
  }

  function renderRegionPanel() {
    const presets = [
      { id: "all", label: t("all"), getIds: () => [] },
      ...REGION_GROUPS.map((g) => ({
        id: g.id,
        label: groupPresetLabel(g),
        getIds: () => availableInGroup(g),
      })),
    ];

    els.regionPresets.innerHTML = presets
      .map((p) => {
        const ids = p.getIds();
        const active =
          p.id === "all"
            ? draftRegions.length === 0
            : ids.length > 0 && arraysEqualAsSets(draftRegions, ids);
        return `<button type="button" class="region-preset-btn${active ? " active" : ""}" data-preset="${p.id}">${escapeHtml(p.label)}</button>`;
      })
      .join("");

    const blocks = [];
    for (const group of REGION_GROUPS) {
      const ids = availableInGroup(group);
      if (!ids.length) continue;
      blocks.push(`
        <div class="region-group">
          <div class="region-group-title">${escapeHtml(groupTitle(group))}</div>
          ${ids
            .map(
              (id) => `
            <label class="region-check">
              <input type="checkbox" value="${escapeHtml(id)}" ${draftRegions.includes(id) ? "checked" : ""} />
              <span>${escapeHtml(regionLabel(id))}</span>
            </label>`
            )
            .join("")}
        </div>
      `);
    }

    const others = otherRegionIds();
    if (others.length) {
      blocks.push(`
        <div class="region-group">
          <div class="region-group-title">${escapeHtml(t("other"))}</div>
          ${others
            .map(
              (id) => `
            <label class="region-check">
              <input type="checkbox" value="${escapeHtml(id)}" ${draftRegions.includes(id) ? "checked" : ""} />
              <span>${escapeHtml(regionLabel(id))}</span>
            </label>`
            )
            .join("")}
        </div>
      `);
    }

    els.regionGroups.innerHTML =
      blocks.join("") || `<div class='name-sub'>${escapeHtml(t("noRegionsLoaded"))}</div>`;
  }

  function openRegionPanel() {
    draftRegions = [...selectedRegions];
    renderRegionPanel();
    els.regionPanel.classList.remove("hidden");
    els.regionToggle.setAttribute("aria-expanded", "true");
  }

  function closeRegionPanel() {
    els.regionPanel.classList.add("hidden");
    els.regionToggle.setAttribute("aria-expanded", "false");
  }

  function readDraftFromCheckboxes() {
    const checks = els.regionGroups.querySelectorAll('input[type="checkbox"]');
    draftRegions = [...checks]
      .filter((c) => c.checked)
      .map((c) => c.value);
  }

  function applyDraftRegions() {
    readDraftFromCheckboxes();
    // Empty selection = ALL REGIONS (no region restriction).
    commitSelectedRegions(draftRegions, { close: true });
  }

  async function loadRegions() {
    try {
      const res = await fetch("/api/regions");
      if (!res.ok) throw new Error(`Regions HTTP ${res.status}`);
      const json = await res.json();
      const rows = Array.isArray(json.data) ? json.data : [];
      availableRegionIds = uniqueIds(rows.map((r) => r.region).filter(Boolean)).sort();

      // Drop persisted IDs that no longer exist, keep unknown API regions selectable.
      selectedRegions = selectedRegions.filter((id) => availableRegionIds.includes(id));
      draftRegions = [...selectedRegions];
      updateRegionSummary();
      if (!els.regionPanel.classList.contains("hidden")) renderRegionPanel();
      return true;
    } catch {
      // Fallback from server list if regions endpoint fails.
      availableRegionIds = uniqueIds(allServers.map((s) => s.region)).sort();
      updateRegionSummary();
      return false;
    }
  }

  function populateMapOptions() {
    const byId = new Map();
    for (const s of allServers) {
      const n = normalizeMap(s);
      if (!n.id || n.id === "unknown") continue;
      if (!byId.has(n.id)) byId.set(n.id, n.label);
    }
    const maps = [...byId.entries()].sort((a, b) =>
      a[1].localeCompare(b[1], "de")
    );
    const prevRaw = pendingMap || els.mapFilter.value;
    const prev = migrateMapFilterValue(prevRaw) || prevRaw;
    els.mapFilter.innerHTML = `<option value="">${escapeHtml(t("allMaps"))}</option>`;
    for (const [id, label] of maps) {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = label;
      els.mapFilter.appendChild(opt);
    }
    if ([...byId.keys()].includes(prev)) els.mapFilter.value = prev;
    else els.mapFilter.value = "";
    pendingMap = "";
  }

  function baseFilter(servers) {
    const q = els.search.value.trim().toLowerCase();
    const map = els.mapFilter.value;
    const type = els.serverType.value;
    const passwordMode = els.passwordFilter?.value || "all";
    const ruleset = els.rulesetFilter?.value || "all";
    const hideFull = els.hideFull.checked;
    const hideEmpty = els.hideEmpty.checked;
    const minFree = els.minFree.value ? Number(els.minFree.value) : null;
    const regionSet =
      selectedRegions.length > 0 ? new Set(selectedRegions) : null;

    return servers.filter((s) => {
      if (regionSet && !regionSet.has(s.region)) return false;
      if (type !== "all" && s.type !== type) return false;
      if (passwordMode === "open" && s.passwordProtected) return false;
      if (passwordMode === "locked" && !s.passwordProtected) return false;
      if (ruleset !== "all" && primaryRuleset(s) !== ruleset) return false;
      if (map && mapId(s) !== map) return false;

      const players = Number(s.players) || 0;
      const max = Number(s.maxPlayers) || 0;
      const free = freeSlots(s);

      if (hideEmpty && players === 0) return false;
      if (hideFull && max > 0 && free <= 0) return false;
      if (minFree != null && free < minFree) return false;

      if (q) {
        const hay = [
          s.name,
          s.nativeName,
          s.serverId,
          s.id,
          s.region,
          mapName(s),
          s.mode?.experience,
          s.mode?.gameMode,
          primaryRuleset(s),
          rulesetLabel(primaryRuleset(s)),
          ...(Array.isArray(s.mode?.modifiers) ? s.mode.modifiers : []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function passesLevelFilter(server, mode, userLevel) {
    if (mode === "all") return true;
    const en = enrichments[server.id];
    if (!en || !en.detailLoaded) return false;

    const restricted = hasEffectiveRestriction(en.level);
    const compatible = isLevelCompatible(en.level, userLevel);

    if (mode === "compatible") return compatible;
    if (mode === "restricted-compatible") return restricted && compatible;
    if (mode === "unrestricted") return !restricted;
    if (mode === "incompatible") return restricted && !compatible;
    return true;
  }

  function passesLevelCapFilter(server) {
    const capSetting = resolveLevelCapSetting(
      els.levelCapFilter.value,
      els.customLevelCap.value
    );
    if (capSetting === "any") return true;

    const en = enrichments[server.id];
    // Unknown detail must not be treated as unrestricted / match.
    if (!en || !en.detailLoaded) return false;

    const max = en.level ? en.level.max : null;
    return capFilter(capSetting, max);
  }

  function applyEnrichmentFilters(servers) {
    const userLevel = Number(els.myLevel.value) || DEFAULT_MY_LEVEL;
    const levelMode = els.levelFilter.value || "all";
    const maxAgeMin = els.maxAge.value ? Number(els.maxAge.value) : null;

    return servers.filter((s) => {
      // Existing user-level compatibility filter.
      if (!passesLevelFilter(s, levelMode, userLevel)) return false;

      // New Level-Cap filter (independent, combinable).
      if (!passesLevelCapFilter(s)) return false;

      if (maxAgeMin != null) {
        const en = enrichments[s.id];
        const age = getMapAgeSeconds(en);
        if (age == null) return false;
        if (age > maxAgeMin * 60) return false;
      }

      return true;
    });
  }

  function sortServers(servers) {
    const mode = els.sortMode.value;
    const list = [...servers];

    list.sort((a, b) => {
      if (mode === "players") {
        return (Number(b.players) || 0) - (Number(a.players) || 0);
      }
      if (mode === "free") {
        return freeSlots(b) - freeSlots(a);
      }
      if (mode === "name") {
        return String(a.name || a.nativeName || "").localeCompare(
          String(b.name || b.nativeName || ""),
          "de"
        );
      }
      const ageA = getMapAgeSeconds(enrichments[a.id]);
      const ageB = getMapAgeSeconds(enrichments[b.id]);
      if (ageA == null && ageB == null) {
        return (Number(b.players) || 0) - (Number(a.players) || 0);
      }
      if (ageA == null) return 1;
      if (ageB == null) return -1;
      return ageA - ageB;
    });

    return list;
  }

  function prioritizeForEnrichment(servers, levelMode) {
    const list = [...servers];
    list.sort((a, b) => {
      const freeA = freeSlots(a) > 0 ? 1 : 0;
      const freeB = freeSlots(b) > 0 ? 1 : 0;
      if (freeB !== freeA) return freeB - freeA;

      const preferCommunity =
        levelMode === "restricted-compatible" ||
        levelMode === "incompatible" ||
        levelMode === "compatible";
      if (preferCommunity) {
        const cA = a.type === "community" ? 1 : 0;
        const cB = b.type === "community" ? 1 : 0;
        if (cB !== cA) return cB - cA;
      }

      return (Number(b.players) || 0) - (Number(a.players) || 0);
    });
    return list;
  }

  async function mapPool(items, concurrency, worker) {
    const results = new Array(items.length);
    let idx = 0;

    async function runner() {
      while (idx < items.length) {
        const current = idx;
        idx += 1;
        results[current] = await worker(items[current], current);
      }
    }

    const runners = Array.from(
      { length: Math.min(concurrency, items.length || 1) },
      () => runner()
    );
    await Promise.all(runners);
    return results;
  }

  async function fetchDetail(instanceId) {
    const res = await fetch(`/api/server/${encodeURIComponent(instanceId)}/detail`);
    if (res.status === 404) {
      return { level: null, missing: true };
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Detail HTTP ${res.status}`);
    }
    const json = await res.json();
    return {
      level: json.data?.level ?? null,
      detail: json.data ?? null,
      missing: false,
    };
  }

  async function fetchEvents(joinCode, server) {
    if (!joinCode) {
      return { mapAt: null, missing: true };
    }
    const res = await fetch(`/api/server/${encodeURIComponent(joinCode)}/events`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Events HTTP ${res.status}`);
    }
    const json = await res.json();
    if (json.missing) {
      return { mapAt: null, missing: true };
    }
    const events = json.data?.events || [];
    // Match history raw names (Madrid/Detroit) to current live map via normalization.
    const mapEvent = findCurrentMapEvent(events, server);
    return {
      mapAt: mapEvent?.at || null,
      missing: !mapEvent,
      events,
    };
  }

  async function enrichServer(server, { needDetail = true, needEvents = true } = {}) {
    if (!server || !server.id) return;
    if (enrichInFlight.has(server.id)) return;

    const existing = enrichments[server.id];
    const detailDone = existing?.detailLoaded;
    const eventsDone = existing?.eventsLoaded;
    if ((!needDetail || detailDone) && (!needEvents || eventsDone)) return;

    enrichInFlight.add(server.id);
    try {
      const current = enrichments[server.id] || {
        detailLoaded: false,
        eventsLoaded: false,
        level: null,
        mapAt: null,
        error: null,
      };

      const tasks = [];
      if (needDetail && !current.detailLoaded) {
        tasks.push(
          fetchDetail(server.id).then((d) => {
            current.level = d.level;
            current.detailLoaded = true;
            current.detailMissing = Boolean(d.missing);
          })
        );
      }
      if (needEvents && !current.eventsLoaded) {
        tasks.push(
          fetchEvents(server.serverId, server).then((e) => {
            current.mapAt = e.mapAt;
            current.eventsLoaded = true;
            current.eventsMissing = e.missing;
          })
        );
      }

      if (tasks.length) await Promise.all(tasks);
      current.error = null;
      enrichments[server.id] = current;
    } catch (err) {
      const current = enrichments[server.id] || {
        detailLoaded: false,
        eventsLoaded: false,
        level: null,
        mapAt: null,
      };
      current.error = err.message || "enrich failed";
      enrichments[server.id] = current;
    } finally {
      enrichInFlight.delete(server.id);
    }
  }

  function renderAgeCell(server) {
    const en = enrichments[server.id];
    if (!en || !en.eventsLoaded) {
      return `<span class="age age-unknown">…</span>`;
    }
    const ageSec = getMapAgeSeconds(en);
    if (ageSec == null) {
      return `<span class="age age-unknown">${escapeHtml(t("unknown"))}</span>`;
    }
    const label = classifyAge(ageSec);
    return `<span class="age ${ageClass(label)}"><span class="age-dot"></span><span>${formatDuration(ageSec)}</span><span class="age-label">${escapeHtml(t(label))}</span></span>`;
  }

  function renderLevelCell(server) {
    const en = enrichments[server.id];
    const userLevel = Number(els.myLevel.value) || DEFAULT_MY_LEVEL;
    if (!en || !en.detailLoaded) {
      return `<span class="level-loading">${escapeHtml(t("loading"))}</span>`;
    }
    const text = formatLevelLimit(en.level);
    if (isUnrestrictedLevel(en.level)) {
      return `<span class="level-ok">${escapeHtml(text)}</span>`;
    }
    if (isLevelCompatible(en.level, userLevel)) {
      return `<div><div class="name-sub">${escapeHtml(text)}</div><div class="level-passend">${escapeHtml(t("compatible"))}</div></div>`;
    }
    return `<div><div class="name-sub">${escapeHtml(text)}</div><div class="level-gesperrt">${escapeHtml(t("blocked"))}</div></div>`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderRows(servers) {
    if (!servers.length) {
      els.serverBody.innerHTML = `<tr class="empty-row"><td colspan="11">${escapeHtml(t("noServers"))}</td></tr>`;
      els.visibleCount.textContent = "0";
      return;
    }

    const userLevel = Number(els.myLevel.value) || DEFAULT_MY_LEVEL;
    const html = servers
      .map((s) => {
        const status = serverStatus(s);
        const en = enrichments[s.id];
        const blocked =
          en &&
          en.detailLoaded &&
          hasEffectiveRestriction(en.level) &&
          !isLevelCompatible(en.level, userLevel);
        const join = s.serverId || "";
        const joinDisplay = join || "—";
        const typeCls = s.type === "official" ? "type-official" : "type-community";
        const typeLabel =
          s.type === "official"
            ? t("official")
            : s.type === "community"
              ? t("community")
              : s.type || "—";
        const ruleset = primaryRuleset(s);
        const reserved = Math.max(0, Number(s.reservedPlayers) || 0);
        const free = freeSlots(s);
        const freeTitle =
          reserved > 0
            ? `${free} · ${t("reservedSlotsNote", { count: reserved })}`
            : String(free);
        const rulesetBadge =
          ruleset && ruleset !== "standard"
            ? `<div class="name-sub ruleset-tag">${escapeHtml(rulesetLabel(ruleset))}</div>`
            : "";

        return `<tr class="${blocked ? "blocked" : ""}" data-id="${escapeHtml(s.id)}">
          <td><span class="status-pill ${status.cls}">${escapeHtml(status.text)}</span></td>
          <td class="name-cell">
            <div class="name-main" title="${escapeHtml(s.name || s.nativeName || "")}">${escapeHtml(s.name || s.nativeName || t("unnamed"))}</div>
            ${s.passwordProtected ? `<div class="name-sub">${escapeHtml(t("passwordProtected"))}</div>` : ""}
            ${rulesetBadge}
          </td>
          <td class="map-cell">${escapeHtml(mapName(s))}</td>
          <td title="${escapeHtml(s.region || "")}">${escapeHtml(regionLabel(s.region || "—"))}</td>
          <td class="${typeCls}">${escapeHtml(typeLabel)}</td>
          <td class="mono">${Number(s.players) || 0}/${Number(s.maxPlayers) || 0}</td>
          <td class="mono" title="${escapeHtml(freeTitle)}">${free}</td>
          <td>${renderAgeCell(s)}</td>
          <td>${renderLevelCell(s)}</td>
          <td><div class="join-code" title="${escapeHtml(joinDisplay)}">${escapeHtml(joinDisplay)}</div></td>
          <td>
            <button type="button" class="copy-btn" data-join="${escapeHtml(join)}" ${join ? "" : "disabled"}>
              ${join ? escapeHtml(t("copyJoinCode")) : "N/A"}
            </button>
          </td>
        </tr>`;
      })
      .join("");

    els.serverBody.innerHTML = html;
    els.visibleCount.textContent = String(servers.length);
  }

  function currentCandidateWindow() {
    const base = baseFilter(allServers);
    const levelMode = els.levelFilter.value || "all";
    return prioritizeForEnrichment(base, levelMode).slice(0, ENRICH_CANDIDATE_LIMIT);
  }

  function renderCachedView() {
    let candidates = currentCandidateWindow();
    let visible = applyEnrichmentFilters(candidates);
    visible = sortServers(visible).slice(0, DISPLAY_LIMIT);
    renderRows(visible);
    return visible;
  }

  /** @type {any|null} */
  let lastLiveStats = null;

  function formatCount(n) {
    const locale = currentLang === "de" ? "de-DE" : "en-GB";
    return Number(n || 0).toLocaleString(locale);
  }

  function renderLiveStats(data) {
    if (!els.networkPlayers || !els.networkServers) return;
    if (!data) {
      els.networkPlayers.textContent = "—";
      els.networkServers.textContent = "—";
      els.networkServers.removeAttribute("title");
      return;
    }
    lastLiveStats = data;
    els.networkPlayers.textContent = formatCount(data.playerCount);
    els.networkServers.textContent = formatCount(data.serverCount);
    els.networkServers.title = t("networkServersBreakdown", {
      official: formatCount(data.officialServerCount),
      community: formatCount(data.communityServerCount),
    });
  }

  async function loadLiveStats() {
    try {
      const res = await fetch("/api/live-stats");
      if (!res.ok) return;
      const json = await res.json();
      if (json.data) renderLiveStats(json.data);
    } catch {
      // Non-fatal: list still works without totals.
    }
  }

  /** @type {any[]} */
  let rankingRows = [];

  function renderRankingChart(rows) {
    if (!els.rankingChart) return;
    rankingRows = Array.isArray(rows) ? rows : [];
    if (!rankingRows.length) {
      els.rankingChart.innerHTML = `<div class="ranking-empty">${escapeHtml(t("rankingEmpty"))}</div>`;
      return;
    }

    const maxScore = Math.max(
      ...rankingRows.map((r) => Number(r.score) || 0),
      1
    );

    els.rankingChart.innerHTML = rankingRows
      .map((row) => {
        const score = Number(row.score) || 0;
        const players = Number(row.players) || 0;
        const peak = Number(row.peak) || 0;
        const uptimePct = Math.round((Number(row.uptime) || 0) * 100);
        const width = Math.max(4, Math.round((score / maxScore) * 100));
        const name = row.name || row.serverId || t("unnamed");
        const join = row.serverId || "";
        const region = regionLabel(row.region || "—");
        const typeLabel =
          row.type === "official"
            ? t("official")
            : row.type === "community"
              ? t("community")
              : row.type || "—";
        return `<div class="ranking-row" data-join="${escapeHtml(join)}">
          <div class="ranking-rank">#${escapeHtml(String(row.rank || ""))}</div>
          <div class="ranking-main">
            <div class="ranking-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
            <div class="ranking-meta">${escapeHtml(region)} · ${escapeHtml(typeLabel)} · ${escapeHtml(
              t("rankingPlayersAvg", { players: players.toFixed(1) })
            )} · ${escapeHtml(t("rankingPeak", { peak }))} · ${escapeHtml(
              t("rankingUptime", { pct: uptimePct })
            )}</div>
            <div class="ranking-bar-track" aria-hidden="true">
              <div class="ranking-bar-fill" style="width:${width}%"></div>
            </div>
          </div>
          <div class="ranking-actions">
            <div class="ranking-score">${escapeHtml(
              t("rankingScore", { score: score.toFixed(1) })
            )}</div>
            <button type="button" class="btn-secondary ranking-copy copy-btn" data-join="${escapeHtml(
              join
            )}" ${join ? "" : "disabled"}>
              ${join ? escapeHtml(t("copyJoinCode")) : "N/A"}
            </button>
          </div>
        </div>`;
      })
      .join("");
  }

  async function loadRanking() {
    if (!els.rankingChart) return;
    els.rankingChart.innerHTML = `<div class="ranking-empty">${escapeHtml(t("rankingLoading"))}</div>`;
    if (els.rankingRefreshBtn) els.rankingRefreshBtn.disabled = true;
    try {
      const window = els.rankingWindow?.value || "7d";
      const type = els.rankingType?.value || "community";
      const res = await fetch(
        `/api/ranking?window=${encodeURIComponent(window)}&type=${encodeURIComponent(type)}&limit=15`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      renderRankingChart(Array.isArray(json.data) ? json.data : []);
    } catch {
      els.rankingChart.innerHTML = `<div class="ranking-empty">${escapeHtml(t("rankingError"))}</div>`;
    } finally {
      if (els.rankingRefreshBtn) els.rankingRefreshBtn.disabled = false;
    }
  }

  function updateStaleBanner(meta, warning) {
    const rateLimited =
      warning === "rate_limited_using_cache" || Boolean(meta?.stale && warning);
    if (meta?.stale || warning) {
      els.staleBanner.classList.remove("hidden");
      els.staleBanner.textContent = rateLimited || warning === "rate_limited_using_cache"
        ? t("apiRateLimitedCached")
        : t("apiDataStale");
    } else {
      els.staleBanner.classList.add("hidden");
    }
  }

  async function refreshView({ allowEnrichment = true } = {}) {
    const token = ++renderToken;
    saveSettings();

    const levelMode = els.levelFilter.value || "all";
    const needsAge = Boolean(els.maxAge.value) || els.sortMode.value === "freshest";
    const needsLevel =
      levelMode !== "all" ||
      resolveLevelCapSetting(els.levelCapFilter.value, els.customLevelCap.value) !==
        "any";

    let candidates = currentCandidateWindow();
    let visible = applyEnrichmentFilters(candidates);
    visible = sortServers(visible).slice(0, DISPLAY_LIMIT);
    renderRows(visible);

    if (!allowEnrichment) return;

    // Phase 1: only fetch what filters actually require for the candidate window.
    const filterEnrich = candidates.filter((s) => {
      const en = enrichments[s.id];
      if (!en) return needsLevel || needsAge;
      if (needsLevel && !en.detailLoaded) return true;
      if (needsAge && !en.eventsLoaded) return true;
      return false;
    });

    if (filterEnrich.length) {
      await mapPool(filterEnrich, ENRICH_CONCURRENCY, async (server) => {
        if (token !== renderToken) return;
        await enrichServer(server, {
          needDetail: needsLevel,
          needEvents: needsAge,
        });
      });
    }

    if (token !== renderToken) return;

    visible = applyEnrichmentFilters(candidates);
    visible = sortServers(visible).slice(0, DISPLAY_LIMIT);
    renderRows(visible);

    // Phase 2: complete display fields only for currently visible rows.
    const displayMissing = visible.filter((s) => {
      const en = enrichments[s.id];
      return !en || !en.detailLoaded || !en.eventsLoaded;
    });
    if (displayMissing.length) {
      await mapPool(displayMissing, ENRICH_CONCURRENCY, async (server) => {
        if (token !== renderToken) return;
        await enrichServer(server, { needDetail: true, needEvents: true });
      });
    }

    if (token !== renderToken) return;
    visible = applyEnrichmentFilters(candidates);
    visible = sortServers(visible).slice(0, DISPLAY_LIMIT);
    renderRows(visible);
  }

  function pruneEnrichments(nextServers) {
    const keep = new Set(nextServers.map((s) => s.id));
    const next = {};
    for (const id of Object.keys(enrichments)) {
      if (keep.has(id)) next[id] = enrichments[id];
    }
    enrichments = next;
  }

  async function loadServers() {
    els.refreshBtn.disabled = true;
    setApiStatus("load", "apiLoading");

    try {
      const regionsPromise = loadRegions();
      const liveStatsPromise = loadLiveStats();
      // Backend shared cache + refreshSeconds gate upstream; manual refresh cannot bypass.
      const listUrl = "/api/servers";

      const res = await fetch(listUrl);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        // Keep existing list if we still have data and backend rate-limited us.
        if (allServers.length && (res.status === 429 || err.error?.code === "rate_limited")) {
          updateStaleBanner({ stale: true }, "rate_limited_using_cache");
          setApiStatus("err", "apiDegraded");
          await refreshView({ allowEnrichment: false });
          scheduleRefresh();
          return;
        }
        throw new Error(err.error?.message || `HTTP ${res.status}`);
      }
      const json = await res.json();
      const nextServers = Array.isArray(json.data) ? json.data : [];
      // Preserve client enrichment across cache hits / manual refresh — do not wipe.
      pruneEnrichments(nextServers);
      allServers = nextServers;

      const meta = json.meta || {};
      refreshSeconds = Number(meta.refreshSeconds) || DEFAULT_REFRESH_SECONDS;

      updateStaleBanner(meta, json.warning);

      const fetchedAt = meta.fetchedAt ? new Date(meta.fetchedAt) : new Date();
      els.lastRefresh.textContent = fetchedAt.toLocaleTimeString(
        currentLang === "de" ? "de-DE" : "en-GB"
      );

      await Promise.all([regionsPromise, liveStatsPromise]);
      if (!availableRegionIds.length) {
        availableRegionIds = uniqueIds(allServers.map((s) => s.region)).sort();
        updateRegionSummary();
      }

      if (json.warning || meta.stale) setApiStatus("err", "apiDegraded");
      else setApiStatus("ok", "apiOnline");

      populateMapOptions();
      // Cache-only snapshot responses: re-render; enrich only missing fields.
      await refreshView({ allowEnrichment: true });
      scheduleRefresh();
    } catch (err) {
      setApiStatus("err", "apiError");
      if (allServers.length) {
        updateStaleBanner({ stale: true }, "upstream_unavailable_using_cache");
        await refreshView({ allowEnrichment: false });
      } else {
        els.staleBanner.classList.add("hidden");
        els.serverBody.innerHTML = `<tr class="empty-row"><td colspan="11">${escapeHtml(t("apiUnavailable"))}: ${escapeHtml(err.message)}</td></tr>`;
        els.visibleCount.textContent = "0";
      }
      scheduleRefresh();
    } finally {
      els.refreshBtn.disabled = false;
    }
  }

  function scheduleRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    const delay = Math.max(refreshSeconds, 30) * 1000;
    refreshTimer = setTimeout(() => {
      loadServers();
    }, delay);
  }

  function formatUpdateDate(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString(currentLang === "de" ? "de-DE" : "en-GB");
  }

  function renderUpdateBanner() {
    if (!els.updateBanner) return;
    const info = updateInfo || {};
    if (els.appVersionLocal) {
      els.appVersionLocal.textContent = info.localVersion || "—";
    }

    let status = t("versionChecking");
    if (info.message === "update_not_configured" || info.configured === false) {
      status = t("versionNotConfigured", { version: info.localVersion || "—" });
    } else if (info.message === "update_check_failed") {
      status = t("versionCheckFailed");
    } else if (info.updateAvailable) {
      status = t("versionUpdateAvailable", {
        remote: info.remoteVersion || "?",
        local: info.localVersion || "?",
      });
    } else if (info.localVersion) {
      status = t("versionUpToDate", { version: info.localVersion });
    }
    if (els.updateStatusText) els.updateStatusText.textContent = status;

    const updated = formatUpdateDate(info.lastUpdatedAt);
    if (els.updateMetaText) {
      els.updateMetaText.textContent = updated
        ? t("versionLastUpdated", { date: updated })
        : t("versionNeverUpdated");
    }

    const showApply =
      Boolean(info.updateAvailable) && updateDismissedRemote !== info.remoteVersion;
    if (els.updateApplyBtn) {
      els.updateApplyBtn.classList.toggle("hidden", !showApply);
      els.updateApplyBtn.disabled = Boolean(info.applying);
    }
    if (els.updateLaterBtn) {
      els.updateLaterBtn.classList.toggle("hidden", !showApply);
    }
    if (els.updateReleaseLink) {
      const hasUrl = Boolean(info.releaseUrl);
      els.updateReleaseLink.classList.toggle("hidden", !hasUrl);
      if (hasUrl) els.updateReleaseLink.href = info.releaseUrl;
    }
    if (els.updateCheckBtn) {
      els.updateCheckBtn.disabled = Boolean(info.applying || info.checking);
    }
    if (els.updateBanner) {
      els.updateBanner.classList.toggle("update-available", Boolean(showApply));
      els.updateBanner.classList.toggle("update-busy", Boolean(info.applying || info.checking));
    }
  }

  async function loadVersionInfo() {
    try {
      const res = await fetch("/api/app/version");
      if (!res.ok) throw new Error("version http");
      const json = await res.json();
      updateInfo = { ...(updateInfo || {}), ...json, checking: false };
      renderUpdateBanner();
    } catch {
      updateInfo = {
        ...(updateInfo || {}),
        message: "update_check_failed",
        checking: false,
      };
      renderUpdateBanner();
    }
  }

  async function checkForAppUpdate({ silent = false } = {}) {
    updateInfo = { ...(updateInfo || {}), checking: true };
    if (!silent) renderUpdateBanner();
    try {
      const res = await fetch("/api/app/update-check");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error?.message || "check failed");
      updateInfo = { ...json, checking: false, applying: false };
      renderUpdateBanner();
      return updateInfo;
    } catch {
      updateInfo = {
        ...(updateInfo || {}),
        checking: false,
        message: "update_check_failed",
      };
      renderUpdateBanner();
      return updateInfo;
    }
  }

  async function applyAppUpdate() {
    if (!updateInfo?.updateAvailable) return;
    updateInfo = { ...updateInfo, applying: true };
    if (els.updateStatusText) els.updateStatusText.textContent = t("versionUpdating");
    renderUpdateBanner();
    try {
      const res = await fetch("/api/app/update-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ downloadUrl: updateInfo.downloadUrl || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error?.message || "apply failed");
      updateInfo = { ...updateInfo, ...json, applying: false };
      if (els.updateStatusText) {
        els.updateStatusText.textContent = t("versionUpdateDone");
      }
      renderUpdateBanner();
      // Server restarts after apply; force a full reload so cached HTML/CSS/JS are replaced.
      if (json.applied || json.restartRequired) {
        window.setTimeout(() => {
          window.location.reload();
        }, 2200);
      }
    } catch {
      updateInfo = { ...updateInfo, applying: false, message: "update_apply_failed" };
      if (els.updateStatusText) {
        els.updateStatusText.textContent = t("versionUpdateFailed");
      }
      renderUpdateBanner();
    }
  }

  function onCopyClick(event) {
    const btn = event.target.closest(".copy-btn");
    if (!btn || btn.disabled) return;
    const join = btn.getAttribute("data-join");
    if (!join) return;

    navigator.clipboard.writeText(join).then(
      () => {
        btn.textContent = t("copied");
        btn.classList.add("copied");
        setTimeout(() => {
          btn.textContent = t("copyJoinCode");
          btn.classList.remove("copied");
        }, 1200);
      },
      () => {
        btn.textContent = t("copyFailed");
        setTimeout(() => {
          btn.textContent = t("copyJoinCode");
        }, 1200);
      }
    );
  }

  function bindRegionUi() {
    els.regionToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      if (els.regionPanel.classList.contains("hidden")) openRegionPanel();
      else closeRegionPanel();
    });

    els.regionPresets.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-preset]");
      if (!btn) return;
      e.stopPropagation();
      const preset = btn.getAttribute("data-preset");
      // Schnellauswahl applies immediately so region filter cannot silently stay on "Alle".
      if (preset === "all") {
        commitSelectedRegions([], { close: true });
        return;
      }
      const ids = expandRegionGroup(preset, availableRegionIds);
      commitSelectedRegions(ids, { close: true });
    });

    els.regionGroups.addEventListener("change", () => {
      readDraftFromCheckboxes();
      renderRegionPanel();
    });

    els.regionSelectAll.addEventListener("click", () => {
      draftRegions = [...availableRegionIds];
      renderRegionPanel();
    });

    els.regionClear.addEventListener("click", () => {
      draftRegions = [];
      renderRegionPanel();
    });

    els.regionApply.addEventListener("click", () => applyDraftRegions());

    document.addEventListener("click", (e) => {
      if (!els.regionPanel.classList.contains("hidden")) {
        const picker = document.getElementById("regionPicker");
        if (picker && !picker.contains(e.target)) closeRegionPanel();
      }
    });
  }

  function bindControls() {
    const onChange = () => {
      saveSettings();
      refreshView();
    };

    [
      els.search,
      els.mapFilter,
      els.serverType,
      els.passwordFilter,
      els.rulesetFilter,
      els.myLevel,
      els.levelFilter,
      els.levelCapFilter,
      els.customLevelCap,
      els.maxAge,
      els.minFree,
      els.sortMode,
      els.hideFull,
      els.hideEmpty,
    ]
      .filter(Boolean)
      .forEach((el) => {
      el.addEventListener("change", onChange);
      if (el.tagName === "INPUT" && el.type !== "checkbox") {
        el.addEventListener("input", () => {
          saveSettings();
          refreshView();
        });
      }
    });

    els.customLevelCap.addEventListener("change", () => {
      const n = Math.floor(Number(els.customLevelCap.value));
      if (!Number.isFinite(n) || n < 1) els.customLevelCap.value = "1";
      else if (n > 10000) els.customLevelCap.value = "10000";
      else els.customLevelCap.value = String(n);
      saveSettings();
      refreshView();
    });

    els.levelCapFilter.addEventListener("change", () => {
      syncCustomCapVisibility();
    });

    if (els.rulesetFilter) {
      els.rulesetFilter.addEventListener("change", () => {
        syncInfantryOnlyToggle();
      });
    }
    if (els.infantryOnlyToggle && els.rulesetFilter) {
      els.infantryOnlyToggle.addEventListener("change", () => {
        els.rulesetFilter.value = els.infantryOnlyToggle.checked
          ? "infantry-only"
          : "all";
        saveSettings();
        refreshView();
      });
    }

    els.refreshBtn.addEventListener("click", () => loadServers());
    els.serverBody.addEventListener("click", onCopyClick);
    if (els.rankingChart) {
      els.rankingChart.addEventListener("click", onCopyClick);
    }
    if (els.rankingWindow) {
      els.rankingWindow.addEventListener("change", () => loadRanking());
    }
    if (els.rankingType) {
      els.rankingType.addEventListener("change", () => loadRanking());
    }
    if (els.rankingRefreshBtn) {
      els.rankingRefreshBtn.addEventListener("click", () => loadRanking());
    }
    if (els.rankingToggleBtn) {
      els.rankingToggleBtn.addEventListener("click", () => {
        const collapsed = !els.rankingPanel?.classList.contains("is-collapsed");
        setRankingCollapsed(collapsed);
      });
    }
    if (els.langDe) {
      els.langDe.addEventListener("click", () => setLanguage("de"));
    }
    if (els.langEn) {
      els.langEn.addEventListener("click", () => setLanguage("en"));
    }
    if (els.ageInfoBtn) {
      els.ageInfoBtn.addEventListener("click", () => {
        window.alert(t("ageTooltip"));
      });
    }
    if (els.rememberSettings) {
      els.rememberSettings.addEventListener("change", () => {
        if (els.rememberSettings.checked) enableStoragePersistence();
        else disableStoragePersistence();
      });
    }
    if (els.updateCheckBtn) {
      els.updateCheckBtn.addEventListener("click", () => checkForAppUpdate());
    }
    if (els.updateApplyBtn) {
      els.updateApplyBtn.addEventListener("click", () => applyAppUpdate());
    }
    if (els.updateLaterBtn) {
      els.updateLaterBtn.addEventListener("click", () => {
        updateDismissedRemote = updateInfo?.remoteVersion || null;
        renderUpdateBanner();
      });
    }
    bindRegionUi();
  }

  function startAgeClock() {
    // Single age ticker: updates displayed age from cached mapAt only — no history refetch.
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = setInterval(() => {
      const rows = els.serverBody.querySelectorAll("tr[data-id]");
      if (!rows.length) return;
      renderCachedView();
    }, 15000);
  }

  // Expose helpers for verification via window.
  window.__wardogsViewer = {
    getSelectedRegions: () => [...selectedRegions],
    getUpstreamRegionParam: () => buildUpstreamRegionParam(selectedRegions),
    setSelectedRegions: (ids) => commitSelectedRegions(ids, { close: false }),
    applyRegionGroup: (groupId) =>
      commitSelectedRegions(expandRegionGroup(groupId, availableRegionIds), {
        close: false,
      }),
    getFilteredServers: () =>
      applyEnrichmentFilters(baseFilter(allServers)).map((s) => ({
        id: s.id,
        region: s.region,
        mapId: mapId(s),
        mapLabel: mapName(s),
        rawVariant: s.map?.variant ?? null,
        players: s.players,
        maxPlayers: s.maxPlayers,
      })),
    normalizeMap,
    capFilter,
    resolveLevelCapSetting,
    getLevelHelpers: () => ({
      hasEffectiveRestriction,
      isLevelCompatible,
      formatLevelLimit,
      isUnrestrictedLevel,
      passesLevelCapFilter,
    }),
    migrateSettings,
    hasStorageConsent: () => storageConsent,
    enableStoragePersistence,
    disableStoragePersistence,
    collectSettings,
    saveSettings,
    loadSettings,
    refreshView,
    renderCachedView,
    getEnrichmentCount: () => Object.keys(enrichments).length,
    getRefreshTimerActive: () => Boolean(refreshTimer),
    getClockTimerActive: () => Boolean(clockTimer),
    getEnrichLimits: () => ({
      concurrency: ENRICH_CONCURRENCY,
      candidateLimit: ENRICH_CANDIDATE_LIMIT,
      displayLimit: DISPLAY_LIMIT,
    }),
  };

  applySettings(loadSettings());
  bindControls();
  syncRememberCheckbox();
  setLanguage(currentLang, { persist: false, refresh: false });
  startAgeClock();
  loadVersionInfo().then(() => checkForAppUpdate({ silent: true }));
  loadServers();
  loadRanking();

  window.__wardogsViewer.getLanguage = () => currentLang;
  window.__wardogsViewer.setLanguage = (lang) => setLanguage(lang);
  window.__wardogsViewer.checkForAppUpdate = checkForAppUpdate;
  window.__wardogsViewer.getUpdateInfo = () => updateInfo;
})();
