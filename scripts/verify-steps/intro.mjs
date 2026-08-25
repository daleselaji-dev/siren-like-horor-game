// 开场运镜专项：三拍取景验证（低机位仰拍大巴 / 牌坊剪影+雷 / 落回第一人称）
// 首次播放让着色器热身（SwiftShader 首帧秒级），随后重置重播，按墙钟取帧。
export async function run(page, h) {
  await page.click('#title-start');
  await h.sleep(15000); // 第一遍：热身跑完整个开场
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
  // 注：无头 SwiftShader 下每次截图约 1.2-1.5s 抓帧开销，sleep 已按墙钟扣除
  await h.sleep(1200);
  await h.shot('intro-a1-bus-low');      // ~1.2s 一拍：低机位仰拍大巴（未动）
  await h.sleep(900);
  await h.shot('intro-a2-bus-leaving');  // ~3.6s 一拍尾：大巴驶离
  await h.sleep(500);
  await h.shot('intro-b1-archway');      // ~5.6s 二拍：牌坊剪影+双闪
  await h.sleep(500);
  await h.shot('intro-b2-archway-flash');// ~7.6s 二拍尾
  await h.sleep(1400);
  await h.shot('intro-c1-firstperson');  // ~10.5s 三拍：落回眼睛
  await h.sleep(1600);
  await h.shot('intro-c2-play');         // ~13.6s 已入第一人称
  // 运镜结束后玩家应已解锁
  const frozen = await page.evaluate(() => window.__game.player.frozen);
  console.log('[verify] intro end frozen =', frozen, frozen ? '❌' : '✅');
}
