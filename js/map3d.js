/* =============================================================================
 * map3d.js — Three.js (real WebGL 3D) drop-in for MapKiosk.
 *
 * Exposes the SAME api as the SVG map.js:  MapKiosk.render(container,id,lang,theme,view)
 * and MapKiosk.directions(id,lang).  app.js / db.js / data.js / the whole board
 * shell (attract, browse rail, directory, idle, toggles) are UNCHANGED — only the
 * #map area is rendered in 3D here. Three.js is bundled in vendor/three/ (see the
 * import map in index-3d.html); nothing is fetched from a CDN.
 * ========================================================================== */
const MapKiosk = (function () {
  const FP = FLOORPLAN;
  const center = (u) => ({ x: u.x + u.w / 2, y: u.y + u.h / 2 });
  const kitchenOf = (id) => KITCHENS.find((k) => k.id === id);

  /* ---- walking route + directions (ported verbatim from the SVG map) ---- */
  function routePoints(id) {
    const u = FP.units[id], c = FP.corridor, k = FP.kiosk, ctr = center(u);
    if (id === "K03")
      return [[k.x, k.y], [c.spurX, c.hY], [c.vX, c.hY], [c.vX, c.lY], [c.lX0, c.lY], [u.x + u.w - 26, c.lY + 28]];
    if (u.face === "k1k2")
      return [[k.x, k.y], [c.rightX, k.y], [c.rightX, c.frontY], [c.k1k2X, c.frontY], [c.k1k2X, c.lY], [ctr.x, c.lY], [ctr.x, u.y]];
    const pts = [[k.x, k.y], [c.spurX, c.hY]];
    if (u.face === "down")       pts.push([ctr.x, c.hY], [ctr.x, u.y + u.h]);
    else if (u.face === "up")    pts.push([ctr.x, c.hY], [ctr.x, u.y]);
    else if (u.face === "right") pts.push([c.vX, c.hY], [c.vX, ctr.y], [u.x + u.w, ctr.y]);
    else                         pts.push([c.vX, c.hY], [c.vX, c.lY], [ctr.x, c.lY], [ctr.x, u.y]);
    return pts;
  }
  function zoneText(face, lang) {
    return ({ down: { en: "along the top row", zh: "顶部一排" }, up: { en: "in the centre", zh: "中央区域" },
              right: { en: "in the far-left row", zh: "最左侧一排" }, lower: { en: "in the lower-centre row", zh: "下方一排" },
              k1k2: { en: "in the lower row, through the K-01 / K-02 entrance", zh: "下方一排，经 K-01／K-02 入口进入" } }[face])[lang];
  }
  function directions(id, lang) {
    const u = FP.units[id], k = kitchenOf(id), code = id.replace("K", "K-");
    // K-03 opens onto the lower corridor but sits in the bottom-left corner, not the lower-centre row
    const zone = id === "K03" ? (lang === "zh" ? "左下角" : "in the bottom-left corner") : zoneText(u.face, lang);
    const name = (k.name && (k.name[lang] || k.name.en)) || code;   // same current→en fallback as app.js pick()
    return lang === "zh"
      ? `从这里沿走廊前行——${name}（${code}）位于${zone}，跟着地图上的路线走即可。`
      : `Follow the corridor from here — ${name} (${code}) is ${zone}. Just follow the route on the map.`;
  }

  /* ---- coordinate mapping: SVG plan units -> world (centred at origin) ---- */
  const VBW = FP.viewBox.w, VBH = FP.viewBox.h;
  const wx = (sx) => sx - VBW / 2, wz = (sy) => sy - VBH / 2;
  const H_OCC = 70, H_VAC = 52, H_SVC = 26, GAP = 10;

  const LANES = (() => { const c = FP.corridor, k = FP.kiosk; return [
    [c.hX0, c.hY - 22, c.hX1 - c.hX0, 44], [c.vX - 22, c.vY0, 44, c.vY1 - c.vY0 + 21],
    [c.lX0, c.lY - 21, c.k1k2X + 21 - c.lX0, 42], [c.spurX - 22, c.hY, 44, k.y - c.hY + 21],
    [c.spurX - 22, k.y - 21, c.rightX + 21 - (c.spurX - 22), 42], [c.rightX - 21, k.y - 21, 42, c.frontY - k.y + 42],
    [c.k1k2X - 21, c.frontY - 21, c.rightX + 21 - (c.k1k2X - 21), 42], [c.k1k2X - 21, c.lY - 21, 42, c.frontY - c.lY + 42],
    [c.midX - 13, c.midY0, 26, c.midY1 - c.midY0]]; })();

  /* ---- Three.js state ---- */
  let THREE, OrbitControls, RoundedBoxGeometry, CSS2DRenderer, CSS2DObject;
  let ready = false, starting = false, pending = null, cont = null;
  let renderer, lblRenderer, scene, camera, controls, sun, hemi, fill, groundMat, laneMat, svcMat, outMat, shadowMat;
  const blocks = {};   // id -> { mesh, occ, baseY, H, labelEl, col }
  let hereGrp = null, routeObj = null, endObj = null, routePulses = [], routeCurve = null, routeDrawT0 = 0, routeIdx = 0, raf = 0, routeKey = "";
  let state = { id: null, lang: "en", theme: "bright", view: "3d" };
  let tween = null, parked = false;
  const easeIO = (t) => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  // day palette — "soft light" (Ernest-approved): TRUE #ffffff base plate, whisper-grey
  // walkways, lighter vacants; saturation lives in the tenant blocks + route only
  const DAY = { bg: 0xeef2f8, grd: 0xffffff, hg: 0xb9c3d2, hi: .6, si: 1.15, lane: 0xe8edf4, svc: 0xe3e8f0, vac: 0xdfe5ee, out: 0xd7d0c4, shOp: .2 };
  const NIGHT = { bg: 0x0b0f16, grd: 0x0f131b, hg: 0x1f2630, hi: .45, si: .9, lane: 0x5b6470, svc: 0x2a323e, vac: 0x39424f, out: 0x33302b, shOp: .3 };
  const isOutdoor = (key) => key === "loadingBay" || key === "carPark";

  async function setup(container) {
    cont = container;
    THREE = await import("three");
    ({ OrbitControls } = await import("three/addons/controls/OrbitControls.js"));
    ({ RoundedBoxGeometry } = await import("three/addons/geometries/RoundedBoxGeometry.js"));
    ({ CSS2DRenderer, CSS2DObject } = await import("three/addons/renderers/CSS2DRenderer.js"));

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.cssText = "width:100%;height:100%;display:block";
    let glLostTimer = null;
    renderer.domElement.addEventListener("webglcontextlost", () => { glLostTimer = setTimeout(() => { window.__swPendingReload = true; }, 4000); });
    renderer.domElement.addEventListener("webglcontextrestored", () => { clearTimeout(glLostTimer); });
    lblRenderer = new CSS2DRenderer();
    lblRenderer.domElement.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden";
    container.innerHTML = "";
    container.style.position = "relative";
    container.appendChild(renderer.domElement);
    container.appendChild(lblRenderer.domElement);

    scene = new THREE.Scene();
    fitV = new THREE.Vector3();
    camera = new THREE.PerspectiveCamera(42, 1, 1, 8000);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = .09;
    controls.enablePan = true; controls.screenSpacePanning = false;
    controls.zoomSpeed = 2;
    controls.minDistance = 420; controls.maxDistance = 1650;          // route views need up to ~1450
    controls.minPolarAngle = 0; controls.maxPolarAngle = 65 * Math.PI / 180;   // top-down .. a little past the 57 deg home view, never edge-on
    controls.maxTargetRadius = 560;                                    // pans keep the plan on screen (K-12's route view needs ~460)
    // free orbit EVERYWHERE — browse and after selecting (the lab-page feel Ernest wants):
    // drag = spin/tilt the board, right-drag / two-finger = move, scroll / pinch = zoom
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

    hemi = new THREE.HemisphereLight(0xffffff, 0xb9c3d2, .6); scene.add(hemi);
    sun = new THREE.DirectionalLight(0xfff2df, 1.15); sun.position.set(540, 980, 380);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 100; sun.shadow.camera.far = 2600;
    sun.shadow.camera.left = -950; sun.shadow.camera.right = 950; sun.shadow.camera.top = 950; sun.shadow.camera.bottom = -950;
    sun.shadow.bias = -0.0004; sun.shadow.radius = 6; scene.add(sun);
    fill = new THREE.DirectionalLight(0xdfe8f5, .32); fill.position.set(-420, 520, -320); scene.add(fill);

    // base plate + walkways are UNLIT so their hex is exact on screen (the plate really
    // is #ffffff by day — no light/tonemap tint); a ShadowMaterial plane floating just
    // above the lane tops catches the block shadows for both surfaces
    groundMat = new THREE.MeshBasicMaterial({ color: DAY.grd, toneMapped: false, fog: false });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(VBW + 320, VBH + 320), groundMat);
    ground.rotation.x = -Math.PI / 2; scene.add(ground);
    laneMat = new THREE.MeshBasicMaterial({ color: DAY.lane, toneMapped: false, fog: false });
    for (const [x, y, w, h] of LANES) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 2, h), laneMat);
      m.position.set(wx(x + w / 2), 1.2, wz(y + h / 2)); scene.add(m);
    }
    shadowMat = new THREE.ShadowMaterial({ opacity: DAY.shOp });
    const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(VBW + 320, VBH + 320), shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2; shadowPlane.position.y = 2.4; shadowPlane.receiveShadow = true; scene.add(shadowPlane);
    svcMat = new THREE.MeshStandardMaterial({ color: DAY.svc, roughness: .85 });
    outMat = new THREE.MeshStandardMaterial({ color: DAY.out, roughness: .98 });   // loading bay / car park: outside the facility
    for (const s of FP.service) {
      const out = isOutdoor(s.key);
      let m, ly;
      if (out) { m = new THREE.Mesh(new THREE.BoxGeometry(s.w - 4, 3, s.h - 4), outMat); m.position.set(wx(s.x + s.w / 2), 1.6, wz(s.y + s.h / 2)); m.receiveShadow = true; ly = 5; }
      else { m = new THREE.Mesh(new RoundedBoxGeometry(s.w - GAP, H_SVC, s.h - GAP, 3, 5), svcMat); m.position.set(wx(s.x + s.w / 2), H_SVC / 2, wz(s.y + s.h / 2)); m.castShadow = m.receiveShadow = true; ly = H_SVC / 2 + 2; }
      scene.add(m);
      const lab = mkLabel(`<div class="m3-svc${out ? " out" : ""}">${I18N[s.key][state.lang]}</div>`);
      lab.position.set(0, ly, 0); m.add(lab); m.userData.svcKey = s.key; m.userData.lab = lab;
    }
    scene._svc = scene.children.filter(o => o.userData && o.userData.svcKey);

    // doors (glass door markers, same placement rule as the SVG map: (x,y)=start, span w along a1)
    const D2R = Math.PI / 180;
    const postMat = new THREE.MeshStandardMaterial({ color: 0x77808f, roughness: .55 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xcfe0f2, roughness: .12, metalness: .1, transparent: true, opacity: .5 });
    for (const d of (FP.doors || [])) {
      const a1 = (d.rot - 90) * D2R, half = d.w / 2, hh = 44;
      const cx = d.x + half * Math.cos(a1), cy = d.y + half * Math.sin(a1);
      const g = new THREE.Group();
      const p1 = new THREE.Mesh(new THREE.BoxGeometry(7, hh, 8), postMat); p1.position.set(-half, hh / 2, 0); p1.castShadow = true;
      const p2 = new THREE.Mesh(new THREE.BoxGeometry(7, hh, 8), postMat); p2.position.set(half, hh / 2, 0); p2.castShadow = true;
      const glass = new THREE.Mesh(new THREE.BoxGeometry(d.w, hh * .78, 3.5), glassMat); glass.position.set(0, hh * .45, 0);
      g.add(p1, p2, glass);
      g.position.set(wx(cx), 0, wz(cy)); g.rotation.y = -a1; scene.add(g);
    }

    // scenery: a lorry at the loading bay + a car on the car park
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: .9 });
    const mkWheel = (r, w) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 18), wheelMat); m.rotation.z = Math.PI / 2; m.castShadow = true; return m; };
    const lorry = new THREE.Group();
    const cargo = new THREE.Mesh(new RoundedBoxGeometry(44, 44, 92, 2, 4), new THREE.MeshStandardMaterial({ color: 0xf4f6f9, roughness: .55 }));
    cargo.position.set(0, 32, -16); cargo.castShadow = true;
    const cab = new THREE.Mesh(new RoundedBoxGeometry(40, 26, 22, 2, 5), new THREE.MeshStandardMaterial({ color: 0x5f7d99, roughness: .45, metalness: .15 }));
    cab.position.set(0, 16, 44); cab.castShadow = true;
    lorry.add(cargo, cab);
    for (const [lx, lz] of [[-20, 42], [20, 42], [-20, -24], [20, -24], [-20, -50], [20, -50]]) { const w = mkWheel(7, 6); w.position.set(lx, 7, lz); lorry.add(w); }
    lorry.position.set(wx(866), 3, wz(648));
    scene.add(lorry);
    const car = new THREE.Group();
    const carBody = new THREE.Mesh(new RoundedBoxGeometry(26, 11, 50, 2, 4), new THREE.MeshStandardMaterial({ color: 0x8fa3b8, roughness: .4, metalness: .2 }));
    carBody.position.set(0, 10, 0); carBody.castShadow = true;
    const carCabin = new THREE.Mesh(new RoundedBoxGeometry(22, 9, 24, 2, 5), new THREE.MeshStandardMaterial({ color: 0xd9e3ed, roughness: .25, metalness: .1 }));
    carCabin.position.set(0, 19, -3); carCabin.castShadow = true;
    car.add(carBody, carCabin);
    for (const [cx2, cz2] of [[-13.5, 16], [13.5, 16], [-13.5, -16], [13.5, -16]]) { const w = mkWheel(5.5, 5); w.position.set(cx2, 5.5, cz2); car.add(w); }
    car.position.set(wx(1017), 3, wz(694)); car.rotation.y = 0.24;
    scene.add(car);

    // kitchen blocks
    for (const [id, u] of Object.entries(FP.units)) {
      const kk = kitchenOf(id), occ = !!(kk && kk.occupied);
      const col = occ ? safeCol(kk.color) : DAY.vac, H = occ ? H_OCC : H_VAC;
      const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(col), roughness: .52, metalness: .05, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(new RoundedBoxGeometry(u.w - 2 * GAP, H, u.h - 2 * GAP, 4, 7), mat);
      mesh.position.set(wx(u.x + u.w / 2), H / 2, wz(u.y + u.h / 2));
      mesh.castShadow = mesh.receiveShadow = true; mesh.userData.id = id;
      scene.add(mesh);
      const labelEl = document.createElement("div");
      const lab = new CSS2DObject(labelEl); lab.position.set(0, H / 2 + 8, 0); mesh.add(lab);
      blocks[id] = { mesh, lab, occ, baseY: H / 2, H, labelEl, col: new THREE.Color(col), lift: null, hx: (u.w - 2 * GAP) / 2, hz: (u.h - 2 * GAP) / 2, fit: "" };
    }

    // you-are-here
    hereGrp = new THREE.Group();
    const hMat = new THREE.MeshStandardMaterial({ color: 0x0fae84, emissive: 0x0fae84, emissiveIntensity: .5, roughness: .4 });
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 44, 24), hMat); pin.position.y = 22; pin.castShadow = true;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(13, 24, 16), hMat); ball.position.y = 52; ball.name = "ball";
    hereGrp.add(pin, ball);
    const hl = mkLabel(`<div class="m3-here">📍 ${I18N.youAreHere[state.lang]}</div>`);
    hl.position.y = 80; hereGrp.add(hl); hereGrp.userData.lab = hl;
    hereGrp.position.set(wx(FP.kiosk.x), 0, wz(FP.kiosk.y)); scene.add(hereGrp);

    // pick — a canvas hit clicks a hidden [data-uid] proxy INSIDE #map, so selection flows
    // through app.js's own #map click handler (works for occupied AND vacant units)
    const proxyWrap = document.createElement("div");
    proxyWrap.style.display = "none";
    for (const uid of Object.keys(FP.units)) { const b = document.createElement("button"); b.dataset.uid = uid; proxyWrap.appendChild(b); }
    container.appendChild(proxyWrap);
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let down = null, fingers = 0; const pressed = new Set();
    const pick = (id) => { const p = proxyWrap.querySelector('[data-uid="' + id + '"]'); if (p) p.click(); };
    renderer.domElement.addEventListener("pointerdown", e => {
      pressed.add(e.pointerId);
      if (pressed.size === 1) { down = [e.clientX, e.clientY]; fingers = 1; } else fingers = Math.max(fingers, pressed.size);
    });
    renderer.domElement.addEventListener("pointercancel", e => { pressed.delete(e.pointerId); down = null; });
    renderer.domElement.addEventListener("pointerup", e => {
      pressed.delete(e.pointerId);
      if (!down || fingers > 1 || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 14) return;
      const lab = labelAt(e.clientX, e.clientY);
      if (lab) return pick(lab);
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(Object.values(blocks).map(b => b.mesh))[0];
      if (hit) pick(hit.object.userData.id);
    });

    controls.cursor.set(offx(), 0, 30);
    addEventListener("resize", resize); resize();
    applyTheme(DAY, true);
    homeView(false);
    ready = true;
    if (/[?&]debug/.test(location.search)) window.__m3 = { camera, controls, scene, wx, wz, get route() { return { routeObj, routeIdx, drawn: routeObj ? routeObj.geometry.drawRange.count : 0, pulses: routePulses.filter(p => p.visible).length }; } };
    loop();
    if (pending) { const p = pending; pending = null; apply(p.id, p.lang, p.theme, p.view); }
  }

  /* the label (badge, name or unit code) under a point, nearest centre first; hidden parts have no box */
  function labelAt(x, y) {
    let found = null, best = Infinity;
    for (const id in blocks) {
      const lab = blocks[id].labelEl.firstElementChild; if (!lab) continue;
      for (const part of lab.children) {
        const r = part.getBoundingClientRect(); if (!r.width || !r.height) continue;
        if (x < r.left - 6 || x > r.right + 6 || y < r.top - 6 || y > r.bottom + 6) continue;
        const d = Math.hypot(x - (r.left + r.right) / 2, y - (r.top + r.bottom) / 2);
        if (d < best) { best = d; found = id; }
      }
    }
    return found;
  }

  function mkLabel(html) { const el = document.createElement("div"); el.innerHTML = html; return new CSS2DObject(el); }
  function safeCol(c) { return /^#[0-9a-fA-F]{6}$/.test(c) ? c : "#8A93A4"; }
  /* names, icons and logo links come from the database: escape them before they become HTML */
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  function mark(kk) { return kk && kk.logo ? `<img src="${esc(kk.logo)}" alt="">` : (kk && kk.icon ? `<span class="ic">${esc(kk.icon)}</span>` : ""); }
  /* signed but not moved in: the hourly sync has stored the name, "occupied" is still off */
  const isSoon = (kk) => !!kk && !kk.occupied && !!((kk.name && (kk.name.en || kk.name.zh)) || "").trim();
  const hasRoute = (id) => { const kk = kitchenOf(id); return !!kk && (kk.occupied || isSoon(kk)); };

  /* Relative luminance (0 black .. 1 white) of a #rrggbb colour. */
  function luminance(hex) {
    const c = [1, 3, 5].map((i) => { const v = parseInt(hex.substr(i, 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  /* The lit roof renders about half as bright as the licensee's colour (measured on screen), so
   * white text is the readable choice up to a hex luminance of ~0.33; brighter roofs (amber,
   * beige) and blocks faded behind a selection get dark text instead. */
  const LIGHT_ROOF = 0.33;
  function blockLabelHTML(id) {
    const kk = kitchenOf(id), occ = !!(kk && kk.occupied), code = id.replace("K", "K-"), lang = state.lang;
    if (occ) {
      const name = esc((kk.name && (kk.name[lang] || kk.name.en || kk.name.zh)) || code);   // same current -> en fallback as app.js pick()
      const faded = !!state.id && state.id !== id && hasRoute(state.id);
      const light = faded || luminance(safeCol(kk.color)) > LIGHT_ROOF;
      return `<div class="m3-lab${light ? " on-light" : ""}"><div class="m3-badge">${mark(kk)}</div><div class="m3-nm">${name}</div><div class="m3-code">${code}</div></div>`;
    }
    // I18N.comingSoon is new (Nov 2026): on the first load after a deploy an older service worker
    // may still serve the previous data.js; the label then says "Vacant" until the reload
    const note = isSoon(kk) && I18N.comingSoon ? I18N.comingSoon[lang] : I18N.available[lang];
    return `<div class="m3-lab vac${isSoon(kk) ? " soon" : ""}${state.id === id ? " sel" : ""}"><div class="m3-code big">${code}</div><div class="m3-av">${note}</div></div>`;
  }

  /* ---- label fitting: a name never runs past its own block ----
   * The labels are fixed-size HTML floating over the 3D scene, so a long name used to spill over
   * the neighbouring kitchens. Whenever the camera moves, measure how wide each block's roof is
   * on screen and give its name that much room: it wraps to two lines, steps down a size, and is
   * dropped (the badge and unit code stay) once the block is too small to hold it. */
  let fitDirty = true, fitCam = null, fitV = null;
  function fitLabels() {
    const w = cont.clientWidth || 1, h = cont.clientHeight || 1;
    for (const id in blocks) {
      const b = blocks[id]; if (!b.occ) continue;
      const lab = b.labelEl.firstElementChild; if (!lab) continue;
      const top = b.mesh.position.y + b.H / 2;
      let lo = Infinity, hi = -Infinity, ylo = Infinity, yhi = -Infinity, seen = true;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        fitV.set(b.mesh.position.x + sx * b.hx, top, b.mesh.position.z + sz * b.hz).project(camera);
        if (fitV.z < -1 || fitV.z > 1) seen = false;
        const x = (fitV.x + 1) / 2 * w, y = (1 - fitV.y) / 2 * h;
        if (x < lo) lo = x; if (x > hi) hi = x; if (y < ylo) ylo = y; if (y > yhi) yhi = y;
      }
      if (!seen) continue;                                   // behind the camera: leave it as it was
      const room = Math.max(0, Math.round((hi - lo - 14) / 4) * 4);   // 4 px steps: no restyling on every tiny move
      // a roof seen almost edge-on (the map tilted flat) has no room for a name either
      const fit = yhi - ylo < 30 * labK ? "x" : room >= 150 * labK ? "l" : room >= 112 * labK ? "m" : room >= 84 * labK ? "s" : "x";
      const key = fit + room;
      if (key === b.fit && lab.dataset.fit) continue;
      b.fit = key; lab.dataset.fit = fit; lab.style.maxWidth = Math.max(room, 60 * labK) + "px";
    }
  }
  function fitLabelsIfMoved() {
    const p = camera.position, q = camera.quaternion;
    if (!fitDirty && fitCam && Math.abs(p.x - fitCam[0]) + Math.abs(p.y - fitCam[1]) + Math.abs(p.z - fitCam[2]) < 0.5 &&
        Math.abs(q.x - fitCam[3]) + Math.abs(q.y - fitCam[4]) + Math.abs(q.z - fitCam[5]) + Math.abs(q.w - fitCam[6]) < 0.0005) return;
    fitCam = [p.x, p.y, p.z, q.x, q.y, q.z, q.w]; fitDirty = false;
    fitLabels();
  }

  /* label sizes are designed for a 1080-px-high screen; a taller or shorter CSS viewport
   * (another panel or density setting) scales them in proportion */
  let labK = 1;
  function resize() {
    if (!cont) return; const w = cont.clientWidth || 1, h = cont.clientHeight || 1;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setSize(w, h); lblRenderer.setSize(w, h);
    labK = Math.min(2, Math.max(.8, h / 1080));
    cont.style.setProperty("--m3k", labK.toFixed(3));
    fitDirty = true;
  }

  function applyTheme(t, force) {
    scene.fog = new THREE.Fog(t.bg, 1700, 3600);   // canvas stays transparent; the board's themed bg shows through
    groundMat.color.setHex(t.grd);
    laneMat.color.setHex(t.lane);
    svcMat.color.setHex(t.svc);
    outMat.color.setHex(t.out);
    shadowMat.opacity = t.shOp;
    hemi.groundColor.setHex(t.hg); hemi.intensity = t.hi; sun.intensity = t.si;
    for (const id in blocks) { const b = blocks[id]; if (!b.occ) { b.col.setHex(t.vac); if (!isSel(id)) b.mesh.material.color.setHex(t.vac); } }
  }
  const isSel = (id) => state.id === id;

  /* ---- camera framing ---- */
  let canon = null, moved = false;
  function setCanon(pos, tgt) { canon = { pos: pos.clone(), tgt: tgt.clone() }; setMoved(false); }
  function setMoved(m) { if (m === moved) return; moved = m; const k = document.getElementById("kiosk"); if (k) k.classList.toggle("map-moved", m); }
  function flyTo(pos, tgt, ms) { setCanon(pos, tgt); tween = { p0: camera.position.clone(), p1: pos, t0: controls.target.clone(), t1: tgt, s: performance.now(), ms: ms || 950 }; }
  /* Shift the plan right so the browse rail doesn't crowd it — but when the rail
   * is collapsed the map owns the full width, so the offset drops to 0. */
  const RAIL_OFFX = 135;
  let railHidden = false;
  const offx = () => (railHidden ? 0 : RAIL_OFFX);
  function setRailHidden(hidden) {
    if (!ready || hidden === railHidden) return;
    railHidden = !!hidden;
    controls.cursor.set(offx(), 0, 30);                                  // the pan limit follows the plan's centre
    resize();
    if (state.id && hasRoute(state.id)) focusRoute(state.id); else homeView(true);
  }
  function homeView(anim) {
    const OFFX = offx();
    const pos = state.view === "2d" ? new THREE.Vector3(OFFX, 1500, 1) : new THREE.Vector3(30 + OFFX, 640, 1005);
    const tgt = new THREE.Vector3(OFFX, 0, 30);
    if (anim) flyTo(pos, tgt); else { camera.position.copy(pos); controls.target.copy(tgt); setCanon(pos, tgt); }
  }
  function focusRoute(id) {
    // tip the camera over to a straight top-down look framing kiosk → kitchen,
    // matching the SVG board's flatten-on-select behaviour
    const b = blocks[id], k = new THREE.Vector3(wx(FP.kiosk.x), 0, wz(FP.kiosk.y));
    const mid = b.mesh.position.clone().setY(0).add(k).multiplyScalar(.5);
    const span = b.mesh.position.distanceTo(k);
    const h = Math.max(980, span * 1.25 + 240);
    const OFFX = offx();
    flyTo(new THREE.Vector3(mid.x + OFFX, h, mid.z + 1), new THREE.Vector3(mid.x + OFFX, 0, mid.z), 1050);
  }

  /* ---- route tube along the corridor ---- */
  const LANE_L = luminance("#e8edf4");
  function mixHex(a, b, t) {
    const pa = [1, 3, 5].map((i) => parseInt(a.substr(i, 2), 16)), pb = [1, 3, 5].map((i) => parseInt(b.substr(i, 2), 16));
    return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
  }
  function routeHex(hex) {
    let c = safeCol(hex);
    for (let i = 0; i < 16 && (LANE_L + .05) / (luminance(c) + .05) < 3.5; i++) c = mixHex(c, "#16181d", .12);
    return c;
  }
  function clearRoute() {
    for (const o of [routeObj, endObj, ...routePulses]) if (o) { scene.remove(o); o.geometry.dispose(); o.material.dispose(); }
    routeObj = endObj = null; routePulses = []; routeCurve = null; routeKey = "";
  }
  function buildRoute(id) {
    clearRoute();
    const pts = routePoints(id).map(p => new THREE.Vector3(wx(p[0]), 5, wz(p[1])));
    routeCurve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.04);
    const col = new THREE.Color(routeHex((kitchenOf(id) || {}).color));
    const geo = new THREE.TubeGeometry(routeCurve, 140, 5.5, 10, false);
    routeIdx = geo.index.count;
    geo.setDrawRange(0, 0);                       // draw-on: revealed in loop(), like the SVG stroke-dashoffset trace
    routeDrawT0 = performance.now();
    routeObj = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, toneMapped: false }));
    scene.add(routeObj);
    // flowing dots that travel the corridor route (the SVG dasharray "flow" equivalent)
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(7.5, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
      s.userData.ph = i / 5; s.visible = false; scene.add(s); routePulses.push(s);
    }
    const end = pts[pts.length - 1];
    endObj = new THREE.Mesh(new THREE.SphereGeometry(13, 20, 14), new THREE.MeshBasicMaterial({ color: col, toneMapped: false }));
    endObj.position.copy(end).setY(10); endObj.visible = false; scene.add(endObj);
  }

  /* ---- apply board state to the scene ---- */
  function apply(id, lang, theme, view) {
    const langChanged = lang !== state.lang, themeChanged = theme !== state.theme, viewChanged = view !== state.view, idChanged = id !== state.id;
    state = { id, lang, theme, view };
    if (themeChanged) applyTheme(theme === "bright" ? DAY : NIGHT);
    // labels (content depends on lang)
    syncBlocks();
    for (const bid in blocks) { blocks[bid].labelEl.innerHTML = blockLabelHTML(bid); blocks[bid].fit = ""; }
    fitDirty = true;
    for (const o of (scene._svc || [])) o.userData.lab.element.innerHTML = `<div class="m3-svc${isOutdoor(o.userData.svcKey) ? " out" : ""}">${I18N[o.userData.svcKey][lang]}</div>`;
    hereGrp.userData.lab.element.innerHTML = `<div class="m3-here">📍 ${I18N.youAreHere[lang]}</div>`;
    // selection: reset then highlight
    const routeView = !!id && !!blocks[id] && hasRoute(id);
    const kEl = document.getElementById("kiosk"); if (kEl) kEl.classList.toggle("map-sel", !!id);   // the touch hint steps aside once a kitchen is chosen
    for (const bid in blocks) { const b = blocks[bid], base = "#" + b.col.getHexString();
      b.mesh.material.emissive.setHex(0x000000);
      b.mesh.material.opacity = 1;
      b.mesh.material.color.set(routeView && bid !== id ? mixHex(base, "#ffffff", .58) : base);
      liftTo(b, bid === id ? b.baseY + 26 : b.baseY);
    }
    if (id && blocks[id]) {
      const b = blocks[id];
      if (b.occ) b.mesh.material.emissive.copy(b.mesh.material.color).multiplyScalar(.34);
      else b.mesh.material.color.set(isSoon(kitchenOf(id)) ? "#a9b4cc" : "#9aa8c7");   // an empty unit: a clear blue-grey mark
      if (hasRoute(id)) {
        const key = id + "|" + b.mesh.material.color.getHexString();
        if (!routeObj || routeKey !== key) { buildRoute(id); routeKey = key; }
        if (idChanged || viewChanged) focusRoute(id);   // flatten to top-down over the route
      } else {
        clearRoute();                                    // empty unit: marked in place, the camera stays put
      }
    } else { clearRoute(); if (idChanged || viewChanged) homeView(true); }
  }
  function liftTo(b, to) {
    if (b.lift && Math.abs(b.lift.to - to) < .5) return;                       // already heading there
    if (Math.abs(b.mesh.position.y - to) < .5) { b.lift = null; return; }
    b.lift = { from: b.mesh.position.y, to, s: performance.now() };
  }
  function syncBlocks() {
    for (const id in blocks) {
      const b = blocks[id], kk = kitchenOf(id), occ = !!(kk && kk.occupied);
      const col = occ ? safeCol(kk.color) : (state.theme === "bright" ? DAY.vac : NIGHT.vac);
      if (occ !== b.occ) {
        const u = FP.units[id], H = occ ? H_OCC : H_VAC;
        b.mesh.geometry.dispose();
        b.mesh.geometry = new RoundedBoxGeometry(u.w - 2 * GAP, H, u.h - 2 * GAP, 4, 7);
        const lifted = b.mesh.position.y - b.baseY;
        b.occ = occ; b.H = H; b.baseY = H / 2; b.lift = null;
        b.mesh.position.y = b.baseY + lifted;
        b.lab.position.y = H / 2 + 8;
      }
      if (b.col.getHex() !== new THREE.Color(col).getHex()) { b.col.set(col); b.mesh.material.color.set(col); }
    }
  }

  /* ---- render loop (pauses when the board isn't on the main screen) ---- */
  function loop() {
    raf = requestAnimationFrame(loop);
    const mainOn = (document.getElementById("main") || {}).classList && document.getElementById("main").classList.contains("active");
    // back on the attract loop → park the camera at home so the next customer starts fresh
    if (!mainOn && !parked) { tween = null; homeView(false); parked = true; }
    else if (mainOn) parked = false;
    controls.update();
    const now = performance.now();
    for (const id in blocks) { const b = blocks[id]; if (b.lift) { const k = Math.min(1, (now - b.lift.s) / 260); b.mesh.position.y = b.lift.from + (b.lift.to - b.lift.from) * easeIO(k); if (k >= 1) b.lift = null; } }
    if (tween) { const k = Math.min(1, (now - tween.s) / tween.ms), e = easeIO(k); camera.position.lerpVectors(tween.p0, tween.p1, e); controls.target.lerpVectors(tween.t0, tween.t1, e); if (k >= 1) tween = null; }
    const pulse = 1 + Math.sin(now * .005) * .16;
    const ball = hereGrp.getObjectByName("ball"); if (ball) ball.scale.setScalar(pulse);
    if (routeObj && routeCurve) {
      const k = Math.min(1, (now - routeDrawT0) / 900);         // 0..1 draw-on progress
      routeObj.geometry.setDrawRange(0, Math.round(routeIdx * easeIO(k)));
      for (const p of routePulses) {
        const t = (now * 0.00016 + p.userData.ph) % 1;          // arc-length position along the route
        if (t <= k * .985) { p.visible = true; const q = routeCurve.getPointAt(t); p.position.set(q.x, 9, q.z); }
        else p.visible = false;
      }
      if (endObj) { endObj.visible = k > .85; endObj.scale.setScalar(pulse); }
    }
    if (mainOn && !tween && canon) {
      const away = camera.position.distanceTo(canon.pos) + controls.target.distanceTo(canon.tgt);
      setMoved(away > (moved ? 25 : 90));                      // hysteresis: no flicker on the damping tail
    }
    if (mainOn) { renderer.render(scene, camera); fitLabelsIfMoved(); lblRenderer.render(scene, camera); }
  }

  function render(container, id, lang, theme, view) {
    view = view === "2d" ? "2d" : "3d";
    if (!ready) { pending = { id, lang, theme, view }; start(container); return; }
    if (container !== cont) { cont = container; resize(); }
    apply(id, lang, theme, view);
  }
  function start(container) {
    if (starting) return;
    starting = true;
    setup(container).catch((e) => { console.warn("[map3d] could not start:", e && e.message); starting = false; window.__swPendingReload = true; });
  }
  /* build the scene while the ads are showing, so the first touch opens onto a ready map */
  function preload(container) { if (!ready) start(container); }
  function refocus() { if (!ready) return; if (state.id && hasRoute(state.id)) focusRoute(state.id); else homeView(true); }
  return { render, directions, setRailHidden, refocus, preload };
})();
