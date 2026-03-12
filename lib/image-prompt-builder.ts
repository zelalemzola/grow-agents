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
    .max(500)
    .describe(
      "Ultra-photorealistic scene description. Specify: who (people, roles, gender when a person is mentioned), what is happening, setting, lighting, mood. Must match the section content exactly. Describe as if directing a documentary—lifelike, authentic, real photography.",
    ),
  /** For product sections: scene type to apply targeted style hints. Use null when not a product section. */
  sceneType: sceneTypeSchema.nullable(),
  /** When content mentions a person (testimonial, reviewer, customer), their gender. CRITICAL: Use to ensure image shows correct person. */
  personGender: z
    .enum(["woman", "man", "unspecified"])
    .nullable()
    .describe(
      "If content mentions a specific person by name or pronouns (she/he, her/him), set woman or man. Use unspecified only when no person or gender cannot be determined.",
    ),
  /** When content describes a person's result, experience, or testimonial with the product—image must be selfie-style. ALWAYS true for testimonials. True when section discusses the product that shows a person. */
  requiresSelfie: z
    .boolean()
    .describe(
      "ALWAYS true for testimonial sections. True when section discusses the product AND shows a person (customer, reviewer, someone's result/experience). Image MUST be a selfie of that person holding or using the product.",
    ),
  /** Image type: product_only = product shot (no person), selfie = person holding/using product, section_image = general section illustration */
  imageType: z
    .enum(["product_only", "selfie", "section_image"])
    .describe(
      "product_only: content discusses ONLY the product (mechanism, benefits)—show product clearly, no person. selfie: content mentions a person's experience/testimonial with product—show that person in selfie with product. section_image: general section—illustrate the concept, mechanism, or scene from the content.",
    ),
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
  /** Section IDs to explicitly differentiate from—ensures unique image per section */
  differentFromIds?: string[];
  /** This section's index in the funnel (0-based) for uniqueness hints */
  sectionIndex?: number;
}

/** Scene-specific style hints for product sections */
const SCENE_TYPE_HINTS: Record<string, string> = {
  before_after: "Split or side-by-side composition, transformation reveal, realistic before/after, authentic results.",
  doctor_recommendation: "Doctor or expert in clinical/lab setting holding the product, professional but approachable, recommending or demonstrating it. Show the doctor clearly holding the product.",
  testimonial_with_product:
    "SELFIE-STYLE (exactly like real customer photo): Person taking the photo themselves, arm extended, first-person POV. Person smiling warmly at camera, holding the product prominently with both hands—product label clearly visible facing camera. Indoor home setting (kitchen, living room, cozy background). Natural window light, candid, not staged. MUST match the testimonial subject's gender (woman or man from content). Authentic testimonial selfie—older adult, relaxed, satisfied.",
  product_mechanism: "Product clearly visible. Clear visual of how product works, mechanism in action, educational and precise. Show the product in use or demonstrating its mechanism.",
  product_intro: "Product clearly visible in frame, editorial presentation, not staged advertising. Product is the focal point.",
  transformation:
    "SELFIE-STYLE when showing a person: first-person POV, person holding or using the product, moment of change. Authentic progress, real-person feel.",
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
  const plainContent = section.content
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1800);

  const typeGuidance: Record<string, string> = {
    headline:
      "HEADLINE IMAGE: Create extreme curiosity. Show the hinted situation/moment from the headline—do NOT show the solution or product. Unfinished, in-progress feel. Curiosity over clarity.",
    hook: "HOOK IMAGE: Show the opening scene or emotion the hook suggests. Candid, observational. Editorial tone.",
    body: "BODY IMAGE: Visually explain this section's single core idea. One idea = one image. Must simplify and clarify what the reader just read. If content mentions a person's result/experience with a product: SELFIE of that person holding/using it. Match person's gender (woman/man) from content. Explain, don't decorate.",
    cta: "CTA IMAGE: Show the outcome or transformation the CTA promises. Subtle, editorial. No ad-like elements.",
    testimonial:
      "TESTIMONIAL IMAGE (MANDATORY SELFIE—like real customer review photo): Person taking the photo themselves, arm extended, first-person POV. Smiling warmly at camera, holding product prominently with both hands—product label visible. Indoor home setting (kitchen, living room). Natural light, candid. MUST match reviewer's gender (Sarah/Lisa=woman, John/Mike=man). Older adult, relaxed, authentic testimonial feel.",
    proof: "PROOF IMAGE: Show evidence—study scene, mechanism, or result. Educational, clinical-but-human.",
    image: "IMAGE SECTION: Illustrate the key concept of this section. If about a person's experience: selfie of them with the product. Match gender. Direct visual support for the copy.",
    faq: "FAQ IMAGE: Show the situation or question the FAQ addresses. Clear, low clutter.",
  };
  const typeHint = section.type ? typeGuidance[section.type] ?? "" : "";

  const gifBlock =
    section.preferGif === true
      ? `\n\n---\nGIF/MECHANISM ANIMATION RULES (MANDATORY for this GIF):\n${getGifGenerationGuideline().slice(0, 2500)}`
      : "";

  const otherSections =
    funnelContext?.sectionSummaries?.filter((s) => s.id !== section.id) ?? [];
  const funnelContextBlock = funnelContext
    ? `
FUNNEL CONTEXT:
- Page/offer: ${funnelContext.pageName}
- Objective: ${funnelContext.objective.slice(0, 400)}
${otherSections.length > 0 ? `
Other sections (do NOT mix their content into this image. Each section gets a UNIQUE image):
${otherSections.map((s) => `- ${s.id} (${s.title}): ${s.contentPreview.slice(0, 60)}...`).join("\n")}` : ""}
`
    : "";

  const differentFromList = funnelContext?.differentFromIds?.length
    ? funnelContext.differentFromIds.map((id) => id).join(", ")
    : otherSections.map((s) => s.id).join(", ");
  const uniquenessBlock =
    (otherSections.length > 0 || differentFromList || section.id)
      ? `
UNIQUENESS (CRITICAL): This image is for section "${section.id ?? "this section"}" only. Each section gets a DIFFERENT image. Your description MUST be unique and visually distinct from sections: ${differentFromList || "other sections"}. Use different person (when showing people), different composition, different setting, angle, or moment. Never describe a generic scene that could apply to multiple sections. Include specific differentiating details (e.g. different room, different angle, different expression).`
      : "";

  const productGuidelinesBlock =
    section.isProductSection && funnelContext?.productGuidelines?.trim()
      ? `\n\nPRODUCT-SPECIFIC GUIDELINES (follow these for this product):\n${funnelContext.productGuidelines.trim().slice(0, 1500)}`
      : "";

  const contentAwarePrompt = `You are creating a HYPERREALISTIC image for ONE specific section. The content below is the ONLY source for your description—use it to generate a unique, section-specific prompt.

**CONTENT-ONLY RULE:** Your output must derive EXCLUSIVELY from the content below. This image will appear right next to this content. Analyze and determine:
- WHO is in the scene (doctor, patient, happy customer, researcher, etc.)
- WHAT is happening (before/after reveal, recommendation, holding product, transformation, mechanism)
- WHERE it takes place (lab, clinic, home, office)
- TONE (clinical, hopeful, testimonial, educational)

CRITICAL RULES (MANDATORY):
1. GENDER MATCHING: If the content mentions a woman (by name like Sarah, Lisa, or pronouns she/her), the image MUST show a woman. If it mentions a man (John, Mike, he/him), show a man. Set personGender accordingly. Your description MUST explicitly state "a woman" or "a man" when a person is depicted.
2. SELFIE FOR TESTIMONIALS & PRODUCT+PERSON (MANDATORY): Testimonial sections ALWAYS require requiresSelfie: true. Any section that discusses the product AND shows a person (reviewer, customer, someone's result/experience) ALSO requires requiresSelfie: true. The image MUST be a selfie—first-person POV, person holding or using the product, as if they took the photo themselves. Candid, authentic, not a professional shoot. Person and product visible in frame.
3. EXACT CONTENT MATCH: The image must depict EXACTLY and ONLY what this section describes. Do not mix concepts from other sections. Direct visual translation of this section's content only.
4. UNIQUENESS: This image must be visually distinct from other funnel images. Unique composition, different person/scene/setting. No generic or repetitive descriptions.
5. PRODUCT VISIBILITY: When the section discusses the product (mechanism, benefits, how it works), ensure the product is clearly visible. For product-intro: product in frame as focal point. For mechanism: show how it works.

Section type: ${section.type ?? "body"}
Section title: ${section.title}
Section content: ${plainContent}
${typeHint ? `\nSection-type rules: ${typeHint}` : ""}
${funnelContextBlock}
${uniquenessBlock}
${productGuidelinesBlock}

${section.preferGif ? "This will be ANIMATED (GIF/video). Describe a moment of transition, process in progress, or cause-effect in motion." : ""}
${section.isProductSection ? "This section discusses the product. Describe the scene so the product is clearly incorporated—show it in context. If a product reference image is provided, match that product exactly. When showing people with the product, include the product visibly in their hands or in use." : ""}

**IMAGE TYPE (set imageType):** From the content, determine: (a) product_only—content discusses ONLY the product, no person mentioned → show product clearly; (b) selfie—content mentions a person's experience, testimonial, or result with product → selfie of that person with product; (c) section_image—general mechanism, concept, or scene → illustrate that specific idea.

Task: Write a concrete scene description (2-3 sentences) derived ONLY from the content below. Specify people (and gender), setting, lighting, mood. Ultra-photorealistic.
sceneType: ${section.isProductSection ? "Choose: before_after, doctor_recommendation, testimonial_with_product, product_mechanism, product_intro, transformation, other." : "Use null."}
imageType: Set based on content analysis above.`;

  const result = await generateObject({
    model,
    schema: visualDescriptionSchema,
    system: IMAGE_GENERATION_GUIDELINE + gifBlock,
    prompt: contentAwarePrompt,
    maxOutputTokens: 4096,
  });

  let description = result.object.description;

  // Reinforce gender when LLM extracted it but description may lack explicit mention
  const personGender = result.object.personGender ?? undefined;
  if (personGender === "woman" && !/\b(woman|female|she|her)\b/i.test(description)) {
    description = `A woman, ${description.charAt(0).toLowerCase() + description.slice(1)}`;
  } else if (personGender === "man" && !/\b(man|male|he|him|his)\b/i.test(description)) {
    description = `A man, ${description.charAt(0).toLowerCase() + description.slice(1)}`;
  }

  // Force selfie for testimonials and product+person; never for product_only
  const imageType = (result.object as { imageType?: string }).imageType;
  const forceSelfie =
    imageType !== "product_only" &&
    (section.type === "testimonial" ||
      result.object.requiresSelfie ||
      imageType === "selfie" ||
      ["testimonial_with_product", "transformation", "before_after"].includes(
        result.object.sceneType ?? "",
      ));
  if (forceSelfie && !/selfie|first-person|holding the product|using the product/i.test(description)) {
    description = `Selfie-style photo, first-person POV, person holding or using the product. ${description}`;
  }
  if (imageType === "product_only" && !/product|product's|the product/i.test(description)) {
    description = `Product clearly visible in frame, focal point. ${description}`;
  }

  return {
    description,
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
