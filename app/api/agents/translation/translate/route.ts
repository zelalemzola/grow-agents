import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  streamText,
} from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  buildTranslationPrompt,
  buildBodyOnlyTranslationPrompt,
  buildEditPrompt,
  TRANSLATION_SYSTEM_PROMPT,
} from "@/lib/translation-prompts";
import { splitHtmlIntoChunks } from "@/lib/html-chunker";
import {
  extractBodyForTranslation,
  reassembleHtml,
} from "@/lib/html-extract-body";
import { getGateway } from "@/lib/ai-gateway";
import { createServerSupabaseClient } from "@/utils/supabase/server";

/** Allow long-running translations (e.g. 300+ pages) - user is patient for accuracy */
export const maxDuration = 300;

const translateSchema = z.object({
  html: z.string().min(1, "HTML content is required"),
  fromLang: z.enum(["en", "de"]),
  toLang: z.enum(["en", "de"]),
  projectName: z.string().min(1).optional(),
  projectId: z.string().uuid().optional(),
  editComments: z.string().optional(),
  stream: z.boolean().optional().default(true),
});

type TranslateInput = z.infer<typeof translateSchema>;

type TranslateStreamEvent = {
  type: "status" | "html-stream" | "done" | "error";
  message?: string;
  payload?: { value?: string };
};

type TranslateResult = {
  funnel: {
    id: string;
    name: string;
    objective: string;
    latest_html: string;
    latest_css: string;
    latest_images: Record<string, unknown>;
  };
  translatedHtml: string;
};

type ConsistencyMapping = { source: string; target: string };

function stripCodeFencesPreserveWhitespace(text: string): string {
  let output = text;
  output = output.replace(/^```(?:html)?[ \t]*\r?\n/i, "");
  output = output.replace(/\r?\n```[ \t]*$/i, "");
  return output;
}

function normalizeLineEndingsForModel(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

async function buildConsistencyRules(
  html: string,
  fromLang: TranslateInput["fromLang"],
  toLang: TranslateInput["toLang"],
): Promise<string> {
  const gateway = getGateway();
  const fromLabel = fromLang === "en" ? "English" : "German";
  const toLabel = toLang === "en" ? "English" : "German";
  const sample = html.slice(0, 120_000);

  const result = await generateText({
    model: gateway("openai/gpt-4.1"),
    temperature: 0,
    maxOutputTokens: 1200,
    system:
      "Return only plain text bullet points. No markdown header. No prose.",
    prompt: `Create canonical localization rules for translating a landing page from ${fromLabel} to ${toLabel}.
Focus on names and product/medicine terms that must stay consistent across all chunks.
Rules:
- Output at most 25 bullets.
- Each bullet format: SOURCE => TARGET
- If unsure, keep SOURCE unchanged on target.
- Never output partial names. Full names only.

Input HTML excerpt:
${sample}`,
  });

  return result.text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 25)
    .join("\n");
}

function parseConsistencyMappings(rules: string): ConsistencyMapping[] {
  return rules
    .split("\n")
    .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
    .filter((line) => line.includes("=>"))
    .map((line) => {
      const [sourceRaw, ...targetRaw] = line.split("=>");
      return {
        source: sourceRaw.trim(),
        target: targetRaw.join("=>").trim(),
      };
    })
    .filter((m) => m.source.length > 1 && m.target.length > 1);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return dp[b.length];
}

function replaceNearCanonicalVariants(text: string, canonical: string): string {
  // Replace close misspellings in visible text while keeping exact canonical untouched.
  const tokenPattern = /([\p{L}\p{M}\p{N}_-]+)/gu;
  return text.replace(tokenPattern, (token) => {
    if (token === canonical) return token;
    const dist = levenshtein(token.toLowerCase(), canonical.toLowerCase());
    const startsClose =
      token.slice(0, Math.min(4, token.length)).toLowerCase() ===
      canonical.slice(0, Math.min(4, canonical.length)).toLowerCase();
    if (startsClose && canonical.length >= 6 && dist <= 2) {
      return canonical;
    }
    return token;
  });
}

function applyCanonicalMappingsToTextNode(
  text: string,
  mappings: ConsistencyMapping[],
): string {
  let output = text;

  // Exact canonical replacement first (longest first for multi-word names).
  const ordered = [...mappings].sort((a, b) => b.target.length - a.target.length);
  for (const mapping of ordered) {
    const escaped = escapeRegExp(mapping.target);
    const exactRe = new RegExp(`\\b${escaped}\\b`, "g");
    output = output.replace(exactRe, mapping.target);
  }

  // Repair close misspellings such as "Mucodrine" -> "Mucosolvan".
  for (const mapping of ordered) {
    output = replaceNearCanonicalVariants(output, mapping.target);
  }

  return output;
}

function enforceCanonicalMappingsInHtml(
  html: string,
  mappings: ConsistencyMapping[],
): string {
  if (mappings.length === 0) return html;

  // Apply only to text between tags; never mutate markup itself.
  const segments = html.split(/(<[^>]+>)/g);
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (!segment || segment.startsWith("<")) continue;
    segments[i] = applyCanonicalMappingsToTextNode(segment, mappings);
  }
  return segments.join("");
}

function enforceParagraphSpacingInHtml(html: string): string {
  // Ensure visible separation between consecutive block elements when model collapses all whitespace.
  // This is deterministic and O(n), so it has negligible runtime impact.
  const blockTags =
    "(p|div|section|article|blockquote|figure|figcaption|h[1-6]|li|ul|ol)";
  const adjacentBlocks = new RegExp(
    `</${blockTags}>\\s*<${blockTags}\\b`,
    "gi",
  );
  return html.replace(adjacentBlocks, (match) =>
    match.replace(/>\s*</, ">\n\n<"),
  );
}

async function runTranslate(
  input: TranslateInput,
  emit: (event: TranslateStreamEvent) => void,
): Promise<TranslateResult> {
  const supabase = await createServerSupabaseClient();
  const gateway = getGateway();

  const isEdit = Boolean(input.editComments?.trim());

  emit({
    type: "status",
    message: isEdit
      ? "Applying edits to translation..."
      : "Translating content...",
  });

  const systemPrompt = TRANSLATION_SYSTEM_PROMPT;

  // When not editing: try to translate only body content (head + scripts stay out of the request)
  const extractResult = !isEdit ? extractBodyForTranslation(input.html) : { ok: false as const };
  const extracted =
    extractResult.ok === true ? extractResult : null;
  const extractedOk = extracted !== null;

  const contentToTranslate = extractedOk
    ? extracted!.bodyForTranslation
    : input.html;
  const normalizedContent = normalizeLineEndingsForModel(contentToTranslate);

  const chunks = splitHtmlIntoChunks(normalizedContent);
  /** Always chunk when body is large - prevents truncation and hallucination */
  const useChunking = !isEdit && chunks.length > 1;
  const consistencyRules = !isEdit
    ? await buildConsistencyRules(normalizedContent, input.fromLang, input.toLang)
    : "";
  const consistencyMappings = parseConsistencyMappings(consistencyRules);

  let translatedContent: string;

  if (useChunking) {
    emit({
      type: "status",
      message: `Translating ${extractedOk ? "body content" : "document"} (${chunks.length} parts)...`,
    });

    const translatedChunks: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      emit({
        type: "status",
        message: `Translating part ${i + 1} of ${chunks.length}...`,
      });

      const userPrompt = extractedOk
        ? buildBodyOnlyTranslationPrompt(chunks[i], input.fromLang, input.toLang, {
            index: i,
            total: chunks.length,
          }, consistencyRules)
        : buildTranslationPrompt(chunks[i], input.fromLang, input.toLang, {
            index: i,
            total: chunks.length,
          }, consistencyRules);

      const result = await generateText({
        model: gateway("openai/gpt-4.1"),
        system: systemPrompt,
        prompt: userPrompt,
        maxOutputTokens: 65536,
        temperature: 0.2,
      });

      const chunkHtml = stripCodeFencesPreserveWhitespace(result.text);
      translatedChunks.push(chunkHtml);

      const accumulated = translatedChunks.join("");
      emit({
        type: "html-stream",
        payload: {
          value: extractedOk
            ? reassembleHtml(extracted!.prefix, accumulated, extracted!.suffix, extracted!.scripts)
            : accumulated,
        },
      });
    }

    translatedContent = translatedChunks.join("");
  } else if (isEdit) {
    const userPrompt = buildEditPrompt(
      input.html,
      input.editComments ?? "",
      input.fromLang,
      input.toLang,
    );

    let accumulatedHtml = "";

    const result = streamText({
      model: gateway("openai/gpt-4.1"),
      system: systemPrompt,
      prompt: userPrompt,
      maxOutputTokens: 65536,
      temperature: 0.2,
      onChunk: ({ chunk }) => {
        if (chunk.type === "text-delta" && "text" in chunk) {
          accumulatedHtml += chunk.text;
          emit({
            type: "html-stream",
            payload: { value: accumulatedHtml },
          });
        }
      },
    });

    const fullText = await result.text;
    translatedContent = stripCodeFencesPreserveWhitespace(fullText);
  } else {
    const userPrompt = extractedOk
      ? buildBodyOnlyTranslationPrompt(normalizedContent, input.fromLang, input.toLang, undefined, consistencyRules)
      : buildTranslationPrompt(normalizedContent, input.fromLang, input.toLang, undefined, consistencyRules);

    let accumulatedHtml = "";

    const result = streamText({
      model: gateway("openai/gpt-4.1"),
      system: systemPrompt,
      prompt: userPrompt,
      maxOutputTokens: 65536,
      temperature: 0.2,
      onChunk: ({ chunk }) => {
        if (chunk.type === "text-delta" && "text" in chunk) {
          accumulatedHtml += chunk.text;
          const displayValue = extractedOk
            ? reassembleHtml(extracted!.prefix, accumulatedHtml, extracted!.suffix, extracted!.scripts)
            : accumulatedHtml;
          emit({
            type: "html-stream",
            payload: { value: displayValue },
          });
        }
      },
    });

    const fullText = await result.text;
    translatedContent = stripCodeFencesPreserveWhitespace(fullText);
  }

  const canonicalizedContent =
    !isEdit && consistencyMappings.length > 0
      ? enforceCanonicalMappingsInHtml(translatedContent, consistencyMappings)
      : translatedContent;
  const spacingNormalizedContent = enforceParagraphSpacingInHtml(canonicalizedContent);

  const translatedHtml = extractedOk
    ? reassembleHtml(
        extracted!.prefix,
        spacingNormalizedContent,
        extracted!.suffix,
        extracted!.scripts,
      )
    : spacingNormalizedContent;

  const fromLabel = input.fromLang === "en" ? "English" : "German";
  const toLabel = input.toLang === "en" ? "English" : "German";
  const objective = `${fromLabel} → ${toLabel}`;

  let funnelId: string;
  const meta = {
    sourceHtml: input.html,
    fromLang: input.fromLang,
    toLang: input.toLang,
  };

  if (input.projectId) {
    const { data: existing, error: fetchError } = await supabase
      .from("funnels")
      .select("id")
      .eq("id", input.projectId)
      .eq("agent_slug", "translation")
      .single();

    if (fetchError || !existing) {
      throw new Error("Project not found.");
    }

    const { data: updated, error: updateError } = await supabase
      .from("funnels")
      .update({
        latest_html: translatedHtml,
        latest_css: "",
        latest_images: meta,
        objective,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.projectId)
      .select("*")
      .single();

    if (updateError || !updated) {
      throw new Error(`Failed to update project: ${updateError?.message}`);
    }

    funnelId = updated.id;

    await supabase.from("funnel_versions").insert({
      funnel_id: funnelId,
      source: "edit",
      user_instruction: input.editComments?.trim() || "Translation edit",
      html: translatedHtml,
      css: "",
      images: meta,
    });
  } else {
    const name =
      input.projectName?.trim() ||
      `Translation ${fromLabel}→${toLabel} ${new Date().toISOString().slice(0, 10)}`;

    const { data: inserted, error: insertError } = await supabase
      .from("funnels")
      .insert({
        agent_slug: "translation",
        name,
        objective,
        template_id: null,
        latest_html: translatedHtml,
        latest_css: "",
        latest_images: meta,
      })
      .select("*")
      .single();

    if (insertError || !inserted) {
      throw new Error(`Failed to create project: ${insertError?.message}`);
    }

    funnelId = inserted.id;

    await supabase.from("funnel_versions").insert({
      funnel_id: funnelId,
      source: "generate",
      user_instruction: objective,
      html: translatedHtml,
      css: "",
      images: meta,
    });
  }

  emit({ type: "done", message: "Translation complete." });

  return {
    funnel: {
      id: funnelId,
      name:
        input.projectName?.trim() ||
        `Translation ${fromLabel}→${toLabel} ${new Date().toISOString().slice(0, 10)}`,
      objective,
      latest_html: translatedHtml,
      latest_css: "",
      latest_images: meta,
    },
    translatedHtml,
  };
}

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = translateSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    if (parsed.data.stream) {
      const stream = createUIMessageStream({
        execute: async ({ writer }) => {
          const emit = (event: TranslateStreamEvent) => {
            writer.write({
              type: "data-translate-event",
              data: event,
              transient: true,
            });
          };

          try {
            const result = await runTranslate(parsed.data, emit);
            writer.write({
              type: "data-translate-result",
              data: result,
              transient: true,
            });
          } catch (error) {
            emit({
              type: "error",
              message:
                error instanceof Error ? error.message : "Translation failed",
            });
          }
        },
      });

      return createUIMessageStreamResponse({ stream });
    }

    const emit = (e: TranslateStreamEvent) => {
      if (e.type === "error") throw new Error(e.message);
    };
    const result = await runTranslate(parsed.data, emit);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Translation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
