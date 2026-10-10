(() => {
  "use strict";

  const I18n = window.WardogsI18n;
  const StorageApi = window.WardogsStorage;
  if (!I18n) return;

  if (StorageApi) {
    StorageApi.migrateLegacyStorage();
  }

  let currentLang = I18n.resolveInitialLanguage({
    navigatorLanguage:
      typeof navigator !== "undefined" ? navigator.language : "en",
  });

  function applyLanguage(lang) {
    currentLang = I18n.normalizeLang(lang);
    if (StorageApi && StorageApi.hasStorageConsent()) {
      StorageApi.writeLanguage(currentLang);
    }
    I18n.applyDom(currentLang);
    document.querySelectorAll("[data-lang-block]").forEach((el) => {
      const blockLang = el.getAttribute("data-lang-block");
      el.hidden = blockLang !== currentLang;
    });
    const deBtn = document.getElementById("langDe");
    const enBtn = document.getElementById("langEn");
    if (deBtn) deBtn.setAttribute("aria-pressed", currentLang === "de" ? "true" : "false");
    if (enBtn) enBtn.setAttribute("aria-pressed", currentLang === "en" ? "true" : "false");
    document.title =
      currentLang === "de"
        ? I18n.t("de", document.body.dataset.pageTitleKey || "legalPageTitle")
        : I18n.t("en", document.body.dataset.pageTitleKey || "legalPageTitle");
  }

  document.getElementById("langDe")?.addEventListener("click", () => applyLanguage("de"));
  document.getElementById("langEn")?.addEventListener("click", () => applyLanguage("en"));
  applyLanguage(currentLang);
})();
