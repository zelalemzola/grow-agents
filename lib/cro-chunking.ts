/**
 * Chunking utilities for CRO Agent to handle long inputs accurately.
 * Mirrors translation agent approach: split at safe boundaries to prevent
 * truncation, hallucination, and broken output.
 */

import {
  splitHtmlIntoChunks,
} from "@/lib/html-chunker";
import {
  extractBodyForTranslation,
  reassembleHtml,
} from "@/lib/html-extract-body";

/** ~12k chars ≈ 3k tokens - conservative to prevent truncation/hallucination */
export const CRO_CHUNK_SIZE = 12_000;

/** Max chars for customer research when passed alongside chunked copy (keeps context manageable) */
export const CRO_RESEARCH_MAX_CONTEXT = 15_000;

/** Max chars of funnel A / assets when passed to each bridge chunk */
export const CRO_BRIDGE_CONTENT_MAX = 18_000;

/**
 * Splits copy (plain text or HTML) at paragraph/section boundaries.
 * Avoids cutting mid-sentence for accurate optimization.
 */
export function splitCopyIntoChunks(copy: string): string[] {
  if (copy.length <= CRO_CHUNK_SIZE) {
    return [copy];
  }

  const chunks: string[] = [];
  let remaining = copy;

  const splitPattern =
    /<\/(p|div|section|article|h[1-6])>|\n\n+|\n/g;

  while (remaining.length > CRO_CHUNK_SIZE) {
    const slice = remaining.slice(0, CRO_CHUNK_SIZE);
    const matches = [...slice.matchAll(splitPattern)];
    const lastMatch = matches[matches.length - 1];

    let splitPos: number;
    if (lastMatch) {
      splitPos = lastMatch.index! + lastMatch[0].length;
    } else {
      // Fallback: split at last space to avoid cutting words
      const lastSpace = slice.lastIndexOf(" ");
      splitPos = lastSpace > 0 ? lastSpace + 1 : CRO_CHUNK_SIZE;
    }

    chunks.push(remaining.slice(0, splitPos));
    remaining = remaining.slice(splitPos);
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

export type CroHtmlExtractResult =
  | {
      ok: true;
      prefix: string;
      bodyContent: string;
      suffix: string;
      scripts: string[];
    }
  | { ok: false; bodyContent: string };

/**
 * Extracts body content from HTML for chunked processing.
 * Preserves doctype, head, and scripts outside the chunked body.
 */
export function extractBodyForCro(html: string): CroHtmlExtractResult {
  const result = extractBodyForTranslation(html);
  if (result.ok) {
    return {
      ok: true,
      prefix: result.prefix,
      bodyContent: result.bodyForTranslation,
      suffix: result.suffix,
      scripts: result.scripts,
    };
  }
  return { ok: false, bodyContent: html };
}

/**
 * Chunks HTML body content at safe tag boundaries.
 */
export function chunkHtmlBody(bodyContent: string): string[] {
  return splitHtmlIntoChunks(bodyContent);
}

/**
 * Reassembles full HTML from prefix + processed body chunks + suffix.
 */
export function reassembleCroHtml(
  prefix: string,
  processedBody: string,
  suffix: string,
  scripts: string[],
): string {
  return reassembleHtml(prefix, processedBody, suffix, scripts);
}

/**
 * Truncates text to maxLength, preferring to cut at sentence/paragraph boundary.
 */
export function truncateForContext(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const slice = text.slice(0, maxLength);
  const lastPeriod = slice.lastIndexOf(". ");
  const lastNewline = slice.lastIndexOf("\n");
  const cut = Math.max(lastPeriod + 1, lastNewline + 1, maxLength - 500);
  return text.slice(0, cut > 0 ? cut : maxLength) + "\n\n[Content truncated for processing...]";
}
