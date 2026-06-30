/* =============================================================================
 * config.js — connection settings.
 *
 * Paste your Supabase project URL + anon (public) key here. Until you do, the
 * kiosk runs on the bundled seed data so it still works during setup.
 *   Supabase → Project Settings → API → "Project URL" and "anon public" key.
 * The anon key is safe to ship in the front-end (it only grants public READ;
 * editing requires the admin login).
 * ========================================================================== */

const CONFIG = {
  supabaseUrl:     "https://bqfdlkhafrehfedfktjc.supabase.co",   // your project (derived from the anon key's ref)
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxZmRsa2hhZnJlaGZlZGZrdGpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2OTE5MTUsImV4cCI6MjA5ODI2NzkxNX0.MgEg7EWk7GxeOVAklrCZhXgdA1-1S0U9rNp44Stc__M",   // legacy "anon public" key — public, read-only via RLS
  adminEmail:      "operations-singapore@cloudkitchens.com",  // the admin login (this user's password = the shared password)
  bucket:          "kiosk-assets",
  refreshSeconds:  180,  // kiosk re-checks for content edits this often
};
