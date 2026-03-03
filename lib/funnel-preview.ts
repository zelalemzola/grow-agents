import { renderPreviewDocument } from "@/lib/copy-injection";

export function injectImagesIntoHtml(
  html: string,
  images: Record<string, string> | null | undefined,
): string {
  if (!images) {
    return html;
  }

  return html.replace(/\{\{image:([^}]+)\}\}/g, (_full, rawSectionId) => {
    const sectionId = String(rawSectionId).trim();
    return images[sectionId] ?? "";
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
