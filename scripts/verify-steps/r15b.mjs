// 轮15B 取证：远景窗内假房间（interior mapping）+ 街面杂草/垃圾散布密度
//            + 镜洼潮网与真网潮息同步 + 巨影过顶低鸣
import fs from 'node:fs';

export async function run(page, h) {
  fs.mkdirSync('verify/r15', { recursive: true });
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
    await h.shot(`r15/${name}`);
  };

  // ---------- 1. 假房间窗材质真的批进了场景（一份合批网格，三角够多） ----------
  const wr = await page.evaluate(() => {
    const g = window.__game;
    let meshes = 0, verts = 0;
    g.engine.scene.traverse((o) => {
      if (o.isMesh && o.material === g.M.winRoom) {
        meshes++;
        verts += o.geometry.attributes.position.count;
      }
    });
    // 杂草簇：weedMat 是局部材质，按颜色找合批网格
    let weedVerts = 0;
    g.engine.scene.traverse((o) => {
      if (o.isMesh && o.material?.color?.getHex?.() === 0x39422a) {
        weedVerts += o.geometry.attributes.position.count;
      }
    });
    return { meshes, verts, weedVerts };
  });
  console.log('[verify] winRoom batch:', JSON.stringify(wr));
  assert(wr.meshes >= 1, 'winRoom batched mesh missing');
  assert(wr.verts > 800, 'winRoom window area too small: ' + wr.verts);
  assert(wr.weedVerts > 3000, 'weed tufts too sparse: ' + wr.weedVerts);

  // ---------- 2. 假房间窗取证：酒店北立面 / 家属楼北墙 / 录像厅西山墙（视差双机位） ----------
  const HO = await page.evaluate(() => {
    const o = window.__game.world.dynamic.hotelInfo.origin;
    return { x: o.x, y: o.y, z: o.z };
  });
  // 酒店北立面 2F/3F 两条窗带（16 樘客房窗，两成亮暖灯）
  await look('07_hotel_winrooms', HO.x - 4, HO.z + 24, HO.x, HO.z + 11, undefined, 0.22);
  await look('08_hotel_winrooms_side', HO.x - 13, HO.z + 17, HO.x - 2, HO.z + 11, undefined, 0.3);
  // 家属楼二栋北墙 5 樘×2 层（1F 带防盗栅）
  await look('09_dorm_winrooms', -37, 21.6, -37, 17.2, undefined, 0.12);
  // 视差对照：同一片窗带换 30° 机位——窗后的墙/家具暗带相对窗框要移位
  await look('10_dorm_winrooms_parallax', -32.2, 20.4, -36, 17.2, undefined, 0.12);

  // ---------- 3. 街面散布取证：镇前街草缘 / 排水口绿瓶纸屑 ----------
  await look('11_street_weeds', 38, 2.2, 22, -4.2, undefined, -0.2);
  await look('12_drain_bottles', 32.2, 3.6, 30.8, 2.6, undefined, -0.55);
  await look('13_street_litter_wide', 10, -6.5, -2, -20, undefined, -0.16);

  // ---------- 4. 点火返潮 → 镜洼潮网与真网同一口潮息（数值断言） ----------
  await page.evaluate(() => window.__game.agenda.advanceTo(3));
  await h.sleep(800);
  const sync = await page.evaluate(() => {
    const g = window.__game;
    const td = g.world.dynamic.leakState.tide;
    const probe = (t) => {
      g.world.updateFx(t);
      return {
        real: td.mats[0].opacity / td.op[0],
        mir: td.mirNetM.opacity / td.mirOp,
        offEq: td.mirNetM.map.offset.x === td.mats[0].map.offset.x
          && td.mirNetM.map.offset.y === td.mats[0].map.offset.y,
        gx: td.giantPos.x, gz: td.giantPos.z,
      };
    };
    const a = probe(500);
    const b = probe(507.15); // 潮息半周期外的另一拍
    return { a, b, breatheMoved: Math.abs(a.real - b.real) > 0.02 };
  });
  console.log('[verify] mirror tide sync:', JSON.stringify(sync));
  assert(Math.abs(sync.a.real - sync.a.mir) < 1e-6, 'mirror net breathe desynced (t=500)');
  assert(Math.abs(sync.b.real - sync.b.mir) < 1e-6, 'mirror net breathe desynced (t=507)');
  assert(sync.a.offEq && sync.b.offEq, 'mirror net texture offset desynced');
  assert(sync.breatheMoved, 'tide breathe frozen between probes');
  assert(sync.a.gx !== sync.b.gx || sync.a.gz !== sync.b.gz, 'giantPos not tracking');

  // ---------- 5. 巨影过顶低鸣：巨影悬停头顶 → 主循环里 giantK→1 → 鸣腔起振 ----------
  await page.evaluate(() => {
    const g = window.__game;
    g.player.setPosition(2, -9, 0);
    const td = g.world.dynamic.leakState.tide;
    td.giant.cx = 2; td.giant.cz = -9; td.giant.r = 0.01; // 原地悬停在玩家头顶
  });
  await h.sleep(2600); // 真实主循环跑：updateFx 记 giantPos → main 算 giantK → audio 起振
  const hum = await page.evaluate(() => {
    const g = window.__game;
    const td = g.world.dynamic.leakState.tide;
    const gd = Math.hypot(td.giantPos.x - g.player.pos.x, td.giantPos.z - g.player.pos.z);
    return {
      dist: gd.toFixed(1),
      built: !!g.audio.giantHumGain,
      gain: g.audio.giantHumGain ? g.audio.giantHumGain.gain.value : 0,
      ctxState: g.audio.ctx?.state,
    };
  });
  console.log('[verify] giant hum:', JSON.stringify(hum));
  assert(parseFloat(hum.dist) < 12, 'giant not hovering over player: d=' + hum.dist);
  assert(hum.built, 'giant hum oscillators never built');
  assert(hum.gain > 0.05, 'giant hum gain too low: ' + hum.gain);
  // 巨影游远 → 低鸣要收下去（距离驱动，不是常开嗡声）
  await page.evaluate(() => {
    const td = window.__game.world.dynamic.leakState.tide;
    td.giant.cx = 200; td.giant.cz = 200; td.giant.r = 0.01;
  });
  await h.sleep(3000);
  const humFar = await page.evaluate(() => window.__game.audio.giantHumGain.gain.value);
  console.log('[verify] giant hum far gain:', humFar);
  assert(humFar < hum.gain * 0.5, 'giant hum did not fall off with distance: ' + humFar);

  // ---------- 6. 巨影压洼镜洼取证（镜洼网与头顶网同拍呼吸的画面证据） ----------
  await page.evaluate(() => {
    const g = window.__game;
    const td = g.world.dynamic.leakState.tide;
    td.giant.cx = 38; td.giant.cz = -1.2; td.giant.r = 0.01;
    g.world.updateFx(520);
  });
  await frames(3);
  await look('14_mirror_breathe_giant', 37.2, 0.8, 38.4, -1.8, undefined, -0.95);

  console.log('[verify] r15b all pass');
}
