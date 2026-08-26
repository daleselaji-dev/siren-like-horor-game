// 轮15C 取证：开场首拍前 2 秒大巴车内视角（雨刮扫挡风玻璃）
//            + 上宾首见演出（板材从天花逐块聚合成臂）
import fs from 'node:fs';

export async function run(page, h) {
  fs.mkdirSync('verify/r15', { recursive: true });
  const assert = (ok, msg) => { if (!ok) throw new Error('ASSERT: ' + msg); };

  // ---------- 1. 零拍 · 车内视角（intro 走真实时钟——先热身+等照片脸烘焙完
  //             再重播：烘焙占死主线程时重播会一帧不跑；FULLSPEC/SwiftShader
  //             帧距可达 0.7s，墙钟 sleep 踩不准雨刮相位——改页内逐帧采样） ----------
  await page.click('#title-start');
  await h.sleep(2000);
  await h.tapKey('Space'); // 先跳过首遍开场
  await page.waitForFunction(() => window.__facesReady === true, { timeout: 300000, polling: 1000 });
  await h.sleep(1500); // 烘焙后帧率回稳
  const replayIntro = () => page.evaluate(() => {
    const g = window.__game;
    const bus = g.world.dynamic.bus;
    bus.visible = true;
    bus.position.set(64.5, g.world.heightAt(64.5, -1.3) + 0.06, -1.3);
    g.story.busGo = false;
    g.story._busV = 1.2;
    g.story.flags.intro = false;
    g.story.beginIntro();
  });
  // 重播 + 定帧采相位：SwiftShader 帧距可达 1.5s，零拍(2s)按墙钟根本采不到几帧。
  // 改成决定性方案——PAUSE 掉主循环的 story 驱动，手动把开场真实时钟 t0 拨到
  // 指定拍点再同步调 updateIntro(0)：相机/雨刮/湿镜全按该拍重算，再渲染截图
  await replayIntro();
  const probe = async (ms, shotName) => {
    const r = await page.evaluate((mm) => {
      const g = window.__game;
      g.game.state = 'PAUSE'; // 停掉主循环里的 story.update（渲染照常）
      const s = g.story.introSeq;
      s.t0 = performance.now() - mm;
      g.story.updateIntro(0);
      const wip = g.world.dynamic.busWipers;
      const bus = g.world.dynamic.bus;
      const cam = g.engine.camera;
      return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res({
        t: +s.t.toFixed(2),
        rx: +wip[0].rotation.x.toFixed(3),
        wet: +g.engine.finalPass.uniforms.uWetLens.value.toFixed(3),
        camIn: Math.abs(cam.position.x - bus.position.x) < 4.5
          && Math.abs(cam.position.z - bus.position.z) < 1.3
          && cam.position.y > bus.position.y + 1.2,
      }))));
    }, ms);
    if (shotName) await h.shot(shotName);
    return r;
  };
  const pA = await probe(150);                                    // 刚起扫
  const pB = await probe(600, 'r15/15_bus_interior_wiper_a');     // 扫到中幅（湿镜被抹开）
  const pC = await probe(1120, 'r15/16_bus_interior_wiper_b');    // 回落近停摆（水又蒙上）
  console.log('[verify] wiper phases:', JSON.stringify({ pA, pB, pC }));
  assert(pA.camIn && pB.camIn && pC.camIn, 'intro beat0 camera not inside bus');
  const rxs = [pA.rx, pB.rx, pC.rx];
  assert(Math.max(...rxs) - Math.min(...rxs) > 0.4,
    'wiper sweep amplitude too small: ' + rxs.join(','));
  assert(pB.wet < 0.7 && pC.wet > pB.wet + 0.15,
    'wet lens not breathing with wiper: ' + pB.wet + ' -> ' + pC.wet);

  // 恢复主循环并跳过其余开场
  await page.evaluate(() => { window.__game.game.state = 'PLAY'; });
  await h.tapKey('Space');
  await h.sleep(300);

  const frames = (n) => page.evaluate((k) => new Promise((res) => {
    let i = 0;
    const t0 = performance.now();
    const tick = () => {
      if (++i >= k || performance.now() - t0 > 30000) res();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), n);

  // ---------- 2. 上宾首见演出：板材从天花逐块聚合成臂 ----------
  // 玩家先站进大堂（光预算/LOD 就位），直接点火演出
  await page.evaluate(() => {
    const g = window.__game;
    const HI = g.world.dynamic.hotelInfo;
    g.player.setPosition(HI.origin.x - 4, HI.origin.z + 1.5, 2.6, HI.origin.y + 0.02);
    g.guest.setEnabled(true);
    g.story.beginGuestIntro();
  });
  const st0 = await page.evaluate(() => {
    const g = window.__game;
    const A = g.guest.assembling;
    return {
      parts: A ? A.parts.length : 0,
      ropesHidden: g.guest.ropes.every((r) => !r.grp.visible),
      silksHidden: g.guest.silks.every((sk) => !sk.grp.visible),
      frozen: g.player.frozen,
      seq: !!g.story.guestSeq,
    };
  });
  console.log('[verify] guest assembly begin:', JSON.stringify(st0));
  assert(st0.parts === 21, 'assembly parts wrong: ' + st0.parts);
  assert(st0.ropesHidden && st0.silksHidden, 'ropes/silks should hang only after docking');
  assert(st0.frozen && st0.seq, 'guest intro seq not holding the player');

  const waitSeqT = (x) => page.waitForFunction((xx) => {
    const s = window.__game.story.guestSeq;
    return !!s && s.t >= xx;
  }, { polling: 120, timeout: 180000 }, x);

  await waitSeqT(0.9);
  await h.shot('r15/17_guest_assembly_peel');   // 板正从顶棚剥离
  // 演出中：至少一块板悬在半空（既不在顶棚也不在臂位）
  const mid = await page.evaluate(() => {
    const g = window.__game;
    const A = g.guest.assembling;
    if (!A) return { flying: 0, camAway: false };
    let flying = 0;
    for (let i = 0; i < 9; i++) {
      const k = (A.t - i * A.stagger) / A.fly;
      if (k > 0.1 && k < 0.9) flying++;
    }
    const cam = g.engine.camera;
    const dp = Math.hypot(cam.position.x - g.player.pos.x, cam.position.z - g.player.pos.z);
    return { flying, t: A.t.toFixed(2), camCut: dp < 6 }; // 机位就在大堂里
  });
  console.log('[verify] assembly mid:', JSON.stringify(mid));
  assert(mid.flying >= 1, 'no panel airborne mid-assembly');
  await waitSeqT(2.8);
  await h.shot('r15/18_guest_assembly_mid');    // 半途：板翻着跟头往臂位聚
  await waitSeqT(5.1);
  await h.shot('r15/19_guest_assembly_arm');    // 成臂：指节落位扒地
  // 收尾：序列退出、玩家解锁、绳/绸挂回、聚合态清空
  await page.waitForFunction(() => !window.__game.story.guestSeq, { polling: 200, timeout: 180000 });
  await frames(3);
  const end = await page.evaluate(() => {
    const g = window.__game;
    return {
      assembling: !!g.guest.assembling,
      frozen: g.player.frozen,
      ropesBack: g.guest.ropes.every((r) => r.grp.visible),
      silksBack: g.guest.silks.every((sk) => sk.grp.visible),
      enabled: g.guest.enabled,
    };
  });
  console.log('[verify] guest assembly end:', JSON.stringify(end));
  assert(!end.assembling, 'assembly did not finish');
  assert(!end.frozen, 'player still frozen after guest intro');
  assert(end.ropesBack && end.silksBack, 'ropes/silks not restored');
  assert(end.enabled, 'guest disabled after intro');
  await h.shot('r15/20_guest_settled');

  console.log('[verify] r15c all pass');
}
