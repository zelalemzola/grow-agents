import { generateText } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  CRO_COPY_SYSTEM_PROMPT,
  CRO_COPY_CHUNK_SYSTEM_PROMPT,
  CRO_BRIDGE_SYSTEM_PROMPT,
  CRO_BRIDGE_CHUNK_SYSTEM_PROMPT,
  CRO_OPTIMIZER_SYSTEM_PROMPT,
  CRO_OPTIMIZER_CHUNK_SYSTEM_PROMPT,
} from "@/lib/cro-prompts";
import {
  splitCopyIntoChunks,
  extractBodyForCro,
  chunkHtmlBody,
  reassembleCroHtml,
  truncateForContext,
  CRO_CHUNK_SIZE,
  CRO_RESEARCH_MAX_CONTEXT,
  CRO_BRIDGE_CONTENT_MAX,
} from "@/lib/cro-chunking";
import { getGateway } from "@/lib/ai-gateway";
import { createServerSupabaseClient } from "@/utils/supabase/server";

/** Allow long-running chunked processing (many chunks = many API calls) */
export const maxDuration = 300;

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

function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```(?:html)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
}

async function runCopyOptimization(
  input: { existingCopy: string; customerResearch: string; projectName?: string; projectId?: string },
  model: ReturnType<ReturnType<typeof import("@/lib/ai-gateway").getGateway>>,
) {
  const chunks = splitCopyIntoChunks(input.existingCopy);
  const useChunking = chunks.length > 1;
  const researchContext = truncateForContext(input.customerResearch, CRO_RESEARCH_MAX_CONTEXT);

  if (!useChunking) {
    const userPrompt = `EXISTING COPY:\n${input.existingCopy}\n\nCUSTOMER RESEARCH:\n${input.customerResearch}\n\nReturn the JSON with optimizedCopy and explanation.`;

    const { text } = await generateText({
      model,
      system: CRO_COPY_SYSTEM_PROMPT,
      prompt: userPrompt,
      maxOutputTokens: 8192,
      temperature: 0.3,
    });

    return parseJsonResponse<{
      optimizedCopy: string;
      explanation: {
        insightsApplied: string[];
        objectionsAddressed: string[];
        reasoning: string;
      };
    }>(text);
  }

  const optimizedChunks: string[] = [];
  const explanations: Array<{
    insightsApplied: string[];
    objectionsAddressed: string[];
    reasoning: string;
  }> = [];

  for (let i = 0; i < chunks.length; i++) {
    const userPrompt = `This is SECTION ${i + 1} of ${chunks.length} of the copy. Optimize this section and maintain flow with the rest of the document.\n\nEXISTING COPY (section ${i + 1}):\n${chunks[i]}\n\nCUSTOMER RESEARCH:\n${researchContext}\n\nReturn the JSON with optimizedCopy and explanation.`;

    const { text } = await generateText({
      model,
      system: CRO_COPY_CHUNK_SYSTEM_PROMPT,
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

    optimizedChunks.push(result.optimizedCopy);
    explanations.push(result.explanation);
  }

  const combinedReasoning = explanations
    .map((e, i) => `Section ${i + 1}: ${e.reasoning}`)
    .join(" ");
  const combinedInsights = [...new Set(explanations.flatMap((e) => e.insightsApplied))];
  const combinedObjections = [...new Set(explanations.flatMap((e) => e.objectionsAddressed))];

  return {
    optimizedCopy: optimizedChunks.join("\n\n"),
    explanation: {
      insightsApplied: combinedInsights,
      objectionsAddressed: combinedObjections,
      reasoning: combinedReasoning.slice(0, 500) || "Applied customer research across all sections.",
    },
  };
}

async function runBridge(
  input: {
    funnelAHtml?: string;
    competitorHtml: string;
    assets?: {
      copy?: string;
      productDescription?: string;
      testimonials?: string;
      reviews?: string;
      trustElements?: string;
    };
    projectName?: string;
    projectId?: string;
  },
  model: ReturnType<ReturnType<typeof import("@/lib/ai-gateway").getGateway>>,
) {
  const extractResult = extractBodyForCro(input.competitorHtml);
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
    ? truncateForContext(
        `\nFUNNEL A (user's funnel — extract content from this):\n${input.funnelAHtml}`,
        CRO_BRIDGE_CONTENT_MAX,
      )
    : "";
  const contentContext = funnelABlock + assetsBlock;

  if (!extractResult.ok) {
    const bodyContent = extractResult.bodyContent;
    if (bodyContent.length <= CRO_CHUNK_SIZE) {
      const userPrompt = `${funnelABlock}\nREFERENCE FUNNEL B (replicate this structure exactly):\n${bodyContent}${assetsBlock}\n\nReturn the JSON with html, css, and explanation.`;

      const { text } = await generateText({
        model,
        system: CRO_BRIDGE_SYSTEM_PROMPT,
        prompt: userPrompt,
        maxOutputTokens: 65536,
        temperature: 0.2,
      });

      const result = parseJsonResponse<{ html: string; css: string; explanation: string }>(text);
      result.html = result.html.replace(/\\n/g, "\n");
      result.css = (result.css ?? "").replace(/\\n/g, "\n");
      return result;
    }
  }

  const bodyContent = extractResult.ok ? extractResult.bodyContent : input.competitorHtml;
  const chunks = chunkHtmlBody(bodyContent);
  const useChunking = chunks.length > 1;

  if (!useChunking) {
    const userPrompt = `${funnelABlock}\nREFERENCE FUNNEL B (replicate this structure exactly):\n${bodyContent}${assetsBlock}\n\nReturn the JSON with html, css, and explanation.`;

    const { text } = await generateText({
      model,
      system: CRO_BRIDGE_SYSTEM_PROMPT,
      prompt: userPrompt,
      maxOutputTokens: 65536,
      temperature: 0.2,
    });

    const result = parseJsonResponse<{ html: string; css: string; explanation: string }>(text);
    if (extractResult.ok) {
      result.html = reassembleCroHtml(
        extractResult.prefix,
        result.html.replace(/\\n/g, "\n"),
        extractResult.suffix,
        extractResult.scripts,
      );
    } else {
      result.html = result.html.replace(/\\n/g, "\n");
    }
    result.css = result.css?.replace(/\\n/g, "\n") ?? "";
    return result;
  }

  const processedChunks: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const userPrompt = `STRUCTURE CHUNK ${i + 1} of ${chunks.length} (replicate this layout and inject user content):\n${chunks[i]}\n\n${contentContext}\n\nOutput ONLY the raw HTML for this chunk. No JSON, no markdown, no explanation. It will be concatenated with other chunks.`;

    const { text } = await generateText({
      model,
      system: CRO_BRIDGE_CHUNK_SYSTEM_PROMPT,
      prompt: userPrompt,
      maxOutputTokens: 16384,
      temperature: 0.2,
    });

    let chunkHtml = stripMarkdownFences(text).replace(/\\n/g, "\n");
    processedChunks.push(chunkHtml);
  }

  const processedBody = processedChunks.join("");
  const html = extractResult.ok
    ? reassembleCroHtml(
        extractResult.prefix,
        processedBody,
        extractResult.suffix,
        extractResult.scripts,
      )
    : processedBody;

  return {
    html,
    css: "",
    explanation: `Bridged ${chunks.length} sections from reference funnel with user content.`,
  };
}

async function runOptimize(
  input: { funnelHtml: string; projectName?: string; projectId?: string },
  model: ReturnType<ReturnType<typeof import("@/lib/ai-gateway").getGateway>>,
) {
  const extractResult = extractBodyForCro(input.funnelHtml);
  const bodyContent = extractResult.ok ? extractResult.bodyContent : input.funnelHtml;
  const chunks = chunkHtmlBody(bodyContent);
  const useChunking = chunks.length > 1;

  if (!useChunking) {
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

    result.html = result.html.replace(/\\n/g, "\n");
    result.css = (result.css ?? "").replace(/\\n/g, "\n");
    if (extractResult.ok) {
      result.html = reassembleCroHtml(
        extractResult.prefix,
        result.html,
        extractResult.suffix,
        extractResult.scripts,
      );
    }
    return result;
  }

  const processedChunks: string[] = [];
  const allChanges: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const userPrompt = `FUNNEL CHUNK ${i + 1} of ${chunks.length} TO OPTIMIZE:\n${chunks[i]}\n\nOptimize this section for conversion. Return JSON with html and changes array.`;

    const { text } = await generateText({
      model,
      system: CRO_OPTIMIZER_CHUNK_SYSTEM_PROMPT,
      prompt: userPrompt,
      maxOutputTokens: 16384,
      temperature: 0.2,
    });

    const result = parseJsonResponse<{ html: string; changes: string[] }>(text);
    let chunkHtml = result.html.replace(/\\n/g, "\n");
    processedChunks.push(chunkHtml);
    allChanges.push(...(result.changes ?? []).map((c) => `[Section ${i + 1}] ${c}`));
  }

  const processedBody = processedChunks.join("");
  const html = extractResult.ok
    ? reassembleCroHtml(
        extractResult.prefix,
        processedBody,
        extractResult.suffix,
        extractResult.scripts,
      )
    : processedBody;

  return {
    html,
    css: "",
    report: {
      appliedChanges: allChanges,
      reasoning: `Optimized ${chunks.length} sections. ${allChanges.length} changes applied.`,
    },
  };
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
  const model = gateway("openai/gpt-4.1");

  try {
    if (input.mode === "copy") {
      const result = await runCopyOptimization(
        {
          existingCopy: input.existingCopy,
          customerResearch: input.customerResearch,
          projectName: input.projectName,
          projectId: input.projectId,
        },
        model,
      );

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
      const result = await runBridge(
        {
          funnelAHtml: input.funnelAHtml,
          competitorHtml: input.competitorHtml,
          assets: input.assets,
          projectName: input.projectName,
          projectId: input.projectId,
        },
        model,
      );

      const html = result.html;
      const css = result.css ?? "";
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
      const result = await runOptimize(
        {
          funnelHtml: input.funnelHtml,
          projectName: input.projectName,
          projectId: input.projectId,
        },
        model,
      );

      const html = result.html;
      const css = result.css ?? "";
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
