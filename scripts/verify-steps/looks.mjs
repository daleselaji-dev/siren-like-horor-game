// 外观检查《返潮》：员工人形 / F01 六米·两米读取 / 井特写 / 酒店各厅 / 压力锋面 / 监控视角 + 性能
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

  const look = async (name, px, pz, tx, tz) => {
    await page.evaluate(({ px, pz, tx, tz }) => {
      const g = window.__game;
      const yaw = Math.atan2(-(tx - px), -(tz - pz));
      g.player.setPosition(px, pz, yaw);
    }, { px, pz, tx, tz });
    await h.sleep(500);
    await h.shot(name);
  };
  // 动态角色：按其当前位置取景
  const lookAtNpc = async (name, id, dist = 3.2) => {
    const p = await page.evaluate((id) => {
      const e = window.__game.byId[id];
      return { x: e.pos.x, z: e.pos.z, yaw: e.yaw };
    }, id);
    // 站到他面前偏一点的位置
    const px = p.x + Math.sin(p.yaw) * dist + 0.6;
    const pz = p.z + Math.cos(p.yaw) * dist;
    await look(name, px, pz, p.x, p.z);
  };

  // ---- 员工三人：拖地 / 巡逻 / 切配 ----
  await lookAtNpc('l1-cleaner', 'cleaner', 3.0);
  await lookAtNpc('l2-guard', 'guard', 3.4);
  await lookAtNpc('l3-chef', 'chef', 3.0);

  // ---- F01：六米读出"人" → 两米读出"井" → 井特写 ----
  // 冻结他的 AI（scripted=true 时主循环跳过 update），避免特写时被追
  await page.evaluate(() => { window.__game.byId.f01.scripted = true; });
  const f01p = await page.evaluate(() => {
    const e = window.__game.byId.f01;
    return { x: e.pos.x, z: e.pos.z, yaw: e.yaw };
  });
  const face = (d, off = 0) => ({
    x: f01p.x + Math.sin(f01p.yaw + off) * d,
    z: f01p.z + Math.cos(f01p.yaw + off) * d,
  });
  const p6 = face(6);
  await look('l4-f01-6m', p6.x, p6.z, f01p.x, f01p.z);
  const p2 = face(2);
  await look('l5-f01-2m', p2.x, p2.z, f01p.x, f01p.z);
  const p1 = face(0.9);
  await look('l6-f01-well-closeup', p1.x, p1.z, f01p.x, f01p.z);
  // 井几何自检：三口井真实存在（左眼/右眼/口腔），各有井底水光
  const wells = await page.evaluate(() => {
    const b = window.__game.byId.f01.body;
    const ws = [b.wellL, b.wellR, b.wellM].filter(Boolean);
    return {
      count: ws.length,
      glints: ws.every((w) => !!w.glint),
      headTris: b.headMesh.geometry.attributes.position.count / 3,
    };
  });
  console.log('[verify] f01 wells:', JSON.stringify(wells));
  if (wells.count !== 3) throw new Error('F01 must have 3 wells (eyes + mouth)');
  await page.evaluate(() => { window.__game.byId.f01.scripted = false; });

  // ---- 场景：前庭招牌 / 大堂吊灯 / 前台 / 走廊 / 婚宴厅 / 后厨 ----
  await look('l7-facade-sign', 0, 22, 0, 2);
  await look('l8-lobby-chandelier', 6, 1, 0, -8);
  await look('l9-frontdesk', -4.5, -4.5, -8.5, -5);
  await look('l10-corridor', 0, -16.5, 0, -28);
  await look('l11-banquet', -6, -22, -20, -29);
  await look('l12-kitchen', 4.5, -22, 12, -27);

  // ---- 听潮：切到大堂监控信道 ----
  await page.evaluate(() => window.__game.player.setPosition(8, -2, 0));
  await h.sleep(300);
  await h.tapKey('KeyQ');
  for (let i = 0; i < 10; i++) {
    const label = await page.evaluate(() => window.__game.sightjack.current?.label);
    if (label === '监控 · 大堂') break;
    await h.tapKey('KeyQ');
    await h.sleep(200);
  }
  await h.sleep(1600); // 等切入水压脉冲消退
  await h.shot('l13-camview');
  const ch = await page.evaluate(() => window.__game.sightjack.current?.label);
  console.log('[verify] camera channel:', ch);
  await page.evaluate(() => {
    const g = window.__game;
    g.sightjack.exit();
    g.sightjack.restorePost();
  });

  // ---- 压力锋面：雾变密变冷（灰绿，不是血红） ----
  await page.evaluate(() => {
    const g = window.__game;
    g.sky.setPressure(1);
    g.sky.pressure = 0.95; // 快进过渡
  });
  await h.sleep(1200);
  await look('l14-pressure-forecourt', 0, 24, 0, 2);
  await look('l15-pressure-sea', 0, 30, 0, 60);
  await page.evaluate(() => {
    const g = window.__game;
    g.sky.setPressure(0);
    g.sky.pressure = 0;
  });
}
