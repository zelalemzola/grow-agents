/**
 * Uploads funnel images to Supabase Storage instead of storing base64 in the database.
 * When uploads fail (missing service role, RLS, etc.), we optionally persist inline data URLs
 * so previews and `latest_images` still work (with per-image size limits).
 *
 * Requires for Storage: bucket (default `funnel-images`) with public read; uploads from the
 * server need `SUPABASE_SERVICE_ROLE_KEY` or Storage policies that allow the client in use.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

function getBucket(): string {
  const fromEnv = process.env.SUPABASE_FUNNEL_IMAGES_BUCKET?.trim();
  return fromEnv || "funnel-images";
}

/** ~1.1MB base64 per still image — keeps most AI PNG/JPEG under cap; tune if DB rejects large JSONB. */
const DEFAULT_MAX_INLINE_DATA_URL_CHARS = 1_500_000;

function isInlineableDataUrl(dataUrl: string, maxChars: number): boolean {
  if (!dataUrl.startsWith("data:") || !dataUrl.includes(";base64,")) return false;
  if (dataUrl.length > maxChars) return false;
  // Inline fallback is for still images; video/GIF blobs can exceed row limits
  if (dataUrl.startsWith("data:video/")) return false;
  return true;
}

/**
 * Uploads a base64 data URL to Supabase Storage and returns the public URL.
 * Returns null on failure.
 */
export async function uploadImageToStorage(
  sectionId: string,
  dataUrl: string,
  supabase: SupabaseClient,
): Promise<string | null> {
  const bucket = getBucket();
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return dataUrl;

  const mimeType = match[1];
  const base64 = match[2];
  const ext =
    mimeType === "image/gif"
      ? "gif"
      : mimeType.startsWith("video/")
        ? mimeType.includes("webm")
          ? "webm"
          : "mp4"
        : "png";

  const buffer = Buffer.from(base64, "base64");
  const path = `${sectionId}-${Date.now()}.${ext}`;

  let lastMessage = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await supabase.storage.from(bucket).upload(path, buffer, {
      contentType: mimeType,
      upsert: true,
    });
    if (!error) {
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      console.info(
        "[funnel-image-storage] Uploaded",
        sectionId,
        "→",
        bucket,
        "/",
        path,
      );
      return data.publicUrl;
    }
    lastMessage = error.message;
    if (attempt === 0) await new Promise((r) => setTimeout(r, 350));
  }

  console.warn(
    "[funnel-image-storage] Upload failed for",
    sectionId,
    "bucket=",
    bucket,
    lastMessage,
  );
  return null;
}

export type UploadImagesMapOptions = {
  /**
   * If true (default), when Storage upload fails, persist the data URL when under the size cap.
   * Set false to restore legacy "omit on failure" behavior.
   */
  inlineFallback?: boolean;
  maxInlineDataUrlChars?: number;
};

/**
 * Converts an images map (sectionId -> dataUrl) to use Storage URLs when possible.
 * Preserves existing http(s) URLs as-is.
 */
export async function uploadImagesMapToStorage(
  images: Record<string, string>,
  supabase: SupabaseClient,
  fallbackUrls?: Record<string, string>,
  options?: UploadImagesMapOptions,
): Promise<Record<string, string>> {
  const inlineFallback = options?.inlineFallback !== false;
  const maxInline = options?.maxInlineDataUrlChars ?? DEFAULT_MAX_INLINE_DATA_URL_CHARS;

  const result: Record<string, string> = {};
  const entries = Object.entries(images);
  let inlineCount = 0;
  let omittedCount = 0;

  await Promise.all(
    entries.map(async ([sectionId, value]) => {
      if (value.startsWith("http://") || value.startsWith("https://")) {
        result[sectionId] = value;
        return;
      }
      const uploaded = await uploadImageToStorage(sectionId, value, supabase);
      if (uploaded) {
        result[sectionId] = uploaded;
        return;
      }
      if (fallbackUrls?.[sectionId]?.startsWith("http")) {
        result[sectionId] = fallbackUrls[sectionId];
        return;
      }
      if (
        inlineFallback &&
        value.startsWith("data:") &&
        isInlineableDataUrl(value, maxInline)
      ) {
        result[sectionId] = value;
        inlineCount += 1;
        console.warn(
          "[funnel-image-storage] Inline fallback for",
          sectionId,
          `(${Math.round(value.length / 1024)}KB) — Storage upload failed.`,
        );
        return;
      }
      omittedCount += 1;
      console.warn(
        "[funnel-image-storage] Omitted",
        sectionId,
        "(upload failed; data URL too large for inline or not base64)",
      );
    }),
  );

  if (inlineCount > 0) {
    console.warn(
      `[funnel-image-storage] ${inlineCount} image(s) stored as inline data URLs. For bucket uploads and smaller DB rows, set SUPABASE_SERVICE_ROLE_KEY and ensure bucket "${getBucket()}" exists.`,
    );
  }
  if (omittedCount > 0) {
    console.warn(
      `[funnel-image-storage] ${omittedCount} image(s) had no URL — placeholders may show.`,
    );
  }

  return result;
}
