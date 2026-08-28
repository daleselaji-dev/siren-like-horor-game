// P0 工位 GLB 取证（r21）：报数员(emcee_stage)/三名侍应(waiter)/理册婆(matron)
// 的 gameplay 身体必须是 Blender bpy 细模（StationBody），不是程序化 Humanoid——
//   ① 装配断言：五具身体 loaded / 三角面数过细模门槛 / 六关节 pivot 齐 /
//      道具在场（麦头/托盘/第三眼矿盘）/ 「舞台禁止胶囊 Humanoid」（headMesh 不存在）
//   ② 行为断言：步态 pivot 真的在摆（LegPivot 四元数随 animate 变化）/
//      眼点冷光警戒才亮 / 视奸 viewYawPitch 口径可用
//   ③ 近景取证：verify/station/r21_*（舞台/宴会厅/3F 走廊 + 麦缝/托盘/第三眼特写）
//      并复制三张进 verify/keep/station/
import fs from 'node:fs';

export async function run(page, h) {
  fs.mkdirSync('verify/station', { recursive: true });
  fs.mkdirSync('verify/keep/station', { recursive: true });
  // r21_* 与 keep/ 是入库取证（FULLSPEC 灯档标定）——十步链的常规跑
  // 只落 chk_*（gitignore），防低配画质覆写交付图
  const FULL = process.env.FULLSPEC === '1';
  const tag = FULL ? 'station/r21_' : 'station/chk_';

  await page.click('#title-start');
  await h.sleep(1500);
  await h.tapKey('Space');
  await h.sleep(400);

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

  await page.evaluate(() => {
    const g = window.__game;
    g.engine.setFilmLook(0.5);
    g.hud.el.objToast.style.display = 'none';
  });

  // ---------- 1. 装配断言：五具工位身体全部是 GLB 细模 ----------
  const IDS = ['emcee', 'waiterBanquet', 'waiterLobby', 'waiterEast', 'matron'];
  await page.waitForFunction((ids) => {
    const g = window.__game;
    return ids.every((id) => g.byId[id]?.body?.loaded === true);
  }, { timeout: 30000, polling: 300 }, IDS);

  const info = await page.evaluate((ids) => {
    const g = window.__game;
    return ids.map((id) => {
      const b = g.byId[id].body;
      const pv = b.pv ?? {};
      return {
        id, kind: b.kind, tris: Math.round(b.tris ?? 0),
        pivots: ['torso', 'head', 'armL', 'armR', 'legL', 'legR'].filter((k) => !!pv[k]).length,
        eyeDots: (b.eyeDots ?? []).length,
        isHumanoid: !!b.headMesh, // 程序化 Humanoid 的特征件——工位上不允许出现
        prop: {
          emcee: !!b.model?.getObjectByName('MicHead'),
          waiter: !!b.model?.getObjectByName('TrayDisc'),
          matron: !!b.model?.getObjectByName('ThirdEye'),
        }[b.kind] ?? false,
      };
    });
  }, IDS);
  console.log('[station]', JSON.stringify(info));
  for (const f of info) {
    assert(f.tris > 9000, `${f.id} 三角面数 ${f.tris} 应 >9000（bpy 细模门槛）`);
    assert(f.pivots === 6, `${f.id} 应带全部六个关节 pivot（实得 ${f.pivots}）`);
    assert(f.eyeDots === 2, `${f.id} 应带双眼点冷光`);
    assert(!f.isHumanoid, `${f.id} 工位禁止胶囊 Humanoid（审计项①）`);
    assert(f.prop, `${f.id} 道具缺失（麦头/托盘/第三眼矿盘）`);
  }

  // ---------- 2. 行为断言 ----------
  // 步态：手动步进 walk，LegPivotL 必须真的在摆
  const gait = await page.evaluate(() => {
    const g = window.__game;
    const b = g.byId.waiterBanquet.body;
    const xs = [];
    for (let i = 0; i < 30; i++) {
      b.animate('walk', 1 / 20, 1);
      xs.push(b.pv.legL.quaternion.x);
    }
    const span = Math.max(...xs) - Math.min(...xs);
    // 托盘臂锁定：walk 全程 ArmPivotL 几乎不动（端盘水平）
    const trayQ0 = b.pv.armL.quaternion.x;
    for (let i = 0; i < 20; i++) b.animate('walk', 1 / 20, 1);
    const traySpan = Math.abs(b.pv.armL.quaternion.x - trayQ0);
    b.animate('idle', 3, 0); // 复位趋近
    return { span, traySpan };
  });
  console.log('[station] gait:', JSON.stringify(gait));
  assert(gait.span > 0.05, 'waiter LegPivot 应随 walk 摆动（span=' + gait.span.toFixed(3) + ')');
  assert(gait.traySpan < 0.02, '托盘臂应在 walk 中锁定（span=' + gait.traySpan.toFixed(3) + ')');

  // 眼点冷光：常态熄灭，警戒点亮
  const eye = await page.evaluate(() => {
    const g = window.__game;
    const b = g.byId.matron.body;
    b.setEyeIntensity(0.7);
    const idle = b.eyeDots.map((d) => d.visible);
    b.setEyeIntensity(3.2);
    const alert = b.eyeDots.map((d) => d.material.opacity);
    b.setEyeIntensity(0.7);
    return { idleVisible: idle.some(Boolean), alertOpacity: Math.min(...alert) };
  });
  console.log('[station] eye:', JSON.stringify(eye));
  assert(!eye.idleVisible, '常态眼点应熄灭（潮光只归警戒态）');
  assert(eye.alertOpacity > 0.5, '警戒眼点应点亮（opacity=' + eye.alertOpacity + ')');

  // 视奸口径：viewPos 取头位、viewYawPitch 可读（StationBody 代理 neck/torso）
  const vj = await page.evaluate(() => {
    const g = window.__game;
    const e = g.byId.emcee;
    const T = g.THREE;
    const v = e.viewPos(new T.Vector3());
    const yp = e.viewYawPitch();
    return { headY: v.y - e.pos.y, yaw: yp.yaw, pitch: yp.pitch };
  });
  console.log('[station] sightjack:', JSON.stringify(vj));
  assert(vj.headY > 1.2 && vj.headY < 1.9, '报数员视奸挂点应在头位（Δy=' + vj.headY.toFixed(2) + ')');
  assert(Number.isFinite(vj.pitch), 'viewYawPitch 应可读');

  // ---------- 3. 近景取证 ----------
  const clearHud = () => page.evaluate(() => {
    const g = window.__game;
    g.hud.clearSubtitles();
    g.hud.objTimer = 0;
    g.hud.el.objToast.classList.remove('show');
  });
  const look = async (name, px, pz, tx, tz, yHint, pitch = 0.02) => {
    await page.evaluate(({ px, pz, tx, tz, yHint, pitch }) => {
      const g = window.__game;
      const yaw = Math.atan2(-(tx - px), -(tz - pz));
      g.player.setPosition(px, pz, yaw, yHint);
      g.player.pitch = pitch;
      g.player.syncCamera(0);
    }, { px, pz, tx, tz, yHint, pitch });
    await h.sleep(700); // 灯光预算 0.3s 一拍：等工位键光翻亮
    await frames(3);
    await clearHud();
    await h.shot(name);
  };

  // 舞台报数员（宴会厅）：GLB 细模站台 + 持麦
  await look(tag + 'emcee_stage', -14.9, -63.0, -16.5, -64.6, 3.5);

  // 宴会厅侍应：挪到入口空地正拍（同 looks 机位纪律，拍完归位）
  const wp = await page.evaluate(() => {
    const w = window.__game.byId.waiterBanquet;
    const orig = { x: w.pos.x, z: w.pos.z, yaw: w.yaw };
    w.pos.set(-13.6, w.pos.y, -47.4);
    w.yaw = Math.atan2(-12.2 - -13.6, -46.2 - -47.4);
    w.state = 'PAUSE'; w.stateTimer = -9;
    return orig;
  });
  await h.sleep(400);
  await look(tag + 'waiter_banquet', -12.2, -46.2, -13.6, -47.4, 3.5);
  await page.evaluate((orig) => {
    const w = window.__game.byId.waiterBanquet;
    w.pos.set(orig.x, w.pos.y, orig.z);
    w.yaw = orig.yaw; w.stateTimer = 0;
  }, wp);

  // 理册婆（3F 走廊近景）
  await page.evaluate(() => {
    const g = window.__game;
    const m = g.byId.matron;
    m.setEnabled(true);
    m.pos.set(-8, 0, -55.5);
    m.pos.y = g.world.heightAt(-8, -55.5, 10.3);
    m.yaw = Math.PI / 2;
    m.state = 'PAUSE'; m.stateTimer = -9;
  });
  await h.sleep(400);
  await look(tag + 'matron_close', -6.2, -55.5, -8, -55.5, 10.3);

  // ---------- 4. 特写（暂停 + 直控相机 + 临时摄影灯，拍完即撤）----------
  const closeup = async (name, id, opts = {}) => {
    await page.evaluate(({ id, opts }) => {
      const g = window.__game;
      const T = g.THREE;
      g.game.state = 'PAUSE';
      const e = g.byId[id];
      const aim = e.body.headWorldPos(new T.Vector3());
      const ry = e.yaw;
      const fd = new T.Vector3(Math.sin(ry), 0, Math.cos(ry));
      const side = new T.Vector3(fd.z, 0, -fd.x);
      aim.addScaledVector(fd, opts.fwd ?? 0.04);
      aim.y += opts.up ?? 0;
      const dist = opts.dist ?? 0.62;
      const cam = g.engine.camera;
      window.__origFov = window.__origFov ?? cam.fov;
      cam.fov = opts.fov ?? 33;
      cam.updateProjectionMatrix();
      cam.position.set(
        aim.x + fd.x * dist + side.x * (opts.side ?? 0.18) * dist,
        aim.y + (opts.rise ?? 0.02),
        aim.z + fd.z * dist + side.z * (opts.side ?? 0.18) * dist,
      );
      cam.lookAt(aim);
      if (window.__shootRig) { for (const l of window.__shootRig) l.parent?.remove(l); }
      const rig = [];
      const keyL = new T.SpotLight(0xffd9a0, opts.keyI ?? 20, 10, 0.7, 0.55);
      keyL.position.set(aim.x + fd.x * 0.9 + side.x * 0.8, aim.y + 0.5, aim.z + fd.z * 0.9 + side.z * 0.8);
      keyL.target.position.copy(aim);
      g.engine.scene.add(keyL, keyL.target);
      rig.push(keyL, keyL.target);
      const fillL = new T.SpotLight(0xdcd2c4, opts.fillI ?? 7, 9, 0.9, 0.7);
      fillL.position.set(aim.x + fd.x * 0.8 - side.x * 1.0, aim.y + 0.25, aim.z + fd.z * 0.8 - side.z * 1.0);
      fillL.target.position.copy(aim);
      g.engine.scene.add(fillL, fillL.target);
      rig.push(fillL, fillL.target);
      const amb = new T.PointLight(0xffe4c8, opts.ambI ?? 1.1, 4, 1.6);
      amb.position.set(aim.x + fd.x * 0.6, aim.y, aim.z + fd.z * 0.6);
      g.engine.scene.add(amb);
      rig.push(amb);
      window.__shootRig = rig;
      g.hud.clearSubtitles();
      g.hud.objTimer = 0;
      g.hud.el.objToast.classList.remove('show');
    }, { id, opts });
    await frames(3);
    await h.shot(name);
    await page.evaluate(() => {
      const g = window.__game;
      if (window.__shootRig) { for (const l of window.__shootRig) l.parent?.remove(l); window.__shootRig = null; }
      g.engine.camera.fov = window.__origFov;
      g.engine.camera.updateProjectionMatrix();
      g.game.state = 'PLAY';
    });
    await frames(1);
  };

  // 麦头贴钙化口缝 / 侍应垂头领结 / 第三眼矿盘（2m 内读法）
  // 灯档按 FULLSPEC 胶片辉光标定：白中山装/浅肤近摄逢 keyI>10 直接曝飞
  await closeup(tag + 'emcee_mic', 'emcee', { dist: 0.5, up: -0.05, fov: 30, keyI: 7, fillI: 3, ambI: 0.35 });
  await closeup(tag + 'waiter_face', 'waiterBanquet', { dist: 0.55, up: 0.02, rise: 0.04, keyI: 4, fillI: 1.5, ambI: 0.2 });
  await closeup(tag + 'matron_thirdeye', 'matron', { dist: 0.45, up: 0.05, fov: 28, keyI: 6, fillI: 2.5, ambI: 0.3 });
  await page.evaluate(() => window.__game.byId.matron.setEnabled(false));

  // ---------- 5. keep 交付图（审计指定路径；仅 FULLSPEC 覆写） ----------
  if (FULL) {
    fs.copyFileSync('verify/station/r21_emcee_stage.png', 'verify/keep/station/emcee_stage.png');
    fs.copyFileSync('verify/station/r21_waiter_banquet.png', 'verify/keep/station/waiter_banquet.png');
    fs.copyFileSync('verify/station/r21_matron_close.png', 'verify/keep/station/matron_close.png');
  }

  console.log('[station] ✅ 工位 GLB 细模装配/步态/眼点/视奸/取证 全部通过');
}
