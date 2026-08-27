// 轮21 取证：门2（人手网格 v2——连续掌指放样/腕胶囊废除/手与脸颈同皮）
// + 门3（三段式立面分色块：翼端暖灰块 | 瓷砖身 | 塔色中央竖块贯通）
// 断言全部测「渲染后场内实例」：
//   手 = 单条索引网格(>3000 顶点)、左手真镜像、材质与颈裙同一实例（同皮肤族）、
//        LOD 高模换入前后手几何不换件（不存在「近景高模手/远景木偶手」两套）
//   楼 = 翼端标记色横跨两翼、中央塔色在翼屋面线以下也有体量（贯通落地）
import fs from 'node:fs';

export async function run(page, h) {
  fs.mkdirSync('verify/r21', { recursive: true });
  await page.click('#title-start');
  await h.sleep(1200);
  await h.tapKey('Space');
  await h.sleep(300);
  await page.waitForFunction(() => window.__facesReady === true, { timeout: 300000, polling: 1000 });
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
      g.hud.el.objToast.classList.remove('show');
    });
    await h.shot(`r21/${name}`);
  };

  // ---------- 断言①：人手 v2——单网格/镜像/与颈同皮（司仪+侍应两个场内实例） ----------
  const handCheck = await page.evaluate(() => {
    const g = window.__game;
    const out = {};
    for (const id of ['emcee', 'waiter']) {
      const hum = g.byId[id].body;
      const neck = hum.torso.children.find((o) => o.name === 'neckSkirt');
      out[id] = {
        vertsL: hum.armL.hand.geometry.attributes.position.count,
        vertsR: hum.armR.hand.geometry.attributes.position.count,
        mirrored: hum.armL.hand.geometry !== hum.armR.hand.geometry,
        indexed: !!hum.armR.hand.geometry.index,
        hasColor: !!hum.armR.hand.geometry.attributes.color,
        skinFamily: !!neck && hum.armR.hand.material === neck.material
          && hum.armL.hand.material === neck.material,
      };
    }
    return out;
  });
  console.log('[verify] r21 hand:', JSON.stringify(handCheck));
  for (const id of ['emcee', 'waiter']) {
    const c = handCheck[id];
    assert(c.vertsL > 3000 && c.vertsR > 3000, `${id} hand mesh too coarse: L=${c.vertsL} R=${c.vertsR}`);
    assert(c.mirrored, `${id} left hand is a rotated right hand (not mirrored)`);
    assert(c.indexed && c.hasColor, `${id} hand not an indexed vertex-colored loft`);
    assert(c.skinFamily, `${id} hand material != neck skin material (蜡手/木手风险)`);
  }

  // ---------- 断言②：翼端分色块 + 中央塔色贯通（渲染后世界空间） ----------
  const fc = await page.evaluate(() => {
    const g = window.__game;
    const V = g.player.pos.constructor;
    const v = new V();
    const o2 = g.world.dynamic.hotelInfo.origin;
    const roofY = o2.y + 10.2;
    let wing = 0, wingMinX = Infinity, wingMaxX = -Infinity;
    let ctrBelowRoof = 0, attic = 0, atticTopY = -Infinity;
    g.engine.scene.traverse((o) => {
      if (!o.isMesh) return;
      const hex = o.material?.color?.getHex?.();
      if (hex === 0x82786a) {
        wing += o.geometry.attributes.position.count;
        o.updateWorldMatrix(true, false);
        const p = o.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
          if (v.x < wingMinX) wingMinX = v.x;
          if (v.x > wingMaxX) wingMaxX = v.x;
        }
      }
      if (hex === 0x8f8a80) {
        attic += o.geometry.attributes.position.count;
        o.updateWorldMatrix(true, false);
        const p = o.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
          if (v.y > atticTopY) atticTopY = v.y;
          if (v.y < roofY - 0.5) ctrBelowRoof++;
        }
      }
    });
    return { wing, wingSpan: wingMaxX - wingMinX, attic, ctrBelowRoof, towerAboveWingRoof: atticTopY - (roofY + 0.9) };
  });
  console.log('[verify] r21 facade:', JSON.stringify(fc, (k, x) => (typeof x === 'number' ? +x.toFixed(2) : x)));
  assert(fc.wing >= 300, 'wing color blocks missing: ' + fc.wing);
  assert(fc.wingSpan >= 25, 'wing blocks not spanning both ends: ' + fc.wingSpan.toFixed(1) + 'm');
  assert(fc.ctrBelowRoof >= 200, 'central tower-color block not reaching below roof: ' + fc.ctrBelowRoof);
  assert(fc.towerAboveWingRoof >= 3.0, 'tower not a full storey above wings: ' + fc.towerAboveWingRoof.toFixed(2) + 'm');

  // ---------- 门2场内近景：司仪抬臂 0.8m（等 LOD 高模换入 + PAUSE 钉姿） ----------
  const em = await page.evaluate(() => {
    const g = window.__game;
    const p = g.byId.emcee.body.headWorldPos(new (g.player.pos.constructor)());
    return { x: p.x, y: p.y, z: p.z };
  });
  // 换 LOD 前记录手几何 uuid（断言③：LOD 换头时手不换件）
  const handUuidPre = await page.evaluate(() => window.__game.byId.emcee.body.armL.hand.geometry.uuid);
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
  const hd = await page.evaluate(() => {
    const hum = window.__game.byId.emcee.body;
    return {
      hd: hum._hd, hdVisible: hum.headHD?.visible ?? false,
      loVisible: hum.headMesh.visible,
      hdVerts: hum.headHD?.geometry.attributes.position.count ?? 0,
      handUuid: hum.armL.hand.geometry.uuid,
    };
  });
  console.log('[verify] r21 emcee LOD:', JSON.stringify(hd));
  assert(hd.hd && hd.hdVisible && !hd.loVisible, 'HD head not swapped in at 0.9m');
  assert(hd.hdVerts > 8000, 'HD head too coarse: ' + hd.hdVerts);
  assert(hd.handUuid === handUuidPre, 'hand mesh swapped on LOD change (旧木偶手回退风险)');
  // PAUSE 钉在 announce 峰值
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
  await h.shot('r21/emcee_stage');

  // ---------- 门2双手特写：抬臂左手 + 持麦右手一帧全收 ----------
  {
    const hp = await page.evaluate(() => {
      const g = window.__game;
      const hum = g.byId.emcee.body;
      const V = g.player.pos.constructor;
      const l = hum.armL.hand.getWorldPosition(new V());
      const r = hum.armR.hand.getWorldPosition(new V());
      return { lx: l.x, ly: l.y, lz: l.z, rx: r.x, ry: r.y, rz: r.z };
    });
    const mx = (hp.lx + hp.rx) / 2, my = (hp.ly + hp.ry) / 2, mz = (hp.lz + hp.rz) / 2;
    // 相机放在观众向（与 r20 面部机位同侧），0.62m 外对准两手中点
    const dn = Math.hypot(0.56, 0.68);
    const cx = mx + (0.56 / dn) * 0.62, cz = mz + (0.68 / dn) * 0.62;
    await page.evaluate(({ cx, cz, mx, my, mz }) => {
      const g = window.__game;
      const yaw = Math.atan2(-(mx - cx), -(mz - cz));
      g.player.setPosition(cx, cz, yaw, 3.42);
      const eyeY = g.player.pos.y + g.player.eyeH;
      g.player.pitch = Math.atan2(my - eyeY, Math.hypot(mx - cx, mz - cz));
      g.player.syncCamera(0);
      g.hud.clearSubtitles();
    }, { cx, cz, mx, my, mz });
    await frames(3);
    await h.shot('r21/emcee_hands_close');
  }
  await page.evaluate(() => { window.__game.game.state = 'PLAY'; });

  // ---------- 门3立面取证 ----------
  const HO = await page.evaluate(() => {
    const o = window.__game.world.dynamic.hotelInfo.origin;
    return { x: o.x, y: o.y, z: o.z };
  });
  await look('hotel_wide', HO.x + 5, HO.z + 33, HO.x - 1, HO.z + 11, undefined, 0.10);
  await look('hotel_oblique', HO.x + 14, HO.z + 17.5, HO.x - 2, HO.z + 11, undefined, 0.24);

  console.log('[verify] r21 evidence done');
}
