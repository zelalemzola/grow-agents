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
  buildEditPrompt,
  TRANSLATION_SYSTEM_PROMPT,
} from "@/lib/translation-prompts";
import { splitHtmlIntoChunks } from "@/lib/html-chunker";
import { getGateway } from "@/lib/ai-gateway";
import { createServerSupabaseClient } from "@/utils/supabase/server";

export const maxDuration = 120;

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
  const chunks = splitHtmlIntoChunks(input.html);
  const useChunking = !isEdit && chunks.length > 1;

  let translatedHtml: string;

  if (useChunking) {
    emit({
      type: "status",
      message: `Translating long document (${chunks.length} parts)...`,
    });

    const translatedChunks: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      emit({
        type: "status",
        message: `Translating part ${i + 1} of ${chunks.length}...`,
      });

      const userPrompt = buildTranslationPrompt(
        chunks[i],
        input.fromLang,
        input.toLang,
        { index: i, total: chunks.length },
      );

      const result = await generateText({
        model: gateway("openai/gpt-4.1"),
        system: systemPrompt,
        prompt: userPrompt,
        maxOutputTokens: 65536,
        temperature: 0.2,
      });

      let chunkHtml = result.text.trim();
      chunkHtml = chunkHtml.replace(/^```(?:html)?\s*\n?|```\s*$/gm, "").trim();
      translatedChunks.push(chunkHtml);

      const accumulated = translatedChunks.join("");
      emit({
        type: "html-stream",
        payload: { value: accumulated },
      });
    }

    translatedHtml = translatedChunks.join("");
  } else {
    const userPrompt = isEdit
      ? buildEditPrompt(
          input.html,
          input.editComments ?? "",
          input.fromLang,
          input.toLang,
        )
      : buildTranslationPrompt(input.html, input.fromLang, input.toLang);

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

    translatedHtml = fullText.trim();
    translatedHtml = translatedHtml.replace(/^```(?:html)?\s*\n?|```\s*$/gm, "").trim();
  }

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
