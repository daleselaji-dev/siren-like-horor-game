// 全流程通关验证《返潮》M01：按节拍表把主线走一遍
// Normal(登记) → Measure(深度尺/走廊 12.6m) → Leak(走廊变深) → 镜子复测 → 婚宴厅
// → 录像超前现实 → 18 秒后 F01 重演 → 拿信 → 追逐 → 被抓(井演出) → 重生 → 逃出 → 回望结局
// 位移用传送加速；互动全部真实按键；长等待用 evaluate 快进演出时钟。
export async function run(page, h) {
  const flags = () => page.evaluate(() => {
    const s = window.__game.story;
    return { ...s.flags, notes: [...s.notesFound], checkpoint: s.checkpointId };
  });
  const tp = (x, z, yaw = 0) => page.evaluate(
    ({ x, z, yaw }) => window.__game.player.setPosition(x, z, yaw),
    { x, z, yaw });
  const interact = async () => { await h.tapKey('KeyE'); await h.sleep(450); };
  const closeNote = async () => { await h.tapKey('KeyE'); await h.sleep(350); };
  const waitFor = async (fn, timeoutMs, poll = 500) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (await page.evaluate(fn)) return true;
      await h.sleep(poll);
    }
    return false;
  };

  await page.click('#title-start');
  await h.sleep(2200);
  await h.shot('p00-start');
  await h.tapKey('Space'); // 跳过开场运镜
  await h.sleep(500);

  // ---- 节拍1：前庭 → 推门进楼 ----
  await tp(0, 4.2, 0);
  await h.sleep(300);
  await interact();
  let f = await flags();
  console.log('[verify] entered:', f.entered);
  if (!f.entered) throw new Error('main door not opened');
  await h.shot('p01-entered');

  // ---- 节拍2：大堂检查点 + 登记簿（听潮教学） ----
  await tp(0, -5, 0);
  await h.sleep(700);
  await tp(-7.3, -3.6, 2.2);
  await h.sleep(300);
  await interact(); // 翻登记簿 → 文书 + tutorialListen
  await h.shot('p02-registry');
  await closeNote();
  f = await flags();
  console.log('[verify] lobby cp:', f.checkpoint, '| tutorialListen:', f.tutorialListen,
    '| notes:', f.notes.join(','));
  if (!f.tutorialListen) throw new Error('registry note missed');

  // ---- 节拍3：保卫室（深度尺 / 日志 / 监控） ----
  await tp(11, -4.6, Math.PI);
  await h.sleep(300);
  await interact(); // 开保卫室门
  await tp(14.2, -8.6, 0.6);
  await h.sleep(300);
  const dbg = await page.evaluate(() => {
    const g = window.__game;
    return {
      state: g.game.state, frozen: g.player.frozen,
      prompt: g.story.findInteractable()?.prompt ?? null,
      doorOpen: g.world.isDoorOpen('security'),
      caught: !!g.story.caughtSeq, guard: g.byId.guard.state,
    };
  });
  console.log('[verify] dbg security:', JSON.stringify(dbg));
  await interact(); // 深度尺
  f = await flags();
  console.log('[verify] hasGauge:', f.hasGauge);
  if (!f.hasGauge) throw new Error('depth gauge not taken');
  await tp(13.6, -5.6, Math.PI);
  await h.sleep(300);
  await interact(); // 值班日志
  await closeNote();
  await tp(13.5, -7.9, 0);
  await h.sleep(300);
  await interact(); // 看监控（RTT 画面激活）
  await h.sleep(900);
  await h.shot('p03-monitors');
  f = await flags();
  console.log('[verify] monitorSeen:', f.monitorSeen);

  // ---- 节拍4：走廊平面图 → 测得 21.9m（图纸 12.6m） ----
  await tp(-1.0, -17.0, -1.57);
  await h.sleep(300);
  await interact();
  await h.shot('p04-measure');
  await closeNote();
  f = await flags();
  console.log('[verify] measured:', f.measured);
  if (!f.measured) throw new Error('corridor not measured');

  // ---- 节拍5：走到尽头 → 折返 → Leak（走廊变深） ----
  await tp(0, -28.6, 0);
  await h.sleep(700);
  await tp(0, -19, Math.PI);
  await h.sleep(900);
  f = await flags();
  console.log('[verify] extended:', f.extended);
  if (!f.extended) throw new Error('corridor did not extend');
  const corr = await page.evaluate(() => ({
    extended: window.__game.world.corridorExtended,
    lampCount: window.__game.world.corridorLamps.length,
  }));
  console.log('[verify] world corridor:', JSON.stringify(corr));
  await tp(0, -22, 0);
  await h.sleep(400);
  await h.shot('p05-corridor-deep');

  // ---- 节拍6：深段尽头照镜子 → 婚宴厅开门 ----
  await tp(0, -40.6, 0);
  await h.sleep(400);
  await interact();
  f = await flags();
  console.log('[verify] deepMeasured:', f.deepMeasured, '| banquetOpen:', f.banquetOpen,
    '| staffGone:', f.staffGone);
  if (!f.banquetOpen) throw new Error('banquet not opened');
  await h.shot('p06-mirror');

  // ---- 节拍7：婚宴厅 → 播放录像（超前现实） ----
  await tp(-7, -24, 1.57);
  await h.sleep(800); // 触发厅内节拍
  await h.shot('p07-banquet');
  await tp(-6.4, -22.6, 0.4);
  await h.sleep(300);
  await interact(); // 播放录像
  f = await flags();
  const evOn = await page.evaluate(() => !!window.__game.story.videoEvent);
  console.log('[verify] video started:', evOn);
  if (!evOn) throw new Error('video event not started');
  // 快进到幽灵入画段（录像里那个"还没走进来的人"）
  await page.evaluate(() => { window.__game.story.videoEvent.t = 8; });
  await h.sleep(700);
  const ghostOn = await page.evaluate(() => window.__game.story.ghost.group.visible);
  console.log('[verify] ghost in tape:', ghostOn);
  await h.shot('p08-video-ghost');
  // 快进到带尾
  await page.evaluate(() => { const s = window.__game.story; if (s.videoEvent) s.videoEvent.t = 17.95; });
  await waitFor(() => window.__game.story.flags.videoSeen, 20000, 400);
  f = await flags();
  console.log('[verify] videoSeen:', f.videoSeen);
  if (!f.videoSeen) throw new Error('video did not finish');

  // ---- 节拍8：十八秒后，现实追上录像（F01 重演） ----
  await page.evaluate(() => { // 快进等待时钟
    const s = window.__game.story;
    for (const it of s.schedule) it.t = s.elapsed;
  });
  // 玩家退到门口侧后方（他背对着走向婚台，不会看到）
  await tp(-5.2, -21.6, 2.6);
  const replay = await waitFor(() => window.__game.story.flags.replayDone, 20000, 400);
  console.log('[verify] replayDone:', replay);
  if (!replay) throw new Error('F01 replay did not begin');
  await h.sleep(2200);
  await h.shot('p09-f01-replay');
  // 等他走完脚本回到擦桌岗位（约 20s 游戏时间；低帧率下 dt 钳制拉长数倍）
  const scriptDone = await waitFor(() => {
    const g = window.__game;
    return !g.story.f01Script && g.byId.f01.state === 'WORK';
  }, 180000, 1200);
  // 若玩家在重演中被他看见转入追逐，直接跳过等待（后续节拍兼容）
  console.log('[verify] f01 script done:', scriptDone);
  const f01St = await page.evaluate(() => ({
    state: window.__game.byId.f01.state,
    mode: window.__game.byId.f01.def.workMode,
  }));
  console.log('[verify] f01 after replay:', JSON.stringify(f01St));

  // ---- 节拍9：婚台拿信 → 追逐 → 被抓（井演出） ----
  await tp(-23.0, -26.2, -2.6);
  await h.sleep(300);
  await interact(); // 拿信
  f = await flags();
  console.log('[verify] letterTaken:', f.letterTaken);
  if (!f.letterTaken) throw new Error('bride letter not taken');
  await closeNote();
  await waitFor(() => window.__game.story.flags.chase, 20000, 400);
  f = await flags();
  console.log('[verify] chase:', f.chase);
  await h.sleep(900);
  await h.shot('p10-chase');
  // 站着不跑——让他抓住：井的特写演出
  const caught = await waitFor(() => !!window.__game.story.caughtSeq, 90000, 600);
  console.log('[verify] caught by F01:', caught);
  if (!caught) throw new Error('F01 did not catch standing player');
  await h.sleep(2600); // 镜头正沉进左眼的井
  await h.shot('p11-caught-well');
  await waitFor(() => window.__game.player.dead, 40000, 500);
  await h.sleep(800);
  await h.shot('p12-death');
  const died = await page.evaluate(() => ({
    deaths: window.__game.story.deaths,
    char: document.getElementById('death-text').textContent,
  }));
  console.log('[verify] death:', JSON.stringify(died));
  // 等重生（死亡演出 4.2s 游戏时间）
  await waitFor(() => !window.__game.player.dead, 60000, 600);
  f = await flags();
  console.log('[verify] respawn at:', f.checkpoint, '| letter kept:', f.letterTaken);
  if (f.checkpoint !== 'banquet') throw new Error('respawn checkpoint wrong: ' + f.checkpoint);

  // ---- 节拍10：带信逃出大门 ----
  await tp(0, -2, Math.PI); // 大堂
  await h.sleep(300);
  await tp(0, 5.5, Math.PI); // 跨出门廊
  await h.sleep(900);
  f = await flags();
  console.log('[verify] escaped:', f.escaped);
  if (!f.escaped) throw new Error('escape not registered');
  await h.shot('p13-escaped');

  // ---- 节拍11：门口回望 → 结局 ----
  await tp(0, 29, Math.PI);
  await h.sleep(600);
  await interact();
  f = await flags();
  console.log('[verify] ended:', f.ended);
  if (!f.ended) throw new Error('ending not triggered');
  await h.sleep(4000);
  await h.shot('p14-lookback');
  // 结局演出 ≈10.5s 游戏时间 + 2.6s 淡入；低帧率下按遮罩轮询
  const endShown = await waitFor(
    () => document.getElementById('ending-overlay').classList.contains('show'),
    180000, 1000);
  console.log('[verify] ending overlay shown:', endShown);
  if (!endShown) throw new Error('ending overlay not shown');
  await h.sleep(1200);
  await h.shot('p15-ending');
  const tally = await page.evaluate(() => ({
    notes: window.__game.story.notesFound.size,
    deaths: window.__game.story.deaths,
  }));
  console.log('[verify] final tally:', JSON.stringify(tally));
}
