/**
 * LinguaKit - Page Translate Main World Script. Runs directly in the web page's MAIN window context to bypass Extension
 * CSP (Content Security Policy) constraints and initialize the Google Translate simple widget dynamically.
 *
 * @file Page-translate.js
 */

(function () {
  // Prevent multiple script execution/initialization on the same page
  if (window.lkMainWorldInitialized) {
    return;
  }
  window.lkMainWorldInitialized = true;

  /**
   * The target language code configured for the Google Translate widget. Defaults to 'en' (English).
   *
   * @type {string} lkTargetLang
   */
  let lkTargetLang = "en";

  /**
   * Google Translate API callback function. Initializes the simple inline translation element container dynamically on
   * the webpage.
   *
   * @function googleTranslateElementInit
   * @returns {void}
   */
  window.googleTranslateElementInit = function () {
    if (typeof google === "undefined" || !google.translate) {
      console.error("LinguaKit: Google Translate API not loaded properly.");
      return;
    }

    try {
      // eslint-disable-next-line no-new
      new google.translate.TranslateElement(
        {
          pageLanguage: "auto",
          includedLanguages: lkTargetLang,
          layout: google.translate.TranslateElement.InlineLayout.SIMPLE,
          autoDisplay: false,
        },
        "google_translate_element",
      );
    } catch (e) {
      console.error("LinguaKit: Error creating TranslateElement:", e);
    }
  };

  /**
   * Listen for custom custom-events dispatched from the extension content script to trigger a dynamic page translation
   * request.
   */
  window.addEventListener("lk-trigger-page-translate", (event) => {
    const { targetLang } = event.detail || {};
    if (!targetLang) return;

    console.log(`LinguaKit: Triggering page translate to: ${targetLang}`);
    lkTargetLang = targetLang;

    // Check if the external Google Translate API script has already been loaded
    const apiScript = document.getElementById("lk-google-translate-api");

    if (!apiScript) {
      const script = document.createElement("script");
      script.id = "lk-google-translate-api";
      script.type = "text/javascript";
      script.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";

      // Detect if script was blocked by browser's content block rules (e.g. AdBlockers)
      script.addEventListener("error", () => {
        console.error("LinguaKit: Google Translate script failed to load (blocked?).");
        window.dispatchEvent(
          new CustomEvent("lk-page-translate-error", {
            detail: { error: "BLOCKED_BY_CONTENT_BLOCKER" },
          }),
        );
      });

      document.head.appendChild(script);
    } else {
      // Re-trigger/re-render widget if the script is already loaded
      if (typeof google !== "undefined" && google.translate && google.translate.TranslateElement) {
        if (window.googleTranslateElementInit) {
          // Clear existing widget content to prevent duplicate UI renders
          const container = document.getElementById("google_translate_element");
          if (container) container.innerHTML = "";
          window.googleTranslateElementInit();
        }
      }
    }
  });
})();
