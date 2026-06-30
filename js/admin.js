/* =============================================================================
 * admin.js — staff CMS. Login with the shared password, edit each unit's
 * content (name/cuisine/tagline/hours/category/colour/icon + occupied), upload
 * logo + ad background to Supabase Storage, and save back to the database.
 * Reuses db.js (adminSignIn / adminSaveUnit / adminUploadAsset / loadContent).
 * ========================================================================== */

(function () {
  "use strict";

  let units = [], selected = null, site = null;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  function toast(msg, ok = true) {
    const t = $("toast"); t.textContent = msg; t.className = "toast show" + (ok ? "" : " bad");
    setTimeout(() => { t.className = "toast" + (ok ? "" : " bad"); }, 2600);
  }

  /* ---------- login ---------- */
  async function unlock() {
    const pwd = $("pwd").value.trim();
    if (!pwd) return;
    $("unlockBtn").disabled = true; $("loginErr").textContent = "";
    try {
      await adminSignIn(pwd);
      await loadContent();
      units = [...KITCHENS].sort((a, b) => a.unit.localeCompare(b.unit));
      site = JSON.parse(JSON.stringify(SETTINGS || {}));
      $("login").classList.add("hidden");
      $("editor").classList.remove("hidden");
      $("logoutBtn").classList.remove("hidden");
      renderList();
      if (units[0]) selectUnit(units[0].id);
    } catch (e) {
      $("loginErr").textContent = e.message || "Login failed";
    } finally { $("unlockBtn").disabled = false; }
  }

  /* ---------- unit list ---------- */
  function renderList() {
    $("unitList").innerHTML = units.map((u) => `
      <button class="ul-item ${u.id === selected ? "active" : ""}" data-id="${u.id}">
        <span class="ul-dot ${u.occupied ? "on" : "off"}"></span>
        <span class="ul-code">${u.unit}</span>
        <span class="ul-name">${u.occupied ? esc(u.name.en || "(no name)") : "Available"}</span>
      </button>`).join("");
    $("unitList").querySelectorAll(".ul-item").forEach((b) => b.addEventListener("click", () => selectUnit(b.dataset.id)));
  }

  /* ---------- edit form ---------- */
  function selectUnit(id) {
    selected = id; renderList();
    const u = units.find((x) => x.id === id);
    $("unitForm").innerHTML = formHTML(u);
    wireForm(u);
  }
  const imgPrev = (url) => (url ? `<img src="${esc(url)}" alt="">` : `<span class="noimg">none</span>`);

  function formHTML(u) {
    const cats = CATEGORIES.filter((c) => c.key !== "all")
      .map((c) => `<option value="${c.key}" ${u.cat === c.key ? "selected" : ""}>${c.icon} ${c.label.en}</option>`).join("");
    return `
      <div class="form-head">
        <h2>${u.unit}</h2>
        <label class="switch"><input type="checkbox" id="f_occ" ${u.occupied ? "checked" : ""}/><span>Occupied</span></label>
      </div>
      <div class="grid2">
        <label>Name (EN)<input id="f_name_en" value="${esc(u.name.en)}" placeholder="e.g. Sweet Lab"/></label>
        <label>名称 (中)<input id="f_name_zh" value="${esc(u.name.zh)}" placeholder="例如 甜点实验室"/></label>
        <label>Cuisine (EN)<input id="f_cui_en" value="${esc(u.cuisine.en)}" placeholder="e.g. Desserts"/></label>
        <label>菜系 (中)<input id="f_cui_zh" value="${esc(u.cuisine.zh)}" placeholder="例如 甜品"/></label>
        <label>Tagline (EN)<input id="f_tag_en" value="${esc(u.tagline.en)}"/></label>
        <label>标语 (中)<input id="f_tag_zh" value="${esc(u.tagline.zh)}"/></label>
        <label>Category<select id="f_cat">${cats}</select></label>
        <label>Accent colour<span class="colorrow"><input type="color" id="f_color" value="${/^#[0-9a-fA-F]{6}$/.test(u.color) ? u.color : "#888888"}"/><input type="text" id="f_color_t" value="${esc(u.color || "")}"/></span></label>
        <label>Icon (emoji)<input id="f_icon" value="${esc(u.icon || "")}" placeholder="🍰"/></label>
        <label>Hours<span class="hoursrow"><input type="time" id="f_open" value="${esc(u.hours.open)}"/><span>–</span><input type="time" id="f_close" value="${esc(u.hours.close)}"/></span></label>
      </div>
      <div class="grid2">
        <div class="upload"><div class="up-label">Logo <span class="hint">Square PNG · transparent background · ~512×512 px</span></div><div class="preview logo" id="pv_logo">${imgPrev(u.logo)}</div><input type="file" id="f_logo" accept="image/*"/></div>
        <div class="upload"><div class="up-label">Ad background <span class="hint">Landscape JPG/PNG · ~1600×1000 px · leave empty to auto-match the logo colour</span></div><div class="preview wide" id="pv_bg">${imgPrev(u.adBg)}</div><input type="file" id="f_bg" accept="image/*"/></div>
      </div>
      <div class="form-foot"><button class="btn" id="saveBtn">Save changes</button></div>`;
  }

  function wireForm(u) {
    $("f_color").addEventListener("input", (e) => { $("f_color_t").value = e.target.value; });
    $("f_color_t").addEventListener("input", (e) => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) $("f_color").value = e.target.value; });
    $("f_logo").addEventListener("change", (e) => handleUpload(e, u, "logo", "pv_logo"));
    $("f_bg").addEventListener("change", (e) => handleUpload(e, u, "adBg", "pv_bg"));
    $("saveBtn").addEventListener("click", () => saveUnit(u));
  }

  async function handleUpload(e, u, field, pvId) {
    const file = e.target.files[0]; if (!file) return;
    const pv = $(pvId); pv.innerHTML = `<span class="noimg">uploading…</span>`;
    try {
      if (field === "logo") {                         // derive accent colour so the background matches the logo
        const c = await dominantColor(file).catch(() => null);
        if (c) { u.color = c; const cc = $("f_color"), ct = $("f_color_t"); if (cc) cc.value = c; if (ct) ct.value = c; }
      }
      const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
      const url = await adminUploadAsset(file, `${u.unit}/${field}-${Date.now()}.${ext}`);
      u[field] = url; pv.innerHTML = imgPrev(url);
      toast(field === "logo" ? "Logo uploaded — accent set to match. Save to apply." : "Background uploaded — remember to Save");
    } catch (err) { pv.innerHTML = imgPrev(u[field]); toast(err.message, false); }
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

  async function saveUnit(u) {
    u.occupied = $("f_occ").checked;
    u.name = { en: $("f_name_en").value.trim(), zh: $("f_name_zh").value.trim() };
    u.cuisine = { en: $("f_cui_en").value.trim(), zh: $("f_cui_zh").value.trim() };
    u.tagline = { en: $("f_tag_en").value.trim(), zh: $("f_tag_zh").value.trim() };
    u.cat = $("f_cat").value;
    const ct = $("f_color_t").value.trim();
    u.color = /^#[0-9a-fA-F]{6}$/.test(ct) ? ct : $("f_color").value;   // fall back to the picker (always valid hex)
    u.icon = $("f_icon").value.trim();
    u.hours = { open: $("f_open").value || "10:00", close: $("f_close").value || "22:00" };
    $("saveBtn").disabled = true;
    try { await adminSaveUnit(u); toast("Saved ✓"); renderList(); }
    catch (e) { toast(e.message, false); }
    finally { const b = $("saveBtn"); if (b) b.disabled = false; }
  }

  /* ---------- tabs ---------- */
  function showTab(name) {
    $("tab-units").classList.toggle("hidden", name !== "units");
    $("tab-site").classList.toggle("hidden", name !== "site");
    document.querySelectorAll(".adm-tabs .tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    if (name === "site") renderSite();
  }

  /* ---------- site settings form ---------- */
  function renderSite() {
    const s = site || {};
    const opt = (v, cur, label) => `<option value="${v}"${cur === v ? " selected" : ""}>${label}</option>`;
    $("tab-site").innerHTML = `
      <h3>Identity</h3>
      <div class="grid2">
        <label>Facility name (EN)<input id="s_name_en" value="${esc(s.name.en)}" placeholder="SMART CITY KITCHENS"/></label>
        <label>名称 (中)<input id="s_name_zh" value="${esc(s.name.zh)}" placeholder="智慧城市厨房"/></label>
        <label>Subtitle (EN)<input id="s_sub_en" value="${esc(s.subtitle.en)}" placeholder="Kitchen Directory"/></label>
        <label>副标题 (中)<input id="s_sub_zh" value="${esc(s.subtitle.zh)}" placeholder="厨房指南"/></label>
        <label>Address (EN)<input id="s_addr_en" value="${esc(s.address.en)}" placeholder="Bedok Food City"/></label>
        <label>地址 (中)<input id="s_addr_zh" value="${esc(s.address.zh)}" placeholder="勿洛美食城"/></label>
      </div>
      <h3>Attract / ad screen</h3>
      <div class="grid2">
        <label>Call-to-action (EN)<input id="s_cta_en" value="${esc(s.ctaMain.en)}" placeholder="TOUCH TO BEGIN"/></label>
        <label>主按钮文字 (中)<input id="s_cta_zh" value="${esc(s.ctaMain.zh)}" placeholder="触摸屏幕开始"/></label>
        <label>Sub-text (EN)<input id="s_csub_en" value="${esc(s.ctaSub.en)}" placeholder="Tap anywhere to start"/></label>
        <label>副文字 (中)<input id="s_csub_zh" value="${esc(s.ctaSub.zh)}" placeholder="点击任意位置开始"/></label>
        <label>Ad slide duration <span class="hint">seconds per slide</span><input type="number" min="2" max="60" id="s_slide" value="${s.slideSeconds}"/></label>
        <label>Return to ads when idle <span class="hint">seconds of inactivity</span><input type="number" min="10" max="600" id="s_idle" value="${s.idleSeconds}"/></label>
      </div>
      <h3>Footer</h3>
      <div class="grid2">
        <label>Help line (EN)<input id="s_help_en" value="${esc(s.help.en)}" placeholder="Need help? Just ask any staff member."/></label>
        <label>帮助提示 (中)<input id="s_help_zh" value="${esc(s.help.zh)}" placeholder="需要帮助？请询问任何工作人员。"/></label>
        <label>Hours shown — open <span class="hint">blank = auto from kitchens</span><input type="time" id="s_hopen" value="${esc(s.hoursOpen)}"/></label>
        <label>Hours shown — close <span class="hint">blank = auto from kitchens</span><input type="time" id="s_hclose" value="${esc(s.hoursClose)}"/></label>
      </div>
      <h3>Defaults</h3>
      <div class="grid2">
        <label>Default theme<select id="s_theme">${opt("bright", s.defaultTheme, "Day (bright)")}${opt("dark", s.defaultTheme, "Night (dark)")}</select></label>
        <label>Default map view<select id="s_view">${opt("3d", s.defaultView, "3D")}${opt("2d", s.defaultView, "2D")}</select></label>
        <label>Default language<select id="s_lang">${opt("en", s.defaultLang, "English")}${opt("zh", s.defaultLang, "中文")}</select></label>
        <label>Content refresh <span class="hint">seconds (takes effect on kiosk reload)</span><input type="number" min="15" max="3600" id="s_refresh" value="${s.refreshSeconds}"/></label>
      </div>
      <div class="form-foot"><button class="btn" id="saveSiteBtn">Save site settings</button></div>`;
    $("saveSiteBtn").addEventListener("click", saveSite);
  }

  async function saveSite() {
    const v = (id) => $(id).value.trim();
    const num = (id, def) => { const n = parseInt($(id).value, 10); return Number.isFinite(n) ? n : def; };
    site.name     = { en: v("s_name_en"), zh: v("s_name_zh") };
    site.subtitle = { en: v("s_sub_en"),  zh: v("s_sub_zh") };
    site.address  = { en: v("s_addr_en"), zh: v("s_addr_zh") };
    site.ctaMain  = { en: v("s_cta_en"),  zh: v("s_cta_zh") };
    site.ctaSub   = { en: v("s_csub_en"), zh: v("s_csub_zh") };
    site.help     = { en: v("s_help_en"), zh: v("s_help_zh") };
    site.hoursOpen = v("s_hopen"); site.hoursClose = v("s_hclose");
    site.defaultTheme = $("s_theme").value; site.defaultView = $("s_view").value; site.defaultLang = $("s_lang").value;
    site.slideSeconds = num("s_slide", 5); site.idleSeconds = num("s_idle", 60); site.refreshSeconds = num("s_refresh", 180);
    $("saveSiteBtn").disabled = true;
    try { await adminSaveFacility(site); toast("Site settings saved ✓"); }
    catch (e) { toast(e.message, false); }
    finally { const b = $("saveSiteBtn"); if (b) b.disabled = false; }
  }

  /* ---------- wiring ---------- */
  document.querySelectorAll(".adm-tabs .tab").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  $("unlockBtn").addEventListener("click", unlock);
  $("pwd").addEventListener("keydown", (e) => { if (e.key === "Enter") unlock(); });
  $("logoutBtn").addEventListener("click", () => location.reload());
  if (!CONFIG.supabaseUrl) $("loginErr").textContent = "Supabase is not configured in js/config.js yet.";
})();
