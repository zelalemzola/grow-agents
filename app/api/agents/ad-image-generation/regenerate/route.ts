import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { parseAdImageKey, formatAdImageKey } from "@/lib/ad-image-keys";
import { getGateway } from "@/lib/ai-gateway";
import { generateAdImage } from "@/lib/ad-image-generate";
import { uploadImageToStorage } from "@/lib/funnel-image-storage";
import {
  createServerSupabaseClient,
  createSupabaseAdminClient,
} from "@/utils/supabase/server";

export const maxDuration = 60;

const aspectRatioSchema = z.enum(["3:4", "16:9", "1:1"]);

const regenerateSchema = z
  .object({
    funnelId: z.string().uuid(),
    /** Legacy: image index 1–5 (first variant of that prompt). */
    imageIndex: z.number().int().min(1).max(5).optional(),
    /** Preferred: storage key such as "3-2" or legacy "3". */
    imageKey: z.string().optional(),
    comment: z.string().min(1).max(2000),
    /** Aspect ratio for the new image (default 16:9). */
    aspectRatio: aspectRatioSchema.optional(),
  })
  .refine((d) => d.imageKey != null || d.imageIndex != null, {
    message: "Provide imageKey or imageIndex.",
  });

const refinedPromptSchema = z.object({
  prompt: z
    .string()
    .min(10)
    .max(1500)
    .describe(
      "A single, concrete image generation prompt that applies the user's feedback to the original scene. Same style and structure as the original; only the requested changes applied. No meta-commentary.",
    ),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const parsed = regenerateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { funnelId, imageIndex, imageKey: rawKey, comment, aspectRatio } =
    parsed.data;
  const aspect = aspectRatio ?? "16:9";

  let storageKey: string;
  let promptSlot: number;

  if (rawKey) {
    const parsedKey = parseAdImageKey(rawKey);
    if (!parsedKey) {
      return NextResponse.json(
        { error: "Invalid imageKey." },
        { status: 400 },
      );
    }
    storageKey = formatAdImageKey(parsedKey.prompt, parsedKey.variant);
    promptSlot = parsedKey.prompt;
  } else if (imageIndex != null) {
    promptSlot = imageIndex;
    storageKey = formatAdImageKey(imageIndex, 1);
  } else {
    return NextResponse.json(
      { error: "Provide imageKey or imageIndex." },
      { status: 400 },
    );
  }

  const supabase = await createServerSupabaseClient();
  const admin = createSupabaseAdminClient();

  const { data: funnel, error: fetchError } = await supabase
    .from("funnels")
    .select("*")
    .eq("id", funnelId)
    .eq("agent_slug", "ad-image-generation")
    .single();

  if (fetchError || !funnel) {
    return NextResponse.json(
      { error: "Project not found or not an ad-image project." },
      { status: 404 },
    );
  }

  let objective: {
    prompts: string[];
    productImageUrl?: string | null;
    productImageUrls?: [
      string | null,
      string | null,
      string | null,
      string | null,
      string | null,
    ];
  };
  try {
    objective = JSON.parse(funnel.objective as string) as {
      prompts: string[];
      productImageUrl?: string | null;
      productImageUrls?: [
        string | null,
        string | null,
        string | null,
        string | null,
        string | null,
      ];
    };
  } catch {
    return NextResponse.json(
      { error: "Invalid project data (objective)." },
      { status: 400 },
    );
  }

  const prompts = objective.prompts ?? [];
  const originalPrompt = prompts[promptSlot - 1];
  if (!originalPrompt?.trim()) {
    return NextResponse.json(
      { error: "No original prompt for that image slot." },
      { status: 400 },
    );
  }

  const gateway = getGateway();
  const refined = await generateObject({
    model: gateway("openai/gpt-4.1-mini"),
    schema: refinedPromptSchema,
    system: `You are an image prompt editor. Given an original image prompt and the user's feedback, output a SINGLE revised image generation prompt that applies the feedback. Keep the same style (photorealistic, editorial, no text). Change only what the user asked for. Output only the new prompt, no explanation.`,
    prompt: `Original image prompt:\n${originalPrompt}\n\nUser feedback (apply this to the image):\n${comment}\n\nOutput the revised image generation prompt:`,
  });

  const newPrompt = refined.object.prompt;

  const perPromptUrl = objective.productImageUrls?.[promptSlot - 1];
  const productImageUrl = perPromptUrl ?? objective.productImageUrl;
  let productBase64: string | undefined;
  if (productImageUrl?.startsWith("data:")) {
    productBase64 = productImageUrl;
  } else if (productImageUrl?.startsWith("http")) {
    try {
      const res = await fetch(productImageUrl);
      const buf = await res.arrayBuffer();
      const b64 = Buffer.from(buf).toString("base64");
      const contentType = res.headers.get("content-type") ?? "image/png";
      productBase64 = `data:${contentType};base64,${b64}`;
    } catch {
      // skip product reference if fetch fails
    }
  }

  const { dataUrl } = await generateAdImage({
    prompt: newPrompt,
    productImageBase64: productBase64,
    aspectRatio: aspect,
  });

  const storageClient = admin ?? supabase;
  const uploaded = await uploadImageToStorage(storageKey, dataUrl, storageClient);
  const finalUrl = uploaded ?? dataUrl;

  const currentImages = (funnel.latest_images ?? {}) as Record<string, string>;
  const updatedImages = { ...currentImages, [storageKey]: finalUrl };
  delete updatedImages[String(promptSlot)];

  const { error: updateError } = await supabase
    .from("funnels")
    .update({
      latest_images: updatedImages,
      updated_at: new Date().toISOString(),
    })
    .eq("id", funnelId)
    .eq("agent_slug", "ad-image-generation");

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message ?? "Failed to save updated image." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    imageKey: storageKey,
    imageIndex: promptSlot,
    imageUrl: finalUrl,
    funnel: {
      ...funnel,
      latest_images: updatedImages,
    },
  });
}
