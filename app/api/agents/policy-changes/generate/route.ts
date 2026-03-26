import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  chunkHtmlBody,
  extractBodyForCro,
  reassembleCroHtml,
} from "@/lib/cro-chunking";
import { getGateway } from "@/lib/ai-gateway";
import {
  buildPolicyChangesChunkPrompt,
  POLICY_CHANGES_SYSTEM_PROMPT,
} from "@/lib/policy-changes-prompts";
import { createServerSupabaseClient } from "@/utils/supabase/server";

export const maxDuration = 300;

const generateSchema = z.object({
  html: z.string().min(1, "HTML is required"),
  policyInstructions: z.string().min(1, "Policy instructions are required"),
  strictMode: z.boolean().optional(),
  projectName: z.string().optional(),
  projectId: z.string().uuid().optional(),
});

const changeItemSchema = z.object({
  section: z.string().describe("Section identifier or short label"),
  before: z.string().describe("Original violating text"),
  after: z.string().describe("Updated compliant text"),
  reason: z.string().describe("Why this was changed"),
  policyInstruction: z
    .string()
    .describe("The specific policy instruction this edit maps to"),
});

const chunkOutputSchema = z.object({
  editedHtml: z.string().describe("Edited HTML for this chunk only"),
  changes: z.array(changeItemSchema).default([]),
});

type ChangeItem = z.infer<typeof changeItemSchema>;
const MAX_CHUNK_RETRIES = 2;

function getTagSignature(html: string): string[] {
  const tags: string[] = [];
  const regex = /<\/?([a-zA-Z][\w:-]*)\b[^>]*>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) != null) {
    const full = match[0];
    if (full.startsWith("<!--") || full.startsWith("<!DOCTYPE")) continue;
    const name = match[1].toLowerCase();
    const isClose = full.startsWith("</");
    tags.push(`${isClose ? "/" : ""}${name}`);
  }
  return tags;
}

function sameStructure(a: string, b: string): boolean {
  const aSig = getTagSignature(a);
  const bSig = getTagSignature(b);
  if (aSig.length !== bSig.length) return false;
  for (let i = 0; i < aSig.length; i++) {
    if (aSig[i] !== bSig[i]) return false;
  }
  return true;
}

function summarizeObjective(changes: ChangeItem[]): string {
  if (changes.length === 0) {
    return "Policy changes — no violations found in latest run";
  }
  const first = changes[0]?.reason?.trim() || "compliance edits";
  return `Policy changes — ${changes.length} edits — ${first.slice(0, 64)}`;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
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
  const model = gateway("anthropic/claude-opus-4.6");
  const strictMode = input.strictMode ?? false;

  try {
    const extractResult = extractBodyForCro(input.html);
    const bodyContent = extractResult.ok ? extractResult.bodyContent : input.html;
    const chunks = chunkHtmlBody(bodyContent);

    const processedChunks: string[] = [];
    const allChanges: ChangeItem[] = [];
    const skippedChunks: number[] = [];
    const retriedChunks: number[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      let finalEditedChunk: string | null = null;
      let finalChanges: ChangeItem[] = [];
      let retryReason: string | undefined;

      for (let attempt = 0; attempt <= MAX_CHUNK_RETRIES; attempt++) {
        const prompt = buildPolicyChangesChunkPrompt({
          chunkHtml: chunk,
          chunkIndex: i,
          chunkCount: chunks.length,
          policyInstructions: input.policyInstructions,
          strictMode,
          retryReason,
        });

        try {
          const { object } = await generateObject({
            model,
            schema: chunkOutputSchema,
            system: POLICY_CHANGES_SYSTEM_PROMPT,
            prompt,
            maxOutputTokens: 16384,
            temperature: strictMode ? 0 : 0.1,
          });

          const editedChunk = object.editedHtml?.trim() || chunk;
          const validStructure = sameStructure(chunk, editedChunk);
          if (!validStructure) {
            retryReason = "HTML structure changed. Preserve exact tag sequence.";
            if (attempt < MAX_CHUNK_RETRIES) {
              retriedChunks.push(i + 1);
              continue;
            }
            break;
          }

          finalEditedChunk = editedChunk;
          finalChanges = object.changes;
          break;
        } catch (err) {
          retryReason =
            err instanceof Error
              ? err.message
              : "Model response failed schema validation.";
          if (attempt < MAX_CHUNK_RETRIES) {
            retriedChunks.push(i + 1);
            continue;
          }
        }
      }

      if (finalEditedChunk == null) {
        processedChunks.push(chunk);
        skippedChunks.push(i + 1);
        continue;
      }

      processedChunks.push(finalEditedChunk);
      allChanges.push(...finalChanges);
    }

    const mergedBody = processedChunks.join("");
    const updatedHtml = extractResult.ok
      ? reassembleCroHtml(
          extractResult.prefix,
          mergedBody,
          extractResult.suffix,
          extractResult.scripts,
        )
      : mergedBody;

    const objective = summarizeObjective(allChanges);
    const meta = {
      mode: "policy-changes",
      policyInstructions: input.policyInstructions,
      strictMode,
      changeLog: allChanges,
      chunkCount: chunks.length,
      skippedChunks,
      retriedChunks,
      originalHtmlLength: input.html.length,
      updatedHtmlLength: updatedHtml.length,
    };

    if (input.projectId) {
      const { data: existing } = await supabase
        .from("funnels")
        .select("id")
        .eq("id", input.projectId)
        .eq("agent_slug", "policy-changes")
        .single();

      if (existing) {
        const { data: updated, error } = await supabase
          .from("funnels")
          .update({
            latest_html: updatedHtml,
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
            html: updatedHtml,
            changeLog: allChanges,
            chunkCount: chunks.length,
            skippedChunks,
            retriedChunks,
            strictMode,
          },
        });
      }
    }

    const name =
      input.projectName?.trim() ||
      `Policy Changes ${new Date().toISOString().slice(0, 10)}`;
    const { data: inserted, error } = await supabase
      .from("funnels")
      .insert({
        agent_slug: "policy-changes",
        name,
        objective,
        template_id: null,
        latest_html: updatedHtml,
        latest_css: "",
        latest_images: meta,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({
      funnel: inserted,
      result: {
        html: updatedHtml,
        changeLog: allChanges,
        chunkCount: chunks.length,
        skippedChunks,
        retriedChunks,
        strictMode,
      },
    });
  } catch (err) {
    console.error("[policy-changes generate]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed." },
      { status: 500 },
    );
  }
}
