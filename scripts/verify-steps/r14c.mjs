// 轮14C 快速取证：幻潮镜洼（洼中潮网+鱼影）+ 湿客泡发次表面
export async function run(page, h) {
  await page.click('#title-start');
  await h.sleep(1200);
  await h.tapKey('Space');
  await h.sleep(300);
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
    await h.shot(`r14c/${name}`);
  };

  // 点火异化 + 巨影/一群小鱼挪到主街水洼上空
  await page.evaluate(() => {
    const g = window.__game;
    g.agenda.advanceTo(3);
    g.ocean.blood = 0.95;
    g.sky.blood = 0.95;
    const td = g.world.dynamic.leakState.tide;
    td.giant.cx = 38; td.giant.cz = -1.2; td.giant.r = 0.01;
    for (const f of td.fishParams) {
      if (f === td.giant) continue;
      f.cx = 38 + (f.cx % 3); f.cz = -1.2 + (f.cz % 3);
      f.r = Math.min(f.r, 4);
    }
    g.world.updateFx(520);
  });
  await h.sleep(800);
  // 低头看洼：洼里是天上那层潮，鱼影从洼底游过
  await look('01_puddle_mirror_giant', 37.2, 0.8, 38.4, -1.8, undefined, -0.95);
  await look('02_puddle_mirror_wide', 41, 1.6, 36, -2.2, undefined, -0.55);
  await page.evaluate(() => {
    const g = window.__game;
    const td = g.world.dynamic.leakState.tide;
    td.giant.r = 30; td.giant.cx = 8; // 巨影让位，小鱼贴洼口正上方绕小圈
    let i = 0;
    for (const f of td.fishParams) {
      if (f === td.giant) continue;
      f.cx = 38; f.cz = -1.2; f.r = 0.5 + (i++ % 4) * 0.45;
    }
    g.world.updateFx(524);
  });
  await look('03_puddle_mirror_school', 36.6, 1.4, 38.4, -1.8, undefined, -0.8);

  // 湿客近景：泡发次表面（轮廓青灰肉里光 + 贴体水线）
  await page.evaluate(() => {
    const g = window.__game;
    const e = g.byId.wetcomer2;
    e.pos.x = -5.8; e.pos.z = -21.6;
    e.pos.y = g.world.heightAt(-5.8, -21.6, 1);
    e.targetYaw = e.yaw = Math.atan2(-3.9 - e.pos.x, -19.9 - e.pos.z);
    e.syncBody(0);
    g.game.state = 'PAUSE';
  });
  await look('04_wetcomer_sss_close', -4.6, -20.5, -5.8, -21.6, undefined, 0.02);
  await look('05_wetcomer_sss_face', -5.1, -20.9, -5.8, -21.6, undefined, 0.1);
  await page.evaluate(() => { window.__game.game.state = 'PLAY'; });
  console.log('[verify] r14c done');
}
