/**
 * LinguaKit - Page Translate Main World Script
 * This script runs in the page context (MAIN world) to bypass extension CSP rules
 * and handle the Google Translate widget initialization.
 */

(function () {
  // Prevent multiple injections
  if (window.lkMainWorldInitialized) {
    console.log("LinguaKit: Main world script already initialized.");
    return;
  }
  window.lkMainWorldInitialized = true;

  console.log("LinguaKit: Main world script initializing...");

  // Store the target language globally in the main world
  let lkTargetLang = "en";

  // Google Translate callback
  window.googleTranslateElementInit = function () {
    console.log("LinguaKit: Google Translate Element Init called.");

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
      console.log("LinguaKit: Google Translate Element created.");
    } catch (e) {
      console.error("LinguaKit: Error creating TranslateElement:", e);
    }
  };

  // Listen for the trigger event from the content script
  window.addEventListener("lk-trigger-page-translate", (event) => {
    const { targetLang } = event.detail || {};
    if (!targetLang) return;

    console.log(`LinguaKit: Triggering page translate to: ${targetLang}`);
    lkTargetLang = targetLang;

    // Check if script is already there
    const apiScript = document.getElementById("lk-google-translate-api");

    if (!apiScript) {
      const script = document.createElement("script");
      script.id = "lk-google-translate-api";
      script.type = "text/javascript";
      script.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";

      // Detect if script was blocked by a content blocker
      script.addEventListener("error", () => {
        console.error("LinguaKit: Google Translate script failed to load (blocked?).");
        window.dispatchEvent(
          new CustomEvent("lk-page-translate-error", {
            detail: { error: "BLOCKED_BY_CONTENT_BLOCKER" },
          }),
        );
      });

      document.head.appendChild(script);
      console.log("LinguaKit: Google Translate API script added.");
    } else {
      // If script exists, but we want to re-trigger or change language
      if (typeof google !== "undefined" && google.translate && google.translate.TranslateElement) {
        console.log("LinguaKit: API already loaded, attempting to re-init translation.");

        if (window.googleTranslateElementInit) {
          // Clear existing widget content to be safe
          const container = document.getElementById("google_translate_element");
          if (container) container.innerHTML = "";
          window.googleTranslateElementInit();
        }
      }
    }
  });

  console.log("LinguaKit: Main world script ready.");
})();
