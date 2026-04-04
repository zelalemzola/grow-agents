import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  extractSectionOuterHtmlById,
  replaceSectionOuterHtmlString,
} from "@/lib/funnel-audit-chunks";
import { getGateway } from "@/lib/ai-gateway";

export const maxDuration = 300;

const findingSchema = z.object({
  message: z.string(),
  detail: z.string(),
  severity: z.enum(["fixable", "advisory"]),
});

const groupSchema = z.object({
  sectionId: z.string(),
  findings: z.array(findingSchema).min(1),
});

const requestSchema = z.object({
  html: z.string(),
  objective: z.string().optional().default(""),
  groups: z.array(groupSchema).min(1),
});

const sectionFixSchema = z.object({
  newOuterHtml: z.string(),
});

const fullPageFixSchema = z.object({
  newFullHtml: z.string(),
});

const SYSTEM_SECTION = `You rewrite ONE <section> of a funnel page to address specific audit findings.

CRITICAL — preserve accuracy and template fidelity:
- Keep the SAME root tag (<section>) and EVERY attribute on it: id, class, data-section-type, etc.
- Do NOT remove or rename classes, ids, or data attributes.
- Preserve ALL {{image:...}} or media placeholders exactly.
- Preserve tag structure and nesting; change only text/copy where needed to address the findings.
- Do not add new sections or remove existing child elements unless a finding explicitly requires a minimal wording fix inside an existing node.
- Output ONLY the single section's outer HTML, nothing else.`;

const SYSTEM_FULL = `You revise a funnel HTML fragment (possibly a full mini-document) to address audit findings.

CRITICAL:
- Preserve structure, classes, ids, data attributes, and every {{image:...}} placeholder.
- Change copy/text only where needed to address the listed findings.
- Output the complete revised HTML only.`;

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

    const { html, objective, groups } = parsed.data;
    if (!html.trim()) {
      return NextResponse.json({ error: "html is required" }, { status: 400 });
    }

    const gateway = getGateway();
    const model = gateway("openai/gpt-4.1");

    let out = html;

    const isFullPageOnly =
      groups.length === 1 && groups[0]!.sectionId === "_page";

    if (isFullPageOnly) {
      const findings = groups[0]!.findings;
      const prompt = `${objective ? `Page objective: ${objective}\n\n` : ""}## Findings to address
${JSON.stringify(findings, null, 2)}

## Full HTML (complete — preserve structure)
${out}

Return the full revised HTML.`;

      const { object } = await generateObject({
        model,
        schema: fullPageFixSchema,
        system: SYSTEM_FULL,
        prompt,
        maxOutputTokens: 65536,
      });

      return NextResponse.json({ ok: true, html: object.newFullHtml });
    }

    for (const group of groups) {
      const { sectionId, findings } = group;
      const currentOuter = extractSectionOuterHtmlById(out, sectionId);
      if (!currentOuter) {
        return NextResponse.json(
          { error: `Section not found in HTML: ${sectionId}` },
          { status: 400 },
        );
      }

      const prompt = `${objective ? `Page objective: ${objective}\n\n` : ""}## Section id
${sectionId}

## Findings to address
${JSON.stringify(findings, null, 2)}

## Current section HTML (complete)
${currentOuter}

Return JSON with newOuterHtml: the full revised <section>…</section> only.`;

      const { object } = await generateObject({
        model,
        schema: sectionFixSchema,
        system: SYSTEM_SECTION,
        prompt,
        maxOutputTokens: 32768,
      });

      out = replaceSectionOuterHtmlString(out, sectionId, object.newOuterHtml);
    }

    return NextResponse.json({ ok: true, html: out });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: message.slice(0, 500) },
      { status: 500 },
    );
  }
}
