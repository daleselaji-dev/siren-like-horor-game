// 一次性排查：emcee 左眼伪影——裸眼球检验 + 离轴角数值转储
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
    hum.blinkPh = -1; hum.blinkT = 9;
    hum.lidL.rotation.x = hum.lidBaseL;
    hum.lidR.rotation.x = hum.lidBaseR;
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
    const hq = new g.THREE.Quaternion();
    hum.head.getWorldQuaternion(hq);
    const fwd = new V(0, 0, 1).applyQuaternion(hq);
    fwd.y = 0;
    fwd.normalize();
    const side = new V(fwd.z, 0, -fwd.x);
    const cam = g.engine.camera;
    cam.fov = 33; cam.updateProjectionMatrix();
    cam.position.set(head.x + fwd.x * 0.60, head.y + 0.14, head.z + fwd.z * 0.60);
    cam.lookAt(head.x, head.y + 0.11, head.z);
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
    // 数值转储：P 参数 / 眼球世界位 / 相机轴与眼视线的离轴角
    const eL = new V(), eR = new V();
    hum.eyeGL.getWorldPosition(eL);
    hum.eyeGR.getWorldPosition(eR);
    const camDir = new V(head.x - cam.position.x, head.y + 0.11 - cam.position.y, head.z - cam.position.z).normalize();
    const eyeFwdW = new V(0, 0, 1).applyQuaternion(hq); // 眼球组世界朝向≈头朝向
    const offAxis = Math.acos(Math.max(-1, Math.min(1, -camDir.dot(eyeFwdW)))) * 180 / Math.PI;
    return {
      eyeX: hum.P.eyeX, asym: hum.P.asym, asymPh: hum.P.asymPh, eyeS: hum.P.eyeS,
      eyeXoff: hum.eyeXoff,
      eyeL: [eL.x, eL.y, eL.z].map((v) => +v.toFixed(4)),
      eyeR: [eR.x, eR.y, eR.z].map((v) => +v.toFixed(4)),
      headFwd: [fwd.x, fwd.z].map((v) => +v.toFixed(4)),
      eyaw: +e.yaw.toFixed(4),
      hq: [hq.x, hq.y, hq.z, hq.w].map((v) => +v.toFixed(4)),
      offAxisDeg: +offAxis.toFixed(2),
    };
  });
  console.log('[dbg] state:', JSON.stringify(dump));
  await page.waitForFunction(() => {
    const hum = window.__game.byId.emcee.body;
    return hum._hd === true && hum.headHD && hum.headHD.visible;
  }, { timeout: 15000, polling: 100 });
  await frames(3);
  await h.shot('dbg/w_a_base');

  const vis = (code, name) => page.evaluate((c) => {
    const hum = window.__game.byId.emcee.body;
    // eslint-disable-next-line no-new-func
    new Function('hum', c)(hum);
  }, code).then(() => frames(2)).then(() => h.shot(`dbg/${name}`));

  // 裸眼球：藏头皮（HD+低模）——看眼球+睑的相对位置
  await vis('hum.headHD.visible = false; hum.headMesh.visible = false;', 'w_b_nohead');
  // 再藏上下睑+睫毛+AO——纯裸眼球：虹膜是否在球正前？
  await vis(`hum.lidL.visible = false; hum.lidR.visible = false;
    hum.lidLoL.visible = false; hum.lidLoR.visible = false;
    hum.head.children.forEach((c) => {
      const p = c.geometry?.parameters;
      if (p?.thetaStart === 0.66) c.visible = false;
      if (c.geometry?.type === 'PlaneGeometry') c.visible = false;
    });`, 'w_c_bareeye');

  console.log('[dbg] done');
}
