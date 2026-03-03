import { NextResponse } from "next/server";
import { z } from "zod";

import { createServerSupabaseClient } from "@/utils/supabase/server";

const updateTemplateSchema = z.object({
  name: z.string().min(3).optional(),
  description: z.string().optional().nullable(),
  instructions: z.string().min(10).optional(),
  htmlScaffold: z.string().optional().nullable(),
  cssScaffold: z.string().optional().nullable(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("agent_templates")
    .select("*")
    .eq("id", id)
    .eq("agent_slug", "copy-injection")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Template not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ template: data });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = updateTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updatePayload: Record<string, unknown> = {};
  if (parsed.data.name != null) updatePayload.name = parsed.data.name;
  if (parsed.data.description !== undefined)
    updatePayload.description = parsed.data.description ?? null;
  if (parsed.data.instructions != null)
    updatePayload.instructions = parsed.data.instructions;
  if (parsed.data.htmlScaffold !== undefined)
    updatePayload.html_scaffold = parsed.data.htmlScaffold ?? null;
  if (parsed.data.cssScaffold !== undefined)
    updatePayload.css_scaffold = parsed.data.cssScaffold ?? null;

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("agent_templates")
    .update(updatePayload)
    .eq("id", id)
    .eq("agent_slug", "copy-injection")
    .select("*")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "PGRST116" ? 404 : 500 },
    );
  }

  return NextResponse.json({ template: data });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("agent_templates")
    .delete()
    .eq("id", id)
    .eq("agent_slug", "copy-injection");

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
