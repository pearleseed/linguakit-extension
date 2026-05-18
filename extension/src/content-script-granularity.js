/**
 * Granularity Translation Handlers. Handles line-by-line and sentence-by-sentence translation modes on active webpages.
 * Uses a Mark-and-Map (Delimiter) Strategy with Wrapper-Based Injection, along with an Inline Grouping and
 * Markdown-First Strategy to preserve the layout structure of original text.
 *
 * @file Content-script-granularity.js
 */

/**
 * Check if a DOM node represents a block element that breaks text grouping.
 *
 * @function isBlockNode
 * @param {Node} node - The DOM node to evaluate.
 * @returns {boolean} True if the node is a block element, false otherwise.
 */
function isBlockNode(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  const tagName = node.tagName.toLowerCase();
  // Known standard block tags
  return [
    "address",
    "article",
    "aside",
    "blockquote",
    "canvas",
    "dd",
    "div",
    "dl",
    "dt",
    "fieldset",
    "figcaption",
    "figure",
    "footer",
    "form",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "header",
    "hr",
    "li",
    "main",
    "nav",
    "noscript",
    "ol",
    "p",
    "pre",
    "section",
    "table",
    "tfoot",
    "ul",
    "video",
    "tr",
    "td",
    "th", // Tables are blocks for our purpose
  ].includes(tagName);
}

/**
 * Parses and returns translation units (groups of sequential inline nodes) from a root element.
 *
 * @function getTranslationUnits
 * @param {Element} root - Root container element to analyze.
 * @returns {{ nodes: Node[] }[]} List of inline node translation unit groups.
 */
function getTranslationUnits(root) {
  const units = [];
  let currentGroup = [];

  function flushGroup() {
    if (currentGroup.length > 0) {
      units.push({ nodes: [...currentGroup] });
      currentGroup = [];
    }
  }

  // Iterate over direct children
  for (let node of root.childNodes) {
    // Skip comments
    if (node.nodeType === Node.COMMENT_NODE) continue;

    // Skip our own injected wrappers
    if (
      node.nodeType === Node.ELEMENT_NODE &&
      (node.hasAttribute("data-linguakit-wrapper") || node.classList.contains("bt-injected-content"))
    ) {
      continue;
    }

    // Skip scripts/styles
    if (node.nodeType === Node.ELEMENT_NODE && ["script", "style", "noscript"].includes(node.tagName.toLowerCase())) {
      continue;
    }

    if (isBlockNode(node)) {
      // Block element found: Flush current group
      flushGroup();

      // RECURSION: Dive into the block to find units inside it
      // This allows us to translate a whole list (UL) by processing its LIs
      const childUnits = getTranslationUnits(node);
      units.push(...childUnits);
    } else {
      // Inline node (Text, Span, A, Code, etc.)
      // Special handling for BR
      if (node.nodeType === Node.ELEMENT_NODE && node.tagName.toLowerCase() === "br") {
        flushGroup();
      } else {
        currentGroup.push(node);
      }
    }
  }
  flushGroup();

  // Filter out empty units (only whitespace)
  return units.filter((unit) => {
    const text = unit.nodes
      .map((n) => n.textContent)
      .join("")
      .trim();
    return text.length > 0;
  });
}

/**
 * Custom guillemet character markers used for temporarily escaping '<' and '>' inside text nodes before sending content
 * to AI translation engines.
 *
 * @constant {Object} BRACKET_MARKERS
 */
const BRACKET_MARKERS = {
  LT: "«", // « (U+00AB) - Left-Pointing Double Angle Quotation Mark
  GT: "»", // » (U+00BB) - Right-Pointing Double Angle Quotation Mark
};

/**
 * Escapes HTML brackets in plain text to custom markers. This prevents LLM translation models from mistaking inline
 * characters like '<0.5%' for HTML tag definitions.
 *
 * @function escapeTextBrackets
 * @param {string} text - The input plain text string.
 * @returns {string} The escaped text string.
 */
function escapeTextBrackets(text) {
  if (!text) return text;
  return text.replace(/</g, BRACKET_MARKERS.LT).replace(/>/g, BRACKET_MARKERS.GT);
}

/**
 * Restores bracket markers back to safe HTML entity codes. Done after receiving the translated response payload.
 *
 * @function restoreAndEscapeBrackets
 * @param {string} text - The translated text containing markers.
 * @returns {string} The HTML entity safe string.
 */
function restoreAndEscapeBrackets(text) {
  if (!text) return text;
  return text.replace(new RegExp(BRACKET_MARKERS.LT, "g"), "&lt;").replace(new RegExp(BRACKET_MARKERS.GT, "g"), "&gt;");
}

/**
 * Convert DOM nodes into simplified Markdown representation.
 *
 * @function toMarkdown
 * @param {Node[] | NodeList} nodes - The target DOM elements.
 * @returns {string} The parsed Markdown string representation.
 */
function toMarkdown(nodes) {
  let md = "";
  // Handle NodeList or Array
  const nodeList = nodes instanceof NodeList ? Array.from(nodes) : nodes;

  nodeList.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      // Escape < and > in text to prevent LLM confusion
      md += escapeTextBrackets(node.textContent);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName.toLowerCase();

      // Handle Void Elements (no children)
      if (["img", "br", "hr", "input", "meta", "link"].includes(tag)) {
        md += node.outerHTML;
        return;
      }

      // Process children recursively
      const childMarkdown = toMarkdown(node.childNodes);

      switch (tag) {
        case "b":
        case "strong":
          md += `**${childMarkdown}**`;
          break;
        case "i":
        case "em":
          md += `*${childMarkdown}*`;
          break;
        case "code":
          // For code, we protect the content from translation by putting it inside backticks.
          md += `\`${node.textContent}\``;
          break;
        case "a":
          // Keep link text in brackets to hint it's a link
          md += `[${childMarkdown}]`;
          break;
        default: {
          // For unknown inline tags (span, custom), preserve the wrapper but translate the content.
          const tagName = node.tagName.toLowerCase();
          let attrs = "";
          for (const attr of node.attributes) {
            attrs += ` ${attr.name}="${attr.value}"`;
          }
          const openTag = `<${tagName}${attrs}>`;
          const closeTag = `</${tagName}>`;

          md += `${openTag}${childMarkdown}${closeTag}`;
        }
      }
    }
  });
  return md;
}

/**
 * Escape '<' and '>' that are NOT part of valid HTML tag structures. Prevents plain mathematical operators or emoticon
 * symbols (e.g. '<3', 'a < b') from corrupting the DOM hierarchy.
 *
 * @function escapeNonHtmlBrackets
 * @param {string} text - The raw HTML markup string.
 * @returns {string} The sanitized HTML markup string.
 */
function escapeNonHtmlBrackets(text) {
  if (!text) return text;

  let result = text;

  // Strategy: Replace valid HTML tags with placeholders, escape everything else, restore tags

  // Step 1: Temporarily replace valid HTML tags with placeholders
  const tagPlaceholders = [];
  const tagRegex = /<\/?[a-zA-Z][a-zA-Z0-9]*(?:\s+[^>]*)?>/g;

  result = result.replace(tagRegex, (match) => {
    const placeholder = `__HTML_TAG_${tagPlaceholders.length}__`;
    tagPlaceholders.push(match);
    return placeholder;
  });

  // Step 2: Escape ALL remaining raw brackets
  result = result.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Step 3: Restore HTML tags from placeholders
  tagPlaceholders.forEach((tag, index) => {
    result = result.replace(`__HTML_TAG_${index}__`, tag);
  });

  return result;
}

/**
 * Converts Markdown syntactic structure back to formatted HTML tags.
 *
 * @function markupHTML
 * @param {string} text - The input translated Markdown snippet.
 * @returns {string} The formatted HTML tag string.
 */
function markupHTML(text) {
  if (!text) return text;

  // Step 1: Restore bracket markers (« ») to HTML entities (&lt; &gt;)
  // This handles text like "(<0.5%)" that was escaped before API call
  let processed = restoreAndEscapeBrackets(text);

  // Step 2: Escape any remaining < or > that aren't part of valid HTML tags
  // This handles cases where API might have introduced new brackets
  processed = escapeNonHtmlBrackets(processed);

  // Step 3: Apply Markdown to HTML conversions
  return (
    processed
      // Bold: **text**
      .replace(/\*\*(.*?)\*\?/g, "<b>$1</b>")
      // Italic: *text*
      .replace(/\*(.*?)\*/g, "<i>$1</i>")
      // Code: `text`
      .replace(/`(.*?)`/g, "<code>$1</code>")
      // Link: [text] -> <span class="bt-link">text</span>
      .replace(/\[(.*?)\]/g, '<span style="text-decoration: underline; cursor: pointer;">$1</span>')
  );
}

/**
 * Handles line-by-line translation tasks on an active webpage element. Splits content into custom translation units,
 * groups requests with structural delimiters, queries the translation API, and updates wrappers with loading spinner
 * indicators.
 *
 * @async
 * @function handleLineByLineTranslate
 * @param {Element} element - The target webpage DOM element.
 * @param {string} text - The plain text representation.
 * @param {Object} settings - User settings configuration options.
 * @param {Function} createPlaceholder - Callback function to construct inline loaders.
 * @param {Function} updateContent - Callback function to update DOM text content.
 * @param {Function} requestTranslation - Routing function to send API translation requests.
 * @param {Map} cache - Local runtime cache dictionary.
 * @param {Function} _clearAllHoverTranslations - Callback function to purge hover translation history.
 * @returns {Promise<void>}
 */
// eslint-disable-next-line no-unused-vars -- called from content-script.js
async function handleLineByLineTranslate(
  element,
  text,
  settings,
  createPlaceholder,
  updateContent,
  requestTranslation,
  cache,
  _clearAllHoverTranslations,
) {
  // 1. Check if already translated
  if (element.hasAttribute("data-linguakit-translated")) {
    return;
  }

  // 2. Get Translation Units (Groups)
  const units = getTranslationUnits(element);

  if (units.length === 0) {
    return;
  }

  // 3. Inject Wrappers with Loading Indicators
  const wrappers = [];

  for (const unit of units) {
    const firstNode = unit.nodes[0];
    const parent = firstNode.parentNode;

    if (!parent) continue;

    const wrapper = document.createElement("span");
    wrapper.setAttribute("data-linguakit-wrapper", "true");
    wrapper.style.display = "inline";

    const originalSpan = document.createElement("span");
    originalSpan.setAttribute("data-linguakit-original", "true");

    const translationSpan = document.createElement("span");
    translationSpan.setAttribute("data-linguakit-translation", "true");
    translationSpan.className = "bt-loading-indicator";
    translationSpan.style.display = "inline";
    translationSpan.innerHTML = '<span class="bt-spinner"></span>';

    // Insert wrapper before first node
    parent.insertBefore(wrapper, firstNode);

    // Move all nodes into originalSpan
    unit.nodes.forEach((node) => {
      originalSpan.appendChild(node);
    });

    wrapper.appendChild(originalSpan);
    wrapper.appendChild(document.createElement("br")); // Add line break
    wrapper.appendChild(translationSpan);

    wrappers.push({ wrapper, translationSpan });
  }

  // Mark element
  element.setAttribute("data-linguakit-translated", "line");
  element.classList.add("bt-hover-translated");

  // 4. Prepare text with Delimiters (Markdown conversion)
  const DELIMITER = " ||| ";
  const originalMarkdowns = units.map((u) => toMarkdown(u.nodes));
  const combinedText = originalMarkdowns.join(DELIMITER);

  // Cache key
  const cacheKey = `line-md-${combinedText.length}-${settings.nativeLanguageCode}-${settings.activeProviderId}`;

  let translatedSegments;
  if (cache.has(cacheKey)) {
    translatedSegments = cache.get(cacheKey);
  } else {
    try {
      const customPrompt = `Translate the following Markdown text segments. The segments are separated by "${DELIMITER}". Keep the delimiter "${DELIMITER}" in the output at the exact same positions. Preserve Markdown syntax (**, *, \`, []) and HTML tags. Do not translate code inside \`\`. Return the full translated string with delimiters.`;

      const res = await requestTranslation({
        text: combinedText,
        nativeLanguageCode: settings.nativeLanguageCode || "en",
        targetLanguage: settings.nativeLanguageCode || "vi",
        sourceLanguage: settings.targetLanguageCode || "en",
        useAutoDetect: false,
        customPrompt: customPrompt,
      });

      if (res?.ok && res.result?.translation) {
        const rawTranslation = res.result.translation;
        translatedSegments = rawTranslation.split(/\|\|\|/).map((s) => s.trim());

        if (translatedSegments.length !== originalMarkdowns.length) {
          console.warn(
            "[Granularity] Delimiter mismatch. Expected:",
            originalMarkdowns.length,
            "Got:",
            translatedSegments.length,
          );
          if (translatedSegments.length === 1 && rawTranslation.includes("\n")) {
            translatedSegments = rawTranslation.split("\n").map((s) => s.trim());
          }
        }

        cache.set(cacheKey, translatedSegments);
      } else {
        console.error("[Granularity] Translation failed:", res?.error);
        wrappers.forEach(({ _wrapper, translationSpan }) => {
          translationSpan.textContent = "❌ Error";
        });
        return;
      }
    } catch (err) {
      console.error("[Granularity] Error:", err);
      wrappers.forEach(({ _wrapper, translationSpan }) => {
        translationSpan.textContent = "❌ Error";
      });
      return;
    }
  }

  // 5. Update Wrappers with Translations
  updateWrappers(wrappers, translatedSegments, settings);
}

/**
 * Updates DOM segment wrappers with localized translated strings and style specifications.
 *
 * @function updateWrappers
 * @param {{ wrapper: Element; translationSpan: Element }[]} wrappers - Target segment container list.
 * @param {string[]} translations - List of translated text segments.
 * @param {Object} settings - User settings style configurations.
 * @returns {void}
 */
function updateWrappers(wrappers, translations, settings) {
  const textColor = settings.hoverInjectStyle?.textColor || "#ff0000";
  const fontSize = settings.hoverInjectStyle?.fontSize || "0.95em";
  const showIcon = settings.hoverInjectStyle?.showIcon !== false;
  const iconSrc = chrome.runtime.getURL("assets/icons/icon-19.png");

  wrappers.forEach(({ _wrapper, translationSpan }, i) => {
    if (!translations || i >= translations.length) {
      translationSpan.remove();
      return;
    }

    const translation = translations[i];
    if (!translation) {
      translationSpan.remove();
      return;
    }

    const markedTranslation = markupHTML(translation);

    translationSpan.classList.remove("bt-loading-indicator");
    translationSpan.style.lineHeight = "1.4";

    const iconHtml = showIcon
      ? `<img src="${iconSrc}" class="bt-hover-icon" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 6px; display: inline-block;">`
      : "";

    translationSpan.innerHTML = `${iconHtml}<span style="color: ${textColor}; font-size: ${fontSize};">${markedTranslation}</span>`;
  });
}
