/**
 * Funnel HTML helpers. Prefer DOMParser in the browser; fall back to string
 * parsing when `DOMParser` is missing (Next.js SSR / Node prerender).
 */

function getTopLevelSectionIdsWithoutDom(html: string): string[] {
  if (!html.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /<section\b[^>]*\bid\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const id = m[1]!;
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

function extractDoctype(html: string): string {
  const m = html.match(/^\s*<!DOCTYPE[^>]*>/i);
  return m ? m[0] : "<!DOCTYPE html>";
}

function replaceBodyInner(html: string, newInner: string): string {
  const open = html.match(/<body[^>]*>/i);
  const closeIdx = html.search(/<\/body\s*>/i);
  if (!open || closeIdx < 0) {
    return html;
  }
  const start = open.index! + open[0].length;
  return `${html.slice(0, start)}${newInner}${html.slice(closeIdx)}`;
}

export function serializeDocumentPreservingDoctype(
  originalHtml: string,
  doc: Document,
): string {
  const inner = doc.body.innerHTML;
  const doctype = extractDoctype(originalHtml);
  const openHtml = originalHtml.match(/<html[^>]*>/i);
  const closeHtml = originalHtml.search(/<\/html\s*>/i);
  if (openHtml && closeHtml > 0) {
    const rest = doc.documentElement.outerHTML;
    return `${doctype}\n${rest}`;
  }
  return replaceBodyInner(originalHtml, inner);
}

export function getTopLevelSections(body: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const child of Array.from(body.children)) {
    if (child instanceof HTMLElement && child.tagName === "SECTION" && child.id) {
      out.push(child);
    }
  }
  if (out.length === 0) {
    const main = body.querySelector(":scope > main");
    if (main) {
      for (const child of Array.from(main.children)) {
        if (
          child instanceof HTMLElement &&
          child.tagName === "SECTION" &&
          child.id
        ) {
          out.push(child);
        }
      }
    }
  }
  return out;
}

export function getTopLevelSectionIds(html: string): string[] {
  if (typeof DOMParser === "undefined") {
    return getTopLevelSectionIdsWithoutDom(html);
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  return getTopLevelSections(doc.body).map((s) => s.id);
}

export function reorderSectionsInHtml(
  html: string,
  orderedIds: string[],
): string {
  if (typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const sections = getTopLevelSections(doc.body);
  if (sections.length === 0) return html;

  const idSet = new Set(orderedIds);
  const sectionIds = sections.map((s) => s.id);
  if (sectionIds.length !== orderedIds.length || !orderedIds.every((id) => idSet.has(id))) {
    return html;
  }

  const parent = sections[0].parentElement;
  if (!parent) return html;

  const map = new Map<string, HTMLElement>();
  for (const id of orderedIds) {
    const el = doc.getElementById(id);
    if (el instanceof HTMLElement && el.tagName === "SECTION") {
      map.set(id, el);
    }
  }
  if (map.size !== orderedIds.length) return html;

  const first = map.get(orderedIds[0])!;
  const anchor: ChildNode | null = first.previousSibling;

  for (const el of map.values()) {
    el.remove();
  }

  let ref: Node | null = anchor;
  for (const id of orderedIds) {
    const el = map.get(id)!;
    if (ref === null) {
      parent.prepend(el);
      ref = el;
    } else {
      ref.parentNode!.insertBefore(el, ref.nextSibling);
      ref = el;
    }
  }

  return serializeDocumentPreservingDoctype(html, doc);
}

export function getSectionOuterHtml(
  html: string,
  sectionId: string,
): string | null {
  if (typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const el = doc.getElementById(sectionId);
  if (!el) return null;
  return el.outerHTML;
}

export function replaceSectionOuterHtml(
  html: string,
  sectionId: string,
  newOuterHtml: string,
): string {
  if (typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const el = doc.getElementById(sectionId);
  if (!el) return html;
  const tpl = doc.createElement("template");
  tpl.innerHTML = newOuterHtml.trim();
  const replacement = tpl.content.firstElementChild;
  if (!replacement) return html;
  el.replaceWith(replacement);
  return serializeDocumentPreservingDoctype(html, doc);
}

export function insertSectionAfterHtml(
  html: string,
  afterSectionId: string,
  fragmentHtml: string,
): string {
  if (typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const marker = doc.getElementById(afterSectionId);
  if (!marker) return html;
  const tpl = doc.createElement("template");
  tpl.innerHTML = fragmentHtml.trim();
  const node = tpl.content.firstElementChild;
  if (!node) return html;
  marker.insertAdjacentElement("afterend", node as Element);
  return serializeDocumentPreservingDoctype(html, doc);
}
