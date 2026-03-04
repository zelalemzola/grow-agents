/**
 * Returns an image model for funnel media generation.
 * Prefers direct Google API (Gemini 3 Pro Image / Nano Banana Pro) when
 * GOOGLE_GENERATIVE_AI_API_KEY or GOOGLE_VEO_API_KEY is set.
 * Falls back to AI Gateway when neither is set.
 */
import type { ImageModel } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { getGateway } from "@/lib/ai-gateway";

let _googleImageModel: ImageModel | null = null;

function getGoogleImageModel(): ImageModel | null {
  const apiKey =
    process.env.GOOGLE_VEO_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) return null;
  if (_googleImageModel) return _googleImageModel;
  const google = createGoogleGenerativeAI({ apiKey });
  _googleImageModel = google.image("gemini-3-pro-image-preview");
  return _googleImageModel;
}

/**
 * Returns an image model for funnel image generation.
 * Uses Gemini 3 Pro Image (Nano Banana Pro) when Google key is set for more realistic output.
 * Otherwise uses AI Gateway.
 */
export function getImageModel(): ImageModel {
  const googleModel = getGoogleImageModel();
  if (googleModel) return googleModel;
  const gateway = getGateway();
  return gateway.image("google/imagen-4.0-fast-generate-001");
}
