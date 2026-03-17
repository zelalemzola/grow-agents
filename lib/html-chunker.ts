/**
 * Splits HTML into chunks at safe tag boundaries to avoid truncation,
 * hallucination, and broken output when translating long documents.
 * Smaller chunks = more accurate translation with less risk of the model
 * skipping, summarizing, or truncating content.
 */

/** ~12k chars ≈ 3k tokens - conservative to prevent truncation/hallucination */
const CHUNK_SIZE = 12_000;

/** Tags we can safely split after (closing tags) - block-level boundaries */
const SPLIT_TAG_PATTERN =
  /<\/(section|article|div|main|header|footer|aside|nav|blockquote|figure|figcaption|p|li|h[1-6]|table|tbody|tr|form|ul|ol)>/gi;

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
      // Fallback: split at last newline or > to avoid cutting mid-tag
      const lastNewline = slice.lastIndexOf("\n");
      const lastAngle = slice.lastIndexOf(">");
      splitPos = Math.max(lastNewline, lastAngle, 1);
    }

    chunks.push(remaining.slice(0, splitPos));
    remaining = remaining.slice(splitPos);
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}
