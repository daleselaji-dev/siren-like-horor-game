// 临时迭代：驾驶舱机位候选批拍（lowspec 快速跑，不等脸烘焙）
import fs from 'node:fs';

export async function run(page, h) {
  fs.mkdirSync('verify/buscam', { recursive: true });
  await page.click('#title-start');
  await h.sleep(1200);
  await h.tapKey('Space');
  await h.sleep(400);

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
  await page.evaluate((t) => new Promise((res) => {
    const g = window.__game;
    g.game.state = 'PAUSE';
    g.story.introSeq.t0 = performance.now() - t;
    g.story.updateIntro(0);
    requestAnimationFrame(() => requestAnimationFrame(res));
  }), 620);

  const cams = [
    ['v1_side_up', [2.85, 1.78, -0.45], [3.38, 1.35, 0.5]],
    ['v2_side', [2.95, 1.66, -0.35], [3.35, 1.4, 0.55]],
    ['v3_wide', [2.7, 1.8, -0.55], [3.45, 1.32, 0.45]],
    ['v4_shoulder', [2.55, 1.76, -0.12], [3.4, 1.33, 0.55]],
  ];
  for (const [name, eye, tgt] of cams) {
    await page.evaluate(({ eye, tgt }) => new Promise((res) => {
      const g = window.__game;
      const bus = g.world.dynamic.bus;
      const V = bus.position.constructor;
      const cam = g.engine.camera;
      cam.position.copy(bus.localToWorld(new V(...eye)));
      cam.lookAt(bus.localToWorld(new V(...tgt)));
      g.hud.clearSubtitles();
      requestAnimationFrame(() => requestAnimationFrame(res));
    }), { eye, tgt });
    await h.shot(`buscam/${name}`);
  }
  await page.evaluate(() => {
    const g = window.__game;
    g.game.state = 'PLAY';
    g.story.endIntro();
  });
  console.log('[verify] buscam candidates done');
}
