/* =============================================================================
 * map.js — renders the S13 floor map. Two views, same data (FLOORPLAN):
 *   render2D — flat top-down plan
 *   render3D — isometric 2.5D: kitchens extruded into lit/shaded blocks
 * render(container, id, lang, theme, mode) dispatches on mode ('2d' | '3d').
 * id may be null (no selection); colours come from CSS vars / brand colours.
 * ========================================================================== */

const MapKiosk = (function () {
  const FP = FLOORPLAN;
  const center = (u) => ({ x: u.x + u.w / 2, y: u.y + u.h / 2 });
  const kitchenOf = (id) => KITCHENS.find((k) => k.id === id);

  /* ---- shared: walking route + directions (top-down coords) ------------- */
  function routePoints(id) {
    const u = FP.units[id], c = FP.corridor, k = FP.kiosk, ctr = center(u);
    if (id === "K03")            // big corner kitchen: down the left corridor to the lower corridor, in at its top-right (right side is a wall)
      return [[k.x, k.y], [c.spurX, c.hY], [c.vX, c.hY], [c.vX, c.lY], [c.lX0, c.lY], [u.x + u.w - 26, c.lY + 28]];
    if (u.face === "k1k2")       // K-01/K-02: from the kiosk go right then down (around the car park), along the front, UP the walkway beside K-01, in from the lower corridor
      return [[k.x, k.y], [c.rightX, k.y], [c.rightX, c.frontY], [c.k1k2X, c.frontY], [c.k1k2X, c.lY], [ctr.x, c.lY], [ctr.x, u.y]];
    const pts = [[k.x, k.y], [c.spurX, c.hY]];
    if (u.face === "down")       pts.push([ctr.x, c.hY], [ctr.x, u.y + u.h]);
    else if (u.face === "up")    pts.push([ctr.x, c.hY], [ctr.x, u.y]);
    else if (u.face === "right") pts.push([c.vX, c.hY], [c.vX, ctr.y], [u.x + u.w, ctr.y]);
    else                         pts.push([c.vX, c.hY], [c.vX, c.lY], [ctr.x, c.lY], [ctr.x, u.y]);   // cold kitchens: down the left/centre corridor, in from the middle
    return pts;
  }
  function zoneText(face, lang) {
    return ({ down: { en: "along the top row", zh: "顶部一排" }, up: { en: "in the centre", zh: "中央区域" },
              right: { en: "in the far-left row", zh: "最左侧一排" }, lower: { en: "in the lower-centre row", zh: "下方一排" },
              k1k2: { en: "in the lower row, through the K1 & 2 entrance", zh: "下方一排，经 K1 & 2 入口进入" } }[face])[lang];
  }
  function directions(id, lang) {
    const u = FP.units[id], k = kitchenOf(id), zone = zoneText(u.face, lang), code = id.replace("K", "K-");
    const name = (k.name && (k.name[lang] || k.name.en)) || code;   // same current→en fallback as app.js pick()
    return lang === "zh"
      ? `从这里沿走廊前行 —— ${name}（${code}）位于${zone}，跟随高亮路线即可到达。`
      : `Follow the corridor from here — ${name} (${code}) is ${zone}. Just follow the highlighted path.`;
  }

  function render(container, id, lang, theme, mode) {
    if (mode === "2d") { stopAnim(); return render2D(container, id, lang, theme); }
    return render3D(container, id, lang, theme);
  }

  /* ======================= 2D (flat top-down) ======================= */
  function render2D(container, id, lang, theme) {
    const W = FP.viewBox.w, H = FP.viewBox.h, c = FP.corridor, k = FP.kiosk;
    const bright = theme === "bright", selK = id ? kitchenOf(id) : null, selOcc = !!(selK && selK.occupied), brand = selOcc ? selK.color : "#8A93A4";
    const lanes = `<g class="fp-lanes">
        <rect x="${c.hX0}" y="${c.hY - 16}" width="${c.hX1 - c.hX0}" height="32"/>
        <rect x="${c.vX - 16}" y="${c.vY0}" width="32" height="${c.vY1 - c.vY0 + 15}"/>
        <rect x="${c.lX0}" y="${c.lY - 15}" width="${c.k1k2X + 15 - c.lX0}" height="30"/>
        <rect x="${c.spurX - 16}" y="${c.hY}" width="32" height="${k.y - c.hY + 15}"/>
        <rect x="${c.spurX - 16}" y="${k.y - 15}" width="${c.rightX + 15 - (c.spurX - 16)}" height="30"/>
        <rect x="${c.rightX - 15}" y="${k.y - 15}" width="30" height="${c.frontY - k.y + 30}"/>
        <rect x="${c.k1k2X - 15}" y="${c.frontY - 15}" width="${c.rightX + 15 - (c.k1k2X - 15)}" height="30"/>
        <rect x="${c.k1k2X - 15}" y="${c.lY - 15}" width="30" height="${c.frontY - c.lY + 30}"/>
        <rect x="${c.midX - 12}" y="${c.midY0}" width="24" height="${c.midY1 - c.midY0}"/></g>`;
    let rooms = "";
    for (const s of FP.service) rooms += `<rect class="fp-room" x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="10"/>
        <text class="fp-room-label" x="${s.x + s.w / 2}" y="${s.y + s.h / 2 + 5}">${I18N[s.key][lang]}</text>`;
    const doorCol2 = bright ? "#48526a" : "#aeb8c6";
    const doors2d = (FP.doors || []).map((d) => doorSVG(d, (x, y) => [x, y], doorCol2)).join("");
    let units = "";
    for (const [uid, u] of Object.entries(FP.units)) {
      const kk = kitchenOf(uid), cx = u.x + u.w / 2, cy = u.y + u.h / 2, isSel = uid === id, occ = kk.occupied;
      const col = occ ? kk.color : (bright ? "#aeb6c4" : "#3a414e"), code = uid.replace("K", "K-");
      const tf = isSel ? `fill:${idealText(col)};` : "";
      const rectStyle = isSel ? `fill:${rgba(col, .94)};stroke:${lighten(col, .35)};stroke-width:3` : `fill:${rgba(col, bright ? .17 : .13)};stroke:${rgba(col, bright ? .5 : .42)};stroke-width:1.5`;
      let inner;
      if (occ) {
        const ico = kk.logo
          ? logoOnMap(kk.logo, cx, cy - 14, 50)
          : `<text class="fp-unit-icon" x="${cx}" y="${cy - 6}" style="${tf}">${kk.icon}</text>`;
        inner = `<text class="fp-code" x="${u.x + 14}" y="${u.y + 32}" style="${tf}opacity:.65">${code}</text>${ico}<text class="fp-unit-name" x="${cx}" y="${cy + 66}" style="${tf}font-size:${fitSize(kk.name[lang], 29, u.w - 24)}px">${kk.name[lang]}</text>`;
      } else {
        inner = `<text class="fp-unit-name" x="${cx}" y="${cy + 8}" style="${tf}font-size:24px;font-weight:800">${code}</text>`;
      }
      units += `<g data-uid="${uid}" class="fp-unit-tap"><rect x="${u.x}" y="${u.y}" width="${u.w}" height="${u.h}" rx="${isSel ? 14 : 13}" style="${rectStyle}"${isSel ? ` filter="url(#fpGlow)"` : ""}/>${inner}</g>`;
    }
    let route = "";
    if (id && selOcc) { const pts = routePoints(id).map((p) => p.join(",")).join(" "), end = routePoints(id).at(-1);
      route = `<polyline class="fp-route-bg" points="${pts}"/><polyline class="fp-route" points="${pts}" style="stroke:${brand}"/>
               <circle cx="${end[0]}" cy="${end[1]}" r="14" style="fill:${brand};stroke:#fff;stroke-width:3"/>`; }
    container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Floor plan">
      <defs>${glowDefs(brand)}</defs>
      <rect class="fp-building" x="20" y="20" width="${W - 40}" height="${H - 40}" rx="30" filter="url(#fpSoft)"/>
      ${lanes}${rooms}${doors2d}${units}${route}
      <g><rect x="${k.x - 62}" y="${k.y - 26}" width="124" height="56" rx="11" fill="#ffffff" stroke="var(--map-line)" stroke-width="1.5"/>
        <circle class="fp-here-dot" cx="${k.x}" cy="${k.y - 6}" r="6"/>
        <text class="fp-here-label" x="${k.x}" y="${k.y + 18}" style="font-size:13px">${I18N.youAreHere[lang]}</text></g></svg>`;
  }

  /* ======================= 3D (isometric, morphs to top-down) ============ */
  const D2R = Math.PI / 180, PIVOT = { x: FP.viewBox.w / 2, y: FP.viewBox.h / 2 };
  const GAP = 9;               // floor gap between a kitchen block and the walkway
  const BH = 48;              // block extrude height (world units)
  const WALL_SIGN = -1;       // draw only the camera-facing walls (front + side), not the hidden back ones
  function cam(aDeg, bDeg, scale) { const a = aDeg * D2R, b = bDeg * D2R; return { sx: scale, sy: scale * Math.sin(b), zk: scale * Math.cos(b), cosA: Math.cos(a), sinA: Math.sin(a) }; }
  const CAM_ISO = cam(30, 40, 1.0), CAM_TOP = cam(0, 90, 1.28);
  function pj(x, y, z, C) { const dx = x - PIVOT.x, dy = y - PIVOT.y; return [(dx * C.cosA - dy * C.sinA) * C.sx, (dx * C.sinA + dy * C.cosA) * C.sy - z * C.zk]; }
  const ps = (p) => p[0].toFixed(1) + "," + p[1].toFixed(1);
  function depthKey(u, C) { const dx = (u.x + u.w / 2) - PIVOT.x, dy = (u.y + u.h / 2) - PIVOT.y; return dx * C.sinA + dy * C.cosA; }
  function sgnArea(q) { let a = 0; for (let i = 0; i < q.length; i++) { const j = (i + 1) % q.length; a += q[i][0] * q[j][1] - q[j][0] * q[i][1]; } return a; }

  // ---- camera-morph controller (iso at rest, tilts to top-down on select) --
  let A = { cam: null, key: null, raf: 0, from: null, to: null, t0: 0, dur: 0, args: null, vb: null };
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerpCam = (f, g, t) => ({ sx: lerp(f.sx, g.sx, t), sy: lerp(f.sy, g.sy, t), zk: lerp(f.zk, g.zk, t), cosA: lerp(f.cosA, g.cosA, t), sinA: lerp(f.sinA, g.sinA, t) });
  const easeIO = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const reduceMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function stopAnim() { if (A.raf) { cancelAnimationFrame(A.raf); A.raf = 0; } }
  function viewBoxFor(C) {   // fit the CURRENT camera so iso and top-down both fill the card
    let mnX = 1e9, mnY = 1e9, mxX = -1e9, mxY = -1e9;
    const ext = (p) => { if (p[0] < mnX) mnX = p[0]; if (p[1] < mnY) mnY = p[1]; if (p[0] > mxX) mxX = p[0]; if (p[1] > mxY) mxY = p[1]; };
    for (const [x, y] of [[0, 0], [FP.viewBox.w, 0], [FP.viewBox.w, FP.viewBox.h], [0, FP.viewBox.h]]) ext(pj(x, y, 0, C));
    for (const u of Object.values(FP.units)) for (const [cx, cy] of [[u.x, u.y], [u.x + u.w, u.y], [u.x + u.w, u.y + u.h], [u.x, u.y + u.h]]) ext(pj(cx, cy, BH * 1.4, C));
    const PAD = 8;
    return `${(mnX - PAD).toFixed(1)} ${(mnY - PAD).toFixed(1)} ${(mxX - mnX + 2 * PAD).toFixed(1)} ${(mxY - mnY + PAD + 30).toFixed(1)}`;
  }
  function render3D(container, id, lang, theme) {
    const key = (id && (kitchenOf(id) || {}).occupied) ? "top" : "iso";
    A.args = { container, id, lang, theme };
    if (!A.cam) { A.cam = key === "top" ? CAM_TOP : CAM_ISO; A.key = key; return drawScene(A.cam, key === "iso"); }
    if (key !== A.key) {
      A.key = key;
      if (key === "iso" || reduceMotion()) { stopAnim(); A.cam = key === "top" ? CAM_TOP : CAM_ISO; return drawScene(A.cam, key === "iso"); }  // snap back to iso (rise-in the blocks)
      A.from = A.cam; A.to = CAM_TOP; A.t0 = performance.now(); A.dur = 1050;                                                   // animate up to top-down (slightly slower, smoother)
      if (!A.raf) A.raf = requestAnimationFrame(tick);
      return;
    }
    if (!A.raf) drawScene(A.cam);   // redraw at rest (theme / language / poll)
  }
  function tick(now) {
    const e = Math.min(1, (now - A.t0) / A.dur);
    A.cam = lerpCam(A.from, A.to, easeIO(e));
    drawScene(A.cam);
    A.raf = e < 1 ? requestAnimationFrame(tick) : (A.cam = A.to, drawScene(A.cam), 0);
  }

  function drawScene(C, rise) {
    const { container, id, lang, theme } = A.args;
    const W = FP.viewBox.w, H = FP.viewBox.h, c = FP.corridor, k = FP.kiosk;
    const bright = theme === "bright";
    const selK = id ? kitchenOf(id) : null, selOcc = !!(selK && selK.occupied);
    const neutral = bright ? "#e9edf4" : "#191d28";
    const floorFill = bright ? "#d7dfea" : "#10151e";
    const floorStroke = bright ? "#c3cddb" : "rgba(255,255,255,.06)";
    const laneFill = bright ? "#ffffff" : "#626c78";
    const laneStroke = bright ? "#bcc7d6" : "#717c89";
    const roomFill = bright ? "#c7d1de" : "#283341";
    const doorCol = bright ? "#48526a" : "#cdd5e0";
    const brand = selOcc ? selK.color : "#8A93A4";
    const qp = (x, y, w, h, z) => `${ps(pj(x, y, z, C))} ${ps(pj(x + w, y, z, C))} ${ps(pj(x + w, y + h, z, C))} ${ps(pj(x, y + h, z, C))}`;

    let s = `<polygon points="${qp(0, 0, W, H, 0)}" style="fill:${floorFill};stroke:${floorStroke};stroke-width:2"/>`;
    // walkways: lighter raised strips + a dashed centre-line so they clearly read as corridors
    const lanes = [[c.hX0, c.hY - 22, c.hX1 - c.hX0, 44], [c.vX - 22, c.vY0, 44, c.vY1 - c.vY0 + 21], [c.lX0, c.lY - 21, c.k1k2X + 21 - c.lX0, 42], [c.spurX - 22, c.hY, 44, k.y - c.hY + 21], [c.spurX - 22, k.y - 21, c.rightX + 21 - (c.spurX - 22), 42], [c.rightX - 21, k.y - 21, 42, c.frontY - k.y + 42], [c.k1k2X - 21, c.frontY - 21, c.rightX + 21 - (c.k1k2X - 21), 42], [c.k1k2X - 21, c.lY - 21, 42, c.frontY - c.lY + 42], [c.midX - 13, c.midY0, 26, c.midY1 - c.midY0]];
    for (const [x, y, w, h] of lanes) s += `<polygon points="${qp(x, y, w, h, 1)}" style="fill:${laneFill}"/>`;
    for (const r of FP.service) { s += `<polygon points="${qp(r.x, r.y, r.w, r.h, 0)}" style="fill:${roomFill};stroke:${floorStroke}"/>`;
      const cc = pj(r.x + r.w / 2, r.y + r.h / 2, 0, C); s += `<text class="fp3-room-label" x="${cc[0].toFixed(1)}" y="${cc[1].toFixed(1)}">${I18N[r.key][lang]}</text>`; }
    for (const d of (FP.doors || [])) s += doorSVG(d, (x, y) => pj(x, y, 1, C), doorCol);

    // units painter-sorted far -> near for the current camera angle
    const entries = Object.entries(FP.units).sort((a, b) => depthKey(a[1], C) - depthKey(b[1], C));
    let _bi = -1;
    for (const [uid, u] of entries) {
      _bi++;
      const kk = kitchenOf(uid), isSel = uid === id, occ = kk.occupied;
      const col = occ ? kk.color : (bright ? "#b4bfce" : "#3a414e");
      const base = isSel ? col : mixc(col, neutral, bright ? 0.10 : 0.20);
      const top = isSel ? lighten(col, 0.16) : base;
      const zTop = isSel ? BH * 1.35 : BH;
      const x0 = u.x + GAP, y0 = u.y + GAP, x1 = u.x + u.w - GAP, y1 = u.y + u.h - GAP;
      const T = [pj(x0, y0, zTop, C), pj(x1, y0, zTop, C), pj(x1, y1, zTop, C), pj(x0, y1, zTop, C)];
      const Bp = [pj(x0, y0, 0, C), pj(x1, y0, 0, C), pj(x1, y1, 0, C), pj(x0, y1, 0, C)];
      let wallSvg = "";
      for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0]]) { const q = [T[i], T[j], Bp[j], Bp[i]];
        if (sgnArea(q) * WALL_SIGN > 0) wallSvg += `<polygon points="${q.map(ps).join(" ")}" style="fill:${darken(col, (i % 2) ? 0.26 : 0.40)}"/>`; }
      const ct = pj(x0 + (x1 - x0) / 2, y0 + (y1 - y0) / 2, zTop, C), txt = idealText(top), cp = pj(x0 + 14, y0 + 22, zTop, C), code = uid.replace("K", "K-");
      let inner;
      if (occ) {
        const lr = Math.round(48 * C.sy);   // logo scales with the camera so it stays ~half the block
        const ico = kk.logo
          ? logoOnMap(kk.logo, ct[0], ct[1] - lr * 0.26, lr)
          : `<text class="fp3-icon" x="${ct[0].toFixed(1)}" y="${(ct[1] - lr * 0.16).toFixed(1)}">${kk.icon}</text>`;
        inner = `<text class="fp3-code" x="${cp[0].toFixed(1)}" y="${cp[1].toFixed(1)}" style="fill:${txt};opacity:.6">${code}</text>${ico}<text class="fp3-name" x="${ct[0].toFixed(1)}" y="${(ct[1] + lr * 0.72 + 25).toFixed(1)}" style="fill:${txt};font-size:${fitSize(kk.name[lang], 29, u.w - 30)}px">${kk.name[lang]}</text>`;
      } else {
        inner = `<text class="fp3-name" x="${ct[0].toFixed(1)}" y="${(ct[1] + 6).toFixed(1)}" style="fill:${txt};font-size:22px;font-weight:800">${code}</text>`;
      }
      const topPoly = `<polygon points="${T.map(ps).join(" ")}" style="fill:${top};stroke:${isSel ? lighten(col, .4) : "rgba(0,0,0,.14)"};stroke-width:${isSel ? 2 : 1}"/>`;
      const sheen = `<polygon points="${T.map(ps).join(" ")}" style="fill:url(#fp3Sheen)" pointer-events="none"/>`;
      const body = `${wallSvg}${topPoly}${sheen}`;
      const gcls = "fp3-unit" + (isSel ? " fp3-sel" : (id ? " fp3-dim" : "")) + (rise ? " fp3-rise" : "");
      const gstyle = rise ? ` style="animation-delay:${(_bi * 0.028).toFixed(3)}s"` : "";
      s += `<g data-uid="${uid}" class="${gcls}"${isSel ? ` filter="url(#fp3Glow)"` : ""}${gstyle}>${isSel ? body : `<g filter="url(#fpSoft)">${body}</g>`}${inner}</g>`;
    }

    if (id && selOcc) { const rp = routePoints(id).map((p) => ps(pj(p[0], p[1], 6, C))).join(" "), end = routePoints(id).at(-1), ep = pj(end[0], end[1], 6, C);
      s += `<polyline class="fp-route-bg" pathLength="1" points="${rp}"/><polyline class="fp-route" points="${rp}" style="stroke:${brand}"/>
            <circle class="fp-route-end" cx="${ep[0].toFixed(1)}" cy="${ep[1].toFixed(1)}" r="12" style="fill:${brand};stroke:#fff;stroke-width:3"/>`; }

    const kp = pj(k.x, k.y, 6, C);
    s += `<rect x="${(kp[0] - 58).toFixed(1)}" y="${(kp[1] - 24).toFixed(1)}" width="116" height="52" rx="10" fill="#ffffff" stroke="${laneStroke}" stroke-width="1.5"/>
      <circle class="fp3-here-ring" cx="${kp[0].toFixed(1)}" cy="${(kp[1] - 5).toFixed(1)}" r="6"/>
      <circle class="fp-here-dot" cx="${kp[0].toFixed(1)}" cy="${(kp[1] - 5).toFixed(1)}" r="6"/>
      <text class="fp-here-label" x="${kp[0].toFixed(1)}" y="${(kp[1] + 16).toFixed(1)}" style="font-size:13px">${I18N.youAreHere[lang]}</text>`;

    container.innerHTML = `<svg viewBox="${viewBoxFor(C)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="3D floor plan"><defs>${glowDefs(brand, "fp3Glow", bright)}</defs>${s}</svg>`;
  }

  /* ---- helpers ---------------------------------------------------------- */
  function glowDefs(brand, glowId, bright) {
    const shCol = bright ? "#243247" : "#04060b", shOp = bright ? 0.3 : 0.5, shBlur = bright ? 9 : 7, shDy = bright ? 8 : 5, sheen = bright ? 0.2 : 0.16;
    return `<filter id="${glowId || "fpGlow"}" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="0" stdDeviation="11" flood-color="${brand}" flood-opacity="0.58"/></filter>
      <filter id="fpSoft" x="-30%" y="-30%" width="160%" height="185%"><feDropShadow dx="0" dy="${shDy}" stdDeviation="${shBlur}" flood-color="${shCol}" flood-opacity="${shOp}"/></filter>
      <linearGradient id="fp3Sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="${sheen}"/><stop offset="0.55" stop-color="#ffffff" stop-opacity="0"/></linearGradient>`;
  }
  function parse(hex) { const h = hex.replace("#", ""); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; }
  function rgba(hex, a) { const [r, g, b] = parse(hex); return `rgba(${r},${g},${b},${a})`; }
  function mixc(hex, tgt, t) { const a = parse(hex), b = parse(tgt); return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`; }
  function lighten(hex, t) { return mixc(hex, "#ffffff", t); }
  function darken(hex, t) { return mixc(hex, "#000000", t); }
  function idealText(hex) { const [r, g, b] = parse(hex); return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#1a1206" : "#ffffff"; }
  function ea(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  // shrink a brand name only if it would overflow its block width (keeps short names big)
  function fitSize(name, base, maxW) { const est = (name || "").length * base * 0.5; return est > maxW ? Math.max(12, Math.round(base * maxW / est)) : base; }
  // brand logo shown in full on a clean white disc, centred at (cx, cy)
  function logoOnMap(url, cx, cy, r) {
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" fill="#ffffff" stroke="rgba(0,0,0,.16)" stroke-width="1"/><image href="${ea(url)}" x="${(cx - r * 0.68).toFixed(1)}" y="${(cy - r * 0.68).toFixed(1)}" width="${(r * 1.36).toFixed(1)}" height="${(r * 1.36).toFixed(1)}" preserveAspectRatio="xMidYMid meet"/>`;
  }
  // sliding/glass doorway: two glass panels across the opening with a centre gap + jamb posts.
  // The opening runs from the hinge (d.x,d.y) along angle d.rot for length d.w. prj projects (x,y)->[sx,sy].
  function doorSVG(d, prj, color) {
    const GLASS = "#cfe0f2";
    const a1 = (d.rot - 90) * D2R, ap = a1 + Math.PI / 2;          // a1 = along the opening (the old closed-leaf/wall line); ap = jamb posts
    const at = (t) => prj(d.x + d.w * Math.cos(a1) * t, d.y + d.w * Math.sin(a1) * t);
    const seg = (t0, t1, w, col, op) => { const A = at(t0), B = at(t1);
      return `<line x1="${A[0].toFixed(1)}" y1="${A[1].toFixed(1)}" x2="${B[0].toFixed(1)}" y2="${B[1].toFixed(1)}" stroke="${col}" stroke-width="${w}" stroke-linecap="butt" opacity="${op}"/>`; };
    const tick = (t) => { const cx = d.x + d.w * Math.cos(a1) * t, cy = d.y + d.w * Math.sin(a1) * t,
        A = prj(cx - 5 * Math.cos(ap), cy - 5 * Math.sin(ap)), B = prj(cx + 5 * Math.cos(ap), cy + 5 * Math.sin(ap));
      return `<line x1="${A[0].toFixed(1)}" y1="${A[1].toFixed(1)}" x2="${B[0].toFixed(1)}" y2="${B[1].toFixed(1)}" stroke="${color}" stroke-width="3" stroke-linecap="round" opacity=".75"/>`; };
    if (d.fire)  // normally-closed FIRE door: one solid red bar across the opening (no gap) + jamb posts
      return tick(0) + tick(1) + seg(0.04, 0.96, 8, "#7a2417", .9) + seg(0.04, 0.96, 4.5, "#d8442b", 1);
    // jamb posts at both ends, then two glass panels (dark frame under, light glass over) with a centre gap
    return tick(0) + tick(1)
      + seg(0.06, 0.46, 7, color, .85) + seg(0.54, 0.94, 7, color, .85)
      + seg(0.06, 0.46, 3.5, GLASS, 1) + seg(0.54, 0.94, 3.5, GLASS, 1);
  }

  return { render, directions };
})();
