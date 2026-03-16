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

function buildAdImagePrompt(userPrompt: string): string {
  return `${userPrompt.trim()}\n\n${IMAGE_MODEL_STYLE_DIRECTIVE}`;
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
            text: `${fullPrompt}\n\nIncorporate the product from the reference image into this scene. Match the product's appearance exactly.`,
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
