// 玩法验证：视奸/敌人警戒/引座重生/文书/CRT预现/振动/上宾/议程/渗漏态
export async function run(page, h) {
  await page.click('#title-start');
  await h.sleep(2600);
  await h.shot('g0-intro');
  await h.tapKey('Space'); // 跳过开场运镜
  await h.sleep(500);

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
  if (!sj1.active) throw new Error('sightjack failed to enter');
  await h.tapKey('KeyQ');
  await h.sleep(700);
  await h.shot('g3-sightjack-cycle');
  await h.tapKey('KeyW'); // 退出
  await h.sleep(300);

  // 3. 站到巡堤人面前 → 应被发现
  const patrolPos = await page.evaluate(() => {
    const p = window.__game.byId.dikePatrol;
    return { x: p.pos.x, z: p.pos.z, yaw: p.yaw };
  });
  await page.evaluate(({ x, z, yaw }) => {
    const px = x + Math.sin(yaw) * 4;
    const pz = z + Math.cos(yaw) * 4;
    window.__game.player.setPosition(px, pz, yaw + Math.PI);
  }, patrolPos);
  await h.sleep(2500);
  const st1 = await page.evaluate(() => window.__game.byId.dikePatrol.state);
  console.log('[verify] patrol state after exposure:', st1);
  await h.shot('g4-detected');

  // 4. 等他抓到 → 引座 → 重生（低帧率下全部用轮询等待）
  const waitFor = async (fn, timeoutMs, desc) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (await page.evaluate(fn)) return true;
      await h.sleep(700);
    }
    console.log('[verify] TIMEOUT waiting:', desc);
    return false;
  };
  const caughtOk = await waitFor(() => window.__game.player.dead, 40000, 'seating kill');
  const dead = await page.evaluate(() => ({
    dead: window.__game.player.dead,
    deathText: document.getElementById('death-text').textContent,
  }));
  console.log('[verify] seated state:', JSON.stringify(dead));
  if (!caughtOk) throw new Error('player never caught/seated');
  await h.shot('g5-seated');
  // 抓完立刻清场：把巡堤人挪远，防止重生点旁二次开抓
  await page.evaluate(() => {
    const g = window.__game;
    const dp = g.byId.dikePatrol;
    dp.def.waypoints = [[50, 74], [30, 73], [50, 74], [66, 74]];
    g.stealth.danger = 0;
  });
  const aliveOk = await waitFor(() => {
    const g = window.__game;
    return !g.player.dead && !g.story.deathSeq && !g.story.caughtSeq;
  }, 40000, 'respawn');
  const respawned = await page.evaluate(() => ({
    dead: window.__game.player.dead,
    pos: { x: window.__game.player.pos.x.toFixed(0), z: window.__game.player.pos.z.toFixed(0) },
    checkpoint: window.__game.story.checkpoint.name,
  }));
  console.log('[verify] respawned:', JSON.stringify(respawned));
  if (!aliveOk) throw new Error('player did not respawn');
  await h.shot('g6-respawn');
  // 敌人各归各位
  await page.evaluate(() => {
    const g = window.__game;
    for (const e of g.enemies) e.reset?.();
    g.stealth.danger = 0;
  });

  // 5. 拾取文书①（外证凭条——车站长椅上的行李箱）
  await page.evaluate(() => {
    const g = window.__game;
    const l = g.world.locations.luggage;
    g.player.setPosition(l.x, l.z - 1.2, Math.PI);
  });
  await h.sleep(400);
  await h.tapKey('KeyE');
  await h.sleep(600);
  await h.shot('g7-note');
  const noteOpen = await page.evaluate(() => window.__game.game.state);
  console.log('[verify] state after note pickup:', noteOpen);
  await h.tapKey('KeyE');
  await h.sleep(300);

  // 6. 酒店大堂：inHotel 触发 + CRT 上电
  await page.evaluate(() => window.__game.player.setPosition(-4, -48, Math.PI, 3.5));
  await h.sleep(1200);
  const hotel = await page.evaluate(() => ({
    inHotel: window.__game.story.flags.inHotel,
    crtEnabled: window.__game.crt.enabled,
    crtUnits: window.__game.crt.units.length,
    agendaStage: window.__game.agenda.stage,
  }));
  console.log('[verify] hotel entry:', JSON.stringify(hotel));
  if (!hotel.inHotel) throw new Error('hotelLobby trigger missed');
  if (hotel.crtUnits < 10) throw new Error('CRT units missing: ' + hotel.crtUnits);
  await h.shot('g8-lobby');

  // 7. CRT 预现：走到服务走廊 CRT 前，确认屏幕在渲染预现层
  await page.evaluate(() => window.__game.player.setPosition(0.8, -63.5, 2.5, 3.5));
  await h.sleep(2500); // 等轮询渲染几台
  const crtInfo = await page.evaluate(() => {
    const c = window.__game.crt;
    return {
      rendered: c.units.filter((u) => u.lastRender > 0).length,
      foretoldChildren: c.foretold.children.length,
    };
  });
  console.log('[verify] crt:', JSON.stringify(crtInfo));
  if (crtInfo.rendered < 1) throw new Error('no CRT unit rendered');
  await h.shot('g9-crt-corridor');

  // 8. 议程推进：收声一拍 → 广播 → HUD 指示
  await page.evaluate(() => window.__game.agenda.advance());
  await h.sleep(400);
  const silence = await page.evaluate(() => window.__game.agenda.silence);
  console.log('[verify] agenda silence beat:', silence > 0);
  await h.sleep(3500);
  const agendaHud = await page.evaluate(() => ({
    stage: window.__game.agenda.stage,
    hudShown: document.getElementById('agenda-indicator').classList.contains('show'),
    hudText: document.getElementById('agenda-indicator').textContent,
  }));
  console.log('[verify] agenda:', JSON.stringify(agendaHud));
  if (!agendaHud.hudShown) throw new Error('agenda HUD not shown');

  // 9. 渗漏态（验户=返潮点火）：人群切换 + 浮客起浮 + 海色变化
  await page.evaluate(() => window.__game.agenda.advanceTo(3));
  await h.sleep(2000);
  const leak = await page.evaluate(() => {
    const g = window.__game;
    return {
      leaked: g.story.flags.leaked,
      crowdNormal: g.story.crowdNormal.visible,
      crowdLeak: g.story.crowdLeak.visible,
      floaters: g.floaters.filter((f) => f.enabled).length,
      securityOn: g.byId.security.enabled,
      oceanBlood: g.ocean.blood > 0 || g.ocean.bloodTarget > 0,
    };
  });
  console.log('[verify] leak state:', JSON.stringify(leak));
  if (!leak.leaked || leak.crowdNormal || !leak.crowdLeak) throw new Error('leak crowd swap failed');
  if (leak.floaters < 5) throw new Error('floaters not enabled');
  await page.evaluate(() => window.__game.player.setPosition(-13, -50, 0.6, 3.5));
  await h.sleep(800);
  await h.shot('g10-banquet-leak');

  // 10. 振动潜行（确定性：同步直调 stealth.update，避开无头低帧率）
  const vibs = await page.evaluate(() => {
    const g = window.__game;
    g.stealth.vibrationActive = true;
    const step = (x, z) => {
      g.player.setPosition(x, z, 0, 3.5);
      g.player.noiseLevel = 6; // 相当于正常步行的动静
      g.stealth.vibration = 0;
      for (let i = 0; i < 4; i++) g.stealth.update(0.5, []);
      return g.stealth.vibration;
    };
    const hard = step(2, -47);    // 大堂东侧水磨石
    const carpet = step(-4, -50); // 大堂红毯
    return { hard: hard.toFixed(2), carpet: carpet.toFixed(2) };
  });
  console.log('[verify] vibration hard/carpet:', JSON.stringify(vibs));
  if (parseFloat(vibs.hard) <= 0.05) throw new Error('vibration not rising on hard floor');
  if (parseFloat(vibs.carpet) >= parseFloat(vibs.hard) * 0.5) throw new Error('carpet not damping vibration');

  // 11. 上宾：振动满格 → 板臂压向玩家 → 点名（确定性：手动步进实体）
  const guestCaught = await page.evaluate(() => {
    const g = window.__game;
    for (const id of ['waiterBanquet', 'waiterLobby', 'waiterEast', 'security']) g.byId[id]?.setEnabled(false);
    g.stealth.danger = 0;
    g.guest.setEnabled(true);
    g.player.setPosition(-2, -50, 0, 3.5);
    let named = false;
    const ctx = {
      dt: 0.1, player: g.player, audio: g.audio, vibration: 1,
      onCaught: () => { named = true; },
    };
    for (let i = 0; i < 300 && !named; i++) g.guest.update(ctx);
    return {
      named,
      hand: { x: g.guest.hand.x.toFixed(1), z: g.guest.hand.z.toFixed(1) },
    };
  });
  console.log('[verify] guest naming:', JSON.stringify(guestCaught));
  if (!guestCaught.named) throw new Error('honored guest never named the player');
  await h.shot('g11-guest-arm');
  // 真实触发一次引座演出（挂到 story），确认统一失败态
  await page.evaluate(() => window.__game.story.beginCaught(window.__game.guest));
  const seated2 = await waitFor(() => window.__game.player.dead, 40000, 'guest seating kill');
  console.log('[verify] guest seating kill:', seated2);
  if (!seated2) throw new Error('guest seating did not kill');
  // 无头低帧率下死亡演出被拉得极长——同步快进到重生
  const back = await page.evaluate(() => {
    const g = window.__game;
    for (let i = 0; i < 24 && g.story.deathSeq; i++) g.story.updateDeath(0.5);
    return { dead: g.player.dead, seq: !!g.story.deathSeq };
  });
  console.log('[verify] respawn after guest:', JSON.stringify(back));
  if (back.dead) throw new Error('did not respawn after guest seating');

  // 12. 性能采样
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
