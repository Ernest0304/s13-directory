/* =============================================================================
 * db.js — content layer. The kiosk calls loadContent(); the admin page uses the
 * signIn / saveUnit / uploadAsset helpers. Uses the Supabase REST API directly
 * (no library), so the kiosk stays dependency-free and keeps a localStorage
 * cache to survive network drops. Falls back to the bundled SEED_UNITS until a
 * Supabase project is configured in config.js.
 * ========================================================================== */

let KITCHENS = [];                 // live units, consumed by app.js + map.js
let SETTINGS = null;               // live site settings, consumed by app.js (+ admin.js)
const CACHE_KEY = "s13.content.v1";
const SETTINGS_KEY = "s13.settings.v1";
let accessToken = null;            // set after admin signIn()

const configured = () => !!(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);
const sbHeaders = () => ({ apikey: CONFIG.supabaseAnonKey, Authorization: `Bearer ${CONFIG.supabaseAnonKey}` });

/* ---------- site settings: defaults <- data.js / config.js ---------- */
/* The DB only needs to store what's been changed; anything blank falls back to
 * these bundled defaults, so the kiosk works before the facility row is set up. */
function settingsDefaults() {
  return {
    site: FACILITY.site,
    name:     { en: FACILITY.brand.en,    zh: FACILITY.brand.zh },
    subtitle: { en: I18N.directory.en,    zh: I18N.directory.zh },
    address:  { en: FACILITY.address.en,  zh: FACILITY.address.zh },
    ctaMain:  { en: I18N.touchToBegin.en, zh: I18N.touchToBegin.zh },
    ctaSub:   { en: I18N.tapAnywhere.en,  zh: I18N.tapAnywhere.zh },
    help:     { en: I18N.needHelp.en,     zh: I18N.needHelp.zh },
    hoursOpen: "", hoursClose: "",              // blank -> footer auto-derives from kitchens
    defaultTheme: "bright", defaultView: "3d", defaultLang: "en",
    refreshSeconds: CONFIG.refreshSeconds || 180,
    idleSeconds: 60, slideSeconds: 5,
  };
}
function facilityFromRow(r) {
  const d = settingsDefaults();
  return {
    site: r.id || d.site,
    name:     { en: r.name_en     || d.name.en,     zh: r.name_zh     || d.name.zh },
    subtitle: { en: r.subtitle_en || d.subtitle.en, zh: r.subtitle_zh || d.subtitle.zh },
    address:  { en: r.address_en  || d.address.en,  zh: r.address_zh  || d.address.zh },
    ctaMain:  { en: r.cta_main_en || d.ctaMain.en,  zh: r.cta_main_zh || d.ctaMain.zh },
    ctaSub:   { en: r.cta_sub_en  || d.ctaSub.en,   zh: r.cta_sub_zh  || d.ctaSub.zh },
    help:     { en: r.help_en     || d.help.en,     zh: r.help_zh     || d.help.zh },
    hoursOpen: r.hours_open || "", hoursClose: r.hours_close || "",
    defaultTheme: r.default_theme || d.defaultTheme,
    defaultView:  r.default_view  || d.defaultView,
    defaultLang:  r.default_lang  || d.defaultLang,
    refreshSeconds: r.refresh_seconds || d.refreshSeconds,
    idleSeconds:    r.idle_seconds    || d.idleSeconds,
    slideSeconds:   r.slide_seconds   || d.slideSeconds,
  };
}
function facilityToRow(s) {
  return {
    id: s.site || "S13",
    name_en: s.name.en, name_zh: s.name.zh,
    subtitle_en: s.subtitle.en, subtitle_zh: s.subtitle.zh,
    address_en: s.address.en, address_zh: s.address.zh,
    cta_main_en: s.ctaMain.en, cta_main_zh: s.ctaMain.zh,
    cta_sub_en: s.ctaSub.en, cta_sub_zh: s.ctaSub.zh,
    help_en: s.help.en, help_zh: s.help.zh,
    hours_open: s.hoursOpen || null, hours_close: s.hoursClose || null,
    default_theme: s.defaultTheme, default_view: s.defaultView, default_lang: s.defaultLang,
    refresh_seconds: s.refreshSeconds, idle_seconds: s.idleSeconds, slide_seconds: s.slideSeconds,
    updated_at: new Date().toISOString(),
  };
}

/* row (DB) <-> unit (front-end) */
function fromRow(r) {
  return {
    id: r.unit_code.replace("-", ""), unit: r.unit_code, occupied: !!r.occupied,
    name: { en: r.name_en || "", zh: r.name_zh || "" },
    cuisine: { en: r.cuisine_en || "", zh: r.cuisine_zh || "" },
    tagline: { en: r.tagline_en || "", zh: r.tagline_zh || "" },
    cat: r.category || "world", color: r.color || "#8A93A4", icon: r.icon || "🍽️",
    hours: { open: r.hours_open || "10:00", close: r.hours_close || "22:00" },
    logo: r.logo_url || null, adBg: r.ad_bg_url || null,
  };
}
function toRow(u) {
  return {
    occupied: u.occupied, name_en: u.name.en, name_zh: u.name.zh,
    cuisine_en: u.cuisine.en, cuisine_zh: u.cuisine.zh, tagline_en: u.tagline.en, tagline_zh: u.tagline.zh,
    category: u.cat, color: u.color, icon: u.icon, hours_open: u.hours.open, hours_close: u.hours.close,
    logo_url: u.logo || null, ad_bg_url: u.adBg || null, updated_at: new Date().toISOString(),
  };
}
const normalizeSeed = (k) => ({ ...k, occupied: k.occupied !== false, logo: k.logo || null, adBg: k.adBg || null });

/* ---------- kiosk: load content (Supabase -> cache -> seed) ---------- */
async function loadContent() {
  let units = null, settings = null;
  if (configured()) {
    try {
      const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/units?select=*&order=sort`, { headers: sbHeaders() });
      if (!res.ok) throw new Error("HTTP " + res.status);
      units = (await res.json()).map(fromRow);
      localStorage.setItem(CACHE_KEY, JSON.stringify(units));
    } catch (e) { console.warn("[db] live units fetch failed, using cache/seed:", e.message); }
    try {
      const fr = await fetch(`${CONFIG.supabaseUrl}/rest/v1/facility?select=*&limit=1`, { headers: sbHeaders() });
      if (!fr.ok) throw new Error("HTTP " + fr.status);
      const rows = await fr.json();
      if (rows[0]) { settings = facilityFromRow(rows[0]); localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
    } catch (e) { console.warn("[db] live facility fetch failed, using cache/defaults:", e.message); }
  }
  if (!units) { try { units = JSON.parse(localStorage.getItem(CACHE_KEY)); } catch (e) {} }
  if (!units || !units.length) units = SEED_UNITS.map(normalizeSeed);
  if (!settings) { try { settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)); } catch (e) {} }
  if (!settings) settings = settingsDefaults();
  KITCHENS = units;
  SETTINGS = settings;
  return units;
}

/* ---------- admin (used by admin.html) ---------- */
async function adminSignIn(password) {
  const res = await fetch(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: CONFIG.supabaseAnonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: CONFIG.adminEmail, password }),
  });
  if (!res.ok) {
    let msg = "Login failed";
    try { const j = await res.json(); msg = j.error_description || j.msg || j.error || msg; } catch (e) {}
    throw new Error(msg);
  }
  accessToken = (await res.json()).access_token;
  return accessToken;
}
async function adminSaveUnit(u) {
  const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/units?unit_code=eq.${encodeURIComponent(u.unit)}`, {
    method: "PATCH",
    headers: { apikey: CONFIG.supabaseAnonKey, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(toRow(u)),
  });
  if (!res.ok) throw new Error("Save failed (" + res.status + ")");
}
async function adminSaveFacility(s) {
  // upsert on the primary key so it works whether or not the row exists yet
  const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/facility`, {
    method: "POST",
    headers: { apikey: CONFIG.supabaseAnonKey, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(facilityToRow(s)),
  });
  if (!res.ok) throw new Error("Save failed (" + res.status + ")");
}
async function adminUploadAsset(file, path) {
  const res = await fetch(`${CONFIG.supabaseUrl}/storage/v1/object/${CONFIG.bucket}/${path}`, {
    method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "x-upsert": "true", "Content-Type": file.type || "application/octet-stream" }, body: file,
  });
  if (!res.ok) throw new Error("Upload failed (" + res.status + ")");
  return `${CONFIG.supabaseUrl}/storage/v1/object/public/${CONFIG.bucket}/${path}`;
}
