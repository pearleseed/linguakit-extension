import { AIProviderService } from "./services/ai-providers.js";
import { locales } from "./common/locales.js";
import { htmlToMarkdown, markdownToHtml, shouldConvertFormat } from "./services/format-utils.js";

const OFFSCREEN_URL = chrome.runtime.getURL("../pages/offscreen.html");
const SETTINGS_KEY = "translatorSettings";

function t(settings, key) {
  const language = settings?.interfaceLanguage || "en";
  return locales[language]?.[key] || locales.en[key] || key;
}

async function sendTabMessage(tabId, message, label = message?.type) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (err) {
    const reason = String(err?.message || err);
    console.warn(`LinguaKit: ${label || "tab message"} failed for tab ${tabId}: ${reason}`);
    return { ok: false, error: reason };
  }
}

async function sendToast(tabId, settings, key, type = "default") {
  return sendTabMessage(
    tabId,
    {
      type: "show-toast",
      payload: { message: t(settings, key), type },
    },
    `show-toast:${key}`,
  );
}

async function sendCaptureStatus(tabId, settings, state, key, extra = {}) {
  return sendTabMessage(
    tabId,
    {
      type: "capture-status",
      payload: {
        state,
        message: t(settings, key),
        ...extra,
      },
    },
    `capture-status:${state}`,
  );
}

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({});
  const hasOffscreen = contexts.some(
    (c) => c.contextType === "OFFSCREEN_DOCUMENT" && c.documentUrl === OFFSCREEN_URL,
  );

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

/*
  if (message?.type === "capture-coordinates") {
    const { rect } = message.payload;
    const targetTabId = sender.tab?.id;

    if (!targetTabId) {
      sendResponse({ ok: false, error: "No target tab found" });
      return true;
    }

    readSettings().then(async (settings) => {
      await sendCaptureStatus(targetTabId, settings, "processing", "capture.processingOcr");
      await sendToast(targetTabId, settings, "capture.processingOcr");

      chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          console.error("Capture failed:", chrome.runtime.lastError);
          sendCaptureStatus(targetTabId, settings, "error", "capture.captureFailed");
          sendToast(targetTabId, settings, "capture.captureFailed", "warning");
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }

        ensureOffscreen().then(async () => {
          try {
            const response = await chrome.runtime.sendMessage({
              type: "perform-ocr",
              payload: { dataUrl, rect, targetTabId },
            });

            if (response?.ok) {
              const text = String(response.text || "").trim();
              if (!text) {
                await sendCaptureStatus(targetTabId, settings, "empty", "capture.noTextFound");
                await sendToast(targetTabId, settings, "capture.noTextFound", "warning");
                sendResponse({ ok: true, text: "" });
                return;
              }

              const popupResponse = await sendTabMessage(
                targetTabId,
                {
                  type: "ocr-success",
                  payload: {
                    text,
                    rect,
                  },
                },
                "ocr-success",
              );

              if (popupResponse?.ok === false) {
                await sendCaptureStatus(targetTabId, settings, "error", "capture.popupFailed", {
                  error: popupResponse.error,
                });
                await sendToast(targetTabId, settings, "capture.popupFailed", "warning");
                sendResponse({ ok: false, error: popupResponse.error });
                return;
              }

              await sendCaptureStatus(targetTabId, settings, "success", "capture.ocrComplete");
              sendResponse({ ok: true, text });
            } else {
              console.error("OCR response error:", response?.error);
              await sendCaptureStatus(targetTabId, settings, "error", "capture.ocrFailed", {
                error: response?.error,
              });
              await sendToast(targetTabId, settings, "capture.ocrFailed", "warning");
              sendResponse({ ok: false, error: response?.error || "OCR failed" });
            }
          } catch (err) {
            console.error("OCR failed:", err);
            await sendCaptureStatus(targetTabId, settings, "error", "capture.ocrFailed", {
              error: String(err?.message || err),
            });
            await sendToast(targetTabId, settings, "capture.ocrFailed", "warning");
            sendResponse({ ok: false, error: String(err?.message || err) });
          }
        });
      });
    });
    return true;
  }

  if (message?.type === "ocr-progress") {
    const { targetTabId, progress, status } = message.payload || {};
    if (targetTabId) {
      readSettings().then((settings) => {
        sendCaptureStatus(targetTabId, settings, "processing", "capture.processingOcr", {
          progress,
          detail: status,
        });
      });
    }
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "capture-cancelled") {
    const targetTabId = sender.tab?.id;
    if (targetTabId) {
      readSettings().then((settings) =>
        sendToast(targetTabId, settings, "capture.cancelled", "warning"),
      );
    }
    sendResponse({ ok: true });
    return true;
  }
*/
});

/*
chrome.commands.onCommand.addListener((command) => {
  if (command === "capture-screen") {
    chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
      if (tab?.id) {
        const settings = await readSettings();
        const response = await sendTabMessage(
          tab.id,
          {
            type: "start-capture",
            payload: {
              strings: {
                selectArea: t(settings, "capture.selectArea"),
                dragInstruction: t(settings, "capture.dragInstruction"),
                cancelHint: t(settings, "capture.cancelHint"),
                selectionTooSmall: t(settings, "capture.selectionTooSmall"),
                processingOcr: t(settings, "capture.processingOcr"),
                ocrComplete: t(settings, "capture.ocrComplete"),
                noTextFound: t(settings, "capture.noTextFound"),
                captureFailed: t(settings, "capture.captureFailed"),
                ocrFailed: t(settings, "capture.ocrFailed"),
                cancelled: t(settings, "capture.cancelled"),
              },
            },
          },
          "start-capture",
        );

        if (response?.ok === false) {
          console.warn(
            "LinguaKit: capture shortcut could not reach content script",
            response.error,
          );
        } else if (!response) {
          console.warn("LinguaKit: capture shortcut did not receive a content-script response");
        }
      }
    });
  }
});
*/
