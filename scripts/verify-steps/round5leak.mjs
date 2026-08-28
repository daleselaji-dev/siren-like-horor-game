// 轮5取证：世界状态切换——薄雾镇 → 返潮异化态
// 验证点：①切换真实改地图（主街被沉积脊封死=碰撞可测）②改敌人（镇民收走/湿客上街）
// ③改路线（床单巷可绕行）④工具不对称（湿客不认贝灰界、镁光打折）⑤超现实道具入镜
export async function run(page, h) {
  await page.click('#title-start');
  await h.sleep(1500);
  await h.tapKey('Space');
  await h.sleep(400);

  const look = async (name, px, pz, tx, tz, yHint, pitch = 0) => {
    await page.evaluate(({ px, pz, tx, tz, yHint, pitch }) => {
      const g = window.__game;
      const yaw = Math.atan2(-(tx - px), -(tz - pz));
      g.player.setPosition(px, pz, yaw, yHint);
      g.player.pitch = pitch;
      g.player.syncCamera(0);
    }, { px, pz, tx, tz, yHint, pitch });
    await h.sleep(600);
    await h.shot(name);
  };
  const assert = (ok, msg) => { if (!ok) throw new Error('ASSERT: ' + msg); };

  // 确定性步行：直接驱动真实 Player.update（真实 slideMove、真实碰撞体）
  const walkSouth = (x, z, steps) => page.evaluate(({ x, z, steps }) => {
    const g = window.__game;
    g.player.setPosition(x, z, 0); // yaw=0 → forward=(0,-1) 朝酒店方向(-z)
    g.player.frozen = false;
    g.player.input.keys.add('KeyW');
    for (let i = 0; i < steps; i++) g.player.update(0.12);
    g.player.input.keys.delete('KeyW');
    return { x: g.player.pos.x.toFixed(1), z: g.player.pos.z.toFixed(1) };
  }, { x, z, steps });

  // ---------- 1. 切换前：主街可走、镇上有人、湿客不存在 ----------
  const pre = await page.evaluate(() => {
    const g = window.__game;
    const L = g.world.dynamic.leakState;
    return {
      hasLeakState: !!L,
      groupVisible: L?.group.visible,
      collidersOff: L ? L.colliders.every((c) => c.off) : false,
      screens: (g.world.dynamic.staticScreens ?? []).length,
      townFolk: ['runner1', 'runner2', 'streetRunner', 'dikePatrol', 'templeGuard'].map((id) => g.byId[id]?.enabled),
      wet: ['wetcomer1', 'wetcomer2', 'wetcomer3', 'wetcomer4', 'wetcomer5'].map((id) => g.byId[id]?.enabled),
      dog: g.dog?.enabled,
      // 双态材质：常态的沥青粗糙度必须还是干的（1.0）
      asphaltRough: g.M.asphalt.roughness,
      hasTide: !!L?.tide,
      fishCount: L?.tide?.fish.count,
    };
  });
  console.log('[verify] pre-leak:', JSON.stringify(pre));
  assert(pre.hasLeakState, 'leakState missing');
  assert(pre.groupVisible === false, 'leak group visible too early');
  assert(pre.collidersOff, 'leak colliders active too early');
  assert(pre.asphaltRough === 1, 'asphalt should be dry (rough=1) before leak, got ' + pre.asphaltRough);
  assert(pre.hasTide, 'phantom tide not built');
  assert(pre.fishCount >= 20, 'fish school too small: ' + pre.fishCount);
  assert(pre.townFolk.every(Boolean), 'townfolk should be on before leak');
  assert(pre.wet.every((v) => v === false), 'wetcomers should be off before leak');
  const preWalk = await walkSouth(-2, -20, 90); // 主街脊位(z=-26)向南穿行
  console.log('[verify] pre-leak walk through main street:', JSON.stringify(preWalk));
  assert(parseFloat(preWalk.z) < -30, 'main street should be passable before leak, got z=' + preWalk.z);
  await look('r5-01-street-before', -2, -16, -3, -30, undefined, -0.06);

  // ---------- 2. 点火：验户 = 返潮（走议程正路 applyStage） ----------
  await page.evaluate(() => window.__game.agenda.advanceTo(3));
  await h.sleep(800);
  const post = await page.evaluate(() => {
    const g = window.__game;
    const L = g.world.dynamic.leakState;
    return {
      leaked: g.story.flags.leaked,
      groupVisible: L.group.visible,
      collidersOn: L.colliders.every((c) => !c.off),
      screens: (g.world.dynamic.staticScreens ?? []).length,
      light: L.light.intensity,
      townFolk: ['runner1', 'runner2', 'streetRunner', 'dikePatrol', 'templeGuard', 'booth'].map((id) => g.byId[id]?.enabled),
      keeper: g.byId.keeper?.enabled,
      wet: ['wetcomer1', 'wetcomer2', 'wetcomer3', 'wetcomer4', 'wetcomer5'].map((id) => g.byId[id]?.enabled),
      dog: g.dog?.enabled,
      // 双态材质：整镇泡透（沥青粗糙度减半、反射上调、色沉）
      asphaltRough: g.M.asphalt.roughness,
      asphaltEnv: g.M.asphalt.envMapIntensity,
      wetMats: L.wetMats?.length ?? 0,
    };
  });
  console.log('[verify] post-leak:', JSON.stringify(post));
  assert(post.leaked, 'leak flag not set');
  assert(post.groupVisible, 'leak group not shown');
  assert(post.collidersOn, 'leak colliders not enabled');
  assert(post.screens > pre.screens, 'CRT cairn screens not registered');
  assert(post.townFolk.every((v) => v === false), 'townfolk not withdrawn: ' + JSON.stringify(post.townFolk));
  assert(post.keeper === true, 'keeper should stay (his rite is unfinished)');
  assert(post.wet.every(Boolean), 'wetcomers not deployed (incl. round12 wet4/wet5)');
  assert(post.dog === false, 'dog should be gone after leak');
  assert(post.asphaltRough < 0.7, 'asphalt not soaked after leak: ' + post.asphaltRough);
  assert(post.asphaltEnv > 2, 'asphalt reflectivity not raised: ' + post.asphaltEnv);
  assert(post.wetMats >= 8, 'dual-state material originals not recorded: ' + post.wetMats);

  // ---------- 2b. 幻潮面活性：光网在流、鱼影在游（连续两拍矩阵必须变化） ----------
  const tideAlive = await page.evaluate(() => {
    const g = window.__game;
    const td = g.world.dynamic.leakState.tide;
    g.world.updateFx(500);
    const a1 = td.fish.instanceMatrix.array.slice(0, 16).join(',');
    const off1 = td.mats[0].map.offset.x;
    g.world.updateFx(510);
    const a2 = td.fish.instanceMatrix.array.slice(0, 16).join(',');
    const off2 = td.mats[0].map.offset.x;
    // 大鱼在潮面下 1.7m、体长 13m
    const giantOk = td.giant.len > 10 && td.giant.y < td.y;
    return { fishMoved: a1 !== a2, scrolled: off1 !== off2, giantOk };
  });
  console.log('[verify] phantom tide:', JSON.stringify(tideAlive));
  assert(tideAlive.fishMoved, 'fish shadows frozen');
  assert(tideAlive.scrolled, 'tide caustics not scrolling');
  assert(tideAlive.giantOk, 'giant shadow misconfigured');

  // ---------- 3. 路线变化：主街封死，床单巷可绕 ----------
  const blockedWalk = await walkSouth(-2, -20, 90);
  console.log('[verify] post-leak walk against ridge:', JSON.stringify(blockedWalk));
  assert(parseFloat(blockedWalk.z) > -25.5, 'ridge did not block main street, got z=' + blockedWalk.z);
  const detourWalk = await walkSouth(18.6, -17, 130); // 床单巷（挡视线不挡人）
  console.log('[verify] post-leak sheet-alley detour:', JSON.stringify(detourWalk));
  assert(parseFloat(detourWalk.z) < -31, 'sheet alley detour blocked, got z=' + detourWalk.z);
  // 床单巷至少一幅床单在挡视线（对巡逻敌人生效的遮挡体）
  const sheetSight = await page.evaluate(() => {
    const g = window.__game;
    // 取两点夹一幅床单（z=-25 线的西幅中心附近）
    const cols = g.world.colliders.filter((c) => c.noCollide && !c.off && c.minZ > -26 && c.maxZ < -24);
    return { sheetColliders: cols.length };
  });
  console.log('[verify] sheet sight-blockers on z=-25 line:', JSON.stringify(sheetSight));
  assert(sheetSight.sheetColliders >= 2, 'sheet sight blockers missing');

  // ---------- 4. 湿客巡线活性：真实 update 步进，确认不被卡死 ----------
  const patrolRes = await page.evaluate(() => {
    const g = window.__game;
    const e = g.byId.wetcomer1;
    // 玩家挪远，避免干扰
    g.player.setPosition(60, 2, 0);
    const ctx = {
      player: g.player, dt: 0.25, audio: null, envSightFactor: 1,
      noiseEvents: [], onCaught: () => {}, onAlerted: () => {},
    };
    const start = { x: e.pos.x, z: e.pos.z, wp: e.wpIndex };
    let moved = 0, prevX = e.pos.x, prevZ = e.pos.z;
    let wpAdvances = 0, lastWp = e.wpIndex;
    for (let i = 0; i < 320; i++) {
      e.update(ctx);
      moved += Math.hypot(e.pos.x - prevX, e.pos.z - prevZ);
      prevX = e.pos.x; prevZ = e.pos.z;
      if (e.wpIndex !== lastWp) { wpAdvances++; lastWp = e.wpIndex; }
    }
    return { start, moved: moved.toFixed(1), wpAdvances, state: e.state };
  });
  console.log('[verify] wetcomer1 patrol:', JSON.stringify(patrolRes));
  assert(parseFloat(patrolRes.moved) > 20, 'wetcomer1 barely moved: ' + patrolRes.moved);
  assert(patrolRes.wpAdvances >= 3, 'wetcomer1 stuck on waypoint');

  // ---------- 5. 工具不对称：湿客不认贝灰界、镁光打折 ----------
  const asym = await page.evaluate(() => {
    const g = window.__game;
    const e = g.byId.wetcomer1;
    // 界测试：在湿客正前方 1m 铺一条虚拟界（直接注入 dynamic.limeLines 几何）
    g.world.dynamic.limeLines = g.world.dynamic.limeLines ?? [];
    const tx = e.pos.x, tz = e.pos.z - 3;
    g.world.dynamic.limeLines.push({
      x1: e.pos.x - 2, z1: e.pos.z - 1, x2: e.pos.x + 2, z2: e.pos.z - 1, y: e.pos.y, ttl: 60,
    });
    const wetLime = e.limeAhead(tx, tz);           // 湿客：应为 null（不认界）
    const waiter = g.byId.waiterLobby;
    const keepX = waiter.pos.x, keepZ = waiter.pos.z, keepY = waiter.pos.y;
    waiter.pos.set(e.pos.x, e.pos.y, e.pos.z);     // 同位对照：侍应认界
    const waiterLime = waiter.limeAhead(tx, tz);
    waiter.pos.set(keepX, keepY, keepZ);
    g.world.dynamic.limeLines.pop();
    // 镁光测试：flashK=0.55
    e.flashStun(4);
    const wetStun = e.stunT;
    return { wetLime: !!wetLime, waiterLime: !!waiterLime, wetStun: wetStun.toFixed(2) };
  });
  console.log('[verify] tool asymmetry:', JSON.stringify(asym));
  assert(!asym.wetLime, 'wetcomer should ignore lime line');
  assert(asym.waiterLime, 'waiter should respect lime line (control group)');
  assert(Math.abs(parseFloat(asym.wetStun) - 2.2) < 0.05, 'flashK discount wrong: ' + asym.wetStun);
  await page.evaluate(() => { const e = window.__game.byId.wetcomer1; e.stunT = 0; e.state = 'PATROL'; });

  // ---------- 6. 取证截图：脊/椅阵/CRT冢/床单巷/湿客 ----------
  await look('r5-02-ridge', -2, -16, -3, -30, undefined, -0.08);           // 同机位对照 r5-01
  await look('r5-03-ridge-door', -3, -21.5, -3, -27, undefined, -0.04);    // 脊里别人家的门
  await look('r5-04-chairs-sea', 11.5, -4.5, 26, -4.5, undefined, -0.1);   // 椅阵背后望海向
  await look('r5-05-chairs-shoes', 29.2, -3.2, 16, -4.5, undefined, -0.24); // 海侧回看:椅面上的鞋
  await look('r5-06-crt-cairn', -7.5, -18.2, -7.5, -22.8, undefined, -0.12); // 脊脚CRT冢(雪花朝镇)
  // 床单巷 + 湿客：把 wetcomer1 摆到二道线缝位入镜
  await page.evaluate(() => {
    const g = window.__game;
    const e = g.byId.wetcomer1;
    e.pos.x = 19; e.pos.z = -25;
    e.pos.y = g.world.heightAt(19, -25, 1);
    e.targetYaw = e.yaw = Math.PI; // 面朝 +z（镜头）
    e.syncBody(0);
  });
  await look('r5-07-sheet-alley', 16.8, -16.5, 19, -25, undefined, -0.02);
  // 湿客站进 CRT 光里的近景：泡过的皮要能读出来（冻结 AI 防走位）
  await page.evaluate(() => {
    const g = window.__game;
    const e = g.byId.wetcomer2;
    e.pos.x = -5.8; e.pos.z = -21.6;
    e.pos.y = g.world.heightAt(-5.8, -21.6, 1);
    e.targetYaw = e.yaw = Math.atan2(-3.9 - e.pos.x, -19.9 - e.pos.z); // 面朝镜头
    e.syncBody(0);
    g.game.state = 'PAUSE'; // 冻结更新（不开菜单），渲染继续
  });
  await look('r5-08-wetcomer-close', -4.3, -20.3, -5.8, -21.6, undefined, 0.02);
  await page.evaluate(() => { window.__game.game.state = 'PLAY'; });
  await look('r5-09-salt-crust', 0.5, -30.5, -4, -38, undefined, -0.3);    // 盐痂爬向酒店正门

  // ---------- 7. 轮12 取证：幻潮面 / 鱼影 / 浮子缆绳 / 泡透的街 ----------
  // 大鱼影停到镇心上空（r→0 = 原地悬停），仰拍悬空的海
  await page.evaluate(() => {
    const g = window.__game;
    const td = g.world.dynamic.leakState.tide;
    td.giant.cx = 2; td.giant.cz = -9; td.giant.r = 0.01;
    g.world.updateFx(520);
  });
  await look('r5-10-phantom-tide', 2, -2, 2, -30, undefined, 1.08);   // 潮面光网+巨影仰拍
  await look('r5-11-float-ropes', 2, -6, -4, -14, undefined, 0.55);   // 绷直的缆绳与悬空浮子
  await look('r5-12-wet-street', 12, -4, -2, -20, undefined, -0.12);  // 泡透的街面+镜面水洼

  console.log('[verify] round5 leak-state all pass');
}
