/**
 * Formats section content for HTML display. Ensures paragraphs, line breaks,
 * and emphasis are properly styled. Use when section content may be plain text
 * without HTML tags (e.g. from pasted copy or LLM output).
 */

/**
 * Converts HTML from clipboard (e.g. Google Docs paste) to marker format.
 * Preserves: bold, italic, underline, spacing, and paragraph/line breaks.
 * - <b>, <strong>, font-weight:bold/700 → **text**
 * - <i>, <em>, font-style:italic → *text*
 * - <u>, text-decoration:underline → __u__ (we use __ for underline to avoid conflict with bold)
 * - <p>, <div>, <br> → newlines so spacing is intact
 * Use in onPaste to preserve formatting when pasting from Google Docs and other rich editors.
 */
export function htmlToMarkerFormat(html: string): string {
  if (!html || typeof html !== "string") return "";

  let out = html
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>\s*<div[^>]*>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n\n");

  /* Google Docs: span with font-weight (bold/700), with optional spaces in style */
  out = out.replace(
    /<span[^>]*style="[^"]*font-weight\s*:\s*(?:bold|700)[^"]*"[^>]*>([\s\S]*?)<\/span>/gi,
    "**$1**",
  );
  out = out.replace(
    /<span[^>]*style="[^"]*font-style\s*:\s*italic[^"]*"[^>]*>([\s\S]*?)<\/span>/gi,
    "*$1*",
  );
  /* Single-quoted style (some editors) */
  out = out.replace(
    /<span[^>]*style='[^']*font-weight\s*:\s*(?:bold|700)[^']*'[^>]*>([\s\S]*?)<\/span>/gi,
    "**$1**",
  );
  out = out.replace(
    /<span[^>]*style='[^']*font-style\s*:\s*italic[^']*'[^>]*>([\s\S]*?)<\/span>/gi,
    "*$1*",
  );

  /* Underline (Google Docs / Word): preserve as <u> will be stripped; use a marker we can map later. We use <u> replacement after bold/italic so nested works. */
  out = out.replace(
    /<span[^>]*style="[^"]*text-decoration\s*:\s*underline[^"]*"[^>]*>([\s\S]*?)<\/span>/gi,
    "<u>$1</u>",
  );

  /* Replace innermost emphasis tags in a loop to handle nesting (italic before bold so ** is not broken) */
  let prev = "";
  while (prev !== out) {
    prev = out;
    out = out.replace(/<(i|em)>([\s\S]*?)<\/\1>/gi, "*$2*");
    out = out.replace(/<(b|strong)>([\s\S]*?)<\/\1>/gi, "**$2**");
  }
  /* Underline: convert to a marker. We use _u_ for underline (distinct from * and **). */
  out = out.replace(/<u>([\s\S]*?)<\/u>/gi, "_u_$1_u_");

  /* Strip remaining tags */
  out = out.replace(/<[^>]+>/g, "");
  /* Decode common entities */
  out = out
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
  /* Collapse only excessive newlines (keep single and double for spacing); preserve paragraph breaks */
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Converts plain text content to HTML-formatted content.
 * - Double newlines (paragraph breaks) → <br><br>
 * - Single newlines → <br>
 * - **text** or __text__ (when not _u_) → <b>text</b> (bold)
 * - *text* or _text_ (when not part of _u_) → <i>text</i> (italic)
 * - _u_text_u_ → <u>text</u> (underline, from Google Docs paste)
 * - Preserves existing <b>, <i>, <u>, <br> tags (no double-conversion)
 * - Normalizes line endings
 */
export function formatSectionContentForHtml(content: string): string {
  if (!content || typeof content !== "string") return content;

  const normalized = content
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

  // Underline marker first (_u_..._u_) so it doesn't get treated as italic
  let out = normalized.replace(/_u_([\s\S]*?)_u_/g, "<u>$1</u>");
  // Bold: **text** or __text__ (two underscores; process before single _ italic)
  out = out.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/__(.+?)__/g, "<b>$1</b>");
  // Italic: *text* or _text_ (single underscore, no * or _ inside)
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

const MAX_WORDS_PER_PARAGRAPH = 120;

/**
 * Splits a long block of text into paragraphs of at most MAX_WORDS_PER_PARAGRAPH words.
 * Tries to break at sentence boundaries (. ! ?) to keep readability.
 */
function splitLongParagraphIntoChunks(paragraph: string, maxWords: number): string[] {
  const trimmed = paragraph.trim();
  if (!trimmed) return [];
  const words = trimmed.split(/\s+/);
  if (words.length <= maxWords) return [trimmed];

  const chunks: string[] = [];
  let current: string[] = [];
  let currentWordCount = 0;
  const sentenceEnd = /[.!?]\s*$/;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    current.push(word);
    currentWordCount++;

    const atLimit = currentWordCount >= maxWords;
    const nextWord = words[i + 1];
    const nextStartsSentence = nextWord && /^[A-Z"']/.test(nextWord);
    const endOfSentence = sentenceEnd.test(current.join(" "));

    if (atLimit || (currentWordCount >= Math.max(40, maxWords / 2) && endOfSentence && nextStartsSentence)) {
      chunks.push(current.join(" ").trim());
      current = [];
      currentWordCount = 0;
    }
  }
  if (current.length > 0) {
    chunks.push(current.join(" ").trim());
  }
  return chunks;
}

/** Splits copy into paragraphs by double newlines. Any paragraph over 120 words is split into multiple paragraphs for proper styling. Preserves internal single newlines. */
export function splitCopyIntoParagraphs(copy: string): string[] {
  if (!copy || typeof copy !== "string") return [];
  const normalized = copy.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rawParagraphs = normalized
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const result: string[] = [];
  for (const p of rawParagraphs) {
    const chunks = splitLongParagraphIntoChunks(p, MAX_WORDS_PER_PARAGRAPH);
    result.push(...chunks);
  }
  return result;
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
