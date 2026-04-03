/**
 * Generates a single ad image from a user prompt.
 * Uses the same image model and style directive as funnel images for consistency.
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
 * Treated as strict “system-style” policy text in the generation prompt.
 */
const STRICT_PRODUCT_REFERENCE_SYSTEM = `# MANDATORY PRODUCT REFERENCE (NON-NEGOTIABLE)

You are given a REFERENCE IMAGE of the real product. That reference defines the ONLY acceptable product in the output.

## Absolute rule
- The product visible in your generated image MUST be the SAME product as in the reference image—not a similar bottle, not a generic shampoo, not a different label or brand.
- You are NOT allowed to invent, swap, or approximate the product. If the user’s scene describes people holding the product (e.g. happy customers, testimonials, “results” shots), the item in their hands MUST still be this exact product, reproduced faithfully.

## Visual fidelity (must match the reference)
- Packaging shape, size, proportions, material finish (matte/gloss), cap or pump, and silhouette.
- All colors, gradients, and print areas on the pack.
- Typography, logo, brand name, claims, icons, barcodes, and any visible text—legible where the reference shows them.
- For tubes, jars, bottles, or cartons: same form factor and orientation of graphics as the reference unless the brief explicitly requires a natural rotation in hand.

## Common ad scenarios (same rule applies)
- Hair care, skincare, supplements, or any CPG: if the brief shows people smiling, before/after contexts, or “holding the product,” the held object is STILL this exact SKU from the reference—never a stand-in.
- Multiple people or multiple hands: each product instance must match the reference; do not vary the design between subjects.

## Strict prohibitions
- No generic “lookalike” products, no stock placeholder bottles, no simplified or cartoon packs when a reference was provided.
- Do not change brand identity, colorway, or pack artwork to “fit the scene.”

## Success criterion
A viewer comparing the ad to the reference product photo would recognize it as the same item immediately. Failure to match the reference product is a failure of the task.`;

const PRODUCT_FIDELITY_CLOSING = `Execute the scene described in the instructions above while obeying every rule in the MANDATORY PRODUCT REFERENCE section. The reference image is the ground truth for the product only; render that product exactly in the final image.`;

function buildAdImagePrompt(userPrompt: string): string {
  return `${AD_IMAGE_CONTEXT}\n\n${userPrompt.trim()}\n\n${IMAGE_MODEL_STYLE_DIRECTIVE}`;
}

function buildPromptWithProductReference(userPrompt: string): string {
  const body = buildAdImagePrompt(userPrompt);
  return `${STRICT_PRODUCT_REFERENCE_SYSTEM}\n\n---\n\n${body}\n\n---\n\n${PRODUCT_FIDELITY_CLOSING}`;
}

/**
 * Generates one ad-ready image. When productImageBase64 is provided, the model
 * is asked to incorporate the product from the reference image into the scene.
 */
export async function generateAdImage(
  options: GenerateAdImageOptions,
): Promise<{ dataUrl: string; mediaType: string }> {
  const { prompt, productImageBase64, aspectRatio = "16:9" } = options;
  const imageModel = getImageModel();
  const fullPrompt = buildAdImagePrompt(prompt);

  if (productImageBase64 && productImageBase64.startsWith("data:")) {
    try {
      const textWithStrictProductRules = buildPromptWithProductReference(prompt);
      const imageResult = await generateImage({
        model: imageModel,
        prompt: [
          { type: "image" as const, image: productImageBase64 },
          {
            type: "text" as const,
            text: textWithStrictProductRules,
          },
        ] as unknown as string,
        aspectRatio,
      });
      const mediaType = imageResult.image.mediaType ?? "image/png";
      return {
        dataUrl: `data:${mediaType};base64,${imageResult.image.base64}`,
        mediaType,
      };
    } catch (err) {
      console.warn(
        "[ad-image-generate] Product reference failed, falling back to text-only:",
        err,
      );
    }
  }

  const imageResult = await generateImage({
    model: imageModel,
    prompt: fullPrompt,
    aspectRatio,
  });
  const mediaType = imageResult.image.mediaType ?? "image/png";
  return {
    dataUrl: `data:${mediaType};base64,${imageResult.image.base64}`,
    mediaType,
  };
}
