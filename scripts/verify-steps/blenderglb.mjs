// Blender GLB 英雄件取证：四件装配齐 / 三角面数达标（明显优于胶囊人偶的量级）/
// HeadPivot 存在（转头读法可用）/ 湿客返潮前隐藏返潮后到岗 / 首见字幕触发 / 四机位截图
export async function run(page, h) {
  await page.click('#title-start');
  await h.sleep(1500);
  await h.tapKey('Space'); // 跳过开场运镜
  await h.sleep(400);

  const assert = (ok, msg) => { if (!ok) throw new Error('ASSERT: ' + msg); };

  // 1. 装配断言（GLB 解析是异步的——等到齐）
  await page.waitForFunction(() => window.__game?.heroFigures?.ready === 4, { timeout: 30000, polling: 300 });
  const info = await page.evaluate(() => {
    const H = window.__game.heroFigures;
    return H.figures.map((f) => ({
      key: f.def.key, tris: Math.round(f.tris), head: !!f.head,
      enabled: f.enabled, visible: f.root.visible,
      pos: [f.root.position.x.toFixed(1), f.root.position.z.toFixed(1)],
    }));
  });
  console.log('[blenderglb]', JSON.stringify(info));
  assert(info.length === 4, '应装配四件英雄件');
  for (const f of info) {
    assert(f.tris > 9000, `${f.key} 三角面数 ${f.tris} 应 >9000（细模门槛，胶囊人偶是两位数）`);
    assert(f.head, `${f.key} 应带 HeadPivot`);
  }
  const wet = info.find((f) => f.key === 'wetguest');
  assert(wet && !wet.visible, '湿客在返潮点火前不应可见');

  // 2. 四机位取证（0.8–2.2m 近景，直接对脸）
  const look = async (name, px, pz, tx, tz, yHint) => {
    await page.evaluate(({ px, pz, tx, tz, yHint }) => {
      const g = window.__game;
      const yaw = Math.atan2(-(tx - px), -(tz - pz));
      g.player.setPosition(px, pz, yaw, yHint);
      g.player.pitch = 0.02;
      g.player.syncCamera(0);
    }, { px, pz, tx, tz, yHint });
    await h.sleep(700);
    await h.shot(name);
  };
  const P = await page.evaluate(() => {
    const H = window.__game.heroFigures;
    const o = {};
    for (const f of H.figures) o[f.def.key] = [f.root.position.x, f.root.position.y, f.root.position.z];
    return o;
  });
  // 正面近景（对脸取证）+ 玩家自然视角（背影/橱窗外）
  await look('hero_townsman', P.townsman[0] + 1.9, P.townsman[2] + 0.6, P.townsman[0], P.townsman[2], P.townsman[1] + 0.1);
  await look('hero_townsman_back', P.townsman[0] - 2.4, P.townsman[2] - 0.8, P.townsman[0], P.townsman[2], P.townsman[1] + 0.1);
  await look('hero_emcee', P.emcee[0] + 0.3, P.emcee[2] - 2.4, P.emcee[0], P.emcee[2], P.emcee[1] + 0.1);
  await look('hero_waiter', P.waiter[0] - 1.4, P.waiter[2] - 1.6, P.waiter[0], P.waiter[2], P.waiter[1] + 0.1);

  // 3. 守夜人转头读法：站到近处等两拍，头应朝向玩家
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

  // 4. 首见字幕
  const seen = await page.evaluate(() => ({ ...window.__game.heroFigures.seen }));
  assert(seen.townsman, '守夜人首见字幕应已触发');

  // 5. 返潮点火 → 湿客到岗
  await page.evaluate(() => {
    const g = window.__game;
    g.world.applyLeakState();
    g.story.flags.leaked = true;
  });
  await h.sleep(800);
  const wet2 = await page.evaluate(() => {
    const f = window.__game.heroFigures.figures.find((f) => f.def.key === 'wetguest');
    return { enabled: f.enabled, visible: f.root.visible };
  });
  assert(wet2.enabled && wet2.visible, '返潮点火后湿客应到岗可见');
  await look('hero_wetguest', P.wetguest[0] - 0.4, P.wetguest[2] - 2.0, P.wetguest[0], P.wetguest[2], P.wetguest[1] + 0.1);

  console.log('[blenderglb] ✅ 四件英雄件装配/细模面数/转头/字幕/返潮到岗 全部通过');
}
