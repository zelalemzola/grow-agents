import { generateObject } from "ai";
import { z } from "zod";

import {
  IMAGE_GENERATION_GUIDELINE,
  IMAGE_MODEL_STYLE_DIRECTIVE,
} from "@/lib/image-generation-guideline";

/**
 * Builds a pure visual scene description from advertorial section copy.
 * Uses the image generation guideline as system prompt for client-accurate outputs.
 * Images MUST directly illustrate the section's content and align with the whole funnel.
 */

const visualDescriptionSchema = z.object({
  description: z
    .string()
    .min(20)
    .max(350)
    .describe(
      "Concrete visual scene description - people, setting, objects, lighting, mood. Must directly illustrate THIS section's content.",
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
}

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
  },
  model: Parameters<typeof generateObject>[0]["model"],
  funnelContext?: FunnelContextForImage,
): Promise<string> {
  // Use section plan's imagePrompt only when it's concrete, section-specific, and non-generic
  if (section.imagePrompt && section.imagePrompt.trim().length >= 40) {
    const prompt = section.imagePrompt.trim();
    if (
      !/^(generic|stock|placeholder|example|sample|a photo|an image)/i.test(
        prompt,
      ) &&
      (section.title || section.content)
    ) {
      return prompt;
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
    testimonial: "TESTIMONIAL IMAGE: Show the person/situation implied by the testimonial. Editorial, trustworthy.",
    proof: "PROOF IMAGE: Show evidence—study scene, mechanism, or result. Educational, clinical-but-human.",
    image: "IMAGE SECTION: Illustrate the key concept of this section. Direct visual support for the copy.",
    faq: "FAQ IMAGE: Show the situation or question the FAQ addresses. Clear, low clutter.",
  };
  const typeHint = section.type ? typeGuidance[section.type] ?? "" : "";

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

  const result = await generateObject({
    model,
    schema: visualDescriptionSchema,
    system: IMAGE_GENERATION_GUIDELINE,
    prompt: `You are creating an image for a specific section of an advertorial funnel. The image MUST:
1) Directly illustrate THIS section's content (title + content below)
2) Align with the funnel's overall objective and story
3) Follow the guideline rules for this section type exactly

Section type: ${section.type ?? "body"}
Section ID: ${section.id ?? "unknown"}
Section title: ${section.title}
Section content: ${plainContent}
${typeHint ? `\nSection-type rules: ${typeHint}` : ""}
${funnelContextBlock}

Task: Write 1-2 sentences describing the photograph. Describe ONLY the visual scene: people, setting, objects, lighting, mood. Be specific to this content. Output ONLY the scene description—no meta-instructions.`,
  });

  return result.object.description;
}

/**
 * Builds the final prompt for the image model.
 * Uses the guideline's style directives so images match client needs.
 * When preferGif is true, adds motion-suggesting language for dynamic compositions.
 */
export function buildImageModelPrompt(
  visualDescription: string,
  preferGif?: boolean,
): string {
  const motionHint =
    preferGif === true
      ? " Compose to suggest subtle motion: implied movement, dynamic angle, moment of transition, or process in progress. The scene should feel like a captured living moment."
      : "";
  return `${visualDescription}${motionHint}

${IMAGE_MODEL_STYLE_DIRECTIVE}`;
}
