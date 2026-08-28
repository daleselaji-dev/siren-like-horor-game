// 轮23 取证：门2（路径A程序化重建——放样西装躯干/贴胸领带驳头白V/前开领折/
//   发际线合一/睑裂收窄）+ 门3（真阳台带/亮窗群/1F店面分色/街景纵深）
// 断言全部测「渲染后场内实例」：
//   身 = 躯干是环放样 BufferGeometry（车削酒瓶废除）、领带叶片沿胸弯垂（z 展幅>6cm）、
//        侍应领折前开（thetaLength<2π）、头身比 6.6-8.2、肩宽成人男
//   楼 = 阳台栏板群顶点>500、墨绿釉面裙带存在、亮窗光温≥4 种、翼塔沿用轮22断言
import fs from 'node:fs';

export async function run(page, h) {
  fs.mkdirSync('verify/r23', { recursive: true });
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
    await h.shot(`r23/${name}`);
  };

  // ---------- 断言①：路径A身体重建（司仪+侍应场内实例） ----------
  const bodyCheck = await page.evaluate(() => {
    const g = window.__game;
    const out = {};
    for (const id of ['emcee', 'waiterBanquet']) {
      const hum = g.byId[id].body;
      // 领带（司仪）：沿胸弯垂 → 几何 z 包围盒展幅必须 > 6cm（直板领带 ~2cm）
      let tieSpanZ = null, foldTheta = null;
      hum.torso.traverse((o) => {
        if (!o.isMesh) return;
        if (o.material?.color?.getHex?.() === 0x6e1414) {
          o.geometry.computeBoundingBox();
          tieSpanZ = o.geometry.boundingBox.max.z - o.geometry.boundingBox.min.z;
        }
        const pp = o.geometry?.parameters;
        if (pp && Math.abs((pp.radiusTop ?? 0) - 0.061) < 1e-4 && Math.abs((pp.radiusBottom ?? 0) - 0.084) < 1e-4) {
          foldTheta = pp.thetaLength;
        }
      });
      out[id] = {
        torsoGeoType: hum.torsoMesh.geometry.type,
        torsoLofted: hum.torsoMesh.geometry.type === 'BufferGeometry'
          && !!hum.torsoMesh.geometry.attributes.color,
        tieSpanZ, foldTheta,
        headRatio: hum.metrics.headRatio,
        shoulderW: hum.metrics.shoulderW,
      };
    }
    return out;
  });
  console.log('[verify] r23 body:', JSON.stringify(bodyCheck, (k, x) => (typeof x === 'number' ? +x.toFixed(4) : x)));
  for (const id of ['emcee', 'waiterBanquet']) {
    const c = bodyCheck[id];
    assert(c.torsoLofted, `${id} torso still lathe bottle: ${c.torsoGeoType}`);
    assert(c.headRatio > 6.4 && c.headRatio < 8.4, `${id} head ratio off: ${c.headRatio}`);
    assert(c.shoulderW > 0.40 && c.shoulderW < 0.50, `${id} shoulder width off: ${c.shoulderW}`);
  }
  assert(bodyCheck.emcee.tieSpanZ > 0.06, 'emcee tie not chest-hugging bent: ' + bodyCheck.emcee.tieSpanZ);
  assert(bodyCheck.waiterBanquet.foldTheta && bodyCheck.waiterBanquet.foldTheta < Math.PI * 1.9,
    'waiter collar fold still full funnel: ' + bodyCheck.waiterBanquet.foldTheta);

  // ---------- 断言②：立面轮23——阳台带/釉面裙带/亮窗光温 ----------
  const fc = await page.evaluate(() => {
    const g = window.__game;
    let balcVerts = 0, glazeVerts = 0;
    const glowMats = new Set();
    g.engine.scene.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      const hex = m?.color?.getHex?.();
      if (hex === 0x8f8a76) balcVerts += o.geometry.attributes.position.count;
      if (hex === 0x2d4a3e) glazeVerts += o.geometry.attributes.position.count;
      if (m?.emissiveIntensity >= 0.45 && [0xffb26a, 0xffc07a, 0x8fb4c8, 0xbfe0c8].includes(m.emissive?.getHex?.())) {
        glowMats.add(m.emissive.getHex());
      }
    });
    return { balcVerts, glazeVerts, glowKinds: glowMats.size };
  });
  console.log('[verify] r23 facade:', JSON.stringify(fc));
  assert(fc.balcVerts >= 500, 'balcony panels missing: ' + fc.balcVerts);
  assert(fc.glazeVerts >= 100, '1F glazed skirt missing: ' + fc.glazeVerts);
  assert(fc.glowKinds >= 4, 'lit window temps < 4: ' + fc.glowKinds);

  // ---------- 门2取证：司仪舞台全身（钉 announce 峰）+ 脸特写 ----------
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
  // —— 脸特写先拍（自然站姿——钉宣布姿后抬掌会挡镜头）：窄 FOV 33 放大脸占比 ——
  await page.evaluate(() => {
    const g = window.__game;
    g.game.state = 'PAUSE';
    const hum = g.byId.emcee.body;
    const V = g.player.pos.constructor;
    const head = hum.headWorldPos(new V());
    for (const hl of g.world.dynamic.hotelLights ?? []) {
      if (hl.pl.position.distanceTo(head) < 13) hl.pl.visible = true;
    }
    const q = hum.torso.getWorldQuaternion(new (g.engine.camera.quaternion.constructor)());
    const fwd = new V(0, 0, 1).applyQuaternion(q).setY(0).normalize();
    const cam = g.engine.camera;
    window.__origFov = cam.fov;
    cam.fov = 33; cam.updateProjectionMatrix();
    // headWorldPos 是颈枢轴——颅心/眼位在其上 ~0.13m，瞄点抬上去
    cam.position.set(head.x + fwd.x * 0.60, head.y + 0.14, head.z + fwd.z * 0.60);
    cam.lookAt(head.x, head.y + 0.11, head.z);
    g.hud.clearSubtitles();
  });
  await frames(3);
  await h.shot('r23/emcee_face_close');
  // —— 钉 announce 峰值，恢复原 FOV，全身舞台构图 ——
  await page.evaluate(() => {
    const g = window.__game;
    const hum = g.byId.emcee.body;
    const PEAK = 2.4 + Math.PI;
    for (let i = 0; i < 5; i++) { hum.phase = PEAK - 3 * 0.8; hum.animate('mc', 3, 0); }
    hum.phase = PEAK - 0.001 * 0.8;
    hum.animate('mc', 0.001, 0);
    const V = g.player.pos.constructor;
    const head = hum.headWorldPos(new V());
    const cx = head.x, cy = head.y - 0.62, cz = head.z;
    const dn = Math.hypot(0.56, 0.68);
    const cam = g.engine.camera;
    cam.fov = window.__origFov; cam.updateProjectionMatrix();
    cam.position.set(cx + (0.56 / dn) * 2.55, cy + 0.12, cz + (0.68 / dn) * 2.55);
    cam.lookAt(cx, cy, cz);
    g.hud.clearSubtitles();
  });
  await frames(4);
  await h.shot('r23/emcee_stage');
  await page.evaluate(() => { window.__game.game.state = 'PLAY'; });

  // ---------- 侍应脸特写：暂停后直写 LOD viewer + 手动 updateLOD（侍应在走动，
  // 等游戏循环触发 _hd 会跟丢）----------
  await page.evaluate(() => {
    const g = window.__game;
    g.game.state = 'PAUSE';
    const hum = g.byId.waiterBanquet.body;
    const V = g.player.pos.constructor;
    const head = hum.headWorldPos(new V());
    const q = hum.torso.getWorldQuaternion(new (g.engine.camera.quaternion.constructor)());
    const fwd = new V(0, 0, 1).applyQuaternion(q).setY(0).normalize();
    const cam = g.engine.camera;
    cam.fov = 33; cam.updateProjectionMatrix();
    cam.position.set(head.x + fwd.x * 0.60, head.y + 0.13, head.z + fwd.z * 0.60);
    cam.lookAt(head.x, head.y + 0.10, head.z);
    hum.constructor.viewer.copy(cam.position);
    hum.updateLOD();
    for (const hl of g.world.dynamic.hotelLights ?? []) {
      if (hl.pl.position.distanceTo(head) < 13) hl.pl.visible = true;
    }
    g.hud.clearSubtitles();
  });
  await page.waitForFunction(() => {
    const hum = window.__game.byId.waiterBanquet.body;
    return hum._hd === true && hum.headHD && hum.headHD.visible;
  }, { timeout: 15000, polling: 100 });
  await frames(3);
  await h.shot('r23/waiter_face_close');
  await page.evaluate(() => {
    const g = window.__game;
    g.engine.camera.fov = window.__origFov ?? 68;
    g.engine.camera.updateProjectionMatrix();
    g.game.state = 'PLAY';
  });

  // ---------- 门3立面取证 ----------
  const HO = await page.evaluate(() => {
    const o = window.__game.world.dynamic.hotelInfo.origin;
    return { x: o.x, y: o.y, z: o.z };
  });
  await look('hotel_wide', HO.x + 5, HO.z + 33, HO.x - 1, HO.z + 11, undefined, 0.10);
  await look('hotel_oblique', HO.x + 14, HO.z + 17.5, HO.x - 2, HO.z + 11, undefined, 0.24);
  // 主街纵深（街灯-民居-酒店三进）：夜里从主街中段南望酒店
  await look('street_vista', -2, -14, HO.x - 1, HO.z + 11, undefined, 0.04);

  console.log('[verify] r23 evidence done');
}
