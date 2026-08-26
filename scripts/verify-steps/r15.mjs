// 轮15 取证：①下颌-颈接缝根治（颌裙环随头转+同色烘焙，消暗脊）
// ②照片高频色斑纹理合成铺满羽化带外整头皮（面具统计差根治）
import fs from 'node:fs';

export async function run(page, h) {
  fs.mkdirSync('verify/r15', { recursive: true });
  await page.click('#title-start');
  await h.sleep(1500);
  await h.tapKey('Space');
  await h.sleep(400);

  // 照片脸烘焙完成后再取证（异步 bake）
  await page.waitForFunction(() => window.__facesReady === true, { timeout: 60000, polling: 400 });

  const look = async (name, px, pz, tx, tz, yHint, pitch = 0) => {
    await page.evaluate(({ px, pz, tx, tz, yHint, pitch }) => {
      const g = window.__game;
      const yaw = Math.atan2(-(tx - px), -(tz - pz));
      g.player.setPosition(px, pz, yaw, yHint);
      g.player.pitch = pitch;
      g.player.syncCamera(0);
      g.hud.clearSubtitles();
    }, { px, pz, tx, tz, yHint, pitch });
    await h.sleep(700);
    await h.shot(name);
  };
  const assert = (ok, msg) => { if (!ok) throw new Error('ASSERT: ' + msg); };

  // ---- 断言：颌裙环挂在头组上（随头转）、颈裙暗带减淡 ----
  const ringInfo = await page.evaluate(() => {
    const g = window.__game;
    let rings = 0, onHead = 0, checked = 0;
    for (const e of g.enemies) {
      const hum = e.body ?? e.humanoid ?? e;
      const head = hum.head ?? e.head;
      if (!head) continue;
      checked++;
      head.traverse((o) => {
        if (o.name === 'jawRing') {
          rings++;
          if (o.parent === head) onHead++;
        }
      });
    }
    return { rings, onHead, checked };
  });
  console.log('[verify] jawRing:', JSON.stringify(ringInfo));
  assert(ringInfo.rings > 0, 'no jawRing found on any humanoid head');
  assert(ringInfo.onHead === ringInfo.rings, 'jawRing not parented to head group');

  // ---- 断言：色斑合成已铺满底皮区（头皮画布照片区外的色度方差非零） ----
  const mottle = await page.evaluate(() => {
    const M = window.__game.M;
    const key = Object.keys(M.faceMats)[0];
    const cv = M.faceMats[key].map.image;
    const x = cv.getContext('2d', { willReadFrequently: true });
    // 后脑正中一条带（u≈0 → 画布左缘；照片权重恒 0 的纯底皮区）
    const S = cv.width;
    const id = x.getImageData(Math.round(S * 0.04), Math.round(S * 0.42), 64, 64).data;
    let mr = 0, mb = 0, n = 0;
    for (let i = 0; i < id.length; i += 4) { mr += id[i]; mb += id[i + 2]; n++; }
    mr /= n; mb /= n;
    let vr = 0, vrb = 0;
    for (let i = 0; i < id.length; i += 4) {
      vr += (id[i] - mr) ** 2;
      vrb += ((id[i] - id[i + 2]) - (mr - mb)) ** 2; // 红-蓝通道差的方差 = 色斑（非纯亮度噪声）
    }
    return { canvas: S, lumVar: Math.sqrt(vr / n).toFixed(1), chromaVar: Math.sqrt(vrb / n).toFixed(1) };
  });
  console.log('[verify] scalp mottle:', JSON.stringify(mottle));
  assert(parseFloat(mottle.chromaVar) > 1.5, 'no chroma mottle outside photo band: ' + mottle.chromaVar);

  // ---- 近景取证：摆位→几帧结算姿态→冻结世界（game.state=PAUSE）→零危险→拍 ----
  // 挪到大堂灯下拍（街上太黑评不了缝）；HD LOD 2m 内自动换高模
  // 摆位 + 致盲致聋（近拍不触发警觉/引座），世界保持 PLAY——灯光预算跟着相机走
  const stage = (id, x, z, yHint, faceTx, faceTz) => page.evaluate(({ id, x, z, yHint, faceTx, faceTz }) => {
    const g = window.__game;
    const e = g.byId[id];
    e.setEnabled(true);
    e._r15 = e._r15 ?? { sight: e.sightRange, hear: e.hearRange };
    e.sightRange = 0; e.hearRange = 0;
    e.pos.set(x, g.world.heightAt(x, z, yHint), z);
    e.yaw = Math.atan2(faceTx - x, faceTz - z);
    e.state = 'PAUSE'; e.stateTimer = -9;
    g.stealth.danger = 0;
  }, { id, x, z, yHint, faceTx, faceTz });
  const unstage = (id, off) => page.evaluate(({ id, off }) => {
    const e = window.__game.byId[id];
    if (e._r15) { e.sightRange = e._r15.sight; e.hearRange = e._r15.hear; }
    e.stateTimer = 0;
    if (off) e.setEnabled(false);
  }, { id, off });

  await stage('streetRunner', -2, -47.5, 3.5, -2, -46);
  await h.sleep(400);
  await look('r15/01_runner_jawneck', -2, -46.75, -2, -47.5, 3.5, 0.06);
  await look('r15/02_runner_jaw_low', -2.05, -46.85, -2, -47.5, 3.5, 0.28);
  await look('r15/03_runner_side', -2.7, -46.95, -2, -47.5, 3.5, 0.05);
  await page.evaluate(() => { const e = window.__game.byId.streetRunner; e.pos.set(6, e.pos.y, -14); });
  await unstage('streetRunner', false);

  // ---- 理册婆（oldf 照片脸）：3F 走廊 0.7m 近景，颌缘+太阳穴色斑带 ----
  await stage('matron', -8, -55.5, 10.3, -6, -55.5);
  await h.sleep(400);
  await look('r15/04_matron_jaw', -7.3, -55.5, -8, -55.5, 10.3, 0.08);
  await look('r15/05_matron_temple', -7.45, -55.02, -8, -55.5, 10.3, 0.02);
  await unstage('matron', true);

  // ---- 报数员（pale 照片脸）：舞台近景——羽化带外额顶/颊侧色斑 ----
  await look('r15/06_emcee_close', -15.9, -64.1, -16.5, -64.6, 3.5, 0.02);

  console.log('[verify] r15 face evidence done');
}
