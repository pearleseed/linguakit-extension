/**
 * LinguaKit Chrome Extension Service Worker. Handles the background lifecycle, extension storage state management,
 * offscreen context setup (for TTS engine), API translation service routing (Google Translate & custom OpenAI
 * endpoints), translation history storage, and offline webpage caching.
 *
 * @file Background.js
 */

import { AIProviderService } from "./services/ai-providers.js";
import { htmlToMarkdown, markdownToHtml, shouldConvertFormat } from "./services/format-utils.js";

/**
 * Path to the Offscreen HTML document used for background audio playback/TTS API calls.
 *
 * @constant {string} OFFSCREEN_URL
 */
const OFFSCREEN_URL = chrome.runtime.getURL("../pages/offscreen.html");

/**
 * Storage key used to save and load user configuration options in chrome.storage.local.
 *
 * @constant {string} SETTINGS_KEY
 */
const SETTINGS_KEY = "translatorSettings";

/**
 * Checks if an offscreen document context is already active in the extension. If not, creates one dynamically under the
 * 'IFRAME_SCRIPTING' reason to enable Web APIs (like Audio) which are not natively available inside modern Manifest V3
 * Service Workers.
 *
 * @async
 * @function ensureOffscreen
 * @returns {Promise<void>}
 */
async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({});
  const hasOffscreen = contexts.some((c) => c.contextType === "OFFSCREEN_DOCUMENT" && c.documentUrl === OFFSCREEN_URL);

  if (!hasOffscreen) {
    await chrome.offscreen.createDocument({
      url: "../pages/offscreen.html",
      reasons: ["IFRAME_SCRIPTING"],
      justification: "Use built-in Translator and LanguageDetector APIs in a windowed context.",
    });
  }
}

/**
 * Fetches the current user settings from local extension storage. If no settings exist, returns the default fallback
 * configuration layout.
 *
 * @async
 * @function readSettings
 * @returns {Promise<Object>} The settings object.
 */
async function readSettings() {
  const { translatorSettings } = await chrome.storage.local.get(SETTINGS_KEY);
  return (
    translatorSettings || {
      enabled: true,
      nativeLanguageCode: "vi",
      targetLanguageCode: "en",
      useAutoDetect: false, // Default to fixed direction (Target→Native)
      showConfirmModal: true,
      ocrEnabled: true,
      dialogTimeout: 10,
      aliases: {
        e: "en",
        v: "vi",
        ch: "zh",
        j: "ja",
      },
      interfaceLanguage: "en",
      // Instant translate settings
      instantTranslateEnabled: false,
      instantDelay: 3000,
      instantDomains: [
        { domain: "telegram.org", enabled: true, position: "top" },
        { domain: "discord.com", enabled: true, position: "top" },
        { domain: "zalo.me", enabled: true, position: "top" },
        { domain: "openai.com", enabled: true, position: "top" },
        { domain: "claude.ai", enabled: true, position: "top" },
        { domain: "gemini.google.com", enabled: true, position: "top" },
      ],
      // AI Provider settings
      activeProviderId: "google-translate",
      providers: [
        {
          id: "google-translate",
          type: "google-translate",
          name: "Google Translate",
          config: {},
        },
      ],
      // Keyboard shortcut for toggle instant domain
      instantToggleShortcut: {
        key: "I",
        ctrl: true,
        shift: true,
        alt: false,
      },
      // Hover to Translate settings
      hoverTranslateEnabled: false,
      hoverTranslateMode: "inject", // "inject" or "replace"
      hoverTranslateDomains: [],
      hoverModifierKey: "ctrl", // "ctrl", "shift", "alt"
      hoverToggleShortcut: {
        key: "O",
        ctrl: true,
        shift: true,
        alt: false,
      },
      // Auto Page Translate settings
      autoPageTranslateEnabled: false,
      autoPageTranslateDomains: [],
      autoTranslateToggleShortcut: {
        key: "P",
        ctrl: true,
        shift: true,
        alt: false,
      },
      // Style customization for hover inject mode
      hoverInjectStyle: {
        backgroundColor: "#667eea",
        textColor: "#0c69e4",
        fontSize: "0.95em",
        showIcon: true,
        underline: false,
      },
      // Last used languages in Selection Popup
      selectionLastSource: null,
      selectionLastTarget: null,
    }
  );
}

/**
 * Overwrites the user configurations in chrome.storage.local.
 *
 * @async
 * @function writeSettings
 * @param {Object} next - The next settings object payload.
 * @returns {Promise<Object>} The updated settings object.
 */
async function writeSettings(next) {
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

/**
 * Main Extension Runtime Message Router. Listens to incoming runtime communication channels dispatched from either
 * options/popup dashboards, isolated world content scripts, or main world scripts, and handles business workflows
 * asynchronously.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 1. Connection check / heartbeat signal
  if (message?.type === "ping") {
    sendResponse({ ok: true });
    return true;
  }

  // 2. Settings management: Read operation
  if (message?.type === "get-settings") {
    void readSettings().then((s) => sendResponse({ ok: true, settings: s }));
    return true;
  }

  // 3. Settings management: Write operation
  if (message?.type === "set-settings") {
    void writeSettings(message.settings).then((s) => sendResponse({ ok: true, settings: s }));
    return true;
  }

  // 4. core translation dispatcher
  if (message?.type === "translate") {
    void readSettings().then(async (settings) => {
      // Extract payload parameters dispatched by content-script.js
      const { text, targetLanguage, sourceLanguage, providerId, task } = message.payload;

      // Map to standardized code designations for AIProviderService
      const sourceLang = sourceLanguage || "auto";
      const targetLang = targetLanguage;

      const aiService = new AIProviderService(settings);

      try {
        // --- Format Conversion Logic ---
        let textToTranslate = text;
        let hasFormatting = false;

        // Apply HTML-to-Markdown conversion to preserve standard rich layout tags if needed
        if (shouldConvertFormat(text)) {
          textToTranslate = htmlToMarkdown(text);
          hasFormatting = true;
        }

        // Call active translation orchestration instance
        const result = await aiService.translate(
          textToTranslate,
          sourceLang,
          targetLang,
          providerId,
          task || "translate",
        );

        // Convert parsed Markdown back to original HTML standard structure post-translation
        let translation = result.translation;
        if (hasFormatting && translation) {
          translation = markdownToHtml(translation);
        }

        // Standardize output payload structure for extension clients
        const responseData = {
          ok: true,
          result: {
            translation: translation,
            providerName: result.providerName,
            providerType: result.providerType,
            sourceLanguage: sourceLang,
            detectedSourceLanguage: result.detectedSourceLang,
            targetLanguage: targetLang,
            task: task || "translate",
            originalText: text,
            timestamp: Date.now(),
          },
        };

        // Cache completed translations to persistent local storage for history logging
        if (translation && text) {
          chrome.storage.local.get("translationHistory", (data) => {
            let history = data.translationHistory || [];
            // Add current item to the front of history queue
            history.unshift({
              id: crypto.randomUUID(),
              source: text,
              target: translation,
              sourceLang: sourceLang,
              targetLang: targetLang,
              task: task || "translate",
              timestamp: Date.now(),
              provider: result.providerName,
            });
            // Restrict maximum local cache items to 50
            history = history.slice(0, 50);
            chrome.storage.local.set({ translationHistory: history });
          });
        }

        sendResponse(responseData);
      } catch (err) {
        console.error("Translation Error:", err);
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
    });

    return true;
  }

  // 5. Utilities: Open custom browser options dashboard
  if (message?.type === "open-options") {
    chrome.runtime.openOptionsPage();
    return true;
  }

  // 6. Offline cache management: read cache snapshot
  if (message?.type === "get-page-cache") {
    const { domain, targetLang } = message.payload;
    const key = `page_cache_${domain}_${targetLang}`;
    chrome.storage.local.get(key, (data) => {
      sendResponse({ ok: true, cache: data[key] || null });
    });
    return true;
  }

  // 7. Offline cache management: save cache snapshot
  if (message?.type === "set-page-cache") {
    const { domain, targetLang, cache } = message.payload;
    const key = `page_cache_${domain}_${targetLang}`;
    chrome.storage.local.set({ [key]: cache }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  // 8. TTS Voice playback: Routes request through ensureOffscreen to windowed context
  if (message?.type === "tts-play") {
    void ensureOffscreen().then(async () => {
      try {
        await chrome.runtime.sendMessage({
          type: "play-tts",
          payload: message.payload,
        });
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: String(err) });
      }
    });
    return true;
  }

  // 9. OCR processing: Routes cropped image to offscreen document
  if (message?.type === "run-ocr") {
    void readSettings().then(async (settings) => {
      if (settings.ocrEnabled === false) {
        sendResponse({ ok: false, error: "OCR feature is disabled." });
        return;
      }
      void ensureOffscreen().then(async () => {
        try {
          const response = await chrome.runtime.sendMessage({
            type: "perform-ocr",
            payload: message.payload,
          });
          sendResponse(response);
        } catch (err) {
          sendResponse({ ok: false, error: String(err) });
        }
      });
    });
    return true;
  }

  return false;
});

/** Keyboard commands listener. Triggers visible tab screenshot capture for OCR. */
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "trigger-ocr-capture") {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab || !activeTab.id) return;

      const settings = await readSettings();
      if (settings.ocrEnabled === false) {
        console.warn("LinguaKit: OCR feature is disabled in Settings.");
        const lang = settings.interfaceLanguage || "en";
        let msg = "OCR feature is disabled in settings.";
        if (lang === "vi") {
          msg = "Tính năng OCR đã bị tắt trong cài đặt.";
        } else if (lang === "ja") {
          msg = "OCR機能は設定で無効になっています。";
        }
        try {
          await chrome.tabs.sendMessage(activeTab.id, {
            type: "show-toast",
            payload: { message: msg },
          });
        } catch {
          // Content script might not be loaded or page is not supported
        }
        return;
      }

      // Restrict OCR on browser-native special pages where scripting is forbidden
      const url = activeTab.url || "";
      if (
        url.startsWith("chrome://") ||
        url.startsWith("chrome-extension://") ||
        url.startsWith("https://chromewebstore.google.com")
      ) {
        console.warn("LinguaKit: OCR translation is not supported on Chrome internal pages.");
        return;
      }

      const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 90 });

      try {
        await chrome.tabs.sendMessage(activeTab.id, {
          type: "initiate-ocr-crop",
          payload: { screenshotUrl: dataUrl },
        });
      } catch (err) {
        // If content script is missing or connection is severed due to extension reload
        if (
          err.message.includes("Could not establish connection") ||
          err.message.includes("Receiving end does not exist")
        ) {
          console.log(
            "LinguaKit: Active tab context invalidated or missing script. Performing hot dynamic injection...",
          );

          // 1. Programmatically load required scripts
          await chrome.scripting.executeScript({
            target: { tabId: activeTab.id, allFrames: false },
            files: ["src/content-script-granularity.js", "src/content-script.js"],
          });

          // 2. Inject CSS rules for the selection overlays
          await chrome.scripting.insertCSS({
            target: { tabId: activeTab.id, allFrames: false },
            files: ["assets/styles/selection.css"],
          });

          // 3. Retry message dispatch after scripts loaded in DOM
          setTimeout(async () => {
            try {
              await chrome.tabs.sendMessage(activeTab.id, {
                type: "initiate-ocr-crop",
                payload: { screenshotUrl: dataUrl },
              });
            } catch (retryErr) {
              console.error("LinguaKit: OCR retry command failed:", retryErr.message);
            }
          }, 150);
        } else {
          throw err;
        }
      }
    } catch (err) {
      console.error("OCR command trigger failed:", err);
    }
  }
});
