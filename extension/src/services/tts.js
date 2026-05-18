/**
 * LinguaKit Text-to-Speech (TTS) Service. Manages runtime communication with the background worker and offscreen
 * context to trigger speech synthesis on highlighted or translated text.
 *
 * @file Tts.js
 */

/**
 * Frontend class for coordinating text-to-speech audio requests.
 *
 * @class TTSService
 */
export class TTSService {
  /** @class */
  constructor() {
    /** @type {HTMLAudioElement} audio - Local Audio API object instance. */
    this.audio = new Audio();

    /** @type {string | null} currentUrl - Active audio stream url source. */
    this.currentUrl = null;
  }

  /**
   * Play TTS for the given text and language Sends standard play requests down the chrome extension background message
   * channel.
   *
   * @async
   * @param {string} text - Text to speak.
   * @param {string} lang - ISO 639-1 language code configuration (e.g., 'en', 'vi').
   * @param {number} [speed=1] - Playback speed rate coefficient (value ranges from 0.24 to 4). Default is `1`
   * @returns {Promise<void>} Resolves when audio play command is dispatched successfully.
   */
  async play(text, lang, speed = 1) {
    if (!text) return;

    try {
      // Fetch settings to get active provider
      const { translatorSettings } = await chrome.storage.local.get("translatorSettings");
      const settings = translatorSettings || {};

      const activeId = settings.activeTTSProviderId || "google-tts";
      let urlTemplate =
        "https://translate.google.com/translate_tts?ie=UTF-8&tl={lang}&client=dict-chrome-ex&ttsspeed={speed}&q={text}";

      if (activeId !== "google-tts") {
        const provider = settings.ttsProviders?.find((p) => p.id === activeId);
        if (provider && provider.url) {
          urlTemplate = provider.url;
        }
      }

      // Send request to background -> offscreen to play audio
      await chrome.runtime.sendMessage({
        type: "tts-play",
        payload: { text, lang, speed, urlTemplate },
      });
    } catch (err) {
      console.error("TTS Play Error:", err);
    }
  }

  /**
   * Halts active text-to-speech play stream operations.
   *
   * @function stop
   * @returns {void}
   */
  stop() {
    // Not easily supported with offscreen fire-and-forget,
    // but we could send a stop message if needed.
  }
}

/**
 * Globally exported instance of the Text-to-Speech (TTS) client service.
 *
 * @constant {TTSService} Tts
 */
export const tts = new TTSService();
