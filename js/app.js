/* =============================================================================
 * app.js — flow, attract carousel, bilingual, theme, 3D/2D, cuisine filter,
 * open/closed, tap-on-map, idle. Content is loaded from the DB (db.js) and
 * re-checked on an interval; vacant units render as "Available".
 * ========================================================================== */

(function () {
  "use strict";

  let SLIDE_MS = 4200, IDLE_MS = 60000;   // overwritten from SETTINGS at startup
  let lang = "en", theme = "bright", view = "3d", currentId = null, filterCat = "all";
  const S = () => SETTINGS || {};
  let idleTimer = null, slideTimer = null, slideIdx = 0, pollTimer = null;

  const kiosk = document.getElementById("kiosk");
  const screens = { attract: document.getElementById("attract"), main: document.getElementById("main") };

  const orderedUnits = () => [...KITCHENS].sort((a, b) => a.unit.localeCompare(b.unit));
  const occupiedUnits = () => KITCHENS.filter((k) => k.occupied);
  const byId = (id) => KITCHENS.find((k) => k.id === id);
  /* escape any DB/admin-sourced string before it goes into innerHTML */
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const safeColor = (c) => /^#[0-9a-fA-F]{6}$/.test(c) ? c : "#8A93A4";
  /* tidy a field: trim blanks + stray leading/trailing separators so empty or half-filled fields don't render */
  const cleanField = (s) => String(s == null ? "" : s).replace(/^[\s\/、,，·\-]+|[\s\/、,，·\-]+$/g, "").trim();
  /* pick the best available language for a {en,zh} field (current → en → zh); "" if nothing */
  const pick = (o) => o ? (cleanField(o[lang]) || cleanField(o.en) || cleanField(o.zh)) : "";
  const nameOf = (k) => pick(k.name) || k.unit;   // a brand name never goes blank
  const mark = (k) => (k.logo ? `<img src="${esc(k.logo)}" alt="">` : esc(k.icon));

  /* ---------- opening hours ---------- */
  const toMin = (hhmm) => { const [h, m] = String(hhmm || "").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
  function nowMin() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function isOpen(k) { const n = nowMin(), o = toMin(k.hours.open), c = toMin(k.hours.close); return c > o ? (n >= o && n < c) : (n >= o || n < c); }
  function statusHTML(k) { const open = isOpen(k); return `<span class="status ${open ? "open" : "closed"}">${open ? I18N.open[lang] : I18N.closed[lang]}</span>`; }
  function facilityHours() {
    const occ = occupiedUnits(); if (!occ.length) return "—";
    const fmt = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
    return fmt(Math.min(...occ.map((k) => toMin(k.hours.open)))) + "–" + fmt(Math.max(...occ.map((k) => toMin(k.hours.close))));
  }

  /* ---------- settings (DB-editable defaults + copy + timings) ---------- */
  function syncToggle(id, attr, val) {
    document.querySelectorAll(`#${id} button`).forEach((b) => b.classList.toggle("active", b.dataset[attr] === val));
  }
  function applySettings() {
    const s = S();
    if (s.defaultLang)  lang  = s.defaultLang;
    if (s.defaultTheme) theme = s.defaultTheme;
    if (s.defaultView)  view  = s.defaultView;
    SLIDE_MS = (s.slideSeconds || 5) * 1000;
    IDLE_MS  = (s.idleSeconds  || 60) * 1000;
    kiosk.dataset.theme = theme;
    document.documentElement.lang = lang === "zh" ? "zh" : "en";
    syncToggle("langToggle", "lang", lang);
    syncToggle("themeToggle", "theme", theme);
    syncToggle("viewToggle", "view", view);
  }

  /* ---------- i18n ---------- */
  function applyStatic() {
    const s = S();
    document.documentElement.lang = lang === "zh" ? "zh" : "en";
    document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = I18N[el.dataset.i18n][lang]; });
    // facility-driven copy (editable in the admin) overrides the static defaults
    const name = (s.name || FACILITY.brand).en;   // brand name stays English in all languages
    document.querySelectorAll("[data-i18n-brand]").forEach((el) => { el.textContent = name; });
    if (s.subtitle) document.querySelectorAll('[data-i18n="directory"]').forEach((el) => { el.textContent = s.subtitle[lang]; });
    if (s.ctaMain)  document.querySelectorAll('[data-i18n="touchToBegin"]').forEach((el) => { el.textContent = s.ctaMain[lang]; });
    if (s.ctaSub)   document.querySelectorAll('[data-i18n="tapAnywhere"]').forEach((el) => { el.textContent = s.ctaSub[lang]; });
  }

  /* ---------- screens ---------- */
  function show(name) {
    if (name === "attract" && window.__swPendingReload) return location.reload();  // a new deploy is waiting — grab it now that we're idle
    for (const s of Object.values(screens)) s.classList.remove("active");
    screens[name].classList.add("active");
    if (name === "attract") { currentId = null; stopIdle(); startSlides(); }
    else { stopSlides(); renderMain(); resetIdle(); }
  }

  /* ---------- attract carousel (occupied units only) ---------- */
  function buildSlides() {
    document.getElementById("slides").innerHTML = occupiedUnits().map((k) => {
      const bg = k.adBg
        ? `linear-gradient(rgba(6,7,11,.45), rgba(6,7,11,.72)), url("${esc(k.adBg)}") center/cover`
        : `radial-gradient(125% 100% at 50% 34%, ${mix(k.color, "#0a0b10", 0.16)}, #07080c 70%)`;
      const cuisine = pick(k.cuisine);
      const tag = pick(k.tagline);
      return `<div class="slide" style="background:${bg}">
        <div class="medallion" style="background:${k.logo ? "#ffffff" : `radial-gradient(120% 120% at 32% 22%, ${mix(k.color, "#ffffff", 0.12)}, ${mix(k.color, "#0a0b10", 0.5)})`}">${mark(k)}</div>
        <h2>${esc(nameOf(k))}</h2>
        ${cuisine ? `<div class="cuisine">${esc(cuisine)}</div>` : ""}
        <div class="tag">${tag ? (lang === "zh" ? "「" + esc(tag) + "」" : "“" + esc(tag) + "”") : ""}</div>
        <div class="utag">${esc(k.unit)}</div>
      </div>`;
    }).join("");
    primeSlides();
  }
  function primeSlides() { const s = document.querySelectorAll(".slide"); s.forEach((el, i) => el.classList.toggle("show", i === slideIdx % s.length)); }
  function startSlides() {
    const s = document.querySelectorAll(".slide"); if (!s.length) return;
    stopSlides(); primeSlides();
    slideTimer = setInterval(() => { s[slideIdx % s.length].classList.remove("show"); slideIdx = (slideIdx + 1) % s.length; s[slideIdx].classList.add("show"); }, SLIDE_MS);
  }
  function stopSlides() { if (slideTimer) { clearInterval(slideTimer); slideTimer = null; } }

  /* ---------- cuisine filter chips ---------- */
  function buildChips() {
    document.getElementById("filters").innerHTML = CATEGORIES.map((c) => `
      <button class="chip ${c.key === filterCat ? "active" : ""}" data-cat="${c.key}"><span class="em">${c.icon}</span>${c.label[lang]}</button>`).join("");
    document.querySelectorAll("#filters .chip").forEach((b) => b.addEventListener("click", () => setFilter(b.dataset.cat)));
  }
  function setFilter(cat) {
    filterCat = cat;
    document.querySelectorAll("#filters .chip").forEach((b) => b.classList.toggle("active", b.dataset.cat === cat));
    buildShopRow();
  }

  /* ---------- kitchen cards (occupied units only; vacant units live on the map) ---------- */
  function buildShopRow() {
    const list = orderedUnits().filter((k) => k.occupied && (filterCat === "all" || k.cat === filterCat));
    const row = document.getElementById("shoprow");
    row.innerHTML = list.length ? list.map((k) => { const name = nameOf(k), cuisine = pick(k.cuisine); return `
      <button class="shopcard ${k.id === currentId ? "sel" : ""}" data-id="${esc(k.id)}" style="--c:${safeColor(k.color)}" aria-label="${esc(name)}${cuisine ? ", " + esc(cuisine) : ""}, ${esc(k.unit)}, ${isOpen(k) ? I18N.open[lang] : I18N.closed[lang]}">
        <span class="unit">${esc(k.unit)}</span>
        <span class="disc${k.logo ? " has-logo" : ""}">${mark(k)}</span>
        <span class="nm">${esc(name)}</span>
        ${cuisine ? `<span class="cz">${esc(cuisine)}</span>` : ""}
        ${statusHTML(k)}
      </button>`; }).join("") : `<div class="info-empty" style="margin:auto"><div class="t2">${I18N.noneInCat[lang]}</div></div>`;
    row.querySelectorAll(".shopcard").forEach((c) => c.addEventListener("click", () => selectShop(c.dataset.id)));
  }

  /* ---------- info panel ---------- */
  function renderInfo() {
    const panel = document.getElementById("infoPanel");
    if (!currentId) {
      panel.style.removeProperty("--c");
      panel.innerHTML = `<div class="info-empty"><div class="big">🗺️</div><div class="t1">${I18N.selectPrompt[lang]}</div><div class="t2">${I18N.pickToStart[lang]}</div></div>`;
      return;
    }
    const k = byId(currentId);
    if (!k.occupied) {
      panel.style.setProperty("--c", "#8A93A4");
      panel.innerHTML = `<div class="info-sel">
        <div class="top"><span class="disc">＋</span><div><div class="nm">${I18N.available[lang]}</div><div class="cz">${I18N.availableTag[lang]} · ${esc(k.unit)}</div></div></div>
        <div class="dirbox"><span class="pin">🏷️</span><span>${I18N.leaseEnquiry[lang]}</span></div>
      </div>`;
      return;
    }
    panel.style.setProperty("--c", safeColor(k.color));
    const cuisine = pick(k.cuisine);
    panel.innerHTML = `<div class="info-sel">
      <div class="top"><span class="disc${k.logo ? " has-logo" : ""}">${mark(k)}</span><div><div class="nm">${esc(nameOf(k))}</div>${cuisine ? `<div class="cz">${esc(cuisine)}</div>` : ""}</div></div>
      <div class="unit-big"><span class="lbl">${I18N.unit[lang]}</span><span class="val">${esc(k.unit)}</span></div>
      <div class="meta-row">${statusHTML(k)}<span class="hours">🕐 ${esc(k.hours.open)}–${esc(k.hours.close)}</span><span class="order-hint">📱 ${I18N.orderAhead[lang]}</span></div>
      <div class="dirbox"><span class="pin">📍</span><span>${esc(MapKiosk.directions(currentId, lang))}</span></div>
    </div>`;
  }

  function renderMain() {
    MapKiosk.render(document.getElementById("map"), currentId, lang, theme, view);
    renderInfo();
    document.querySelectorAll(".shopcard").forEach((c) => c.classList.toggle("sel", c.dataset.id === currentId));
  }
  function selectShop(id) { currentId = id; renderMain(); }

  /* ---------- facility footer ---------- */
  function footerHours() {
    const s = S();
    return (s.hoursOpen && s.hoursClose) ? `${s.hoursOpen}–${s.hoursClose}` : facilityHours();
  }
  function buildFooter() {
    const s = S();
    const name = (s.name || FACILITY.brand).en;   // brand name stays English in all languages
    const help = (s.help || I18N.needHelp)[lang];
    document.getElementById("facilityFoot").innerHTML = `
      <div class="left">
        <span><b>${esc(name)}</b> · ${esc(s.site || FACILITY.site)}</span>
        <span>🍽️ ${occupiedUnits().length} ${I18N.kitchensWord[lang]}</span>
        <span>🕐 ${esc(footerHours())}</span>
      </div>
      <span class="help">ⓘ ${esc(help)}</span>`;
  }

  /* ---------- toggles ---------- */
  function setLang(l) {
    if (l === lang) return;
    lang = l;
    document.querySelectorAll("#langToggle button").forEach((b) => b.classList.toggle("active", b.dataset.lang === l));
    applyStatic(); buildSlides(); buildChips(); buildShopRow(); buildFooter();
    if (screens.main.classList.contains("active")) renderMain();
  }
  function setTheme(t) {
    if (t === theme) return;
    theme = t; kiosk.dataset.theme = t;
    document.querySelectorAll("#themeToggle button").forEach((b) => b.classList.toggle("active", b.dataset.theme === t));
    if (screens.main.classList.contains("active")) renderMain();
  }
  function setView(v) {
    if (v === view) return;
    view = v;
    document.querySelectorAll("#viewToggle button").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
    if (screens.main.classList.contains("active")) renderMain();
  }

  /* ---------- content refresh (poll the DB for edits) ---------- */
  async function refreshContent() {
    await loadContent();
    // pick up edited copy + timings live (but NOT the default theme/view/lang —
    // those would yank the screen out from under whoever's mid-tap)
    SLIDE_MS = (S().slideSeconds || 5) * 1000;
    IDLE_MS  = (S().idleSeconds  || 60) * 1000;
    if (currentId && !byId(currentId)) currentId = null;
    applyStatic();
    if (screens.attract.classList.contains("active")) buildSlides();
    if (screens.main.classList.contains("active")) { buildChips(); buildShopRow(); buildFooter(); renderMain(); }
  }
  function startPoll() { if (pollTimer) clearInterval(pollTimer); pollTimer = setInterval(refreshContent, (S().refreshSeconds || CONFIG.refreshSeconds || 180) * 1000); }

  /* ---------- idle ---------- */
  function resetIdle() { if (idleTimer) clearTimeout(idleTimer); idleTimer = setTimeout(() => show("attract"), IDLE_MS); }
  function stopIdle() { if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; } }

  /* ---------- colour helper ---------- */
  function parse(hex) { const h = String(hex || "").replace("#", ""); if (!/^[0-9a-fA-F]{6}$/.test(h)) return [138, 147, 164]; return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; }
  function mix(hex, target, t) { const a = parse(hex), b = parse(target); return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`; }

  /* ---------- wiring ---------- */
  document.getElementById("langToggle").addEventListener("click", (e) => { const b = e.target.closest("button[data-lang]"); if (b) setLang(b.dataset.lang); });
  document.getElementById("themeToggle").addEventListener("click", (e) => { const b = e.target.closest("button[data-theme]"); if (b) setTheme(b.dataset.theme); });
  document.getElementById("viewToggle").addEventListener("click", (e) => { const b = e.target.closest("button[data-view]"); if (b) setView(b.dataset.view); });
  document.getElementById("map").addEventListener("click", (e) => { const g = e.target.closest("[data-uid]"); if (g) selectShop(g.dataset.uid); });
  screens.attract.addEventListener("click", (e) => { if (!e.target.closest(".toggles")) show("main"); });
  document.getElementById("homeBtn").addEventListener("click", (e) => { e.stopPropagation(); show("attract"); });

  ["pointerdown", "click"].forEach((ev) => document.addEventListener(ev, () => { if (!screens.attract.classList.contains("active")) resetIdle(); }, { passive: true }));
  document.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("gesturestart", (e) => e.preventDefault());

  /* ---------- init: load content, then start ---------- */
  loadContent().then(() => {
    applySettings(); applyStatic(); buildSlides(); buildChips(); buildShopRow(); buildFooter(); show("attract"); startPoll();
  });
})();
