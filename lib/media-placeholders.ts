/**
 * Parses [image] and [gif] placeholders from the user's advertorial copy.
 * Media is generated only at these positions.
 */

export type MediaPlaceholderType = "image" | "gif";

export interface MediaPlaceholder {
  type: MediaPlaceholderType;
  id: string;
}

/** Matches [image], [gif], or with optional spaces e.g. [ image ], [ gif ] */
const PARSE_REGEX = /\[\s*image\s*\]|\[\s*gif\s*\]/gi;

/**
 * Returns placeholders in order of appearance in the copy.
 * IDs are assigned as image-1, image-2, ..., gif-1, gif-2, ...
 */
/**
 * Every `{{image:sectionId}}` in final funnel HTML must have a matching entry in `latest_images`.
 * Call this after HTML is finalized to discover all slots (including template/scaffold extras).
 */
export function extractImagePlaceholderIdsFromHtml(html: string): string[] {
  const re = /\{\{image:([^}]+)\}\}/g;
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const id = String(m[1]).trim();
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export function parseMediaPlaceholders(objective: string): MediaPlaceholder[] {
  const out: MediaPlaceholder[] = [];
  let imageCount = 0;
  let gifCount = 0;
  let m: RegExpExecArray | null;
  PARSE_REGEX.lastIndex = 0;
  while ((m = PARSE_REGEX.exec(objective)) !== null) {
    if (/image/i.test(m[0])) {
      imageCount += 1;
      out.push({ type: "image", id: `image-${imageCount}` });
    } else {
      gifCount += 1;
      out.push({ type: "gif", id: `gif-${gifCount}` });
    }
  }
  return out;
}

/** Flexible regex: [image], [gif], or with optional spaces */
const PLACEHOLDER_REGEX = /\[\s*image\s*\]|\[\s*gif\s*\]/gi;

/**
 * Replaces [image] and [gif] in html in order with proper img tags
 * that use {{image:id}} so the preview can inject generated media.
 * Must be called with the same order of placeholders as in the copy.
 */
export function replacePlaceholdersInHtml(
  html: string,
  placeholders: MediaPlaceholder[],
): string {
  if (placeholders.length === 0) return html;
  let index = 0;
  return html.replace(PLACEHOLDER_REGEX, () => {
    const p = placeholders[index++];
    if (!p) return "";
    return `<img src="{{image:${p.id}}}" alt="" class="funnel-media" style="width:100%;max-width:100%;height:auto;display:block;border-radius:12px;" />`;
  });
}

/** Context window (chars) before/after a placeholder for image prompt */
const CONTEXT_CHARS = 1200;

/**
 * Returns the text surrounding the placeholder at the given index in the objective,
 * for use as section context when building the image/gif prompt.
 */
export function getPlaceholderContext(
  objective: string,
  placeholderIndex: number,
  placeholders: MediaPlaceholder[],
): string {
  const parts = objective.split(/(\[\s*image\s*\]|\[\s*gif\s*\])/i);
  const before = parts[placeholderIndex * 2] ?? "";
  const after = parts[placeholderIndex * 2 + 2] ?? "";
  const combined = (before + " " + after).replace(/\s+/g, " ").trim();
  if (combined.length <= CONTEXT_CHARS * 2) return combined;
  const start = Math.max(0, before.length - CONTEXT_CHARS);
  const end = Math.min(combined.length, start + CONTEXT_CHARS * 2);
  return combined.slice(start, end).trim();
}
