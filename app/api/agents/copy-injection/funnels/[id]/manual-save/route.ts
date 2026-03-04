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
  try {
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

    if (body == null || typeof body !== "object") {
      return NextResponse.json(
        { error: "Request body must be an object with html and css" },
        { status: 400 },
      );
    }

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

  const versionImages = (funnel.latest_images ?? {}) as Record<string, string>;

  const { error: versionError } = await supabase.from("funnel_versions").insert({
    funnel_id: id,
    source: "edit",
    user_instruction: parsed.data.note?.trim() || "Manual save",
    html: parsed.data.html,
    css: parsed.data.css,
    images: versionImages,
    section_plan: {
      type: "manual",
    },
  });

  if (versionError) {
    return NextResponse.json({ error: versionError.message }, { status: 500 });
  }

  return NextResponse.json({ funnel: updatedFunnel });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
