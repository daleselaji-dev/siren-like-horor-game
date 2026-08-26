// 轮3取证：酒店阈限序列（门斗风除室→大堂挑空释放→后勤绿墙裙→楼梯间→安全出口）
export async function run(page, h) {
  await page.click('#title-start');
  await h.sleep(1500);
  await h.tapKey('Space');
  await h.sleep(400);

  const look = async (name, px, pz, tx, tz, yHint, pitch = 0) => {
    await page.evaluate(({ px, pz, tx, tz, yHint, pitch }) => {
      const g = window.__game;
      const yaw = Math.atan2(-(tx - px), -(tz - pz));
      g.player.setPosition(px, pz, yaw, yHint);
      g.player.pitch = pitch;
      g.player.syncCamera(0);
    }, { px, pz, tx, tz, yHint, pitch });
    await h.sleep(600);
    await h.shot(name);
  };

  // 世界坐标 = 局部 + (hx=-4, hz=-56)；层高 yHint: 1F=3.5 / 2F=6.9 / 3F=10.3
  await look('r3-01-vestibule-out', -4, -43.2, -4, -46.5, 3.5);   // 正门外看进门斗
  await look('r3-02-vestibule-in', -4, -45.6, -4, -52, 3.5);      // 门斗内望大堂（压→放）
  await look('r3-03-vestibule-west', -2.2, -45.4, -7.2, -46.9, 3.5, -0.12); // 伞架+地垫+红纸条
  await look('r3-04-lobby-back', -4, -52, -4, -46, 3.5);          // 大堂回望门斗盒子
  await look('r3-05-lobby-up', -4, -50, -4, -46, 3.5, 0.5);       // 挑空仰视（门斗顶+回廊）
  await look('r3-06-service-dado', -9, -65.5, 2, -65.5, 3.5);     // 后勤走廊绿墙裙
  await look('r3-07-stairwell', 8.2, -54.6, 11.5, -56.6, 3.5);    // 楼梯间绿墙裙
  await look('r3-08-exit-sign', 2, -54.5, 7.2, -54.5, 10.3);      // 3F 安全出口绿光
  await look('r3-09-corridor-3f', -15, -54.5, 2, -54.5, 10.3);    // 3F 客房走廊(对照画风)
}
