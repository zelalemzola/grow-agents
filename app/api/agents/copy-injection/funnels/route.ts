import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/utils/supabase/server";

export async function GET() {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("funnels")
    .select("*")
    .eq("agent_slug", "copy-injection")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ funnels: data ?? [] });
}
