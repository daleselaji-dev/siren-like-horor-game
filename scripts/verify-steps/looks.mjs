// 外观检查：小镇外景保留度 + 酒店各厅室 + 宴席工位实体近景 + 渗漏态色调
export async function run(page, h) {
  await page.click('#title-start');
  await h.sleep(1500);
  await h.tapKey('Space'); // 跳过开场运镜
  await h.sleep(400);

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

  const look = async (name, px, pz, tx, tz, yHint) => {
    await page.evaluate(({ px, pz, tx, tz, yHint }) => {
      const g = window.__game;
      const yaw = Math.atan2(-(tx - px), -(tz - pz));
      g.player.setPosition(px, pz, yaw, yHint);
    }, { px, pz, tx, tz, yHint });
    await h.sleep(600);
    await h.shot(name);
  };

  // —— 镇口 · 阈限车站与前街（新开场动线） ——
  await look('l00-busstation', 63, 1.5, 52, 3.5);           // 空车站雨棚+牌坊
  await look('l00b-archway', 47.5, 0, 40, 0);               // 蚀湾牌坊+栅门+岗亭
  await look('l00c-frontstreet', 38, -1, 24, -5);           // 前街街灯纵深
  await look('l00d-videohall', 26, -1.5, 30.5, 3);          // 通宵录像厅灯箱
  await look('l00e-ruleboard', 41.6, 1.4, 41.6, 3.6);       // 政府告示墙(规则怪谈)
  await look('l00f-dorm', -30, 17, -37, 23);                // 家属筒子楼·一扇亮窗

  // —— 小镇外景（滩涂/石堤/盐田/灯塔全部保留） ——
  await look('l01-netmender', 12, 51, 12, 46.8);
  await look('l02-saltworker', -40, 8, -44, 4);
  await look('l03-gate', 16, 46, 16, 38);
  await look('l04-temple-front', -50, -74, -64, -74);
  await look('l05-lighthouse', 68, -110, 76, -120);
  await look('l06-wreck', 30, -60, 37, -72);
  await look('l07-spawn-boat', 80, 108, 92, 122);
  await look('l08-watcher', 100, 127, 104, 131);

  // —— 南方大酒店 ——
  await look('l10-hotel-facade', -4, -32, -4, -46, 3.5);
  await look('l11-lobby-desk', -2, -47, -10, -52, 3.5);       // 红漆总台+登记簿
  await look('l12-lobby-stair', -4, -45.5, -4, -60, 3.5);     // 红毯大楼梯
  await look('l13-banquet-hall', -12.5, -46, -17, -64, 3.5);  // 圆桌宴席+舞台
  await look('l14-banquet-stage', -13, -58, -16.5, -64.6, 3.5); // 舞台红幕+司仪
  await look('l15-service-crt', 0.5, -62.5, 0.8, -65, 3.5);   // 服务走廊 CRT
  await look('l16-stairwell', 8.5, -53.5, 8, -57, 3.5);       // 楼梯间标识
  await look('l17-security-9crt', 7.5, -62, 10.5, -66, 6.9);  // 保卫科九宫格
  await look('l18-3f-corridor', -11, -55.5, 2, -55.5, 10.3);  // 3F 客房走廊
  await look('l19-suite-807', -12, -60, -13.5, -64.6, 10.3);  // 807 三面镜+新娘
  await look('l20-annex-tank', 24, -50, 32, -52, 3.5);        // 海洋馆主展缸

  // —— 海洋馆主展厅：巨物残骸（深海巨物恐怖奇观） ——
  await look('l20b-skeleton-wide', 37, -46, 44, -52, 3.5);    // 肋拱全景
  await look('l20c-skeleton-skull', 39.5, -50, 37.3, -52, 3.5); // 头骨眼眶近景
  await look('l20d-processing', 49.5, -55.5, 52.5, -57, 3.5); // 处理间铁柜

  // —— 宴席工位实体近景 ——
  // 司仪（舞台上）：从上宾空席斜前方看，避开高背椅遮挡
  await look('l21-emcee-close', -14.9, -63.0, -16.5, -64.6, 3.5);
  // 侍应（动态位置，贴脸看浮木颈臂+托盘）
  const wp = await page.evaluate(() => {
    const p = window.__game.byId.waiterBanquet.pos;
    return { x: p.x, z: p.z };
  });
  await look('l22-waiter-close', wp.x + 1.6, wp.z + 1.6, wp.x, wp.z, 3.5);
  // 全福婆（临时启用到 3F 走廊近景）
  await page.evaluate(() => {
    const g = window.__game;
    const m = g.byId.matron;
    m.setEnabled(true);
    m.pos.set(-8, 0, -55.5);
    m.pos.y = g.world.heightAt(-8, -55.5, 10.3);
    m.state = 'PAUSE'; m.stateTimer = -9;
  });
  await h.sleep(400);
  await look('l23-matron-close', -6.2, -55.5, -8, -55.5, 10.3);
  await page.evaluate(() => window.__game.byId.matron.setEnabled(false));
  // 回眸客（残影指针）
  await page.evaluate(() => {
    const g = window.__game;
    g.gaze.appearAt(-4, -49, new window.__game.engine.camera.position.constructor(4, 7, -57), 3.0);
  });
  await h.sleep(500);
  await look('l24-gaze-close', -4, -46.5, -4, -49, 3.5);
  await page.evaluate(() => window.__game.gaze.setEnabled(false));
  // 岗亭员（镇口·投币口封嘴）
  const bp = await page.evaluate(() => {
    const p = window.__game.byId.booth.pos;
    return { x: p.x, z: p.z };
  });
  await look('l24b-booth-close', bp.x - 1.4, bp.z - 0.6, bp.x, bp.z);
  // 理骨员（主展厅·胶皮围裙+歪头）
  const op = await page.evaluate(() => {
    const p = window.__game.byId.osteo.pos;
    return { x: p.x, z: p.z };
  });
  await look('l24c-osteo-close', op.x + 1.5, op.z + 1.5, op.x, op.z, 3.5);

  // —— 渗漏态：浮客+上宾+深绿黑海色 ——
  await page.evaluate(() => {
    const g = window.__game;
    g.agenda.advanceTo(3); // 敬酒=返潮点火
    g.ocean.blood = 0.95;
    g.sky.blood = 0.95;
  });
  await h.sleep(2000);
  await look('l25-banquet-floaters', -12.5, -46, -14, -58, 3.5);
  await page.evaluate(() => {
    const g = window.__game;
    g.guest.setEnabled(true);
    g.guest.hand.set(-2, 3.7, -50);
  });
  await h.sleep(600);
  await look('l26-guest-arm', -2, -46.5, -2, -51, 3.5);
  await look('l27-leak-sea', 100, 127, 112, 140);
  await look('l28-watcher-turned', 108, 136, 104, 131);
}
