import { AIProviderService } from "./services/ai-providers.js";
import { htmlToMarkdown, markdownToHtml, shouldConvertFormat } from "./services/format-utils.js";

const OFFSCREEN_URL = chrome.runtime.getURL("../pages/offscreen.html");
const SETTINGS_KEY = "translatorSettings";
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

async function readSettings() {
  const { translatorSettings } = await chrome.storage.local.get(SETTINGS_KEY);
  return (
    translatorSettings || {
      enabled: true,
      nativeLanguageCode: "vi",
      targetLanguageCode: "en",
      useAutoDetect: false, // Default to fixed direction (Target→Native)
      showConfirmModal: true,
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

async function writeSettings(next) {
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "ping") {
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "get-settings") {
    readSettings().then((s) => sendResponse({ ok: true, settings: s }));
    return true;
  }

  if (message?.type === "set-settings") {
    writeSettings(message.settings).then((s) => sendResponse({ ok: true, settings: s }));
    return true;
  }

  if (message?.type === "translate") {
    readSettings().then(async (settings) => {
      // Extract payload using keys sent by content-script.js
      const { text, targetLanguage, sourceLanguage, providerId, task } = message.payload;

      // Map to standardized keys for AIProviderService
      // Use 'auto' if sourceLanguage is not explicitly provided
      const sourceLang = sourceLanguage || "auto";
      const targetLang = targetLanguage;

      const aiService = new AIProviderService(settings);

      // Determine the provider type to use

      try {
        // --- Format Conversion Logic ---
        let textToTranslate = text;
        let hasFormatting = false;

        // Apply format conversion for all providers
        if (shouldConvertFormat(text)) {
          textToTranslate = htmlToMarkdown(text);
          hasFormatting = true;
        }

        const result = await aiService.translate(
          textToTranslate,
          sourceLang,
          targetLang,
          providerId,
          task || "translate",
        );

        // Convert back to HTML if formatting was converted
        let translation = result.translation;
        if (hasFormatting && translation) {
          translation = markdownToHtml(translation);
        }

        // Result is the object { translation, providerName, providerType }
        const responseData = {
          ok: true,
          result: {
            translation: translation,
            providerName: result.providerName,
            providerType: result.providerType,
            sourceLanguage: sourceLang,
            targetLanguage: targetLang,
            task: task || "translate",
            originalText: text,
            timestamp: Date.now(),
          },
        };

        // Save to History (if it's a valid translation/task)
        if (translation && text) {
          chrome.storage.local.get("translationHistory", (data) => {
            let history = data.translationHistory || [];
            // Add to beginning
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
            // Keep last 50
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

  if (message?.type === "open-options") {
    chrome.runtime.openOptionsPage();
    return true;
  }
  if (message?.type === "get-page-cache") {
    const { domain, targetLang } = message.payload;
    const key = `page_cache_${domain}_${targetLang}`;
    chrome.storage.local.get(key, (data) => {
      sendResponse({ ok: true, cache: data[key] || null });
    });
    return true;
  }

  if (message?.type === "set-page-cache") {
    const { domain, targetLang, cache } = message.payload;
    const key = `page_cache_${domain}_${targetLang}`;
    chrome.storage.local.set({ [key]: cache }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message?.type === "tts-play") {
    ensureOffscreen().then(async () => {
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

  return false;
});
