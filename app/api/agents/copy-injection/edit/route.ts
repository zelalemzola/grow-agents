import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { IMAGE_GENERATION_GUIDELINE } from "@/lib/image-generation-guideline";
import {
  agent1PromptContext,
  FUNNEL_GENERATION_EXTRA_SYSTEM_PROMPT,
} from "@/lib/agent1-guidelines";
import { editPlanSchema, targetedEditSchema } from "@/lib/copy-injection";
import { extractEditContext } from "@/lib/edit-context-extractor";
import { uploadImagesMapToStorage } from "@/lib/funnel-image-storage";
import { getGateway } from "@/lib/ai-gateway";
import {
  createServerSupabaseClient,
  createSupabaseAdminClient,
} from "@/utils/supabase/server";

export const maxDuration = 300;

const editSchema = z.object({
  funnelId: z.string().uuid(),
  editComment: z.string().min(4),
  /** Optional: use latest draft from client instead of DB (ensures edits apply to unsaved changes). */
  currentHtml: z.string().optional(),
  currentCss: z.string().optional(),
  /** When true, stream progress events for chain-of-thought display */
  stream: z.boolean().optional(),
});

type EditProgressEvent = {
  type: "status" | "reasoning" | "step" | "done" | "error" | "warning";
  message?: string;
  payload?: Record<string, unknown>;
};

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

type EditResult = {
  success: boolean;
  funnelId: string;
  editPlan: unknown;
  editedRegions: Array<{ type: "html" | "css"; startIndex: number; endIndex: number }>;
  latest_html: string;
  latest_css: string;
  latest_images: Record<string, string>;
};

async function runEdit(
  parsed: z.infer<typeof editSchema>,
  emit: (event: EditProgressEvent) => void,
): Promise<EditResult> {
  const supabase = await createServerSupabaseClient();

  emit({ type: "status", message: "Loading funnel..." });
  const { data: funnel, error: funnelError } = await supabase
    .from("funnels")
    .select("*")
    .eq("id", parsed.funnelId)
    .single();

  if (funnelError || !funnel) {
    throw new Error(`Funnel lookup failed: ${funnelError?.message}`);
  }

  const workingHtml =
    parsed.currentHtml != null && parsed.currentHtml.trim().length > 0
      ? parsed.currentHtml
      : (funnel.latest_html as string);
  const workingCss =
    parsed.currentCss != null && parsed.currentCss.trim().length > 0
      ? parsed.currentCss
      : (funnel.latest_css as string);

  const copyContext = agent1PromptContext([], "copy");
  const gateway = getGateway();

  const existingImages = (funnel.latest_images ?? {}) as Record<string, string>;
  const idsFromHtml = [...workingHtml.matchAll(/\{\{image:([a-zA-Z0-9_-]+)\}\}/g)].map(
    (m) => m[1],
  );
  const idsFromImages = Object.keys(existingImages);
  const orderedIds = [...new Map(idsFromHtml.map((id) => [id, 1])).keys()];
  for (const id of idsFromImages) {
    if (!orderedIds.includes(id)) orderedIds.push(id);
  }
  const sectionIdsNote =
    orderedIds.length > 0
      ? `\n\nSECTION IDs in document order (use EXACT strings; "first image"=#1, "third image"=#3):\n${orderedIds.map((id, i) => `${i + 1}. ${id}`).join("\n")}`
      : "";

  emit({ type: "reasoning", message: "Analyzing your edit request..." });
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
- Map the user's image feedback to the correct sectionId. You MUST use one of the available section IDs listed below - no guessing.
- For "image under the headline" or "first image" use the first section ID; for "third image" use the third; etc.

IMAGE PROMPTS MUST follow the advertorial guideline: editorial, candid, no text/logos, related to the section content and funnel objective.

Current funnel objective:
${funnel.objective}
${sectionIdsNote}

User edit request:
${parsed.editComment}

Return concise summary, htmlCssChangesNeeded, and imageEdits.
- htmlCssChangesNeeded: set TRUE only if the user wants to change text, headlines, layout, styling, or HTML/CSS structure. Set FALSE when the request is ONLY about images (e.g. "change the hero image", "regenerate the picture under...", "make the image seem...") or when no edits are needed.
- imageEdits: (sectionId + prompt + preferGif). Empty if no image changes.

For each imageEdit:
- prompt: 1-2 sentence description of what the new photograph should show (people, setting, objects, mood). Describe the visual scene only - specific to the funnel content. No instructions or meta-commentary.
- preferGif: Set true when (a) the user EXPLICITLY asks for a GIF, animation, or video (e.g. "make it a GIF", "change the GIF", "add animation", "make it animated"); OR (b) per the image guideline: headline implies process/transformation; body explains mechanism, digestion, absorption, delivery path, or cause-effect; product shows mechanism/delivery. Set false for testimonials, FAQs, static hooks, or when the user asks for a static image. User request for GIF/animation always wins.`,
    });

  const editPlan = editPlanResult.object;

  const resolveSectionId = (id: string): string => {
    if (orderedIds.includes(id)) return id;
    const lower = id.toLowerCase();
    const match = orderedIds.find((s) => s.toLowerCase() === lower || s.toLowerCase().includes(lower));
    if (match) return match;
    if (/^\d+$/.test(id) && orderedIds[parseInt(id, 10) - 1]) {
      return orderedIds[parseInt(id, 10) - 1];
    }
    return id;
  };

  const resolvedImageEdits = editPlan.imageEdits.map((e) => ({
    ...e,
    sectionId: resolveSectionId(e.sectionId),
  }));
  if (resolvedImageEdits.some((e, i) => e.sectionId !== editPlan.imageEdits[i].sectionId)) {
    emit({
      type: "reasoning",
      message: `Resolved section IDs to match document: ${resolvedImageEdits.map((e) => e.sectionId).join(", ")}`,
    });
  }
  editPlan.imageEdits = resolvedImageEdits;

  emit({
    type: "reasoning",
    message: `Plan: ${editPlan.summary}. HTML/CSS changes: ${editPlan.htmlCssChangesNeeded ? "yes" : "no"}. Images to regenerate: ${editPlan.imageEdits.length}.`,
  });

  let updatedHtml = workingHtml;
  let updatedCss = workingCss;
  const editedRegions: Array<{
    type: "html" | "css";
    startIndex: number;
    endIndex: number;
  }> = [];

  let targetedEdits: z.infer<typeof targetedEditSchema> = {
    htmlEdits: [],
    cssEdits: [],
    notes: null,
  };

  if (editPlan.htmlCssChangesNeeded) {
    emit({ type: "status", message: "Applying targeted HTML/CSS edits..." });
    const { htmlExcerpt, cssExcerpt } = extractEditContext(
      workingHtml,
      workingCss,
      parsed.editComment,
      editPlan.summary,
    );

      const excerptNote =
        htmlExcerpt.length < workingHtml.length
          ? `\n(HTML excerpt - only edit within this; find must be exact substring. Full doc: ${workingHtml.length} chars.)`
          : "";

      const targetedEditsResult = await generateObject({
        model: gateway("openai/gpt-4.1-mini"),
        schema: targetedEditSchema,
        system: FUNNEL_GENERATION_EXTRA_SYSTEM_PROMPT,
        prompt: `${copyContext}

You are a funnel code editor that makes TARGETED, MINIMAL edits — like a coding assistant.

EDITING STRATEGY (CRITICAL):
1. Parse the user's request and identify the EXACT section(s) they want changed (e.g. hero headline, body paragraph 2, CTA button).
2. Output ONLY find/replace pairs. Each "find" MUST be an EXACT character-for-character copy of a snippet from the HTML/CSS below.
3. Each "find" must be as MINIMAL as possible — the smallest unique substring that contains only what needs to change.
4. NEVER return full section rewrites. NEVER replace more than ~30% of the excerpt.
5. Preserve all unrelated structure, image placeholders {{image:SECTION_ID}}, and styling.
6. You MUST always return htmlEdits and cssEdits. Use empty arrays [] when no changes are needed.

User request:
${parsed.editComment}

Edit summary:
${editPlan.summary}
${excerptNote}

Current HTML:
${htmlExcerpt}

Current CSS:
${cssExcerpt}`,
      });

    targetedEdits = targetedEditsResult.object;
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
    updatedHtml = htmlResult.result;
    updatedCss = cssResult.result;
    if (htmlResult.firstEditRegion) {
      editedRegions.push({ type: "html", ...htmlResult.firstEditRegion });
    }
    if (cssResult.firstEditRegion) {
      editedRegions.push({ type: "css", ...cssResult.firstEditRegion });
    }
  }

  const mergedImages: Record<string, string> = {
    ...(funnel.latest_images as Record<string, string>),
  };

  if (editPlan.imageEdits.length > 0) {
    emit({
      type: "step",
      message: `Regenerating ${editPlan.imageEdits.length} image(s)...`,
      payload: { count: editPlan.imageEdits.length },
    });
    const { generateFunnelMedia } = await import("@/lib/generate-funnel-media");
    const { getImageModel } = await import("@/lib/image-model");
    const { getVideoModel } = await import("@/lib/video-model");
    const imageModel = getImageModel();
    const results = await Promise.all(
      editPlan.imageEdits.map((imageEdit) =>
        generateFunnelMedia({
            prompt: imageEdit.prompt,
            preferGif: imageEdit.preferGif ?? false,
            imageModel,
            videoModel: getVideoModel(),
            sectionId: imageEdit.sectionId,
            onVideoFallback: (sid, err) => {
              const msg = err instanceof Error ? err.message : String(err);
              emit({
                type: "warning",
                message: `Video for "${sid}" failed (using static image): ${msg.slice(0, 120)}`,
              });
            },
          }).then(({ dataUrl }) => ({ sectionId: imageEdit.sectionId, dataUrl })),
      ),
    );
    for (const { sectionId, dataUrl } of results) {
      mergedImages[sectionId] = dataUrl;
    }
  }

  emit({ type: "status", message: "Uploading images and saving..." });
  const storageClient = createSupabaseAdminClient() ?? supabase;
  let imagesForDb = await uploadImagesMapToStorage(
    mergedImages,
    storageClient,
    existingImages,
  );
  for (const k of Object.keys(mergedImages)) {
    if (!(k in imagesForDb) && existingImages[k]) {
      imagesForDb = { ...imagesForDb, [k]: existingImages[k] };
    }
  }

  // Client must see the new images. Start from mergedImages (has new base64), prefer imagesForDb URLs when available.
  const imagesForClient: Record<string, string> = { ...mergedImages };
  for (const [k, v] of Object.entries(imagesForDb)) {
    if (v) imagesForClient[k] = v;
  }

  const { data: updatedFunnel, error: updateError } = await supabase
    .from("funnels")
    .update({
      latest_html: updatedHtml,
      latest_css: updatedCss,
      latest_images: imagesForDb,
    })
    .eq("id", funnel.id)
    .select("*")
    .single();

  if (updateError || !updatedFunnel) {
    throw new Error(`Updating funnel failed: ${updateError?.message}`);
  }

  const { error: versionError } = await supabase
    .from("funnel_versions")
    .insert({
      funnel_id: funnel.id,
      source: "edit",
      user_instruction: parsed.editComment,
      html: updatedHtml,
      css: updatedCss,
      images: imagesForDb,
      section_plan: {
        editSummary: editPlan.summary,
        targetedEdits,
        imageEdits: editPlan.imageEdits,
      },
    });

  if (versionError) {
    throw new Error(`Saving version failed: ${versionError.message}`);
  }

  return {
    success: true,
    funnelId: funnel.id,
    editPlan,
    editedRegions,
    latest_html: updatedHtml,
    latest_css: updatedCss,
    latest_images: imagesForClient,
  };
}

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = editSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    if (parsed.data.stream) {
      const stream = createUIMessageStream({
        execute: async ({ writer }) => {
          const emit = (event: EditProgressEvent) => {
            writer.write({
              type: "data-edit-event",
              data: event,
              transient: true,
            });
          };

          try {
            emit({ type: "status", message: "Edit started." });
            const result = await runEdit(parsed.data, emit);
            writer.write({
              type: "data-edit-result",
              data: result,
              transient: true,
            });
            emit({ type: "done", message: "Edit completed." });
          } catch (error) {
            emit({
              type: "error",
              message: error instanceof Error ? error.message : "Unknown server error",
            });
          }
        },
      });

      return createUIMessageStreamResponse({ stream });
    }

    const result = await runEdit(parsed.data, () => {});
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
