// 手部迭代实验室（临时）：钉 mc 峰值姿，多角度手部特写 + 世界坐标日志
import fs from 'node:fs';

export async function run(page, h) {
  fs.mkdirSync('verify/handlab', { recursive: true });
  await page.click('#title-start');
  await h.sleep(1200);
  await h.tapKey('Space');
  await h.sleep(300);
  await page.waitForFunction(() => window.__facesReady === true, { timeout: 300000, polling: 1000 });
  await page.evaluate(() => { window.__game.hud.el.objToast.style.display = 'none'; });
  const frames = (n) => page.evaluate((k) => new Promise((res) => {
    let i = 0;
    const t0 = performance.now();
    const tick = () => {
      if (++i >= k || performance.now() - t0 > 20000) res();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), n);

  // 先在 PLAY 态把玩家挪到舞台旁——updateLightBudget 按相机位只留最近 16 盏点光，
  // 玩家留在城镇时宴会厅整组灯被预算裁掉，舞台拍出来是均匀黑
  await page.evaluate(() => {
    const g = window.__game;
    const p = g.byId.emcee.body.headWorldPos(new (g.player.pos.constructor)());
    const yaw = Math.atan2(-(p.x - (p.x + 0.56)), -(p.z - (p.z + 0.68)));
    g.player.setPosition(p.x + 0.56, p.z + 0.68, yaw, 3.42);
    g.player.syncCamera(0);
  });
  await frames(30); // 让 light budget（0.3s 节流）以舞台相机位重算
  // 钉姿（峰值）
  const info = await page.evaluate(() => {
    const g = window.__game;
    g.game.state = 'PAUSE';
    const hum = g.byId.emcee.body;
    const PEAK = 2.4 + Math.PI;
    for (let i = 0; i < 5; i++) { hum.phase = PEAK - 3 * 0.8; hum.animate('mc', 3, 0); }
    hum.phase = PEAK - 0.001 * 0.8;
    hum.animate('mc', 0.001, 0);
    g.hud.clearSubtitles();
    hum.group.updateMatrixWorld(true);
    const V = g.player.pos.constructor;
    const l = hum.armL.hand.getWorldPosition(new V());
    const r = hum.armR.hand.getWorldPosition(new V());
    const hd = hum.headWorldPos(new V());
    return {
      l: [l.x, l.y, l.z], r: [r.x, r.y, r.z], head: [hd.x, hd.y, hd.z],
      groupPos: hum.group.position.toArray(), groupRy: hum.group.rotation.y,
    };
  });
  console.log('[handlab] world:', JSON.stringify(info, (k, x) => (typeof x === 'number' ? +x.toFixed(3) : x)));

  // PAUSE 下主循环不跑 player.update——直接写引擎相机（不受楼层高度/碰撞干扰）
  const shot = async (name, cx, cy, cz, tx, ty, tz) => {
    await page.evaluate(({ cx, cy, cz, tx, ty, tz }) => {
      const g = window.__game;
      const cam = g.engine.camera;
      cam.position.set(cx, cy, cz);
      cam.lookAt(tx, ty, tz);
      g.hud.clearSubtitles();
    }, { cx, cy, cz, tx, ty, tz });
    await frames(3);
    await h.shot(`handlab/${name}`);
  };

  const mx = (info.l[0] + info.r[0]) / 2, my = (info.l[1] + info.r[1]) / 2, mz = (info.l[2] + info.r[2]) / 2;
  // 从头部正面方向（r20 面部机位方位）不同距离/方位打手
  const dn = Math.hypot(0.56, 0.68);
  const ux = 0.56 / dn, uz = 0.68 / dn;
  // 舞台构图候选：中心 = 手中点↔头 连线 45%，观众向不同距离
  const cx = mx + (info.head[0] - mx) * 0.45, cy = my + (info.head[1] - my) * 0.45, cz = mz + (info.head[2] - mz) * 0.45;
  for (const d of [0.9, 1.1, 1.3]) {
    await shot(`stage_${d}`, cx + ux * d, cy + 0.04, cz + uz * d, cx, cy, cz);
  }
  await shot('hands_mid', mx + ux * 0.55, my + 0.06, mz + uz * 0.55, mx, my, mz);
  console.log('[handlab] done');
}
