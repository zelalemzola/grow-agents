import { generateObject } from "ai";
import { z } from "zod";
import type { LanguageModel } from "ai";

const schema = z.object({
  isProductSection: z.boolean().describe("True if this section discusses, presents, or focuses on the product being advertised"),
});

/**
 * Classifies whether the given section content is about the product.
 * Used to decide when to apply product reference images during generation.
 */
export async function classifyIsProductSection(
  sectionContent: string,
  fullObjective: string,
  model: LanguageModel,
): Promise<boolean> {
  const plainContent = sectionContent
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);

  const objectivePreview = fullObjective.slice(0, 800);

  const result = await generateObject({
    model,
    schema,
    prompt: `You are classifying advertorial sections. Does this section talk about the product, show the product, or focus on anything product-related?

Return isProductSection: true ONLY when the section is about:
- The product itself (introduction, how it works, what it looks like, delivery format)
- People discussing or talking about the product (testimonials, reviews, experiences with the product)
- Anything directly related to the product (benefits, mechanism of the product, using the product)

Return isProductSection: false when the section is about:
- The problem or condition (before any product is introduced)
- General mechanism of the disease/condition (not the product)
- Scientific proof or studies (unless the study is about the product)
- Offer, CTA, pricing
- FAQ or instructions (unless focused on the product)
- Any content that does not mention or relate to the product

Section content to classify:
${plainContent}

Full advertorial objective (for context on what the product is):
${objectivePreview}`,
  });

  return result.object.isProductSection;
}
