/**
 * LinguaKit Internationalization Service. Orchestrates extension localization by mapping keys to localized message
 * content across English, Vietnamese, and Japanese, with an automatic fallback mechanism to English.
 *
 * @file I18n.js
 */

import { locales } from "./locales.js";

/**
 * Localization helper utility for handling multi-lingual dictionaries in extension pages.
 *
 * @class I18n
 */
export class I18n {
  /** @class */
  constructor() {
    /** @type {string} language - Active ISO 639-1 language code (e.g. 'en', 'vi', 'ja'). */
    this.language = "en";

    /** @type {Object} locales - Complete compiled dictionary object map imported from locales.js. */
    this.locales = locales;
  }

  /**
   * Initializes the translator context with a specific target language code.
   *
   * @function init
   * @param {string} [language="en"] - The default translation language target. Default is `"en"`
   * @returns {void}
   */
  init(language = "en") {
    this.language = language;
  }

  /**
   * Switches the active translation language catalog if the specified locale configuration exists.
   *
   * @function setLanguage
   * @param {string} language - Target language code to load.
   * @returns {void}
   */
  setLanguage(language) {
    if (this.locales[language]) {
      this.language = language;
    }
  }

  /**
   * Retrieves the active translation language code currently in use.
   *
   * @function getLanguage
   * @returns {string} The active language code.
   */
  getLanguage() {
    return this.language;
  }

  /**
   * Resolves the translation lookup for a specific key in the active dictionary context. Falls back to English if the
   * translation key does not exist under the active locale.
   *
   * @function t
   * @param {string} key - Dictionary lookup path key (e.g. 'popup.title').
   * @returns {string} The localized text corresponding to the key, or the key string itself as fallback.
   */
  t(key) {
    // Try direct lookup first (for flat keys like "popup.title")
    let value = this.locales[this.language]?.[key];
    if (value) return value;

    // Fallback to English
    value = this.locales["en"]?.[key];
    if (value) return value;

    return key;
  }
}

/**
 * Globally exported instance of the localization helper utility.
 *
 * @constant {I18n} I18n
 */
export const i18n = new I18n();
