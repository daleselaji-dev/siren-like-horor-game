// 程序化贴图库 v3《返潮》：全部 Canvas 运行时生成（颜色 + 高度→法线 + 粗糙度），零二进制资产。
// 风格规范见 docs/美术圣经.md（ART_DIRECTION_CANON）：
//   千禧年中国沿海小城婚宴酒店——脏白、褪色粉、红金婚宴、烟黄、灰绿、深棕。
//   先真实再异常：污渍来自使用与年代（油手印、拖把弧、烟熏、水渍），不是"恐怖游戏脏"。
import * as THREE from 'three';

// ---------------- 基础工具 ----------------

function makeCanvas(size, h = size) {
  const c = document.createElement('canvas');
  c.width = size; c.height = h;
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
export function makeFbm(seed, octaves = 4) {
  const layers = [];
  for (let o = 0; o < octaves; o++) layers.push(makeValueNoise(seed + o * 131, 8 << o));
  return (x, y) => {
    let v = 0, amp = 0.5, sum = 0;
    for (let o = 0; o < octaves; o++) { v += layers[o](x, y) * amp; sum += amp; amp *= 0.5; }
    return v / sum;
  };
}

// 脊状噪声（细裂缝网络）
function makeRidged(seed, octaves = 3) {
  const fbm = makeFbm(seed, octaves);
  return (x, y) => 1 - Math.abs(fbm(x, y) - 0.5) * 2;
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function sstep(a, b, t) { t = clamp01((t - a) / (b - a)); return t * t * (3 - 2 * t); }

/**
 * 核心管线：单趟逐像素填充 颜色 + 高度 + 粗糙度。
 * fn(u, v, out)：out[0..2]=RGB(0-255) out[3]=height(0-1) out[4]=rough(0-1)
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

function toTex(canvas, { srgb = true, repeat = [1, 1], aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

// ============================================================
// 建筑内饰
// ============================================================

/** 脏白涂料墙：滚涂痕 + 烟熏渍 + 桌椅磨痕带 + 细裂缝 + 钉眼 */
export function dirtyWhiteWall(seed = 31, size = 512) {
  const fbm = makeFbm(seed, 5);
  const ridge = makeRidged(seed + 5, 4);
  const drip = makeValueNoise(seed + 23, 48);
  return buildMaps(size, (u, v, out) => {
    // 基底：脏白偏烟黄
    const f = fbm(u * 1.4, v * 1.4);
    let r = 196 + f * 18, g = 190 + f * 17, b = 176 + f * 15;
    // 滚涂痕：竖向宽条微差
    const roller = Math.sin(u * Math.PI * 14 + fbm(u, v) * 3) * 0.5 + 0.5;
    r -= roller * 5; g -= roller * 5; b -= roller * 4;
    // 烟熏黄渍（上部,聚在天花交界）
    const smoke = sstep(0.55, 0.98, 1 - v) * clamp01((fbm(u * 2 + 7, v * 2 + 7) - 0.35) * 1.6);
    r -= smoke * 14; g -= smoke * 26; b -= smoke * 52;
    // 磨痕带：椅背/餐车高度(约v 0.55~0.7)被蹭出的灰带
    const scuff = sstep(0.52, 0.6, v) * (1 - sstep(0.68, 0.76, v)) * clamp01((fbm(u * 4 + 3, v * 8) - 0.3) * 2.2);
    r -= scuff * 48; g -= scuff * 46; b -= scuff * 40;
    // 拖把弧痕（底部）
    const mop = sstep(0.8, 0.98, v) * (Math.sin(u * Math.PI * 9 + v * 20) * 0.5 + 0.5) * 0.5;
    r -= mop * 22; g -= mop * 20; b -= mop * 14;
    // 细裂缝
    const crack = clamp01((ridge(u * 2.2, v * 2.2) - 0.95) * 20);
    r *= 1 - crack * 0.4; g *= 1 - crack * 0.4; b *= 1 - crack * 0.38;
    // 滴水黄痕
    const dr = clamp01((drip(u * 6, 0.15) - 0.66) * 5) * sstep(0.1, 0.7, v);
    r -= dr * 10; g -= dr * 20; b -= dr * 34;
    // 手印油渍（门边高度的深色云斑）
    const hand = clamp01((fbm(u * 3 + 11, v * 3 + 11) - 0.62) * 4) * sstep(0.4, 0.55, v) * (1 - sstep(0.62, 0.8, v));
    r -= hand * 26; g -= hand * 28; b -= hand * 26;
    const grain = (fbm(u * 12, v * 12) - 0.5) * 8;
    out[0] = r + grain; out[1] = g + grain; out[2] = b + grain;
    out[3] = clamp01(0.62 + f * 0.1 - crack * 0.3 + roller * 0.03);
    out[4] = clamp01(0.86 - hand * 0.15 + smoke * 0.05);
  }, 1.5);
}

/** 褪色粉墙纸：小团花 + 接缝翘边 + 水渍晕圈 —— 千禧婚宴酒店走廊的皮肤 */
export function fadedPinkWallpaper(seed = 47, size = 512) {
  const fbm = makeFbm(seed, 4);
  return buildMaps(size, (u, v, out) => {
    // 基底：褪色粉
    const f = fbm(u * 2, v * 2);
    let r = 198 + f * 12, g = 164 + f * 10, b = 156 + f * 10;
    // 团花：斜向网格上的小菱花（凸起印花）
    const gu = (u * 9 + v * 4.5) % 1, gv = (v * 9 - u * 4.5 + 9) % 1;
    const fd = Math.hypot(gu - 0.5, gv - 0.5);
    const flower = sstep(0.24, 0.1, fd) * (0.6 + 0.4 * Math.sin(fd * 40));
    r -= flower * 22; g -= flower * 26; b -= flower * 18;
    // 纵向接缝（每 1/3）+ 翘边阴影
    const seam = Math.min(Math.abs(u - 1 / 3), Math.abs(u - 2 / 3), u, 1 - u);
    const seamLine = sstep(0.012, 0.0, seam);
    r -= seamLine * 30; g -= seamLine * 30; b -= seamLine * 26;
    // 大片水渍晕圈：边缘深色轮廓线
    const stainF = fbm(u * 1.1 + 5, v * 1.1 + 5);
    const stain = sstep(0.55, 0.62, stainF);
    const stainEdge = sstep(0.55, 0.585, stainF) * (1 - sstep(0.585, 0.62, stainF));
    r -= stain * 16 + stainEdge * 30; g -= stain * 20 + stainEdge * 34; b -= stain * 22 + stainEdge * 32;
    // 底部踢脚以上返潮带（发灰发绿）
    const damp = sstep(0.72, 0.98, v) * (0.5 + fbm(u * 5, v * 5) * 0.5);
    r -= damp * 34; g -= damp * 22; b -= damp * 26;
    // 阳光褪色（上半更浅）
    const fade = sstep(0.55, 0.05, v) * 0.5;
    r += fade * 16; g += fade * 16; b += fade * 15;
    out[0] = r; out[1] = g; out[2] = b;
    out[3] = clamp01(0.55 + flower * 0.2 + f * 0.1 - seamLine * 0.2);
    out[4] = clamp01(0.88 - damp * 0.1);
  }, 1.3);
}

/** 米白瓷砖地：60cm 方砖 + 灰缝积垢 + 磨亮走道 + 裂角 */
export function lobbyTileFloor(seed = 61, size = 512) {
  const fbm = makeFbm(seed, 4);
  const n = 4; // 每贴图 4×4 块
  return buildMaps(size, (u, v, out) => {
    const iu = (u * n) | 0, iv = (v * n) | 0;
    const cellR = mulberry32(seed + iu * 13 + iv * 101);
    const shade = 0.94 + (cellR() - 0.5) * 0.07;
    const f = fbm(u * 3, v * 3);
    const fu = (u * n) % 1, fv = (v * n) % 1;
    const e = Math.min(fu, 1 - fu, fv, 1 - fv) * n;
    const edge = clamp01(e * 5);
    // 米白砖面 + 云纹
    const cloud = fbm(u * 6 + iu, v * 6 + iv) * 0.5;
    let r = (206 + cloud * 18) * shade, g = (200 + cloud * 16) * shade, b = (188 + cloud * 15) * shade;
    // 灰缝积垢
    const joint = 1 - edge;
    r -= joint * 96; g -= joint * 92; b -= joint * 82;
    // 走道磨亮带（对角高光泽区）
    const walkway = sstep(0.35, 0.5, Math.abs(u - v)) * 0;
    const polish = clamp01((fbm(u * 1.3 + 4, v * 1.3 + 4) - 0.42) * 2.4);
    // 陈年污渍
    const grime = clamp01((fbm(u * 2.6 + 9, v * 2.6 + 9) - 0.58) * 4);
    r -= grime * 28; g -= grime * 30; b -= grime * 28;
    // 裂角
    const crack = (edge < 0.4 ? 1 - edge / 0.4 : 0) * clamp01((cellR() - 0.72) * 6);
    r -= crack * 40; g -= crack * 40; b -= crack * 36;
    out[0] = r; out[1] = g; out[2] = b;
    out[3] = clamp01(edge * 0.6 + cloud * 0.2 + 0.2 - crack * 0.3);
    out[4] = clamp01(0.42 - polish * 0.2 + joint * 0.5 + grime * 0.12 + walkway);
  }, 2.2);
}

/** 后厨小白瓷砖墙/地：10cm 小方砖 + 油垢渐层 + 缺块 */
export function kitchenTile(seed = 71, size = 512) {
  const fbm = makeFbm(seed, 4);
  const n = 12;
  return buildMaps(size, (u, v, out) => {
    const iu = (u * n) | 0, iv = (v * n) | 0;
    const cellR = mulberry32(seed + iu * 29 + iv * 7)();
    const fu = (u * n) % 1, fv = (v * n) % 1;
    const e = Math.min(fu, 1 - fu, fv, 1 - fv) * n;
    const edge = clamp01(e * 7);
    const f = fbm(u * 4, v * 4);
    let r = 208 + f * 10, g = 208 + f * 10, b = 198 + f * 10;
    // 个别砖偏灰绿
    if (cellR < 0.12) { r -= 26; g -= 12; b -= 18; }
    // 缺块：露出深色水泥
    const missing = cellR > 0.965;
    if (missing) { r = 74 + f * 20; g = 70 + f * 18; b = 62 + f * 16; }
    // 油垢：整体自下而上的黄褐渐层 + 云斑
    const grease = (sstep(0.35, 0.95, v) * 0.7 + clamp01((fbm(u * 2 + 3, v * 2 + 3) - 0.45) * 2) * 0.5);
    r -= grease * 52; g -= grease * 62; b -= grease * 88;
    // 灰缝
    const joint = 1 - edge;
    r -= joint * (missing ? 10 : 110); g -= joint * (missing ? 10 : 106); b -= joint * (missing ? 10 : 92);
    out[0] = r; out[1] = g; out[2] = b;
    out[3] = missing ? 0.25 : clamp01(edge * 0.7 + 0.15);
    out[4] = clamp01((missing ? 0.9 : 0.3) + joint * 0.45 + grease * 0.25 - 0.08);
  }, 2.4);
}

/** 红金团花地毯：婚宴大厅 —— 团花 + 走道压平磨秃 + 烫痕烟疤 */
export function banquetCarpet(seed = 83, size = 512) {
  const fbm = makeFbm(seed, 4);
  return buildMaps(size, (u, v, out) => {
    const f = fbm(u * 3, v * 3);
    // 底：暗酒红
    let r = 106 + f * 16, g = 26 + f * 7, b = 24 + f * 7;
    // 团花网格：大菱形金线框 + 中心团花
    const gu = (u * 4) % 1, gv = (v * 4) % 1;
    const dd = Math.abs(gu - 0.5) + Math.abs(gv - 0.5); // 菱形距离
    const frame = sstep(0.035, 0.0, Math.abs(dd - 0.42));
    const fd = Math.hypot(gu - 0.5, gv - 0.5);
    const medallion = sstep(0.2, 0.06, fd) * (0.55 + 0.45 * Math.sin(fd * 55));
    const gold = clamp01(frame + medallion);
    r += gold * 72; g += gold * 60; b += gold * 12;
    // 绒毛方向噪声
    const pile = (fbm(u * 16, v * 16) - 0.5) * 14;
    r += pile; g += pile * 0.5; b += pile * 0.4;
    // 走道磨秃（中带绒毛压平发灰、图案磨淡）
    const worn = clamp01((fbm(u * 1.2 + 8, v * 0.5 + 3) - 0.42) * 2.2);
    r = r * (1 - worn * 0.3) + worn * 60; g = g * (1 - worn * 0.25) + worn * 44; b = b * (1 - worn * 0.2) + worn * 40;
    // 烟疤/烫痕：小黑圆
    const scar = fbm(u * 9 + 17, v * 9 + 17) > 0.83 ? 1 : 0;
    r -= scar * 46; g -= scar * 16; b -= scar * 14;
    // 泼洒渍（茶/酒的深色云）
    const spill = clamp01((fbm(u * 2 + 21, v * 2 + 21) - 0.6) * 4);
    r *= 1 - spill * 0.3; g *= 1 - spill * 0.3; b *= 1 - spill * 0.24;
    out[0] = r; out[1] = g; out[2] = b;
    out[3] = clamp01(0.42 + gold * 0.24 + pile * 0.01 - worn * 0.25);
    out[4] = clamp01(0.97 - gold * 0.12 - worn * 0.06);
  }, 1.5);
}

/** 廉价木皮（前台/门/踢脚）：直纹橘棕清漆 + 磕碰露底 + 起皮 */
export function woodVeneer(seed = 97, size = 512) {
  const fbm = makeFbm(seed, 4);
  const fbm2 = makeFbm(seed + 71, 4);
  return buildMaps(size, (u, v, out) => {
    const warp = fbm(u * 2, v * 2);
    // 直纹：细密顺纹
    const grain = 0.5 + 0.5 * Math.sin((v * 38 + warp * 4 + u * 1.2) * Math.PI * 2) * (0.5 + fbm2(u * 8, v * 8) * 0.5);
    let r = 132 + grain * 30 + warp * 12;
    let g = 82 + grain * 20 + warp * 9;
    let b = 46 + grain * 12 + warp * 6;
    // 清漆高光区（低粗糙）
    const varnish = 0.4 + grain * 0.15;
    // 磕碰露底色（浅木色缺口）
    const chip = clamp01((fbm(u * 6 + 5, v * 6 + 5) - 0.74) * 9);
    r += chip * 62; g += chip * 62; b += chip * 46;
    // 边角起皮阴影
    const peel = clamp01((fbm2(u * 3 + 9, v * 3 + 9) - 0.68) * 5);
    r *= 1 - peel * 0.32; g *= 1 - peel * 0.34; b *= 1 - peel * 0.3;
    // 陈年手垢（把手高度）
    const smudge = clamp01((fbm(u * 2 + 13, v * 5 + 13) - 0.55) * 3);
    r *= 1 - smudge * 0.2; g *= 1 - smudge * 0.22; b *= 1 - smudge * 0.2;
    out[0] = r; out[1] = g; out[2] = b;
    out[3] = clamp01(0.5 + grain * 0.15 + warp * 0.12 - chip * 0.2 - peel * 0.15);
    out[4] = clamp01(0.38 + chip * 0.4 + peel * 0.3 + smudge * 0.18 - varnish * 0.12);
  }, 1.8);
}

/** 矿棉板吊顶：600 方格 + 水渍黄晕 + 塌角 */
export function ceilingTile(seed = 113, size = 512) {
  const fbm = makeFbm(seed, 4);
  const n = 4;
  return buildMaps(size, (u, v, out) => {
    const iu = (u * n) | 0, iv = (v * n) | 0;
    const cellR = mulberry32(seed + iu * 17 + iv * 43)();
    const fu = (u * n) % 1, fv = (v * n) % 1;
    const e = Math.min(fu, 1 - fu, fv, 1 - fv) * n;
    const edge = clamp01(e * 8);
    const f = fbm(u * 5, v * 5);
    let r = 212 + f * 12, g = 208 + f * 12, b = 198 + f * 11;
    // 矿棉孔洞噪点
    const pin = fbm(u * 30, v * 30) > 0.62 ? 12 : 0;
    r -= pin; g -= pin; b -= pin;
    // 水渍黄晕（部分格子整格泛黄，带深色边界圈）
    if (cellR < 0.3) {
      const stainF = fbm((fu + iu) * 1.5, (fv + iv) * 1.5);
      const stain = sstep(0.38, 0.5, stainF);
      const ring = sstep(0.38, 0.43, stainF) * (1 - sstep(0.43, 0.5, stainF));
      r -= stain * 20 + ring * 26; g -= stain * 34 + ring * 32; b -= stain * 66 + ring * 42;
    }
    // 龙骨缝（银灰T形条）
    const joint = 1 - edge;
    r = r * edge + (1 - edge) * 148; g = g * edge + (1 - edge) * 148; b = b * edge + (1 - edge) * 144;
    out[0] = r; out[1] = g; out[2] = b;
    out[3] = clamp01(0.6 + f * 0.1 - joint * 0.3);
    out[4] = clamp01(0.94 - joint * 0.4);
  }, 1.2);
}

/** 红缎桌布：垂坠折痕 + 缎面各向异性感 + 陈渍 */
export function tableclothRed(seed = 127, size = 256) {
  const fbm = makeFbm(seed, 4);
  return buildMaps(size, (u, v, out) => {
    const f = fbm(u * 3, v * 3);
    // 垂直褶皱
    const fold = Math.sin(u * Math.PI * 18 + f * 5) * 0.5 + 0.5;
    let r = 138 + fold * 46 + f * 14;
    let g = 20 + fold * 14 + f * 5;
    let b = 22 + fold * 12 + f * 5;
    // 缎光带
    const sheen = sstep(0.6, 0.95, fold);
    r += sheen * 30; g += sheen * 10; b += sheen * 10;
    // 陈渍
    const stain = clamp01((fbm(u * 2.4 + 7, v * 2.4 + 7) - 0.6) * 4);
    r *= 1 - stain * 0.3; g *= 1 - stain * 0.25; b *= 1 - stain * 0.22;
    // 尘灰(多年没换)
    const dust = sstep(0.0, 0.25, v) * 0.4;
    r = r * (1 - dust * 0.25) + dust * 30; g = g * (1 - dust * 0.2) + dust * 28; b = b * (1 - dust * 0.2) + dust * 26;
    out[0] = r; out[1] = g; out[2] = b;
    out[3] = clamp01(0.4 + fold * 0.3);
    out[4] = clamp01(0.55 - sheen * 0.25 + stain * 0.15 + dust * 0.2);
  }, 1.6);
}

/** 酒红丝绒帷幔（舞台/窗）：宽垂褶 + 顶部挂尘 */
export function velvetCurtain(seed = 139, size = 256) {
  const fbm = makeFbm(seed, 3);
  return buildMaps(size, (u, v, out) => {
    const f = fbm(u * 2, v * 2);
    const fold = Math.sin(u * Math.PI * 10 + f * 2.5) * 0.5 + 0.5;
    let r = 96 + fold * 52 + f * 10;
    let g = 16 + fold * 14 + f * 4;
    let b = 20 + fold * 14 + f * 4;
    // 绒面深浅噪声
    const nap = (fbm(u * 12, v * 12) - 0.5) * 12;
    r += nap; g += nap * 0.4; b += nap * 0.4;
    // 顶部积尘发灰
    const dust = sstep(0.28, 0.02, v) * 0.6;
    r = r * (1 - dust * 0.3) + dust * 44; g = g * (1 - dust * 0.15) + dust * 40; b = b * (1 - dust * 0.15) + dust * 38;
    // 底部拖地泛旧
    const hem = sstep(0.85, 1, v) * 0.5;
    r *= 1 - hem * 0.25; g *= 1 - hem * 0.2; b *= 1 - hem * 0.2;
    out[0] = r; out[1] = g; out[2] = b;
    out[3] = clamp01(0.35 + fold * 0.4);
    out[4] = 0.97;
  }, 2.0);
}

/** 水磨石/水泥地（服务走廊/后勤）：抹光水泥 + 补丁 + 轮痕 */
export function serviceConcrete(seed = 151, size = 512) {
  const fbm = makeFbm(seed, 5);
  const ridge = makeRidged(seed + 17, 3);
  return buildMaps(size, (u, v, out) => {
    const f = fbm(u * 2.5, v * 2.5);
    let r = 128 + f * 26, g = 124 + f * 25, b = 116 + f * 23;
    // 抹光云斑
    const trowel = fbm(u * 1.2 + 3, v * 1.2 + 3);
    r += (trowel - 0.5) * 20; g += (trowel - 0.5) * 20; b += (trowel - 0.5) * 18;
    // 裂缝
    const crack = clamp01((ridge(u * 2, v * 2) - 0.93) * 15);
    r *= 1 - crack * 0.45; g *= 1 - crack * 0.45; b *= 1 - crack * 0.42;
    // 深色补丁块
    const patch = clamp01((fbm(u * 1.6 + 12, v * 1.6 + 12) - 0.63) * 8);
    r = r * (1 - patch) + patch * 88; g = g * (1 - patch) + patch * 86; b = b * (1 - patch) + patch * 80;
    // 餐车轮痕：两道平行的黑亮压痕
    const lane = Math.min(Math.abs(v - 0.36), Math.abs(v - 0.6));
    const wheel = sstep(0.03, 0.0, lane) * 0.8;
    r *= 1 - wheel * 0.3; g *= 1 - wheel * 0.3; b *= 1 - wheel * 0.28;
    // 油渍
    const oil = clamp01((fbm(u * 3 + 5, v * 3 + 5) - 0.66) * 5);
    r *= 1 - oil * 0.4; g *= 1 - oil * 0.4; b *= 1 - oil * 0.32;
    out[0] = r; out[1] = g; out[2] = b;
    out[3] = clamp01(0.5 + f * 0.2 - crack * 0.3 - wheel * 0.05);
    out[4] = clamp01(0.72 - wheel * 0.3 - oil * 0.35 + patch * 0.1);
  }, 2.0);
}

/** 外立面：旧瓷砖条带（千禧沿海小城公建的皮肤）+ 空调水锈痕 */
export function facadeTile(seed = 163, size = 512) {
  const fbm = makeFbm(seed, 4);
  const rows = 10, cols = 5;
  return buildMaps(size, (u, v, out) => {
    const iu = (u * cols) | 0, iv = (v * rows) | 0;
    const cellR = mulberry32(seed + iu * 31 + iv * 13)();
    const fu = (u * cols) % 1, fv = (v * rows) % 1;
    const e = Math.min(fu, 1 - fu) * cols * 0.5 + Math.min(fv, 1 - fv) * rows * 0.5;
    const edge = clamp01(Math.min(Math.min(fu, 1 - fu) * cols, Math.min(fv, 1 - fv) * rows) * 6);
    const f = fbm(u * 3, v * 3);
    // 米黄条砖，部分脱落露灰浆
    let r = 190 + f * 14, g = 178 + f * 13, b = 150 + f * 12;
    if (cellR > 0.9) { r = 118 + f * 18; g = 114 + f * 17; b = 106 + f * 16; } // 脱落
    // 锈水披挂（从上淌下的褐条）
    const rust = clamp01((makeValueNoise(seed + 3, 40)(u * 3, 0.2) - 0.6) * 4) * sstep(0.05, 0.8, v);
    r -= rust * 40; g -= rust * 62; b -= rust * 70;
    // 湿黑（底部返潮）
    const damp = sstep(0.7, 1, v) * (0.4 + f * 0.6);
    r *= 1 - damp * 0.4; g *= 1 - damp * 0.36; b *= 1 - damp * 0.3;
    const joint = 1 - edge;
    r -= joint * 70; g -= joint * 66; b -= joint * 56;
    out[0] = r; out[1] = g; out[2] = b;
    out[3] = clamp01(edge * 0.6 + f * 0.2);
    out[4] = clamp01(0.6 + joint * 0.3 - damp * 0.25);
  }, 2.4);
}

/** 沥青/湿水泥前庭地面 */
export function forecourtAsphalt(seed = 179, size = 512) {
  const fbm = makeFbm(seed, 5);
  return buildMaps(size, (u, v, out) => {
    const f = fbm(u * 3, v * 3);
    let r = 66 + f * 26, g = 66 + f * 25, b = 64 + f * 24;
    // 积水洼（低洼镜面）
    const puddle = clamp01((fbm(u * 1.7 + 6, v * 1.7 + 6) - 0.58) * 5);
    r *= 1 - puddle * 0.4; g *= 1 - puddle * 0.36; b *= 1 - puddle * 0.24;
    // 修补沥青条
    const patch = clamp01((fbm(u * 1.1 + 15, v * 4 + 15) - 0.66) * 7);
    r = r * (1 - patch) + patch * 38; g = g * (1 - patch) + patch * 38; b = b * (1 - patch) + patch * 40;
    // 白漆停车线残段
    const line = (Math.abs(v - 0.5) < 0.012 && fbm(u * 5, 0.5) > 0.45) ? 1 : 0;
    r += line * 90; g += line * 88; b += line * 80;
    out[0] = r; out[1] = g; out[2] = b;
    out[3] = clamp01(f * 0.7 - puddle * 0.2);
    out[4] = clamp01(0.9 - puddle * 0.62 - line * 0.1);
  }, 2.2);
}

// ============================================================
// 人物
// ============================================================

/** F01/员工 皮肤：40-50 岁中国男性 —— 偏黄暖调 + 老年斑 + 细纹 + 轻微汗光 */
export function agedSkin(seed = 211, size = 512) {
  const fbm = makeFbm(seed, 4);
  const ridge = makeRidged(seed + 31, 4);
  return buildMaps(size, (u, v, out) => {
    const f = fbm(u * 4, v * 4);
    // 底色：中年偏黄的皮肤
    let r = 186 + f * 22, g = 148 + f * 18, b = 122 + f * 15;
    // 血色斑驳（低频）
    const flush = clamp01((fbm(u * 1.8 + 13, v * 1.8 + 13) - 0.5) * 2.4);
    r += flush * 12; g -= flush * 6; b -= flush * 8;
    // 老年斑：小块深褐
    const spotF = fbm(u * 7 + 9, v * 7 + 9);
    const spot = sstep(0.72, 0.78, spotF);
    r -= spot * 52; g -= spot * 48; b -= spot * 34;
    // 细纹网络（脊线）
    const wrinkle = clamp01((ridge(u * 6, v * 6) - 0.9) * 10) * 0.6;
    r -= wrinkle * 26; g -= wrinkle * 22; b -= wrinkle * 16;
    // 毛孔
    const pore = (fbm(u * 26, v * 26) - 0.5) * 9;
    // 汗光/油光区（低粗糙的云斑）
    const sweat = clamp01((fbm(u * 2.2 + 5, v * 2.2 + 5) - 0.5) * 2.2);
    out[0] = r + pore; out[1] = g + pore; out[2] = b + pore * 0.8;
    out[3] = clamp01(0.5 + f * 0.2 - wrinkle * 0.24 - spot * 0.05);
    out[4] = clamp01(0.62 - sweat * 0.22 + wrinkle * 0.1);
  }, 1.3);
}

/** 灰蓝工装布：细斜纹 + 洗白 + 肘部磨亮 + 领口汗渍 —— F01 Canon 服装 */
export function workwearCloth(seed = 223, baseRGB = [96, 104, 116], size = 256) {
  const fbm = makeFbm(seed, 4);
  return buildMaps(size, (u, v, out) => {
    const f = fbm(u * 3, v * 3);
    // 斜纹布纹
    const twill = Math.sin((u * 140 + v * 70) * Math.PI) * 3.2 + Math.sin(v * 240 * Math.PI) * 1.6;
    let r = baseRGB[0] + f * 16 + twill;
    let g = baseRGB[1] + f * 16 + twill;
    let b = baseRGB[2] + f * 18 + twill;
    // 反复洗涤的褪白（大面积泛灰）
    const washed = clamp01((fbm(u * 1.6 + 8, v * 1.6 + 8) - 0.4) * 1.8);
    r += washed * 20; g += washed * 20; b += washed * 16;
    // 磨亮区（肘/袋口的略浅色）
    const wear = clamp01((fbm(u * 2.8 + 6, v * 2.8 + 6) - 0.62) * 4);
    r += wear * 22; g += wear * 22; b += wear * 18;
    // 陈年油渍点
    const oil = clamp01((fbm(u * 6 + 17, v * 6 + 17) - 0.72) * 8);
    r *= 1 - oil * 0.32; g *= 1 - oil * 0.32; b *= 1 - oil * 0.26;
    // 褶皱明暗（穿在身上多年的定型褶）
    const crease = Math.sin(u * Math.PI * 7 + f * 4) * 0.5 + 0.5;
    r -= crease * 9; g -= crease * 9; b -= crease * 8;
    out[0] = r; out[1] = g; out[2] = b;
    out[3] = clamp01(0.5 + twill * 0.02 + crease * 0.16 + f * 0.14);
    out[4] = clamp01(0.94 - wear * 0.1 - oil * 0.06);
  }, 1.1);
}

/** 深色西裤/裤装布 */
export function trouserCloth(seed = 227, size = 256) {
  return workwearCloth(seed, [56, 58, 62], size);
}

/** 服务员制服布（白衬衫脏旧） */
export function shirtCloth(seed = 229, size = 256) {
  return workwearCloth(seed, [196, 192, 182], size);
}

// ============================================================
// 图形贴图（Canvas 直绘）
// ============================================================

/** 双喜字挂饰（舞台背景板） */
export function doubleXiTexture(size = 512) {
  const [c, ctx] = makeCanvas(size);
  // 红底缎面
  const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.75);
  grad.addColorStop(0, '#8e1a14');
  grad.addColorStop(0.7, '#6e120e');
  grad.addColorStop(1, '#520d0a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  // 缎面竖褶
  for (let i = 0; i < 26; i++) {
    const x = (i / 26) * size;
    ctx.fillStyle = `rgba(255,120,90,${0.03 + (i % 3) * 0.012})`;
    ctx.fillRect(x, 0, 3, size);
  }
  // 金色双喜
  ctx.fillStyle = '#d9a83e';
  ctx.shadowColor = 'rgba(90,40,10,0.8)';
  ctx.shadowBlur = 8;
  ctx.font = `bold ${size * 0.62}px "Songti SC","Noto Serif SC",serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('囍', size / 2, size / 2 + size * 0.03);
  ctx.shadowBlur = 0;
  // 积尘（上缘发灰）
  const dust = ctx.createLinearGradient(0, 0, 0, size * 0.3);
  dust.addColorStop(0, 'rgba(120,110,100,0.35)');
  dust.addColorStop(1, 'rgba(120,110,100,0)');
  ctx.fillStyle = dust;
  ctx.fillRect(0, 0, size, size * 0.3);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 婚宴横幅：红底黄字 */
export function bannerTexture(text = '热烈祝贺陈志明先生 林小满女士 新婚典礼', w = 1024, h = 128) {
  const [c, ctx] = makeCanvas(w, h);
  ctx.fillStyle = '#8e1a14';
  ctx.fillRect(0, 0, w, h);
  // 布面横褶
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.05 + (i % 2) * 0.04})`;
    ctx.fillRect(0, (i / 8) * h + 4, w, 2);
  }
  ctx.fillStyle = '#e8c85a';
  ctx.font = `bold ${h * 0.52}px "Songti SC","Noto Serif SC",serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 2);
  // 褪色磨白
  const rand = mulberry32(555);
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = `rgba(142,26,20,${(rand() * 0.5).toFixed(2)})`;
    ctx.fillRect(rand() * w, rand() * h, 2 + rand() * 8, 1 + rand() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 酒店门头字：蚀湾迎宾楼（旧亚克力发光字，缺笔画） */
export function hotelSignTexture(w = 1024, h = 192) {
  const [c, ctx] = makeCanvas(w, h);
  ctx.fillStyle = '#1a1714';
  ctx.fillRect(0, 0, w, h);
  const chars = ['蚀', '湾', '迎', '宾', '楼'];
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  chars.forEach((ch, i) => {
    const x = w * (0.14 + i * 0.18);
    // 第4字灯坏了：只剩轮廓
    const dead = i === 3;
    ctx.font = `bold ${h * 0.62}px "Songti SC","Noto Serif SC",serif`;
    if (dead) {
      ctx.strokeStyle = 'rgba(120,80,60,0.8)';
      ctx.lineWidth = 2;
      ctx.strokeText(ch, x, h * 0.52);
    } else {
      ctx.shadowColor = 'rgba(255,150,80,0.9)';
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#ffb35e';
      ctx.fillText(ch, x, h * 0.52);
      ctx.shadowBlur = 0;
    }
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 墙上相框：婚宴合影（人影只给轮廓，隔着玻璃反光） */
export function weddingPhotoTexture(seed = 5, size = 256) {
  const [c, ctx] = makeCanvas(size, Math.round(size * 0.72));
  const h = Math.round(size * 0.72);
  const rand = mulberry32(seed * 977);
  // 泛黄相纸
  const grad = ctx.createLinearGradient(0, 0, size, h);
  grad.addColorStop(0, '#b8a888');
  grad.addColorStop(1, '#8e7f62');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, h);
  // 背景：宴厅轮廓（暗红块 + 吊灯光斑）
  ctx.fillStyle = 'rgba(90,30,24,0.55)';
  ctx.fillRect(size * 0.06, h * 0.08, size * 0.88, h * 0.55);
  ctx.fillStyle = 'rgba(230,190,120,0.5)';
  ctx.beginPath(); ctx.arc(size * 0.5, h * 0.18, size * 0.05, 0, 6.28); ctx.fill();
  // 一排人影（剪影，中间两人穿白/红）
  const n = 8 + (rand() * 4 | 0);
  for (let i = 0; i < n; i++) {
    const x = size * (0.12 + (i / (n - 1)) * 0.76);
    const ph = h * (0.3 + rand() * 0.06);
    const y = h * 0.62;
    const central = Math.abs(i - n / 2) < 1.2;
    ctx.fillStyle = central ? (i < n / 2 ? 'rgba(200,190,180,0.85)' : 'rgba(140,40,34,0.85)') : 'rgba(40,34,30,0.85)';
    // 身体
    ctx.fillRect(x - size * 0.028, y - ph * 0.72, size * 0.056, ph * 0.72);
    // 头
    ctx.beginPath(); ctx.arc(x, y - ph * 0.72 - size * 0.026, size * 0.026, 0, 6.28); ctx.fill();
  }
  // 底部手写日期
  ctx.fillStyle = 'rgba(60,44,26,0.8)';
  ctx.font = `${size * 0.062}px "Kaiti SC","Songti SC",serif`;
  ctx.textAlign = 'right';
  ctx.fillText('一九九九年十二月三十一日', size * 0.94, h * 0.93);
  // 玻璃反光斜条
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.moveTo(size * 0.1, 0); ctx.lineTo(size * 0.36, 0); ctx.lineTo(size * 0.02, h); ctx.lineTo(-size * 0.1, h);
  ctx.closePath(); ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 拆迁公告 */
export function noticeTexture(size = 256) {
  const [c, ctx] = makeCanvas(size, Math.round(size * 1.4));
  const h = Math.round(size * 1.4);
  ctx.fillStyle = '#cfc7ae';
  ctx.fillRect(0, 0, size, h);
  const rand = mulberry32(777);
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(120,104,70,${(rand() * 0.12).toFixed(3)})`;
    ctx.fillRect(rand() * size, rand() * h, 2 + rand() * 6, 1 + rand() * 3);
  }
  ctx.fillStyle = '#8f1d12';
  ctx.font = `bold ${size * 0.13}px "Songti SC",serif`;
  ctx.textAlign = 'center';
  ctx.fillText('拆 迁 公 告', size / 2, h * 0.14);
  ctx.fillStyle = '#3a352a';
  ctx.font = `${size * 0.055}px "Songti SC",serif`;
  const lines = [
    '根据蚀湾旧城改造规划（二〇〇三）',
    '迎宾楼（原水产公司招待所）',
    '列入第三批拆除范围。',
    '',
    '请住户及原单位于本月内',
    '完成搬迁、注销登记。',
    '',
    '逾期视为放弃。',
  ];
  lines.forEach((l, i) => ctx.fillText(l, size / 2, h * 0.26 + i * size * 0.085));
  // 公章
  ctx.strokeStyle = 'rgba(160,30,20,0.75)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(size * 0.66, h * 0.86, size * 0.13, 0, 6.28); ctx.stroke();
  ctx.fillStyle = 'rgba(160,30,20,0.7)';
  ctx.font = `${size * 0.06}px "Songti SC",serif`;
  ctx.fillText('蚀湾镇改造办', size * 0.66, h * 0.875);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 水面法线（前庭外的海） */
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

/** 花岗石（外台阶/门柱） */
export function graniteTexture(seed = 21, size = 512) {
  const fbm = makeFbm(seed, 4);
  return buildMaps(size, (u, v, out) => {
    const f = fbm(u * 3, v * 3);
    const speck = fbm(u * 22, v * 22);
    let r = 118 + f * 24 + (speck > 0.66 ? 26 : 0);
    let g = 116 + f * 24 + (speck > 0.66 ? 24 : 0);
    let b = 112 + f * 22 + (speck > 0.66 ? 22 : 0);
    const wet = sstep(0.6, 0.95, v) * (0.4 + f * 0.6);
    r *= 1 - wet * 0.34; g *= 1 - wet * 0.32; b *= 1 - wet * 0.26;
    out[0] = r; out[1] = g; out[2] = b;
    out[3] = clamp01(f * 0.6 + speck * 0.15);
    out[4] = clamp01(0.55 - wet * 0.3);
  }, 1.8);
}

/** 黑色短发（侧分油光） */
export function hairTexture(seed = 233, size = 128) {
  const fbm = makeFbm(seed, 3);
  return buildMaps(size, (u, v, out) => {
    const strand = Math.sin((u * 60 + fbm(u, v) * 6) * Math.PI) * 0.5 + 0.5;
    let r = 18 + strand * 14, g = 17 + strand * 12, b = 18 + strand * 12;
    out[0] = r; out[1] = g; out[2] = b;
    out[3] = clamp01(0.4 + strand * 0.3);
    out[4] = clamp01(0.42 - strand * 0.12);
  }, 1.6);
}

// ---------------- 打包导出 ----------------
export function buildTextureSet(lowspec = false) {
  const hero = lowspec ? 256 : 1024;
  const mid = lowspec ? 256 : 512;
  const small = lowspec ? 128 : 256;
  const set = {};
  const defs = {
    wallWhite: dirtyWhiteWall(31, hero),
    wallpaper: fadedPinkWallpaper(47, hero),
    tileLobby: lobbyTileFloor(61, hero),
    tileKitchen: kitchenTile(71, mid),
    carpet: banquetCarpet(83, hero),
    veneer: woodVeneer(97, mid),
    ceiling: ceilingTile(113, mid),
    tablecloth: tableclothRed(127, small),
    curtain: velvetCurtain(139, mid),
    concrete: serviceConcrete(151, mid),
    facade: facadeTile(163, mid),
    asphalt: forecourtAsphalt(179, mid),
    granite: graniteTexture(21, mid),
    skin: agedSkin(211, mid),
    workwear: workwearCloth(223, [96, 104, 116], small),
    trouser: trouserCloth(227, small),
    shirt: shirtCloth(229, small),
    hair: hairTexture(233, 128),
  };
  const aniso = lowspec ? 2 : 8;
  for (const [k, v] of Object.entries(defs)) {
    set[k] = {
      map: toTex(v.map, { aniso }),
      normalMap: toTex(v.normal, { srgb: false, aniso }),
      roughnessMap: toTex(v.rough, { srgb: false, aniso }),
    };
  }
  set.waterNormal = waterNormalTexture(99, lowspec ? 256 : 512);
  set.doubleXi = doubleXiTexture(lowspec ? 256 : 512);
  set.banner = bannerTexture();
  set.hotelSign = hotelSignTexture();
  set.photos = [weddingPhotoTexture(5), weddingPhotoTexture(9), weddingPhotoTexture(13)];
  set.notice = noticeTexture();
  return set;
}
