// 蚀湾大地图：地形 + 六区（滩涂搁浅点/石堤渔寮/镇中心市场/旧海祀/灯塔沉船湾/南方大酒店）
// 2001 年秋，沿海县镇。填湾造地上建了南方大酒店与蚀湾海洋馆。今晚全镇核册还地。
// 输出：场景网格、碰撞体、heightAt、互动点位 locations、巡逻路点 patrols、动态对象 dynamic
import * as THREE from 'three';
import { Batcher, GEO } from './batcher.js';
import { mulberry32 } from './textures.js';
import { makeLightCone } from './materials.js';
import { buildHotel, plateMat } from './hotel.js';

// ---------------- 地形 ----------------

function makeNoise(seed, grid) {
  const rand = mulberry32(seed);
  const g = new Float32Array(grid * grid);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    x = ((x % 1) + 1) % 1 * grid; y = ((y % 1) + 1) % 1 * grid;
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = sm(x - xi), yf = sm(y - yi);
    const x0 = xi % grid, x1 = (xi + 1) % grid, y0 = yi % grid, y1 = (yi + 1) % grid;
    const a = g[y0 * grid + x0], b = g[y0 * grid + x1], c = g[y1 * grid + x0], d = g[y1 * grid + x1];
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}
const noiseA = makeNoise(1234, 16);
const noiseB = makeNoise(5678, 32);

function smoothstep(a, b, t) {
  t = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function discFall(x, z, cx, cz, r, fall) {
  const d = Math.hypot(x - cx, z - cz);
  return 1 - smoothstep(r, r + fall, d);
}
function capsuleFall(x, z, ax, az, bx, bz, r, fall) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = ((x - ax) * dx + (z - az) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
  return 1 - smoothstep(r, r + fall, d);
}

// 高度补丁（栈桥/沉船龙骨/平台等可行走覆盖面）
const patches = [];
function addPatch(cx, cz, angle, len, wid, h0, h1) {
  patches.push({ cx, cz, cos: Math.cos(angle), sin: Math.sin(angle), len, wid, h0, h1 });
}
function patchHeights(x, z, out) {
  out.length = 0;
  for (const p of patches) {
    const lx = (x - p.cx) * p.cos + (z - p.cz) * p.sin;   // 沿长度
    const lz = -(x - p.cx) * p.sin + (z - p.cz) * p.cos;  // 沿宽度
    if (Math.abs(lx) <= p.len / 2 && Math.abs(lz) <= p.wid / 2) {
      const t = (lx + p.len / 2) / p.len;
      out.push(p.h0 + (p.h1 - p.h0) * t);
    }
  }
  return out;
}
const _ph = [];

function terrainHeight(x, z) {
  let h = 0;
  // 岛屿基座
  h += 2.3 * discFall(x, z, -10, -10, 100, 55);
  h += 2.3 * discFall(x, z, 62, -100, 42, 38);
  h = Math.max(h, 2.2 * capsuleFall(x, z, 20, -40, 62, -95, 15, 22));
  // 滩涂（低平台，返潮线以下）
  h = Math.max(h, 0.95 * discFall(x, z, 80, 112, 30, 22));
  // 滩涂→石堤 的走廊
  h = Math.max(h, 1.5 * capsuleFall(x, z, 70, 100, 54, 80, 8, 12));
  // 晒盐场压低
  h -= 1.15 * discFall(x, z, -42, 6, 18, 10);
  // 沉船湾谷地
  h -= 1.35 * capsuleFall(x, z, 28, -60, 46, -84, 10, 10);
  // 潮母宫台地
  h += 2.6 * discFall(x, z, -64, -74, 15, 16);
  // 灯塔小丘
  h += 3.1 * discFall(x, z, 76, -120, 11, 15);
  // 石堤（沿 z≈70 的高脊，可行走）
  h = Math.max(h, 3.35 * capsuleFall(x, z, -24, 68, 58, 73, 2.6, 4.5));
  // 自然噪声
  h += (noiseA(x * 0.006 + 0.31, z * 0.006 + 0.7) - 0.5) * 0.9;
  h += (noiseB(x * 0.02 + 0.11, z * 0.02 + 0.23) - 0.5) * 0.3;
  // 填湾平台（1998 年推平的古海床——南方大酒店与海洋馆地块）
  h = Math.max(h, 2.6 * capsuleFall(x, z, -14, -56, 26, -53, 16, 9));
  // 公路路基：把主干道走廊的噪声压平（否则路面板浮在起伏地形上）
  h = roadBedBlend(x, z, h);
  // 岛外海床下沉
  h = Math.max(h, -2.5);
  return h;
}

// —— 公路路基 —— 沿走廊把地形压向路面标高（[ax,az,bx,bz,标高a,标高b]，沿线段线性插值）
const ROAD_BEDS = [
  [74, 2, 46, 0, 2.32, 2.32],       // 镇外来路
  [50, 3, 63, 4.2, 2.32, 2.32],     // 车站广场（加宽）
  [46, 0, 30, -2, 2.32, 2.32],      // 前街东段
  [30, -2, 18, -6, 2.32, 2.32],     // 前街西段
  [18, -6, 11, -8, 2.32, 2.32],     // 街心
  [12, -8, 24, -20, 2.32, 2.36],    // 岔路→海洋馆 ①
  [24, -20, 36, -32, 2.36, 2.4],    // 岔路→海洋馆 ②
  [36, -32, 43, -41, 2.4, 2.4],     // 岔路→海洋馆 ③（正门台阶自适应衔接）
];
function roadBedBlend(x, z, h) {
  for (let i = 0; i < ROAD_BEDS.length; i++) {
    const R = ROAD_BEDS[i];
    const dx = R[2] - R[0], dz = R[3] - R[1];
    let t = ((x - R[0]) * dx + (z - R[1]) * dz) / (dx * dx + dz * dz);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(x - (R[0] + dx * t), z - (R[1] + dz * t));
    const half = i === 1 ? 6.0 : 3.0;
    if (d >= half + 3.5) continue;
    let w = d <= half ? 1 : 1 - (d - half) / 3.5;
    w = w * w * (3 - 2 * w);
    h += (R[4] + (R[5] - R[4]) * t - h) * w;
  }
  return h;
}

/**
 * 多层高度解析：
 * - 不带 refY：返回最高面（用于初始摆放）
 * - 带 refY：在“可站立面”里选身位最合理的一层——
 *   可爬升面(≤refY+1.0)取最高；若无（悬空于所有面之下不可能），取最低面
 */
export function heightAt(x, z, refY) {
  const t = terrainHeight(x, z);
  patchHeights(x, z, _ph);
  if (_ph.length === 0) return t;
  if (refY === undefined) {
    let m = t;
    for (const h of _ph) if (h > m) m = h;
    return m;
  }
  let best = -Infinity;
  let lowest = t;
  if (t <= refY + 1.0 && t > best) best = t;
  for (const h of _ph) {
    if (h < lowest) lowest = h;
    if (h <= refY + 1.0 && h > best) best = h;
  }
  return best === -Infinity ? lowest : best;
}

// ---------------- 世界构建 ----------------

export function buildTown(scene, M) {
  const B = new Batcher();
  const colliders = [];
  const bounds = { minX: -145, maxX: 145, minZ: -165, maxZ: 138 };
  const locations = {};
  const patrols = {};
  const dynamic = {};
  const lights = [];
  const rand = mulberry32(20260824);

  const aabb = (cx, cz, w, d, maxY, opts = {}) => {
    colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, maxY, ...opts });
  };
  const circle = (x, z, r, maxY, opts = {}) => {
    colliders.push({ x, z, r, maxY, ...opts });
  };
  const g = (x, z) => heightAt(x, z); // 地面高

  // —— 香烟烟柱（上升+摆散的 Points；set(false) 熄灭） ——
  // 软圆点贴图：径向渐变，避免 Points 默认的硬边方块
  const smokeTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const cx = c.getContext('2d');
    const grad = cx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,255,0.85)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.3)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = grad; cx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const smokes = [];
  function makeSmoke(x, y, z, { count = 22, rise = 2.4, spread = 0.14, size = 0.2, opacity = 0.3, on = true } = {}) {
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) seed[i] = Math.random();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xaab4b6, size, map: smokeTex, transparent: true, opacity,
      depthWrite: false, sizeAttenuation: true,
    }));
    pts.position.set(x, y, z);
    pts.visible = on;
    scene.add(pts);
    const sm = {
      on,
      set(v) { this.on = v; pts.visible = v; },
      update(time) {
        if (!this.on) return;
        const a = geo.attributes.position;
        for (let i = 0; i < count; i++) {
          // 各粒子按自身相位循环一段"升起—飘散"的生命周期
          const t = (time * (0.09 + seed[i] * 0.06) + seed[i]) % 1;
          const sway = spread * (0.3 + t * 2.6);
          a.setXYZ(i,
            Math.sin(time * 0.7 + seed[i] * 31.4) * sway,
            t * rise,
            Math.cos(time * 0.55 + seed[i] * 17.7) * sway);
        }
        a.needsUpdate = true;
      },
    };
    smokes.push(sm);
    return sm;
  }

  // ---- 地形网格 ----
  {
    const W = 300, D = 320, SX = 170, SZ = 180;
    const geo = new THREE.PlaneGeometry(W, D, SX, SZ);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = terrainHeight(x, z);
      pos.setY(i, h);
      // 顶点色：低处湿沙深 → 中部灰绿 → 高处灰岩
      let r, gg, b;
      if (h < 1.1) { const t = smoothstep(-0.5, 1.1, h); r = 0.52 + t * 0.22; gg = 0.5 + t * 0.2; b = 0.42 + t * 0.16; }
      else if (h < 2.8) { const t = smoothstep(1.1, 2.8, h); r = 0.74 - t * 0.1; gg = 0.7 - t * 0.02; b = 0.58 + t * 0.02; }
      else { const t = smoothstep(2.8, 5.5, h); r = 0.64 - t * 0.05; gg = 0.68 - t * 0.03; b = 0.6 + t * 0.0; }
      const n = noiseB(x * 0.03, z * 0.03) * 0.18;
      colors[i * 3] = r - n; colors[i * 3 + 1] = gg - n; colors[i * 3 + 2] = b - n;
    }
    geo.computeVertexNormals();
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = M.sand.clone();
    mat.vertexColors = true;
    mat.map.repeat.set(48, 48);
    mat.normalMap.repeat.set(48, 48);
    const terrain = new THREE.Mesh(geo, mat);
    terrain.receiveShadow = true;
    scene.add(terrain);
  }

  // ---- 石板路（步石） ----
  const laySlabPath = (pts, width = 1.6) => {
    for (let s = 0; s < pts.length - 1; s++) {
      const [ax, az] = pts[s], [bx, bz] = pts[s + 1];
      const dist = Math.hypot(bx - ax, bz - az);
      const n = Math.floor(dist / 1.35);
      for (let i = 0; i <= n; i++) {
        const t = i / Math.max(1, n);
        const x = ax + (bx - ax) * t + (rand() - 0.5) * 0.4;
        const z = az + (bz - az) * t + (rand() - 0.5) * 0.4;
        B.add(GEO.box, M.slab, x, g(x, z) - 0.005, z, rand() * Math.PI, 0.62 * width, 0.06, 0.5 * width);
      }
    }
  };

  // ================= 建筑套件 =================

  // 朝向变换：dir 0:+z 1:+x 2:-z 3:-x
  const dirRy = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
  const rotXZ = (lx, lz, dir) => {
    switch (dir) {
      case 0: return [lx, lz];
      case 1: return [lz, -lx];
      case 2: return [-lx, -lz];
      default: return [-lz, lx];
    }
  };

  /**
   * 通用民居/渔寮
   * w×d 外形；door 在 +lz 面中央；material: 'stone' | 'plaster'
   */
  function house(x, z, dir, w, d, opts = {}) {
    const h = opts.wallH ?? 2.3;
    const base = g(x, z) + (opts.raise ?? 0);
    const wallM = opts.plaster ? M.plaster : M.stone;
    const ry = dirRy[dir];
    const t = 0.34; // 墙厚
    const doorW = 1.15, doorH = 2.0;

    const piece = (geo, mat, lx, ly, lz, sx, sy, sz, extraRy = 0, rx = 0, rz = 0) => {
      const [wx, wz] = rotXZ(lx, lz, dir);
      B.add(geo, mat, x + wx, base + ly, z + wz, ry + extraRy, sx, sy, sz, rx, rz);
    };
    const pieceCollider = (lx, lz, sw, sd, maxY) => {
      const [wx, wz] = rotXZ(lx, lz, dir);
      const [rw, rd] = (dir % 2 === 0) ? [sw, sd] : [sd, sw];
      aabb(x + wx, z + wz, rw, rd, base + maxY);
    };

    // 台基
    piece(GEO.box, M.stone, 0, 0.12, 0, w + 0.7, 0.55, d + 0.7);
    // 地板
    piece(GEO.box, M.wood, 0, 0.42, 0, w - 0.3, 0.1, d - 0.3);
    // 后墙
    piece(GEO.box, wallM, 0, h / 2 + 0.3, -d / 2 + t / 2, w, h, t);
    pieceCollider(0, -d / 2 + t / 2, w, t, h + 0.4);
    // 侧墙
    piece(GEO.box, wallM, -w / 2 + t / 2, h / 2 + 0.3, 0, t, h, d);
    pieceCollider(-w / 2 + t / 2, 0, t, d, h + 0.4);
    piece(GEO.box, wallM, w / 2 - t / 2, h / 2 + 0.3, 0, t, h, d);
    pieceCollider(w / 2 - t / 2, 0, t, d, h + 0.4);
    // 前墙（留门洞）
    const segW = (w - doorW) / 2;
    piece(GEO.box, wallM, -(doorW / 2 + segW / 2), h / 2 + 0.3, d / 2 - t / 2, segW, h, t);
    pieceCollider(-(doorW / 2 + segW / 2), d / 2 - t / 2, segW, t, h + 0.4);
    piece(GEO.box, wallM, (doorW / 2 + segW / 2), h / 2 + 0.3, d / 2 - t / 2, segW, h, t);
    pieceCollider((doorW / 2 + segW / 2), d / 2 - t / 2, segW, t, h + 0.4);
    // 门楣
    piece(GEO.box, wallM, 0, doorH + 0.3 + (h - doorH) / 2, d / 2 - t / 2, doorW + 0.2, h - doorH, t);
    // 门框
    piece(GEO.box, M.woodDark, -doorW / 2 - 0.06, doorH / 2 + 0.3, d / 2 - t / 2, 0.12, doorH, t + 0.06);
    piece(GEO.box, M.woodDark, doorW / 2 + 0.06, doorH / 2 + 0.3, d / 2 - t / 2, 0.12, doorH, t + 0.06);
    // 半开的旧木门
    if (!opts.noDoor) {
      piece(GEO.box, M.wood, -doorW / 2 + 0.3, doorH / 2 + 0.3, d / 2 + 0.18, 0.75, doorH - 0.06, 0.06, 0.85);
    }
    // 窗（暗洞内嵌）
    const winY = h * 0.62;
    piece(GEO.box, M.ironDark, -w / 2 + t / 2, winY, d * 0.18, t + 0.04, 0.7, 0.9);
    piece(GEO.box, M.ironDark, w / 2 - t / 2, winY, -d * 0.15, t + 0.04, 0.7, 0.9);
    // 屋顶（双坡 + 正脊 + 压瓦石）：左坡 +x 端在屋脊(高)，右坡 -x 端在屋脊
    const roofPitch = 0.5, roofT = 0.14;
    const slopeLen = Math.hypot(w / 2 + 0.55, (w / 2) * roofPitch) + 0.15;
    const ang = Math.atan2((w / 2) * roofPitch, w / 2 + 0.4);
    piece(GEO.box, M.roof, -w / 4 - 0.1, h + 0.3 + (w / 4) * roofPitch, 0, slopeLen, roofT, d + 1.0, 0, 0, ang);
    piece(GEO.box, M.roof, w / 4 + 0.1, h + 0.3 + (w / 4) * roofPitch, 0, slopeLen, roofT, d + 1.0, 0, 0, -ang);
    piece(GEO.box, M.stone, 0, h + 0.34 + (w / 2) * roofPitch, 0, 0.4, 0.22, d + 1.05);
    // 压瓦石
    for (let i = -1; i <= 1; i++) {
      piece(GEO.box, M.stone, -w / 4, h + 0.42 + (w / 4) * roofPitch, i * d * 0.32, 0.35, 0.18, 0.35);
      piece(GEO.box, M.stone, w / 4, h + 0.42 + (w / 4) * roofPitch, i * d * 0.32, 0.35, 0.18, 0.35);
    }
    // 山墙封口（三角近似：两层收窄的墙）
    piece(GEO.box, wallM, 0, h + 0.3 + (w / 8) * roofPitch * 2, -d / 2 + t / 2, w * 0.55, (w / 4) * roofPitch * 2, t);
    piece(GEO.box, wallM, 0, h + 0.3 + (w / 8) * roofPitch * 2, d / 2 - t / 2, w * 0.55, (w / 4) * roofPitch * 2, t);

    // 屋内家什
    if (!opts.empty) {
      piece(GEO.box, M.wood, -w * 0.22, 0.75, -d * 0.2, 1.3, 0.08, 0.8);          // 桌面
      piece(GEO.box, M.woodDark, -w * 0.22, 0.4, -d * 0.2, 0.1, 0.7, 0.1);
      piece(GEO.box, M.clothGrey, w * 0.22, 0.55, -d * 0.25, 1.0, 0.25, 1.9);     // 铺盖
      piece(GEO.box, M.wood, w * 0.25, 0.62, d * 0.18, 0.7, 0.5, 0.7);            // 木箱
      piece(GEO.cyl, M.wood, -w * 0.28, 0.7, d * 0.22, 0.55, 0.8, 0.55);          // 水缸
    }
    return {
      base,
      // 局部点 → 世界点（供摆放文书/钥匙）
      local: (lx, ly, lz) => {
        const [wx, wz] = rotXZ(lx, lz, dir);
        return new THREE.Vector3(x + wx, base + ly, z + wz);
      },
    };
  }

  // 晾网架
  function netRack(x, z, ry = 0) {
    const base = g(x, z);
    B.add(GEO.cyl, M.woodDark, x - Math.cos(ry) * 1.8, base + 1.1, z + Math.sin(ry) * 1.8, 0, 0.12, 2.2, 0.12);
    B.add(GEO.cyl, M.woodDark, x + Math.cos(ry) * 1.8, base + 1.1, z - Math.sin(ry) * 1.8, 0, 0.12, 2.2, 0.12);
    B.add(GEO.box, M.woodDark, x, base + 2.05, z, ry, 3.8, 0.1, 0.1);
    const net = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.7), M.net);
    net.position.set(x, base + 1.15, z);
    net.rotation.y = ry;
    scene.add(net);
    circle(x, z, 0.35, base + 2.1, { noSightBlock: true });
  }

  // 灯笼杆（optLight: 挂真实点光）——核册之夜，全镇挂「名」灯
  function lanternPole(x, z, optLight = false, char = 'chao') {
    const base = g(x, z);
    B.add(GEO.cyl, M.woodDark, x, base + 1.6, z, 0, 0.14, 3.2, 0.14);
    B.add(GEO.box, M.woodDark, x + 0.35, base + 3.05, z, 0, 0.9, 0.08, 0.08);
    const lan = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.26, 0.5, 10),
      char === 'ji' ? M.lanternPaperJi : char === 'xi' ? M.lanternPaperXi : M.lanternPaper
    );
    lan.position.set(x + 0.7, base + 2.75, z);
    scene.add(lan);
    B.add(GEO.cyl, M.ironDark, x + 0.7, base + 3.02, z, 0, 0.08, 0.06, 0.08);
    if (optLight) {
      const pl = new THREE.PointLight(0xff8438, 14, 15, 2);
      pl.position.set(x + 0.7, base + 2.7, z);
      scene.add(pl);
      lights.push(pl);
      // 灯下拖出一段被盐雾抓住的光
      const cone = makeLightCone(0xff8438, 0.05, 0.2, 1.9, base + 2.55 - g(x, z) + 0.15);
      cone.position.set(x + 0.7, base + 2.55, z);
      scene.add(cone);
    }
    circle(x, z, 0.2, base + 3.2, { noSightBlock: true });
    return lan;
  }

  // 小舢板
  function sampan(x, z, ry, tilt = 0) {
    const base = g(x, z);
    B.add(GEO.box, M.wood, x, base + 0.45, z, ry, 1.6, 0.5, 4.6, 0, tilt);
    B.add(GEO.box, M.wood, x, base + 0.75, z, ry, 1.9, 0.16, 4.9, 0, tilt);
    B.add(GEO.box, M.woodDark, x, base + 0.85, z, ry, 1.5, 0.1, 0.4, 0, tilt);
    aabb(x, z, 2.0, 2.0, base + 1.0);
  }

  // 礁岩
  function reefRock(x, z, s) {
    const base = terrainHeight(x, z);
    B.add(GEO.sphere, M.rock, x, base + s * 0.24, z, rand() * 6.28, s, s * 0.62, s * 0.8);
    if (s > 1.2) circle(x, z, s * 0.42, base + s * 0.5);
  }

  // 树（滨海风剪乔木：歪脖 + 层叠团冠）
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x39443a, roughness: 0.95 });
  function tree(x, z, s = 1) {
    const base = g(x, z);
    const lean = (rand() - 0.5) * 0.35;
    B.add(GEO.cyl, M.woodDark, x, base + 1.5 * s, z, 0, 0.2 * s, 3.0 * s, 0.2 * s, 0, lean);
    const tx2 = x + lean * 2.4 * s;
    // 层叠压扁球体做冠，风剪向一侧
    B.add(GEO.sphere, leafMat, tx2 + 0.5 * s, base + 3.1 * s, z, rand() * 3, 2.6 * s, 1.2 * s, 2.2 * s);
    B.add(GEO.sphere, leafMat, tx2 - 0.4 * s, base + 3.7 * s, z + 0.3 * s, rand() * 3, 1.9 * s, 0.95 * s, 1.7 * s);
    B.add(GEO.sphere, leafMat, tx2 + 0.9 * s, base + 4.1 * s, z - 0.2 * s, rand() * 3, 1.3 * s, 0.7 * s, 1.2 * s);
    circle(x, z, 0.3 * s, base + 2.8 * s, { noSightBlock: true });
  }

  // 符纸幡
  function banner(x, z, ry) {
    const base = g(x, z);
    B.add(GEO.cyl, M.woodDark, x, base + 1.5, z, 0, 0.09, 3.0, 0.09);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 1.6), M.talisman);
    b.position.set(x + Math.sin(ry) * 0.35, base + 2.1, z + Math.cos(ry) * 0.35);
    b.rotation.y = ry;
    scene.add(b);
  }

  // ================= ① 滩涂·搁浅点 =================
  {
    // 搁浅的渡船（船底埋进滩涂，微倾）：分层船壳 + 舷缘 + 矮舱室 + 歪烟囱
    const fx = 92, fz = 122;
    const base = terrainHeight(fx, fz) - 0.9; // 埋入
    const ry = 0.6, tilt = 0.09;
    B.add(GEO.box, M.woodDark, fx, base + 1.0, fz, ry, 4.0, 2.0, 12.5, 0, tilt);        // 主船壳
    B.add(GEO.box, M.woodDark, fx, base + 2.0, fz, ry, 4.5, 0.5, 13.2, 0, tilt);        // 上层外扩
    B.add(GEO.box, M.wood, fx, base + 2.35, fz, ry, 4.7, 0.22, 13.5, 0, tilt);          // 舷缘
    // 船头收尖（旋转的楔形）
    B.add(GEO.box, M.woodDark, fx + Math.sin(ry) * 7.2, base + 1.4, fz + Math.cos(ry) * 7.2, ry + 0.5, 2.6, 1.8, 2.6, 0, tilt);
    // 舱室与烟囱
    B.add(GEO.box, M.plaster, fx - Math.sin(ry) * 2, base + 3.1, fz - Math.cos(ry) * 2, ry, 3.0, 1.5, 4.5, 0, tilt);
    B.add(GEO.box, M.woodDark, fx - Math.sin(ry) * 2, base + 3.95, fz - Math.cos(ry) * 2, ry, 3.3, 0.18, 4.8, 0, tilt);
    B.add(GEO.cyl, M.ironDark, fx - Math.sin(ry) * 3.5, base + 4.6, fz - Math.cos(ry) * 3.5, 0, 0.55, 1.9, 0.55, 0, 0.24);
    // 断裂的桅杆斜插在滩上
    B.add(GEO.cyl, M.woodDark, fx - 5, terrainHeight(fx - 5, fz + 3) + 1.2, fz + 3, 0, 0.14, 4.4, 0.14, 0.5, 0.9);
    aabb(fx, fz, 5.5, 13.5, base + 4);
    // 礁岩群
    const reefs = [[70, 128, 2.2], [60, 118, 1.6], [82, 100, 1.9], [66, 104, 1.2], [94, 108, 2.6], [55, 130, 1.8], [75, 92, 1.0], [88, 90, 1.4]];
    for (const [x, z, s] of reefs) reefRock(x, z, s);
    // 破渔网、木箱杂物
    netRack(70, 96, 0.5);
    sampan(62, 98, 1.2, 0.12);
    B.add(GEO.box, M.wood, 73, g(73, 100) + 0.3, 100, 0.7, 0.8, 0.6, 0.8);
    // （出生点已迁往镇口长途车站——滩涂改为后期可达区域）
  }

  // ================= ② 石堤 · 渔寮区 =================
  {
    // 石堤表面铺条石
    for (let x = -22; x <= 56; x += 2.2) {
      const z = 68 + (x + 24) * (5 / 82);
      B.add(GEO.box, M.stone, x, g(x, z) + 0.02, z, 0.04, 2.1, 0.12, 4.6);
    }
    // 系缆桩
    for (let x = -16; x <= 52; x += 12) {
      const z = 70 + (x + 24) * (5 / 82);
      B.add(GEO.cyl, M.stone, x, g(x, z) + 0.4, z + 1.6, 0, 0.35, 0.8, 0.35);
    }
    // 渔寮三间
    const h1 = house(2, 52, 0, 4.6, 3.8);
    const h2 = house(20, 57, 2, 5.2, 4.2);   // 门朝北(-z)…朝村
    house(38, 51, 0, 4.4, 3.6);
    locations.note2 = h1.local(-1.0, 0.85, -0.7);   // 渔民日记(桌上·支线文书⑩)
    dynamic.hut2 = h2;
    // 晾网架成排
    netRack(9, 47, 0.2); netRack(13.5, 46, -0.3); netRack(30, 47.5, 0.15); netRack(45, 55, 1.2);
    // 舢板
    sampan(-4, 60, 0.4); sampan(48, 62, -0.5, 0.06);
    lanternPole(6, 55, true);
    lanternPole(34, 54, false);
    tree(-10, 52, 1.1); tree(52, 44, 0.9);
    // 石堤路
    laySlabPath([[66, 92], [56, 80], [46, 72]]);
    laySlabPath([[46, 72], [20, 62], [4, 56]]);
  }

  // ================= 镇墙与堤门 =================
  {
    const wz = 38; // 村墙线
    const gx = 16; // 门洞中心
    const mk = (cx, w) => {
      const base = g(cx, wz);
      B.add(GEO.box, M.stone, cx, base + 1.3, wz, 0, w, 2.6, 0.65);
      B.add(GEO.box, M.roof, cx, base + 2.72, wz, 0, w + 0.2, 0.22, 0.95);
      aabb(cx, wz, w, 0.65, base + 2.8);
    };
    mk((-34 + (gx - 1.4)) / 2, (gx - 1.4) - (-34));       // 西段
    mk(((gx + 1.4) + 62) / 2, 62 - (gx + 1.4));           // 东段
    // 门柱与门楣
    const base = g(gx, wz);
    B.add(GEO.box, M.stone, gx - 1.6, base + 1.7, wz, 0, 0.8, 3.4, 1.0);
    B.add(GEO.box, M.stone, gx + 1.6, base + 1.7, wz, 0, 0.8, 3.4, 1.0);
    B.add(GEO.box, M.roof, gx, base + 3.6, wz, 0, 4.6, 0.35, 1.5);
    B.add(GEO.box, M.stone, gx, base + 3.25, wz, 0, 3.9, 0.35, 0.9);
    aabb(gx - 1.6, wz, 0.8, 1.0, base + 3.4);
    aabb(gx + 1.6, wz, 0.8, 1.0, base + 3.4);
    // 木门（动态，可开）
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.9, 0.16), M.wood);
    door.castShadow = true;
    const pivot = new THREE.Group();
    pivot.position.set(gx - 1.2, base + 1.45 + 0.05, wz);
    door.position.set(1.15, 0, 0);
    pivot.add(door);
    scene.add(pivot);
    dynamic.gateDoor = pivot;
    dynamic.gateCollider = { minX: gx - 1.3, maxX: gx + 1.3, minZ: wz - 0.25, maxZ: wz + 0.25, maxY: base + 3.2 };
    colliders.push(dynamic.gateCollider);
    locations.gate = new THREE.Vector3(gx, base + 1.2, wz);
    // 门口灯笼(真实光) + 符纸
    lanternPole(gx - 3, wz + 1.5, true, 'ji');
    banner(gx + 3, wz + 1.2, -0.4);
    laySlabPath([[16, 60], [16, 40]]);
  }

  // ================= ②' 镇口 · 长途车站 / 牌坊 / 镇前街 / 家属楼 =================
  // 2001 年的夜班车把你放在这里。站台的灯还亮着，班次牌翻到「已发」。
  // 玩家出生点。牌坊下的栅门夜里落闩——闩在里侧，岗亭里的人一动不动。
  {
    // —— 公路（补丁摞补丁的县道沥青）——
    const layRoad = (pts, width = 4.4) => {
      for (let s = 0; s < pts.length - 1; s++) {
        const [ax, az] = pts[s], [bx, bz] = pts[s + 1];
        const dist = Math.hypot(bx - ax, bz - az);
        const ang = Math.atan2(bx - ax, bz - az);
        const n = Math.max(1, Math.round(dist / 3.0));
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n;
          const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
          B.add(GEO.box, M.asphalt, x, g(x, z) + 0.015, z, ang, width + (rand() - 0.5) * 0.5, 0.07, dist / n + 0.35);
        }
      }
    };
    layRoad([[74, 2], [46, 0]]);                     // 镇外来路（尽头没进雾里）
    layRoad([[44, 0], [30, -2], [18, -6], [11, -8]]); // 镇前街
    layRoad([[12, -8], [24, -20], [36, -32], [43, -41]], 3.2); // 岔路→海洋馆正门
    laySlabPath([[-14, 8], [-26, 16], [-35, 21]]);   // 岔路→家属区

    // —— 雨夜积水：路面镜洼（车灯/街灯在里面拉出倒影条）——
    {
      const puddleM = new THREE.MeshStandardMaterial({
        color: 0x11171a, roughness: 0.04, metalness: 0.92, envMapIntensity: 1.8,
      });
      const puddleG = new THREE.CircleGeometry(1, 18);
      for (const [px, pz, s, sq] of [
        [60.5, 0.8, 1.3, 0.55], [55, 1.7, 0.9, 0.5], [50.5, 0.9, 1.5, 0.45],
        [46.6, -0.7, 0.8, 0.6], [44.4, 2.1, 1.1, 0.5], [43.6, -2.4, 0.9, 0.55],
        [38, -1.2, 1.5, 0.5], [31, -2.6, 1.0, 0.55], [24, -4.6, 1.2, 0.5], [17, -6.4, 0.9, 0.55],
      ]) {
        const p = new THREE.Mesh(puddleG, puddleM);
        p.rotation.x = -Math.PI / 2;
        p.scale.set(s, s * sq, 1);
        p.position.set(px, g(px, pz) + 0.056, pz);
        scene.add(p);
      }
    }

    // —— 长途车站 ——
    {
      const bx = 58, bz = 4.6, base = g(bx, bz);
      // 雨棚：两根钢柱 + 石棉瓦顶
      for (const px of [bx - 2.1, bx + 2.1]) {
        B.add(GEO.cyl, M.ironDark, px, base + 1.45, bz + 0.6, 0, 0.09, 2.9, 0.09);
        circle(px, bz + 0.6, 0.15, base + 2.9, { noSightBlock: true });
      }
      B.add(GEO.box, M.roof, bx, base + 2.95, bz + 0.2, 0, 5.6, 0.12, 2.6, 0, 0.06);
      // 长椅（行李箱=文书①）
      B.add(GEO.box, M.wood, bx, base + 0.48, bz + 1.1, 0, 3.0, 0.09, 0.45);
      for (const px of [bx - 1.3, bx + 1.3]) B.add(GEO.box, M.ironDark, px, base + 0.24, bz + 1.1, 0, 0.09, 0.48, 0.4);
      aabb(bx, bz + 1.1, 3.0, 0.5, base + 0.55, { noSightBlock: true });
      B.add(GEO.box, M.clothGrey, bx + 0.9, base + 0.72, bz + 1.1, 0.25, 0.66, 0.36, 0.42);
      locations.luggage = new THREE.Vector3(bx + 0.9, base + 0.8, bz + 1.1);
      // 站牌：蚀湾站 · 班次全部划掉
      B.add(GEO.cyl, M.ironDark, bx - 3.6, base + 1.4, bz - 0.4, 0, 0.07, 2.8, 0.07);
      B.add(GEO.box, plateMat('蚀湾站', { w: 192, h: 96, bg: '#1e4a8a', fg: '#f0f0e8', font: 0.44 }),
        bx - 3.6, base + 2.5, bz - 0.4, 0, 0.9, 0.5, 0.06);
      B.add(GEO.box, plateMat('末班 21:30 已发', { w: 288, h: 56, bg: '#d8d0bc', fg: '#5a2020', font: 0.4 }),
        bx - 3.6, base + 2.05, bz - 0.4, 0, 0.9, 0.28, 0.05);
      circle(bx - 3.6, bz - 0.4, 0.14, base + 2.8, { noSightBlock: true });
      // 时刻表(玻璃框里泛黄的纸)
      const tt = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.8), M.notice);
      tt.position.set(bx - 2.12, base + 1.7, bz + 0.6);
      tt.rotation.y = -Math.PI / 2;
      scene.add(tt);
      // 雨棚下一支荧光管（冷白，喘着气闪）——阈限车站的主光
      B.add(GEO.box, M.fluorescent, bx, base + 2.82, bz + 0.3, 0, 1.5, 0.06, 0.14);
      const pl = new THREE.PointLight(0xd8e4dc, 11, 13, 2);
      pl.position.set(bx, base + 2.5, bz + 0.4);
      scene.add(pl);
      lights.push(pl);
      const cone = makeLightCone(0xd8e4dc, 0.045, 0.16, 1.7, 2.4);
      cone.position.set(bx, base + 2.7, bz + 0.4);
      scene.add(cone);
      // 垃圾桶 + 压扁的纸杯
      B.add(GEO.cyl, M.ironDark, bx + 3.2, base + 0.42, bz + 0.8, 0, 0.32, 0.85, 0.32);
      circle(bx + 3.2, bz + 0.8, 0.3, base + 0.9, { noSightBlock: true });
      // 雨棚檐口水线：棚上汇的雨顺檐口淌成几条断线（雨夜第一眼的「湿」）
      const dripM = new THREE.MeshBasicMaterial({ color: 0xaebfc4, transparent: true, opacity: 0.34, depthWrite: false });
      for (let i = 0; i < 6; i++) {
        const dx = bx - 2.6 + i * 1.05 + (rand() - 0.5) * 0.3;
        const dl = 0.5 + rand() * 1.7;
        const dm = new THREE.Mesh(new THREE.BoxGeometry(0.012, dl, 0.012), dripM);
        dm.position.set(dx, base + 2.86 - dl / 2, bz + 1.56);
        scene.add(dm);
      }
      // 站台堆着没人认领的鱼货筐（两只落地一只摞上——构图密度）
      B.add(GEO.box, M.woodDark, bx + 3.5, base + 0.17, bz - 0.7, 0.2, 0.52, 0.34, 0.4);
      B.add(GEO.box, M.woodDark, bx + 4.0, base + 0.17, bz - 0.2, -0.4, 0.5, 0.34, 0.38);
      B.add(GEO.box, M.woodDark, bx + 3.7, base + 0.51, bz - 0.45, 0.9, 0.48, 0.32, 0.36);
      aabb(bx + 3.75, bz - 0.45, 1.3, 1.2, base + 0.72, { noSightBlock: true });
      // 出生点：站台上，面朝牌坊
      locations.spawn = { x: 60.5, z: 2.2, yaw: 1.44 };
    }

    // —— 末班车（开场演出：把你放下，然后掉头回县城）——
    // 仰拍级细节：轮拱/轮毂/保险杠/雨刮/后视镜/弧顶 + 轮位接地阴影与底盘暗带——
    // 低机位镜头里它得是一台「压着路」的铁皮车，不是一摞悬浮的盒子
    {
      const bus = new THREE.Group();
      const mkBox = (mat, x, y, z, sx, sy, sz) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
        m.position.set(x, y, z);
        bus.add(m);
        return m;
      };
      // 车身：四条长棱倒角的挤出壳（客车蒙皮是弯折的铁皮，不是刀切的箱子）——
      // 横截面圆角矩形沿车长挤出，bevel 再把前后脸的立棱一并倒掉
      {
        // bevel 会把中段轮廓向外扩 bevelSize：截面按 1.15-0.05 内收，扩完正好 1.15 半宽
        const hw2 = 1.10, by0 = 0.70, by1 = 2.30, chm = 0.08;
        const prof = new THREE.Shape();
        prof.moveTo(-hw2 + chm, by0);
        prof.lineTo(hw2 - chm, by0);
        prof.quadraticCurveTo(hw2, by0, hw2, by0 + chm);
        prof.lineTo(hw2, by1 - chm);
        prof.quadraticCurveTo(hw2, by1, hw2 - chm, by1);
        prof.lineTo(-hw2 + chm, by1);
        prof.quadraticCurveTo(-hw2, by1, -hw2, by1 - chm);
        prof.lineTo(-hw2, by0 + chm);
        prof.quadraticCurveTo(-hw2, by0, -hw2 + chm, by0);
        const bodyG = new THREE.ExtrudeGeometry(prof, {
          depth: 8.28, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05,
          bevelSegments: 2, curveSegments: 3,
        });
        // 挤出 UV 以米为单位——灰泥纹会平铺 8 次读成迷彩；缩到 0.12 恢复整面舒展
        {
          const buv = bodyG.attributes.uv;
          for (let i = 0; i < buv.count; i++) buv.setXY(i, buv.getX(i) * 0.12, buv.getY(i) * 0.12);
        }
        bodyG.rotateY(Math.PI / 2);          // 挤出轴转到车长（x）方向
        bodyG.computeBoundingBox();
        bodyG.translate(-(bodyG.boundingBox.min.x + bodyG.boundingBox.max.x) / 2, 0, 0);
        const body = new THREE.Mesh(bodyG, M.plaster);
        bus.add(body);
      }
      // 裙边压暗 + 轮拱真开口：裙边不再横贯全长——轮位挖出洞、洞里是内凹黑腔，
      // 车轮从「洞」里长出来；裙面换更暗的哑光铁皮（湿夜里裙边吃住地面，不反光抢戏）
      const skirtM = new THREE.MeshStandardMaterial({ color: 0x0d1013, roughness: 0.88, metalness: 0.15 });
      mkBox(skirtM, -3.87, 0.55, 0, 0.66, 0.55, 2.34);               // 尾段
      mkBox(skirtM, 0, 0.55, 0, 4.5, 0.55, 2.34);                    // 中段（两轴之间）
      mkBox(skirtM, 3.87, 0.55, 0, 0.66, 0.55, 2.34);                // 头段
      mkBox(M.clothRed, 0, 1.05, 0, 8.42, 0.22, 2.36);               // 红腰线
      // 窗带：车厢内微光 + 座椅背板剪影烘进贴图（一格一窗、窗柱分隔）——
      // 夜里路过的大巴车窗永远是「暖光里一排空椅背」，不是一条黑玻璃
      {
        const wc = document.createElement('canvas');
        wc.width = 512; wc.height = 96;
        const wx2 = wc.getContext('2d');
        wx2.fillStyle = '#0b0e10';
        wx2.fillRect(0, 0, 512, 96);
        for (let i = 0; i < 8; i++) {
          const gx = 6 + i * 63, gw = 52;
          // 车厢内昏黄微光（顶亮向下衰减——车内灯在天花上）
          const gr = wx2.createLinearGradient(0, 8, 0, 88);
          gr.addColorStop(0, '#41331e');
          gr.addColorStop(0.55, '#2a2013');
          gr.addColorStop(1, '#120e08');
          wx2.fillStyle = gr;
          wx2.fillRect(gx, 8, gw, 80);
          // 座椅背板剪影：每窗两座高背 + 圆角头枕（2001 长途车的直背椅）
          wx2.fillStyle = '#0a0806';
          for (const sx2 of [gx + 6, gx + 28]) {
            wx2.beginPath();
            wx2.moveTo(sx2, 88);
            wx2.lineTo(sx2, 42);
            wx2.quadraticCurveTo(sx2, 33, sx2 + 8, 33);
            wx2.quadraticCurveTo(sx2 + 16, 33, sx2 + 16, 42);
            wx2.lineTo(sx2 + 16, 88);
            wx2.closePath();
            wx2.fill();
          }
          // 窗柱
          wx2.fillStyle = '#14181a';
          wx2.fillRect(gx + gw, 0, 63 - gw + 2, 96);
        }
        // 玻璃斜反光两道（低 alpha 白斜带——湿夜玻璃的「膜」）
        wx2.globalAlpha = 0.07;
        wx2.fillStyle = '#cfe0e8';
        for (const rx of [60, 300]) {
          wx2.save();
          wx2.translate(rx, 0);
          wx2.rotate(0.35);
          wx2.fillRect(0, -20, 26, 150);
          wx2.restore();
        }
        wx2.globalAlpha = 1;
        const winTex = new THREE.CanvasTexture(wc);
        winTex.colorSpace = THREE.SRGBColorSpace;
        winTex.anisotropy = 4;
        const winMat = new THREE.MeshStandardMaterial({
          map: winTex, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.55,
          roughness: 0.22, metalness: 0.15, envMapIntensity: 1.5,
        });
        mkBox(winMat, 0, 1.95, 0, 7.2, 0.62, 2.36);
      }
      mkBox(M.crtGlass, 4.16, 1.9, 0, 0.1, 0.8, 1.9);                // 前挡
      // 弧顶：客车顶是拱不是平板（低机位仰拍时的关键轮廓线）
      {
        const dome = new THREE.Mesh(new THREE.CylinderGeometry(1.14, 1.14, 8.15, 18, 1), M.plaster);
        dome.rotation.z = Math.PI / 2;    // 轴转到车长方向
        dome.scale.set(0.24, 1, 1);       // 局部 x（旋转后=世界竖直）压扁成浅拱
        dome.position.set(0, 2.36, 0);
        bus.add(dome);
      }
      // 前后保险杠（钢面、比车身探出半拳）
      mkBox(M.steel, 4.28, 0.58, 0, 0.16, 0.26, 2.42);
      mkBox(M.steel, -4.28, 0.58, 0, 0.16, 0.26, 2.42);
      mkBox(plateMat('浙C·20114', { w: 192, h: 48, bg: '#1e3a8a', fg: '#f0f0e8', font: 0.6 }),
        4.37, 0.58, 0, 0.04, 0.14, 0.5);                             // 前牌照
      // 雨刮 ×2：停在前挡下缘、微斜（雨夜里它刚停摆）
      for (const wz2 of [-0.55, 0.25]) {
        const arm = mkBox(M.ironDark, 4.23, 1.62, wz2, 0.025, 0.42, 0.035);
        arm.rotation.x = wz2 < 0 ? 0.45 : 0.38;
        arm.rotation.z = -0.12;
      }
      // 后视镜（外探的「耳朵」——低角度剪影的辨识件）
      for (const s of [-1, 1]) {
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.34, 6), M.ironDark);
        rod.position.set(4.05, 2.06, s * 1.32);
        rod.rotation.x = s * 0.9;
        bus.add(rod);
        mkBox(M.crtGlass, 4.02, 2.2, s * 1.44, 0.05, 0.24, 0.15);
      }
      // 轮组：轮胎（加大接地）+ 钢轮毂 + 轮拱罩 + 轮窝暗腔
      const wellM = new THREE.MeshBasicMaterial({ color: 0x050607 });
      const shadM = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false });
      for (const [wx, wz] of [[-2.9, -1.05], [2.9, -1.05], [-2.9, 1.05], [2.9, 1.05]]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 16), M.ironDark);
        w.rotation.x = Math.PI / 2;
        w.position.set(wx, 0.44, wz);
        bus.add(w);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.32, 10), M.steel);
        hub.rotation.x = Math.PI / 2;
        hub.position.set(wx, 0.44, wz);
        bus.add(hub);
        // 轮窝内凹暗腔：内壁从裙面（z≈1.17）后退 13cm——侧视裙边开口里是一个
        // 有深度的黑腔，轮胎穿腔而出；旧的贴面黑盒只是一块「涂黑」没有进深
        mkBox(wellM, wx, 0.6, Math.sign(wz) * 0.82, 1.3, 0.64, 0.44);
        // 轮拱罩：半环钢壳压在轮上（θ π/2..3π/2 → 旋转后为上半拱）
        const arch = new THREE.Mesh(
          new THREE.CylinderGeometry(0.54, 0.54, 0.34, 12, 1, true, Math.PI / 2, Math.PI), M.ironDark);
        arch.rotation.x = Math.PI / 2;
        arch.position.set(wx, 0.44, wz);
        bus.add(arch);
        // 车轮接地阴影：轮底一片压实的暗椭圆（车重读在这四块黑上）
        const patch = new THREE.Mesh(new THREE.CircleGeometry(0.5, 14), shadM);
        patch.rotation.x = -Math.PI / 2;
        patch.scale.set(1, 0.62, 1);
        patch.position.set(wx, -0.008, wz);
        patch.renderOrder = 2;
        bus.add(patch);
      }
      // 底盘暗带：车腹下一整条软阴影（消「悬浮盒」的最后一味药）
      {
        const under = new THREE.Mesh(new THREE.PlaneGeometry(8.0, 2.0), new THREE.MeshBasicMaterial({
          color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false,
        }));
        under.rotation.x = -Math.PI / 2;
        under.position.set(0, -0.004, 0);
        under.renderOrder = 1;
        bus.add(under);
      }
      // 尾灯（朝西——离站时你只看得见这两点红）
      const tl = new THREE.MeshBasicMaterial({ color: 0xff2a20 });
      mkBox(tl, -4.22, 1.0, -0.85, 0.06, 0.16, 0.3);
      mkBox(tl, -4.22, 1.0, 0.85, 0.06, 0.16, 0.3);
      // 车头灯组小几何：内凹灯碗 + 钢圈 bezel + 玻璃凸透镜 + 角上琥珀转向灯——
      // 灯是「装」在车脸上的组件，不再是两粒贴面发光方块
      const hlM = new THREE.MeshBasicMaterial({ color: 0xfff2c8 });
      {
        const bezelM = new THREE.MeshStandardMaterial({ color: 0x8a9094, roughness: 0.3, metalness: 0.85 });
        const ambM = new THREE.MeshBasicMaterial({ color: 0xd8862a });
        for (const s of [-1, 1]) {
          const lz = s * 0.82;
          const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.085, 0.09, 14), wellM);
          bowl.rotation.z = -Math.PI / 2;    // 轴向车头：碗口朝前的暗腔
          bowl.position.set(4.15, 0.92, lz);
          bus.add(bowl);
          const bez = new THREE.Mesh(new THREE.TorusGeometry(0.112, 0.016, 8, 18), bezelM);
          bez.rotation.y = Math.PI / 2;
          bez.position.set(4.205, 0.92, lz);
          bus.add(bez);
          const lens = new THREE.Mesh(new THREE.SphereGeometry(0.098, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hlM);
          lens.scale.set(1, 0.42, 1);        // 压扁成凸透镜
          lens.rotation.z = -Math.PI / 2;    // 球顶朝前
          lens.position.set(4.2, 0.92, lz);
          bus.add(lens);
          mkBox(ambM, 4.19, 0.92, s * 1.07, 0.045, 0.08, 0.1); // 角上小转向灯
        }
      }
      for (const hz2 of [-0.82, 0.82]) {
        const hcone = makeLightCone(0xffeec0, 0.07, 0.13, 1.8, 8);
        hcone.position.set(4.2, 0.92, hz2);
        hcone.rotation.z = Math.PI / 2; // 光锥指向车头
        bus.add(hcone);
      }
      // 车头一盏真实点光：把湿路面和雨丝打亮
      const hpl = new THREE.PointLight(0xffeec0, 7, 12, 2);
      hpl.position.set(5.2, 1.0, 0);
      bus.add(hpl);
      // 车尾线路牌
      mkBox(plateMat('蚀湾 — 县城', { w: 256, h: 64, bg: '#1e2226', fg: '#e8e0c8', font: 0.42 }), -4.21, 1.95, 0, 0.05, 0.4, 1.4);
      // 车内一盏昏黄的灯（跟着车走）
      const inl = new THREE.PointLight(0xffe2b0, 5, 6, 2);
      inl.position.set(0, 2.0, 0);
      bus.add(inl);
      // 驶离轮迹水花：四轮后各一支加法混合的低锥「雾雨尾」——静止不可见，
      // story.updateBus 按车速点亮/撑大（湿沥青上开走的车必须带起水）
      {
        const spray0 = makeLightCone(0x9fb4ba, 0.0, 0.05, 0.42, 1.3);
        dynamic.busSprayMat = spray0.material;   // 渐变光锥材质：雾状收梢，不是实心白角
        dynamic.busSprays = [];
        for (const [wx, wz] of [[-2.9, -1.05], [2.9, -1.05], [-2.9, 1.05], [2.9, 1.05]]) {
          const sp = dynamic.busSprays.length === 0 ? spray0
            : new THREE.Mesh(spray0.geometry, spray0.material);
          sp.position.set(wx - 0.45, 0.14, wz + Math.sign(wz) * 0.08);
          sp.rotation.z = -2.03;               // 锥口指向车尾偏上——轮后拖出的水雾扇
          sp.scale.set(0.4, 0.4, 0.35);
          sp.visible = false;
          sp.renderOrder = 6;
          bus.add(sp);
          dynamic.busSprays.push(sp);
        }
      }
      bus.position.set(64.5, g(64.5, -1.3) + 0.06, -1.3);
      scene.add(bus);
      dynamic.bus = bus;
      dynamic.busCollider = { minX: 64.5 - 4.4, maxX: 64.5 + 4.4, minZ: -1.3 - 1.3, maxZ: -1.3 + 1.3, maxY: g(64.5, -1.3) + 2.8 };
      colliders.push(dynamic.busCollider);
    }

    // —— 镇口牌坊 + 栅门 + 岗亭 ——
    {
      const ax = 44, base = g(ax, 0);
      // 石柱一对 + 楣枋 + 瓦顶
      for (const pz of [-3.4, 3.4]) {
        B.add(GEO.box, M.stone, ax, base + 2.3, pz, 0, 0.9, 4.6, 0.9);
        aabb(ax, pz, 0.9, 0.9, base + 4.6);
      }
      B.add(GEO.box, M.stone, ax, base + 4.85, 0, 0, 1.0, 0.5, 7.6);
      B.add(GEO.box, M.roof, ax, base + 5.35, 0, 0, 1.6, 0.3, 8.6);
      B.add(GEO.box, plateMat('蚀 湾', { w: 224, h: 112, bg: '#2e3438', fg: '#d8cfb8', font: 0.5 }), ax - 0.52, base + 4.85, 0, 0, 0.06, 0.44, 1.7);
      // 栅门（木栅横杆，夜里落闩；动态可开）
      const gate = new THREE.Group();
      for (const gy of [0.55, 1.05, 1.55]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 5.9), M.woodDark);
        bar.position.set(0, gy, -2.95);
        gate.add(bar);
      }
      const diag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 3.2), M.woodDark);
      diag.position.set(0, 1.05, -1.5);
      diag.rotation.x = 0.35;
      gate.add(diag);
      gate.position.set(ax, base, 2.95);
      scene.add(gate);
      dynamic.townGate = gate;
      dynamic.townGateCollider = { minX: ax - 0.3, maxX: ax + 0.3, minZ: -3.0, maxZ: 3.0, maxY: base + 2.0 };
      colliders.push(dynamic.townGateCollider);
      locations.townGate = new THREE.Vector3(ax, base + 1.1, 0);
      // 岗亭（检票的岗位还有人守着）——西墙开真窗洞：看得见里头那个人
      const kx = 46.8, kz = 4.8, kb = g(kx, kz);
      B.add(GEO.box, M.plaster, kx, kb + 1.35, kz - 0.94, 0, 2.0, 2.7, 0.12);   // 南墙
      B.add(GEO.box, M.plaster, kx, kb + 1.35, kz + 0.94, 0, 2.0, 2.7, 0.12);   // 北墙
      B.add(GEO.box, M.plaster, kx + 0.94, kb + 1.35, kz, 0, 0.12, 2.7, 2.0);   // 东墙(背)
      B.add(GEO.box, M.plaster, kx - 0.94, kb + 0.55, kz, 0, 0.12, 1.1, 2.0);   // 西墙·窗下
      B.add(GEO.box, M.plaster, kx - 0.94, kb + 2.5, kz, 0, 0.12, 0.4, 2.0);    // 西墙·窗上
      B.add(GEO.box, M.plaster, kx - 0.94, kb + 1.65, kz - 0.78, 0, 0.12, 1.0, 0.44); // 窗侧
      B.add(GEO.box, M.plaster, kx - 0.94, kb + 1.65, kz + 0.78, 0, 0.12, 1.0, 0.44);
      B.add(GEO.box, M.slab, kx, kb + 0.06, kz, 0, 2.0, 0.14, 2.0);             // 地台
      B.add(GEO.box, M.roof, kx, kb + 2.85, kz, 0, 2.5, 0.16, 2.5);
      // 玻璃只掩了半扇——够一条手臂探进去
      B.add(GEO.box, M.crtGlass, kx - 0.97, kb + 1.65, kz + 0.28, 0, 0.04, 1.0, 0.6);
      B.add(GEO.box, M.wood, kx - 1.16, kb + 1.18, kz, 0, 0.3, 0.06, 1.2);      // 外窗台
      aabb(kx, kz, 2.0, 2.0, kb + 2.9);
      // 亭内一盏比外头都暖的灯——暖得不太对
      const kl = new THREE.PointLight(0xffc880, 7, 8, 2);
      kl.position.set(kx, kb + 2.2, kz);
      scene.add(kl);
      lights.push(kl);
      B.add(GEO.box, plateMat('岗亭 · 外来车辆止步', { w: 320, h: 64, bg: '#c8bfa8', fg: '#4a3428', font: 0.34 }), kx - 1.04, kb + 2.48, kz, 0, 0.04, 0.3, 1.3);
      locations.boothWindow = new THREE.Vector3(kx - 1.3, kb + 1.3, kz);
      patrols.boothWork = [kx, kz];
      // 木栅围栏（把牌坊两侧封住——进镇只此一门）
      const fence = (z0, z1) => {
        const n = Math.round(Math.abs(z1 - z0) / 2.2);
        for (let i = 0; i <= n; i++) {
          const z = z0 + (z1 - z0) * (i / n);
          B.add(GEO.cyl, M.woodDark, ax, g(ax, z) + 0.75, z, 0, 0.09, 1.5, 0.09);
        }
        for (const ry of [0.45, 1.05]) {
          const mid = (z0 + z1) / 2;
          B.add(GEO.box, M.woodDark, ax, g(ax, mid) + ry, mid, 0, 0.07, 0.09, Math.abs(z1 - z0) + 0.2);
        }
        aabb(ax, (z0 + z1) / 2, 0.5, Math.abs(z1 - z0), g(ax, (z0 + z1) / 2) + 1.6, { noSightBlock: true });
      };
      fence(4.4, 21);
      fence(-4.4, -21);
      reefRock(44, 24.5, 1.7); reefRock(44.5, -24, 1.9); reefRock(45, -28, 1.3);
      tree(43, 27, 1.1); tree(44, -31, 1.0);
    }

    // —— 告示墙（进镇第一眼：文书②规则告示）——
    {
      const nx = 41.6, nz = 3.6, base = g(nx, nz), th = 0.12;
      B.add(GEO.box, M.plaster, nx, base + 1.25, nz, th, 3.2, 2.1, 0.3);
      B.add(GEO.box, M.roof, nx, base + 2.42, nz, th, 3.5, 0.18, 0.7);
      aabb(nx, nz, 3.2, 0.4, base + 2.4);
      // 头牌与纸张要贴着「旋转后的墙面」摆——否则一端嵌进墙里
      const face = (ox, d) => [nx + ox * Math.cos(th) - d * Math.sin(th), nz - ox * Math.sin(th) - d * Math.cos(th)];
      const [hpx, hpz] = face(-0.1, 0.18);
      B.add(GEO.box, plateMat('蚀湾镇人民政府 告示', { w: 384, h: 56, bg: '#8c1616', fg: '#f0d28c', font: 0.44 }), hpx, base + 2.1, hpz, th, 1.9, 0.26, 0.04);
      // 三张告示纸（其中一张可读=文书②）
      for (const [ox, oy, rz2] of [[-0.95, 1.35, 0.05], [0.05, 1.3, -0.03], [0.95, 1.4, 0.08]]) {
        const [ppx, ppz] = face(ox, 0.17);
        const p = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.8), M.notice);
        p.position.set(ppx, base + oy, ppz);
        p.rotation.y = Math.PI + th;
        p.rotation.z = rz2;
        scene.add(p);
      }
      locations.ruleBoard = new THREE.Vector3(nx, base + 1.3, nz - 0.4);
    }

    // —— 街灯（水泥杆 + 搪瓷罩钠灯）——
    const lampPost = (x, z, lit = false) => {
      const base = g(x, z);
      B.add(GEO.cyl, M.stone, x, base + 2.3, z, 0, 0.11, 4.6, 0.14);
      B.add(GEO.cyl, M.ironDark, x, base + 4.62, z, 0, 0.05, 0.7, 0.05, 0, 0.9);
      B.add(GEO.cone, M.ironDark, x + 0.32, base + 4.78, z, 0, 0.3, 0.18, 0.3);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x554422, emissive: 0xffb45e, emissiveIntensity: lit ? 1.6 : 0.0 }));
      bulb.position.set(x + 0.32, base + 4.66, z);
      scene.add(bulb);
      circle(x, z, 0.18, base + 4.6, { noSightBlock: true });
      if (lit) {
        const pl = new THREE.PointLight(0xffb45e, 13, 14, 2);
        pl.position.set(x + 0.32, base + 4.4, z);
        scene.add(pl);
        lights.push(pl);
        const cone = makeLightCone(0xffb45e, 0.05, 0.5, 2.0, 4.4);
        cone.position.set(x + 0.32, base + 4.5, z);
        scene.add(cone);
      }
    };
    lampPost(48.5, -2.8, true);
    lampPost(38, -3.6, false);
    lampPost(30.5, 2.2, true);
    lampPost(21, -4.6, false);
    lampPost(13.5, -1.5, true);
    lampPost(30, -24, false);  // 海洋馆岔路
    lampPost(40, -38, true);   // 海洋馆门前

    // —— 杂货铺（卷帘门落了一半，里头灯亮着）——
    {
      const sx = 35, sz = 6.2;
      const s = house(sx, sz, 2, 5.6, 4.6, { plaster: true, empty: true, noDoor: true });
      // 挑出的店招
      B.add(GEO.box, plateMat('供销杂货', { w: 288, h: 80, bg: '#1e4a3a', fg: '#e8e0c8', font: 0.46 }), sx, s.base + 2.6, sz - 2.7, 0, 2.4, 0.55, 0.1);
      // 半落的卷帘门（门洞上半截）
      B.add(GEO.box, M.steel, sx, s.base + 1.95, sz - 2.35, 0, 1.3, 0.9, 0.08);
      // 货架 ×2 + 柜台 + 冰柜
      const sh = (lx, lz) => {
        const p = s.local(lx, 0, lz);
        B.add(GEO.box, M.wood, p.x, s.base + 1.2, p.z, 0, 1.8, 1.8, 0.4);
        aabb(p.x, p.z, 1.8, 0.45, s.base + 2.2);
        for (let i = 0; i < 6; i++) {
          B.add(GEO.box, i % 2 ? M.clothRed : M.salt, p.x - 0.6 + (i % 3) * 0.6, s.base + 0.8 + Math.floor(i / 3) * 0.55, p.z, i, 0.28, 0.3, 0.24);
        }
      };
      sh(-1.5, -1.2); sh(1.5, -1.2);
      const cp = s.local(0.8, 0, 1.2);
      B.add(GEO.box, M.woodDark, cp.x, s.base + 0.55, cp.z, 0, 2.0, 1.0, 0.7);
      aabb(cp.x, cp.z, 2.0, 0.7, s.base + 1.05, { noSightBlock: true });
      const ip = s.local(-1.6, 0, 1.3);
      B.add(GEO.box, M.steel, ip.x, s.base + 0.55, ip.z, 0, 1.3, 1.0, 0.75);
      aabb(ip.x, ip.z, 1.3, 0.75, s.base + 1.05, { noSightBlock: true });
      // 店里的白炽灯
      const sl = new THREE.PointLight(0xffd9a0, 8, 9, 2);
      const lp2 = s.local(0, 2.1, -0.4);
      sl.position.copy(lp2);
      scene.add(sl);
      lights.push(sl);
      locations.grocery = s.local(0, 0.6, 0.5);
    }

    // —— 录像厅（通宵场：里头只有雪花在放）——
    {
      const vx = 24.5, vz = 4.2, base = g(vx, vz);
      const w = 9, d = 7, h = 3.2, t = 0.35;
      B.add(GEO.box, M.stone, vx, base + 0.12, vz, 0, w + 0.7, 0.5, d + 0.7);
      B.add(GEO.box, M.wood, vx, base + 0.4, vz, 0, w - 0.3, 0.08, d - 0.3);
      // 四墙（南墙留门洞 1.4）
      B.add(GEO.box, M.plaster, vx, base + h / 2 + 0.3, vz + d / 2 - t / 2, 0, w, h, t);
      aabb(vx, vz + d / 2 - t / 2, w, t, base + h + 0.3);
      B.add(GEO.box, M.plaster, vx - w / 2 + t / 2, base + h / 2 + 0.3, vz, 0, t, h, d);
      aabb(vx - w / 2 + t / 2, vz, t, d, base + h + 0.3);
      B.add(GEO.box, M.plaster, vx + w / 2 - t / 2, base + h / 2 + 0.3, vz, 0, t, h, d);
      aabb(vx + w / 2 - t / 2, vz, t, d, base + h + 0.3);
      const segW = (w - 1.4) / 2;
      B.add(GEO.box, M.plaster, vx - (0.7 + segW / 2), base + h / 2 + 0.3, vz - d / 2 + t / 2, 0, segW, h, t);
      aabb(vx - (0.7 + segW / 2), vz - d / 2 + t / 2, segW, t, base + h + 0.3);
      B.add(GEO.box, M.plaster, vx + (0.7 + segW / 2), base + h / 2 + 0.3, vz - d / 2 + t / 2, 0, segW, h, t);
      aabb(vx + (0.7 + segW / 2), vz - d / 2 + t / 2, segW, t, base + h + 0.3);
      B.add(GEO.box, M.plaster, vx, base + h + 0.05, vz - d / 2 + t / 2, 0, 1.6, 0.5, t);
      B.add(GEO.box, M.roof, vx, base + h + 0.42, vz, 0, w + 0.9, 0.18, d + 0.9, 0, 0.04);
      // 半开的门
      B.add(GEO.box, M.woodDark, vx - 0.4, base + 1.3, vz - d / 2 + 0.25, 1.1, 0.9, 2.0, 0.06);
      // 门脸灯箱 + 海报
      B.add(GEO.box, plateMat('通宵录像', { w: 288, h: 88, bg: '#3a1a4a', fg: '#f0d28c', font: 0.46, emissive: 0.55 }), vx, base + h + 0.05, vz - d / 2 - 0.12, 0, 2.6, 0.6, 0.12);
      for (const ox of [-2.8, 2.8]) {
        const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.0), M.notice);
        poster.position.set(vx + ox, base + 1.6, vz - d / 2 - 0.02);
        poster.rotation.y = Math.PI;
        scene.add(poster);
      }
      // 长条凳四排（观众席——空的）
      for (let r = 0; r < 4; r++) {
        const bzr = vz - 1.6 + r * 1.1;
        B.add(GEO.box, M.wood, vx - 0.5, base + 0.42, bzr, 0, 5.0, 0.09, 0.35);
        B.add(GEO.box, M.woodDark, vx - 2.6, base + 0.21, bzr, 0, 0.3, 0.42, 0.3);
        B.add(GEO.box, M.woodDark, vx + 1.6, base + 0.21, bzr, 0, 0.3, 0.42, 0.3);
        aabb(vx - 0.5, bzr, 5.0, 0.4, base + 0.5, { noSightBlock: true });
      }
      // 大屏电视墙（雪花永远在放；没人看，也没人关）
      B.add(GEO.box, M.crtShell, vx + 3.6, base + 1.5, vz + 1.0, 0, 0.9, 1.4, 1.2);
      const sscreen = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.75),
        new THREE.MeshBasicMaterial({ color: 0x9aa4a8 }));
      sscreen.position.set(vx + 3.14, base + 1.6, vz + 1.0);
      sscreen.rotation.y = -Math.PI / 2;
      scene.add(sscreen);
      dynamic.staticScreens = dynamic.staticScreens ?? [];
      dynamic.staticScreens.push(sscreen);
      aabb(vx + 3.6, vz + 1.0, 0.95, 1.25, base + 2.3);
      // 屏幕的灰蓝光（真实光）
      const vl = new THREE.PointLight(0x9fb4c0, 7, 9, 2);
      vl.position.set(vx + 2.6, base + 1.7, vz + 1.0);
      scene.add(vl);
      lights.push(vl);
      locations.videoHall = new THREE.Vector3(vx, base + 0.8, vz);
      dynamic.videoHallRect = { minX: vx - w / 2, maxX: vx + w / 2, minZ: vz - d / 2, maxZ: vz + d / 2 };
    }

    // —— 大新照相馆（可进：门市 + 暗房——旧相机与镁光灯所在地）——
    {
      const vx = 14, vz = 2.8, base = g(vx, vz);
      const w = 6, d = 5.2, h = 3.0, t = 0.3;
      B.add(GEO.box, M.stone, vx, base + 0.12, vz, 0, w + 0.6, 0.5, d + 0.6);
      B.add(GEO.box, M.wood, vx, base + 0.4, vz, 0, w - 0.25, 0.08, d - 0.25);
      // 北墙/东西墙
      B.add(GEO.box, M.plaster, vx, base + h / 2 + 0.3, vz + d / 2 - t / 2, 0, w, h, t);
      aabb(vx, vz + d / 2 - t / 2, w, t, base + h + 0.3);
      B.add(GEO.box, M.plaster, vx - w / 2 + t / 2, base + h / 2 + 0.3, vz, 0, t, h, d);
      aabb(vx - w / 2 + t / 2, vz, t, d, base + h + 0.3);
      B.add(GEO.box, M.plaster, vx + w / 2 - t / 2, base + h / 2 + 0.3, vz, 0, t, h, d);
      aabb(vx + w / 2 - t / 2, vz, t, d, base + h + 0.3);
      // 南墙：西段门洞 1.1 + 东段橱窗
      const dcx = vx - 1.6, swz = vz - d / 2 + t / 2;
      B.add(GEO.box, M.plaster, vx - 2.72, base + h / 2 + 0.3, swz, 0, 0.55, h, t);
      aabb(vx - 2.72, swz, 0.55, t, base + h + 0.3);
      B.add(GEO.box, M.plaster, dcx, base + 2.55 + 0.3, swz, 0, 1.15, h - 2.25, t); // 门楣
      B.add(GEO.box, M.plaster, vx - 0.62, base + h / 2 + 0.3, swz, 0, 0.85, h, t);
      aabb(vx - 0.62, swz, 0.85, t, base + h + 0.3);
      B.add(GEO.box, M.plaster, vx + 1.35, base + 0.55, swz, 0, 3.1, 1.1 - 0.2, t);  // 橱窗下槛
      B.add(GEO.box, M.plaster, vx + 1.35, base + 2.65, swz, 0, 3.1, h - 2.3, t);    // 橱窗上楣
      B.add(GEO.box, M.plaster, vx + 2.86, base + h / 2 + 0.3, swz, 0, 0.28, h, t);
      aabb(vx + 2.86, swz, 0.28, t, base + h + 0.3);
      // 橱窗玻璃 + 展架全家福（每张脸上有指痕——只在近看时读出）
      const shopGlass = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.6, 0.04), M.shopGlass);
      shopGlass.position.set(vx + 1.35, base + 1.65, swz);
      scene.add(shopGlass);
      aabb(vx + 1.35, swz, 3.1, t, base + h + 0.3, { noSightBlock: true });
      B.add(GEO.box, M.veneer, vx + 1.35, base + 1.0, vz - d / 2 + 0.55, 0, 2.8, 0.08, 0.5);
      // 程序化老照片：合影人数不等，脸一律被拇指抹糊——近看才读得出
      const photoMat = (seed) => {
        const cv = document.createElement('canvas');
        cv.width = 96; cv.height = 128;
        const c = cv.getContext('2d');
        const rnd = (() => { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
        c.fillStyle = '#d8d0ba'; c.fillRect(0, 0, 96, 128);          // 相纸白边
        const ix = 9, iy = 9, iw = 78, ih = 100;
        const gr = c.createLinearGradient(0, iy, 0, iy + ih);
        gr.addColorStop(0, '#a89878'); gr.addColorStop(1, '#7c6c50');
        c.fillStyle = gr; c.fillRect(ix, iy, iw, ih);                // 影像区（室内背景）
        c.fillStyle = 'rgba(60,50,36,0.5)'; c.fillRect(ix, iy + ih * 0.62, iw, ih * 0.38);
        const n = 2 + Math.floor(rnd() * 3);
        for (let k = 0; k < n; k++) {
          const px = ix + 12 + (iw - 24) * (n === 1 ? 0.5 : k / (n - 1)) + (rnd() - 0.5) * 6;
          const py = iy + ih * 0.42 + (rnd() - 0.5) * 8;
          c.fillStyle = '#3a3228';                                    // 深色衣身
          c.beginPath(); c.ellipse(px, py + 26, 11, 20, 0, 0, Math.PI * 2); c.fill();
          c.fillStyle = '#c4b394';                                    // 头
          c.beginPath(); c.ellipse(px, py, 6.5, 8, 0, 0, Math.PI * 2); c.fill();
          // 拇指抹痕：脸区一道斜向糊光
          c.save(); c.globalAlpha = 0.75; c.fillStyle = '#b6a888';
          c.translate(px, py); c.rotate(0.5 + rnd() * 0.6);
          c.fillRect(-8, -3.5, 16, 7); c.restore();
        }
        c.fillStyle = 'rgba(40,32,20,0.25)';                          // 四角褪色
        c.fillRect(ix, iy, iw, 3); c.fillRect(ix, iy + ih - 3, iw, 3);
        const tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace;
        return new THREE.MeshBasicMaterial({ map: tex });
      };
      for (let i = 0; i < 5; i++) {
        const ph = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.44), photoMat(1013 + i * 77));
        ph.position.set(vx + 0.35 + i * 0.5, base + 1.35, vz - d / 2 + 0.42 - (i % 2) * 0.08);
        ph.rotation.y = Math.PI + (i - 2) * 0.06;
        scene.add(ph);
      }
      // 屋顶 + 门脸招牌
      B.add(GEO.box, M.roof, vx, base + h + 0.42, vz, 0, w + 0.8, 0.18, d + 0.8, 0, 0.03);
      B.add(GEO.box, plateMat('大新照相', { w: 288, h: 88, bg: '#173a4a', fg: '#f0d28c', font: 0.46, emissive: 0.5 }), vx, base + h + 0.02, vz - d / 2 - 0.12, 0, 2.5, 0.58, 0.12);
      // 半开的门
      B.add(GEO.box, M.woodDark, dcx - 0.32, base + 1.3, vz - d / 2 + 0.3, 1.05, 0.85, 2.0, 0.05);
      // 门市：柜台 + 背景布 + 道具椅 + 三脚架相机（道具点位）
      B.add(GEO.box, M.veneerRed, vx - 1.9, base + 0.55, vz + 0.2, 0, 1.1, 1.0, 2.2);
      aabb(vx - 1.9, vz + 0.2, 1.15, 2.25, base + 1.05, { noSightBlock: true });
      const bd = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.0), M.mural);
      bd.position.set(vx + 0.9, base + 1.45, vz + d / 2 - 0.35);
      bd.rotation.y = Math.PI;
      scene.add(bd);
      B.add(GEO.box, M.woodDark, vx + 0.9, base + 2.5, vz + d / 2 - 0.32, 0, 3.0, 0.1, 0.1);
      for (const ox of [-1.45, 1.45]) {
        B.add(GEO.box, M.curtain, vx + 0.9 + ox, base + 1.45, vz + d / 2 - 0.34, 0, 0.5, 2.1, 0.1);
      }
      B.add(GEO.box, M.woodDark, vx + 0.9, base + 0.28, vz + 1.0, 0.2, 0.45, 0.55, 0.45); // 道具方凳
      // 三脚架 + 旧相机（皮腔机；镁光灯泡一盒在暗房）
      for (const a of [0, 2.1, 4.2]) {
        B.add(GEO.cyl, M.woodDark, vx + 0.7 + Math.sin(a) * 0.3, base + 0.65, vz - 0.8 + Math.cos(a) * 0.3, 0, 0.04, 1.3, 0.04, 0, a === 0 ? 0.22 : a === 2.1 ? -0.15 : 0.1);
      }
      B.add(GEO.box, M.ironDark, vx + 0.7, base + 1.42, vz - 0.8, 0, 0.32, 0.3, 0.42);
      B.add(GEO.box, M.clothGrey, vx + 0.7, base + 1.42, vz - 0.5, 0, 0.26, 0.24, 0.2);
      circle(vx + 0.7, vz - 0.8, 0.3, base + 1.5, { noSightBlock: true });
      locations.photoCamera = new THREE.Vector3(vx + 0.7, base + 1.4, vz - 0.8);
      // 暗房（西北角小隔间：红灯、显影盘、挂绳底片）
      const kx = vx - 1.85, kz = vz + 1.6;
      // 东隔墙留 0.72 门洞（帘位在南端），墙体只封门洞以北
      B.add(GEO.box, M.plaster, kx + 1.05, base + 1.5 + 0.3, kz + 0.525, 0, 0.16, 3.0, 1.45);
      aabb(kx + 1.05, kz + 0.525, 0.16, 1.45, base + h + 0.3);
      B.add(GEO.box, M.plaster, kx + 0.2, base + 1.5 + 0.3, kz - 1.0, 0, 1.9, 3.0, 0.16);
      aabb(kx + 0.2, kz - 1.0, 1.9, 0.16, base + h + 0.3);
      // 暗房门帘（可穿过，只挡视线）
      B.add(GEO.box, M.curtain, kx + 1.05, base + 1.15, kz - 0.56, 0, 0.14, 1.9, 0.72);
      B.add(GEO.box, M.veneer, kx - 0.3, base + 0.5, kz + 0.6, 0, 1.2, 0.9, 0.6);
      aabb(kx - 0.3, kz + 0.6, 1.25, 0.65, base + 1.0, { noSightBlock: true });
      for (let i = 0; i < 3; i++) {
        B.add(GEO.box, M.steel, kx - 0.6 + i * 0.34, base + 0.97, kz + 0.55, 0, 0.28, 0.05, 0.4);
      }
      B.add(GEO.box, M.ironDark, kx - 0.2, base + 2.2, kz + 0.2, 0, 1.6, 0.02, 0.02);
      for (let i = 0; i < 4; i++) {
        const neg = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.4),
          new THREE.MeshBasicMaterial({ color: 0x2a2e30 }));
        neg.position.set(kx - 0.75 + i * 0.38, base + 1.98, kz + 0.2);
        scene.add(neg);
      }
      const rl = new THREE.PointLight(0xc42818, 5, 5, 2);
      rl.position.set(kx, base + 2.3, kz + 0.4);
      scene.add(rl);
      lights.push(rl);
      locations.darkroom = new THREE.Vector3(kx - 0.3, base + 1.0, kz + 0.6);
      // 门市顶灯
      const sl2 = new THREE.PointLight(0xffe6c0, 7, 9, 2);
      sl2.position.set(vx + 0.3, base + 2.5, vz - 0.4);
      scene.add(sl2);
      lights.push(sl2);
      locations.photoStudio = new THREE.Vector3(vx, base + 0.8, vz - 0.6);
      locations.photoWindow = new THREE.Vector3(vx + 1.35, base + 1.3, vz - d / 2 - 0.6);
      dynamic.photoStudioRect = { minX: vx - w / 2, maxX: vx + w / 2, minZ: vz - d / 2, maxZ: vz + d / 2 };
    }

    // —— 电话亭（磁卡机；路过时它会响一次）——
    {
      const px = 29, pz = -6.5, base = g(px, pz);
      for (const [ox, oz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
        B.add(GEO.box, M.ironDark, px + ox, base + 1.25, pz + oz, 0, 0.09, 2.5, 0.09);
      }
      B.add(GEO.box, M.ironDark, px, base + 2.55, pz, 0, 1.3, 0.14, 1.3);
      B.add(GEO.box, plateMat('磁卡电话', { w: 224, h: 56, bg: '#1e4a3a', fg: '#e8e0c8', font: 0.44 }), px, base + 2.36, pz - 0.56, 0, 1.05, 0.24, 0.05);
      // 水泥基座 + 下裙板（铁皮）——不然远看像浮空的玻璃箱
      B.add(GEO.box, M.slab, px, base + 0.05, pz, 0, 1.45, 0.14, 1.45);
      B.add(GEO.box, M.ironDark, px, base + 0.55, pz + 0.56, 0, 1.05, 0.86, 0.05);
      B.add(GEO.box, M.ironDark, px - 0.56, base + 0.55, pz, 0, 0.05, 0.86, 1.05);
      B.add(GEO.box, M.ironDark, px + 0.56, base + 0.55, pz, 0, 0.05, 0.86, 1.05);
      // 三面玻璃（北面开门）
      B.add(GEO.box, M.crtGlass, px, base + 1.6, pz + 0.53, 0, 1.0, 1.7, 0.05);
      B.add(GEO.box, M.crtGlass, px - 0.53, base + 1.6, pz, 0, 0.05, 1.7, 1.0);
      B.add(GEO.box, M.crtGlass, px + 0.53, base + 1.6, pz, 0, 0.05, 1.7, 1.0);
      aabb(px, pz + 0.53, 1.1, 0.15, base + 2.5, { noSightBlock: true });
      aabb(px - 0.53, pz, 0.15, 1.1, base + 2.5, { noSightBlock: true });
      aabb(px + 0.53, pz, 0.15, 1.1, base + 2.5, { noSightBlock: true });
      // 话机 + 搁板
      B.add(GEO.box, M.steel, px, base + 1.3, pz + 0.35, 0, 0.5, 0.4, 0.18);
      B.add(GEO.box, M.ironDark, px, base + 1.42, pz + 0.32, 0, 0.3, 0.12, 0.1);
      // 亭内顶灯
      const pl = new THREE.PointLight(0xdfe8d8, 5, 6, 2);
      pl.position.set(px, base + 2.3, pz);
      scene.add(pl);
      lights.push(pl);
      locations.phoneBooth = new THREE.Vector3(px, base + 1.3, pz - 0.7);
    }

    // —— 十字街心路牌 ——
    {
      const px = 10.5, pz = -4.5, base = g(px, pz);
      B.add(GEO.cyl, M.woodDark, px, base + 1.5, pz, 0, 0.1, 3.0, 0.1);
      circle(px, pz, 0.16, base + 3.0, { noSightBlock: true });
      const arrow = (txt, y, ry) => {
        B.add(GEO.box, plateMat(txt, { w: 288, h: 56, bg: '#2e3438', fg: '#d8cfb8', font: 0.42 }), px + Math.sin(ry) * 0.5, base + y, pz + Math.cos(ry) * 0.5, ry, 1.1, 0.24, 0.05);
      };
      arrow('← 镇口车站', 2.7, Math.PI / 2);
      arrow('南方大酒店 →', 2.4, 0.1);
      arrow('海洋馆 →', 2.1, -0.7);
      arrow('堤门 · 滩涂 →', 1.8, Math.PI);
      arrow('家属区 →', 1.5, -Math.PI / 2);
    }

    // —— 家属楼（水产公司旧宿舍两栋：可进可探——住户里外间、外廊、外挂楼梯、天台）——
    // 外廊朝南（-z），外挂水泥楼梯在东山墙外；每栋两户可进（1F 一户 + 2F 一户），
    // 其余户门落锁、锁眼塞红纸。核册之夜「人走灯不灭」：可进户的灯亮着，人不在。
    function dormBlock(bx, bz, name, opts = {}) {
      const W = 16, D = 6.0, FH = 2.7, t = 0.24;
      const base = g(bx, bz);
      const f1 = base + 0.32, f2 = f1 + FH, roofY = f2 + FH;
      const bayXs = [-6.4, -3.2, 0, 3.2, 6.4];
      const open1 = opts.open1 ?? 1;   // 1F 可进开间
      const open2 = opts.open2 ?? 2;   // 2F 可进开间
      const surnames = opts.surnames ?? ['周', '陈', '林', '黄', '吴'];
      // 台基 + 1F 楼板
      B.add(GEO.box, M.stone, bx, base + 0.14, bz, 0, W + 0.8, 0.44, D + 0.8);
      B.add(GEO.box, M.slab, bx, f1 - 0.03, bz, 0, W - 0.2, 0.08, D - 0.2);
      addPatch(bx, bz, 0, W - 0.4, D - 0.4, f1, f1);
      // 北墙（整面，双层高）+ 外侧暗窗内衬
      B.add(GEO.box, M.plaster, bx, base + FH + 0.34, bz + D / 2 - t / 2, 0, W, FH * 2 + 0.4, t);
      aabb(bx, bz + D / 2 - t / 2, W, t, roofY + 0.4);
      for (let f = 0; f < 2; f++) {
        for (let i = 0; i < 5; i++) {
          B.add(GEO.box, M.ironDark, bx + bayXs[i] + 0.3, (f ? f2 : f1) + 1.5, bz + D / 2 + 0.02, 0, 1.0, 1.1, 0.08);
        }
      }
      // 东西山墙（双层高）
      for (const sx of [-W / 2 + t / 2, W / 2 - t / 2]) {
        B.add(GEO.box, M.plaster, bx + sx, base + FH + 0.34, bz, 0, t, FH * 2 + 0.4, D);
        aabb(bx + sx, bz, t, D, roofY + 0.4);
      }
      // 2F 楼板 + 天台板
      B.add(GEO.box, M.slab, bx, f2 - 0.09, bz, 0, W, 0.18, D);
      addPatch(bx, bz, 0, W - 0.4, D - 0.4, f2, f2);
      B.add(GEO.box, M.slab, bx, roofY - 0.09, bz, 0, W + 0.3, 0.18, D + 0.3);
      // 南墙：每开间「门洞+窗洞」，锁户实门+红纸，开户半开门
      const sz2 = bz - D / 2 + t / 2;
      const doorH2 = 2.0;
      for (let f = 0; f < 2; f++) {
        const fy = f === 0 ? f1 : f2;
        const openBay = f === 0 ? open1 : open2;
        for (let i = 0; i < 5; i++) {
          const cxb = bx + bayXs[i];
          const dcx = cxb - 0.8, wcx = cxb + 0.85; // 门中心/窗中心
          const wall = (wx, ww, wy, wh) => {
            B.add(GEO.box, M.plaster, wx, fy + wy, sz2, 0, ww, wh, t);
          };
          wall(cxb - 1.44, 0.33, FH / 2, FH);                    // 左边条
          wall(cxb + 0.03, 0.68, FH / 2, FH);                    // 门窗之间
          wall(cxb + 1.48, 0.25, FH / 2, FH);                    // 右边条
          wall(dcx, 0.95, doorH2 + (FH - doorH2) / 2, FH - doorH2); // 门楣
          wall(wcx, 1.0, 0.45, 0.9);                             // 窗下槛
          wall(wcx, 1.0, 2.35, FH - 2.35 + 0.35);                // 窗楣
          // 门框
          B.add(GEO.box, M.woodDark, dcx - 0.53, fy + doorH2 / 2, sz2, 0, 0.1, doorH2, t + 0.06);
          B.add(GEO.box, M.woodDark, dcx + 0.53, fy + doorH2 / 2, sz2, 0, 0.1, doorH2, t + 0.06);
          // 户牌（红漆姓氏，新描的）+ 门牌号
          B.add(GEO.box, plateMat(surnames[i], { w: 64, h: 64, bg: '#d8d0bc', fg: '#8c1616', font: 0.6 }), dcx + 0.72, fy + 1.7, sz2 - t / 2 - 0.02, 0, 0.22, 0.22, 0.04);
          B.add(GEO.box, plateMat(`${f + 1}0${i + 1}`, { w: 96, h: 48, bg: '#2e3438', fg: '#d8cfb8', font: 0.5 }), dcx, fy + doorH2 + 0.22, sz2 - t / 2 - 0.02, 0, 0.4, 0.18, 0.04);
          const isOpen = i === openBay;
          if (isOpen) {
            // 半开的旧木门（可进）
            B.add(GEO.box, M.wood, dcx - 0.28, fy + doorH2 / 2, sz2 - 0.36, 1.0, 0.86, doorH2 - 0.05, 0.05);
            // 窗帘拉严，只透一线灯
            B.add(GEO.box, M.ironDark, wcx, fy + 1.4, sz2 - 0.03, 0, 0.96, 1.0, 0.06);
            const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.92),
              new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
            slit.position.set(wcx + 0.18, fy + 1.42, bz - D / 2 - 0.03);
            slit.rotation.y = Math.PI;
            scene.add(slit);
            aabb(wcx, sz2, 1.05, t, fy + 2.4);
            // 门口煤炉
            B.add(GEO.cyl, M.ironDark, dcx - 1.1, fy + 0.24, sz2 - 0.75, 0, 0.2, 0.48, 0.2);
          } else {
            // 落锁实门 + 锁眼红纸
            B.add(GEO.box, M.woodDark, dcx, fy + doorH2 / 2, sz2, 0, 0.95, doorH2, t + 0.02);
            aabb(dcx, sz2, 1.0, t + 0.05, fy + doorH2 + 0.4);
            B.add(GEO.box, M.clothRed, dcx + 0.3, fy + 0.95, sz2 - t / 2 - 0.02, 0.2, 0.05, 0.09, 0.02);
            // 暗窗
            B.add(GEO.box, M.ironDark, wcx, fy + 1.4, sz2 - 0.03, 0, 0.96, 1.0, 0.06);
            aabb(wcx, sz2, 1.05, t, fy + 2.4);
          }
          // 洞口两侧墙的碰撞（细分而非整面，门洞可通行）
          aabb(cxb - 1.44, sz2, 0.33, t, fy + FH);
          aabb(cxb + 0.03, sz2, 0.68, t, fy + FH);
          aabb(cxb + 1.48, sz2, 0.25, t, fy + FH);
        }
      }
      // 南向外廊：1F 走台基，2F 挑廊 + 栏杆
      const gz = bz - D / 2 - 0.75; // 外廊中心
      B.add(GEO.box, M.stone, bx + 1.3, f1 - 0.08, gz, 0, W + 2.9, 0.18, 1.5);
      addPatch(bx + 1.3, gz, 0, W + 2.9, 1.5, f1, f1);
      B.add(GEO.box, M.stone, bx + 1.3, f2 - 0.08, gz, 0, W + 2.9, 0.2, 1.5);
      addPatch(bx + 1.3, gz, 0, W + 2.9, 1.5, f2, f2);
      const railZ = bz - D / 2 - 1.46;
      for (let i = 0; i <= 18; i++) {
        B.add(GEO.cyl, M.ironDark, bx - W / 2 + i * ((W + 2.6) / 18), f2 + 0.5, railZ, 0, 0.04, 1.0, 0.04);
      }
      B.add(GEO.box, M.ironDark, bx + 1.3, f2 + 0.98, railZ, 0, W + 2.6, 0.06, 0.06);
      colliders.push({ minX: bx - W / 2 - 0.1, maxX: bx + W / 2 + 2.6, minZ: railZ - 0.08, maxZ: railZ + 0.08, minY: f2, maxY: f2 + 1.1, noSightBlock: true });
      // 2F 外廊西端封头
      colliders.push({ minX: bx - W / 2 - 0.1, maxX: bx - W / 2 + 0.02, minZ: railZ, maxZ: bz - D / 2, minY: f2, maxY: f2 + 1.1, noSightBlock: true });
      // —— 外挂水泥楼梯（东山墙外，直跑上 2F 外廊）——
      const stX = bx + W / 2 + 0.75;   // 楼梯中线
      {
        const zTop = bz - D / 2 - 0.75, zBot = bz + 3.0;
        const len = zBot - zTop;
        addPatch(stX, (zTop + zBot) / 2, Math.PI / 2, len, 1.2, f2 + 0.02, base);
        const steps = 13;
        for (let s = 0; s < steps; s++) {
          const tt = s / (steps - 1);
          const zc = zBot + (zTop - zBot) * tt;
          const hh = base + (f2 + 0.02 - base) * tt;
          B.add(GEO.box, M.slab, stX, hh - 0.09, zc, 0, 1.24, 0.2, len / steps + 0.12);
        }
        // 外侧扶手 + 防坠碰撞
        for (let i = 0; i <= 6; i++) {
          const tt = i / 6;
          B.add(GEO.cyl, M.ironDark, stX + 0.62, base + (f2 - base) * tt + 0.55, zBot + (zTop - zBot) * tt, 0, 0.04, 1.0, 0.04);
        }
        colliders.push({ minX: stX + 0.55, maxX: stX + 0.7, minZ: zTop - 0.2, maxZ: zBot + 0.2, minY: base, maxY: roofY + 0.6, noSightBlock: true });
      }
      // —— 天台（可选）：第二跑楼梯 + 女儿墙 + 水塔/晾衣 ——
      if (opts.roof) {
        const st2X = stX + 1.3;
        const zBot2 = bz - D / 2 - 0.75, zTop2 = bz + 2.55;
        addPatch(st2X, (zBot2 + zTop2) / 2, Math.PI / 2, zTop2 - zBot2, 1.2, f2 + 0.02, roofY + 0.02);
        const steps2 = 13;
        for (let s = 0; s < steps2; s++) {
          const tt = s / (steps2 - 1);
          const zc = zBot2 + (zTop2 - zBot2) * tt;
          const hh = f2 + 0.02 + (roofY - f2) * tt;
          B.add(GEO.box, M.slab, st2X, hh - 0.09, zc, 0, 1.24, 0.2, (zTop2 - zBot2) / steps2 + 0.12);
        }
        colliders.push({ minX: st2X + 0.55, maxX: st2X + 0.7, minZ: zBot2 - 0.2, maxZ: zTop2 + 0.2, minY: f2, maxY: roofY + 1.2, noSightBlock: true });
        // 顶端小平台接天台
        addPatch(bx + W / 2 + 1.4, bz + 2.85, 0, 3.2, 1.3, roofY + 0.02, roofY + 0.02);
        B.add(GEO.box, M.slab, bx + W / 2 + 1.4, roofY - 0.07, bz + 2.85, 0, 3.2, 0.18, 1.3);
        addPatch(bx, bz, 0, W - 0.2, D - 0.2, roofY + 0.02, roofY + 0.02);
        // 女儿墙（南边东端留口接平台）
        const pp = (cx, cz, w, d) => {
          B.add(GEO.box, M.plaster, cx, roofY + 0.26, cz, 0, w, 0.52, d);
          colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, minY: roofY, maxY: roofY + 0.55, noSightBlock: true });
        };
        pp(bx, bz + D / 2 - 0.09, W, 0.18);
        pp(bx - W / 2 + 0.09, bz, 0.18, D);
        pp(bx + W / 2 - 0.09, bz - 1.4, 0.18, D - 2.8); // 东侧留口（接楼梯平台）
        pp(bx, bz - D / 2 + 0.09, W, 0.18);
        // 水塔 + 天线 + 晾衣绳
        for (const [lx, lz] of [[-0.5, 0.5], [0.5, 0.5], [-0.5, -0.5], [0.5, -0.5]]) {
          B.add(GEO.cyl, M.ironDark, bx - 4 + lx, roofY + 0.6, bz + lz, 0, 0.07, 1.2, 0.07);
        }
        B.add(GEO.cyl, M.steel, bx - 4, roofY + 1.75, bz, 0, 0.9, 1.3, 0.9);
        circle(bx - 4, bz, 0.95, roofY + 2.4);
        B.add(GEO.cyl, M.ironDark, bx + 3, roofY + 1.1, bz + 1, 0, 0.04, 2.2, 0.04);
        B.add(GEO.box, M.ironDark, bx + 3, roofY + 2.1, bz + 1, 0.5, 1.4, 0.04, 0.04);
        B.add(GEO.box, M.ironDark, bx, roofY + 1.55, bz - 0.8, 0, 6.5, 0.03, 0.03);
        for (let i = 0; i < 3; i++) {
          const c = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.1), i % 2 ? M.clothGrey : M.clothShirt);
          c.position.set(bx - 2.4 + i * 2.2, roofY + 1.0, bz - 0.8);
          scene.add(c);
        }
        locations[`dormRoof${name === '一栋' ? 1 : 2}`] = new THREE.Vector3(bx, roofY + 0.5, bz);
      }
      // 栋号牌（西山墙）
      B.add(GEO.box, plateMat(`水产 · ${name}`, { w: 224, h: 72, bg: '#2e3438', fg: '#d8cfb8', font: 0.42 }), bx - W / 2 - 0.03, f2 + 0.6, bz - 1, Math.PI / 2, 1.5, 0.5, 0.05);
      return { base, f1, f2, roofY, bayXs, unitDoorZ: sz2 };
    }

    /** 住户内间外间（外间：八仙桌/灶/CRT；里间：床/五斗橱）。variant 决定叙事细节 */
    function dormUnit(bk, bx, bz, bayI, floor, variant) {
      const cxb = bx + bk.bayXs[bayI];
      const fy = floor === 1 ? bk.f1 : bk.f2;
      const t = 0.18;
      // 木地板
      B.add(GEO.box, M.wood, cxb, fy + 0.02, bz + 0.12, 0, 3.0, 0.05, 5.2);
      // 两侧隔户墙
      for (const sx of [-1.6, 1.6]) {
        B.add(GEO.box, M.plaster, cxb + sx, fy + 1.32, bz + 0.12, 0, t, 2.6, 5.3);
        aabb(cxb + sx, bz + 0.12, t, 5.3, fy + 2.7);
      }
      // 里外间隔断（门洞在西侧）
      const pz = bz + 0.55;
      B.add(GEO.box, M.plaster, cxb + 0.43, fy + 1.32, pz, 0, 2.34, 2.6, t);
      aabb(cxb + 0.43, pz, 2.34, t, fy + 2.7);
      B.add(GEO.box, M.plaster, cxb - 1.17, fy + 2.35, pz, 0, 0.86, 0.6, t); // 内门楣
      B.add(GEO.box, M.woodDark, cxb - 0.72, fy + 1.0, pz, 0, 0.08, 2.0, t + 0.05);
      // —— 外间（南）——
      // 八仙桌 + 条凳
      B.add(GEO.box, M.wood, cxb - 0.4, fy + 0.76, bz - 1.5, 0, 1.15, 0.07, 1.15);
      B.add(GEO.box, M.woodDark, cxb - 0.4, fy + 0.38, bz - 1.5, 0, 0.9, 0.72, 0.08);
      B.add(GEO.box, M.woodDark, cxb - 0.4, fy + 0.38, bz - 1.5, Math.PI / 2, 0.9, 0.72, 0.08);
      aabb(cxb - 0.4, bz - 1.5, 1.2, 1.2, fy + 0.85, { noSightBlock: true });
      B.add(GEO.box, M.wood, cxb - 0.4, fy + 0.24, bz - 2.35, 0, 1.2, 0.06, 0.28);
      // 碗筷（摆好没动）
      const bowlN = variant === 'lone' ? 1 : 3;
      for (let i = 0; i < bowlN; i++) {
        B.add(GEO.cyl, M.clothShirt, cxb - 0.7 + i * 0.32, fy + 0.83, bz - 1.3 - (i % 2) * 0.35, 0, 0.09, 0.07, 0.09);
      }
      // 灶台（东北角）+ 铁锅 + 水缸
      B.add(GEO.box, M.stone, cxb + 1.05, fy + 0.42, bz - 0.1, 0, 0.9, 0.8, 0.75);
      aabb(cxb + 1.05, bz - 0.1, 0.95, 0.8, fy + 0.9, { noSightBlock: true });
      B.add(GEO.cyl, M.ironDark, cxb + 1.05, fy + 0.86, bz - 0.1, 0, 0.28, 0.12, 0.28);
      B.add(GEO.cyl, M.wood, cxb + 1.15, fy + 0.4, bz - 1.15, 0, 0.32, 0.75, 0.32);
      // 挂历（撕到十一月三日）
      B.add(GEO.box, plateMat('二〇〇一年十一月', { w: 160, h: 224, bg: '#e6e0d0', fg: '#33291e', font: 0.16 }), cxb - 1.48, fy + 1.7, bz - 1.2, Math.PI / 2, 0.5, 0.7, 0.04);
      // CRT 电视（矮柜上）
      B.add(GEO.box, M.veneer, cxb + 1.05, fy + 0.3, bz - 2.35, 0, 0.9, 0.55, 0.5);
      B.add(GEO.box, M.crtShell, cxb + 1.05, fy + 0.85, bz - 2.35, 0, 0.62, 0.52, 0.5);
      aabb(cxb + 1.05, bz - 2.35, 0.95, 0.55, fy + 1.15, { noSightBlock: true });
      if (variant === 'lit') {
        const sscreen = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.4),
          new THREE.MeshBasicMaterial({ color: 0x9aa4a8 }));
        sscreen.position.set(cxb + 1.05, fy + 0.86, bz - 2.09);
        scene.add(sscreen);
        dynamic.staticScreens = dynamic.staticScreens ?? [];
        dynamic.staticScreens.push(sscreen);
      }
      // —— 里间（北）——
      B.add(GEO.box, M.woodDark, cxb - 0.55, fy + 0.24, bz + 1.9, 0, 1.95, 0.42, 1.15);
      B.add(GEO.box, variant === 'lit' ? M.clothGrey : M.clothShirt, cxb - 0.55, fy + 0.52, bz + 1.9, variant === 'lit' ? 0.35 : 0, 1.85, 0.18, 1.05);
      aabb(cxb - 0.55, bz + 1.9, 2.0, 1.2, fy + 0.7, { noSightBlock: true });
      B.add(GEO.box, M.veneer, cxb + 1.1, fy + 0.65, bz + 2.15, 0, 0.75, 1.25, 0.5);   // 五斗橱
      aabb(cxb + 1.1, bz + 2.15, 0.8, 0.55, fy + 1.3, { noSightBlock: true });
      B.add(GEO.box, M.woodDark, cxb + 1.1, fy + 0.3, bz + 1.15, 0, 0.8, 0.55, 0.55);  // 樟木箱
      // 一盏白炽灯（人走灯不灭）
      const ul = new THREE.PointLight(0xffd9a0, variant === 'lit' ? 9 : 6, 8, 2);
      ul.position.set(cxb, fy + 2.25, bz - 0.6);
      scene.add(ul);
      lights.push(ul);
      if (variant === 'lit') {
        // 203：搪瓷缸还温着（一缕细汽），一把椅子倒着
        B.add(GEO.cyl, M.clothShirt, cxb - 0.15, fy + 0.86, bz - 1.62, 0, 0.07, 0.13, 0.07);
        makeSmoke(cxb - 0.15, fy + 0.95, bz - 1.62, { count: 8, rise: 0.7, spread: 0.05, size: 0.1, opacity: 0.2 });
        B.add(GEO.box, M.woodDark, cxb + 0.5, fy + 0.2, bz - 2.0, 0.7, 0.42, 0.8, 0.42, 0, Math.PI / 2 - 0.12);
      }
      if (variant === 'book' || variant === 'circle') {
        // 户口簿摊在桌上
        B.add(GEO.box, M.clothShirt, cxb - 0.4, fy + 0.82, bz - 1.5, 0.3, 0.3, 0.025, 0.22);
        B.add(GEO.box, M.clothRed, cxb - 0.28, fy + 0.85, bz - 1.42, 0.3, 0.06, 0.015, 0.06);
      }
      if (variant === 'sew') {
        // 缝纫机 + 叠好的素白布条
        B.add(GEO.box, M.ironDark, cxb - 1.1, fy + 0.55, bz - 2.2, 0, 0.7, 0.09, 0.45);
        B.add(GEO.box, M.ironDark, cxb - 1.1, fy + 0.25, bz - 2.2, 0, 0.55, 0.5, 0.35);
        B.add(GEO.box, M.crtShell, cxb - 1.1, fy + 0.72, bz - 2.28, 0, 0.3, 0.26, 0.2);
        aabb(cxb - 1.1, bz - 2.2, 0.75, 0.5, fy + 0.9, { noSightBlock: true });
        for (let i = 0; i < 3; i++) {
          B.add(GEO.box, M.clothShirt, cxb + 1.1, fy + 1.33 + i * 0.05, bz + 2.15, 0.1 * i, 0.5, 0.04, 0.3);
        }
      }
      return { cxb, fy };
    }

    {
      const b1 = dormBlock(-37, 26, '一栋', { open1: 1, open2: 2, roof: true, surnames: ['周', '陈', '林', '黄', '吴'] });
      const b2 = dormBlock(-37, 14.2, '二栋', { open1: 3, open2: 0, surnames: ['郑', '周', '苏', '柯', '连'] });
      // 一栋 102：桌上户口簿（打勾）；里间五斗橱=电池点位
      const u102 = dormUnit(b1, -37, 26, 1, 1, 'book');
      locations.dormBook1 = new THREE.Vector3(u102.cxb - 0.4, u102.fy + 0.85, 26 - 1.5);
      locations.dormBattery = new THREE.Vector3(u102.cxb + 1.1, u102.fy + 1.35, 26 + 2.15);
      // 一栋 203：灯亮着的那扇窗——人不在
      const u203 = dormUnit(b1, -37, 26, 2, 2, 'lit');
      dynamic.dorm203 = { x: u203.cxb, z: 26, y: u203.fy };
      // 203 的窗没拉严——整面亮着（外景地标：灯后头没有人影）
      const litW = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 1.02),
        new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
      litW.position.set(-37 + 0.85, b1.f2 + 1.42, 26 - 3.0 - 0.04);
      litW.rotation.y = Math.PI;
      scene.add(litW);
      // 二栋 104：只摆一副碗筷 + 发条闹钟点位
      const u104 = dormUnit(b2, -37, 14.2, 3, 1, 'lone');
      locations.dormClock = new THREE.Vector3(u104.cxb + 1.1, u104.fy + 1.35, 14.2 + 2.15);
      // 二栋 201：户口簿（红圈）+ 缝纫机白布
      const u201 = dormUnit(b2, -37, 14.2, 0, 2, 'sew');
      locations.dormBook2 = new THREE.Vector3(u201.cxb + 1.1, u201.fy + 1.4, 14.2 + 2.15);
      // 弄堂：石板 + 公用水龙头 + 煤球堆 + 自行车
      laySlabPath([[-45, 20], [-29, 20]], 1.3);
      const ay = g(-43, 20);
      B.add(GEO.cyl, M.stone, -43, ay + 0.3, 20, 0, 0.5, 0.6, 0.5);
      B.add(GEO.cyl, M.ironDark, -43, ay + 0.75, 20, 0, 0.05, 0.4, 0.05);
      for (let i = 0; i < 8; i++) {
        B.add(GEO.cyl, M.ironDark, -31 + (i % 4) * 0.28, ay + 0.1 + Math.floor(i / 4) * 0.18, 19.4 + (i % 2) * 0.24, 0, 0.11, 0.18, 0.11);
      }
      for (const ox of [-34.5, -33.6]) {
        for (const wz of [-0.5, 0.5]) {
          const wl = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.03, 6, 14), M.ironDark);
          wl.position.set(ox, ay + 0.34, 20.4 + wz);
          wl.rotation.y = Math.PI / 2 + 0.15;
          scene.add(wl);
        }
        B.add(GEO.box, M.ironDark, ox, ay + 0.62, 20.4, 0.15, 0.05, 0.06, 1.1, 0, 0.25);
      }
      // 弄堂晾衣绳（夜里没人收）
      for (const [ox, oz] of [[-41, 20.6], [-33, 19.6]]) {
        B.add(GEO.cyl, M.woodDark, ox - 2.2, ay + 1.25, oz, 0, 0.07, 2.5, 0.07);
        B.add(GEO.cyl, M.woodDark, ox + 2.2, ay + 1.25, oz, 0, 0.07, 2.5, 0.07);
        B.add(GEO.box, M.ironDark, ox, ay + 2.35, oz, 0, 4.4, 0.03, 0.03);
        for (let i = 0; i < 3; i++) {
          const c = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.8), i % 2 ? M.clothGrey : M.clothShirt);
          c.position.set(ox - 1.2 + i * 1.2, ay + 1.92, oz);
          scene.add(c);
        }
      }
      locations.dorm = new THREE.Vector3(-37, ay + 0.8, 20);
    }
  }

  // ================= ③ 镇中心 · 市场 · 广播站 =================
  {
    // 民居
    house(-14, 14, 1, 5.4, 4.4, { plaster: true });
    house(10, 16, 0, 5.0, 4.2, { plaster: true });
    house(-24, -6, 1, 4.8, 4.0, { plaster: true });
    house(6, -26, 2, 5.6, 4.4, { plaster: true });
    house(-10, -30, 0, 4.6, 3.8);
    // 水井
    const wb = g(2, 2);
    B.add(GEO.cyl, M.stone, 2, wb + 0.45, 2, 0, 1.7, 0.9, 1.7);
    B.add(GEO.cyl, M.ironDark, 2, wb + 0.95, 2, 0, 1.45, 0.1, 1.45);
    B.add(GEO.cyl, M.woodDark, 1.2, wb + 1.5, 2, 0, 0.1, 2.2, 0.1);
    B.add(GEO.cyl, M.woodDark, 2.8, wb + 1.5, 2, 0, 0.1, 2.2, 0.1);
    B.add(GEO.box, M.woodDark, 2, wb + 2.5, 2, 0, 1.9, 0.12, 0.12);
    circle(2, 2, 1.0, wb + 1.0);
    // 祠堂废屋（塌了一半）
    {
      const rx = -22, rz = -34, base = g(rx, rz);
      B.add(GEO.box, M.plaster, rx - 2.4, base + 1.0, rz, 0, 0.4, 2.0, 5.5);
      aabb(rx - 2.4, rz, 0.4, 5.5, base + 2.0);
      B.add(GEO.box, M.plaster, rx, base + 0.75, rz - 2.6, 0, 5.0, 1.5, 0.4);
      aabb(rx, rz - 2.6, 5.0, 0.4, base + 1.5);
      B.add(GEO.box, M.roof, rx + 0.5, base + 0.9, rz + 0.5, 0.4, 4.4, 0.16, 3.6, 0.5, 0.22);
      B.add(GEO.box, M.wood, rx + 1.8, base + 0.4, rz + 1.5, 0.9, 0.3, 1.3, 2.8, 0, 0.5);
      B.add(GEO.box, M.wood, rx - 1, base + 0.3, rz + 2, 1.4, 2.2, 0.2, 0.3, 0.4, 0);
    }
    // 广播站
    {
      const hut = house(32, -18, 3, 4.2, 3.6, { empty: true });
      // 天线杆
      const base = g(34, -18);
      B.add(GEO.cyl, M.ironDark, 34, base + 5.5, -20.5, 0, 0.09, 11, 0.09);
      B.add(GEO.box, M.ironDark, 34, base + 9.5, -20.5, 0.6, 2.4, 0.06, 0.06);
      B.add(GEO.box, M.ironDark, 34, base + 8.6, -20.5, 1.2, 1.7, 0.06, 0.06);
      // 收音机台(带发光刻度盘)
      const rp = hut.local(0.6, 0.95, -0.9);
      B.add(GEO.box, M.wood, rp.x, rp.y - 0.25, rp.z, 0, 1.5, 0.1, 0.7);
      B.add(GEO.box, M.woodDark, rp.x, rp.y - 0.6, rp.z, 0, 0.12, 0.6, 0.12);
      const radio = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.42, 0.3), M.ironDark);
      radio.position.copy(rp).add(new THREE.Vector3(0, 0.2, 0));
      scene.add(radio);
      const dial = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.12),
        new THREE.MeshBasicMaterial({ color: 0xffb45e }));
      dial.position.copy(rp).add(new THREE.Vector3(0, 0.22, 0.16));
      scene.add(dial);
      dynamic.radioDial = dial;
      locations.radio = radio.position.clone();
      const pl = new THREE.PointLight(0xff9a4a, 5, 7, 2);
      pl.position.copy(rp).add(new THREE.Vector3(0, 0.5, 0.3));
      scene.add(pl);
      lights.push(pl);
    }
    // —— 市场（核册前收摊了一半的摊位）——
    {
      const stall = (x, z, ry, wares) => {
        const base = g(x, z);
        // 摊架
        B.add(GEO.box, M.wood, x, base + 0.75, z, ry, 2.2, 0.08, 1.1);
        for (const [ox, oz] of [[-1.0, -0.45], [1.0, -0.45], [-1.0, 0.45], [1.0, 0.45]]) {
          const wx = x + Math.cos(ry) * ox - Math.sin(ry) * oz;
          const wz = z + Math.sin(ry) * ox + Math.cos(ry) * oz;
          B.add(GEO.cyl, M.woodDark, wx, base + 0.4, wz, 0, 0.07, 0.8, 0.07);
        }
        // 顶棚布
        B.add(GEO.box, M.clothRed, x, base + 1.95, z, ry, 2.5, 0.05, 1.5, 0, 0.1);
        B.add(GEO.cyl, M.woodDark, x + Math.cos(ry) * 1.1, base + 1.4, z + Math.sin(ry) * 1.1, 0, 0.06, 2.8, 0.06);
        B.add(GEO.cyl, M.woodDark, x - Math.cos(ry) * 1.1, base + 1.4, z - Math.sin(ry) * 1.1, 0, 0.06, 2.8, 0.06);
        aabb(x, z, 2.3, 1.2, base + 0.85, { noSightBlock: true });
        // 货品
        if (wares === 'fish') {
          for (let i = 0; i < 4; i++) B.add(GEO.sphere, M.steel, x + (i - 1.5) * 0.4, base + 0.83, z, 0.4, 0.22, 0.05, 0.09);
        } else if (wares === 'salt') {
          B.add(GEO.cone, M.salt, x - 0.5, base + 0.95, z, 0, 0.4, 0.32, 0.4);
          B.add(GEO.cone, M.salt, x + 0.4, base + 0.9, z + 0.1, 0, 0.32, 0.24, 0.32);
        } else {
          for (let i = 0; i < 3; i++) B.add(GEO.box, M.clothRed, x + (i - 1) * 0.55, base + 0.86, z, i, 0.4, 0.14, 0.3);
        }
      };
      stall(6, -12, 0.3, 'fish');
      stall(10, -16, 0.25, 'salt');
      stall(2, -16, -0.2, 'red');
      // 公告栏（核册告示——文书③）
      const nb = g(12, -8);
      B.add(GEO.cyl, M.woodDark, 11.2, nb + 1.1, -8, 0, 0.09, 2.2, 0.09);
      B.add(GEO.cyl, M.woodDark, 12.8, nb + 1.1, -8, 0, 0.09, 2.2, 0.09);
      B.add(GEO.box, M.wood, 12, nb + 1.5, -8, 0, 1.9, 1.1, 0.08);
      const notice = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.82), M.notice);
      notice.position.set(12, nb + 1.52, -7.94);
      scene.add(notice);
      circle(12, -8, 0.35, nb + 2.2, { noSightBlock: true });
      locations.noticeBoard = new THREE.Vector3(12, nb + 1.4, -7.9);
    }
    // 镇口广场灯笼(真实光×2) + 幡 ——今晚全镇挂「名」灯
    lanternPole(-2, 8, true, 'xi');
    lanternPole(14, -10, true, 'xi');
    lanternPole(-16, -20, false, 'xi');
    banner(-6, 16, 0.7); banner(18, 8, -0.9);
    tree(-30, 10, 1.3); tree(30, 12, 1.0); tree(14, -36, 1.2);
    // 石板路网
    laySlabPath([[16, 36], [12, 20], [2, 6]]);
    laySlabPath([[2, 6], [-14, 8]]);
    laySlabPath([[2, 6], [8, -14], [28, -18]]);
    laySlabPath([[2, 2], [-14, -18], [-34, -40], [-52, -60]]);
    laySlabPath([[8, -20], [24, -44]]);
    // 通往南方大酒店的正街（红毯没铺到的部分）
    laySlabPath([[6, -14], [-2, -28], [-4, -40]], 1.9);
  }

  // ================= 晒盐场 =================
  {
    const cx = -42, cz = 6;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 2; j++) {
        const px = cx - 8 + i * 8.5, pz = cz - 5 + j * 9;
        const base = terrainHeight(px, pz);
        // 盐田边框
        B.add(GEO.box, M.stone, px, base + 0.14, pz - 3.6, 0, 7.6, 0.3, 0.4);
        B.add(GEO.box, M.stone, px, base + 0.14, pz + 3.6, 0, 7.6, 0.3, 0.4);
        B.add(GEO.box, M.stone, px - 3.6, base + 0.14, pz, 0, 0.4, 0.3, 6.8);
        B.add(GEO.box, M.stone, px + 3.6, base + 0.14, pz, 0, 0.4, 0.3, 6.8);
        // 盐面
        B.add(GEO.box, M.salt, px, base + 0.06, pz, 0, 6.8, 0.14, 6.6);
      }
    }
    // 盐堆
    B.add(GEO.cone, M.salt, cx + 12, terrainHeight(cx + 12, cz + 6) + 0.8, cz + 6, 0, 2.6, 1.7, 2.6);
    B.add(GEO.cone, M.salt, cx + 14.5, terrainHeight(cx + 14.5, cz + 3) + 0.55, cz + 3, 0, 1.8, 1.2, 1.8);
    circle(cx + 12, cz + 6, 1.1, null, { noSightBlock: false });
    // 盐耙
    B.add(GEO.cyl, M.woodDark, cx - 2, terrainHeight(cx - 2, cz) + 0.8, cz, 0, 0.06, 1.7, 0.06, 0, 0.5);
    B.add(GEO.box, M.woodDark, cx - 2.5, terrainHeight(cx - 2, cz) + 0.15, cz, 0, 0.7, 0.08, 0.15);
  }

  // ================= ④ 旧海祀·潮母宫 =================
  {
    const tx = -64, tz = -74;
    const plat = terrainHeight(tx, tz) + 0.9;
    // 平台 patch + 台阶坡
    addPatch(tx, tz, 0, 22, 17, plat, plat);
    addPatch(tx + 13.5, tz, 0, 6, 5, terrainHeight(tx + 17, tz), plat);
    // 平台石座
    B.add(GEO.box, M.stone, tx, plat - 0.5, tz, 0, 22, 1.0, 17);
    // 主殿（面东 dir=1，殿身 12×8）
    const hallW = 8, hallD = 12, wallH = 3.4, t = 0.4;
    const hb = plat;
    const wallM = M.plaster;
    // 后墙(西)
    B.add(GEO.box, wallM, tx - hallW / 2 + t / 2, hb + wallH / 2, tz, 0, t, wallH, hallD);
    aabb(tx - hallW / 2 + t / 2, tz, t, hallD, hb + wallH);
    // 北/南墙
    B.add(GEO.box, wallM, tx, hb + wallH / 2, tz - hallD / 2 + t / 2, 0, hallW, wallH, t);
    aabb(tx, tz - hallD / 2 + t / 2, hallW, t, hb + wallH);
    B.add(GEO.box, wallM, tx, hb + wallH / 2, tz + hallD / 2 - t / 2, 0, hallW, wallH, t);
    aabb(tx, tz + hallD / 2 - t / 2, hallW, t, hb + wallH);
    // 前(东)墙:大门洞 3.4 宽
    const segD = (hallD - 3.4) / 2;
    B.add(GEO.box, wallM, tx + hallW / 2 - t / 2, hb + wallH / 2, tz - 3.4 / 2 - segD / 2, 0, t, wallH, segD);
    aabb(tx + hallW / 2 - t / 2, tz - 3.4 / 2 - segD / 2, t, segD, hb + wallH);
    B.add(GEO.box, wallM, tx + hallW / 2 - t / 2, hb + wallH / 2, tz + 3.4 / 2 + segD / 2, 0, t, wallH, segD);
    aabb(tx + hallW / 2 - t / 2, tz + 3.4 / 2 + segD / 2, t, segD, hb + wallH);
    B.add(GEO.box, wallM, tx + hallW / 2 - t / 2, hb + wallH - 0.45, tz, 0, t, 0.9, 3.6);
    // 檐柱一排(东侧走廊)
    for (let i = -2; i <= 2; i++) {
      const cz2 = tz + i * 2.6;
      B.add(GEO.cyl, M.woodDark, tx + hallW / 2 + 1.6, hb + 1.7, cz2, 0, 0.36, 3.4, 0.36);
      circle(tx + hallW / 2 + 1.6, cz2, 0.25, hb + 3.4, { noSightBlock: true });
    }
    // 大屋顶(双坡,脊沿南北) + 山墙封口 + 燕尾脊
    const roofY = hb + wallH;
    B.add(GEO.box, M.roof, tx - 2.2, roofY + 1.05, tz, 0, 6.6, 0.2, hallD + 2.4, 0, 0, 0.42);
    B.add(GEO.box, M.roof, tx + 2.9, roofY + 0.82, tz, 0, 8.0, 0.2, hallD + 2.4, 0, 0, -0.34);
    B.add(GEO.box, M.stone, tx - 0.4, roofY + 2.1, tz, 0, 0.6, 0.45, hallD + 2.6);
    // 山墙封口（阶梯三角，堵住屋顶与墙之间的漏缝）
    for (const zEnd of [tz - hallD / 2 + t / 2, tz + hallD / 2 - t / 2]) {
      B.add(GEO.box, wallM, tx - 0.2, roofY + 0.45, zEnd, 0, 7.0, 0.95, t);
      B.add(GEO.box, wallM, tx - 0.3, roofY + 1.25, zEnd, 0, 4.4, 0.85, t);
      B.add(GEO.box, wallM, tx - 0.4, roofY + 1.9, zEnd, 0, 2.0, 0.6, t);
    }
    // 燕尾脊翘角
    B.add(GEO.box, M.stone, tx - 0.4, roofY + 2.5, tz - hallD / 2 - 1.4, 0, 0.4, 1.1, 0.35, -0.55, 0);
    B.add(GEO.box, M.stone, tx - 0.4, roofY + 2.5, tz + hallD / 2 + 1.4, 0, 0.4, 1.1, 0.35, 0.55, 0);
    // 殿内: 神台 + 覆布神像(潮母) + 三香炉
    B.add(GEO.box, M.woodDark, tx - hallW / 2 + 1.5, hb + 0.6, tz, 0, 1.6, 1.2, 5.0);
    {
      // 覆着湿布的神像——只有轮廓
      const shroud = new THREE.MeshStandardMaterial({ color: 0x5a5348, roughness: 0.98 });
      B.add(GEO.cone, shroud, tx - hallW / 2 + 1.5, hb + 2.3, tz, 0, 1.5, 2.4, 1.5);
      B.add(GEO.sphere, shroud, tx - hallW / 2 + 1.5, hb + 3.35, tz, 0, 0.65, 0.7, 0.65);
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.2), M.clothRed);
      cloth.position.set(tx - hallW / 2 + 2.35, hb + 1.35, tz);
      cloth.rotation.y = Math.PI / 2;
      scene.add(cloth);
    }
    // 三只香炉（谜题）: 南/中/北
    dynamic.censers = [];
    const censerX = tx - 0.4;
    [-3.2, 0, 3.2].forEach((off, i) => {
      const cz2 = tz + off;
      B.add(GEO.cyl, M.ironDark, censerX, hb + 0.55, cz2, 0, 0.62, 0.5, 0.62);
      B.add(GEO.cyl, M.ironDark, censerX, hb + 0.22, cz2, 0, 0.2, 0.45, 0.2);
      // 香(三根细杆) + 火头(点燃后显示)
      const flameG = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5), M.woodDark);
        stick.position.set(censerX + (k - 1) * 0.08, hb + 1.0, cz2 + (k % 2) * 0.06);
        scene.add(stick);
        const fl = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), M.candleFlame);
        fl.position.set(censerX + (k - 1) * 0.08, hb + 1.27, cz2 + (k % 2) * 0.06);
        flameG.add(fl);
      }
      flameG.visible = false;
      scene.add(flameG);
      const smoke = makeSmoke(censerX, hb + 1.32, cz2, { count: 16, rise: 1.9, spread: 0.1, size: 0.16, on: false });
      dynamic.censers.push({ pos: new THREE.Vector3(censerX, hb + 0.8, cz2), flames: flameG, smoke, idx: i });
      circle(censerX, cz2, 0.45, hb + 0.9, { noSightBlock: true });
    });
    locations.altar = new THREE.Vector3(tx - hallW / 2 + 1.9, hb + 1.25, tz);
    // 喉铃（谜题解开后可拾取）
    const bell = new THREE.Group();
    const bellBody = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.26, 10),
      new THREE.MeshStandardMaterial({ color: 0x8a6f36, roughness: 0.35, metalness: 0.8, emissive: 0x332200, emissiveIntensity: 0.4 }));
    bell.add(bellBody);
    bell.position.copy(locations.altar).add(new THREE.Vector3(0, 0.1, 0));
    bell.visible = true;
    scene.add(bell);
    dynamic.altarBell = bell;
    // 殿内烛光(真实光×2 + 香火光雾)
    const c1 = new THREE.PointLight(0xff8a3a, 10, 12, 2);
    c1.position.set(tx - 1, hb + 1.8, tz - 2.8);
    scene.add(c1); lights.push(c1);
    const c2 = new THREE.PointLight(0xff8a3a, 10, 12, 2);
    c2.position.set(tx - 1, hb + 1.8, tz + 2.8);
    scene.add(c2); lights.push(c2);
    for (const czn of [tz - 2.8, tz + 2.8]) {
      const cone = makeLightCone(0xff8a3a, 0.06, 0.1, 1.1, 1.8);
      cone.position.set(tx - 1, hb + 1.7, czn);
      scene.add(cone);
    }
    // 烛台
    B.add(GEO.cyl, M.ironDark, tx - 1, hb + 0.7, tz - 2.8, 0, 0.1, 1.4, 0.1);
    B.add(GEO.cyl, M.ironDark, tx - 1, hb + 0.7, tz + 2.8, 0, 0.1, 1.4, 0.1);
    B.add(GEO.cone, M.candleFlame, tx - 1, hb + 1.52, tz - 2.8, 0, 0.07, 0.16, 0.07);
    B.add(GEO.cone, M.candleFlame, tx - 1, hb + 1.52, tz + 2.8, 0, 0.07, 0.16, 0.07);
    // 偏殿(南侧小间): 文书⑤
    {
      const ax = tx + 1, az = tz + hallD / 2 + 2.6;
      B.add(GEO.box, wallM, ax - 2.2, hb + 1.1, az, 0, 0.3, 2.2, 4.2);
      aabb(ax - 2.2, az, 0.3, 4.2, hb + 2.2);
      B.add(GEO.box, wallM, ax + 2.2, hb + 1.1, az, 0, 0.3, 2.2, 4.2);
      aabb(ax + 2.2, az, 0.3, 4.2, hb + 2.2);
      B.add(GEO.box, wallM, ax, hb + 1.1, az + 2.1, 0, 4.6, 2.2, 0.3);
      aabb(ax, az + 2.1, 4.6, 0.3, hb + 2.2);
      B.add(GEO.box, M.roof, ax, hb + 2.4, az, 0, 5.2, 0.16, 5.0, 0, 0, 0.12);
      B.add(GEO.box, M.wood, ax, hb + 0.7, az + 0.8, 0, 1.4, 0.08, 0.8);
      locations.note5 = new THREE.Vector3(ax, hb + 0.85, az + 0.8);
      addPatch(ax, az, 0, 5, 5, plat, plat);
    }
    // 后廊(西侧窄道): 文书⑥
    locations.note6 = new THREE.Vector3(tx - hallW / 2 - 1.3, plat + 0.35, tz + 3);
    B.add(GEO.box, M.wood, tx - hallW / 2 - 1.3, plat + 0.2, tz + 3, 0.3, 0.6, 0.4, 0.5);
    // 院前大香炉 + 幡 + 灯笼(真实光)
    B.add(GEO.cyl, M.ironDark, tx + 8, plat + 0.8, tz - 3, 0, 1.0, 1.6, 1.0);
    circle(tx + 8, tz - 3, 0.6, plat + 1.6);
    // 大香炉三年不灭——常燃的烟
    makeSmoke(tx + 8, plat + 1.7, tz - 3, { count: 34, rise: 3.6, spread: 0.22, size: 0.26, opacity: 0.32 });
    banner(tx + 7.5, tz + 3.5, 0.8);
    banner(tx + 9, tz + 5, -0.5);
    lanternPole(tx + 6, tz, true, 'ji');
    // 石阶路
    laySlabPath([[-52, -60], [tx + 14, tz]]);
  }

  // ================= ⑤ 沉船湾 与 灯塔 =================
  {
    // 沉船：龙骨朝天的大渔船残骸，龙骨可走(patch 桥)
    const sx = 37, sz = -72;
    const ang = Math.atan2(-84 - (-60), 46 - 28); // 谷地走向
    addPatch(sx, sz, ang, 24, 2.0, 2.55, 2.75);
    // 龙骨主梁
    B.add(GEO.box, M.woodDark, sx, 2.45, sz, -ang, 24.5, 0.5, 1.7);
    // 两端搭板
    B.add(GEO.box, M.wood, 28.5, 1.9, -61.5, -ang, 5, 0.18, 1.6, 0, -0.12);
    B.add(GEO.box, M.wood, 45.5, 2.0, -82.5, -ang, 5, 0.18, 1.6, 0, 0.14);
    // 肋骨(半圆拱, 鲸骨感)
    const ribGeo = new THREE.TorusGeometry(3.4, 0.16, 6, 12, Math.PI);
    for (let i = -2; i <= 2; i++) {
      const t = i / 5;
      const rx = sx + Math.cos(ang) * t * 20;
      const rz = sz + Math.sin(ang) * t * 20;
      const s = 1 - Math.abs(t) * 0.5;
      B.add(ribGeo, M.woodDark, rx, 2.3, rz, -ang + Math.PI / 2, s, s, s, 0, Math.PI);
    }
    // 散落船板
    for (let i = 0; i < 8; i++) {
      const px = sx + (rand() - 0.5) * 16, pz = sz + (rand() - 0.5) * 16;
      B.add(GEO.box, M.wood, px, terrainHeight(px, pz) + 0.1, pz, rand() * 3, 1.8, 0.12, 0.5, 0, (rand() - 0.5) * 0.3);
    }
    reefRock(24, -78, 1.6); reefRock(50, -64, 1.9); reefRock(56, -90, 1.3);
    tree(20, -55, 1.0); tree(58, -100, 0.8);

    // —— 灯塔 ——
    const lx = 76, lz = -120;
    const lb = terrainHeight(lx, lz);
    const towerH = 10;
    // 塔身(略收分)：UV 按世界尺度缩放，避免条石纹被拉成巨块
    const towerGeo = new THREE.CylinderGeometry(1.9, 2.6, towerH, 14);
    {
      const uv = towerGeo.attributes.uv;
      const circum = Math.PI * 2 * 2.25 / 2.4, hRep = towerH / 2.4;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circum, uv.getY(i) * hRep);
    }
    B.add(towerGeo, M.stone, lx, lb + towerH / 2, lz, 0, 1, 1, 1);
    // 塔身腰线
    B.add(GEO.cyl, M.plaster, lx, lb + 3.4, lz, 0, 4.9, 0.35, 4.9);
    B.add(GEO.cyl, M.plaster, lx, lb + 6.6, lz, 0, 4.4, 0.35, 4.4);
    // 门(朝西北,面向来路)
    const doorAng = Math.atan2(-95 - lz, 60 - lx);
    // 塔身碰撞：环形箱段，门向留缺口（玩家能从门进塔）
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      let da = Math.abs(a - ((doorAng % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2));
      if (da > Math.PI) da = Math.PI * 2 - da;
      if (da < 0.5) continue; // 门洞
      aabb(lx + Math.cos(a) * 2.25, lz + Math.sin(a) * 2.25, 1.3, 1.3, lb + towerH);
    }
    // 门洞打穿塔壁（视觉）：深色内衬 + 门框
    const dx = lx + Math.cos(doorAng) * 2.35, dz = lz + Math.sin(doorAng) * 2.35;
    const doorRy = -doorAng + Math.PI / 2;
    const innerDark = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 1 });
    B.add(GEO.box, innerDark, dx, lb + 1.25, dz, doorRy, 1.35, 2.5, 1.1);
    B.add(GEO.box, M.woodDark, dx + Math.cos(doorAng + Math.PI / 2) * 0.8, lb + 1.25, dz + Math.sin(doorAng + Math.PI / 2) * 0.8, doorRy, 0.22, 2.6, 0.6);
    B.add(GEO.box, M.woodDark, dx - Math.cos(doorAng + Math.PI / 2) * 0.8, lb + 1.25, dz - Math.sin(doorAng + Math.PI / 2) * 0.8, doorRy, 0.22, 2.6, 0.6);
    B.add(GEO.box, M.woodDark, dx, lb + 2.6, dz, doorRy, 1.8, 0.25, 0.6);
    locations.lighthouseDoor = new THREE.Vector3(dx, lb + 1.2, dz);
    // 塔内一点微光（油灯余烬）
    const towerLight = new THREE.PointLight(0xff9a55, 4, 8, 2);
    towerLight.position.set(lx, lb + 1.6, lz + 0.8);
    scene.add(towerLight);
    lights.push(towerLight);
    // 顶部平台 + 围栏
    const topY = lb + towerH;
    addPatch(lx, lz, 0, 6.4, 6.4, topY, topY);
    B.add(GEO.cyl, M.stone, lx, topY - 0.15, lz, 0, 3.4, 0.3, 3.4);
    for (let a = 0; a < 12; a++) {
      const th = (a / 12) * Math.PI * 2;
      B.add(GEO.cyl, M.ironDark, lx + Math.cos(th) * 3.1, topY + 0.55, lz + Math.sin(th) * 3.1, 0, 0.05, 1.1, 0.05);
    }
    B.add(new THREE.TorusGeometry(3.1, 0.05, 6, 20), M.ironDark, lx, topY + 1.1, lz, 0, 1, 1, 1, Math.PI / 2, 0);
    // 平台边缘防坠(围一圈)
    aabb(lx, lz - 3.4, 7, 0.3, topY + 1.2, { noSightBlock: true });
    aabb(lx, lz + 3.4, 7, 0.3, topY + 1.2, { noSightBlock: true });
    aabb(lx - 3.4, lz, 0.3, 7, topY + 1.2, { noSightBlock: true });
    aabb(lx + 3.4, lz, 0.3, 7, topY + 1.2, { noSightBlock: true });
    // 灯室
    B.add(GEO.cyl, M.ironDark, lx, topY + 2.3, lz, 0, 1.5, 0.25, 1.5);
    for (let a = 0; a < 6; a++) {
      const th = (a / 6) * Math.PI * 2;
      B.add(GEO.cyl, M.ironDark, lx + Math.cos(th) * 1.35, topY + 1.7, lz + Math.sin(th) * 1.35, 0, 0.07, 1.4, 0.07);
    }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0x333322, emissive: 0xffdf9a, emissiveIntensity: 0.0 }));
    lamp.position.set(lx, topY + 1.55, lz);
    scene.add(lamp);
    dynamic.lighthouseLamp = lamp;
    // 旋转光束（点亮后可见）
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffe9b8, transparent: true, opacity: 0.0, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    });
    const beam = new THREE.Mesh(new THREE.ConeGeometry(4.5, 60, 16, 1, true), beamMat);
    beam.rotation.z = Math.PI / 2;
    const beamG = new THREE.Group();
    beam.position.x = 30;
    beamG.add(beam);
    beamG.position.set(lx, topY + 1.55, lz);
    scene.add(beamG);
    dynamic.lighthouseBeam = beamG;
    // 塔内：梯子(交互传送) + 电闸 + 文书⑦
    locations.ladderBottom = new THREE.Vector3(lx - 1.2, lb + 1.0, lz);
    locations.ladderTopSpot = { x: lx + 1.0, z: lz + 0.5, yaw: doorAng + Math.PI };
    locations.breaker = new THREE.Vector3(lx + 1.6, lb + 1.3, lz + 1.2);
    B.add(GEO.box, M.ironDark, lx + 1.9, lb + 1.3, lz + 1.2, 0, 0.35, 0.6, 0.25);
    locations.note7 = new THREE.Vector3(lx - 0.5, lb + 0.5, lz + 1.6);
    B.add(GEO.box, M.wood, lx - 0.5, lb + 0.35, lz + 1.6, 0.3, 0.8, 0.5, 0.6);
    // 梯子视觉
    for (let i = 0; i < 9; i++) {
      B.add(GEO.box, M.ironDark, lx - 1.7, lb + 0.6 + i * 1.0, lz, 0, 0.05, 0.05, 0.6);
    }
    B.add(GEO.cyl, M.ironDark, lx - 1.7, lb + 5, lz - 0.32, 0, 0.04, 9.6, 0.04);
    B.add(GEO.cyl, M.ironDark, lx - 1.7, lb + 5, lz + 0.32, 0, 0.04, 9.6, 0.04);
    // 顶部铃架（终局交互）
    locations.bellTop = new THREE.Vector3(lx + 2.2, topY + 1.4, lz - 1.2);
    B.add(GEO.cyl, M.woodDark, lx + 2.2, topY + 0.9, lz - 1.2, 0, 0.08, 1.8, 0.08);
    B.add(GEO.box, M.woodDark, lx + 2.2, topY + 1.85, lz - 1.2, 0, 0.7, 0.08, 0.08);
    // 文书⑧ 电报(顶部)
    locations.note8 = new THREE.Vector3(lx - 2.0, topY + 0.5, lz + 1.8);
    // 灯塔路
    laySlabPath([[46, -84], [60, -98], [70, -112]]);
    // 路边石碑
    const stx = 62, stz = -101;
    B.add(GEO.box, M.stone, stx, g(stx, stz) + 1.0, stz, 0.4, 1.2, 2.0, 0.28);
    B.add(GEO.box, M.stone, stx, g(stx, stz) + 0.15, stz, 0.4, 1.7, 0.3, 0.7);
    locations.stele = new THREE.Vector3(stx, g(stx, stz) + 1.2, stz);
  }

  // ================= 芦苇丛（成簇，避开出生路径） =================
  {
    const reedMat = new THREE.MeshStandardMaterial({ color: 0x59614a, roughness: 0.95 });
    const reedGeo = new THREE.ConeGeometry(0.075, 1.35, 4);
    const inst = new THREE.InstancedMesh(reedGeo, reedMat, 420);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s3 = new THREE.Vector3();
    let placed = 0;
    // 找合法簇心
    const centers = [];
    let guard = 0;
    while (centers.length < 14 && guard++ < 4000) {
      const x = (rand() - 0.5) * 260, z = (rand() - 0.5) * 280;
      const h = terrainHeight(x, z);
      if (h < 0.6 || h > 1.6) continue;
      if (Math.hypot(x - 80, z - 111) < 15) continue; // 避开出生滩涂
      centers.push([x, z]);
    }
    for (const [cx, cz] of centers) {
      const n = 18 + Math.floor(rand() * 12);
      for (let i = 0; i < n && placed < 420; i++) {
        const x = cx + (rand() - 0.5) * 6, z = cz + (rand() - 0.5) * 6;
        const h = terrainHeight(x, z);
        if (h < 0.4 || h > 1.9) continue;
        e.set((rand() - 0.5) * 0.22, rand() * 6.28, (rand() - 0.5) * 0.22);
        q.setFromEuler(e);
        s3.set(1, 0.7 + rand() * 0.7, 1);
        m4.compose(new THREE.Vector3(x, h + 0.6, z), q, s3);
        inst.setMatrixAt(placed++, m4);
      }
    }
    inst.count = placed;
    inst.instanceMatrix.needsUpdate = true;
    scene.add(inst);
  }

  // ================= ⑥ 南方大酒店 + 蚀湾海洋馆 =================
  buildHotel({
    B, M, scene, colliders, addPatch, locations, patrols, dynamic, lights,
    heightGround: (x, z) => terrainHeight(x, z),
  });

  // ---- 提交静态合批 ----
  B.flush(scene);

  // ================= 巡逻路点 =================
  patrols.dike = [[-14, 70.5], [10, 72], [30, 73], [50, 74], [30, 73], [20, 62], [20, 60.8], [10, 66]];
  patrols.village1 = [[-2, 10], [12, 12], [16, -6], [2, -14], [-12, -6], [-8, 8]];
  patrols.village2 = [[26, -12], [34, -24], [18, -26], [12, -16]];
  patrols.templeGuard = [[-52, -70], [-58, -80], [-68, -84], [-72, -68], [-60, -64]];
  patrols.wardenPost = [[56, -92], [66, -104], [74, -112], [64, -98]];
  patrols.netMenderWork = [12, 46.8];    // 补网人工位
  patrols.saltWorkerWork = [-44, 4];     // 晒盐工工位
  patrols.priestWork = [-64.4, -74];     // 守祀人(殿内)
  patrols.dogWander = [[6, 6], [-8, 0], [2, -10], [14, 2]];
  // 镇街→酒店正门一线（核册当值的镇民）
  patrols.townStreet = [[6, -14], [-2, -28], [-4, -38], [2, -30], [10, -18]];

  // ================= 雨遮蔽（棚/檐/屋顶下不出现雨丝） =================
  dynamic.rainCovers = [
    { minX: 55.2, maxX: 60.8, minZ: 2.9, maxZ: 6.1 },     // 车站雨棚
    { minX: 42.9, maxX: 45.1, minZ: -4.5, maxZ: 4.5 },    // 牌坊瓦顶
    { minX: 45.4, maxX: 48.2, minZ: 3.4, maxZ: 6.2 },     // 岗亭
    { minX: 40.5, maxX: 42.7, minZ: 2.0, maxZ: 5.2 },     // 告示墙檐
    { minX: 32.0, maxX: 38.0, minZ: 3.7, maxZ: 8.7 },     // 杂货铺
    { minX: 20.0, maxX: 29.0, minZ: 0.7, maxZ: 7.7 },     // 录像厅
    { minX: 29.8, maxX: 34.2, minZ: -19.9, maxZ: -16.1 }, // 广播站
    { minX: 28.2, maxX: 29.8, minZ: -7.3, maxZ: -5.7 },   // 电话亭
    { minX: -45.4, maxX: -26.8, minZ: 21.4, maxZ: 29.4 }, // 水产家属楼·一栋（含外廊/楼梯）
    { minX: -45.4, maxX: -26.8, minZ: 9.6, maxZ: 17.6 },  // 水产家属楼·二栋
    { minX: 10.7, maxX: 17.3, minZ: 0.0, maxZ: 5.7 },     // 大新照相馆
  ];

  // ================= 区域(叙事触发) =================
  const zones = {
    beach: { minX: 52, maxX: 110, minZ: 88, maxZ: 138 },
    dikeArea: { minX: -26, maxX: 60, minZ: 40, maxZ: 86 },
    busStation: { minX: 50, maxX: 74, minZ: -8, maxZ: 12 },
    frontStreet: { minX: 14, maxX: 46, minZ: -10, maxZ: 10 },
    dormArea: { minX: -48, maxX: -26, minZ: 8, maxZ: 34 },
    aquaMain: dynamic.aquaMainRect,
    villageCenter: { minX: -30, maxX: 40, minZ: -36, maxZ: 38 },
    saltField: { minX: -58, maxX: -26, minZ: -8, maxZ: 18 },
    temple: { minX: -78, maxX: -50, minZ: -88, maxZ: -60 },
    wreckBay: { minX: 22, maxX: 54, minZ: -90, maxZ: -62 },
    lighthouse: { minX: 62, maxX: 92, minZ: -134, maxZ: -106 },
    hotelFront: { minX: -14, maxX: 6, minZ: -46, maxZ: -38 },
    hotelLobby: { minX: -12, maxX: 4, minZ: -56, maxZ: -45 },
    banquet: { minX: -21, maxX: -12, minZ: -67, maxZ: -45 },
    serviceCorridor: { minX: -12, maxX: 4, minZ: -67, maxZ: -63.5 },
    annex: { minX: 14, maxX: 36, minZ: -60, maxZ: -44 },
  };

  // 地面材质解析（脚步声/噪音半径）：酒店内按功能区分毯/砖/木/石
  const inRect = (r, x, z) => r && x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
  function surfaceAt(x, z, y) {
    const HI = dynamic.hotelInfo;
    if (!HI) return null;
    if (!inRect(HI.footprint, x, z) && !inRect(HI.annexRect, x, z)) return null;
    if (y > HI.origin.y + 2.4) return 'carpet';   // 2F/3F 客房层满铺地毯
    for (const r of dynamic.tileRects ?? []) if (inRect(r, x, z)) return 'tile';
    if (inRect(dynamic.stageRect, x, z)) return 'wood';
    for (const r of dynamic.dampRects ?? []) if (inRect(r, x, z)) return 'carpet';
    return 'stone'; // 水磨石
  }

  return {
    colliders, bounds, heightAt, locations, patrols, dynamic, zones, lights, surfaceAt,
    waterLevelRef: { value: 0 },
    waterLevel() { return this.waterLevelRef.value; },
    /** 每帧特效更新（烟柱 + 灯火呼吸 + 酒店荧光频闪 + 录像厅雪花屏） */
    updateFx(time) {
      for (const s of smokes) s.update(time);
      // 雪花屏：灰度乱跳（录像厅通宵场——放的是没有信号）
      for (const s of dynamic.staticScreens ?? []) {
        const v = 0.45 + Math.random() * 0.45;
        s.material.color.setRGB(v * 0.92, v, v * 1.02);
      }
      // 灯笼/烛火不是恒亮的——火苗在风里咽气又缓过来
      for (let i = 0; i < lights.length; i++) {
        const pl = lights[i];
        if (pl._base === undefined) pl._base = pl.intensity;
        const f = Math.sin(time * 6.9 + i * 2.13) * 0.30
                + Math.sin(time * 13.7 + i * 4.71) * 0.22
                + Math.sin(time * 1.7 + i) * 0.18;
        pl.intensity = pl._base * (0.88 + f * 0.16);
      }
      // 酒店灯：flicker 越大越接近坏镇流器——偶发骤暗、高频抖
      const hls = dynamic.hotelLights ?? [];
      for (let i = 0; i < hls.length; i++) {
        const hl = hls[i];
        const fl = hl.flicker ?? 0;
        let k = 1;
        if (fl > 0) {
          const drop = Math.sin(time * (7 + fl * 9) + i * 3.7) + Math.sin(time * 23.1 + i * 9.4);
          k = 1 - Math.max(0, drop - (1.85 - fl * 0.55)) * 1.6;
          k = Math.max(0.08, k) * (1 + Math.sin(time * 47 + i) * 0.04 * fl);
        }
        hl.pl.intensity = hl.base * k;
      }
    },
  };
}
