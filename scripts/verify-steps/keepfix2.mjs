// keep 集补拍二：44 臂弧全景/46 垂绳界桩牌——不再猜机位，
// 落位后读板件真实世界坐标，按几何反算相机位置与俯仰。
export async function run(page, h) {
  await page.click('#title-start');
  await h.sleep(1500);
  await h.tapKey('Space');
  await h.sleep(400);
  await page.waitForFunction(() => window.__facesReady === true, { timeout: 300000, polling: 1000 });

  const frames = (n) => page.evaluate((k) => new Promise((res) => {
    let i = 0;
    const t0 = performance.now();
    const tick = () => {
      if (++i >= k || performance.now() - t0 > 15000) res();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), n);

  const shootAt = async (name, cam) => {
    await page.evaluate((c) => {
      const g = window.__game;
      const yaw = Math.atan2(-(c.tx - c.px), -(c.tz - c.pz));
      g.player.setPosition(c.px, c.pz, yaw, c.yHint);
      const eyeY = g.player.pos.y + 1.62;
      g.player.pitch = Math.atan2(c.ty - eyeY, Math.hypot(c.tx - c.px, c.tz - c.pz));
      g.player.syncCamera(0);
    }, cam);
    await frames(3);
    await page.evaluate(() => window.__game.hud.clearSubtitles());
    await h.shot(`keep/${name}`);
  };

  await page.evaluate(() => {
    const g = window.__game;
    g.agenda.advanceTo(3);
    g.ocean.blood = 0.95;
    g.sky.blood = 0.95;
  });
  await h.sleep(800);

  // 两段位姿后冻结，读板件世界坐标
  const geo = await page.evaluate(() => {
    const g = window.__game;
    const gu = g.guest;
    const hi = g.world.dynamic.hotelInfo;
    gu.setEnabled(true);
    gu.hand.set(hi.origin.x - 5, hi.origin.y, hi.origin.z + 6);
    gu.handTarget.copy(gu.hand);
    g.player.setPosition(hi.origin.x + 3, hi.origin.z + 2, 0, hi.origin.y + 0.5);
    const ctx = { player: g.player, dt: 0.2, audio: null, vibration: 0, onCaught: () => {} };
    for (let i = 0; i < 10; i++) gu.update(ctx);
    gu.hand.set(-4, g.world.heightAt(-4, -50, hi.origin.y + 0.5), -50);
    gu.handTarget.copy(gu.hand);
    for (let i = 0; i < 10; i++) gu.update(ctx);
    g.game.state = 'PAUSE';
    const pan = (i) => {
      const p = gu.armPanels[i].position;
      return { x: p.x, y: p.y, z: p.z };
    };
    return { p0: pan(0), p2: pan(2), p3: pan(3), p4: pan(4), p7: pan(7), hb: hi.origin.y, hand: { x: gu.hand.x, y: gu.hand.y, z: gu.hand.z } };
  });
  console.log('[verify] guest geometry:', JSON.stringify(geo));

  // 44 臂弧全景：从「肩→手」连线的大堂南侧退开，整条臂弧侧影入镜
  {
    const mid = geo.p4;
    const dx = geo.p0.x - geo.hand.x, dz = geo.p0.z - geo.hand.z;
    const L = Math.hypot(dx, dz);
    const nx = -dz / L, nz = dx / L;
    const side = -1; // 大堂内侧（另一侧在酒店门外）
    const px = mid.x + nx * side * 7.5 - 2.6, pz = mid.z + nz * side * 7.5 + 0.8; // 西移避开镜柱
    await shootAt('44_guest_arm', { px, pz, tx: mid.x, tz: mid.z, ty: mid.y * 0.82, yHint: geo.hb + 0.5 });
  }

  await page.evaluate(() => {
    const g = window.__game;
    g.game.state = 'PLAY';
    g.guest.reset();
  });

  console.log('[verify] keepfix2 done');
}
