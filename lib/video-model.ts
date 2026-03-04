/**
 * Returns a video model for GIF/animation generation.
 * Prefers direct Google Veo API when GOOGLE_GENERATIVE_AI_API_KEY or GOOGLE_VEO_API_KEY is set.
 * Falls back to AI Gateway when neither is set.
 */
import { experimental_generateVideo } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { getGateway } from "@/lib/ai-gateway";

type VideoModel = Parameters<typeof experimental_generateVideo>[0]["model"];

let _googleVideoModel: VideoModel | null = null;

function getGoogleVideoModel(): VideoModel | null {
  const apiKey =
    process.env.GOOGLE_VEO_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) return null;
  if (_googleVideoModel) return _googleVideoModel;
  const google = createGoogleGenerativeAI({ apiKey });
  // Prefer Veo 3.1 when available; fallback to 3.0 for compatibility
  _googleVideoModel = google.video("veo-3.1-fast-generate-preview");
  return _googleVideoModel;
}

/**
 * Returns a video model for funnel GIF generation.
 * Uses direct Google Veo API when GOOGLE_VEO_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY is set.
 * Otherwise uses AI Gateway (requires AI_GATEWAY_API_KEY and Pro/Enterprise for video).
 */
export function getVideoModel(): VideoModel | undefined {
  const googleModel = getGoogleVideoModel();
  if (googleModel) return googleModel;
  try {
    const gateway = getGateway();
    return gateway.video("google/veo-3.1-fast-generate-001");
  } catch {
    return undefined;
  }
}
