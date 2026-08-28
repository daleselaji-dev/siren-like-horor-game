// 轮24 取证：门2（去灯泡眼/皮面毛孔/发际过渡/颞侧秃带根治/领内闭合）
//   + 门3（胶片壳层减弱可减半、酒店立面升档、湿地皮+积水镜面）
// 拍摄纪律：全程 engine.setFilmLook(0.5)——取证模式胶片壳层减半，
//   几何与材质自己成立，不许靠颗粒/色差把低模糊过去
// 机位：五角色 0.6m 近景（emcee/waiter/streetRunner/keeper/matron，侧位补光
//   ——「毛孔/皮脂/细皱在侧光下可读」的验收光位）+ emcee_stage 全身
//   + hotel_wide / street_vista 广角
import fs from 'node:fs';

export async function run(page, h) {
  fs.mkdirSync('verify/r24', { recursive: true });
  await page.click('#title-start');
  await h.sleep(1200);
  await h.tapKey('Space');
  await h.sleep(300);
  await page.waitForFunction(() => window.__facesReady === true, { timeout: 300000, polling: 1000 });
  await page.evaluate(() => {
    window.__game.hud.el.objToast.style.display = 'none';
    window.__game.engine.setFilmLook(0.5); // 取证模式：胶片壳层减半
  });

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

  // ---------- 断言①：门3 后期纪律——胶片壳层默认已减弱 + 取证减半生效 ----------
  const post = await page.evaluate(() => {
    const u = window.__game.engine.finalPass.uniforms;
    return { grain: u.uGrain.value, vig: u.uVignette.value, ab: u.uAberration.value };
  });
  console.log('[verify] r24 post:', JSON.stringify(post));
  assert(post.grain <= 0.016, 'film grain not halved in forensic mode: ' + post.grain);
  assert(post.ab <= 0.00024, 'chromatic aberration not halved: ' + post.ab);

  // ---------- 断言②：门2 身体（沿用 r23 口径：放样躯干/贴胸领带/前开领折） ----------
  const bodyCheck = await page.evaluate(() => {
    const g = window.__game;
    const out = {};
    for (const id of ['emcee', 'waiterBanquet']) {
      const hum = g.byId[id].body;
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
      // 轮24·领内闭合：领筒顶口封环必须在（face_a 领内露网根治的实体证据）
      let collarCap = false;
      hum.torso.traverse((o) => { if (o.name === 'collarCap') collarCap = true; });
      out[id] = {
        torsoLofted: hum.torsoMesh.geometry.type === 'BufferGeometry'
          && !!hum.torsoMesh.geometry.attributes.color,
        tieSpanZ, foldTheta, collarCap,
        headRatio: hum.metrics.headRatio,
        shoulderW: hum.metrics.shoulderW,
      };
    }
    return out;
  });
  console.log('[verify] r24 body:', JSON.stringify(bodyCheck, (k, x) => (typeof x === 'number' ? +x.toFixed(4) : x)));
  for (const id of ['emcee', 'waiterBanquet']) {
    const c = bodyCheck[id];
    assert(c.torsoLofted, `${id} torso not lofted`);
    assert(c.collarCap, `${id} collar cap ring missing (领内露网)`);
    assert(c.headRatio > 6.4 && c.headRatio < 8.4, `${id} head ratio off: ${c.headRatio}`);
    assert(c.shoulderW > 0.40 && c.shoulderW < 0.50, `${id} shoulder width off: ${c.shoulderW}`);
  }
  assert(bodyCheck.emcee.tieSpanZ > 0.06, 'emcee tie not chest-bent: ' + bodyCheck.emcee.tieSpanZ);
  assert(bodyCheck.waiterBanquet.foldTheta && bodyCheck.waiterBanquet.foldTheta < Math.PI * 1.9,
    'waiter collar fold full funnel: ' + bodyCheck.waiterBanquet.foldTheta);

  // ---------- 断言③：门3 环境（积水镜面/入口体积光/湿地皮/立面轮23口径） ----------
  const env = await page.evaluate(() => {
    const g = window.__game;
    const d = g.world.dynamic;
    let balcVerts = 0, glazeVerts = 0, coneCount = 0;
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
      if (m?.blending === 2 /* Additive */ && o.geometry?.parameters?.openEnded === true
        && m.transparent && m.depthWrite === false) coneCount++;
    });
    // 地形湿反：terrain 材质粗糙度/环反射（轮24 湿地皮口径）
    let terrainWet = null;
    g.engine.scene.traverse((o) => {
      if (terrainWet === null && o.isMesh && o.geometry?.type === 'PlaneGeometry'
        && o.material?.roughness !== undefined && o.material.envMapIntensity >= 1.5
        && o.material.roughness <= 0.65) terrainWet = { r: o.material.roughness, e: o.material.envMapIntensity };
    });
    return {
      puddles: (d.plazaPuddles ?? []).length,
      balcVerts, glazeVerts, glowKinds: glowMats.size, coneCount, terrainWet,
    };
  });
  console.log('[verify] r24 env:', JSON.stringify(env));
  assert(env.puddles >= 12, 'plaza puddles missing: ' + env.puddles);
  assert(env.balcVerts >= 500, 'balcony panels missing: ' + env.balcVerts);
  assert(env.glazeVerts >= 100, '1F glazed skirt missing: ' + env.glazeVerts);
  assert(env.glowKinds >= 4, 'lit window temps < 4: ' + env.glowKinds);
  assert(env.coneCount >= 5, 'entrance light cones missing: ' + env.coneCount);

  // ---------- 门2取证：五角色 0.6m 脸近景（侧位补光——毛孔验收光位） ----------
  // 近景统一走「暂停 + 直写相机 + 手动 LOD + 临时侧位补光」：
  //   补光 = 主光在脸斜侧 35°（掠射出毛孔/皮脂）+ 对侧弱冷补（暗部不死黑），拍完即撤
  const closeup = async (id, name) => {
    await page.evaluate((cid) => {
      const g = window.__game;
      g.game.state = 'PAUSE';
      const e = g.byId[cid];
      // 剧情未启用的角色（matron 3F）临时点亮，拍完还原
      window.__wasEnabled = e.enabled;
      if (!e.enabled) e.setEnabled(true);
      const hum = e.body;
      // 钉直立闲姿——低头劳作/走步中摆的角色（keeper 拜祭俯身）不许用工作姿拍脸；
      // 姿态是指数平滑的，大步长反复喂几帧才收敛到直立（r23 钉 announce 同法）
      for (let i = 0; i < 6; i++) { hum.phase = 0.3; hum.animate('idle', 3, 0); }
      hum.phase = 0.3;
      hum.animate('idle', 0.001, 0);
      // 眼球归零看镜头——扫视/近距追踪相位冻在侧视=「翻白眼」；
      // 0.6m 人像的验收标准是与镜头对视
      hum.sacY = 0; hum.sacP = 0; hum.gzY = 0; hum.gzP = 0; hum.gazeOn = 0;
      hum.eyeGL.rotation.set(0, 0, 0);
      hum.eyeGR.rotation.set(0, 0, 0);
      // 眨眼保险钉：暂停瞬间若冻在半眨（左右错拍——单眼睑翻下），钉回睁眼位
      hum.blinkPh = -1; hum.blinkT = 9;
      hum.lidL.rotation.x = hum.lidBaseL;
      hum.lidR.rotation.x = hum.lidBaseR;
      hum.lidLoL.rotation.x = hum.lidLoBase;
      hum.lidLoR.rotation.x = hum.lidLoBase;
      hum.eyeL.scale.y = hum.eyeSclY;
      hum.eyeR.scale.y = hum.eyeSclY;
      // 手持话筒（emcee）暂时收起——话筒线正好横穿脸颊
      window.__micWasVisible = null;
      if (hum.micG) { window.__micWasVisible = hum.micG.visible; hum.micG.visible = false; }
      // 朝向：巡逻者转向「下一个航点」——航点间连线必然是可走的开敞走廊，
      // 相机放在这条线上不会怼进墙里（matron 3F 走廊 0.6m 拍成壁纸的根治）
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
      // 轮24八稿：机位沿「头部世界朝向・含俯仰」取位——idle 姿态头上仰 ~8°+
      // 相机下俯 3° 叠成 11° 垂直离轴（旧机位把 fwd.y 拍平），0.6m 下从眼球
      // 下缘掠视；改为双眼中点 + 头部真 3D 前向 0.6m，与镜头对视零离轴
      const hq = new g.THREE.Quaternion();
      hum.head.getWorldQuaternion(hq);
      const fwd3 = new V(0, 0, 1).applyQuaternion(hq).normalize();
      const fwd = new V(fwd3.x, 0, fwd3.z).normalize(); // 拍平版给灯位/侧向用
      const side = new V(fwd.z, 0, -fwd.x);
      const eyeMid = new V();
      {
        const eL = new V(), eR = new V();
        hum.eyeGL.getWorldPosition(eL);
        hum.eyeGR.getWorldPosition(eR);
        eyeMid.set((eL.x + eR.x) / 2, (eL.y + eR.y) / 2, (eL.z + eR.z) / 2);
      }
      const cam = g.engine.camera;
      window.__origFov = window.__origFov ?? cam.fov;
      cam.fov = 33; cam.updateProjectionMatrix();
      cam.position.set(eyeMid.x + fwd3.x * 0.60, eyeMid.y + fwd3.y * 0.60, eyeMid.z + fwd3.z * 0.60);
      cam.lookAt(eyeMid.x, eyeMid.y - 0.025, eyeMid.z);
      hum.constructor.viewer.copy(cam.position);
      hum.updateLOD();
      // 临时摄影灯（拍完撤）：斜侧 35° 暖主光（掠射出毛孔）+ 对侧冷弱补（暗部不死黑）
      let SpotC = null;
      g.engine.scene.traverse((o) => { if (!SpotC && o.isSpotLight) SpotC = o.constructor; });
      if (window.__shootRig) { for (const l of window.__shootRig) l.parent?.remove(l); }
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
      for (const hl of g.world.dynamic.hotelLights ?? []) {
        if (hl.pl.position.distanceTo(head) < 13) hl.pl.visible = true;
      }
      g.hud.clearSubtitles();
      g.hud.objTimer = 0;
      g.hud.el.objToast.classList.remove('show');
    }, id);
    await page.waitForFunction((cid) => {
      const hum = window.__game.byId[cid].body;
      return hum._hd === true && hum.headHD && hum.headHD.visible;
    }, { timeout: 15000, polling: 100 }, id);
    await frames(3);
    await h.shot(`r24/${name}`);
    await page.evaluate((cid) => {
      const g = window.__game;
      if (window.__shootRig) { for (const l of window.__shootRig) l.parent?.remove(l); window.__shootRig = null; }
      if (window.__wasEnabled === false) g.byId[cid].setEnabled(false);
      const hum = g.byId[cid].body;
      if (hum.micG && window.__micWasVisible !== null) hum.micG.visible = window.__micWasVisible;
      g.engine.camera.fov = window.__origFov; g.engine.camera.updateProjectionMatrix();
      g.game.state = 'PLAY';
    }, id);
    await frames(1);
  };

  await closeup('emcee', 'emcee_face_close');
  await closeup('waiterBanquet', 'waiter_face_close');
  await closeup('streetRunner', 'runner_face_close');
  await closeup('keeper', 'keeper_face_close');
  await closeup('matron', 'matron_face_close');

  // ---------- emcee 舞台全身（钉 announce 峰值） ----------
  await page.evaluate(() => {
    const g = window.__game;
    g.game.state = 'PAUSE';
    const hum = g.byId.emcee.body;
    const PEAK = 2.4 + Math.PI;
    for (let i = 0; i < 5; i++) { hum.phase = PEAK - 3 * 0.8; hum.animate('mc', 3, 0); }
    hum.phase = PEAK - 0.001 * 0.8;
    hum.animate('mc', 0.001, 0);
    const V = g.player.pos.constructor;
    const head = hum.headWorldPos(new V());
    for (const hl of g.world.dynamic.hotelLights ?? []) {
      if (hl.pl.position.distanceTo(head) < 13) hl.pl.visible = true;
    }
    // 轮24：中景收紧——FOV 48 + 2.3m（旧 68/2.55 全身缩成远处小人=「lo-fi 舞台感」帮凶）；
    // 机位再往他右前方偏（0.9,0.45）——announce 峰值抬掌+话筒杆正前挡脸
    const cx = head.x, cy = head.y - 0.62, cz = head.z;
    const dn = Math.hypot(0.9, 0.45);
    const cam = g.engine.camera;
    cam.fov = 48; cam.updateProjectionMatrix();
    cam.position.set(cx + (0.9 / dn) * 2.3, cy + 0.2, cz + (0.45 / dn) * 2.3);
    cam.lookAt(cx, cy + 0.06, cz);
    // 轮24五稿：中景也钉 HD 头模——2.3m 恰在 2.1m 换模线外，低模头在聚光下
    // 渲成一块过曝白板（「lo-fi 舞台感」的脸部来源）；viewer 钉到头位强制换模
    hum.constructor.viewer.copy(head);
    hum.updateLOD();
    g.hud.clearSubtitles();
  });
  await page.waitForFunction(() => {
    const hum = window.__game.byId.emcee.body;
    return hum._hd === true && hum.headHD && hum.headHD.visible;
  }, { timeout: 15000, polling: 100 }).catch(() => {});
  await frames(4);
  await h.shot('r24/emcee_stage');
  await page.evaluate(() => {
    const g = window.__game;
    g.engine.camera.fov = window.__origFov ?? 68;
    g.engine.camera.updateProjectionMatrix();
    g.game.state = 'PLAY';
  });

  // ---------- 门3取证：hotel_wide / street_vista（与 r23 同机位可直接对比） ----------
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
    await h.shot(`r24/${name}`);
  };
  const HO = await page.evaluate(() => {
    const o = window.__game.world.dynamic.hotelInfo.origin;
    return { x: o.x, y: o.y, z: o.z };
  });
  await look('hotel_wide', HO.x + 5, HO.z + 33, HO.x - 1, HO.z + 11, 0.10);
  await look('hotel_oblique', HO.x + 14, HO.z + 17.5, HO.x - 2, HO.z + 11, 0.24);
  await look('street_vista', -2, -14, HO.x - 1, HO.z + 11, 0.04);

  console.log('[verify] r24 evidence done');
}
