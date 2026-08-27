// 角色查看器截屏：起 vite dev → 逐角色全身/脸部特写
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = process.env.CHROME_PATH || '/usr/local/bin/google-chrome';
const PORT = 4199;
const OUT = 'verify/chars';
fs.mkdirSync(OUT, { recursive: true });

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 3000));

let browser;
try {
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    defaultViewport: { width: 960, height: 1080 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('ERR:', m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/scripts/charview.html`, { waitUntil: 'networkidle0', timeout: 40000 });
  await page.waitForFunction(() => window.__ready, { timeout: 20000 });
  const names = await page.evaluate(() => window.__names);
  // —— 轮17 骨架公式断言（保底）：头身 1/7.2-7.5、成人男肩宽 0.40-0.46m ——
  {
    const metrics = await page.evaluate(() => window.__metrics);
    const maleRoles = new Set(['emcee', 'waiter', 'booth', 'osteo', 'guest_m', 'townsman',
      'fisher', 'gaze', 'returnee', 'face_a', 'face_b', 'face_c']);
    let bad = 0;
    for (const m of metrics) {
      if (!m) continue;
      const male = maleRoles.has(m.name);
      const err = [];
      if (m.headRatio < 7.15 || m.headRatio > 7.5) err.push(`headRatio=${m.headRatio.toFixed(2)}∉[7.15,7.5]`);
      if (male && (m.shoulderW < 0.40 || m.shoulderW > 0.46)) err.push(`shoulderW=${m.shoulderW.toFixed(3)}∉[0.40,0.46]`);
      if (err.length) { console.log(`METRIC FAIL ${m.name}: ${err.join(' ')}`); bad++; }
      else console.log(`metric ok ${m.name}: h=${m.height.toFixed(2)} 头身=1/${m.headRatio.toFixed(2)} 肩=${(m.shoulderW * 100).toFixed(1)}cm`);
    }
    if (bad) { console.error(`比例铁律断言失败：${bad} 个角色越界`); process.exitCode = 1; }
  }
  // —— 轮18 渲染后世界空间断言（父审否决项的数值化）：逐顶点过 matrixWorld 实测——
  //    ① 露颈段(颏底世界Y − 领口环世界顶Y) ≤ 4cm：颈不许再「长」
  //    ② 颈宽/头宽 ≥ 0.47：颈不许再「细」（大头细管的对比出局）
  //    ③ 头宽/头高 ≤ 0.80：脸不许再「宽」
  //    测的就是渲染那一帧的网格顶点，charshot 专用缩颈作弊在此没有生存空间 ——
  {
    await new Promise((r) => setTimeout(r, 600)); // 等姿态 lerp 收敛后再量
    const wm = await page.evaluate(() => window.__names.map((_, i) => window.__measure(i)));
    // 歪头/残影/弯腰工位不量露颈（颏点被姿态压斜），但颈头宽比/头宽比全员必须过
    const skipNeck = new Set(['osteo', 'gaze', 'returnee', 'matron', 'fisher', 'sit_baked']);
    // 连衣裙无领：量的是颏→领口缘（锁骨位），本来就该有 6-9cm——上限单列
    const dressNeck = new Set(['guest_f', 'face_d', 'face_e']);
    let bad = 0;
    for (const m of wm) {
      if (!m) continue;
      const err = [];
      if (!skipNeck.has(m.name)) {
        const lim = dressNeck.has(m.name) ? 0.10 : 0.04;
        if (m.exposedNeck > lim) err.push(`exposedNeck=${(m.exposedNeck * 1000).toFixed(0)}mm>${lim * 1000}mm`);
        // 轮22：颈长逐种子解算后目标=「领口顶住下颌」（颏底压领口环顶下 ~3mm），
        // 姿态微倾的残差 ±7mm——下限放到 −14mm（再往下才是「颏吞进领筒」）
        if (m.exposedNeck < -0.014) err.push(`exposedNeck=${(m.exposedNeck * 1000).toFixed(0)}mm<-14mm(颏埋进领)`);
        if (m.neckHeadRatio < 0.47) err.push(`neck/head=${m.neckHeadRatio.toFixed(2)}<0.47`);
      }
      if (m.headWH > 0.80) err.push(`headW/H=${m.headWH.toFixed(2)}>0.80`);
      if (err.length) { console.log(`WORLD FAIL ${m.name}: ${err.join(' ')}`); bad++; }
      else console.log(`world ok ${m.name}: 露颈=${(m.exposedNeck * 1000).toFixed(0)}mm 颈/头宽=${m.neckHeadRatio.toFixed(2)} 头宽/高=${m.headWH.toFixed(2)}`);
    }
    if (bad) { console.error(`世界空间比例断言失败：${bad} 个角色越界`); process.exitCode = 1; }
  }
  for (let i = 0; i < names.length; i++) {
    await page.evaluate((i) => window.__lookAt(i), i);
    await new Promise((r) => setTimeout(r, 900));
    await page.screenshot({ path: `${OUT}/${names[i]}-body.png` });
    await page.evaluate((i) => window.__face(i), i);
    await new Promise((r) => setTimeout(r, 900)); // 等近距 LOD 高模换入 + 扫视/眨眼落到自然帧
    await page.screenshot({ path: `${OUT}/${names[i]}-face.png` });
    await page.evaluate((i) => window.__profile(i), i);
    await new Promise((r) => setTimeout(r, 500));
    await page.screenshot({ path: `${OUT}/${names[i]}-side.png` });
    console.log('shot', names[i]);
  }
} finally {
  await Promise.race([browser?.close(), new Promise((r) => setTimeout(r, 5000))]);
  server.kill('SIGKILL');
  process.exit(0);
}
