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
    maxOutputTokens: 16384,
    prompt: `${copyContext}

You are a senior direct-response funnel architect.

Produce a detailed section plan for a high-converting funnel landing page.
You MUST map content into conversion-oriented sections in logical order.
Keep copy assertive but realistic and policy-safe.

**CRITICAL - VERBATIM COPY:** Preserve the user's advertorial copy EXACTLY. Do NOT add, remove, rephrase, or summarize any line or paragraph. Every sentence the user provides must appear in your section content unchanged. No hallucination—no invented or omitted content. The user may include [image] or [gif] in the copy; keep those markers exactly where they appear (they will be replaced with generated media). Generate media ONLY at those placeholder positions.

ADAPT TO COPY LENGTH: The user's objective/copy may be longer or shorter than any template. Create as many sections as the content warrants—do NOT pad short copy with filler or cram long copy into few sections. Long copy → more body/proof sections (6-10+). Short copy → fewer sections (1-3 body). The template defines layout style, not a fixed section count. Every piece of substantive content should get its own section where appropriate.

Funnel name: ${parsedData.funnelName}
Objective: ${parsedData.objective}
Campaign context: ${parsedData.campaignContext ?? "N/A"}
Template instructions: ${template?.instructions ?? "No template instructions provided"}

For each section include:
- id (short slug e.g. hero-headline, social-proof-1)
- type
- title
- content
- ctaLabel (string when relevant, otherwise null)
- imagePrompt: A concrete 1-2 sentence visual description for this section's image. MUST directly illustrate this section's content. Follow advertorial rules: editorial, candid, no text/logos. Headline images create curiosity without revealing the solution. Body images explain the single core idea. Be specific to the copy.
- preferGif: Per the IMAGE GUIDELINE "When to Use Animation" rules. Set TRUE when: (a) HEADLINE implies process, transformation, hidden cause, before/after, or change over time; (b) BODY explains mechanism, digestion, absorption, delivery path, how-it-works, or cause-and-effect over time; (c) PRODUCT section shows mechanism, delivery, or absorption. Set FALSE for: static testimonials, FAQs, simple hero hooks with no process, pure comparison tables, or when a frozen moment creates stronger tension. DEFAULT to true for body and product sections that explain processes.

Examples: "how it enters the bloodstream" → preferGif: true; "digestion over 24 hours" → preferGif: true; "Scientists discover what happens inside your gut" → preferGif: true; testimonial quote → preferGif: false; FAQ "How do I take it?" → preferGif: false.

Important: every section object MUST include ctaLabel, imagePrompt, and preferGif. imagePrompt must be content-specific, not generic. Follow the image guideline—use GIF/animation wherever it improves credibility and comprehension.`,
  });

  const sectionPlan = sectionPlanResult.object;
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
  const imageCandidatesBase: Omit<ImageCandidate, "isProductSection">[] =
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
    message: "Building HTML/CSS and generating images in parallel.",
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

  const htmlPrompt = `${copyContext}

You are an expert HTML funnel builder. Output ONLY the HTML for the landing page body (no <html>, <head>, or <body>—just the inner content).

**CRITICAL - [image] and [gif] placeholders:**
Where section content contains [image] or [gif], replace with: <img src="{{image:ID}}" alt="" class="funnel-media" style="width:100%;max-width:100%;height:auto;display:block;border-radius:12px;" />
IDs in order: ${placeholderIdList || "image-1, gif-1, etc."} Do NOT output literal "[image]" or "[gif]".

**COMPLETE OUTPUT:** You MUST output the FULL HTML. Never truncate—write every section. Use semantic HTML. No markdown fences.

ADAPTIVE LAYOUT:
- If the section plan has MORE sections than the template shows, extend the layout. If FEWER, condense. Every section in the plan must appear.
- Mobile-first, clean typography, generous whitespace, full-width sections with max-width containers, prominent CTAs.

Section Plan:
${sectionPlanJson}

Template guidance: ${templateInstructions}
Template HTML scaffold: ${templateHtmlScaffold}`;

  const cssPrompt = `${copyContext}

You are an expert CSS author. Output ONLY the full CSS for this funnel landing page. Target the sections and elements from the section plan. Every section and element must have styles.

**COMPLETE OUTPUT:** You MUST output the FULL CSS. Never truncate—write every rule. No markdown fences.

Requirements: Mobile-first, clean typography, generous whitespace. Style .funnel-media (images), CTAs, sections, headings.

Section Plan (for element/class names):
${sectionPlanJson}

Template CSS scaffold: ${templateCssScaffold}`;

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
      section.isProductSection &&
      productImageBase64.length > 0 &&
      !section.preferGif;
    emit({
      type: "reasoning",
      message: `Generating ${section.preferGif ? "GIF" : "image"} for "${section.id}"${useProductImage ? " (using product reference)" : ""}.`,
      payload: { sectionId: section.id },
    });
    const { description: visualDescription, sceneType } =
      await buildVisualDescription(
        {
          title: section.title,
          content: section.content,
          id: section.id,
          type: section.type,
          imagePrompt: section.imagePrompt,
          preferGif: section.preferGif,
          isProductSection: section.isProductSection,
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

  const htmlTask = generateObject({
    model: gateway("openai/gpt-4.1"),
    schema: htmlOnlySchema,
    system: FUNNEL_GENERATION_EXTRA_SYSTEM_PROMPT,
    prompt: htmlPrompt,
    maxOutputTokens: 16384,
  }).then((r) => {
    emit({ type: "html-stream", payload: { value: r.object.html } });
    return r.object.html;
  });

  const cssTask = generateObject({
    model: gateway("openai/gpt-4.1"),
    schema: cssOnlySchema,
    system: FUNNEL_GENERATION_EXTRA_SYSTEM_PROMPT,
    prompt: cssPrompt,
    maxOutputTokens: 16384,
  }).then((r) => {
    emit({ type: "css-stream", payload: { value: r.object.css } });
    return r.object.css;
  });

  const imageTask = runWithConcurrencyLimit(
    imageCandidates,
    IMAGE_CONCURRENCY,
    generateImageForSection,
  );

  const [htmlRaw, cssRaw, imageResults] = await Promise.all([htmlTask, cssTask, imageTask]);

  let html = mediaPlaceholders.length > 0
    ? replacePlaceholdersInHtml(htmlRaw, mediaPlaceholders)
    : htmlRaw;
  let css = (cssRaw ?? "").trim();

  if (css.length < 50) {
    css = `* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; line-height: 1.5; color: #1a1a1a; background: #fff; }
img, video { max-width: 100%; height: auto; display: block; }
section { padding: 1.5rem 1rem; max-width: 720px; margin: 0 auto; }
h1, h2, h3 { margin-top: 0; margin-bottom: 0.5em; }
p { margin: 0 0 1em; }
`;
  }

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
