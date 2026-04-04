import { NextResponse } from "next/server";
import { z } from "zod";

import { classifyIsProductSection } from "@/lib/classify-product-section";
import { generateFunnelMedia } from "@/lib/generate-funnel-media";
import { buildVisualDescription } from "@/lib/image-prompt-builder";
import { uploadImagesMapToStorage } from "@/lib/funnel-image-storage";
import { getGateway } from "@/lib/ai-gateway";
import {
  createServerSupabaseClient,
  createSupabaseAdminClient,
} from "@/utils/supabase/server";

export const maxDuration = 300;

const bodySchema = z.object({
  sectionId: z.string().min(1),
  comment: z.string().min(1),
  /** Optional product reference (data URL) for this regeneration */
  productImage: z.string().optional(),
  /** When true, prefer GIF/video over static image */
  preferGif: z.boolean().optional(),
  /** Client draft HTML so placeholders stay in sync */
  currentHtml: z.string().optional(),
});

type PlanSection = {
  id: string;
  type: string;
  title: string;
  content: string;
  imagePrompt?: string | null;
  preferGif?: boolean;
};

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id: funnelId } = await params;
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const supabase = await createServerSupabaseClient();
    const gateway = getGateway();

    const { data: funnel, error: funnelError } = await supabase
      .from("funnels")
      .select("*")
      .eq("id", funnelId)
      .single();

    if (funnelError || !funnel) {
      return NextResponse.json(
        { error: funnelError?.message ?? "Project not found." },
        { status: 404 },
      );
    }

    if (funnel.agent_slug !== "copy-injection") {
      return NextResponse.json(
        { error: "Not a copy-injection project." },
        { status: 400 },
      );
    }

    const { data: latestVersion } = await supabase
      .from("funnel_versions")
      .select("section_plan, html, css")
      .eq("funnel_id", funnelId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const planRoot = latestVersion?.section_plan as
      | { sections?: PlanSection[] }
      | null
      | undefined;
    const sections = planRoot?.sections ?? [];
    let section = sections.find((s) => s.id === parsed.data.sectionId);

    if (!section) {
      section = {
        id: parsed.data.sectionId,
        type: "body",
        title: "Section",
        content: "",
        imagePrompt: null,
        preferGif: parsed.data.preferGif ?? false,
      };
    }

    const workingHtml =
      parsed.data.currentHtml ?? (funnel.latest_html as string) ?? "";
    if (
      !workingHtml.includes(`id="${parsed.data.sectionId}"`) &&
      !workingHtml.includes(`{{image:${parsed.data.sectionId}}}`)
    ) {
      return NextResponse.json(
        {
          error:
            "Section id not found in HTML. Save or regenerate the funnel, then try again.",
        },
        { status: 400 },
      );
    }

    const objective = funnel.objective as string;
    const refinement = `\n\n[User refinement for this image — follow closely]: ${parsed.data.comment}`;

    const sectionForVisual = {
      title: section.title,
      content: `${section.content}${refinement}`,
      id: section.id,
      type: section.type as
        | "headline"
        | "hook"
        | "body"
        | "cta"
        | "testimonial"
        | "faq"
        | "image"
        | "proof",
      imagePrompt: section.imagePrompt ?? null,
      preferGif: parsed.data.preferGif ?? section.preferGif ?? false,
      isProductSection: false,
    };

    const sectionSummaries = sections.map((s) => ({
      id: s.id,
      title: s.title,
      contentPreview: s.content
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120),
    }));

    const differentFromIds = sections
      .map((s) => s.id)
      .filter((sid) => sid !== parsed.data.sectionId);

    const plainForClassify = section.content
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const isProductSection = await classifyIsProductSection(
      plainForClassify + refinement,
      objective,
      gateway("openai/gpt-4.1-mini"),
    );

    sectionForVisual.isProductSection =
      isProductSection || section.type === "testimonial";

    let productImageBase64: string[] | undefined;
    if (parsed.data.productImage) {
      const m = /^data:image\/[^;]+;base64,(.+)$/.exec(parsed.data.productImage);
      if (m) {
        productImageBase64 = [m[1]];
      }
    }

    const { description: visualDescription, sceneType } =
      await buildVisualDescription(sectionForVisual, gateway("openai/gpt-4.1-mini"), {
        objective,
        pageName:
          (planRoot as { pageName?: string })?.pageName ?? funnel.name ?? "Funnel",
        sectionSummaries,
        differentFromIds,
        sectionIndex: Math.max(
          0,
          sections.findIndex((s) => s.id === parsed.data.sectionId),
        ),
      });

    const { getImageModel } = await import("@/lib/image-model");
    const { getVideoModel } = await import("@/lib/video-model");
    const imageModel = getImageModel();
    const videoModel = getVideoModel();

    const { dataUrl } = await generateFunnelMedia({
      prompt: visualDescription,
      sceneType,
      preferGif: sectionForVisual.preferGif,
      imageModel,
      videoModel,
      sectionId: parsed.data.sectionId,
      productImageBase64,
      onVideoFallback: (sid, err) => {
        console.warn(
          `[regenerate-media] Video fallback for ${sid}:`,
          err instanceof Error ? err.message : err,
        );
      },
    });

    const existingImages = (funnel.latest_images ?? {}) as Record<string, string>;
    const mergedImages: Record<string, string> = {
      ...existingImages,
      [parsed.data.sectionId]: dataUrl,
    };

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

    const imagesForClient: Record<string, string> = { ...mergedImages };
    for (const [k, v] of Object.entries(imagesForDb)) {
      if (v) imagesForClient[k] = v;
    }

    const htmlToSave = workingHtml;
    const cssToSave = (funnel.latest_css as string) ?? "";

    const { data: updatedFunnel, error: updateError } = await supabase
      .from("funnels")
      .update({
        latest_images: imagesForDb,
        updated_at: new Date().toISOString(),
      })
      .eq("id", funnelId)
      .select("*")
      .single();

    if (updateError || !updatedFunnel) {
      return NextResponse.json(
        { error: updateError?.message ?? "Failed to save funnel." },
        { status: 500 },
      );
    }

    const { error: versionError } = await supabase.from("funnel_versions").insert({
      funnel_id: funnelId,
      source: "edit",
      user_instruction: `Media regen (${parsed.data.sectionId}): ${parsed.data.comment.slice(0, 500)}`,
      html: htmlToSave,
      css: cssToSave,
      images: imagesForDb,
      section_plan: {
        ...(planRoot ?? {}),
        mediaRegeneration: {
          sectionId: parsed.data.sectionId,
          comment: parsed.data.comment,
        },
      },
    });

    if (versionError) {
      return NextResponse.json(
        { error: versionError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      funnel: updatedFunnel,
      latest_images: imagesForClient,
      sectionId: parsed.data.sectionId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
