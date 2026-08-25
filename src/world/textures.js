// 程序化贴图库：全部用 Canvas 在运行时生成（漫反射 + 高度 → 法线），零二进制资产。
// 风格规范见 docs/美术圣经.md：低饱和青灰基调、盐霜、湿痕。
import * as THREE from 'three';

// ---------------- 基础工具 ----------------

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d', { willReadFrequently: true })];
}

// 可复现伪随机
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 平铺值噪声（周期 = grid）
function makeValueNoise(seed, grid) {
  const rand = mulberry32(seed);
  const g = new Float32Array(grid * grid);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    x = ((x % 1) + 1) % 1 * grid;
    y = ((y % 1) + 1) % 1 * grid;
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = smooth(x - xi), yf = smooth(y - yi);
    const x0 = xi % grid, x1 = (xi + 1) % grid;
    const y0 = yi % grid, y1 = (yi + 1) % grid;
    const a = g[y0 * grid + x0], b = g[y0 * grid + x1];
    const c = g[y1 * grid + x0], d = g[y1 * grid + x1];
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

// 分形布朗运动（平铺）
function makeFbm(seed, octaves = 4) {
  const layers = [];
  for (let o = 0; o < octaves; o++) layers.push(makeValueNoise(seed + o * 131, 8 << o));
  return (x, y) => {
    let v = 0, amp = 0.5, sum = 0;
    for (let o = 0; o < octaves; o++) { v += layers[o](x, y) * amp; sum += amp; amp *= 0.5; }
    return v / sum;
  };
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

// 逐像素填充：fn(u,v) → [r,g,b]（0-255）；同时可输出高度 hFn(u,v) → 0-1
function fillPixels(size, fn) {
  const [c, ctx] = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const [r, g, b] = fn(u, v);
      const i = (y * size + x) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// 由高度函数生成切线空间法线图
function normalCanvasFromHeight(size, hFn, strength = 1.5) {
  const [c, ctx] = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const e = 1 / size;
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const hl = hFn(u - e, v), hr = hFn(u + e, v);
      const hu = hFn(u, v - e), hd = hFn(u, v + e);
      let nx = (hl - hr) * strength;
      let ny = (hu - hd) * strength;
      let nz = 1.0;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * 0.5 + 0.5) * 255;
      d[i + 2] = (nz * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function toTex(canvas, { srgb = true, repeat = [1, 1] } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---------------- 具体贴图 ----------------
// 每个生成器返回 { map, normalMap, (roughnessMap?) }

/** 渔船木板：深褐 + 板缝 + 苔绿 + 盐霜白斑 */
export function woodTexture(seed = 7, size = 512) {
  const fbm = makeFbm(seed, 4);
  const grain = makeValueNoise(seed + 9, 64);
  const planks = 6;
  const hFn = (u, v) => {
    const pv = v * planks;
    const gap = Math.abs(pv - Math.round(pv));       // 板缝
    const edge = clamp01(gap * planks * 1.6);
    const g = grain(u * 1.0, v * 14.0) * 0.25;
    return clamp01(edge * 0.8 + g + fbm(u, v) * 0.15);
  };
  const canvas = fillPixels(size, (u, v) => {
    const pi = Math.floor(v * planks);
    const shade = 0.82 + (mulberry32(seed * 51 + pi)() - 0.5) * 0.3;
    const g = grain(u * 1.0, v * 14.0);
    const f = fbm(u * 2, v * 2);
    let r = 66 * shade + g * 26, gg = 52 * shade + g * 20, b = 40 * shade + g * 14;
    // 苔绿
    const moss = clamp01((f - 0.62) * 4);
    r = r * (1 - moss * 0.5); gg = gg + moss * 16; b = b * (1 - moss * 0.4);
    // 盐霜（斑块）
    const salt = clamp01((fbm(u * 3 + 5, v * 3 + 5) - 0.68) * 6);
    r += salt * 110; gg += salt * 108; b += salt * 96;
    // 板缝压黑
    const pv = v * planks;
    const gap = Math.abs(pv - Math.round(pv));
    const dark = 1 - clamp01((0.06 - gap) * 14) * 0.7;
    return [r * dark, gg * dark, b * dark];
  });
  return { map: canvas, normal: normalCanvasFromHeight(size, hFn, 2.2) };
}

/** 花岗条石（石堤/墙基）：青灰块石 + 深缝 + 湿痕 */
export function stoneTexture(seed = 21, size = 512) {
  const fbm = makeFbm(seed, 4);
  const rows = 4, cols = 3;
  const cell = (u, v) => {
    const rv = v * rows;
    const ri = Math.floor(rv);
    const off = (ri % 2) * 0.5;
    const cu = u * cols + off;
    return [Math.floor(cu), ri, cu - Math.floor(cu), rv - ri];
  };
  const hFn = (u, v) => {
    const [, , fu, fv] = cell(u, v);
    const ex = Math.min(fu, 1 - fu) * cols, ey = Math.min(fv, 1 - fv) * rows;
    const edge = clamp01(Math.min(ex, ey) * 2.4);
    return clamp01(edge * 0.85 + fbm(u * 2, v * 2) * 0.3);
  };
  const canvas = fillPixels(size, (u, v) => {
    const [ci, ri, fu, fv] = cell(u, v);
    const shade = 0.86 + (mulberry32(seed * 77 + ri * 31 + ci)() - 0.5) * 0.26;
    const f = fbm(u * 3, v * 3);
    let r = 96 * shade + f * 30, g = 104 * shade + f * 30, b = 106 * shade + f * 28;
    // 湿痕从上往下
    const wet = clamp01((fbm(u * 1.5 + 3, v * 0.6) - 0.45) * 2) * clamp01(v * 1.6);
    r *= 1 - wet * 0.32; g *= 1 - wet * 0.3; b *= 1 - wet * 0.22;
    // 缝隙压黑
    const ex = Math.min(fu, 1 - fu) * cols, ey = Math.min(fv, 1 - fv) * rows;
    const edge = clamp01(Math.min(ex, ey) * 2.4);
    const dark = 0.42 + 0.58 * edge;
    return [r * dark, g * dark, b * dark];
  });
  return { map: canvas, normal: normalCanvasFromHeight(size, hFn, 2.6) };
}

/** 白灰抹面墙：剥落露土砖 + 底部盐霜带（潮汐线语言） */
export function plasterTexture(seed = 33, size = 512) {
  const fbm = makeFbm(seed, 5);
  const hFn = (u, v) => {
    const peel = clamp01((fbm(u * 1.2, v * 1.2) - 0.58) * 4);
    return clamp01(0.7 - peel * 0.35 + fbm(u * 6, v * 6) * 0.12);
  };
  const canvas = fillPixels(size, (u, v) => {
    const f = fbm(u * 1.2, v * 1.2);
    const peel = clamp01((f - 0.58) * 4); // 剥落程度（收敛，避免读成砖墙）
    // 白灰 → 露出夯土
    let r = 176 - peel * 44, g = 176 - peel * 52, b = 168 - peel * 58;
    const stain = clamp01((fbm(u * 1.2 + 8, v * 0.5 + 3) - 0.4) * 1.6) * v;
    r *= 1 - stain * 0.24; g *= 1 - stain * 0.26; b *= 1 - stain * 0.2;
    // 底部盐霜带（v→1 是墙根）
    const salt = clamp01((v - 0.62) * 3.2) * (0.6 + fbm(u * 5, v * 5) * 0.6);
    r = r + (208 - r) * salt; g = g + (204 - g) * salt; b = b + (192 - b) * salt;
    const grain = (fbm(u * 10, v * 10) - 0.5) * 18;
    return [r + grain, g + grain, b + grain];
  });
  return { map: canvas, normal: normalCanvasFromHeight(size, hFn, 1.6) };
}

/** 闽东青瓦：横向弧形瓦垄 */
export function roofTileTexture(seed = 44, size = 512) {
  const fbm = makeFbm(seed, 3);
  const cols = 8, rows = 5;
  const hFn = (u, v) => {
    const arc = Math.abs(Math.sin(u * Math.PI * cols));     // 瓦垄弧
    const rowv = v * rows;
    const step = Math.abs(rowv - Math.round(rowv));
    const rowEdge = clamp01(step * rows * 1.2);
    return clamp01(arc * 0.55 + rowEdge * 0.35 + fbm(u * 4, v * 4) * 0.1);
  };
  const canvas = fillPixels(size, (u, v) => {
    const arc = Math.abs(Math.sin(u * Math.PI * cols));
    const ri = Math.floor(v * rows);
    const shade = 0.85 + (mulberry32(seed + ri * 17 + Math.floor(u * cols))() - 0.5) * 0.2;
    const f = fbm(u * 4, v * 4);
    let r = (52 + arc * 26) * shade + f * 14;
    let g = (60 + arc * 28) * shade + f * 15;
    let b = (66 + arc * 30) * shade + f * 16;
    // 瓦垄间苔
    const moss = clamp01((0.25 - arc) * 3) * clamp01((f - 0.45) * 3);
    g += moss * 18; r *= 1 - moss * 0.3;
    // 盐白瓦缘
    const rowv = v * rows; const step = Math.abs(rowv - Math.round(rowv));
    const lip = clamp01((0.06 - step) * 12);
    r += lip * 40; g += lip * 40; b += lip * 38;
    return [r, g, b];
  });
  return { map: canvas, normal: normalCanvasFromHeight(size, hFn, 2.4) };
}

/** 滩涂泥沙：湿沙 + 潮汐波纹 + 碎贝 */
export function sandTexture(seed = 55, size = 512) {
  const fbm = makeFbm(seed, 5);
  const hFn = (u, v) => {
    const ripple = Math.sin((u * 6 + fbm(u, v) * 2) * Math.PI * 2) * 0.5 + 0.5;
    return clamp01(ripple * 0.3 + fbm(u * 3, v * 3) * 0.6);
  };
  const canvas = fillPixels(size, (u, v) => {
    const f = fbm(u * 3, v * 3);
    const ripple = Math.sin((u * 6 + fbm(u, v) * 2) * Math.PI * 2) * 0.5 + 0.5;
    let r = 88 + f * 34 + ripple * 12;
    let g = 82 + f * 32 + ripple * 11;
    let b = 70 + f * 26 + ripple * 9;
    // 湿处更深
    const wet = clamp01((f - 0.5) * 3);
    r *= 1 - wet * 0.3; g *= 1 - wet * 0.28; b *= 1 - wet * 0.2;
    // 碎贝白点
    const shell = fbm(u * 24, v * 24) > 0.82 ? 60 : 0;
    return [r + shell, g + shell, b + shell * 0.9];
  });
  return { map: canvas, normal: normalCanvasFromHeight(size, hFn, 1.4) };
}

/** 村路石板 */
export function slabTexture(seed = 66, size = 512) {
  const fbm = makeFbm(seed, 4);
  const n = 4;
  const hFn = (u, v) => {
    const fu = (u * n) % 1, fv = (v * n) % 1;
    const e = Math.min(fu, 1 - fu, fv, 1 - fv) * n;
    return clamp01(clamp01(e * 2) * 0.7 + fbm(u * 3, v * 3) * 0.3);
  };
  const canvas = fillPixels(size, (u, v) => {
    const iu = Math.floor(u * n), iv = Math.floor(v * n);
    const shade = 0.82 + (mulberry32(seed + iu * 13 + iv * 101)() - 0.5) * 0.3;
    const f = fbm(u * 4, v * 4);
    let r = 84 * shade + f * 26, g = 90 * shade + f * 27, b = 90 * shade + f * 26;
    const fu = (u * n) % 1, fv = (v * n) % 1;
    const e = Math.min(fu, 1 - fu, fv, 1 - fv) * n;
    const dark = 0.4 + 0.6 * clamp01(e * 2.4);
    const moss = clamp01((f - 0.6) * 4) * (1 - clamp01(e * 2));
    return [r * dark * (1 - moss * 0.4), g * dark + moss * 14, b * dark * (1 - moss * 0.3)];
  });
  return { map: canvas, normal: normalCanvasFromHeight(size, hFn, 2.0) };
}

/** 盐霜/盐堆 */
export function saltTexture(seed = 77, size = 256) {
  const fbm = makeFbm(seed, 5);
  const hFn = (u, v) => fbm(u * 4, v * 4);
  const canvas = fillPixels(size, (u, v) => {
    const f = fbm(u * 4, v * 4);
    const s = 190 + f * 50;
    return [s, s - 4, s - 14];
  });
  return { map: canvas, normal: normalCanvasFromHeight(size, hFn, 1.2) };
}

/** 礁岩：深色湿岩 */
export function rockTexture(seed = 88, size = 512) {
  const fbm = makeFbm(seed, 5);
  const hFn = (u, v) => fbm(u * 3, v * 3);
  const canvas = fillPixels(size, (u, v) => {
    const f = fbm(u * 3, v * 3);
    const crack = 0.55 + 0.45 * clamp01((Math.abs(fbm(u * 6, v * 6) - 0.5) - 0.02) * 8);
    let r = 66 + f * 46, g = 70 + f * 48, b = 72 + f * 48;
    const salt = clamp01((fbm(u * 5 + 2, v * 5 + 2) - 0.72) * 8);
    r += salt * 120; g += salt * 118; b += salt * 105;
    return [r * crack, g * crack, b * crack];
  });
  return { map: canvas, normal: normalCanvasFromHeight(size, hFn, 3.0) };
}

/** 水面法线（双层滚动用同一张，平铺） */
export function waterNormalTexture(seed = 99, size = 256) {
  const fbm = makeFbm(seed, 5);
  const hFn = (u, v) => fbm(u * 3, v * 3) * 0.7 + fbm(u * 9 + 4, v * 9 + 4) * 0.3;
  const canvas = normalCanvasFromHeight(size, hFn, 2.0);
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** 渔网（带 alpha） */
export function netTexture(size = 256) {
  const [c, ctx] = makeCanvas(size);
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(70,62,48,0.95)';
  ctx.lineWidth = 2.5;
  const n = 8;
  for (let i = -n; i <= n * 2; i++) {
    ctx.beginPath();
    ctx.moveTo((i / n) * size, 0);
    ctx.lineTo((i / n) * size + size * 0.5, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo((i / n) * size, 0);
    ctx.lineTo((i / n) * size - size * 0.5, size);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 灯笼纸面：暖色纸 + 「潮」字 */
export function lanternTexture(char = '潮', size = 256) {
  const [c, ctx] = makeCanvas(size);
  const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.7);
  grad.addColorStop(0, '#ffb45e');
  grad.addColorStop(0.6, '#e07830');
  grad.addColorStop(1, '#8a3d14');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  // 骨架竖线
  ctx.strokeStyle = 'rgba(80,30,8,0.5)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 8; i++) {
    ctx.beginPath(); ctx.moveTo((i / 8) * size, 0); ctx.lineTo((i / 8) * size, size); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(60,10,4,0.85)';
  ctx.font = `${size * 0.44}px "Songti SC","Noto Serif SC",serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(char, size / 2, size / 2 + size * 0.02);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 布告/符纸 */
export function talismanTexture(size = 128) {
  const [c, ctx] = makeCanvas(size);
  ctx.fillStyle = '#b8a24e';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#8f1d12';
  ctx.font = `${size * 0.22}px "Songti SC",serif`;
  ctx.textAlign = 'center';
  const chars = ['潮', '母', '锁', '喉', '安'];
  chars.forEach((ch, i) => ctx.fillText(ch, size / 2, size * 0.2 + i * size * 0.17));
  ctx.strokeStyle = 'rgba(90,20,10,0.6)';
  ctx.lineWidth = 3;
  ctx.strokeRect(size * 0.08, size * 0.04, size * 0.84, size * 0.92);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 潮尸皮肤：青白 + 盐霜 + 静脉 */
export function corpseSkinTexture(seed = 111, size = 256) {
  const fbm = makeFbm(seed, 4);
  const hFn = (u, v) => fbm(u * 4, v * 4) * 0.5;
  const canvas = fillPixels(size, (u, v) => {
    const f = fbm(u * 4, v * 4);
    let r = 148 + f * 24, g = 158 + f * 26, b = 158 + f * 24;
    // 静脉青
    const vein = clamp01((Math.abs(fbm(u * 7 + 3, v * 7 + 3) - 0.5) < 0.03 ? 1 : 0) * 0.8);
    r -= vein * 34; g -= vein * 12; b += vein * 4;
    // 盐霜
    const salt = clamp01((fbm(u * 6 + 9, v * 6 + 9) - 0.66) * 7);
    r += salt * 70; g += salt * 66; b += salt * 56;
    return [r, g, b];
  });
  return { map: canvas, normal: normalCanvasFromHeight(size, hFn, 1.0) };
}

/** 深蓝渔民布衣 */
export function clothTexture(seed = 122, baseRGB = [38, 46, 62], size = 256) {
  const fbm = makeFbm(seed, 4);
  const hFn = (u, v) => (Math.sin(u * 200) * 0.5 + 0.5) * 0.15 + fbm(u * 3, v * 3) * 0.3;
  const canvas = fillPixels(size, (u, v) => {
    const f = fbm(u * 3, v * 3);
    const weave = (Math.sin(u * 220) + Math.sin(v * 220)) * 3;
    const salt = clamp01((fbm(u * 5 + 1, v * 5 + 1) - 0.7) * 6) * clamp01(v * 2 - 0.7);
    let r = baseRGB[0] + f * 20 + weave + salt * 120;
    let g = baseRGB[1] + f * 20 + weave + salt * 116;
    let b = baseRGB[2] + f * 22 + weave + salt * 100;
    return [r, g, b];
  });
  return { map: canvas, normal: normalCanvasFromHeight(size, hFn, 0.8) };
}

// ---------------- 打包导出 ----------------
export function buildTextureSet() {
  const set = {};
  const defs = {
    wood: woodTexture(7),
    stone: stoneTexture(21),
    plaster: plasterTexture(33),
    roof: roofTileTexture(44),
    sand: sandTexture(55),
    slab: slabTexture(66),
    salt: saltTexture(77),
    rock: rockTexture(88),
    corpseSkin: corpseSkinTexture(111),
    clothNavy: clothTexture(122, [38, 46, 62]),
    clothGrey: clothTexture(123, [58, 60, 58]),
    clothRed: clothTexture(124, [96, 26, 22]),
  };
  for (const [k, v] of Object.entries(defs)) {
    set[k] = {
      map: toTex(v.map),
      normalMap: toTex(v.normal, { srgb: false }),
    };
  }
  set.waterNormal = waterNormalTexture(99);
  set.net = netTexture();
  set.lantern = lanternTexture('潮');
  set.lanternJi = lanternTexture('祭');
  set.talisman = talismanTexture();
  return set;
}
