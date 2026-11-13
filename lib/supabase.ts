import { createClient } from "@supabase/supabase-js";

// Supports both NEXT_PUBLIC_ prefixed and non-prefixed env vars (for Vercel server-side compatibility)
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "";

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  "";

// Client for public operations
export const supabase = createClient(supabaseUrl, supabaseAnonKey || supabaseServiceRoleKey);

// Server-side admin client using service role key (bypasses RLS for ingestion / operations)
export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceRoleKey || supabaseAnonKey
);

