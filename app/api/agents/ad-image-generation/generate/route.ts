import { NextResponse } from "next/server";
import { z } from "zod";

import { generateAdImage } from "@/lib/ad-image-generate";
import {
  uploadImageToStorage,
  uploadImagesMapToStorage,
} from "@/lib/funnel-image-storage";
import {
  createServerSupabaseClient,
  createSupabaseAdminClient,
} from "@/utils/supabase/server";

export const maxDuration = 120;

const generateSchema = z.object({
  name: z.string().min(1).max(200),
  prompts: z
    .tuple([
      z.string().min(1),
      z.string().min(1),
      z.string().min(1),
      z.string().min(1),
      z.string().min(1),
    ])
    .describe("Exactly 5 prompts, one per image."),
  /** Optional product image as data URL (base64) or URL. Used when prompts are about a product. */
  productImage: z.string().optional(),
  /** If true, respond with SSE stream and emit one event per image as it completes, then a done event. */
  stream: z.boolean().optional(),
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

  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { name, prompts, productImage, stream: useStream } = parsed.data;

  const supabase = await createServerSupabaseClient();
  const admin = createSupabaseAdminClient();
  const productBase64 =
    productImage && productImage.startsWith("data:") ? productImage : undefined;

  if (useStream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: object) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
          );
        };
        try {
          const imagesMap: Record<string, string> = {};
          await Promise.all(
            prompts.map((prompt, i) =>
              generateAdImage({
                prompt,
                productImageBase64: productBase64,
              }).then((r) => {
                const index = i + 1;
                imagesMap[String(index)] = r.dataUrl;
                send({ type: "image", index, dataUrl: r.dataUrl });
                return r;
              }),
            ),
          );

          const supabaseForUpload = admin ?? supabase;
          const uploaded = await uploadImagesMapToStorage(
            imagesMap,
            supabaseForUpload,
          );

          let productImageUrl: string | null =
            productImage && productImage.startsWith("http")
              ? productImage
              : null;
          if (
            productImage &&
            productImage.startsWith("data:") &&
            supabaseForUpload
          ) {
            const productUploaded = await uploadImageToStorage(
              "product",
              productImage,
              supabaseForUpload,
            );
            if (productUploaded) productImageUrl = productUploaded;
          }

          const objective = JSON.stringify({
            prompts,
            productImageUrl,
          } as { prompts: typeof prompts; productImageUrl: string | null });

          const { data: funnel, error } = await supabase
            .from("funnels")
            .insert({
              agent_slug: "ad-image-generation",
              name,
              objective,
              template_id: null,
              latest_html: "",
              latest_css: "",
              latest_images: uploaded,
            })
            .select()
            .single();

          if (error) {
            send({ type: "error", error: error.message });
            controller.close();
            return;
          }

          const latestImages: Record<string, string> = { ...uploaded };
          for (const key of ["1", "2", "3", "4", "5"]) {
            if (!latestImages[key] && imagesMap[key]) {
              latestImages[key] = imagesMap[key];
            }
          }
          send({
            type: "done",
            funnel: { ...funnel, latest_images: latestImages },
          });
        } catch (err) {
          send({
            type: "error",
            error: err instanceof Error ? err.message : "Generation failed.",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
      },
    });
  }

  try {
    const results = await Promise.all(
      prompts.map((prompt, i) =>
        generateAdImage({
          prompt,
          productImageBase64: productBase64,
        }).then((r) => ({ index: i + 1, ...r })),
      ),
    );

    const imagesMap: Record<string, string> = {};
    for (const r of results) {
      imagesMap[String(r.index)] = r.dataUrl;
    }

    const supabaseForUpload = admin ?? supabase;
    const uploaded = await uploadImagesMapToStorage(
      imagesMap,
      supabaseForUpload,
    );

    let productImageUrl: string | null =
      productImage && productImage.startsWith("http") ? productImage : null;
    if (productImage && productImage.startsWith("data:") && supabaseForUpload) {
      const productUploaded = await uploadImageToStorage(
        "product",
        productImage,
        supabaseForUpload,
      );
      if (productUploaded) productImageUrl = productUploaded;
    }

    const objective = JSON.stringify({
      prompts,
      productImageUrl,
    } as { prompts: typeof prompts; productImageUrl: string | null });

    const { data: funnel, error } = await supabase
      .from("funnels")
      .insert({
        agent_slug: "ad-image-generation",
        name,
        objective,
        template_id: null,
        latest_html: "",
        latest_css: "",
        latest_images: uploaded,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message ?? "Failed to save project." },
        { status: 500 },
      );
    }

    const latestImages: Record<string, string> = { ...uploaded };
    for (const r of results) {
      const key = String(r.index);
      if (!latestImages[key]) latestImages[key] = r.dataUrl;
    }

    return NextResponse.json({
      funnel: { ...funnel, latest_images: latestImages },
    });
  } catch (err) {
    console.error("[ad-image-generation] generate error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed." },
      { status: 500 },
    );
  }
}
