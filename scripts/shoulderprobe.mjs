// 一次性探针：face_a 肩区网格逐个换色——定位「肩球」读感的元凶网格
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = process.env.CHROME_PATH || '/usr/local/bin/google-chrome';
const PORT = 4198;
fs.mkdirSync('verify/probe', { recursive: true });

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
  const info = await page.evaluate(() => {
    const THREE = window.__THREE;
    const i = window.__names.indexOf('face_a');
    const scene = window.__scene;
    // face_a 的组：x = i*2.2
    let fig = null;
    scene.traverse((o) => { if (o.isGroup && Math.abs(o.position.x - i * 2.2) < 0.01 && o.parent === scene) fig = o; });
    const cols = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff, 0xff8000, 0x8000ff, 0x00ff80, 0xffffff];
    const out = [];
    let k = 0;
    const box = new THREE.Box3();
    fig.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.computeBoundingBox?.();
      box.setFromObject(o);
      const c = box.getCenter(new THREE.Vector3());
      const s = box.getSize(new THREE.Vector3());
      // 肩区窗口：世界 y 1.25-1.55，且不是头/颈（|x-figX|<0.35）
      if (c.y < 1.2 || c.y > 1.56) return;
      if (s.x > 0.6) return; // 全躯干大网格跳过
      const col = cols[k % cols.length];
      o.material = new THREE.MeshBasicMaterial({ color: col });
      out.push({ k, col: col.toString(16), cy: +c.y.toFixed(3), cx: +(c.x - fig.position.x).toFixed(3), sz: [s.x, s.y, s.z].map((v) => +v.toFixed(3)) });
      k++;
    });
    window.__face(i);
    return out;
  });
  console.log(JSON.stringify(info, null, 1));
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: 'verify/probe/shoulder_face.png' });
  await page.evaluate(() => window.__profile(window.__names.indexOf('face_a')));
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: 'verify/probe/shoulder_side.png' });
} finally {
  await Promise.race([browser?.close(), new Promise((r) => setTimeout(r, 5000))]);
  server.kill('SIGKILL');
  process.exit(0);
}
