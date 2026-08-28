// Blender GLB 英雄件取证：五件装配齐 / 三角面数达标（明显优于胶囊人偶的量级）/
// HeadPivot 存在（转头读法可用）/ 湿客返潮前隐藏返潮后到岗 / 首见字幕触发 /
// hero_* 中近景五机位（玩家视角）+ r20_* 近景特写（直控相机 + 临时摄影灯：
// 眼裂/钙化环/指节/领结/无面读法必须在图里可辨——r19 复盘「黑管无五官」的验收位）
export async function run(page, h) {
  await page.click('#title-start');
  await h.sleep(1500);
  await h.tapKey('Space'); // 跳过开场运镜
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

  // 取证纪律（r24/r25 口径）：胶片壳层减半，几何与材质自己成立；HUD 清场
  await page.evaluate(() => {
    const g = window.__game;
    g.engine.setFilmLook(0.5);
    g.hud.el.objToast.style.display = 'none';
  });

  // 1. 装配断言（GLB 解析是异步的——等到齐）
  await page.waitForFunction(() => window.__game?.heroFigures?.ready === 5, { timeout: 30000, polling: 300 });
  const info = await page.evaluate(() => {
    const H = window.__game.heroFigures;
    return H.figures.map((f) => ({
      key: f.def.key, tris: Math.round(f.tris), head: !!f.head, minTris: f.def.minTris ?? 9000,
      statue: !!f.def.statue, enabled: f.enabled, visible: f.root.visible,
      rim: !!f.rim, light: !!f.light,
      pos: [f.root.position.x.toFixed(1), f.root.position.z.toFixed(1)],
    }));
  });
  console.log('[blenderglb]', JSON.stringify(info));
  assert(info.length === 5, '应装配五件英雄件（四人形+神像）');
  for (const f of info) {
    assert(f.tris > f.minTris, `${f.key} 三角面数 ${f.tris} 应 >${f.minTris}（细模门槛，胶囊人偶是两位数）`);
    assert(f.statue || f.head, `${f.key} 应带 HeadPivot`);
    assert(f.rim && f.light, `${f.key} 应带实用键光+轮廓光（r20：黑管根治）`);
  }
  const wet = info.find((f) => f.key === 'wetguest');
  assert(wet && !wet.visible, '湿客在返潮点火前不应可见');

  // r20 断言：英雄件灯必须进灯光预算（旧版快照数组把异步 push 的灯永远关在外面）
  const litCheck = await page.evaluate(() => {
    const g = window.__game;
    const fig = g.heroFigures.figures.find((f) => f.def.key === 'townsman');
    g.player.setPosition(fig.root.position.x + 1.5, fig.root.position.z + 0.5, 0, fig.root.position.y + 0.1);
    return new Promise((res) => setTimeout(() => {
      res({ key: fig.light.visible, rim: fig.rim.visible });
    }, 800));
  });
  console.log('[blenderglb] townsman lights in budget:', JSON.stringify(litCheck));
  assert(litCheck.key && litCheck.rim, '英雄件实用光/轮廓光应被灯光预算点亮（近距离时）');

  // 2. hero_* 中近景（玩家视角取证：站位即玩家可站的位置）
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
    await h.sleep(700); // 灯光预算 0.3s 一拍：等英雄件键光/轮廓光翻亮
    await clearHud();
    await h.shot(name);
  };
  const P = await page.evaluate(() => {
    const H = window.__game.heroFigures;
    const o = {};
    for (const f of H.figures) o[f.def.key] = [f.root.position.x, f.root.position.y, f.root.position.z];
    return o;
  });
  // 正面中近景（对脸取证）+ 玩家自然视角（背影/橱窗外）——r20 收紧构图：
  // 旧 2.0-2.7m + FOV72 里脸只剩 ~50px（「无五官」的机位帮凶），收到 1.5-1.6m
  await look('hero_townsman', P.townsman[0] + 1.4, P.townsman[2] + 0.45, P.townsman[0], P.townsman[2], P.townsman[1] + 0.1);
  await look('hero_townsman_back', P.townsman[0] - 1.9, P.townsman[2] - 0.63, P.townsman[0], P.townsman[2], P.townsman[1] + 0.1);
  await look('hero_emcee', P.emcee[0] + 0.25, P.emcee[2] - 2.0, P.emcee[0], P.emcee[2], P.emcee[1] + 0.1);
  await look('hero_waiter', P.waiter[0] - 1.05, P.waiter[2] - 1.2, P.waiter[0], P.waiter[2], P.waiter[1] + 0.1);
  await look('hero_seagod', P.seagod[0] + 1.75, P.seagod[2] + 1.05, P.seagod[0], P.seagod[2], P.seagod[1] + 0.1, -0.22);

  // 3. r20_* 近景特写：暂停 + 直控相机（FOV 33）+ 临时摄影灯（斜侧暖主光掠出
  //    皮面起伏 + 对侧暖米弱补 + 一档假反弹），拍完即撤——r25 五官验收同法
  const closeup = async (name, key, opts = {}) => {
    await page.evaluate(({ key, opts }) => {
      const g = window.__game;
      const T = g.THREE;
      g.game.state = 'PAUSE';
      const fig = g.heroFigures.figures.find((f) => f.def.key === key);
      // 对焦点：指定网格节点（Head/HandL/Collar/GodHead...）的包围盒中心
      const nodes = (opts.nodes ?? ['Head']).map((n) => fig.root.getObjectByName(n)).filter(Boolean);
      const box = new T.Box3();
      if (nodes.length) {
        for (const n of nodes) box.expandByObject(n);
      } else {
        box.setFromObject(fig.root); // 兜底：整件
      }
      const aim = box.getCenter(new T.Vector3());
      const ry = fig.root.rotation.y;
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
      // 临时摄影灯（首拍 42/14/1.8 把白衣/斗笠/木脸全曝飞——按件配光，默认降档）
      if (window.__shootRig) { for (const l of window.__shootRig) l.parent?.remove(l); }
      const rig = [];
      const keyL = new T.SpotLight(0xffd9a0, opts.keyI ?? 24, 10, 0.7, 0.55);
      keyL.position.set(aim.x + fd.x * 0.9 + side.x * 0.8, aim.y + 0.5, aim.z + fd.z * 0.9 + side.z * 0.8);
      keyL.target.position.copy(aim);
      g.engine.scene.add(keyL, keyL.target);
      rig.push(keyL, keyL.target);
      const fillL = new T.SpotLight(0xdcd2c4, opts.fillI ?? 8, 9, 0.9, 0.7);
      fillL.position.set(aim.x + fd.x * 0.8 - side.x * 1.0, aim.y + 0.25, aim.z + fd.z * 0.8 - side.z * 1.0);
      fillL.target.position.copy(aim);
      g.engine.scene.add(fillL, fillL.target);
      rig.push(fillL, fillL.target);
      const amb = new T.PointLight(0xffe4c8, opts.ambI ?? 1.2, 4, 1.6);
      amb.position.set(aim.x + fd.x * 0.6, aim.y, aim.z + fd.z * 0.6);
      g.engine.scene.add(amb);
      rig.push(amb);
      window.__shootRig = rig;
      g.hud.clearSubtitles();
      g.hud.objTimer = 0;
      g.hud.el.objToast.classList.remove('show');
    }, { key, opts });
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

  // 验收清单：眼裂（face）/ 钙化环（mouth）/ 指节（hands）/ 领子（collar）/ 无面（seagod）
  await closeup('r20_emcee_face', 'emcee', { dist: 0.62 });
  await closeup('r20_emcee_mouth', 'emcee', { dist: 0.42, up: -0.055, fov: 26 });
  await closeup('r20_townsman_face', 'townsman', { dist: 0.62, keyI: 16 });  // 斗笠/棉袄白反光：降键光
  await closeup('r20_townsman_hands', 'townsman', { nodes: ['HandL', 'HandR'], dist: 0.52, rise: 0.16, fov: 30, keyI: 14 });
  await closeup('r20_waiter_face', 'waiter', { dist: 0.62, rise: -0.08, side: 0.45, keyI: 18 });  // 侧移避开背后绿植陈设
  await closeup('r20_waiter_collar', 'waiter', { nodes: ['Collar', 'BowKnot'], dist: 0.55, fov: 30, keyI: 12 });  // 白服务衫易曝
  await closeup('r20_seagod_face', 'seagod', { nodes: ['GodHead'], dist: 0.70, fov: 28, side: 0.3, keyI: 10, fillI: 5 });  // 包浆木脸吃光

  // 4. 守夜人转头读法：站到近处等两拍，头应朝向玩家
  await page.evaluate(({ x, z }) => {
    const g = window.__game;
    g.player.setPosition(x - 2.2, z + 0.5, Math.PI / 2, undefined);
  }, { x: P.townsman[0], z: P.townsman[2] });
  // 低帧率（SwiftShader）下按帧数而不是壁钟等：转头是 rad/s 积分的
  await page.waitForFunction(() => {
    const f = window.__game.heroFigures.figures.find((f) => f.def.key === 'townsman');
    return Math.abs(f.headYaw) > 0.05;
  }, { timeout: 30000, polling: 400 });
  const headYaw = await page.evaluate(
    () => window.__game.heroFigures.figures.find((f) => f.def.key === 'townsman').headYaw);
  console.log('[blenderglb] townsman headYaw =', headYaw.toFixed(3));

  // 5. 首见字幕
  const seen = await page.evaluate(() => ({ ...window.__game.heroFigures.seen }));
  assert(seen.townsman, '守夜人首见字幕应已触发');

  // 6. 返潮点火 → 湿客到岗
  await page.evaluate(() => {
    const g = window.__game;
    g.world.applyLeakState();
    g.story.flags.leaked = true;
  });
  // applyLeakState 一次性显形大量场景件：SwiftShader 下点火后第一帧要编译
  // 着色器+上传几何，固定 800ms 睡眠会踩竞态——改成按条件等（到岗是下一个
  // heroFigures.update tick 的事，等得起）
  await page.waitForFunction(() => {
    const f = window.__game.heroFigures.figures.find((f) => f.def.key === 'wetguest');
    return f.enabled && f.root.visible;
  }, { timeout: 20000, polling: 300 });
  const wet2 = await page.evaluate(() => {
    const f = window.__game.heroFigures.figures.find((f) => f.def.key === 'wetguest');
    return { enabled: f.enabled, visible: f.root.visible };
  });
  assert(wet2.enabled && wet2.visible, '返潮点火后湿客应到岗可见');
  await look('hero_wetguest', P.wetguest[0] - 0.3, P.wetguest[2] - 1.55, P.wetguest[0], P.wetguest[2], P.wetguest[1] + 0.1);
  // 他的脸离床单只有一拳（脸 z≈-25.36，布 z≈-25.0）：0.62m 机位直接穿到布
  // 后面拍成白屏——相机必须塞进脸与布之间（0.26m + FOV58 的贴脸机位，
  // 这个幽闭距离本身就是「数床单的人」的读法）
  await closeup('r20_wetguest_face', 'wetguest', { dist: 0.26, fov: 58, side: 0.1, keyI: 18, fillI: 8 });

  console.log('[blenderglb] ✅ 五件英雄件装配/细模面数/灯光预算/转头/字幕/返潮到岗 全部通过');
}
