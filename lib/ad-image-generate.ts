/**
 * Generates a single ad image from a user prompt.
 * Uses the same image model and style directive as funnel images for consistency.
 */
import { generateImage } from "ai";

import { IMAGE_MODEL_STYLE_DIRECTIVE } from "@/lib/image-generation-guideline";
import { getImageModel } from "@/lib/image-model";

export interface GenerateAdImageOptions {
  prompt: string;
  /** Optional product reference image (base64 data URL) to incorporate into the scene. */
  productImageBase64?: string | null;
}

/** System context: these are AD images for real advertising, must be hyper-realistic. */
const AD_IMAGE_CONTEXT = `IMPORTANT: These images are ADVERTISEMENT IMAGES that will be used to advertise products to real people. They must be hyper-realistic and indistinguishable from professional product photography. Real customers will see these—quality and authenticity are critical.`;

const PRODUCT_FIDELITY_INSTRUCTION = `CRITICAL - PRODUCT MATCHING (when reference image is provided):
The reference image shows the EXACT product that must appear in the ad. You MUST:
- Show the product looking IDENTICAL to the reference: same shape, size, colors, packaging, label, and branding
- Do NOT substitute a generic or similar-looking product—replicate the reference product exactly
- If the scene shows a person holding the product, the product in their hands must look like the reference, not a random substitute
- Match proportions, texture, and visual details precisely. Real consumers will compare the ad to the actual product.`;

function buildAdImagePrompt(userPrompt: string): string {
  return `${AD_IMAGE_CONTEXT}\n\n${userPrompt.trim()}\n\n${IMAGE_MODEL_STYLE_DIRECTIVE}`;
}

/**
 * Generates one ad-ready image. When productImageBase64 is provided, the model
 * is asked to incorporate the product from the reference image into the scene.
 */
export async function generateAdImage(
  options: GenerateAdImageOptions,
): Promise<{ dataUrl: string; mediaType: string }> {
  const { prompt, productImageBase64 } = options;
  const imageModel = getImageModel();
  const fullPrompt = buildAdImagePrompt(prompt);

  if (productImageBase64 && productImageBase64.startsWith("data:")) {
    try {
      const imageResult = await generateImage({
        model: imageModel,
        prompt: [
          { type: "image" as const, image: productImageBase64 },
          {
            type: "text" as const,
            text: `${fullPrompt}\n\n${PRODUCT_FIDELITY_INSTRUCTION}\n\nPlace the product from the reference image into this scene. The product in your output must look EXACTLY like the one in the reference—same packaging, colors, shape, and branding. Do not show a generic substitute.`,
          },
        ] as unknown as string,
        aspectRatio: "16:9",
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
    aspectRatio: "16:9",
  });
  const mediaType = imageResult.image.mediaType ?? "image/png";
  return {
    dataUrl: `data:${mediaType};base64,${imageResult.image.base64}`,
    mediaType,
  };
}
