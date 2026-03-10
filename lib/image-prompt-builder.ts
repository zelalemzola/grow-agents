import { generateObject } from "ai";
import { z } from "zod";

import {
  IMAGE_GENERATION_GUIDELINE,
  IMAGE_MODEL_STYLE_DIRECTIVE,
} from "@/lib/image-generation-guideline";
import { getGifGenerationGuideline } from "@/lib/gif-generation-guideline";

/**
 * Builds a pure visual scene description from advertorial section copy.
 * Uses the image generation guideline as system prompt for client-accurate outputs.
 * Images MUST directly illustrate the section's content and align with the whole funnel.
 */

const sceneTypeSchema = z.enum([
  "before_after",
  "doctor_recommendation",
  "testimonial_with_product",
  "product_mechanism",
  "product_intro",
  "transformation",
  "other",
]);

const visualDescriptionSchema = z.object({
  description: z
    .string()
    .min(20)
    .max(450)
    .describe(
      "Ultra-photorealistic scene description. Specify: who (people, roles), what is happening, setting, lighting, mood. Must match the section content exactly. Describe as if directing a documentary—lifelike, authentic, real photography.",
    ),
  /** For product sections: scene type to apply targeted style hints. Use null when not a product section. */
  sceneType: sceneTypeSchema.nullable(),
});

type SectionType =
  | "headline"
  | "hook"
  | "body"
  | "cta"
  | "testimonial"
  | "faq"
  | "image"
  | "proof";

export interface FunnelContextForImage {
  objective: string;
  pageName: string;
  /** Brief summaries of other sections for context (id: summary) */
  sectionSummaries?: Array<{ id: string; title: string; contentPreview: string }>;
  /** Optional product-specific image/GIF guidelines (e.g. "use before/after, doctor in lab"). Injected for product sections. */
  productGuidelines?: string;
}

/** Scene-specific style hints for product sections */
const SCENE_TYPE_HINTS: Record<string, string> = {
  before_after: "Split or side-by-side composition, transformation reveal, realistic before/after, authentic results.",
  doctor_recommendation: "Doctor or expert in clinical/lab setting holding the product, professional but approachable, recommending or demonstrating it. Show the doctor clearly holding the product.",
  testimonial_with_product: "Happy person holding the product, genuine satisfaction, candid moment. Match the testimonial—show them using or holding the product as described. Real person, authentic feel.",
  product_mechanism: "Clear visual of how product works, mechanism in action, educational and precise.",
  product_intro: "Product clearly visible in context, editorial presentation, not staged advertising.",
  transformation: "Moment of change or result, authentic progress, real-person feel.",
  other: "Match the exact scenario described in the content. Hyperrealistic, editorial.",
};

/**
 * Converts section copy into a concise visual description for image generation.
 * Uses the guideline as system prompt and receives full funnel context so images
 * relate to the whole content and specifically to their section.
 */
export async function buildVisualDescription(
  section: {
    title: string;
    content: string;
    id?: string;
    type?: SectionType;
    imagePrompt?: string | null;
    preferGif?: boolean;
    /** When true and product reference will be provided, add product-incorporation guidance */
    isProductSection?: boolean;
  },
  model: Parameters<typeof generateObject>[0]["model"],
  funnelContext?: FunnelContextForImage,
): Promise<{ description: string; sceneType?: string }> {
  // Use section plan's imagePrompt only when it's concrete, section-specific, and non-generic
  if (section.imagePrompt && section.imagePrompt.trim().length >= 40) {
    const prompt = section.imagePrompt.trim();
    if (
      !/^(generic|stock|placeholder|example|sample|a photo|an image)/i.test(
        prompt,
      ) &&
      (section.title || section.content)
    ) {
      return { description: prompt, sceneType: undefined };
    }
  }

  const plainContent = section.content
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800);

  const typeGuidance: Record<string, string> = {
    headline:
      "HEADLINE IMAGE: Create extreme curiosity. Show the hinted situation/moment from the headline—do NOT show the solution or product. Unfinished, in-progress feel. Curiosity over clarity.",
    hook: "HOOK IMAGE: Show the opening scene or emotion the hook suggests. Candid, observational. Editorial tone.",
    body: "BODY IMAGE: Visually explain this section's single core idea. One idea = one image. Must simplify and clarify what the reader just read. Explain, don't decorate.",
    cta: "CTA IMAGE: Show the outcome or transformation the CTA promises. Subtle, editorial. No ad-like elements.",
    testimonial: "TESTIMONIAL IMAGE: Selfie-style photo of the person from the testimonial holding the product/service, happy and satisfied. Candid, authentic, editorial. Match the reviewer (age/gender from name/quote). Person clearly holding or using the product.",
    proof: "PROOF IMAGE: Show evidence—study scene, mechanism, or result. Educational, clinical-but-human.",
    image: "IMAGE SECTION: Illustrate the key concept of this section. Direct visual support for the copy.",
    faq: "FAQ IMAGE: Show the situation or question the FAQ addresses. Clear, low clutter.",
  };
  const typeHint = section.type ? typeGuidance[section.type] ?? "" : "";

  const gifBlock =
    section.preferGif === true
      ? `\n\n---\nGIF/MECHANISM ANIMATION RULES (MANDATORY for this GIF):\n${getGifGenerationGuideline().slice(0, 2500)}`
      : "";

  const funnelContextBlock = funnelContext
    ? `
FUNNEL CONTEXT (images must align with the overall story):
- Page/offer: ${funnelContext.pageName}
- Objective: ${funnelContext.objective.slice(0, 400)}
${funnelContext.sectionSummaries && funnelContext.sectionSummaries.length > 0 ? `
Other sections in this funnel (for coherence; do NOT mix their content into this image):
${funnelContext.sectionSummaries
  .filter((s) => s.id !== section.id)
  .map((s) => `- ${s.title}: ${s.contentPreview.slice(0, 80)}...`)
  .join("\n")}` : ""}
`
    : "";

  const productGuidelinesBlock =
    section.isProductSection && funnelContext?.productGuidelines?.trim()
      ? `\n\nPRODUCT-SPECIFIC GUIDELINES (follow these for this product):\n${funnelContext.productGuidelines.trim().slice(0, 1500)}`
      : "";

  const contentAwarePrompt = `You are creating a HYPERREALISTIC image for a specific section. The image MUST perfectly match what the surrounding content describes.

CONTENT-AWARE EXTRACTION: Analyze the section content and determine:
- WHO is in the scene (doctor, patient, happy customer, researcher, etc.)
- WHAT is happening (before/after reveal, recommendation, holding product, transformation, mechanism)
- WHERE it takes place (lab, clinic, home, office)
- TONE (clinical, hopeful, testimonial, educational)

Section type: ${section.type ?? "body"}
Section title: ${section.title}
Section content: ${plainContent}
${typeHint ? `\nSection-type rules: ${typeHint}` : ""}
${funnelContextBlock}
${productGuidelinesBlock}

${section.preferGif ? "This will be ANIMATED (GIF/video). Describe a moment of transition, process in progress, or cause-effect in motion." : ""}
${section.isProductSection ? "This section discusses the product. Describe the scene so the product is clearly incorporated—show it in context. If a product reference image is provided, match that product exactly." : ""}

Task: Write a concrete scene description (2-3 sentences). Specify people, setting, lighting, mood. Be EXACTLY aligned with what the content describes. Output ultra-photorealistic—must be indistinguishable from real photography, with lifelike detail and authentic texture.
sceneType: ${section.isProductSection ? "Choose the most fitting from: before_after, doctor_recommendation, testimonial_with_product, product_mechanism, product_intro, transformation, other." : "Use null (this is not a product section)."}`;

  const result = await generateObject({
    model,
    schema: visualDescriptionSchema,
    system: IMAGE_GENERATION_GUIDELINE + gifBlock,
    prompt: contentAwarePrompt,
    maxOutputTokens: 4096,
  });

  return {
    description: result.object.description,
    sceneType: result.object.sceneType ?? undefined,
  };
}

/**
 * Builds the final prompt for the image model.
 * Uses the guideline's style directives so images match client needs.
 * When preferGif is true, adds motion-suggesting language for dynamic compositions.
 * When sceneType is provided (product sections), adds targeted style hints.
 */
export function buildImageModelPrompt(
  visualDescription: string,
  preferGif?: boolean,
  sceneType?: string,
): string {
  const motionHint =
    preferGif === true
      ? " Compose to suggest subtle motion: implied movement, dynamic angle, moment of transition, or process in progress. The scene should feel like a captured living moment."
      : "";
  const sceneHint =
    sceneType && SCENE_TYPE_HINTS[sceneType]
      ? ` ${SCENE_TYPE_HINTS[sceneType]}`
      : "";
  return `${visualDescription}${motionHint}${sceneHint}

${IMAGE_MODEL_STYLE_DIRECTIVE}`;
}
