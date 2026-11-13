import { createClient } from "@supabase/supabase-js";

// Read Supabase environment variables, supporting both server-only (without NEXT_PUBLIC_)
// and client-safe (with NEXT_PUBLIC_) naming conventions.
const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";

const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

/**
 * Server-safe Supabase client.
 * For use in Route Handlers (`app/api/...`) and Server Actions.
 */
export const supabase = createClient(supabaseUrl, supabaseKey);
