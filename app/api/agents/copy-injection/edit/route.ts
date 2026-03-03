import { generateImage, generateObject } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { buildImageModelPrompt } from "@/lib/image-prompt-builder";
import {
  agent1PromptContext,
  FUNNEL_GENERATION_EXTRA_SYSTEM_PROMPT,
} from "@/lib/agent1-guidelines";
import { editPlanSchema, targetedEditSchema } from "@/lib/copy-injection";
import { getGateway } from "@/lib/ai-gateway";
import { createServerSupabaseClient } from "@/utils/supabase/server";

const editSchema = z.object({
  funnelId: z.string().uuid(),
  editComment: z.string().min(4),
});

type TargetedCodeEdit = z.infer<typeof targetedEditSchema>["htmlEdits"][number];

function countOccurrences(source: string, needle: string): number {
  if (!needle) {
    return 0;
  }
  let count = 0;
  let offset = 0;
  while (true) {
    const index = source.indexOf(needle, offset);
    if (index === -1) {
      break;
    }
    count += 1;
    offset = index + needle.length;
  }
  return count;
}

function applyTargetedEdits(source: string, edits: TargetedCodeEdit[], label: "HTML" | "CSS"): string {
  let next = source;
  for (const edit of edits) {
    if (edit.find === edit.replace) {
      continue;
    }

    const broadEditThreshold = 0.7;
    if (edit.find.length / Math.max(next.length, 1) > broadEditThreshold) {
      throw new Error(
        `${label} edit is too broad and looks like a full rewrite. Narrow the requested change to a specific section.`,
      );
    }

    const matches = countOccurrences(next, edit.find);
    if (matches === 0) {
      throw new Error(
        `${label} edit target not found: ${edit.selectorHint ?? edit.rationale ?? edit.find.slice(0, 60)}`,
      );
    }
    if (matches > 1) {
      throw new Error(
        `${label} edit target is ambiguous (${matches} matches): ${edit.selectorHint ?? edit.rationale ?? edit.find.slice(0, 60)}`,
      );
    }

    next = next.replace(edit.find, edit.replace);
  }
  return next;
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const json = await request.json();
    const parsed = editSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { data: funnel, error: funnelError } = await supabase
      .from("funnels")
      .select("*")
      .eq("id", parsed.data.funnelId)
      .single();

    if (funnelError || !funnel) {
      return NextResponse.json(
        { error: `Funnel lookup failed: ${funnelError?.message}` },
        { status: 404 },
      );
    }

    // Knowledge base disabled for now to reduce latency
    const copyContext = agent1PromptContext([], "copy");

    const gateway = getGateway();

    const editPlanResult = await generateObject({
      model: gateway("openai/gpt-4.1-mini"),
      schema: editPlanSchema,
      system: FUNNEL_GENERATION_EXTRA_SYSTEM_PROMPT,
      prompt: `${copyContext}

You are a funnel optimization editor.

Analyze the user's edit request and decide:
1) what textual/layout update is needed
2) whether any existing section images must be regenerated

Current funnel objective:
${funnel.objective}

User edit request:
${parsed.data.editComment}

Return concise summary and imageEdits (sectionId + prompt). If no image changes are needed, return empty imageEdits.

For each imageEdit prompt: write a 1-2 sentence description of what the new photograph should show (people, setting, objects, mood). Describe the visual scene only - no instructions or meta-commentary.`,
    });

    const editPlan = editPlanResult.object;

    const targetedEditsResult = await generateObject({
      model: gateway("openai/gpt-4.1"),
      schema: targetedEditSchema,
      system: FUNNEL_GENERATION_EXTRA_SYSTEM_PROMPT,
      prompt: `${copyContext}

You are editing an existing funnel page.

Critical requirements:
- Apply the user's request precisely.
- Return only targeted edits in find/replace form.
- Do NOT rewrite full HTML or full CSS.
- Only map and modify the exact parts related to the user's comment.
- Preserve all unrelated layout structure, copy blocks, and existing CSS selectors.
- Keep valid HTML and CSS.
- Keep all image placeholders in same format: <img src="{{image:SECTION_ID}}" ...>.
- Every "find" must be an exact snippet copied from the current code.
- Every "find" must match exactly one location.
- If no HTML or CSS changes are required, return empty arrays.

User request:
${parsed.data.editComment}

Edit summary:
${editPlan.summary}

Current HTML:
${funnel.latest_html}

Current CSS:
${funnel.latest_css}`,
    });

    const targetedEdits = targetedEditsResult.object;
    const updatedHtml = applyTargetedEdits(
      funnel.latest_html as string,
      targetedEdits.htmlEdits,
      "HTML",
    );
    const updatedCss = applyTargetedEdits(
      funnel.latest_css as string,
      targetedEdits.cssEdits,
      "CSS",
    );

    const mergedImages: Record<string, string> = {
      ...(funnel.latest_images as Record<string, string>),
    };

    for (const imageEdit of editPlan.imageEdits) {
      const imagePrompt = buildImageModelPrompt(imageEdit.prompt);

      const imageResult = await generateImage({
        model: gateway.image("google/imagen-4.0-fast-generate-001"),
        prompt: imagePrompt,
        aspectRatio: "16:9",
      });

      const mediaType = imageResult.image.mediaType ?? "image/png";
      mergedImages[imageEdit.sectionId] = `data:${mediaType};base64,${imageResult.image.base64}`;
    }

    const { data: updatedFunnel, error: updateError } = await supabase
      .from("funnels")
      .update({
        latest_html: updatedHtml,
        latest_css: updatedCss,
        latest_images: mergedImages,
      })
      .eq("id", funnel.id)
      .select("*")
      .single();

    if (updateError || !updatedFunnel) {
      return NextResponse.json(
        { error: `Updating funnel failed: ${updateError?.message}` },
        { status: 500 },
      );
    }

    const { error: versionError } = await supabase
      .from("funnel_versions")
      .insert({
        funnel_id: funnel.id,
        source: "edit",
        user_instruction: parsed.data.editComment,
        html: updatedHtml,
        css: updatedCss,
        images: mergedImages,
        section_plan: {
          editSummary: editPlan.summary,
          targetedEdits,
          imageEdits: editPlan.imageEdits,
        },
      });

    if (versionError) {
      return NextResponse.json(
        { error: `Saving version failed: ${versionError.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      funnel: updatedFunnel,
      editPlan,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
