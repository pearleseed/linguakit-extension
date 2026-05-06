import { i18n } from "./common/i18n.js";

const enabledCheckbox = document.querySelector("#enabled");
const settingsContainer = document.querySelector("#settings-container");
const nativeSelect = document.querySelector("#native");
const targetSelect = document.querySelector("#target");

const autoDetect = document.querySelector("#auto-detect");
const confirmModal = document.querySelector("#confirm-modal");
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

let currentAliases = {};
let currentDomains = [];
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

function translateUI() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.innerHTML = i18n.t(el.getAttribute("data-i18n"));
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.setAttribute("placeholder", i18n.t(el.getAttribute("data-i18n-placeholder")));
  });

  saveBtn.textContent = i18n.t(
    saveBtn.textContent.includes("✅") ? "popup.saved" : "popup.savePreferences",
  );
}

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

// Display version in header
function displayVersion() {
  const manifest = chrome.runtime.getManifest();
  const versionEl = document.getElementById("version-display");
  if (versionEl && manifest.version) {
    versionEl.textContent = `v${manifest.version}`;
  }
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(i18n.t("popup.copied"), "success");
  } catch (err) {
    console.error("Failed to copy:", err);
    showToast("Failed to copy", "error");
  }
}

function populateSelects() {
  const options = LANGUAGES.map(
    (l) => `<option value="${l.code}">${i18n.t("lang." + l.code) || l.name} (${l.code})</option>`,
  ).join("");

  [nativeSelect, targetSelect].forEach((select) => {
    const val = select.value;
    select.innerHTML = options;
    if (val) select.value = val;
  });
}

function renderAliases() {
  aliasListEl.innerHTML = "";
  Object.entries(currentAliases).forEach(([key, value]) => {
    const item = document.createElement("div");
    item.className = "bt-alias-item";
    item.innerHTML = `
      <span><b>${key}</b> → ${value}</span>
      <button data-key="${key}" class="bt-remove-alias">×</button>
    `;
    aliasListEl.appendChild(item);
  });

  document.querySelectorAll(".bt-remove-alias").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const key = e.target.dataset.key;
      delete currentAliases[key];
      renderAliases();
      saveSettings();
    });
  });
}

function renderHistoryList(history) {
  if (!historyListEl) return;
  if (!history || history.length === 0) {
    historyListEl.innerHTML = `<div class="bt-empty-state">${i18n.t("popup.noHistory")}</div>`;
    return;
  }

  historyListEl.innerHTML = history
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

  // Attach events
  historyListEl.querySelectorAll(".btn-favorite").forEach((btn) => {
    btn.addEventListener("click", (_e) => toggleFavorite(btn.dataset.id));
  });

  historyListEl.querySelectorAll(".btn-copy-history").forEach((btn) => {
    btn.addEventListener("click", (_e) => {
      const id = btn.dataset.id;
      const item = enrichedHistory.find((h) => h.id === id);
      if (item) copyToClipboard(item.target);
    });
  });

  historyListEl.querySelectorAll(".btn-delete-history").forEach((btn) => {
    btn.addEventListener("click", (_e) => deleteHistoryItem(btn.dataset.id));
  });
}

let enrichedHistory = [];
async function loadHistory() {
  const data = await chrome.storage.local.get(["translationHistory", "favorites"]);
  const history = data.translationHistory || [];
  const favorites = data.favorites || [];

  // Mark history items that are in favorites
  enrichedHistory = history.map((h) => ({
    ...h,
    isFavorite: favorites.some((f) => f.source === h.source && f.target === h.target),
  }));

  renderHistoryList(enrichedHistory);
  renderFavoritesList(favorites);
}

function renderFavoritesList(favorites) {
  if (!favoritesListEl) return;
  if (!favorites || favorites.length === 0) {
    favoritesListEl.innerHTML = `<div class="bt-empty-state">${i18n.t("popup.noFavorites")}</div>`;
    return;
  }

  favoritesListEl.innerHTML = favorites
    .map(
      (item) => `
    <div class="bt-history-item">
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

  favoritesListEl.querySelectorAll(".btn-copy-favorite").forEach((btn) => {
    btn.addEventListener("click", (_e) => {
      const id = btn.dataset.id;
      const item = favorites.find((f) => f.id === id);
      if (item) copyToClipboard(item.target);
    });
  });

  favoritesListEl.querySelectorAll(".btn-remove-favorite").forEach((btn) => {
    btn.addEventListener("click", (_e) => removeFavorite(btn.dataset.id));
  });
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
  loadHistory();
}

async function deleteHistoryItem(id) {
  const data = await chrome.storage.local.get("translationHistory");
  let history = data.translationHistory || [];
  history = history.filter((h) => h.id !== id);
  await chrome.storage.local.set({ translationHistory: history });
  loadHistory();
}

async function removeFavorite(id) {
  const data = await chrome.storage.local.get("favorites");
  let favorites = data.favorites || [];
  favorites = favorites.filter((f) => f.id !== id);
  await chrome.storage.local.set({ favorites });
  loadHistory();
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
      saveSettings();
    });
  });
}

function renderProviderList() {
  providerListEl.innerHTML = "";

  // Define default provider IDs that cannot be edited or deleted
  const DEFAULT_PROVIDER_IDS = ["google-translate"];

  providers.forEach((p) => {
    const isActive = p.id === activeProviderId;
    const isDefaultProvider = DEFAULT_PROVIDER_IDS.includes(p.id);

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
      saveSettings();
    });
  });

  providerListEl.querySelectorAll(".btn-delete").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      if (confirm("Delete this provider?")) {
        providers = providers.filter((p) => p.id !== e.target.dataset.id);
        if (activeProviderId === e.target.dataset.id) {
          activeProviderId = "google-translate";
        }
        renderProviderList();
        saveSettings();
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

  // Security Note
  formDynamicFields.insertAdjacentHTML(
    "beforeend",
    `
    <div class="bt-security-note">
      <span class="bt-icon-shield">🛡️</span> ${i18n.t("popup.securityNote")}
    </div>
  `,
  );
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
      showToast("Please fill in all required fields", "error");
      return;
    }
  }

  if (editingProviderId) {
    // Update
    const idx = providers.findIndex((p) => p.id === editingProviderId);
    if (idx !== -1) {
      providers[idx].name = name;
      providers[idx].config = config;
      showToast("Provider updated successfully", "success");
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
    showToast("Provider added successfully", "success");
  }

  saveSettings();
  renderProviderList();
  closeProviderForm();
}

// Event Listeners for Form
btnAddProvider.addEventListener("click", () => openProviderForm(null));
btnFormCancel.addEventListener("click", closeProviderForm);
btnFormSave.addEventListener("click", saveProviderFromForm);
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
      saveSettings();
    });
  });

  ttsProviderListEl.querySelectorAll(".btn-delete-tts").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      if (confirm("Delete this TTS provider?")) {
        ttsProviders = ttsProviders.filter((p) => p.id !== e.target.dataset.id);
        if (activeTTSProviderId === e.target.dataset.id) {
          activeTTSProviderId = "google-tts";
        }
        renderTTSProviderList();
        saveSettings();
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
  ttsFormTitle.textContent = provider ? "Edit TTS Provider" : "Add TTS Provider";
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
    alert("URL Template is required");
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

  saveSettings();
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

  shortcutPreview.textContent = `${shortcut} (${macShortcut} on Mac)`;
}

async function loadSettings() {
  const res = await chrome.runtime.sendMessage({ type: "get-settings" });

  populateSelects();

  if (res?.ok) {
    enabledCheckbox.checked = res.settings.enabled !== false;
    nativeSelect.value = res.settings.nativeLanguageCode || "vi";
    targetSelect.value = res.settings.targetLanguageCode || "en";

    const oldValue = res.settings.preferNativeAsSource;
    const newValue = res.settings.useAutoDetect;
    if (newValue === undefined && oldValue !== undefined) {
      autoDetect.checked = !oldValue;
    } else {
      autoDetect.checked = newValue === true;
    }

    confirmModal.checked = res.settings.showConfirmModal !== false;
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
      ctrl: true,
      shift: true,
      alt: false,
    };
    if (shortcutCtrlCheckbox) shortcutCtrlCheckbox.checked = shortcut.ctrl;
    if (shortcutShiftCheckbox) shortcutShiftCheckbox.checked = shortcut.shift;
    if (shortcutAltCheckbox) shortcutAltCheckbox.checked = shortcut.alt;
    if (shortcutKeyInput) shortcutKeyInput.value = shortcut.key.toUpperCase();
    updateShortcutPreview();

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
      ctrl: true,
      shift: true,
      alt: false,
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
    nativeSelect.value = "vi";
    targetSelect.value = "en";
    autoDetect.checked = false; // Default: fixed direction
    confirmModal.checked = true;
    currentAliases = {};

    updateLangToggleUI("en");
    i18n.setLanguage("en");
    populateSelects();
    translateUI();

    if (instantEnabledCheckbox) instantEnabledCheckbox.checked = false;
    if (instantDelayInput) instantDelayInput.value = 3;
    currentDomains = [];

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
    if (shortcutCtrlCheckbox) shortcutCtrlCheckbox.checked = true;
    if (shortcutShiftCheckbox) shortcutShiftCheckbox.checked = true;
    if (shortcutAltCheckbox) shortcutAltCheckbox.checked = false;
    if (shortcutKeyInput) shortcutKeyInput.value = "I";
    updateShortcutPreview();
  }

  renderAliases();
  renderDomains();
  renderProviderList();
  renderTTSProviderList();
  updateSettingsVisibility();
  toggleInstantSettings();
}

async function saveSettings() {
  const settings = {
    enabled: enabledCheckbox.checked,
    nativeLanguageCode: nativeSelect.value,
    targetLanguageCode: targetSelect.value,
    useAutoDetect: autoDetect.checked,
    showConfirmModal: confirmModal.checked,
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
    saveSettings();
    showToast("Alias added successfully", "success");
  } else {
    showToast("Please fill in both Alias key and value", "error");
    if (!key) aliasKeyInput.classList.add("error");
    if (!value) aliasValueInput.classList.add("error");
  }
});

enabledCheckbox.addEventListener("change", () => {
  updateSettingsVisibility();
  saveSettings();
});

nativeSelect.addEventListener("change", saveSettings);
targetSelect.addEventListener("change", saveSettings);

autoDetect.addEventListener("change", saveSettings);
confirmModal.addEventListener("change", saveSettings);

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
    saveSettings();
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
    saveSettings();
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
      saveSettings();
      showToast("Domain added successfully", "success");
    } else if (!domain) {
      showToast("Please enter a domain name", "error");
      newDomainInput.classList.add("error");
    } else {
      showToast("Domain already exists", "error");
    }
  });
}

// Keyboard Shortcut Event Listeners
if (shortcutCtrlCheckbox) {
  shortcutCtrlCheckbox.addEventListener("change", () => {
    updateShortcutPreview();
    saveSettings();
  });
}

if (shortcutShiftCheckbox) {
  shortcutShiftCheckbox.addEventListener("change", () => {
    updateShortcutPreview();
    saveSettings();
  });
}

if (shortcutAltCheckbox) {
  shortcutAltCheckbox.addEventListener("change", () => {
    updateShortcutPreview();
    saveSettings();
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

document.querySelectorAll(".bt-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".bt-tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".bt-tab-content").forEach((c) => c.classList.remove("active"));

    tab.classList.add("active");
    const contentId = "tab-" + tab.dataset.tab;
    const contentEl = document.getElementById(contentId);
    if (contentEl) contentEl.classList.add("active");

    // Hide save button on help tab
    if (tab.dataset.tab === "help") {
      saveBtn.style.display = "none";
    } else {
      // Only show if not in provider form
      if (providerForm.hidden && ttsProviderForm.hidden) {
        saveBtn.style.display = "block";
      }
    }
  });
});

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
    saveSettings();
  });
}

// Hover Translate Event Listeners
if (hoverTranslateEnabled) {
  hoverTranslateEnabled.addEventListener("change", () => {
    hoverSettings.hidden = !hoverTranslateEnabled.checked;
    saveSettings();
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
          if (el.classList.contains("remove-hover-domain"))
            renderHoverDomainList(settings.hoverTranslateDomains);
        });
      });
    });
  });
}

loadSettings();
displayVersion();
loadHistory();

// Clear errors when typing
document.addEventListener("input", (e) => {
  if (e.target.classList.contains("bt-input")) {
    e.target.classList.remove("error");
  }
});
