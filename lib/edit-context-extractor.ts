/**
 * Extracts relevant HTML/CSS sections for targeted edits to reduce LLM payload size.
 * Finds {{image:sectionId}} markers and extracts content around matching sections.
 */

import { getSectionOuterHtml } from "@/lib/funnel-html-manipulate";

const SECTION_WINDOW = 1200; // chars before/after each placeholder
const MAX_TOTAL_HTML = 8000;  // max chars to send for HTML
const MAX_TOTAL_CSS = 6000;   // max chars to send for CSS

/** Extract section IDs from HTML via {{image:sectionId}} placeholders */
function getSectionIds(html: string): string[] {
  const ids: string[] = [];
  const re = /\{\{image:([a-zA-Z0-9_-]+)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    ids.push(m[1]);
  }
  return [...new Set(ids)];
}

/** Simple keyword matching: which section IDs are relevant to the edit? */
function getRelevantSectionIds(
  sectionIds: string[],
  editComment: string,
  summary: string,
): Set<string> {
  const text = `${editComment} ${summary}`.toLowerCase();
  const words = text.split(/\s+/).filter((w) => w.length > 2);
  const relevant = new Set<string>();

  for (const id of sectionIds) {
    const idLower = id.toLowerCase();
    if (words.some((w) => idLower.includes(w) || idLower.includes(w.replace(/s$/, "")))) {
      relevant.add(id);
    }
    // Also match common aliases
    if (
      (text.includes("hero") && (idLower.includes("hero") || id === "headline")) ||
      (text.includes("headline") && idLower.includes("headline")) ||
      (text.includes("cta") && (idLower.includes("cta") || idLower.includes("button"))) ||
      (text.includes("first") && id === sectionIds[1]) // first body section
    ) {
      relevant.add(id);
    }
  }

  return relevant;
}

/** Extract HTML excerpts around the given section IDs */
function extractHtmlSections(
  html: string,
  sectionIds: string[],
  relevantIds: Set<string>,
): string {
  const re = /\{\{image:([a-zA-Z0-9_-]+)\}\}/g;
  const sections: Array<{ id: string; start: number; end: number }> = [];
  let m: RegExpExecArray | null;

  while ((m = re.exec(html)) !== null) {
    const id = m[1];
    const pos = m.index;
    const matchStart = Math.max(0, pos - SECTION_WINDOW);
    const matchEnd = Math.min(html.length, pos + m[0].length + SECTION_WINDOW);
    sections.push({ id, start: matchStart, end: matchEnd });
  }

  const toInclude = relevantIds.size > 0 ? relevantIds : new Set(sectionIds.slice(0, 2));
  const ranges = sections
    .filter((s) => toInclude.has(s.id))
    .sort((a, b) => a.start - b.start);

  if (ranges.length === 0) {
    return html.slice(0, MAX_TOTAL_HTML);
  }

  // Merge overlapping ranges and build excerpt
  const merged: Array<{ start: number; end: number }> = [];
  for (const r of ranges) {
    if (merged.length > 0 && r.start <= merged[merged.length - 1].end + 200) {
      merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, r.end);
    } else {
      merged.push({ start: r.start, end: r.end });
    }
  }

  let excerpt = "";
  for (const { start, end } of merged) {
    excerpt += html.slice(start, end);
    if (excerpt.length >= MAX_TOTAL_HTML) break;
  }

  return excerpt.slice(0, MAX_TOTAL_HTML);
}

/** Truncate CSS if too long; prefer the start (usually contains layout/global rules) */
function truncateCss(css: string): string {
  if (css.length <= MAX_TOTAL_CSS) return css;
  return css.slice(0, MAX_TOTAL_CSS) + "\n\n/* ... rest of CSS truncated ... */";
}

export interface EditContext {
  htmlExcerpt: string;
  cssExcerpt: string;
  useFullDocument: boolean;
}

/**
 * Produces a smaller HTML/CSS context for the targeted-edits LLM.
 * When we can identify relevant sections, sends only those excerpts.
 * When `focusSectionId` is set, prefers that section's outer HTML only.
 */
export function extractEditContext(
  html: string,
  css: string,
  editComment: string,
  editSummary: string,
  options?: { focusSectionId?: string },
): EditContext {
  if (options?.focusSectionId) {
    const outer = getSectionOuterHtml(html, options.focusSectionId);
    if (outer) {
      const htmlExcerpt =
        outer.length > MAX_TOTAL_HTML
          ? outer.slice(0, MAX_TOTAL_HTML) + "\n\n/* …truncated… */"
          : outer;
      return {
        htmlExcerpt,
        cssExcerpt: truncateCss(css),
        useFullDocument: false,
      };
    }
  }

  const sectionIds = getSectionIds(html);
  const relevantIds = getRelevantSectionIds(sectionIds, editComment, editSummary);

  const htmlExcerpt = extractHtmlSections(html, sectionIds, relevantIds);
  const cssExcerpt = truncateCss(css);
  const useFullDocument = htmlExcerpt.length >= html.length * 0.9;

  return {
    htmlExcerpt,
    cssExcerpt,
    useFullDocument,
  };
}
