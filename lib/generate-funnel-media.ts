import { experimental_generateVideo, generateImage } from "ai";

import { ANIMATION_STYLE_DIRECTIVE } from "@/lib/image-generation-guideline";
import { getGifGenerationGuideline } from "@/lib/gif-generation-guideline";
import { buildImageModelPrompt } from "@/lib/image-prompt-builder";
import type { ImageModel } from "ai";

type VideoModel = Parameters<typeof experimental_generateVideo>[0]["model"];

export interface GenerateFunnelMediaOptions {
  prompt: string;
  preferGif?: boolean;
  imageModel: ImageModel;
  videoModel?: VideoModel;
  /** Optional section ID for logging/feedback when video falls back to image. */
  sectionId?: string;
  /** Called when video generation was attempted but failed (we fall back to image). */
  onVideoFallback?: (sectionId: string, err: unknown) => void;
  /** Optional product reference image (base64) for product sections. Applied only for static images, not GIF/video. */
  productImageBase64?: string;
  /** Scene type for product sections—adds targeted style hints (before_after, doctor_recommendation, etc.). */
  sceneType?: string;
}

/**
 * Generates funnel section media. When preferGif is true (per image guideline:
 * mechanism, process, transformation), uses video generation for actual motion.
 * Otherwise generates a static image.
 */
export async function generateFunnelMedia(
  options: GenerateFunnelMediaOptions,
): Promise<{ dataUrl: string; mediaType: string }> {
  const {
    prompt,
    preferGif,
    imageModel,
    videoModel,
    sectionId = "",
    onVideoFallback,
    productImageBase64,
    sceneType,
  } = options;
  const imagePrompt = buildImageModelPrompt(prompt, preferGif, sceneType);

  // Product reference only for static images (video/GIF models may not support it)
  const useProductReference =
    Boolean(productImageBase64) && !preferGif;

  if (preferGif && videoModel) {
    try {
      const gifGuideline = getGifGenerationGuideline();
      const videoPrompt = `${imagePrompt} ${ANIMATION_STYLE_DIRECTIVE}\n\nHyperrealistic, photorealistic animation—must look like real footage, not CGI. GIF rules (follow precisely):\n${gifGuideline.slice(0, 3000)}`;
      const videoResult = await experimental_generateVideo({
        model: videoModel,
        prompt: videoPrompt,
        aspectRatio: "16:9",
        duration: 4,
      });
      const vid = videoResult.video;
      if (vid) {
        const mediaType = vid.mediaType ?? "video/mp4";
        return {
          dataUrl: `data:${mediaType};base64,${vid.base64}`,
          mediaType,
        };
      }
    } catch (err) {
      console.warn("[generate-funnel-media] Video generation failed, falling back to image:", err);
      onVideoFallback?.(sectionId, err);
    }
  }

  let imageResult;
  if (useProductReference && productImageBase64) {
    try {
      imageResult = await generateImage({
        model: imageModel,
        prompt: [
          { type: "image" as const, image: productImageBase64 },
          {
            type: "text" as const,
            text: `${imagePrompt}\n\nIncorporate the product from the reference image into this scene. Match the product's appearance exactly.`,
          },
        ] as unknown as string,
        aspectRatio: "16:9",
      });
    } catch (err) {
      console.warn(
        "[generate-funnel-media] Product reference image not supported, falling back to text-only:",
        err,
      );
      imageResult = await generateImage({
        model: imageModel,
        prompt: `${imagePrompt}\n\nThis section features the product. Show the product clearly in the scene, editorial and candid style.`,
        aspectRatio: "16:9",
      });
    }
  } else {
    imageResult = await generateImage({
      model: imageModel,
      prompt: imagePrompt,
      aspectRatio: "16:9",
    });
  }

  const mediaType = imageResult.image.mediaType ?? "image/png";
  return {
    dataUrl: `data:${mediaType};base64,${imageResult.image.base64}`,
    mediaType,
  };
}
