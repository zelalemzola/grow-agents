import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuditHtmlChunks } from "@/lib/funnel-audit-chunks";
import {
  funnelChunkAuditSchema,
  funnelFinalAuditSchema,
} from "@/lib/funnel-audit-schema";
import { getGateway } from "@/lib/ai-gateway";

export const maxDuration = 300;

const requestSchema = z.object({
  html: z.string(),
  css: z.string().optional().default(""),
  objective: z.string().optional().default(""),
  campaignContext: z.string().optional().default(""),
  funnelName: z.string().optional().default(""),
  locale: z.string().optional().default(""),
  market: z.string().optional().default(""),
});

const SYSTEM_CHUNK = `You are an expert conversion copy and landing-page auditor.
You receive ONE complete HTML section from a funnel (no truncation). Audit visible copy, headings, CTAs, trust signals, and clarity within this section only.
Output structured JSON only. Be specific and actionable.`;

const SYSTEM_MERGE = `You are an expert conversion strategist. You receive structured chunk-level audit results from a full funnel page, plus page objective and optional CSS (for context only—do not nitpick CSS syntax).
Produce ONE unified audit report. Aggregate counts from chunk findings. Write summary paragraphs for the marketer. Do not invent issues that contradict the chunk data.`;

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = requestSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid body", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { html, css, objective, campaignContext, funnelName, locale, market } =
      parsed.data;

    if (!html.trim()) {
      return NextResponse.json({ error: "html is required" }, { status: 400 });
    }

    const gateway = getGateway();
    const model = gateway("openai/gpt-4.1");

    const chunks = getAuditHtmlChunks(html);
    const chunkResults: {
      sectionId: string;
      audit: z.infer<typeof funnelChunkAuditSchema>;
    }[] = [];

    const objectiveBlock = [
      funnelName && `Funnel name: ${funnelName}`,
      objective && `Objective: ${objective}`,
      campaignContext && `Campaign context: ${campaignContext}`,
      (locale || market) &&
        `Target locale/market: ${[locale, market].filter(Boolean).join(" / ")}`,
    ]
      .filter(Boolean)
      .join("\n");

    for (const { sectionId, html: chunkHtml } of chunks) {
      const prompt = `${objectiveBlock ? `${objectiveBlock}\n\n` : ""}## Section id
${sectionId}

## Section HTML (complete)
${chunkHtml}

Return JSON matching the schema.`;

      const { object } = await generateObject({
        model,
        schema: funnelChunkAuditSchema,
        system: SYSTEM_CHUNK,
        prompt,
        maxOutputTokens: 8192,
      });

      chunkResults.push({ sectionId, audit: object });
    }

    const mergePayload = {
      funnelMeta: {
        funnelName: funnelName || undefined,
        objective: objective || undefined,
        campaignContext: campaignContext || undefined,
        locale: locale || undefined,
        market: market || undefined,
      },
      chunkAudits: chunkResults,
      cssLength: css.length,
      fullCssForContext: css,
    };

    const mergePrompt = `## Chunk audits (complete JSON)
${JSON.stringify(mergePayload.chunkAudits, null, 2)}

## Page objective / meta
${JSON.stringify(mergePayload.funnelMeta, null, 2)}

## Full CSS (complete — use only for visual/context understanding, not line-by-line linting)
\`\`\`css
${mergePayload.fullCssForContext}
\`\`\`

Synthesize the final unified audit. Count fixable vs advisory from all chunk findings.`;

    const { object: finalReport } = await generateObject({
      model,
      schema: funnelFinalAuditSchema,
      system: SYSTEM_MERGE,
      prompt: mergePrompt,
      maxOutputTokens: 16384,
    });

    return NextResponse.json({
      ok: true,
      final: finalReport,
      /** Full per-section audits (findings + summaries) for UI drill-down and apply-fixes. */
      chunkAudits: chunkResults,
      chunks: chunkResults.map((c) => ({
        sectionId: c.sectionId,
        findingsCount: c.audit.findings.length,
        sectionSummary: c.audit.sectionSummary,
      })),
      meta: {
        sectionCount: chunks.length,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: message.slice(0, 500) },
      { status: 500 },
    );
  }
}
