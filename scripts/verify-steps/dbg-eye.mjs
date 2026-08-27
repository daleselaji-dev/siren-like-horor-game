// 一次性排查：emcee 左眼「独眼金属环」伪影来源（r24 精确机位 + 二分隐藏各层）
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
    window.__game.engine.setFilmLook(0);
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

  // —— r24 emcee 近景完全同机位；随后 FOV 收窄放大左眼 ——
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
    cam.position.set(head.x + fwd.x * 0.60, head.y + 0.14, head.z + fwd.z * 0.60);
    // 与 r24 同视轴；FOV 12 放大——伪影是视角依赖的，机位不动只收窄视野
    const eyeW = new V();
    hum.eyeGL.getWorldPosition(eyeW);
    cam.fov = 12; cam.updateProjectionMatrix();
    cam.lookAt(eyeW.x, eyeW.y, eyeW.z);
    hum.constructor.viewer.copy(head);
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
  await h.shot('dbg/y_a_base');

  const vis = (code, name) => page.evaluate((c) => {
    const hum = window.__game.byId.emcee.body;
    // eslint-disable-next-line no-new-func
    new Function('hum', c)(hum);
  }, code).then(() => frames(2)).then(() => h.shot(`dbg/${name}`));

  await vis('hum.irisL.visible = false;', 'y_b_noiris');
  await vis('hum.irisL.visible = true; hum.eyeL.visible = false;', 'y_c_nosclera');
  await vis(`hum.eyeL.visible = true;
    for (const c of hum.eyeGL.children) {
      if (c.geometry?.type === 'CircleGeometry') c.visible = false;
      if (c.geometry?.type === 'SphereGeometry' && c !== hum.eyeL && c !== hum.irisL && c.rotation.x > 1) c.visible = false;
    }`, 'y_d_nocornea_glint');
  await vis(`for (const c of hum.eyeGL.children) c.visible = true;
    hum.lidL.visible = false;`, 'y_e_noupperlid');
  await vis('hum.lidL.visible = true; hum.lidLoL.visible = false;', 'y_f_nolowerlid');
  await vis(`hum.lidLoL.visible = true;
    hum.head.children.forEach((c) => {
      if (c.geometry?.parameters?.thetaStart === 0.66) c.visible = false;
    });`, 'y_g_noao');
  await vis(`hum.head.children.forEach((c) => {
      if (c.geometry?.parameters?.thetaStart === 0.66) c.visible = true;
    });
    hum.eyeGL.position.z += 0.002; hum.eyeGL.updateMatrixWorld(true);`, 'y_h_fwd2mm');

  console.log('[dbg] done');
}
