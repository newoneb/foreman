// Foreman portal settings.
//
// Leave both values empty and the portal runs in demo mode: sample records that stay in
// each visitor's own browser.
//
// To go live, paste your Supabase project's URL and its anon (public) or publishable key,
// from Supabase > Project Settings > API Keys. Both are meant to be public: every permission
// is enforced by the row-level security in supabase/schema.sql. Never put the service_role
// or secret key here.
export const SUPABASE_URL = "";
export const SUPABASE_ANON_KEY = "";
