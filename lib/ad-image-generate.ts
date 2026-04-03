/**
 * Generates a single ad image from a user prompt.
 * Uses the same image model and style directive as funnel images for consistency.
 *
 * IMPORTANT: `generateImage` from the AI SDK expects multimodal input as
 * `{ images: DataContent[], text?: string }` — NOT an array of parts. Using the
 * wrong shape caused reference images to be dropped and fallbacks to text-only
 * generation (wrong product in output).
 */
import { generateImage } from "ai";

import { IMAGE_MODEL_STYLE_DIRECTIVE } from "@/lib/image-generation-guideline";
import { getImageModel } from "@/lib/image-model";
import type { AdImageAspectRatio } from "@/lib/ad-image-keys";

export interface GenerateAdImageOptions {
  prompt: string;
  /** Optional product reference image (base64 data URL) to incorporate into the scene. */
  productImageBase64?: string | null;
  /** Output aspect ratio; defaults to 16:9. */
  aspectRatio?: AdImageAspectRatio;
}

/** System context: these are AD images for real advertising, must be hyper-realistic. */
const AD_IMAGE_CONTEXT = `IMPORTANT: These images are ADVERTISEMENT IMAGES that will be used to advertise products to real people. They must be hyper-realistic and indistinguishable from professional product photography. Real customers will see these—quality and authenticity are critical.`;

/**
 * Non-negotiable rules when a product reference image is supplied.
 * The model receives that image as structured input; these instructions lock behavior.
 */
const STRICT_PRODUCT_REFERENCE_SYSTEM = `# MANDATORY PRODUCT REFERENCE (NON-NEGOTIABLE)

You are given ONE reference IMAGE of the real product (attached as input). That image is the ONLY source of truth for how the product must look in your output.

## Absolute rule
- Reproduce the product from the reference image with MAXIMUM visual fidelity. The object the person holds (or that appears on the table/shelf) MUST be the same physical product: not a different tub, jar, bottle, sachet, or brand design.
- Supplements (creatine, protein, vitamins), cosmetics, and OTC items: match container shape, lid color, label layout, logo position, and every visible graphic element from the reference.
- You are NOT allowed to substitute a “similar” or generic product. No stock bottles, no invented labels, no simplified artwork.

## Pixel- and design-level fidelity
- Match silhouette, proportions, height-to-width ratio, and perspective (allow natural hand rotation only).
- Match colors, gradients, foil/holographic effects, and matte vs gloss finish.
- Match typography, logo, brand name, flavor/variant text, icons, and regulatory marks as shown on the reference.
- For tubs and wide jars: match the exact lid style (screw cap, flip cap, color) and any embossing or ridges.

## People-in-scene (e.g. fitness, testimonials, “happy customer”)
- If the brief describes a person holding the product, composite that EXACT pack design into their hands. The held object must be recognizable as the same SKU as the reference—not a different colorway or competitor lookalike.
- Multiple subjects: every visible instance of the product must match the same reference.

## Strict prohibitions
- No generic placeholders, no “approximate” branding, no swapping to a different product category.
- Do not redraw the label as illegible blur when the reference shows readable text—preserve legibility and layout.

## Failure mode
If the output product could be mistaken for a different brand or SKU than the reference image, the generation has failed.`;

const PRODUCT_INPUT_PREAMBLE = `The image file supplied alongside this text is the AUTHORITATIVE product photograph. Build the entire scene around faithfully reproducing that exact packaging in the final render.`;

const PRODUCT_FIDELITY_CLOSING = `Execute the marketing scene in the instructions below. The product in the final image must be visually indistinguishable in branding and packaging from the attached reference image.`;

function buildAdImagePrompt(userPrompt: string): string {
  return `${AD_IMAGE_CONTEXT}\n\n${userPrompt.trim()}\n\n${IMAGE_MODEL_STYLE_DIRECTIVE}`;
}

function buildPromptWithProductReference(userPrompt: string): string {
  const body = buildAdImagePrompt(userPrompt);
  return `${PRODUCT_INPUT_PREAMBLE}\n\n${STRICT_PRODUCT_REFERENCE_SYSTEM}\n\n---\n\n${body}\n\n---\n\n${PRODUCT_FIDELITY_CLOSING}`;
}

/**
 * Generates one ad-ready image. When productImageBase64 is provided, the model
 * receives it via the SDK's structured `images` + `text` prompt (required for
 * reference conditioning). Does not fall back to text-only when a reference
 * was supplied—caller should handle errors.
 */
export async function generateAdImage(
  options: GenerateAdImageOptions,
): Promise<{ dataUrl: string; mediaType: string }> {
  const { prompt, productImageBase64, aspectRatio = "16:9" } = options;
  const imageModel = getImageModel();
  const fullPrompt = buildAdImagePrompt(prompt);

  if (productImageBase64 && productImageBase64.startsWith("data:")) {
    const textWithStrictProductRules = buildPromptWithProductReference(prompt);
    try {
      const imageResult = await generateImage({
        model: imageModel,
        prompt: {
          images: [productImageBase64],
          text: textWithStrictProductRules,
        },
        aspectRatio,
        maxRetries: 2,
      });
      const mediaType = imageResult.image.mediaType ?? "image/png";
      return {
        dataUrl: `data:${mediaType};base64,${imageResult.image.base64}`,
        mediaType,
      };
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Unknown image generation error";
      throw new Error(
        `Product-reference image generation failed (${msg}). Check your API keys (Google image models work best with a product reference). No fallback was used to avoid showing the wrong product.`,
      );
    }
  }

  const imageResult = await generateImage({
    model: imageModel,
    prompt: fullPrompt,
    aspectRatio,
    maxRetries: 2,
  });
  const mediaType = imageResult.image.mediaType ?? "image/png";
  return {
    dataUrl: `data:${mediaType};base64,${imageResult.image.base64}`,
    mediaType,
  };
}
