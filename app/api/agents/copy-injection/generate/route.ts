import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateObject,
} from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { sectionPlanSchema } from "@/lib/copy-injection";
import { classifyIsProductSection } from "@/lib/classify-product-section";
import {
  parseMediaPlaceholders,
  replacePlaceholdersInHtml,
  getPlaceholderContext,
} from "@/lib/media-placeholders";
import {
  formatSectionPlanContentForHtml,
  injectContentFromCopy,
  splitCopyIntoParagraphs,
} from "@/lib/format-section-content";
import { buildVisualDescription } from "@/lib/image-prompt-builder";
import {
  agent1PromptContext,
  FUNNEL_GENERATION_EXTRA_SYSTEM_PROMPT,
} from "@/lib/agent1-guidelines";
import { IMAGE_GENERATION_GUIDELINE } from "@/lib/image-generation-guideline";
import { uploadImagesMapToStorage } from "@/lib/funnel-image-storage";
import { getGateway } from "@/lib/ai-gateway";
import {
  createServerSupabaseClient,
  createSupabaseAdminClient,
} from "@/utils/supabase/server";

export const maxDuration = 300;

const generateSchema = z.object({
  funnelName: z.string().min(3),
  objective: z.string().min(12),
  campaignContext: z.string().optional(),
  templateId: z.string().uuid().optional(),
  stream: z.boolean().optional(),
  /** Optional product images (data URLs) for product-related sections. Used when generating images at [image]/[gif] placeholders in product-focused sections. */
  productImages: z.array(z.string()).optional(),
  /** Optional product-specific image/GIF guidelines (e.g. "use before/after results, doctor in lab recommending, testimonials with happy customers holding product"). Injected when generating for product-related sections. */
  productGuidelines: z.string().optional(),
});

class RouteError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type ProgressEvent = {
  type:
    | "status"
    | "reasoning"
    | "step"
    | "warning"
    | "error"
    | "done"
    | "html-stream"
    | "css-stream";
  message?: string;
  payload?: Record<string, unknown>;
};

type GenerationResult = {
  funnel: Record<string, unknown>;
  generated: {
    html: string;
    css: string;
    images: Record<string, string>;
    sectionPlan: Record<string, unknown>;
  };
};

async function runGeneration(
  parsedData: z.infer<typeof generateSchema>,
  emit: (event: ProgressEvent) => void,
): Promise<GenerationResult> {
  const supabase = await createServerSupabaseClient();
  const gateway = getGateway();

  emit({
    type: "status",
    message: "Loading template (if selected).",
  });

  let template:
    | {
        name: string;
        instructions: string;
        html_scaffold: string | null;
        css_scaffold: string | null;
      }
    | null = null;

  if (parsedData.templateId) {
    const { data, error } = await supabase
      .from("agent_templates")
      .select("name, instructions, html_scaffold, css_scaffold")
      .eq("id", parsedData.templateId)
      .eq("agent_slug", "copy-injection")
      .single();

    if (error) {
      throw new RouteError(400, `Template lookup failed: ${error.message}`);
    }

    template = data;
    emit({
      type: "reasoning",
      message: "Template selected; generation will preserve its structure guidance.",
      payload: { templateName: template.name },
    });
  } else {
    emit({
      type: "reasoning",
      message: "No template selected; generation will use clean conversion defaults.",
    });
  }

  // Knowledge base disabled for now to reduce latency - use built-in guidelines only
  const copyContext = agent1PromptContext([], "copy");

  let paragraphs = splitCopyIntoParagraphs(parsedData.objective);
  if (paragraphs.length === 0 && parsedData.objective.trim()) {
    paragraphs = [parsedData.objective.trim()];
  }
  const paragraphPreview =
    paragraphs.length > 0
      ? paragraphs
          .map((p, i) => `Paragraph ${i}: ${p.slice(0, 150)}${p.length > 150 ? "..." : ""}`)
          .join("\n")
      : `Paragraph 0: ${parsedData.objective.slice(0, 200)}`;

  emit({
    type: "status",
    message: "Planning funnel sections (structure + paragraph mapping).",
  });
  const sectionPlanResult = await generateObject({
    model: gateway("openai/gpt-4.1-mini"),
    schema: sectionPlanSchema,
    system: FUNNEL_GENERATION_EXTRA_SYSTEM_PROMPT,
    maxOutputTokens: 65536,
    prompt: `${copyContext}

You are a senior direct-response funnel architect.

Produce a section plan that maps the copy into funnel sections. **CRITICAL:** You output STRUCTURE + paragraphIndices only. Content is injected from the user's copy—you must assign paragraphIndices so every paragraph appears. Zero content loss.

**PARAGRAPH MAPPING (MANDATORY):** The copy is split into ${paragraphs.length} paragraphs (0-indexed). For each section, output paragraphIndices: an array of paragraph numbers. EVERY paragraph 0 through ${Math.max(0, paragraphs.length - 1)} MUST be assigned to exactly one section. No paragraph may be skipped. Paragraph 0 is usually the headline. Assign in reading order.

**TEMPLATE 100%:** Follow the selected template's structure exactly—same section types, class names, layout. The template defines the visual style.

Funnel name: ${parsedData.funnelName}
Campaign context: ${parsedData.campaignContext ?? "N/A"}
Template instructions: ${template?.instructions ?? "No template instructions provided"}

**Numbered paragraphs (assign each index 0..${Math.max(0, paragraphs.length - 1)} to a section):**
${paragraphPreview}

For each section output:
- id (short slug: hero-headline, body-1, testimonial-1, etc.)
- type (headline, hook, body, cta, testimonial, faq, image, proof)
- title
- content: empty string or placeholder—replaced from copy via paragraphIndices
- paragraphIndices: array of 0-based indices. REQUIRED. Every index 0..${Math.max(0, paragraphs.length - 1)} must appear in exactly one section.
- ctaLabel (when relevant, else null)
- imagePrompt: 1-2 sentence visual for this section. Editorial, candid, no text/logos.
- preferGif: true for process/mechanism; false for testimonials, FAQs

Create enough sections so all ${paragraphs.length} paragraphs are assigned. Follow template structure.`,
  });

  const sectionPlan = sectionPlanResult.object;
  injectContentFromCopy(sectionPlan.sections, parsedData.objective);
  formatSectionPlanContentForHtml(sectionPlan.sections);
  emit({
    type: "reasoning",
    message: "Section plan completed; next step is transforming plan into semantic HTML/CSS.",
    payload: {
      sectionCount: sectionPlan.sections.length,
      sectionTypes: sectionPlan.sections.map((section) => section.type),
    },
  });

  const mediaPlaceholders = parseMediaPlaceholders(parsedData.objective);
  const productImagesRaw = parsedData.productImages ?? [];
  const productImageBase64 = productImagesRaw
    .map((dataUrl) => {
      const m = /^data:image\/[^;]+;base64,(.+)$/.exec(dataUrl);
      return m ? m[1] : null;
    })
    .filter((x): x is string => Boolean(x))
    .slice(0, 3);

  type ImageCandidate = {
    id: string;
    title: string;
    content: string;
    type: "headline" | "hook" | "body" | "cta" | "testimonial" | "faq" | "image" | "proof";
    imagePrompt: string | null;
    preferGif: boolean;
    isProductSection: boolean;
  };
  const placeholderCandidates: Omit<ImageCandidate, "isProductSection">[] =
    mediaPlaceholders.length > 0
      ? mediaPlaceholders.map((p, i) => ({
          id: p.id,
          title: p.type === "gif" ? "GIF" : "Image",
          content: getPlaceholderContext(parsedData.objective, i, mediaPlaceholders),
          type: "body" as const,
          imagePrompt: null,
          preferGif: p.type === "gif",
        }))
      : [];

  const testimonialCandidates: Omit<ImageCandidate, "isProductSection">[] =
    sectionPlan.sections
      .filter((s) => s.type === "testimonial")
      .map((s) => ({
        id: s.id,
        title: s.title,
        content: s.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 600),
        type: "testimonial" as const,
        imagePrompt: "Selfie-style photo of the person from this testimonial holding the product or service, happy and satisfied, candid authentic feel. Editorial quality, not staged. Person should match the testimonial (age/gender implied by name and quote).",
        preferGif: false,
      }));

  const imageCandidatesBase: Omit<ImageCandidate, "isProductSection">[] = [
    ...placeholderCandidates,
    ...testimonialCandidates,
  ];

  const imageCandidates: ImageCandidate[] =
    productImageBase64.length > 0
      ? await Promise.all(
          imageCandidatesBase.map(async (c) => ({
            ...c,
            isProductSection: await classifyIsProductSection(
              c.content,
              parsedData.objective,
              gateway("openai/gpt-4.1-mini"),
            ),
          })),
        )
      : imageCandidatesBase.map((c) => ({ ...c, isProductSection: false }));

  const defaultProductGuidelines =
    productImageBase64.length > 0
      ? "Based on section content: show either people holding and using the product, or a doctor holding/recommending it. For testimonials: show happy people holding the product as described in the testimonial."
      : "";

  const productGuidelinesFinal =
    [defaultProductGuidelines, parsedData.productGuidelines?.trim()]
      .filter(Boolean)
      .join("\n\n") || undefined;

  const funnelContext = {
    objective: parsedData.objective,
    pageName: sectionPlan.pageName,
    productGuidelines: productGuidelinesFinal,
    sectionSummaries: sectionPlan.sections.map((s) => ({
      id: s.id,
      title: s.title,
      contentPreview: s.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120),
    })),
  };

  emit({
    type: "status",
    message: "Generating HTML first, then CSS, then images (sequential for accuracy).",
    payload: {
      imageCandidates: imageCandidates.length,
      placeholderOnly: mediaPlaceholders.length > 0,
    },
  });

  const placeholderIdList =
    mediaPlaceholders.length > 0
      ? mediaPlaceholders.map((p) => p.id).join(", ")
      : "";

  const sectionPlanJson = JSON.stringify(sectionPlan, null, 2);
  const templateInstructions = template?.instructions ?? "No strict template guidance. Use clean modern conversion layout.";
  const templateHtmlScaffold = template?.html_scaffold ?? "N/A";
  const templateCssScaffold = template?.css_scaffold ?? "N/A";

  const htmlOnlySchema = z.object({ html: z.string() });
  const cssOnlySchema = z.object({ css: z.string() });

  const testimonialSectionIds = sectionPlan.sections
    .filter((s) => s.type === "testimonial")
    .map((s) => s.id);

  const placeholderBlock =
    mediaPlaceholders.length > 0
      ? `
**CRITICAL - [image] and [gif] placeholders (user indicated media positions):**
The user's copy includes [image] and/or [gif] markers. Replace EACH occurrence with: <img src="{{image:ID}}" alt="" class="funnel-media" style="width:100%;max-width:100%;height:auto;display:block;border-radius:12px;" />
IDs in order of appearance: ${placeholderIdList}
- Generate exactly one media slot per placeholder (${mediaPlaceholders.length} total).
- Do NOT output literal "[image]" or "[gif]"—replace them with the img tag using the correct ID.
`
      : "";

  const testimonialImageBlock =
    testimonialSectionIds.length > 0
      ? `
**TESTIMONIAL IMAGES (REQUIRED):** For each testimonial section, include an image slot showing the reviewer. Add: <img src="{{image:section-id}}" alt="" class="funnel-media" style="width:100%;max-width:100%;height:auto;display:block;border-radius:12px;" />
Section IDs for testimonials: ${testimonialSectionIds.join(", ")}. Use the exact section id from the plan (e.g. {{image:testimonial-1}}). Place the image near the testimonial content.
`
      : "";

  const scaffoldHasPlaceholder = template?.html_scaffold?.trim().includes("{{content}}") || template?.html_scaffold?.trim().includes("{{sections}}");
  const htmlPrompt = `${copyContext}

You are an expert HTML funnel builder. Output ONLY the HTML for the landing page body (no <html>, <head>, or <body>—just the inner content).
${scaffoldHasPlaceholder ? "\n**Template scaffold:** The template uses {{content}} or {{sections}} for your output, and {{styles}} for the CSS link. Your output will be injected into {{content}}. The template's {{styles}} becomes <link rel=\"stylesheet\" href=\"styles.css\" />—no CSS in the HTML. Use the SAME class names and HTML structure as the template—only the content changes.\n" : ""}
${placeholderBlock}
${testimonialImageBlock}
**EXACT COPY - NOTHING ADDED OR REMOVED:** Output the section plan content EXACTLY as provided. Do not add, omit, or rephrase a single line. Every paragraph, review, and disclaimer from the plan must appear verbatim in the HTML.

**CONTENT FORMATTING (CRITICAL):** Apply proper HTML styling to the content. Preserve spacing, emphasis, and structure from the section plan:
- Paragraph breaks → <br><br> between each paragraph
- Line breaks → <br> for breathing room within paragraphs
- Bold key phrases → <b>text</b> for emphasis (preserve or add where content has **text** or strong emphasis)
- Italics → <i>text</i> for quotes and subtle emphasis (preserve or add where content has *text* or italics)
- Do not paste raw unformatted text—no wall-of-text. Apply tags based on structure.
**COMPLETE OUTPUT:** You MUST output the FULL HTML with EVERY section from the plan. Never truncate, abbreviate, or skip sections—no matter how long. Use semantic HTML. No markdown fences.

**TEMPLATE 100% - EXACT RESEMBLANCE:** The selected template defines EVERYTHING. Your output must look identical to it: same class names, same HTML structure, same layout, same structure. When content is LARGER: add more sections using the SAME patterns. When SMALLER: fewer sections, SAME styling. Colors, typography, spacing—all from the template. Only the text content varies. Use the template's exact class names and markup.

ADAPTIVE LAYOUT:
- If the section plan has MORE sections than the template shows, extend the layout with the same patterns. If FEWER, condense. Every section in the plan must appear.
- Mobile-first, clean typography, generous whitespace, full-width sections with max-width containers, prominent CTAs.

Section Plan:
${sectionPlanJson}

Template guidance: ${templateInstructions}
Template HTML scaffold (full HTML structure to follow): ${templateHtmlScaffold}`;

  const { generateFunnelMedia } = await import("@/lib/generate-funnel-media");
  const { getImageModel } = await import("@/lib/image-model");
  const { getVideoModel } = await import("@/lib/video-model");
  const imageModel = getImageModel();
  const videoModel = getVideoModel();

  const IMAGE_CONCURRENCY = 1;

  async function generateImageForSection(
    section: ImageCandidate,
  ): Promise<{ sectionId: string; dataUrl: string }> {
    const useProductImage =
      (section.isProductSection || section.type === "testimonial") &&
      productImageBase64.length > 0 &&
      !section.preferGif;
    emit({
      type: "reasoning",
      message: `Generating ${section.preferGif ? "GIF" : "image"} for "${section.id}"${useProductImage ? " (using product reference)" : ""}.`,
      payload: { sectionId: section.id },
    });
    try {
      const { description: visualDescription, sceneType } =
        await buildVisualDescription(
          {
            title: section.title,
            content: section.content,
            id: section.id,
            type: section.type,
            imagePrompt: section.imagePrompt,
            preferGif: section.preferGif,
            isProductSection: section.isProductSection || section.type === "testimonial",
          },
          gateway("openai/gpt-4.1-mini"),
          funnelContext,
        );
      const { dataUrl } = await generateFunnelMedia({
        prompt: visualDescription,
        sceneType,
        preferGif: section.preferGif ?? false,
        imageModel,
        videoModel,
        sectionId: section.id,
        productImageBase64: useProductImage ? productImageBase64[0] : undefined,
        onVideoFallback: (sid, err) => {
          const msg = err instanceof Error ? err.message : String(err);
          emit({
            type: "warning",
            message: `Video for "${sid}" failed (using static image): ${msg.slice(0, 120)}`,
          });
        },
      });
      return { sectionId: section.id, dataUrl };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      emit({
        type: "warning",
        message: `Image for "${section.id}" failed: ${msg.slice(0, 150)}. A placeholder will be used.`,
        payload: { sectionId: section.id },
      });
      const placeholderSvg =
        "data:image/svg+xml," +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="225" viewBox="0 0 400 225"><rect fill="#f0f0f0" width="400" height="225"/></svg>',
        );
      return { sectionId: section.id, dataUrl: placeholderSvg };
    }
  }

  async function runWithConcurrencyLimit<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let index = 0;
    async function worker(): Promise<void> {
      while (index < items.length) {
        const i = index++;
        if (i >= items.length) break;
        results[i] = await fn(items[i]);
      }
    }
    const workers = Array.from(
      { length: Math.min(limit, items.length) },
      () => worker(),
    );
    await Promise.all(workers);
    return results;
  }

  const HTML_CHUNK_THRESHOLD = 8;
  const HTML_CHUNK_SIZE = 6;
  const HTML_MAX_TOKENS = 65536;

  let htmlRaw: string;

  if (sectionPlan.sections.length > HTML_CHUNK_THRESHOLD) {
    emit({ type: "status", message: `Generating HTML in chunks (${sectionPlan.sections.length} sections)...` });
    const batches: typeof sectionPlan.sections[] = [];
    for (let i = 0; i < sectionPlan.sections.length; i += HTML_CHUNK_SIZE) {
      batches.push(sectionPlan.sections.slice(i, i + HTML_CHUNK_SIZE));
    }
    const htmlParts: string[] = [];
    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b];
      emit({ type: "status", message: `Generating HTML chunk ${b + 1}/${batches.length}...` });
      const batchJson = JSON.stringify({ sections: batch }, null, 2);
      const batchHasTestimonials = batch.some((s) => s.type === "testimonial");
      const batchTestimonialBlock = batchHasTestimonials
        ? `\n**TESTIMONIAL IMAGES:** For testimonial sections, add: <img src="{{image:section-id}}" alt="" class="funnel-media" style="width:100%;max-width:100%;height:auto;display:block;border-radius:12px;" /> using the section id (e.g. {{image:testimonial-1}}).\n`
        : "";
      const batchPrompt = `${copyContext}

You are an expert HTML funnel builder. Output ONLY the HTML for these ${batch.length} sections. No <html>, <head>, <body>. Just the section elements.
${placeholderBlock}
${batchTestimonialBlock}
**EXACT COPY:** Output the section content EXACTLY as provided. No truncation, no omission.
**TEMPLATE 100%:** Use the SAME class names and structure as the template. Match its styling.

Template HTML scaffold: ${templateHtmlScaffold}

Sections to render:
${batchJson}`;

      const batchResult = await generateObject({
        model: gateway("openai/gpt-4.1"),
        schema: htmlOnlySchema,
        system: FUNNEL_GENERATION_EXTRA_SYSTEM_PROMPT,
        prompt: batchPrompt,
        maxOutputTokens: HTML_MAX_TOKENS,
      });
      htmlParts.push((batchResult.object.html ?? "").trim());
    }
    htmlRaw = htmlParts.join("\n\n");
  } else {
    emit({ type: "status", message: "Generating HTML..." });
    const htmlResult = await generateObject({
      model: gateway("openai/gpt-4.1"),
      schema: htmlOnlySchema,
      system: FUNNEL_GENERATION_EXTRA_SYSTEM_PROMPT,
      prompt: htmlPrompt,
      maxOutputTokens: HTML_MAX_TOKENS,
    });
    htmlRaw = htmlResult.object.html;
  }

  let html = mediaPlaceholders.length > 0
    ? replacePlaceholdersInHtml(htmlRaw, mediaPlaceholders)
    : htmlRaw;

  const CSS_LINK = '<link rel="stylesheet" href="styles.css" />';

  if (template?.html_scaffold?.trim()) {
    const scaffold = template.html_scaffold.trim();
    const hasContentPlaceholder = scaffold.includes("{{content}}") || scaffold.includes("{{sections}}");
    if (hasContentPlaceholder) {
      const placeholder = scaffold.includes("{{content}}") ? "{{content}}" : "{{sections}}";
      html = scaffold.replace(new RegExp(placeholder.replace(/[{}]/g, "\\$&"), "g"), html);
      if (scaffold.includes("{{styles}}")) {
        html = html.replace(/\{\{styles\}\}/g, CSS_LINK);
      }
    }
  }

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

  /* Extract classes and tags from HTML so CSS model styles every element */
  const classMatches = html.matchAll(/\bclass=["']([^"']+)["']/gi);
  const classes = new Set<string>();
  for (const m of classMatches) {
    for (const c of (m[1] ?? "").trim().split(/\s+/)) {
      if (c && !c.startsWith("{{")) classes.add(c);
    }
  }
  const tagMatches = html.matchAll(/<([a-z][a-z0-9]*)\b/gi);
  const tags = new Set<string>();
  for (const m of tagMatches) {
    const tag = (m[1] ?? "").toLowerCase();
    if (!["html", "head", "body", "meta", "link", "script", "style", "title"].includes(tag)) {
      tags.add(tag);
    }
  }
  const classList = [...classes].sort().join(", ");
  const tagList = [...tags].sort().join(", ");

  emit({ type: "status", message: "Generating CSS to match HTML structure..." });
  const cssPrompt = `${copyContext}

You are an expert CSS author. Output the FULL, COMPLETE CSS for this funnel landing page.

**CRITICAL - STYLE EVERY CLASS AND ELEMENT:** The HTML uses these classes: ${classList || "(none found)"}. The HTML uses these element tags: ${tagList || "(none found)"}. You MUST implement styles for EVERY class and EVERY relevant element. No class in the HTML may be left without a matching CSS rule.

**FOLLOW THE TEMPLATE - COMPLETE RESEMBLANCE:** The template CSS scaffold defines the exact style. Your output must completely resemble it in every way—colors, typography, spacing, layout, selectors, and patterns. When the HTML has more or fewer sections than the template example: extend or condense using the SAME styling. Use the same variables, values, and design language. The funnel must look identical to the selected template—only the content length varies. Extend the template to cover any additional classes from the HTML. Never omit a class that appears in the HTML.

**COMPLETE OUTPUT:** You MUST output the FULL CSS—every rule, every selector. Never truncate. Produce complete, production-ready CSS.

Requirements: Mobile-first, clean typography, generous whitespace. Style .funnel-media (images), CTAs, sections, headings. Ensure body/section content has readable line-height (1.5–1.7) and spacing between paragraphs.

Actual HTML to style (extract all classes and elements from this):
\`\`\`html
${html.length > 12000 ? html.slice(0, 12000) + "\n<!-- truncated for length -->" : html}
\`\`\`

Template CSS scaffold (structure and style to follow):
\`\`\`css
${templateCssScaffold}
\`\`\``;

  const cssResult = await generateObject({
    model: gateway("openai/gpt-4.1"),
    schema: cssOnlySchema,
    system: FUNNEL_GENERATION_EXTRA_SYSTEM_PROMPT,
    prompt: cssPrompt,
    maxOutputTokens: 65536,
  });
  let css = (cssResult.object.css ?? "").trim().replace(/^```(?:css)?\s*\n?|```\s*$/gm, "").trim();

  if (css.length < 50) {
    css = `* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; line-height: 1.5; color: #1a1a1a; background: #fff; }
img, video { max-width: 100%; height: auto; display: block; }
section { padding: 1.5rem 1rem; max-width: 720px; margin: 0 auto; }
h1, h2, h3 { margin-top: 0; margin-bottom: 0.5em; }
p { margin: 0 0 1em; }
`;
  }

  /* Emit full HTML and CSS so scaffolds show complete code (with img tags, scaffold merge, etc.) */
  emit({ type: "html-stream", payload: { value: html } });
  emit({ type: "css-stream", payload: { value: css } });

  emit({ type: "status", message: "Generating images..." });
  const imageResults = await runWithConcurrencyLimit(
    imageCandidates,
    IMAGE_CONCURRENCY,
    generateImageForSection,
  );

  const generatedImages: Record<string, string> = {};
  for (const { sectionId, dataUrl } of imageResults) {
    generatedImages[sectionId] = dataUrl;
  }

  emit({
    type: "status",
    message: "Uploading images and saving funnel.",
  });
  const storageClient = createSupabaseAdminClient() ?? supabase;
  const imagesForDb = await uploadImagesMapToStorage(generatedImages, storageClient);

  const { data: funnel, error: funnelError } = await supabase
    .from("funnels")
    .insert({
      agent_slug: "copy-injection",
      name: parsedData.funnelName,
      objective: parsedData.objective,
      template_id: parsedData.templateId ?? null,
      latest_html: html,
      latest_css: css,
      latest_images: imagesForDb,
    })
    .select("*")
    .single();

  if (funnelError || !funnel) {
    throw new RouteError(500, `Saving funnel failed: ${funnelError?.message}`);
  }

  const { error: versionError } = await supabase
    .from("funnel_versions")
    .insert({
      funnel_id: funnel.id,
      source: "generate",
      user_instruction: parsedData.objective,
      html,
      css,
      images: imagesForDb,
      section_plan: sectionPlan,
    });

  if (versionError) {
    throw new RouteError(500, `Saving version failed: ${versionError.message}`);
  }

  return {
    funnel: { ...funnel, latest_images: imagesForDb },
    generated: {
      html,
      css,
      images: imagesForDb,
      sectionPlan,
    },
  };
}

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = generateSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    if (parsed.data.stream) {
      const stream = createUIMessageStream({
        execute: async ({ writer }) => {
          const emit = (event: ProgressEvent) => {
            writer.write({
              type: "data-generation-event",
              data: event,
              transient: true,
            });
          };

          try {
            emit({
              type: "status",
              message: "Generation started.",
            });
            const result = await runGeneration(parsed.data, emit);
            writer.write({
              type: "data-generation-result",
              data: result,
              transient: true,
            });
            emit({
              type: "done",
              message: "Generation completed.",
            });
          } catch (error) {
            const routeError = error instanceof RouteError ? error : null;
            emit({
              type: "error",
              message:
                routeError?.message ??
                (error instanceof Error ? error.message : "Unknown server error"),
              payload: { status: routeError?.status ?? 500 },
            });
          }
        },
      });

      return createUIMessageStreamResponse({ stream });
    }

    const result = await runGeneration(parsed.data, () => {});
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
