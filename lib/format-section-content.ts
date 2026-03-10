/**
 * Formats section content for HTML display. Ensures paragraphs, line breaks,
 * and emphasis are properly styled. Use when section content may be plain text
 * without HTML tags (e.g. from pasted copy or LLM output).
 */

/**
 * Converts plain text content to HTML-formatted content.
 * - Double newlines (paragraph breaks) → <br><br>
 * - Single newlines → <br>
 * - **text** or __text__ → <b>text</b> (bold)
 * - *text* or _text_ → <i>text</i> (italic) — only when not already inside **
 * - Preserves existing <b>, <i>, <br> tags (no double-conversion)
 * - Normalizes line endings
 */
export function formatSectionContentForHtml(content: string): string {
  if (!content || typeof content !== "string") return content;

  const normalized = content
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

  // Bold first: **text** or __text__ (process before italic so ** is consumed)
  let out = normalized.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/__(.+?)__/g, "<b>$1</b>");
  // Italic: *text* or _text_ (no * or _ inside; safe after bold conversion)
  out = out.replace(/\*([^*\n]+?)\*/g, "<i>$1</i>").replace(/_([^_\n]+?)_/g, "<i>$1</i>");

  // Convert newlines to HTML: paragraph breaks -> <br><br>, line breaks -> <br>
  return out.replace(/\n\n+/g, "<br><br>").replace(/\n/g, "<br>");
}

/**
 * Applies formatSectionContentForHtml to all sections in a section plan.
 * Mutates sections in place.
 */
export function formatSectionPlanContentForHtml(sections: Array<{ content?: string }>): void {
  for (const section of sections) {
    if (section.content && typeof section.content === "string") {
      section.content = formatSectionContentForHtml(section.content);
    }
  }
}
