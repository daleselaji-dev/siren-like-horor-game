// 精选交付图生成器（FULLSPEC 专用）：一次跑完全部箱庭/材质/人物/工具/异化态/主怪机位，
// 直接落盘 verify/keep/。与散落各轮的取证脚本相比：
//   ① 帧感知等待——传送后等渲染器真的画出新机位（SwiftShader ~1fps 下固定 sleep 会拍到旧帧）
//   ② 截图前清字幕——低帧率下游戏时间慢一个量级，「已跳过开场」等提示会滞留串进画面
// 事件类瞬间（规则死亡/破像/结局结算/开场运镜）无法静态摆拍，由 playthrough/intro/smoke 的
// FULLSPEC 输出复制补齐（见 README 验证段落）。
export async function run(page, h) {
  await page.click('#title-start');
  await h.sleep(1500);
  await h.tapKey('Space');
  await h.sleep(400);
  // 人物近景要等照片脸皮烘焙完
  await page.waitForFunction(() => window.__facesReady === true, { timeout: 300000, polling: 1000 });

  const frames = (n) => page.evaluate((k) => new Promise((res) => {
    let i = 0;
    const t0 = performance.now();
    const tick = () => {
      if (++i >= k || performance.now() - t0 > 15000) res();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), n);

  const look = async (name, px, pz, tx, tz, yHint, pitch = 0) => {
    await page.evaluate(({ px, pz, tx, tz, yHint, pitch }) => {
      const g = window.__game;
      const yaw = Math.atan2(-(tx - px), -(tz - pz));
      g.player.setPosition(px, pz, yaw, yHint);
      g.player.pitch = pitch;
      g.player.syncCamera(0);
    }, { px, pz, tx, tz, yHint, pitch });
    await frames(3); // 等新机位真的渲染出来
    await page.evaluate(() => window.__game.hud.clearSubtitles());
    await h.shot(`keep/${name}`);
  };

  // ---------- A. 镇区常态（箱庭外景 + 照相馆） ----------
  await look('02_busstation', 63, 1.5, 52, 3.5);
  await look('03_town_archway', 47.5, 0, 40, 0);
  await look('04_front_street', 38, -1, 24, -5);
  await look('05_video_hall', 26, -1.5, 30.5, 3);
  await look('06_rule_board', 41.6, 1.4, 41.6, 3.6);
  await look('07_photo_studio', 12.6, 0.9, 15.2, 4.6);
  await look('08_darkroom', 12.95, 3.9, 11.7, 4.9, undefined, -0.12);
  await look('09_signpost', 9.2, -6.5, 10.5, -4.5);

  // ---------- B. 家属筒子楼（可进可探） ----------
  const { b1f1, b1f2, b1rf, b2f1 } = await page.evaluate(() => {
    const w = window.__game.world;
    const base1 = w.heightAt(-37, 32), base2 = w.heightAt(-37, 7);
    return { b1f1: base1 + 0.42, b1f2: base1 + 3.1, b1rf: base1 + 5.8, b2f1: base2 + 0.42 };
  });
  await look('10_dorm_alley', -26, 19, -37, 21);
  await look('11_dorm_102_table', -41.2, 23.5, -40.5, 24.7, b1f1, -0.3);
  await look('12_dorm_2f_corridor', -28.6, 22.2, -42, 22.4, b1f2);
  await look('13_dorm_203_lit', -38.5, 24.6, -36.3, 23.8, b1f2, -0.28);
  await look('14_dorm_roof_view', -33, 27.5, -20, 5, b1rf);
  await look('15_dorm_104_bowl', -34.7, 11.7, -34.1, 12.9, b2f1, -0.28);

  // ---------- C. 南方大酒店（阈限序列 + 各厅室） ----------
  await look('16_hotel_facade', -4, -32, -4, -46, 3.5);
  await look('17_vestibule', -4, -45.6, -4, -52, 3.5);
  await look('18_lobby_desk', -2, -47, -10, -52, 3.5);
  await look('19_lobby_up', -4, -50, -4, -46, 3.5, 0.5);
  await look('20_banquet_stage', -13, -58, -16.5, -64.6, 3.5);
  await look('21_service_dado', -9, -65.5, 2, -65.5, 3.5);
  await look('22_stairwell', 8.2, -54.6, 11.5, -56.6, 3.5);
  await look('23_security_9crt', 7.5, -62, 10.5, -66, 6.9);
  await look('24_suite_807_bride', -12, -60, -13.5, -64.6, 10.3);

  // ---------- D. 海洋馆（巨物厅 + 处理间） ----------
  await look('25_skeleton_wide', 37, -46, 44, -52, 3.5);
  await look('26_skeleton_skull', 35.9, -50.1, 37.6, -52.2, 3.5);
  await look('27_processing_room', 49.5, -55.5, 52.5, -57, 3.5);

  // ---------- E. 工位人物近景 ----------
  await look('28_emcee_close', -14.9, -63.0, -16.5, -64.6, 3.5);
  const wp = await page.evaluate(() => {
    const w = window.__game.byId.waiterBanquet;
    const orig = { x: w.pos.x, z: w.pos.z, yaw: w.yaw };
    w.pos.set(-13.6, w.pos.y, -47.4);
    w.yaw = Math.atan2(-12.2 - -13.6, -46.2 - -47.4);
    w.state = 'PAUSE'; w.stateTimer = -9;
    w.syncBody(0);
    return orig;
  });
  await look('29_waiter_close', -12.2, -46.2, -13.6, -47.4, 3.5);
  await page.evaluate((orig) => {
    const w = window.__game.byId.waiterBanquet;
    w.pos.set(orig.x, w.pos.y, orig.z);
    w.yaw = orig.yaw; w.stateTimer = 0; w.state = 'PATROL';
  }, wp);
  await page.evaluate(() => {
    const g = window.__game;
    const m = g.byId.matron;
    m.setEnabled(true);
    m.pos.set(-8, 0, -55.5);
    m.pos.y = g.world.heightAt(-8, -55.5, 10.3);
    m.yaw = Math.PI / 2;
    m.state = 'PAUSE'; m.stateTimer = -9;
    m.syncBody(0);
  });
  await look('30_matron_close', -6.2, -55.5, -8, -55.5, 10.3);
  await page.evaluate(() => window.__game.byId.matron.setEnabled(false));
  const bp = await page.evaluate(() => {
    const p = window.__game.byId.booth.pos;
    return { x: p.x, z: p.z };
  });
  await look('31_booth_close', bp.x - 1.4, bp.z - 0.6, bp.x, bp.z);
  const op = await page.evaluate(() => {
    const p = window.__game.byId.osteo.pos;
    return { x: p.x, z: p.z };
  });
  await look('32_osteo_close', op.x + 1.5, op.z + 1.5, op.x, op.z, 3.5);

  // ---------- F. 反击工具三件套（大堂摆拍） ----------
  // 镁光闪：侍应追击中被拍——捂眼定身
  await page.evaluate(() => {
    const g = window.__game;
    const e = g.byId.waiterLobby;
    const hi = g.world.dynamic.hotelInfo;
    g.tools.hasCamera = true; g.tools.bulbs = 3; g.tools.clocks = 2; g.tools.lime = 3;
    g.tools.flashCd = 0;
    e.pos.set(hi.origin.x, 0, hi.origin.z + 8);
    e.pos.y = g.world.heightAt(e.pos.x, e.pos.z, hi.origin.y + 0.5);
    g.player.setPosition(hi.origin.x, hi.origin.z + 4, Math.PI, hi.origin.y + 0.5);
    g.player.yaw = Math.atan2(-(e.pos.x - g.player.pos.x), -(e.pos.z - g.player.pos.z));
    g.player.pitch = 0;
    g.player.syncCamera(0);
    e.enterAlert(g.player, null, () => {});
    g.tools.flash();
  });
  await frames(3);
  await page.evaluate(() => window.__game.hud.clearSubtitles());
  await h.shot('keep/33_flash_stun');
  // 发条闹钟：响铃 + 被钓来的侍应
  const cpos = await page.evaluate(() => {
    const g = window.__game;
    const e = g.byId.waiterLobby;
    e.reset(); e.setEnabled(true);
    g.player.setPosition(e.pos.x + 5, e.pos.z + 5, 0.8, e.pos.y + 0.5);
    g.tools.placeClock();
    const c = g.tools.activeClocks[g.tools.activeClocks.length - 1];
    for (let i = 0; i < 8; i++) g.tools.update(0.5); // 上弦→响
    const ctx = {
      player: g.player, dt: 0.25, audio: null, envSightFactor: 1,
      noiseEvents: [], onCaught: () => {}, onAlerted: () => {},
    };
    for (let i = 0; i < 16; i++) e.update(ctx); // 钓过来几步
    return { x: c.x, z: c.z, y: e.pos.y };
  });
  await look('34_clock_ringing', cpos.x + 1.7, cpos.z + 1.7, cpos.x, cpos.z, cpos.y + 0.5, -0.42);
  // 贝灰线：界前站定的僵持
  await page.evaluate(() => {
    const g = window.__game;
    const e = g.byId.waiterLobby;
    e.reset(); e.setEnabled(true);
    const hi = g.world.dynamic.hotelInfo.origin;
    g.player.setPosition(hi.x, hi.z + 3, Math.PI, hi.y + 0.5);
    g.player.yaw = Math.PI;
    g.player.pitch = -0.34;
    g.tools.pourLime();
    e.pos.set(hi.x, 0, hi.z + 7);
    e.pos.y = g.world.heightAt(hi.x, hi.z + 7, g.player.pos.y);
    e.enterAlert(g.player, null, () => {});
    const ctx = {
      player: g.player, dt: 0.25, audio: null, envSightFactor: 1,
      noiseEvents: [], onCaught: () => {}, onAlerted: () => {},
    };
    for (let i = 0; i < 24; i++) e.update(ctx); // 走到界前站定
    g.player.syncCamera(0);
  });
  await frames(3);
  await page.evaluate(() => window.__game.hud.clearSubtitles());
  await h.shot('keep/35_lime_standoff');
  await page.evaluate(() => {
    const g = window.__game;
    g.byId.waiterLobby.reset();
    g.tools.limeLines.length = 0;
    g.world.dynamic.limeLines.length = 0;
    g.tools.activeClocks.length = 0;
  });

  // ---------- G. 返潮异化态（验户点火后的镇区） ----------
  await page.evaluate(() => {
    const g = window.__game;
    g.agenda.advanceTo(3);
    g.ocean.blood = 0.95;
    g.sky.blood = 0.95;
  });
  await h.sleep(1200);
  await look('36_leak_ridge', -2, -16, -3, -30, undefined, -0.08);
  await look('37_leak_ridge_door', -3, -21.5, -3, -27, undefined, -0.04);
  await look('38_leak_chairs_sea', 11.5, -4.5, 26, -4.5, undefined, -0.1);
  await look('39_leak_chairs_shoes', 29.2, -3.2, 16, -4.5, undefined, -0.24);
  await look('40_leak_crt_cairn', -7.5, -18.2, -7.5, -22.8, undefined, -0.12);
  await page.evaluate(() => {
    const g = window.__game;
    const e = g.byId.wetcomer1;
    e.pos.x = 19; e.pos.z = -25;
    e.pos.y = g.world.heightAt(19, -25, 1);
    e.targetYaw = e.yaw = Math.PI;
    e.syncBody(0);
  });
  await look('41_leak_sheet_alley', 16.8, -16.5, 19, -25, undefined, -0.02);
  await page.evaluate(() => {
    const g = window.__game;
    const e = g.byId.wetcomer2;
    e.pos.x = -5.8; e.pos.z = -21.6;
    e.pos.y = g.world.heightAt(-5.8, -21.6, 1);
    e.targetYaw = e.yaw = Math.atan2(-3.9 - e.pos.x, -19.9 - e.pos.z);
    e.syncBody(0);
    g.game.state = 'PAUSE';
  });
  await look('42_wetcomer_close', -4.3, -20.3, -5.8, -21.6, undefined, 0.02);
  await page.evaluate(() => { window.__game.game.state = 'PLAY'; });
  await look('43_leak_banquet_floaters', -12.5, -46, -14, -58, 3.5);

  // ---------- H. 主怪上宾（丈量员前肢细节 + 镁光定影） ----------
  const hb = await page.evaluate(() => {
    const g = window.__game;
    const gu = g.guest;
    gu.setEnabled(true);
    const hbase = g.world.dynamic.hotelInfo.origin.y;
    gu.hand.set(-4, g.world.heightAt(-4, -50, hbase + 0.5), -50);
    gu.handTarget.copy(gu.hand);
    g.player.setPosition(g.world.dynamic.hotelInfo.origin.x + 3, g.world.dynamic.hotelInfo.origin.z + 2, 0, hbase + 0.5);
    const ctx = { player: g.player, dt: 0.2, audio: null, vibration: 0, onCaught: () => {} };
    for (let i = 0; i < 10; i++) gu.update(ctx);
    g.game.state = 'PAUSE';
    return hbase;
  });
  await look('44_guest_arm', -7.6, -45.2, -1, -48.5, hb + 0.5, 0.3);
  await look('45_guest_hand_rod', -4, -47.2, -4, -50, hb + 0.5, -0.2);
  await look('46_guest_ropes', -0.5, -45.5, 0, -47.7, hb + 0.5, 0.55);
  // 镁光定影：丈量姿态定格（板条排直、绳牌垂稳）
  await page.evaluate(() => {
    const g = window.__game;
    g.game.state = 'PLAY';
    const gu = g.guest;
    gu.reset(); gu.setEnabled(true);
    const hi = g.world.dynamic.hotelInfo.origin;
    gu.hand.set(hi.x - 2, hi.y, hi.z + 6);
    gu.handTarget.copy(gu.hand);
    g.player.setPosition(hi.x + 3, hi.z + 2, 0, hi.y + 0.5);
    g.tools.hasCamera = true; g.tools.bulbs = 2; g.tools.flashCd = 0;
    const p = g.player;
    p.yaw = Math.atan2(-(gu.hand.x - p.pos.x), -(gu.hand.z - p.pos.z));
    p.pitch = 0.12;
    p.syncCamera(0);
    g.tools.flash();
    const ctx = { player: g.player, dt: 0.25, audio: null, vibration: 1, onCaught: () => {} };
    for (let i = 0; i < 12; i++) gu.update(ctx);
    g.game.state = 'PAUSE';
  });
  await frames(3);
  await page.evaluate(() => window.__game.hud.clearSubtitles());
  await h.shot('keep/47_guest_flash_aligned');
  await page.evaluate(() => {
    const g = window.__game;
    g.game.state = 'PLAY';
    g.guest.reset();
  });

  console.log('[verify] keepshots done');
}
