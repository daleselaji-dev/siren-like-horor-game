// 轮18 取证：门2（场内司仪抬臂 0.8m 近景——肘必须在袖内、读成穿西装的人）
// + 门3（酒店广角进深模块：阳台挑板/空调机架/勒脚/分缝；大巴真人形司机驾驶舱）
// 断言全部测「渲染后世界空间」：肘点 4.5cm 内不许有皮肤材质网格、
// 袖罩材质===袖管材质、阳台标记色顶点数、司机烘焙网格体量
import fs from 'node:fs';

export async function run(page, h) {
  fs.mkdirSync('verify/r18', { recursive: true });
  await page.click('#title-start');
  await h.sleep(1200);
  await h.tapKey('Space');
  await h.sleep(300);
  await page.waitForFunction(() => window.__facesReady === true, { timeout: 300000, polling: 1000 });

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
  const look = async (name, px, pz, tx, tz, yHint, pitch = 0) => {
    await page.evaluate(({ px, pz, tx, tz, yHint, pitch }) => {
      const g = window.__game;
      const yaw = Math.atan2(-(tx - px), -(tz - pz));
      g.player.setPosition(px, pz, yaw, yHint);
      g.player.pitch = pitch;
      g.player.syncCamera(0);
    }, { px, pz, tx, tz, yHint, pitch });
    await frames(3);
    await page.evaluate(() => window.__game.hud.clearSubtitles());
    await h.shot(`r18/${name}`);
  };

  // ---------- 断言①：轮18 立面进深模块真的批进了场景 ----------
  // 阳台抹灰 0x837d6f（标记色）：6 座阳台（挑板/栏板/侧颊/牛腿）；空调格栅 0x565a5c
  const fc = await page.evaluate(() => {
    const g = window.__game;
    let balcony = 0, grill = 0;
    g.engine.scene.traverse((o) => {
      if (!o.isMesh) return;
      const hex = o.material?.color?.getHex?.();
      if (hex === 0x837d6f) balcony += o.geometry.attributes.position.count;
      if (hex === 0x565a5c) grill += o.geometry.attributes.position.count;
    });
    return { balcony, grill };
  });
  console.log('[verify] r18 facade:', JSON.stringify(fc));
  assert(fc.balcony >= 300, 'balcony modules missing: ' + fc.balcony);
  assert(fc.grill >= 100, 'AC grills missing: ' + fc.grill);

  // ---------- 断言②：大巴司机=真 humanoid 烘焙体（不是灰筒） ----------
  const bi = await page.evaluate(() => {
    const g = window.__game;
    const bus = g.world.dynamic.bus;
    const drv = g.world.dynamic.busDriver;
    let dm = 0, dv = 0;
    drv?.traverse((o) => { if (o.isMesh) { dm++; dv += o.geometry.attributes.position.count; } });
    let wheel = 0, meshes = 0;
    bus.traverse((o) => {
      if (!o.isMesh) return;
      meshes++;
      if (o.material?.color?.getHex?.() === 0x454c54) wheel++;
    });
    return { driverMeshes: dm, driverVerts: dv, wheel, meshes };
  });
  console.log('[verify] r18 bus:', JSON.stringify(bi));
  assert(bi.driverMeshes >= 5, 'baked driver missing/too coarse: ' + bi.driverMeshes);
  assert(bi.driverVerts > 3000, 'driver not a real humanoid bake: ' + bi.driverVerts);
  assert(bi.wheel >= 5, 'steering wheel missing: ' + bi.wheel);

  // ---------- 断言③：场内司仪抬臂帧——肘在袖内（世界空间实测） ----------
  // 先把司仪拨到「宣布」峰值帧（poseAs 同式收敛），再量：
  //  a) 袖罩存在且材质===西装袖材质（非 skinMat）
  //  b) 左/右肘关节世界点 4.5cm 半径内的所有网格顶点全部属于布料材质网格——
  //     皮肤材质（手/腕的那份 skin）不许出现在肘区（球关节人偶的数值化否决口）
  const elbowCheck = await page.evaluate(() => {
    const g = window.__game;
    const hum = g.byId.emcee.body;
    hum.phase = 5.54; // announce = sin(phase·0.5 − 1.2)³ 峰值
    for (let i = 0; i < 4; i++) hum.animate('mc', 3, 0);
    hum.phase = 5.54;
    hum.animate('mc', 0.001, 0);
    hum.group.updateMatrixWorld(true);
    const V = g.player.pos.constructor;
    const skinMat = hum.armL.hand.material;   // 手臂皮肤材质的引用
    const suitMat = hum.torsoMesh.material;
    const fairOk = !!(hum.armL.fair && hum.armR.fair)
      && hum.armL.fair.material === suitMat && hum.armR.fair.material === suitMat;
    const out = { fairOk, skinNearElbow: [], announce: Math.max(0, Math.sin(hum.phase * 0.5 - 1.2)) ** 3 };
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
  console.log('[verify] r18 emcee elbow:', JSON.stringify(elbowCheck, (k, x) => (typeof x === 'number' ? +x.toFixed(4) : x)));
  assert(elbowCheck.fairOk, 'elbow fairing missing or not sleeve material');
  assert(elbowCheck.announce > 0.8, 'announce pose not at peak: ' + elbowCheck.announce);
  for (const d of elbowCheck.skinNearElbow) {
    assert(d > 0.045, `skin-material mesh within ${(d * 1000).toFixed(0)}mm of elbow (<45mm)`);
  }

  // ---------- 门2场内近景：司仪抬臂 0.8m（r17/45 复拍——必须读成穿西装的人） ----------
  // 轮19 同款流程：站位后等高模头真换入（0.25s 节流 LOD），再 PAUSE 冻结世界
  // 钉死抬臂峰值拍——「低模人偶」和「快门前手臂掉落」两个坑一起绕开
  const em = await page.evaluate(() => {
    const g = window.__game;
    const p = g.byId.emcee.body.headWorldPos(new (g.player.pos.constructor)());
    return { x: p.x, y: p.y, z: p.z };
  });
  await page.evaluate(({ px, pz, tx, tz }) => {
    const g = window.__game;
    const yaw = Math.atan2(-(tx - px), -(tz - pz));
    g.player.setPosition(px, pz, yaw, 3.5);
    g.player.pitch = 0.02;
    g.player.syncCamera(0);
  }, { px: em.x + 0.62, pz: em.z + 0.62, tx: em.x, tz: em.z });
  await page.waitForFunction(() => {
    const hum = window.__game.byId.emcee.body;
    return hum._hd === true && hum.headHD && hum.headHD.visible;
  }, { timeout: 15000, polling: 100 });
  await page.evaluate(() => {
    const g = window.__game;
    g.game.state = 'PAUSE';
    const hum = g.byId.emcee.body;
    hum.phase = 5.54;
    for (let i = 0; i < 4; i++) hum.animate('mc', 3, 0);
    hum.phase = 5.54;
    hum.animate('mc', 0.001, 0);
    g.hud.clearSubtitles();
    g.hud.objTimer = 0;
    g.hud.el.objToast.style.display = 'none';
  });
  await frames(3);
  await h.shot('r18/emcee_stage');
  await page.evaluate(() => { window.__game.game.state = 'PLAY'; });

  // ---------- 门3立面取证 ----------
  const HO = await page.evaluate(() => {
    const o = window.__game.world.dynamic.hotelInfo.origin;
    return { x: o.x, y: o.y, z: o.z };
  });
  // 广角（r17/40 复拍——阳台列/空调机架/勒脚/分缝的体量必须把「单盒」读法打掉；
  // 机位小幅右移+推近：正面偏一点让挑板/机架露出侧面投影（纯正视时进深被自身遮住），
  // 又不能移太多——右前景白屋会整个挡住立面）
  await look('hotel_wide', HO.x + 5, HO.z + 33, HO.x - 1, HO.z + 11, undefined, 0.12);
  // 斜角（与 r17/41 同机位——掠射角下阳台挑板/机架的进深证据）
  await look('hotel_oblique', HO.x + 14, HO.z + 17.5, HO.x - 2, HO.z + 11, undefined, 0.3);

  // ---------- 门3车内：驾驶舱重拍（真人形司机+盘+仪表一帧全收） ----------
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
  // 过道后方越肩机位：司机背影/大檐帽/双臂扶盘/仪表/挡风一帧全收
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
  await h.shot('r18/bus_cabin');
  await page.evaluate(() => {
    const g = window.__game;
    g.game.state = 'PLAY';
    g.story.endIntro();
  });

  console.log('[verify] r18 evidence done');
}
