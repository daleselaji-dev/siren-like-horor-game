// 量测 FULLSPEC 启动耗时（贴图程序化生成在主线程，直接反映 exe 首屏时间）
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || '/usr/local/bin/google-chrome';
const PORT = 4177;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT)], { stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
let browser;
try {
  browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    defaultViewport: { width: 640, height: 360 },
  });
  const page = await browser.newPage();
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${PORT}/${process.env.LOWSPEC ? '?lowspec=1' : ''}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game !== undefined, { timeout: 300000, polling: 500 });
  console.log('boot ms:', Date.now() - t0);
} finally {
  await browser?.close();
  server.kill();
}
process.exit(0);
