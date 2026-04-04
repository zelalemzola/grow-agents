import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateObject,
} from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { sectionPlanSchema } from "@/lib/copy-injection";
import { classifyIsProductSection } from "@/lib/classify-product-section";
import {
  parseMediaPlaceholders,
  replacePlaceholdersInHtml,
  getPlaceholderContext,
} from "@/lib/media-placeholders";
import {
  formatSectionPlanContentForHtml,
  injectContentFromCopy,
  splitCopyIntoParagraphs,
} from "@/lib/format-section-content";
import { buildVisualDescription } from "@/lib/image-prompt-builder";
import {
  agent1PromptContext,
  FUNNEL_GENERATION_EXTRA_SYSTEM_PROMPT,
} from "@/lib/agent1-guidelines";
import { IMAGE_GENERATION_GUIDELINE } from "@/lib/image-generation-guideline";
import { uploadImagesMapToStorage } from "@/lib/funnel-image-storage";
import { injectGeneratedContentIntoScaffold } from "@/lib/scaffold-inject";
import { getGateway } from "@/lib/ai-gateway";
import {
  createServerSupabaseClient,
  createSupabaseAdminClient,
} from "@/utils/supabase/server";

export const maxDuration = 300;

const generateSchema = z.object({
  funnelName: z.string().min(3),
  objective: z.string().min(12),
  campaignContext: z.string().optional(),
  templateId: z.string().uuid().optional(),
  stream: z.boolean().optional(),
  /** Optional product images (data URLs) for product-related sections. Used when generating images at [image]/[gif] placeholders in product-focused sections. */
  productImages: z.array(z.string()).optional(),
  /** Optional product-specific image/GIF guidelines (e.g. "use before/after results, doctor in lab recommending, testimonials with happy customers holding product"). Injected when generating for product-related sections. */
  productGuidelines: z.string().optional(),
});

class RouteError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type ProgressEvent = {
  type:
    | "status"
    | "reasoning"
    | "step"
    | "warning"
    | "error"
    | "done"
    | "html-stream"
    | "css-stream";
  message?: string;
  payload?: Record<string, unknown>;
};

type GenerationResult = {
  funnel: Record<string, unknown>;
  generated: {
    html: string;
    css: string;
    images: Record<string, string>;
    sectionPlan: Record<string, unknown>;
  };
};

async function runGeneration(
  parsedData: z.infer<typeof generateSchema>,
  emit: (event: ProgressEvent) => void,
): Promise<GenerationResult> {
  const supabase = await createServerSupabaseClient();
  const gateway = getGateway();

  emit({
    type: "status",
    message: "Loading template (if selected).",
  });

  let template:
    | {
        name: string;
        instructions: string;
        html_scaffold: string | null;
        css_scaffold: string | null;
      }
    | null = null;

  if (parsedData.templateId) {
    const { data, error } = await supabase
      .from("agent_templates")
      .select("name, instructions, html_scaffold, css_scaffold")
      .eq("id", parsedData.templateId)
      .eq("agent_slug", "copy-injection")
      .single();

    if (error) {
      throw new RouteError(400, `Template lookup failed: ${error.message}`);
    }

    template = data;
    emit({
      type: "reasoning",
      message: "Template selected; generation will preserve its structure guidance.",
      payload: { templateName: template.name },
    });
  } else {
    emit({
      type: "reasoning",
      message: "No template selected; generation will use clean conversion defaults.",
    });
  }

  // Knowledge base disabled for now to reduce latency - use built-in guidelines only
  const copyContext = agent1PromptContext([], "copy");

  let paragraphs = splitCopyIntoParagraphs(parsedData.objective);
  if (paragraphs.length === 0 && parsedData.objective.trim()) {
    paragraphs = [parsedData.objective.trim()];
  }
  const paragraphPreview =
    paragraphs.length > 0
      ? paragraphs
          .map((p, i) => `Paragraph ${i}: ${p.slice(0, 150)}${p.length > 150 ? "..." : ""}`)
          .join("\n")
      : `Paragraph 0: ${parsedData.objective.slice(0, 200)}`;

  emit({
    type: "status",
    message: "Planning funnel sections (structure + paragraph mapping).",
  });

  const templateScaffoldForPlan = (template?.html_scaffold ?? "").trim();
  const templateStructureHint =
    templateScaffoldForPlan.length > 0
      ? `\n**Template HTML scaffold (reference—align section types with these blocks; if copy needs more sections than the scaffold shows, repeat the matching pattern; if fewer, skip unused block types):**\n\`\`\`html\n${templateScaffoldForPlan.length > 2200 ? `${templateScaffoldForPlan.slice(0, 2200)}\n<!-- truncated -->` : templateScaffoldForPlan}\n\`\`\`\n`
      : "";

  const sectionPlanResult = await generateObject({
    model: gateway("openai/gpt-4.1-mini"),
    schema: sectionPlanSchema,
    system: FUNNEL_GENERATION_EXTRA_SYSTEM_PROMPT,
    maxOutputTokens: 65536,
    prompt: `${copyContext}

You are a senior direct-response funnel architect.

Produce a section plan that maps the copy into funnel sections. **CRITICAL:** You output STRUCTURE + paragraphIndices only. Content is injected from the user's copy—you must assign paragraphIndices so every paragraph appears. Zero content loss.

**PARAGRAPH MAPPING (MANDATORY):** The copy is split into ${paragraphs.length} paragraphs (0-indexed). For each section, output paragraphIndices: an array of paragraph numbers. EVERY paragraph 0 through ${Math.max(0, paragraphs.length - 1)} MUST be assigned to exactly one section. No paragraph may be skipped. Paragraph 0 is usually the headline. Assign in reading order.

**TEMPLATE 100%:** Follow the selected template's structure exactly—same section types, class names, layout. The template defines the visual style.

Funnel name: ${parsedData.funnelName}
Campaign context: ${parsedData.campaignContext ?? "N/A"}
Template instructions: ${template?.instructions ?? "No template instructions provided"}
${templateStructureHint}
**Numbered paragraphs (assign each index 0..${Math.max(0, paragraphs.length - 1)} to a section):**
${paragraphPreview}

For each section output:
- id (short slug: hero-headline, body-1, testimonial-1, etc.)
- type (headline, hook, body, cta, testimonial, faq, image, proof)
- title
- content: empty string or placeholder—replaced from copy via paragraphIndices
- paragraphIndices: array of 0-based indices. REQUIRED. Every index 0..${Math.max(0, paragraphs.length - 1)} must appear in exactly one section.
- ctaLabel (when relevant, else null)
- imagePrompt: 1-2 sentence visual for this section. Editorial, candid, no text/logos.
- preferGif: true for process/mechanism; false for testimonials, FAQs

**TESTIMONIALS - ONE SECTION PER REVIEWER (CRITICAL):** Each individual review/testimonial from a DIFFERENT person MUST be its own section with type "testimonial". Example: 5 reviews from Sarah, Mike, Lisa, John, Emma = 5 sections: testimonial-1, testimonial-2, testimonial-3, testimonial-4, testimonial-5. NEVER put multiple reviews in one section. Each testimonial section gets its own image slot.

Create enough sections so all ${paragraphs.length} paragraphs are assigned. Follow template structure.`,
  });

  const sectionPlan = sectionPlanResult.object;
  injectContentFromCopy(sectionPlan.sections, parsedData.objective);
  formatSectionPlanContentForHtml(sectionPlan.sections);

  const productImagesRaw = parsedData.productImages ?? [];
  const hasProductImage = productImagesRaw.length > 0;

  /* Hero: prominent headline region + image slot (matches template layout in HTML step) */
  const firstSec = sectionPlan.sections[0];
  if (
    firstSec?.id &&
    (firstSec.type === "headline" || firstSec.type === "hook")
  ) {
    const c = firstSec.content ?? "";
    if (!c.includes(`{{image:${firstSec.id}}}`)) {
      const heroImg = `<div data-funnel-hero-media="true"><img src="{{image:${firstSec.id}}}" alt="" class="funnel-media funnel-hero-image" style="width:100%;max-width:100%;height:auto;display:block;border-radius:12px;" /></div>`;
      firstSec.content = c.trim() ? heroImg + "<br><br>" + c : heroImg;
    }
  }

  /* Prepend image placeholder to testimonial and CTA sections so it gets into the HTML */
  for (const s of sectionPlan.sections) {
    if (s.type === "testimonial" && s.id) {
      const imgPlaceholder = `<img src="{{image:${s.id}}}" alt="" class="funnel-media" style="width:100%;max-width:100%;height:auto;display:block;border-radius:12px;" />`;
      s.content = (s.content ?? "").trim()
        ? imgPlaceholder + "<br><br>" + (s.content ?? "")
        : imgPlaceholder;
    }
    if (s.type === "cta" && s.id && hasProductImage) {
      const imgPlaceholder = `<img src="{{image:${s.id}}}" alt="" class="funnel-media funnel-cta-product" style="width:100%;max-width:100%;height:auto;display:block;border-radius:12px;" />`;
      s.content = (s.content ?? "").trim()
        ? imgPlaceholder + "<br><br>" + (s.content ?? "")
        : imgPlaceholder;
    }
  }

  emit({
    type: "reasoning",
    message: "Section plan completed; next step is transforming plan into semantic HTML/CSS.",
    payload: {
      sectionCount: sectionPlan.sections.length,
      sectionTypes: sectionPlan.sections.map((section) => section.type),
    },
  });

  const mediaPlaceholders = parseMediaPlaceholders(parsedData.objective);
  const productImageBase64 = productImagesRaw
    .map((dataUrl) => {
      const m = /^data:image\/[^;]+;base64,(.+)$/.exec(dataUrl);
      return m ? m[1] : null;
    })
    .filter((x): x is string => Boolean(x))
    .slice(0, 3);

  type ImageCandidate = {
    id: string;
    title: string;
    content: string;
    type: "headline" | "hook" | "body" | "cta" | "testimonial" | "faq" | "image" | "proof";
    imagePrompt: string | null;
    preferGif: boolean;
    isProductSection: boolean;
    /** When true, use product image directly—no AI generation (for CTA/offer sections). */
    useProductDirectly?: boolean;
  };
  const placeholderCandidates: Omit<ImageCandidate, "isProductSection">[] =
    mediaPlaceholders.length > 0
      ? mediaPlaceholders.map((p, i) => {
          const ctx = getPlaceholderContext(parsedData.objective, i, mediaPlaceholders);
          return {
            id: p.id,
            title: p.type === "gif" ? "GIF" : "Image",
            content: `[Content around this ${p.type} placeholder—use ONLY this to generate the image prompt]:\n\n${ctx}`,
            type: "body" as const,
            imagePrompt: null,
            preferGif: p.type === "gif",
          };
        })
      : [];

  const testimonialCandidates: Omit<ImageCandidate, "isProductSection">[] =
    sectionPlan.sections
      .filter((s) => s.type === "testimonial")
      .map((s) => ({
        id: s.id,
        title: s.title,
        content: `[Content for this testimonial—use ONLY this to generate a unique selfie image for this person]:\n\n${(s.content ?? "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 1200)}`,
        type: "testimonial" as const,
        imagePrompt: null,
        preferGif: false,
      }));

  const ctaCandidates: Omit<ImageCandidate, "isProductSection">[] =
    productImageBase64.length > 0
      ? sectionPlan.sections
          .filter((s) => s.type === "cta" && s.id)
          .map((s) => ({
            id: s.id,
            title: s.title,
            content: (s.content ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 600),
            type: "cta" as const,
            imagePrompt: null,
            preferGif: false,
          }))
      : [];

  const firstSection = sectionPlan.sections[0];
  const heroImageCandidate: Omit<ImageCandidate, "isProductSection"> | null =
    firstSection?.id &&
    (firstSection.type === "headline" || firstSection.type === "hook") &&
    !placeholderCandidates.some((p) => p.id === firstSection.id)
      ? {
          id: firstSection.id,
          title: firstSection.title,
          content: `[Hero / above-the-fold visual—use ONLY this context]:\n\n${(firstSection.content ?? "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 900)}`,
          type: firstSection.type,
          imagePrompt: firstSection.imagePrompt,
          preferGif: firstSection.preferGif ?? false,
        }
      : null;

  const imageCandidatesBase: Omit<ImageCandidate, "isProductSection">[] = [
    ...placeholderCandidates,
    ...(heroImageCandidate ? [heroImageCandidate] : []),
    ...testimonialCandidates,
    ...ctaCandidates,
  ];

  const needsClassification = imageCandidatesBase.filter(
    (c) => c.type !== "testimonial" && c.type !== "cta",
  );
  const classified = productImageBase64.length > 0
    ? await Promise.all(
        needsClassification.map((c) =>
          classifyIsProductSection(c.content, parsedData.objective, gateway("openai/gpt-4.1-mini")),
        ),
      )
    : needsClassification.map(() => false);
  const classifyMap = new Map(needsClassification.map((c, i) => [c.id, classified[i] ?? false]));

  const imageCandidates: ImageCandidate[] = imageCandidatesBase.map((c) => {
    if (c.type === "testimonial") return { ...c, isProductSection: true, useProductDirectly: false };
    if (c.type === "cta" && productImageBase64.length > 0)
      return { ...c, isProductSection: true, useProductDirectly: true };
    return {
      ...c,
      isProductSection: classifyMap.get(c.id) ?? false,
      useProductDirectly: false,
    };
  });

  const defaultProductGuidelines =
    productImageBase64.length > 0
      ? "CRITICAL: (1) Testimonials and ANY section showing a person with the product: MUST be a SELFIE—person taking the photo themselves, first-person POV, holding the product with a genuine smile. Match their gender exactly. (2) Images must depict ONLY the content above them—no generic or unrelated imagery. (3) Product intro/mechanism (no person): product clearly visible in frame. (4) Doctor/expert: show them holding or recommending the product. (5) Ultra-photorealistic—indistinguishable from real photography."
      : "";

  const productGuidelinesFinal =
    [defaultProductGuidelines, parsedData.productGuidelines?.trim()]
      .filter(Boolean)
      .join("\n\n") || undefined;

  const sectionSummaries = sectionPlan.sections.map((s) => ({
    id: s.id,
    title: s.title,
    contentPreview: s.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120),
  }));
  const allSectionIds = sectionPlan.sections.map((s) => s.id);
  const funnelContextBase = {
    objective: parsedData.objective,
    pageName: sectionPlan.pageName,
    productGuidelines: productGuidelinesFinal,
    sectionSummaries,
  };

  emit({
    type: "status",
    message: "Generating HTML first, then CSS, then images (sequential for accuracy).",
    payload: {
      imageCandidates: imageCandidates.length,
      placeholderOnly: mediaPlaceholders.length > 0,
    },
  });

  const placeholderIdList =
    mediaPlaceholders.length > 0
      ? mediaPlaceholders.map((p) => p.id).join(", ")
      : "";

  const sectionPlanJson = JSON.stringify(sectionPlan, null, 2);
  const templateInstructions = template?.instructions ?? "No strict template guidance. Use clean modern conversion layout.";
  const templateHtmlScaffold = template?.html_scaffold ?? "N/A";
  const templateCssScaffold = template?.css_scaffold ?? "N/A";
  const templateCssTrimmed = template?.css_scaffold?.trim() ?? "";
  const templateCssSnippetForHtml =
    templateCssTrimmed.length > 0
      ? templateCssTrimmed.length > 3200
        ? `${templateCssTrimmed.slice(0, 3200)}\n/* …truncated… */`
        : templateCssTrimmed
      : "";

  const htmlOnlySchema = z.object({ html: z.string() });
  const cssOnlySchema = z.object({ css: z.string() });

  const testimonialSectionIds = sectionPlan.sections
    .filter((s) => s.type === "testimonial")
    .map((s) => s.id);
  const ctaSectionIds =
    hasProductImage
      ? sectionPlan.sections.filter((s) => s.type === "cta").map((s) => s.id)
      : [];

  const placeholderBlock =
    mediaPlaceholders.length > 0
      ? `
**CRITICAL - [image] and [gif] placeholders (user indicated media positions):**
The user's copy includes [image] and/or [gif] markers. Replace EACH occurrence with: <img src="{{image:ID}}" alt="" class="funnel-media" style="width:100%;max-width:100%;height:auto;display:block;border-radius:12px;" />
IDs in order of appearance: ${placeholderIdList}
- Generate exactly one media slot per placeholder (${mediaPlaceholders.length} total).
- Do NOT output literal "[image]" or "[gif]"—replace them with the img tag using the correct ID.
`
      : "";

  const testimonialImageBlock =
    testimonialSectionIds.length > 0
      ? `
**TESTIMONIAL IMAGES (REQUIRED):** For EACH testimonial section, you MUST include an image slot. Use <img src="{{image:SECTION_ID}}" alt="" class="funnel-media" style="width:100%;max-width:100%;height:auto;display:block;border-radius:12px;" /> with the EXACT section id. Section IDs: ${testimonialSectionIds.join(", ")}. Each testimonial needs id="SECTION_ID" on its section/div so images map correctly. Example: <section id="testimonial-1">...<img src="{{image:testimonial-1}}" .../>...</section>
`
      : "";

  const ctaImageBlock =
    ctaSectionIds.length > 0
      ? `
**CTA IMAGES (REQUIRED):** For EACH CTA/offer section, you MUST include an image slot. Use <img src="{{image:SECTION_ID}}" alt="" class="funnel-media funnel-cta-product" style="width:100%;max-width:100%;height:auto;display:block;border-radius:12px;" /> with the EXACT section id. Section IDs: ${ctaSectionIds.join(", ")}. Each CTA needs id="SECTION_ID" on its section/div.`
      : "";

  const scaffoldHasPlaceholder = template?.html_scaffold?.trim().includes("{{content}}") || template?.html_scaffold?.trim().includes("{{sections}}");
  const hasTemplate = Boolean(template?.html_scaffold?.trim());

  const imageSlotsParts: string[] = [];
  if (mediaPlaceholders.length > 0) {
    imageSlotsParts.push(`[image]/[gif] placeholders: Replace each with img tags. IDs: ${placeholderIdList}.`);
  }
  if (testimonialSectionIds.length > 0) {
    imageSlotsParts.push(`Testimonial sections: Content includes img tags—preserve them. IDs: ${testimonialSectionIds.join(", ")}.`);
  }
  if (ctaSectionIds.length > 0) {
    imageSlotsParts.push(`CTA sections: Content includes img tags—preserve them. IDs: ${ctaSectionIds.join(", ")}.`);
  }
  if (
    firstSec?.id &&
    (firstSec.type === "headline" || firstSec.type === "hook")
  ) {
    imageSlotsParts.push(
      `Hero (first section): preserve the hero image slot <img src="{{image:${firstSec.id}}}" ... /> from section content.`,
    );
  }
  const imageSlotsBlock =
    imageSlotsParts.length > 0
      ? `
**IMAGE SLOTS (MANDATORY—regardless of template):** Include ALL image slots even if the template has none. Template = styling only. ${imageSlotsParts.join(" ")} Never omit.`
      : "";

  const templateReplicationBlock = hasTemplate
    ? `
**TEMPLATE REPLICATION (MANDATORY—the page must match the selected template):**
1. STRUCTURE: Mirror the template scaffold's HTML EXACTLY—same element hierarchy, nesting, and **the same class strings the template uses** on each kind of block (hero, body, testimonial, pricing/offer, FAQ, etc.). Do not substitute a generic "one layout for all sections" when the template uses different patterns per type.
2. CLASS NAMES + TAG CHOICES: Use the template's classes verbatim. Also reuse the **same heading/body tag patterns** the scaffold uses (e.g. if the hero uses \`<p class="…">\` or \`<div class="title">\`, do not swap in a different \`<h1>\` style that changes the design). Map each plan section to the scaffold block that matches its **role**; duplicate that block's markup for extra sections of the same type.
3. COPY LENGTH: **Longer copy** → repeat the template's section pattern more times, or add paragraphs **inside** the same wrapper elements the template uses—never switch to a generic layout or blow up font sizes. **Shorter copy** → omit whole block types if needed; keep remaining blocks identical to the scaffold; do not enlarge type to "fill" the page.
4. REQUIRED ATTRIBUTES (do not skip): On each section's root (\`<section>\` or outermost wrapper for that section), set \`id="<section id from plan>"\` and \`data-section-type="<type from plan>"\`. Add these on the same node that already carries the template's classes.
5. VISUAL FIDELITY: The result should look like **the template file with the user's words dropped in**—same columns, widths, spacing rhythm, and **type scale** as the template. Only the text changes; not the layout system.
`
    : "";

  const typographyScaleHtmlBlock = `
**TYPOGRAPHY SCALE (MANDATORY):**
- **Editorial, readable body copy:** Default to comfortable reading size for paragraphs (\`<p>\`). Do **not** wrap most body text in \`<h1>\`/\`<h2>\` or use headings for normal copy. Reserve \`<h1>\`–\`<h3>\` for true titles the template implies—not for every block.
- **Do not invent oversized type:** Avoid inline styles like \`font-size: 2rem\` on body text. If the template does not show huge text, do not add it.
- **Match the template's hierarchy:** If the scaffold uses modest headings, keep them modest; if it uses a single hero headline, only that block should read as the largest type.
`;

  const templateCssInHtmlPrompt =
    templateCssSnippetForHtml.length > 0
      ? `
**Template CSS (reference—match implied font sizes, line-height, and spacing; do not exceed this scale for body copy):**
\`\`\`css
${templateCssSnippetForHtml}
\`\`\`
`
      : "";

  const sectionTypeDifferentiationBlock = `
**SECTION TYPES MUST READ AS DIFFERENT BLOCKS:** Use the template's distinct patterns for offer/pricing (cta), reviews (testimonial), FAQ, and narrative (body)—do not flatten everything into one repeated generic section. \`data-section-type\` must match the plan (headline, hook, body, cta, testimonial, faq, image, proof) so pricing/reviews/FAQ are visually distinct when CSS is applied.
`;

  const heroFirstSectionBlock =
    firstSec?.id &&
    (firstSec.type === "headline" || firstSec.type === "hook")
      ? `
**HERO / FIRST SECTION (MANDATORY):** Section id="${firstSec.id}" is the hero. Reuse the **exact hero block structure** from the template scaffold (tags + classes)—same headline element as the template, not a new generic hero. Prominence comes from the template's design, not from larger font sizes than the template shows. Preserve \`<img src="{{image:${firstSec.id}}}" ... />\` / \`[data-funnel-hero-media]\` in the template's image column if present.
**HERO VERTICAL RHYTHM:** Keep the hero block slightly tighter than a generic mid-page section—use modest padding above the first headline and below the hero block. Avoid large empty vertical gaps before the first line of copy or below the hero image unless the template scaffold already uses that much space; when in doubt, prefer a little less vertical whitespace than a full "section break" feel.
`
      : "";

  const htmlPrompt = `${copyContext}

You are an expert HTML funnel builder. Output ONLY the HTML for the landing page body (no <html>, <head>, or <body>—just the inner content).
${scaffoldHasPlaceholder ? "\n**Template scaffold:** The template uses {{content}} or {{sections}} for your output. Your output will be injected into {{content}}. Use the SAME class names and HTML structure as the template's inner content—only the text changes.\n" : ""}
${hasTemplate && !scaffoldHasPlaceholder ? "\n**Full-page template:** When the scaffold has no {{content}} placeholder, your HTML fragment is inserted inside the template document's <body>—you must still mirror the scaffold's inner section patterns exactly (do not replace with a generic layout).\n" : ""}
${imageSlotsBlock}
${templateReplicationBlock}
${sectionTypeDifferentiationBlock}
${heroFirstSectionBlock}
${typographyScaleHtmlBlock}
${templateCssInHtmlPrompt}
${placeholderBlock}
${testimonialImageBlock}
${ctaImageBlock}
**EXACT COPY - NOTHING ADDED OR REMOVED:** Output the section plan content EXACTLY as provided. Do not add, omit, or rephrase a single line. Every paragraph, review, and disclaimer from the plan must appear verbatim in the HTML. **CRITICAL:** Preserve any <img src="{{image:SECTION_ID}}" ... /> tags that appear in section content—they must appear in your output unchanged.

**CONTENT FORMATTING (CRITICAL):** Preserve ALL formatting from the section plan. Content may already contain HTML from pasted copy (e.g. Google Docs); keep it intact:
- **Preserve existing tags:** Keep every <b>, <i>, <u> from the section plan exactly as provided. Do not strip or rephrase.
- Paragraph breaks → <br><br> between each paragraph
- Line breaks → <br> for breathing room within paragraphs
- Bold → <b>text</b> (preserve existing <b> or add where emphasis is intended)
- Italics → <i>text</i> (preserve existing <i>)
- Underline → <u>text</u> (preserve existing <u>)
- **Lists:** Bullet points → <ul class="content-list"><li>item</li></ul>; numbered → <ol class="content-list"><li>item</li></ol>
- **Blockquotes:** Standalone quotes → <blockquote class="content-quote">...</blockquote>
- Do not paste raw unformatted text—no wall-of-text. Preserve spacing and structure from the plan.
**COMPLETE OUTPUT:** You MUST output the FULL HTML with EVERY section from the plan. Never truncate, abbreviate, or skip sections—no matter how long. Use semantic HTML. No markdown fences.

ADAPTIVE LAYOUT (template-first):
- More sections than the scaffold shows → **duplicate the matching template pattern** (same structure, classes, nesting). Longer copy → more instances or more \`<p>\`/list items inside the template's wrappers—not bigger fonts.
- Fewer sections → omit unused block types; keep surviving blocks identical to the scaffold.
- Prefer the template's spacing and containers; avoid a generic "marketing landing" look unless the template is one.

Section Plan:
${sectionPlanJson}

Template guidance: ${templateInstructions}
Template HTML scaffold (COPY this structure exactly—same classes, same nesting. Duplicate section patterns when you need more sections): 
\`\`\`html
${templateHtmlScaffold}
\`\`\``;

  const { generateFunnelMedia } = await import("@/lib/generate-funnel-media");
  const { getImageModel } = await import("@/lib/image-model");
  const { getVideoModel } = await import("@/lib/video-model");
  const imageModel = getImageModel();
  const videoModel = getVideoModel();

  const IMAGE_CONCURRENCY = 1;

  const productDataUrl = productImagesRaw[0] ?? null;

  async function generateImageForSection(
    section: ImageCandidate,
  ): Promise<{ sectionId: string; dataUrl: string }> {
    if (section.useProductDirectly && productDataUrl) {
      emit({
        type: "reasoning",
        message: `Using product image directly for CTA "${section.id}" (no generation).`,
        payload: { sectionId: section.id },
      });
      return { sectionId: section.id, dataUrl: productDataUrl };
    }
    const useProductImage =
      (section.isProductSection || section.type === "testimonial") &&
      productImageBase64.length > 0 &&
      !section.preferGif;
    emit({
      type: "reasoning",
      message: `Generating ${section.preferGif ? "GIF" : "image"} for "${section.id}"${useProductImage ? " (using product reference)" : ""}.`,
      payload: { sectionId: section.id },
    });
    try {
      const differentFromIds = allSectionIds.filter((id) => id !== section.id);
      const { description: visualDescription, sceneType } =
        await buildVisualDescription(
          {
            title: section.title,
            content: section.content,
            id: section.id,
            type: section.type,
            imagePrompt: section.imagePrompt,
            preferGif: section.preferGif,
            isProductSection: section.isProductSection || section.type === "testimonial",
          },
          gateway("openai/gpt-4.1-mini"),
          {
            ...funnelContextBase,
            differentFromIds,
            sectionIndex: allSectionIds.indexOf(section.id),
          },
        );
      const { dataUrl } = await generateFunnelMedia({
        prompt: visualDescription,
        sceneType,
        preferGif: section.preferGif ?? false,
        imageModel,
        videoModel,
        sectionId: section.id,
        productImageBase64: useProductImage ? productImageBase64 : undefined,
        onVideoFallback: (sid, err) => {
          const msg = err instanceof Error ? err.message : String(err);
          emit({
            type: "warning",
            message: `Video for "${sid}" failed (using static image): ${msg.slice(0, 120)}`,
          });
        },
      });
      return { sectionId: section.id, dataUrl };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      emit({
        type: "warning",
        message: `Image for "${section.id}" failed: ${msg.slice(0, 150)}. A placeholder will be used.`,
        payload: { sectionId: section.id },
      });
      const placeholderSvg =
        "data:image/svg+xml," +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="225" viewBox="0 0 400 225"><rect fill="#f0f0f0" width="400" height="225"/></svg>',
        );
      return { sectionId: section.id, dataUrl: placeholderSvg };
    }
  }

  async function runWithConcurrencyLimit<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let index = 0;
    async function worker(): Promise<void> {
      while (index < items.length) {
        const i = index++;
        if (i >= items.length) break;
        results[i] = await fn(items[i]);
      }
    }
    const workers = Array.from(
      { length: Math.min(limit, items.length) },
      () => worker(),
    );
    await Promise.all(workers);
    return results;
  }

  const HTML_CHUNK_THRESHOLD = 8;
  const HTML_CHUNK_SIZE = 6;
  const HTML_MAX_TOKENS = 65536;

  let htmlRaw: string;

  if (sectionPlan.sections.length > HTML_CHUNK_THRESHOLD) {
    emit({ type: "status", message: `Generating HTML in chunks (${sectionPlan.sections.length} sections)...` });
    const batches: typeof sectionPlan.sections[] = [];
    for (let i = 0; i < sectionPlan.sections.length; i += HTML_CHUNK_SIZE) {
      batches.push(sectionPlan.sections.slice(i, i + HTML_CHUNK_SIZE));
    }
    const htmlParts: string[] = [];
    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b];
      emit({ type: "status", message: `Generating HTML chunk ${b + 1}/${batches.length}...` });
      const batchJson = JSON.stringify({ sections: batch }, null, 2);
      const batchHasTestimonials = batch.some((s) => s.type === "testimonial");
      const batchTestimonialIds = batch.filter((s) => s.type === "testimonial").map((s) => s.id);
      const batchHasCta = batch.some((s) => s.type === "cta");
      const batchCtaIds = batch.filter((s) => s.type === "cta").map((s) => s.id);
      const batchTestimonialBlock = batchHasTestimonials
        ? `\n**TESTIMONIAL IMAGES (REQUIRED):** Each testimonial content includes an img tag—preserve it. IDs: ${batchTestimonialIds.join(", ")}. Include even if template has no image slots.\n`
        : "";
      const batchCtaBlock = batchHasCta && ctaSectionIds.length > 0
        ? `\n**CTA IMAGES (REQUIRED):** Each CTA content includes an img tag—preserve it. IDs: ${batchCtaIds.join(", ")}.\n`
        : "";
      const batchImageSlotsNote =
        mediaPlaceholders.length > 0 || batchHasTestimonials || batchHasCta
          ? `\n**IMAGE SLOTS (MANDATORY):** Include all image slots—replace [image]/[gif] with img tags, preserve testimonial and CTA img tags. Template structure is for styling only.\n`
          : "";
      const batchPrompt = `${copyContext}

You are an expert HTML funnel builder. Output ONLY the HTML for these ${batch.length} sections (chunk ${b + 1} of ${batches.length}). No <html>, <head>, <body>. Just the section elements.

${templateReplicationBlock}
${sectionTypeDifferentiationBlock}
${b === 0 ? heroFirstSectionBlock : ""}
${typographyScaleHtmlBlock}
${templateCssInHtmlPrompt}
${imageSlotsBlock}
${batchImageSlotsNote}
${placeholderBlock}
${batchTestimonialBlock}
${batchCtaBlock}
**EXACT COPY:** Output the section content EXACTLY as provided. Preserve any <img src="{{image:SECTION_ID}}" ... /> tags and all <b>, <i>, <u> formatting in the content unchanged. No truncation, no omission.

Template guidance: ${templateInstructions}

Template HTML scaffold (structure to replicate exactly):
\`\`\`html
${templateHtmlScaffold}
\`\`\`

Sections to render:
${batchJson}`;

      const batchResult = await generateObject({
        model: gateway("openai/gpt-4.1"),
        schema: htmlOnlySchema,
        system: FUNNEL_GENERATION_EXTRA_SYSTEM_PROMPT,
        prompt: batchPrompt,
        maxOutputTokens: HTML_MAX_TOKENS,
      });
      htmlParts.push((batchResult.object.html ?? "").trim());
    }
    htmlRaw = htmlParts.join("\n\n");
  } else {
    emit({ type: "status", message: "Generating HTML..." });
    const htmlResult = await generateObject({
      model: gateway("openai/gpt-4.1"),
      schema: htmlOnlySchema,
      system: FUNNEL_GENERATION_EXTRA_SYSTEM_PROMPT,
      prompt: htmlPrompt,
      maxOutputTokens: HTML_MAX_TOKENS,
    });
    htmlRaw = htmlResult.object.html;
  }

  let html = mediaPlaceholders.length > 0
    ? replacePlaceholdersInHtml(htmlRaw, mediaPlaceholders)
    : htmlRaw;

  /* Ensure testimonial and CTA sections have image slots—inject if HTML model missed them */
  const testimonialImgTag = (id: string) =>
    `<img src="{{image:${id}}}" alt="" class="funnel-media" style="width:100%;max-width:100%;height:auto;display:block;border-radius:12px;" />`;
  const ctaImgTag = (id: string) =>
    `<img src="{{image:${id}}}" alt="" class="funnel-media funnel-cta-product" style="width:100%;max-width:100%;height:auto;display:block;border-radius:12px;" />`;
  for (const tid of [...testimonialSectionIds, ...ctaSectionIds]) {
    if (!html.includes(`{{image:${tid}}}`)) {
      const escaped = tid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const sectionMatch = html.match(new RegExp(`(<(?:section|div)[^>]*id=["']${escaped}["'][^>]*>)`, "i"));
      if (sectionMatch) {
        const imgTag = ctaSectionIds.includes(tid) ? ctaImgTag(tid) : testimonialImgTag(tid);
        html = html.replace(sectionMatch[1], sectionMatch[1] + "\n" + imgTag);
      }
    }
  }

  if (
    firstSec?.id &&
    (firstSec.type === "headline" || firstSec.type === "hook") &&
    !html.includes(`{{image:${firstSec.id}}}`)
  ) {
    const escaped = firstSec.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const sectionMatch = html.match(
      new RegExp(`(<(?:section|div)[^>]*id=["']${escaped}["'][^>]*>)`, "i"),
    );
    if (sectionMatch) {
      const heroImg = `<div data-funnel-hero-media="true"><img src="{{image:${firstSec.id}}}" alt="" class="funnel-media funnel-hero-image" style="width:100%;max-width:100%;height:auto;display:block;border-radius:12px;" /></div>`;
      html = html.replace(sectionMatch[1], sectionMatch[1] + "\n" + heroImg);
    }
  }

  const CSS_LINK = '<link rel="stylesheet" href="styles.css" />';

  if (template?.html_scaffold?.trim()) {
    html = injectGeneratedContentIntoScaffold(template.html_scaffold.trim(), html, {
      stylesLink: CSS_LINK,
    });
  }

  if (!/^\s*<!DOCTYPE\s/i.test(html.trim()) && !/^\s*<html[\s>]/i.test(html.trim())) {
    html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${CSS_LINK}
  </head>
  <body>
${html}
  </body>
</html>`;
  }

  /* Extract classes and tags from HTML so CSS model styles every element */
  const classMatches = html.matchAll(/\bclass=["']([^"']+)["']/gi);
  const classes = new Set<string>();
  for (const m of classMatches) {
    for (const c of (m[1] ?? "").trim().split(/\s+/)) {
      if (c && !c.startsWith("{{")) classes.add(c);
    }
  }
  const tagMatches = html.matchAll(/<([a-z][a-z0-9]*)\b/gi);
  const tags = new Set<string>();
  for (const m of tagMatches) {
    const tag = (m[1] ?? "").toLowerCase();
    if (!["html", "head", "body", "meta", "link", "script", "style", "title"].includes(tag)) {
      tags.add(tag);
    }
  }
  const classList = [...classes].sort().join(", ");
  const tagList = [...tags].sort().join(", ");

  emit({ type: "status", message: "Generating CSS to match HTML structure..." });

  const templateCssBase = (template?.css_scaffold ?? "").trim();
  const hasTemplateCss = templateCssBase.length > 0;

  const contentStructureNote =
    classes.has("content-list") || classes.has("content-quote")
      ? `\n**CONTENT-STRUCTURE CLASSES (style these to match template):** .content-list (ul/ol)—styled list with appropriate spacing, bullets/numbers; .content-quote (blockquote)—distinct quote styling, optionally left border or italic. Match the template's typography and colors.\n`
      : "";

  const sectionTypeCssBlock = `
**SECTION TYPE VISIBILITY (MANDATORY DELTA):** The HTML uses \`data-section-type\` on section roots. Add rules so each section kind reads distinct (hero vs reviews vs offer vs FAQ vs body)—using the template's design tokens only. Prefer \`[data-section-type="…"]\` selectors. Differentiate with **background, border, spacing, layout**—not by making every block use larger \`font-size\` than the template body. Hero may be slightly bolder only if the template already implies it. Testimonials: card/quote feel. CTA: band/button emphasis. FAQ: Q/A rhythm. Style \`[data-funnel-hero-media]\` / \`.funnel-hero-image\` only if the template omits them. If fully styled, output a brief comment only.
**FIRST SECTION / HERO SPACING:** When you add rules for the hero or first section (\`[data-section-type="headline"]\` / \`[data-section-type="hook"]\` first section, or first \`section\` in the document), prefer **slightly tighter** \`padding-top\` / \`padding-bottom\` (or \`margin\`) than generic body sections—enough breathing room but not oversized vertical bands—unless the template CSS already fixes those values (then do not override).
`;

  const typographyCssBlock = `
**TYPOGRAPHY (CRITICAL):** Keep body copy **readable and restrained**. Base body text should feel like **15–18px** at typical viewport width (use \`rem\`/\`clamp\`, not huge \`px\` values). Headings: clear hierarchy but **no oversized display type** unless the template shows it. Avoid \`font-size\` above ~2rem for any single heading unless the template CSS already uses that scale.
`;

  const cssPrompt = hasTemplateCss
    ? `${copyContext}

You are an expert CSS author. The template CSS below is the SOURCE OF TRUTH for style. Your job: output ONLY additional rules for classes that appear in the HTML but are NOT already styled in the template.

**TEMPLATE STYLE REPLICATION:** The funnel must look exactly like the selected template. Do NOT override template rules. Do NOT change colors, fonts, or spacing that the template already defines. Extract the template's design tokens (e.g. --color-primary, font-family, padding, border-radius) and reuse them in any new rules.

**NO OVERSIZED TYPE ON DELTA:** For any new rule you add, \`font-size\` must stay **at or below** the template's implied scale for similar elements. Never add rules that make body paragraphs larger than the template's body. Prefer \`inherit\`, \`em\`, or matching \`rem\` to the template.

**YOUR OUTPUT = DELTA ONLY:** Output ONLY CSS for selectors that are missing from the template. If every class in the HTML is already covered by the template, output a single comment: /* All classes styled by template */
${contentStructureNote}${sectionTypeCssBlock}${typographyCssBlock}
**Classes in HTML:** ${classList || "(none found)"}

**Template CSS (already applied—replicate its style for any new classes):**
\`\`\`css
${templateCssBase}
\`\`\`

**HTML to check for unstyled classes:**
\`\`\`html
${html.length > 12000 ? html.slice(0, 12000) + "\n<!-- truncated -->" : html}
\`\`\``
    : `${copyContext}

You are an expert CSS author. Output the FULL CSS for this funnel. Style every class and element. Mobile-first. **Restrained typography:** \`body\` / main copy ~15–18px equivalent (\`font-size: clamp(0.95rem, 0.9rem + 0.2vw, 1.05rem)\` or similar); \`h1\` typically clamp(1.5rem, 4vw, 2rem); \`h2\` smaller than h1; avoid giant display sizes. Classes: ${classList || "(none)"}. Tags: ${tagList || "(none)"}.
${contentStructureNote}${sectionTypeCssBlock}${typographyCssBlock}

HTML:
\`\`\`html
${html.length > 12000 ? html.slice(0, 12000) + "\n<!-- truncated -->" : html}
\`\`\``;

  const cssResult = await generateObject({
    model: gateway("openai/gpt-4.1"),
    schema: cssOnlySchema,
    system: FUNNEL_GENERATION_EXTRA_SYSTEM_PROMPT,
    prompt: cssPrompt,
    maxOutputTokens: 65536,
  });
  const cssDelta = (cssResult.object.css ?? "").trim().replace(/^```(?:css)?\s*\n?|```\s*$/gm, "").trim();

  let css = hasTemplateCss
    ? templateCssBase + (cssDelta && !cssDelta.startsWith("/*") ? "\n\n/* Extended/overrides */\n" + cssDelta : "\n\n" + cssDelta)
    : cssDelta;

  if (css.length < 50) {
    css = `* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, sans-serif; font-size: 16px; line-height: 1.55; color: #1a1a1a; background: #fff; }
img, video { max-width: 100%; height: auto; display: block; }
section { padding: 1rem 1rem; max-width: 42rem; margin: 0 auto; }
section:first-of-type { padding-top: 0.85rem; padding-bottom: 1rem; }
h1 { font-size: clamp(1.35rem, 3vw, 1.75rem); font-weight: 700; margin: 0 0 0.5em; line-height: 1.2; }
h2 { font-size: clamp(1.15rem, 2.5vw, 1.35rem); font-weight: 650; margin: 0 0 0.45em; line-height: 1.25; }
h3 { font-size: clamp(1.05rem, 2vw, 1.15rem); font-weight: 600; margin: 0 0 0.4em; line-height: 1.3; }
p { margin: 0 0 0.85em; font-size: 1rem; }
ul.content-list, ol.content-list { margin: 0.85em 0; padding-left: 1.25em; font-size: 1rem; }
blockquote.content-quote { margin: 0.85em 0; padding-left: 1em; border-left: 3px solid #ccc; font-style: italic; color: #444; font-size: 0.98rem; }
`;
  }

  /* Emit full HTML and CSS so scaffolds show complete code (with img tags, scaffold merge, etc.) */
  emit({ type: "html-stream", payload: { value: html } });
  emit({ type: "css-stream", payload: { value: css } });

  emit({ type: "status", message: "Generating images..." });
  const imageResults = await runWithConcurrencyLimit(
    imageCandidates,
    IMAGE_CONCURRENCY,
    generateImageForSection,
  );

  const generatedImages: Record<string, string> = {};
  for (const { sectionId, dataUrl } of imageResults) {
    generatedImages[sectionId] = dataUrl;
  }

  emit({
    type: "status",
    message: "Uploading images and saving funnel.",
  });
  const storageClient = createSupabaseAdminClient() ?? supabase;
  const imagesForDb = await uploadImagesMapToStorage(generatedImages, storageClient);

  const { data: funnel, error: funnelError } = await supabase
    .from("funnels")
    .insert({
      agent_slug: "copy-injection",
      name: parsedData.funnelName,
      objective: parsedData.objective,
      template_id: parsedData.templateId ?? null,
      latest_html: html,
      latest_css: css,
      latest_images: imagesForDb,
    })
    .select("*")
    .single();

  if (funnelError || !funnel) {
    throw new RouteError(500, `Saving funnel failed: ${funnelError?.message}`);
  }

  const { error: versionError } = await supabase
    .from("funnel_versions")
    .insert({
      funnel_id: funnel.id,
      source: "generate",
      user_instruction: parsedData.objective,
      html,
      css,
      images: imagesForDb,
      section_plan: sectionPlan,
    });

  if (versionError) {
    throw new RouteError(500, `Saving version failed: ${versionError.message}`);
  }

  return {
    funnel: { ...funnel, latest_images: imagesForDb },
    generated: {
      html,
      css,
      images: imagesForDb,
      sectionPlan,
    },
  };
}

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = generateSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    if (parsed.data.stream) {
      const stream = createUIMessageStream({
        execute: async ({ writer }) => {
          const emit = (event: ProgressEvent) => {
            writer.write({
              type: "data-generation-event",
              data: event,
              transient: true,
            });
          };

          try {
            emit({
              type: "status",
              message: "Generation started.",
            });
            const result = await runGeneration(parsed.data, emit);
            writer.write({
              type: "data-generation-result",
              data: result,
              transient: true,
            });
            emit({
              type: "done",
              message: "Generation completed.",
            });
          } catch (error) {
            const routeError = error instanceof RouteError ? error : null;
            emit({
              type: "error",
              message:
                routeError?.message ??
                (error instanceof Error ? error.message : "Unknown server error"),
              payload: { status: routeError?.status ?? 500 },
            });
          }
        },
      });

      return createUIMessageStreamResponse({ stream });
    }

    const result = await runGeneration(parsed.data, () => {});
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
