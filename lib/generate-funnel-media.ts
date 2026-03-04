import { experimental_generateVideo, generateImage } from "ai";

import { ANIMATION_STYLE_DIRECTIVE } from "@/lib/image-generation-guideline";
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
}

/**
 * Generates funnel section media. When preferGif is true (per image guideline:
 * mechanism, process, transformation), uses video generation for actual motion.
 * Otherwise generates a static image.
 */
export async function generateFunnelMedia(
  options: GenerateFunnelMediaOptions,
): Promise<{ dataUrl: string; mediaType: string }> {
  const { prompt, preferGif, imageModel, videoModel, sectionId = "", onVideoFallback } = options;
  const imagePrompt = buildImageModelPrompt(prompt, preferGif);

  if (preferGif && videoModel) {
    try {
      const videoResult = await experimental_generateVideo({
        model: videoModel,
        prompt: `${imagePrompt} ${ANIMATION_STYLE_DIRECTIVE}`,
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
