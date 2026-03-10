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
    (_match, before, rawSectionId, after) => {
      const sectionId = String(rawSectionId).trim();
      const src = images[sectionId] ?? "";
      if (!src) return "";
      if (isVideoUrl(src)) {
        const safeSrc = src.replace(/"/g, "&quot;");
        return makeVideoHtml(safeSrc);
      }
      return `<img${before}src="${src}"${after}>`;
    },
  ).replace(/\{\{image:([^}]+)\}\}/g, (_full, rawSectionId) => {
    const sectionId = String(rawSectionId).trim();
    const src = images[sectionId] ?? "";
    if (!src) return "";
    if (isVideoUrl(src)) {
      const safeSrc = src.replace(/"/g, "&quot;");
      return makeVideoHtml(safeSrc);
    }
    const safeSrc = src.replace(/"/g, "&quot;");
    return `<img src="${safeSrc}" alt="" class="funnel-media" style="width:100%;max-width:100%;height:auto;display:block;border-radius:12px;" />`;
  });
}

export function createPreviewSrcDoc(
  html: string,
  css: string,
  images: Record<string, string> | null | undefined,
): string {
  const mergedHtml = injectImagesIntoHtml(html, images);
  const hasVideos = images && Object.values(images).some((url) => isVideoUrl(url));
  const bodyContent = mergedHtml + (hasVideos ? VIDEO_AUTOPLAY_SCRIPT : "");
  return renderPreviewDocument(bodyContent, css + VIDEO_CSS);
}
