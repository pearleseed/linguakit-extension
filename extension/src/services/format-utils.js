/**
 * LinguaKit Formatting Utilities. Handles bidirectional format translation (HTML <-> Markdown). By mapping rich textual
 * layouts (e.g. bold, italics, strikethrough, anchor links, block code, ordered/unordered lists) to lightweight
 * Markdown structure, the translation engine can process semantic content cleanly, preventing AI translation models
 * from truncating or stripping structural nodes.
 *
 * @file Format-utils.js
 */

/**
 * Check if a text block contains HTML tags that warrant formatting preservation.
 *
 * @function shouldConvertFormat
 * @param {string} text - The input raw text snippet to inspect.
 * @returns {boolean} True if the snippet contains markup elements, false otherwise.
 */
export function shouldConvertFormat(text) {
  if (!text || typeof text !== "string") return false;
  return /<[a-z][^>]*>/i.test(text);
}

/**
 * Convert HTML structures to corresponding Markdown representation before translation. Preserves syntax formatting like
 * bold, italic, inline code, anchor URLs, and lists.
 *
 * @function htmlToMarkdown
 * @param {string} htmlContent - The raw HTML markup text to parse.
 * @returns {string} The simplified Markdown equivalent string.
 */
export function htmlToMarkdown(htmlContent) {
  if (!htmlContent) return "";

  let md = htmlContent
    // Code blocks (preserve before other conversions)
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, "```\n$1\n```")
    .replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`")

    // Links - convert to markdown [text](url)
    .replace(/<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, "[$2]($1)")

    // Line breaks
    .replace(/<br\s*\/?>/gi, "\n")

    // Bold
    .replace(/<(b|strong)[^>]*>(.*?)<\/\1>/gi, "**$2**")

    // Italic
    .replace(/<(i|em)[^>]*>(.*?)<\/\1>/gi, "_$2_")

    // Strikethrough
    .replace(/<(s|strike)[^>]*>(.*?)<\/\1>/gi, "~~$2~~")

    // Underline (keep as-is for HTML compatibility)
    .replace(/<u[^>]*>(.*?)<\/u>/gi, "<u>$1</u>")

    // Lists
    .replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n")
    .replace(/<(ul|ol)[^>]*>|<\/(ul|ol)>/gi, "")

    // Strip remaining HTML tags (except <u>)
    .replace(/<(?!u|\/u)[^>]+>/g, "");

  return md.trim();
}

/**
 * Re-converts Markdown structures back to standard HTML tags post-translation.
 *
 * @function markdownToHtml
 * @param {string} markdownContent - The translated Markdown string.
 * @returns {string} The fully restored HTML markup string.
 */
export function markdownToHtml(markdownContent) {
  if (!markdownContent) return "";

  let html = markdownContent
    // Code blocks (process first to avoid interference)
    .replace(/```([\s\S]*?)```/g, "<pre>$1</pre>")
    .replace(/`(.*?)`/g, "<code>$1</code>")

    // Links - convert [text](url) to <a>
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')

    // Bold
    .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")

    // Italic
    .replace(/_(.*?)_/g, "<i>$1</i>")

    // Strikethrough
    .replace(/~~(.*?)~~/g, "<s>$1</s>")

    // Underline (already in HTML format)
    .replace(/<u>(.*?)<\/u>/g, "<u>$1</u>")

    // Lists - convert "- item" to "<li>item</li>"
    .replace(/^- (.+)$/gm, "<li>$1</li>");

  // Wrap lists BEFORE adding <br> tags
  if (html.includes("<li>")) {
    const lines = html.split("\n");
    const result = [];
    let inList = false;
    let currentList = [];

    lines.forEach((line) => {
      if (line.startsWith("<li>")) {
        if (!inList) {
          inList = true;
          currentList = [];
        }
        currentList.push(line);
      } else {
        if (inList) {
          // End of list, wrap it
          result.push(`<ul>${currentList.join("")}</ul>`);
          currentList = [];
          inList = false;
        }
        if (line.trim()) {
          result.push(line);
        }
      }
    });

    // Handle remaining list
    if (currentList.length > 0) {
      result.push(`<ul>${currentList.join("")}</ul>`);
    }

    html = result.join("<br>");
  } else {
    html = html.replace(/\n/g, "<br>");
  }

  // Normalize multiple consecutive <br> tags to single <br>
  // This handles cases where original HTML had <br> that became \n then <br> again
  html = html.replace(/(<br\s*\/?>[\s\n]*)+/gi, "<br>");

  return html;
}
