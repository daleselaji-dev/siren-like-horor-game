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
  // —— 轮17 人体比例铁律断言（数值化）：头身 1/7.2-7.5、颈长(颏底→锁骨) 0.10-0.13m、
  //    成人男肩宽 0.40-0.46m。任一角色越界即非零退出 ——
  {
    const metrics = await page.evaluate(() => window.__metrics);
    const maleRoles = new Set(['emcee', 'waiter', 'booth', 'osteo', 'guest_m', 'townsman',
      'fisher', 'gaze', 'returnee', 'face_a', 'face_b', 'face_c']);
    let bad = 0;
    for (const m of metrics) {
      if (!m) continue;
      const male = maleRoles.has(m.name);
      const err = [];
      if (m.headRatio < 7.2 || m.headRatio > 7.5) err.push(`headRatio=${m.headRatio.toFixed(2)}∉[7.2,7.5]`);
      if (m.neckLen < 0.10 || m.neckLen > 0.13) err.push(`neckLen=${m.neckLen.toFixed(3)}∉[0.10,0.13]`);
      if (male && (m.shoulderW < 0.40 || m.shoulderW > 0.46)) err.push(`shoulderW=${m.shoulderW.toFixed(3)}∉[0.40,0.46]`);
      if (err.length) { console.log(`METRIC FAIL ${m.name}: ${err.join(' ')}`); bad++; }
      else console.log(`metric ok ${m.name}: h=${m.height.toFixed(2)} 头身=1/${m.headRatio.toFixed(2)} 颈=${(m.neckLen * 100).toFixed(1)}cm 肩=${(m.shoulderW * 100).toFixed(1)}cm`);
    }
    if (bad) { console.error(`比例铁律断言失败：${bad} 个角色越界`); process.exitCode = 1; }
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
