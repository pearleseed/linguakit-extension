/**
 * LinguaKit Language Code Mapping Utilities. Maps textual language names and custom localized synonyms to standard ISO
 * BCP-47 language codes, and normalizes formatting inputs (such as converting snake_case locale IDs to hyphenated
 * format).
 *
 * @file Language-map.js
 */

/**
 * Alias lookup maps matching text-based language names (in English, Spanish, Vietnamese, etc.) directly to their
 * respective standardized BCP-47 standard country/language code strings.
 *
 * @constant {Object} LanguageSynonymsToBcp47
 */
export const languageSynonymsToBcp47 = {
  english: "en",
  ingles: "en",
  inglês: "en",
  japanese: "ja",
  japones: "ja",
  japonês: "ja",
  japan: "ja",
  vietnamese: "vi",
  vietnamita: "vi",
  vietnam: "vi",
  chinese: "zh",
  chines: "zh",
  chinês: "zh",
  "chinese simplified": "zh-CN",
  "chinese traditional": "zh-TW",
  korean: "ko",
  coreano: "ko",
  spanish: "es",
  espanol: "es",
  espanhol: "es",
  french: "fr",
  frances: "fr",
  francés: "fr",
  german: "de",
  alemao: "de",
  alemão: "de",
  russian: "ru",
  russo: "ru",
  portuguese: "pt",
  portugues: "pt",
  português: "pt",
  italian: "it",
  italiano: "it",
  hindi: "hi",
  híndi: "hi",
  arabic: "ar",
  arabe: "ar",
  árabe: "ar",
  turkish: "tr",
  turco: "tr",
  dutch: "nl",
  neerlandes: "nl",
  neerlandês: "nl",
  polish: "pl",
  polones: "pl",
  polonês: "pl",
  thai: "th",
  tailandes: "th",
  tailandês: "th",
};

/**
 * Takes an arbitrary language name, synonym, or format input, filters/cleans the string, matches it against the synonym
 * map, and falls back to a regex validation to extract a standard lowercase BCP-47 language code prefix (e.g. 'zh-CN',
 * 'vi', 'en').
 *
 * @function normalizeLanguageToCode
 * @param {string} input - Raw user translation command language parameter.
 * @returns {string | null} The normalized language code designation, or null if unmappable.
 */
export function normalizeLanguageToCode(input) {
  if (!input) return null;
  const key = input.trim().toLowerCase();
  return (
    languageSynonymsToBcp47[key] ||
    (/^[a-z]{2,3}(-[a-z0-9-]+)?$/i.test(key.replace(/_/g, "-")) ? key.replace(/_/g, "-") : null)
  );
}
