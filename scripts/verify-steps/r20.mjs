// 轮20 取证：门2（脸部纵向标定重排后的场内司仪近景——连续皮肤手网格）
// + 门3（真拆楼：中央整层塔楼/檐口勒脚分色/窗洞阴影——广角必须读出「中间高两侧低」）
// 断言全部测「渲染后世界空间」：塔楼顶对两翼屋面的高差、分色带标记色顶点数、
// 连续手网格顶点量级与真镜像
import fs from 'node:fs';

export async function run(page, h) {
  fs.mkdirSync('verify/r20', { recursive: true });
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
    await h.shot(`r20/${name}`);
  };

  // ---------- 断言①：真拆楼——塔楼高差 + 三层分色带全部批进场景 ----------
  // 塔身抹灰 0x8f8a80 / 檐口暗赭 0x5e4a40 / 勒脚暗裙 0x4c4844（标记色）
  const fc = await page.evaluate(() => {
    const g = window.__game;
    const V = g.player.pos.constructor;
    const v = new V();
    let attic = 0, cornice = 0, plinth = 0, atticTopY = -Infinity;
    g.engine.scene.traverse((o) => {
      if (!o.isMesh) return;
      const hex = o.material?.color?.getHex?.();
      if (hex === 0x8f8a80) {
        attic += o.geometry.attributes.position.count;
        o.updateWorldMatrix(true, false);
        const p = o.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
          if (v.y > atticTopY) atticTopY = v.y;
        }
      }
      if (hex === 0x5e4a40) cornice += o.geometry.attributes.position.count;
      if (hex === 0x4c4844) plinth += o.geometry.attributes.position.count;
    });
    const o2 = g.world.dynamic.hotelInfo.origin;
    return { attic, cornice, plinth, towerAboveWingRoof: atticTopY - (o2.y + 10.2 + 0.9) };
  });
  console.log('[verify] r20 massing:', JSON.stringify(fc, (k, x) => (typeof x === 'number' ? +x.toFixed(2) : x)));
  assert(fc.attic >= 90, 'central tower volume missing: ' + fc.attic);
  assert(fc.cornice >= 60, 'cornice color band missing: ' + fc.cornice);
  assert(fc.plinth >= 60, 'plinth dark skirt missing: ' + fc.plinth);
  // 塔顶必须高出两翼女儿墙顶 ≥3m（整层高差可读——「单灰砖」剪影从此非法）
  assert(fc.towerAboveWingRoof >= 3.0, 'tower not a full storey above wings: ' + fc.towerAboveWingRoof.toFixed(2) + 'm');

  // ---------- 断言②：连续皮肤手——分段胶囊/关节球拼装网格已废除 ----------
  const emCheck = await page.evaluate(() => {
    const g = window.__game;
    const hum = g.byId.emcee.body;
    hum.phase = 5.54;
    for (let i = 0; i < 4; i++) hum.animate('mc', 3, 0);
    hum.phase = 5.54;
    hum.animate('mc', 0.001, 0);
    hum.group.updateMatrixWorld(true);
    return {
      handVertsL: hum.armL.hand.geometry.attributes.position.count,
      handVertsR: hum.armR.hand.geometry.attributes.position.count,
      handMirrored: hum.armL.hand.geometry !== hum.armR.hand.geometry,
      handIndexed: !!hum.armR.hand.geometry.index,
      announce: Math.max(0, Math.sin(hum.phase * 0.5 - 1.2)) ** 3,
    };
  });
  console.log('[verify] r20 hand:', JSON.stringify(emCheck, (k, x) => (typeof x === 'number' ? +x.toFixed(3) : x)));
  assert(emCheck.announce > 0.8, 'announce pose not at peak: ' + emCheck.announce);
  assert(emCheck.handVertsL > 1500 && emCheck.handVertsR > 1500,
    `hand mesh too coarse: L=${emCheck.handVertsL} R=${emCheck.handVertsR}`);
  assert(emCheck.handMirrored, 'left hand is a rotated right hand (not mirrored)');
  assert(emCheck.handIndexed, 'hand mesh not an indexed continuous sweep');

  // ---------- 门2场内近景：司仪抬臂 0.8m（等 LOD 高模换入 + PAUSE 钉死峰值） ----------
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
    const hd = await page.evaluate(() => {
      const hum = window.__game.byId.emcee.body;
      return {
        hd: hum._hd, hdVisible: hum.headHD?.visible ?? false,
        loVisible: hum.headMesh.visible,
        hdVerts: hum.headHD?.geometry.attributes.position.count ?? 0,
      };
    });
    console.log('[verify] r20 emcee LOD:', JSON.stringify(hd));
    assert(hd.hd && hd.hdVisible && !hd.loVisible, 'HD head not swapped in at 0.9m');
    assert(hd.hdVerts > 8000, 'HD head too coarse: ' + hd.hdVerts);
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
    await h.shot('r20/emcee_stage');
    await page.evaluate(() => { window.__game.game.state = 'PLAY'; });
  }

  // ---------- 门3立面取证 ----------
  const HO = await page.evaluate(() => {
    const o = window.__game.world.dynamic.hotelInfo.origin;
    return { x: o.x, y: o.y, z: o.z };
  });
  // 广角：一帧读全「低两翼 → 高中央塔（整层+檐口带） → 字架」；
  // 塔冠加高后仰角抬到 0.10，剪影不出画
  await look('hotel_wide', HO.x + 5, HO.z + 33, HO.x - 1, HO.z + 11, undefined, 0.10);
  // 斜角（掠射角下塔楼侧面/挑板带/勒脚檐口分色的进深证据）
  await look('hotel_oblique', HO.x + 14, HO.z + 17.5, HO.x - 2, HO.z + 11, undefined, 0.24);

  console.log('[verify] r20 evidence done');
}
