// 玩法验证：听潮 / 员工 AI / 被抓重生 / 文书 / F01 6m·2m 读取 / 走廊变深 / 暴露
export async function run(page, h) {
  await page.click('#title-start');
  await h.sleep(2600);
  await h.tapKey('Space'); // 跳过开场
  await h.sleep(500);
  await h.shot('g0-intro');

  // 1. 看拖地的苏阿姨（劳作动画 + 新人形）
  await page.evaluate(() => {
    const g = window.__game;
    const c = g.byId.cleaner;
    g.player.setPosition(c.pos.x + Math.sin(c.yaw) * 3, c.pos.z + Math.cos(c.yaw) * 3, c.yaw + Math.PI);
  });
  await h.sleep(600);
  await h.shot('g1-cleaner');

  // 2. 听潮：进入 → 截图 → 换台 → 截图 → 退出
  await h.tapKey('KeyQ');
  await h.sleep(900);
  await h.shot('g2-listen');
  const sj1 = await page.evaluate(() => ({
    active: window.__game.sightjack.active,
    label: window.__game.sightjack.current?.label,
  }));
  console.log('[verify] listen:', JSON.stringify(sj1));
  if (!sj1.active) throw new Error('listen (sightjack) did not activate');
  await h.tapKey('KeyQ');
  await h.sleep(700);
  await h.shot('g3-listen-cycle');
  await h.tapKey('KeyW');
  await h.sleep(300);

  // 3. 站到保安面前 → 应被发现
  const guardPos = await page.evaluate(() => {
    const p = window.__game.byId.guard;
    return { x: p.pos.x, z: p.pos.z, yaw: p.yaw };
  });
  await page.evaluate(({ x, z, yaw }) => {
    const px = x + Math.sin(yaw) * 3.5;
    const pz = z + Math.cos(yaw) * 3.5;
    window.__game.player.setPosition(px, pz, yaw + Math.PI);
  }, guardPos);
  await h.sleep(2500);
  const st1 = await page.evaluate(() => window.__game.byId.guard.state);
  console.log('[verify] guard state after exposure:', st1);
  await h.shot('g4-detected');

  // 4. 等他抓到 → 死亡 → 重生
  let dead = { dead: false };
  for (let i = 0; i < 30 && !dead.dead; i++) {
    await h.sleep(1000);
    dead = await page.evaluate(() => ({
      dead: window.__game.player.dead,
      caught: !!window.__game.story.caughtSeq,
    }));
  }
  console.log('[verify] death state:', JSON.stringify(dead));
  if (!dead.dead) throw new Error('guard never caught the player');
  await h.shot('g5-death');
  // 死亡演出 4.2s 游戏时间；无头低帧率下 dt 钳制会拉长真实耗时
  let respawned = { dead: true };
  for (let i = 0; i < 40 && respawned.dead; i++) {
    await h.sleep(1000);
    respawned = await page.evaluate(() => ({
      dead: window.__game.player.dead,
      pos: { x: window.__game.player.pos.x.toFixed(0), z: window.__game.player.pos.z.toFixed(0) },
      checkpoint: window.__game.story.checkpointId,
    }));
  }
  console.log('[verify] respawned:', JSON.stringify(respawned));
  if (respawned.dead) throw new Error('player did not respawn');
  await h.shot('g6-respawn');

  // 5. 拾取登记簿（文书）
  await page.evaluate(() => window.__game.player.setPosition(-7.2, -4.2, Math.PI / 2 + 0.4));
  await h.sleep(400);
  await h.tapKey('KeyE');
  await h.sleep(600);
  await h.shot('g7-note');
  const noteState = await page.evaluate(() => window.__game.game.state);
  console.log('[verify] state after note pickup:', noteState);
  if (noteState !== 'NOTE') throw new Error('registry note did not open');
  await h.tapKey('KeyE');
  await h.sleep(300);

  // 6. F01 读取：6m → 2m（先读人，再读井）
  await page.evaluate(() => {
    const g = window.__game;
    const f = g.f01;
    f.pos.set(-12.4, 0, -29.7);
    f.pos.y = g.world.heightAt(f.pos.x, f.pos.z);
    f.state = 'WORK';
    g.player.setPosition(f.pos.x, f.pos.z + 5.5, 0); // yaw=0 朝 -z 正对他
  });
  await h.sleep(1200);
  const read6 = await page.evaluate(() => window.__game.f01.read6);
  console.log('[verify] f01 read6m:', read6);
  await h.shot('g8-f01-6m');
  await page.evaluate(() => {
    const g = window.__game;
    const f = g.f01;
    g.player.setPosition(f.pos.x, f.pos.z + 1.6, 0);
  });
  await h.sleep(1200);
  const read2 = await page.evaluate(() => ({
    read2: window.__game.f01.read2,
    wells: window.__game.f01.body.wellL !== undefined,
    near: window.__game.f01.body._nearAmt?.toFixed(2),
  }));
  console.log('[verify] f01 read2m:', JSON.stringify(read2));
  if (!read6 || !read2.read2) throw new Error('F01 6m/2m reads did not fire');
  await h.shot('g9-f01-2m');
  // 拉开，避免被他抓住
  await page.evaluate(() => window.__game.player.setPosition(0, -5, 0));
  await h.sleep(500);

  // 7. 走廊变深（Leak）
  const ext = await page.evaluate(() => {
    const g = window.__game;
    const before = g.world.colliders.length;
    g.story.flags.measured = true;
    g.story._reachedEnd = true;
    g.story.triggerExtend();
    return {
      extended: g.world.corridorExtended,
      collidersDelta: g.world.colliders.length - before,
    };
  });
  console.log('[verify] corridor extend:', JSON.stringify(ext));
  if (!ext.extended) throw new Error('corridor did not extend');
  await page.evaluate(() => window.__game.player.setPosition(0, -33, Math.PI));
  await h.sleep(500);
  await h.shot('g10-corridor-deep');

  // 8. 婚宴录像事件 + 十八秒后的现实重演
  const video = await page.evaluate(() => {
    const g = window.__game;
    g.story.flags.banquetOpen = true;
    g.player.setPosition(-7, -23, 2.6);
    g.story.startVideoEvent();
    return !!g.story.videoEvent;
  });
  console.log('[verify] video event started:', video);
  await h.sleep(2500);
  await h.shot('g11-video');
  // 快进带子（低帧率下轮询完成标志）
  await page.evaluate(() => { window.__game.story.videoEvent.t = 17.95; });
  let seen = false;
  for (let i = 0; i < 20 && !seen; i++) {
    await h.sleep(600);
    seen = await page.evaluate(() => window.__game.story.flags.videoSeen);
  }
  console.log('[verify] videoSeen:', seen);
  if (!seen) throw new Error('video event did not complete');
  // 快进 18 秒计划任务 → 现实重演
  await page.evaluate(() => { window.__game.story.elapsed += 19; });
  await h.sleep(1500);
  const replay = await page.evaluate(() => ({
    replayDone: window.__game.story.flags.replayDone,
    scripted: window.__game.f01.scripted,
    enabled: window.__game.f01.enabled,
  }));
  console.log('[verify] replay:', JSON.stringify(replay));
  if (!replay.replayDone) throw new Error('reality replay did not schedule');
  await h.sleep(3000);
  await h.shot('g12-replay');

  // 9. 暴露：听潮时槽上涨
  // 重演期间玩家可能已被 F01 盯上/抓住——先清理战斗状态再测暴露
  const expose = await page.evaluate(() => {
    const g = window.__game;
    g.story.caughtSeq = null;
    g.story.deathSeq = null;
    g.story.flags.chase = false;
    g.player.dead = false;
    g.player.frozen = false;
    for (const e of g.enemies) { e.grabbing = false; if (e.state === 'ALERT') e.state = 'WORK'; }
    g.player.setPosition(4, -2, 0); // 大堂：监控与员工信道都在范围内
    g.sightjack.enter([...g.enemies, ...g.cameras]);
    return g.stealth.resonance;
  });
  await h.sleep(3500);
  const expose2 = await page.evaluate(() => window.__game.stealth.resonance);
  console.log('[verify] exposure:', expose.toFixed(3), '→', expose2.toFixed(3));
  if (!(expose2 > expose)) throw new Error('exposure did not rise while listening');
  await page.evaluate(() => {
    const g = window.__game;
    g.sightjack.exit();
    g.sightjack.restorePost();
  });
  await h.sleep(300);

  // 10. 性能采样
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
