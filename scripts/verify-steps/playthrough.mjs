// 全流程通关验证：按 20 分钟节拍表把主线走一遍（用传送加速位移，交互全部真实按键）
export async function run(page, h) {
  const flags = () => page.evaluate(() => {
    const s = window.__game.story;
    return { ...s.flags, notes: [...s.notesFound], checkpoint: s.checkpoint.name };
  });
  // yHint：多层结构（如灯塔内部/顶部）中指定期望楼层的参考高度
  const tp = (x, z, yaw, yHint) => page.evaluate(
    ({ x, z, yaw, yHint }) => window.__game.player.setPosition(x, z, yaw, yHint),
    { x, z, yaw, yHint });
  const interact = async () => { await h.tapKey('KeyE'); await h.sleep(400); };

  await page.click('#title-start');
  await h.sleep(2000);
  await h.shot('p00-start');
  await h.tapKey('Space'); // 跳过开场运镜
  await h.sleep(500);

  // ---- 节拍1：礁滩 · 文书① ----
  await tp(77, 109, 0.5);
  await h.sleep(300);
  await interact(); // 拾取
  await h.shot('p01-note1');
  await h.tapKey('KeyE'); // 关闭
  await h.sleep(300);

  // ---- 节拍2：石堤区 · 触发潜行教学 · 文书② ----
  await tp(10, 55, 0);
  await h.sleep(600);
  // 渔寮一内文书②（h1 在 2,52 门朝南 → 桌上位置 local(-1,0.85,-0.7)）
  const n2 = await page.evaluate(() => {
    const v = window.__game.world.locations.note2;
    return { x: v.x, z: v.z };
  });
  await tp(n2.x + 0.5, n2.z + 0.8, 0.4);
  await h.sleep(300);
  await interact();
  await h.shot('p02-note2');
  await h.tapKey('KeyE');
  await h.sleep(200);

  // ---- 节拍3：堤门锁着 → 提示视奸 ----
  await tp(16, 41, Math.PI);
  await h.sleep(300);
  await interact(); // 推门（锁着）
  await h.shot('p03-gate-locked');
  let f = await flags();
  console.log('[verify] after locked gate:', f.sightjackTip ? 'tip OK' : 'TIP MISSING');

  // ---- 节拍4：视奸巡堤人 → 得知钥匙位置 ----
  // 把巡堤人挪到渔寮二段(wpIndex=6)，玩家在附近视奸
  await page.evaluate(() => {
    const e = window.__game.byId.dikePatrol;
    e.wpIndex = 6;
    e.pos.set(20, 0, 60);
    e.pos.y = window.__game.world.heightAt(20, 60);
    e.state = 'PATROL';
  });
  await tp(8, 62, -1.5);
  await h.sleep(200);
  await h.tapKey('KeyQ'); // 进入视奸
  await h.sleep(400);
  // 切到巡堤人信道
  for (let i = 0; i < 8; i++) {
    const label = await page.evaluate(() => window.__game.sightjack.current?.label);
    if (label === '巡堤的人') break;
    await h.tapKey('KeyQ');
    await h.sleep(250);
  }
  await h.sleep(2500); // 等他走到钥匙检查段
  await h.shot('p04-sightjack-key');
  f = await flags();
  console.log('[verify] knowKeySpot:', f.knowKeySpot);
  await h.tapKey('KeyW'); // 退出视奸
  await h.sleep(300);

  // ---- 节拍5：搬水缸拿钥匙 → 开门 ----
  const vat = await page.evaluate(() => {
    const v = window.__game.world.dynamic.hut2.local(-1.35, 0.6, 1.0);
    return { x: v.x, z: v.z };
  });
  await tp(vat.x, vat.z + 0.6, Math.PI);
  await h.sleep(300);
  await interact();
  f = await flags();
  console.log('[verify] hasKey:', f.hasKey);
  await tp(16, 41, Math.PI);
  await h.sleep(300);
  await interact();
  f = await flags();
  console.log('[verify] gateOpen:', f.gateOpen);
  await h.sleep(1500);
  await h.shot('p05-gate-open');

  // ---- 节拍6：村中心 → 广播站 文书④ ----
  await tp(2, 6, 0);
  await h.sleep(600); // 村中心触发
  const radio = await page.evaluate(() => {
    const v = window.__game.world.locations.radio;
    return { x: v.x, z: v.z };
  });
  await tp(radio.x - 0.8, radio.z + 1.0, 2.6);
  await h.sleep(300);
  await interact();
  await h.shot('p06-radio-note4');
  await h.tapKey('KeyE');
  await h.sleep(300);

  // ---- 节拍7：潮母宫 · 视奸祭师 → 看鬼火顺序 ----
  await tp(-56, -74, 1.57);
  await h.sleep(700); // 触发台词
  await h.tapKey('KeyQ');
  for (let i = 0; i < 10; i++) {
    const label = await page.evaluate(() => window.__game.sightjack.current?.label);
    if (label === '祭师 闫守潮') break;
    await h.tapKey('KeyQ');
    await h.sleep(250);
  }
  await h.sleep(2600); // 看一轮鬼火
  await h.shot('p07-ritual-sightjack');
  const ghost = await page.evaluate(() =>
    window.__game.world.dynamic.censers.map((c) => c.ghostOn));
  console.log('[verify] ghost during sightjack:', JSON.stringify(ghost));
  await h.tapKey('KeyW');
  await h.sleep(300);

  // ---- 节拍8：按序点香（北2 → 南0 → 中1） ----
  const censers = await page.evaluate(() =>
    window.__game.world.dynamic.censers.map((c) => ({ x: c.pos.x, z: c.pos.z })));
  for (const idx of [2, 0, 1]) {
    const c = censers[idx];
    await tp(c.x + 1.2, c.z, 1.57);
    await h.sleep(300);
    await interact();
  }
  f = await flags();
  console.log('[verify] puzzleSolved:', f.puzzleSolved);
  await h.shot('p08-censers-lit');

  // ---- 节拍9：取喉铃 → 血潮 ----
  const altar = await page.evaluate(() => {
    const v = window.__game.world.locations.altar;
    return { x: v.x, z: v.z };
  });
  await tp(altar.x + 1.4, altar.z, 1.57);
  await h.sleep(300);
  await interact();
  f = await flags();
  console.log('[verify] bellTaken:', f.bellTaken);
  await h.sleep(4500); // 等血潮启动
  f = await flags();
  console.log('[verify] bloodTide:', f.bloodTide);
  await tp(-40, -60, 0.6);
  await h.sleep(1200);
  await h.shot('p09-bloodtide-out');

  // ---- 节拍10：沉船湾（走龙骨） ----
  await tp(30, -63, -2.6);
  await h.sleep(700);
  await h.shot('p10-wreck-keel');
  // 靠近歌唱者测共鸣
  await page.evaluate(() => {
    const s = window.__game.byId.singer;
    const p = window.__game.player.pos;
    s.pos.set(p.x + 6, 0, p.z);
    s.pos.y = window.__game.world.heightAt(s.pos.x, s.pos.z);
  });
  await h.sleep(3500);
  const res = await page.evaluate(() => window.__game.stealth.resonance.toFixed(2));
  console.log('[verify] resonance near singer:', res);
  await h.shot('p11-resonance');
  // 拉开距离
  await page.evaluate(() => {
    const s = window.__game.byId.singer;
    s.pos.set(0, 0, -20);
    s.pos.y = window.__game.world.heightAt(0, -20);
  });
  await h.sleep(1000);

  // ---- 节拍11：灯塔（电闸→梯子→顶部） ----
  const br = await page.evaluate(() => {
    const v = window.__game.world.locations.breaker;
    return { x: v.x, z: v.z, y: v.y };
  });
  await tp(br.x - 0.6, br.z - 0.6, 0.8, br.y); // yHint 指向一楼，避免落在塔顶补丁上
  await h.sleep(300);
  await interact();
  f = await flags();
  console.log('[verify] breakerOn:', f.breakerOn);
  await h.shot('p12-breaker');
  const lad = await page.evaluate(() => {
    const v = window.__game.world.locations.ladderBottom;
    return { x: v.x, z: v.z, y: v.y };
  });
  await tp(lad.x, lad.z, 0, lad.y);
  await h.sleep(300);
  await interact(); // 上梯（传送含1s黑屏）
  await h.sleep(1800);
  f = await flags();
  console.log('[verify] atTop:', f.atTop);
  await h.shot('p13-lighthouse-top');

  // ---- 节拍12：敲铃 → 终局 ----
  const bt = await page.evaluate(() => {
    const v = window.__game.world.locations.bellTop;
    return { x: v.x, z: v.z };
  });
  // 站到铃架正旁（远离梯口，避免最近交互变成"爬下灯塔"）
  await tp(bt.x + 0.3, bt.z - 0.8, -0.4);
  await h.sleep(300);
  await interact();
  f = await flags();
  console.log('[verify] ended:', f.ended);
  // 终局演出全长约 25s 游戏时间；无头低帧率下 dt 钳制会拉长真实耗时 → 按演出阶段轮询截图
  const waitStage = async (stage, timeoutMs) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const st = await page.evaluate(() => window.__game.story.endSeq?.stage ?? -1);
      if (st >= stage) return true;
      await h.sleep(800);
    }
    return false;
  };
  await waitStage(1, 20000);
  await h.sleep(4000);
  await h.shot('p14-tidemother-1');
  await waitStage(2, 20000);
  await h.shot('p15-tidemother-2');
  await waitStage(3, 20000);
  await h.sleep(2000);
  await h.shot('p16-forced-sightjack');
  await waitStage(5, 30000);
  await h.sleep(1500);
  await h.shot('p17-ending');
  const endShown = await page.evaluate(() =>
    document.getElementById('ending-overlay').classList.contains('show'));
  console.log('[verify] ending overlay shown:', endShown);
  const notesTotal = await page.evaluate(() => window.__game.story.notesFound.size);
  console.log('[verify] notes found in run:', notesTotal);
}
