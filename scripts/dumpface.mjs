// 调参诊断：导出某个 photo 脸烘焙后的漫反射画布（嘴周伪影排查用）
// 用法: node scripts/dumpface.mjs [key=pale] [输出=/tmp/faceDump.png]
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = process.env.CHROME_PATH || '/usr/local/bin/google-chrome';
const PORT = 4199;
const KEY = process.argv[2] || 'pale';
const OUT = process.argv[3] || '/tmp/faceDump.png';

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 3000));

let browser;
try {
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    defaultViewport: { width: 400, height: 300 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  await page.goto(`http://127.0.0.1:${PORT}/scripts/charview.html`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => window.__ready, { timeout: 60000 });
  const dataUrl = await page.evaluate((k) => {
    const m = window.__M.faceMats[k];
    return m.map.image.toDataURL('image/png');
  }, KEY);
  fs.writeFileSync(OUT, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('dumped', KEY, '->', OUT);
} finally {
  await Promise.race([browser?.close(), new Promise((r) => setTimeout(r, 5000))]);
  server.kill('SIGKILL');
  process.exit(0);
}
