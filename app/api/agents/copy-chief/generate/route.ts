import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  buildLayeredSystemPrompt,
  buildUserPrompt,
  type CopyType,
} from "@/lib/copy-agent-prompts";
import { getGateway } from "@/lib/ai-gateway";
import { createServerSupabaseClient } from "@/utils/supabase/server";

export const maxDuration = 120;

const generateSchema = z.object({
  customerResearch: z.string().min(1, "Customer research is required"),
  productInformation: z.string().min(1, "Product information is required"),
  copyType: z.enum([
    "advertorial",
    "offer",
    "upsell",
    "listicle",
    "thankYou",
  ]),
  projectName: z.string().optional(),
  projectId: z.string().uuid().optional(),
});

const copyOutputSchema = z.object({
  copy: z.object({
    headline: z.string().describe("Main headline"),
    subheadline: z
      .string()
      .optional()
      .describe("Supporting subheadline or hook"),
    sections: z.array(
      z.object({
        type: z.enum([
          "body",
          "proof",
          "testimonial",
          "cta",
          "problem",
          "mechanism",
          "benefits",
          "guarantee",
          "other",
        ]),
        content: z.string().describe("Section content"),
      }),
    ),
    ctaBlocks: z
      .array(
        z.object({
          label: z.string(),
          urgency: z.string().optional(),
        }),
      )
      .optional(),
  }),
  researchReport: z.object({
    insightsApplied: z.array(z.string()).describe("Customer insights used"),
    objectionsAddressed: z.array(z.string()).describe("Objections addressed"),
    reasoning: z.string().describe("Why this messaging resonates"),
  }),
});

export type CopyOutput = z.infer<typeof copyOutputSchema>;

function formatCopyToText(output: CopyOutput): string {
  const { copy } = output;
  const parts: string[] = [];
  if (copy.headline) parts.push(copy.headline);
  if (copy.subheadline) parts.push(copy.subheadline);
  for (const section of copy.sections) {
    parts.push("");
    parts.push(`[${section.type.toUpperCase()}]`);
    parts.push(section.content);
  }
  if (copy.ctaBlocks?.length) {
    parts.push("");
    parts.push("[CTA]");
    for (const cta of copy.ctaBlocks) {
      parts.push(cta.label + (cta.urgency ? ` — ${cta.urgency}` : ""));
    }
  }
  return parts.join("\n").trim();
}

export async function POST(request: Request) {
  const parsed = await request.json().then((b) => generateSchema.safeParse(b));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const supabase = await createServerSupabaseClient();
  const gateway = getGateway();
  const model = gateway("anthropic/claude-opus-4.6");

  try {
    const systemPrompt = buildLayeredSystemPrompt(
      input.copyType as CopyType,
      undefined,
    );
    const userPrompt = buildUserPrompt(
      input.customerResearch,
      input.productInformation,
    );

    const { object } = await generateObject({
      model,
      schema: copyOutputSchema,
      system: systemPrompt,
      prompt: userPrompt,
      maxOutputTokens: 8192,
      temperature: 0.3,
    });

    const fullCopyText = formatCopyToText(object);
    const objective = `Copy Chief — ${input.copyType} — ${object.copy.headline.slice(0, 60)}...`;
    const meta = {
      copyType: input.copyType,
      researchReport: object.researchReport,
      structuredCopy: object.copy,
      customerResearch: input.customerResearch,
      productInformation: input.productInformation,
    };

    if (input.projectId) {
      const { data: existing } = await supabase
        .from("funnels")
        .select("id")
        .eq("id", input.projectId)
        .eq("agent_slug", "copy-chief")
        .single();

      if (existing) {
        const { data: updated, error } = await supabase
          .from("funnels")
          .update({
            latest_html: fullCopyText,
            latest_css: "",
            latest_images: meta,
            objective,
            updated_at: new Date().toISOString(),
          })
          .eq("id", input.projectId)
          .select()
          .single();

        if (error) throw new Error(error.message);
        return NextResponse.json({
          funnel: updated,
          result: {
            copy: object.copy,
            fullCopyText,
            researchReport: object.researchReport,
          },
        });
      }
    }

    const name =
      input.projectName?.trim() ||
      `Copy Chief ${input.copyType} ${new Date().toISOString().slice(0, 10)}`;
    const { data: inserted, error } = await supabase
      .from("funnels")
      .insert({
        agent_slug: "copy-chief",
        name,
        objective,
        template_id: null,
        latest_html: fullCopyText,
        latest_css: "",
        latest_images: meta,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({
      funnel: inserted,
      result: {
        copy: object.copy,
        fullCopyText,
        researchReport: object.researchReport,
      },
    });
  } catch (err) {
    console.error("[copy-chief generate]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed." },
      { status: 500 },
    );
  }
}
