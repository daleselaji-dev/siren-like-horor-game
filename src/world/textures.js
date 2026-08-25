// 程序化贴图库 v3：全部用 Canvas 在运行时生成（漫反射 + 高度→法线 + 粗糙度 + AO），零二进制资产。
// 风格规范见 docs/美术圣经.md：低饱和青灰基调、盐霜、湿痕。
// v3 管线：单趟逐像素同时产出 颜色/高度/粗糙度，法线由高度场数组差分（平铺无缝），
//          AO 由高度场双尺度盒模糊凹腔法推导（板缝/石缝/静脉沟壑真正吃光），
//          非低配下关键材质 768–1024 分辨率；粗糙度图让"湿"真正反光。
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
  return (x, y) => {
    x = ((x % 1) + 1) % 1 * grid;
    y = ((y % 1) + 1) % 1 * grid;
    const xi = x | 0, yi = y | 0;
    let xf = x - xi, yf = y - yi;
    xf = xf * xf * (3 - 2 * xf);
    yf = yf * yf * (3 - 2 * yf);
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

// 脊状噪声（细裂缝/静脉：|n-0.5| 反转出细线网络）
function makeRidged(seed, octaves = 3) {
  const fbm = makeFbm(seed, octaves);
  return (x, y) => 1 - Math.abs(fbm(x, y) - 0.5) * 2; // 1 = 脊线上
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function sstep(a, b, t) { t = clamp01((t - a) / (b - a)); return t * t * (3 - 2 * t); }

// 平铺盒模糊（可分离，O(n)）：AO 凹腔法的基础
function boxBlurWrap(src, size, radius) {
  const tmp = new Float32Array(size * size);
  const out = new Float32Array(size * size);
  const w = radius * 2 + 1;
  for (let y = 0; y < size; y++) {
    const row = y * size;
    let sum = 0;
    for (let i = -radius; i <= radius; i++) sum += src[row + ((i + size) % size)];
    for (let x = 0; x < size; x++) {
      tmp[row + x] = sum / w;
      sum += src[row + ((x + radius + 1) % size)] - src[row + ((x - radius + size) % size)];
    }
  }
  for (let x = 0; x < size; x++) {
    let sum = 0;
    for (let i = -radius; i <= radius; i++) sum += tmp[((i + size) % size) * size + x];
    for (let y = 0; y < size; y++) {
      out[y * size + x] = sum / w;
      sum += tmp[((y + radius + 1) % size) * size + x] - tmp[((y - radius + size) % size) * size + x];
    }
  }
  return out;
}

/**
 * v3 核心：单趟逐像素填充 颜色 + 高度 + 粗糙度；再由高度场差分出法线、
 * 双尺度凹腔差推导 AO（低于周围平均高度的像素在吃阴影）。
 * fn(u, v, out)：写 out[0..2]=RGB(0-255)  out[3]=height(0-1)  out[4]=rough(0-1)
 * 返回 { map, normal, rough, ao }（均为 canvas）
 */
function buildMaps(size, fn, normalStrength = 1.8) {
  const [cMap, ctxMap] = makeCanvas(size);
  const [cRough, ctxRough] = makeCanvas(size);
  const imgMap = ctxMap.createImageData(size, size);
  const imgRough = ctxRough.createImageData(size, size);
  const dM = imgMap.data, dR = imgRough.data;
  const H = new Float32Array(size * size);
  const out = new Float32Array(5);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      fn(u, v, out);
      const i = y * size + x, i4 = i * 4;
      dM[i4] = out[0]; dM[i4 + 1] = out[1]; dM[i4 + 2] = out[2]; dM[i4 + 3] = 255;
      H[i] = out[3];
      const r8 = clamp01(out[4]) * 255;
      dR[i4] = r8; dR[i4 + 1] = r8; dR[i4 + 2] = r8; dR[i4 + 3] = 255;
    }
  }
  ctxMap.putImageData(imgMap, 0, 0);
  ctxRough.putImageData(imgRough, 0, 0);
  // 法线：高度场差分（wrap 平铺）
  const [cN, ctxN] = makeCanvas(size);
  const imgN = ctxN.createImageData(size, size);
  const dN = imgN.data;
  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size, yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size, xp = (x + 1) % size;
      let nx = (H[y * size + xm] - H[y * size + xp]) * normalStrength * size / 512;
      let ny = (H[ym * size + x] - H[yp * size + x]) * normalStrength * size / 512;
      const inv = 1 / Math.hypot(nx, ny, 1);
      nx *= inv; ny *= inv;
      const i4 = (y * size + x) * 4;
      dN[i4] = (nx * 0.5 + 0.5) * 255;
      dN[i4 + 1] = (ny * 0.5 + 0.5) * 255;
      dN[i4 + 2] = inv * 255;
      dN[i4 + 3] = 255;
    }
  }
  ctxN.putImageData(imgN, 0, 0);
  // AO：双尺度凹腔（小半径抓缝隙刻痕，大半径抓整体起伏的背光坑）
  const rSmall = Math.max(2, size >> 7);
  const rLarge = Math.max(6, size >> 5);
  const bSmall = boxBlurWrap(H, size, rSmall);
  const bLarge = boxBlurWrap(H, size, rLarge);
  const [cAO, ctxAO] = makeCanvas(size);
  const imgAO = ctxAO.createImageData(size, size);
  const dA = imgAO.data;
  for (let i = 0; i < size * size; i++) {
    const cav = Math.max(0, bSmall[i] - H[i]) * 2.4 + Math.max(0, bLarge[i] - H[i]) * 1.5;
    const ao = (1 - Math.min(0.62, cav)) * 255;
    const i4 = i * 4;
    dA[i4] = dA[i4 + 1] = dA[i4 + 2] = ao;
    dA[i4 + 3] = 255;
  }
  ctxAO.putImageData(imgAO, 0, 0);
  return { map: cMap, normal: cN, rough: cRough, ao: cAO };
}

function toTex(canvas, { srgb = true, repeat = [1, 1], aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

// ---------------- 具体贴图 ----------------
// 每个生成器返回 { map, normal, rough }

/** 渔船木板 v2：年轮流纹 + 节疤 + 板端钉头 + 苔绿 + 盐霜白斑 + 湿streak反光 */
export function woodTexture(seed = 7, size = 512) {
  const fbm = makeFbm(seed, 4);
  const fbm2 = makeFbm(seed + 71, 4);
  const planks = 7;
  // 每块板：色深、节疤位置（0-2个）
  const rand = mulberry32(seed * 51);
  const plankShade = [], knots = [];
  for (let p = 0; p < planks; p++) {
    plankShade.push(0.8 + (rand() - 0.5) * 0.34);
    const n = rand() < 0.6 ? 1 : 2;
    const ks = [];
    for (let k = 0; k < n; k++) ks.push([rand(), 0.25 + rand() * 0.5]); // [u, 板内v]
    knots.push(ks);
  }
  return buildMaps(size, (u, v, out) => {
    const pv = v * planks;
    const pi = Math.min(planks - 1, pv | 0);
    const lv = pv - pi;               // 板内 0..1
    const gap = Math.min(lv, 1 - lv); // 距板缝
    const warp = fbm(u * 2, v * 2);
    // 年轮流纹：沿板长的波浪细纹
    const grain = 0.5 + 0.5 * Math.sin((lv * 9 + warp * 5 + u * 2.4) * Math.PI * 2)
      * (0.55 + fbm2(u * 6, v * 6) * 0.45);
    // 节疤：径向环纹 + 中心深色
    let knot = 0;
    for (const [ku, kv] of knots[pi]) {
      const dx = (u - ku) * 3.4, dy = (lv - kv) * 1.0;
      const d = Math.hypot(dx, dy);
      if (d < 0.16) knot = Math.max(knot, (1 - d / 0.16) * (0.55 + 0.45 * Math.sin(d * 90)));
    }
    const shade = plankShade[pi];
    let r = (64 + grain * 30) * shade;
    let g = (50 + grain * 24) * shade;
    let b = (38 + grain * 17) * shade;
    // 节疤压深
    r *= 1 - knot * 0.5; g *= 1 - knot * 0.52; b *= 1 - knot * 0.45;
    // 苔绿（潮湿面聚在板缝与低洼）
    const moss = clamp01((fbm(u * 3.3, v * 3.3) - 0.6) * 4) * (0.4 + (1 - gap * 6) * 0.6);
    r *= 1 - moss * 0.45; g += moss * 15; b *= 1 - moss * 0.35;
    // 盐霜斑
    const salt = clamp01((fbm(u * 3 + 5, v * 3 + 5) - 0.66) * 6);
    r += salt * 108; g += salt * 106; b += salt * 94;
    // 湿痕（顺板长方向的暗条 → 低粗糙度）
    const wet = clamp01((fbm2(u * 1.4 + 9, v * 7) - 0.55) * 3.2);
    r *= 1 - wet * 0.28; g *= 1 - wet * 0.26; b *= 1 - wet * 0.18;
    // 板缝压黑
    const dark = 0.34 + 0.66 * clamp01(gap * planks * 1.7);
    // 钉头：板端两粒
    let nail = 0;
    const ue = Math.min(u, 1 - u);
    if (ue < 0.05) {
      const nd = Math.hypot((ue - 0.028) * 22, (lv - 0.5) * 2.6);
      if (nd < 0.3) nail = 1 - nd / 0.3;
    }
    r = r * dark * (1 - nail * 0.55) + nail * 30;
    g = g * dark * (1 - nail * 0.55) + nail * 30;
    b = b * dark * (1 - nail * 0.5) + nail * 32;
    out[0] = r; out[1] = g; out[2] = b;
    out[3] = clamp01(clamp01(gap * planks * 1.7) * 0.62 + grain * 0.2 + warp * 0.16 - knot * 0.3 + salt * 0.1);
    out[4] = clamp01(0.78 + grain * 0.1 - wet * 0.42 - moss * 0.1 + salt * 0.14);
  }, 2.6);
}

/** 花岗条石 v2：凿痕 + 边角崩缺 + 苔衣 + 潮湿反光 */
export function stoneTexture(seed = 21, size = 512) {
  const fbm = makeFbm(seed, 4);
  const chisel = makeValueNoise(seed + 13, 96);
  const rows = 4, cols = 3;
  const cellRand = (ri, ci) => mulberry32(seed * 77 + ri * 31 + ci)();
  return buildMaps(size, (u, v, out) => {
    const rv = v * rows;
    const ri = Math.min(rows - 1, rv | 0);
    const off = (ri % 2) * 0.5;
    const cu = u * cols + off;
    const ci = cu | 0;
    const fu = cu - ci, fv = rv - ri;
    const ex = Math.min(fu, 1 - fu) * cols, ey = Math.min(fv, 1 - fv) * rows;
    const edge = clamp01(Math.min(ex, ey) * 2.2);
    const cr = cellRand(ri, ci);
    const shade = 0.82 + (cr - 0.5) * 0.3;
    const f = fbm(u * 3, v * 3);
    // 凿痕：每块石头一个方向的细密刻纹
    const cAng = cr * 3.14;
    const cx = u * Math.cos(cAng) - v * Math.sin(cAng);
    const chiselMark = chisel(cx * 3.2, (u * Math.sin(cAng) + v * Math.cos(cAng)) * 0.35);
    let r = (92 + f * 30 + chiselMark * 16) * shade;
    let g = (100 + f * 30 + chiselMark * 16) * shade;
    let b = (103 + f * 28 + chiselMark * 15) * shade;
    // 边角崩缺（靠近棱且噪声高 → 深色缺口）
    const chip = (edge < 0.5 ? 1 - edge * 2 : 0) * clamp01((fbm(u * 8 + 3, v * 8 + 3) - 0.56) * 5);
    r *= 1 - chip * 0.4; g *= 1 - chip * 0.4; b *= 1 - chip * 0.36;
    // 苔衣（下半湿区绿斑）
    const lichen = clamp01((fbm(u * 5 + 11, v * 5 + 11) - 0.63) * 5) * sstep(0.3, 0.8, v);
    r *= 1 - lichen * 0.4; g += lichen * 10; b *= 1 - lichen * 0.3;
    // 湿痕从上往下淌
    const wet = clamp01((fbm(u * 1.5 + 3, v * 0.6) - 0.42) * 2) * clamp01(v * 1.7);
    r *= 1 - wet * 0.34; g *= 1 - wet * 0.32; b *= 1 - wet * 0.22;
    // 盐霜（棱上泛白）
    const salt = clamp01((fbm(u * 6 + 7, v * 6 + 7) - 0.7) * 7) * edge;
    r += salt * 90; g += salt * 88; b += salt * 78;
    // 缝隙压黑
    const dark = 0.36 + 0.64 * edge;
    out[0] = r * dark; out[1] = g * dark; out[2] = b * dark;
    out[3] = clamp01(edge * 0.72 + f * 0.22 + chiselMark * 0.1 - chip * 0.35);
    out[4] = clamp01(0.8 - wet * 0.42 - lichen * 0.1 + salt * 0.12 + chiselMark * 0.05);
  }, 3.0);
}

/** 白灰抹面墙 v2：剥落露青砖 + 裂缝网络 + 滴水锈痕 + 底部盐霜带 */
export function plasterTexture(seed = 33, size = 512) {
  const fbm = makeFbm(seed, 5);
  const ridge = makeRidged(seed + 5, 4);
  const drip = makeValueNoise(seed + 23, 48);
  return buildMaps(size, (u, v, out) => {
    const f = fbm(u * 1.2, v * 1.2);
    const peel = clamp01((f - 0.56) * 4.5);       // 剥落程度
    // 裂缝：脊状噪声细线（只在灰面上）
    const crack = clamp01((ridge(u * 2.2, v * 2.2) - 0.94) * 18) * (1 - peel);
    let r, g, b, h, ro;
    if (peel > 0.5) {
      // 露出青砖：砖行 + 灰缝
      const bu = u * 6, bv = v * 12;
      const bri = bv | 0;
      const bfu = ((bu + (bri % 2) * 0.5) % 1), bfv = bv % 1;
      const mortar = Math.min(Math.min(bfu, 1 - bfu) * 6, Math.min(bfv, 1 - bfv) * 12);
      const brickShade = 0.8 + (mulberry32(seed + bri * 53 + ((bu + (bri % 2) * 0.5) | 0) * 17)() - 0.5) * 0.3;
      const mk = clamp01(mortar * 1.5);
      r = (108 * brickShade) * (0.55 + 0.45 * mk) + (1 - mk) * 30;
      g = (104 * brickShade) * (0.55 + 0.45 * mk) + (1 - mk) * 30;
      b = (98 * brickShade) * (0.55 + 0.45 * mk) + (1 - mk) * 28;
      h = 0.42 + mk * 0.1;
      ro = 0.92;
    } else {
      // 白灰面
      r = 172; g = 171; b = 163;
      const stain = clamp01((fbm(u * 1.2 + 8, v * 0.5 + 3) - 0.4) * 1.6) * v;
      r *= 1 - stain * 0.24; g *= 1 - stain * 0.26; b *= 1 - stain * 0.2;
      h = 0.7 - peel * 0.3;
      ro = 0.9;
      // 剥落边缘阴影（半剥落带）
      const rim = sstep(0.28, 0.5, peel);
      r *= 1 - rim * 0.28; g *= 1 - rim * 0.3; b *= 1 - rim * 0.32;
    }
    // 裂缝压黑刻深
    r *= 1 - crack * 0.5; g *= 1 - crack * 0.5; b *= 1 - crack * 0.48;
    h -= crack * 0.22;
    // 滴水痕（窗台/檐口淌下来的竖条锈灰）
    const dr = clamp01((drip(u * 6, 0.15) - 0.62) * 5) * sstep(0.12, 0.75, v);
    r *= 1 - dr * 0.2; g *= 1 - dr * 0.22; b *= 1 - dr * 0.2;
    // 底部盐霜带（潮汐线语言）
    const salt = clamp01((v - 0.6) * 3.0) * (0.55 + fbm(u * 5, v * 5) * 0.65);
    r += (206 - r) * salt; g += (202 - g) * salt; b += (190 - b) * salt;
    const grain = (fbm(u * 10, v * 10) - 0.5) * 16;
    out[0] = r + grain; out[1] = g + grain; out[2] = b + grain;
    out[3] = clamp01(h + fbm(u * 6, v * 6) * 0.1);
    out[4] = clamp01(ro + salt * 0.06 - dr * 0.2);
  }, 2.0);
}

/** 闽东青瓦 v2：弧形瓦垄 + 破瓦错位 + 垄间苔 + 瓦缘盐白 */
export function roofTileTexture(seed = 44, size = 512) {
  const fbm = makeFbm(seed, 3);
  const cols = 9, rows = 6;
  const broken = (ci, ri) => mulberry32(seed + ri * 37 + ci * 11)() < 0.08;
  return buildMaps(size, (u, v, out) => {
    const arc = Math.abs(Math.sin(u * Math.PI * cols));
    const ci = (u * cols) | 0;
    const rv = v * rows;
    const ri = Math.min(rows - 1, rv | 0);
    const step = Math.abs(rv - Math.round(rv));
    const shade = 0.82 + (mulberry32(seed + ri * 17 + ci)() - 0.5) * 0.24;
    const f = fbm(u * 4, v * 4);
    const isBroken = broken(ci, ri);
    let r = (50 + arc * 27) * shade + f * 14;
    let g = (58 + arc * 29) * shade + f * 15;
    let b = (64 + arc * 31) * shade + f * 16;
    if (isBroken) { r *= 0.6; g *= 0.6; b *= 0.62; }
    // 瓦垄间苔
    const moss = clamp01((0.25 - arc) * 3) * clamp01((f - 0.42) * 3);
    g += moss * 20; r *= 1 - moss * 0.34;
    // 盐白瓦缘
    const lip = clamp01((0.06 - step) * 12);
    r += lip * 42; g += lip * 42; b += lip * 40;
    // 湿光：瓦垄顶面
    const wet = arc * clamp01((f - 0.35) * 2);
    out[0] = r; out[1] = g; out[2] = b;
    out[3] = clamp01(arc * 0.5 + clamp01(step * rows * 1.2) * 0.32 + f * 0.1 - (isBroken ? 0.25 : 0));
    out[4] = clamp01(0.72 - wet * 0.3 + moss * 0.15 + lip * 0.1);
  }, 2.8);
}

/** 滩涂泥沙 v2：潮汐波纹 + 湿洼反光 + 碎贝 */
export function sandTexture(seed = 55, size = 512) {
  const fbm = makeFbm(seed, 5);
  return buildMaps(size, (u, v, out) => {
    const f = fbm(u * 3, v * 3);
    const ripple = Math.sin((u * 6 + fbm(u, v) * 2) * Math.PI * 2) * 0.5 + 0.5;
    const ripple2 = Math.sin((v * 9 + fbm(u + 4, v) * 1.6) * Math.PI * 2) * 0.5 + 0.5;
    let r = 86 + f * 34 + ripple * 12 + ripple2 * 5;
    let g = 80 + f * 32 + ripple * 11 + ripple2 * 5;
    let b = 68 + f * 26 + ripple * 9 + ripple2 * 4;
    // 湿洼更深更亮（低粗糙）
    const wet = clamp01((f - 0.48) * 3.2);
    r *= 1 - wet * 0.32; g *= 1 - wet * 0.3; b *= 1 - wet * 0.2;
    // 碎贝白点
    const shell = fbm(u * 24, v * 24) > 0.8 ? 55 : 0;
    out[0] = r + shell; out[1] = g + shell; out[2] = b + shell * 0.9;
    out[3] = clamp01(ripple * 0.28 + ripple2 * 0.1 + f * 0.55);
    out[4] = clamp01(0.92 - wet * 0.5 + (shell ? 0.05 : 0));
  }, 1.6);
}

/** 村路石板 v2：崩角 + 积水洼(镜面) + 缝里苔 */
export function slabTexture(seed = 66, size = 512) {
  const fbm = makeFbm(seed, 4);
  const n = 5;
  return buildMaps(size, (u, v, out) => {
    const iu = (u * n) | 0, iv = (v * n) | 0;
    const shade = 0.8 + (mulberry32(seed + iu * 13 + iv * 101)() - 0.5) * 0.3;
    const f = fbm(u * 4, v * 4);
    const fu = (u * n) % 1, fv = (v * n) % 1;
    const e = Math.min(fu, 1 - fu, fv, 1 - fv) * n;
    const edge = clamp01(e * 2.3);
    let r = 82 * shade + f * 26, g = 88 * shade + f * 27, b = 88 * shade + f * 26;
    // 崩角
    const corner = Math.max(0, 0.4 - Math.hypot(Math.min(fu, 1 - fu), Math.min(fv, 1 - fv)) * n)
      * clamp01((mulberry32(seed + iu * 29 + iv * 7)() - 0.55) * 4);
    r *= 1 - corner * 0.6; g *= 1 - corner * 0.6; b *= 1 - corner * 0.56;
    // 积水洼（板面中央低洼处 → 深色近镜面）
    const puddle = clamp01((f - 0.58) * 5) * edge;
    r *= 1 - puddle * 0.45; g *= 1 - puddle * 0.4; b *= 1 - puddle * 0.28;
    // 缝里苔
    const moss = clamp01((f - 0.55) * 4) * (1 - edge);
    const dark = 0.36 + 0.64 * edge;
    out[0] = r * dark * (1 - moss * 0.4);
    out[1] = g * dark + moss * 16;
    out[2] = b * dark * (1 - moss * 0.3);
    out[3] = clamp01(edge * 0.62 + f * 0.28 - corner * 0.3 - puddle * 0.1);
    out[4] = clamp01(0.75 - puddle * 0.55 + moss * 0.12 - corner * 0.05);
  }, 2.4);
}

/** 盐霜/盐堆 v2：结晶颗粒闪点 */
export function saltTexture(seed = 77, size = 256) {
  const fbm = makeFbm(seed, 5);
  const sparkle = makeValueNoise(seed + 3, 128);
  return buildMaps(size, (u, v, out) => {
    const f = fbm(u * 4, v * 4);
    const sp = sparkle(u * 2, v * 2) > 0.88 ? 1 : 0;
    const s = 188 + f * 48 + sp * 20;
    out[0] = s; out[1] = s - 4; out[2] = s - 14;
    out[3] = f * 0.8 + sp * 0.2;
    out[4] = 0.6 - sp * 0.45 + f * 0.2; // 结晶点接近镜面闪
  }, 1.6);
}

/** 礁岩 v2：裂缝脉络 + 藤壶斑 + 湿黑 */
export function rockTexture(seed = 88, size = 512) {
  const fbm = makeFbm(seed, 5);
  const ridge = makeRidged(seed + 17, 4);
  return buildMaps(size, (u, v, out) => {
    const f = fbm(u * 3, v * 3);
    const crackLine = clamp01((ridge(u * 2.6, v * 2.6) - 0.9) * 12);
    let r = 62 + f * 46, g = 66 + f * 48, b = 68 + f * 48;
    r *= 1 - crackLine * 0.55; g *= 1 - crackLine * 0.55; b *= 1 - crackLine * 0.5;
    // 藤壶：密集小白环
    const bar = fbm(u * 16, v * 16);
    const barnacle = bar > 0.72 ? clamp01((bar - 0.72) * 10) : 0;
    r += barnacle * 70; g += barnacle * 66; b += barnacle * 56;
    // 盐霜
    const salt = clamp01((fbm(u * 5 + 2, v * 5 + 2) - 0.72) * 8);
    r += salt * 110; g += salt * 108; b += salt * 96;
    // 湿黑（下部）
    const wet = sstep(0.45, 0.95, v) * (0.5 + f * 0.5);
    r *= 1 - wet * 0.4; g *= 1 - wet * 0.36; b *= 1 - wet * 0.26;
    out[0] = r; out[1] = g; out[2] = b;
    out[3] = clamp01(f * 0.8 - crackLine * 0.3 + barnacle * 0.12);
    out[4] = clamp01(0.72 - wet * 0.4 + salt * 0.15 + barnacle * 0.1);
  }, 3.4);
}

/** 水面法线（双层滚动用同一张，平铺） */
export function waterNormalTexture(seed = 99, size = 512) {
  const fbm = makeFbm(seed, 5);
  const { normal } = buildMaps(size, (u, v, out) => {
    const h = fbm(u * 3, v * 3) * 0.62 + fbm(u * 9 + 4, v * 9 + 4) * 0.26 + fbm(u * 21 + 9, v * 21 + 9) * 0.12;
    out[0] = out[1] = out[2] = 0; out[3] = h; out[4] = 0;
  }, 2.2);
  const t = new THREE.CanvasTexture(normal);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** 渔网（带 alpha，绳股加粗留破洞） */
export function netTexture(size = 256) {
  const [c, ctx] = makeCanvas(size);
  ctx.clearRect(0, 0, size, size);
  const rand = mulberry32(4242);
  const n = 8;
  for (let i = -n; i <= n * 2; i++) {
    // 破洞：随机跳过若干股
    const broken = rand() < 0.12;
    ctx.strokeStyle = `rgba(66,58,45,${broken ? 0.35 : 0.95})`;
    ctx.lineWidth = 2.2 + rand() * 1.2;
    ctx.beginPath();
    ctx.moveTo((i / n) * size, 0);
    ctx.lineTo((i / n) * size + size * 0.5, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo((i / n) * size, 0);
    ctx.lineTo((i / n) * size - size * 0.5, size);
    ctx.stroke();
  }
  // 结点
  ctx.fillStyle = 'rgba(80,70,52,0.9)';
  for (let i = 0; i < 60; i++) {
    ctx.fillRect(rand() * size, rand() * size, 3, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 灯笼纸面：暖色纸 + 竹骨 + 底部油渍 + 「潮」字 */
export function lanternTexture(char = '潮', size = 256) {
  const [c, ctx] = makeCanvas(size);
  const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size * 0.72);
  grad.addColorStop(0, '#ffc470');
  grad.addColorStop(0.5, '#e8823a');
  grad.addColorStop(0.85, '#a04a1a');
  grad.addColorStop(1, '#712f0e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  // 纸纹
  const rand = mulberry32(888);
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(120,50,16,${(rand() * 0.06).toFixed(3)})`;
    ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 4, 1);
  }
  // 竹骨竖线（带高光边）
  for (let i = 0; i <= 8; i++) {
    const x = (i / 8) * size;
    ctx.strokeStyle = 'rgba(70,26,6,0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,200,130,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 2, 0); ctx.lineTo(x + 2, size); ctx.stroke();
  }
  // 底部油渍熏黑
  const soot = ctx.createLinearGradient(0, size * 0.72, 0, size);
  soot.addColorStop(0, 'rgba(30,10,4,0)');
  soot.addColorStop(1, 'rgba(30,10,4,0.5)');
  ctx.fillStyle = soot;
  ctx.fillRect(0, size * 0.72, size, size * 0.28);
  ctx.fillStyle = 'rgba(52,8,4,0.88)';
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
  // 纸斑
  const rand = mulberry32(777);
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(90,66,26,${(rand() * 0.16).toFixed(3)})`;
    ctx.fillRect(rand() * size, rand() * size, 2 + rand() * 5, 1 + rand() * 3);
  }
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

/** 潮尸皮肤 v2：溺亡青灰 + 大理石纹尸斑 + 分枝静脉 + 盐痂 + 湿油光 */
export function corpseSkinTexture(seed = 111, size = 512) {
  const fbm = makeFbm(seed, 4);
  const vein1 = makeRidged(seed + 31, 4);
  const vein2 = makeRidged(seed + 67, 3);
  return buildMaps(size, (u, v, out) => {
    const f = fbm(u * 4, v * 4);
    // 底色：泡了三年的青白
    let r = 138 + f * 26, g = 150 + f * 28, b = 150 + f * 26;
    // 尸斑大理石纹（低频块状瘀紫）
    const mottle = clamp01((fbm(u * 1.6 + 13, v * 1.6 + 13) - 0.52) * 3.2);
    r += mottle * 16; g -= mottle * 20; b -= mottle * 8;
    // 分枝静脉：两个尺度的脊线网络（drowned marbling）
    const vn1 = clamp01((vein1(u * 2.2, v * 2.2) - 0.9) * 12) * (0.4 + mottle);
    const vn2 = clamp01((vein2(u * 5, v * 5) - 0.92) * 16) * 0.7;
    const vn = Math.max(vn1, vn2);
    r -= vn * 42; g -= vn * 16; b += vn * 4;
    // 盐痂（边缘清晰的白硬壳）
    const saltF = fbm(u * 6 + 9, v * 6 + 9);
    const salt = sstep(0.66, 0.72, saltF);
    r += salt * (216 - r) * 0.85; g += salt * (212 - g) * 0.85; b += salt * (198 - b) * 0.85;
    // 藤壶环带（皮肤上长出的小白环——海把他们当礁石用了三年）
    const bn = fbm(u * 14 + 3, v * 14 + 3);
    const barn = sstep(0.735, 0.765, bn) * (1 - sstep(0.79, 0.83, bn));
    r += barn * 52; g += barn * 48; b += barn * 40;
    // 皮下浅淤（贴着静脉的一圈青黄）
    const bruise = clamp01((fbm(u * 2.8 + 21, v * 2.8 + 21) - 0.58) * 3) * (1 - salt);
    r -= bruise * 10; g += bruise * 6; b -= bruise * 14;
    // 毛孔/细噪
    const pore = (fbm(u * 22, v * 22) - 0.5) * 10;
    out[0] = r + pore; out[1] = g + pore; out[2] = b + pore;
    out[3] = clamp01(0.5 + f * 0.28 - vn * 0.2 + salt * 0.22 + barn * 0.12);
    out[4] = clamp01(0.4 + salt * 0.5 + mottle * 0.06 - f * 0.08 + barn * 0.3); // 湿尸低粗糙、盐痂/藤壶哑光
  }, 1.5);
}

/** 渔民布衣 v2：织纹 + 补丁 + 磨白 + 湿摆盐渍 */
export function clothTexture(seed = 122, baseRGB = [38, 46, 62], size = 256) {
  const fbm = makeFbm(seed, 4);
  const rand = mulberry32(seed * 3);
  // 2-3 块补丁
  const patches = [];
  const np = 2 + (rand() < 0.5 ? 1 : 0);
  for (let i = 0; i < np; i++) {
    patches.push([0.1 + rand() * 0.7, 0.1 + rand() * 0.7, 0.1 + rand() * 0.14, 0.08 + rand() * 0.12, (rand() - 0.5) * 0.4]);
  }
  return buildMaps(size, (u, v, out) => {
    const f = fbm(u * 3, v * 3);
    const weave = (Math.sin(u * 300) + Math.sin(v * 300)) * 2.4;
    let r = baseRGB[0] + f * 20 + weave;
    let g = baseRGB[1] + f * 20 + weave;
    let b = baseRGB[2] + f * 22 + weave;
    // 补丁：色偏 + 边缘缝线
    let onPatch = 0, stitch = 0;
    for (const [px, py, pw, ph, shift] of patches) {
      if (u > px && u < px + pw && v > py && v < py + ph) {
        onPatch = 1;
        const eb = Math.min(u - px, px + pw - u, v - py, py + ph - v);
        if (eb < 0.012 && ((u + v) * 90 | 0) % 2 === 0) stitch = 1;
        r = r * (1 + shift) + 6; g = g * (1 + shift * 0.7) + 4; b = b * (1 + shift * 0.4);
      }
    }
    r += stitch * 40; g += stitch * 36; b += stitch * 30;
    // 磨白（肘/膝高磨损区近似为噪声亮斑）
    const wear = clamp01((fbm(u * 2.4 + 6, v * 2.4 + 6) - 0.62) * 4);
    r += wear * 26; g += wear * 26; b += wear * 24;
    // 湿摆：下缘变深 + 盐渍线
    const wet = sstep(0.55, 0.95, v);
    r *= 1 - wet * 0.3; g *= 1 - wet * 0.3; b *= 1 - wet * 0.24;
    const saltLine = clamp01((fbm(u * 5 + 1, v * 5 + 1) - 0.62) * 6) * sstep(0.5, 0.72, v) * (1 - sstep(0.72, 0.9, v));
    r += saltLine * 100; g += saltLine * 96; b += saltLine * 84;
    out[0] = r; out[1] = g; out[2] = b;
    out[3] = clamp01(0.5 + weave * 0.02 + f * 0.24 + onPatch * 0.06);
    out[4] = clamp01(0.95 - wet * 0.26 + saltLine * 0.05);
  }, 1.0);
}

// ---------------- 打包导出 ----------------
/**
 * @param lowspec 低配：全部 256，跳过粗糙度图之外的高分辨率
 */
export function buildTextureSet(lowspec = false) {
  // 分辨率分级：hero(近景大面) / mid(常见) / small(小件)
  const hero = lowspec ? 256 : 1024;
  const mid = lowspec ? 256 : 512;
  const set = {};
  const defs = {
    wood: woodTexture(7, hero),
    stone: stoneTexture(21, hero),
    plaster: plasterTexture(33, hero),
    roof: roofTileTexture(44, mid),
    sand: sandTexture(55, mid),
    slab: slabTexture(66, mid),
    salt: saltTexture(77, lowspec ? 128 : 256),
    rock: rockTexture(88, mid),
    // 潮尸皮肤是全程近景主角——非低配给主视觉分辨率
    corpseSkin: corpseSkinTexture(111, hero),
    clothNavy: clothTexture(122, [38, 46, 62], lowspec ? 128 : 256),
    clothGrey: clothTexture(123, [58, 60, 58], lowspec ? 128 : 256),
    clothRed: clothTexture(124, [110, 22, 18], lowspec ? 128 : 256),
  };
  const aniso = lowspec ? 2 : 8;
  for (const [k, v] of Object.entries(defs)) {
    const aoTex = toTex(v.ao, { srgb: false, aniso });
    aoTex.channel = 0; // 复用第一套 UV（合批几何只有一套）
    set[k] = {
      map: toTex(v.map, { aniso }),
      normalMap: toTex(v.normal, { srgb: false, aniso }),
      roughnessMap: toTex(v.rough, { srgb: false, aniso }),
      aoMap: aoTex,
    };
  }
  set.waterNormal = waterNormalTexture(99, lowspec ? 256 : 512);
  set.net = netTexture();
  set.lantern = lanternTexture('潮');
  set.lanternJi = lanternTexture('祭');
  set.talisman = talismanTexture();
  return set;
}
