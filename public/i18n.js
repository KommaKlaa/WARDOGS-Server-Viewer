/**
 * Lightweight DE/EN localization for WARDOGS Server Viewer.
 * No framework. Browser: window.WardogsI18n | Node: module.exports
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.WardogsI18n = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const LANGUAGE_KEY = "wardogs-language";
  const CONSENT_KEY = "wardogs-storage-consent";
  const CONSENT_VALUE = "granted-v1";
  const DEFAULT_LANG = "en";
  const SUPPORTED = ["de", "en"];

  function hasStorageConsent(storage) {
    try {
      const store = storage || (typeof localStorage !== "undefined" ? localStorage : null);
      if (!store) return false;
      return store.getItem(CONSENT_KEY) === CONSENT_VALUE;
    } catch {
      return false;
    }
  }

  const translations = {
    de: {
      appTitle: "WARDOGS Server Viewer",
      brandSubtitle: "SERVER-ÜBERSICHT",
      brandTagline: "LIVE SERVER FINDEN",
      liveNetwork: "LIVE-NETZWERK",
      apiOnline: "API ONLINE",
      apiLoading: "LÄDT…",
      apiError: "FEHLER",
      apiDegraded: "EINGESCHRÄNKT",
      visibleServers: "Sichtbare Server",
      networkPlayers: "Spieler online",
      networkServers: "Server online",
      networkServersBreakdown: "{official} offiziell · {community} Community",
      lastUpdate: "Zuletzt aktualisiert",
      apiDataStale: "DATEN VERALTET",
      apiRateLimitedCached:
        "API-Limit erreicht – zwischengespeicherte Daten werden angezeigt.",
      search: "Suche",
      searchPlaceholder: "Name, Karte oder Beitrittscode…",
      regions: "Regionen",
      map: "Karte",
      serverType: "Servertyp",
      passwordFilter: "Passwort",
      passwordFilterAll: "Alle Server",
      passwordFilterOpen: "Nur offene",
      passwordFilterLocked: "Nur mit Passwort",
      ruleset: "Regelwerk",
      rulesetAll: "Alle Regelwerke",
      rulesetStandard: "Standard",
      rulesetInfantryOnly: "Nur Infanterie",
      rulesetHardcore: "Hardcore",
      reservedSlotsNote: "{count} reserviert",
      rankingTitle: "Beliebteste Server",
      rankingSubtitle:
        "Durchschnitt Spieler × Uptime — gut für dauerhaft volle Server.",
      rankingWindow: "Zeitraum",
      rankingWindow24h: "Letzte 24 Stunden",
      rankingWindow7d: "Letzte 7 Tage",
      rankingWindow30d: "Letzte 30 Tage",
      rankingType: "Typ",
      rankingRefresh: "Ranking aktualisieren",
      rankingLoading: "Ranking wird geladen…",
      rankingEmpty: "Kein Ranking verfügbar.",
      rankingError: "Ranking konnte nicht geladen werden.",
      rankingScore: "Score {score}",
      rankingPlayersAvg: "Ø {players} Spieler",
      rankingPeak: "Peak {peak}",
      rankingUptime: "Uptime {pct}%",
      myLevel: "Mein Level",
      levelFilter: "Level-Filter",
      levelCap: "Level-Cap",
      maxRoundMapAge: "Max. Runden-/Kartenalter",
      minFreeSlots: "Mindestens freie Plätze",
      sort: "Sortierung",
      hideFull: "Volle Server ausblenden",
      hideEmpty: "Leere Server ausblenden",
      refreshNow: "Liste aktualisieren",
      all: "Alle",
      any: "Beliebig",
      allMaps: "Alle Karten",
      allServers: "Alle Server",
      allRegions: "Alle Regionen",
      official: "Offiziell",
      community: "Community",
      levelFilterAll: "Alle Server",
      levelFilterCompatible: "Passend zu meinem Level",
      levelFilterRestrictedCompatible: "Nur passende Server mit Levelgrenze",
      levelFilterUnrestricted: "Nur Server ohne Levelgrenze",
      levelFilterIncompatible: "Nicht passend zu meinem Level",
      levelCapAny: "Beliebig",
      levelCap50: "Bis Level 50",
      levelCap100: "Bis Level 100",
      levelCap150: "Bis Level 150",
      levelCap200: "Bis Level 200",
      levelCap300: "Bis Level 300",
      levelCap500: "Bis Level 500",
      levelCap1000: "Bis Level 1000",
      levelCapCustom: "Eigener Wert",
      customMaxLevel: "Max. Level",
      age10: "10 Min.",
      age20: "20 Min.",
      age30: "30 Min.",
      age45: "45 Min.",
      age60: "60 Min.",
      sortFreshest: "Frischste Runden zuerst",
      sortPlayers: "Meiste Spieler",
      sortFree: "Meiste freie Plätze",
      sortName: "Servername A–Z",
      colStatus: "Status",
      colServer: "Server",
      colMap: "Karte",
      colRegion: "Region",
      colType: "Typ",
      colPlayers: "Spieler",
      colFreeSlots: "Freie Plätze",
      colRoundMapAge: "Runden-/Kartenalter",
      colLevelRestriction: "Levelgrenze",
      colJoinCode: "Beitrittscode",
      colAction: "Aktion",
      ageTooltip:
        "Zeit seit dem zuletzt erkannten Kartenwechsel. Das ist nicht die verbleibende Matchzeit.",
      copyJoinCode: "Beitrittscode kopieren",
      copied: "Kopiert!",
      copyFailed: "Kopieren fehlgeschlagen",
      fresh: "Frisch",
      running: "Läuft",
      late: "Spät",
      veryLate: "Sehr spät",
      open: "Offen",
      full: "Voll",
      empty: "Leer",
      lock: "Passwort",
      noRestriction: "Keine Einschränkung",
      maxLevel: "Max. Level",
      minLevel: "Ab Level",
      levelRange: "Level {min}–{max}",
      compatible: "Passend",
      blocked: "Gesperrt",
      loading: "Lädt…",
      unknown: "Unbekannt",
      unnamed: "Unbenannt",
      passwordProtected: "Passwortgeschützt",
      noServers: "Keine Server passen zu den aktuellen Filtern.",
      loadingServers: "Server werden geladen…",
      apiUnavailable: "API nicht erreichbar",
      quickSelect: "Schnellauswahl",
      selectAll: "Alle auswählen",
      clearSelection: "Auswahl leeren",
      apply: "Übernehmen",
      europe: "Europa",
      america: "Amerika",
      northAmerica: "Nordamerika",
      southAmerica: "Südamerika",
      asia: "Asien",
      oceania: "Ozeanien",
      other: "Sonstige",
      noRegionsLoaded: "Keine Regionen geladen.",
      regionsCount: "{n} Regionen",
      americaTotal: "Amerika gesamt",
      regionEuWest: "EU West",
      regionEuCentral: "EU Central",
      regionEuEast: "EU East",
      regionEuSouth: "EU South",
      regionNaEast: "NA East",
      regionNaCentral: "NA Central",
      regionNaWest: "NA West",
      regionNaNorth: "NA North",
      regionSouthAmerica: "Südamerika",
      regionAsiaEast: "Asia East",
      regionAsiaSoutheast: "Asia Southeast",
      regionAsiaWest: "Asia West",
      regionOceania: "Ozeanien",
      langDe: "DE",
      langEn: "EN",
      language: "Sprache",
      footerDisclaimer:
        "Inoffizielles Community-Projekt. Nicht mit BULKHEAD oder Team17 verbunden und nicht von diesen unterstützt. Serverdaten von Wardog Servers.",
      footerAgeNote:
        "Runden-/Kartenalter ist nicht die verbleibende Matchzeit.",
      dataVia: "Daten über",
      legalNotice: "Impressum",
      privacy: "Datenschutz",
      support: "Support",
      footerLocalSupport:
        "Lokales Community-Tool · Hilfe über GitHub Issues",
      githubStar: "★ Auf GitHub bewerten",
      githubStarAria: "Projekt auf GitHub öffnen und bewerten",
      donate: "Spenden (PayPal)",
      donateAria: "Über PayPal.me spenden",
      backToViewer: "Zurück zum Server Viewer",
      trademarkNotice:
        "Name, Logo und Artwork von WARDOGS gehören den jeweiligen Rechteinhabern. Offizielles Press-Kit-Material wird nur zur Darstellung dieses inoffiziellen Community-Viewers verwendet.",
      legalPageTitle: "Impressum / Legal Notice",
      privacyPageTitle: "Datenschutz / Privacy",
      rememberSettings: "Einstellungen auf diesem Gerät speichern",
      rememberSettingsHint:
        "Speichert Sprache und Filter lokal in diesem Browser. Es werden keine Tracking-Cookies verwendet.",
      versionLabel: "Version",
      versionChecking: "Prüfe auf Updates…",
      versionUpToDate: "Du nutzt die aktuelle Version {version}.",
      versionUpdateAvailable:
        "Update verfügbar: {remote} (installiert: {local})",
      versionNotConfigured:
        "Version {version} · Update-Prüfung nach GitHub-Veröffentlichung aktiv.",
      versionCheckFailed: "Update-Prüfung fehlgeschlagen.",
      versionLastUpdated: "Zuletzt aktualisiert: {date}",
      versionNeverUpdated: "Noch kein App-Update installiert.",
      versionCheckButton: "Nach Updates suchen",
      versionUpdateNow: "Jetzt aktualisieren",
      versionLater: "Später",
      versionUpdating: "Update wird installiert…",
      versionUpdateDone: "Update installiert. Die App startet neu…",
      versionUpdateFailed: "Update fehlgeschlagen.",
      versionOpenRelease: "Release öffnen",
    },
    en: {
      appTitle: "WARDOGS Server Viewer",
      brandSubtitle: "SERVER INTEL",
      brandTagline: "FIND LIVE SERVERS",
      liveNetwork: "LIVE NETWORK",
      apiOnline: "API ONLINE",
      apiLoading: "LOADING…",
      apiError: "ERROR",
      apiDegraded: "LIMITED",
      visibleServers: "Visible servers",
      networkPlayers: "Players online",
      networkServers: "Servers online",
      networkServersBreakdown: "{official} official · {community} community",
      lastUpdate: "Last refreshed",
      apiDataStale: "DATA STALE",
      apiRateLimitedCached:
        "API rate limit reached – showing cached data.",
      search: "Search",
      searchPlaceholder: "Name, map, or join code…",
      regions: "Regions",
      map: "Map",
      serverType: "Server type",
      passwordFilter: "Password",
      passwordFilterAll: "All servers",
      passwordFilterOpen: "Open only",
      passwordFilterLocked: "Password only",
      ruleset: "Ruleset",
      rulesetAll: "All rulesets",
      rulesetStandard: "Standard",
      rulesetInfantryOnly: "Infantry only",
      rulesetHardcore: "Hardcore",
      reservedSlotsNote: "{count} reserved",
      rankingTitle: "Popular servers",
      rankingSubtitle:
        "Average players × uptime — useful for finding consistently busy servers.",
      rankingWindow: "Window",
      rankingWindow24h: "Last 24 hours",
      rankingWindow7d: "Last 7 days",
      rankingWindow30d: "Last 30 days",
      rankingType: "Type",
      rankingRefresh: "Refresh ranking",
      rankingLoading: "Loading ranking…",
      rankingEmpty: "No ranking available.",
      rankingError: "Could not load ranking.",
      rankingScore: "Score {score}",
      rankingPlayersAvg: "Avg {players} players",
      rankingPeak: "Peak {peak}",
      rankingUptime: "Uptime {pct}%",
      myLevel: "My level",
      levelFilter: "Level filter",
      levelCap: "Level cap",
      maxRoundMapAge: "Max. round / map age",
      minFreeSlots: "Minimum free slots",
      sort: "Sort by",
      hideFull: "Hide full servers",
      hideEmpty: "Hide empty servers",
      refreshNow: "Refresh list",
      all: "All",
      any: "Any",
      allMaps: "All maps",
      allServers: "All servers",
      allRegions: "All regions",
      official: "Official",
      community: "Community",
      levelFilterAll: "All servers",
      levelFilterCompatible: "Compatible with my level",
      levelFilterRestrictedCompatible: "Only matching level-capped servers",
      levelFilterUnrestricted: "Only servers without a level cap",
      levelFilterIncompatible: "Not compatible with my level",
      levelCapAny: "Any",
      levelCap50: "Up to level 50",
      levelCap100: "Up to level 100",
      levelCap150: "Up to level 150",
      levelCap200: "Up to level 200",
      levelCap300: "Up to level 300",
      levelCap500: "Up to level 500",
      levelCap1000: "Up to level 1000",
      levelCapCustom: "Custom",
      customMaxLevel: "Max level",
      age10: "10 min",
      age20: "20 min",
      age30: "30 min",
      age45: "45 min",
      age60: "60 min",
      sortFreshest: "Freshest rounds first",
      sortPlayers: "Most players",
      sortFree: "Most free slots",
      sortName: "Server name A–Z",
      colStatus: "Status",
      colServer: "Server",
      colMap: "Map",
      colRegion: "Region",
      colType: "Type",
      colPlayers: "Players",
      colFreeSlots: "Free slots",
      colRoundMapAge: "Round / map age",
      colLevelRestriction: "Level cap",
      colJoinCode: "Join code",
      colAction: "Action",
      ageTooltip:
        "Time since the latest detected map change. This is not remaining match time.",
      copyJoinCode: "Copy join code",
      copied: "Copied!",
      copyFailed: "Copy failed",
      fresh: "Fresh",
      running: "Running",
      late: "Late",
      veryLate: "Very late",
      open: "Open",
      full: "Full",
      empty: "Empty",
      lock: "Password",
      noRestriction: "No restriction",
      maxLevel: "Max level",
      minLevel: "Min level",
      levelRange: "Level {min}–{max}",
      compatible: "Compatible",
      blocked: "Blocked",
      loading: "Loading…",
      unknown: "Unknown",
      unnamed: "Unnamed",
      passwordProtected: "Password protected",
      noServers: "No servers match the current filters.",
      loadingServers: "Loading servers…",
      apiUnavailable: "API unavailable",
      quickSelect: "Quick select",
      selectAll: "Select all",
      clearSelection: "Clear selection",
      apply: "Apply",
      europe: "Europe",
      america: "America",
      northAmerica: "North America",
      southAmerica: "South America",
      asia: "Asia",
      oceania: "Oceania",
      other: "Other",
      noRegionsLoaded: "No regions loaded.",
      regionsCount: "{n} regions",
      americaTotal: "Americas",
      regionEuWest: "EU West",
      regionEuCentral: "EU Central",
      regionEuEast: "EU East",
      regionEuSouth: "EU South",
      regionNaEast: "NA East",
      regionNaCentral: "NA Central",
      regionNaWest: "NA West",
      regionNaNorth: "NA North",
      regionSouthAmerica: "South America",
      regionAsiaEast: "Asia East",
      regionAsiaSoutheast: "Asia Southeast",
      regionAsiaWest: "Asia West",
      regionOceania: "Oceania",
      langDe: "DE",
      langEn: "EN",
      language: "Language",
      footerDisclaimer:
        "Unofficial community project. Not affiliated with or endorsed by BULKHEAD or Team17. Server data provided by Wardog Servers.",
      footerAgeNote: "Round/map age is not remaining match time.",
      dataVia: "Data via",
      legalNotice: "Legal Notice",
      privacy: "Privacy",
      support: "Support",
      footerLocalSupport:
        "Local community tool · Support via GitHub Issues",
      githubStar: "★ Star on GitHub",
      githubStarAria: "Open the project on GitHub to leave a star",
      donate: "Donate (PayPal)",
      donateAria: "Donate via PayPal.me",
      backToViewer: "Back to Server Viewer",
      trademarkNotice:
        "The WARDOGS name, logo and artwork belong to their respective rights holders. Official press-kit artwork is used only to present this unofficial community viewer.",
      legalPageTitle: "Legal Notice / Impressum",
      privacyPageTitle: "Privacy / Datenschutz",
      rememberSettings: "Remember settings on this device",
      rememberSettingsHint:
        "Saves language and filters locally in this browser. No tracking cookies are used.",
      versionLabel: "Version",
      versionChecking: "Checking for updates…",
      versionUpToDate: "You're on the latest version {version}.",
      versionUpdateAvailable:
        "Update available: {remote} (installed: {local})",
      versionNotConfigured:
        "Version {version} · Update checks activate after GitHub publishing.",
      versionCheckFailed: "Update check failed.",
      versionLastUpdated: "Last updated: {date}",
      versionNeverUpdated: "No app update installed yet.",
      versionCheckButton: "Check for updates",
      versionUpdateNow: "Update now",
      versionLater: "Later",
      versionUpdating: "Installing update…",
      versionUpdateDone: "Update installed. Restarting…",
      versionUpdateFailed: "Update failed.",
      versionOpenRelease: "Open release",
    },
  };

  function detectNavigatorLanguage(navLang) {
    const raw = String(navLang || "").toLowerCase();
    return raw.startsWith("de") ? "de" : "en";
  }

  function normalizeLang(lang) {
    const l = String(lang || "").toLowerCase();
    return SUPPORTED.includes(l) ? l : DEFAULT_LANG;
  }

  function getStoredLanguage(storage) {
    try {
      const store = storage || (typeof localStorage !== "undefined" ? localStorage : null);
      if (!store) return null;
      const v = store.getItem(LANGUAGE_KEY);
      return v ? normalizeLang(v) : null;
    } catch {
      return null;
    }
  }

  function resolveInitialLanguage({ storage, navigatorLanguage } = {}) {
    if (hasStorageConsent(storage)) {
      const stored = getStoredLanguage(storage);
      if (stored) return stored;
    }
    return detectNavigatorLanguage(navigatorLanguage);
  }

  function t(lang, key, vars) {
    const l = normalizeLang(lang);
    const dict = translations[l] || translations[DEFAULT_LANG];
    let value = dict[key];
    if (value == null) {
      value = translations[DEFAULT_LANG][key];
    }
    if (value == null) return key;
    if (vars && typeof vars === "object") {
      return String(value).replace(/\{(\w+)\}/g, (_, k) =>
        vars[k] != null ? String(vars[k]) : `{${k}}`
      );
    }
    return value;
  }

  function missingKeys() {
    const deKeys = Object.keys(translations.de).sort();
    const enKeys = Object.keys(translations.en).sort();
    const missingInEn = deKeys.filter((k) => !(k in translations.en));
    const missingInDe = enKeys.filter((k) => !(k in translations.de));
    return { missingInEn, missingInDe, deKeys, enKeys };
  }

  function applyDom(lang, root) {
    const scope = root || (typeof document !== "undefined" ? document : null);
    if (!scope) return;
    scope.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (!key) return;
      el.textContent = t(lang, key);
    });
    scope.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      if (!key) return;
      el.setAttribute("placeholder", t(lang, key));
    });
    scope.querySelectorAll("[data-i18n-title]").forEach((el) => {
      const key = el.getAttribute("data-i18n-title");
      if (!key) return;
      el.setAttribute("title", t(lang, key));
    });
    scope.querySelectorAll("[data-i18n-aria]").forEach((el) => {
      const key = el.getAttribute("data-i18n-aria");
      if (!key) return;
      el.setAttribute("aria-label", t(lang, key));
    });
    if (typeof document !== "undefined") {
      document.documentElement.lang = normalizeLang(lang);
    }
  }

  return {
    LANGUAGE_KEY,
    CONSENT_KEY,
    CONSENT_VALUE,
    DEFAULT_LANG,
    SUPPORTED,
    translations,
    detectNavigatorLanguage,
    normalizeLang,
    getStoredLanguage,
    hasStorageConsent,
    resolveInitialLanguage,
    t,
    missingKeys,
    applyDom,
  };
});
