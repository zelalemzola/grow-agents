/**
 * Uploads funnel images to Supabase Storage instead of storing base64 in the database.
 * This avoids DB statement timeouts when writing large JSONB with embedded images.
 *
 * Requires: Create a bucket "funnel-images" in Supabase Storage with public read access.
 * Dashboard: Storage > New bucket > "funnel-images" > Public bucket.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "funnel-images";

/**
 * Uploads a base64 data URL to Supabase Storage and returns the public URL.
 * Returns null on failure - caller should use a fallback URL to avoid writing base64 to DB.
 */
export async function uploadImageToStorage(
  sectionId: string,
  dataUrl: string,
  supabase: SupabaseClient,
): Promise<string | null> {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return dataUrl;

  const mimeType = match[1];
  const base64 = match[2];
  const ext =
    mimeType === "image/gif"
      ? "gif"
      : mimeType.startsWith("video/")
        ? (mimeType.includes("webm") ? "webm" : "mp4")
        : "png";

  const buffer = Buffer.from(base64, "base64");
  const path = `${sectionId}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: mimeType,
    upsert: true,
  });

  if (error) {
    console.warn("[funnel-image-storage] Upload failed for", sectionId, error.message);
    return null;
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Converts an images map (sectionId -> dataUrl) to use Storage URLs instead of base64.
 * Preserves existing URLs as-is. When upload fails for base64, uses fallbackUrls[sectionId]
 * to avoid writing base64 to DB (which causes statement timeouts).
 */
export async function uploadImagesMapToStorage(
  images: Record<string, string>,
  supabase: SupabaseClient,
  fallbackUrls?: Record<string, string>,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const entries = Object.entries(images);

  await Promise.all(
    entries.map(async ([sectionId, value]) => {
      if (value.startsWith("http://") || value.startsWith("https://")) {
        result[sectionId] = value;
        return;
      }
      const uploaded = await uploadImageToStorage(sectionId, value, supabase);
      if (uploaded) {
        result[sectionId] = uploaded;
      } else if (fallbackUrls?.[sectionId]?.startsWith("http")) {
        result[sectionId] = fallbackUrls[sectionId];
      }
      // else: omit - never write base64 to DB
    }),
  );

  return result;
}
