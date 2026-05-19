/**
 * LinguaKit Options and Translator Popup Script. Configures the options menu dynamically by managing domain lists,
 * aliases, AI providers, custom system prompts, offscreen TTS selections, and persistent user configuration options.
 * Also manages the immediate sandbox Translator Tab UI interface.
 *
 * @file Popup.js
 */

import { i18n } from "./common/i18n.js";
import { tts } from "./services/tts.js";

const enabledCheckbox = document.querySelector("#enabled");
const settingsContainer = document.querySelector("#settings-container");
const nativeSelect = document.querySelector("#native");
const targetSelect = document.querySelector("#target");

const autoDetect = document.querySelector("#auto-detect");
const confirmModal = document.querySelector("#confirm-modal");
const rightClickUnlockerCheckbox = document.querySelector("#right-click-unlocker-enabled");
const saveBtn = document.querySelector("#save");
const aliasListEl = document.querySelector("#alias-list");
const aliasKeyInput = document.querySelector("#alias-key");
const aliasValueInput = document.querySelector("#alias-value");
const addAliasBtn = document.querySelector("#add-alias");

// History & Favorites elements
const historyListEl = document.querySelector("#history-list");
const favoritesListEl = document.querySelector("#favorites-list");

// Instant translate elements
const instantEnabledCheckbox = document.querySelector("#instant-translate-enabled");
const instantSettings = document.querySelector("#instant-settings");
const instantDelayInput = document.querySelector("#instant-delay");
const domainListEl = document.querySelector("#instant-domain-list");
const newDomainInput = document.querySelector("#new-domain");
const addDomainBtn = document.querySelector("#add-domain");

// Auto Page Translate elements
const autoPageEnabledCheckbox = document.querySelector("#auto-page-enabled");
const useGoogleProxyCheckbox = document.querySelector("#use-google-proxy");
const btnTestGoogleProxy = document.querySelector("#btn-test-google-proxy");
const autoPageSettings = document.querySelector("#auto-page-settings");
const autoPageDomainListEl = document.querySelector("#auto-page-domain-list");
const newAutoPageDomainInput = document.querySelector("#new-auto-page-domain");
const addAutoPageDomainBtn = document.querySelector("#add-auto-page-domain");
const btnExportJson = document.querySelector("#btn-export-json");
const btnImportJson = document.querySelector("#btn-import-json");
const importFileInput = document.querySelector("#import-file-input");

const autoPageShortcutCtrlCheckbox = document.querySelector("#auto-page-shortcut-ctrl");
const autoPageShortcutShiftCheckbox = document.querySelector("#auto-page-shortcut-shift");
const autoPageShortcutAltCheckbox = document.querySelector("#auto-page-shortcut-alt");
const autoPageShortcutKeyInput = document.querySelector("#auto-page-shortcut-key");
const autoPageShortcutPreview = document.querySelector("#auto-page-shortcut-preview");

// Keyboard shortcut elements
const shortcutCtrlCheckbox = document.querySelector("#shortcut-ctrl");
const shortcutShiftCheckbox = document.querySelector("#shortcut-shift");
const shortcutAltCheckbox = document.querySelector("#shortcut-alt");
const shortcutKeyInput = document.querySelector("#shortcut-key");
const shortcutPreview = document.querySelector("#shortcut-preview");

// Provider List elements
const providerListEl = document.querySelector("#provider-list");
const btnAddProvider = document.querySelector("#btn-add-provider");
const providerForm = document.querySelector("#provider-form");
const formTitle = document.querySelector("#form-title");
const formType = document.querySelector("#form-type");
const formName = document.querySelector("#form-name");
const formDynamicFields = document.querySelector("#form-dynamic-fields");
const btnFormCancel = document.querySelector("#form-cancel");
const btnFormTest = document.querySelector("#form-test");
const btnFormSave = document.querySelector("#form-save");

// Prompt customization elements
const systemPromptDisplay = document.querySelector("#system-prompt-display");
const userCustomPrompt = document.querySelector("#user-custom-prompt");
const promptCharCount = document.querySelector("#prompt-char-count");

// Hover to Translate elements
const hoverTranslateEnabled = document.getElementById("hover-translate-enabled");
const hoverUniqueMode = document.getElementById("hover-unique-mode");
const hoverSettings = document.getElementById("hover-settings");
const hoverMode = document.getElementById("hover-mode");
const hoverGranularity = document.getElementById("hover-granularity");
const hoverModifier = document.getElementById("hover-modifier");
const hoverShortcutCtrl = document.getElementById("hover-shortcut-ctrl");
const hoverShortcutShift = document.getElementById("hover-shortcut-shift");
const hoverShortcutAlt = document.getElementById("hover-shortcut-alt");
const hoverShortcutKey = document.getElementById("hover-shortcut-key");
const hoverShortcutPreview = document.getElementById("hover-shortcut-preview");
// const hoverBgColor = document.getElementById('hover-bg-color'); // Removed
const hoverTextColor = document.getElementById("hover-text-color");
const hoverFontSize = document.getElementById("hover-font-size");
const hoverShowIcon = document.getElementById("hover-show-icon");
const hoverUnderline = document.getElementById("hover-underline");
const manageHoverDomains = document.getElementById("manage-hover-domains");
const hoverDomainListSection = document.getElementById("hover-domain-list-section");
const hoverDomainList = document.getElementById("hover-domain-list");
const hoverDomainCount = document.getElementById("hover-domain-count");
const newHoverDomain = document.getElementById("new-hover-domain");
const addHoverDomain = document.getElementById("add-hover-domain");

const ocrEnabledCheckbox = document.getElementById("ocr-enabled");
const btnOpenChromeShortcuts = document.getElementById("btn-open-chrome-shortcuts");

let currentAliases = {};
let currentDomains = [];
let currentAutoPageDomains = [];
let currentHoverDomains = [];
let providers = [];
let activeProviderId = "builtin";
let editingProviderId = null;

let ttsProviders = [];
let activeTTSProviderId = "google-tts";
let editingTTSProviderId = null;

const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "vi", name: "Vietnamese" },
  { code: "ja", name: "Japanese" },
  { code: "zh", name: "Chinese" },
  { code: "ko", name: "Korean" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "ru", name: "Russian" },
  { code: "pt", name: "Portuguese" },
  { code: "it", name: "Italian" },
  { code: "hi", name: "Hindi" },
  { code: "ar", name: "Arabic" },
  { code: "tr", name: "Turkish" },
  { code: "nl", name: "Dutch" },
  { code: "pl", name: "Polish" },
  { code: "th", name: "Thai" },
];

/**
 * Updates the text inside DOM elements marked with custom `data-i18n` and `data-i18n-placeholder` attributes using
 * localized dictionary mappings from i18n service helper.
 *
 * @function translateUI
 * @returns {void}
 */
function translateUI() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.innerHTML = i18n.t(el.getAttribute("data-i18n"));
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.setAttribute("placeholder", i18n.t(el.getAttribute("data-i18n-placeholder")));
  });

  saveBtn.textContent = i18n.t(saveBtn.textContent.includes("✅") ? "popup.saved" : "popup.savePreferences");
}

/**
 * Renders a brief premium toast banner notification with dynamic messages.
 *
 * @function showToast
 * @param {string} message - Text information.
 * @param {string} [type="success"] - CSS class type modifier ('success', 'error'). Default is `"success"`
 * @returns {void}
 */
function showToast(message, type = "success") {
  const existingToast = document.querySelector(".bt-toast");
  if (existingToast) existingToast.remove();

  const toast = document.createElement("div");
  toast.className = `bt-toast ${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.5s ease";
    setTimeout(() => toast.remove(), 500);
  }, 2500);
}

/**
 * Reads extension version metadata from chrome manifest and prints it onto the UI header.
 *
 * @function displayVersion
 * @returns {void}
 */
function displayVersion() {
  const manifest = chrome.runtime.getManifest();
  const versionEl = document.getElementById("version-display");
  if (versionEl && manifest.version) {
    versionEl.textContent = `v${manifest.version}`;
  }
}

/**
 * Copies a text string to user clipboard via HTML5 navigator.clipboard API. Shows status toast indicator upon
 * completion.
 *
 * @async
 * @function copyToClipboard
 * @param {string} text - Content plain text string to copy.
 * @returns {Promise<void>}
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(i18n.t("popup.copied"), "success");
  } catch (err) {
    console.error("Failed to copy:", err);
    showToast(i18n.t("popup.failedToCopy"), "error");
  }
}

/**
 * Fills native and target dropdown select selectors with localized country language mappings.
 *
 * @function populateSelects
 * @returns {void}
 */
function populateSelects() {
  const options = LANGUAGES.map(
    (l) => `<option value="${l.code}">${i18n.t("lang." + l.code) || l.name} (${l.code})</option>`,
  ).join("");

  [nativeSelect, targetSelect].forEach((select) => {
    if (select) {
      const val = select.value;
      select.innerHTML = options;
      if (val) select.value = val;
    }
  });

  if (typeof populateTranslateSelects === "function") {
    populateTranslateSelects();
  }
}

function renderAliases() {
  aliasListEl.innerHTML = "";
  Object.entries(currentAliases).forEach(([key, value]) => {
    const item = document.createElement("div");
    item.className = "bt-alias-item";
    item.innerHTML = `
      <span><b>${key}</b> → ${String(value)}</span>
      <button data-key="${key}" class="bt-remove-alias">×</button>
    `;
    aliasListEl.appendChild(item);
  });

  document.querySelectorAll(".bt-remove-alias").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const key = e.target.dataset.key;
      delete currentAliases[key];
      renderAliases();
      void saveSettings();
    });
  });
}

function renderHistoryList(history) {
  if (!historyListEl) return;
  if (!history || history.length === 0) {
    historyListEl.innerHTML = `
      <div class="bt-empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="bt-empty-svg">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        <div class="bt-empty-text">${i18n.t("popup.noHistory")}</div>
      </div>
    `;
    return;
  }

  // Clear existing content
  historyListEl.innerHTML = "";

  const renderChunk = (startIndex, chunkSize) => {
    if (!historyListEl) return;

    const chunk = history.slice(startIndex, startIndex + chunkSize);
    if (chunk.length === 0) return;

    const html = chunk
      .map(
        (item) => `
      <div class="bt-history-item" data-id="${item.id}">
        <div class="bt-history-main">
          <div class="bt-history-source">${item.source}</div>
          <div class="bt-history-target">${item.target}</div>
          <div class="bt-history-meta">
            <span>${item.sourceLang.toUpperCase()} → ${item.targetLang.toUpperCase()}</span>
            <span>•</span>
            <span>${item.provider || "AI"}</span>
            <span>•</span>
            <span>${new Date(item.timestamp).toLocaleString()}</span>
          </div>
        </div>
        <div class="bt-history-actions">
          <button class="bt-btn-icon btn-copy-history" data-id="${item.id}" title="${i18n.t("popup.copy")}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
          </button>
          <button class="bt-btn-icon btn-favorite ${item.isFavorite ? "active" : ""}" data-id="${item.id}" title="Favorite">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="${item.isFavorite ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          </button>
          <button class="bt-btn-icon btn-delete-history" data-id="${item.id}" title="Delete">×</button>
        </div>
      </div>
    `,
      )
      .join("");

    historyListEl.insertAdjacentHTML("beforeend", html);

    // Attach event listeners to new elements
    const chunkItems = historyListEl.querySelectorAll(`.bt-history-item[data-id]`);
    chunkItems.forEach((el) => {
      if (el.dataset.listenersAttached) return;
      el.dataset.listenersAttached = "true";

      const id = el.dataset.id;
      el.querySelector(".btn-favorite")?.addEventListener("click", () => {
        void toggleFavorite(id);
      });
      el.querySelector(".btn-copy-history")?.addEventListener("click", () => {
        const item = enrichedHistory.find((h) => h.id === id);
        if (item) void copyToClipboard(item.target);
      });
      el.querySelector(".btn-delete-history")?.addEventListener("click", () => {
        void deleteHistoryItem(id);
      });
    });

    if (startIndex + chunkSize < history.length) {
      setTimeout(() => renderChunk(startIndex + chunkSize, chunkSize), 16);
    }
  };

  // Render first chunk immediately
  renderChunk(0, 10);
}

let enrichedHistory = [];
async function loadHistory() {
  const data = await chrome.storage.local.get(["translationHistory", "favorites"]);
  const history = data.translationHistory || [];
  const favorites = data.favorites || [];

  // Mark history items that are in favorites
  enrichedHistory = history.map((h) =>
    Object.assign({}, h, {
      isFavorite: favorites.some((f) => f.source === h.source && f.target === h.target),
    }),
  );

  renderHistoryList(enrichedHistory);
  renderFavoritesList(favorites);
}

function renderFavoritesList(favorites) {
  if (!favoritesListEl) return;
  if (!favorites || favorites.length === 0) {
    favoritesListEl.innerHTML = `
      <div class="bt-empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="bt-empty-svg">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
        </svg>
        <div class="bt-empty-text">${i18n.t("popup.noFavorites")}</div>
      </div>
    `;
    return;
  }

  // Clear existing content
  favoritesListEl.innerHTML = "";

  const renderFavChunk = (startIndex, chunkSize) => {
    if (!favoritesListEl) return;

    const chunk = favorites.slice(startIndex, startIndex + chunkSize);
    if (chunk.length === 0) return;

    const html = chunk
      .map(
        (item) => `
      <div class="bt-history-item" data-id="${item.id}">
        <div class="bt-history-main">
          <div class="bt-history-source">${item.source}</div>
          <div class="bt-history-target">${item.target}</div>
          <div class="bt-history-meta">
            <span>${item.sourceLang.toUpperCase()} → ${item.targetLang.toUpperCase()}</span>
          </div>
        </div>
        <div class="bt-history-actions">
          <button class="bt-btn-icon btn-copy-favorite" data-id="${item.id}" title="${i18n.t("popup.copy")}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
          </button>
          <button class="bt-btn-icon btn-remove-favorite" data-id="${item.id}" title="Remove">×</button>
        </div>
      </div>
    `,
      )
      .join("");

    favoritesListEl.insertAdjacentHTML("beforeend", html);

    // Attach event listeners to new elements
    const chunkItems = favoritesListEl.querySelectorAll(`.bt-history-item[data-id]`);
    chunkItems.forEach((el) => {
      if (el.dataset.listenersAttached) return;
      el.dataset.listenersAttached = "true";

      const id = el.dataset.id;
      el.querySelector(".btn-copy-favorite")?.addEventListener("click", () => {
        const item = favorites.find((f) => f.id === id);
        if (item) void copyToClipboard(item.target);
      });
      el.querySelector(".btn-remove-favorite")?.addEventListener("click", () => {
        void removeFavorite(id);
      });
    });

    if (startIndex + chunkSize < favorites.length) {
      setTimeout(() => renderFavChunk(startIndex + chunkSize, chunkSize), 16);
    }
  };

  // Render first chunk immediately
  renderFavChunk(0, 10);
}

async function toggleFavorite(id) {
  const data = await chrome.storage.local.get(["translationHistory", "favorites"]);
  let history = data.translationHistory || [];
  let favorites = data.favorites || [];

  const item = history.find((h) => h.id === id);
  if (!item) return;

  const favIdx = favorites.findIndex((f) => f.source === item.source && f.target === item.target);
  if (favIdx > -1) {
    favorites.splice(favIdx, 1);
  } else {
    favorites.unshift({ ...item, id: crypto.randomUUID() });
  }

  await chrome.storage.local.set({ favorites });
  void loadHistory();
}

async function deleteHistoryItem(id) {
  const data = await chrome.storage.local.get("translationHistory");
  let history = data.translationHistory || [];
  history = history.filter((h) => h.id !== id);
  await chrome.storage.local.set({ translationHistory: history });
  void loadHistory();
}

async function removeFavorite(id) {
  const data = await chrome.storage.local.get("favorites");
  let favorites = data.favorites || [];
  favorites = favorites.filter((f) => f.id !== id);
  await chrome.storage.local.set({ favorites });
  void loadHistory();
}

// Clear History with event delegation for robustness
document.addEventListener("click", async (e) => {
  if (e.target.id === "clear-history" || e.target.closest("#clear-history")) {
    if (confirm(i18n.t("popup.clearConfirm"))) {
      await chrome.storage.local.set({ translationHistory: [] });
      await loadHistory();
      showToast(i18n.t("popup.clear"), "success");
    }
  }
});

function renderDomains() {
  if (!domainListEl) return;
  domainListEl.innerHTML = currentDomains
    .map(
      (item, index) => `
    <div class="bt-domain-item">
      <input type="checkbox" ${item.enabled ? "checked" : ""} data-index="${index}" />
      <span class="bt-domain-name">${item.domain}</span>
      <select class="bt-position-select" data-index="${index}">
        ${["auto", "bottom", "top"].map((p) => `<option value="${p}" ${item.position === p ? "selected" : ""}>${p.charAt(0).toUpperCase() + p.slice(1)}</option>`).join("")}
      </select>
      <button class="bt-remove-alias" data-index="${index}">×</button>
    </div>
  `,
    )
    .join("");

  domainListEl.querySelectorAll("input, select, button").forEach((el) => {
    el.addEventListener(el.tagName === "BUTTON" ? "click" : "change", (e) => {
      const idx = e.target.dataset.index;
      if (el.tagName === "BUTTON") {
        currentDomains.splice(idx, 1);
        renderDomains();
      } else {
        currentDomains[idx][el.type === "checkbox" ? "enabled" : "position"] =
          el.type === "checkbox" ? e.target.checked : e.target.value;
      }
      void saveSettings();
    });
  });
}

function renderAutoPageDomains() {
  if (!autoPageDomainListEl) return;
  autoPageDomainListEl.innerHTML = currentAutoPageDomains
    .map(
      (item, index) => `
    <div class="bt-domain-item">
      <input type="checkbox" ${item.enabled ? "checked" : ""} data-index="${index}" />
      <span class="bt-domain-name">${item.domain}</span>
      <button class="bt-remove-alias" data-index="${index}">×</button>
    </div>
  `,
    )
    .join("");

  autoPageDomainListEl.querySelectorAll("input, button").forEach((el) => {
    el.addEventListener(el.tagName === "BUTTON" ? "click" : "change", (e) => {
      const idx = e.target.dataset.index;
      if (el.tagName === "BUTTON") {
        currentAutoPageDomains.splice(idx, 1);
        renderAutoPageDomains();
      } else {
        currentAutoPageDomains[idx].enabled = e.target.checked;
      }
      void saveSettings();
    });
  });
}

function renderProviderList() {
  providerListEl.innerHTML = "";

  // Define default provider IDs that cannot be edited or deleted
  const DEFAULT_PROVIDER_IDS = new Set(["google-translate"]);

  providers.forEach((p) => {
    const isActive = p.id === activeProviderId;
    const isDefaultProvider = DEFAULT_PROVIDER_IDS.has(p.id);

    const el = document.createElement("div");
    el.className = `bt-provider-item ${isActive ? "active" : ""}`;

    // Actions
    let actionsHtml = "";
    if (isActive) {
      actionsHtml += `<span class="bt-badge-active">${i18n.t("popup.active")}</span>`;
    } else {
      actionsHtml += `<button class="bt-btn-text btn-set-active" data-id="${p.id}">${i18n.t("popup.use")}</button>`;
    }

    // Only allow edit/delete for non-default providers
    if (!isDefaultProvider) {
      actionsHtml += `<button class="bt-btn-text btn-edit" data-id="${p.id}">${i18n.t("popup.edit")}</button>`;
      actionsHtml += `<button class="bt-btn-text btn-delete" data-id="${p.id}">${i18n.t("popup.delete")}</button>`;
    }

    el.innerHTML = `
      <div class="bt-provider-info">
        <div class="bt-provider-name">${p.name}</div>
        <div class="bt-provider-type">${p.type}</div>
      </div>
      <div class="bt-provider-actions">
        ${actionsHtml}
      </div>
    `;
    providerListEl.appendChild(el);
  });

  // Attach events
  providerListEl.querySelectorAll(".btn-set-active").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      activeProviderId = e.target.dataset.id;
      renderProviderList();
      void saveSettings();
    });
  });

  providerListEl.querySelectorAll(".btn-delete").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      if (confirm(i18n.t("popup.confirmDeleteProvider"))) {
        providers = providers.filter((p) => p.id !== e.target.dataset.id);
        if (activeProviderId === e.target.dataset.id) {
          activeProviderId = "google-translate";
        }
        renderProviderList();
        void saveSettings();
      }
    });
  });

  providerListEl.querySelectorAll(".btn-edit").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const p = providers.find((item) => item.id === e.target.dataset.id);
      if (p) openProviderForm(p);
    });
  });
}

function getProviderInfo(_type) {
  return null;
}

function renderFormFields(type, config = {}) {
  formDynamicFields.innerHTML = "";

  // Info Link
  const info = getProviderInfo(type);
  if (info) {
    const infoDiv = document.createElement("div");
    infoDiv.className = "bt-provider-help";
    infoDiv.innerHTML = `
      <a href="${info.link}" target="_blank" class="bt-link">${i18n.t("popup.getApiKey")} (${info.text}) ↗</a>
    `;
    formDynamicFields.appendChild(infoDiv);
  }

  if (type === "openai") {
    const model = config.model || "gpt-4o-mini";
    formDynamicFields.insertAdjacentHTML(
      "beforeend",
      `
      <div style="margin-top: 0.75rem; margin-bottom: 0.25rem;">
        <span style="font-size: 11px; font-weight: 700; color: var(--bt-color-text-muted); text-transform: uppercase; letter-spacing: 0.05em;">
          Configuration
        </span>
      </div>
      <div class="bt-divider" style="margin: 0 0 1rem 0;"></div>
      
      <div class="bt-field" style="margin-bottom: var(--bt-space-medium);">
        <label>Endpoint</label>
        <input type="text" id="field-baseUrl" class="bt-input" value="${config.baseUrl || ""}" placeholder="https://api.openai.com/v1" />
      </div>

      <div class="bt-row" style="margin-bottom: var(--bt-space-medium);">
        <div class="bt-field">
          <label>Username</label>
          <input type="text" id="field-username" class="bt-input" value="${config.username || ""}" placeholder="Username" />
        </div>
        <div class="bt-field">
          <label>Password</label>
          <input type="password" id="field-password" class="bt-input" value="${config.password || ""}" placeholder="Password" />
        </div>
      </div>

      <div class="bt-field" style="margin-bottom: var(--bt-space-medium);">
        <label>Model</label>
        <input type="text" id="field-model" class="bt-input" value="${model}" placeholder="gpt-4.1-mini" />
      </div>
    `,
    );
  }
}

function openProviderForm(provider = null) {
  editingProviderId = provider ? provider.id : null;
  formTitle.textContent = provider ? i18n.t("popup.edit") : i18n.t("popup.addProvider");
  formType.value = provider ? provider.type : "openai";
  formType.disabled = !!provider; // Cannot change type when editing
  formName.value = provider ? provider.name : "";

  renderFormFields(formType.value, provider ? provider.config : {});

  providerListEl.parentElement.hidden = true;
  providerForm.hidden = false;

  // Hide main save button
  saveBtn.style.display = "none";
}

function closeProviderForm() {
  providerForm.hidden = true;
  providerListEl.parentElement.hidden = false;
  editingProviderId = null;

  // Show main save button
  saveBtn.style.display = "block";
}

function saveProviderFromForm() {
  const type = formType.value;
  const name = formName.value.trim() || type;
  const config = {};

  const apiKeyEl = document.querySelector("#field-apiKey");
  if (apiKeyEl) config.apiKey = apiKeyEl.value.trim();

  const modelEl = document.querySelector("#field-model");
  if (modelEl) config.model = modelEl.value;

  const baseUrlEl = document.querySelector("#field-baseUrl");
  if (baseUrlEl) config.baseUrl = baseUrlEl.value.trim();

  const usernameEl = document.querySelector("#field-username");
  if (usernameEl) config.username = usernameEl.value.trim();

  const passwordEl = document.querySelector("#field-password");
  if (passwordEl) config.password = passwordEl.value.trim();

  // Validation
  document.querySelectorAll(".bt-input.error").forEach((el) => el.classList.remove("error"));

  if (type === "openai") {
    let hasError = false;
    const required = [
      { id: "field-baseUrl", val: config.baseUrl },
      { id: "field-model", val: config.model },
      { id: "field-username", val: config.username },
      { id: "field-password", val: config.password },
    ];

    required.forEach((f) => {
      const el = document.getElementById(f.id);
      if (!f.val && el) {
        el.classList.add("error");
        hasError = true;
      }
    });

    if (hasError) {
      showToast(i18n.t("popup.fillAllFields"), "error");
      return;
    }
  }

  if (editingProviderId) {
    // Update
    const idx = providers.findIndex((p) => p.id === editingProviderId);
    if (idx !== -1) {
      providers[idx].name = name;
      providers[idx].config = config;
      showToast(i18n.t("popup.providerUpdated"), "success");
    }
  } else {
    // Create
    const newId = crypto.randomUUID();
    providers.push({
      id: newId,
      type,
      name,
      config,
    });
    showToast(i18n.t("popup.providerAdded"), "success");
  }

  void saveSettings();
  renderProviderList();
  closeProviderForm();
}

// Event Listeners for Form
btnAddProvider.addEventListener("click", () => openProviderForm(null));
btnFormCancel.addEventListener("click", closeProviderForm);
btnFormSave.addEventListener("click", saveProviderFromForm);

btnFormTest.addEventListener("click", () => {
  const type = formType.value;
  const config = {};

  const apiKeyEl = document.querySelector("#field-apiKey");
  if (apiKeyEl) config.apiKey = apiKeyEl.value.trim();

  const modelEl = document.querySelector("#field-model");
  if (modelEl) config.model = modelEl.value ? modelEl.value.trim() : "";

  const baseUrlEl = document.querySelector("#field-baseUrl");
  if (baseUrlEl) config.baseUrl = baseUrlEl.value ? baseUrlEl.value.trim() : "";

  const usernameEl = document.querySelector("#field-username");
  if (usernameEl) config.username = usernameEl.value ? usernameEl.value.trim() : "";

  const passwordEl = document.querySelector("#field-password");
  if (passwordEl) config.password = passwordEl.value ? passwordEl.value.trim() : "";

  // Validation check before running test
  let hasError = false;
  if (type === "openai") {
    const required = [
      { id: "field-baseUrl", val: config.baseUrl },
      { id: "field-model", val: config.model },
      { id: "field-username", val: config.username },
      { id: "field-password", val: config.password },
    ];

    required.forEach((f) => {
      const el = document.getElementById(f.id);
      if (!f.val && el) {
        el.classList.add("error");
        hasError = true;
      }
    });
  }

  if (hasError) {
    showToast(i18n.t("popup.fillRequired") || "Please fill in all required fields", "error");
    return;
  }

  const originalText = btnFormTest.textContent;
  btnFormTest.disabled = true;
  btnFormTest.textContent = i18n.t("toast.testingConnection") || "Testing connection...";

  chrome.runtime.sendMessage(
    {
      type: "test-provider",
      providerType: type,
      config: config,
    },
    (response) => {
      btnFormTest.disabled = false;
      btnFormTest.textContent = originalText;

      if (response && response.ok) {
        const successMsg =
          (i18n.t("toast.testSuccess") || "Connection successful!") + ` (Hello -> ${response.translation})`;
        showToast(successMsg, "success");
      } else {
        const errorMsg =
          (i18n.t("toast.testFailed") || "Connection failed") +
          (response ? `: ${response.error}` : ": Timeout or no response");
        showToast(errorMsg, "error");
      }
    },
  );
});

formType.addEventListener("change", () => renderFormFields(formType.value));

// ============================================
// TTS Provider Logic
// ============================================

const ttsProviderListEl = document.querySelector("#tts-provider-list");
const btnAddTTSProvider = document.querySelector("#btn-add-tts-provider");
const ttsProviderForm = document.querySelector("#tts-provider-form");
const ttsFormTitle = document.querySelector("#tts-form-title");
const ttsFormName = document.querySelector("#tts-form-name");
const ttsFormUrl = document.querySelector("#tts-form-url");
const btnTTSFormCancel = document.querySelector("#tts-form-cancel");
const btnTTSFormSave = document.querySelector("#tts-form-save");

function renderTTSProviderList() {
  if (!ttsProviderListEl) return;
  ttsProviderListEl.innerHTML = "";

  // Default Google TTS (cannot be deleted)
  const googleTTS = { id: "google-tts", name: "Google TTS", type: "google", readonly: true };

  // Combine default and custom
  const allProviders = [googleTTS, ...ttsProviders];

  allProviders.forEach((p) => {
    const isActive = p.id === activeTTSProviderId;

    const el = document.createElement("div");
    el.className = `bt-provider-item ${isActive ? "active" : ""}`;

    // Actions
    let actionsHtml = "";
    if (isActive) {
      actionsHtml += `<span class="bt-badge-active">${i18n.t("popup.active")}</span>`;
    } else {
      actionsHtml += `<button class="bt-btn-text btn-set-active-tts" data-id="${p.id}">${i18n.t("popup.use")}</button>`;
    }

    if (!p.readonly) {
      actionsHtml += `<button class="bt-btn-text btn-edit-tts" data-id="${p.id}">${i18n.t("popup.edit")}</button>`;
      actionsHtml += `<button class="bt-btn-text btn-delete-tts" data-id="${p.id}">${i18n.t("popup.delete")}</button>`;
    }

    el.innerHTML = `
      <div class="bt-provider-info">
        <div class="bt-provider-name">${p.name}</div>
        <div class="bt-provider-type">${p.type === "google" ? "Standard" : "Custom URL"}</div>
      </div>
      <div class="bt-provider-actions">
        ${actionsHtml}
      </div>
    `;
    ttsProviderListEl.appendChild(el);
  });

  // Attach events
  ttsProviderListEl.querySelectorAll(".btn-set-active-tts").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      activeTTSProviderId = e.target.dataset.id;
      renderTTSProviderList();
      void saveSettings();
    });
  });

  ttsProviderListEl.querySelectorAll(".btn-delete-tts").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      if (confirm(i18n.t("popup.confirmDeleteTTS"))) {
        ttsProviders = ttsProviders.filter((p) => p.id !== e.target.dataset.id);
        if (activeTTSProviderId === e.target.dataset.id) {
          activeTTSProviderId = "google-tts";
        }
        renderTTSProviderList();
        void saveSettings();
      }
    });
  });

  ttsProviderListEl.querySelectorAll(".btn-edit-tts").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const p = ttsProviders.find((item) => item.id === e.target.dataset.id);
      if (p) openTTSProviderForm(p);
    });
  });
}

function openTTSProviderForm(provider = null) {
  editingTTSProviderId = provider ? provider.id : null;
  ttsFormTitle.textContent = provider ? i18n.t("popup.editTTSProvider") : i18n.t("popup.addTTSProvider");
  ttsFormName.value = provider ? provider.name : "";
  ttsFormUrl.value = provider ? provider.url : "";

  ttsProviderListEl.parentElement.hidden = true;
  ttsProviderForm.hidden = false;
  saveBtn.style.display = "none";
}

function closeTTSProviderForm() {
  ttsProviderForm.hidden = true;
  ttsProviderListEl.parentElement.hidden = false;
  editingTTSProviderId = null;
  saveBtn.style.display = "block";
}

function saveTTSProviderFromForm() {
  const name = ttsFormName.value.trim() || "Custom TTS";
  const url = ttsFormUrl.value.trim();

  if (!url) {
    alert(i18n.t("popup.urlTemplateRequired"));
    return;
  }

  if (editingTTSProviderId) {
    const idx = ttsProviders.findIndex((p) => p.id === editingTTSProviderId);
    if (idx !== -1) {
      ttsProviders[idx].name = name;
      ttsProviders[idx].url = url;
    }
  } else {
    const newId = crypto.randomUUID();
    ttsProviders.push({
      id: newId,
      type: "custom",
      name,
      url,
    });
  }

  void saveSettings();
  renderTTSProviderList();
  closeTTSProviderForm();
}

if (btnAddTTSProvider) btnAddTTSProvider.addEventListener("click", () => openTTSProviderForm(null));
if (btnTTSFormCancel) btnTTSFormCancel.addEventListener("click", closeTTSProviderForm);
if (btnTTSFormSave) btnTTSFormSave.addEventListener("click", saveTTSProviderFromForm);

function updateSettingsVisibility() {
  if (enabledCheckbox.checked) {
    settingsContainer.removeAttribute("disabled");
  } else {
    settingsContainer.setAttribute("disabled", "true");
  }
}

function toggleInstantSettings() {
  if (!instantEnabledCheckbox || !instantSettings) return;

  if (instantEnabledCheckbox.checked) {
    instantSettings.removeAttribute("hidden");
  } else {
    instantSettings.setAttribute("hidden", "true");
  }
}

function toggleAutoPageSettings() {
  if (!autoPageEnabledCheckbox || !autoPageSettings) return;

  if (autoPageEnabledCheckbox.checked) {
    autoPageSettings.removeAttribute("hidden");
  } else {
    autoPageSettings.setAttribute("hidden", "true");
  }
}

function updateShortcutPreview() {
  if (!shortcutPreview) return;

  const parts = [];
  if (shortcutCtrlCheckbox.checked) parts.push("Ctrl");
  if (shortcutShiftCheckbox.checked) parts.push("Shift");
  if (shortcutAltCheckbox.checked) parts.push("Alt");

  const key = shortcutKeyInput.value.toUpperCase() || "I";
  parts.push(key);

  const shortcut = parts.join("+");
  const macShortcut = shortcut.replace("Ctrl", "Cmd");

  shortcutPreview.textContent = i18n
    .t("popup.shortcutPreview")
    .replace("{shortcut}", shortcut)
    .replace("{macShortcut}", macShortcut);
}

function updateAutoPageShortcutPreview() {
  if (!autoPageShortcutPreview) return;

  const parts = [];
  if (autoPageShortcutCtrlCheckbox.checked) parts.push("Ctrl");
  if (autoPageShortcutShiftCheckbox.checked) parts.push("Shift");
  if (autoPageShortcutAltCheckbox.checked) parts.push("Alt");

  const key = autoPageShortcutKeyInput.value.toUpperCase() || "P";
  parts.push(key);

  const shortcut = parts.join("+");
  const macShortcut = shortcut.replace("Ctrl", "Cmd");

  autoPageShortcutPreview.textContent = i18n
    .t("popup.shortcutPreview")
    .replace("{shortcut}", shortcut)
    .replace("{macShortcut}", macShortcut);
}

function syncLanguageElements(settings) {
  const nativeVal = settings.nativeLanguageCode || "vi";
  const targetVal = settings.targetLanguageCode || "en";
  const autoDetectVal = settings.useAutoDetect === true;

  if (nativeSelect) nativeSelect.value = nativeVal;
  if (targetSelect) targetSelect.value = targetVal;
  if (autoDetect) autoDetect.checked = autoDetectVal;

  if (translateTargetLang) translateTargetLang.value = targetVal;
  if (translateSourceLang) {
    if (autoDetectVal) {
      translateSourceLang.value = "auto";
    } else {
      translateSourceLang.value = nativeVal;
    }

    const autoOption = translateSourceLang.querySelector('option[value="auto"]');
    if (autoOption) {
      if (autoDetectVal && lastDetectedLang) {
        const langName = LANGUAGES.find((l) => l.code === lastDetectedLang)?.name || lastDetectedLang;
        const localizedLangName = i18n.t("lang." + lastDetectedLang) || langName;
        const label = i18n.t("popup.detectedLanguageLabel") || "{lang} - Detected";
        autoOption.textContent = label.replace("{lang}", localizedLangName);
      } else {
        autoOption.textContent = i18n.t("popup.detectLanguage") || "Detect language";
      }
    }
  }
}

async function updateGlobalLanguageSettings(newLangSettings) {
  try {
    const res = await chrome.runtime.sendMessage({ type: "get-settings" });
    if (res?.ok) {
      const settings = Object.assign({}, res.settings, newLangSettings);
      await chrome.runtime.sendMessage({
        type: "set-settings",
        settings,
      });
    }
  } catch (err) {
    console.error("LinguaKit: Error updating global language settings:", err);
  }
}

async function loadSettings() {
  const res = await chrome.runtime.sendMessage({ type: "get-settings" });

  populateSelects();

  if (res?.ok) {
    enabledCheckbox.checked = res.settings.enabled !== false;
    syncLanguageElements(res.settings);

    confirmModal.checked = res.settings.showConfirmModal !== false;
    if (rightClickUnlockerCheckbox) {
      rightClickUnlockerCheckbox.checked = res.settings.rightClickUnlockerEnabled || false;
    }
    if (ocrEnabledCheckbox) {
      ocrEnabledCheckbox.checked = res.settings.ocrEnabled !== false;
    }
    currentAliases = res.settings.aliases || {};

    const lang = res.settings.interfaceLanguage || "vi";
    updateLangToggleUI(lang);
    i18n.setLanguage(lang);
    populateSelects();
    translateUI();

    if (instantEnabledCheckbox) {
      instantEnabledCheckbox.checked = res.settings.instantTranslateEnabled || false;
    }
    if (instantDelayInput) {
      instantDelayInput.value = (res.settings.instantDelay || 3000) / 1000;
    }
    currentDomains = res.settings.instantDomains || [];

    if (autoPageEnabledCheckbox) {
      autoPageEnabledCheckbox.checked = res.settings.autoPageTranslateEnabled || false;
    }
    if (useGoogleProxyCheckbox) {
      useGoogleProxyCheckbox.checked = res.settings.useGoogleTranslateProxy || false;
    }
    currentAutoPageDomains = res.settings.autoPageTranslateDomains || [];

    // Load Providers
    providers = res.settings.providers || [
      {
        id: "google-translate",
        type: "google-translate",
        name: "Google Translate",
        config: {},
      },
    ];
    activeProviderId = res.settings.activeProviderId || "google-translate";

    // Load TTS Providers
    ttsProviders = res.settings.ttsProviders || [];
    activeTTSProviderId = res.settings.activeTTSProviderId || "google-tts";

    // Load Custom Prompt
    if (userCustomPrompt) {
      userCustomPrompt.value = res.settings.customPrompt || "";
      updateCharCounter();
    }
    if (systemPromptDisplay) {
      // Show user-friendly version of system prompt
      systemPromptDisplay.value =
        "You are a professional translator. Translate the user's text from source language to target language. Return ONLY the translated text.";
    }

    // Load Keyboard Shortcut
    const shortcut = res.settings.instantToggleShortcut || {
      key: "I",
      ctrl: false,
      shift: true,
      alt: true,
    };
    if (shortcutCtrlCheckbox) shortcutCtrlCheckbox.checked = shortcut.ctrl;
    if (shortcutShiftCheckbox) shortcutShiftCheckbox.checked = shortcut.shift;
    if (shortcutAltCheckbox) shortcutAltCheckbox.checked = shortcut.alt;
    if (shortcutKeyInput) shortcutKeyInput.value = shortcut.key.toUpperCase();
    updateShortcutPreview();

    // Load Auto Page Translate Shortcut
    const autoPageShortcut = res.settings.autoTranslateToggleShortcut || {
      key: "P",
      ctrl: false,
      shift: true,
      alt: true,
    };
    if (autoPageShortcutCtrlCheckbox) autoPageShortcutCtrlCheckbox.checked = autoPageShortcut.ctrl;
    if (autoPageShortcutShiftCheckbox) autoPageShortcutShiftCheckbox.checked = autoPageShortcut.shift;
    if (autoPageShortcutAltCheckbox) autoPageShortcutAltCheckbox.checked = autoPageShortcut.alt;
    if (autoPageShortcutKeyInput) autoPageShortcutKeyInput.value = autoPageShortcut.key.toUpperCase();
    updateAutoPageShortcutPreview();

    // Load Hover Translate settings
    hoverTranslateEnabled.checked = res.settings.hoverTranslateEnabled || false;
    hoverUniqueMode.checked = res.settings.hoverUniqueMode !== false; // Default true
    hoverSettings.hidden = !hoverTranslateEnabled.checked;
    hoverMode.value = res.settings.hoverTranslateMode || "inject";
    hoverModifier.value = res.settings.hoverModifierKey || "ctrl";
    hoverGranularity.value = res.settings.hoverTranslateGranularity || "line";

    // Load hover toggle shortcut
    const hoverShortcut = res.settings.hoverToggleShortcut || {
      key: "H",
      ctrl: false,
      shift: true,
      alt: true,
    };
    hoverShortcutCtrl.checked = hoverShortcut.ctrl;
    hoverShortcutShift.checked = hoverShortcut.shift;
    hoverShortcutAlt.checked = hoverShortcut.alt;
    hoverShortcutKey.value = hoverShortcut.key;
    updateHoverShortcutPreview();

    // Load style settings
    const hoverStyle = res.settings.hoverInjectStyle || {};

    hoverTextColor.value = hoverStyle.textColor || "#0c69e4";
    hoverFontSize.value = hoverStyle.fontSize || "0.95em";
    hoverShowIcon.checked = hoverStyle.showIcon !== false;
    hoverUnderline.checked = hoverStyle.underline || false;

    // Load hover domains
    currentHoverDomains = res.settings.hoverTranslateDomains || [];
    renderHoverDomainList(currentHoverDomains);
  } else {
    // Defaults
    enabledCheckbox.checked = true;
    if (ocrEnabledCheckbox) {
      ocrEnabledCheckbox.checked = true;
    }
    syncLanguageElements({
      nativeLanguageCode: "vi",
      targetLanguageCode: "en",
      useAutoDetect: false,
    });
    confirmModal.checked = true;
    if (rightClickUnlockerCheckbox) {
      rightClickUnlockerCheckbox.checked = false;
    }
    currentAliases = {};

    updateLangToggleUI("en");
    i18n.setLanguage("en");
    populateSelects();
    translateUI();

    if (instantEnabledCheckbox) instantEnabledCheckbox.checked = false;
    if (instantDelayInput) instantDelayInput.value = 3;
    currentDomains = [];

    if (autoPageEnabledCheckbox) autoPageEnabledCheckbox.checked = false;
    if (useGoogleProxyCheckbox) useGoogleProxyCheckbox.checked = false;
    currentAutoPageDomains = [];

    providers = [
      {
        id: "google-translate",
        type: "google-translate",
        name: "Google Translate",
        config: {},
      },
    ];
    activeProviderId = "google-translate";

    ttsProviders = [];
    activeTTSProviderId = "google-tts";

    // Default custom prompt
    if (userCustomPrompt) {
      userCustomPrompt.value = "";
      updateCharCounter();
    }
    if (systemPromptDisplay) {
      // Show user-friendly version of system prompt
      systemPromptDisplay.value =
        "You are a professional translator. Translate the user's text from source language to target language. Return ONLY the translated text.";
    }

    // Default keyboard shortcut
    if (shortcutCtrlCheckbox) shortcutCtrlCheckbox.checked = false;
    if (shortcutShiftCheckbox) shortcutShiftCheckbox.checked = true;
    if (shortcutAltCheckbox) shortcutAltCheckbox.checked = true;
    if (shortcutKeyInput) shortcutKeyInput.value = "I";
    updateShortcutPreview();

    if (autoPageShortcutCtrlCheckbox) autoPageShortcutCtrlCheckbox.checked = false;
    if (autoPageShortcutShiftCheckbox) autoPageShortcutShiftCheckbox.checked = true;
    if (autoPageShortcutAltCheckbox) autoPageShortcutAltCheckbox.checked = true;
    if (autoPageShortcutKeyInput) autoPageShortcutKeyInput.value = "P";
    updateAutoPageShortcutPreview();

    if (hoverShortcutCtrl) hoverShortcutCtrl.checked = false;
    if (hoverShortcutShift) hoverShortcutShift.checked = true;
    if (hoverShortcutAlt) hoverShortcutAlt.checked = true;
    if (hoverShortcutKey) hoverShortcutKey.value = "H";
    updateHoverShortcutPreview();
  }

  renderAliases();
  renderDomains();
  renderAutoPageDomains();
  renderProviderList();
  renderTTSProviderList();
  updateSettingsVisibility();
  toggleInstantSettings();
  toggleAutoPageSettings();
  initTranslateTab();

  // Sync save button display with initial active tab
  const activeTab = document.querySelector(".bt-tab.active");
  if (activeTab && (activeTab.dataset.tab === "help" || activeTab.dataset.tab === "translate")) {
    saveBtn.style.display = "none";
  } else {
    saveBtn.style.display = "block";
  }
}

async function saveSettings() {
  const settings = {
    enabled: enabledCheckbox.checked,
    nativeLanguageCode: nativeSelect.value,
    targetLanguageCode: targetSelect.value,
    useAutoDetect: autoDetect.checked,
    showConfirmModal: confirmModal.checked,
    rightClickUnlockerEnabled: rightClickUnlockerCheckbox ? rightClickUnlockerCheckbox.checked : false,
    ocrEnabled: ocrEnabledCheckbox ? ocrEnabledCheckbox.checked : true,
    aliases: currentAliases,
    interfaceLanguage: document.querySelector("#lang-toggle .active").getAttribute("data-lang"),
    instantTranslateEnabled: instantEnabledCheckbox?.checked || false,
    instantDelay: (parseInt(instantDelayInput?.value, 10) || 3) * 1000,
    instantDomains: currentDomains,
    // New Provider Structure
    providers,
    activeProviderId,
    // TTS Settings
    ttsProviders,
    activeTTSProviderId,
    // Custom Prompt
    customPrompt: userCustomPrompt?.value || "",
    // Keyboard shortcut
    instantToggleShortcut: {
      key: shortcutKeyInput?.value.toUpperCase() || "I",
      ctrl: shortcutCtrlCheckbox?.checked || false,
      shift: shortcutShiftCheckbox?.checked || false,
      alt: shortcutAltCheckbox?.checked || false,
    },
    // Auto Page Translate settings
    autoPageTranslateEnabled: autoPageEnabledCheckbox?.checked || false,
    useGoogleTranslateProxy: useGoogleProxyCheckbox?.checked || false,
    autoPageTranslateDomains: currentAutoPageDomains,
    autoTranslateToggleShortcut: {
      key: autoPageShortcutKeyInput?.value.toUpperCase() || "P",
      ctrl: autoPageShortcutCtrlCheckbox?.checked || false,
      shift: autoPageShortcutShiftCheckbox?.checked || false,
      alt: autoPageShortcutAltCheckbox?.checked || false,
    },
    // Hover Translate settings
    hoverTranslateEnabled: hoverTranslateEnabled?.checked || false,
    hoverUniqueMode: hoverUniqueMode?.checked !== false,
    hoverTranslateMode: hoverMode?.value || "inject",
    hoverTranslateGranularity: hoverGranularity?.value || "line",
    hoverModifierKey: hoverModifier?.value || "ctrl",
    hoverToggleShortcut: {
      key: hoverShortcutKey?.value.toUpperCase() || "O",
      ctrl: hoverShortcutCtrl?.checked || false,
      shift: hoverShortcutShift?.checked || false,
      alt: hoverShortcutAlt?.checked || false,
    },
    hoverInjectStyle: {
      textColor: hoverTextColor?.value || "#0c69e4",
      fontSize: hoverFontSize?.value || "0.95em",
      showIcon: hoverShowIcon?.checked !== false,
      underline: hoverUnderline?.checked || false,
    },
    hoverTranslateDomains: currentHoverDomains || [],
  };

  const res = await chrome.runtime.sendMessage({
    type: "set-settings",
    settings,
  });

  if (res?.ok) {
    saveBtn.textContent = i18n.t("popup.saved");
    showToast(i18n.t("popup.saved"), "success");
    setTimeout(() => {
      saveBtn.textContent = i18n.t("popup.savePreferences");
    }, 1800);
  }
}

addAliasBtn.addEventListener("click", () => {
  const key = aliasKeyInput.value.trim();
  const value = aliasValueInput.value.trim();
  if (key && value) {
    currentAliases[key] = value;
    aliasKeyInput.value = "";
    aliasValueInput.value = "";
    renderAliases();
    void saveSettings();
    showToast(i18n.t("popup.aliasAdded"), "success");
  } else {
    showToast(i18n.t("popup.aliasError"), "error");
    if (!key) aliasKeyInput.classList.add("error");
    if (!value) aliasValueInput.classList.add("error");
  }
});

enabledCheckbox.addEventListener("change", () => {
  updateSettingsVisibility();
  void saveSettings();
});

nativeSelect.addEventListener("change", () => {
  void updateGlobalLanguageSettings({ nativeLanguageCode: nativeSelect.value });
});
targetSelect.addEventListener("change", () => {
  void updateGlobalLanguageSettings({ targetLanguageCode: targetSelect.value });
});

autoDetect.addEventListener("change", () => {
  void updateGlobalLanguageSettings({ useAutoDetect: autoDetect.checked });
});
confirmModal.addEventListener("change", saveSettings);
if (rightClickUnlockerCheckbox) {
  rightClickUnlockerCheckbox.addEventListener("change", saveSettings);
}

const langToggle = document.querySelector("#lang-toggle");

langToggle.addEventListener("click", (e) => {
  if (e.target.hasAttribute("data-lang")) {
    const lang = e.target.getAttribute("data-lang");
    i18n.setLanguage(lang);
    translateUI();
    populateSelects();
    renderAliases();
    renderDomains();
    renderProviderList();
    updateLangToggleUI(lang);
    void saveSettings();
  }
});

function updateLangToggleUI(lang) {
  langToggle.querySelectorAll("span[data-lang]").forEach((span) => {
    if (span.getAttribute("data-lang") === lang) {
      span.classList.add("active");
    } else {
      span.classList.remove("active");
    }
  });
}

if (instantEnabledCheckbox) {
  instantEnabledCheckbox.addEventListener("change", () => {
    toggleInstantSettings();
    void saveSettings();
  });
}

if (instantDelayInput) {
  instantDelayInput.addEventListener("change", saveSettings);
}

if (addDomainBtn && newDomainInput) {
  addDomainBtn.addEventListener("click", () => {
    const domain = newDomainInput.value.trim();
    if (domain && !currentDomains.some((d) => d.domain === domain)) {
      currentDomains.push({ domain, enabled: true, position: "auto" });
      newDomainInput.value = "";
      renderDomains();
      void saveSettings();
      showToast(i18n.t("popup.domainAdded") || "Domain added successfully", "success");
    } else if (!domain) {
      showToast(i18n.t("popup.domainError"), "error");
      newDomainInput.classList.add("error");
    } else {
      showToast(i18n.t("popup.domainExists"), "error");
    }
  });
}

if (autoPageEnabledCheckbox) {
  autoPageEnabledCheckbox.addEventListener("change", () => {
    toggleAutoPageSettings();
    void saveSettings();
  });
}

if (useGoogleProxyCheckbox) {
  useGoogleProxyCheckbox.addEventListener("change", () => {
    void saveSettings();
  });
}

if (btnTestGoogleProxy) {
  btnTestGoogleProxy.addEventListener("click", () => {
    const originalText = btnTestGoogleProxy.textContent;
    btnTestGoogleProxy.disabled = true;
    btnTestGoogleProxy.textContent = i18n.t("toast.testingConnection") || "Testing connection...";

    chrome.runtime.sendMessage(
      {
        type: "test-google-proxy",
        useProxy: useGoogleProxyCheckbox?.checked || false,
      },
      (response) => {
        btnTestGoogleProxy.disabled = false;
        btnTestGoogleProxy.textContent = originalText;

        if (response && response.ok) {
          const successMsg =
            (i18n.t("toast.testSuccess") || "Connection successful!") + ` (Hello -> ${response.translation})`;
          showToast(successMsg, "success");
        } else {
          const errorMsg =
            (i18n.t("toast.testFailed") || "Connection failed") +
            (response ? `: ${response.error}` : ": Timeout or no response");
          showToast(errorMsg, "error");
        }
      },
    );
  });
}

if (addAutoPageDomainBtn && newAutoPageDomainInput) {
  addAutoPageDomainBtn.addEventListener("click", () => {
    const domain = newAutoPageDomainInput.value.trim();
    if (domain && !currentAutoPageDomains.some((d) => d.domain === domain)) {
      currentAutoPageDomains.push({ domain, enabled: true });
      newAutoPageDomainInput.value = "";
      renderAutoPageDomains();
      void saveSettings();
      showToast(i18n.t("popup.domainAdded") || "Domain added successfully", "success");
    } else if (!domain) {
      showToast(i18n.t("popup.domainError"), "error");
      newAutoPageDomainInput.classList.add("error");
    } else {
      showToast(i18n.t("popup.domainExists"), "error");
    }
  });
}

// Keyboard Shortcut Event Listeners
if (shortcutCtrlCheckbox) {
  shortcutCtrlCheckbox.addEventListener("change", () => {
    updateShortcutPreview();
    void saveSettings();
  });
}

if (shortcutShiftCheckbox) {
  shortcutShiftCheckbox.addEventListener("change", () => {
    updateShortcutPreview();
    void saveSettings();
  });
}

if (shortcutAltCheckbox) {
  shortcutAltCheckbox.addEventListener("change", () => {
    updateShortcutPreview();
    void saveSettings();
  });
}

if (shortcutKeyInput) {
  shortcutKeyInput.addEventListener("input", (e) => {
    // Only allow single letter
    e.target.value = e.target.value
      .replace(/[^a-zA-Z]/g, "")
      .toUpperCase()
      .slice(0, 1);
    updateShortcutPreview();
  });

  shortcutKeyInput.addEventListener("change", saveSettings);
}

if (autoPageShortcutCtrlCheckbox) {
  autoPageShortcutCtrlCheckbox.addEventListener("change", () => {
    updateAutoPageShortcutPreview();
    void saveSettings();
  });
}

if (autoPageShortcutShiftCheckbox) {
  autoPageShortcutShiftCheckbox.addEventListener("change", () => {
    updateAutoPageShortcutPreview();
    void saveSettings();
  });
}

if (autoPageShortcutAltCheckbox) {
  autoPageShortcutAltCheckbox.addEventListener("change", () => {
    updateAutoPageShortcutPreview();
    void saveSettings();
  });
}

if (autoPageShortcutKeyInput) {
  autoPageShortcutKeyInput.addEventListener("input", (e) => {
    e.target.value = e.target.value
      .replace(/[^a-zA-Z]/g, "")
      .toUpperCase()
      .slice(0, 1);
    updateAutoPageShortcutPreview();
  });

  autoPageShortcutKeyInput.addEventListener("change", saveSettings);
}

document.querySelectorAll(".bt-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".bt-tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".bt-tab-content").forEach((c) => c.classList.remove("active"));

    tab.classList.add("active");
    const contentId = "tab-" + tab.dataset.tab;
    const contentEl = document.getElementById(contentId);
    if (contentEl) contentEl.classList.add("active");

    // Targeted scroll for the tabs container only to prevent horizontal UI shift
    const tabsContainer = document.querySelector(".bt-tabs");
    if (tabsContainer) {
      const tabOffsetLeft = tab.offsetLeft;
      const tabWidth = tab.offsetWidth;
      const containerWidth = tabsContainer.offsetWidth;
      tabsContainer.scrollTo({
        left: tabOffsetLeft - containerWidth / 2 + tabWidth / 2,
        behavior: "smooth",
      });
    }

    // Force reset horizontal scroll of the main wrap to prevent accidental shifting
    const wrap = document.querySelector(".bt-wrap");
    if (wrap) wrap.scrollLeft = 0;

    // Hide save button on translate and history tabs
    if (tab.dataset.tab === "translate" || tab.dataset.tab === "history") {
      saveBtn.style.display = "none";
    } else {
      // Only show if not in provider form
      if (providerForm.hidden && ttsProviderForm.hidden) {
        saveBtn.style.display = "block";
      }
    }

    if (tab.dataset.tab === "tools") {
      void updateExportButtonStatus();
    }
  });
});

// Segment/sub-tab listeners for History and Saved
const btnSubHistory = document.querySelector("#btn-sub-history");
const btnSubFavorites = document.querySelector("#btn-sub-favorites");
const panelHistory = document.querySelector("#panel-history");
const panelFavorites = document.querySelector("#panel-favorites");

if (btnSubHistory && btnSubFavorites && panelHistory && panelFavorites) {
  btnSubHistory.addEventListener("click", () => {
    btnSubHistory.classList.add("active");
    btnSubFavorites.classList.remove("active");
    panelHistory.style.display = "block";
    panelFavorites.style.display = "none";
  });

  btnSubFavorites.addEventListener("click", () => {
    btnSubFavorites.classList.add("active");
    btnSubHistory.classList.remove("active");
    panelFavorites.style.display = "block";
    panelHistory.style.display = "none";
  });
}

saveBtn.addEventListener("click", saveSettings);

// Character counter for custom prompt
function updateCharCounter() {
  if (promptCharCount && userCustomPrompt) {
    promptCharCount.textContent = userCustomPrompt.value.length;
  }
}

if (userCustomPrompt) {
  userCustomPrompt.addEventListener("input", () => {
    updateCharCounter();
    void saveSettings();
  });
}

// Hover Translate Event Listeners
if (hoverTranslateEnabled) {
  hoverTranslateEnabled.addEventListener("change", () => {
    hoverSettings.hidden = !hoverTranslateEnabled.checked;
    void saveSettings();
  });
}

// Auto-save for other hover settings
if (hoverUniqueMode) hoverUniqueMode.addEventListener("change", saveSettings);
if (hoverShowIcon) hoverShowIcon.addEventListener("change", saveSettings);
if (hoverUnderline) hoverUnderline.addEventListener("change", saveSettings);
if (hoverFontSize) hoverFontSize.addEventListener("change", saveSettings);
if (hoverTextColor) hoverTextColor.addEventListener("change", saveSettings);
if (hoverMode) hoverMode.addEventListener("change", saveSettings);
if (hoverGranularity) hoverGranularity.addEventListener("change", saveSettings);
if (hoverModifier) hoverModifier.addEventListener("change", saveSettings);
if (ocrEnabledCheckbox) ocrEnabledCheckbox.addEventListener("change", saveSettings);
if (btnOpenChromeShortcuts) {
  btnOpenChromeShortcuts.addEventListener("click", () => {
    chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  });
}

if (manageHoverDomains) {
  manageHoverDomains.addEventListener("click", () => {
    hoverDomainListSection.hidden = !hoverDomainListSection.hidden;
  });
}

if (addHoverDomain) {
  addHoverDomain.addEventListener("click", () => {
    const domain = newHoverDomain.value.trim();
    if (!domain) return;

    chrome.runtime.sendMessage({ type: "get-settings" }, (res) => {
      if (!res.ok) return;
      const settings = res.settings;

      // Initialize array if undefined
      if (!settings.hoverTranslateDomains) {
        settings.hoverTranslateDomains = [];
      }

      if (!settings.hoverTranslateDomains.find((d) => d.domain === domain)) {
        settings.hoverTranslateDomains.push({ domain, enabled: true });
        currentHoverDomains = settings.hoverTranslateDomains;
        chrome.runtime.sendMessage({ type: "set-settings", settings }, () => {
          renderHoverDomainList(settings.hoverTranslateDomains);
          newHoverDomain.value = "";
        });
      }
    });
  });
}

if (hoverShortcutCtrl && hoverShortcutShift && hoverShortcutAlt && hoverShortcutKey) {
  [hoverShortcutCtrl, hoverShortcutShift, hoverShortcutAlt, hoverShortcutKey].forEach((el) => {
    el.addEventListener("change", updateHoverShortcutPreview);
    el.addEventListener("input", updateHoverShortcutPreview);
  });
}

// Hover Translate Helper Functions
function updateHoverShortcutPreview() {
  if (!hoverShortcutPreview) return;
  const parts = [];
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;

  if (hoverShortcutCtrl?.checked) parts.push(isMac ? "Cmd" : "Ctrl");
  if (hoverShortcutShift?.checked) parts.push("Shift");
  if (hoverShortcutAlt?.checked) parts.push("Alt");
  parts.push(hoverShortcutKey?.value.toUpperCase() || "H");

  hoverShortcutPreview.textContent = parts.join("+");
}
// End of helper functions

function renderHoverDomainList(domains) {
  if (!hoverDomainList) return;
  if (hoverDomainCount) hoverDomainCount.textContent = domains.length;

  hoverDomainList.innerHTML = domains
    .map(
      (d, index) => `
    <div class="bt-domain-item">
      <div class="bt-domain-info"><span class="bt-domain-name">${d.domain}</span></div>
      <div class="bt-domain-actions">
        <label class="bt-domain-toggle">
          <input type="checkbox" ${d.enabled ? "checked" : ""} data-index="${index}" class="hover-domain-toggle">
          <span>Active</span>
        </label>
        <button class="bt-button-icon remove-hover-domain" data-index="${index}">×</button>
      </div>
    </div>
  `,
    )
    .join("");

  hoverDomainList.querySelectorAll(".hover-domain-toggle, .remove-hover-domain").forEach((el) => {
    el.addEventListener(el.classList.contains("remove-hover-domain") ? "click" : "change", (e) => {
      const idx = parseInt(e.target.dataset.index);
      chrome.runtime.sendMessage({ type: "get-settings" }, (res) => {
        const settings = res.settings;
        if (el.classList.contains("remove-hover-domain")) {
          settings.hoverTranslateDomains.splice(idx, 1);
        } else {
          settings.hoverTranslateDomains[idx].enabled = e.target.checked;
        }
        currentHoverDomains = settings.hoverTranslateDomains;
        chrome.runtime.sendMessage({ type: "set-settings", settings }, () => {
          if (el.classList.contains("remove-hover-domain")) renderHoverDomainList(settings.hoverTranslateDomains);
        });
      });
    });
  });
}

// Manual Page Translate Trigger
const btnTranslateNow = document.querySelector("#btn-translate-now");
if (btnTranslateNow) {
  btnTranslateNow.addEventListener("click", async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url || !tab.url.startsWith("http")) {
        showToast(i18n.t("toast.invalidPage") || "Cannot translate this page", "error");
        return;
      }

      try {
        await chrome.tabs.sendMessage(tab.id, { type: "trigger-page-translate" });
        window.close();
      } catch (err) {
        console.error("LinguaKit: Content script not responding", err);
        showToast(i18n.t("toast.refreshRequired") || "Please refresh the page to enable translation", "error");
      }
    } catch (err) {
      console.error("LinguaKit: Error triggering manual translate:", err);
    }
  });
}

// Export/Import Translation Data
if (btnExportJson) {
  btnExportJson.disabled = true; // Initially disabled
}

if (btnExportJson) {
  btnExportJson.addEventListener("click", async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url || !tab.url.startsWith("http")) {
        showToast(i18n.t("toast.invalidPage") || "Cannot perform this action on this page", "error");
        return;
      }

      const url = new URL(tab.url);
      const domain = url.hostname;

      const data = await chrome.storage.local.get("settings");
      const settings = data.settings || {};
      const targetLang = settings.targetLanguageCode || "en";

      // Request content script to capture and save first
      try {
        await chrome.tabs.sendMessage(tab.id, { type: "capture-page-cache" });
      } catch (msgErr) {
        console.warn("LinguaKit: Could not trigger capture (page not refreshed?)", msgErr);
      }

      const res = await chrome.runtime.sendMessage({
        type: "get-page-cache",
        payload: { domain, targetLang },
      });

      if (!res?.ok || !res.cache || Object.keys(res.cache).length === 0) {
        showToast(i18n.t("toast.noTranslationsExport") || "No translations found to export", "error");
        return;
      }

      const dataStr = JSON.stringify(res.cache, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `linguakit_${domain.replace(/\./g, "_")}_${targetLang}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);

      showToast(i18n.t("toast.exportSuccess") || "Exported successfully");
    } catch (err) {
      console.error("Export failed:", err);
      showToast(i18n.t("popup.exportFailed"), "error");
    }
  });
}

if (btnImportJson) {
  btnImportJson.addEventListener("click", () => {
    importFileInput.click();
  });
}

if (importFileInput) {
  importFileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url || !tab.url.startsWith("http")) {
        showToast(i18n.t("toast.invalidPage") || "Cannot perform this action on this page", "error");
        return;
      }

      const url = new URL(tab.url);
      const domain = url.hostname;

      const data = await chrome.storage.local.get("settings");
      const settings = data.settings || {};
      const targetLang = settings.targetLanguageCode || "en";

      const reader = new FileReader();
      reader.addEventListener("load", async (event) => {
        try {
          const cache = JSON.parse(event.target.result);
          if (typeof cache !== "object" || Array.isArray(cache)) {
            throw new Error("Invalid format");
          }

          await chrome.runtime.sendMessage({
            type: "set-page-cache",
            payload: { domain, targetLang, cache },
          });

          // Notify content script to apply immediately
          try {
            await chrome.tabs.sendMessage(tab.id, { type: "apply-page-cache", payload: { cache } });
          } catch (msgErr) {
            console.warn("LinguaKit: Could not notify content script (page not refreshed?)", msgErr);
          }

          showToast(i18n.t("toast.importSuccess") || "Imported successfully");
          e.target.value = ""; // Reset input
        } catch (err) {
          console.error("Import JSON parsing failed:", err);
          showToast(i18n.t("toast.importError") || "Import failed", "error");
        }
      });
      reader.readAsText(file);
    } catch (err) {
      console.error("Import failed:", err);
      showToast(i18n.t("popup.importFailed"), "error");
    }
  });
}

// Theme Selector logic and initialization
async function initTheme() {
  const themeToggle = document.querySelector("#theme-toggle");
  if (!themeToggle) return;

  const data = await chrome.storage.local.get("theme");
  const currentTheme = data.theme || "light";

  if (currentTheme === "dark") {
    document.body.classList.add("dark");
  } else {
    document.body.classList.remove("dark");
  }

  themeToggle.addEventListener("click", async () => {
    const isDark = document.body.classList.toggle("dark");
    const nextTheme = isDark ? "dark" : "light";
    await chrome.storage.local.set({ theme: nextTheme });
  });
}

void loadSettings();
displayVersion();
void loadHistory();
void initTheme();

async function updateExportButtonStatus() {
  if (!btnExportJson) return;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || !tab.url || !tab.url.startsWith("http")) {
      btnExportJson.disabled = true;
      btnExportJson.title = "Not available on this page";
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, { type: "get-page-cache-status" });
    if (response && response.isCacheReady) {
      btnExportJson.disabled = false;
      btnExportJson.title = "";
    } else {
      btnExportJson.disabled = true;
      btnExportJson.title = "Waiting for translations to be cached...";
    }
  } catch (err) {
    console.warn("LinguaKit: Could not check cache status", err);
    btnExportJson.disabled = true;
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "page-cache-status-updated") {
    if (message.isCacheReady) {
      if (btnExportJson) {
        btnExportJson.disabled = false;
        btnExportJson.title = "";
      }
    }
  }
});

// Clear errors when typing
document.addEventListener("input", (e) => {
  if (e.target.classList.contains("bt-input")) {
    e.target.classList.remove("error");
  }
});

// --- Translate Tab Controller ---

const translateSourceLang = document.querySelector("#translate-source-lang");
const translateSourceText = document.querySelector("#translate-source-text");
const translateClearBtn = document.querySelector("#translate-clear-btn");
const translateSwapBtn = document.querySelector("#translate-swap-btn");
const translateTargetLang = document.querySelector("#translate-target-lang");
const translateTargetText = document.querySelector("#translate-target-text");
const translateLoader = document.querySelector("#translate-loader");
const translateTargetActions = document.querySelector("#translate-target-actions");
const translateCopyBtn = document.querySelector("#translate-copy-btn");
const translateTtsBtn = document.querySelector("#translate-tts-btn");
const translateStatusMessage = document.querySelector("#translate-status-message");

let translateDebounceTimeout = null;
let lastDetectedLang = null;

function populateTranslateSelects() {
  if (!translateSourceLang || !translateTargetLang) return;

  const sourceOptions = [
    `<option value="auto">${i18n.t("popup.detectLanguage") || "Detect language"}</option>`,
    ...LANGUAGES.map((l) => `<option value="${l.code}">${i18n.t("lang." + l.code) || l.name} (${l.code})</option>`),
  ].join("");

  const targetOptions = LANGUAGES.map(
    (l) => `<option value="${l.code}">${i18n.t("lang." + l.code) || l.name} (${l.code})</option>`,
  ).join("");

  translateSourceLang.innerHTML = sourceOptions;
  translateTargetLang.innerHTML = targetOptions;
}

function updateClearBtnVisibility() {
  if (translateClearBtn && translateSourceText) {
    translateClearBtn.style.display = translateSourceText.value ? "flex" : "none";
  }
}

function updateTargetActionsVisibility() {
  if (translateTargetActions && translateTargetText) {
    translateTargetActions.style.display = translateTargetText.value.trim() ? "flex" : "none";
  }
}

async function saveTranslateState() {
  if (!translateSourceText || !translateTargetText) return;
  const state = {
    sourceText: translateSourceText.value,
    targetText: translateTargetText.value,
    lastDetectedLang,
  };
  await chrome.storage.local.set({ translateTabState: state });
}

async function loadTranslateState() {
  if (!translateSourceLang || !translateTargetLang || !translateSourceText || !translateTargetText) return;

  const data = await chrome.storage.local.get(["translateTabState", "translatorSettings"]);
  const state = data.translateTabState || {
    sourceText: "",
    targetText: "",
    lastDetectedLang: null,
  };

  const globalSettings = data.translatorSettings || {};
  const nativeVal = globalSettings.nativeLanguageCode || "vi";
  const targetVal = globalSettings.targetLanguageCode || "en";
  const autoDetectVal = globalSettings.useAutoDetect === true;

  translateTargetLang.value = targetVal;
  if (autoDetectVal) {
    translateSourceLang.value = "auto";
  } else {
    translateSourceLang.value = nativeVal;
  }

  translateSourceText.value = state.sourceText || "";
  translateTargetText.value = state.targetText || "";
  lastDetectedLang = state.lastDetectedLang || null;

  updateClearBtnVisibility();
  updateTargetActionsVisibility();

  // If there is text and source Lang was auto, and we had a detected lang, restore the auto label
  if (state.sourceText && autoDetectVal && lastDetectedLang) {
    const autoOption = translateSourceLang.querySelector('option[value="auto"]');
    if (autoOption) {
      const langName = LANGUAGES.find((l) => l.code === lastDetectedLang)?.name || lastDetectedLang;
      const localizedLangName = i18n.t("lang." + lastDetectedLang) || langName;
      const label = i18n.t("popup.detectedLanguageLabel") || "{lang} - Detected";
      autoOption.textContent = label.replace("{lang}", localizedLangName);
    }
  }

  // If sourceText is not empty, run translation to refresh or keep it synced
  if (translateSourceText.value.trim()) {
    triggerTranslationImmediate();
  }
}

function clearSourceText() {
  if (translateSourceText) {
    translateSourceText.value = "";
    updateClearBtnVisibility();
    triggerTranslationImmediate();
  }
}

function copyTranslation() {
  if (translateTargetText && translateTargetText.value) {
    void copyToClipboard(translateTargetText.value);
  }
}

function playTranslationTTS() {
  if (translateTargetText && translateTargetText.value && translateTargetLang) {
    const text = translateTargetText.value;
    const lang = translateTargetLang.value;
    void tts.play(text, lang);
  }
}

/**
 * Swaps the source language value, target language value, and input text content. Triggering immediate re-translation
 * if text content is present.
 *
 * @function swapLanguages
 * @returns {void}
 */
function swapLanguages() {
  if (!translateSourceLang || !translateTargetLang || !translateSourceText || !translateTargetText) return;

  if (translateSwapBtn) {
    translateSwapBtn.classList.add("rotating");
    translateSwapBtn.addEventListener(
      "transitionend",
      () => {
        translateSwapBtn.classList.remove("rotating");
      },
      { once: true },
    );
  }

  let src = translateSourceLang.value;
  let dst = translateTargetLang.value;

  if (src === "auto") {
    src = dst;
    dst = lastDetectedLang || "vi";
    if (src === dst) {
      dst = "en";
    }
  } else {
    const temp = src;
    src = dst;
    dst = temp;
  }

  translateSourceLang.value = src;
  translateTargetLang.value = dst;

  // Swap texts
  const srcText = translateSourceText.value;
  const dstText = translateTargetText.value;

  translateSourceText.value = dstText;
  translateTargetText.value = srcText;

  updateClearBtnVisibility();
  updateTargetActionsVisibility();

  void updateGlobalLanguageSettings({
    nativeLanguageCode: src,
    targetLanguageCode: dst,
    useAutoDetect: false,
  });

  if (translateSourceText.value.trim()) {
    triggerTranslationImmediate();
  } else {
    translateTargetText.value = "";
    updateTargetActionsVisibility();
  }
}

/**
 * Sends the input text in the translator sandbox to the background worker API for processing, manages loading
 * indicators, displays the result, and stores state parameters.
 *
 * @async
 * @function triggerTranslation
 * @returns {Promise<void>}
 */
async function triggerTranslation() {
  if (
    !translateSourceText ||
    !translateTargetText ||
    !translateSourceLang ||
    !translateTargetLang ||
    !translateLoader ||
    !translateTargetActions ||
    !translateStatusMessage
  )
    return;

  const text = translateSourceText.value;

  if (!text || !text.trim()) {
    translateTargetText.value = "";
    translateLoader.style.display = "none";
    translateTargetActions.style.display = "none";
    translateStatusMessage.style.display = "none";
    translateStatusMessage.textContent = "";

    const autoOption = translateSourceLang.querySelector('option[value="auto"]');
    if (autoOption) {
      autoOption.textContent = i18n.t("popup.detectLanguage") || "Detect language";
    }

    void saveTranslateState();
    return;
  }

  // Show loader overlay
  translateLoader.style.display = "flex";
  translateTargetActions.style.display = "none";
  translateStatusMessage.style.display = "none";

  try {
    const response = await chrome.runtime.sendMessage({
      type: "translate",
      payload: {
        text: text.trim(),
        sourceLanguage: translateSourceLang.value,
        targetLanguage: translateTargetLang.value,
      },
    });

    if (response && response.ok && response.result) {
      const result = response.result;
      translateTargetText.value = result.translation || "";

      // Handle detected source language label
      if (translateSourceLang.value === "auto" && result.detectedSourceLanguage) {
        lastDetectedLang = result.detectedSourceLanguage;
        const autoOption = translateSourceLang.querySelector('option[value="auto"]');
        if (autoOption) {
          const langCode = result.detectedSourceLanguage;
          const langName = LANGUAGES.find((l) => l.code === langCode)?.name || langCode;
          const localizedLangName = i18n.t("lang." + langCode) || langName;
          const label = i18n.t("popup.detectedLanguageLabel") || "{lang} - Detected";
          autoOption.textContent = label.replace("{lang}", localizedLangName);
        }
      } else {
        const autoOption = translateSourceLang.querySelector('option[value="auto"]');
        if (autoOption) {
          autoOption.textContent = i18n.t("popup.detectLanguage") || "Detect language";
        }
      }

      translateTargetActions.style.display = "flex";
    } else {
      const errMsg = response?.error || i18n.t("popup.errorTranslating") || "Translation failed.";
      translateStatusMessage.textContent = errMsg;
      translateStatusMessage.style.display = "block";
    }
  } catch (err) {
    console.error("Translation error in Translate tab:", err);
    translateStatusMessage.textContent = i18n.t("popup.errorTranslating") || "Translation failed.";
    translateStatusMessage.style.display = "block";
  } finally {
    translateLoader.style.display = "none";
    void saveTranslateState();
  }
}

/**
 * Automatically translates the text input value, throttled with a 400ms debounce to prevent excessive API quota calls
 * while typing.
 *
 * @function debouncedTranslate
 * @returns {void}
 */
function debouncedTranslate() {
  clearTimeout(translateDebounceTimeout);
  updateClearBtnVisibility();

  if (!translateSourceText.value.trim()) {
    triggerTranslationImmediate();
    return;
  }

  translateDebounceTimeout = setTimeout(() => {
    void triggerTranslation();
  }, 400); // 400ms debounce
}

/**
 * Cancels active typing timeouts and instantly fires a translation query.
 *
 * @function triggerTranslationImmediate
 * @returns {void}
 */
function triggerTranslationImmediate() {
  clearTimeout(translateDebounceTimeout);
  void triggerTranslation();
}

/**
 * Initializes translator tab listeners, populates language options, and recovers cached textbox values.
 *
 * @function initTranslateTab
 * @returns {void}
 */
function initTranslateTab() {
  populateTranslateSelects();

  if (translateSourceText) {
    translateSourceText.addEventListener("input", debouncedTranslate);
  }

  if (translateSourceLang) {
    translateSourceLang.addEventListener("change", () => {
      const isAuto = translateSourceLang.value === "auto";
      const update = { useAutoDetect: isAuto };
      if (!isAuto) {
        update.nativeLanguageCode = translateSourceLang.value;
      }
      void updateGlobalLanguageSettings(update);
    });
  }

  if (translateTargetLang) {
    translateTargetLang.addEventListener("change", () => {
      void updateGlobalLanguageSettings({ targetLanguageCode: translateTargetLang.value });
    });
  }

  if (translateSwapBtn) {
    translateSwapBtn.addEventListener("click", swapLanguages);
  }

  if (translateClearBtn) {
    translateClearBtn.addEventListener("click", clearSourceText);
  }

  if (translateCopyBtn) {
    translateCopyBtn.addEventListener("click", copyTranslation);
  }

  if (translateTtsBtn) {
    translateTtsBtn.addEventListener("click", playTranslationTTS);
  }

  void loadTranslateState();
}

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "local" && changes.translatorSettings) {
    const nextSettings = changes.translatorSettings.newValue;
    const prevSettings = changes.translatorSettings.oldValue || {};
    if (nextSettings) {
      const langChanged =
        nextSettings.nativeLanguageCode !== prevSettings.nativeLanguageCode ||
        nextSettings.targetLanguageCode !== prevSettings.targetLanguageCode ||
        nextSettings.useAutoDetect !== prevSettings.useAutoDetect ||
        nextSettings.activeProviderId !== prevSettings.activeProviderId;

      if (langChanged) {
        syncLanguageElements(nextSettings);
        if (translateSourceText && translateSourceText.value.trim()) {
          triggerTranslationImmediate();
        }
      }
    }
  }
});
