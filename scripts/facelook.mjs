// 轮23 调参快环：只拍 emcee/waiter/face_a 的脸特写+侧脸——秒级迭代睑裂/嘴/发
// 用法: node scripts/facelook.mjs [输出目录=/tmp/facelook]
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = process.env.CHROME_PATH || '/usr/local/bin/google-chrome';
const PORT = 4198;
const OUT = process.argv[2] || '/tmp/facelook';
fs.mkdirSync(OUT, { recursive: true });

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 3000));

let browser;
try {
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    defaultViewport: { width: 860, height: 960 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('ERR:', m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/scripts/charview.html`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => window.__ready, { timeout: 30000 });
  const names = await page.evaluate(() => window.__names);
  for (const want of ['emcee', 'waiter', 'face_a']) {
    const i = names.indexOf(want);
    if (i < 0) continue;
    await page.evaluate((i) => window.__face(i), i);
    await new Promise((r) => setTimeout(r, 900));
    await page.screenshot({ path: `${OUT}/${want}-face.png` });
    await page.evaluate((i) => window.__profile(i), i);
    await new Promise((r) => setTimeout(r, 400));
    await page.screenshot({ path: `${OUT}/${want}-side.png` });
    await page.evaluate((i) => window.__lookAt(i), i);
    await new Promise((r) => setTimeout(r, 400));
    await page.screenshot({ path: `${OUT}/${want}-body.png` });
    // 超近口鼻带（诊断嘴周纹理）：从脸机位沿视线推进到 ~0.31m、压低到口鼻
    await page.evaluate((i) => {
      window.__face(i);
      const THREE = window.__THREE;
      const cam = window.__camera;
      cam.fov = 26; cam.updateProjectionMatrix();
      const dir = new THREE.Vector3();
      cam.getWorldDirection(dir);
      cam.position.addScaledVector(dir, 0.42);
      cam.position.y -= 0.05;
    }, i);
    await new Promise((r) => setTimeout(r, 400));
    await page.screenshot({ path: `${OUT}/${want}-mouth.png` });
    console.log('shot', want);
  }
} finally {
  await Promise.race([browser?.close(), new Promise((r) => setTimeout(r, 5000))]);
  server.kill('SIGKILL');
  process.exit(0);
}
