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
  /** Optional product reference images as full data URLs (`data:image/...;base64,...`). Applied only for static images, not GIF/video. */
  productImageDataUrls?: string[];
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
    productImageDataUrls,
    sceneType,
  } = options;
  const imagePrompt = buildImageModelPrompt(prompt, preferGif, sceneType);

  // Product reference only for static images (video/GIF models may not support it)
  const useProductReference =
    Boolean(productImageDataUrls && productImageDataUrls.length > 0) && !preferGif;

  if (preferGif && videoModel) {
    try {
      const gifGuideline = getGifGenerationGuideline();
      const videoPrompt = `${imagePrompt} ${ANIMATION_STYLE_DIRECTIVE}\n\nUltra-photorealistic animation—must look like real documentary or smartphone video. A normal person would not know it is AI-generated. 8K quality, natural motion, real-world lighting. No CGI, no artificial look, no plastic or uncanny feel. GIF rules (follow precisely):\n${gifGuideline.slice(0, 3000)}`;
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
  if (useProductReference && productImageDataUrls && productImageDataUrls.length > 0) {
    try {
      const refs = productImageDataUrls.slice(0, 3);
      const conditioningText = `${imagePrompt}

CRITICAL PRODUCT MATCHING: The user uploaded a reference product image. The product shown in the generated image MUST match the reference product EXACTLY: same packaging shape, label layout, colors, branding marks, cap/nozzle type, proportions, and material finish. Do NOT create a lookalike or alternate packaging. Do NOT change the label. Keep the product identical even when held in a person's hand or in a selfie.`;

      // AI SDK expects `{ images, text }` for reference conditioning (same as lib/ad-image-generate.ts).
      imageResult = await generateImage({
        model: imageModel,
        prompt: {
          images: refs,
          text: conditioningText,
        },
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
