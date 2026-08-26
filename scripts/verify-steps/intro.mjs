// 开场运镜专项：四拍取景验证（车内雨刮 / 低机位仰拍大巴 / 牌坊剪影+雷 / 落回第一人称）
// 首次播放让着色器热身（SwiftShader 首帧秒级），随后重置重播，按墙钟取帧。
export async function run(page, h) {
  await page.click('#title-start');
  await h.sleep(17000); // 第一遍：热身跑完整个开场（轮15 起 14s）
  // 重播：恢复大巴与旗标，重新起拍
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
  // 零拍只有 2s：SwiftShader 帧距+截图延迟按墙钟必踩空——定帧拍（PAUSE 掉 story
  // 驱动、手动把开场时钟拨到 0.62s 雨刮中幅重算），拍完放回真实时钟接一拍
  await page.evaluate(() => new Promise((res) => {
    const g = window.__game;
    g.game.state = 'PAUSE';
    const s = g.story.introSeq;
    s.t0 = performance.now() - 620;
    g.story.updateIntro(0);
    requestAnimationFrame(() => requestAnimationFrame(res));
  }));
  await h.shot('intro-a0-bus-interior'); // 0.62s 零拍：车内视角，雨刮扫到中幅
  await page.evaluate(() => {
    const g = window.__game;
    g.game.state = 'PLAY';
    g.story.introSeq.t0 = performance.now() - 2100; // 从一拍起点接回真实时钟
  });
  await h.sleep(1000);
  await h.shot('intro-a1-bus-low');      // ~3.2s 一拍：低机位仰拍大巴（刚起步）
  await h.sleep(1000);
  await h.shot('intro-a2-bus-leaving');  // ~5.5s 一拍尾：大巴驶离
  await h.sleep(700);
  await h.shot('intro-b1-archway');      // ~7.5s 二拍：牌坊剪影+双闪
  await h.sleep(500);
  await h.shot('intro-b2-archway-flash');// ~9.3s 二拍尾
  await h.sleep(1400);
  await h.shot('intro-c1-firstperson');  // ~12s 三拍：落回眼睛
  await h.sleep(1900);
  await h.shot('intro-c2-play');         // ~15.5s 已入第一人称
  // 运镜结束后玩家应已解锁
  const frozen = await page.evaluate(() => window.__game.player.frozen);
  console.log('[verify] intro end frozen =', frozen, frozen ? '❌' : '✅');
}
