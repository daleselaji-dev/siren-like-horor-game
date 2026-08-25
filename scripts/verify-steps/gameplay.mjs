// 玩法验证：视奸/敌人/被发现/死亡重生/文书拾取
export async function run(page, h) {
  await page.click('#title-start');
  await h.sleep(2600);
  await h.shot('g0-intro');

  // 1. 看补网人（劳作动画 + 人形）
  await page.evaluate(() => window.__game.player.setPosition(12, 54, Math.PI));
  await h.sleep(600);
  await h.shot('g1-netmender');

  // 2. 视奸：进入 → 截图 → 换台 → 截图
  await h.tapKey('KeyQ');
  await h.sleep(900);
  await h.shot('g2-sightjack');
  const sj1 = await page.evaluate(() => ({
    active: window.__game.sightjack.active,
    label: window.__game.sightjack.current?.label,
  }));
  console.log('[verify] sightjack:', JSON.stringify(sj1));
  await h.tapKey('KeyQ');
  await h.sleep(700);
  await h.shot('g3-sightjack-cycle');
  // 退出
  await h.tapKey('KeyW');
  await h.sleep(300);

  // 3. 站到巡堤人面前 → 应被发现
  const patrolPos = await page.evaluate(() => {
    const p = window.__game.byId.dikePatrol;
    return { x: p.pos.x, z: p.pos.z, yaw: p.yaw };
  });
  await page.evaluate(({ x, z, yaw }) => {
    // 站在他面前 4m
    const px = x + Math.sin(yaw) * 4;
    const pz = z + Math.cos(yaw) * 4;
    window.__game.player.setPosition(px, pz, yaw + Math.PI);
  }, patrolPos);
  await h.sleep(2500);
  const st1 = await page.evaluate(() => window.__game.byId.dikePatrol.state);
  console.log('[verify] patrol state after exposure:', st1);
  await h.shot('g4-detected');

  // 4. 等他抓到 → 死亡 → 重生
  await h.sleep(6000);
  const dead = await page.evaluate(() => ({
    dead: window.__game.player.dead,
    deathSeq: !!window.__game.story.deathSeq,
  }));
  console.log('[verify] death state:', JSON.stringify(dead));
  await h.shot('g5-death');
  await h.sleep(5000);
  const respawned = await page.evaluate(() => ({
    dead: window.__game.player.dead,
    pos: { x: window.__game.player.pos.x.toFixed(0), z: window.__game.player.pos.z.toFixed(0) },
    checkpoint: window.__game.story.checkpoint.name,
  }));
  console.log('[verify] respawned:', JSON.stringify(respawned));
  await h.shot('g6-respawn');

  // 5. 拾取文书①
  await page.evaluate(() => window.__game.player.setPosition(76.5, 108.5, 0));
  await h.sleep(400);
  await h.tapKey('KeyE');
  await h.sleep(600);
  await h.shot('g7-note');
  const noteOpen = await page.evaluate(() => window.__game.game.state);
  console.log('[verify] state after note pickup:', noteOpen);
  await h.tapKey('KeyE');
  await h.sleep(300);

  // 6. 祭师与香炉（视奸鬼火验证）：主相机看不到鬼火，视奸相机能看到
  await page.evaluate(() => window.__game.player.setPosition(-58, -74, Math.PI / 2));
  await h.sleep(1500);
  await h.shot('g8-temple-main');
  const ghostInfo = await page.evaluate(() => {
    const cs = window.__game.world.dynamic.censers;
    return cs.map((c) => ({ ghost: c.ghostOn, lit: c.lit, visible: c.flames.visible }));
  });
  console.log('[verify] censers:', JSON.stringify(ghostInfo));

  // 7. 血潮事件（直接触发）→ 场景变化
  await page.evaluate(() => window.__game.story.beginBloodTide());
  await h.sleep(4000);
  await h.shot('g9-bloodtide');
  const bt = await page.evaluate(() => ({
    water: window.__game.ocean.level.toFixed(2),
    singer: window.__game.byId.singer.enabled,
    fog: window.__game.engine.scene.fog.density.toFixed(4),
  }));
  console.log('[verify] blood tide:', JSON.stringify(bt));
  await h.sleep(4000);
  await h.shot('g10-bloodtide2');

  // 8. 性能采样
  const perf = await page.evaluate(() => new Promise((res) => {
    let frames = 0;
    const t0 = performance.now();
    const tick = () => {
      frames++;
      if (performance.now() - t0 > 3000) res((frames / 3).toFixed(1));
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
  console.log('[verify] fps(swiftshader):', perf);
}
