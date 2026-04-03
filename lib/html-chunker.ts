/**
 * Splits HTML into chunks at safe tag boundaries to avoid truncation,
 * hallucination, and broken output when translating long documents.
 * Smaller chunks = more accurate translation with less risk of the model
 * skipping, summarizing, or truncating content.
 */

/**
 * ~7k chars per chunk — smaller chunks reduce truncation, skipped sections, and
 * quality drop on very long pages. Tradeoff: more sequential API calls.
 */
const CHUNK_SIZE = 7_000;

/** Tags we can safely split after (closing tags) — prefer granular boundaries */
const SPLIT_TAG_PATTERN =
  /<\/(section|article|div|main|header|footer|aside|nav|blockquote|figure|figcaption|p|span|li|h[1-6]|table|tbody|thead|tr|td|th|form|ul|ol|dl|dd|dt)>/gi;

export function splitHtmlIntoChunks(html: string): string[] {
  if (html.length <= CHUNK_SIZE) {
    return [html];
  }

  const chunks: string[] = [];
  let remaining = html;

  while (remaining.length > CHUNK_SIZE) {
    const slice = remaining.slice(0, CHUNK_SIZE);
    const matches = [...slice.matchAll(SPLIT_TAG_PATTERN)];
    const lastMatch = matches[matches.length - 1];

    let splitPos: number;
    if (lastMatch) {
      splitPos = lastMatch.index! + lastMatch[0].length;
    } else {
      // Prefer closing </p> inside slice (common in long single-column pages)
      const lastP = slice.lastIndexOf("</p>");
      const lastNewline = slice.lastIndexOf("\n");
      const lastAngle = slice.lastIndexOf(">");
      if (lastP > CHUNK_SIZE * 0.35) {
        splitPos = lastP + "</p>".length;
      } else {
        splitPos = Math.max(lastNewline, lastAngle, 1);
      }
    }

    chunks.push(remaining.slice(0, splitPos));
    remaining = remaining.slice(splitPos);
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}
