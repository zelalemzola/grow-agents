import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";

// pdf-parse pulls in pdfjs-dist which uses browser APIs (DOMMatrix, etc.).
// Dynamic import avoids loading it at build time when Next.js collects page data.

import { createServerSupabaseClient } from "@/utils/supabase/server";

export const runtime = "nodejs";
const MAX_DOC_CHARS = 9000;

const scopeSchema = z.enum([
  "global",
  "copy",
  "image",
  "headline-image",
  "body-image",
  "product-image",
  "compliance",
]);

const importMetaSchema = z.object({
  name: z.string().min(1).max(180),
  description: z.string().max(500).optional(),
  scope: scopeSchema.default("global"),
  priority: z.coerce.number().int().min(1).max(9999).default(100),
  isActive: z
    .string()
    .optional()
    .transform((value) => value !== "false"),
});

function cleanExtractedText(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function chunkText(content: string, maxChars: number): string[] {
  if (content.length <= maxChars) {
    return [content];
  }

  const paragraphs = content.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = "";
    }

    if (paragraph.length <= maxChars) {
      current = paragraph;
      continue;
    }

    let offset = 0;
    while (offset < paragraph.length) {
      chunks.push(paragraph.slice(offset, offset + maxChars));
      offset += maxChars;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file." }, { status: 400 });
  }

  const parsedMeta = importMetaSchema.safeParse({
    name: formData.get("name") ?? file.name,
    description: formData.get("description") ?? undefined,
    scope: formData.get("scope") ?? "global",
    priority: formData.get("priority") ?? 100,
    isActive: formData.get("isActive") ?? "true",
  });

  if (!parsedMeta.success) {
    return NextResponse.json(
      { error: parsedMeta.error.flatten() },
      { status: 400 },
    );
  }

  const lowerName = file.name.toLowerCase();
  const arrayBuffer = await file.arrayBuffer();
  const fileBuffer = Buffer.from(arrayBuffer);
  let extractedText = "";

  try {
    if (lowerName.endsWith(".pdf")) {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: fileBuffer });
      try {
        const parsedPdf = await parser.getText();
        extractedText = parsedPdf.text ?? "";
      } finally {
        await parser.destroy();
      }
    } else if (lowerName.endsWith(".txt") || lowerName.endsWith(".md")) {
      extractedText = fileBuffer.toString("utf-8");
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Use .pdf, .txt, or .md." },
        { status: 400 },
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to extract text from file: ${String(error)}` },
      { status: 400 },
    );
  }

  const cleanedContent = cleanExtractedText(extractedText);
  if (cleanedContent.length < 20) {
    return NextResponse.json(
      {
        error:
          "Extracted text is too short. Ensure the file contains readable text content.",
      },
      { status: 400 },
    );
  }

  const sourceHash = crypto
    .createHash("sha256")
    .update(cleanedContent, "utf8")
    .digest("hex");

  const { data: existingDocs, error: existingError } = await supabase
    .from("agent_knowledge_documents")
    .select("id, source_hash, source_version, source_file_name, is_active")
    .eq("agent_slug", "copy-injection")
    .eq("source_file_name", file.name)
    .order("source_version", { ascending: false })
    .order("created_at", { ascending: false });

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  const duplicate = (existingDocs ?? []).find((doc) => doc.source_hash === sourceHash);
  if (duplicate) {
    return NextResponse.json({
      duplicate: true,
      documentId: duplicate.id,
      sourceFileName: file.name,
      sourceVersion: duplicate.source_version,
      message: "Identical document already exists. Skipped new import.",
    });
  }

  const nextVersion = (existingDocs?.[0]?.source_version ?? 0) + 1;
  const sourceGroupId = crypto.randomUUID();
  const chunks = chunkText(cleanedContent, MAX_DOC_CHARS);

  if ((existingDocs ?? []).length > 0) {
    const { error: deactivateError } = await supabase
      .from("agent_knowledge_documents")
      .update({ is_active: false })
      .eq("agent_slug", "copy-injection")
      .eq("source_file_name", file.name)
      .eq("is_active", true);
    if (deactivateError) {
      return NextResponse.json({ error: deactivateError.message }, { status: 500 });
    }
  }

  const supersedesId = existingDocs?.[0]?.id ?? null;
  const rows = chunks.map((chunk, index) => ({
    agent_slug: "copy-injection",
    name:
      chunks.length > 1
        ? `${parsedMeta.data.name} (Part ${index + 1}/${chunks.length})`
        : parsedMeta.data.name,
    description: parsedMeta.data.description ?? null,
    scope: parsedMeta.data.scope,
    content: chunk,
    source_hash: sourceHash,
    source_file_name: file.name,
    source_mime_type: file.type || null,
    source_version: nextVersion,
    source_group_id: sourceGroupId,
    chunk_index: index + 1,
    chunk_count: chunks.length,
    supersedes_document_id: supersedesId,
    is_active: parsedMeta.data.isActive,
    priority: parsedMeta.data.priority,
  }));

  const { data, error } = await supabase
    .from("agent_knowledge_documents")
    .insert(rows)
    .select("*")
    .order("chunk_index", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    duplicate: false,
    documents: data ?? [],
    sourceVersion: nextVersion,
    chunkCount: chunks.length,
    extractedChars: cleanedContent.length,
    sourceFileName: file.name,
  });
}
