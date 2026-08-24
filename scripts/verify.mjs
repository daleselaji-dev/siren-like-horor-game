// 无头实机验证：起 vite 预览服务 → Chrome(SwiftShader WebGL) → 注入输入 → 截图/断言
// 用法: node scripts/verify.mjs [脚本名]   （脚本定义在 scripts/verify-steps/ 下）
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = process.env.CHROME_PATH || '/usr/local/bin/google-chrome';
const PORT = 4173;
const OUT = 'verify';

fs.mkdirSync(OUT, { recursive: true });

// 1. 构建 + 预览服务
console.log('[verify] building...');
await new Promise((res, rej) => {
  const b = spawn('npx', ['vite', 'build'], { stdio: 'inherit' });
  b.on('exit', (c) => (c === 0 ? res() : rej(new Error('build failed'))));
});

console.log('[verify] starting preview server...');
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT)], { stdio: 'pipe' });
await new Promise((res) => setTimeout(res, 2500));

let browser;
const consoleErrors = [];
try {
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--window-size=1280,720',
      '--autoplay-policy=no-user-gesture-required',
    ],
    defaultViewport: { width: 1280, height: 720 },
  });
  const page = await browser.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push('PAGEERROR: ' + err.message));

  console.log('[verify] loading page...');
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => window.__game !== undefined, { timeout: 30000 });

  const stepFile = process.argv[2] || 'smoke';
  const mod = await import(path.resolve(`scripts/verify-steps/${stepFile}.mjs`));
  await mod.run(page, {
    out: OUT,
    shot: async (name) => {
      await page.screenshot({ path: `${OUT}/${name}.png` });
      console.log(`[verify] shot: ${OUT}/${name}.png`);
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    // 模拟按住某键 ms 毫秒（游戏用 keydown/keyup + code）
    holdKey: async (code, ms) => {
      await page.evaluate((c) => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: c, bubbles: true }));
      }, code);
      await new Promise((r) => setTimeout(r, ms));
      await page.evaluate((c) => {
        window.dispatchEvent(new KeyboardEvent('keyup', { code: c, bubbles: true }));
      }, code);
    },
    tapKey: async (code) => {
      await page.evaluate((c) => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: c, bubbles: true }));
        setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: c, bubbles: true })), 60);
      }, code);
      await new Promise((r) => setTimeout(r, 120));
    },
  });

  if (consoleErrors.length) {
    console.log('\n[verify] ❌ console errors:');
    for (const e of consoleErrors.slice(0, 20)) console.log('   ', e);
  } else {
    console.log('\n[verify] ✅ no console errors');
  }
} finally {
  await browser?.close();
  server.kill();
}
process.exit(consoleErrors.length ? 1 : 0);
