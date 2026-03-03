import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/utils/supabase/server";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("funnels")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Project not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({ funnel: data });
}
