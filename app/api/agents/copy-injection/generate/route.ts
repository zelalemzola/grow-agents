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
import { formatSectionPlanContentForHtml } from "@/lib/format-section-content";
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

  emit({
    type: "status",
    message: "Planning funnel sections.",
  });
  const sectionPlanResult = await generateObject({
    model: gateway("openai/gpt-4.1-mini"),
    schema: sectionPlanSchema,
    system: FUNNEL_GENERATION_EXTRA_SYSTEM_PROMPT,
    maxOutputTokens: 32768,
    prompt: `${copyContext}

You are a senior direct-response funnel architect.

Produce a detailed section plan for a high-converting funnel landing page.
You MUST map content into conversion-oriented sections in logical order.
Keep copy assertive but realistic and policy-safe.

**ZERO OMISSION - NON-NEGOTIABLE:** Use the COMPLETE advertorial copy exactly as provided. NOT A SINGLE LINE may be added or removed. The VERY FIRST line MUST appear—do NOT skip it. Every headline, paragraph, list item, review, testimonial, disclaimer, and footnote must appear verbatim and unchanged. NEVER summarize, condense, omit, skip, or paraphrase. If the copy has 30 paragraphs, output 30. If it has 12 reviews, output 12. Preserve 100% of the text—word for word. The user may include [image] or [gif]; keep those markers exactly where they appear. Generate media ONLY at those placeholder positions. Do NOT invent or add content that is not in the copy.

ADAPT TO COPY LENGTH: The user's objective/copy may be longer or shorter than any template. Create as many sections as the content warrants—do NOT pad short copy with filler or cram long copy into few sections. Long copy → more body/proof sections (6-10+). Short copy → fewer sections (1-3 body). The template defines layout style, not a fixed section count. Every piece of substantive content should get its own section where appropriate.

Funnel name: ${parsedData.funnelName}
Objective: ${parsedData.objective}
Campaign context: ${parsedData.campaignContext ?? "N/A"}
Template instructions: ${template?.instructions ?? "No template instructions provided"}

${(() => {
    const firstLine = (parsedData.objective.split(/\r?\n/)[0] ?? "").trim();
    return firstLine ? `**FIRST LINE CHECK:** The first line is: "${firstLine.slice(0, 200)}${firstLine.length > 200 ? "..." : ""}" — MUST appear in your output (headline or hook). Do NOT skip it.\n\n` : "";
  })()}
For each section include:
- id (short slug e.g. hero-headline, social-proof-1)
- type
- title
- content: MUST use HTML formatting. <br><br> between paragraphs, <br> for line breaks, <b> for bold/key phrases, <i> for italic/quotes. Apply proper spacing—no wall-of-text. Vary rhythm with breaks. Never output raw paragraphs or \\n.
- ctaLabel (string when relevant, otherwise null)
- imagePrompt: A concrete 1-2 sentence visual description for this section's image. MUST directly illustrate this section's content. Follow advertorial rules: editorial, candid, no text/logos. Headline images create curiosity without revealing the solution. Body images explain the single core idea. Be specific to the copy.
- preferGif: Per the IMAGE GUIDELINE "When to Use Animation" rules. Set TRUE when: (a) HEADLINE implies process, transformation, hidden cause, before/after, or change over time; (b) BODY explains mechanism, digestion, absorption, delivery path, how-it-works, or cause-and-effect over time; (c) PRODUCT section shows mechanism, delivery, or absorption. Set FALSE for: static testimonials, FAQs, simple hero hooks with no process, pure comparison tables, or when a frozen moment creates stronger tension. DEFAULT to true for body and product sections that explain processes.

Examples: "how it enters the bloodstream" → preferGif: true; "digestion over 24 hours" → preferGif: true; "Scientists discover what happens inside your gut" → preferGif: true; testimonial quote → preferGif: false; FAQ "How do I take it?" → preferGif: false.

Important: every section object MUST include ctaLabel, imagePrompt, and preferGif. imagePrompt must be content-specific, not generic. Follow the image guideline—use GIF/animation wherever it improves credibility and comprehension.`,
  });

  const sectionPlan = sectionPlanResult.object;
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

**TEMPLATE STYLING - EXTEND OR CONDENSE:** The selected template defines the visual style. Your output must completely resemble it. When content is LARGER than the template example: add more sections using the SAME class names, structure, and styling patterns. When content is SMALLER: use fewer sections but the SAME styling. The funnel must look identical to the template in colors, typography, spacing, layout, and structure—only the amount of content varies. Use the template's class names and HTML structure.

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

  emit({ type: "status", message: "Generating HTML..." });
  const htmlResult = await generateObject({
    model: gateway("openai/gpt-4.1"),
    schema: htmlOnlySchema,
    system: FUNNEL_GENERATION_EXTRA_SYSTEM_PROMPT,
    prompt: htmlPrompt,
    maxOutputTokens: 32768,
  });
  const htmlRaw = htmlResult.object.html;

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
    maxOutputTokens: 32768,
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
