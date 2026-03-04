import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabaseConfig, getSupabaseServiceRoleKey } from "@/lib/supabase-config";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseConfig();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot write cookies directly.
        }
      },
    },
  });
}

/** Admin client with service role - use for Storage uploads that need to bypass RLS. */
export function createSupabaseAdminClient() {
  const { url } = getSupabaseConfig();
  const serviceKey = getSupabaseServiceRoleKey();
  if (!serviceKey) return null;
  return createClient(url, serviceKey);
}
