/*
  Copy this file to supabase-config.js inside a new project.
  Use development values first. Never put a service-role key here.
*/

const EC_SUPABASE_URL = "https://YOUR-DEVELOPMENT-PROJECT.supabase.co";
const EC_SUPABASE_PUBLISHABLE_KEY = "YOUR_DEVELOPMENT_PUBLISHABLE_KEY";

if (!window.supabase?.createClient) {
  throw new Error("Load the official Supabase browser library before this file.");
}

if (EC_SUPABASE_URL.includes("YOUR-") || EC_SUPABASE_PUBLISHABLE_KEY.includes("YOUR_")) {
  console.warn("Supabase integration is not configured.");
  window.ecSupabase = null;
} else {
  window.ecSupabase = window.supabase.createClient(
    EC_SUPABASE_URL,
    EC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  );
}

