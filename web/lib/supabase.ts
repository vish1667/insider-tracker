// Server-side Supabase read client for the Next.js app.
// Uses the public anon key — the app only ever READS public SEC data.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
      "Copy web/.env.local.example to web/.env.local and fill it in."
  );
}

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: false },
});
