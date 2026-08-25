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
  for (let i = 0; i < names.length; i++) {
    await page.evaluate((i) => window.__lookAt(i), i);
    await new Promise((r) => setTimeout(r, 900));
    await page.screenshot({ path: `${OUT}/${names[i]}-body.png` });
    await page.evaluate((i) => window.__face(i), i);
    await new Promise((r) => setTimeout(r, 900)); // 等近距 LOD 高模换入 + 扫视/眨眼落到自然帧
    await page.screenshot({ path: `${OUT}/${names[i]}-face.png` });
    console.log('shot', names[i]);
  }
} finally {
  await Promise.race([browser?.close(), new Promise((r) => setTimeout(r, 5000))]);
  server.kill('SIGKILL');
  process.exit(0);
}
