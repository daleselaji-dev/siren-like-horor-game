// 轮19 取证：门2（场内司仪=charshot 同一 humanoid——高模头已换入+分指手网格实测）
// + 门3（酒店体量分级：中央退台体/连续挑板带/屋顶机房——广角不许再读成单灰砖）
// 断言全部测「渲染后世界空间」：高模头可见性、手网格顶点量级、
// 退台体/挑板带/格栅标记色顶点数、司机烘焙体量、肘区材质
import fs from 'node:fs';

export async function run(page, h) {
  fs.mkdirSync('verify/r19', { recursive: true });
  await page.click('#title-start');
  await h.sleep(1200);
  await h.tapKey('Space');
  await h.sleep(300);
  await page.waitForFunction(() => window.__facesReady === true, { timeout: 300000, polling: 1000 });
  // 目标横幅整场隐藏（CSS 淡出有过渡，仅摘 class 截屏时还挂在半空）
  await page.evaluate(() => { window.__game.hud.el.objToast.style.display = 'none'; });

  const assert = (ok, msg) => { if (!ok) throw new Error('ASSERT: ' + msg); };
  const frames = (n) => page.evaluate((k) => new Promise((res) => {
    let i = 0;
    const t0 = performance.now();
    const tick = () => {
      if (++i >= k || performance.now() - t0 > 20000) res();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), n);
  const look = async (name, px, pz, tx, tz, yHint, pitch = 0, settle = 3) => {
    await page.evaluate(({ px, pz, tx, tz, yHint, pitch }) => {
      const g = window.__game;
      const yaw = Math.atan2(-(tx - px), -(tz - pz));
      g.player.setPosition(px, pz, yaw, yHint);
      g.player.pitch = pitch;
      g.player.syncCamera(0);
    }, { px, pz, tx, tz, yHint, pitch });
    await frames(settle);
    await page.evaluate(() => {
      const g = window.__game;
      g.hud.clearSubtitles();
      g.hud.objTimer = 0;
      g.hud.el.objToast.classList.remove('show'); // 目标横幅不入取证帧
    });
    await h.shot(`r19/${name}`);
  };

  // ---------- 断言①：体量分级真的批进了场景 ----------
  // 退台体抹灰 0x8f8a80（标记色）/ 挑板带 0x837d6f / 空调格栅 0x565a5c
  const fc = await page.evaluate(() => {
    const g = window.__game;
    let attic = 0, balcony = 0, grill = 0;
    g.engine.scene.traverse((o) => {
      if (!o.isMesh) return;
      const hex = o.material?.color?.getHex?.();
      if (hex === 0x8f8a80) attic += o.geometry.attributes.position.count;
      if (hex === 0x837d6f) balcony += o.geometry.attributes.position.count;
      if (hex === 0x565a5c) grill += o.geometry.attributes.position.count;
    });
    return { attic, balcony, grill };
  });
  console.log('[verify] r19 massing:', JSON.stringify(fc));
  assert(fc.attic >= 90, 'central attic volume missing: ' + fc.attic);
  assert(fc.balcony >= 500, 'balcony band modules missing: ' + fc.balcony);
  assert(fc.grill >= 100, 'AC grills missing: ' + fc.grill);

  // ---------- 断言②：大巴司机=真 humanoid 烘焙体（不是灰筒） ----------
  const bi = await page.evaluate(() => {
    const g = window.__game;
    const bus = g.world.dynamic.bus;
    const drv = g.world.dynamic.busDriver;
    let dm = 0, dv = 0;
    drv?.traverse((o) => { if (o.isMesh) { dm++; dv += o.geometry.attributes.position.count; } });
    let wheel = 0;
    bus.traverse((o) => {
      if (o.isMesh && o.material?.color?.getHex?.() === 0x454c54) wheel++;
    });
    return { driverMeshes: dm, driverVerts: dv, wheel };
  });
  console.log('[verify] r19 bus:', JSON.stringify(bi));
  assert(bi.driverMeshes >= 5, 'baked driver missing/too coarse: ' + bi.driverMeshes);
  assert(bi.driverVerts > 3000, 'driver not a real humanoid bake: ' + bi.driverVerts);
  assert(bi.wheel >= 5, 'steering wheel missing: ' + bi.wheel);

  // ---------- 断言③：场内司仪与 charshot 同一套 humanoid ----------
  //  a) 分指手网格：三节指骨+扇开+关节球——顶点量级实测（方块指网格到不了这个量）
  //  b) 肘在袖内（轮18 铁律保持）：抬臂峰值帧肘点 4.5cm 内无皮肤材质
  const emCheck = await page.evaluate(() => {
    const g = window.__game;
    const hum = g.byId.emcee.body;
    hum.phase = 5.54; // announce = sin(phase·0.5 − 1.2)³ 峰值
    for (let i = 0; i < 4; i++) hum.animate('mc', 3, 0);
    hum.phase = 5.54;
    hum.animate('mc', 0.001, 0);
    hum.group.updateMatrixWorld(true);
    const V = g.player.pos.constructor;
    const skinMat = hum.armL.hand.material;
    const suitMat = hum.torsoMesh.material;
    const fairOk = !!(hum.armL.fair && hum.armR.fair)
      && hum.armL.fair.material === suitMat && hum.armR.fair.material === suitMat;
    const out = {
      fairOk,
      handVertsL: hum.armL.hand.geometry.attributes.position.count,
      handVertsR: hum.armR.hand.geometry.attributes.position.count,
      handMirrored: hum.armL.hand.geometry !== hum.armR.hand.geometry,
      skinNearElbow: [],
      announce: Math.max(0, Math.sin(hum.phase * 0.5 - 1.2)) ** 3,
    };
    const v = new V();
    for (const arm of [hum.armL, hum.armR]) {
      const E = new V();
      arm.elbow.getWorldPosition(E);
      let nearestSkin = Infinity;
      arm.shoulder.traverse((o) => {
        if (!o.isMesh || o.material !== skinMat) return;
        const p = o.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
          const d = v.distanceTo(E);
          if (d < nearestSkin) nearestSkin = d;
        }
      });
      out.skinNearElbow.push(nearestSkin);
    }
    return out;
  });
  console.log('[verify] r19 emcee body:', JSON.stringify(emCheck, (k, x) => (typeof x === 'number' ? +x.toFixed(4) : x)));
  assert(emCheck.fairOk, 'elbow fairing missing or not sleeve material');
  assert(emCheck.announce > 0.8, 'announce pose not at peak: ' + emCheck.announce);
  assert(emCheck.handVertsL > 2500 && emCheck.handVertsR > 2500,
    `hand mesh too coarse (block fingers): L=${emCheck.handVertsL} R=${emCheck.handVertsR}`);
  assert(emCheck.handMirrored, 'left hand is a rotated right hand (not mirrored)');
  for (const d of emCheck.skinNearElbow) {
    assert(d > 0.045, `skin-material mesh within ${(d * 1000).toFixed(0)}mm of elbow (<45mm)`);
  }

  // ---------- 门2场内近景：司仪抬臂 0.8m ----------
  // 轮18 的复拍瞬移后只等 3 帧就按快门——0.25s 节流的近距高模头没来得及换入，
  // 拍到的是远距低模（「场内低模人偶」的直接元凶）。现在：先站位，等 LOD
  // 真换入（_hd===true 且 headHD.visible），再把相位拨回抬臂峰值补收敛后拍
  {
    const em = await page.evaluate(() => {
      const g = window.__game;
      const p = g.byId.emcee.body.headWorldPos(new (g.player.pos.constructor)());
      return { x: p.x, y: p.y, z: p.z };
    });
    await page.evaluate(({ px, pz, tx, tz }) => {
      const g = window.__game;
      const yaw = Math.atan2(-(tx - px), -(tz - pz));
      g.player.setPosition(px, pz, yaw, 3.42);
      g.player.pitch = 0.0;
      g.player.syncCamera(0);
    }, { px: em.x + 0.56, pz: em.z + 0.68, tx: em.x, tz: em.z });
    await page.waitForFunction(() => {
      const hum = window.__game.byId.emcee.body;
      return hum._hd === true && hum.headHD && hum.headHD.visible;
    }, { timeout: 15000, polling: 100 });
    // 高模已换入：断言（否决口数值化——场内低模头从此非法）
    const hd = await page.evaluate(() => {
      const hum = window.__game.byId.emcee.body;
      return {
        hd: hum._hd, hdVisible: hum.headHD?.visible ?? false,
        loVisible: hum.headMesh.visible,
        hdVerts: hum.headHD?.geometry.attributes.position.count ?? 0,
      };
    });
    console.log('[verify] r19 emcee LOD:', JSON.stringify(hd));
    assert(hd.hd && hd.hdVisible && !hd.loVisible, 'HD head not swapped in at 0.9m');
    assert(hd.hdVerts > 8000, 'HD head too coarse: ' + hd.hdVerts);
    // 轮18复拍教训：PLAY 态下实体 AI 每帧继续推进相位，
    // 「拨峰值→等3帧→按快门」窗口里手臂已经掉下来了。
    // 现在先 PAUSE 冻结世界（渲染继续、AI 停摆），再钉死峰值姿势拍照
    await page.evaluate(() => {
      const g = window.__game;
      g.game.state = 'PAUSE';
      const hum = g.byId.emcee.body;
      hum.phase = 5.54;
      for (let i = 0; i < 4; i++) hum.animate('mc', 3, 0);
      hum.phase = 5.54;
      hum.animate('mc', 0.001, 0);
      g.hud.clearSubtitles();
    });
    await frames(3);
    await h.shot('r19/emcee_stage');
    await page.evaluate(() => { window.__game.game.state = 'PLAY'; });
  }

  // ---------- 门3立面取证 ----------
  const HO = await page.evaluate(() => {
    const o = window.__game.world.dynamic.hotelInfo.origin;
    return { x: o.x, y: o.y, z: o.z };
  });
  // 广角（r18/hotel_wide 复拍）：体量分级必须一帧读全——
  // 低两翼(机房/水箱/天线) → 中央退台体 → 字架；挑板带的横向阴影线层层数得出来。
  // 俯仰从 0.12 收到 0.04：楼顶加冠后不能把新剪影切出画外
  await look('hotel_wide', HO.x + 5, HO.z + 33, HO.x - 1, HO.z + 11, undefined, 0.04);
  // 斜角（掠射角下挑板带/机架/退台体的进深证据）
  await look('hotel_oblique', HO.x + 14, HO.z + 17.5, HO.x - 2, HO.z + 11, undefined, 0.22);

  // ---------- 门3车内：驾驶舱复拍（真人形司机+盘+仪表一帧全收） ----------
  await page.evaluate(() => {
    const g = window.__game;
    const bus = g.world.dynamic.bus;
    bus.visible = true;
    bus.position.set(64.5, g.world.heightAt(64.5, -1.3) + 0.06, -1.3);
    g.sky.setBloodTide(false);
    g.sky.blood = 0; g.sky._bloodTarget = 0;
    if (g.sky._envSwapped) { g.sky._envSwapped = false; g.engine.scene.environment = g.sky.envNormal; }
    g.ocean.setBloodTide(false);
    g.engine.finalPass.uniforms.uTint.value.set(1, 1, 1);
    g.sky.update(0.05, g.player.pos);
    for (const f of g.sky.fogCards) {
      const dx = f.sp.position.x - bus.position.x, dz = f.sp.position.z - bus.position.z;
      if (dx * dx + dz * dz < 3600) { f.sp.position.x += 120; f.sp.position.z += 120; }
    }
    g.story.busGo = false;
    g.story._busV = 1.2;
    g.story.flags.intro = false;
    g.story.beginIntro();
  });
  await page.evaluate((t) => new Promise((res) => {
    const g = window.__game;
    g.game.state = 'PAUSE';
    g.story.introSeq.t0 = performance.now() - t;
    g.story.updateIntro(0);
    g.sky.flashSeq = null; g.sky.flash = 0; g.sky.boltMesh.visible = false;
    const u = g.engine.finalPass.uniforms;
    u.uFlash.value = 0; u.uRedShift.value = 0; u.uPulse.value = 0; u.uDistort.value = 0;
    requestAnimationFrame(() => requestAnimationFrame(res));
  }), 620);
  await page.evaluate(() => new Promise((res) => {
    const g = window.__game;
    const bus = g.world.dynamic.bus;
    const V = bus.position.constructor;
    const cam = g.engine.camera;
    const eye = bus.localToWorld(new V(1.65, 1.78, -0.42));
    const tgt = bus.localToWorld(new V(3.35, 1.3, 0.5));
    cam.position.copy(eye);
    cam.lookAt(tgt);
    g.hud.clearSubtitles();
    requestAnimationFrame(() => requestAnimationFrame(res));
  }));
  await h.shot('r19/bus_cabin');
  await page.evaluate(() => {
    const g = window.__game;
    g.game.state = 'PLAY';
    g.story.endIntro();
  });

  console.log('[verify] r19 evidence done');
}
