// 轮14A 快速取证：建筑立面升级 + 室内加密的几何摆位检查（lowspec 快拍）
export async function run(page, h) {
  await page.click('#title-start');
  await h.sleep(1200);
  await h.tapKey('Space');
  await h.sleep(300);

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
    await h.shot(`r14a/${name}`);
  };

  await look('01_front_street', 38, -1, 24, -5);
  await look('02_video_hall', 26, -2.5, 27, 3.4, undefined, 0.16);
  await look('03_photo_studio', 12.2, -1.6, 15.2, 4.6, undefined, 0.12);
  await look('04_fisher_hut', 6.5, 47.5, 2, 52, undefined, 0.1);
  await look('05_hotel_facade', -4, -32, -4, -46, 3.5, 0.1);
  await look('06_booth_roof', 49.5, 2.2, 46.8, 4.8, undefined, 0.2);
  const { b1f1 } = await page.evaluate(() => {
    const w = window.__game.world;
    const base1 = w.heightAt(-37, 32);
    return { b1f1: base1 + 0.42 };
  });
  await look('07_dorm_102', -41.2, 23.5, -40.2, 25.2, b1f1, -0.2);
  await look('08_hotel_corridor3f', 8.5, -54.4, -8, -54.5, 9.9);
  await look('09_room107', -0.3, -50.5, 1.8, -48, 9.9, -0.05);
  console.log('[verify] r14a done');
}
