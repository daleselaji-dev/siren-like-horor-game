// 程序化贴图库 v2：全部用 Canvas 在运行时生成（漫反射 + 高度→法线 + 粗糙度），零二进制资产。
// 风格规范见 docs/美术圣经.md：低饱和青灰基调、盐霜、湿痕。
// v2 管线：单趟逐像素同时产出 颜色/高度/粗糙度，法线由高度场数组差分（平铺无缝），
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

// 平铺细胞噪声（Worley）：返回 {f1,f2}（到最近/次近特征点的距离，单位=细胞格）
// f1→0 处是细胞中心（毛孔/石屑心），f2-f1→0 处是细胞边界（皮沟/裂缝网）
function makeCellular(seed, grid) {
  const rand = mulberry32(seed);
  const px = new Float32Array(grid * grid);
  const py = new Float32Array(grid * grid);
  for (let i = 0; i < grid * grid; i++) { px[i] = rand(); py[i] = rand(); }
  const res = { f1: 0, f2: 0 };
  return (x, y) => {
    x = (((x % 1) + 1) % 1) * grid;
    y = (((y % 1) + 1) % 1) * grid;
    const xi = x | 0, yi = y | 0;
    let b1 = 1e9, b2 = 1e9;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = (xi + dx + grid) % grid, cy = (yi + dy + grid) % grid;
        const fx = xi + dx + px[cy * grid + cx], fy = yi + dy + py[cy * grid + cx];
        const d = (x - fx) * (x - fx) + (y - fy) * (y - fy);
        if (d < b1) { b2 = b1; b1 = d; } else if (d < b2) { b2 = d; }
      }
    }
    res.f1 = Math.sqrt(b1); res.f2 = Math.sqrt(b2);
    return res;
  };
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function sstep(a, b, t) { t = clamp01((t - a) / (b - a)); return t * t * (3 - 2 * t); }

/**
 * v2 核心：单趟逐像素填充 颜色 + 高度 + 粗糙度。
 * fn(u, v, out)：写 out[0..2]=RGB(0-255)  out[3]=height(0-1)  out[4]=rough(0-1)
 * 返回 { map, normal, rough }（均为 canvas）
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
  return { map: cMap, normal: cN, rough: cRough };
}

function toTex(canvas, { srgb = true, repeat = [1, 1], aniso = 8, clamp = false } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
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

/** 县道沥青（2001 补丁摞补丁）：骨料麻面 + 龟裂网 + 灌缝沥青蛇线 + 补丁块 + 油渍坑洼。
 *  各向同性（路段盒体朝向不一，方向性特征会在拐弯处穿帮）。 */
export function asphaltTexture(seed = 611, size = 512) {
  const fbm = makeFbm(seed, 5);
  const crackR = makeRidged(seed + 9, 4);      // 龟裂网
  const snakeR = makeRidged(seed + 31, 2);     // 灌缝蛇线（更粗更稀）
  const cell = makeCellular(seed + 3, 72);     // 骨料颗粒
  const patchN = makeValueNoise(seed + 17, 6); // 补丁分区
  return buildMaps(size, (u, v, out) => {
    const f = fbm(u * 2.2, v * 2.2);
    // 补丁：分区噪声硬阈值——新补的一块颜色更黑更平
    const pv = patchN(u, v);
    const patch = pv > 0.72 ? 1 : 0;
    // 骨料：细胞噪声，石子心亮、缝隙沉
    const c = cell(u * 1.0, v * 1.0);
    const grain = clamp01(1 - c.f1 * 1.9);          // 石子凸点
    const gap = clamp01((c.f2 - c.f1) * 3.2);       // 缝隙(骨料间)
    let base = 52 + f * 16 + grain * 26 - (1 - gap) * 8;
    if (patch) base = 34 + f * 8 + grain * 12;      // 新补丁：更黑、骨料细
    let r = base, g = base + 2, b = base + 4;
    // 磨白：车辙外的老化面浮起灰白（骨料磨出的石色）
    const wear = clamp01((fbm(u * 1.1 + 7, v * 1.1 + 4) - 0.5) * 2.4) * (1 - patch);
    r += wear * 26; g += wear * 27; b += wear * 26;
    // 龟裂网：细黑线
    const crack = clamp01((crackR(u * 3.2, v * 3.2) - 0.9) * 12) * (1 - patch * 0.7);
    r *= 1 - crack * 0.55; g *= 1 - crack * 0.55; b *= 1 - crack * 0.5;
    // 灌缝沥青蛇线：粗黑亮线（低粗糙——新沥青的油光）
    const snake = clamp01((snakeR(u * 1.1 + 3, v * 1.1 + 6) - 0.955) * 26);
    r = r * (1 - snake) + snake * 22; g = g * (1 - snake) + snake * 23; b = b * (1 - snake) + snake * 26;
    // 油渍：暗斑 + 低粗糙
    const oil = clamp01((fbm(u * 2.6 + 12, v * 2.6 + 8) - 0.62) * 4);
    r *= 1 - oil * 0.3; g *= 1 - oil * 0.3; b *= 1 - oil * 0.24;
    // 坑洼：深黑点
    const pot = clamp01((fbm(u * 5 + 21, v * 5 + 17) - 0.72) * 8);
    r *= 1 - pot * 0.5; g *= 1 - pot * 0.5; b *= 1 - pot * 0.46;
    out[0] = r; out[1] = g; out[2] = b;
    out[3] = clamp01(0.5 + grain * 0.24 - crack * 0.2 - pot * 0.3 - snake * 0.06 + (patch ? -0.04 : 0));
    out[4] = clamp01(0.9 - snake * 0.5 - oil * 0.32 - (patch ? 0.1 : 0) + wear * 0.06);
  }, 2.2);
}

/** 现浇水泥（路缘石/人行道/勒脚/女儿墙）：抹光面 + 木模板痕 + 崩边 + 泛碱白 + 雨渍 */
export function concreteTexture(seed = 631, size = 512) {
  const fbm = makeFbm(seed, 5);
  const ridge = makeRidged(seed + 11, 3);
  const drip = makeValueNoise(seed + 29, 40);
  return buildMaps(size, (u, v, out) => {
    const f = fbm(u * 2.4, v * 2.4);
    let r = 118 + f * 26, g = 120 + f * 25, b = 116 + f * 23;
    // 木模板痕：低频横带明暗
    const board = Math.sin(v * Math.PI * 2 * 5 + f * 1.6) * 0.5 + 0.5;
    r -= board * 7; g -= board * 7; b -= board * 6;
    // 抹刀弧痕：斜向微亮弧
    const trowel = clamp01((Math.sin((u * 3 + v * 5 + f * 2) * Math.PI * 2) - 0.7) * 3);
    r += trowel * 9; g += trowel * 9; b += trowel * 8;
    // 泛碱白霜（水泥的盐析——和镇子的盐语言同宗）
    const eff = clamp01((fbm(u * 3 + 6, v * 3 + 9) - 0.6) * 3.4);
    r += eff * 44; g += eff * 44; b += eff * 40;
    // 细裂 + 崩点
    const crack = clamp01((ridge(u * 2.6, v * 2.6) - 0.93) * 15);
    r *= 1 - crack * 0.4; g *= 1 - crack * 0.4; b *= 1 - crack * 0.36;
    const chipHole = clamp01((fbm(u * 7 + 14, v * 7 + 3) - 0.74) * 9);
    r *= 1 - chipHole * 0.34; g *= 1 - chipHole * 0.34; b *= 1 - chipHole * 0.3;
    // 雨渍竖条
    const dr = clamp01((drip(u * 5, 0.3) - 0.6) * 4) * sstep(0.1, 0.8, v);
    r *= 1 - dr * 0.16; g *= 1 - dr * 0.17; b *= 1 - dr * 0.15;
    const grain = (fbm(u * 12, v * 12) - 0.5) * 12;
    out[0] = r + grain; out[1] = g + grain; out[2] = b + grain;
    out[3] = clamp01(0.55 + f * 0.14 - crack * 0.18 - chipHole * 0.2);
    out[4] = clamp01(0.88 - trowel * 0.1 + eff * 0.06 - dr * 0.12);
  }, 1.8);
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
    // 毛孔/细噪
    const pore = (fbm(u * 22, v * 22) - 0.5) * 10;
    out[0] = r + pore; out[1] = g + pore; out[2] = b + pore;
    out[3] = clamp01(0.5 + f * 0.28 - vn * 0.2 + salt * 0.22);
    out[4] = clamp01(0.4 + salt * 0.5 + mottle * 0.06 - f * 0.08); // 湿尸低粗糙、盐痂哑光
  }, 1.4);
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

// ================= 蚀湾 · 南方大酒店 / 人物 材质组 =================

// 共享毛孔/皮沟场：细胞噪声只在 512² 上算一次，三张皮肤贴图双线性采样复用
// （细胞噪声 9 格距离循环是皮肤生成的大头——共享后 FULLSPEC 启动省数秒）
let _poreField = null;
function getPoreField() {
  if (_poreField) return _poreField;
  const S = 512;
  const cellA = makeCellular(919, 72);    // 粗毛孔（颊/鼻翼级，稀疏可数）
  const cellB = makeCellular(929, 150);   // 细毛孔底纹
  const pitArr = new Float32Array(S * S);
  const sulArr = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    const v = y / S;
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const cA = cellA(u, v);
      const cB = cellB(u, v);
      pitArr[y * S + x] = sstep(0.24, 0.04, cA.f1) * 0.8 + sstep(0.3, 0.07, cB.f1) * 0.35;
      sulArr[y * S + x] = sstep(0.12, 0.02, cA.f2 - cA.f1);
    }
  }
  const res = { pit: 0, sul: 0 };
  _poreField = (u, v) => { // 双线性平铺采样
    const x = (((u % 1) + 1) % 1) * S, y = (((v % 1) + 1) % 1) * S;
    const xi = x | 0, yi = y | 0, xf = x - xi, yf = y - yi;
    const x1 = (xi + 1) % S, y1 = (yi + 1) % S;
    const i00 = yi * S + xi, i10 = yi * S + x1, i01 = y1 * S + xi, i11 = y1 * S + x1;
    res.pit = (pitArr[i00] * (1 - xf) + pitArr[i10] * xf) * (1 - yf)
      + (pitArr[i01] * (1 - xf) + pitArr[i11] * xf) * yf;
    res.sul = (sulArr[i00] * (1 - xf) + sulArr[i10] * xf) * (1 - yf)
      + (sulArr[i01] * (1 - xf) + sulArr[i11] * xf) * yf;
    return res;
  };
  return _poreField;
}

/** 活人皮肤 v3：2001 年还晒得到太阳的脸（低饱和暖调 + 微血色 + 细胞噪声毛孔皮沟 + 皮脂油区）
 *  age: 0 青壮 → 1 老年（皱纹沟 + 老年斑 + 松弛暗沉），wrinkles/毛孔走法线图，近景可读
 *  粗糙度图承担「油光分区」：皮脂区低粗糙（清漆层在这里最亮），皮沟毛孔高粗糙 */
export function skinTexture(seed = 211, size = 512, age = 0) {
  const fbm = makeFbm(seed, 4);
  const ridge = makeRidged(seed + 31, 4);
  const pore = getPoreField();                 // 共享毛孔/皮沟场（只算一次，三张皮共用）
  return buildMaps(size, (u, v, out) => {
    const f = fbm(u * 4, v * 4);
    let r = 186 + f * 26, g = 152 + f * 22, b = 128 + f * 18;
    const flush = clamp01((fbm(u * 1.8 + 7, v * 1.8 + 7) - 0.52) * 2.6);
    r += flush * 16 * (1 - age * 0.6); g -= flush * 2; b -= flush * 5;
    const shade = clamp01((fbm(u * 2.6 + 13, v * 2.6 + 13) - 0.58) * 3);
    r -= shade * 24; g -= shade * 22; b -= shade * 16;
    // 皮脂油区：低频云斑——活人的脸不是均匀哑光，油在骨点上积
    const oil = clamp01((fbm(u * 2.3 + 31, v * 2.3 + 17) - 0.48) * 2.4);
    let h = 0.5 + f * 0.3, ro = 0.66 - flush * 0.05 + f * 0.1 - oil * 0.3;
    if (age > 0) {
      // 皱纹沟：横向为主的脊线噪声（细而浅——皱纹是沟不是树皮）
      const wr1 = clamp01((ridge(u * 2.2, v * 7 + fbm(u * 2, v * 2) * 0.8) - 0.8) * 4) * age;
      const wr2 = clamp01((ridge(u * 5 + 3, v * 16 + 5) - 0.87) * 6) * age * 0.5;
      const wr = Math.min(1, wr1 + wr2);
      r -= wr * 18; g -= wr * 17; b -= wr * 14;
      h -= wr * 0.14;
      // 老年斑：稀疏浅褐点斑
      const spot = clamp01((fbm(u * 9 + 21, v * 9 + 21) - 0.76) * 8) * age;
      r = r * (1 - spot * 0.28) + spot * 42;
      g = g * (1 - spot * 0.3) + spot * 32;
      b = b * (1 - spot * 0.32) + spot * 24;
      // 整体暗沉失血
      r -= age * 10; g -= age * 6; b -= age * 3;
      ro += wr * 0.12 - oil * 0.06;
    }
    // 毛孔（细胞噪声 F1：孔心一个坑）+ 皮沟网（F2-F1：细胞边界一圈浅沟）
    // 克制：毛孔主要走高度→法线与粗糙度，颜色只轻点一下——重了会读成胡茬/脏斑
    const pf = pore(u, v);
    r -= pf.pit * 9 + pf.sul * 4; g -= pf.pit * 8 + pf.sul * 4; b -= pf.pit * 7 + pf.sul * 3;
    h -= pf.pit * 0.07 + pf.sul * 0.028;
    ro += pf.pit * 0.09 + pf.sul * 0.04;
    out[0] = r; out[1] = g; out[2] = b;
    out[3] = clamp01(h);
    out[4] = clamp01(ro);
  }, 1.05 + age * 0.35);
}

/** 皮肤毛孔微法线（清漆层第二法线）：细胞噪声皮丘-皮沟-孔心。
 *  作为 clearcoatNormalMap 平铺 3-4 次盖在整头上——油光膜顺着毛孔破碎，
 *  这层「镜面里的颗粒」正是蜡人与活人之间隔着的那层皮。 */
export function skinPoreNormalTexture(seed = 219, size = 256) {
  const cellA = makeCellular(seed, 30);
  const cellB = makeCellular(seed + 7, 72);
  const fbm = makeFbm(seed + 13, 3);
  const maps = buildMaps(size, (u, v, out) => {
    const cA = cellA(u, v), cB = cellB(u, v);
    // 皮丘（细胞内部微微鼓起）+ 皮沟（边界凹槽）+ 孔心（深坑）
    let h = 0.5 + Math.min(cA.f1, 0.7) * 0.2
      - sstep(0.17, 0.02, cA.f2 - cA.f1) * 0.3
      - sstep(0.26, 0.04, cA.f1) * 0.42
      - sstep(0.3, 0.06, cB.f1) * 0.22
      + fbm(u * 9, v * 9) * 0.14;
    out[0] = 128; out[1] = 128; out[2] = 128;
    out[3] = clamp01(h);
    out[4] = 0.5;
  }, 2.4);
  return maps.normal;
}

/** 眉毛贴片：透明底上逐根画毛（内浓竖、外疏平；根部乱、梢部顺）。
 *  画成浅灰白——由材质 color 乘出发色（黑发/灰发眉共用一张）。 */
export function browStrokesTexture(w = 256, h = 64) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  const rand = mulberry32(7717);
  // 底影：贴皮的一层软阴影（毛下的皮色暗带——没有它毛是飘着的）
  x.strokeStyle = 'rgba(150,140,130,0.16)';
  x.lineWidth = h * 0.3;
  x.beginPath();
  x.moveTo(w * 0.07, h * 0.7);
  x.quadraticCurveTo(w * 0.55, h * 0.28, w * 0.95, h * 0.55);
  x.stroke();
  // 逐根眉毛
  for (let i = 0; i < 230; i++) {
    const t = rand();                              // 0 眉头 → 1 眉尾
    const bx = (0.05 + t * 0.9) * w;
    const arch = Math.sin(Math.min(1, t * 1.3) * Math.PI) * 0.22;  // 眉峰在 ~2/3
    const by = (0.68 - arch + (rand() - 0.5) * 0.2) * h;
    const len = (0.1 - t * 0.035) * w * (0.7 + rand() * 0.6);
    const ang = -1.25 + t * 1.1 + (rand() - 0.5) * 0.25;           // 眉头近竖 → 眉尾近平
    const fade = (t < 0.1 ? 0.5 : 1) * (t > 0.85 ? 1 - (t - 0.85) * 5 : 1);
    x.strokeStyle = `rgba(216,206,196,${Math.max(0.16, (0.55 + rand() * 0.42) * fade)})`;
    x.lineWidth = 1.2 + rand() * 1.4;
    x.beginPath();
    x.moveTo(bx, by);
    x.quadraticCurveTo(
      bx + Math.cos(ang) * len * 0.5, by + Math.sin(ang) * len * 0.55,
      bx + Math.cos(ang * 0.8) * len, by + Math.sin(ang * 0.8) * len);
    x.stroke();
  }
  return c;
}

/** 睫毛贴片：根部密合的暗线 + 一排向外上翘的细毛（上睑缘）。
 *  两端 alpha 渐隐——弯带端头淡出进内外眦，不留贴片尖角黑斑。 */
export function lashStrokesTexture(w = 128, h = 48) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  const rand = mulberry32(3313);
  // 睑缘线：贴眼球的深色密合带（近景里眼睛「嵌进眼眶」的关键）
  x.strokeStyle = 'rgba(225,215,205,0.85)';
  x.lineWidth = 2.6;
  x.beginPath();
  x.moveTo(w * 0.03, h * 0.86);
  x.quadraticCurveTo(w * 0.5, h * 0.72, w * 0.97, h * 0.88);
  x.stroke();
  // 逐根睫毛：从睑缘向上外掠（两眦端的毛短而稀——端头是「收」不是「切」）
  for (let i = 0; i < 30; i++) {
    const t = i / 29 + (rand() - 0.5) * 0.02;
    const bx = (0.05 + t * 0.9) * w;
    const by = h * (0.85 - Math.sin(t * Math.PI) * 0.1);
    const end = Math.min(1, Math.min(t, 1 - t) * 6);               // 端头收梢
    const len = h * (0.34 + rand() * 0.3) * (0.6 + Math.sin(t * Math.PI) * 0.5) * (0.4 + end * 0.6);
    const outw = (t - 0.35) * 0.9 + (rand() - 0.5) * 0.3;          // 外侧的毛向外撇
    x.strokeStyle = `rgba(210,200,192,${(0.35 + rand() * 0.45) * (0.5 + end * 0.5)})`;
    x.lineWidth = 0.8 + rand() * 0.8;
    x.beginPath();
    x.moveTo(bx, by);
    x.quadraticCurveTo(bx + outw * len * 0.4, by - len * 0.7, bx + outw * len, by - len);
    x.stroke();
  }
  // 端点 alpha 渐隐：睑缘带与睫毛的 alpha 一并乘上两端淡出——
  // 弯带端头「溶」进内外眦皮面（内眦贴片尖角黑斑的根治）
  const fade = x.createLinearGradient(0, 0, w, 0);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(0.13, 'rgba(0,0,0,1)');
  fade.addColorStop(0.87, 'rgba(0,0,0,1)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  x.globalCompositeOperation = 'destination-in';
  x.fillStyle = fade;
  x.fillRect(0, 0, w, h);
  x.globalCompositeOperation = 'source-over';
  return c;
}

/** 长发前帘贴图（双层化）：沿宽分 3–4 绺（clumps），每绺一束股线绕自己的中轴拢紧，
 *  绺间留窄缝——帘不再是一块均匀毛玻璃，而是「几绺头发」。
 *  dense=true 内帘：绺芯垫近实底缎带、股多线粗（前帘的「体」）；
 *  dense=false 外帘：股稀线细摆幅大（浮在内帘外的「散」）。
 *  帘根压暗成接壳带：顶部 ~14% 明度乘暗且 alpha 抬满——发根挤在一起是暗的，
 *  正好接住发壳下檐，消掉壳-帘之间的亮缝。 */
export function hairCurtainTexture(w = 160, h = 256, seed = 9911, opts = {}) {
  const clumps = opts.clumps ?? 4;
  const dense = opts.dense ?? true;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  const rand = mulberry32(seed);
  x.lineCap = 'round';
  const perClump = dense ? 40 : 14;
  for (let k = 0; k < clumps; k++) {
    const ccx = ((k + 0.5) / clumps + (rand() - 0.5) * 0.05) * w; // 绺中轴
    const cw = (w / clumps) * (0.34 + rand() * 0.08);            // 绺半宽（留绺间缝）
    const cSway = (rand() - 0.5) * w * (dense ? 0.10 : 0.2);     // 绺级摆（整绺一起弯）
    const cLen = h * (0.8 + rand() * 0.16);                      // 绺末参差
    if (dense) {
      // 绺芯缎带：近实底的宽带（内帘的「体」——外帘透过缝看到的是它，不是头皮）
      const grad = x.createLinearGradient(ccx, 0, ccx, cLen);
      grad.addColorStop(0, 'rgba(150,146,140,0.92)');
      grad.addColorStop(0.7, 'rgba(196,192,184,0.85)');
      grad.addColorStop(1, 'rgba(206,202,194,0.2)');
      x.strokeStyle = grad;
      x.lineWidth = cw * 1.5;
      x.beginPath();
      x.moveTo(ccx, -2);
      x.bezierCurveTo(ccx + cSway * 0.25, cLen * 0.4, ccx + cSway * 0.7, cLen * 0.75, ccx + cSway, cLen * 0.94);
      x.stroke();
    }
    for (let i = 0; i < perClump; i++) {
      const off = (rand() - 0.5) * 2;                            // 绺内横位 -1..1
      const bx = ccx + off * cw;
      const len = cLen * (0.82 + rand() * 0.22);
      const sway = cSway + (rand() - 0.5) * w * 0.05;
      // 股线向绺中轴拢紧（梢端 off 收半）——「绺」是拢出来的，不是排出来的
      const tipX = ccx + off * cw * 0.5 + sway;
      const shade = (dense ? 178 : 192) + (rand() * 52) | 0;
      const a = (dense ? 0.5 : 0.4) + rand() * 0.45;
      const lw = (dense ? 1.4 : 0.9) + rand() * (dense ? 2.2 : 1.3);
      x.strokeStyle = `rgba(${shade},${shade - 4},${shade - 8},${a.toFixed(2)})`;
      x.lineWidth = lw;
      x.beginPath();
      x.moveTo(bx, -2);
      x.bezierCurveTo(bx + (tipX - bx) * 0.2, len * 0.4, bx + (tipX - bx) * 0.65, len * 0.72, tipX - (tipX - bx) * 0.08, len * 0.82);
      x.stroke();
      // 收梢：末端变细变淡（锯齿是「梢」不是「切口」）
      x.strokeStyle = `rgba(${shade},${shade - 4},${shade - 8},${(a * 0.55).toFixed(2)})`;
      x.lineWidth = lw * 0.42;
      x.beginPath();
      x.moveTo(tipX - (tipX - bx) * 0.08, len * 0.82);
      x.quadraticCurveTo(tipX - (tipX - bx) * 0.03, len * 0.92, tipX, len);
      x.stroke();
    }
  }
  // 帘根暗色接壳带：顶部明度乘暗（只动已画像素的颜色，不动 alpha）
  x.globalCompositeOperation = 'source-atop';
  const root = x.createLinearGradient(0, 0, 0, h * 0.16);
  root.addColorStop(0, 'rgba(20,16,12,0.72)');
  root.addColorStop(0.65, 'rgba(20,16,12,0.34)');
  root.addColorStop(1, 'rgba(20,16,12,0)');
  x.fillStyle = root;
  x.fillRect(0, 0, w, h * 0.16);
  x.globalCompositeOperation = 'source-over';
  if (dense) {
    // 内帘帘根 alpha 抬满：顶带用近实底暗色补一条（接壳带不许漏缝）
    const cap = x.createLinearGradient(0, 0, 0, h * 0.12);
    cap.addColorStop(0, 'rgba(56,50,44,0.88)');
    cap.addColorStop(1, 'rgba(56,50,44,0)');
    x.fillStyle = cap;
    x.fillRect(0, 0, w, h * 0.12);
  }
  // 顶缘 3% alpha 软入：帘顶不许在空间里留一条水平硬切口（帘根探进壳下）
  x.globalCompositeOperation = 'destination-in';
  const capIn = x.createLinearGradient(0, 0, 0, h * 0.03);
  capIn.addColorStop(0, 'rgba(0,0,0,0.35)');
  capIn.addColorStop(1, 'rgba(0,0,0,1)');
  x.fillStyle = capIn;
  x.fillRect(0, 0, w, h * 0.03);
  // 梢端整体渐隐：0.72h 起 alpha 走低——下摆在锯齿之上再叠一层「散」
  const fade = x.createLinearGradient(0, h * 0.7, 0, h);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(0.75, 'rgba(0,0,0,0.72)');
  fade.addColorStop(1, 'rgba(0,0,0,0.3)');
  x.fillStyle = fade;
  x.fillRect(0, 0, w, h);
  x.globalCompositeOperation = 'source-over';
  return c;
}

/** 发际线绒边：顶带近实（发根挤在一起=接壳暗带）→ 向下快速稀疏成细绒毛梢。
 *  专供发际线过渡卡片——离散粗笔画贴在裸皮上读成「涂鸦」，绒边读成「长出来的」。
 *  左右端 alpha 渐隐，卡片侧缘不留切线。 */
export function hairlineFringeTexture(w = 256, h = 96, seed = 8811) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  const rand = mulberry32(seed);
  x.lineCap = 'round';
  // 发根软影带：顶 20% 一条低alpha暗带（贴着壳檐的过渡底色）
  const rootG = x.createLinearGradient(0, 0, 0, h * 0.34);
  rootG.addColorStop(0, 'rgba(120,112,104,0.66)');
  rootG.addColorStop(0.55, 'rgba(140,132,122,0.3)');
  rootG.addColorStop(1, 'rgba(150,142,132,0)');
  x.fillStyle = rootG;
  x.fillRect(0, 0, w, h * 0.34);
  // 逐根绒毛：根密（每 1.6px 一根）、梢短而淡——长度指数衰减，没有一根戳到卡底
  for (let i = 0; i < 160; i++) {
    const bx = (0.02 + rand() * 0.96) * w;
    const len = h * (0.22 + rand() * rand() * 0.62); // 平方偏置：长毛是少数
    const sway = (rand() - 0.5) * w * 0.06;
    const shade = 150 + (rand() * 70) | 0;
    x.strokeStyle = `rgba(${shade},${shade - 5},${shade - 10},${(0.3 + rand() * 0.45).toFixed(2)})`;
    x.lineWidth = 0.5 + rand() * 0.9;
    x.beginPath();
    x.moveTo(bx, -1);
    x.quadraticCurveTo(bx + sway * 0.4, len * 0.55, bx + sway, len);
    x.stroke();
  }
  // 左右端渐隐 + 梢端整体softout
  x.globalCompositeOperation = 'destination-in';
  const endF = x.createLinearGradient(0, 0, w, 0);
  endF.addColorStop(0, 'rgba(0,0,0,0)');
  endF.addColorStop(0.12, 'rgba(0,0,0,1)');
  endF.addColorStop(0.88, 'rgba(0,0,0,1)');
  endF.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = endF;
  x.fillRect(0, 0, w, h);
  const tipF = x.createLinearGradient(0, h * 0.5, 0, h);
  tipF.addColorStop(0, 'rgba(0,0,0,1)');
  tipF.addColorStop(1, 'rgba(0,0,0,0.25)');
  x.fillStyle = tipF;
  x.fillRect(0, 0, w, h);
  x.globalCompositeOperation = 'source-over';
  return c;
}

/** 发丝卡片：透明底上从顶边垂下的一束细发（根密梢疏、微弯、亮度参差）。
 *  画成浅灰白——由材质 color 乘出发色；贴发际线/鬓角/颈窝破「头盔感」。 */
export function hairStrandsTexture(w = 192, h = 128, seed = 6161, sparse = false) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  const rand = mulberry32(seed);
  const n = sparse ? 26 : 88;
  for (let i = 0; i < n; i++) {
    const bx = (0.04 + rand() * 0.92) * w;
    const len = h * (0.45 + rand() * 0.5);
    const sway = (rand() - 0.5) * w * 0.22;
    const alpha = 0.3 + rand() * 0.6;
    x.strokeStyle = `rgba(${200 + (rand() * 40) | 0},${195 + (rand() * 40) | 0},${190 + (rand() * 40) | 0},${alpha.toFixed(2)})`;
    x.lineWidth = 0.7 + rand() * 1.1;
    x.beginPath();
    x.moveTo(bx, -1);
    x.bezierCurveTo(bx + sway * 0.2, len * 0.35, bx + sway * 0.7, len * 0.7, bx + sway, len);
    x.stroke();
  }
  return c;
}

/** 胶皮（理骨员围裙/长手套/胶靴）：哑光微皱 + 磨亮棱线 + 骨粉扑痕 */
export function rubberTexture(seed = 415, size = 256) {
  const fbm = makeFbm(seed, 4);
  const ridge = makeRidged(seed + 5, 3);
  return buildMaps(size, (u, v, out) => {
    const f = fbm(u * 3, v * 3);
    const crease = clamp01((ridge(u * 2, v * 4) - 0.76) * 4); // 折痕棱线（磨得发亮）
    let r = 42 + f * 8 + crease * 12, g = 48 + f * 8 + crease * 13, b = 50 + f * 9 + crease * 13;
    // 骨粉扑痕：淡淡的干白雾（理骨员的职业证据，不是迷彩）
    const dust = clamp01((fbm(u * 3.4 + 8, v * 3.4 + 8) - 0.62) * 2.2);
    r += dust * 26; g += dust * 25; b += dust * 23;
    out[0] = r; out[1] = g; out[2] = b;
    out[3] = clamp01(0.5 + f * 0.2 - crease * 0.16);
    out[4] = clamp01(0.46 - crease * 0.22 + dust * 0.3);
  }, 1.2);
}

/** 水磨石地面：青灰浆 + 黑白红青石屑 + 铜条分格 + 抛光走道 */
export function terrazzoTexture(seed = 301, size = 1024) {
  const fbm = makeFbm(seed, 4);
  const chipN = makeValueNoise(seed + 5, 96);
  const chipN2 = makeValueNoise(seed + 55, 160);
  const toneN = makeValueNoise(seed + 11, 48);
  const tiles = 4;
  return buildMaps(size, (u, v, out) => {
    const f = fbm(u * 3, v * 3);
    let r = 128 + f * 18, g = 132 + f * 17, b = 126 + f * 16, h = 0.55, ro = 0.34;
    const c1 = chipN(u, v), c2 = chipN2(u, v);
    const chip = c1 > 0.78 ? 1 : c2 > 0.8 ? 2 : 0;
    if (chip) {
      const tone = toneN(u * 2 + chip, v * 2);
      if (tone < 0.3) { r = 88 + tone * 40; g = 90 + tone * 40; b = 92 + tone * 38; }
      else if (tone < 0.62) { r = 172; g = 168; b = 158; }
      else if (tone < 0.82) { r = 148; g = 106; b = 90; }
      else { r = 120; g = 128; b = 118; }
      if (chip === 2) { r = r * 0.86 + 20; g = g * 0.86 + 20; b = b * 0.86 + 18; }
      h += 0.05; ro -= 0.05;
    }
    // 分格铜条
    const gu = (u * tiles) % 1, gv = (v * tiles) % 1;
    const eg = Math.min(gu, 1 - gu, gv, 1 - gv) * tiles;
    if (eg < 0.01) { r = 164; g = 134; b = 80; h = 0.6; ro = 0.4; }
    // 磨旧渍
    const stain = clamp01((fbm(u * 1.4 + 9, v * 1.4 + 9) - 0.6) * 2.2);
    r *= 1 - stain * 0.09; g *= 1 - stain * 0.1; b *= 1 - stain * 0.1;
    out[0] = r; out[1] = g; out[2] = b;
    out[3] = clamp01(h + f * 0.1);
    out[4] = clamp01(ro + stain * 0.25);
  }, 0.8);
}

/** 红地毯：绒面织纹 + 团花暗纹 + 踩旧的暗渍 */
export function carpetTexture(seed = 311, base = [98, 18, 16], size = 512) {
  const fbm = makeFbm(seed, 4);
  return buildMaps(size, (u, v, out) => {
    const weave = (Math.sin(u * 640) + Math.sin(v * 640)) * 3;
    const f = fbm(u * 5, v * 5);
    let r = base[0] + f * 26 + weave, g = base[1] + f * 9 + weave * 0.5, b = base[2] + f * 8 + weave * 0.5;
    const px = (u * 3) % 1 - 0.5, py = (v * 3) % 1 - 0.5;
    const ring = Math.abs(Math.sin(Math.hypot(px, py) * 26)) < 0.24 ? 1 : 0;
    r += ring * 15; g += ring * 5; b += ring * 4;
    const stain = clamp01((fbm(u * 1.6 + 6, v * 1.6 + 6) - 0.52) * 2.4);
    r *= 1 - stain * 0.3; g *= 1 - stain * 0.3; b *= 1 - stain * 0.26;
    out[0] = r; out[1] = g; out[2] = b;
    out[3] = clamp01(0.5 + f * 0.28 + ring * 0.05);
    out[4] = 0.98;
  }, 0.8);
}

/** 仿大理石：奶白底 + 赭灰双尺度石纹 + 抛光 */
export function marbleTexture(seed = 321, size = 512) {
  const fbm = makeFbm(seed, 5);
  const veinR = makeRidged(seed + 3, 4);
  return buildMaps(size, (u, v, out) => {
    const f = fbm(u * 2, v * 2);
    let r = 206 + f * 22, g = 198 + f * 20, b = 184 + f * 18;
    const vn = clamp01((veinR(u * 1.6 + f * 0.3, v * 1.6) - 0.88) * 10);
    r -= vn * 76; g -= vn * 64; b -= vn * 42;
    const vn2 = clamp01((veinR(u * 4 + 9, v * 4 + 9) - 0.93) * 14) * 0.6;
    r -= vn2 * 40; g -= vn2 * 36; b -= vn2 * 26;
    out[0] = r; out[1] = g; out[2] = b;
    out[3] = clamp01(0.6 + f * 0.2 - vn * 0.1);
    out[4] = clamp01(0.2 + vn * 0.16);
  }, 0.9);
}

/** 2001 县镇酒店墙纸：米金竖条 + 小团花 + 返潮黄褐渍 + 贴缝 */
export function wallpaperTexture(seed = 331, size = 512) {
  const fbm = makeFbm(seed, 4);
  return buildMaps(size, (u, v, out) => {
    const sBand = Math.sin(u * Math.PI * 2 * 14) > 0.2 ? 1 : 0;
    let r = sBand ? 194 : 174, g = sBand ? 176 : 156, b = sBand ? 136 : 120;
    const f = fbm(u * 3, v * 3);
    r += f * 14 - 7; g += f * 13 - 7; b += f * 11 - 6;
    const px = (u * 14) % 1 - 0.5, py = (v * 7) % 1 - 0.5;
    if (sBand && Math.hypot(px * 1.4, py) < 0.09) { r -= 26; g -= 24; b -= 14; }
    // 返潮渍：云状黄褐斑（干的，但像刚从水里捞出来过）
    const damp = clamp01((fbm(u * 1.5 + 8, v * 1.5 + 3) - 0.56) * 4);
    r = r * (1 - damp * 0.32) + damp * 46;
    g = g * (1 - damp * 0.36) + damp * 34;
    b = b * (1 - damp * 0.44) + damp * 20;
    if (((u * 2) % 1) < 0.006) { r -= 30; g -= 30; b -= 26; }
    out[0] = r; out[1] = g; out[2] = b;
    out[3] = clamp01(0.55 + f * 0.2 - damp * 0.15);
    out[4] = clamp01(0.86 - damp * 0.16);
  }, 1.0);
}

/** 内墙漆面（营业中的酒店）：乳白辊涂 + 烟熏浮渍 + 磕碰划痕 + 发丝裂——旧，但没塌 */
export function paintedWallTexture(seed = 335, size = 512) {
  const fbm = makeFbm(seed, 5);
  const ridge = makeRidged(seed + 7, 4);
  return buildMaps(size, (u, v, out) => {
    // 辊涂肌理：细密各向同性起伏（灯一斜照就读出来）
    const roller = fbm(u * 22, v * 22);
    // 大片云状变色：烟熏与岁月不均——幅度小、面积大
    const cloud = fbm(u * 1.4 + 5, v * 1.4 + 11);
    let r = 208, g = 200, b = 182;
    const tint = (cloud - 0.5) * 28;
    r += tint; g += tint * 0.9; b += tint * 0.6;
    // 烟渍云（暖褐）：几十年香烟和开水房的汽——淡淡一层就够
    const smoke = clamp01((fbm(u * 2.2 + 9, v * 2.2 + 3) - 0.62) * 2.6);
    r = r * (1 - smoke * 0.1) + smoke * 20;
    g = g * (1 - smoke * 0.13) + smoke * 15;
    b = b * (1 - smoke * 0.17) + smoke * 8;
    // 磕碰划痕：稀疏横向暗擦痕（行李车/椅背磕的）
    const scuff = clamp01((ridge(u * 2.5, v * 14) - 0.9) * 9) *
      clamp01((fbm(u * 3 + 17, v * 3 + 6) - 0.58) * 4);
    r *= 1 - scuff * 0.26; g *= 1 - scuff * 0.26; b *= 1 - scuff * 0.24;
    // 发丝裂：极稀的细线（漆面裂，不是墙体裂——密了会读成大理石纹）
    const crack = clamp01((ridge(u * 1.8 + 4, v * 1.8 + 8) - 0.982) * 40) *
      clamp01((fbm(u * 1.1 + 23, v * 1.1 + 14) - 0.5) * 5);
    r *= 1 - crack * 0.22; g *= 1 - crack * 0.22; b *= 1 - crack * 0.2;
    const grain = (fbm(u * 9 + 3, v * 9 + 7) - 0.5) * 7;
    out[0] = r + grain; out[1] = g + grain; out[2] = b + grain;
    out[3] = clamp01(0.6 + (roller - 0.5) * 0.12 - crack * 0.12 - scuff * 0.04);
    // 半光调和漆：底子微亮，烟渍/擦痕处发乌
    out[4] = clamp01(0.62 + roller * 0.1 + smoke * 0.12 + scuff * 0.15);
  }, 1.0);
}

/** 矿棉吊顶板：0.6m T 型龙骨格 + 针孔肌理 + 板边水渍圈（2.4m 一周期=4×4 板） */
export function ceilingTexture(seed = 345, size = 512) {
  const fbm = makeFbm(seed, 4);
  const n = 4;
  return buildMaps(size, (u, v, out) => {
    const iu = (u * n) | 0, iv = (v * n) | 0;
    const fu = (u * n) % 1, fv = (v * n) % 1;
    const eg = Math.min(fu, 1 - fu, fv, 1 - fv);
    const bar = 1 - sstep(0.012, 0.035, eg); // T 型龙骨
    // 板面：米白 + 针孔噪点
    const pin = fbm(u * 40, v * 40) > 0.62 ? 1 : 0;
    const shade = 0.93 + (mulberry32(seed + iu * 53 + iv * 17)() - 0.5) * 0.09;
    let r = 216 * shade - pin * 26, g = 212 * shade - pin * 25, b = 200 * shade - pin * 22;
    // 板边水渍圈（返潮从吊顶开始）：靠板缘的黄褐晕
    const stain = clamp01((fbm(u * 2.2 + 4, v * 2.2 + 9) - 0.5) * 3.2) * (1 - sstep(0.05, 0.30, eg));
    r = r * (1 - stain * 0.4) + stain * 96;
    g = g * (1 - stain * 0.44) + stain * 74;
    b = b * (1 - stain * 0.5) + stain * 48;
    // 龙骨压暗成金属灰
    r = r * (1 - bar) + 148 * bar;
    g = g * (1 - bar) + 146 * bar;
    b = b * (1 - bar) + 140 * bar;
    out[0] = r; out[1] = g; out[2] = b;
    out[3] = 0.5 - bar * 0.35 + fbm(u * 18, v * 18) * 0.08;
    out[4] = clamp01(0.92 - bar * 0.3 - stain * 0.1);
  }, 1.2);
}

/** 白瓷砖（服务走廊/后厨）：小方砖 + 发黑灰缝 + 陈年油垢 */
export function tileTexture(seed = 341, size = 512) {
  const fbm = makeFbm(seed, 4);
  const n = 8;
  return buildMaps(size, (u, v, out) => {
    const iu = (u * n) | 0, iv = (v * n) | 0;
    const fu = (u * n) % 1, fv = (v * n) % 1;
    const eg = Math.min(fu, 1 - fu, fv, 1 - fv) * n;
    const grout = 1 - sstep(0.02, 0.07, eg);
    const shade = 0.92 + (mulberry32(seed + iu * 31 + iv * 7)() - 0.5) * 0.1;
    const f = fbm(u * 4, v * 4);
    let r = 204 * shade + f * 14, g = 206 * shade + f * 14, b = 196 * shade + f * 13;
    const grime = clamp01((fbm(u * 2 + 5, v * 2 + 5) - 0.55) * 3);
    r *= 1 - grime * 0.3; g *= 1 - grime * 0.32; b *= 1 - grime * 0.32;
    r = r * (1 - grout) + grout * 88; g = g * (1 - grout) + grout * 88; b = b * (1 - grout) + grout * 82;
    out[0] = r; out[1] = g; out[2] = b;
    out[3] = clamp01(0.72 - grout * 0.5 + f * 0.08);
    out[4] = clamp01(0.22 + grout * 0.55 + grime * 0.3);
  }, 2.0);
}

/** 红漆木饰面（总台/客房门）：直纹 + 亮漆 + 磨白划痕 */
export function veneerTexture(seed = 351, size = 512) {
  const fbm = makeFbm(seed, 4);
  return buildMaps(size, (u, v, out) => {
    const grain = 0.5 + 0.5 * Math.sin((v * 4 + fbm(u * 2, v * 2) * 3.4 + u * 0.4) * Math.PI * 2);
    const f = fbm(u * 5, v * 5);
    let r = 98 + grain * 30 + f * 12, g = 44 + grain * 15 + f * 7, b = 26 + grain * 9 + f * 5;
    const scratch = clamp01((fbm(u * 0.7 + 4, v * 9) - 0.62) * 5);
    r += scratch * 32; g += scratch * 20; b += scratch * 14;
    out[0] = r; out[1] = g; out[2] = b;
    out[3] = clamp01(0.6 + grain * 0.1);
    out[4] = clamp01(0.22 + scratch * 0.3 - grain * 0.04);
  }, 0.7);
}

/** 舞台红丝绒幕布：竖褶明暗 + 积灰 + 底部金穗 */
export function curtainTexture(seed = 361, size = 512) {
  const fbm = makeFbm(seed, 3);
  return buildMaps(size, (u, v, out) => {
    const lit = Math.sin(u * Math.PI * 2 * 9 + fbm(u, v * 0.4) * 1.6) * 0.5 + 0.5;
    let r = 72 + lit * 96, g = 10 + lit * 22, b = 12 + lit * 20;
    const dust = clamp01((fbm(u * 4 + 3, v * 4 + 3) - 0.6) * 3) * (1 - v * 0.6);
    r *= 1 - dust * 0.2; g *= 1 - dust * 0.16; b *= 1 - dust * 0.14;
    if (v > 0.94) {
      const tass = Math.abs(Math.sin(u * Math.PI * 2 * 90)) > 0.3 ? 1 : 0.4;
      r = 158 * tass; g = 118 * tass; b = 50 * tass;
    }
    out[0] = r; out[1] = g; out[2] = b;
    out[3] = clamp01(0.4 + lit * 0.4);
    out[4] = clamp01(0.8 - lit * 0.18);
  }, 1.4);
}

/** 枣红缎（理册婆袄/周絮缎袄）：流动缎光 + 团寿暗纹 */
export function satinTexture(seed = 391, size = 256) {
  const fbm = makeFbm(seed, 3);
  return buildMaps(size, (u, v, out) => {
    const sheen = Math.sin((u * 3 + v * 5 + fbm(u * 2, v * 2)) * Math.PI * 2) * 0.5 + 0.5;
    let r = 74 + sheen * 34, g = 14 + sheen * 10, b = 18 + sheen * 8;
    const px = (u * 8) % 1 - 0.5, py = (v * 8) % 1 - 0.5;
    const d = Math.hypot(px, py);
    if (Math.abs(Math.sin(d * 40)) < 0.3 && d < 0.32) { r += 12; g += 4; b += 3; }
    out[0] = r; out[1] = g; out[2] = b;
    out[3] = clamp01(0.5 + sheen * 0.12);
    out[4] = clamp01(0.55 - sheen * 0.14);
  }, 0.8);
}

/** 浪蚀浮木（侍应颈臂）：被掏空软纤维的深槽顺纹 + 盐白 */
export function driftwoodTexture(seed = 371, size = 512) {
  const fbm = makeFbm(seed, 4);
  const ridge = makeRidged(seed + 7, 4);
  return buildMaps(size, (u, v, out) => {
    const groove = clamp01((ridge(u * 1.2, v * 6) - 0.7) * 4);
    const f = fbm(u * 3, v * 3);
    let r = 152 + f * 26, g = 142 + f * 24, b = 126 + f * 20;
    r *= 1 - groove * 0.52; g *= 1 - groove * 0.52; b *= 1 - groove * 0.48;
    const salt = clamp01((fbm(u * 5 + 4, v * 5 + 4) - 0.68) * 6);
    r += salt * 58; g += salt * 56; b += salt * 48;
    out[0] = r; out[1] = g; out[2] = b;
    out[3] = clamp01(0.62 - groove * 0.4 + f * 0.2);
    out[4] = clamp01(0.88 - salt * 0.1);
  }, 3.0);
}

/** 沉积岩截面（托盘菜/古海床建材）：地层色带 + 嵌贝 */
export function sedimentTexture(seed = 381, size = 512) {
  const fbm = makeFbm(seed, 4);
  const tones = [[168, 150, 124], [126, 116, 102], [150, 128, 96], [102, 98, 92], [140, 134, 120]];
  return buildMaps(size, (u, v, out) => {
    const warp = fbm(u * 2, v * 0.6) * 0.14;
    const bandV = v * 14 + warp * 8;
    const band = bandV % 1;
    const tone = tones[(bandV | 0) % 5];
    const f = fbm(u * 6, v * 6);
    let r = tone[0] + f * 18, g = tone[1] + f * 16, b = tone[2] + f * 14;
    const line = Math.min(band, 1 - band) < 0.06 ? 1 : 0;
    r *= 1 - line * 0.3; g *= 1 - line * 0.3; b *= 1 - line * 0.28;
    const shell = fbm(u * 20, v * 20) > 0.8 ? 1 : 0;
    r += shell * 58; g += shell * 56; b += shell * 48;
    out[0] = r; out[1] = g; out[2] = b;
    out[3] = clamp01(0.5 + f * 0.3 - line * 0.2);
    out[4] = clamp01(0.85 - shell * 0.2);
  }, 2.2);
}

/** 素色布料（西装/衬衫/马甲/工装）：织纹 + 皱褶明暗，无盐渍 */
export function plainClothTexture(seed, baseRGB, size = 256) {
  const fbm = makeFbm(seed, 4);
  return buildMaps(size, (u, v, out) => {
    const weave = (Math.sin(u * 340) + Math.sin(v * 340)) * 2.0;
    const f = fbm(u * 3, v * 3);
    const wrinkle = Math.sin((v * 5 + fbm(u * 2, v) * 3) * Math.PI * 2) * 0.5 + 0.5;
    let r = baseRGB[0] + f * 16 + weave - wrinkle * 8;
    let g = baseRGB[1] + f * 15 + weave - wrinkle * 8;
    let b = baseRGB[2] + f * 16 + weave - wrinkle * 7;
    out[0] = r; out[1] = g; out[2] = b;
    out[3] = clamp01(0.5 + f * 0.2 + wrinkle * 0.12);
    out[4] = clamp01(0.9 - wrinkle * 0.06);
  }, 0.9);
}

/** 红灯笼（金字）：核册之夜家家挂的「名」灯 */
export function lanternRedTexture(char = '名', size = 256) {
  const [c, ctx] = makeCanvas(size);
  const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size * 0.72);
  grad.addColorStop(0, '#ff7a52');
  grad.addColorStop(0.5, '#d63020');
  grad.addColorStop(0.85, '#8a1410');
  grad.addColorStop(1, '#530a08');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const rand = mulberry32(886);
  for (let i = 0; i < 220; i++) {
    ctx.fillStyle = `rgba(90,16,10,${(rand() * 0.07).toFixed(3)})`;
    ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 4, 1);
  }
  for (let i = 0; i <= 8; i++) {
    const x = (i / 8) * size;
    ctx.strokeStyle = 'rgba(60,8,4,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,214,120,0.92)';
  ctx.font = `${size * 0.4}px "Songti SC","Noto Serif SC",serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(char, size / 2, size / 2 + size * 0.02);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 「還」字红板（宴会厅主背景金匾） */
export function xiPanelTexture(size = 512) {
  const [c, ctx] = makeCanvas(size);
  ctx.fillStyle = '#8e1410';
  ctx.fillRect(0, 0, size, size);
  const rand = mulberry32(4111);
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = `rgba(40,6,4,${(rand() * 0.14).toFixed(3)})`;
    ctx.fillRect(rand() * size, rand() * size, 2 + rand() * 6, 1 + rand() * 3);
  }
  ctx.strokeStyle = 'rgba(215,170,90,0.9)';
  ctx.lineWidth = size * 0.014;
  ctx.strokeRect(size * 0.05, size * 0.05, size * 0.9, size * 0.9);
  ctx.strokeStyle = 'rgba(215,170,90,0.45)';
  ctx.lineWidth = size * 0.006;
  ctx.strokeRect(size * 0.085, size * 0.085, size * 0.83, size * 0.83);
  ctx.fillStyle = '#e8b64c';
  ctx.font = `700 ${size * 0.62}px "Songti SC","Noto Serif SC",serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('還', size / 2, size / 2 + size * 0.03);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 灯箱招牌：「南方大酒店」（横/竖） */
export function signboardTexture(text = '南方大酒店', vertical = false, w = 1024, h = 256) {
  const c = document.createElement('canvas');
  if (vertical) { c.width = h; c.height = w; } else { c.width = w; c.height = h; }
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, '#6e1210');
  grad.addColorStop(0.5, '#8e1a14');
  grad.addColorStop(1, '#5a0e0c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, c.width, c.height);
  const rand = mulberry32(913);
  for (let i = 0; i < 200; i++) {
    ctx.fillStyle = `rgba(30,6,4,${(rand() * 0.2).toFixed(3)})`;
    ctx.fillRect(rand() * c.width, rand() * c.height, 2 + rand() * 8, 1 + rand() * 4);
  }
  ctx.strokeStyle = 'rgba(220,180,100,0.85)';
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, c.width - 20, c.height - 20);
  ctx.fillStyle = '#f4d488';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (vertical) {
    ctx.font = `700 ${c.width * 0.62}px "Songti SC","Noto Serif SC",serif`;
    const chars = [...text];
    chars.forEach((ch, i) => {
      ctx.fillText(ch, c.width / 2, (i + 0.55) * (c.height / chars.length));
    });
  } else {
    ctx.font = `700 ${c.height * 0.6}px "Songti SC","Noto Serif SC",serif`;
    ctx.fillText(text, c.width / 2, c.height / 2 + c.height * 0.03);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 海洋馆壁画：退色的鱼群与浪线 + 裂纹 */
export function muralTexture(size = 512) {
  const [c, ctx] = makeCanvas(size);
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, '#4a6a6e');
  grad.addColorStop(0.6, '#39565c');
  grad.addColorStop(1, '#2b4046');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const rand = mulberry32(3721);
  // 浪线
  ctx.strokeStyle = 'rgba(200,214,208,0.35)';
  ctx.lineWidth = 4;
  for (let j = 0; j < 4; j++) {
    ctx.beginPath();
    for (let x = 0; x <= size; x += 8) {
      const y = size * (0.2 + j * 0.2) + Math.sin(x * 0.05 + j) * 10;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // 鱼群剪影
  ctx.fillStyle = 'rgba(216,206,170,0.5)';
  for (let i = 0; i < 26; i++) {
    const x = rand() * size, y = rand() * size, s = 8 + rand() * 16, d = rand() < 0.5 ? 1 : -1;
    ctx.beginPath();
    ctx.ellipse(x, y, s, s * 0.36, 0, 0, 6.28);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + s * d, y);
    ctx.lineTo(x + s * 1.5 * d, y - s * 0.3);
    ctx.lineTo(x + s * 1.5 * d, y + s * 0.3);
    ctx.fill();
  }
  // 裂纹与退色
  ctx.strokeStyle = 'rgba(20,26,26,0.4)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 14; i++) {
    ctx.beginPath();
    let x = rand() * size, y = rand() * size;
    ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (rand() - 0.5) * 60; y += rand() * 40;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(210,206,190,${(rand() * 0.1).toFixed(3)})`;
    ctx.fillRect(rand() * size, rand() * size, 4 + rand() * 30, 2 + rand() * 10);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 矿物孔板（理册婆第三只眼）：暗青板上放射状细孔 */
export function poreplateTexture(size = 128) {
  const [c, ctx] = makeCanvas(size);
  ctx.fillStyle = '#2c3834';
  ctx.fillRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2;
  for (let ring = 1; ring <= 5; ring++) {
    const n = ring * 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.4;
      const rr = ring * size * 0.085;
      ctx.fillStyle = 'rgba(8,12,10,0.95)';
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, size * 0.028 - ring * 0.4, 0, 6.28);
      ctx.fill();
    }
  }
  ctx.fillStyle = 'rgba(6,8,8,1)';
  ctx.beginPath(); ctx.arc(cx, cy, size * 0.05, 0, 6.28); ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 核册通告红纸（镇口张贴） */
export function noticeTexture(size = 256) {
  const [c, ctx] = makeCanvas(size);
  ctx.fillStyle = '#a8241a';
  ctx.fillRect(0, 0, size, size);
  const rand = mulberry32(553);
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = `rgba(60,10,6,${(rand() * 0.16).toFixed(3)})`;
    ctx.fillRect(rand() * size, rand() * size, 2 + rand() * 5, 1 + rand() * 3);
  }
  ctx.fillStyle = '#f4dfa0';
  ctx.font = `700 ${size * 0.3}px "Songti SC",serif`;
  ctx.textAlign = 'center';
  ctx.fillText('還', size / 2, size * 0.36);
  ctx.font = `${size * 0.105}px "Songti SC",serif`;
  ctx.fillText('核册还地 · 全镇同往', size / 2, size * 0.6);
  ctx.fillText('九月十九 南方大酒店', size / 2, size * 0.76);
  ctx.strokeStyle = 'rgba(240,210,140,0.7)';
  ctx.lineWidth = 3;
  ctx.strokeRect(size * 0.06, size * 0.05, size * 0.88, size * 0.9);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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
  const small = lowspec ? 128 : 256;
  const defs = {
    wood: woodTexture(7, hero),
    stone: stoneTexture(21, hero),
    plaster: plasterTexture(33, hero),
    roof: roofTileTexture(44, mid),
    sand: sandTexture(55, mid),
    slab: slabTexture(66, mid),
    salt: saltTexture(77, small),
    rock: rockTexture(88, mid),
    asphalt: asphaltTexture(611, hero),
    concrete: concreteTexture(631, mid),
    corpseSkin: corpseSkinTexture(111, mid),
    clothNavy: clothTexture(122, [38, 46, 62], small),
    clothGrey: clothTexture(123, [58, 60, 58], small),
    clothRed: clothTexture(124, [110, 22, 18], small),
    // —— 蚀湾 · 人物与酒店 ——
    // 皮肤给 768：整头球面 UV 摊 0..1，脸只占约 1/4——512 时近景是糊的；
    // 1024 启动太慢（皮肤是逐像素生成里最贵的一张）
    skin: skinTexture(211, lowspec ? 256 : 768),
    skinB: skinTexture(217, lowspec ? 256 : 768),      // 第二张底皮（斑驳分布不同）
    skinOld: skinTexture(213, lowspec ? 256 : 768, 1), // 老年皮（皱纹沟+老年斑）
    rubber: rubberTexture(415, small),
    terrazzo: terrazzoTexture(301, hero),
    carpet: carpetTexture(311, [98, 18, 16], mid),
    marble: marbleTexture(321, mid),
    wallpaper: wallpaperTexture(331, mid),
    paintedWall: paintedWallTexture(335, mid),
    tile: tileTexture(341, mid),
    ceiling: ceilingTexture(345, mid),
    veneer: veneerTexture(351, mid),
    curtain: curtainTexture(361, mid),
    satin: satinTexture(391, small),
    driftwood: driftwoodTexture(371, mid),
    sediment: sedimentTexture(381, mid),
    clothSuit: plainClothTexture(401, [42, 42, 48], small),
    clothShirt: plainClothTexture(402, [206, 202, 188], small),
    clothVest: plainClothTexture(403, [26, 26, 30], small),
    clothWork: plainClothTexture(404, [56, 66, 90], small),
    clothBrown: plainClothTexture(405, [96, 78, 58], small),
    clothUniform: plainClothTexture(406, [34, 48, 56], small), // 岗亭员藏青制服
    clothDress: plainClothTexture(407, [84, 52, 60], small),   // 2001 连衣裙暗紫红
  };
  const aniso = lowspec ? 2 : 8;
  for (const [k, v] of Object.entries(defs)) {
    set[k] = {
      map: toTex(v.map, { aniso }),
      normalMap: toTex(v.normal, { srgb: false, aniso }),
      roughnessMap: toTex(v.rough, { srgb: false, aniso }),
    };
  }
  // 皮肤毛孔微法线（清漆层第二法线）：平铺 3.5 次盖全头
  set.skinPoreN = toTex(skinPoreNormalTexture(219, lowspec ? 128 : 320), { srgb: false, aniso, repeat: [3.5, 3.5] });
  set.brow = toTex(browStrokesTexture(), { aniso, clamp: true });
  set.lash = toTex(lashStrokesTexture(), { aniso, clamp: true });
  set.hairStrand = toTex(hairStrandsTexture(192, 128, 6161, false), { aniso, clamp: true });
  set.hairWisp = toTex(hairStrandsTexture(192, 128, 7273, true), { aniso, clamp: true });
  set.hairFringe = toTex(hairlineFringeTexture(), { aniso, clamp: true });
  set.hairCurtain = toTex(hairCurtainTexture(), { aniso, clamp: true });
  // 前帘双层：内实（绺芯缎带+密股）/ 外散（稀股大摆）——沿宽 4/3 绺
  set.hairCurtainIn = toTex(hairCurtainTexture(160, 256, 9911, { clumps: 4, dense: true }), { aniso, clamp: true });
  set.hairCurtainOut = toTex(hairCurtainTexture(160, 256, 5533, { clumps: 3, dense: false }), { aniso, clamp: true });
  set.waterNormal = waterNormalTexture(99, lowspec ? 256 : 512);
  set.net = netTexture();
  set.lantern = lanternTexture('潮');
  set.lanternJi = lanternTexture('祭');
  set.lanternXi = lanternRedTexture('名');
  set.talisman = talismanTexture();
  set.xiPanel = xiPanelTexture(lowspec ? 256 : 512);
  set.signSouth = signboardTexture('南方大酒店', false);
  set.signSouthV = signboardTexture('南方大酒店', true, 768, 160);
  set.signAqua = signboardTexture('蚀湾海洋馆', false, 768, 224);
  set.mural = muralTexture(lowspec ? 256 : 512);
  set.poreplate = poreplateTexture();
  set.notice = noticeTexture();
  return set;
}
