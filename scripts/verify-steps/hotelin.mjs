// P2 酒店阈限室内取证：对照美术圣经的三张交付图——
//   lobby.png      大堂：水磨石(骨料+铜条分格+打蜡反光) + 红漆总台金包边 + 红毯轴线
//   banquet.png    宴会厅：红幕 + 「還」字金匾 + 矿棉吊顶 + 圆桌席面
//   corridor_3f.png 3F 客房走廊：红毯 + 墙纸 + 吊顶板边水渍
// 落盘 verify/keep/hotel/*（审计指定路径）。建议 FULLSPEC=1 运行。
import fs from 'node:fs';

export async function run(page, h) {
  fs.mkdirSync('verify/keep/hotel', { recursive: true });

  await page.click('#title-start');
  await h.sleep(1500);
  await h.tapKey('Space');
  await h.sleep(400);

  const frames = (n) => page.evaluate((k) => new Promise((res) => {
    let i = 0;
    const t0 = performance.now();
    const tick = () => {
      if (++i >= k || performance.now() - t0 > 20000) res();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), n);

  await page.evaluate(() => {
    const g = window.__game;
    g.engine.setFilmLook(0.5);
    g.hud.el.objToast.style.display = 'none';
  });

  const look = async (name, px, pz, tx, tz, yHint, pitch = 0.02) => {
    await page.evaluate(({ px, pz, tx, tz, yHint, pitch }) => {
      const g = window.__game;
      const yaw = Math.atan2(-(tx - px), -(tz - pz));
      g.player.setPosition(px, pz, yaw, yHint);
      g.player.pitch = pitch;
      g.player.syncCamera(0);
    }, { px, pz, tx, tz, yHint, pitch });
    await h.sleep(800); // 灯光预算 0.3s 一拍
    await frames(3);
    await page.evaluate(() => {
      const g = window.__game;
      g.hud.clearSubtitles();
      g.hud.objTimer = 0;
      g.hud.el.objToast.classList.remove('show');
    });
    await h.shot(name);
  };

  // 大堂：门斗东侧斜看西南——总台红漆金包边(右)/红毯轴线(中)/红毯大楼梯+山水壁画(左)
  await look('keep/hotel/lobby', 0.8, -47.4, -7.2, -56.2, 3.5, 0.02);
  // 宴会厅：北端沿厅轴向舞台看——红幕金匾(远端)/红灯笼/矿棉吊顶/圆桌席面一图收齐
  await look('keep/hotel/banquet', -13.4, -46.8, -16.8, -64.5, 3.5, 0.04);
  // 3F 走廊：西端向东看——红毯纵深 + 墙纸 + 吊顶水渍
  await look('keep/hotel/corridor_3f', -13.5, -55.5, 2, -55.5, 10.3, 0.03);

  console.log('[hotelin] ✅ 三张阈限室内交付图已落盘 verify/keep/hotel/');
}
