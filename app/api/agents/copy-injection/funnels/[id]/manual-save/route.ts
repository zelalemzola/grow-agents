import { NextResponse } from "next/server";
import { z } from "zod";

import { createServerSupabaseClient } from "@/utils/supabase/server";

const manualSaveSchema = z.object({
  html: z.string().min(1),
  css: z.string().min(1),
  note: z.string().optional(),
});

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const body = await request.json();
  const parsed = manualSaveSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { data: funnel, error: funnelError } = await supabase
    .from("funnels")
    .select("*")
    .eq("id", id)
    .single();

  if (funnelError || !funnel) {
    return NextResponse.json(
      { error: funnelError?.message ?? "Project not found." },
      { status: 404 },
    );
  }

  const { data: updatedFunnel, error: updateError } = await supabase
    .from("funnels")
    .update({
      latest_html: parsed.data.html,
      latest_css: parsed.data.css,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (updateError || !updatedFunnel) {
    return NextResponse.json(
      { error: updateError?.message ?? "Failed to save project." },
      { status: 500 },
    );
  }

  const { error: versionError } = await supabase.from("funnel_versions").insert({
    funnel_id: id,
    source: "edit",
    user_instruction: parsed.data.note?.trim() || "Manual code edit",
    html: parsed.data.html,
    css: parsed.data.css,
    images: funnel.latest_images,
    section_plan: {
      type: "manual",
    },
  });

  if (versionError) {
    return NextResponse.json({ error: versionError.message }, { status: 500 });
  }

  return NextResponse.json({ funnel: updatedFunnel });
}
