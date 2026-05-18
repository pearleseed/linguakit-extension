/**
 * LinguaKit Chrome Extension Offscreen Script. Runs in a windowed DOM context (bypassing Manifest V3 background service
 * worker limitations) to support audio tag operations and play Text-to-Speech (TTS) stream files.
 *
 * @file Offscreen.js
 */

// Intercept and silence benign, obsolete Tesseract C++ Emscripten parameters warnings in console
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;
const originalConsoleLog = console.log;

const filterWarning = (args) => args[0] && String(args[0]).includes("Parameter not found:");

console.warn = function (...args) {
  if (filterWarning(args)) return;
  originalConsoleWarn.apply(console, args);
};

console.error = function (...args) {
  if (filterWarning(args)) return;
  originalConsoleError.apply(console, args);
};

console.log = function (...args) {
  if (filterWarning(args)) return;
  originalConsoleLog.apply(console, args);
};

/** Message listener for the offscreen runtime. Intercepts 'play-tts' signals dispatched from the service worker. */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "play-tts") {
    const { text, lang, speed, urlTemplate } = message.payload;
    playTTS(text, lang, speed, urlTemplate)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message?.type === "perform-ocr") {
    const { croppedImageBase64, lang } = message.payload;
    performOCR(croppedImageBase64, lang || "eng+vie+jpn")
      .then((text) => sendResponse({ ok: true, text }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  return false;
});

/**
 * Plays text-to-speech audio via a dynamic HTML5 Audio element. Resolves once the voice playback completes
 * successfully.
 *
 * @async
 * @function playTTS
 * @param {string} text - The input plain text to read aloud.
 * @param {string} lang - BCP-47 language tag configuration (e.g. 'en', 'vi').
 * @param {number} [speed=1] - Playback speed rate coefficient. Default is `1`
 * @param {string | null} [urlTemplate=null] - Custom external endpoint URL template. Default is `null`
 * @returns {Promise<void>} Resolves when voice playback has finished.
 */
async function playTTS(text, lang, speed = 1, urlTemplate = null) {
  let url;

  if (urlTemplate) {
    // Inject dynamic parameters into the custom template format
    url = urlTemplate.replace("{text}", encodeURIComponent(text)).replace("{lang}", lang).replace("{speed}", speed);
  } else {
    // Default fallback to public Google Translate TTS synthesis service
    url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&ttsspeed=${speed}&q=${encodeURIComponent(text)}`;
  }

  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    audio.addEventListener("ended", () => resolve(), { once: true });
    audio.addEventListener("error", (_e) => reject(new Error("Audio playback failed")), {
      once: true,
    });
    audio.play().catch(reject);
  });
}

let cachedWorker = null;
let cachedLangs = null;

/**
 * Performs OCR text recognition using Tesseract.js offline.
 *
 * @async
 * @function performOCR
 * @param {string} croppedImageBase64 - Base64 Data URL of the cropped screenshot area.
 * @param {string} [langs="eng+vie+jpn"] - Languages string configuration (e.g., 'eng+vie+jpn'). Default is
 *   `"eng+vie+jpn"`
 * @returns {Promise<string>} The recognized plain text.
 */
async function performOCR(croppedImageBase64, langs = "eng+vie+jpn") {
  const workerPath = chrome.runtime.getURL("/src/common/tesseract/worker-wrapper.js");
  const corePath = chrome.runtime.getURL("/src/common/tesseract/");
  const langPath = chrome.runtime.getURL("/src/common/tesseract/tessdata/");

  if (cachedWorker && cachedLangs === langs) {
    try {
      const {
        data: { text },
      } = await cachedWorker.recognize(croppedImageBase64);
      return text;
    } catch (err) {
      // Self-healing: if cached worker fails, terminate and discard it
      await cachedWorker.terminate().catch(() => {});
      cachedWorker = null;
      cachedLangs = null;
      throw err;
    }
  }

  if (cachedWorker) {
    await cachedWorker.terminate().catch(() => {});
    cachedWorker = null;
  }

  // Create worker using Tesseract.js API v5+
  cachedWorker = await Tesseract.createWorker(langs, 1, {
    workerPath: workerPath,
    corePath: corePath,
    langPath: langPath,
    workerBlobURL: false, // avoid issues loading worker from Blob in extensions
    logger: (m) => console.log("OCR progress:", m),
  });
  cachedLangs = langs;

  try {
    const {
      data: { text },
    } = await cachedWorker.recognize(croppedImageBase64);
    return text;
  } catch (err) {
    // Self-healing: if fresh worker fails on recognize, terminate and discard it
    await cachedWorker.terminate().catch(() => {});
    cachedWorker = null;
    cachedLangs = null;
    throw err;
  }
}
