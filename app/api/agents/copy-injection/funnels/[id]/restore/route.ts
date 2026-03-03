import { NextResponse } from "next/server";
import { z } from "zod";

import { createServerSupabaseClient } from "@/utils/supabase/server";

const restoreSchema = z.object({
  versionId: z.string().uuid(),
});

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const body = await request.json();
  const parsed = restoreSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { data: version, error: versionError } = await supabase
    .from("funnel_versions")
    .select("*")
    .eq("id", parsed.data.versionId)
    .eq("funnel_id", id)
    .single();

  if (versionError || !version) {
    return NextResponse.json(
      { error: versionError?.message ?? "Version not found." },
      { status: 404 },
    );
  }

  const { data: updatedFunnel, error: updateError } = await supabase
    .from("funnels")
    .update({
      latest_html: version.html,
      latest_css: version.css,
      latest_images: version.images,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (updateError || !updatedFunnel) {
    return NextResponse.json(
      { error: updateError?.message ?? "Failed to restore project." },
      { status: 500 },
    );
  }

  const { error: logError } = await supabase.from("funnel_versions").insert({
    funnel_id: id,
    source: "edit",
    user_instruction: `Restore to version ${version.id}`,
    html: version.html,
    css: version.css,
    images: version.images,
    section_plan: {
      type: "restore",
      restoredFrom: version.id,
    },
  });

  if (logError) {
    return NextResponse.json({ error: logError.message }, { status: 500 });
  }

  return NextResponse.json({ funnel: updatedFunnel });
}
