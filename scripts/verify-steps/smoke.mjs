// 冒烟测试：进入游戏 → 截图 → 走几步 → 小镇各区域 + 酒店各层传送截图
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

  // 传送到各区域看看（yHint 指定楼层）
  const spots = [
    ['03-dike', 46, 74, 2.2],
    ['04-huts', 14, 62, 3.4],
    ['05-village', 2, 20, 3.1],
    ['06-salt', -30, 10, -2.0],
    ['07-temple', -50, -70, -1.6],
    ['08-wreck', 30, -60, -2.6],
    ['09-lighthouse', 62, -104, -2.4],
    ['10-hotel-front', -4, -36, 0, 3.5],
    ['11-hotel-lobby', -2, -46.5, 0.75, 3.5],
    ['12-hotel-banquet', -13, -50, 0.6, 3.5],
    ['13-hotel-corridor', 0, -64.2, -1.4, 3.5],
    ['14-hotel-2f-security', 7, -59.5, -0.49, 6.9],
    ['15-hotel-3f-suite', -12, -60.5, 0.35, 10.3],
    ['16-annex-aqua', 30, -50, 2.6, 3.5],
  ];
  for (const [name, x, z, yaw, yHint] of spots) {
    await page.evaluate(({ x, z, yaw, yHint }) => {
      window.__game.player.setPosition(x, z, yaw, yHint);
    }, { x, z, yaw, yHint });
    await h.sleep(400);
    await h.shot(name);
  }

  // 玩家没有掉出楼板/卡进墙里
  const final = await page.evaluate(() => {
    const p = window.__game.player.pos;
    return { x: p.x.toFixed(1), y: p.y.toFixed(1), z: p.z.toFixed(1) };
  });
  console.log('[verify] final pos:', JSON.stringify(final));
}
