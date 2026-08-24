// 盐门村大地图：地形 + 五区（礁滩/石堤渔寮/村中心/潮母宫/灯塔沉船）
// 输出：场景网格、碰撞体、heightAt、互动点位 locations、巡逻路点 patrols、动态对象 dynamic
import * as THREE from 'three';
import { Batcher, GEO } from './batcher.js';
import { mulberry32 } from './textures.js';

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
function patchHeight(x, z) {
  let h = -Infinity;
  for (const p of patches) {
    const lx = (x - p.cx) * p.cos + (z - p.cz) * p.sin;   // 沿长度
    const lz = -(x - p.cx) * p.sin + (z - p.cz) * p.cos;  // 沿宽度
    if (Math.abs(lx) <= p.len / 2 && Math.abs(lz) <= p.wid / 2) {
      const t = (lx + p.len / 2) / p.len;
      h = Math.max(h, p.h0 + (p.h1 - p.h0) * t);
    }
  }
  return h;
}

function terrainHeight(x, z) {
  let h = 0;
  // 岛屿基座
  h += 2.3 * discFall(x, z, -10, -10, 100, 55);
  h += 2.3 * discFall(x, z, 62, -100, 42, 38);
  h = Math.max(h, 2.2 * capsuleFall(x, z, 20, -40, 62, -95, 15, 22));
  // 礁滩（低平台，血潮后被淹）
  h = Math.max(h, 0.95 * discFall(x, z, 80, 112, 30, 22));
  // 礁滩→石堤 的走廊
  h = Math.max(h, 1.5 * capsuleFall(x, z, 70, 100, 54, 80, 8, 12));
  // 晒盐场压低（血潮后被淹）
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
  // 岛外海床下沉
  h = Math.max(h, -2.5);
  return h;
}

export function heightAt(x, z) {
  return Math.max(terrainHeight(x, z), patchHeight(x, z));
}

// ---------------- 世界构建 ----------------

export function buildVillage(scene, M) {
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
      if (h < 1.1) { const t = smoothstep(-0.5, 1.1, h); r = 0.42 + t * 0.2; gg = 0.4 + t * 0.18; b = 0.34 + t * 0.14; }
      else if (h < 2.8) { const t = smoothstep(1.1, 2.8, h); r = 0.62 - t * 0.1; gg = 0.58 - t * 0.02; b = 0.48 + t * 0.02; }
      else { const t = smoothstep(2.8, 5.5, h); r = 0.52 - t * 0.06; gg = 0.56 - t * 0.04; b = 0.5 + t * 0.0; }
      const n = noiseB(x * 0.03, z * 0.03) * 0.2;
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
        B.add(GEO.box, M.slab, x, g(x, z) + 0.03, z, rand() * Math.PI, 0.62 * width, 0.07, 0.5 * width);
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

  // 灯笼杆（optLight: 挂真实点光）
  function lanternPole(x, z, optLight = false, char = 'chao') {
    const base = g(x, z);
    B.add(GEO.cyl, M.woodDark, x, base + 1.6, z, 0, 0.14, 3.2, 0.14);
    B.add(GEO.box, M.woodDark, x + 0.35, base + 3.05, z, 0, 0.9, 0.08, 0.08);
    const lan = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.26, 0.5, 10),
      char === 'ji' ? M.lanternPaperJi : M.lanternPaper
    );
    lan.position.set(x + 0.7, base + 2.75, z);
    scene.add(lan);
    B.add(GEO.cyl, M.ironDark, x + 0.7, base + 3.02, z, 0, 0.08, 0.06, 0.08);
    if (optLight) {
      const pl = new THREE.PointLight(0xff8438, 14, 15, 2);
      pl.position.set(x + 0.7, base + 2.7, z);
      scene.add(pl);
      lights.push(pl);
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

  // 树（滨海乔木剪影）
  function tree(x, z, s = 1) {
    const base = g(x, z);
    B.add(GEO.cyl, M.woodDark, x, base + 1.4 * s, z, 0, 0.22 * s, 2.8 * s, 0.22 * s);
    const leaf = new THREE.MeshStandardMaterial({ color: 0x243029, roughness: 0.95 });
    B.add(GEO.cone, leaf, x + 0.2 * s, base + 3.3 * s, z, rand() * 3, 2.4 * s, 2.2 * s, 2.4 * s);
    B.add(GEO.cone, leaf, x - 0.3 * s, base + 4.4 * s, z + 0.2 * s, rand() * 3, 1.7 * s, 1.8 * s, 1.7 * s);
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

  // ================= ① 礁滩·搁浅点 =================
  {
    // 搁浅的渡船（半沉、倾斜）
    const fx = 92, fz = 122;
    const base = terrainHeight(fx, fz);
    B.add(GEO.box, M.woodDark, fx, base + 1.6, fz, 0.6, 4.2, 3.0, 13, 0, 0.16);
    B.add(GEO.box, M.wood, fx, base + 3.4, fz, 0.6, 3.4, 1.6, 5.5, 0, 0.16);
    B.add(GEO.cyl, M.ironDark, fx + 1.2, base + 4.6, fz - 1.5, 0, 0.5, 1.8, 0.5, 0, 0.2);
    aabb(fx, fz, 5.5, 13.5, base + 4);
    // 礁岩群
    const reefs = [[70, 128, 2.2], [60, 118, 1.6], [82, 100, 1.9], [66, 104, 1.2], [94, 108, 2.6], [55, 130, 1.8], [75, 92, 1.0], [88, 90, 1.4]];
    for (const [x, z, s] of reefs) reefRock(x, z, s);
    // 行李箱（文书①）
    locations.luggage = new THREE.Vector3(76, g(76, 108) + 0.35, 108);
    B.add(GEO.box, M.clothGrey, 76, g(76, 108) + 0.18, 108, 0.4, 0.7, 0.35, 0.5);
    // 破渔网、木箱杂物
    netRack(70, 96, 0.5);
    sampan(62, 98, 1.2, 0.12);
    B.add(GEO.box, M.wood, 73, g(73, 100) + 0.3, 100, 0.7, 0.8, 0.6, 0.8);
    // 出生点
    locations.spawn = { x: 84, z: 114, yaw: 2.4 };
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
    const h2 = house(20, 57, 2, 5.2, 4.2);   // 门朝北(-z)…朝村,钥匙屋
    const h3 = house(38, 51, 0, 4.4, 3.6);
    locations.note2 = h1.local(-1.0, 0.85, -0.7);   // 渔民日记(桌上)
    locations.keyHook = h2.local(1.9, 1.5, -1.4);   // 钥匙挂钩(内墙)
    locations.note3 = h3.local(1.1, 0.85, 0.6);     // 盐工账本
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

  // ================= 村墙与堤门 =================
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

  // ================= ③ 村中心 =================
  {
    // 民居
    house(-14, 14, 1, 5.4, 4.4, { plaster: true });
    house(10, 16, 0, 5.0, 4.2, { plaster: true });
    house(-24, -6, 1, 4.8, 4.0, { plaster: true });
    const v4 = house(24, 0, 3, 5.2, 4.2, { plaster: true });
    house(6, -26, 2, 5.6, 4.4, { plaster: true });
    house(-10, -30, 0, 4.6, 3.8);
    locations.note_v4 = v4.local(-1.2, 0.85, -0.8);
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
    // 村口广场灯笼(真实光×2) + 幡
    lanternPole(-2, 8, true);
    lanternPole(14, -10, true);
    lanternPole(-16, -20, false);
    banner(-6, 16, 0.7); banner(18, 8, -0.9);
    tree(-30, 10, 1.3); tree(30, 12, 1.0); tree(-2, -40, 1.2);
    // 石板路网
    laySlabPath([[16, 36], [12, 20], [2, 6]]);
    laySlabPath([[2, 6], [-14, 8]]);
    laySlabPath([[2, 6], [8, -14], [28, -18]]);
    laySlabPath([[2, 2], [-14, -18], [-34, -40], [-52, -60]]);
    laySlabPath([[8, -20], [24, -44]]);
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

  // ================= ④ 潮母宫 =================
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
    // 大屋顶(双坡,脊沿南北) + 燕尾脊
    const roofY = hb + wallH;
    B.add(GEO.box, M.roof, tx - 2.2, roofY + 1.05, tz, 0, 6.6, 0.2, hallD + 2.4, 0, 0, 0.42);
    B.add(GEO.box, M.roof, tx + 2.9, roofY + 0.82, tz, 0, 8.0, 0.2, hallD + 2.4, 0, 0, -0.34);
    B.add(GEO.box, M.stone, tx - 0.4, roofY + 2.1, tz, 0, 0.5, 0.4, hallD + 2.6);
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
      dynamic.censers.push({ pos: new THREE.Vector3(censerX, hb + 0.8, cz2), flames: flameG, idx: i });
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
    // 殿内烛光(真实光×2)
    const c1 = new THREE.PointLight(0xff8a3a, 10, 12, 2);
    c1.position.set(tx - 1, hb + 1.8, tz - 2.8);
    scene.add(c1); lights.push(c1);
    const c2 = new THREE.PointLight(0xff8a3a, 10, 12, 2);
    c2.position.set(tx - 1, hb + 1.8, tz + 2.8);
    scene.add(c2); lights.push(c2);
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
    // 塔身(略收分)
    const towerGeo = new THREE.CylinderGeometry(1.9, 2.6, towerH, 14);
    B.add(towerGeo, M.stone, lx, lb + towerH / 2, lz, 0, 1, 1, 1);
    circle(lx, lz, 2.5, lb + towerH);
    // 门(朝西北,面向来路)
    const doorAng = Math.atan2(-95 - lz, 60 - lx);
    const dx = lx + Math.cos(doorAng) * 2.45, dz = lz + Math.sin(doorAng) * 2.45;
    B.add(GEO.box, M.woodDark, dx, lb + 1.1, dz, -doorAng + Math.PI / 2, 1.3, 2.2, 0.3);
    locations.lighthouseDoor = new THREE.Vector3(dx, lb + 1.2, dz);
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

  // ================= 芦苇/杂物点缀 =================
  {
    const reedMat = new THREE.MeshStandardMaterial({ color: 0x3c4436, roughness: 0.95 });
    const reedGeo = new THREE.ConeGeometry(0.09, 1.2, 4);
    const inst = new THREE.InstancedMesh(reedGeo, reedMat, 400);
    const m4 = new THREE.Matrix4();
    let placed = 0;
    let guard = 0;
    while (placed < 400 && guard++ < 6000) {
      const x = (rand() - 0.5) * 260, z = (rand() - 0.5) * 280;
      const h = terrainHeight(x, z);
      if (h < 0.55 || h > 1.7) continue;
      m4.makeRotationY(rand() * 6.28);
      m4.setPosition(x, h + 0.7, z);
      inst.setMatrixAt(placed++, m4);
    }
    inst.count = placed;
    inst.instanceMatrix.needsUpdate = true;
    scene.add(inst);
  }

  // ---- 提交静态合批 ----
  B.flush(scene);

  // ================= 巡逻路点 =================
  patrols.dike = [[-14, 70.5], [10, 72], [30, 73], [50, 74], [30, 73], [20, 62], [20, 60.8], [10, 66]];
  patrols.village1 = [[-2, 10], [12, 12], [16, -6], [2, -14], [-12, -6], [-8, 8]];
  patrols.village2 = [[26, -12], [34, -24], [18, -26], [12, -16]];
  patrols.templeGuard = [[-52, -70], [-58, -80], [-68, -84], [-72, -68], [-60, -64]];
  patrols.singer = [[-6, -4], [10, -22], [24, -46], [34, -62], [24, -46], [-8, -32], [-20, -16]];
  patrols.wardenPost = [[56, -92], [66, -104], [74, -112], [64, -98]];
  patrols.netMenderWork = [12, 46.8];    // 补网人工位
  patrols.saltWorkerWork = [-44, 4];     // 晒盐工工位
  patrols.priestWork = [-64.4, -74];     // 祭师(殿内)
  patrols.dogWander = [[6, 6], [-8, 0], [2, -10], [14, 2]];

  // ================= 区域(叙事触发) =================
  const zones = {
    beach: { minX: 52, maxX: 110, minZ: 88, maxZ: 138 },
    dikeArea: { minX: -26, maxX: 60, minZ: 40, maxZ: 86 },
    villageCenter: { minX: -30, maxX: 40, minZ: -36, maxZ: 38 },
    saltField: { minX: -58, maxX: -26, minZ: -8, maxZ: 18 },
    temple: { minX: -78, maxX: -50, minZ: -88, maxZ: -60 },
    wreckBay: { minX: 22, maxX: 54, minZ: -90, maxZ: -56 },
    lighthouse: { minX: 62, maxX: 92, minZ: -134, maxZ: -106 },
  };

  return {
    colliders, bounds, heightAt, locations, patrols, dynamic, zones, lights,
    waterLevelRef: { value: 0 },
    waterLevel() { return this.waterLevelRef.value; },
  };
}
