/* =============================================================================
 * admin.js — staff CMS. Login with the shared password, edit each unit's
 * content (name/cuisine/tagline/hours/category/colour/icon + occupied), upload
 * logo + ad background to Supabase Storage, and save back to the database.
 *
 * The hourly rent-roll sync owns two things: whether a kitchen is on the board,
 * and the name of a new licensee. Everything else is filled in here.
 * Reuses db.js (adminSignIn / adminLoadContent / adminSaveUnit / adminUploadAsset).
 * ========================================================================== */

(function () {
  "use strict";

  let units = [], selected = null, draft = null, site = null, dirty = false, signedIn = false, uploading = 0;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const clock = (d) => d.toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" });
  const refreshMin = () => Math.max(1, Math.round(((site && site.refreshSeconds) || 180) / 60));
  const isSoon = (u) => !u.occupied && !!((u.name.en || u.name.zh || "").trim());
  const current = () => units.find((x) => x.id === selected);

  let toastTimer = null;
  function toast(msg, ok = true) {
    const t = $("toast"); clearTimeout(toastTimer);
    t.textContent = msg; t.className = "toast show" + (ok ? "" : " bad");
    toastTimer = setTimeout(() => { t.className = "toast" + (ok ? "" : " bad"); }, 4000);
  }
  /* the line beside Save stays until the next action: saved / not saved and why */
  function setStatus(html, kind) { const s = $("saveStatus"); if (s) { s.innerHTML = html; s.className = "status " + (kind || ""); } }

  /* ---------- login + load ---------- */
  async function unlock(e) {
    if (e) e.preventDefault();
    $("loginErr").textContent = "";
    if (!signedIn) {
      const pwd = $("pwd").value.trim(); if (!pwd) return;
      $("unlockBtn").disabled = true;
      try { await adminSignIn(pwd); signedIn = true; $("pwd").value = ""; }
      catch (err) { $("loginErr").textContent = /invalid/i.test(err.message) ? "Wrong password." : (err.message || "Login failed"); $("unlockBtn").disabled = false; return; }
    }
    $("unlockBtn").disabled = true;
    try { await load(); }
    catch (err) {
      // signed in, but the content did not come: do not open the editor on anything else
      $("loginErr").textContent = err.message + " Nothing was opened, so nothing can be saved by mistake.";
      $("pwd").classList.add("hidden"); $("unlockBtn").textContent = "Try again";
      $("unlockBtn").disabled = false; return;
    }
    $("login").classList.add("hidden");
    $("editor").classList.remove("hidden");
    $("logoutBtn").classList.remove("hidden");
    $("unlockBtn").disabled = false;
  }
  async function load() {
    const data = await adminLoadContent();
    units = data.units.sort((a, b) => a.unit.localeCompare(b.unit));
    site = data.site;
    $("loadedAt").textContent = "Loaded " + clock(data.at);
    dirty = false;
    selectUnit(current() ? selected : units[0].id, true);
    if (!$("tab-site").classList.contains("hidden")) renderSite();
  }

  /* ---------- unit list: what is on the board, and what each kitchen still lacks ---------- */
  function gaps(u) {
    const g = [];
    if (!u.logo) g.push("no logo");
    if (!u.hasHours) g.push("hours?");
    if (!(u.cuisine.en || "").trim()) g.push("no cuisine");
    return g;
  }
  function renderList() {
    const live = units.filter((u) => u.occupied), need = (k) => live.filter((u) => gaps(u).includes(k)).length;
    const summary = `<div class="ul-sum"><b>${live.length} on the board</b>${live.length ? ` · ${need("no logo")} need a logo · ${need("hours?")} need hours · ${need("no cuisine")} need a cuisine` : ""}</div>`;
    $("unitList").innerHTML = summary + units.map((u) => {
      const state = u.occupied ? "on" : isSoon(u) ? "soon" : "off";
      const name = u.occupied || isSoon(u) ? esc(u.name.en || u.name.zh || "(no name)") : "Vacant";
      const tags = (isSoon(u) ? `<span class="ul-tag soon">not on the board yet</span>` : "")
        + (u.occupied || isSoon(u) ? gaps(u).map((t) => `<span class="ul-tag">${t}</span>`).join("") : "")
        + (u.id === selected && dirty ? `<span class="ul-tag unsaved">unsaved</span>` : "");
      return `
      <button class="ul-item ${u.id === selected ? "active" : ""}" type="button" data-id="${esc(u.id)}">
        <span class="ul-dot ${state}"></span>
        <span class="ul-code">${esc(u.unit)}</span>
        <span class="ul-main"><span class="ul-name">${name}</span>${tags ? `<span class="ul-tags">${tags}</span>` : ""}</span>
      </button>`;
    }).join("");
    $("unitList").querySelectorAll(".ul-item").forEach((b) => b.addEventListener("click", () => selectUnit(b.dataset.id)));
  }

  /* ---------- edit form (works on a draft; the kitchen changes only once the database says so) ---------- */
  function selectUnit(id, force) {
    if (!force && dirty && id !== selected) {
      setStatus(`Unsaved changes to ${esc(current().unit)}: save them, or <button type="button" class="linkbtn" id="discardBtn">discard them</button>.`, "warn");
      $("discardBtn").addEventListener("click", () => { dirty = false; selectUnit(id, true); });
      return;
    }
    selected = id; dirty = false;
    draft = clone(current());
    $("unitForm").innerHTML = formHTML(draft);
    wireForm();
    renderList();
    if (!force && matchMedia("(max-width: 920px)").matches) $("unitForm").scrollIntoView({ block: "start", behavior: "smooth" });
  }
  const imgPrev = (url) => (url ? `<img src="${esc(url)}" alt="">` : `<span class="noimg">none</span>`);

  function formHTML(u) {
    const cats = `<option value="" ${u.cat ? "" : "selected"}>— none (listed under All only)</option>` + CATEGORIES.filter((c) => c.key !== "all")
      .map((c) => `<option value="${c.key}" ${u.cat === c.key ? "selected" : ""}>${c.icon} ${c.label.en}</option>`).join("");
    const changed = u.updatedAt ? new Date(u.updatedAt).toLocaleString("en-SG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
    return `
      <div class="form-head">
        <div><h2>${esc(u.unit)}</h2>${changed ? `<div class="updated">Last changed ${esc(changed)}</div>` : ""}</div>
        <label class="switch"><input type="checkbox" id="f_occ" ${u.occupied ? "checked" : ""}/><span>On the board</span></label>
      </div>
      <p class="field-note">${isSoon(u)
        ? "Signed, not moved in yet: the wall shows it as “Coming soon”, and it switches on by itself on its access date."
        : "On/off follows the rent roll, checked every hour: on from the access date, off the day after the licence ends. A change here is undone at the next check, unless this kitchen is not in the rent roll."}</p>
      <div class="grid2">
        <label>Name (English) <span class="hint">the name riders know</span><input id="f_name_en" maxlength="60" value="${esc(u.name.en)}"/></label>
        <label>名称 (中文) <span class="hint">optional — the English name is used if blank</span><input id="f_name_zh" maxlength="40" value="${esc(u.name.zh)}"/></label>
        <label>Cuisine (English) <span class="hint">e.g. Korean Homestyle</span><input id="f_cui_en" maxlength="40" value="${esc(u.cuisine.en)}"/></label>
        <label>菜系 (中文) <span class="hint">optional</span><input id="f_cui_zh" maxlength="40" value="${esc(u.cuisine.zh)}"/></label>
        <label>Hours <span class="hint">leave both blank if unknown — the board then shows none</span><span class="hoursrow"><input type="time" id="f_open" aria-label="Opens" value="${esc(u.hours.open)}"/><span>–</span><input type="time" id="f_close" aria-label="Closes" value="${esc(u.hours.close)}"/></span></label>
        <label>Category <span class="hint">the filter it appears under</span><select id="f_cat">${cats}</select></label>
      </div>
      <div class="grid2">
        <div class="upload"><div class="up-label">Logo <span class="hint">PNG or JPG, square if possible, 512 px or more. Shown inside a white circle: avoid white logos and long word-marks.</span></div><div class="preview logo" id="pv_logo">${imgPrev(u.logo)}</div><div class="up-row"><input type="file" id="f_logo" accept="image/png,image/jpeg,image/webp"/><button type="button" class="btn ghost sm" id="rm_logo" ${u.logo ? "" : "hidden"}>Remove</button></div></div>
        <div class="upload"><div class="up-label">Ad background <span class="hint">Landscape photo, about 1920 × 1080. It is darkened and the name sits on top: avoid pictures with words. Leave empty to use the logo colour.</span></div><div class="preview wide" id="pv_bg">${imgPrev(u.adBg)}</div><div class="up-row"><input type="file" id="f_bg" accept="image/png,image/jpeg,image/webp"/><button type="button" class="btn ghost sm" id="rm_bg" ${u.adBg ? "" : "hidden"}>Remove</button></div></div>
      </div>
      <details class="extras">
        <summary>Extras — tagline, colour, icon</summary>
        <div class="grid2">
          <label>Tagline (English)<input id="f_tag_en" maxlength="60" value="${esc(u.tagline.en)}"/></label>
          <label>标语 (中文)<input id="f_tag_zh" maxlength="40" value="${esc(u.tagline.zh)}"/></label>
          <label>Accent colour <span class="hint">set from the logo on upload</span><span class="colorrow"><input type="color" id="f_color" aria-label="Accent colour" value="${/^#[0-9a-fA-F]{6}$/.test(u.color) ? u.color : "#888888"}"/><input type="text" id="f_color_t" aria-label="Colour code" value="${esc(u.color || "")}"/></span></label>
          <label>Icon <span class="hint">one emoji, used only when there is no logo</span><input id="f_icon" maxlength="8" value="${esc(u.icon || "")}"/></label>
        </div>
      </details>
      <div class="form-foot"><span class="status" id="saveStatus" role="status" aria-live="polite"></span><button class="btn" id="saveBtn" type="button">Save changes</button></div>`;
  }

  function wireForm() {
    const form = $("unitForm");
    const mark = () => { if (!dirty) { dirty = true; renderList(); setStatus("Unsaved changes.", "warn"); } };
    form.querySelectorAll("input:not([type=file]), select").forEach((el) => el.addEventListener("input", mark));
    $("f_color").addEventListener("input", (e) => { $("f_color_t").value = e.target.value; });
    $("f_color_t").addEventListener("input", (e) => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) $("f_color").value = e.target.value; });
    $("f_logo").addEventListener("change", (e) => handleUpload(e, "logo", "pv_logo", "rm_logo", mark));
    $("f_bg").addEventListener("change", (e) => handleUpload(e, "adBg", "pv_bg", "rm_bg", mark));
    $("rm_logo").addEventListener("click", () => { removeAsset("logo", "pv_logo", "rm_logo", "f_logo"); mark(); });
    $("rm_bg").addEventListener("click", () => { removeAsset("adBg", "pv_bg", "rm_bg", "f_bg"); mark(); });
    $("saveBtn").addEventListener("click", saveUnit);
  }

  /* clear a logo / ad background back to none on the draft (the board falls back to the icon /
     the logo colour). Takes effect on Save. */
  function removeAsset(field, pvId, rmId, fileId) {
    draft[field] = null;
    const pv = $(pvId); pv.replaceChildren();
    const s = document.createElement("span"); s.className = "noimg"; s.textContent = "none"; pv.appendChild(s);
    $(rmId).hidden = true;
    $(fileId).value = "";                      // let the same file be re-picked later
  }

  async function handleUpload(e, field, pvId, rmId, mark) {
    const file = e.target.files[0]; if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setStatus("That file is not a PNG, JPG or WebP picture.", "bad"); e.target.value = ""; return; }
    const u = draft, pv = $(pvId); pv.innerHTML = `<span class="noimg">uploading…</span>`;
    uploading++; $("saveBtn").disabled = true;
    try {
      let matched = false;
      if (field === "logo") {                         // derive accent colour so the background matches the logo
        const c = await dominantColor(file).catch(() => null);
        if (c) { u.color = c; matched = true; const cc = $("f_color"), ct = $("f_color_t"); if (cc) cc.value = c; if (ct) ct.value = c; }
      }
      const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
      const url = await adminUploadAsset(file, `${u.unit}/${field}-${Date.now()}.${ext}`);
      u[field] = url; pv.innerHTML = imgPrev(url);
      if (rmId && $(rmId)) $(rmId).hidden = false;      // an image exists now — offer Remove
      mark();
      setStatus((field === "logo" ? "Logo uploaded" + (matched ? ", accent colour set to match" : "") : "Background uploaded") + ". Save to put it on the board.", "warn");
    } catch (err) { pv.innerHTML = imgPrev(u[field]); setStatus(esc(err.message), "bad"); }
    finally { uploading--; if (!uploading) $("saveBtn").disabled = false; }
  }

  /* representative colour of a logo (skips transparent / near-white / near-black, favours vivid pixels) */
  function dominantColor(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const n = 40, cv = document.createElement("canvas"); cv.width = n; cv.height = n;
        const ctx = cv.getContext("2d"); ctx.drawImage(img, 0, 0, n, n);
        let d; try { d = ctx.getImageData(0, 0, n, n).data; } catch (err) { URL.revokeObjectURL(img.src); return reject(err); }
        let r = 0, g = 0, b = 0, w = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 128) continue;
          const rr = d[i], gg = d[i + 1], bb = d[i + 2], sum = rr + gg + bb;
          if (sum > 735 || sum < 35) continue;
          const wt = 1 + (Math.max(rr, gg, bb) - Math.min(rr, gg, bb)) / 60;
          r += rr * wt; g += gg * wt; b += bb * wt; w += wt;
        }
        URL.revokeObjectURL(img.src);
        if (!w) return resolve(null);
        resolve("#" + [r, g, b].map((v) => Math.round(v / w).toString(16).padStart(2, "0")).join(""));
      };
      img.onerror = (err) => { URL.revokeObjectURL(img.src); reject(err); };
      img.src = URL.createObjectURL(file);
    });
  }

  async function saveUnit() {
    const next = clone(draft);
    next.occupied = $("f_occ").checked;
    next.name = { en: $("f_name_en").value.trim(), zh: $("f_name_zh").value.trim() };
    next.cuisine = { en: $("f_cui_en").value.trim(), zh: $("f_cui_zh").value.trim() };
    next.tagline = { en: $("f_tag_en").value.trim(), zh: $("f_tag_zh").value.trim() };
    next.cat = $("f_cat").value;
    const ct = $("f_color_t").value.trim();
    if (ct && !/^#[0-9a-fA-F]{6}$/.test(ct)) { $("unitForm").querySelector(".extras").open = true; return setStatus("The colour code must look like #1A2B3C.", "bad"); }
    next.color = ct || $("f_color").value;
    next.icon = $("f_icon").value.trim();
    const open = $("f_open").value, close = $("f_close").value;
    if (!!open !== !!close) return setStatus("Enter both the opening and the closing time, or leave both blank.", "bad");
    next.hours = { open, close }; next.hasHours = !!(open && close);
    if (next.occupied && !next.name.en) return setStatus("A kitchen on the board needs an English name.", "bad");
    $("saveBtn").disabled = true; setStatus("Saving…", "");
    try {
      const row = await adminSaveUnit(next);
      next.updatedAt = (row && row.updated_at) || new Date().toISOString();
      units[units.findIndex((x) => x.id === next.id)] = next;
      draft = clone(next); dirty = false;
      renderList();
      const head = $("unitForm").querySelector(".updated");
      if (head) head.textContent = "Last changed " + new Date(next.updatedAt).toLocaleString("en-SG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      setStatus(`Saved ${clock(new Date())} — on the wall within ${refreshMin()} min.`, "ok");
    } catch (e) { setStatus(esc(e.message), "bad"); }       // nothing typed is lost: the form keeps it
    finally { $("saveBtn").disabled = false; }
  }

  /* ---------- tabs ---------- */
  function showTab(name) {
    $("tab-units").classList.toggle("hidden", name !== "units");
    $("tab-site").classList.toggle("hidden", name !== "site");
    document.querySelectorAll(".adm-tabs .tab").forEach((b) => { const on = b.dataset.tab === name; b.classList.toggle("active", on); b.setAttribute("aria-selected", on ? "true" : "false"); });
    if (name === "site") renderSite();
  }

  /* ---------- site settings form ---------- */
  const LIMITS = { s_slide: [2, 60, "seconds per slide"], s_idle: [10, 600, "seconds"], s_refresh: [15, 3600, "seconds"] };
  function renderSite() {
    const s = site || {};
    const opt = (v, cur, label) => `<option value="${v}"${cur === v ? " selected" : ""}>${label}</option>`;
    $("tab-site").innerHTML = `
      <h3>Identity</h3>
      <div class="grid2">
        <label>Facility name <span class="hint">shown in English in both languages</span><input id="s_name_en" value="${esc(s.name.en)}" placeholder="KitchenBASE"/></label>
        <label>Subtitle (English)<input id="s_sub_en" value="${esc(s.subtitle.en)}" placeholder="Kitchen Directory"/></label>
        <label>副标题 (中文)<input id="s_sub_zh" value="${esc(s.subtitle.zh)}" placeholder="厨房商家指南"/></label>
      </div>
      <h3>Ad screen</h3>
      <div class="grid2">
        <label>Call to action (English)<input id="s_cta_en" value="${esc(s.ctaMain.en)}" placeholder="TOUCH TO BEGIN"/></label>
        <label>主按钮文字 (中文)<input id="s_cta_zh" value="${esc(s.ctaMain.zh)}" placeholder="触摸屏幕开始"/></label>
        <label>Ad slide duration <span class="hint">2–60 seconds per slide</span><input type="number" min="2" max="60" id="s_slide" value="${esc(s.slideSeconds)}"/></label>
        <label>Back to the ads after <span class="hint">10–600 seconds without a touch (the board warns in the last few seconds)</span><input type="number" min="10" max="600" id="s_idle" value="${esc(s.idleSeconds)}"/></label>
      </div>
      <h3>Footer</h3>
      <div class="grid2">
        <label>Help line (English)<input id="s_help_en" value="${esc(s.help.en)}"/></label>
        <label>帮助提示 (中文)<input id="s_help_zh" value="${esc(s.help.zh)}"/></label>
        <label>Opening hours shown — from <span class="hint">blank = worked out from the kitchens, shown only when every kitchen has hours</span><input type="time" id="s_hopen" value="${esc(s.hoursOpen)}"/></label>
        <label>— to<input type="time" id="s_hclose" value="${esc(s.hoursClose)}"/></label>
      </div>
      <h3>Behaviour</h3>
      <div class="grid2">
        <label>Default language <span class="hint">what each new visitor sees first</span><select id="s_lang">${opt("en", s.defaultLang, "English")}${opt("zh", s.defaultLang, "中文")}</select></label>
        <label>Content refresh <span class="hint">15–3600 seconds; applies after the board's next restart</span><input type="number" min="15" max="3600" id="s_refresh" value="${esc(s.refreshSeconds)}"/></label>
      </div>
      <p class="field-note">Slide and idle times reach the wall at its next content refresh (within ${refreshMin()} min).</p>
      <div class="form-foot"><span class="status" id="siteStatus" role="status" aria-live="polite"></span><button class="btn" id="saveSiteBtn" type="button">Save site settings</button></div>`;
    $("saveSiteBtn").addEventListener("click", saveSite);
  }

  async function saveSite() {
    const st = (html, kind) => { const e = $("siteStatus"); e.innerHTML = html; e.className = "status " + (kind || ""); };
    const v = (id) => $(id).value.trim();
    for (const [id, [lo, hi, unit]] of Object.entries(LIMITS)) {
      const n = Number($(id).value);
      if (!Number.isInteger(n) || n < lo || n > hi) { $(id).focus(); return st(`Enter ${lo} to ${hi} ${unit}.`, "bad"); }
    }
    if (!!v("s_hopen") !== !!v("s_hclose")) return st("Enter both opening-hours times, or leave both blank.", "bad");
    const next = clone(site);
    next.name     = { en: v("s_name_en"), zh: v("s_name_en") };        // the board shows the English name in both languages
    next.subtitle = { en: v("s_sub_en"),  zh: v("s_sub_zh") };
    next.ctaMain  = { en: v("s_cta_en"),  zh: v("s_cta_zh") };
    next.help     = { en: v("s_help_en"), zh: v("s_help_zh") };
    next.hoursOpen = v("s_hopen"); next.hoursClose = v("s_hclose");
    next.defaultLang = $("s_lang").value;
    next.slideSeconds = Number($("s_slide").value); next.idleSeconds = Number($("s_idle").value); next.refreshSeconds = Number($("s_refresh").value);
    $("saveSiteBtn").disabled = true; st("Saving…", "");
    try { await adminSaveFacility(next); site = next; st(`Saved ${clock(new Date())} — on the wall within ${refreshMin()} min.`, "ok"); }
    catch (e) { st(esc(e.message), "bad"); }
    finally { const b = $("saveSiteBtn"); if (b) b.disabled = false; }
  }

  /* ---------- wiring ---------- */
  document.querySelectorAll(".adm-tabs .tab").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  $("loginForm").addEventListener("submit", unlock);
  $("reloadBtn").addEventListener("click", async () => {
    if (dirty) return setStatus(`Unsaved changes to ${esc(current().unit)}: save or discard them before reloading.`, "warn");
    try { await load(); toast("Reloaded from the database"); } catch (e) { toast(e.message, false); }
  });
  let logoutArmed = false;
  $("logoutBtn").addEventListener("click", () => {
    if (dirty && !logoutArmed) { logoutArmed = true; return setStatus("Unsaved changes — press Log out again to leave without saving.", "warn"); }
    location.reload();
  });
  addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
  $("user").value = CONFIG.adminEmail || "";
  if (!CONFIG.supabaseUrl) $("loginErr").textContent = "Supabase is not configured in js/config.js yet.";
})();
