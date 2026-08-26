// 轮14D 快速取证：开场10秒（湿镜头/牌坊双闪）+ 上宾细节（红绸/木屑/点名同拍/界牌转脸）
export async function run(page, h) {
  await page.click('#title-start');
  // 开场不跳：拍两拍运镜（intro 走真实时钟；截图本身有秒级延迟，时点提前留量）
  await h.sleep(1200);
  await h.shot('r14d/01_intro_bus_wetlens'); // 轮15 起此时点为零拍车内（湿镜头满帧）
  await h.sleep(5000); // ≈7.5s+延迟：牌坊剪影 + 双闪（轮15 全谱后移 2s）
  await h.shot('r14d/02_intro_arch_flash');
  await h.tapKey('Space');
  await h.sleep(400);

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
    await h.shot(`r14d/${name}`);
  };

  // 上宾巡摸态：红绸拖尾 + 木屑落幕（lureTo 锁移动目标——update 每帧重算 handTarget）
  const hb = await page.evaluate(() => {
    const g = window.__game;
    const gu = g.guest;
    gu.setEnabled(true);
    const hbase = g.world.dynamic.hotelInfo.origin.y;
    gu.hand.set(-4, g.world.heightAt(-4, -50, hbase + 0.5), -50);
    gu.handTarget.copy(gu.hand);
    gu.lureTo(-9, -48);
    g.player.setPosition(g.world.dynamic.hotelInfo.origin.x + 3, g.world.dynamic.hotelInfo.origin.z + 2, 0, hbase + 0.5);
    const ctx = { player: g.player, dt: 0.12, audio: null, vibration: 0, onCaught: () => {} };
    for (let i = 0; i < 8; i++) gu.update(ctx);
    g.game.state = 'PAUSE';
    return hbase;
  });
  const hp = await page.evaluate(() => {
    const gu = window.__game.guest;
    return { x: gu.hand.x, z: gu.hand.z };
  });
  await look('03_guest_arm_silk', -7.6, -45.2, -1, -48.5, hb + 0.5, 0.3);
  await look('04_guest_hand_detail', hp.x + 1.1, hp.z + 2.4, hp.x, hp.z, hb + 0.5, -0.2);

  // 点名读拍：玩家贴近——四指同拍敲地、界牌拧过来朝人
  await page.evaluate(() => {
    const g = window.__game;
    const gu = g.guest;
    g.game.state = 'PLAY';
    gu.lure = null;
    g.player.setPosition(gu.hand.x + 1.1, gu.hand.z + 0.6, 0, gu.hand.y + 0.2);
    const ctx = { player: g.player, dt: 0.1, audio: null, vibration: 0, onCaught: () => {} };
    for (let i = 0; i < 3; i++) gu.update(ctx);
    g.game.state = 'PAUSE';
  });
  await page.evaluate(() => {
    const g = window.__game;
    const gu = g.guest;
    g.player.setPosition(gu.hand.x + 2.6, gu.hand.z + 1.4, 0, gu.hand.y + 0.3);
    const p = g.player;
    p.yaw = Math.atan2(-(gu.hand.x - p.pos.x), -(gu.hand.z - p.pos.z));
    p.pitch = -0.3;
    p.syncCamera(0);
  });
  await frames(3);
  await page.evaluate(() => window.__game.hud.clearSubtitles());
  await h.shot('r14d/05_guest_counting');
  await page.evaluate(() => { const g = window.__game; g.game.state = 'PLAY'; g.guest.reset(); g.guest.setEnabled(false); });
  console.log('[verify] r14d done');
}
