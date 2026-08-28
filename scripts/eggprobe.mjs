// 临时探针：司仪脸部近景机位下，对领口上的「蛋形凸粒」做射线命中，找出元凶网格
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || '/usr/local/bin/google-chrome';
const PORT = 4199;

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
  await page.goto(`http://127.0.0.1:${PORT}/scripts/charview.html`, { waitUntil: 'networkidle0', timeout: 40000 });
  await page.waitForFunction(() => window.__ready, { timeout: 20000 });
  const out = await page.evaluate(async () => {
    const names = window.__names;
    const i = names.indexOf('emcee');
    window.__face(i);
    await new Promise((r) => setTimeout(r, 900));
    const THREE = window.__THREE;
    const cam = window.__camera;
    const scene = window.__scene;
    const hits = [];
    const ray = new THREE.Raycaster();
    // 蛋形粒在脸部近景帧的屏幕位置附近扫一小格
    for (let dx = -0.06; dx <= 0.06; dx += 0.03) {
      for (let dy = -0.26; dy <= -0.1; dy += 0.04) {
        ray.setFromCamera(new THREE.Vector2(dx, dy), cam);
        const hs = ray.intersectObjects(scene.children, true);
        if (hs.length) {
          const o = hs[0].object;
          hits.push({
            ndc: [dx, +dy.toFixed(2)],
            name: o.name || '(anon)',
            geo: o.geometry?.parameters?.type || o.geometry?.type,
            verts: o.geometry?.attributes?.position?.count,
            scale: o.scale.toArray().map((v) => +v.toFixed(3)),
            wp: o.getWorldPosition(new THREE.Vector3()).toArray().map((v) => +v.toFixed(3)),
            dist: +hs[0].distance.toFixed(3),
            pt: hs[0].point.toArray().map((v) => +v.toFixed(3)),
          });
        }
      }
    }
    return hits;
  });
  for (const h of out) console.log(JSON.stringify(h));
} finally {
  await Promise.race([browser?.close(), new Promise((r) => setTimeout(r, 5000))]);
  server.kill('SIGKILL');
  process.exit(0);
}
