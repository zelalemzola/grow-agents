/**
 * Splits HTML into chunks at safe tag boundaries to avoid truncation
 * and broken output when translating long documents.
 */

/** ~32k chars ≈ 8k tokens - keeps each chunk within model limits */
const CHUNK_SIZE = 32_000;

/** Tags we can safely split after (closing tags) */
const SPLIT_TAG_PATTERN =
  /<\/(section|article|div|main|header|footer|aside|blockquote|figure|p|li|h[1-6])>/gi;

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
