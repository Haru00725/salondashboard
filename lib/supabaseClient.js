import { createClient } from '@supabase/supabase-js';

// These must be set in .env.local as:
// NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
// NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_public_key
//
// Use the ANON key here (not service role) since this runs in the browser.
// Row Level Security policies on your tables control what the dashboard can read/write.

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
