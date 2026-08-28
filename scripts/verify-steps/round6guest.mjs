// 轮6取证：主怪「上宾」精致化——旧料重组前肢（铜箍/垂绳界桩牌/丈杆/旋木指端/半桌面掌）
// + 三件工具的专门规矩：镁光「定影对齐」/ 闹钟「先清点出声的」/ 贝灰界「干坎不跨」
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
  const assert = (ok, msg) => { if (!ok) throw new Error('ASSERT: ' + msg); };

  // ---------- 1. 上宾启用 + 部件清点 ----------
  const parts = await page.evaluate(() => {
    const g = window.__game;
    const gu = g.guest;
    gu.setEnabled(true);
    // 手摆到大堂西侧空地，步进几拍让摆件就位
    const hi = g.world.dynamic.hotelInfo;
    gu.hand.set(hi.origin.x - 5, hi.origin.y, hi.origin.z + 6);
    gu.handTarget.copy(gu.hand);
    g.player.setPosition(hi.origin.x + 3, hi.origin.z + 2, 0, hi.origin.y + 0.5);
    const ctx = { player: g.player, dt: 0.2, audio: null, vibration: 0, onCaught: () => {} };
    for (let i = 0; i < 10; i++) gu.update(ctx);
    let hoops = 0, nails = 0;
    for (const p of gu.armPanels) {
      for (const ch of p.children) {
        if (ch.geometry?.type === 'TorusGeometry') hoops++;
        if (ch.geometry?.type === 'CylinderGeometry' && ch.geometry.parameters.radiusTop < 0.02) nails++;
      }
    }
    return {
      panels: gu.armPanels.length, hoops, nails,
      ropes: gu.ropes.length, fingers: gu.fingers.length,
      tips: gu.fingers.every((f) => !!f.tip), palm: !!gu.palm,
      rod: gu.armPanels[3].children.some((ch) => ch.geometry?.parameters?.height === 3.4),
    };
  });
  console.log('[verify] guest parts:', JSON.stringify(parts));
  assert(parts.panels === 8, 'arm panels wrong');
  assert(parts.hoops === 7, 'brass hoops missing: ' + parts.hoops);
  assert(parts.nails >= 14, 'nail heads missing');
  assert(parts.ropes === 3 && parts.tips && parts.palm && parts.rod, 'guest parts incomplete');

  // 取证：手摆到大堂中轴红毯上（四根镜柱之间的净空），肩在东北挑空高处
  // ——臂弧斜跨整个挑空，大堂灯光可读（拍摄期冻结更新防走位）
  await page.evaluate(() => {
    const g = window.__game;
    const gu = g.guest;
    const hb = g.world.dynamic.hotelInfo.origin.y;
    gu.hand.set(-4, g.world.heightAt(-4, -50, hb + 0.5), -50);
    gu.handTarget.copy(gu.hand);
    const ctx = { player: g.player, dt: 0.2, audio: null, vibration: 0, onCaught: () => {} };
    for (let i = 0; i < 10; i++) gu.update(ctx);
    g.game.state = 'PAUSE'; // 冻结（不开菜单），渲染继续
  });
  const hb = await page.evaluate(() => window.__game.world.dynamic.hotelInfo.origin.y);
  await look('r6-01-guest-arm', -7.6, -45.2, -1, -48.5, hb + 0.5, 0.3);
  await look('r6-02-guest-hand', -4, -47.2, -4, -50, hb + 0.5, -0.2);
  await look('r6-03-guest-ropes', -0.5, -45.5, 0, -47.7, hb + 0.5, 0.55);
  await page.evaluate(() => {
    const g = window.__game;
    g.guest.reset();
    g.game.state = 'PLAY';
  });

  // ---------- 2. 镁光定影：板材对齐 + 僵直不移动不点名 ----------
  const flashRes = await page.evaluate(() => {
    const g = window.__game;
    const gu = g.guest;
    const hi = g.world.dynamic.hotelInfo.origin;
    gu.hand.set(hi.x - 2, hi.y, hi.z + 6); // 大堂挑空正中偏西（与玩家间无镜柱）
    gu.handTarget.copy(gu.hand);
    g.player.setPosition(hi.x + 3, hi.z + 2, 0, hi.y + 0.5); // 站回挑空东侧净空位
    g.tools.hasCamera = true; g.tools.bulbs = 2; g.tools.flashCd = 0;
    // 玩家面朝手的方向按快门
    const p = g.player;
    p.yaw = Math.atan2(-(gu.hand.x - p.pos.x), -(gu.hand.z - p.pos.z));
    p.syncCamera(0);
    const fired = g.tools.flash();
    const stunned = gu.stunT;
    // 僵直中振动拉满也不许动、不许点名
    let caught = false;
    const ctx = { player: g.player, dt: 0.25, audio: null, vibration: 1, onCaught: () => { caught = true; } };
    const hx = gu.hand.x, hz = gu.hand.z;
    for (let i = 0; i < 12; i++) gu.update(ctx);
    return {
      fired, stunned: stunned.toFixed(1), alignK: gu.alignK.toFixed(2),
      moved: Math.hypot(gu.hand.x - hx, gu.hand.z - hz).toFixed(2), caught,
    };
  });
  console.log('[verify] guest flash-fix:', JSON.stringify(flashRes));
  assert(flashRes.fired, 'flash not fired');
  assert(parseFloat(flashRes.stunned) >= 5.9, 'guest not photo-fixed: ' + flashRes.stunned);
  assert(parseFloat(flashRes.alignK) > 0.8, 'panels not aligned: ' + flashRes.alignK);
  assert(parseFloat(flashRes.moved) < 0.05, 'guest moved while fixed');
  assert(!flashRes.caught, 'guest named player while fixed');
  await h.shot('r6-04-guest-aligned');

  // ---------- 3. 闹钟诱引：响铃把手拉向钟位 ----------
  const lureRes = await page.evaluate(() => {
    const g = window.__game;
    const gu = g.guest;
    gu.stunT = 0; gu.alignK = 0; gu.lure = null;
    const hi = g.world.dynamic.hotelInfo.origin;
    gu.hand.set(hi.x - 4, hi.y, hi.z + 8);
    // 玩家在大堂东南角放钟
    g.tools.clocks = 1;
    g.player.setPosition(hi.x + 5, hi.z + 3, -2.2, hi.y + 0.5);
    g.tools.placeClock();
    const c = g.tools.activeClocks[g.tools.activeClocks.length - 1];
    // 放完就走——钟只响给它听；玩家退出可及区，避免手贴过来触发真实引座
    g.player.setPosition(hi.x + 14, hi.z + 14, 0, hi.y + 0.5);
    for (let i = 0; i < 12; i++) g.tools.update(0.25); // 上弦→响
    const before = Math.hypot(gu.hand.x - c.x, gu.hand.z - c.z);
    const ctx = { player: g.player, dt: 0.25, audio: null, vibration: 0, onCaught: () => {} };
    for (let i = 0; i < 30; i++) gu.update(ctx);
    const after = Math.hypot(gu.hand.x - c.x, gu.hand.z - c.z);
    return { phase: c.phase, lured: !!gu.lure || after < before, before: before.toFixed(1), after: after.toFixed(1) };
  });
  console.log('[verify] guest clock-lure:', JSON.stringify(lureRes));
  assert(lureRes.lured, 'guest not lured by clock');
  assert(parseFloat(lureRes.after) < parseFloat(lureRes.before) - 1.5, 'guest hand did not move toward clock');

  // ---------- 4. 贝灰界：手到界前停住 ----------
  const limeRes = await page.evaluate(() => {
    const g = window.__game;
    const gu = g.guest;
    gu.lure = null;
    const hi = g.world.dynamic.hotelInfo.origin;
    gu.hand.set(hi.x, hi.y, hi.z + 8);
    // 玩家站在手正南 3.5m，面朝北倒灰——界横在手来的路上
    g.player.setPosition(hi.x, hi.z + 4.5, Math.PI, hi.y + 0.5);
    g.player.yaw = Math.PI;
    g.tools.lime = 1;
    const poured = g.tools.pourLime();
    const line = g.tools.limeLines[g.tools.limeLines.length - 1];
    // 玩家在硬地上蹦（振动满）——上宾压过来，但界在中间
    const ctx = { player: g.player, dt: 0.25, audio: null, vibration: 1, onCaught: () => {} };
    let minDistToLine = 99;
    for (let i = 0; i < 40; i++) {
      gu.update(ctx);
      const mid = { x: (line.x1 + line.x2) / 2, z: (line.z1 + line.z2) / 2 };
      minDistToLine = Math.min(minDistToLine, Math.hypot(gu.hand.x - mid.x, gu.hand.z - mid.z));
    }
    const crossed = gu.hand.z < line.z1 - 0.3;
    return { poured, crossed, minDistToLine: minDistToLine.toFixed(2), handZ: gu.hand.z.toFixed(1), lineZ: line.z1.toFixed(1) };
  });
  console.log('[verify] guest lime-hold:', JSON.stringify(limeRes));
  assert(limeRes.poured, 'lime not poured');
  assert(!limeRes.crossed, 'guest crossed the lime line');
  await h.shot('r6-05-guest-lime');

  console.log('[verify] round6 guest all pass');
}
