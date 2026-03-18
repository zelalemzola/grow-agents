import { generateText } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  CRO_COPY_SYSTEM_PROMPT,
  CRO_BRIDGE_SYSTEM_PROMPT,
  CRO_OPTIMIZER_SYSTEM_PROMPT,
} from "@/lib/cro-prompts";
import { getGateway } from "@/lib/ai-gateway";
import { createServerSupabaseClient } from "@/utils/supabase/server";

export const maxDuration = 120;

const copyInputSchema = z.object({
  mode: z.literal("copy"),
  existingCopy: z.string().min(1),
  customerResearch: z.string().min(1),
  projectName: z.string().optional(),
  projectId: z.string().uuid().optional(),
});

const bridgeInputSchema = z.object({
  mode: z.literal("bridge"),
  funnelAHtml: z.string().optional(),
  competitorHtml: z.string().min(1),
  assets: z
    .object({
      copy: z.string().optional(),
      productDescription: z.string().optional(),
      testimonials: z.string().optional(),
      reviews: z.string().optional(),
      trustElements: z.string().optional(),
    })
    .optional(),
  projectName: z.string().optional(),
  projectId: z.string().uuid().optional(),
});

const optimizeInputSchema = z.object({
  mode: z.literal("optimize"),
  funnelHtml: z.string().min(1),
  projectName: z.string().optional(),
  projectId: z.string().uuid().optional(),
});

const generateSchema = z.discriminatedUnion("mode", [
  copyInputSchema,
  bridgeInputSchema,
  optimizeInputSchema,
]);

type GenerateInput = z.infer<typeof generateSchema>;

function parseJsonResponse<T>(text: string): T {
  const cleaned = text
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
  return JSON.parse(cleaned) as T;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const supabase = await createServerSupabaseClient();
  const gateway = getGateway();

  // Use a capable model for CRO reasoning (PDF specified Claude Opus; gateway may map to openai/gpt-4.1 or anthropic)
  const model = gateway("openai/gpt-4.1");

  try {
    if (input.mode === "copy") {
      const userPrompt = `EXISTING COPY:\n${input.existingCopy}\n\nCUSTOMER RESEARCH:\n${input.customerResearch}\n\nReturn the JSON with optimizedCopy and explanation.`;

      const { text } = await generateText({
        model,
        system: CRO_COPY_SYSTEM_PROMPT,
        prompt: userPrompt,
        maxOutputTokens: 8192,
        temperature: 0.3,
      });

      const result = parseJsonResponse<{
        optimizedCopy: string;
        explanation: {
          insightsApplied: string[];
          objectionsAddressed: string[];
          reasoning: string;
        };
      }>(text);

      const objective = `Copy optimization — ${result.explanation.reasoning?.slice(0, 80) ?? "Applied customer research"}`;
      const meta = {
        mode: "copy",
        explanation: result.explanation,
        existingCopy: input.existingCopy,
        customerResearch: input.customerResearch,
      };

      if (input.projectId) {
        const { data: existing } = await supabase
          .from("funnels")
          .select("id")
          .eq("id", input.projectId)
          .eq("agent_slug", "new-funnel")
          .single();

        if (existing) {
          const { data: updated, error } = await supabase
            .from("funnels")
            .update({
              latest_html: result.optimizedCopy,
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
            result: { optimizedCopy: result.optimizedCopy, explanation: result.explanation },
          });
        }
      }

      const name =
        input.projectName?.trim() ||
        `Copy optimization ${new Date().toISOString().slice(0, 10)}`;
      const { data: inserted, error } = await supabase
        .from("funnels")
        .insert({
          agent_slug: "new-funnel",
          name,
          objective,
          template_id: null,
          latest_html: result.optimizedCopy,
          latest_css: "",
          latest_images: meta,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return NextResponse.json({
        funnel: inserted,
        result: { optimizedCopy: result.optimizedCopy, explanation: result.explanation },
      });
    }

    if (input.mode === "bridge") {
      const assetsBlock = input.assets
        ? `
USER ASSETS (inject these into the structure):
- Copy: ${input.assets.copy ?? "(none)"}
- Product description: ${input.assets.productDescription ?? "(none)"}
- Testimonials: ${input.assets.testimonials ?? "(none)"}
- Reviews: ${input.assets.reviews ?? "(none)"}
- Trust elements: ${input.assets.trustElements ?? "(none)"}
`
        : "";
      const funnelABlock = input.funnelAHtml
        ? `\nFUNNEL A (user's funnel — extract content from this):\n${input.funnelAHtml}\n`
        : "";
      const userPrompt = `${funnelABlock}\nREFERENCE FUNNEL B (replicate this structure exactly):\n${input.competitorHtml}${assetsBlock}\n\nReturn the JSON with html, css, and explanation.`;

      const { text } = await generateText({
        model,
        system: CRO_BRIDGE_SYSTEM_PROMPT,
        prompt: userPrompt,
        maxOutputTokens: 65536,
        temperature: 0.2,
      });

      const result = parseJsonResponse<{
        html: string;
        css: string;
        explanation: string;
      }>(text);

      const html = result.html.replace(/\\n/g, "\n");
      const css = (result.css ?? "").replace(/\\n/g, "\n");
      const objective = `Funnel bridge — ${result.explanation?.slice(0, 80) ?? "Replicated structure with user content"}`;
      const meta = { mode: "bridge", explanation: result.explanation };

      if (input.projectId) {
        const { data: existing } = await supabase
          .from("funnels")
          .select("id")
          .eq("id", input.projectId)
          .eq("agent_slug", "new-funnel")
          .single();

        if (existing) {
          const { data: updated, error } = await supabase
            .from("funnels")
            .update({
              latest_html: html,
              latest_css: css,
              latest_images: meta,
              objective,
              updated_at: new Date().toISOString(),
            })
            .eq("id", input.projectId)
            .select()
            .single();

          if (error) throw new Error(error.message);
          return NextResponse.json({ funnel: updated, result: { html, css, explanation: result.explanation } });
        }
      }

      const name =
        input.projectName?.trim() ||
        `Funnel bridge ${new Date().toISOString().slice(0, 10)}`;
      const { data: inserted, error } = await supabase
        .from("funnels")
        .insert({
          agent_slug: "new-funnel",
          name,
          objective,
          template_id: null,
          latest_html: html,
          latest_css: css,
          latest_images: meta,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return NextResponse.json({ funnel: inserted, result: { html, css, explanation: result.explanation } });
    }

    if (input.mode === "optimize") {
      const userPrompt = `FUNNEL HTML TO OPTIMIZE:\n${input.funnelHtml}\n\nAnalyze, identify opportunities, and return the JSON with html, css, and report.`;

      const { text } = await generateText({
        model,
        system: CRO_OPTIMIZER_SYSTEM_PROMPT,
        prompt: userPrompt,
        maxOutputTokens: 65536,
        temperature: 0.2,
      });

      const result = parseJsonResponse<{
        html: string;
        css: string;
        report: { appliedChanges: string[]; reasoning: string };
      }>(text);

      const html = result.html.replace(/\\n/g, "\n");
      const css = (result.css ?? "").replace(/\\n/g, "\n");
      const objective = `Funnel optimize — ${result.report?.reasoning?.slice(0, 80) ?? "Applied CRO patterns"}`;
      const meta = { mode: "optimize", report: result.report };

      if (input.projectId) {
        const { data: existing } = await supabase
          .from("funnels")
          .select("id")
          .eq("id", input.projectId)
          .eq("agent_slug", "new-funnel")
          .single();

        if (existing) {
          const { data: updated, error } = await supabase
            .from("funnels")
            .update({
              latest_html: html,
              latest_css: css,
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
            result: { html, css, report: result.report },
          });
        }
      }

      const name =
        input.projectName?.trim() ||
        `Funnel optimize ${new Date().toISOString().slice(0, 10)}`;
      const { data: inserted, error } = await supabase
        .from("funnels")
        .insert({
          agent_slug: "new-funnel",
          name,
          objective,
          template_id: null,
          latest_html: html,
          latest_css: css,
          latest_images: meta,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return NextResponse.json({
        funnel: inserted,
        result: { html, css, report: result.report },
      });
    }

    return NextResponse.json({ error: "Unknown mode." }, { status: 400 });
  } catch (err) {
    console.error("[new-funnel] generate error:", err);
    const message =
      err instanceof Error ? err.message : "Generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
