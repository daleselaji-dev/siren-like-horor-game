// keep 集补拍：34 闹钟(指定钟位重摆)/44 主怪臂弧/46 垂绳界桩牌
// 44/46 之前拍空是因为跳过了 round6guest 的两段位姿流程——肩锚点随首次入位收敛,
// 必须先在大堂西侧落手再挪到中轴红毯,臂弧才会斜跨挑空入镜。
export async function run(page, h) {
  await page.click('#title-start');
  await h.sleep(1500);
  await h.tapKey('Space');
  await h.sleep(400);
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
    await frames(3);
    await page.evaluate(() => window.__game.hud.clearSubtitles());
    await h.shot(`keep/${name}`);
  };

  // 与 keep 集其余异化态镜头同调
  await page.evaluate(() => {
    const g = window.__game;
    g.agenda.advanceTo(3);
    g.ocean.blood = 0.95;
    g.sky.blood = 0.95;
  });
  await h.sleep(800);

  // ---------- 34 发条闹钟：钟摆大堂中轴，侍应被钓过来 ----------
  const cpos = await page.evaluate(() => {
    const g = window.__game;
    const e = g.byId.waiterLobby;
    const hi = g.world.dynamic.hotelInfo.origin;
    e.reset(); e.setEnabled(true);
    e.pos.set(hi.x + 0.8, 0, hi.z + 10);
    e.pos.y = g.world.heightAt(e.pos.x, e.pos.z, hi.y + 0.5);
    g.tools.clocks = 2; g.tools.lime = 3; g.tools.hasCamera = true; g.tools.bulbs = 2;
    g.player.setPosition(hi.x - 0.8, hi.z + 5.6, Math.PI, hi.y + 0.5);
    g.player.yaw = Math.PI; // 面朝 +z——钟落脚前 0.9m
    g.tools.placeClock();
    const c = g.tools.activeClocks[g.tools.activeClocks.length - 1];
    for (let i = 0; i < 8; i++) g.tools.update(0.5); // 上弦 → 响铃
    const ctx = {
      player: g.player, dt: 0.25, audio: null, envSightFactor: 1,
      noiseEvents: [], onCaught: () => {}, onAlerted: () => {},
    };
    for (let i = 0; i < 14; i++) e.update(ctx); // 循铃走过来几步
    return { x: c.x, z: c.z, hy: hi.y };
  });
  await look('34_clock_ringing', cpos.x + 1.5, cpos.z - 2.3, cpos.x, cpos.z + 1.6, cpos.hy + 0.5, -0.3);
  await page.evaluate(() => {
    const g = window.__game;
    g.byId.waiterLobby.reset();
    g.tools.activeClocks.length = 0;
  });

  // ---------- 44/46 主怪：完整两段位姿再冻结 ----------
  const hb = await page.evaluate(() => {
    const g = window.__game;
    const gu = g.guest;
    const hi = g.world.dynamic.hotelInfo;
    gu.setEnabled(true);
    // 第一段：大堂西侧落手（肩锚点收敛）
    gu.hand.set(hi.origin.x - 5, hi.origin.y, hi.origin.z + 6);
    gu.handTarget.copy(gu.hand);
    g.player.setPosition(hi.origin.x + 3, hi.origin.z + 2, 0, hi.origin.y + 0.5);
    let ctx = { player: g.player, dt: 0.2, audio: null, vibration: 0, onCaught: () => {} };
    for (let i = 0; i < 10; i++) gu.update(ctx);
    // 第二段：手挪到中轴红毯（臂弧斜跨挑空）
    gu.hand.set(-4, g.world.heightAt(-4, -50, hi.origin.y + 0.5), -50);
    gu.handTarget.copy(gu.hand);
    for (let i = 0; i < 10; i++) gu.update(ctx);
    g.game.state = 'PAUSE';
    return hi.origin.y;
  });
  await look('44_guest_arm', -7.6, -45.2, -1, -48.5, hb + 0.5, 0.3);
  await look('46_guest_ropes', -0.5, -45.5, 0, -47.7, hb + 0.5, 0.55);
  await page.evaluate(() => {
    const g = window.__game;
    g.game.state = 'PLAY';
    g.guest.reset();
  });

  console.log('[verify] keepfix done');
}
