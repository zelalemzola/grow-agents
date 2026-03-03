import { generateObject } from "ai";
import { z } from "zod";

/**
 * Builds a pure visual scene description from advertorial section copy.
 * No meta-rules, no guidelines - only what a photograph would show.
 * Used to avoid image models generating "image guidelines" or abstract concepts.
 */

const visualDescriptionSchema = z.object({
  description: z
    .string()
    .min(20)
    .max(200)
    .describe("1-2 sentences: what the photograph shows - people, setting, objects, lighting, mood"),
});

/**
 * Converts section copy into a concise visual description for image generation.
 * @param section - Section with title and content
 * @param model - LLM model for the conversion (e.g. gateway("openai/gpt-4.1-mini"))
 */
export async function buildVisualDescription(
  section: { title: string; content: string; id?: string },
  model: Parameters<typeof generateObject>[0]["model"],
): Promise<string> {
  const plainContent = section.content
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);

  const result = await generateObject({
    model,
    schema: visualDescriptionSchema,
    prompt: `Section title: ${section.title}

Section content: ${plainContent}

Task: Write 1-2 sentences describing what a photograph would show. Describe only the visual: people, setting, objects, lighting, mood. Be specific to this advertorial content. Do NOT mention guidelines, rules, AI, knowledge bases, or any meta-concepts. Output ONLY the scene description.`,
  });

  return result.object.description;
}

/**
 * Builds the final prompt for the image model. Minimal - just the scene and one style constraint.
 */
export function buildImageModelPrompt(visualDescription: string): string {
  return `${visualDescription}

Photorealistic, natural lighting. No text, logos, or graphics in the image.`;
}
