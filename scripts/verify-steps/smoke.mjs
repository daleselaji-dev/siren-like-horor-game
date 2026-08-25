// 冒烟测试：进入游戏 → 截图 → 走几步 → 各房间传送截图
export async function run(page, h) {
  await h.shot('00-title');
  await page.click('#title-start');
  await h.sleep(2500);
  await h.tapKey('Space'); // 跳过开场运镜
  await h.sleep(500);
  await h.shot('01-spawn');

  // 走几步
  await h.holdKey('KeyW', 1500);
  await h.shot('02-walked');

  // 渲染信息
  const info = await page.evaluate(() => {
    const g = window.__game;
    return {
      calls: g.engine.renderer.info.render.calls,
      triangles: g.engine.renderer.info.render.triangles,
      pos: { x: g.player.pos.x.toFixed(1), y: g.player.pos.y.toFixed(1), z: g.player.pos.z.toFixed(1) },
    };
  });
  console.log('[verify] render info:', JSON.stringify(info));

  // 各房间
  const spots = [
    ['03-forecourt', 0, 20, 0],
    ['04-porch', 0, 5, 0],
    ['05-lobby', 0, -3, 0.6],
    ['06-frontdesk', -5.5, -5.5, -1.57],
    ['07-security', 13, -5.5, 2.4],
    ['08-corridor', 0, -17.5, 0],
    ['09-kitchen', 8, -23, 0.8],
    ['10-banquet', -8, -25, 1.57],
    ['11-stage', -19, -28, 1.57],
  ];
  for (const [name, x, z, yaw] of spots) {
    await page.evaluate(({ x, z, yaw }) => {
      window.__game.player.setPosition(x, z, yaw);
    }, { x, z, yaw });
    await h.sleep(400);
    await h.shot(name);
  }
}
