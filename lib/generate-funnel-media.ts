import { generateImage } from "ai";

import { buildImageModelPrompt } from "@/lib/image-prompt-builder";
import type { ImageModel } from "ai";

export interface GenerateFunnelMediaOptions {
  prompt: string;
  preferGif?: boolean;
  imageModel: ImageModel;
}

/**
 * Generates funnel section media (image). When preferGif is true per image guideline
 * (mechanism, process, transformation), the prompt is enhanced with motion-suggesting
 * language for dynamic compositions. Actual GIF/video generation requires
 * experimental_generateVideo (AI SDK) when available.
 */
export async function generateFunnelMedia(
  options: GenerateFunnelMediaOptions,
): Promise<{ dataUrl: string; mediaType: string }> {
  const { prompt, preferGif, imageModel } = options;
  const imagePrompt = buildImageModelPrompt(prompt, preferGif);

  const imageResult = await generateImage({
    model: imageModel,
    prompt: imagePrompt,
    aspectRatio: "16:9",
  });

  const mediaType = imageResult.image.mediaType ?? "image/png";
  return {
    dataUrl: `data:${mediaType};base64,${imageResult.image.base64}`,
    mediaType,
  };
}
