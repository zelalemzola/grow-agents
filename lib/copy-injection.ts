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
    }),
  ),
});

const targetedCodeEditSchema = z.object({
  selectorHint: z.string().nullable().optional(),
  find: z.string().min(1),
  replace: z.string(),
  rationale: z.string().nullable().optional(),
});

export const targetedEditSchema = z.object({
  htmlEdits: z.array(targetedCodeEditSchema).default([]),
  cssEdits: z.array(targetedCodeEditSchema).default([]),
  notes: z.string().nullable().optional(),
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
