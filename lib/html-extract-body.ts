/**
 * Extracts body content for translation and reassembles full HTML.
 * - Keeps <head> and everything before <body> out of the translation request.
 * - Replaces <script>...</script> in body with placeholders so scripts are not
 *   sent to the model (and are pasted back after translation).
 * Handles </script> inside script strings via a simple quote-aware scan.
 */

const SCRIPT_PLACEHOLDER_PREFIX = "<!--SCRIPT_PLACEHOLDER_";
const SCRIPT_PLACEHOLDER_SUFFIX = "-->";

export type ExtractResult =
  | { ok: true; prefix: string; bodyForTranslation: string; suffix: string; scripts: string[] }
  | { ok: false; reason: string };

/**
 * Finds the opening <body> tag (with attributes). Returns the match or null.
 */
function findBodyOpen(html: string): { match: string; endIndex: number } | null {
  const re = /<body\b[^>]*>/i;
  const m = html.match(re);
  if (!m) return null;
  const start = html.indexOf(m[0]);
  return { match: m[0], endIndex: start + m[0].length };
}

/**
 * Finds the closing </body> tag (case-insensitive). Returns index of the start of "</body>" or -1.
 */
function findBodyClose(html: string): number {
  const idx = html.toLowerCase().indexOf("</body>");
  return idx;
}

/**
 * Replaces each <script>...</script> in `content` with a placeholder.
 * Uses quote-aware scanning so "</script>" inside a string does not end the block.
 * Returns { contentWithPlaceholders, scripts }.
 */
function extractScripts(content: string): { contentWithPlaceholders: string; scripts: string[] } {
  const scripts: string[] = [];
  let out = "";
  let i = 0;

  while (i < content.length) {
    const scriptStart = content.indexOf("<script", i);
    if (scriptStart === -1) {
      out += content.slice(i);
      break;
    }

    out += content.slice(i, scriptStart);

    const afterOpen = content.indexOf(">", scriptStart);
    if (afterOpen === -1) {
      out += content.slice(scriptStart);
      break;
    }

    const openTag = content.slice(scriptStart, afterOpen + 1);
    let j = afterOpen + 1;
    let inDouble = false;
    let inSingle = false;
    let escapeNext = false;

    while (j < content.length) {
      const c = content[j];

      if (escapeNext) {
        escapeNext = false;
        j++;
        continue;
      }

      if (c === "\\" && (inDouble || inSingle)) {
        escapeNext = true;
        j++;
        continue;
      }

      if (!inDouble && !inSingle) {
        if (content.slice(j).toLowerCase().startsWith("</script>")) {
          const scriptBlock = content.slice(scriptStart, j + "</script>".length);
          scripts.push(scriptBlock);
          out += SCRIPT_PLACEHOLDER_PREFIX + (scripts.length - 1) + SCRIPT_PLACEHOLDER_SUFFIX;
          j += "</script>".length;
          i = j;
          break;
        }
        if (c === '"') inDouble = true;
        else if (c === "'") inSingle = true;
      } else if (inDouble && c === '"') {
        inDouble = false;
      } else if (inSingle && c === "'") {
        inSingle = false;
      }

      j++;
    }

    if (j >= content.length) {
      out += content.slice(scriptStart);
      break;
    }
  }

  return { contentWithPlaceholders: out, scripts };
}

/**
 * Puts script blocks back into translated body content by replacing placeholders.
 */
function reinsertScripts(content: string, scripts: string[]): string {
  let out = content;
  for (let i = 0; i < scripts.length; i++) {
    const placeholder = SCRIPT_PLACEHOLDER_PREFIX + i + SCRIPT_PLACEHOLDER_SUFFIX;
    out = out.replace(placeholder, scripts[i]);
  }
  return out;
}

/**
 * Extracts prefix (doctype + html + head + <body...>), body inner HTML (with scripts
 * replaced by placeholders), suffix (</body>...</html>), and the script blocks.
 * If no <body> is found, returns ok: false so caller can fall back to full-doc translation.
 */
export function extractBodyForTranslation(html: string): ExtractResult {
  const bodyOpen = findBodyOpen(html);
  if (!bodyOpen) {
    return { ok: false, reason: "No <body> tag found" };
  }

  const closeIdx = findBodyClose(html);
  if (closeIdx === -1 || closeIdx <= bodyOpen.endIndex) {
    return { ok: false, reason: "No </body> tag found" };
  }

  const bodyInner = html.slice(bodyOpen.endIndex, closeIdx);
  const { contentWithPlaceholders, scripts } = extractScripts(bodyInner);

  const prefix = html.slice(0, bodyOpen.endIndex);
  const suffix = html.slice(closeIdx);

  return {
    ok: true,
    prefix,
    bodyForTranslation: contentWithPlaceholders,
    suffix,
    scripts,
  };
}

/**
 * Reassembles full HTML after translation: prefix + translated body (with scripts
 * reinserted) + suffix.
 */
export function reassembleHtml(
  prefix: string,
  translatedBodyWithPlaceholders: string,
  suffix: string,
  scripts: string[],
): string {
  const bodyWithScripts = reinsertScripts(translatedBodyWithPlaceholders, scripts);
  return prefix + bodyWithScripts + suffix;
}
