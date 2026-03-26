import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/utils/supabase/server";

const LIST_COLUMNS =
  "id, name, objective, agent_slug, template_id, created_at, updated_at";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const listOnly = searchParams.get("list") === "true";

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("funnels")
    .select(listOnly ? LIST_COLUMNS : "*")
    .eq("agent_slug", "copy-chief")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ funnels: data ?? [] });
}
