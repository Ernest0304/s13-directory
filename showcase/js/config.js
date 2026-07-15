/* =============================================================================
 * config.js — PUBLIC SHOWCASE build: intentionally NO backend.
 *
 * Every field is empty, so configured() is false and the board runs entirely
 * on the bundled fictional SEED_UNITS in js/data.js. Nothing here connects to
 * Supabase, storage, or any admin — this build is fully self-contained and
 * has no path to any live system.
 * ========================================================================== */
const CONFIG = {
  supabaseUrl:     "",   // empty on purpose — showcase runs on local seed data
  supabaseAnonKey: "",
  adminEmail:      "",
  bucket:          "",
  refreshSeconds:  0,
};
