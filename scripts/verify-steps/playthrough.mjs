// 《返潮》全流程通关验证（传送加速位移，交互全部真实按键）
// 车站行李 → 视奸岗亭员开栅门 → 告示墙(规则) → 电话亭 → 街心公告/广播站
// → 规则一(广播望海=死/背海=活) → 堤门支线(渔民日记) → 酒店807照影 → CRT教学
// → 验户渗漏 → 规则三(空盘见手) → 保卫科钥匙(点名) → 规则二(倒计时超时=死)
// → 总闸破像 → 巨物厅母带 → 807播带 → 理册婆 → 「還」匾大破像 → 灯塔终局
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
  // 按 E 直到指定 flag 置位：1fps 下两次 E 会合并进同一帧、被关文书等上一个
  // 消费者吃掉边沿——关键交互全部改为「确认结果否则重按」
  const interactUntil = async (flag, msg) => {
    for (let i = 0; i < 6; i++) {
      const v = await page.evaluate((n) => window.__game.story.flags[n], flag);
      if (v) return;
      await h.tapKey('KeyE');
      await h.sleep(600);
    }
    const v = await page.evaluate((n) => window.__game.story.flags[n], flag);
    assert(v, msg);
  };
  // 确认文书已拾取；低帧率下 100ms 的 E 键可能没被任何一帧采样到——没拾到就重按
  const pickNote = async (id) => {
    for (let i = 0; i < 5; i++) {
      const got = await page.evaluate((n) => window.__game.story.notesFound.has(n), id);
      if (got) {
        const open = await page.evaluate(() => window.__game.game.state === 'NOTE');
        if (open) { await h.tapKey('KeyE'); await h.sleep(300); }
        return true;
      }
      await h.tapKey('KeyE');
      await h.sleep(600);
    }
    return page.evaluate((n) => window.__game.story.notesFound.has(n), id);
  };
  // 万一传送落点撞上巡逻线：快进走完引座演出并复位，把巡逻员挪到最远路点
  const ensureAlive = () => page.evaluate(() => {
    const g = window.__game;
    for (let i = 0; i < 400 && (g.story.caughtSeq || g.story.deathSeq || g.player.dead); i++) {
      g.story.updateCaught(0.4);
      g.story.updateDeath(0.4);
    }
    const pp = g.player.pos;
    for (const id of ['waiterBanquet', 'waiterLobby', 'waiterEast', 'security', 'osteo']) {
      const w = g.byId[id];
      if (!w) continue;
      w.state = 'PATROL'; w.suspectMeter = 0;
      const wps = w.def.waypoints;
      if (wps) {
        let best = 0, bestD = -1;
        for (let k = 0; k < wps.length; k++) {
          const d = (wps[k][0] - pp.x) ** 2 + (wps[k][1] - pp.z) ** 2;
          if (d > bestD) { bestD = d; best = k; }
        }
        w.pos.x = wps[best][0]; w.pos.z = wps[best][1];
        w.wpIndex = best;
      }
    }
    g.stealth.danger = 0;
    return { dead: g.player.dead, caught: !!g.story.caughtSeq };
  });

  await page.click('#title-start');
  await h.sleep(2000);
  await h.shot('p00-start');
  await h.tapKey('Space'); // 跳过开场运镜
  await h.sleep(500);

  // ---- 节拍1：长途车站 · 文书①外证凭条（长椅上的行李箱） ----
  const lug = await loc('luggage');
  await tp(lug.x, lug.z - 1.2, Math.PI);
  await h.sleep(300);
  await interact();
  await h.shot('p01-note1');
  await h.tapKey('KeyE');
  await h.sleep(300);
  assert(await pickNote('note1'), 'note1 not picked');
  let f = await flags();

  // ---- 节拍1b：牌坊栅门落闩 → 视奸岗亭员 → 小窗拨闩（议程·起雾） ----
  const tg = await loc('townGate');
  await tp(tg.x + 2.2, tg.z, Math.PI / 2); // 站门外，面朝栅门(-x)
  await h.sleep(300);
  await interact(); // 推门（落闩）
  await h.shot('p02-towngate-latched');
  f = await flags();
  assert(f.sightjackTip, 'sightjack tip not shown at town gate');
  // 视奸岗亭员：他整夜盯着闩杆
  await tp(45.2, 4.2, 0.8);
  await h.sleep(200);
  await h.tapKey('KeyQ');
  await h.sleep(400);
  for (let i = 0; i < 10; i++) {
    const label = await page.evaluate(() => window.__game.sightjack.current?.label);
    if (label === '岗亭员') break;
    await h.tapKey('KeyQ');
    await h.sleep(250);
  }
  await ff(2.5); // 视奸读秒 → 获知闩杆位置
  await h.shot('p03-sightjack-booth');
  f = await flags();
  assert(f.knowLatch, 'latch spot not learned from booth sightjack');
  await h.tapKey('KeyW'); // 退出视奸
  await h.sleep(300);
  const bw = await loc('boothWindow');
  await tp(bw.x - 0.4, bw.z, -Math.PI / 2);
  await h.sleep(300);
  await interactUntil('townGateOpen', 'town gate not opened');
  await h.sleep(1200);
  await h.shot('p04-towngate-open');
  f = await flags();
  assert(f.agenda >= 0, 'agenda not at 起雾');

  // ---- 节拍2：告示墙(文书②规则) → 电话亭 → 街心公告(③) → 广播站(④) ----
  const rb = await loc('ruleBoard');
  await tp(rb.x, rb.z - 1.4, Math.PI);
  await h.sleep(300);
  await interact();
  await h.shot('p05-ruleboard');
  await h.tapKey('KeyE');
  await h.sleep(200);
  assert(await pickNote('note9'), 'note9 (rules) not picked');
  // 电话亭：走近它会响
  const pb = await loc('phoneBooth');
  await tp(pb.x, pb.z + 3.0, Math.PI);
  await h.sleep(400);
  await ff(2); // 响铃计时
  const ringing = await page.evaluate(() => window.__game.story.flags.phoneRinging);
  assert(ringing, 'street phone never rang');
  await tp(pb.x, pb.z - 1.2, 0);
  await h.sleep(300);
  await interactUntil('phoneAnswered', 'street phone not answered');
  await h.shot('p06-phone');
  // 街心公告栏（文书③）
  const nb = await loc('noticeBoard');
  await tp(nb.x, nb.z + 1.6, Math.PI);
  await h.sleep(300);
  await interact();
  await h.shot('p07-notice');
  await h.tapKey('KeyE');
  await h.sleep(200);
  assert(await pickNote('note3'), 'note3 not picked');
  f = await flags();
  assert(f.knowHotel, 'knowHotel not set');
  // 广播站（文书④）
  const radio = await loc('radio');
  await tp(radio.x - 0.8, radio.z + 1.0, 2.6);
  await h.sleep(300);
  await interact();
  await h.shot('p08-radio');
  await h.tapKey('KeyE');
  await h.sleep(300);
  assert(await pickNote('note4'), 'note4 not picked');

  // ---- 节拍2b：规则一验证 · 广播报时（背海=活，望海=死→检查点） ----
  // 站上前街空地，面朝内陆（岛心方向），等镇广播
  await tp(30, -2, Math.PI / 2); // 面朝 -x（背海）
  await h.sleep(300);
  const waitBroadcast = async () => {
    for (let i = 0; i < 40; i++) {
      const on = await page.evaluate(() => window.__game.story.broadcastT > 0);
      if (on) return true;
      await ff(6);
      await h.sleep(120);
    }
    return false;
  };
  assert(await waitBroadcast(), 'town broadcast never fired (compliance test)');
  await ff(9); // 背海站完整个广播窗口——无事
  f = await flags();
  assert(!f.ruleSeaViolated, 'rule-sea false positive while facing inland');
  const alive1 = await page.evaluate(() => !window.__game.player.dead);
  assert(alive1, 'died while complying with rule-sea');
  console.log('[verify] rule-sea compliance OK');
  // 第二次广播：故意面朝海 → 强制视奸 → 引座（检查点重置）
  assert(await waitBroadcast(), 'second town broadcast never fired (violation test)');
  await page.evaluate(() => { const p = window.__game.player; p.yaw = -Math.PI / 2; p.pitch = 0; }); // 面朝 +x（海）
  await ff(3); // 凝视累计 → 视线被接走
  await h.sleep(500);
  await h.shot('p09-rule-sea');
  await h.sleep(2400); // forceView 2.2s + 引座
  for (let i = 0; i < 30; i++) {
    const dead = await page.evaluate(() => window.__game.player.dead);
    if (dead) break;
    await h.sleep(400);
  }
  f = await flags();
  assert(f.ruleSeaViolated >= 1, 'rule-sea violation not registered');
  // 快进走完死亡演出 → 检查点重生
  await ensureAlive();
  const alive2 = await page.evaluate(() => !window.__game.player.dead);
  assert(alive2, 'did not respawn after rule-sea death');
  console.log('[verify] rule-sea violation → seated → respawn OK');

  // ---- 节拍2c：堤门支线 · 渔寮渔民日记（文书⑩） ----
  const gate = await loc('gate');
  await tp(gate.x, gate.z - 2.2, Math.PI); // 镇侧，面朝堤门(+z)
  await h.sleep(300);
  await interactUntil('gateOpen', 'dike gate not opened from town side');
  await h.sleep(800);
  await h.shot('p10-dikegate-open');
  const n2 = await loc('note2');
  await tp(n2.x + 0.5, n2.z + 0.8, 0.4);
  await h.sleep(300);
  await interact();
  await h.tapKey('KeyE');
  await h.sleep(200);
  assert(await pickNote('note2'), 'note2 not picked');

  // ---- 节拍3：进酒店 → 大堂(议程·收港/CRT上电) → 登记簿(⑥) → 807 照影 ----
  await tp(-4, -42, 0, 3.5);
  await h.sleep(800); // hotelFront 触发
  await h.shot('p11-hotel-front');
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
  await h.shot('p12-lobby-full');
  await ensureAlive();
  const reg = await loc('registry');
  await tp(reg.x + 1.2, reg.z, 1.57, 3.5);
  await h.sleep(300);
  await interact();
  await h.tapKey('KeyE');
  await h.sleep(200);
  assert(await pickNote('note5'), 'note5 not picked');
  // 上 3F 807（传送模拟走楼梯）
  const dresser = await loc('dresser807');
  await tp(dresser.x + 1.4, dresser.z + 1.6, -2.4, 10.3);
  await h.sleep(400);
  await interactUntil('metBride', 'bride scene not started');
  await h.shot('p13-bride-scene');
  let gotMirror = false;
  for (let i = 0; i < 40 && !gotMirror; i++) {
    gotMirror = await page.evaluate(() => window.__game.story.flags.hasMirror);
    if (!gotMirror) { await ff(0.75); await h.sleep(250); }
  }
  assert(gotMirror, 'mirror not given');

  // ---- 节拍4：服务走廊 CRT 教学 → 员工须知(⑤) → 宴会厅验户 = 返潮点火 ----
  await ensureAlive();
  const crtc = await loc('crtCorridor');
  await tp(crtc.x - 0.3, crtc.z + 1.6, Math.PI, 3.5);
  await h.sleep(400);
  await interactUntil('crtTip', 'crt tutorial missed');
  await h.shot('p14-crt-foretell');
  const sn = await loc('staffNotice');
  await tp(sn.x, sn.z + 1.2, Math.PI, 3.5);
  await h.sleep(300);
  await interact();
  await h.tapKey('KeyE');
  await h.sleep(200);
  assert(await pickNote('note10'), 'note10 (staff rules) not picked');
  // 进宴会厅触发验户（议程收声 2.4s 后 applyStage → 渗漏）
  await tp(-14, -56, 0.6, 3.5);
  await h.sleep(1200);
  await ff(4);
  const leaked = await waitFlag('leaked', 30000);
  assert(leaked, 'leak not fired after toast');
  await h.sleep(1500);
  await h.shot('p15-leak-banquet');

  // ---- 节拍4b：规则三验证 · 空托盘侍应见手（立=警觉，蹲=消疑） ----
  const tray = await page.evaluate(() => {
    const g = window.__game;
    const w = g.byId.waiterBanquet;
    // 违反：起疑的空盘侍应 + 玩家立着亮手 → 直接警觉
    g.player.crouching = false;
    w.state = 'SUSPECT'; w.suspectMeter = 0.2;
    g.story.updateRuleTray(0.3);
    const violated = g.story.flags.ruleTraySeen > 0 && w.state === 'ALERT';
    // 遵守：蹲下收手 → 疑心消退
    w.state = 'SUSPECT'; w.suspectMeter = 0.1;
    g.player.crouching = true;
    for (let i = 0; i < 14; i++) g.story.updateRuleTray(0.3);
    const complied = w.suspectMeter <= 0.011;
    g.player.crouching = false;
    w.state = 'PATROL'; w.suspectMeter = 0;
    g.stealth.danger = 0;
    return { violated, complied };
  });
  console.log('[verify] rule-tray:', JSON.stringify(tray));
  assert(tray.violated, 'rule-tray violation did not trigger alert');
  assert(tray.complied, 'rule-tray crouch did not clear suspicion');
  await ensureAlive();

  // ---- 节拍5：保卫科(⑦) → 钥匙柜=CRT点名 → 规则二超时(死) → 总闸破像 ----
  const desk = await loc('securityDesk');
  await tp(desk.x - 1.2, desk.z + 1.2, 2.4, 6.9);
  await h.sleep(400);
  await interact();
  await h.tapKey('KeyE');
  await h.sleep(200);
  assert(await pickNote('note6'), 'note6 not picked');
  const kc = await loc('keyCabinet');
  await tp(kc.x, kc.z + 1.3, Math.PI, 6.9);
  await h.sleep(300);
  await interactUntil('hasAquaKey', 'aqua key not taken');
  f = await flags();
  assert(f.namedByCrt, 'not named by CRT');
  await h.sleep(1500);
  await h.shot('p16-named-by-crt');
  // 规则二：故意耗完倒计时 → 录像播完=引座
  await ff(85);
  await h.sleep(500);
  f = await flags();
  assert(f.ruleNameExpired >= 1, 'rule-name countdown expiry not registered');
  await h.shot('p17-rule-name-expired');
  await ensureAlive(); // 死亡演出 → 检查点(named)重生，倒计时重置
  const cd = await page.evaluate(() => window.__game.story.nameCountdown);
  assert(cd > 60, 'name countdown not reset on respawn, got ' + cd);
  console.log('[verify] rule-name expiry → seated → respawn, countdown reset to', cd);
  // 这次在时限内赶到一楼配电间拉总闸
  const brk = await loc('mainBreaker');
  await tp(brk.x - 1.2, brk.z, 1.57, 3.5);
  await h.sleep(300);
  await interactUntil('imageBroken', 'image not broken');
  await h.shot('p18-image-broken');
  const crtBroken = await page.evaluate(() => window.__game.crt.broken > 0);
  console.log('[verify] crt static:', crtBroken);

  // ---- 节拍6：大堂上宾振动潜行 → 玻璃连廊 → 巨物厅 → 处理间母带(⑧) ----
  const guestOn = await page.evaluate(() => window.__game.guest.enabled);
  assert(guestOn, 'honored guest not enabled');
  await tp(-4, -54, Math.PI, 3.5);
  await h.tapKey('ShiftLeft');
  await page.evaluate(() => { window.__game.player.crouching = true; });
  await h.holdKey('KeyS', 2200);
  await page.evaluate(() => { window.__game.player.crouching = false; });
  const vib = await page.evaluate(() => window.__game.stealth.vibration.toFixed(2));
  console.log('[verify] vibration after carpet crouch:', vib);
  await h.shot('p19-lobby-guest');
  // 玻璃连廊 → 海洋馆售票厅 → 主展厅（巨物残骸）
  await tp(16, -50, 1.57, 3.5);
  await h.sleep(700); // annex 触发
  await ensureAlive(); // 理骨员挪到最远巡逻点
  await tp(40, -49, -0.9, 3.5);
  await h.sleep(600);
  await ff(1); // aquaMain 触发
  await h.shot('p20-mainhall-skeleton');
  // 标本牌（气氛互动）
  const sp = await loc('specimenPlate');
  await tp(sp.x, sp.z + 1.0, Math.PI, 3.5);
  await h.sleep(300);
  await interact();
  // 处理间：母带铁柜（文书⑧）
  await ensureAlive();
  const tape = await loc('tapeCabinet');
  await tp(tape.x - 1.2, tape.z + 0.6, 2.0, 3.5);
  await h.sleep(300);
  await interact();
  await h.shot('p21-tape-note');
  await h.tapKey('KeyE');
  await h.sleep(300);
  assert(await pickNote('note7'), 'note7 not picked');
  f = await flags();
  assert(f.hasTape, 'tape not taken');
  assert(f.agenda >= 4, 'agenda not at 熄灯');

  // ---- 节拍7：回 807 播母带(⑨/空名规则) → 理册婆追逐 ----
  const tv = await loc('tv807');
  await tp(tv.x + 1.4, tv.z + 1.0, -2.2, 10.3);
  await h.sleep(400);
  await interactUntil('tapeSeen', 'tape playback not started');
  await h.sleep(1000);
  await h.shot('p22-tape-play');
  let noteOpened = false;
  for (let i = 0; i < 40; i++) {
    noteOpened = await page.evaluate(() => window.__game.game.state === 'NOTE');
    if (noteOpened) break;
    await ff(0.75);
    await h.sleep(250);
  }
  assert(noteOpened, 'note8 never opened during tape');
  await h.shot('p23-note8');
  await h.tapKey('KeyE'); // 合上 → 演出尾声
  let chase = false;
  for (let i = 0; i < 40 && !chase; i++) {
    chase = await page.evaluate(() => window.__game.story.flags.matronChase);
    if (!chase) { await ff(0.75); await h.sleep(250); }
  }
  assert(chase, 'matron chase not started');
  await h.sleep(800);
  await h.shot('p24-matron-chase');

  // ---- 节拍8：下宴会厅扯「還」字金匾(大破像) → 灯塔终局 ----
  await page.evaluate(() => {
    const g = window.__game;
    g.stealth.danger = 0;
    for (const e of g.enemies) { if (e.state === 'ALERT') { e.state = 'SEARCH'; e.searchTarget = null; } }
  });
  const mic = await loc('stageMic');
  await tp(mic.x, mic.z + 0.4, Math.PI, 4.0);
  await h.sleep(400);
  await interactUntil('finaleBroken', 'finale break failed');
  f = await flags();
  assert(f.agenda >= 5, 'agenda not at 还地');
  await h.sleep(1500);
  await h.shot('p25-finale-break');

  // 出酒店去灯塔
  await tp(30, -80, -2.4);
  await h.sleep(500);
  await tp(75, -118, -2.4);
  await h.sleep(1000);
  f = await flags();
  assert(f.ended, 'ending not triggered at lighthouse');
  console.log('[verify] ending begun, checkpoint:', f.checkpoint);

  // 终局演出（海的视角 → 淡出 → 结算）
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
  await h.shot('p26-fog-clears');
  await waitStage(2, 40000);
  await h.sleep(2500);
  await h.shot('p27-sea-eye');
  await waitStage(4, 90000);
  let endShown = false;
  for (let i = 0; i < 40 && !endShown; i++) {
    endShown = await page.evaluate(() =>
      document.getElementById('ending-overlay').classList.contains('show'));
    if (!endShown) { await ff(0.75); await h.sleep(300); }
  }
  await h.shot('p28-ending');
  console.log('[verify] ending overlay shown:', endShown);
  if (!endShown) throw new Error('ending overlay not shown');
  f = await flags();
  console.log('[verify] final:', JSON.stringify({
    notes: f.notes, agenda: f.agenda, checkpoint: f.checkpoint,
    ruleSeaViolated: f.ruleSeaViolated, ruleNameExpired: f.ruleNameExpired, ruleTraySeen: f.ruleTraySeen,
  }));
  assert(f.notes >= 10, 'not all 10 notes picked, got ' + f.notes);
  assert(f.ruleSeaViolated >= 1 && f.ruleNameExpired >= 1 && f.ruleTraySeen >= 1,
    'rule validations incomplete');
}
