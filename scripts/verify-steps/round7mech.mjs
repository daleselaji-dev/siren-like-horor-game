// 轮11取证：两个新箱庭机制
//   ① 手提录音机 + 对照磁带：在录下它的地方回放 → 听出对不上的 → 奖励点亮起
//   ② 配电间保险丝板：三路分闸可拔可插——断电堂口敌人视程打六折（黑暗即行装）
export async function run(page, h) {
  await page.click('#title-start');
  await h.sleep(1500);
  await h.tapKey('Space');
  await h.sleep(400);

  // ---------- 1. 录音机拾取（2F 棋牌室，真实互动路径） ----------
  const rec = await page.evaluate(() => {
    const g = window.__game;
    const l = g.world.locations.recorder;
    g.player.setPosition(l.x - 0.6, l.z + 0.8, Math.PI * 0.85, l.y);
    g.player.syncCamera(0);
    const it = g.story.findInteractable();
    return { id: it?.id ?? null, prompt: it?.prompt ?? null };
  });
  console.log('[verify] recorder interactable:', JSON.stringify(rec));
  if (rec.id !== 'toolRecorder') throw new Error('recorder interactable not found: ' + JSON.stringify(rec));
  await h.tapKey('KeyE');
  await h.sleep(500);
  const recGot = await page.evaluate(() => ({
    has: window.__game.tools.hasRecorder,
    tapes: window.__game.tools.tapesOwned.length,
  }));
  console.log('[verify] recorder pickup:', JSON.stringify(recGot));
  if (!recGot.has || recGot.tapes !== 1) throw new Error('recorder pickup failed');
  await h.shot('r7-01-recorder-pickup');

  // 磁带②③拾取（直接调用互动 act）
  const tapes = await page.evaluate(() => {
    const g = window.__game;
    const grab = (locKey, id) => {
      const l = g.world.locations[locKey];
      g.player.setPosition(l.x, l.z - 0.6, 0, l.y);
      const it = g.story.findInteractable();
      if (it?.id === id) { it.act(); return true; }
      return false;
    };
    const t2 = grab('videoHall', 'tape2');
    const t3 = grab('aquaOffice', 'tape3');
    return { t2, t3, owned: g.tools.tapesOwned.map((t) => t.id) };
  });
  console.log('[verify] tapes:', JSON.stringify(tapes));
  if (!tapes.t2 || !tapes.t3 || tapes.owned.length !== 3) throw new Error('tape pickups failed: ' + JSON.stringify(tapes));

  // ---------- 2. 平放（不在对照点）：只给提示，不消带 ----------
  const plain = await page.evaluate(() => {
    const g = window.__game;
    g.player.setPosition(74, 2, 0, 3.4); // 镇口公路——三个对照点都不在
    const ok = g.tools.playTape();
    return { ok, done: g.tools.tapesOwned.filter((t) => t.done).length, cd: g.tools.tapePlayT > 0 };
  });
  console.log('[verify] plain playback:', JSON.stringify(plain));
  if (!plain.ok || plain.done !== 0 || !plain.cd) throw new Error('plain playback wrong: ' + JSON.stringify(plain));

  // ---------- 3. 宴会厅对照：数出第九副碗 → 上宾席奖励 ----------
  const cmp1 = await page.evaluate(() => {
    const g = window.__game;
    const l = g.world.locations.banquetCenter;
    g.player.setPosition(l.x, l.z, 0, l.y);
    g.tools.tapePlayT = 0;
    const ok = g.tools.playTape();
    return { ok, cmp: !!g.story.flags.tapeCmp1 };
  });
  console.log('[verify] banquet compare:', JSON.stringify(cmp1));
  if (!cmp1.ok || !cmp1.cmp) throw new Error('banquet tape compare failed');
  await h.sleep(400);
  await h.shot('r7-02-banquet-compare');
  const rw1 = await page.evaluate(() => {
    const g = window.__game;
    const before = g.tools.bulbs;
    const l = g.world.locations.guestSeat;
    g.player.setPosition(l.x + 0.5, l.z + 0.9, 0.5, l.y);
    const it = g.story.findInteractable();
    if (it?.id !== 'tapeR1') return { id: it?.id ?? null };
    it.act();
    return { id: it.id, gained: g.tools.bulbs - before };
  });
  console.log('[verify] reward1:', JSON.stringify(rw1));
  if (rw1.id !== 'tapeR1' || rw1.gained !== 2) throw new Error('guest seat reward failed: ' + JSON.stringify(rw1));

  // ---------- 4. 筒子楼/告示墙对照 + 奖励 ----------
  const cmp23 = await page.evaluate(() => {
    const g = window.__game;
    const play = (locKey) => {
      const l = g.world.locations[locKey];
      g.player.setPosition(l.x, l.z, 0, l.y);
      g.tools.tapePlayT = 0;
      return g.tools.playTape();
    };
    const ok2 = play('dorm');
    const ok3 = play('ruleBoard');
    g.story.notesFound.add('note9'); // 奖励③要求先读过告示
    const grab = (locKey, id) => {
      const l = g.world.locations[locKey];
      g.player.setPosition(l.x, l.z - 0.5, 0, l.y);
      const it = g.story.findInteractable();
      if (it?.id === id) { it.act(); return true; }
      return it?.id ?? false;
    };
    const clocksBefore = g.tools.clocks, limeBefore = g.tools.lime;
    const r2 = grab('dormBook2', 'tapeR2');
    const r3 = grab('ruleBoard', 'tapeR3');
    return {
      ok2, ok3, cmp2: !!g.story.flags.tapeCmp2, cmp3: !!g.story.flags.tapeCmp3,
      r2, r3, clocksGain: g.tools.clocks - clocksBefore, limeGain: g.tools.lime - limeBefore,
      tapesLeft: g.tools.tapesOwned.filter((t) => !t.done).length,
    };
  });
  console.log('[verify] compare 2/3 + rewards:', JSON.stringify(cmp23));
  if (!cmp23.cmp2 || !cmp23.cmp3) throw new Error('tape compares 2/3 failed');
  if (cmp23.r2 !== true || cmp23.r3 !== true) throw new Error('rewards 2/3 failed: ' + JSON.stringify(cmp23));
  if (cmp23.clocksGain !== 1 || cmp23.limeGain !== 2) throw new Error('reward amounts wrong');
  if (cmp23.tapesLeft !== 0) throw new Error('tapes not consumed');

  // ---------- 5. 保险丝板：拔大堂一路（真实按键 1） ----------
  const panel = await page.evaluate(() => {
    const g = window.__game;
    const l = g.world.locations.fusePanel;
    g.player.setPosition(l.x - 0.3, l.z + 1.0, Math.PI, l.y);
    g.player.syncCamera(0);
    const it = g.story.findInteractable();
    if (it?.id !== 'fusePanel') return { id: it?.id ?? null };
    it.act();
    return { id: it.id, open: g.power.panelOpen, zones: g.power.zones.map((z) => `${z.id}:${z.lights.length}灯`) };
  });
  console.log('[verify] fuse panel:', JSON.stringify(panel));
  if (panel.id !== 'fusePanel' || !panel.open) throw new Error('fuse panel not opened: ' + JSON.stringify(panel));
  const zoneLightCounts = await page.evaluate(() => window.__game.power.zones.map((z) => z.lights.length));
  console.log('[verify] zone light counts:', JSON.stringify(zoneLightCounts));
  if (zoneLightCounts.some((n) => n < 2)) throw new Error('zone light classification too thin: ' + JSON.stringify(zoneLightCounts));
  await h.tapKey('Digit1');
  await h.sleep(300);
  const pulled = await page.evaluate(() => {
    const g = window.__game;
    const z = g.power.zones[0];
    return {
      on: z.on, spare: g.power.spare,
      powerK: z.lights.map((hl) => hl.powerK ?? 1).join(''),
      hudBar: document.getElementById('tools-bar').textContent.includes('保险丝'),
    };
  });
  console.log('[verify] pulled lobby fuse:', JSON.stringify(pulled));
  if (pulled.on || pulled.spare !== 1) throw new Error('fuse pull failed: ' + JSON.stringify(pulled));
  if (/[^0]/.test(pulled.powerK)) throw new Error('lobby lights still powered: ' + pulled.powerK);
  if (!pulled.hudBar) throw new Error('fuse row missing from HUD bar');

  // 断电大堂：敌人视程打六折
  const sightK = await page.evaluate(() => {
    const g = window.__game;
    const hi = g.world.dynamic.hotelInfo;
    g.player.setPosition(hi.origin.x, hi.origin.z + 5, Math.PI, hi.origin.y + 0.5);
    g.player.syncCamera(0);
    const inDark = g.power.playerSightK();
    g.player.setPosition(74, 2, 0, 3.4); // 镇口（不在任何分区）
    const outside = g.power.playerSightK();
    return { inDark, outside };
  });
  console.log('[verify] sight factor:', JSON.stringify(sightK));
  if (sightK.inDark !== 0.6 || sightK.outside !== 1) throw new Error('sight factor wrong: ' + JSON.stringify(sightK));
  // 拍断电的大堂（从门斗朝里看——只剩天光和应急电）
  await page.evaluate(() => {
    const g = window.__game;
    const hi = g.world.dynamic.hotelInfo;
    g.player.setPosition(hi.origin.x, hi.origin.z + 9, Math.PI, hi.origin.y + 0.5);
    g.player.yaw = Math.PI;
    g.player.syncCamera(0);
  });
  await h.sleep(600);
  await h.shot('r7-03-lobby-dark');

  // ---------- 6. 插回 + 厨房备品保险丝 ----------
  const refit = await page.evaluate(() => {
    const g = window.__game;
    const l = g.world.locations.fusePanel;
    g.player.setPosition(l.x - 0.3, l.z + 1.0, Math.PI, l.y);
    g.power.openPanel(l);
    g.power.toggle(0); // 插回大堂
    const back = g.power.zones[0].on && g.power.spare === 0;
    const k = g.world.locations.kitchen;
    g.player.setPosition(k.x, k.z - 0.5, 0, k.y);
    const it = g.story.findInteractable();
    let fuseGot = false;
    if (it?.id === 'toolFuse') { it.act(); fuseGot = g.power.spare === 1; }
    return { back, fuseGot, itId: it?.id ?? null };
  });
  console.log('[verify] refit + kitchen fuse:', JSON.stringify(refit));
  if (!refit.back || !refit.fuseGot) throw new Error('refit/kitchen fuse failed: ' + JSON.stringify(refit));

  console.log('[verify] round7 mechanics all pass');
}
