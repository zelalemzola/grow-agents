import { NextResponse } from "next/server";
import { z } from "zod";

import { createServerSupabaseClient } from "@/utils/supabase/server";

const patchSchema = z.object({
  sectionId: z.string().min(1),
  imageUrl: z.string().url().or(z.string().startsWith("data:")),
});

interface Params {
  params: Promise<{ id: string }>;
}

/** Swap a single media URL (undo/redo) without regenerating. */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const supabase = await createServerSupabaseClient();

    const { data: funnel, error: fetchError } = await supabase
      .from("funnels")
      .select("latest_images, agent_slug")
      .eq("id", id)
      .single();

    if (fetchError || !funnel) {
      return NextResponse.json(
        { error: "Project not found." },
        { status: 404 },
      );
    }

    if (funnel.agent_slug !== "copy-injection") {
      return NextResponse.json(
        { error: "Not a copy-injection project." },
        { status: 400 },
      );
    }

    const current = (funnel.latest_images ?? {}) as Record<string, string>;
    const updated = { ...current, [parsed.data.sectionId]: parsed.data.imageUrl };

    const { data: row, error: updateError } = await supabase
      .from("funnels")
      .update({
        latest_images: updated,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (updateError || !row) {
      return NextResponse.json(
        { error: updateError?.message ?? "Update failed." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      funnel: row,
      latest_images: updated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
