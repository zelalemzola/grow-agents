import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { IMAGE_GENERATION_GUIDELINE } from "@/lib/image-generation-guideline";
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
  /** Optional: use latest draft from client instead of DB (ensures edits apply to unsaved changes). */
  currentHtml: z.string().optional(),
  currentCss: z.string().optional(),
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

type ApplyEditsResult = { result: string; firstEditRegion: { startIndex: number; endIndex: number } | null };

function applyTargetedEdits(
  source: string,
  edits: TargetedCodeEdit[],
  label: "HTML" | "CSS",
): ApplyEditsResult {
  let next = source;
  let firstEditRegion: { startIndex: number; endIndex: number } | null = null;

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

    const startIndex = next.indexOf(edit.find);
    next = next.replace(edit.find, edit.replace);
    if (firstEditRegion === null) {
      firstEditRegion = { startIndex, endIndex: startIndex + edit.replace.length };
    }
  }
  return { result: next, firstEditRegion };
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

    // Use client's current draft when provided (so edits apply to unsaved changes)
    const workingHtml =
      parsed.data.currentHtml != null && parsed.data.currentHtml.trim().length > 0
        ? parsed.data.currentHtml
        : (funnel.latest_html as string);
    const workingCss =
      parsed.data.currentCss != null && parsed.data.currentCss.trim().length > 0
        ? parsed.data.currentCss
        : (funnel.latest_css as string);

    // Knowledge base disabled for now to reduce latency
    const copyContext = agent1PromptContext([], "copy");

    const gateway = getGateway();

    const editPlanResult = await generateObject({
      model: gateway("openai/gpt-4.1-mini"),
      schema: editPlanSchema,
      system: `${FUNNEL_GENERATION_EXTRA_SYSTEM_PROMPT}

${IMAGE_GENERATION_GUIDELINE}`,
      prompt: `${copyContext}

You are a funnel optimization editor.

Analyze the user's edit request and decide:
1) what textual/layout update is needed (if any)
2) whether any existing section images must be regenerated (if any)

CRITICAL - IMAGE-ONLY REQUESTS:
- If the user ONLY mentions images (e.g. "the image under...", "make the hero image...", "the picture looks...", "change the image to seem..."), then you MUST return ONLY imageEdits.
- Do NOT suggest HTML or CSS changes when the user is talking about images alone.
- Map the user's image feedback to the correct sectionId (e.g. hero, headline, first body section) and write a new image prompt.

IMAGE PROMPTS MUST follow the advertorial guideline: editorial, candid, no text/logos, related to the section content and funnel objective.

Current funnel objective:
${funnel.objective}

User edit request:
${parsed.data.editComment}

Return concise summary and imageEdits (sectionId + prompt + preferGif). If no image changes are needed, return empty imageEdits.

For each imageEdit:
- prompt: 1-2 sentence description of what the new photograph should show (people, setting, objects, mood). Describe the visual scene only - specific to the funnel content. No instructions or meta-commentary.
- preferGif: set true when the guideline requires animation (headline implying process/transformation, body explaining mechanism/digestion/absorption, product mechanism). Otherwise false.`,
    });

    const editPlan = editPlanResult.object;

    const targetedEditsResult = await generateObject({
      model: gateway("openai/gpt-4.1"),
      schema: targetedEditSchema,
      system: FUNNEL_GENERATION_EXTRA_SYSTEM_PROMPT,
      prompt: `${copyContext}

You are a funnel code editor that makes TARGETED, MINIMAL edits — like a coding assistant.

EDITING STRATEGY (CRITICAL):
1. Parse the user's request and identify the EXACT section(s) they want changed (e.g. hero headline, body paragraph 2, CTA button).
2. Route through the HTML/CSS to find that specific section. Look for section IDs, class names, or distinctive text.
3. Output ONLY find/replace pairs. Each "find" MUST be an EXACT character-for-character copy of a snippet from the current code.
4. Each "find" must be as MINIMAL as possible — the smallest unique substring that contains only what needs to change.
5. NEVER return full section rewrites. NEVER replace more than ~30% of the file.
6. If the user wants to change one headline, your "find" should be just that headline text (or the enclosing tag), not the whole section.
7. Preserve all unrelated structure, image placeholders {{image:SECTION_ID}}, and styling.
8. You MUST always return htmlEdits and cssEdits. Use empty arrays [] when no changes are needed.

IMAGE-ONLY REQUESTS: If the user's request is ONLY about images (e.g. "the image under X looks...", "make the hero image seem..."), you MUST return empty htmlEdits and empty cssEdits. Do not touch HTML or CSS. Only image regeneration will be applied separately.

User request:
${parsed.data.editComment}

Edit summary:
${editPlan.summary}

Current HTML (edit only the relevant part; copy "find" exactly from here):
${workingHtml}

Current CSS (edit only the relevant part; copy "find" exactly from here):
${workingCss}`,
    });

    const targetedEdits = targetedEditsResult.object;
    const htmlResult = applyTargetedEdits(
      workingHtml,
      targetedEdits.htmlEdits,
      "HTML",
    );
    const cssResult = applyTargetedEdits(
      workingCss,
      targetedEdits.cssEdits,
      "CSS",
    );
    const updatedHtml = htmlResult.result;
    const updatedCss = cssResult.result;

    /** Regions for Cursor-like scroll-to-highlight in the editor. */
    const editedRegions: Array<{
      type: "html" | "css";
      startIndex: number;
      endIndex: number;
    }> = [];
    if (htmlResult.firstEditRegion) {
      editedRegions.push({ type: "html", ...htmlResult.firstEditRegion });
    }
    if (cssResult.firstEditRegion) {
      editedRegions.push({ type: "css", ...cssResult.firstEditRegion });
    }

    const mergedImages: Record<string, string> = {
      ...(funnel.latest_images as Record<string, string>),
    };

    for (const imageEdit of editPlan.imageEdits) {
      const { generateFunnelMedia } = await import("@/lib/generate-funnel-media");
      const { dataUrl } = await generateFunnelMedia({
        prompt: imageEdit.prompt,
        preferGif: imageEdit.preferGif ?? false,
        imageModel: gateway.image("google/imagen-4.0-fast-generate-001"),
      });

      mergedImages[imageEdit.sectionId] = dataUrl;
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
      editedRegions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
