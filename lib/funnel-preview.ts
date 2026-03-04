import { renderPreviewDocument } from "@/lib/copy-injection";

function isVideoUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith("data:video/")) return true;
  if (url.includes(".mp4") || url.includes(".webm")) return true;
  return false;
}

/**
 * Replaces {{image:sectionId}} placeholders. For video URLs, replaces the entire
 * <img src="{{image:...}}"> tag with a <video> element so playback works.
 */
export function injectImagesIntoHtml(
  html: string,
  images: Record<string, string> | null | undefined,
): string {
  if (!images) {
    return html;
  }

  return html.replace(
    /<img([^>]*?)src=["']\{\{image:([^}]+)\}\}["']([^>]*)>/gi,
    (_match, before, rawSectionId, after) => {
      const sectionId = String(rawSectionId).trim();
      const src = images[sectionId] ?? "";
      if (!src) return "";
      if (isVideoUrl(src)) {
        const safeSrc = src.replace(/"/g, "&quot;");
        return `<video src="${safeSrc}" autoplay loop muted playsinline style="width:100%;height:auto;object-fit:cover;"></video>`;
      }
      return `<img${before}src="${src}"${after}>`;
    },
  ).replace(/\{\{image:([^}]+)\}\}/g, (_full, rawSectionId) => {
    const sectionId = String(rawSectionId).trim();
    const src = images[sectionId] ?? "";
    if (!src) return "";
    if (isVideoUrl(src)) {
      const safeSrc = src.replace(/"/g, "&quot;");
      return `<video src="${safeSrc}" autoplay loop muted playsinline style="width:100%;height:auto;object-fit:cover;"></video>`;
    }
    return src;
  });
}

export function createPreviewSrcDoc(
  html: string,
  css: string,
  images: Record<string, string> | null | undefined,
): string {
  const mergedHtml = injectImagesIntoHtml(html, images);
  return renderPreviewDocument(mergedHtml, css);
}
