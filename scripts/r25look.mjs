// 轮25 调参快环：按游戏内真实 seed 拍 keeper/matron/emcee/waiter/runner
// 的正脸+侧脸特写——秒级迭代发型/眼睛/肤色/领口（灯位与 charview 一致）
// 用法: node scripts/r25look.mjs [输出目录=/tmp/r25look] [只拍哪个角色]
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = process.env.CHROME_PATH || '/usr/local/bin/google-chrome';
const PORT = 4198;
const OUT = process.argv[2] || '/tmp/r25look';
const ONLY = process.argv[3] || null;
fs.mkdirSync(OUT, { recursive: true });

// 游戏内 id 哈希种子（enemy.js 同式）——快环里的脸=取证里的脸
const SEEDS = {
  keeper: { role: 'fisher', seed: 782305721 },
  matron: { role: 'matron', seed: 836319032 },
  emcee: { role: 'emcee', seed: 297025268 },
  waiter: { role: 'waiter', seed: 3385270905 },
  runner: { role: 'townsman', seed: 1081277082 },
};

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
  await page.waitForFunction(() => window.__ready, { timeout: 60000 });
  for (const [name, opts] of Object.entries(SEEDS)) {
    if (ONLY && name !== ONLY) continue;
    const i = await page.evaluate((n, o) => window.__mk(n, o, 'idle'), name, opts);
    await page.evaluate((i2) => window.__face(i2), i);
    await new Promise((r) => setTimeout(r, 1200));
    await page.screenshot({ path: `${OUT}/${name}-face.png` });
    await page.evaluate((i2) => window.__profile(i2), i);
    await new Promise((r) => setTimeout(r, 500));
    await page.screenshot({ path: `${OUT}/${name}-side.png` });
    console.log('shot', name);
  }
} finally {
  await Promise.race([browser?.close(), new Promise((r) => setTimeout(r, 5000))]);
  server.kill('SIGKILL');
  process.exit(0);
}
