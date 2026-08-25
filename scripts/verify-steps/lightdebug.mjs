// 灯光诊断：验证 OutputPass 修复后的画面
export async function run(page, h) {
  await page.click('#title-start');
  await h.sleep(1000);

  const spots = [
    ['fix-spawn', null, null, null],
    ['fix-village', 2, 20, 3.1],
    ['fix-village-north', 2, -12, 0.2],
    ['fix-huts', 14, 64, 3.0],
    ['fix-temple', -52, -72, -1.7],
    ['fix-lighthouse-path', 56, -94, -2.2],
  ];
  for (const [name, x, z, yaw] of spots) {
    if (x !== null) {
      await page.evaluate(({ x, z, yaw }) => window.__game.player.setPosition(x, z, yaw), { x, z, yaw });
    }
    await h.sleep(400);
    await h.shot(name);
  }
  const pos = await page.evaluate(() => {
    const g = window.__game;
    const p = [];
    // 出生点与关键路径高度检查
    for (const [x, z] of [[84, 114], [76, 108], [66, 96], [56, 80], [46, 72], [16, 40], [2, 2]]) {
      p.push([x, z, g.world.heightAt(x, z).toFixed(2)]);
    }
    return p;
  });
  console.log('[verify] path heights:', JSON.stringify(pos));
}
