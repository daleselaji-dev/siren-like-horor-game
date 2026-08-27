// 轮22 取证：门2（肘/肩球关节物理根除——一体袖山放样 + 两端闭合肘荚，
//   任何抬臂角度看不到球窝/承窝同心圆）+ 门3（翼端挑楼塔/挑板阴影带/住人亮窗）
// 断言全部测「渲染后场内实例」：
//   臂 = 肩组无任何球件（sleeveArm 一体放样）、肘荚 Lathe 轮廓两端闭合(<2mm)且
//        荚径大于袖管、材质与西装袖同一实例；膝同机制
//   楼 = 翼端挑楼塔在墙面之外有真出挑体量（跨两翼）、板底阴影带存在、
//        住人亮窗自发光材质 ≥3 种、翼色最高点越过主檐一层
import fs from 'node:fs';

export async function run(page, h) {
  fs.mkdirSync('verify/r22', { recursive: true });
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
    await h.shot(`r22/${name}`);
  };

  // ---------- 断言①：球关节几何不存在（司仪+侍应两个场内实例） ----------
  const armCheck = await page.evaluate(() => {
    const g = window.__game;
    const out = {};
    const podProfile = (mesh) => {
      const pts = mesh.geometry.parameters?.points ?? [];
      let rMax = 0;
      for (const p of pts) if (p.x > rMax) rMax = p.x;
      return {
        closed: pts.length > 4 && pts[0].x < 0.002 && pts[pts.length - 1].x < 0.002,
        rMax,
      };
    };
    for (const id of ['emcee', 'waiterBanquet']) {
      const hum = g.byId[id].body;
      const spheresIn = (grp) => {
        let n = 0;
        for (const o of grp.children) if (o.isMesh && o.geometry?.type === 'SphereGeometry') n++;
        return n;
      };
      const podL = hum.armL.fair, podR = hum.armR.fair;
      const sleeveL = hum.armL.shoulder.children.find((o) => o.name === 'sleeveArm');
      out[id] = {
        shoulderSpheres: spheresIn(hum.armL.shoulder) + spheresIn(hum.armR.shoulder),
        elbowSpheres: spheresIn(hum.armL.elbow) + spheresIn(hum.armR.elbow),
        kneeSpheres: spheresIn(hum.legL.knee) + spheresIn(hum.legR.knee),
        sleeve: !!sleeveL && sleeveL.geometry.type === 'LatheGeometry',
        podNamed: podL?.name === 'elbowPod' && podR?.name === 'elbowPod',
        podL: podL ? podProfile(podL) : null,
        podSuitMat: id === 'emcee'
          ? (podL.material === hum.torsoMesh.material && podR.material === hum.torsoMesh.material)
          : true,
        kneePod: hum.legL.fair?.name === 'kneePod' && (hum.legL.fair ? podProfile(hum.legL.fair).closed : false),
      };
    }
    return out;
  });
  console.log('[verify] r22 arm:', JSON.stringify(armCheck, (k, x) => (typeof x === 'number' ? +x.toFixed(4) : x)));
  for (const id of ['emcee', 'waiterBanquet']) {
    const c = armCheck[id];
    assert(c.shoulderSpheres === 0, `${id} shoulder still has sphere joint(s): ${c.shoulderSpheres}`);
    assert(c.elbowSpheres === 0, `${id} elbow still has sphere joint(s): ${c.elbowSpheres}`);
    assert(c.kneeSpheres === 0, `${id} knee still has sphere joint(s): ${c.kneeSpheres}`);
    assert(c.sleeve, `${id} one-piece sleeveArm loft missing`);
    assert(c.podNamed && c.podL?.closed, `${id} elbow pod missing or not closed both ends`);
    assert(c.podL.rMax > 0.041, `${id} elbow pod thinner than sleeve tube: ${c.podL.rMax}`);
    assert(c.podSuitMat, `${id} elbow pod material != suit sleeve material`);
    assert(c.kneePod, `${id} knee pod missing/not closed`);
  }

  // ---------- 断言②：立面轮22——挑楼塔体量/阴影带/亮窗/天际线 ----------
  const fc = await page.evaluate(() => {
    const g = window.__game;
    const V = g.player.pos.constructor;
    const v = new V();
    const o2 = g.world.dynamic.hotelInfo.origin;
    let towerVerts = 0, towerMinX = Infinity, towerMaxX = -Infinity, wingTopY = -Infinity;
    let shadeVerts = 0;
    const glowMats = new Set();
    g.engine.scene.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      const hex = m?.color?.getHex?.();
      if (m?.emissiveIntensity >= 0.45 && [0xffb26a, 0xffc07a, 0x8fb4c8].includes(m.emissive?.getHex?.())) {
        glowMats.add(m.emissive.getHex());
      }
      if (hex === 0x101214) shadeVerts += o.geometry.attributes.position.count;
      if (hex === 0xc4b69e) {
        o.updateWorldMatrix(true, false);
        const p = o.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
          if (v.y > wingTopY) wingTopY = v.y;
          if (v.z > o2.z + 11.3 && v.y > o2.y + 3.9) {
            towerVerts++;
            if (v.x < towerMinX) towerMinX = v.x;
            if (v.x > towerMaxX) towerMaxX = v.x;
          }
        }
      }
    });
    return {
      towerVerts,
      towerWest: o2.x - towerMinX, towerEast: towerMaxX - o2.x,
      wingTopOverRoof: wingTopY - (o2.y + 10.2 + 0.9),
      shadeVerts, glowKinds: glowMats.size,
    };
  });
  console.log('[verify] r22 facade:', JSON.stringify(fc, (k, x) => (typeof x === 'number' ? +x.toFixed(2) : x)));
  assert(fc.towerVerts >= 300, 'wing corbel towers missing: ' + fc.towerVerts);
  assert(fc.towerWest >= 13 && fc.towerEast >= 13, `towers not on both wings: W=${fc.towerWest.toFixed(1)} E=${fc.towerEast.toFixed(1)}`);
  assert(fc.wingTopOverRoof >= 0.8, 'tower parapet not a step above main cornice: ' + fc.wingTopOverRoof.toFixed(2));
  assert(fc.shadeVerts >= 100, 'balcony shadow bands missing: ' + fc.shadeVerts);
  assert(fc.glowKinds >= 3, 'inhabited lit windows missing: ' + fc.glowKinds);

  // ---------- 门2场内取证：钉 announce 峰值，全身抬臂 + 肘特写 ----------
  const em = await page.evaluate(() => {
    const g = window.__game;
    const p = g.byId.emcee.body.headWorldPos(new (g.player.pos.constructor)());
    return { x: p.x, y: p.y, z: p.z };
  });
  // 先站到 0.8m 触发 LOD 高模（脸取证一致性），玩家本体留台上
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
  await page.evaluate(() => {
    const g = window.__game;
    g.game.state = 'PAUSE';
    const hum = g.byId.emcee.body;
    const PEAK = 2.4 + Math.PI; // sin(phase/2 − 1.2) = 1
    for (let i = 0; i < 5; i++) { hum.phase = PEAK - 3 * 0.8; hum.animate('mc', 3, 0); }
    hum.phase = PEAK - 0.001 * 0.8;
    hum.animate('mc', 0.001, 0);
    g.hud.clearSubtitles();
    // 取证灯光：司仪 13m 内酒店灯强制点亮（预算轮换的随机黑帧出局）
    const V = g.player.pos.constructor;
    const head = hum.headWorldPos(new V());
    for (const hl of g.world.dynamic.hotelLights ?? []) {
      if (hl.pl.position.distanceTo(head) < 13) hl.pl.visible = true;
    }
  });
  const pin = await page.evaluate(() => {
    const hum = window.__game.byId.emcee.body;
    return {
      announce: Math.max(0, Math.sin(hum.phase * 0.5 - 1.2)) ** 3,
      armLx: hum.armL.shoulder.rotation.x,
      armRx: hum.armR.shoulder.rotation.x,
    };
  });
  console.log('[verify] r22 pin:', JSON.stringify(pin, (k, x) => (typeof x === 'number' ? +x.toFixed(3) : x)));
  assert(pin.announce > 0.95, 'announce not at peak: ' + pin.announce);
  assert(pin.armLx < -1.2, 'announce arm not raised: ' + pin.armLx);
  // 全身构图：以身体中心（头下 0.62m）为画面中心，沿观众向退 2.55m——
  // 抬臂全身剪影一帧全收（门2 验收基准帧）
  await page.evaluate(() => {
    const g = window.__game;
    const hum = g.byId.emcee.body;
    const V = g.player.pos.constructor;
    const head = hum.headWorldPos(new V());
    const cx = head.x, cy = head.y - 0.62, cz = head.z;
    const dn = Math.hypot(0.56, 0.68);
    const cam = g.engine.camera;
    cam.position.set(cx + (0.56 / dn) * 2.55, cy + 0.12, cz + (0.68 / dn) * 2.55);
    cam.lookAt(cx, cy, cz);
    g.hud.clearSubtitles();
  });
  await frames(4);
  await h.shot('r22/emcee_stage');

  // 肘特写：抬臂左肘 0.4m——必须读成布（袖山→肘荚→前臂袖一条布，无球无同心圆）
  await page.evaluate(() => {
    const g = window.__game;
    const hum = g.byId.emcee.body;
    const V = g.player.pos.constructor;
    const E = hum.armL.elbow.getWorldPosition(new V());
    const S = hum.armL.shoulder.getWorldPosition(new V());
    const cam = g.engine.camera;
    // 机位放在「肘→观众」向 + 微下俯：肘荚外侧（屈角外缘）正对镜头
    const dn = Math.hypot(0.56, 0.68);
    cam.position.set(E.x + (0.56 / dn) * 0.42, E.y + 0.10, E.z + (0.68 / dn) * 0.42);
    cam.lookAt((E.x + S.x) / 2, (E.y + S.y) / 2 - 0.04, (E.z + S.z) / 2);
    g.hud.clearSubtitles();
  });
  await frames(3);
  await h.shot('r22/emcee_elbow_close');
  await page.evaluate(() => { window.__game.game.state = 'PLAY'; });

  // ---------- 门3立面取证 ----------
  const HO = await page.evaluate(() => {
    const o = window.__game.world.dynamic.hotelInfo.origin;
    return { x: o.x, y: o.y, z: o.z };
  });
  await look('hotel_wide', HO.x + 5, HO.z + 33, HO.x - 1, HO.z + 11, undefined, 0.10);
  await look('hotel_oblique', HO.x + 14, HO.z + 17.5, HO.x - 2, HO.z + 11, undefined, 0.24);

  console.log('[verify] r22 evidence done');
}
