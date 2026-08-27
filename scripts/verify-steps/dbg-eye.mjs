// 一次性排查：emcee 左眼「单片眼镜」——完全复刻 r24 机位（FOV33/瞄 head+0.11），
// 先确认复现，再二分隐藏（虹膜/上睑/巩膜/角膜）；放大靠事后裁剪不动相机
import fs from 'node:fs';

export async function run(page, h) {
  fs.mkdirSync('verify/dbg', { recursive: true });
  await page.click('#title-start');
  await h.sleep(1200);
  await h.tapKey('Space');
  await h.sleep(300);
  await page.waitForFunction(() => window.__facesReady === true, { timeout: 300000, polling: 1000 });
  await page.evaluate(() => {
    window.__game.hud.el.objToast.style.display = 'none';
    window.__game.engine.setFilmLook(0.5);
  });

  const frames = (n) => page.evaluate((k) => new Promise((res) => {
    let i = 0;
    const t0 = performance.now();
    const tick = () => {
      if (++i >= k || performance.now() - t0 > 20000) res();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), n);

  // —— 与 r24 closeup('emcee') 逐行同构 ——
  await page.evaluate(() => {
    const g = window.__game;
    g.game.state = 'PAUSE';
    const e = g.byId.emcee;
    const hum = e.body;
    for (let i = 0; i < 6; i++) { hum.phase = 0.3; hum.animate('idle', 3, 0); }
    hum.phase = 0.3;
    hum.animate('idle', 0.001, 0);
    hum.sacY = 0; hum.sacP = 0; hum.gzY = 0; hum.gzP = 0; hum.gazeOn = 0;
    hum.eyeGL.rotation.set(0, 0, 0);
    hum.eyeGR.rotation.set(0, 0, 0);
    hum.blinkPh = -1; hum.blinkT = 9;
    hum.lidL.rotation.x = hum.lidBaseL;
    hum.lidR.rotation.x = hum.lidBaseR;
    hum.lidLoL.rotation.x = hum.lidLoBase;
    hum.lidLoR.rotation.x = hum.lidLoBase;
    hum.eyeL.scale.y = hum.eyeSclY;
    hum.eyeR.scale.y = hum.eyeSclY;
    if (hum.micG) hum.micG.visible = false;
    const wps = e.def?.waypoints;
    if (wps && wps.length > 1) {
      for (const [wx, wz] of wps) {
        const dx = wx - e.pos.x, dz = wz - e.pos.z;
        if (Math.hypot(dx, dz) > 1.2) { e.yaw = Math.atan2(dx, dz); break; }
      }
    }
    hum.group.rotation.y = e.yaw;
    hum.group.updateMatrixWorld(true);
    const V = g.player.pos.constructor;
    const head = hum.headWorldPos(new V());
    const fwd = new V(Math.sin(e.yaw), 0, Math.cos(e.yaw));
    const side = new V(fwd.z, 0, -fwd.x);
    const cam = g.engine.camera;
    window.__origFov = window.__origFov ?? cam.fov;
    cam.fov = 33; cam.updateProjectionMatrix();
    cam.position.set(head.x + fwd.x * 0.60, head.y + 0.14, head.z + fwd.z * 0.60);
    cam.lookAt(head.x, head.y + 0.11, head.z);
    hum.constructor.viewer.copy(cam.position);
    hum.updateLOD();
    let SpotC = null;
    g.engine.scene.traverse((o) => { if (!SpotC && o.isSpotLight) SpotC = o.constructor; });
    if (SpotC) {
      const keyL = new SpotC(0xffd9a0, 60, 12, 0.7, 0.55);
      keyL.position.set(head.x + fwd.x * 0.9 + side.x * 0.85, head.y + 0.55, head.z + fwd.z * 0.9 + side.z * 0.85);
      keyL.target.position.set(head.x, head.y + 0.05, head.z);
      g.engine.scene.add(keyL, keyL.target);
      const fillL = new SpotC(0xcfe0d8, 14, 10, 0.9, 0.7);
      fillL.position.set(head.x + fwd.x * 0.8 - side.x * 1.1, head.y + 0.3, head.z + fwd.z * 0.8 - side.z * 1.1);
      fillL.target.position.copy(keyL.target.position);
      g.engine.scene.add(fillL, fillL.target);
    }
    for (const hl of g.world.dynamic.hotelLights ?? []) {
      if (hl.pl.position.distanceTo(head) < 13) hl.pl.visible = true;
    }
    g.hud.clearSubtitles();
    g.hud.objTimer = 0;
    g.hud.el.objToast.classList.remove('show');
  });
  await page.waitForFunction(() => {
    const hum = window.__game.byId.emcee.body;
    return hum._hd === true && hum.headHD && hum.headHD.visible;
  }, { timeout: 15000, polling: 100 });
  await frames(3);
  await h.shot('dbg/x_a_base');

  const vis = (code, name) => page.evaluate((c) => {
    const hum = window.__game.byId.emcee.body;
    // eslint-disable-next-line no-new-func
    new Function('hum', c)(hum);
  }, code).then(() => frames(2)).then(() => h.shot(`dbg/${name}`));

  // 射线定凶：先给眼区网格逐一命名，再从相机穿过奶油竖条像素（全图 ~(529,382)±）
  const rays = await page.evaluate(() => {
    const g = window.__game;
    const cam = g.engine.camera;
    const hum = g.byId.emcee.body;
    const THREE = g.THREE;
    hum.eyeL.name = 'scleraL'; hum.eyeR.name = 'scleraR';
    hum.irisL.name = 'irisL'; hum.irisR.name = 'irisR';
    for (const [grp, sfx] of [[hum.eyeGL, 'L'], [hum.eyeGR, 'R']]) {
      for (const c of grp.children) {
        if (!c.name) c.name = (c.geometry?.type === 'CircleGeometry' ? 'glint' : 'cornea') + sfx;
      }
    }
    hum.lidL.name = 'lidL'; hum.lidR.name = 'lidR';
    hum.lidL.children.forEach((c, i) => { c.name = 'lidChildL' + i + ':' + (c.material?.side ?? ''); });
    hum.lidR.children.forEach((c, i) => { c.name = 'lidChildR' + i; });
    hum.lidLoL.name = 'lidLoL'; hum.lidLoR.name = 'lidLoR';
    hum.head.children.forEach((c, i) => {
      if (!c.name) c.name = 'headkid' + i + ':' + (c.geometry?.type ?? c.type);
    });
    const rc = new THREE.Raycaster();
    const V2 = THREE.Vector2;
    const out = [];
    for (const [px, py, tag] of [
      [529, 382, 'capsule'], [524, 378, 'capsule2'], [534, 388, 'capsule3'],
      [522, 386, 'darkslit'], [726, 380, 'righteye_ctrl'],
    ]) {
      const ndc = new V2((px / 1280) * 2 - 1, 1 - (py / 720) * 2);
      rc.setFromCamera(ndc, cam);
      const hits = rc.intersectObjects(g.engine.scene.children, true)
        .filter((h) => h.object.visible !== false).slice(0, 6)
        .map((h) => ({ d: +h.distance.toFixed(4), name: h.object.name || h.object.geometry?.type }));
      out.push({ tag, hits });
    }
    return out;
  });
  console.log('[dbg] rays:', JSON.stringify(rays));

  await vis('hum.irisL.visible = false; hum.irisR.visible = false;', 'x_b_noiris');
  await vis(`hum.irisL.visible = true; hum.irisR.visible = true;
    hum.lidL.visible = false; hum.lidR.visible = false;`, 'x_c_nolid');
  await vis(`hum.lidL.visible = true; hum.lidR.visible = true;
    hum.eyeL.visible = false; hum.eyeR.visible = false;`, 'x_d_nosclera');
  await vis(`hum.eyeL.visible = true; hum.eyeR.visible = true;
    for (const grp of [hum.eyeGL, hum.eyeGR]) {
      for (const c of grp.children) {
        if (c.geometry?.type === 'CircleGeometry') c.visible = false;
        if (c.geometry?.type === 'SphereGeometry' && c !== hum.eyeL && c !== hum.eyeR
          && c !== hum.irisL && c !== hum.irisR && c.rotation.x > 1) c.visible = false;
      }
    }`, 'x_e_nocornea');
  await vis(`for (const grp of [hum.eyeGL, hum.eyeGR]) for (const c of grp.children) c.visible = true;
    hum.lidLoL.visible = false; hum.lidLoR.visible = false;`, 'x_f_nolidlo');
  await vis(`hum.lidLoL.visible = true; hum.lidLoR.visible = true;
    hum.head.children.forEach((c) => {
      if (c.geometry?.parameters?.thetaStart === 0.66) c.visible = false;
    });`, 'x_g_noao');

  console.log('[dbg] done');
}
