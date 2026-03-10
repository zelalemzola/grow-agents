import { renderPreviewDocument } from "@/lib/copy-injection";

const VIDEO_CSS = `
.funnel-video-wrap video::-webkit-media-controls { display: none !important; }
.funnel-video-wrap video::-webkit-media-controls-enclosure { display: none !important; }
.funnel-video-wrap video { -webkit-appearance: none; appearance: none; }
`;

/** Forces autoplay and loop; needed for some browsers in iframes. */
const VIDEO_AUTOPLAY_SCRIPT = `
<script>
(function(){
  function playVideos(){ document.querySelectorAll(".funnel-video-wrap video").forEach(function(v){ v.muted=true; v.loop=true; v.playsInline=true; v.play().catch(function(){}); }); }
  if(document.readyState==="loading"){ document.addEventListener("DOMContentLoaded",playVideos); }else{ playVideos(); }
})();
</script>`;

function isVideoUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith("data:video/")) return true;
  if (url.includes(".mp4") || url.includes(".webm")) return true;
  return false;
}

/** Video element: no controls, autoplay, loop, muted. Editorial layout with rounded corners. */
function makeVideoHtml(safeSrc: string): string {
  return `<div class="funnel-video-wrap" style="width:100%;overflow:hidden;border-radius:16px;aspect-ratio:16/9;background:#0a0a0a;box-shadow:0 4px 24px rgba(0,0,0,0.15);"><video src="${safeSrc}" autoplay loop muted playsinline disablepictureinpicture disableRemotePlayback preload="auto" style="width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;"></video></div>`;
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
    (match, before, rawSectionId, after) => {
      const sectionId = String(rawSectionId).trim();
      const src = images[sectionId] ?? "";
      if (!src) return match; // Keep original img tag with placeholder when image missing
      if (isVideoUrl(src)) {
        const safeSrc = src.replace(/"/g, "&quot;");
        return makeVideoHtml(safeSrc);
      }
      return `<img${before}src="${src}"${after}>`;
    },
  ).replace(/\{\{image:([^}]+)\}\}/g, (full, rawSectionId) => {
    const sectionId = String(rawSectionId).trim();
    const src = images[sectionId] ?? "";
    if (!src) return full; // Keep placeholder when image missing so img tags stay in output
    if (isVideoUrl(src)) {
      const safeSrc = src.replace(/"/g, "&quot;");
      return makeVideoHtml(safeSrc);
    }
    const safeSrc = src.replace(/"/g, "&quot;");
    return `<img src="${safeSrc}" alt="" class="funnel-media" style="width:100%;max-width:100%;height:auto;display:block;border-radius:12px;" />`;
  });
}

/** True if html appears to be a complete document (has doctype or html tag). */
function isFullHtmlDocument(html: string): boolean {
  const trimmed = (html || "").trim();
  return /^\s*<!DOCTYPE\s/i.test(trimmed) || /^\s*<html[\s>]/i.test(trimmed);
}

/** Replaces link to styles.css with embedded style for iframe preview (srcdoc cannot load external files). */
function embedStylesForPreview(html: string, css: string): string {
  const linkPattern = /<link[^>]*href=["']styles\.css["'][^>]*\/?>/gi;
  const safeCss = css.replace(/<\/style>/gi, "</\u200Bstyle>");
  const styleTag = `<style>${safeCss}${css.includes("funnel-video-wrap") ? "" : `
.funnel-video-wrap video::-webkit-media-controls { display: none !important; }
.funnel-video-wrap video::-webkit-media-controls-enclosure { display: none !important; }
.funnel-video-wrap video { -webkit-appearance: none; appearance: none; }
`}</style>`;

  let result = html.replace(linkPattern, styleTag);

  /* If no link was replaced (e.g. missing or different format), inject CSS before </head> so preview is always styled */
  if (result === html || !/<style[\s>]/.test(result)) {
    const headClose = result.search(/<\/head\s*>/i);
    if (headClose >= 0) {
      result = result.slice(0, headClose) + "\n  " + styleTag + "\n  " + result.slice(headClose);
    } else {
      result = result.replace(/<body/i, styleTag + "\n  <body");
    }
  }

  return result;
}

export function createPreviewSrcDoc(
  html: string,
  css: string,
  images: Record<string, string> | null | undefined,
): string {
  const mergedHtml = injectImagesIntoHtml(html, images);
  const hasVideos = images && Object.values(images).some((url) => isVideoUrl(url));
  const bodyContent = mergedHtml + (hasVideos ? VIDEO_AUTOPLAY_SCRIPT : "");

  if (isFullHtmlDocument(mergedHtml)) {
    let result = embedStylesForPreview(mergedHtml, css + VIDEO_CSS);
    if (hasVideos) {
      const hasVideoCss = result.includes("funnel-video-wrap");
      if (!hasVideoCss) {
        const styleClose = result.search(/<\/style\s*>/i);
        if (styleClose >= 0) {
          result = result.slice(0, styleClose) + VIDEO_CSS + result.slice(styleClose);
        } else {
          result = result.replace(/<\/head\s*>/i, `<style>${VIDEO_CSS}</style></head>`);
        }
      }
      result = result.replace(/<\/body\s*>/i, VIDEO_AUTOPLAY_SCRIPT + "</body>");
    }
    return result;
  }

  return renderPreviewDocument(bodyContent, css + VIDEO_CSS);
}
