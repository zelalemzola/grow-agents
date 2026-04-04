/**
 * Split funnel HTML into top-level <section id="…"> blocks for chunked auditing.
 * No DOM / linkedom — safe on Node (Next.js API routes). Does not modify HTML.
 */

function nestingDepthBefore(fragment: string, idx: number): number {
  let depth = 0;
  let pos = 0;
  const lower = fragment.toLowerCase();
  while (pos < idx) {
    const a = lower.indexOf("<section", pos);
    const b = lower.indexOf("</section>", pos);
    if (a === -1 && b === -1) break;
    if (a !== -1 && (b === -1 || a < b)) {
      depth++;
      pos = a + 8;
    } else if (b !== -1) {
      depth = Math.max(0, depth - 1);
      pos = b + 10;
    } else break;
  }
  return depth;
}

function findClosingSectionEnd(html: string, sectionOpenIdx: number): number | null {
  const gt = html.indexOf(">", sectionOpenIdx);
  if (gt === -1) return null;
  let pos = gt + 1;
  let depth = 0;
  const lower = html.toLowerCase();
  while (pos < html.length) {
    const a = lower.indexOf("<section", pos);
    const b = lower.indexOf("</section>", pos);
    if (b === -1) return null;
    if (a !== -1 && a < b) {
      depth++;
      pos = a + 8;
    } else {
      if (depth === 0) return b + 10;
      depth--;
      pos = b + 10;
    }
  }
  return null;
}

function extractTopLevelSectionsFromFragment(fragment: string): {
  sectionId: string;
  html: string;
}[] {
  const out: { sectionId: string; html: string }[] = [];
  let pos = 0;
  const lower = fragment.toLowerCase();
  while (pos < fragment.length) {
    const idx = lower.indexOf("<section", pos);
    if (idx === -1) break;
    if (nestingDepthBefore(fragment, idx) !== 0) {
      pos = idx + 1;
      continue;
    }
    const head = fragment.slice(idx, idx + 480);
    const idMatch = head.match(/\bid\s*=\s*["']([^"']+)["']/i);
    if (!idMatch) {
      pos = idx + 1;
      continue;
    }
    const end = findClosingSectionEnd(fragment, idx);
    if (end === null) break;
    out.push({
      sectionId: idMatch[1]!,
      html: fragment.slice(idx, end),
    });
    pos = end;
  }
  return out;
}

/**
 * Returns ordered section chunks (full outer HTML per section). If no sections
 * are found, returns a single chunk with the full document string.
 */
export function getAuditHtmlChunks(fullHtml: string): {
  sectionId: string;
  html: string;
}[] {
  const html = fullHtml.trim();
  if (!html) return [];

  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  let container = bodyMatch ? bodyMatch[1]! : html;

  let sections = extractTopLevelSectionsFromFragment(container);
  if (sections.length === 0) {
    const mainMatch = container.match(/<main[^>]*>([\s\S]*)<\/main>/i);
    if (mainMatch) {
      sections = extractTopLevelSectionsFromFragment(mainMatch[1]!);
    }
  }

  if (sections.length === 0) {
    return [{ sectionId: "_page", html }];
  }
  return sections;
}

/**
 * Extract one section's outer HTML by id (first match). Node-safe.
 */
export function extractSectionOuterHtmlById(
  fullHtml: string,
  sectionId: string,
): string | null {
  const escaped = sectionId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `<section\\b[^>]*\\bid\\s*=\\s*["']${escaped}["'][^>]*>`,
    "i",
  );
  const m = re.exec(fullHtml);
  if (!m || m.index === undefined) return null;
  const start = m.index;
  const end = findClosingSectionEnd(fullHtml, start);
  if (end === null) return null;
  return fullHtml.slice(start, end);
}

/**
 * Replace one section's outer HTML by id. Node-safe (used by apply-audit API).
 */
export function replaceSectionOuterHtmlString(
  fullHtml: string,
  sectionId: string,
  newOuterHtml: string,
): string {
  const old = extractSectionOuterHtmlById(fullHtml, sectionId);
  if (!old) return fullHtml;
  const idx = fullHtml.indexOf(old);
  if (idx === -1) return fullHtml;
  const next = newOuterHtml.trim();
  return fullHtml.slice(0, idx) + next + fullHtml.slice(idx + old.length);
}
