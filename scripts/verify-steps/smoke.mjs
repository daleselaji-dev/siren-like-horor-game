// 冒烟测试：进入游戏 → 截图 → 走几步 → 各区域传送截图
export async function run(page, h) {
  await h.shot('00-title');
  await page.click('#title-start');
  await h.sleep(2500);
  await h.shot('01-spawn');

  // 走几步
  await h.holdKey('KeyW', 1500);
  await h.shot('02-walked');

  // 检查渲染信息
  const info = await page.evaluate(() => {
    const g = window.__game;
    return {
      calls: g.engine.renderer.info.render.calls,
      triangles: g.engine.renderer.info.render.triangles,
      pos: { x: g.player.pos.x.toFixed(1), y: g.player.pos.y.toFixed(1), z: g.player.pos.z.toFixed(1) },
    };
  });
  console.log('[verify] render info:', JSON.stringify(info));

  // 传送到各区域看看
  const spots = [
    ['03-dike', 46, 74, 2.2],
    ['04-huts', 14, 62, 3.4],
    ['05-village', 2, 20, 3.1],
    ['06-salt', -30, 10, -2.0],
    ['07-temple', -50, -70, -1.6],
    ['08-wreck', 30, -60, -2.6],
    ['09-lighthouse', 62, -104, -2.4],
  ];
  for (const [name, x, z, yaw] of spots) {
    await page.evaluate(({ x, z, yaw }) => {
      window.__game.player.setPosition(x, z, yaw);
    }, { x, z, yaw });
    await h.sleep(400);
    await h.shot(name);
  }
}
