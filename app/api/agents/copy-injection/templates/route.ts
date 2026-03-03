import { NextResponse } from "next/server";
import { z } from "zod";

import { createServerSupabaseClient } from "@/utils/supabase/server";

const createTemplateSchema = z.object({
  name: z.string().min(3),
  description: z.string().optional(),
  instructions: z.string().min(10),
  htmlScaffold: z.string().optional(),
  cssScaffold: z.string().optional(),
});

export async function GET() {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("agent_templates")
    .select("*")
    .eq("agent_slug", "copy-injection")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ templates: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const body = await request.json();
  const parsed = createTemplateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("agent_templates")
    .insert({
      agent_slug: "copy-injection",
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      instructions: parsed.data.instructions,
      html_scaffold: parsed.data.htmlScaffold ?? null,
      css_scaffold: parsed.data.cssScaffold ?? null,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ template: data });
}
