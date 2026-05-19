/**
 * LinguaKit Main Content Script. Runs in the ISOLATED world context of loaded webpages. Manages textbox editing
 * detectors (supporting standard textareas, input fields, and rich-text environments such as Facebook Lexical and
 * Draft.js), listens to instant translation shortcut hotkeys, registers selection and hover modes, injects custom popup
 * wrappers, and handles offline page snapshot rendering.
 *
 * @file Content-script.js
 */

let normalizeLanguageToCode;
let i18n;
let tts;

/**
 * Regex pattern matching terminal-like translation commands typed at the end of input fields (e.g. '!!en').
 *
 * @constant {RegExp} TRANSLATION_COMMAND_PATTERN
 */
const TRANSLATION_COMMAND_PATTERN = /!!([a-zA-ZÀ-ÿ-]+)$/i;

let isTranslating = false;
let debounceTimer = null;

// Instant translate state
let instantTimer = null;
let currentSuggestion = null;
let justAppliedTranslation = false;
let currentKeyHandler = null; // Track active keyboard handler
let isIMEComposing = false; // Track if IME composition is active

// Select-to-translate state
let selectionIcon = null;
let selectionPopup = null;
let selectedText = "";

/**
 * Verifies if the script runs in the window's main top-level context (excluding iframes).
 *
 * @function isTopFrame
 * @returns {boolean} True if in top frame, false if embedded in iframe.
 */
function isTopFrame() {
  try {
    return window.top === window;
  } catch {
    return false;
  }
}

// Global error handler for extension context invalidation
window.addEventListener("error", (event) => {
  if (
    event.error &&
    event.error.message &&
    (event.error.message.includes("Extension context invalidated") ||
      event.error.message.includes("Could not establish connection") ||
      event.error.message.includes("receiving end does not exist"))
  ) {
    console.log("LinguaKit: Caught global extension context invalidation error");
    cleanupExtensionElements();
    event.preventDefault(); // Prevent the error from being logged to console
  }
});

// Global unhandled promise rejection handler
window.addEventListener("unhandledrejection", (event) => {
  if (
    event.reason &&
    event.reason.message &&
    (event.reason.message.includes("Extension context invalidated") ||
      event.reason.message.includes("Could not establish connection") ||
      event.reason.message.includes("receiving end does not exist"))
  ) {
    console.log("LinguaKit: Caught unhandled promise rejection for extension context invalidation");
    cleanupExtensionElements();
    event.preventDefault(); // Prevent the error from being logged to console
  }
});

/**
 * Self-invoking extension bootstrap orchestrator. Dynamically imports language normalization utilities, i18n
 * configurations, and TTS clients, binds listener channels, and initializes styling elements.
 */
void (async function bootstrap() {
  try {
    if (!isExtensionContextValid()) {
      console.log("LinguaKit: Extension context not available during bootstrap");
      return;
    }

    // Wrap all chrome.runtime calls in try-catch
    let mod, i18nMod, ttsMod;
    try {
      mod = await import(chrome.runtime.getURL("src/common/language-map.js"));
      normalizeLanguageToCode = mod.normalizeLanguageToCode;

      i18nMod = await import(chrome.runtime.getURL("src/common/i18n.js"));
      i18n = i18nMod.i18n;

      ttsMod = await import(chrome.runtime.getURL("src/services/tts.js"));
      tts = ttsMod.tts;
    } catch (importError) {
      if (
        importError.message.includes("Extension context invalidated") ||
        importError.message.includes("Could not establish connection")
      ) {
        console.log("LinguaKit: Extension context invalidated during import");
        cleanupExtensionElements();
        return;
      }
      throw importError;
    }

    // Initialize i18n with current settings
    getSettings()
      .then((settings) => {
        if (settings.interfaceLanguage) {
          i18n.setLanguage(settings.interfaceLanguage);
        }
      })
      .catch((err) => {
        console.error("LinguaKit: Error initializing i18n:", err.message);
      });

    // Listen for setting changes
    try {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === "trigger-page-translate") {
          void getSettings().then((settings) => {
            void autoTranslatePage(settings, true); // Always learn for manual trigger
            sendResponse({ ok: true });
          });
          return true;
        }

        if (message.type === "capture-page-cache") {
          void getSettings().then((settings) => {
            const domain = window.location.hostname;
            const targetLang = settings.targetLanguageCode || "en";
            if (originalTexts.length > 0) {
              void captureAndSavePageCache(domain, targetLang, true).then(() => {
                sendResponse({ ok: true });
              });
            } else {
              sendResponse({ ok: false, error: "No snapshot" });
            }
          });
          return true;
        }

        if (message.type === "apply-page-cache") {
          if (message.payload && message.payload.cache) {
            void applyPageCache(message.payload.cache).then(() => {
              sendResponse({ ok: true });
            });
          }
          return true;
        }

        if (message.type === "get-page-cache-status") {
          sendResponse({ isCacheReady: isPageCached });
          return true;
        }

        return false;
      });

      chrome.storage.onChanged.addListener(async (changes, namespace) => {
        if (namespace === "local" && changes.translatorSettings) {
          const newSettings = changes.translatorSettings.newValue;
          const oldSettings = changes.translatorSettings.oldValue || {};

          if (newSettings) {
            // Update UI language
            if (newSettings.interfaceLanguage) {
              i18n.setLanguage(newSettings.interfaceLanguage);
            }

            // Check if language settings or auto-detect settings changed
            const langSettingsChanged =
              newSettings.nativeLanguageCode !== oldSettings.nativeLanguageCode ||
              newSettings.targetLanguageCode !== oldSettings.targetLanguageCode ||
              newSettings.useAutoDetect !== oldSettings.useAutoDetect ||
              newSettings.activeProviderId !== oldSettings.activeProviderId;

            // Trigger Auto Page Translate if enabled and active on domain
            const isAutoPageNow = isAutoPageTranslateDomain(newSettings);
            const wasAutoPageBefore = isAutoPageTranslateDomain(oldSettings);

            if (isAutoPageNow && (!wasAutoPageBefore || langSettingsChanged)) {
              // Clear cache and re-trigger Google Page Translation to the new target language
              await autoTranslatePage(newSettings, true);
            }

            // Sync and re-translate active suggestion popup (currentSuggestion)
            if (currentSuggestion && langSettingsChanged) {
              const targetSelect = currentSuggestion.element.querySelector(".bt-suggestion-target-select");
              const sourceSelect = currentSuggestion.element.querySelector(".bt-suggestion-source-select");
              const providerSelect = currentSuggestion.element.querySelector(".bt-suggestion-provider-select");

              const activeTarget = newSettings.targetLanguageCode || "en";
              const activeSource = newSettings.useAutoDetect ? "auto" : newSettings.nativeLanguageCode || "en";
              const activeProvider = newSettings.activeProviderId || "google-translate";

              if (targetSelect) targetSelect.value = activeTarget;
              if (sourceSelect) sourceSelect.value = activeSource;
              if (providerSelect) providerSelect.value = activeProvider;

              void reTranslateSuggestion(
                currentSuggestion.inputElement,
                currentSuggestion.sourceText,
                activeProvider,
                newSettings,
                activeTarget,
                activeSource,
                currentSuggestion,
              );
            }

            // Sync and re-translate active selection popup (selectionPopup)
            if (selectionPopup && langSettingsChanged) {
              const targetSelect = selectionPopup.querySelector(".bt-selection-target-select");
              const sourceSelect = selectionPopup.querySelector(".bt-selection-source-select");
              const providerSelect = selectionPopup.querySelector(".bt-selection-provider-select");

              const activeTarget = newSettings.targetLanguageCode || "en";
              const activeSource = newSettings.useAutoDetect ? "auto" : newSettings.nativeLanguageCode || "en";
              const activeProvider = newSettings.activeProviderId || "google-translate";

              if (targetSelect) targetSelect.value = activeTarget;
              if (sourceSelect) sourceSelect.value = activeSource;
              if (providerSelect) providerSelect.value = activeProvider;

              void translateSelectionWithSource(
                selectionPopup.originalText,
                activeSource,
                selectionPopup,
                activeProvider,
                activeTarget,
                selectionPopup.activeTask || "translate",
              );
            }

            // Clear legacy/outdated hover translation elements to prevent conflicting translation displays
            if (langSettingsChanged) {
              document.querySelectorAll(".bt-hover-translation").forEach((el) => el.remove());
            }

            // Update Right-Click & Selection Unlocker status dynamically
            if (newSettings && typeof newSettings.rightClickUnlockerEnabled !== "undefined") {
              isUnlockerActive = newSettings.rightClickUnlockerEnabled === true;
              applyRightClickUnlockerCSS(isUnlockerActive);
            }
          }
        }
      });
    } catch (storageError) {
      console.error("LinguaKit: Error setting up storage listener:", storageError.message);
    }

    injectGlobalStylesheet();
    registerAutoDetection();
    registerInstantMode();
    void registerAutoPageTranslate();
    registerSelectionMode();
    registerToggleShortcuts();
    registerInstantLabelIndicator();
    registerHoverTranslate();
    // registerHoverToggleShortcut();
    registerRightClickUnlocker();

    // Message listener for background script communications
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === "show-toast") {
        const { message: toastMsg, type: _type } = message.payload;
        showToast(toastMsg);
        sendResponse({ ok: true });
        return true;
      }

      if (message.type === "initiate-ocr-crop") {
        const { screenshotUrl } = message.payload;
        startOcrCrop(screenshotUrl);
        sendResponse({ ok: true });
        return true;
      }

      return false;
    });
  } catch (error) {
    console.error("LinguaKit: Bootstrap failed:", error.message);
    if (
      error.message.includes("Extension context invalidated") ||
      error.message.includes("Could not establish connection")
    ) {
      // Extension was reloaded, clean up and exit gracefully
      cleanupExtensionElements();
    }
  }
})();

/**
 * Dynamically appends dialog layouts and spinner styles stylesheet link elements onto webpage headers.
 *
 * @function injectGlobalStylesheet
 * @returns {void}
 */
function injectGlobalStylesheet() {
  try {
    if (!isExtensionContextValid()) {
      return;
    }

    const href = chrome.runtime.getURL("assets/styles/dialogs.css");
    if (![...document.styleSheets].some((s) => s.href === href)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
    }
  } catch (error) {
    console.error("LinguaKit: Error injecting stylesheet:", error.message);
    if (
      error.message.includes("Extension context invalidated") ||
      error.message.includes("Could not establish connection")
    ) {
      cleanupExtensionElements();
    }
  }
}

/**
 * Determines if a webpage element supports interactive text editing capabilities. Checks for standard input tag
 * configurations, textareas, and general contenteditable attributes.
 *
 * @function isEditableElement
 * @param {Element} element - The target webpage element.
 * @returns {boolean} True if editable, false otherwise.
 */
function isEditableElement(element) {
  if (!element) return false;

  const tag = element.tagName?.toLowerCase();

  if (tag === "input") {
    const type = element.getAttribute("type") || "text";
    return ["text", "search", "email", "url", "tel", "password"].includes(type) || !type;
  }

  if (tag === "textarea") return true;
  if (element.isContentEditable) return true;

  return false;
}

/**
 * Helper utility to traverse shadow DOM containers recursively to find the exact, active element.
 *
 * @function getDeepActiveElement
 * @param {Document | ShadowRoot} [root=document] - Active DOM root layer. Default is `document`
 * @returns {Element | null} The resolved deep active element.
 */
function getDeepActiveElement(root = document) {
  let element = root.activeElement || null;
  while (element?.shadowRoot?.activeElement) {
    element = element.shadowRoot.activeElement;
  }
  return element;
}

/**
 * Returns the deeply nested active element if and only if it is editable.
 *
 * @function getActiveEditableElement
 * @returns {Element | null} The editable element, or null.
 */
function getActiveEditableElement() {
  const element = getDeepActiveElement();
  return isEditableElement(element) ? element : null;
}

/**
 * Parses the contents of an editable input field to locate inline terminal commands matching the pattern '!!{lang}'.
 *
 * @function parseFieldTextAndCommand
 * @param {Element} element - Target editable textbox element.
 * @returns {Object | null} Payload holding preceding input string and raw parsed language parameters.
 */
function parseFieldTextAndCommand(element) {
  if (!element) return null;

  let value = "";
  const tag = element.tagName?.toLowerCase();

  if (tag === "input" || tag === "textarea") {
    value = element.value;
  } else if (element.isContentEditable) {
    value = element.innerText;
  }

  const match = value.match(TRANSLATION_COMMAND_PATTERN);
  if (!match) return null;

  const languageRaw = match[1];
  const precedingText = value.slice(0, match.index).trimEnd();
  return { text: precedingText, languageRaw };
}

/**
 * Asynchronously queries local storage parameters via background API channel. Returns standard configuration layouts if
 * context invalidations occur.
 *
 * @async
 * @function getSettings
 * @returns {Promise<Object>} The settings configuration layout structure.
 */
async function getSettings() {
  if (!isExtensionContextValid()) {
    // Don't show toast, just return default settings
    return {
      enabled: false,
      nativeLanguageCode: "vi",
      targetLanguageCode: "en",
      useAutoDetect: false,
      showConfirmModal: true,
      dialogTimeout: 10,
      aliases: {},
      interfaceLanguage: "en",
    };
  }

  try {
    // Double-check context validity before making the call
    if (!isExtensionContextValid()) {
      throw new Error("Extension context invalidated");
    }

    const res = await chrome.runtime.sendMessage({ type: "get-settings" });
    if (res?.ok) {
      // Initialize i18n with the fetched language setting
      if (i18n) {
        i18n.setLanguage(res.settings.interfaceLanguage || "en");
      }
      return res.settings;
    }
  } catch (error) {
    console.error("LinguaKit: Error getting settings:", error.message);
    if (
      error.message.includes("Extension context invalidated") ||
      error.message.includes("Could not establish connection")
    ) {
      cleanupExtensionElements();
    }
  }

  return {
    enabled: true,
    nativeLanguageCode: "vi",
    targetLanguageCode: "en",
    useAutoDetect: false,
    showConfirmModal: true,
    dialogTimeout: 10,
    aliases: {},
    interfaceLanguage: "en",
  };
}

async function requestTranslation(payload) {
  if (!isExtensionContextValid()) {
    throw new Error(i18n.t("toast.extensionUpdated"));
  }

  try {
    // Double-check context validity before making the call
    if (!isExtensionContextValid()) {
      throw new Error("Extension context invalidated");
    }

    return chrome.runtime.sendMessage({ type: "translate", payload });
  } catch (error) {
    if (
      error.message.includes("Extension context invalidated") ||
      error.message.includes("Could not establish connection")
    ) {
      cleanupExtensionElements();
      throw new Error(i18n.t("toast.extensionUpdated"), { cause: error });
    }
    throw error;
  }
}

function removeTranslationCommandSuffix(element) {
  if (!element) return "";

  let value = "";
  const tag = element.tagName?.toLowerCase();

  if (tag === "input" || tag === "textarea") {
    value = element.value;
    value = value.replace(TRANSLATION_COMMAND_PATTERN, "").trimEnd();
    element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    return value;
  }

  if (element.isContentEditable) {
    value = element.innerText;
    value = value.replace(TRANSLATION_COMMAND_PATTERN, "").trimEnd();
    element.textContent = value;
    return value;
  }

  return "";
}

function showToast(message) {
  const host = document.createElement("div");
  const lowerMsg = message.toLowerCase();

  // Determine toast type and icon
  let icon = "";
  let toastType = "default"; // default, warning, success

  if (lowerMsg.includes("translating") || lowerMsg.includes("đang dịch")) {
    icon = "⏳";
    toastType = "default";
  } else if (lowerMsg.includes("enabled") || lowerMsg.includes("đã bật")) {
    icon = "✓";
    toastType = "success";
  } else if (lowerMsg.includes("disabled") || lowerMsg.includes("đã tắt")) {
    icon = "⚠️";
    toastType = "warning";
  } else if (lowerMsg.includes("failed") || lowerMsg.includes("thất bại")) {
    icon = "⚠️";
    toastType = "warning";
  } else if (lowerMsg.includes("updated") || lowerMsg.includes("cập nhật")) {
    icon = "ℹ️";
    toastType = "default";
  } else if (lowerMsg.includes("error") || lowerMsg.includes("lỗi")) {
    icon = "❌";
    toastType = "warning";
  } else if (lowerMsg.includes("invalid") || lowerMsg.includes("không hợp lệ")) {
    icon = "⚠️";
    toastType = "warning";
  } else if (lowerMsg.includes("instant")) {
    icon = "⚡";
    toastType = "default";
  }

  // Set class based on type
  host.className = `bt-toast-notify bt-toast-notify-${toastType} bt-vars-container`;

  host.innerHTML = `
    <div class="bt-toast-notify-content">
      <span class="bt-toast-notify-icon">${icon}</span>
      <span class="bt-toast-notify-text">${message}</span>
    </div>
  `;
  document.documentElement.appendChild(host);

  // Fade out animation - close faster
  setTimeout(() => {
    host.classList.add("bt-toast-notify-exit");
    setTimeout(() => host.remove(), 300);
  }, 1500);
}

function registerAutoDetection() {
  document.addEventListener("input", handleUserInputEvent, true);
  document.addEventListener("blur", handleUserInputEvent, true);
}

function handleUserInputEvent() {
  const element = getActiveEditableElement();
  if (!element) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => attemptTranslationTrigger(element), 600);
}

function attemptTranslationTrigger(element) {
  if (isTranslating) return;
  const parsed = parseFieldTextAndCommand(element);
  if (!parsed) return;
  void handleAutoTranslation(element, parsed);
}

function resolveTargetLanguage(raw, settings) {
  if (raw === "t") return settings.targetLanguageCode || "en";

  // Check aliases
  if (settings.aliases && settings.aliases[raw]) {
    return settings.aliases[raw];
  }

  // Fallback to normalization (e.g. "english" -> "en")
  return normalizeLanguageToCode(raw);
}

async function saveSuggestionSettings(activeSuggestion, defaultSource, defaultTarget, defaultProv) {
  try {
    const settings = await getSettings();
    const activeSource = activeSuggestion.sourceSelect ? activeSuggestion.sourceSelect.value : defaultSource;
    const activeTarget = activeSuggestion.targetSelect ? activeSuggestion.targetSelect.value : defaultTarget;
    const activeProv = activeSuggestion.providerSelect ? activeSuggestion.providerSelect.value : defaultProv;

    const updated = Object.assign({}, settings, {
      targetLanguageCode: activeTarget,
      activeProviderId: activeProv,
    });
    if (activeSource === "auto") {
      updated.useAutoDetect = true;
    } else {
      updated.useAutoDetect = false;
      updated.nativeLanguageCode = activeSource;
    }

    await chrome.runtime.sendMessage({
      type: "set-settings",
      settings: updated,
    });
  } catch (err) {
    console.error("LinguaKit: Error saving suggestion settings:", err);
  }
}

async function handleAutoTranslation(element, parsed) {
  isTranslating = true;

  try {
    const baseText = parsed.text;

    // Wrap getSettings to catch invalidation early
    let settings;
    try {
      settings = await getSettings();
    } catch (e) {
      if (e.message.includes("Extension context invalidated")) {
        showToast(i18n.t("toast.extensionUpdated"));
        return;
      }
      throw e;
    }

    if (settings.enabled === false) return;

    // Skip if this domain is already handled by instant translation
    if (isInstantDomain(settings)) return;

    const targetCode = resolveTargetLanguage(parsed.languageRaw, settings);

    if (!baseText || !baseText.trim()) return;
    if (!targetCode) {
      showToast(i18n.t("toast.invalidLanguage"));
      return;
    }

    const cleanSourceValue = removeTranslationCommandSuffix(element);

    // If confirm is OFF, just translate and replace immediately
    if (!settings.showConfirmModal) {
      // Only show loading for non-builtin models
      if (settings.activeProviderId !== "builtin") {
        showToast(i18n.t("toast.translating"));
      }
      let res;
      try {
        res = await requestTranslation({
          text: cleanSourceValue,
          nativeLanguageCode: settings.nativeLanguageCode || "en",
          targetLanguage: targetCode,
          useAutoDetect: settings.useAutoDetect === true,
        });
      } catch (e) {
        showToast(e.message || i18n.t("toast.translationFailed"));
        return;
      }

      if (res?.ok && res.result?.translation) {
        setFieldText(element, res.result.translation);
      } else {
        showToast(res?.error ? String(res.error) : i18n.t("toast.translationFailed"));
      }
      return;
    }

    // If confirm is ON, show inline suggestion
    // Only show loading for non-builtin models
    if (settings.activeProviderId !== "builtin") {
      showToast(i18n.t("toast.translating"));
    }

    let res;
    try {
      res = await requestTranslation({
        text: cleanSourceValue,
        nativeLanguageCode: settings.nativeLanguageCode || "en",
        targetLanguage: targetCode,
        useAutoDetect: settings.useAutoDetect === true,
      });
    } catch (e) {
      showToast(e.message || i18n.t("toast.translationFailed"));
      return;
    }

    if (!res || !res.ok || !res.result?.translation) {
      showToast(res?.error ? String(res.error) : i18n.t("toast.translationFailed"));
      return;
    }

    const translation = res.result.translation;
    const providerInfo = `${res.result.providerName || "AI"} (${res.result.providerType || "Bot"})`;

    if (currentSuggestion) {
      currentSuggestion.destroy();
      currentSuggestion = null;
    }
    const settingsCopy = Object.assign({}, settings, { targetLanguageCode: targetCode });
    // Use buildInlineSuggestion with auto positioning
    const initialSource = settings.useAutoDetect ? "auto" : settings.nativeLanguageCode || "auto";
    currentSuggestion = buildInlineSuggestion(element, translation, providerInfo, "auto", settingsCopy, initialSource);
    currentSuggestion.inputElement = element;
    currentSuggestion.sourceText = cleanSourceValue;

    // Setup helper to save changed settings globally
    const onSuggestionChange = () => {
      void saveSuggestionSettings(
        currentSuggestion,
        initialSource,
        targetCode,
        settingsCopy.activeProviderId || "google-translate",
      );
    };

    // Handle change events
    if (currentSuggestion.providerSelect) {
      currentSuggestion.providerSelect.addEventListener("change", onSuggestionChange);
    }
    if (currentSuggestion.targetSelect) {
      currentSuggestion.targetSelect.addEventListener("change", onSuggestionChange);
    }
    if (currentSuggestion.sourceSelect) {
      currentSuggestion.sourceSelect.addEventListener("change", onSuggestionChange);
    }

    // Setup Tab/Esc handlers
    const handleKeydown = (ev) => {
      if (ev.key === "Tab") {
        ev.preventDefault();
        if (currentSuggestion) {
          setFieldText(element, currentSuggestion.translatedText);
          currentSuggestion.destroy();
          currentSuggestion = null;
        }
        document.removeEventListener("keydown", handleKeydown, true);
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        if (currentSuggestion) {
          currentSuggestion.destroy();
          currentSuggestion = null;
        }
        document.removeEventListener("keydown", handleKeydown, true);
      }
    };

    document.addEventListener("keydown", handleKeydown, true);

    // Cleanup if element loses focus or is removed
    const onBlur = () => {
      if (currentSuggestion) {
        currentSuggestion.destroy();
        currentSuggestion = null;
      }
      document.removeEventListener("keydown", handleKeydown, true);
      element.removeEventListener("blur", onBlur);
    };
    element.addEventListener("blur", onBlur);
  } catch (err) {
    if (currentSuggestion) {
      currentSuggestion.destroy();
      currentSuggestion = null;
    }
    showToast(err.message || "An error occurred");
    console.error(err);
  } finally {
    isTranslating = false;
  }
}

// ============================================
// INSTANT TRANSLATE MODE
// ============================================

function parseStoredDomain(domain) {
  const raw = String(domain || "").trim();
  if (!raw) return null;

  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return {
      hostname: url.hostname.toLowerCase(),
      pathname: url.pathname === "/" ? "" : url.pathname.replace(/\/$/, ""),
    };
  } catch {
    const [host, ...pathParts] = raw.split("/");
    if (!host) return null;
    return {
      hostname: host.toLowerCase(),
      pathname: pathParts.length ? `/${pathParts.join("/")}`.replace(/\/$/, "") : "",
    };
  }
}

function domainMatchesLocation(domainConfig, location = window.location) {
  const parsed = parseStoredDomain(domainConfig?.domain);
  if (!parsed?.hostname) return false;

  const currentHost = location.hostname.toLowerCase();
  const hostnameMatches = currentHost === parsed.hostname || currentHost.endsWith(`.${parsed.hostname}`);
  if (!hostnameMatches) return false;

  return !parsed.pathname || location.pathname.startsWith(parsed.pathname);
}

function findDomainIndexForCurrentLocation(domains = []) {
  return domains.findIndex((domainConfig) => domainMatchesLocation(domainConfig));
}

function isInstantDomain(settings) {
  if (!settings.instantTranslateEnabled) return null;

  return (
    settings.instantDomains?.find((domainConfig) => {
      return domainConfig.enabled && domainMatchesLocation(domainConfig);
    }) || null
  );
}

function shouldTriggerInstant(text) {
  // Don't trigger if:
  if (!text || text.trim().length < 5) return false; // Too short
  if (/^https?:\/\//.test(text)) return false; // URL
  if (/^[!@#$%^&*()_+=[\]{};':"\\|,.<>/?`~-]+$/.test(text)) return false; // Only special chars
  return true;
}

function setFieldText(element, text, options = {}) {
  const { immediate = false } = options;
  const tag = element.tagName?.toLowerCase();

  // Ensure element has focus first
  if (document.activeElement !== element) {
    element.focus();
  }

  if (tag === "input" || tag === "textarea") {
    // Use native setter to bypass React's value tracking
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      tag === "input" ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype,
      "value",
    )?.set?.bind(element);

    if (nativeInputValueSetter) {
      nativeInputValueSetter(text);
    } else {
      element.value = text;
    }

    // Trigger React's onChange by dispatching input event
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  } else if (element.isContentEditable) {
    const performInsertion = () => {
      // Ensure focus again
      if (document.activeElement !== element) {
        element.focus();
      }

      try {
        // SOLUTION: Works with Lexical Editor (Facebook's editor framework)
        // Key: Need 50ms delay after selectAll for Lexical to process selection

        // Step 1: Focus element
        element.focus();

        // Step 2: Select all content
        document.execCommand("selectAll", false, null);

        // Step 3: CRITICAL DELAY - Wait for Lexical to process selection
        setTimeout(() => {
          // Step 4: Insert text (replaces selection)
          document.execCommand("insertText", false, text);

          // Step 5: Dispatch input event for React/Lexical
          element.dispatchEvent(new InputEvent("input", { bubbles: true }));
        }, 50);
      } catch (e) {
        console.error("[LinguaKit] Insertion failed", e);
      }
    };

    // For instant translate with Tab, execute IMMEDIATELY and SYNCHRONOUSLY
    // Based on tests: execCommand works but async delays cause Facebook to revert
    if (immediate) {
      performInsertion();
    } else {
      setTimeout(performInsertion, 0);
    }
  }
}

// Prevent clicking on the suggestion from blurring the input
// EXCEPT for select elements (allow clicking model selector)
const preventBlur = (e) => {
  // Allow clicks on select elements
  if (e.target.tagName === "SELECT" || e.target.closest("select")) {
    return;
  }
  e.preventDefault();
  e.stopPropagation();
};

function buildInlineSuggestion(
  element,
  translatedText,
  providerInfo,
  position = "auto",
  settings = {},
  sourceLanguageCode = "auto",
) {
  const container = document.createElement("div");
  container.className = "bt-inline-suggestion bt-vars-container";

  // Position relative to input
  const rect = element.getBoundingClientRect();
  container.style.position = "fixed";
  container.style.zIndex = "9999999999";

  // Smart width calculation to prevent UI breaking on small inputs
  const minPopupWidth = 320;
  const maxPopupWidth = 600;
  const inputWidth = rect.width;

  // Calculate popup width with constraints
  let popupWidth = Math.max(inputWidth - 80, minPopupWidth);
  popupWidth = Math.min(popupWidth, maxPopupWidth);

  container.style.width = `${popupWidth}px`;
  container.style.minWidth = `${minPopupWidth}px`;
  container.style.maxWidth = `${maxPopupWidth}px`;

  // Smart horizontal positioning
  let leftPos = rect.left;

  // Get available viewport considering panels
  const viewport = getAvailableViewport();

  // If popup is wider than input, center it relative to input
  if (popupWidth > inputWidth) {
    leftPos = rect.left - (popupWidth - inputWidth) / 2;

    // Keep popup within viewport considering panel offsets
    const maxLeft = viewport.width + viewport.leftOffset - popupWidth - 10;
    const minLeft = viewport.leftOffset + 10;
    leftPos = Math.max(minLeft, Math.min(leftPos, maxLeft));
  }

  container.style.left = `${leftPos}px`;

  // AUTO-DETECT optimal vertical position
  let finalPosition = position;

  if (position === "auto") {
    // Calculate available space above and below
    const spaceAbove = rect.top;
    const spaceBelow = viewport.height - rect.bottom;

    const minSpaceNeeded = 120;

    // Prefer bottom if enough space, otherwise use position with more space
    if (spaceBelow >= minSpaceNeeded) {
      finalPosition = "bottom";
    } else if (spaceAbove >= minSpaceNeeded) {
      finalPosition = "top";
    } else {
      // Choose side with more space
      finalPosition = spaceAbove > spaceBelow ? "top" : "bottom";
    }
  }

  // Set vertical position based on final decision
  if (finalPosition === "top") {
    container.style.bottom = `${viewport.height - rect.top + 8}px`;
    container.classList.add("bt-popup-top");
  } else {
    container.style.top = `${rect.bottom + 8}px`;
    container.classList.add("bt-popup-bottom");
  }

  // Add to DOM first to get dimensions
  document.body.appendChild(container);

  // Get container dimensions and adjust position if needed
  const containerRect = container.getBoundingClientRect();

  // Ensure container stays within viewport bounds
  if (finalPosition === "bottom" && containerRect.bottom > viewport.height - 10) {
    // If bottom position causes overflow, try top position
    if (rect.top - containerRect.height - 8 >= 10) {
      container.style.top = "";
      container.style.bottom = `${viewport.height - rect.top + 8}px`;
      container.classList.remove("bt-popup-bottom");
      container.classList.add("bt-popup-top");
    } else {
      // Adjust to fit within viewport
      container.style.top = `${Math.max(10, viewport.height - containerRect.height - 10)}px`;
    }
  } else if (finalPosition === "top" && containerRect.top < 10) {
    // If top position causes overflow, try bottom position
    if (rect.bottom + containerRect.height + 8 <= viewport.height - 10) {
      container.style.bottom = "";
      container.style.top = `${rect.bottom + 8}px`;
      container.classList.remove("bt-popup-top");
      container.classList.add("bt-popup-bottom");
    } else {
      // Adjust to fit within viewport
      container.style.bottom = `${Math.max(10, viewport.height - containerRect.height - 10)}px`;
    }
  }

  // Remove from DOM temporarily to continue setup
  container.remove();

  let iconUrl;
  try {
    iconUrl = isExtensionContextValid() ? chrome.runtime.getURL("assets/icons/icon-19.png") : "";
  } catch (error) {
    console.error("LinguaKit: Error getting icon URL:", error.message);
    iconUrl = "";
  }

  container.innerHTML = `
    <div class="bt-suggestion-content">
      ${iconUrl ? `<img src="${iconUrl}" class="bt-suggestion-icon" alt="LinguaKit" />` : '<span class="bt-suggestion-icon">🔄</span>'}
      <div class="bt-suggestion-text">${translatedText}</div>
      <kbd class="bt-suggestion-tab-hint">Tab</kbd>
    </div>
    <div class="bt-suggestion-footer">
      <div class="bt-suggestion-source-container"></div>
      <div class="bt-suggestion-target-container"></div>
      <div class="bt-suggestion-provider-container"></div>
    </div>
  `;

  container.addEventListener("mousedown", preventBlur);
  container.addEventListener("pointerdown", preventBlur);

  const sourceContainer = container.querySelector(".bt-suggestion-source-container");
  const sourceSelect = populateSourceSelectorForSuggestion(sourceContainer, settings, sourceLanguageCode);

  const targetContainer = container.querySelector(".bt-suggestion-target-container");
  const targetSelect = populateTargetSelectorForSuggestion(targetContainer, settings);

  const providerContainer = container.querySelector(".bt-suggestion-provider-container");
  const providerSelect = populateProviderSelectorForSuggestion(providerContainer, settings);

  document.body.appendChild(container);

  return {
    element: container,
    translatedText,
    providerSelect,
    targetSelect,
    sourceSelect,
    destroy: () => {
      container.remove();
    },
  };
}

function populateProviderSelectorForSuggestion(container, settings) {
  const providers = settings.providers || [];
  const activeId = settings.activeProviderId || "google-translate";

  if (providers.length <= 1) {
    // Show as a label tag
    const provider = providers[0] || { name: "Google Translate" };
    const tag = document.createElement("span");
    tag.className = "bt-model-tag";
    tag.textContent = provider.name;
    container.appendChild(tag);
    return null;
  } else {
    // Show as a select dropdown
    const label = document.createElement("span");
    label.className = "bt-suggestion-provider-label";
    label.textContent = "Model: ";

    const select = document.createElement("select");
    select.className = "bt-suggestion-provider-select";
    select.tabIndex = -1; // CRITICAL: Prevent Tab key from focusing this element

    providers.forEach((p) => {
      const option = document.createElement("option");
      option.value = p.id;
      option.textContent = p.name;
      if (p.id === activeId) option.selected = true;
      select.appendChild(option);
    });

    container.appendChild(label);
    container.appendChild(select);

    return select;
  }
}

function populateTargetSelectorForSuggestion(container, settings) {
  const activeTarget = settings.targetLanguageCode || "en";

  const label = document.createElement("span");
  label.className = "bt-suggestion-target-label";
  label.textContent = "To: ";

  const select = document.createElement("select");
  select.className = "bt-suggestion-target-select";
  select.tabIndex = -1; // CRITICAL: Prevent Tab key from focusing this element

  const languages = [
    "en",
    "vi",
    "ja",
    "zh",
    "ko",
    "es",
    "fr",
    "de",
    "ru",
    "pt",
    "it",
    "hi",
    "ar",
    "tr",
    "nl",
    "pl",
    "th",
  ];
  languages.forEach((code) => {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = i18n.t("lang." + code) || code;
    if (code === activeTarget) option.selected = true;
    select.appendChild(option);
  });

  container.appendChild(label);
  container.appendChild(select);

  return select;
}

function populateSourceSelectorForSuggestion(container, settings, sourceLangCode) {
  const activeSource = sourceLangCode || settings.nativeLanguageCode || "auto";

  const label = document.createElement("span");
  label.className = "bt-suggestion-source-label";
  label.textContent = "From: ";

  const select = document.createElement("select");
  select.className = "bt-suggestion-source-select";
  select.tabIndex = -1; // CRITICAL: Prevent Tab key from focusing this element

  const languages = [
    "auto",
    "en",
    "vi",
    "ja",
    "zh",
    "ko",
    "es",
    "fr",
    "de",
    "ru",
    "pt",
    "it",
    "hi",
    "ar",
    "tr",
    "nl",
    "pl",
    "th",
  ];
  languages.forEach((code) => {
    const option = document.createElement("option");
    option.value = code;
    option.textContent =
      code === "auto" ? i18n.t("popup.detectLanguage") || "Auto-detect" : i18n.t("lang." + code) || code;
    if (code === activeSource) option.selected = true;
    select.appendChild(option);
  });

  container.appendChild(label);
  container.appendChild(select);

  return select;
}

function setupSuggestionKeyHandlers(element, suggestion) {
  // CRITICAL: Remove any existing handler first
  if (currentKeyHandler) {
    window.removeEventListener("keydown", currentKeyHandler, true);
    window.removeEventListener("keyup", currentKeyHandler, true);
    document.removeEventListener("keydown", currentKeyHandler, true);
    document.removeEventListener("keyup", currentKeyHandler, true);
    currentKeyHandler = null;
  }

  let isApplying = false; // Prevent multiple calls

  const handleKey = (ev) => {
    // Only handle specific keys, let everything else pass through
    if (ev.key === "Tab") {
      // CRITICAL: Block ALL propagation immediately and synchronously
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();

      // Legacy support
      if (ev.returnValue !== undefined) {
        ev.returnValue = false;
      }

      // Only process on keydown, just block keyup
      if (ev.type === "keyup") return false;

      // Prevent multiple calls
      if (isApplying) return false;

      // Apply translation (async, but we don't await in event handler)
      void applyTranslation();
      return false;
    }

    if (ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();

      if (ev.type === "keyup") return false;
      dismiss();
      return false;
    }

    if (ev.key === "Backspace" || ev.key === "Delete") {
      if (ev.type === "keyup") return false;
      dismiss();
      return false;
    }

    return true;
  };

  const applyTranslation = async () => {
    // Prevent re-entry
    if (isApplying) return;
    isApplying = true;

    // Commit IME composition before applying translation and wait for completion
    await commitIMEComposition(element);

    // Cleanup FIRST to prevent any interference
    window.removeEventListener("keydown", handleKey, true);
    window.removeEventListener("keyup", handleKey, true);
    document.removeEventListener("keydown", handleKey, true);
    document.removeEventListener("keyup", handleKey, true);
    currentKeyHandler = null;

    // Set flag to prevent instant translate from re-triggering
    justAppliedTranslation = true;

    // Apply translation IMMEDIATELY with Lexical-compatible method
    setFieldText(element, suggestion.translatedText, { immediate: true });

    // Destroy popup after a tiny delay to ensure insertion completes
    setTimeout(() => {
      if (suggestion) {
        suggestion.destroy();
      }
      currentSuggestion = null;
    }, 50);

    // Clear flag after a short delay
    setTimeout(() => {
      justAppliedTranslation = false;
    }, 500);
  };

  const dismiss = () => {
    window.removeEventListener("keydown", handleKey, true);
    window.removeEventListener("keyup", handleKey, true);
    document.removeEventListener("keydown", handleKey, true);
    document.removeEventListener("keyup", handleKey, true);
    currentKeyHandler = null;
    suggestion.destroy();
    currentSuggestion = null;
  };

  // Store reference and add listeners at MULTIPLE levels with CAPTURE
  // This ensures we catch the event before Facebook's handlers
  currentKeyHandler = handleKey;

  // Add at both window and document level for maximum coverage
  window.addEventListener("keydown", handleKey, true);
  window.addEventListener("keyup", handleKey, true);
  document.addEventListener("keydown", handleKey, true);
  document.addEventListener("keyup", handleKey, true);
}

// Commit IME composition by blur/focus
// This is needed for macOS IME (Vietnamese, Chinese, Japanese, etc.)
// to ensure the underline is removed before showing the translation popup
async function commitIMEComposition(element) {
  if (!isIMEComposing) return;

  try {
    // Blur triggers browser to fire compositionend event and commit IME
    element.blur();
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Re-focus to keep input active
    element.focus();
    await new Promise((resolve) => setTimeout(resolve, 50));
  } catch (err) {
    console.error("Error committing IME composition:", err);
  }
}

async function handleInstantTranslate(element) {
  // Skip if we just applied a translation
  if (justAppliedTranslation) return;

  const text = element.value?.trim() || element.innerText?.trim();
  if (!shouldTriggerInstant(text)) return;

  let settings;
  try {
    settings = await getSettings();
  } catch {
    return; // Silently fail if settings unavailable
  }

  const domainConfig = isInstantDomain(settings);
  if (!domainConfig) return;

  // Clear existing timer
  if (instantTimer) {
    clearTimeout(instantTimer);
    instantTimer = null;
  }

  // Dismiss existing suggestion
  if (currentSuggestion) {
    currentSuggestion.destroy();
    currentSuggestion = null;
  }

  // Start new timer
  instantTimer = setTimeout(async () => {
    try {
      // Commit IME composition before translation
      await commitIMEComposition(element);

      // Get fresh text after IME composition is committed
      const freshText = element.value?.trim() || element.innerText?.trim();

      // Only show loading for non-builtin models
      if (settings.activeProviderId !== "builtin") {
        showToast(i18n.t("toast.translating"));
      }

      const res = await requestTranslation({
        text: freshText,
        nativeLanguageCode: settings.nativeLanguageCode || "en",
        targetLanguage: settings.targetLanguageCode || "en",
        sourceLanguage: settings.nativeLanguageCode || "en", // Always translate from native language
        useAutoDetect: false, // Never auto-detect for instant (always Native→Target)
      });

      if (res?.ok && res.result?.translation) {
        // Use 'auto' by default for smart positioning
        const position = domainConfig.position || "auto";
        const providerInfo = `${res.result.providerName || "AI"} (${res.result.providerType || "Bot"})`;
        const initialSource = settings.nativeLanguageCode || "en";
        currentSuggestion = buildInlineSuggestion(
          element,
          res.result.translation,
          providerInfo,
          position,
          settings,
          initialSource,
        );
        currentSuggestion.inputElement = element;
        currentSuggestion.sourceText = freshText;
        setupSuggestionKeyHandlers(element, currentSuggestion);

        const onSuggestionChange = () => {
          void saveSuggestionSettings(
            currentSuggestion,
            initialSource,
            settings.targetLanguageCode || "en",
            settings.activeProviderId || "google-translate",
          );
        };

        // Handle change events
        if (currentSuggestion.providerSelect) {
          currentSuggestion.providerSelect.addEventListener("change", onSuggestionChange);
        }
        if (currentSuggestion.targetSelect) {
          currentSuggestion.targetSelect.addEventListener("change", onSuggestionChange);
        }
        if (currentSuggestion.sourceSelect) {
          currentSuggestion.sourceSelect.addEventListener("change", onSuggestionChange);
        }
      } else {
        // Show error toast when translation fails
        showToast(res?.error || i18n.t("toast.translationFailed"));
      }
    } catch (err) {
      console.error("Instant translate error:", err);
      showToast(i18n.t("toast.translationFailed"));
    }
  }, settings.instantDelay || 3000);
}

async function reTranslateSuggestion(
  element,
  text,
  providerId,
  settings,
  targetLanguage,
  sourceLanguage,
  suggestionObj,
) {
  const activeSuggestion = suggestionObj || currentSuggestion;
  if (!activeSuggestion) return;

  const textEl = activeSuggestion.element.querySelector(".bt-suggestion-text");
  if (textEl) {
    textEl.textContent = i18n.t("dialog.translating") || "Translating...";
    textEl.classList.add("bt-loading-text");
  }

  // Update target language in settings if provided
  const targetCode = targetLanguage || settings.targetLanguageCode || "en";
  const sourceCode = sourceLanguage || "auto";
  const useAuto = sourceCode === "auto";

  try {
    const res = await requestTranslation({
      text: text,
      nativeLanguageCode: settings.nativeLanguageCode || "en",
      targetLanguage: targetCode,
      sourceLanguage: useAuto ? settings.nativeLanguageCode || "en" : sourceCode,
      useAutoDetect: useAuto,
      providerId: providerId,
    });

    if (res?.ok && res.result?.translation) {
      if (textEl) {
        textEl.textContent = res.result.translation;
        textEl.classList.remove("bt-loading-text");
      }
      activeSuggestion.translatedText = res.result.translation;
    }
  } catch (err) {
    console.error("Re-translation error:", err);
    if (textEl) {
      textEl.textContent = "Error: " + err.message;
      textEl.classList.remove("bt-loading-text");
    }
  }
}

function registerInstantMode() {
  // Listen for input changes
  document.addEventListener(
    "input",
    async (_e) => {
      const element = getActiveEditableElement();
      if (!element) return;

      // Don't interfere with manual mode
      if (isTranslating) return;

      // Check if manual command is being typed
      const text = element.value?.trim() || element.innerText?.trim();
      if (TRANSLATION_COMMAND_PATTERN.test(text)) return;

      void handleInstantTranslate(element);
    },
    true,
  );

  // Track IME composition state for proper handling
  document.addEventListener(
    "compositionstart",
    () => {
      isIMEComposing = true;
    },
    true,
  );

  document.addEventListener(
    "compositionend",
    () => {
      isIMEComposing = false;
    },
    true,
  );

  // Handle click outside to close suggestion
  document.addEventListener("mousedown", (e) => {
    if (currentSuggestion) {
      const isInsideInput = e.target === getActiveEditableElement();
      const isInsideSuggestion = currentSuggestion.element.contains(e.target);

      if (!isInsideInput && !isInsideSuggestion) {
        // Cleanup key handler if it exists
        if (currentKeyHandler) {
          document.removeEventListener("keydown", currentKeyHandler, true);
          currentKeyHandler = null;
        }

        currentSuggestion.destroy();
        currentSuggestion = null;
      }
    }
  });

  // Listen for Enter key to cancel instant translate
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Enter") {
        // User wants to send message immediately, cancel any pending translation
        if (instantTimer) {
          clearTimeout(instantTimer);
          instantTimer = null;
        }

        // Dismiss any visible suggestion
        if (currentSuggestion) {
          currentSuggestion.destroy();
          currentSuggestion = null;
        }

        // Remove keyboard handler if active
        if (currentKeyHandler) {
          document.removeEventListener("keydown", currentKeyHandler, true);
          currentKeyHandler = null;
        }
      }
    },
    true,
  );
}

// ============================================
// INSTANT TOGGLE SHORTCUT
// ============================================

async function toggleInstantDomainForCurrentUrl() {
  try {
    const settings = await getSettings();

    // If global setting is disabled, enable it and FORCE enable the domain
    if (!settings.instantDomains) {
      settings.instantDomains = [];
    }

    // Find matching domain
    const matchingDomainIndex = findDomainIndexForCurrentLocation(settings.instantDomains);

    if (!settings.instantTranslateEnabled) {
      settings.instantTranslateEnabled = true;

      if (matchingDomainIndex !== -1) {
        // Force enable if it exists
        settings.instantDomains[matchingDomainIndex].enabled = true;
      }
      // If it doesn't exist, it will be added below
    } else if (matchingDomainIndex !== -1) {
      // Global is already on, so we just toggle the domain
      settings.instantDomains[matchingDomainIndex].enabled = !settings.instantDomains[matchingDomainIndex].enabled;
    }

    if (matchingDomainIndex === -1) {
      // Current domain not in list - AUTO-ADD IT!
      const domain = extractDomainFromUrl(window.location.href);

      // Add to list with enabled: true, position: 'auto'
      settings.instantDomains.push({
        domain: domain,
        enabled: true,
        position: "auto",
      });

      // Save settings
      try {
        await safeRuntimeCall(() =>
          chrome.runtime.sendMessage({
            type: "set-settings",
            settings: settings,
          }),
        );
      } catch (error) {
        console.error("LinguaKit: Error saving settings:", error.message);
        return;
      }

      // Show success toast
      const enabledText = i18n.t("toast.instantEnabled") || "⚡ Instant translate enabled";
      const forText = i18n.t("toast.for") || "for";
      showToastBottomRight(`${enabledText} ${forText} ${domain}`);
      return;
    }

    // Get the domain object (it definitely exists now)
    const domain = settings.instantDomains[matchingDomainIndex];

    // Update settings
    try {
      await safeRuntimeCall(() =>
        chrome.runtime.sendMessage({
          type: "set-settings",
          settings: settings,
        }),
      );
    } catch (error) {
      console.error("LinguaKit: Error updating settings:", error.message);
      return;
    }

    // Show toast notification with domain name
    const status = domain.enabled
      ? i18n.t("toast.instantEnabled") || "⚡ Instant translate enabled"
      : i18n.t("toast.instantDisabled") || "Instant translate disabled";

    const forText = i18n.t("toast.for") || "for";
    showToastBottomRight(`${status} ${forText} ${domain.domain}`);

    // Clear any pending instant translation when disabling
    if (!domain.enabled && instantTimer) {
      clearTimeout(instantTimer);
      instantTimer = null;
    }

    // Dismiss current suggestion when disabling
    if (!domain.enabled && currentSuggestion) {
      currentSuggestion.destroy();
      currentSuggestion = null;
    }
  } catch (err) {
    console.error("Toggle instant domain error:", err);
    showToast(i18n.t("toast.error") || "Error toggling instant domain");
  }
}

async function toggleHoverDomainForCurrentUrl() {
  try {
    const settings = await getSettings();

    if (!settings.hoverTranslateDomains) {
      settings.hoverTranslateDomains = [];
    }

    // Find matching domain
    const matchingDomainIndex = findDomainIndexForCurrentLocation(settings.hoverTranslateDomains);

    if (!settings.hoverTranslateEnabled) {
      settings.hoverTranslateEnabled = true;

      if (matchingDomainIndex !== -1) {
        settings.hoverTranslateDomains[matchingDomainIndex].enabled = true;
      }
    } else if (matchingDomainIndex !== -1) {
      settings.hoverTranslateDomains[matchingDomainIndex].enabled =
        !settings.hoverTranslateDomains[matchingDomainIndex].enabled;
    }

    if (matchingDomainIndex === -1) {
      const domain = extractDomainFromUrl(window.location.href);

      settings.hoverTranslateDomains.push({
        domain: domain,
        enabled: true,
      });

      try {
        await safeRuntimeCall(() =>
          chrome.runtime.sendMessage({
            type: "set-settings",
            settings: settings,
          }),
        );
      } catch (error) {
        console.error("LinguaKit: Error saving settings:", error.message);
        return;
      }

      // Show success toast
      const enabledText = i18n.t("toast.hoverEnabled") || "🔍 Hover translate enabled";
      const forText = i18n.t("toast.for") || "for";
      showToastBottomRight(`${enabledText} ${forText} ${domain}`);
      return;
    }

    const domain = settings.hoverTranslateDomains[matchingDomainIndex];

    try {
      await safeRuntimeCall(() =>
        chrome.runtime.sendMessage({
          type: "set-settings",
          settings: settings,
        }),
      );
    } catch (error) {
      console.error("LinguaKit: Error updating settings:", error.message);
      return;
    }

    const status = domain.enabled
      ? i18n.t("toast.hoverEnabled") || "🔍 Hover translate enabled"
      : i18n.t("toast.hoverDisabled") || "Hover translate disabled";

    const forText = i18n.t("toast.for") || "for";
    showToastBottomRight(`${status} ${forText} ${domain.domain}`);

    // If disabled, clean up any active hover elements or states
    if (!domain.enabled) {
      clearAllHoverTranslations();
      document.body.classList.remove("bt-hover-translate-active");
      hoverModifierPressed = false;
    }
  } catch (err) {
    console.error("Toggle hover domain error:", err);
    showToast(i18n.t("toast.error") || "Error toggling hover domain");
  }
}

function extractDomainFromUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return window.location.hostname;
  }
}

// Alias: showToastBottomRight cũng sử dụng style modern
function showToastBottomRight(message) {
  showToast(message);
}

// ============================================
// PAGE TRANSLATION CACHE LOGIC
// ============================================
function getTextNodes(container) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      // Skip extension elements and hidden elements
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;

      if (
        parent.closest(".bt-vars-container, .lk-toast-container") ||
        parent.tagName === "SCRIPT" ||
        parent.tagName === "STYLE" ||
        parent.tagName === "NOSCRIPT"
      ) {
        return NodeFilter.FILTER_REJECT;
      }

      const text = node.textContent.trim();
      return text ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  const nodes = [];
  let node;
  while ((node = walker.nextNode())) {
    nodes.push(node);
  }
  return nodes;
}

async function applyPageCache(cache) {
  const nodes = getTextNodes(document.body);
  let count = 0;

  for (const node of nodes) {
    const text = node.textContent.trim();
    if (cache[text]) {
      node.textContent = cache[text];
      count++;
    }
  }

  if (count > 0) {
    isPageCached = true;
    chrome.runtime.sendMessage({ type: "page-cache-status-updated", isCacheReady: true });
    if (i18n && typeof i18n.t === "function") {
      showToast(i18n.t("toast.applyingCache"));
    } else {
      showToast("Applying cached translations...");
    }
    document.documentElement.classList.add("lk-translated");
    return true;
  }
  return false;
}

let originalTexts = []; // Store original strings in order
let isPageCached = false;

function snapshotPageTexts() {
  const isAlreadyTranslated =
    document.documentElement.classList.contains("translated-ltr") ||
    document.documentElement.classList.contains("translated-rtl") ||
    document.documentElement.classList.contains("lk-translated");

  if (originalTexts.length > 0 && isAlreadyTranslated) {
    return;
  }

  const nodes = getTextNodes(document.body);
  originalTexts = nodes.map((n) => n.textContent.trim());
}

async function captureAndSavePageCache(domain, targetLang, silent = false) {
  if (originalTexts.length === 0) return;

  const currentNodes = getTextNodes(document.body);
  const cache = {};
  let count = 0;

  // We match by index. This is robust even if Google Translate replaced nodes
  // as long as the logical order of text segments is preserved.
  const limit = Math.min(originalTexts.length, currentNodes.length);

  for (let i = 0; i < limit; i++) {
    const originalText = originalTexts[i];
    const currentText = currentNodes[i].textContent.trim();

    if (currentText && originalText && currentText !== originalText) {
      // Basic heuristic: if the current text is just the original text (after trim), skip
      cache[originalText] = currentText;
      count++;
    }
  }

  if (count > 0) {
    try {
      await safeRuntimeCall(() =>
        chrome.runtime.sendMessage({
          type: "set-page-cache",
          payload: { domain, targetLang, cache },
        }),
      );
      isPageCached = true;
      chrome.runtime.sendMessage({ type: "page-cache-status-updated", isCacheReady: true });
      if (!silent) {
        showToast(i18n.t("toast.cacheSaved") || "Translations cached");
      }
    } catch (err) {
      console.error("LinguaKit: Error saving page cache:", err);
    }
  } else {
    console.warn("LinguaKit: No new translations captured from DOM.");
  }
}

function monitorGoogleTranslate(domain, targetLang) {
  const observer = new MutationObserver(() => {
    if (
      document.documentElement.classList.contains("translated-ltr") ||
      document.documentElement.classList.contains("translated-rtl")
    ) {
      observer.disconnect();
      showToast(i18n.t("toast.translationComplete") || "Translation complete");
      // Wait a bit for translation to stabilize
      setTimeout(() => captureAndSavePageCache(domain, targetLang), 2500);
    }
  });

  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

  // Fallback timer
  setTimeout(() => {
    observer.disconnect();
    if (originalTexts.length > 0) {
      void captureAndSavePageCache(domain, targetLang, true);
    }
  }, 15000);
}

// AUTO PAGE TRANSLATE LOGIC
function isAutoPageTranslateDomain(settings) {
  if (!settings.autoPageTranslateEnabled) return null;

  return (
    settings.autoPageTranslateDomains?.find((domainConfig) => {
      return domainConfig.enabled && domainMatchesLocation(domainConfig);
    }) || null
  );
}

async function registerAutoPageTranslate() {
  if (!isTopFrame()) return;

  try {
    const settings = await getSettings();
    if (settings.enabled === false) return;

    // registerAutoPageTranslate logic
    if (isAutoPageTranslateDomain(settings)) {
      const domain = window.location.hostname;
      const targetLang = settings.targetLanguageCode || "en";

      // Try applying cache first
      try {
        const res = await safeRuntimeCall(() =>
          chrome.runtime.sendMessage({
            type: "get-page-cache",
            payload: { domain, targetLang },
          }),
        );

        if (res?.ok && res.cache) {
          const applied = await applyPageCache(res.cache);
          if (applied) return; // Exit if cache applied successfully
        }
      } catch (e) {
        console.warn("LinguaKit: Cache check failed, falling back to Google Translate", e.message);
      }

      // No cache or apply failed, use Google Translate and learn
      await autoTranslatePage(settings, true);
    }
  } catch (err) {
    console.error("LinguaKit: registerAutoPageTranslate error:", err);
  }
}

function injectMainWorldScript() {
  return new Promise((resolve) => {
    if (document.getElementById("lk-main-world-script")) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.id = "lk-main-world-script";
    script.src = chrome.runtime.getURL("src/page-translate.js");
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => {
      console.error("LinguaKit: Failed to load main world script");
      resolve(); // Still resolve to not block
    });
    document.head.appendChild(script);

    // Listen for errors from main world (e.g. ad-blocker)
    window.addEventListener("lk-page-translate-error", (event) => {
      if (event.detail?.error === "BLOCKED_BY_CONTENT_BLOCKER") {
        showToast(i18n.t("toast.translateBlocked") || "Translation blocked by browser/extension (ad-blocker).");
      }
    });
  });
}

async function autoTranslatePage(settings, learn = false) {
  // If translated by Google, skip (but allowed if already has google_translate_element for re-triggering)
  if (
    document.documentElement.classList.contains("translated-ltr") ||
    document.documentElement.classList.contains("translated-rtl") ||
    document.documentElement.classList.contains("lk-translated")
  ) {
    // Only return if we are already in translated state
    // If user manually triggers it again, we might want to let it through to page-translate
  }

  // Ensure main world script is injected and ready
  await injectMainWorldScript();

  const targetLang = settings.targetLanguageCode || "en";

  // Create Google Translate Element container if not exists
  if (!document.getElementById("google_translate_element")) {
    const div = document.createElement("div");
    div.id = "google_translate_element";
    div.style.display = "none";
    document.body.appendChild(div);
  }

  // Set the googtrans cookie to trigger translation automatically
  const domain = window.location.hostname;
  const cookieFlags = window.location.protocol === "https:" ? "; Secure; SameSite=Lax" : "; SameSite=Lax";

  // Set cookie for current domain and also without explicit domain for broader compatibility
  document.cookie = `googtrans=/auto/${targetLang}; path=/; domain=${domain}${cookieFlags}`;
  document.cookie = `googtrans=/auto/${targetLang}; path=/${cookieFlags}`;

  // Give a small delay for cookie to propagate and main script to be ready
  await new Promise((r) => setTimeout(r, 100));

  // Trigger translation in main world
  window.dispatchEvent(
    new CustomEvent("lk-trigger-page-translate", {
      detail: { targetLang },
    }),
  );

  if (learn) {
    isPageCached = false;
    chrome.runtime.sendMessage({ type: "page-cache-status-updated", isCacheReady: false });
    snapshotPageTexts();
    monitorGoogleTranslate(window.location.hostname, targetLang);
  }

  // Show a toast
  if (i18n && typeof i18n.t === "function") {
    showToast(i18n.t("toast.autoPageTranslated"));
  } else {
    showToast("Auto Page Translate activated");
  }
}

// Helper functions moved or removed if no longer used

async function toggleAutoPageTranslateDomainForCurrentUrl() {
  try {
    const settings = await getSettings();
    if (!settings.autoPageTranslateDomains) {
      settings.autoPageTranslateDomains = [];
    }

    const matchingDomainIndex = findDomainIndexForCurrentLocation(settings.autoPageTranslateDomains);

    if (!settings.autoPageTranslateEnabled) {
      settings.autoPageTranslateEnabled = true;
    }

    if (matchingDomainIndex !== -1) {
      settings.autoPageTranslateDomains[matchingDomainIndex].enabled =
        !settings.autoPageTranslateDomains[matchingDomainIndex].enabled;
    } else {
      settings.autoPageTranslateDomains.push({
        domain: window.location.hostname,
        enabled: true,
      });
    }

    await chrome.runtime.sendMessage({
      type: "set-settings",
      settings,
    });

    const isEnabled =
      matchingDomainIndex === -1 ? true : settings.autoPageTranslateDomains[matchingDomainIndex].enabled;

    if (isEnabled) {
      showToast(i18n?.t("toast.autoPageEnabled") || "Auto Page Translate enabled for this domain");
      // Auto trigger if enabling
      await autoTranslatePage(settings);
    } else {
      showToast(i18n?.t("toast.autoPageDisabled") || "Auto Page Translate disabled");
      // Clear the cookie
      document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname}`;
      document.cookie = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    }
  } catch (error) {
    console.error("LinguaKit: Error toggling auto page domain:", error);
  }
}

function registerToggleShortcuts() {
  if (!isTopFrame()) return;

  document.addEventListener(
    "keydown",
    async (e) => {
      // Ignore if typing in an input
      const isTyping = e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable;

      if (isTyping) return;

      const settings = await getSettings();

      // Instant Translate Shortcut
      const instantShortcut = settings.instantToggleShortcut || {
        key: "I",
        ctrl: false,
        shift: true,
        alt: true,
      };

      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const modifierKey = isMac ? e.metaKey : e.ctrlKey;

      const instantMatches =
        e.key.toUpperCase() === instantShortcut.key.toUpperCase() &&
        modifierKey === instantShortcut.ctrl &&
        e.shiftKey === instantShortcut.shift &&
        e.altKey === instantShortcut.alt;

      if (instantMatches) {
        e.preventDefault();
        e.stopPropagation();
        await toggleInstantDomainForCurrentUrl();
        return;
      }

      // Auto Page Translate Shortcut
      const autoPageShortcut = settings.autoTranslateToggleShortcut || {
        key: "P",
        ctrl: false,
        shift: true,
        alt: true,
      };

      const autoPageMatches =
        e.key.toUpperCase() === autoPageShortcut.key.toUpperCase() &&
        modifierKey === autoPageShortcut.ctrl &&
        e.shiftKey === autoPageShortcut.shift &&
        e.altKey === autoPageShortcut.alt;

      if (autoPageMatches) {
        e.preventDefault();
        e.stopPropagation();
        await toggleAutoPageTranslateDomainForCurrentUrl();
        return;
      }

      // Hover Translate Shortcut
      const hoverShortcut = settings.hoverToggleShortcut || {
        key: "H",
        ctrl: false,
        shift: true,
        alt: true,
      };

      const hoverMatches =
        e.key.toUpperCase() === hoverShortcut.key.toUpperCase() &&
        modifierKey === hoverShortcut.ctrl &&
        e.shiftKey === hoverShortcut.shift &&
        e.altKey === hoverShortcut.alt;

      if (hoverMatches) {
        e.preventDefault();
        e.stopPropagation();
        await toggleHoverDomainForCurrentUrl();
        return;
      }
    },
    true,
  );
}

// ============================================
// INSTANT LABEL INDICATOR
// ============================================

function registerInstantLabelIndicator() {
  // Create label element
  const label = document.createElement("div");
  let iconUrl;
  try {
    iconUrl = isExtensionContextValid() ? chrome.runtime.getURL("assets/icons/icon-19.png") : "";
  } catch (error) {
    console.error("LinguaKit: Error getting icon URL for label:", error.message);
    iconUrl = "";
  }
  const labelText = document.createElement("span");

  // Create img element or fallback
  if (iconUrl) {
    const img = document.createElement("img");
    img.src = iconUrl;
    img.alt = "LinguaKit";
    img.style.cssText = "width: 14px; height: 14px; flex-shrink: 0;";
    label.appendChild(img);
  } else {
    const fallbackIcon = document.createElement("span");
    fallbackIcon.textContent = "⚡";
    fallbackIcon.style.cssText =
      "width: 14px; height: 14px; flex-shrink: 0; display: inline-block; text-align: center;";
    label.appendChild(fallbackIcon);
  }
  label.appendChild(labelText);

  label.style.cssText = `
    position: fixed;
    background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
    color: white;
    padding: 3px 6px;
    border-radius: 5px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 12px;
    font-weight: 500;
    z-index: 9999999;
    pointer-events: none;
    display: none;
    align-items: center;
    gap: 3px;
    box-shadow: 0 2px 8px rgba(14, 165, 233, 0.25), 0 1px 3px rgba(0, 0, 0, 0.1);
    white-space: nowrap;
    border: 1px solid rgba(255, 255, 255, 0.2);
    opacity: 1;
    animation: labelFadeIn 0.3s ease-out;
  `;

  document.body.appendChild(label);

  let currentSettings = null;
  let labelTimeout = null;

  // Load initial settings
  void getSettings().then((s) => {
    currentSettings = s;
  });

  // Update settings when they change
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "local" && changes.translatorSettings) {
      currentSettings = changes.translatorSettings.newValue;
    }
  });

  // Check if instant is enabled for current domain
  function isInstantEnabledForCurrentDomain() {
    if (!currentSettings || !currentSettings.instantTranslateEnabled) {
      return false;
    }

    const matchingDomain = currentSettings.instantDomains?.find(
      (domainConfig) => domainConfig.enabled && domainMatchesLocation(domainConfig),
    );

    return !!matchingDomain;
  }

  // Hide label function
  function hideLabel() {
    if (labelTimeout) {
      clearTimeout(labelTimeout);
    }
    label.style.transition = "opacity 0.3s ease-out";
    label.style.opacity = "0";
    setTimeout(() => {
      label.style.display = "none";
      label.style.transition = "none";
      label.style.opacity = "0.88";
    }, 300);
  }

  // Show label once on focus
  function handleInputFocus(e) {
    if (!isEditableElement(e.target) || !isInstantEnabledForCurrentDomain()) {
      return;
    }

    // Clear any existing timeout
    if (labelTimeout) {
      clearTimeout(labelTimeout);
    }

    // Get input position - align left
    const rect = e.target.getBoundingClientRect();
    const offsetY = rect.top - 35; // Position above input
    const offsetX = rect.left; // Align left with input

    // Update label text with i18n
    labelText.textContent = i18n.t("label.instant") || "Instant";

    // Show label
    label.style.left = `${offsetX}px`;
    label.style.top = `${offsetY}px`;
    label.style.display = "flex";
    label.style.opacity = "0.88";
    label.style.transition = "none";

    // Auto-hide after 3.5 seconds
    labelTimeout = setTimeout(() => {
      hideLabel();
    }, 3500);

    // Hide on blur
    const handleBlur = () => {
      hideLabel();
      e.target.removeEventListener("blur", handleBlur);
    };
    e.target.addEventListener("blur", handleBlur);
  }

  // Add focus listener on document (capture phase)
  document.addEventListener("focus", handleInputFocus, true);
}

// ============================================
// SELECT-TO-TRANSLATE MODE
// ============================================

function showTranslateIcon(x, y, selection) {
  hideTranslateIcon();

  // Check if extension context is still valid
  if (!chrome.runtime?.id) {
    console.log("LinguaKit: Extension context invalidated, skipping icon creation");
    return;
  }

  try {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    const icon = document.createElement("div");
    icon.className = "bt-translate-icon bt-vars-container";

    // Use extension icon instead of SVG
    let iconUrl;
    try {
      iconUrl = isExtensionContextValid() ? chrome.runtime.getURL("assets/icons/icon-32.png") : "";
    } catch (error) {
      console.error("LinguaKit: Error getting icon URL for translate icon:", error.message);
      iconUrl = "";
    }

    if (iconUrl) {
      icon.innerHTML = `<img src="${iconUrl}" width="24" height="24" alt="Translate" />`;
    } else {
      icon.innerHTML = `<span style="font-size: 24px; width: 24px; height: 24px; display: inline-block; text-align: center;">🔄</span>`;
    }

    icon.style.position = "fixed";
    icon.style.zIndex = "9999999999";

    // Position near cursor - choose top or bottom based on viewport
    const viewport = getAvailableViewport();
    const spaceBelow = viewport.height - y;
    const spaceAbove = y;

    // If more space below, show below cursor; otherwise show above
    if (spaceBelow > 200 || spaceBelow > spaceAbove) {
      icon.style.left = `${x - 20}px`;
      icon.style.top = `${y + 12}px`;
      icon.dataset.position = "bottom";
    } else {
      icon.style.left = `${x - 20}px`;
      icon.style.top = `${y - 48}px`;
      icon.dataset.position = "top";
    }

    icon.addEventListener("click", (e) => {
      e.stopPropagation();
      // Pass selection rect instead of icon rect for better positioning
      void showTranslationPopup(rect, selectedText, icon.dataset.position);
    });

    document.body.appendChild(icon);
    selectionIcon = icon;
  } catch (error) {
    console.error("LinguaKit: Error creating translate icon:", error.message);
    // Extension context might be invalidated, clean up
    if (error.message.includes("Extension context invalidated")) {
      cleanupExtensionElements();
    }
  }
}

function hideTranslateIcon() {
  if (selectionIcon) {
    selectionIcon.remove();
    selectionIcon = null;
  }
}

// Helper function to get actual available viewport considering panels/devtools
function getAvailableViewport() {
  // Get the document's visible area
  const documentElement = document.documentElement;
  const body = document.body;

  // Calculate actual available space
  // Use document.documentElement.clientWidth/Height which excludes scrollbars
  // and is more accurate for content positioning
  const availableWidth = Math.min(
    window.innerWidth,
    documentElement.clientWidth,
    body ? body.clientWidth : window.innerWidth,
  );

  const availableHeight = Math.min(
    window.innerHeight,
    documentElement.clientHeight,
    body ? body.clientHeight : window.innerHeight,
  );

  // Also consider if there are any fixed elements that might reduce available space
  // Check for common panel/sidebar patterns
  const rightPanels = document.querySelectorAll(
    '[style*="position: fixed"][style*="right: 0"], .devtools-panel, .sidebar-panel',
  );
  const leftPanels = document.querySelectorAll('[style*="position: fixed"][style*="left: 0"], .left-panel');

  let rightOffset = 0;
  let leftOffset = 0;

  rightPanels.forEach((panel) => {
    const rect = panel.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      rightOffset = Math.max(rightOffset, rect.width);
    }
  });

  leftPanels.forEach((panel) => {
    const rect = panel.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      leftOffset = Math.max(leftOffset, rect.width);
    }
  });

  return {
    width: Math.max(300, availableWidth - rightOffset - leftOffset), // Minimum 300px
    height: Math.max(200, availableHeight), // Minimum 200px
    leftOffset: leftOffset,
    rightOffset: rightOffset,
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Helper function to safely make chrome.runtime calls
async function safeRuntimeCall(callback) {
  if (!isExtensionContextValid()) {
    throw new Error("Extension context invalidated");
  }

  try {
    return await callback();
  } catch (error) {
    if (
      error.message.includes("Extension context invalidated") ||
      error.message.includes("Could not establish connection") ||
      error.message.includes("receiving end does not exist")
    ) {
      cleanupExtensionElements();
      throw new Error("Extension context invalidated", { cause: error });
    }
    throw error;
  }
}

// Helper function to clean up extension elements when context is invalidated
function cleanupExtensionElements() {
  try {
    // Remove any existing popups or icons
    if (typeof hideTranslationPopup === "function") {
      hideTranslationPopup();
    }
    if (typeof hideTranslateIcon === "function") {
      hideTranslateIcon();
    }

    // Remove any inline suggestions
    if (typeof hideSuggestion === "function") {
      hideSuggestion();
    }

    // Clear current suggestion
    if (currentSuggestion) {
      try {
        currentSuggestion.destroy();
      } catch {
        // Ignore errors during cleanup
      }
      currentSuggestion = null;
    }

    // Clear timers
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    if (instantTimer) {
      clearTimeout(instantTimer);
      instantTimer = null;
    }

    // Clear any global timers
    if (window.linguakitCleanupTimer) {
      clearTimeout(window.linguakitCleanupTimer);
      window.linguakitCleanupTimer = null;
    }

    // Remove event listeners if they exist
    if (currentKeyHandler) {
      try {
        window.removeEventListener("keydown", currentKeyHandler, true);
        window.removeEventListener("keyup", currentKeyHandler, true);
        document.removeEventListener("keydown", currentKeyHandler, true);
        document.removeEventListener("keyup", currentKeyHandler, true);
      } catch {
        // Ignore errors during cleanup
      }
      currentKeyHandler = null;
    }

    // Remove any extension-created elements
    const extensionElements = document.querySelectorAll(
      ".bt-inline-suggestion, .bt-selection-popup, .bt-selection-icon, .bt-toast-notify, .bt-hover-popup",
    );
    extensionElements.forEach((el) => {
      try {
        el.remove();
      } catch {
        // Ignore errors during cleanup
      }
    });

    console.log("LinguaKit: Cleaned up extension elements due to context invalidation");
  } catch (error) {
    // Ignore cleanup errors - we're already in an error state
    console.log("LinguaKit: Error during cleanup (ignored):", error.message);
  }
}

// Helper function to check if extension context is valid
function isExtensionContextValid() {
  try {
    // Check if chrome.runtime exists and has an id
    if (!chrome || !chrome.runtime || !chrome.runtime.id) {
      return false;
    }

    // Try to access a runtime property to ensure context is truly valid
    chrome.runtime.getURL("test");
    return true;
  } catch {
    return false;
  }
}

// Helper function to ensure popup stays within viewport bounds
function ensurePopupInViewport(popup, selectionRect) {
  const rect = popup.getBoundingClientRect();
  const viewport = getAvailableViewport();

  let adjustedLeft = parseFloat(popup.style.left);
  let positionChanged = false;

  // Adjust horizontal position if popup goes off-screen
  // Consider left and right offsets from panels
  const maxRight = viewport.width + viewport.leftOffset - 10;
  const minLeft = viewport.leftOffset + 10;

  if (rect.right > maxRight) {
    adjustedLeft = maxRight - rect.width;
    popup.style.left = `${adjustedLeft}px`;
    positionChanged = true;
  }
  if (rect.left < minLeft) {
    adjustedLeft = minLeft;
    popup.style.left = `${adjustedLeft}px`;
    positionChanged = true;
  }

  // Recalculate arrow position if horizontal position changed
  if (positionChanged && selectionRect) {
    const selectionCenter = selectionRect.left + selectionRect.width / 2;
    const newArrowLeft = selectionCenter - adjustedLeft;
    // Ensure arrow stays within popup bounds (at least 20px from edges)
    const clampedArrowLeft = Math.max(20, Math.min(newArrowLeft, rect.width - 20));
    popup.style.setProperty("--bt-arrow-left", `${clampedArrowLeft}px`);
  }

  // Adjust vertical position if popup goes off-screen
  if (popup.style.top && rect.bottom > viewport.height - 10) {
    // If using top positioning and popup goes below viewport
    const newTop = Math.max(10, viewport.height - rect.height - 10);
    popup.style.top = `${newTop}px`;
  }

  if (popup.style.bottom && rect.top < 10) {
    // If using bottom positioning and popup goes above viewport
    const newBottom = Math.max(10, viewport.height - rect.height - 10);
    popup.style.bottom = `${newBottom}px`;
  }
}

// Helper function to readjust popup position after content is loaded
function readjustPopupAfterContentLoad(popup, selectionRect) {
  // Wait a bit for content to render, then readjust
  setTimeout(() => {
    ensurePopupInViewport(popup, selectionRect);
  }, 100);

  // Also readjust after a longer delay to catch any async content loading
  setTimeout(() => {
    ensurePopupInViewport(popup, selectionRect);
  }, 500);
}

async function showTranslationPopup(selectionRect, text, iconPosition) {
  // Check if extension context is still valid
  if (!isExtensionContextValid()) {
    console.log("LinguaKit: Extension context invalidated, cannot show popup");
    return;
  }

  try {
    hideTranslationPopup();

    // Fetch settings first to ensure i18n is updated
    const settings = await getSettings();
    const safeOriginalText = escapeHtml(text);

    const popup = document.createElement("div");
    let iconUrl;
    try {
      iconUrl = isExtensionContextValid() ? chrome.runtime.getURL("assets/icons/icon-19.png") : "";
    } catch (error) {
      console.error("LinguaKit: Error getting icon URL for popup:", error.message);
      iconUrl = "";
    }
    popup.className = "bt-selection-popup bt-vars-container";
    try {
      const themeData = await chrome.storage.local.get("theme");
      if (themeData && themeData.theme === "dark") {
        popup.classList.add("dark");
      }
    } catch (err) {
      console.error("LinguaKit: Error reading theme setting for selection popup:", err);
    }
    popup.innerHTML = `
    <div class="bt-selection-header">
      <span class="bt-selection-title">
        ${iconUrl ? `<img src="${iconUrl}" width="19" height="19" alt="Translate" style="float:left;margin-right:4px" />` : '<span style="float:left;margin-right:4px;font-size:19px;">🔄</span>'} 
        <span>${i18n.t("selection.title")}</span>
      </span>
      <button class="bt-selection-close">×</button>
    </div>
    <div class="bt-selection-content">
      <div class="bt-selection-original">
        <label>
          ${i18n.t("selection.original")}
          <select class="bt-selection-source-select"></select>
        </label>
        <div class="bt-selection-result-container">
          <div class="bt-selection-text-container bt-selection-content-style">
            <button class="bt-speak-btn bt-speak-source" title="${i18n.t("selection.listen")}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path class="bt-wave-2" d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                <path class="bt-wave-1" d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              </svg>
            </button>
            <div class="bt-selection-text-content">${safeOriginalText}</div>
          </div>
          <button class="bt-selection-copy-btn bt-copy-original" title="${i18n.t("selection.copy")}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            <span class="bt-copy-feedback">${i18n.t("selection.copied")}</span>
          </button>
        </div>
      </div>
      <div class="bt-selection-translated">
        <label>
          ${i18n.t("selection.translate")}
          <select class="bt-selection-target-select"></select>
        </label>
        <div class="bt-selection-result-container">
          <div class="bt-selection-text-container bt-selection-content-style">
            <button class="bt-speak-btn bt-speak-target" title="${i18n.t("selection.listen")}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path class="bt-wave-2" d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                <path class="bt-wave-1" d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              </svg>
            </button>
            <div class="bt-selection-text-content bt-loading-text">${i18n.t("dialog.translating")}</div>
          </div>
          <button class="bt-selection-copy-btn" title="${i18n.t("selection.copy")}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            <span class="bt-copy-feedback">${i18n.t("selection.copied")}</span>
          </button>
        </div>
    </div>
    <div class="bt-selection-smart-actions">
      <div class="bt-smart-dropdown">
        <button class="bt-smart-btn bt-tone-btn" title="${i18n.t("selection.tone")}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          <span>${i18n.t("selection.tone")}</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <div class="bt-smart-dropdown-content">
          <button data-task="tone-professional">${i18n.t("selection.toneProfessional")}</button>
          <button data-task="tone-casual">${i18n.t("selection.toneCasual")}</button>
        </div>
      </div>
      <div class="bt-smart-dropdown">
        <button class="bt-smart-btn bt-tone-btn" title="${i18n.t("selection.tools")}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>
          <span>${i18n.t("selection.tools")}</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <div class="bt-smart-dropdown-content">
          <button data-task="summarize">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h7"></path></svg>
            <span>${i18n.t("selection.summarize")}</span>
          </button>
          <button data-task="improve">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            <span>${i18n.t("selection.improve")}</span>
          </button>
          <button data-task="explain">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <span>${i18n.t("selection.explain")}</span>
          </button>
          <button data-task="correct">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            <span>${i18n.t("selection.correct")}</span>
          </button>
          <button data-task="simplify">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A5 5 0 0 0 8 8c0 1 .3 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"></path><line x1="9" y1="18" x2="15" y2="18"></line><line x1="10" y1="22" x2="14" y2="22"></line></svg>
            <span>${i18n.t("selection.simplify")}</span>
          </button>
        </div>
      </div>
    </div>
    <div class="bt-selection-footer">
      <div class="bt-selection-provider-container">
        <!-- Provider selector or label will be injected here -->
      </div>
    </div>
    <div class="bt-selection-resize-handle" title="${i18n.t("selection.resize")}">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M9 1L1 9M9 5L5 9M9 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </div>
  `;

    popup.style.position = "fixed";
    popup.style.zIndex = "9999999999";

    // Center popup based on SELECTION rect
    // First, add popup to DOM to get actual dimensions
    document.body.appendChild(popup);
    const tempRect = popup.getBoundingClientRect();
    const actualPopupWidth = tempRect.width;

    // Get available viewport considering panels
    const viewport = getAvailableViewport();

    const selectionCenter = selectionRect.left + selectionRect.width / 2;
    const left = selectionCenter - actualPopupWidth / 2;

    // Ensure popup doesn't go off-screen horizontally
    // Consider panel offsets
    const maxLeft = viewport.width + viewport.leftOffset - actualPopupWidth - 10;
    const minLeft = viewport.leftOffset + 10;
    const finalLeft = Math.max(minLeft, Math.min(left, maxLeft));

    // Calculate arrow position relative to popup
    // Arrow should point to selection center
    const arrowLeft = selectionCenter - finalLeft;
    popup.style.setProperty("--bt-arrow-left", `${arrowLeft}px`);

    // Vertical positioning: close to selection with overflow check
    // Get initial popup dimensions after adding to DOM
    const initialRect = popup.getBoundingClientRect();

    // Estimate final popup height (accounting for content that will be loaded)
    // Use a more conservative estimate since content will be added
    const estimatedPopupHeight = Math.max(initialRect.height, 200); // Minimum 200px for safety

    // Calculate available space above and below selection
    const spaceAbove = selectionRect.top;
    const spaceBelow = viewport.height - selectionRect.bottom;

    // Determine best position based on available space and estimated popup height
    let finalPosition = iconPosition;

    if (iconPosition === "bottom") {
      // Check if popup fits below selection with some buffer
      if (selectionRect.bottom + 8 + estimatedPopupHeight > viewport.height - 20) {
        // Not enough space below, check if there's more space above
        if (spaceAbove > spaceBelow && spaceAbove >= estimatedPopupHeight + 28) {
          finalPosition = "top";
        }
      }
    } else {
      // Check if popup fits above selection with some buffer
      if (selectionRect.top - 8 - estimatedPopupHeight < 20) {
        // Not enough space above, check if there's more space below
        if (spaceBelow > spaceAbove && spaceBelow >= estimatedPopupHeight + 28) {
          finalPosition = "bottom";
        }
      }
    }

    // Apply final positioning with better calculations
    if (finalPosition === "bottom") {
      popup.style.left = `${finalLeft}px`;
      // Ensure popup doesn't go below viewport, with extra buffer
      const maxTop = viewport.height - estimatedPopupHeight - 20;
      popup.style.top = `${Math.min(selectionRect.bottom + 8, maxTop)}px`;
      popup.classList.add("bt-popup-bottom");
      popup.classList.remove("bt-popup-top");
    } else {
      popup.style.left = `${finalLeft}px`;
      // Ensure popup doesn't go above viewport, with extra buffer
      const maxBottom = viewport.height - selectionRect.top + 8;
      const minBottom = estimatedPopupHeight + 20;
      popup.style.bottom = `${Math.min(maxBottom, viewport.height - minBottom)}px`;
      popup.classList.add("bt-popup-top");
      popup.classList.remove("bt-popup-bottom");
    }
    selectionPopup = popup;
    popup.originalText = text;
    popup.activeTask = "translate";

    // Store selectionRect for later use in readjustment
    popup.selectionRect = selectionRect;

    // Ensure popup stays within viewport bounds after positioning
    ensurePopupInViewport(popup, selectionRect);

    // Schedule readjustment after content loads
    readjustPopupAfterContentLoad(popup, selectionRect);

    // Final arrow position adjustment is now handled in ensurePopupInViewport

    // Make draggable
    const header = popup.querySelector(".bt-selection-header");
    makeDraggable(popup, header);

    // Make resizable
    const resizeHandle = popup.querySelector(".bt-selection-resize-handle");
    makeResizable(popup, resizeHandle);

    // Hide icon when popup opens
    hideTranslateIcon();

    // Populate selectors (Mirror Logic)
    const nativeLang = settings.nativeLanguageCode || "vi";
    const targetLang = settings.targetLanguageCode || "en";

    let defaultSource, defaultTarget;

    if (!settings.useAutoDetect) {
      // Fixed direction (Mirror Logic)
      defaultSource = targetLang;
      defaultTarget = nativeLang;
    } else {
      // Auto-detect mode
      defaultSource = "auto";
      defaultTarget = targetLang;
    }

    // Override with last used selection languages if available
    if (settings.selectionLastSource) {
      defaultSource = settings.selectionLastSource;
    }
    if (settings.selectionLastTarget) {
      defaultTarget = settings.selectionLastTarget;
    }

    // Populate selectors
    populateLanguageSelector(popup.querySelector(".bt-selection-source-select"), defaultSource, true);
    populateLanguageSelector(popup.querySelector(".bt-selection-target-select"), defaultTarget, false);

    // Initial translation
    void translateSelectionWithSource(text, defaultSource, popup, null, defaultTarget);

    popup.querySelector(".bt-selection-close").addEventListener("click", () => {
      hideTranslationPopup();
      hideTranslateIcon();
    });

    popup.querySelector(".bt-selection-source-select").addEventListener("change", (e) => {
      const providerSelect = popup.querySelector(".bt-selection-provider-select");
      const providerId = providerSelect ? providerSelect.value : null;
      const currentTargetLang = popup.querySelector(".bt-selection-target-select").value;

      // Save preference
      try {
        void safeRuntimeCall(() =>
          chrome.runtime.sendMessage({
            type: "set-settings",
            settings: Object.assign({}, settings, { selectionLastSource: e.target.value }),
          }),
        );
      } catch (error) {
        console.error("LinguaKit: Error saving source preference:", error.message);
      }

      void translateSelectionWithSource(text, e.target.value, popup, providerId, currentTargetLang);
    });

    popup.querySelector(".bt-selection-target-select").addEventListener("change", (e) => {
      const providerSelect = popup.querySelector(".bt-selection-provider-select");
      const providerId = providerSelect ? providerSelect.value : null;
      const sourceLang = popup.querySelector(".bt-selection-source-select").value;

      // Save preference
      try {
        void safeRuntimeCall(() =>
          chrome.runtime.sendMessage({
            type: "set-settings",
            settings: Object.assign({}, settings, { selectionLastTarget: e.target.value }),
          }),
        );
      } catch (error) {
        console.error("LinguaKit: Error saving target preference:", error.message);
      }

      void translateSelectionWithSource(text, sourceLang, popup, providerId, e.target.value);
    });

    // Populate provider selector
    const providerSelect = populateProviderSelector(popup, settings);
    if (providerSelect) {
      providerSelect.addEventListener("change", (e) => {
        const sourceLang = popup.querySelector(".bt-selection-source-select").value;
        const currentTargetLang = popup.querySelector(".bt-selection-target-select").value;
        void translateSelectionWithSource(text, sourceLang, popup, e.target.value, currentTargetLang);
      });
    }

    // Smart Action listeners
    popup.querySelectorAll("[data-task]").forEach((btn) => {
      btn.addEventListener("click", (_e) => {
        const task = btn.dataset.task;
        const currentProviderSelect = popup.querySelector(".bt-selection-provider-select");
        const providerId = currentProviderSelect ? currentProviderSelect.value : null;

        // Force AI provider for smart tasks if currently using Google Translate
        let effectiveProviderId = providerId;
        if (task !== "translate" && (!providerId || providerId === "google-translate")) {
          const aiProvider = settings.providers?.find((p) => p.type !== "google-translate");
          if (aiProvider) {
            effectiveProviderId = aiProvider.id;
            if (currentProviderSelect) currentProviderSelect.value = aiProvider.id;
          } else {
            showToast(i18n.t("toast.aiProviderRequired"));
            return;
          }
        }

        void translateSelectionWithSource(text, "auto", popup, effectiveProviderId, null, task);
      });
    });

    // Copy buttons
    const copyBtnTarget = popup.querySelector(".bt-selection-translated .bt-selection-copy-btn");
    copyBtnTarget.addEventListener("click", async () => {
      const textToCopy = popup.querySelector(".bt-selection-translated .bt-selection-text-content").textContent;
      if (!textToCopy || textToCopy === i18n.t("dialog.translating")) return;

      try {
        await navigator.clipboard.writeText(textToCopy);
        copyBtnTarget.classList.add("bt-copied");
        setTimeout(() => copyBtnTarget.classList.remove("bt-copied"), 2000);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    });

    const copyBtnOriginal = popup.querySelector(".bt-selection-original .bt-selection-copy-btn");
    copyBtnOriginal.addEventListener("click", async () => {
      const textToCopy = popup.querySelector(".bt-selection-original .bt-selection-text-content").textContent;
      if (!textToCopy) return;

      try {
        await navigator.clipboard.writeText(textToCopy);
        copyBtnOriginal.classList.add("bt-copied");
        setTimeout(() => copyBtnOriginal.classList.remove("bt-copied"), 2000);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    });

    // TTS Handlers
    popup.querySelector(".bt-speak-source").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      if (btn.classList.contains("bt-speak-loading")) return;

      const sourceLang = popup.querySelector(".bt-selection-source-select").value;
      const textToSpeak = text; // Original text

      btn.classList.add("bt-speak-loading");
      try {
        await tts.play(textToSpeak, sourceLang === "auto" ? "en" : sourceLang);
      } catch (err) {
        console.error("TTS Error:", err);
      } finally {
        btn.classList.remove("bt-speak-loading");
      }
    });

    popup.querySelector(".bt-speak-target").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      if (btn.classList.contains("bt-speak-loading")) return;

      const currentTargetLang = popup.querySelector(".bt-selection-target-select").value;
      const textToSpeak = popup.querySelector(".bt-selection-translated .bt-selection-text-content").textContent;

      if (textToSpeak && textToSpeak !== i18n.t("dialog.translating")) {
        btn.classList.add("bt-speak-loading");
        try {
          await tts.play(textToSpeak, currentTargetLang);
        } catch (err) {
          console.error("TTS Error:", err);
        } finally {
          btn.classList.remove("bt-speak-loading");
        }
      }
    });
  } catch (error) {
    console.error("LinguaKit: Error showing translation popup:", error.message);
    // Extension context might be invalidated, clean up
    if (error.message.includes("Extension context invalidated")) {
      cleanupExtensionElements();
    }
  }
}

function hideTranslationPopup() {
  if (selectionPopup) {
    selectionPopup.remove();
    selectionPopup = null;
  }
}

async function translateSelectionWithSource(
  text,
  sourceLang,
  popup,
  providerId = null,
  targetLangOverride = null,
  task = "translate",
) {
  if (popup) {
    popup.activeTask = task;
  }
  const settings = await getSettings();
  const nativeLang = settings.nativeLanguageCode || "vi";
  const targetLang = targetLangOverride || nativeLang;

  const translatedDiv = popup.querySelector(".bt-selection-translated .bt-selection-text-content");
  const translatedLabel = popup.querySelector(".bt-selection-translated label");

  // Update label based on task
  if (task === "summarize") {
    translatedLabel.firstChild.textContent = i18n.t("selection.summary") + " ";
  } else if (task === "improve") {
    translatedLabel.firstChild.textContent = i18n.t("selection.improved") + " ";
  } else if (task.startsWith("tone")) {
    translatedLabel.firstChild.textContent = i18n.t("selection.rewritten") + " ";
  } else if (task === "explain") {
    translatedLabel.firstChild.textContent = i18n.t("selection.explanation") + " ";
  } else if (task === "correct") {
    translatedLabel.firstChild.textContent = i18n.t("selection.corrected") + " ";
  } else if (task === "simplify") {
    translatedLabel.firstChild.textContent = i18n.t("selection.simplified") + " ";
  } else {
    translatedLabel.firstChild.textContent = i18n.t("selection.translate") + " ";
  }

  translatedDiv.textContent = i18n.t("dialog.translating");
  translatedDiv.classList.add("bt-loading-text");

  // If source and target are the same, return original text immediately (only for translation task)
  if (task === "translate" && sourceLang !== "auto" && sourceLang === targetLang) {
    translatedDiv.textContent = text;
    translatedDiv.classList.remove("bt-loading-text");
    // Readjust popup position after content change
    setTimeout(() => ensurePopupInViewport(popup, popup.selectionRect), 50);
    return;
  }

  try {
    const res = await requestTranslation({
      text: text,
      nativeLanguageCode: nativeLang,
      targetLanguage: targetLang,
      sourceLanguage: sourceLang, // Pass explicit source language
      useAutoDetect: sourceLang === "auto" ? true : settings.useAutoDetect === true,
      providerId: providerId, // Pass provider override
      task: task,
    });

    if (res?.ok && res.result?.translation) {
      translatedDiv.textContent = res.result.translation;
      translatedDiv.classList.remove("bt-loading-text");
    } else {
      // Show actual error message from background/provider
      translatedDiv.textContent = res?.error || i18n.t("toast.translationFailed");
      translatedDiv.classList.remove("bt-loading-text");
    }

    // Readjust popup position after content is loaded
    setTimeout(() => ensurePopupInViewport(popup, popup.selectionRect), 50);
  } catch (err) {
    translatedDiv.textContent = "Error: " + err.message;
    translatedDiv.classList.remove("bt-loading-text");
    // Readjust popup position even on error
    setTimeout(() => ensurePopupInViewport(popup, popup.selectionRect), 50);
  }
}

let lastPopupCloseTime = 0;

function registerSelectionMode() {
  document.addEventListener("mouseup", (e) => {
    // Ignore if clicking on icon or popup
    if (e.target.closest(".bt-translate-icon") || e.target.closest(".bt-selection-popup")) {
      return;
    }

    // Ignore if we just closed the popup (within 200ms)
    if (Date.now() - lastPopupCloseTime < 200) {
      return;
    }

    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection.toString().trim();

      if (text && text.length > 0) {
        // If popup is already open for this text, don't show icon
        if (selectionPopup && selectedText === text) {
          return;
        }

        selectedText = text;
        showTranslateIcon(e.clientX, e.clientY, selection);
      } else {
        hideTranslateIcon();
        // Don't hide popup here, let mousedown handle it (so we can copy text from popup)
      }
    }, 10);
  });

  document.addEventListener("mousedown", (e) => {
    // 1. Handle Popup Open State
    if (selectionPopup) {
      if (!selectionPopup.contains(e.target)) {
        // Clicked outside popup
        // Prevent default to PRESERVE selection
        e.preventDefault();
        e.stopPropagation();
        hideTranslationPopup();
        lastPopupCloseTime = Date.now();
      }
      return;
    }

    // 2. Handle Icon Open State (Popup is closed)
    if (selectionIcon) {
      if (!selectionIcon.contains(e.target)) {
        // Clicked outside icon
        // Let default behavior happen (selection clears)
        hideTranslateIcon();
      }
    }
  });
}

function populateLanguageSelector(select, defaultValue = "auto", includeAuto = true) {
  if (!select) return;

  const languages = includeAuto
    ? ["auto", "en", "vi", "ja", "zh", "ko", "es", "fr", "de", "ru", "pt", "it", "hi", "ar", "tr", "nl", "pl", "th"]
    : ["en", "vi", "ja", "zh", "ko", "es", "fr", "de", "ru", "pt", "it", "hi", "ar", "tr", "nl", "pl", "th"];

  languages.forEach((code) => {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = i18n.t("lang." + code);
    select.appendChild(option);
  });

  select.value = defaultValue;
}

function populateProviderSelector(popup, settings) {
  const container = popup.querySelector(".bt-selection-provider-container");
  const providers = settings.providers || [];
  const activeId = settings.activeProviderId || "google-translate";

  if (providers.length <= 1) {
    // Show as a label tag
    const provider = providers[0] || { name: "Google Translate" };
    const tag = document.createElement("span");
    tag.className = "bt-selection-provider-tag";
    tag.textContent = `Model: ${provider.name}`;
    container.appendChild(tag);
  } else {
    // Show as a select dropdown
    const label = document.createElement("span");
    label.className = "bt-selection-provider-label";
    label.textContent = "Model: ";

    const select = document.createElement("select");
    select.className = "bt-selection-provider-select";

    providers.forEach((p) => {
      const option = document.createElement("option");
      option.value = p.id;
      option.textContent = p.name;
      if (p.id === activeId) option.selected = true;
      select.appendChild(option);
    });

    container.appendChild(label);
    container.appendChild(select);

    return select;
  }
  return null;
}

function makeDraggable(element, handle) {
  let pos1 = 0,
    pos2 = 0,
    pos3 = 0,
    pos4 = 0;

  function dragMouseDown(e) {
    e = e || window.event;
    // Only allow left click
    if (e.button !== 0) return;

    // Don't drag if clicking on the close button
    if (e.target.closest(".bt-selection-close")) return;

    e.preventDefault();

    // Convert bottom/right to top/left if needed for consistent math
    const rect = element.getBoundingClientRect();
    element.style.bottom = "auto";
    element.style.right = "auto";
    element.style.top = rect.top + "px";
    element.style.left = rect.left + "px";

    // Get the mouse cursor position at startup
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.addEventListener("mouseup", closeDragElement);
    document.addEventListener("mousemove", elementDrag);
  }

  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();
    // Calculate the new cursor position
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    // Set the element's new position
    element.style.top = element.offsetTop - pos2 + "px";
    element.style.left = element.offsetLeft - pos1 + "px";

    // Remove arrow class when dragged to avoid visual artifacts
    element.classList.remove("bt-popup-top", "bt-popup-bottom");
  }

  function closeDragElement() {
    // Stop moving when mouse button is released
    document.removeEventListener("mouseup", closeDragElement);
    document.removeEventListener("mousemove", elementDrag);
  }

  handle.addEventListener("mousedown", dragMouseDown);
}

function makeResizable(element, handle) {
  const MIN_WIDTH = 320;
  const MIN_HEIGHT = 150;

  handle.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    // Snapshot starting state
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = element.offsetWidth;
    const startH = element.offsetHeight;

    // Freeze width/height so flexbox doesn't interfere
    element.style.width = startW + "px";
    element.style.height = startH + "px";
    // Disable max-width/max-height constraints during resize
    element.style.maxWidth = "none";
    element.style.maxHeight = "none";

    function onMouseMove(ev) {
      const newW = Math.max(MIN_WIDTH, startW + ev.clientX - startX);
      const newH = Math.max(MIN_HEIGHT, startH + ev.clientY - startY);
      element.style.width = newW + "px";
      element.style.height = newH + "px";
    }

    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });
}

// Hover translate state
let hoverModifierPressed = false;
let hoverTranslateCache = new Map();
let currentHoveredElement = null;
let hoverTimeout = null;
let lastMouseX = 0;
let lastMouseY = 0;

document.addEventListener(
  "mousemove",
  (e) => {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  },
  { passive: true },
);

function registerHoverTranslate() {
  // Track modifier key state
  document.addEventListener(
    "keydown",
    async (e) => {
      const settings = await getSettings();

      if (!settings.hoverTranslateEnabled) {
        return;
      }

      const isOnDomain = isHoverTranslateDomain(settings);

      if (!isOnDomain) {
        return;
      }

      const key = settings.hoverModifierKey || "ctrl";

      if ((key === "ctrl" && e.ctrlKey) || (key === "shift" && e.shiftKey) || (key === "alt" && e.altKey)) {
        hoverModifierPressed = true;
        document.body.classList.add("bt-hover-translate-active");

        // Apply custom styles
        applyHoverCustomStyles(settings.hoverInjectStyle);

        // Trigger translation or toggle if already hovering over an element
        const element = document.elementFromPoint(lastMouseX, lastMouseY);
        if (element) {
          // Check if hovering over a translation or an already translated element
          const translationEl = element.closest(".bt-hover-translation");
          const originalEl = element.closest('[data-bt-translated="true"]');

          if (translationEl) {
            // Hovering over translation -> Close it

            const prev = translationEl.previousElementSibling;
            if (prev && prev.dataset.btTranslated) {
              delete prev.dataset.btTranslated;
              prev.classList.remove("bt-hover-original");
            }
            translationEl.remove();
            return;
          }

          if (originalEl) {
            // Hovering over original that is already translated -> Close it

            const next = originalEl.nextElementSibling;
            if (next && next.classList.contains("bt-hover-translation")) {
              next.remove();
            }
            delete originalEl.dataset.btTranslated;
            originalEl.classList.remove("bt-hover-original");
            return;
          }

          const translatable = findTranslatableElement(element);
          if (translatable) {
            // Unique Mode: Clear all other translations if enabled
            // Note: We also check this inside handleHoverTranslate for mouseover events
            if (settings.hoverUniqueMode !== false) {
              clearAllHoverTranslations();
            }

            void handleHoverTranslate(translatable, settings);
          }
        }
      }
    },
    true,
  );

  document.addEventListener(
    "keyup",
    async (e) => {
      const settings = await getSettings();
      const key = settings.hoverModifierKey || "ctrl";

      if ((key === "ctrl" && !e.ctrlKey) || (key === "shift" && !e.shiftKey) || (key === "alt" && !e.altKey)) {
        hoverModifierPressed = false;
        document.body.classList.remove("bt-hover-translate-active");
        // clearAllHoverTranslations(); // Don't clear on key release
      }
    },
    true,
  );

  // Hover detection with debouncing
  document.addEventListener(
    "mouseover",
    async (e) => {
      if (!hoverModifierPressed) return;

      const settings = await getSettings();
      if (!isHoverTranslateDomain(settings)) {
        return;
      }

      clearTimeout(hoverTimeout);
      const element = findTranslatableElement(e.target);

      if (!element) {
        return;
      }
      if (element === currentHoveredElement) {
        return;
      }

      currentHoveredElement = element;
      hoverTimeout = setTimeout(() => {
        void handleHoverTranslate(element, settings);
      }, 200);
    },
    true,
  );

  document.addEventListener(
    "mouseout",
    () => {
      clearTimeout(hoverTimeout);
    },
    true,
  );
}

/**
 * Check if element is a translation boundary (should not traverse beyond) Boundaries are containers for individual
 * messages/content blocks on chat platforms
 */
function isTranslationBoundary(element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;

  // Discord: message content divs have class containing 'messageContent' or ID starting with 'message-content-'
  const className = element.className || "";
  const id = element.id || "";

  // Check Discord patterns
  if (className.includes("messageContent") || id.startsWith("message-content-")) {
    return true;
  }

  // Slack: message blocks
  if (className.includes("p-rich_text_section") || className.includes("c-message__body")) {
    return true;
  }

  // Telegram Web: message bubbles
  if (className.includes("message-content") || className.includes("text-content")) {
    return true;
  }

  // Generic: data attributes that might indicate message boundaries
  if (element.hasAttribute("data-message-id") || element.hasAttribute("data-msg-id")) {
    return true;
  }

  return false;
}

/** Find the nearest boundary ancestor (if any) */
function findBoundaryAncestor(element) {
  let current = element;
  while (current && current !== document.body) {
    if (isTranslationBoundary(current)) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function findTranslatableElement(target) {
  let element = target;
  let depth = 0;
  const maxDepth = 5;

  // Find boundary first - we should not traverse beyond this
  const boundary = findBoundaryAncestor(target);

  while (element && depth < maxDepth) {
    // CRITICAL: If we have a boundary, never go beyond it
    // Check if current element is at or beyond the boundary
    if (boundary) {
      // If we've reached the boundary's parent, stop and return boundary
      if (element === boundary.parentElement || !boundary.contains(element)) {
        return boundary;
      }
    }

    // Ignore our own translation elements
    if (element.classList.contains("bt-hover-translation")) return null;

    // Ignore interactive elements to avoid conflict
    if (["BUTTON", "INPUT", "TEXTAREA", "SELECT", "A"].includes(element.tagName)) {
      // Unless it's a link with significant text, maybe? For now, skip to avoid issues.
      // Actually, users might want to translate links. Let's allow A if it has text.
      if (element.tagName !== "A") {
        element = element.parentElement;
        depth++;
        continue;
      }
    }

    const text = element.textContent?.trim();

    if (text && text.length > 2 && text.length < 2000) {
      // Adjusted limits
      const tagName = element.tagName?.toLowerCase();
      // Block-level elements only (removed 'span', 'a', 'b', 'i' to prioritize containers)
      if (
        [
          "div",
          "p",
          "article",
          "section",
          "li",
          "td",
          "th",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
          "blockquote",
          "pre",
        ].includes(tagName)
      ) {
        // If this element IS the boundary, return it directly (skip container checks)
        if (boundary && element === boundary) {
          return element;
        }

        // Smart check: If it's a DIV/SECTION, ensure it's not just a container of other blocks
        // We prefer "leaf" blocks or blocks with mostly text
        if (["div", "section", "article"].includes(tagName)) {
          const childBlockCount = element.querySelectorAll("div, p, section, article, li").length;
          // If it has too many block children, it's likely a container. Skip it unless it has direct text.
          if (childBlockCount > 3) {
            // Check if it has significant direct text
            const directText = Array.from(element.childNodes)
              .filter((n) => n.nodeType === Node.TEXT_NODE)
              .map((n) => n.textContent.trim())
              .join("");
            if (directText.length < 50) {
              // If this would take us beyond boundary, return boundary instead
              if (
                boundary &&
                (element.parentElement === boundary.parentElement || !boundary.contains(element.parentElement))
              ) {
                return boundary;
              }
              element = element.parentElement;
              depth++;
              continue;
            }
          }
        }

        const textNodes = Array.from(element.childNodes).filter(
          (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim(),
        );

        // Allow if it has text nodes OR is a small container
        if (textNodes.length > 0 || element.children.length <= 3) {
          // LIST PROMOTION: If we found a list item, select the whole list
          // BUT NOT if there's a boundary - in chat apps, each LI is a separate message
          if (["LI", "DT", "DD"].includes(element.tagName)) {
            // If we have a boundary ancestor, don't promote - return the boundary
            if (boundary) {
              return boundary;
            }
            return element.closest("ul, ol, dl") || element.parentElement;
          }
          return element;
        }
      }
    }

    element = element.parentElement;
    depth++;
  }

  // If we have a boundary but didn't find suitable element, return boundary
  if (boundary) {
    return boundary;
  }

  return null;
}

async function handleHoverTranslate(element, settings) {
  // Always use innerHTML to capture any potential formatting
  const text = element.innerHTML?.trim();

  if (!text) {
    return;
  }

  // Get granularity setting (default: 'line')
  const granularity = settings.hoverTranslateGranularity || "line";

  // Unique Mode Check (Fix: Moved inside handler to catch mouseover events)
  if (settings.hoverUniqueMode !== false) {
    clearAllHoverTranslations();
  }

  // Route to appropriate translation method based on granularity
  if (granularity === "line") {
    await handleLineByLineTranslate(
      element,
      text,
      settings,
      createHoverPlaceholder,
      updateHoverContent,
      requestTranslation,
      hoverTranslateCache,
      clearAllHoverTranslations,
    );
    return;
  } else if (granularity === "sentence") {
    await handleSentenceBySentenceTranslate(
      element,
      text,
      settings,
      createHoverPlaceholder,
      updateHoverContent,
      requestTranslation,
      hoverTranslateCache,
      clearAllHoverTranslations,
    );
    return;
  }

  // Default: Block mode (existing behavior)
  // Create placeholder immediately
  const placeholder = createHoverPlaceholder(element, settings);

  // Include providerId in cache key to support provider switching
  const cacheKey = `${text}-${settings.nativeLanguageCode}-${settings.activeProviderId}`;
  if (hoverTranslateCache.has(cacheKey)) {
    updateHoverContent(placeholder, hoverTranslateCache.get(cacheKey), settings);
    return;
  }

  try {
    const res = await requestTranslation({
      text: text,
      nativeLanguageCode: settings.nativeLanguageCode || "en",
      targetLanguage: settings.nativeLanguageCode || "vi", // Translate TO native language
      sourceLanguage: settings.targetLanguageCode || "en", // FROM target language (e.g., English web content)
      useAutoDetect: false, // Fixed Target→Native for hover
    });

    if (res?.ok && res.result?.translation) {
      const translation = res.result.translation;
      hoverTranslateCache.set(cacheKey, translation);
      updateHoverContent(placeholder, translation, settings);
    } else {
      // Show error inline instead of removing
      updateHoverContent(placeholder, `❌ ${res?.error || "Translation failed"}`, settings, true);
    }
  } catch (err) {
    // Show error inline instead of removing
    updateHoverContent(placeholder, `❌ ${err.message || "Error"}`, settings, true);
  }
}

function createHoverPlaceholder(element, settings) {
  // Check if already exists
  let existing = element.nextElementSibling;
  if (existing && existing.classList.contains("bt-hover-translation")) {
    return existing;
  }

  // Create element of the same tag to mimic structure
  const translationEl = document.createElement(element.tagName);
  translationEl.className = "bt-hover-translation";

  // Copy styles from original element to look like a clone
  const computedStyle = window.getComputedStyle(element);

  // Copy text styles
  translationEl.style.fontFamily = computedStyle.fontFamily;
  translationEl.style.fontSize = settings.hoverInjectStyle?.fontSize || computedStyle.fontSize;
  translationEl.style.fontWeight = computedStyle.fontWeight;
  translationEl.style.fontStyle = computedStyle.fontStyle;
  translationEl.style.lineHeight = computedStyle.lineHeight;
  translationEl.style.textAlign = computedStyle.textAlign;
  translationEl.style.letterSpacing = computedStyle.letterSpacing;

  // Color Logic:
  // Always transparent background.
  // Use user's textColor (default Red #ff0000).
  translationEl.style.backgroundColor = "transparent";
  translationEl.style.color = settings.hoverInjectStyle?.textColor || "#ff0000";

  // Copy layout styles
  translationEl.style.padding = computedStyle.padding;
  translationEl.style.margin = computedStyle.margin;
  translationEl.style.marginTop = "4px"; // Add slight separation
  translationEl.style.width = computedStyle.width !== "auto" ? computedStyle.width : "100%";
  translationEl.style.boxSizing = "border-box";

  // Ensure block display for proper positioning below
  translationEl.style.display = "block";

  const style = settings.hoverInjectStyle || {};
  if (style.underline) {
    translationEl.classList.add("bt-hover-underline");
  }

  // Add LinguaKit Icon at start (if enabled)
  if (style.showIcon !== false) {
    let iconSrc;
    try {
      iconSrc = isExtensionContextValid() ? chrome.runtime.getURL("assets/icons/icon-19.png") : "";
    } catch (error) {
      console.error("LinguaKit: Error getting icon URL for hover:", error.message);
      iconSrc = "";
    }

    if (iconSrc) {
      const icon = document.createElement("img");
      icon.src = iconSrc; // Use small icon
      icon.className = "bt-hover-icon";
      icon.style.width = "14px";
      icon.style.height = "14px";
      icon.style.verticalAlign = "middle";
      icon.style.marginRight = "6px";
      icon.style.display = "inline-block";
      translationEl.appendChild(icon);
    } else {
      const fallbackIcon = document.createElement("span");
      fallbackIcon.textContent = "🔄";
      fallbackIcon.className = "bt-hover-icon";
      fallbackIcon.style.width = "14px";
      fallbackIcon.style.height = "14px";
      fallbackIcon.style.verticalAlign = "middle";
      fallbackIcon.style.marginRight = "6px";
      fallbackIcon.style.display = "inline-block";
      fallbackIcon.style.fontSize = "12px";
      translationEl.appendChild(fallbackIcon);
    }
  }

  // Add modern CSS spinner instead of GIF
  const loadingSpinner = document.createElement("span");
  loadingSpinner.className = "bt-spinner";
  translationEl.appendChild(loadingSpinner);

  translationEl.dataset.btInjected = "true";

  // Ensure original element handles the insertion correctly
  // if (computedStyle.display === 'inline') {
  //   element.style.display = 'inline-block';
  // }

  element.insertAdjacentElement("afterend", translationEl);
  // element.classList.add('bt-hover-original'); // Keep natural

  return translationEl;
}

function updateHoverContent(element, translation, settings, isError = false) {
  // Keep the LinguaKit icon
  const icon = element.querySelector(".bt-hover-icon");

  element.innerHTML = ""; // Clear content
  if (icon) element.appendChild(icon);

  // Append translation text with HTML formatting
  const textSpan = document.createElement("span");
  textSpan.innerHTML = translation; // Use innerHTML to render HTML tags
  element.appendChild(textSpan);

  // Apply error styling if needed
  if (isError) {
    element.style.color = "#dc3545"; // text-danger red
    element.style.fontWeight = "bold";
  }

  // Model Label removed as per user request
}

function replaceTextContent(element, newText) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);

  const textNodes = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }

  if (textNodes.length > 0) {
    textNodes[0].textContent = newText;
    textNodes.slice(1).forEach((node) => node.remove());
  }
}

function clearAllHoverTranslations() {
  // 1. Remove standard block translations
  document.querySelectorAll(".bt-hover-translation").forEach((el) => el.remove());

  // 2. Remove node-based injected content (Legacy)
  document.querySelectorAll(".bt-injected-content").forEach((el) => el.remove());

  // 3. Cleanup Wrappers (Unwrap)
  document.querySelectorAll("[data-linguakit-wrapper]").forEach((wrapper) => {
    const originalSpan = wrapper.querySelector("[data-linguakit-original]");
    if (originalSpan) {
      // Move original text nodes back to parent
      while (originalSpan.firstChild) {
        wrapper.parentNode.insertBefore(originalSpan.firstChild, wrapper);
      }
    }
    wrapper.remove();
  });

  // 4. Cleanup original elements (Block mode replace)
  document.querySelectorAll("[data-bt-original]").forEach((el) => {
    replaceTextContent(el, el.dataset.btOriginal);
    delete el.dataset.btOriginal;
    delete el.dataset.btTranslated;
    el.classList.remove("bt-hover-translated");
  });

  // 5. Cleanup granular mode markers
  document.querySelectorAll("[data-linguakit-translated]").forEach((el) => {
    el.removeAttribute("data-linguakit-translated");
    el.classList.remove("bt-hover-translated");
  });

  currentHoveredElement = null;
}

function isHoverTranslateDomain(settings) {
  if (!settings.hoverTranslateEnabled) return false;
  if (!settings.hoverTranslateDomains || settings.hoverTranslateDomains.length === 0) return false;

  return settings.hoverTranslateDomains.some(
    (domainConfig) => domainConfig.enabled && domainMatchesLocation(domainConfig),
  );
}

function applyHoverCustomStyles(style) {
  const root = document.documentElement;
  root.style.setProperty("--bt-hover-bg-color", style.backgroundColor || "#667eea");
  root.style.setProperty("--bt-hover-text-color", style.textColor || "#ffffff");
  root.style.setProperty("--bt-hover-font-size", style.fontSize || "0.95em");
  root.style.setProperty("--bt-hover-show-icon", style.showIcon !== false ? "inline" : "none");
}

/**
 * Starts the OCR cropping flow by showing a full-screen canvas overlay with the captured screenshot.
 *
 * @function startOcrCrop
 * @param {string} screenshotUrl - Base64 Data URL of the active tab screenshot.
 */
function startOcrCrop(screenshotUrl) {
  // 1. Inject custom overlay styles if not already present
  if (!document.getElementById("lk-ocr-styles")) {
    const styleEl = document.createElement("style");
    styleEl.id = "lk-ocr-styles";
    styleEl.textContent = `
      #lk-ocr-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 2147483647;
        cursor: crosshair;
        user-select: none;
        -webkit-user-select: none;
        background: transparent;
      }
      #lk-ocr-canvas {
        width: 100%;
        height: 100%;
        display: block;
      }
      .lk-ocr-indicator {
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.85);
        color: #ffffff;
        padding: 8px 16px;
        border-radius: 20px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 14px;
        pointer-events: none;
        z-index: 2147483647;
        box-shadow: 0 4px 12px rgba(0,0,0,0.25);
        border: 1px solid rgba(255,255,255,0.15);
      }
    `;
    document.head.appendChild(styleEl);
  }

  // 2. Prevent duplicate overlays
  if (document.getElementById("lk-ocr-overlay")) return;

  // 3. Create the overlay DOM elements
  const overlay = document.createElement("div");
  overlay.id = "lk-ocr-overlay";

  const canvas = document.createElement("canvas");
  canvas.id = "lk-ocr-canvas";
  overlay.appendChild(canvas);

  const indicator = document.createElement("div");
  indicator.className = "lk-ocr-indicator";
  indicator.textContent =
    i18n && i18n.t
      ? i18n.t("dialog.ocrTip") || "Kéo chuột để chọn vùng chữ cần dịch (ESC để hủy)"
      : "Kéo chuột để chọn vùng chữ cần dịch (ESC để hủy)";
  overlay.appendChild(indicator);

  document.documentElement.appendChild(overlay);

  // 4. Set canvas logical and display sizes
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  // 5. Load screenshot image
  const img = new Image();
  img.addEventListener("load", () => {
    // Render initial screen with dark overlay
    drawOverlay(0, 0, 0, 0);

    // Mouse event handlers
    let isDrawing = false;
    let startX = 0;
    let startY = 0;
    let endX = 0;
    let endY = 0;

    function drawOverlay(x, y, w, h) {
      // Clear canvas
      ctx.clearRect(0, 0, rect.width, rect.height);

      // Draw base screenshot
      ctx.drawImage(img, 0, 0, rect.width, rect.height);

      // Draw dark semi-transparent tint
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.fillRect(0, 0, rect.width, rect.height);

      if (w > 0 && h > 0) {
        // Clear the selection box to make it bright/clear
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
        ctx.restore();

        // Draw crisp crop box border
        ctx.strokeStyle = "#4f46e5";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(x, y, w, h);
      }
    }

    const onMouseDown = (e) => {
      if (e.button !== 0) return; // Left click only
      isDrawing = true;
      startX = e.clientX;
      startY = e.clientY;
    };

    const onMouseMove = (e) => {
      if (!isDrawing) return;
      endX = e.clientX;
      endY = e.clientY;

      const x = Math.min(startX, endX);
      const y = Math.min(startY, endY);
      const w = Math.abs(startX - endX);
      const h = Math.abs(startY - endY);

      drawOverlay(x, y, w, h);
    };

    const onMouseUp = async (e) => {
      if (!isDrawing) return;
      isDrawing = false;
      endX = e.clientX;
      endY = e.clientY;

      const x = Math.min(startX, endX);
      const y = Math.min(startY, endY);
      const w = Math.abs(startX - endX);
      const h = Math.abs(startY - endY);

      cleanup();

      // If selection is too small, cancel
      if (w < 10 || h < 10) {
        return;
      }

      // Perform crop
      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = w * dpr;
      cropCanvas.height = h * dpr;
      const cropCtx = cropCanvas.getContext("2d");

      // Draw cropped area onto temp canvas
      cropCtx.drawImage(img, x * dpr, y * dpr, w * dpr, h * dpr, 0, 0, w * dpr, h * dpr);

      const croppedBase64 = cropCanvas.toDataURL("image/jpeg", 0.95);

      // Show translating toast
      showToast(i18n && i18n.t ? i18n.t("toast.translating") : "Đang nhận diện và dịch...");

      // Send to background for OCR processing
      try {
        const response = await chrome.runtime.sendMessage({
          type: "run-ocr",
          payload: { croppedImageBase64: croppedBase64, lang: "eng+vie+jpn" },
        });

        if (response?.ok && response?.text && response.text.trim()) {
          const recognizedText = response.text.trim();

          // Construct a selection rectangle for the UI popup placement
          const mockSelectionRect = {
            left: x,
            top: y,
            width: w,
            height: h,
            bottom: y + h,
            right: x + w,
          };

          // Trigger the beautiful selection popup with the OCR-ed text!
          void showTranslationPopup(mockSelectionRect, recognizedText, "bottom");
        } else {
          showToast(
            response?.error ||
              (i18n && i18n.t
                ? i18n.t("toast.ocrNoText") || "Không tìm thấy chữ trong vùng chọn."
                : "Không tìm thấy chữ trong vùng chọn."),
          );
        }
      } catch (err) {
        console.error("OCR Request failed:", err);
        showToast(i18n && i18n.t ? i18n.t("toast.translationFailed") : "Dịch OCR thất bại.");
      }
    };

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        cleanup();
      }
    };

    function cleanup() {
      overlay.remove();
      document.removeEventListener("keydown", onKeyDown, true);
    }

    // Bind event listeners
    overlay.addEventListener("mousedown", onMouseDown);
    overlay.addEventListener("mousemove", onMouseMove);
    overlay.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keydown", onKeyDown, true);
  });
  img.src = screenshotUrl;
}

let isUnlockerActive = false;
let unlockerStyleElement = null;

/**
 * Manages global CSS overrides to defeat visual user-selection locks.
 *
 * @function applyRightClickUnlockerCSS
 * @param {boolean} enabled - True to apply CSS override, false to remove.
 * @returns {void}
 */
function applyRightClickUnlockerCSS(enabled) {
  if (enabled) {
    if (!unlockerStyleElement) {
      unlockerStyleElement = document.createElement("style");
      unlockerStyleElement.id = "linguakit-unlocker-style";
      unlockerStyleElement.textContent = `
        * {
          user-select: text !important;
          -webkit-user-select: text !important;
          -moz-user-select: text !important;
          -ms-user-select: text !important;
        }
      `;
      (document.head || document.documentElement).appendChild(unlockerStyleElement);
    }
  } else {
    if (unlockerStyleElement) {
      unlockerStyleElement.remove();
      unlockerStyleElement = null;
    }
  }
}

/**
 * Bypasses right-click blocking and selection locks during the event capturing phase.
 *
 * @function registerRightClickUnlocker
 * @returns {void}
 */
function registerRightClickUnlocker() {
  const lockEvents = ["contextmenu", "selectstart", "dragstart", "copy"];

  lockEvents.forEach((eventType) => {
    window.addEventListener(
      eventType,
      (e) => {
        if (!isUnlockerActive) return;

        // Stop the webpage event listeners from receiving the event during capture phase
        e.stopPropagation();
      },
      true, // Capturing phase
    );
  });

  // Query settings initially
  void getSettings().then((settings) => {
    isUnlockerActive = settings.rightClickUnlockerEnabled === true;
    applyRightClickUnlockerCSS(isUnlockerActive);
  });
}
