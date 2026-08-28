// 轮2取证：家属楼可进可探（两栋×两户+楼梯+天台）+ 大新照相馆（门市+暗房）
export async function run(page, h) {
  await page.click('#title-start');
  await h.sleep(1500);
  await h.tapKey('Space');
  await h.sleep(400);

  const { b1f1, b1f2, b1rf, b2f1, b2f2 } = await page.evaluate(() => {
    const w = window.__game.world;
    const base1 = w.heightAt(-37, 32), base2 = w.heightAt(-37, 7);
    return {
      b1f1: base1 + 0.42, b1f2: base1 + 3.1, b1rf: base1 + 5.8,
      b2f1: base2 + 0.42, b2f2: base2 + 3.1,
    };
  });

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

  // —— 家属楼外景（弄堂视角，两栋+203亮窗）——
  await look('r2-01-dorm-alley', -26, 19, -37, 21, undefined);
  await look('r2-02-dorm-b1-front', -33, 20.5, -35, 24, undefined);
  // —— 一栋 102（半开门→外间八仙桌+户口簿→里间）——
  await look('r2-03-102-door', -41.0, 21.7, -41.0, 24.5, b1f1);
  await look('r2-04-102-table', -41.2, 23.5, -40.5, 24.7, b1f1, -0.3);
  await look('r2-05-102-inner', -41.35, 26.9, -39.6, 28.1, b1f1, -0.1);
  // —— 外挂楼梯上 2F ——
  await look('r2-06-stairs', -28.2, 30.5, -28.2, 24, b1f1);
  await look('r2-07-corridor2f', -28.6, 22.2, -42, 22.4, b1f2);
  // —— 一栋 203（亮灯户：搪瓷缸冒汽+倒椅）——
  await look('r2-08-203-door', -37.8, 21.9, -37.8, 24.2, b1f2);
  await look('r2-09-203-table', -38.5, 24.6, -36.3, 23.8, b1f2, -0.28);
  // —— 天台 ——
  await look('r2-10-roof', -29.5, 28.6, -34, 25, b1rf);
  await look('r2-11-roof-view', -33, 27.5, -20, 5, b1rf);
  // —— 二栋 104（一副碗筷）/ 201（缝纫机+白布）——
  await look('r2-12-b2-front', -31.5, 9.2, -34.5, 12.5, undefined);
  await look('r2-13-104-table', -34.7, 11.7, -34.1, 12.9, b2f1, -0.28);
  await look('r2-14-201-sew', -42.9, 13.0, -44.6, 11.9, b2f2, -0.3);
  // —— 大新照相馆 ——
  await look('r2-15-photo-front', 14.8, -1.8, 15.2, 1.0, undefined);
  await look('r2-16-photo-inside', 12.6, 0.9, 15.2, 4.6, undefined);
  await look('r2-17-darkroom', 12.95, 3.9, 11.7, 4.9, undefined, -0.12);
  // —— 路牌（箱庭路标）——
  await look('r2-18-signpost', 9.2, -6.5, 10.5, -4.5, undefined);
}
