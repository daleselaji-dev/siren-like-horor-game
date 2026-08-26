// 轮4取证：反击工具三件套——镁光闪(定身断追踪)/发条闹钟(诱饵)/贝灰线(界)
// 混合验证：拾取走真实互动路径(E)，AI 反应用确定性步进（无头低帧率不可靠）
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
    await h.sleep(500);
    await h.shot(name);
  };

  // ---------- 1. 相机拾取（真实互动路径） ----------
  const cam = await page.evaluate(() => {
    const g = window.__game;
    const l = g.world.locations.photoCamera;
    g.player.setPosition(l.x - 0.8, l.z, Math.PI / 2 + 0.6, l.y);
    g.player.syncCamera(0);
    const it = g.story.findInteractable();
    return { prompt: it?.prompt ?? null, id: it?.id ?? null };
  });
  console.log('[verify] camera interactable:', JSON.stringify(cam));
  if (cam.id !== 'toolCamera') throw new Error('photoCamera interactable not found: ' + JSON.stringify(cam));
  await h.tapKey('KeyE');
  await h.sleep(600);
  const camGot = await page.evaluate(() => ({
    has: window.__game.tools.hasCamera, bulbs: window.__game.tools.bulbs,
    hudBar: document.getElementById('tools-bar').textContent,
  }));
  console.log('[verify] camera pickup:', JSON.stringify(camGot));
  if (!camGot.has || camGot.bulbs !== 2) throw new Error('camera pickup failed');
  await h.shot('r4-01-camera-pickup');

  // 暗房镁光泡补给
  const bulbs2 = await page.evaluate(() => {
    const g = window.__game;
    const l = g.world.locations.darkroom;
    g.player.setPosition(l.x, l.z - 0.5, 0, l.y);
    const it = g.story.findInteractable();
    if (it?.id === 'toolBulbs1') { it.act(); return g.tools.bulbs; }
    return -1;
  });
  console.log('[verify] darkroom bulbs total:', bulbs2);
  if (bulbs2 !== 4) throw new Error('darkroom bulbs pickup failed');

  // 闹钟与贝灰拾取（直接调用互动 act）
  const picks = await page.evaluate(() => {
    const g = window.__game;
    const grab = (locKey, id) => {
      const l = g.world.locations[locKey];
      g.player.setPosition(l.x, l.z - 0.6, 0, l.y);
      const it = g.story.findInteractable();
      if (it?.id === id) { it.act(); return true; }
      return false;
    };
    const c1 = grab('dormClock', 'toolClock1');
    const c2 = grab('securityClock', 'toolClock2');
    const lm = grab('limeBag', 'toolLime');
    return { c1, c2, lm, clocks: g.tools.clocks, lime: g.tools.lime };
  });
  console.log('[verify] pickups:', JSON.stringify(picks));
  if (!picks.c1 || !picks.c2 || !picks.lm) throw new Error('tool pickups failed: ' + JSON.stringify(picks));
  if (picks.clocks !== 2 || picks.lime !== 3) throw new Error('tool counts wrong');

  // ---------- 2. 镁光闪：定身 + 断追踪（真实按键 F） ----------
  await page.evaluate(() => {
    const g = window.__game;
    const e = g.byId.waiterLobby;
    const hi = g.world.dynamic.hotelInfo;
    // 布阵在大堂挑空正中（无柱遮挡）：侍应在北、玩家在南 4m，面对面
    e.pos.set(hi.origin.x, 0, hi.origin.z + 8);
    e.pos.y = g.world.heightAt(e.pos.x, e.pos.z, hi.origin.y + 0.5);
    g.player.setPosition(hi.origin.x, hi.origin.z + 4, Math.PI, hi.origin.y + 0.5);
    g.player.yaw = Math.atan2(-(e.pos.x - g.player.pos.x), -(e.pos.z - g.player.pos.z));
    g.player.syncCamera(0);
    e.enterAlert(g.player, null, () => {});
  });
  await h.sleep(300);
  await h.shot('r4-02-waiter-alert');
  await h.tapKey('KeyF');
  await h.sleep(150);
  await h.shot('r4-03-flash-white');
  const flashRes = await page.evaluate(() => {
    const g = window.__game;
    const e = g.byId.waiterLobby;
    return { stunT: e.stunT.toFixed(1), state: e.state, bulbs: g.tools.bulbs, flashVal: g.tools.flashVal.toFixed(2) };
  });
  console.log('[verify] flash result:', JSON.stringify(flashRes));
  if (parseFloat(flashRes.stunT) <= 0) throw new Error('flash did not stun');
  if (flashRes.state !== 'SEARCH') throw new Error('flash did not break chase: ' + flashRes.state);
  if (flashRes.bulbs !== 3) throw new Error('bulb not consumed');
  await h.sleep(1200);
  await h.shot('r4-04-waiter-stunned');

  // ---------- 3. 发条闹钟：确定性步进验证诱饵 ----------
  const clockRes = await page.evaluate(() => {
    const g = window.__game;
    const e = g.byId.waiterLobby;
    e.reset(); e.setEnabled(true);
    // 玩家在大堂东角放闹钟
    g.player.setPosition(e.pos.x + 5, e.pos.z + 5, 0.8, e.pos.y + 0.5);
    const before = g.tools.clocks;
    const ok = g.tools.placeClock();
    const c = g.tools.activeClocks[g.tools.activeClocks.length - 1];
    // 快进：上弦 2.5s → 响铃
    for (let i = 0; i < 8; i++) g.tools.update(0.5);
    return {
      ok, consumed: before - g.tools.clocks, phase: c.phase,
      lured: e.state, lastSeen: { x: e.lastSeenPos.x.toFixed(1), z: e.lastSeenPos.z.toFixed(1) },
      clockAt: { x: c.x.toFixed(1), z: c.z.toFixed(1) },
    };
  });
  console.log('[verify] clock lure:', JSON.stringify(clockRes));
  if (!clockRes.ok || clockRes.consumed !== 1) throw new Error('clock not placed');
  if (clockRes.phase !== 'ring') throw new Error('clock not ringing');
  if (clockRes.lured !== 'SEARCH') throw new Error('waiter not lured: ' + clockRes.lured);
  if (Math.abs(parseFloat(clockRes.lastSeen.x) - parseFloat(clockRes.clockAt.x)) > 0.6) throw new Error('lure target mismatch');
  await look('r4-05-clock-ringing',
    ...(await page.evaluate(() => {
      const c = window.__game.tools.activeClocks[0];
      return [c.x + 1.6, c.z + 1.6, c.x, c.z];
    })), 3.6, -0.5);

  // ---------- 4. 贝灰线：追击者到界前站定，不越线 ----------
  const limeRes = await page.evaluate(() => {
    const g = window.__game;
    const e = g.byId.waiterLobby;
    e.reset(); e.setEnabled(true);
    const hz = g.world.dynamic.hotelInfo.origin.z;
    const hx = g.world.dynamic.hotelInfo.origin.x;
    // 布阵：玩家在大堂正中偏南，面朝北；灰线倒在身前；侍应从北边追过来
    g.player.setPosition(hx, hz + 3, Math.PI, e.pos.y + 0.5); // 面朝 -z? yaw=PI → 面朝 +z(北)
    g.player.yaw = Math.PI; // forward = (-sin, -cos) = (0, +1) → 朝北(+z)
    const poured = g.tools.pourLime();
    const line = g.tools.limeLines[g.tools.limeLines.length - 1];
    // 侍应放到线北 2.5m，直接警报
    e.pos.set(hx, 0, hz + 7);
    e.pos.y = g.world.heightAt(hx, hz + 7, g.player.pos.y);
    e.enterAlert(g.player, null, () => {});
    let caught = false;
    const ctx = {
      player: g.player, dt: 0.25, audio: null, envSightFactor: 1,
      noiseEvents: [], onCaught: () => { caught = true; }, onAlerted: () => {},
    };
    let maxStall = 0;
    for (let i = 0; i < 40; i++) {
      e.update(ctx);
      maxStall = Math.max(maxStall, e.limeStall);
    }
    return {
      poured, lineZ: line.z1.toFixed(1),
      enemyZ: e.pos.z.toFixed(1), playerZ: g.player.pos.z.toFixed(1),
      crossed: e.pos.z < line.z1 - 0.2, caught,
      maxStall: maxStall.toFixed(1), finalState: e.state, lime: g.tools.lime,
    };
  });
  console.log('[verify] lime line:', JSON.stringify(limeRes));
  if (!limeRes.poured) throw new Error('lime not poured');
  if (limeRes.caught) throw new Error('enemy crossed lime and caught player');
  if (limeRes.crossed) throw new Error('enemy crossed the lime line');
  if (parseFloat(limeRes.maxStall) <= 0) throw new Error('enemy never stalled at line');
  // 隔线还看得见你 → 僵持↔筛查循环（对峙），看不见 → SEARCH 放弃；两者都算界起效
  if (!['SEARCH', 'ALERT'].includes(limeRes.finalState)) throw new Error('unexpected state: ' + limeRes.finalState);
  // 拍：界前站定的侍应（从玩家视角回看，压低视角把灰线拍进来）
  await page.evaluate(() => {
    const g = window.__game;
    g.player.pitch = -0.34;
    g.player.syncCamera(0);
  });
  await h.sleep(400);
  await h.shot('r4-06-lime-standoff');

  // ---------- 5. HUD 工具栏三行齐 ----------
  const hudBar = await page.evaluate(() => document.getElementById('tools-bar').textContent);
  console.log('[verify] tools bar:', hudBar);
  if (!hudBar.includes('镁光闪') || !hudBar.includes('发条闹钟') || !hudBar.includes('贝灰线')) {
    throw new Error('tools bar incomplete: ' + hudBar);
  }

  // ---------- 6. 空泡反馈 ----------
  const dryFire = await page.evaluate(() => {
    const g = window.__game;
    g.tools.bulbs = 0;
    g.tools.flashCd = 0;
    return { fired: g.tools.flash() };
  });
  console.log('[verify] dry fire (no bulbs):', JSON.stringify(dryFire));
  if (dryFire.fired) throw new Error('flash fired without bulbs');

  console.log('[verify] round4 tools all pass');
}
