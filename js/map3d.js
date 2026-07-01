/* =============================================================================
 * map3d.js — Three.js (real WebGL 3D) drop-in for MapKiosk.
 *
 * Exposes the SAME api as the SVG map.js:  MapKiosk.render(container,id,lang,theme,view)
 * and MapKiosk.directions(id,lang).  app.js / db.js / data.js / the whole board
 * shell (attract, browse rail, directory, idle, toggles) are UNCHANGED — only the
 * #map area is rendered in 3D here. Three.js loads from CDN (needs internet).
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
              right: { en: "in the far-left row", zh: "最左侧一排" }, lower: { en: "in the lower-centre row", zh: "下方一排" } }[face])[lang];
  }
  function directions(id, lang) {
    const u = FP.units[id], name = kitchenOf(id).name[lang], zone = zoneText(u.face, lang), code = id.replace("K", "K-");
    return lang === "zh"
      ? `从这里沿走廊前行 —— ${name}（${code}）位于${zone}，跟随高亮路线即可到达。`
      : `Follow the corridor from here — ${name} (${code}) is ${zone}. Just follow the highlighted path.`;
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
  let renderer, lblRenderer, scene, camera, controls, sun, hemi, fill, groundMat, laneMat, svcMat;
  const blocks = {};   // id -> { mesh, occ, baseY, H, labelEl, col }
  let hereGrp = null, routeObj = null, endObj = null, raf = 0;
  let state = { id: null, lang: "en", theme: "bright", view: "3d" };
  let tween = null;
  const easeIO = (t) => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  const DAY = { bg: 0xeef2f8, grd: 0xd7dfea, hg: 0xb9c3d2, hi: .6, si: 1.15, lane: 0xffffff, svc: 0xc7d1de, vac: 0xb4bfce };
  const NIGHT = { bg: 0x0b0f16, grd: 0x0f131b, hg: 0x1f2630, hi: .45, si: .9, lane: 0x5b6470, svc: 0x2a323e, vac: 0x39424f };

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
    lblRenderer = new CSS2DRenderer();
    lblRenderer.domElement.style.cssText = "position:absolute;inset:0;pointer-events:none";
    container.innerHTML = "";
    container.style.position = "relative";
    container.appendChild(renderer.domElement);
    container.appendChild(lblRenderer.domElement);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(42, 1, 1, 8000);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = .09;
    controls.enablePan = false; controls.minDistance = 500; controls.maxDistance = 2400;
    controls.maxPolarAngle = Math.PI * 0.49;

    hemi = new THREE.HemisphereLight(0xffffff, 0xb9c3d2, .6); scene.add(hemi);
    sun = new THREE.DirectionalLight(0xfff2df, 1.15); sun.position.set(540, 980, 380);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 100; sun.shadow.camera.far = 2600;
    sun.shadow.camera.left = -950; sun.shadow.camera.right = 950; sun.shadow.camera.top = 950; sun.shadow.camera.bottom = -950;
    sun.shadow.bias = -0.0004; sun.shadow.radius = 6; scene.add(sun);
    fill = new THREE.DirectionalLight(0xdfe8f5, .32); fill.position.set(-420, 520, -320); scene.add(fill);

    groundMat = new THREE.MeshStandardMaterial({ color: DAY.grd, roughness: .96 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(VBW + 320, VBH + 320), groundMat);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

    laneMat = new THREE.MeshStandardMaterial({ color: DAY.lane, roughness: .85 });
    for (const [x, y, w, h] of LANES) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 2, h), laneMat);
      m.position.set(wx(x + w / 2), 1.2, wz(y + h / 2)); m.receiveShadow = true; scene.add(m);
    }
    svcMat = new THREE.MeshStandardMaterial({ color: DAY.svc, roughness: .85 });
    for (const s of FP.service) {
      const m = new THREE.Mesh(new RoundedBoxGeometry(s.w - GAP, H_SVC, s.h - GAP, 3, 5), svcMat);
      m.position.set(wx(s.x + s.w / 2), H_SVC / 2, wz(s.y + s.h / 2)); m.castShadow = m.receiveShadow = true; scene.add(m);
      const lab = mkLabel(`<div class="m3-svc">${I18N[s.key][state.lang]}</div>`);
      lab.position.set(0, H_SVC / 2 + 2, 0); m.add(lab); m.userData.svcKey = s.key; m.userData.lab = lab;
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
      blocks[id] = { mesh, occ, baseY: H / 2, H, labelEl, col: new THREE.Color(col), lift: null };
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

    // pick
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let down = null;
    renderer.domElement.addEventListener("pointerdown", e => down = [e.clientX, e.clientY]);
    renderer.domElement.addEventListener("pointerup", e => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(Object.values(blocks).map(b => b.mesh))[0];
      if (hit) { const id = hit.object.userData.id;
        // drive selection through the board's own logic (occupied kitchens have a card)
        const card = document.querySelector('.shopcard[data-id="' + id + '"]');
        if (card) card.click();
      }
    });

    addEventListener("resize", resize); resize();
    applyTheme(DAY, true);
    homeView(false);
    ready = true;
    loop();
    if (pending) { const p = pending; pending = null; apply(p.id, p.lang, p.theme, p.view); }
  }

  function mkLabel(html) { const el = document.createElement("div"); el.innerHTML = html; return new CSS2DObject(el); }
  function safeCol(c) { return /^#[0-9a-fA-F]{6}$/.test(c) ? c : "#8A93A4"; }
  function mark(kk) { return kk && kk.logo ? `<img src="${kk.logo}" alt="">` : (kk && kk.icon ? `<span class="ic">${kk.icon}</span>` : ""); }

  function blockLabelHTML(id) {
    const kk = kitchenOf(id), occ = !!(kk && kk.occupied), code = id.replace("K", "K-"), lang = state.lang;
    if (occ) return `<div class="m3-lab"><div class="m3-badge">${mark(kk)}</div><div class="m3-nm">${(kk.name && kk.name[lang]) || code}</div><div class="m3-code">${code}</div></div>`;
    return `<div class="m3-lab vac"><div class="m3-code big">${code}</div><div class="m3-av">${I18N.available ? I18N.available[lang] : ""}</div></div>`;
  }

  function resize() {
    if (!cont) return; const w = cont.clientWidth || 1, h = cont.clientHeight || 1;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setSize(w, h); lblRenderer.setSize(w, h);
  }

  function applyTheme(t, force) {
    scene.fog = new THREE.Fog(t.bg, 1700, 3600);   // canvas stays transparent; the board's themed bg shows through
    groundMat.color.setHex(t.grd);
    laneMat.color.setHex(t.lane);
    svcMat.color.setHex(t.svc);
    hemi.groundColor.setHex(t.hg); hemi.intensity = t.hi; sun.intensity = t.si;
    for (const id in blocks) { const b = blocks[id]; if (!b.occ) { b.col.setHex(t.vac); if (!isSel(id)) b.mesh.material.color.setHex(t.vac); } }
  }
  const isSel = (id) => state.id === id;

  /* ---- camera framing ---- */
  function flyTo(pos, tgt, ms) { tween = { p0: camera.position.clone(), p1: pos, t0: controls.target.clone(), t1: tgt, s: performance.now(), ms: ms || 950 }; }
  function homeView(anim) {
    const pos = state.view === "2d" ? new THREE.Vector3(0, 1500, 1) : new THREE.Vector3(30, 560, 880);
    const tgt = new THREE.Vector3(0, 0, 30);
    if (anim) flyTo(pos, tgt); else { camera.position.copy(pos); controls.target.copy(tgt); }
  }
  function focusRoute(id) {
    const b = blocks[id], k = new THREE.Vector3(wx(FP.kiosk.x), 0, wz(FP.kiosk.y));
    const mid = b.mesh.position.clone().setY(0).add(k).multiplyScalar(.5);
    const span = b.mesh.position.distanceTo(k) + 260;
    if (state.view === "2d") { flyTo(new THREE.Vector3(mid.x, Math.max(1100, span * 1.25), mid.z + 1), mid.clone().setY(0)); }
    else { flyTo(new THREE.Vector3(mid.x + span * .1, span * .78, mid.z + span * .95), mid.clone().setY(30)); }
  }

  /* ---- route tube along the corridor ---- */
  function clearRoute() { for (const o of [routeObj, endObj]) if (o) { scene.remove(o); o.geometry.dispose(); o.material.dispose(); } routeObj = endObj = null; }
  function buildRoute(id) {
    clearRoute();
    const pts = routePoints(id).map(p => new THREE.Vector3(wx(p[0]), 5, wz(p[1])));
    const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.04);
    const col = new THREE.Color(safeCol((kitchenOf(id) || {}).color || "#0fae84"));
    routeObj = new THREE.Mesh(new THREE.TubeGeometry(curve, 120, 6, 10, false),
      new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: .8, roughness: .35 }));
    scene.add(routeObj);
    const end = pts[pts.length - 1];
    endObj = new THREE.Mesh(new THREE.SphereGeometry(11, 20, 14),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: col, emissiveIntensity: .9 }));
    endObj.position.copy(end).setY(10); scene.add(endObj);
  }

  /* ---- apply board state to the scene ---- */
  function apply(id, lang, theme, view) {
    const langChanged = lang !== state.lang, themeChanged = theme !== state.theme, viewChanged = view !== state.view, idChanged = id !== state.id;
    state = { id, lang, theme, view };
    if (themeChanged) applyTheme(theme === "bright" ? DAY : NIGHT);
    // labels (content depends on lang)
    for (const bid in blocks) blocks[bid].labelEl.innerHTML = blockLabelHTML(bid);
    for (const o of (scene._svc || [])) o.userData.lab.element.innerHTML = `<div class="m3-svc">${I18N[o.userData.svcKey][lang]}</div>`;
    hereGrp.userData.lab.element.innerHTML = `<div class="m3-here">📍 ${I18N.youAreHere[lang]}</div>`;
    // selection: reset then highlight
    for (const bid in blocks) { const b = blocks[bid];
      b.mesh.material.emissive.setHex(0x000000);
      b.mesh.material.opacity = (!id || bid === id) ? 1 : 0.5;
      liftTo(b, b.baseY);
    }
    if (id && blocks[id]) {
      const b = blocks[id];
      b.mesh.material.emissive.copy(b.mesh.material.color).multiplyScalar(.34);
      liftTo(b, b.baseY + 26);
      if ((kitchenOf(id) || {}).occupied) buildRoute(id); else clearRoute();
      if (idChanged || viewChanged) focusRoute(id);
    } else { clearRoute(); if (idChanged || viewChanged) homeView(true); }
  }
  function liftTo(b, to) { if (Math.abs(b.mesh.position.y - to) < .5) return; b.lift = { from: b.mesh.position.y, to, s: performance.now() }; }

  /* ---- render loop (pauses when the board isn't on the main screen) ---- */
  function loop() {
    raf = requestAnimationFrame(loop);
    const mainOn = (document.getElementById("main") || {}).classList && document.getElementById("main").classList.contains("active");
    controls.update();
    const now = performance.now();
    for (const id in blocks) { const b = blocks[id]; if (b.lift) { const k = Math.min(1, (now - b.lift.s) / 260); b.mesh.position.y = b.lift.from + (b.lift.to - b.lift.from) * easeIO(k); if (k >= 1) b.lift = null; } }
    if (tween) { const k = Math.min(1, (now - tween.s) / tween.ms), e = easeIO(k); camera.position.lerpVectors(tween.p0, tween.p1, e); controls.target.lerpVectors(tween.t0, tween.t1, e); if (k >= 1) tween = null; }
    const pulse = 1 + Math.sin(now * .005) * .16;
    const ball = hereGrp.getObjectByName("ball"); if (ball) ball.scale.setScalar(pulse);
    if (endObj) endObj.scale.setScalar(pulse);
    if (mainOn) { renderer.render(scene, camera); lblRenderer.render(scene, camera); }
  }

  function render(container, id, lang, theme, view) {
    view = view === "2d" ? "2d" : "3d";
    if (!ready) { pending = { id, lang, theme, view }; if (!starting) { starting = true; setup(container); } return; }
    if (container !== cont) { cont = container; resize(); }
    apply(id, lang, theme, view);
  }
  return { render, directions };
})();
