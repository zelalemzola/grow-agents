import { NextResponse } from "next/server";
import { z } from "zod";

import { createServerSupabaseClient } from "@/utils/supabase/server";

const scopeSchema = z.enum([
  "global",
  "copy",
  "image",
  "headline-image",
  "body-image",
  "product-image",
  "compliance",
]);

const createKnowledgeSchema = z.object({
  name: z.string().min(3),
  description: z.string().optional(),
  scope: scopeSchema.default("global"),
  content: z.string().min(20),
  isActive: z.boolean().optional(),
  priority: z.number().int().min(1).max(9999).optional(),
});

const updateKnowledgeSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(3).optional(),
  description: z.string().nullable().optional(),
  scope: scopeSchema.optional(),
  content: z.string().min(20).optional(),
  isActive: z.boolean().optional(),
  priority: z.number().int().min(1).max(9999).optional(),
});

const deleteKnowledgeSchema = z.object({
  id: z.string().uuid(),
});

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("agent_knowledge_documents")
    .select("*")
    .eq("agent_slug", "copy-injection")
    .order("priority", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ documents: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const body = await request.json();
  const parsed = createKnowledgeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("agent_knowledge_documents")
    .insert({
      agent_slug: "copy-injection",
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      scope: parsed.data.scope,
      content: parsed.data.content,
      is_active: parsed.data.isActive ?? true,
      priority: parsed.data.priority ?? 100,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ document: data });
}

export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient();
  const body = await request.json();
  const parsed = updateKnowledgeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updatePayload: Record<string, unknown> = {};

  if (typeof parsed.data.name !== "undefined") {
    updatePayload.name = parsed.data.name;
  }
  if (typeof parsed.data.description !== "undefined") {
    updatePayload.description = parsed.data.description;
  }
  if (typeof parsed.data.scope !== "undefined") {
    updatePayload.scope = parsed.data.scope;
  }
  if (typeof parsed.data.content !== "undefined") {
    updatePayload.content = parsed.data.content;
  }
  if (typeof parsed.data.isActive !== "undefined") {
    updatePayload.is_active = parsed.data.isActive;
  }
  if (typeof parsed.data.priority !== "undefined") {
    updatePayload.priority = parsed.data.priority;
  }

  const { data, error } = await supabase
    .from("agent_knowledge_documents")
    .update(updatePayload)
    .eq("id", parsed.data.id)
    .eq("agent_slug", "copy-injection")
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ document: data });
}

export async function DELETE(request: Request) {
  const supabase = await createServerSupabaseClient();
  const body = await request.json();
  const parsed = deleteKnowledgeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("agent_knowledge_documents")
    .delete()
    .eq("id", parsed.data.id)
    .eq("agent_slug", "copy-injection");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
