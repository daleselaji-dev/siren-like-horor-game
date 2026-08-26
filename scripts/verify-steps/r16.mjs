// 轮16 取证：门3立面——进深门斗/体积雨棚/绿钢窗框窗洞进深/勒脚伸缩缝落水管/屋顶设备层
import fs from 'node:fs';

export async function run(page, h) {
  fs.mkdirSync('verify/r16', { recursive: true });
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
    await h.shot(`r16/${name}`);
  };

  // ---------- 断言：绿漆钢窗框真的批进了场景（数百根框料合批） ----------
  const fr = await page.evaluate(() => {
    const g = window.__game;
    let frameVerts = 0;
    g.engine.scene.traverse((o) => {
      if (o.isMesh && o.material?.color?.getHex?.() === 0x37544a) {
        frameVerts += o.geometry.attributes.position.count;
      }
    });
    return { frameVerts };
  });
  console.log('[verify] window frames:', JSON.stringify(fr));
  assert(fr.frameVerts > 3000, 'green steel window frames missing/too few: ' + fr.frameVerts);

  const HO = await page.evaluate(() => {
    const o = window.__game.world.dynamic.hotelInfo.origin;
    return { x: o.x, y: o.y, z: o.z };
  });

  // ---------- 门3立面取证 ----------
  // 全立面（含屋顶设备层轮廓）
  await look('30_hotel_facade_wide', HO.x + 1, HO.z + 39, HO.x, HO.z + 11, undefined, 0.15);
  // 斜角看窗洞进深（框缩在墙厚里，窗台/窗楣出挑投影）
  await look('31_hotel_facade_corner', HO.x + 21, HO.z + 32, HO.x + 4, HO.z + 11, undefined, 0.16);
  // 正门进深门斗+体积雨棚（近）
  await look('32_hotel_entrance_porch', HO.x, HO.z + 23.5, HO.x, HO.z + 11.5, undefined, 0.1);
  // 门斗侧看（雨棚檐口板带厚度、门斗腔进深、石狮）
  await look('33_hotel_porch_oblique', HO.x - 10, HO.z + 19.5, HO.x + 1.5, HO.z + 12, undefined, 0.1);
  // 屋顶设备层剪影（机房/水箱/天线杆越过女儿墙）
  await look('34_hotel_roofline', HO.x - 2, HO.z + 36, HO.x - 3, HO.z + 8, undefined, 0.24);

  // ---------- 门3车内：重播开场零拍定帧（内衬壳/顶棚/A柱/座椅/仪表可读） ----------
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
  await h.shot('r16/35_bus_interior_wiper_mid');
  await freezeIntroAt(1090);  // 雨刮近停摆——内饰全景
  await h.shot('r16/36_bus_interior_cabin');
  await page.evaluate(() => {
    const g = window.__game;
    g.game.state = 'PLAY';
    g.story.endIntro();
  });

  console.log('[verify] r16 hotel facade evidence done');
}
