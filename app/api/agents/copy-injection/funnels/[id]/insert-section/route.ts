import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  FUNNEL_GENERATION_EXTRA_SYSTEM_PROMPT,
  agent1PromptContext,
} from "@/lib/agent1-guidelines";
import { getGateway } from "@/lib/ai-gateway";
import { createServerSupabaseClient } from "@/utils/supabase/server";

export const maxDuration = 120;

const bodySchema = z.object({
  afterSectionId: z.string().min(1),
  prompt: z.string().min(8),
  /** Optional product image (data URL) for visual reference in the new block */
  productImage: z.string().optional(),
  currentHtml: z.string().optional(),
});

const fragmentSchema = z.object({
  html: z.string().min(20),
  newSectionId: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/i),
});

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * Returns one HTML section fragment (no html/body) matching the funnel template,
 * to be inserted in the client after the given section.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id: funnelId } = await params;
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const supabase = await createServerSupabaseClient();
    const gateway = getGateway();

    const { data: funnel, error: funnelError } = await supabase
      .from("funnels")
      .select("id, name, objective, template_id, latest_html, agent_slug")
      .eq("id", funnelId)
      .single();

    if (funnelError || !funnel) {
      return NextResponse.json(
        { error: "Project not found." },
        { status: 404 },
      );
    }

    if (funnel.agent_slug !== "copy-injection") {
      return NextResponse.json(
        { error: "Not a copy-injection project." },
        { status: 400 },
      );
    }

    let templateBlock = "";
    if (funnel.template_id) {
      const { data: template } = await supabase
        .from("agent_templates")
        .select("name, instructions, html_scaffold")
        .eq("id", funnel.template_id)
        .eq("agent_slug", "copy-injection")
        .single();
      if (template?.html_scaffold) {
        templateBlock = template.html_scaffold;
      }
      if (template?.instructions) {
        templateBlock = `${template.instructions}\n\n${templateBlock}`;
      }
    }

    const workingHtml =
      parsed.data.currentHtml ?? (funnel.latest_html as string) ?? "";
    const excerpt = workingHtml.slice(0, 12000);
    const copyContext = agent1PromptContext([], "copy");

    const productNote = parsed.data.productImage
      ? "The user uploaded a product reference image (data URL omitted here). Match product visuals if the block includes product imagery."
      : "";

    const result = await generateObject({
      model: gateway("openai/gpt-4.1"),
      schema: fragmentSchema,
      system: FUNNEL_GENERATION_EXTRA_SYSTEM_PROMPT,
      maxOutputTokens: 8192,
      prompt: `${copyContext}

You output ONE new funnel section as HTML only (no <!DOCTYPE>, no html/head/body wrappers).

**CRITICAL:** Reuse the SAME class names, tag structure, and layout patterns as the template scaffold and the surrounding funnel. The new block must look like it belongs in this template—not a generic card.

**New section requirements:**
- Insert logically AFTER the element with id="${parsed.data.afterSectionId}".
- User request for content/layout: ${parsed.data.prompt}
${productNote}

**newSectionId:** A new unique slug (kebab-case), e.g. inserted-body-2 or extra-proof-1—must not collide with common ids; use a descriptive suffix.

**Template / scaffold reference:**
\`\`\`html
${templateBlock || "N/A — use clean section with section tag, max-width container, matching site style."}
\`\`\`

**Surrounding funnel HTML (truncated):**
\`\`\`html
${excerpt}
\`\`\`

Output JSON with "html" (the single section element tree, typically <section id="NEW_ID" data-section-type="..." class="...">...</section>) and "newSectionId".`,
    });

    const obj = result.object;
    if (!obj.html.includes(obj.newSectionId)) {
      return NextResponse.json(
        { error: "Generated HTML must include the new section id." },
        { status: 422 },
      );
    }

    return NextResponse.json({
      success: true,
      html: obj.html,
      newSectionId: obj.newSectionId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
