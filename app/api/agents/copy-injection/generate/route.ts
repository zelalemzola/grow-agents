import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateImage,
  generateObject,
} from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  htmlCssSchema,
  sectionPlanSchema,
} from "@/lib/copy-injection";
import {
  buildImageModelPrompt,
  buildVisualDescription,
} from "@/lib/image-prompt-builder";
import {
  agent1PromptContext,
  FUNNEL_GENERATION_EXTRA_SYSTEM_PROMPT,
} from "@/lib/agent1-guidelines";
import { getGateway } from "@/lib/ai-gateway";
import { createServerSupabaseClient } from "@/utils/supabase/server";

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
    | "done";
  message: string;
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
- imagePrompt (string when relevant, otherwise null)

Important: every section object MUST include both ctaLabel and imagePrompt keys.`,
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

  emit({
    type: "status",
    message: "Building HTML/CSS layout from section plan.",
  });
  const htmlCssResult = await generateObject({
    model: gateway("openai/gpt-4.1"),
    schema: htmlCssSchema,
    system: FUNNEL_GENERATION_EXTRA_SYSTEM_PROMPT,
    prompt: `${copyContext}

You are an expert HTML/CSS funnel builder.

Goal:
- Build a complete landing page from this section plan.
- Preserve structure and conversion flow.
- Keep CSS maintainable and scoped.
- Use semantic HTML.
- Include placeholders for generated images as <img src="{{image:SECTION_ID}}" ...>.
- Do not include markdown fences.

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
${template?.css_scaffold ?? "N/A"}`,
  });

  const html = htmlCssResult.object.html;
  const css = htmlCssResult.object.css;

  const imageCandidates = sectionPlan.sections
    .filter((section) => Boolean(section.title || section.content))
    .slice(0, 6);

  emit({
    type: "step",
    message: "Preparing image generation.",
    payload: { imageCandidates: imageCandidates.length },
  });

  const generatedImages: Record<string, string> = {};

  for (const section of imageCandidates) {
    emit({
      type: "reasoning",
      message: `Generating image for section "${section.id}".`,
      payload: { sectionId: section.id },
    });

    const visualDescription = await buildVisualDescription(
      { title: section.title, content: section.content, id: section.id },
      gateway("openai/gpt-4.1-mini"),
    );

    const imagePrompt = buildImageModelPrompt(visualDescription);

    const imageResult = await generateImage({
      model: gateway.image("google/imagen-4.0-fast-generate-001"),
      prompt: imagePrompt,
      aspectRatio: "16:9",
    });

    const mediaType = imageResult.image.mediaType ?? "image/png";
    generatedImages[section.id] = `data:${mediaType};base64,${imageResult.image.base64}`;
  }

  emit({
    type: "status",
    message: "Saving funnel and version history.",
  });
  const { data: funnel, error: funnelError } = await supabase
    .from("funnels")
    .insert({
      agent_slug: "copy-injection",
      name: parsedData.funnelName,
      objective: parsedData.objective,
      template_id: parsedData.templateId ?? null,
      latest_html: html,
      latest_css: css,
      latest_images: generatedImages,
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
      images: generatedImages,
      section_plan: sectionPlan,
    });

  if (versionError) {
    throw new RouteError(500, `Saving version failed: ${versionError.message}`);
  }

  return {
    funnel,
    generated: {
      html,
      css,
      images: generatedImages,
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
