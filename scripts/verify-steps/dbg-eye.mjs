// 一次性排查：emcee 左眼「独眼金属环」伪影来源 + 积水篷布修复目检
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

  // —— emcee 近景（与 r24 同法） ——
  const dump = await page.evaluate(() => {
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
    const rig = [];
    if (SpotC) {
      const keyL = new SpotC(0xffd9a0, 60, 12, 0.7, 0.55);
      keyL.position.set(head.x + fwd.x * 0.9 + side.x * 0.85, head.y + 0.55, head.z + fwd.z * 0.9 + side.z * 0.85);
      keyL.target.position.set(head.x, head.y + 0.05, head.z);
      g.engine.scene.add(keyL, keyL.target);
      rig.push(keyL, keyL.target);
      const fillL = new SpotC(0xcfe0d8, 14, 10, 0.9, 0.7);
      fillL.position.set(head.x + fwd.x * 0.8 - side.x * 1.1, head.y + 0.3, head.z + fwd.z * 0.8 - side.z * 1.1);
      fillL.target.position.copy(keyL.target.position);
      g.engine.scene.add(fillL, fillL.target);
      rig.push(fillL, fillL.target);
    }
    window.__shootRig = rig;
    g.hud.clearSubtitles();
    g.hud.objTimer = 0;
    g.hud.el.objToast.classList.remove('show');
    // 状态转储
    const rot = (o) => [o.rotation.x, o.rotation.y, o.rotation.z].map((v) => +v.toFixed(4));
    return {
      eyeGL: rot(hum.eyeGL), eyeGR: rot(hum.eyeGR),
      lidL: hum.lidL.rotation.x.toFixed(4), lidBaseL: hum.lidBaseL.toFixed(4),
      lidR: hum.lidR.rotation.x.toFixed(4), lidBaseR: hum.lidBaseR.toFixed(4),
      lidLoL: hum.lidLoL.rotation.x.toFixed(4), lidLoBase: hum.lidLoBase.toFixed(4),
      blinkPh: hum.blinkPh, exS: hum.exS, exN: hum.exN,
      eyeLscaleY: hum.eyeL.scale.y.toFixed(4), eyeRscaleY: hum.eyeR.scale.y.toFixed(4),
      eyeSclY: hum.eyeSclY.toFixed(4),
      eyeGLkids: hum.eyeGL.children.map((c) => c.geometry?.type + ':' + (c.visible ? 1 : 0)),
    };
  });
  console.log('[dbg] emcee eye state:', JSON.stringify(dump));
  await page.waitForFunction(() => {
    const hum = window.__game.byId.emcee.body;
    return hum._hd === true && hum.headHD && hum.headHD.visible;
  }, { timeout: 15000, polling: 100 });
  await frames(3);
  await h.shot('dbg/eye_a_base');

  // B：藏两眼捕捉光点（glint）
  await page.evaluate(() => {
    const hum = window.__game.byId.emcee.body;
    for (const grp of [hum.eyeGL, hum.eyeGR]) {
      for (const c of grp.children) if (c.geometry?.type === 'CircleGeometry') c.visible = false;
    }
  });
  await frames(2);
  await h.shot('dbg/eye_b_noglint');

  // C：再藏角膜壳
  await page.evaluate(() => {
    const hum = window.__game.byId.emcee.body;
    for (const grp of [hum.eyeGL, hum.eyeGR]) {
      grp.children.forEach((c) => {
        if (c.geometry?.type === 'SphereGeometry' && c.rotation.x > 1.5) c.visible = false;
      });
    }
  });
  await frames(2);
  await h.shot('dbg/eye_c_nocornea');

  // D：再藏睑缘环
  await page.evaluate(() => {
    const hum = window.__game.byId.emcee.body;
    for (const lid of [hum.lidL, hum.lidR]) for (const c of lid.children) c.visible = false;
  });
  await frames(2);
  await h.shot('dbg/eye_d_norim');

  // E：钉睑到基础位 + 眼球 scale 复位（若 A-D 无变化则是睑/眨眼冻结）
  await page.evaluate(() => {
    const hum = window.__game.byId.emcee.body;
    for (const grp of [hum.eyeGL, hum.eyeGR]) grp.children.forEach((c) => { c.visible = true; });
    for (const lid of [hum.lidL, hum.lidR]) for (const c of lid.children) c.visible = true;
    hum.blinkPh = -1;
    hum.lidL.rotation.x = hum.lidBaseL;
    hum.lidR.rotation.x = hum.lidBaseR;
    hum.lidLoL.rotation.x = hum.lidLoBase;
    hum.lidLoR.rotation.x = hum.lidLoBase;
    hum.eyeL.scale.y = hum.eyeSclY;
    hum.eyeR.scale.y = hum.eyeSclY;
  });
  await frames(2);
  await h.shot('dbg/eye_e_lidpin');

  // —— 积水修复目检：hotel_wide / street_vista ——
  await page.evaluate(() => {
    const g = window.__game;
    if (window.__shootRig) { for (const l of window.__shootRig) l.parent?.remove(l); window.__shootRig = null; }
    const hum = g.byId.emcee.body;
    if (hum.micG) hum.micG.visible = true;
    g.engine.camera.fov = window.__origFov; g.engine.camera.updateProjectionMatrix();
    g.game.state = 'PLAY';
  });
  const look = async (name, px, pz, tx, tz, pitch = 0) => {
    await page.evaluate(({ px, pz, tx, tz, pitch }) => {
      const g = window.__game;
      const yaw = Math.atan2(-(tx - px), -(tz - pz));
      g.player.setPosition(px, pz, yaw, undefined);
      g.player.pitch = pitch;
      g.player.syncCamera(0);
    }, { px, pz, tx, tz, pitch });
    await frames(3);
    await page.evaluate(() => {
      const g = window.__game;
      g.hud.clearSubtitles();
      g.hud.objTimer = 0;
      g.hud.el.objToast.classList.remove('show');
    });
    await h.shot(`dbg/${name}`);
  };
  const HO = await page.evaluate(() => {
    const o = window.__game.world.dynamic.hotelInfo.origin;
    return { x: o.x, y: o.y, z: o.z };
  });
  await look('hotel_wide', HO.x + 5, HO.z + 33, HO.x - 1, HO.z + 11, 0.10);
  await look('street_vista', -2, -14, HO.x - 1, HO.z + 11, 0.04);

  console.log('[dbg] done');
}
