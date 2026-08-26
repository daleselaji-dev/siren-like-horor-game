// 轮17 取证：门3立面加密（窗套/竖壁柱/雨痕/雨棚梁吊筋/屋顶栏杆/门斗凹进）
// + 车内驾驶舱（仪表凹槽开关/圆表盘/座椅缝线头枕巾/雨刮臂胶条/挡风雨珠/舱内光）
// + 门2场内近景（司仪抬臂近景重拍）
import fs from 'node:fs';

export async function run(page, h) {
  fs.mkdirSync('verify/r17', { recursive: true });
  await page.click('#title-start');
  await h.sleep(1200);
  await h.tapKey('Space');
  await h.sleep(300);
  await page.waitForFunction(() => window.__facesReady === true, { timeout: 300000, polling: 1000 });

  const assert = (ok, msg) => { if (!ok) throw new Error('ASSERT: ' + msg); };
  const frames = (n) => page.evaluate((k) => new Promise((res) => {
    let i = 0;
    const t0 = performance.now();
    const tick = () => {
      if (++i >= k || performance.now() - t0 > 20000) res();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), n);
  const look = async (name, px, pz, tx, tz, yHint, pitch = 0) => {
    await page.evaluate(({ px, pz, tx, tz, yHint, pitch }) => {
      const g = window.__game;
      const yaw = Math.atan2(-(tx - px), -(tz - pz));
      g.player.setPosition(px, pz, yaw, yHint);
      g.player.pitch = pitch;
      g.player.syncCamera(0);
    }, { px, pz, tx, tz, yHint, pitch });
    await frames(3);
    await page.evaluate(() => window.__game.hud.clearSubtitles());
    await h.shot(`r17/${name}`);
  };

  // ---------- 断言：轮17 立面构件真的批进了场景 ----------
  // 窗套抹灰 0x8d887c / 壁柱水泥 0x767066（材质标记色）——顶点数为零即立面没长出来
  const fc = await page.evaluate(() => {
    const g = window.__game;
    let surround = 0, pilaster = 0;
    g.engine.scene.traverse((o) => {
      if (!o.isMesh) return;
      const hex = o.material?.color?.getHex?.();
      if (hex === 0x8d887c) surround += o.geometry.attributes.position.count;
      if (hex === 0x767066) pilaster += o.geometry.attributes.position.count;
    });
    return { surround, pilaster };
  });
  console.log('[verify] r17 facade:', JSON.stringify(fc));
  assert(fc.surround > 1000, 'window surrounds missing: ' + fc.surround);
  assert(fc.pilaster >= 96, 'pilasters missing: ' + fc.pilaster); // 4 根 × box 24 顶点

  // 断言：大巴挡风雨珠层/雨刮胶条件数
  const bi = await page.evaluate(() => {
    const g = window.__game;
    const bus = g.world.dynamic.bus;
    let drops = 0, meshes = 0;
    bus.traverse((o) => {
      if (!o.isMesh) return;
      meshes++;
      if (o.name === 'busShieldDrops') drops++;
    });
    return { drops, meshes, wipers: g.world.dynamic.busWipers.length };
  });
  console.log('[verify] r17 bus:', JSON.stringify(bi));
  assert(bi.drops === 1, 'windshield raindrop layer missing');
  assert(bi.wipers === 2, 'wipers missing');
  assert(bi.meshes > 150, 'bus interior too sparse: ' + bi.meshes);

  const HO = await page.evaluate(() => {
    const o = window.__game.world.dynamic.hotelInfo.origin;
    return { x: o.x, y: o.y, z: o.z };
  });

  // ---------- 门3立面取证 ----------
  // 全立面（与旧 r16/30 同机位——肉眼对比必须更密）
  await look('40_hotel_facade_wide', HO.x + 1, HO.z + 39, HO.x, HO.z + 11, undefined, 0.15);
  // 斜角近景：窗套出墙/窗台板/雨痕/壁柱进深（掠射角是进深的证据位）
  await look('41_hotel_facade_oblique', HO.x + 14, HO.z + 17.5, HO.x - 2, HO.z + 11, undefined, 0.3);
  // 正门：门斗凹腔（门扇退后 40cm）+ 雨棚梁与斜拉吊筋
  await look('42_hotel_entrance_porch', HO.x - 1, HO.z + 21, HO.x, HO.z + 11.5, undefined, 0.12)
  // 屋顶剪影（栏杆锯齿/机房/水箱/天线越过女儿墙）
  await look('43_hotel_roofline', HO.x - 2, HO.z + 36, HO.x - 3, HO.z + 8, undefined, 0.24);

  // ---------- 门2场内近景：司仪抬臂（重拍旧 r15/06 机位） ----------
  await look('45_emcee_close', -15.9, -64.1, -16.5, -64.6, 3.5, 0.02);

  // ---------- 门3车内：开场零拍定帧 + 驾驶舱专拍 ----------
  await page.evaluate(() => {
    const g = window.__game;
    const bus = g.world.dynamic.bus;
    bus.visible = true;
    bus.position.set(64.5, g.world.heightAt(64.5, -1.3) + 0.06, -1.3);
    g.story.busGo = false;
    g.story._busV = 1.2;
    g.story.flags.intro = false;
    g.story.beginIntro();
  });
  const freezeIntroAt = (ms) => page.evaluate((t) => new Promise((res) => {
    const g = window.__game;
    g.game.state = 'PAUSE';
    g.story.introSeq.t0 = performance.now() - t;
    g.story.updateIntro(0);
    requestAnimationFrame(() => requestAnimationFrame(res));
  }), ms);
  await freezeIntroAt(620);   // 雨刮扫到中幅
  await h.shot('r17/46_bus_interior_wiper_mid');
  // 驾驶舱专拍：过道前端朝仪表台/方向盘/前挡雨珠——一眼要读成「大巴驾驶舱」
  await page.evaluate(() => new Promise((res) => {
    const g = window.__game;
    const bus = g.world.dynamic.bus;
    const V = bus.position.constructor;
    const cam = g.engine.camera;
    // 前门井四分之三机位：大平方向盘越过台沿+司机+表盘+挡风雨珠一帧全收
    const eye = bus.localToWorld(new V(2.35, 1.8, -0.48));
    const tgt = bus.localToWorld(new V(3.5, 1.28, 0.22));
    cam.position.copy(eye);
    cam.lookAt(tgt);
    g.hud.clearSubtitles();
    requestAnimationFrame(() => requestAnimationFrame(res));
  }));
  await h.shot('r17/44_bus_cabin');
  await page.evaluate(() => {
    const g = window.__game;
    g.game.state = 'PLAY';
    g.story.endIntro();
  });

  console.log('[verify] r17 evidence done');
}
