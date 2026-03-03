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

// notes is required by schema but can be null for strict response_format APIs
export const targetedEditSchema = z.object({
  htmlEdits: z.array(targetedCodeEditSchema).default([]),
  cssEdits: z.array(targetedCodeEditSchema).default([]),
  notes: z.string().nullable(),
});

export function renderPreviewDocument(html: string, css: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>${css}</style>
  </head>
  <body>${html}</body>
</html>`;
}

export function requireGatewayKey(): string {
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key) {
    throw new Error("Missing AI_GATEWAY_API_KEY in environment.");
  }
  return key;
}
