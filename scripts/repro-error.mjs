// 一次性错误定位：非压缩构建 + 打印完整堆栈
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

await new Promise((res, rej) => {
  const b = spawn('npx', ['vite', 'build', '--minify', 'false'], { stdio: 'inherit' });
  b.on('exit', (c) => (c === 0 ? res() : rej(new Error('build failed'))));
});
const server = spawn('npx', ['vite', 'preview', '--port', '4173'], { stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));

const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
const seen = new Set();
page.on('pageerror', (err) => {
  const key = err.message;
  if (seen.has(key)) return;
  seen.add(key);
  console.log('=== PAGEERROR ===');
  console.log(err.stack?.split('\n').slice(0, 8).join('\n'));
});
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle0', timeout: 60000 });
await page.waitForFunction(() => window.__game !== undefined, { timeout: 30000 });
await page.click('#title-start');
await new Promise((r) => setTimeout(r, 6000));
console.log('done. unique errors:', seen.size);
await browser.close();
server.kill();
process.exit(0);
