import { NextResponse } from "next/server";
import { z } from "zod";

import { createServerSupabaseClient } from "@/utils/supabase/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = z
    .object({
      imageIndex: z.number().int().min(1).max(5).optional(),
      imageKey: z.string().min(1).optional(),
      imageUrl: z.string().url().or(z.string().startsWith("data:")),
    })
    .refine((d) => d.imageKey != null || d.imageIndex != null, {
      message: "Provide imageKey or imageIndex.",
    })
    .safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { imageIndex, imageKey, imageUrl } = parsed.data;
  const key =
    imageKey ??
    (imageIndex != null ? `${imageIndex}-1` : "");
  if (!key) {
    return NextResponse.json({ error: "Missing image key." }, { status: 400 });
  }
  const supabase = await createServerSupabaseClient();

  const { data: funnel, error: fetchError } = await supabase
    .from("funnels")
    .select("latest_images")
    .eq("id", id)
    .eq("agent_slug", "ad-image-generation")
    .single();

  if (fetchError || !funnel) {
    return NextResponse.json(
      { error: "Project not found or not an ad-image project." },
      { status: 404 },
    );
  }

  const current = (funnel.latest_images ?? {}) as Record<string, string>;
  const updated = { ...current, [key]: imageUrl };
  if (imageIndex != null && imageKey == null) {
    delete updated[String(imageIndex)];
  }

  const { error: updateError } = await supabase
    .from("funnels")
    .update({
      latest_images: updated,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("agent_slug", "ad-image-generation");

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message ?? "Update failed." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    latest_images: updated,
  });
}
