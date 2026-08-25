// 《返潮》全流程通关验证：八节拍主线（传送加速位移，交互全部真实按键）
// 滩涂喜帖 → 堤门视奸钥匙 → 公告/广播 → 酒店807上头 → CRT教学 → 敬酒渗漏
// → 保卫科钥匙(点名) → 总闸破像 → 海洋馆母带 → 807播带 → 全福婆 → 囍匾大破像 → 灯塔终局
export async function run(page, h) {
  const flags = () => page.evaluate(() => {
    const s = window.__game.story;
    return { ...s.flags, notes: s.notesFound.size, checkpoint: s.checkpoint.name, agenda: window.__game.agenda.stage };
  });
  const tp = (x, z, yaw, yHint) => page.evaluate(
    ({ x, z, yaw, yHint }) => window.__game.player.setPosition(x, z, yaw, yHint),
    { x, z, yaw, yHint });
  const interact = async () => { await h.tapKey('KeyE'); await h.sleep(400); };
  const loc = (name) => page.evaluate((n) => {
    const v = window.__game.world.locations[n];
    return { x: v.x, y: v.y, z: v.z };
  }, name);
  // 等待某个 flag 变真（低帧率下演出被拉长，用轮询）
  const waitFlag = async (name, timeoutMs) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const v = await page.evaluate((n) => window.__game.story.flags[n], name);
      if (v) return true;
      await h.sleep(600);
    }
    return false;
  };
  const assert = (ok, msg) => { if (!ok) throw new Error('ASSERT: ' + msg); };
  // 同步快进游戏逻辑 sec 秒（SwiftShader 1-2fps 下 dt 被钳制，演出实时等不完；
  // 与主循环相同的 update 调用，只是密集补帧——不改变行为，只压缩真实时间）
  const ff = (sec) => page.evaluate((s) => {
    const g = window.__game;
    if (g.game.state !== 'PLAY' && g.game.state !== 'ENDED') return;
    const step = 0.25;
    for (let t = 0; t < s; t += step) {
      g.agenda.update(step);
      g.story.update(step);
      if (g.game.state !== 'PLAY' && g.game.state !== 'ENDED') break; // 演出弹出文书等
    }
  }, sec);

  await page.click('#title-start');
  await h.sleep(2000);
  await h.shot('p00-start');
  await h.tapKey('Space'); // 跳过开场运镜
  await h.sleep(500);

  // ---- 节拍1：滩涂搁浅 · 文书①喜帖 ----
  await tp(77, 109, 0.5);
  await h.sleep(300);
  await interact();
  await h.shot('p01-note1');
  await h.tapKey('KeyE');
  await h.sleep(300);
  let f = await flags();
  assert(f.notes >= 1, 'note1 not picked');

  // ---- 节拍1b：石堤潜行教学 · 文书②渔民日记 ----
  await tp(10, 55, 0);
  await h.sleep(600);
  const n2 = await loc('note2');
  await tp(n2.x + 0.5, n2.z + 0.8, 0.4);
  await h.sleep(300);
  await interact();
  await h.shot('p02-note2');
  await h.tapKey('KeyE');
  await h.sleep(200);

  // ---- 节拍1c：堤门锁着 → 视奸巡堤人 → 缸底钥匙 → 开门(议程·迎宾) ----
  const gate = await loc('gate');
  await tp(gate.x, gate.z + 2.4, Math.PI);
  await h.sleep(300);
  await interact(); // 推门（锁着）
  await h.shot('p03-gate-locked');
  f = await flags();
  console.log('[verify] sightjackTip:', f.sightjackTip);
  // 把巡堤人挪到钥匙检查段，玩家视奸
  await page.evaluate(() => {
    const e = window.__game.byId.dikePatrol;
    e.wpIndex = 6;
    e.pos.set(20, 0, 60);
    e.pos.y = window.__game.world.heightAt(20, 60);
    e.state = 'PATROL';
  });
  await tp(8, 62, -1.5);
  await h.sleep(200);
  await h.tapKey('KeyQ');
  await h.sleep(400);
  for (let i = 0; i < 10; i++) {
    const label = await page.evaluate(() => window.__game.sightjack.current?.label);
    if (label === '巡堤的人') break;
    await h.tapKey('KeyQ');
    await h.sleep(250);
  }
  await h.sleep(2500);
  await h.shot('p04-sightjack-key');
  f = await flags();
  console.log('[verify] knowKeySpot:', f.knowKeySpot);
  assert(f.knowKeySpot, 'sightjack key spot not learned');
  await h.tapKey('KeyW');
  await h.sleep(300);
  const vat = await page.evaluate(() => {
    const v = window.__game.world.dynamic.hut2.local(-1.35, 0.6, 1.0);
    return { x: v.x, z: v.z };
  });
  await tp(vat.x, vat.z + 0.6, Math.PI);
  await h.sleep(300);
  await interact();
  f = await flags();
  assert(f.hasKey, 'key not taken');
  await tp(gate.x, gate.z + 2.4, Math.PI);
  await h.sleep(300);
  await interact();
  f = await flags();
  assert(f.gateOpen, 'gate not opened');
  await h.sleep(1500);
  await h.shot('p05-gate-open');

  // ---- 节拍2：镇中心 · 公告栏文书③ · 广播站文书④ ----
  await tp(2, 6, 0);
  await h.sleep(600);
  const nb = await loc('noticeBoard');
  await tp(nb.x, nb.z + 1.6, Math.PI);
  await h.sleep(300);
  await interact();
  await h.shot('p06-notice');
  await h.tapKey('KeyE');
  await h.sleep(200);
  f = await flags();
  assert(f.knowHotel, 'knowHotel not set');
  const radio = await loc('radio');
  await tp(radio.x - 0.8, radio.z + 1.0, 2.6);
  await h.sleep(300);
  await interact();
  await h.shot('p07-radio');
  await h.tapKey('KeyE');
  await h.sleep(300);

  // ---- 节拍3：进酒店 → 大堂(议程·入席/CRT上电) → 807 陪新娘上头 ----
  await tp(-4, -42, 0, 3.5);
  await h.sleep(800); // hotelFront 触发
  await h.shot('p08-hotel-front');
  // 万一在门口撞上侍应巡逻线：快进走完引座演出并复位，保证触发器能评估
  const ensureAlive = () => page.evaluate(() => {
    const g = window.__game;
    for (let i = 0; i < 400 && (g.story.caughtSeq || g.story.deathSeq || g.player.dead); i++) {
      g.story.updateCaught(0.4);
      g.story.updateDeath(0.4);
    }
    for (const id of ['waiterBanquet', 'waiterLobby', 'waiterEast', 'security']) {
      const w = g.byId[id];
      if (w) { w.state = 'PATROL'; w.suspectMeter = 0; }
    }
    g.stealth.danger = 0;
    return { dead: g.player.dead, caught: !!g.story.caughtSeq };
  });
  await ensureAlive();
  await tp(-4, -48, 0, 3.5);
  await h.sleep(600);
  await ff(1); // 强制评估 zone 触发器（不依赖低帧率的真实循环）
  f = await flags();
  if (!f.inHotel) { // 被抓打断：复位后再进一次
    await ensureAlive();
    await tp(-4, -48, 0, 3.5);
    await h.sleep(600);
    await ff(1);
    f = await flags();
  }
  assert(f.inHotel, 'inHotel not set');
  await h.shot('p09-lobby-full');
  // 登记簿文书⑤
  await ensureAlive();
  const reg = await loc('registry');
  await tp(reg.x + 1.2, reg.z, 1.57, 3.5);
  await h.sleep(300);
  await interact();
  await h.tapKey('KeyE');
  await h.sleep(200);
  // 上 3F 807（传送模拟走楼梯）
  const dresser = await loc('dresser807');
  await tp(dresser.x + 1.4, dresser.z + 1.6, -2.4, 10.3);
  await h.sleep(400);
  await interact(); // 上头教学（演出 13.5s 游戏时间，快进消化）
  await h.shot('p10-bride-scene');
  let gotMirror = false;
  for (let i = 0; i < 40 && !gotMirror; i++) {
    gotMirror = await page.evaluate(() => window.__game.story.flags.hasMirror);
    if (!gotMirror) { await ff(0.75); await h.sleep(250); }
  }
  assert(gotMirror, 'mirror not given');
  await h.shot('p11-mirror');

  // ---- 节拍4：服务走廊 CRT 对照教学 → 宴会厅敬酒 = 返潮点火 ----
  await ensureAlive();
  const crtc = await loc('crtCorridor');
  await tp(crtc.x - 0.3, crtc.z + 1.6, Math.PI, 3.5);
  await h.sleep(400);
  await interact();
  f = await flags();
  assert(f.crtTip, 'crt tutorial missed');
  await h.shot('p12-crt-foretell');
  // 进宴会厅触发敬酒（议程收声 2.4s 后 applyStage → 渗漏）——收声用快进消化
  await tp(-14, -56, 0.6, 3.5);
  await h.sleep(1200); // 等真实循环跑到 zone 触发
  await ff(4);
  const leaked = await waitFlag('leaked', 30000);
  assert(leaked, 'leak not fired after toast');
  await h.sleep(1500);
  await h.shot('p13-leak-banquet');

  // ---- 节拍5：二楼保卫科 · 文书⑥ · 钥匙柜(CRT点名) → 一楼总闸破像 ----
  // 清一下侍应仇恨，避免传送落点撞巡逻线
  await page.evaluate(() => {
    const g = window.__game;
    for (const id of ['waiterBanquet', 'waiterLobby', 'waiterEast']) {
      const w = g.byId[id];
      if (w) { w.state = 'PATROL'; w.suspectMeter = 0; }
    }
    g.stealth.danger = 0;
  });
  const desk = await loc('securityDesk');
  await tp(desk.x - 1.2, desk.z + 1.2, 2.4, 6.9);
  await h.sleep(400);
  await interact(); // 值班日志（文书⑥）
  await h.tapKey('KeyE');
  await h.sleep(200);
  const kc = await loc('keyCabinet');
  await tp(kc.x, kc.z + 1.3, Math.PI, 6.9);
  await h.sleep(300);
  await interact(); // 钥匙柜 → 点名
  f = await flags();
  assert(f.hasAquaKey, 'aqua key not taken');
  assert(f.namedByCrt, 'not named by CRT');
  await h.sleep(1500);
  await h.shot('p14-named-by-crt');
  // 一楼配电间总闸
  const brk = await loc('mainBreaker');
  await tp(brk.x - 1.2, brk.z, 1.57, 3.5);
  await h.sleep(300);
  await interact();
  f = await flags();
  assert(f.imageBroken, 'image not broken');
  await h.shot('p15-image-broken');
  const crtBroken = await page.evaluate(() => window.__game.crt.broken > 0);
  console.log('[verify] crt static:', crtBroken);

  // ---- 节拍6：大堂上宾振动潜行 → 玻璃连廊 → 海洋馆母带(文书⑦) ----
  const guestOn = await page.evaluate(() => window.__game.guest.enabled);
  assert(guestOn, 'honored guest not enabled');
  // 沿红毯蹲行穿大堂（真实走一段，验证不被点名）
  await tp(-4, -54, Math.PI, 3.5);
  await h.tapKey('ShiftLeft');
  await page.evaluate(() => { window.__game.player.crouching = true; });
  await h.holdKey('KeyS', 2200); // 朝北退向门厅（yaw=π 时 S 往 -z…用 W 沿面朝走）
  await page.evaluate(() => { window.__game.player.crouching = false; });
  const vib = await page.evaluate(() => window.__game.stealth.vibration.toFixed(2));
  console.log('[verify] vibration after carpet crouch:', vib);
  await h.shot('p16-lobby-guest');
  // 玻璃连廊 → 海洋馆
  await tp(16, -50, 1.57, 3.5);
  await h.sleep(700); // annex 触发
  const tape = await loc('tapeCabinet');
  await tp(tape.x - 1.2, tape.z + 0.6, 2.0, 3.5);
  await h.sleep(300);
  await interact(); // 铁柜 → 文书⑦ + 母带
  await h.shot('p17-tape-note');
  await h.tapKey('KeyE');
  await h.sleep(300);
  f = await flags();
  assert(f.hasTape, 'tape not taken');
  assert(f.agenda >= 4, 'agenda not at 上头');

  // ---- 节拍7：回 807 播母带(文书⑧/影子规则) → 全福婆追逐 ----
  const tv = await loc('tv807');
  await tp(tv.x + 1.4, tv.z + 1.0, -2.2, 10.3);
  await h.sleep(400);
  await interact(); // 播带
  await h.sleep(1000);
  await h.shot('p18-tape-play');
  // 等 note8 打开（演出 stage1 → 8.5s 游戏时间，低帧率下快进消化）
  let noteOpened = false;
  for (let i = 0; i < 40; i++) {
    noteOpened = await page.evaluate(() => window.__game.game.state === 'NOTE');
    if (noteOpened) break;
    await ff(0.75);
    await h.sleep(250);
  }
  assert(noteOpened, 'note8 never opened during tape');
  await h.shot('p19-note8');
  await h.tapKey('KeyE'); // 合上 → 演出尾声
  let chase = false;
  for (let i = 0; i < 40 && !chase; i++) {
    chase = await page.evaluate(() => window.__game.story.flags.matronChase);
    if (!chase) { await ff(0.75); await h.sleep(250); }
  }
  assert(chase, 'matron chase not started');
  await h.sleep(800);
  await h.shot('p20-matron-chase');
  const matron = await page.evaluate(() => ({
    enabled: window.__game.byId.matron.enabled,
    state: window.__game.byId.matron.state,
  }));
  console.log('[verify] matron:', JSON.stringify(matron));

  // ---- 节拍8：下宴会厅扯囍匾(大破像) → 灯塔终局 ----
  // 全福婆在 3F 追——传送下楼甩开（对应实际玩法的楼梯逃脱）
  await page.evaluate(() => {
    const g = window.__game;
    g.stealth.danger = 0;
    for (const e of g.enemies) { if (e.state === 'ALERT') { e.state = 'SEARCH'; e.searchTarget = null; } }
  });
  const mic = await loc('stageMic');
  await tp(mic.x, mic.z + 0.4, Math.PI, 4.0); // 台上（舞台抬高 0.45，交互点在麦后 1.6m 半径 3）
  await h.sleep(400);
  await interact(); // 扯囍匾
  f = await flags();
  assert(f.finaleBroken, 'finale break failed');
  assert(f.agenda >= 5, 'agenda not at 送入洞房');
  await h.sleep(1500);
  await h.shot('p21-finale-break');

  // 出酒店去灯塔
  await tp(30, -80, -2.4);
  await h.sleep(500);
  await tp(75, -118, -2.4);
  await h.sleep(1000);
  f = await flags();
  assert(f.ended, 'ending not triggered at lighthouse');
  console.log('[verify] ending begun, checkpoint:', f.checkpoint);

  // 终局演出（海的视角 → 淡出 → 结算）——按阶段轮询 + 快进消化演出时长
  const waitStage = async (stage, timeoutMs) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const st = await page.evaluate(() => window.__game.story.endSeq?.stage ?? 99);
      if (st >= stage) return true;
      await ff(0.75);
      await h.sleep(300);
    }
    return false;
  };
  await waitStage(1, 40000);
  await h.sleep(3000);
  await h.shot('p22-fog-clears');
  await waitStage(2, 40000);
  await h.sleep(2500);
  await h.shot('p23-sea-eye');
  await waitStage(4, 90000);
  let endShown = false;
  for (let i = 0; i < 40 && !endShown; i++) {
    endShown = await page.evaluate(() =>
      document.getElementById('ending-overlay').classList.contains('show'));
    if (!endShown) { await ff(0.75); await h.sleep(300); }
  }
  await h.shot('p24-ending');
  console.log('[verify] ending overlay shown:', endShown);
  if (!endShown) throw new Error('ending overlay not shown');
  f = await flags();
  console.log('[verify] final:', JSON.stringify({ notes: f.notes, agenda: f.agenda, checkpoint: f.checkpoint }));
}
