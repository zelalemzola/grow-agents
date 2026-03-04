import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateObject,
  streamObject,
} from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  htmlCssSchema,
  sectionPlanSchema,
} from "@/lib/copy-injection";
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
    prompt: `${copyContext}

You are a senior direct-response funnel architect.

Produce a detailed section plan for a high-converting funnel landing page.
You MUST map content into conversion-oriented sections in logical order.
Keep copy assertive but realistic and policy-safe.

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

  const imageCandidates = sectionPlan.sections
    .filter((section) => Boolean(section.title || section.content))
    .slice(0, 6);

  const funnelContext = {
    objective: parsedData.objective,
    pageName: sectionPlan.pageName,
    sectionSummaries: sectionPlan.sections.map((s) => ({
      id: s.id,
      title: s.title,
      contentPreview: s.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120),
    })),
  };

  emit({
    type: "status",
    message: "Building HTML/CSS and generating images in parallel.",
    payload: { imageCandidates: imageCandidates.length },
  });

  const htmlCssPrompt = `${copyContext}

You are an expert HTML/CSS funnel builder.

Goal:
- Build a complete landing page from this section plan.
- Preserve structure and conversion flow.
- Keep CSS maintainable and scoped.
- Use semantic HTML.
- Include placeholders for generated images as <img src="{{image:SECTION_ID}}" ...>.
- Do not include markdown fences.

ADAPTIVE LAYOUT (CRITICAL):
- The template scaffold shows the desired UI flow, typography, and visual style—NOT a rigid structure.
- If the section plan has MORE sections than the template shows (e.g. 8 body sections vs 4), extend/repeat the layout pattern. Add more body blocks, testimonials, or proof sections as needed. Preserve the template's look and feel.
- If the section plan has FEWER sections, condense the layout. Do NOT leave empty placeholders or unused template structure.
- Match the output structure exactly to the sections in the plan. Every section in the plan must appear in the HTML; no extra or missing sections.

UI/LAYOUT REQUIREMENTS (critical for conversion):
- Mobile-first responsive: readable on small screens, scales up for desktop.
- Clean typography: readable font sizes (min 16px body), clear hierarchy (headings vs body).
- Generous whitespace: avoid cramped sections; use padding/margin for breathing room.
- Full-width sections with max-width content containers for readability.
- CTAs: prominent buttons with clear contrast, adequate touch targets.
- Images: use object-fit: cover, sensible aspect ratios, no distorted visuals.

Section Plan JSON:
${JSON.stringify(sectionPlan, null, 2)}

Template guidance:
${template?.instructions ?? "No strict template guidance. Use clean modern conversion layout."}

Template HTML scaffold:
${template?.html_scaffold ?? "N/A"}

Template CSS scaffold:
${template?.css_scaffold ?? "N/A"}`;

  const { partialObjectStream, object: htmlCssObject } = streamObject({
    model: gateway("openai/gpt-4.1"),
    schema: htmlCssSchema,
    system: FUNNEL_GENERATION_EXTRA_SYSTEM_PROMPT,
    prompt: htmlCssPrompt,
  });

  const { generateFunnelMedia } = await import("@/lib/generate-funnel-media");
  const { getImageModel } = await import("@/lib/image-model");
  const { getVideoModel } = await import("@/lib/video-model");
  const imageModel = getImageModel();
  const videoModel = getVideoModel();

  const IMAGE_CONCURRENCY = 1;

  async function generateImageForSection(
    section: (typeof imageCandidates)[number],
  ): Promise<{ sectionId: string; dataUrl: string }> {
    emit({
      type: "reasoning",
      message: `Generating image for section "${section.id}"${section.preferGif ? " (GIF/motion preferred)" : ""}.`,
      payload: { sectionId: section.id },
    });
    const visualDescription = await buildVisualDescription(
      {
        title: section.title,
        content: section.content,
        id: section.id,
        type: section.type,
        imagePrompt: section.imagePrompt,
        preferGif: section.preferGif,
      },
      gateway("openai/gpt-4.1-mini"),
      funnelContext,
    );
    const { dataUrl } = await generateFunnelMedia({
      prompt: visualDescription,
      preferGif: section.preferGif ?? false,
      imageModel,
      videoModel,
      sectionId: section.id,
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

  const htmlCssTask = (async () => {
    for await (const partial of partialObjectStream) {
      if (typeof partial.html === "string" && partial.html.length > 0) {
        emit({ type: "html-stream", payload: { value: partial.html } });
      }
      if (typeof partial.css === "string" && partial.css.length > 0) {
        emit({ type: "css-stream", payload: { value: partial.css } });
      }
    }
    return htmlCssObject;
  })();

  const [htmlCssResult, imageResults] = await Promise.all([
    htmlCssTask,
    runWithConcurrencyLimit(imageCandidates, IMAGE_CONCURRENCY, generateImageForSection),
  ]);

  const html = htmlCssResult.html;
  const css = htmlCssResult.css;
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
