/**
 * Parses [image] and [gif] placeholders from the user's advertorial copy.
 * Media is generated only at these positions.
 */

export type MediaPlaceholderType = "image" | "gif";

export interface MediaPlaceholder {
  type: MediaPlaceholderType;
  id: string;
}

const IMAGE_MARKER = "[image]";
const GIF_MARKER = "[gif]";
const REGEX = /\[image\]|\[gif\]/g;

/**
 * Returns placeholders in order of appearance in the copy.
 * IDs are assigned as image-1, image-2, ..., gif-1, gif-2, ...
 */
export function parseMediaPlaceholders(objective: string): MediaPlaceholder[] {
  const out: MediaPlaceholder[] = [];
  let imageCount = 0;
  let gifCount = 0;
  let m: RegExpExecArray | null;
  REGEX.lastIndex = 0;
  while ((m = REGEX.exec(objective)) !== null) {
    if (m[0] === IMAGE_MARKER) {
      imageCount += 1;
      out.push({ type: "image", id: `image-${imageCount}` });
    } else {
      gifCount += 1;
      out.push({ type: "gif", id: `gif-${gifCount}` });
    }
  }
  return out;
}

/**
 * Replaces [image] and [gif] in html in order with {{image:id}}.
 * Must be called with the same order of placeholders as in the copy.
 */
export function replacePlaceholdersInHtml(
  html: string,
  placeholders: MediaPlaceholder[],
): string {
  if (placeholders.length === 0) return html;
  let index = 0;
  const replaceRegex = /\[image\]|\[gif\]/g;
  return html.replace(replaceRegex, () => {
    const p = placeholders[index++];
    return p ? `{{image:${p.id}}}` : "";
  });
}

/** Context window (chars) before/after a placeholder for image prompt */
const CONTEXT_CHARS = 600;

/**
 * Returns the text surrounding the placeholder at the given index in the objective,
 * for use as section context when building the image/gif prompt.
 */
export function getPlaceholderContext(
  objective: string,
  placeholderIndex: number,
  placeholders: MediaPlaceholder[],
): string {
  const parts = objective.split(/(\[image\]|\[gif\])/);
  const before = parts[placeholderIndex * 2] ?? "";
  const after = parts[placeholderIndex * 2 + 2] ?? "";
  const combined = (before + " " + after).replace(/\s+/g, " ").trim();
  if (combined.length <= CONTEXT_CHARS * 2) return combined;
  const start = Math.max(0, before.length - CONTEXT_CHARS);
  const end = Math.min(combined.length, start + CONTEXT_CHARS * 2);
  return combined.slice(start, end).trim();
}
