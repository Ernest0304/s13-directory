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
  let idleTimer = null, slideTimer = null, slideIdx = 0, pollTimer = null, langTimer = null;

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
  /* A licensee that has signed but not moved in: the hourly rent-roll sync stores its name
   * ahead of the access date and switches "occupied" on that day. */
  const comingSoon = (k) => !!k && !k.occupied && !!(cleanField(k.name && k.name.en) || cleanField(k.name && k.name.zh));

  /* ---------- opening hours: shown only for licensees whose hours staff have entered ---------- */
  const toMin = (hhmm) => { const [h, m] = String(hhmm || "").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
  function nowMin() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function isOpen(k) {
    if (!k.hasHours) return null;
    const n = nowMin(), o = toMin(k.hours.open), c = toMin(k.hours.close);
    return c > o ? (n >= o && n < c) : (n >= o || n < c);
  }
  function statusHTML(k) {
    const open = isOpen(k);
    if (open === null) return "";
    return `<span class="status ${open ? "open" : "closed"}">${open ? I18N.open[lang] : I18N.closed[lang]}</span>`;
  }
  /* the footer range is only worth showing when every kitchen's hours are known: one
   * kitchen's hours would read as the hours of the whole site */
  function facilityHours() {
    const occ = occupiedUnits(); if (!occ.length || occ.some((k) => !k.hasHours)) return "";
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
    // strings added in Nov 2026 use data-copy (see the note at the map tools in index-3d.html)
    document.querySelectorAll("[data-copy]").forEach((el) => { el.textContent = I18N[el.dataset.copy][lang]; });
    // facility-driven copy (editable in the admin) overrides the static defaults
    const name = (s.name || FACILITY.brand).en;   // brand name stays English in all languages
    document.querySelectorAll("[data-i18n-brand]").forEach((el) => { el.textContent = name; });
    if (s.subtitle) document.querySelectorAll('[data-i18n="directory"]').forEach((el) => { el.textContent = s.subtitle[lang]; });
    if (s.ctaMain)  document.querySelectorAll('[data-i18n="touchToBegin"]').forEach((el) => { el.textContent = s.ctaMain[lang]; });
    // the sub-line under the call to action invites in the other language, so a reader of either
    // language sees at a glance that the board speaks it
    const other = lang === "zh" ? "en" : "zh";
    document.querySelectorAll('[data-i18n="tapAnywhere"]').forEach((el) => { el.textContent = ((s.ctaMain && s.ctaMain[other]) || I18N.touchToBegin[other]); });
  }

  /* ---------- screens ---------- */
  function show(name, why) {
    if (name === "attract" && window.__swPendingReload) return location.reload();  // a new deploy is waiting — grab it now that we're idle
    for (const s of Object.values(screens)) s.classList.remove("active");
    screens[name].classList.add("active");
    if (name === "attract") { currentId = null; stopIdle(); endVisit(why === "idle"); startSlides(); }
    else {
      stopLangReset(); stopSlides();
      buildChips(); buildShopRow(); buildFooter();   // every visitor gets the current list, badges and footer
      renderMain(); resetIdle();
    }
  }

  /* ---------- between visitors ----------
   * The ad screen is the boundary between two people: the category, list position and
   * collapsed list chosen by one must not greet the next. The language is kept for a while
   * after Start Over (that reader may touch again) and goes back to the default once the
   * board has been left alone. */
  const defaultLang = () => (S().defaultLang === "zh" ? "zh" : "en");
  function endVisit(leftAlone) {
    if (filterCat !== "all") { filterCat = "all"; buildChips(); buildShopRow(); }
    const f = document.getElementById("filters"); if (f) f.scrollLeft = 0;
    const r = document.getElementById("shoprow"); if (r) r.scrollTop = 0;
    if (leftAlone) resetLang(); else armLangReset();
  }
  function resetLang() { stopLangReset(); if (lang !== defaultLang()) setLang(defaultLang()); }
  function armLangReset() {
    stopLangReset();
    if (lang !== defaultLang()) langTimer = setTimeout(() => { langTimer = null; if (screens.attract.classList.contains("active")) setLang(defaultLang()); }, IDLE_MS);
  }
  function stopLangReset() { if (langTimer) { clearTimeout(langTimer); langTimer = null; } }

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
        <div class="tag">${tag ? "“" + esc(tag) + "”" : ""}</div>
        <div class="utag">${esc(k.unit)}</div>
      </div>`;
    }).join("");
    primeSlides();
  }
  function primeSlides() {
    const s = document.querySelectorAll(".slide"); if (!s.length) return;
    slideIdx %= s.length;
    s.forEach((el, i) => el.classList.toggle("show", i === slideIdx));
  }
  /* the slides are rebuilt on every content refresh, so each tick looks them up afresh
   * (holding the old list froze the loop on one licensee until the next refresh) */
  function startSlides() {
    stopSlides(); primeSlides();
    slideTimer = setInterval(() => {
      const s = document.querySelectorAll(".slide"); if (s.length < 2) return;
      slideIdx = (slideIdx + 1) % s.length;
      s.forEach((el, i) => el.classList.toggle("show", i === slideIdx));
    }, SLIDE_MS);
  }
  function stopSlides() { if (slideTimer) { clearInterval(slideTimer); slideTimer = null; } }

  /* ---------- cuisine filter chips: only the categories that have a kitchen today ---------- */
  function chipsInUse() {
    const used = new Set(occupiedUnits().map((k) => k.cat).filter(Boolean));
    return CATEGORIES.filter((c) => c.key === "all" || used.has(c.key));
  }
  function buildChips() {
    const chips = chipsInUse();
    if (!chips.some((c) => c.key === filterCat)) filterCat = "all";
    const row = document.getElementById("filters");
    row.classList.toggle("is-empty", chips.length < 2);    // "All" on its own filters nothing
    row.innerHTML = chips.map((c) => `
      <button class="chip ${c.key === filterCat ? "active" : ""}" data-cat="${c.key}"><span class="em">${c.icon}</span>${c.label[lang]}</button>`).join("");
    row.querySelectorAll(".chip").forEach((b) => b.addEventListener("click", () => setFilter(b.dataset.cat)));
  }
  function setFilter(cat) {
    filterCat = cat;
    // drop a selection that no longer belongs to the chosen category (else its detail card
    // lingers over a "no kitchens" list)
    let deselected = false;
    if (currentId) { const k = byId(currentId); if (k && cat !== "all" && k.cat !== cat) { currentId = null; deselected = true; } }
    const row = document.getElementById("filters");
    row.querySelectorAll(".chip").forEach((b) => b.classList.toggle("active", b.dataset.cat === cat));
    // keep the active chip in view by scrolling the chip row only: scrollIntoView also
    // scrolled the board itself (overflow:hidden, but still scrollable) sideways
    const ac = row.querySelector(".chip.active");
    if (ac) { const a = ac.getBoundingClientRect(), r = row.getBoundingClientRect(); row.scrollBy({ left: a.left + a.width / 2 - (r.left + r.width / 2), behavior: "smooth" }); }
    buildShopRow();
    if (deselected && screens.main.classList.contains("active")) renderMain();
  }

  /* ---------- kitchen cards (occupied units only; vacant units live on the map) ---------- */
  function buildShopRow() {
    const list = orderedUnits().filter((k) => k.occupied && (filterCat === "all" || k.cat === filterCat));
    const row = document.getElementById("shoprow");
    row.innerHTML = list.length ? list.map((k) => {
      const name = nameOf(k), cuisine = pick(k.cuisine), open = isOpen(k);
      const label = [name, cuisine, k.unit, open === null ? "" : (open ? I18N.open[lang] : I18N.closed[lang])].filter(Boolean).map(esc).join(", ");
      return `
      <button class="shopcard ${k.id === currentId ? "sel" : ""}" data-id="${esc(k.id)}" style="--c:${safeColor(k.color)}" aria-label="${label}">
        <span class="unit">${esc(k.unit)}</span>
        <span class="disc${k.logo ? " has-logo" : ""}">${mark(k)}</span>
        <span class="nm">${esc(name)}</span>
        ${cuisine ? `<span class="cz">${esc(cuisine)}</span>` : ""}
        ${statusHTML(k)}
      </button>`; }).join("")
      : `<div class="info-empty" style="margin:auto"><div class="t2">${I18N.noneInCat[lang]}</div>${filterCat !== "all" ? `<button class="chip show-all">${I18N.showAll[lang]}</button>` : ""}</div>`;
    row.querySelectorAll(".shopcard").forEach((c) => c.addEventListener("click", () => selectShop(c.dataset.id)));
    const all = row.querySelector(".show-all"); if (all) all.addEventListener("click", () => setFilter("all"));
    updateMore();
  }

  /* ---------- the list says when kitchens are hidden below, and keeps the chosen one in view ---------- */
  function updateMore() {
    const row = document.getElementById("shoprow"), more = document.getElementById("listMore"); if (!row || !more) return;
    const bottom = row.getBoundingClientRect().bottom;
    const hidden = [...row.querySelectorAll(".shopcard")].filter((c) => c.getBoundingClientRect().bottom > bottom + 4).length;
    more.classList.toggle("show", hidden > 0);
    more.textContent = "↓ " + I18N.moreRows[lang].replace("{n}", hidden);
  }
  function keepChosenInView() {
    requestAnimationFrame(() => {
      updateMore();                         // the strip may shorten the list: settle it before measuring
      const row = document.getElementById("shoprow"), c = row && row.querySelector(".shopcard.sel");
      if (c) {
        const cr = c.getBoundingClientRect(), rr = row.getBoundingClientRect();
        if (cr.top < rr.top) row.scrollTop -= rr.top - cr.top + 4;
        else if (cr.bottom > rr.bottom) row.scrollTop += cr.bottom - rr.bottom + 4;
      }
      updateMore();
    });
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
    if (!k.occupied && !comingSoon(k)) {
      panel.style.setProperty("--c", "#8A93A4");
      panel.innerHTML = `<div class="info-sel">
        <div class="top"><span class="disc">＋</span><div><div class="nm">${I18N.availableTag[lang]}</div><div class="cz">${esc(k.unit)}</div></div></div>
        <div class="dirbox"><span class="pin">🏷️</span><span>${I18N.leaseEnquiry[lang]}</span></div>
      </div>`;
      return;
    }
    const soon = !k.occupied;
    panel.style.setProperty("--c", safeColor(k.color));
    const cuisine = pick(k.cuisine);
    const meta = soon ? `<span class="status soon">${I18N.comingSoon[lang]}</span>`
      : (k.hasHours ? `${statusHTML(k)}<span class="hours">🕐 ${esc(k.hours.open)}–${esc(k.hours.close)}</span>` : "");
    panel.innerHTML = `<div class="info-sel${soon ? " soon" : ""}">
      <div class="top"><span class="disc${k.logo ? " has-logo" : ""}">${mark(k)}</span><div><div class="nm">${esc(nameOf(k))}</div>${cuisine ? `<div class="cz">${esc(cuisine)}</div>` : ""}</div></div>
      <div class="unit-big"><span class="lbl">${I18N.unit[lang]}</span><span class="val">${esc(k.unit)}</span></div>
      ${meta ? `<div class="meta-row">${meta}</div>` : ""}
      <div class="dirbox"><span class="pin">📍</span><span>${esc(MapKiosk.directions(currentId, lang)).replace(/K-\d\d/g, (c) => `<span class="nw">${c}</span>`)}</span></div>
    </div>`;
  }

  function renderMain() {
    MapKiosk.render(document.getElementById("map"), currentId, lang, theme, view);
    renderInfo();
    document.querySelectorAll(".shopcard").forEach((c) => c.classList.toggle("sel", c.dataset.id === currentId));
    keepChosenInView();
  }
  /* Tapping the kitchen that is already chosen: an empty unit is let go (there is nothing to
   * walk to), anything else re-frames its route. */
  function selectShop(id) {
    if (id && id === currentId) {
      const k = byId(id);
      if (k && !k.occupied && !comingSoon(k)) { currentId = null; renderMain(); return; }
      if (MapKiosk.refocus) { MapKiosk.refocus(); return; }
    }
    currentId = id; renderMain();
    if (id) document.dispatchEvent(new CustomEvent("kiosk:select", { detail: id }));
  }

  /* ---------- facility footer ---------- */
  function footerHours() {
    const s = S();
    return (s.hoursOpen && s.hoursClose) ? `${s.hoursOpen}–${s.hoursClose}` : facilityHours();
  }
  function buildFooter() {
    const s = S();
    const name = (s.name || FACILITY.brand).en;   // brand name stays English in all languages
    const help = (s.help || I18N.needHelp)[lang];
    const n = occupiedUnits().length, hours = footerHours();
    document.getElementById("facilityFoot").innerHTML = `
      <div class="left">
        <span><b>${esc(name)}</b> · ${esc(s.site || FACILITY.site)}</span>
        <span>🍽️ ${n} ${(n === 1 ? I18N.kitchenWord : I18N.kitchensWord)[lang]}</span>
        ${hours ? `<span>🕐 ${esc(hours)}</span>` : ""}
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
    else armLangReset();                       // chosen on the ad screen: goes back to the default if nobody follows up
    document.dispatchEvent(new CustomEvent("kiosk:lang", { detail: l }));
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
    // rebuild everything on either screen, so the list and badges are never left stale
    applyStatic(); buildSlides(); buildChips(); buildShopRow(); buildFooter();
    if (screens.main.classList.contains("active")) renderMain();
  }
  function startPoll() { if (pollTimer) clearInterval(pollTimer); pollTimer = setInterval(refreshContent, (S().refreshSeconds || CONFIG.refreshSeconds || 180) * 1000); }

  /* ---------- idle: a visible countdown before the board returns to the ads ----------
   * (the idle time itself stays the admin setting; the warning takes its last third, 3-10 s) */
  let warnTimer = null, warnTick = null;
  const warnMs = () => Math.min(10000, Math.max(3000, IDLE_MS / 3));
  function resetIdle() {
    stopIdle();
    warnTimer = setTimeout(startWarn, Math.max(0, IDLE_MS - warnMs()));
    idleTimer = setTimeout(() => show("attract", "idle"), IDLE_MS);
  }
  function stopIdle() {
    clearTimeout(idleTimer); clearTimeout(warnTimer); clearInterval(warnTick); idleTimer = warnTimer = warnTick = null;
    const w = document.getElementById("idleWarn"); if (w) w.classList.remove("show");
  }
  function startWarn() {
    const w = document.getElementById("idleWarn"); if (!w) return;
    const end = Date.now() + warnMs();
    const paint = () => { const s = Math.max(1, Math.ceil((end - Date.now()) / 1000)); w.innerHTML = `<b>${I18N.idleWarn[lang]}</b><span>${I18N.idleBack[lang].replace("{s}", s)}</span>`; };
    paint(); w.classList.add("show"); warnTick = setInterval(paint, 250);
  }

  /* ---------- colour helper ---------- */
  function parse(hex) { const h = String(hex || "").replace("#", ""); if (!/^[0-9a-fA-F]{6}$/.test(h)) return [138, 147, 164]; return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; }
  function mix(hex, target, t) { const a = parse(hex), b = parse(target); return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`; }

  /* ---------- wiring ---------- */
  document.getElementById("langToggle").addEventListener("click", (e) => { const b = e.target.closest("button[data-lang]"); if (b) setLang(b.dataset.lang); });
  document.getElementById("themeToggle").addEventListener("click", (e) => { const b = e.target.closest("button[data-theme]"); if (b) setTheme(b.dataset.theme); });
  document.getElementById("viewToggle").addEventListener("click", (e) => { const b = e.target.closest("button[data-view]"); if (b) setView(b.dataset.view); });
  document.getElementById("map").addEventListener("click", (e) => { const g = e.target.closest("[data-uid]"); if (g) selectShop(g.dataset.uid); });
  screens.attract.addEventListener("click", (e) => { if (!e.target.closest(".toggles")) show("main"); });
  document.getElementById("homeBtn").addEventListener("click", (e) => { e.stopPropagation(); show("attract", "home"); });

  ["pointerdown", "click"].forEach((ev) => document.addEventListener(ev, () => { if (!screens.attract.classList.contains("active")) resetIdle(); }, { passive: true }));
  const rowEl = document.getElementById("shoprow"); if (rowEl) rowEl.addEventListener("scroll", updateMore, { passive: true });
  const moreEl = document.getElementById("listMore"); if (moreEl) moreEl.addEventListener("click", () => rowEl.scrollBy({ top: rowEl.clientHeight * .8, behavior: "smooth" }));
  addEventListener("resize", updateMore);
  document.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("gesturestart", (e) => e.preventDefault());

  /* ---------- init: load content, then start ---------- */
  loadContent().then(() => {
    applySettings(); applyStatic(); buildSlides(); buildChips(); buildShopRow(); buildFooter(); show("attract"); startPoll();
    if (MapKiosk.preload) MapKiosk.preload(document.getElementById("map"));
  });
})();
