import { z } from "zod";

export const sectionPlanSchema = z.object({
  pageName: z.string(),
  objective: z.string(),
  sections: z.array(
    z.object({
      id: z.string(),
      type: z.enum([
        "headline",
        "hook",
        "body",
        "cta",
        "testimonial",
        "faq",
        "image",
        "proof",
      ]),
      title: z.string(),
      content: z.string(),
      ctaLabel: z.string().nullable(),
      imagePrompt: z.string().nullable(),
      /** When true, per image guideline: use GIF/animation (process, mechanism, transformation). Required for strict response_format. */
      preferGif: z.boolean(),
    }),
  ),
  styleNotes: z.array(z.string()),
  complianceNotes: z.array(z.string()),
});

export const htmlCssSchema = z.object({
  html: z.string(),
  css: z.string(),
});

export const editPlanSchema = z.object({
  summary: z.string(),
  /** When false, skip the targeted-edits LLM call and use current html/css as-is. Saves ~8-15s for image-only requests. */
  htmlCssChangesNeeded: z.boolean(),
  imageEdits: z.array(
    z.object({
      sectionId: z.string(),
      prompt: z.string(),
      /** When true, per image guideline: use GIF/animation. Required for strict response_format. */
      preferGif: z.boolean(),
    }),
  ),
});

// All fields must be in schema for strict response_format APIs (e.g. OpenAI).
// selectorHint and rationale are optional in practice—use null when not needed.
const targetedCodeEditSchema = z.object({
  find: z.string().min(1),
  replace: z.string(),
  selectorHint: z.string().nullable(),
  rationale: z.string().nullable(),
});

// All fields required for strict response_format; use empty arrays when no edits needed
export const targetedEditSchema = z.object({
  htmlEdits: z.array(targetedCodeEditSchema),
  cssEdits: z.array(targetedCodeEditSchema),
  notes: z.string().nullable(),
});

/** Sanitizes CSS for safe embedding in a <style> tag. Prevents </style> from closing the tag. */
function sanitizeCssForEmbedding(css: string): string {
  if (!css || typeof css !== "string") return "";
  let out = css.trim();
  out = out.replace(/<\/style>/gi, "</\u200Bstyle>");
  return out.replace(/^```(?:css)?\s*\n?|```\s*$/gm, "").trim();
}

export function renderPreviewDocument(html: string, css: string): string {
  const safeCss = sanitizeCssForEmbedding(css || "") || "*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif}";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>${safeCss}</style>
  </head>
  <body>${html}</body>
</html>`;
}

const CSS_LINK = '<link rel="stylesheet" href="styles.css" />';

/** Sample content used when showing full HTML from a scaffold. Includes img tags with placeholders. */
const SAMPLE_CONTENT = `<section class="hero"><h1>Sample Headline</h1><p>Sample body copy for preview. This shows how the full funnel HTML looks when content is injected.</p><img src="{{image:image-1}}" alt="" class="funnel-media" style="width:100%;max-width:100%;height:auto;display:block;border-radius:12px;" /></section>
<section class="body"><p>More content here with another image.</p><img src="{{image:image-2}}" alt="" class="funnel-media" style="width:100%;max-width:100%;height:auto;display:block;border-radius:12px;" /></section>
<section class="cta"><a href="#">Get Started</a></section>`;

/**
 * Produces full HTML from a template scaffold by replacing placeholders.
 * Used in template trainer to preview the complete document structure.
 */
export function buildFullHtmlFromScaffold(scaffold: string): string {
  const s = (scaffold || "").trim();
  if (!s) return "";

  const contentPlaceholder = s.includes("{{content}}") ? "{{content}}" : "{{sections}}";
  let html = s
    .replace(new RegExp(contentPlaceholder.replace(/[{}]/g, "\\$&"), "g"), SAMPLE_CONTENT)
    .replace(/\{\{styles\}\}/g, CSS_LINK);

  if (!/^\s*<!DOCTYPE\s/i.test(html.trim()) && !/^\s*<html[\s>]/i.test(html.trim())) {
    html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${CSS_LINK}
  </head>
  <body>
${html}
  </body>
</html>`;
  }
  return html;
}

/** Returns full HTML document with link to styles.css (no embedded CSS). For export/copy. */
export function renderDocumentWithCssLink(html: string): string {
  const trimmed = (html || "").trim();
  if (/^\s*<!DOCTYPE\s/i.test(trimmed) || /^\s*<html[\s>]/i.test(trimmed)) {
    if (/<link[^>]*href=["']styles\.css["']/i.test(trimmed)) return html;
    const noStyle = trimmed.replace(/<style[^>]*>[\s\S]*?<\/style\s*>/gi, "");
    return noStyle.replace(/<\/head\s*>/i, `    ${CSS_LINK}\n  </head>`);
  }
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${CSS_LINK}
  </head>
  <body>
${html}
  </body>
</html>`;
}

export function requireGatewayKey(): string {
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key) {
    throw new Error("Missing AI_GATEWAY_API_KEY in environment.");
  }
  return key;
}
