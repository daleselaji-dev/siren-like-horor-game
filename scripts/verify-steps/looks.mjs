// 角色与场景外观检查：正确角度看每类角色 + 性能
export async function run(page, h) {
  await page.click('#title-start');
  await h.sleep(1500);

  // fps 采样（lowspec）
  const fps = await page.evaluate(() => new Promise((res) => {
    let frames = 0;
    const t0 = performance.now();
    const tick = () => {
      frames++;
      if (performance.now() - t0 > 2500) res((frames / 2.5).toFixed(1));
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
  console.log('[verify] lowspec fps:', fps);

  // 看补网人（他在 12,46.8，从南边看他 → 站 12,52 朝北 yaw=π）
  const look = async (name, px, pz, tx, tz) => {
    await page.evaluate(({ px, pz, tx, tz }) => {
      const g = window.__game;
      const yaw = Math.atan2(-(tx - px), -(tz - pz));
      g.player.setPosition(px, pz, yaw);
    }, { px, pz, tx, tz });
    await h.sleep(500);
    await h.shot(name);
  };

  await look('l1-netmender', 12, 51, 12, 46.8);
  await look('l2-saltworker', -40, 8, -44, 4);
  // 巡堤人（动态位置）
  const pp = await page.evaluate(() => {
    const p = window.__game.byId.dikePatrol.pos;
    return { x: p.x, z: p.z };
  });
  await look('l3-patrol', pp.x + 3, pp.z + 3, pp.x, pp.z);
  await look('l4-priest', -60, -74, -64.4, -74);
  await look('l5-dog', 4, 8, 6, 6);
  await look('l6-gate', 16, 46, 16, 38);
  await look('l7-temple-front', -50, -74, -64, -74);
  await look('l8-lighthouse', 68, -110, 76, -120);
  await look('l9-wreck', 30, -60, 37, -72);
  await look('l10-spawn-boat', 80, 108, 92, 122);

  // 视奸海鸟（俯瞰全村）
  await page.evaluate(() => {
    const g = window.__game;
    g.player.setPosition(2, 10, 0);
  });
  await h.sleep(300);
  await h.tapKey('KeyQ');
  // 切到海鸟信道（多按几次）
  for (let i = 0; i < 6; i++) {
    const label = await page.evaluate(() => window.__game.sightjack.current?.label);
    if (label === '海鸟群') break;
    await h.tapKey('KeyQ');
    await h.sleep(200);
  }
  await h.sleep(800);
  await h.shot('l11-birdview');
  const ch = await page.evaluate(() => window.__game.sightjack.current?.label);
  console.log('[verify] bird channel:', ch);
}
