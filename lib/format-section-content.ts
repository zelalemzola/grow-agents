/**
 * Formats section content for HTML display. Ensures paragraphs, line breaks,
 * and emphasis are properly styled. Use when section content may be plain text
 * without HTML tags (e.g. from pasted copy or LLM output).
 */

/**
 * Converts HTML from clipboard (e.g. Google Docs paste) to marker format.
 * - <b>, <strong> → **text**
 * - <i>, <em> → *text*
 * - <span style="font-weight:700"> (Google Docs bold) → **text**
 * - <span style="font-style:italic"> (Google Docs italic) → *text*
 * - Block elements, <br> → newlines
 * Use in onPaste to preserve bold/italic when pasting from rich text editors.
 */
export function htmlToMarkerFormat(html: string): string {
  if (!html || typeof html !== "string") return "";

  let out = html
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n\n");

  /* Google Docs uses span with font-weight for bold */
  out = out.replace(
    /<span[^>]*style="[^"]*font-weight:\s*(?:bold|700)[^"]*"[^>]*>([\s\S]*?)<\/span>/gi,
    "**$1**",
  );
  out = out.replace(
    /<span[^>]*style="[^"]*font-style:\s*italic[^"]*"[^>]*>([\s\S]*?)<\/span>/gi,
    "*$1*",
  );

  /* Replace innermost emphasis tags in a loop to handle nesting */
  let prev = "";
  while (prev !== out) {
    prev = out;
    out = out.replace(/<(i|em)>([\s\S]*?)<\/\1>/gi, "*$2*");
    out = out.replace(/<(b|strong)>([\s\S]*?)<\/\1>/gi, "**$2**");
  }

  /* Strip remaining tags */
  out = out.replace(/<[^>]+>/g, "");
  /* Decode common entities */
  out = out
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

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

/** Splits copy into paragraphs by double newlines. Preserves internal single newlines. */
export function splitCopyIntoParagraphs(copy: string): string[] {
  if (!copy || typeof copy !== "string") return [];
  const normalized = copy.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return normalized
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

type SectionWithIndices = {
  content?: string;
  paragraphIndices?: number[];
};

/**
 * Injects content from raw copy into sections using paragraphIndices.
 * Guarantees zero content loss: we pull text directly from the user's copy.
 * Mutates sections in place. Call BEFORE formatSectionPlanContentForHtml.
 * If some paragraphs are unassigned, appends them to the last body section.
 */
export function injectContentFromCopy(
  sections: SectionWithIndices[],
  rawCopy: string,
): void {
  let paragraphs = splitCopyIntoParagraphs(rawCopy);
  if (paragraphs.length === 0 && rawCopy.trim()) {
    paragraphs = [rawCopy.trim()];
  }
  if (paragraphs.length === 0) return;

  const assigned = new Set<number>();
  for (const section of sections) {
    const indices = section.paragraphIndices ?? [];
    if (indices.length === 0) continue;

    const parts: string[] = [];
    for (const i of indices) {
      if (i >= 0 && i < paragraphs.length) {
        parts.push(paragraphs[i]);
        assigned.add(i);
      }
    }
    if (parts.length > 0) {
      section.content = parts.join("\n\n");
    }
  }

  /* If any paragraphs were not assigned, append to last section to prevent content loss */
  const unassigned = paragraphs
    .map((_, i) => i)
    .filter((i) => !assigned.has(i));
  if (unassigned.length > 0 && sections.length > 0) {
    const fallback = [...sections].reverse().find((s) => s.content) ?? sections[sections.length - 1];
    const extra = unassigned.map((i) => paragraphs[i]).join("\n\n");
    fallback.content = fallback.content ? `${fallback.content}\n\n${extra}` : extra;
  }
}
