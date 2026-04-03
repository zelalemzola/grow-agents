import { NextResponse } from "next/server";
import { z } from "zod";

import { generateAdImage } from "@/lib/ad-image-generate";
import {
  formatAdImageKey,
  stripAllAdImageSlotKeys,
  stripKeysForPrompt,
  type AdImageAspectRatio,
} from "@/lib/ad-image-keys";
import {
  uploadImageToStorage,
  uploadImagesMapToStorage,
} from "@/lib/funnel-image-storage";
import type { AdImageObjective, AdImagePromptSettings } from "@/lib/types";
import {
  createServerSupabaseClient,
  createSupabaseAdminClient,
} from "@/utils/supabase/server";

export const maxDuration = 120;

const aspectRatioSchema = z.enum(["3:4", "16:9", "1:1"]);

const promptSettingsItemSchema = z.object({
  count: z.number().int().min(1).max(5),
  aspectRatio: aspectRatioSchema,
});

const slotSchema = z.object({
  promptIndex: z.number().int().min(0).max(4),
  count: z.number().int().min(1).max(5),
  aspectRatio: aspectRatioSchema,
});

const promptsTupleLegacy = z.tuple([
  z.string().min(1),
  z.string().min(1),
  z.string().min(1),
  z.string().min(1),
  z.string().min(1),
]);

const promptsTupleFlexible = z.tuple([
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
]);

const promptSettingsTupleSchema = z
  .tuple([
    z.union([promptSettingsItemSchema, z.null()]),
    z.union([promptSettingsItemSchema, z.null()]),
    z.union([promptSettingsItemSchema, z.null()]),
    z.union([promptSettingsItemSchema, z.null()]),
    z.union([promptSettingsItemSchema, z.null()]),
  ])
  .optional();

const nullableStr = z.union([z.string(), z.null()]);

const productImagesTupleSchema = z.tuple([
  nullableStr,
  nullableStr,
  nullableStr,
  nullableStr,
  nullableStr,
]);

const generateSchema = z.object({
  name: z.string().min(1).max(200),
  prompts: z.union([promptsTupleLegacy, promptsTupleFlexible]),
  /** @deprecated Use productImages; kept for API compatibility. */
  productImage: z.string().optional(),
  /** Per-prompt product reference (data URL, https URL, or null). Index 0–4. */
  productImages: productImagesTupleSchema.optional(),
  stream: z.boolean().optional(),
  slot: slotSchema.optional(),
  funnelId: z.string().uuid().optional(),
  promptSettings: promptSettingsTupleSchema,
});

type ProductUrlsTuple = [
  string | null,
  string | null,
  string | null,
  string | null,
  string | null,
];

const EMPTY_PRODUCT_URLS: ProductUrlsTuple = [null, null, null, null, null];

function parseProductUrlsFromObjective(objectiveJson: unknown): ProductUrlsTuple {
  if (typeof objectiveJson !== "string") return [...EMPTY_PRODUCT_URLS];
  try {
    const o = JSON.parse(objectiveJson) as AdImageObjective;
    const u = o.productImageUrls;
    if (Array.isArray(u) && u.length === 5) {
      return u.map((x) => (typeof x === "string" ? x : null)) as ProductUrlsTuple;
    }
    const legacy = o.productImageUrl;
    if (typeof legacy === "string" && legacy.startsWith("http")) {
      return [legacy, legacy, legacy, legacy, legacy];
    }
  } catch {
    // ignore
  }
  return [...EMPTY_PRODUCT_URLS];
}

function pickProductRaw(
  index: number,
  productImages: z.infer<typeof productImagesTupleSchema> | undefined,
  legacySingle: string | undefined,
): string | null {
  if (productImages !== undefined) {
    const v = productImages[index];
    if (v === null || v === undefined || v === "") return null;
    return v;
  }
  if (legacySingle && legacySingle.length > 0) return legacySingle;
  return null;
}

async function rawToBase64ForGeneration(
  raw: string | null,
): Promise<string | undefined> {
  if (!raw) return undefined;
  if (raw.startsWith("data:")) return raw;
  if (raw.startsWith("http")) {
    try {
      const res = await fetch(raw);
      const buf = await res.arrayBuffer();
      const b64 = Buffer.from(buf).toString("base64");
      const contentType = res.headers.get("content-type") ?? "image/png";
      return `data:${contentType};base64,${b64}`;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

async function resolveStoredUrlForRow(
  raw: string | null,
  rowIndex: number,
  supabaseForUpload: ReturnType<typeof createSupabaseAdminClient> | Awaited<
    ReturnType<typeof createServerSupabaseClient>
  >,
): Promise<string | null> {
  if (!raw) return null;
  if (raw.startsWith("http")) return raw;
  if (raw.startsWith("data:") && supabaseForUpload) {
    const uploaded = await uploadImageToStorage(
      `product-${rowIndex + 1}`,
      raw,
      supabaseForUpload,
    );
    return uploaded ?? raw;
  }
  return null;
}

function buildObjective(params: {
  prompts: [string, string, string, string, string];
  productImageUrls: ProductUrlsTuple;
  promptSettings?: AdImageObjective["promptSettings"];
}): string {
  const firstUrl =
    params.productImageUrls.find((u) => u && u.startsWith("http")) ?? null;
  const obj: AdImageObjective = {
    prompts: params.prompts,
    productImageUrl: firstUrl,
    productImageUrls: params.productImageUrls,
  };
  if (params.promptSettings) obj.promptSettings = params.promptSettings;
  return JSON.stringify(obj);
}

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

  const {
    name,
    prompts,
    productImage,
    productImages,
    stream: useStream,
    slot,
    funnelId,
    promptSettings,
  } = parsed.data;

  if (slot) {
    const p = prompts[slot.promptIndex]?.trim() ?? "";
    if (p.length < 3) {
      return NextResponse.json(
        { error: "Prompt for this row must be at least 3 characters." },
        { status: 400 },
      );
    }
  } else {
    const invalid = prompts.some((x) => x.trim().length < 1);
    if (invalid) {
      return NextResponse.json(
        { error: "All five prompts are required for full generation." },
        { status: 400 },
      );
    }
  }

  const supabase = await createServerSupabaseClient();
  const admin = createSupabaseAdminClient();
  const supabaseForUpload = admin ?? supabase;

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
          const promptsFixed = prompts.map((x) => x) as [
            string,
            string,
            string,
            string,
            string,
          ];

          let mergedPromptSettings: AdImageObjective["promptSettings"] =
            promptSettings;
          if (slot) {
            const row: (AdImagePromptSettings | null)[] = mergedPromptSettings
              ? [...mergedPromptSettings]
              : [null, null, null, null, null];
            row[slot.promptIndex] = {
              count: slot.count,
              aspectRatio: slot.aspectRatio,
            };
            mergedPromptSettings = row as AdImageObjective["promptSettings"];
          }

          let imagesMap: Record<string, string> = {};
          let baseImages: Record<string, string> = {};
          let existingProductUrls: ProductUrlsTuple = [...EMPTY_PRODUCT_URLS];

          if (funnelId) {
            const { data: existing, error: fetchErr } = await supabase
              .from("funnels")
              .select("latest_images, objective")
              .eq("id", funnelId)
              .eq("agent_slug", "ad-image-generation")
              .single();
            if (fetchErr || !existing) {
              send({ type: "error", error: "Project not found." });
              controller.close();
              return;
            }
            baseImages = (existing.latest_images ?? {}) as Record<
              string,
              string
            >;
            existingProductUrls = parseProductUrlsFromObjective(
              existing.objective,
            );
          }

          let mergedProductUrls: ProductUrlsTuple = [...existingProductUrls];

          if (slot) {
            const promptNum = slot.promptIndex + 1;
            const cleared = stripKeysForPrompt(baseImages, promptNum);
            const aspectRatio = slot.aspectRatio as AdImageAspectRatio;
            const promptText = promptsFixed[slot.promptIndex].trim();
            const rawProd = pickProductRaw(
              slot.promptIndex,
              productImages,
              productImage,
            );
            const productBase64 = await rawToBase64ForGeneration(rawProd);
            const stored = await resolveStoredUrlForRow(
              rawProd,
              slot.promptIndex,
              supabaseForUpload,
            );
            mergedProductUrls = [...existingProductUrls];
            mergedProductUrls[slot.promptIndex] = stored;

            await Promise.all(
              Array.from({ length: slot.count }, (_, i) => i + 1).map(
                (variant) =>
                  generateAdImage({
                    prompt: promptText,
                    productImageBase64: productBase64,
                    aspectRatio,
                  }).then((r) => {
                    const key = formatAdImageKey(promptNum, variant);
                    imagesMap[key] = r.dataUrl;
                    send({
                      type: "image",
                      key,
                      index: promptNum,
                      variant,
                      dataUrl: r.dataUrl,
                    });
                    return r;
                  }),
              ),
            );

            imagesMap = { ...cleared, ...imagesMap };
          } else {
            mergedPromptSettings = [
              { count: 1, aspectRatio: "16:9" },
              { count: 1, aspectRatio: "16:9" },
              { count: 1, aspectRatio: "16:9" },
              { count: 1, aspectRatio: "16:9" },
              { count: 1, aspectRatio: "16:9" },
            ];
            mergedProductUrls = (await Promise.all(
              [0, 1, 2, 3, 4].map((i) =>
                resolveStoredUrlForRow(
                  pickProductRaw(i, productImages, productImage),
                  i,
                  supabaseForUpload,
                ),
              ),
            )) as ProductUrlsTuple;
            const aspectRatio = "16:9" as const;
            await Promise.all(
              promptsFixed.map(async (promptText, i) => {
                const b64 = await rawToBase64ForGeneration(
                  pickProductRaw(i, productImages, productImage),
                );
                return generateAdImage({
                  prompt: promptText.trim(),
                  productImageBase64: b64,
                  aspectRatio,
                }).then((r) => {
                  const index = i + 1;
                  const key = formatAdImageKey(index, 1);
                  imagesMap[key] = r.dataUrl;
                  send({
                    type: "image",
                    key,
                    index,
                    variant: 1,
                    dataUrl: r.dataUrl,
                  });
                  return r;
                });
              }),
            );
          }

          const uploaded = await uploadImagesMapToStorage(
            imagesMap,
            supabaseForUpload,
          );

          const objective = buildObjective({
            prompts: promptsFixed,
            productImageUrls: mergedProductUrls,
            promptSettings: mergedPromptSettings,
          });

          if (funnelId) {
            const mergedLatest = slot
              ? {
                  ...stripKeysForPrompt(
                    baseImages,
                    slot.promptIndex + 1,
                  ),
                  ...uploaded,
                }
              : { ...stripAllAdImageSlotKeys(baseImages), ...uploaded };
            const { data: funnel, error } = await supabase
              .from("funnels")
              .update({
                name,
                objective,
                latest_images: mergedLatest,
                updated_at: new Date().toISOString(),
              })
              .eq("id", funnelId)
              .eq("agent_slug", "ad-image-generation")
              .select()
              .single();

            if (error) {
              send({ type: "error", error: error.message });
              controller.close();
              return;
            }

            send({
              type: "done",
              funnel: { ...funnel, latest_images: mergedLatest },
            });
          } else {
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
            for (const k of Object.keys(imagesMap)) {
              if (!latestImages[k] && imagesMap[k]) latestImages[k] = imagesMap[k];
            }
            send({
              type: "done",
              funnel: { ...funnel, latest_images: latestImages },
            });
          }
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
    const promptsFixed = prompts.map((x) => x) as [
      string,
      string,
      string,
      string,
      string,
    ];

    let imagesMap: Record<string, string> = {};
    let baseImages: Record<string, string> = {};
    let existingProductUrls: ProductUrlsTuple = [...EMPTY_PRODUCT_URLS];
    let mergedPromptSettings: AdImageObjective["promptSettings"] =
      promptSettings;
    let mergedProductUrls: ProductUrlsTuple = [...existingProductUrls];

    if (funnelId) {
      const { data: existing, error: fetchErr } = await supabase
        .from("funnels")
        .select("latest_images, objective")
        .eq("id", funnelId)
        .eq("agent_slug", "ad-image-generation")
        .single();
      if (fetchErr || !existing) {
        return NextResponse.json(
          { error: "Project not found." },
          { status: 404 },
        );
      }
      baseImages = (existing.latest_images ?? {}) as Record<string, string>;
      existingProductUrls = parseProductUrlsFromObjective(existing.objective);
    }

    mergedProductUrls = [...existingProductUrls];

    if (slot) {
      const promptNum = slot.promptIndex + 1;
      baseImages = stripKeysForPrompt(baseImages, promptNum);
      const aspectRatio = slot.aspectRatio as AdImageAspectRatio;
      const promptText = promptsFixed[slot.promptIndex].trim();
      const rawProd = pickProductRaw(
        slot.promptIndex,
        productImages,
        productImage,
      );
      const productBase64 = await rawToBase64ForGeneration(rawProd);
      const stored = await resolveStoredUrlForRow(
        rawProd,
        slot.promptIndex,
        supabaseForUpload,
      );
      mergedProductUrls = [...existingProductUrls];
      mergedProductUrls[slot.promptIndex] = stored;

      const results = await Promise.all(
        Array.from({ length: slot.count }, (_, i) => i + 1).map((variant) =>
          generateAdImage({
            prompt: promptText,
            productImageBase64: productBase64,
            aspectRatio,
          }).then((r) => ({ key: formatAdImageKey(promptNum, variant), ...r })),
        ),
      );
      for (const r of results) {
        imagesMap[r.key] = r.dataUrl;
      }
      {
        const row: (AdImagePromptSettings | null)[] = mergedPromptSettings
          ? [...mergedPromptSettings]
          : [null, null, null, null, null];
        row[slot.promptIndex] = {
          count: slot.count,
          aspectRatio: slot.aspectRatio,
        };
        mergedPromptSettings = row as AdImageObjective["promptSettings"];
      }
    } else {
      mergedProductUrls = (await Promise.all(
        [0, 1, 2, 3, 4].map((i) =>
          resolveStoredUrlForRow(
            pickProductRaw(i, productImages, productImage),
            i,
            supabaseForUpload,
          ),
        ),
      )) as ProductUrlsTuple;
      const results = await Promise.all(
        promptsFixed.map(async (promptText, i) => {
          const b64 = await rawToBase64ForGeneration(
            pickProductRaw(i, productImages, productImage),
          );
          return generateAdImage({
            prompt: promptText.trim(),
            productImageBase64: b64,
            aspectRatio: "16:9",
          }).then((r) => ({
            key: formatAdImageKey(i + 1, 1),
            dataUrl: r.dataUrl,
          }));
        }),
      );
      for (const r of results) {
        imagesMap[r.key] = r.dataUrl;
      }
      mergedPromptSettings = [
        { count: 1, aspectRatio: "16:9" },
        { count: 1, aspectRatio: "16:9" },
        { count: 1, aspectRatio: "16:9" },
        { count: 1, aspectRatio: "16:9" },
        { count: 1, aspectRatio: "16:9" },
      ];
    }

    const uploaded = await uploadImagesMapToStorage(
      imagesMap,
      supabaseForUpload,
    );

    const objective = buildObjective({
      prompts: promptsFixed,
      productImageUrls: mergedProductUrls,
      promptSettings: mergedPromptSettings,
    });

    const mergedLatest = slot
      ? {
          ...stripKeysForPrompt(baseImages, slot.promptIndex + 1),
          ...uploaded,
        }
      : { ...stripAllAdImageSlotKeys(baseImages), ...uploaded };

    if (funnelId) {
      const { data: funnel, error } = await supabase
        .from("funnels")
        .update({
          name,
          objective,
          latest_images: mergedLatest,
          updated_at: new Date().toISOString(),
        })
        .eq("id", funnelId)
        .eq("agent_slug", "ad-image-generation")
        .select()
        .single();

      if (error) {
        return NextResponse.json(
          { error: error.message ?? "Failed to save project." },
          { status: 500 },
        );
      }

      return NextResponse.json({
        funnel: { ...funnel, latest_images: mergedLatest },
      });
    }

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
    for (const k of Object.keys(imagesMap)) {
      if (!latestImages[k] && imagesMap[k]) latestImages[k] = imagesMap[k];
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
