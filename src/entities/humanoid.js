// 程序化人形 v4（蚀湾）：先真实后异常 · 逐种子独特面孔
// 美术铁律：6 米外是具体的 2001 年中国人（工装/西装/白衬衫黑马甲/枣红缎袄），
//           2 米内才读出「唯一主异常」。禁止方块人剪影，禁止一张脸复制粘贴。
// v4 要点：
//   头部：逐种子参数化雕刻（头宽/面长/下颌/下巴/颧骨/颊陷/眉弓/眼距/鼻唇/耳/不对称翘曲）
//   眼睛：湿润高反光巩膜+虹膜、左右眼睑不对称下垂、眨眼
//   躯干：Lathe 车削轮廓按服装换型 + 逐种子肩宽/胸厚；男性喉结、连衣裙锁骨
//   四肢：16 段车削（肌腹起伏、腕踝收细）、分指手、皮鞋/布鞋
//   工位异常：报数员(口部鱼籽钙化)、侍应(浮木颈臂+沉积托盘+传送带步态)、
//             理册婆(第三眼矿物孔板+倒退步)、岗亭员(投币口嘴+大檐帽)、
//             理骨员(胶皮围裙长手套+永久歪头听缸)、浮客(脚尖离地)、回眸客(残影)
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { faceAnchor, applySkinRim, applySoakedSSS, FACE_HAIR } from '../world/faces.js';

// ---- 共享几何/材质缓存 ----
const _geoCache = new Map();
function G(key, make) {
  if (!_geoCache.has(key)) _geoCache.set(key, make());
  return _geoCache.get(key);
}
const _matCache = new Map();
function Mtl(key, make) {
  if (!_matCache.has(key)) _matCache.set(key, make());
  return _matCache.get(key);
}
const _m4 = new THREE.Matrix4();
const _lodV = new THREE.Vector3();
const _gzV = new THREE.Vector3();

/** 虹膜贴图（轮17·黑珠眼根治）：限缘暗环 + 虹膜色环（放射纤维纹）+ 瞳孔——
 *  眼睛从此有「层」：巩膜(独立球) > 虹膜盘(本贴图) > 角膜凸(高光) > 睑缘。
 *  base: 虹膜主色（深褐/暖褐两档，2001 县镇的眼睛不需要更多花色） */
const _irisTexCache = new Map();
function irisTexture(base = 0x5a3a22) {
  if (_irisTexCache.has(base)) return _irisTexCache.get(base);
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const cxy = S / 2, R = S * 0.485;
  const br = (base >> 16) & 255, bg = (base >> 8) & 255, bb = base & 255;
  // 底：虹膜体径向渐变（瞳缘略亮的琥珀内圈 → 主色 → 限缘前变深）
  const g0 = x.createRadialGradient(cxy, cxy, S * 0.1, cxy, cxy, R);
  g0.addColorStop(0, `rgb(${Math.min(255, br + 30)},${Math.min(255, bg + 20)},${bb + 6})`);
  g0.addColorStop(0.55, `rgb(${br},${bg},${bb})`);
  g0.addColorStop(0.85, `rgb(${(br * 0.55) | 0},${(bg * 0.55) | 0},${(bb * 0.55) | 0})`);
  g0.addColorStop(1, 'rgb(18,12,8)');
  x.fillStyle = g0;
  x.beginPath(); x.arc(cxy, cxy, R, 0, Math.PI * 2); x.fill();
  // 放射纤维纹：明暗交替细楔（活人虹膜的「丝」）——轮24：对比再抬一档，
  // 聚光下虹膜也要读得出「层」，不许被高光洗成一色灰盘
  let s = 77;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 84; i++) {
    const a = (i / 84) * Math.PI * 2 + rnd() * 0.06;
    const lite = i % 2 === 0;
    x.strokeStyle = lite ? `rgba(${Math.min(255, br + 74)},${Math.min(255, bg + 50)},${bb + 22},0.3)`
      : 'rgba(12,8,5,0.34)';
    x.lineWidth = 1 + rnd() * 1.2;
    x.beginPath();
    x.moveTo(cxy + Math.cos(a) * S * 0.16, cxy + Math.sin(a) * S * 0.16);
    x.lineTo(cxy + Math.cos(a + 0.05) * R * 0.94, cxy + Math.sin(a + 0.05) * R * 0.94);
    x.stroke();
  }
  // 领环（collarette）：瞳缘外一圈略亮的锯齿环——虹膜「内圈-主环-限缘」三层读法
  x.strokeStyle = `rgba(${Math.min(255, br + 56)},${Math.min(255, bg + 40)},${bb + 16},0.4)`;
  x.lineWidth = S * 0.02;
  x.beginPath();
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const rr = S * (0.30 + Math.sin(a * 9 + 1.3) * 0.008);
    if (i === 0) x.moveTo(cxy + Math.cos(a) * rr, cxy + Math.sin(a) * rr);
    else x.lineTo(cxy + Math.cos(a) * rr, cxy + Math.sin(a) * rr);
  }
  x.stroke();
  // 瞳孔（软边黑）：占虹膜直径 ~0.55——室内暗光下的散瞳（0.5m 近景必须一眼读出黑瞳）
  const gp = x.createRadialGradient(cxy, cxy, S * 0.19, cxy, cxy, S * 0.28);
  gp.addColorStop(0, 'rgb(4,3,3)');
  gp.addColorStop(0.85, 'rgb(6,4,4)');
  gp.addColorStop(1, 'rgba(6,4,4,0)');
  x.fillStyle = gp;
  x.beginPath(); x.arc(cxy, cxy, S * 0.28, 0, Math.PI * 2); x.fill();
  // 限缘环：虹膜外缘一道更深的环（虹膜「嵌」在巩膜里的读法）
  x.strokeStyle = 'rgba(10,7,5,0.9)';
  x.lineWidth = S * 0.05;
  x.beginPath(); x.arc(cxy, cxy, R - S * 0.02, 0, Math.PI * 2); x.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  _irisTexCache.set(base, t);
  return t;
}

/** 近距皮肤材质：底法线加深 + 毛孔第二法线更密更立——2m 内的「法线细节层」 */
function hdSkinVariant(base) {
  return Mtl('hdskin_' + base.uuid, () => {
    const m = base.clone();
    if (m.normalScale) m.normalScale.multiplyScalar(1.35);
    if (m.clearcoatNormalMap) {
      m.clearcoatNormalMap = m.clearcoatNormalMap.clone();
      m.clearcoatNormalMap.needsUpdate = true;
      m.clearcoatNormalMap.repeat.multiplyScalar(1.6);
      if (m.clearcoatNormalScale) m.clearcoatNormalScale.multiplyScalar(1.3);
    }
    // clone() 不带走 onBeforeCompile——耳缘/鼻翼透红 rim / 湿客泡发次表面要重挂，
    // 否则近距 LOD 换模瞬间掉层
    if (base.userData?.soakK) applySoakedSSS(m, base.userData.soakK);
    else if (base.userData?.rimK) applySkinRim(m, base.userData.rimK);
    return m;
  });
}
function xform(geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const g = geo.clone();
  if (sx !== 1 || sy !== 1 || sz !== 1) g.scale(sx, sy, sz);
  _m4.makeRotationFromEuler(new THREE.Euler(rx, ry, rz));
  _m4.setPosition(x, y, z);
  g.applyMatrix4(_m4);
  return g;
}
function merged(parts) {
  const g = BufferGeometryUtils.mergeGeometries(parts, false);
  g.computeVertexNormals();
  return g;
}

/** 头模球面投影 UV：逐顶点由方向重算（前脸 u=0.5，接缝藏在后脑发下）。
 *  鼻/耳/下巴等合并小件也统一投到同一张「头皮」上——照片脸得以横跨鼻梁不断缝。
 *  需在平滑法线已算好之后调用（非索引化保留平滑法线）。 */
function sphereProjectUV(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position;
  const n = pos.count;
  const uv = new Float32Array(n * 2);
  const pole = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const len = Math.hypot(x, y, z) || 1;
    uv[i * 2] = 0.5 + Math.atan2(x, z) / (Math.PI * 2);
    uv[i * 2 + 1] = Math.acos(Math.max(-1, Math.min(1, y / len))) / Math.PI;
    if (Math.hypot(x, z) / len < 0.02) pole[i] = 1; // 极点：u 未定义
  }
  // 跨缝三角形修复（u 差>0.5 的小值 +1，RepeatWrapping 下等价）+ 极点顶点取邻点均值
  for (let t = 0; t < n; t += 3) {
    const i0 = t * 2, i1 = (t + 1) * 2, i2 = (t + 2) * 2;
    const mx = Math.max(uv[i0], uv[i1], uv[i2]);
    if (mx - Math.min(uv[i0], uv[i1], uv[i2]) > 0.5) {
      for (const k of [i0, i1, i2]) if (uv[k] < 0.5) uv[k] += 1;
    }
    for (let k = 0; k < 3; k++) {
      if (pole[t + k]) {
        const a = (t + ((k + 1) % 3)) * 2, b2 = (t + ((k + 2) % 3)) * 2;
        uv[(t + k) * 2] = (uv[a] + uv[b2]) / 2;
      }
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// ================= 面部参数（逐种子） =================
/**
 * 从种子导出一组面部形状参数（0..1）。量化到 1/6 档以便几何缓存复用。
 * 同一种子永远得到同一张脸；不同种子在 6m 内即可分辨。
 */
function faceParamsFrom(seed) {
  let s = ((seed ?? 1) * 2654435761) >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const q = (v) => Math.round(v * 6) / 6;
  const P = {
    headW: q(rnd()),   // 头宽
    faceLen: q(rnd()), // 面长（长脸/圆脸）
    jaw: q(rnd()),     // 下颌收拢
    chin: q(rnd()),    // 下巴前伸
    cheek: q(rnd()),   // 颧骨外扩
    hollow: q(rnd()),  // 颊部凹陷
    brow: q(rnd()),    // 眉弓
    eyeX: q(rnd()),    // 眼距
    eyeS: q(rnd()),    // 眼球大小
    noseL: q(rnd()),   // 鼻长/鼻梁
    noseW: q(rnd()),   // 鼻翼宽
    lip: q(rnd()),     // 唇厚
    mouthW: q(rnd()),  // 嘴宽
    earS: q(rnd()),    // 耳大小
    asym: q(rnd()),    // 不对称度（恐怖谷核心：活人是不对称的）
    asymPh: q(rnd()),  // 不对称相位
  };
  // 非量化的软参数（不进几何，只调摆件角度）
  P.browTL = rnd(); P.browTR = rnd();
  P.droopL = rnd(); P.droopR = rnd();
  P.eyeH = rnd(); P.mouthTilt = (rnd() - 0.5);
  P.key = [P.headW, P.faceLen, P.jaw, P.chin, P.cheek, P.hollow, P.brow, P.eyeX,
    P.noseL, P.noseW, P.lip, P.mouthW, P.earS, P.asym, P.asymPh]
    .map((v) => Math.round(v * 6)).join('');
  return P;
}

// ================= 头部雕刻 =================
const SKULL_R = 0.105;
/**
 * 颅骨变形域（颅骨/发壳/帽体共用）：返回 fn(nx,ny,nz,out)——
 * 输入单位方向，输出该方向上雕刻后的颅骨表面点（半径 SKULL_R 处）。
 * 发壳/帽体的顶点按 (r/R) 径向倍率过同一域（conformSkull），
 * 与颅骨逐种子共形——头顶不再是罩在窄颅上的悬浮圆拱。
 */
/** 颅形基频（雕刻域/比例公式/盐霜贴面共用同一份，不许各抄各的漂移）。
 *  轮19二稿：gaunt 员工脸 面长 −0.9% + 头宽 +2.4%——waiter「窄长头」的骨相修正 */
function headBase(variant, P) {
  const fem = variant === 'f';
  const gaunt = variant === 'gaunt';
  return {
    headW: (fem ? 0.835 : gaunt ? 0.84 : 0.82) + P.headW * 0.04,
    faceLen: (gaunt ? 0.976 : 0.985) + P.faceLen * 0.03, // 抖动收半：头身比 1/7.2-7.5 全种子成立
  };
}

function makeSkullField(variant, P, o = {}) {
  const R = SKULL_R;
  const old = variant === 'old' || variant === 'gaunt';
  const fem = variant === 'f';
  // 轮17：头宽上限收 3%、颌收拢上限收 3 成——「头宽下颌尖」的倒三角脸出局
  const { headW, faceLen } = headBase(variant, P);
  // 轮20二稿：下颌收拢减档（0.25→0.21）——重排后旧值把下半脸掐成倒三角
  // 轮23：男性再减档（0.21→0.19）+抖动收半——瘦长尖颏的「蛋壳脸」出局，U 形颌保宽
  const jawT = (fem ? 0.27 : 0.19) + P.jaw * 0.045;
  const chinZ = 0.02 + P.chin * 0.017;
  const cheekAmp = 0.0035 + P.cheek * 0.007 + (old ? 0.0035 : 0);
  const hollowAmp = (old ? 0.009 : 0.002) + P.hollow * 0.007;
  const browAmp = (fem ? 0.005 : 0.008) + P.brow * 0.005;
  // 轮20三稿·横向摊脸：瞳距/脸宽比实测 0.38（真人 0.43-0.46）——眼窝/眼球/照片
  // 三处同乘 1.149 外移，同时 HX 0.84→0.775 收颅宽：瞳距守 63mm、颊侧空白带减半
  const eyeNX = 0.436 + P.eyeX * 0.062; // 眼窝横位（与 eyeXoff(0.0385+0.0055P) 同换算系 /0.0882）
  const asymAmp = P.asym * 0.004;
  const bare = !!o.bare; // 发壳/帽体共形：只要颅形，不要五官（鼻/唇/颏不许顶进发里）
  // —— 鼻（轮16 真几何）：鼻根凹/鼻梁脊/鼻尖球/鼻翼瓣/鼻孔凹腔/鼻小柱 全部是形体。
  // 鼻底线（方向空间）：照片脸经 o.dyN（米）对齐到照片鼻孔线
  // 轮20·纵向重排：鼻底 -0.0235→-0.0415（眼线→鼻底 ≈40mm 真人档）——
  // 与 faces.js MOUTH_Y=-0.0685 同一次标定，鼻/口/颏全体下移，五官摊满整脸
  const yBase = (-0.0415 - P.noseL * 0.003 + (o.dyN ?? 0)) / (R * faceLen);
  const yTip = yBase + 0.088;             // 鼻尖（底线之上）
  const yRadix = 0.105;                   // 鼻根（眉间之下的凹点）
  const noseW = 0.178 + P.noseW * 0.063;  // 鼻翼半宽（方向空间；轮20三稿随横向摊脸 ×1.149）
  const nProt = 0.021 + P.noseL * 0.009;  // 鼻尖突出量（米）——侧脸必须有鼻突（轮20 加档）
  return (nx, ny, nz, out) => {
    let x = nx * R, y = ny * R * faceLen, z = nz * R;
    x *= headW;                          // 头侧收窄
    if (nz < 0) {
      // 颅骨不是球：耳后侧壁向枕部持续收窄（去「气球头」的关键一刀），
      // 枕突鼓在上半，颈窝一侧向内塌
      const bk = Math.min(1, -nz);
      x *= 1 - bk * 0.1;
      z *= 1.045 + P.headW * 0.04 - Math.max(0, -ny - 0.2) * bk * 0.18;
    } else {
      z *= 0.94;                         // 面部略平
    }
    // 顶结节以下侧壁微平：颞侧是「面」不是「弧」
    x *= 1 - Math.exp(-((ny - 0.3) ** 2) * 5.5) * 0.04;
    // 下颌到下巴：分两段折线收拢——折点即下颌角，颊面到颌缘有明确的转折
    // 轮20：折点随口/颏下移（tt 0.34→0.52，即 ny≈-0.58 口裂之下）——
    // 旧折点压在新鼻底高度，会把脸在中段掐一刀
    if (ny < -0.12 && nz > -0.25) {
      const tt = Math.min(1, (-ny - 0.12) / 0.88);
      // 折点 0.55（口裂之下）；折后走 1.5 次幂——颌体保宽到颏前才收（U 形颌，不是 V）
      const t = tt < 0.55 ? tt * 0.42 : 0.231 + Math.pow((tt - 0.55) / 0.45, 1.5) * 0.769;
      x *= 1 - t * jawT;
      z = z * (1 - t * 0.2) + t * chinZ;
      y *= 1.03;
      // 折线上沿一道咬肌棱（亮棱让折线在侧光里读得出来）
      const crease = Math.exp(-((tt - 0.48) ** 2) * 110) * Math.min(1, Math.abs(nx) * 2.4) * Math.max(0, nz + 0.35);
      x += Math.sign(nx) * crease * 0.0028;
    }
    const axn = Math.abs(nx);
    // 下颌角点（耳垂下前方的骨点）：侧面外凸出折线的「角」——随口线下移到 ny≈-0.62
    const gon = Math.exp(-((ny + 0.62) ** 2) * 55 - ((axn - 0.68) ** 2) * 20) * Math.max(0, nz * 0.8 + 0.4);
    x += Math.sign(nx) * gon * 0.0065;
    const front = Math.max(0, nz);
    // 颧骨体（前凸+外扩——颊面从眶下折向颌缘的骨感转角）：眶下一指（ny≈-0.16）
    const cheek = Math.exp(-((ny + 0.16) ** 2) * 16 - ((axn - 0.62) ** 2) * 18) * front;
    x += Math.sign(nx) * cheek * cheekAmp;
    z += cheek * cheekAmp * 0.55;
    // 颧弓：颧骨体沿眼线向耳一条骨梁（侧脸的横向骨感，不是光蛋壳）
    const zyg = Math.exp(-((ny + 0.08) ** 2) * 90) * _ss01(0.45, 0.8, axn) * Math.max(0, nz + 0.25);
    x += Math.sign(nx) * zyg * 0.0032;
    // 颊部凹陷（老年/失水/瘦脸）：颧下颌上的软组织带（ny≈-0.38）
    const hollow = Math.exp(-((ny + 0.38) ** 2) * 20 - ((axn - 0.42) ** 2) * 26) * front;
    x -= Math.sign(nx) * hollow * hollowAmp;
    z -= hollow * hollowAmp * 0.6;
    // 眉弓：眶上骨棱（外强内缓）——下缘就是眼窝顶，侧影第一凸
    const browL = Math.exp(-(((ny - 0.155) / 0.075) ** 2));
    const browLat = 0.5 + 0.5 * Math.exp(-(((axn - 0.32) / 0.22) ** 2));
    z += browL * browLat * front * browAmp;
    // 眼窝深腔：眼球必须「嵌进去」——腔底在眶缘之内近两厘米
    const sockE = Math.exp(-(((ny + 0.01) / 0.08) ** 2) - (((axn - eyeNX) / 0.1) ** 2)) * front;
    z -= sockE * (old ? 0.021 : 0.018);
    // 眶缘环（宽高斯减窄高斯）：一圈骨缘包住眼球
    const rimE = Math.exp(-(((ny + 0.01) / 0.14) ** 2) - (((axn - eyeNX) / 0.19) ** 2)) * front;
    z -= (rimE - sockE * 0.92) * (old ? 0.009 : 0.0075);
    if (!bare) {
      const fz = _ss01(0.25, 0.6, nz); // 前向门控：五官不许绕到后脑
      // —— 鼻：段距离场沿鼻根→鼻尖长出鼻梁脊，越向下越高越宽 ——
      let noseZ = 0;
      const segT = Math.min(1, Math.max(0, (yRadix - ny) / (yRadix - yTip)));
      const wDor = 0.063 + segT * 0.063;
      const dxN = nx / wDor;
      const dyN2 = ny > yRadix ? (ny - yRadix) / 0.07 : ny < yTip ? (ny - yTip) / 0.078 : 0;
      noseZ += nProt * (0.34 + 0.66 * segT * segT) * Math.exp(-(dxN * dxN + dyN2 * dyN2) * 1.6);
      // 鼻翼瓣（前凸+外扩）
      const alaG = Math.exp(-(((ny - (yTip - 0.03)) / 0.055) ** 2) - (((axn - noseW * 0.78) / 0.08) ** 2));
      noseZ += nProt * 0.32 * alaG;
      x += Math.sign(nx) * alaG * 0.0042 * fz;
      // 鼻孔凹腔：鼻底斜面上两粒真凹（不是黑贴片）
      noseZ -= 0.006 * Math.exp(-(((ny - (yBase + 0.015)) / 0.042) ** 2) - (((axn - noseW * 0.45) / 0.063) ** 2));
      // 鼻小柱（两孔之间的脊）
      noseZ += 0.003 * Math.exp(-(((ny - (yBase + 0.012)) / 0.05) ** 2) - ((nx / 0.052) ** 2));
      // 鼻根凹：眉弓凸-鼻根凹-鼻梁凸——侧影的三段线
      noseZ -= 0.004 * Math.exp(-(((ny - (yRadix + 0.075)) / 0.055) ** 2) - ((nx / 0.115) ** 2));
      z += noseZ * fz;
      // —— 口周/唇床/颏：唇是从形体上长出来的 ——
      // 轮20：整组随口裂线下移（口裂 ny≈-0.64、颏隆突 ny≈-0.885）——与
      // faces.js MOUTH_Y / mouthG 落位同一次标定
      z += Math.exp(-(((ny + 0.64) / 0.12) ** 2) - ((nx / 0.30) ** 2)) * fz * 0.0038;  // 吻部隆起
      z += Math.exp(-(((ny + 0.605) / 0.035) ** 2) - ((nx / 0.195) ** 2)) * fz * 0.003;  // 上唇床
      z += Math.exp(-(((ny + 0.695) / 0.04) ** 2) - ((nx / 0.16) ** 2)) * fz * 0.0036; // 下唇床
      z -= Math.exp(-(((ny + 0.785) / 0.045) ** 2) - ((nx / 0.15) ** 2)) * fz * 0.0048;  // 颏唇沟
      z += Math.exp(-(((ny + 0.885) / 0.09) ** 2) - ((nx / 0.172) ** 2)) * fz * 0.0068;   // 颏隆突
      z -= Math.exp(-(((ny + 0.52) / 0.05) ** 2) - ((nx / 0.046) ** 2)) * fz * 0.002;  // 人中槽
      // 法令纹（老年更深）：鼻翼旁斜向口角（横向摊脸 ×1.149 随口角外移）
      z -= Math.exp(-((axn - 0.276) ** 2) * 106 - ((ny + 0.52) ** 2) * 30) * front * (old ? 0.0042 : 0.0014);
    }
    // 太阳穴微凹
    x -= Math.sign(nx) * Math.exp(-((ny - 0.25) ** 2) * 30 - ((axn - 0.85) ** 2) * 40) * 0.004;
    // 额结节（前额不是纯球面）
    z += Math.exp(-(((ny - 0.45) / 0.24) ** 2)) * front * 0.002;
    // 不对称翘曲：整张脸沿 x 做低频偏移——没有一张活人的脸是镜像对称的
    x += front * asymAmp * Math.sin(ny * 2.6 + P.asymPh * 6.28) * R;
    z += front * asymAmp * 0.35 * Math.cos(ny * 3.1 + P.asymPh * 4.1) * R * Math.sign(nx);
    out.x = x; out.y = y; out.z = z;
  };
}

/** 发壳/帽体过颅骨变形域：顶点方向查域面点，按 (r/R) 径向倍率共形贴颅。
 *  fadeLow: 垂帘下摆听重力不听头骨——耳线以下渐次脱离变形域。
 *  weight: 共形强度（硬质帽体 <1，保留自身版型）。 */
const _sf = { x: 0, y: 0, z: 0 };
function conformSkull(geo, variant, P, opts = {}) {
  const f = makeSkullField(variant, P, { bare: true }); // 壳体只贴颅形，不吃五官
  const w0 = opts.weight ?? 1;
  const inflate = opts.inflate ?? 1; // 外扩倍率：发壳有厚度，贴颅但不贴皮
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r = Math.hypot(x, y, z);
    if (r < 1e-5) continue;
    const nx = x / r, ny = y / r, nz = z / r;
    let w = w0;
    if (opts.fadeLow && ny < -0.25) w *= Math.max(0, 1 - (-ny - 0.25) / 0.45);
    if (w <= 0) continue;
    f(nx, ny, nz, _sf);
    const k = (r / SKULL_R) * inflate;
    pos.setX(i, x + (_sf.x * k - x) * w);
    pos.setY(i, y + (_sf.y * k - y) * w);
    pos.setZ(i, z + (_sf.z * k - z) * w);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * 雕刻头骨：从细分球体位移出真实头形（36×28 段，近景不见棱；hd=84×60 近距 LOD）
 * variant: 'm' 男 | 'f' 女(圆润) | 'old' 老年(消瘦) | 'gaunt' 深压失水(酒店员工)
 * P: faceParamsFrom 的形状参数
 */
function craniumGeo(variant, P, hd = false, dyN = 0) {
  return G(`cranium_${variant}_${P.key}_${Math.round(dyN * 2000)}${hd ? '_hd' : ''}`, () => {
    // 轮16：自定义经纬网格替代均匀球——φ 前向加密（a=0.62 → 正面 2.6 倍列密），
    // θ 眼鼻口带加密（b=0.30 → 赤道带 2.5 倍行密）。鼻孔凹/眶缘/唇床是毫米级形体，
    // 顶点必须花在脸上而不是后脑
    const W = hd ? 112 : 48, H = hd ? 84 : 36;
    const aU = 0.62, bV = 0.3;
    const pos = new Float32Array((W + 1) * (H + 1) * 3);
    const uvA = new Float32Array((W + 1) * (H + 1) * 2);
    const field = makeSkullField(variant, P, { dyN });
    let k = 0;
    for (let iy = 0; iy <= H; iy++) {
      const vv = iy / H;
      const th = Math.PI * vv + Math.sin(Math.PI * 2 * vv) * bV;
      const st = Math.sin(th), ct = Math.cos(th);
      for (let ix = 0; ix <= W; ix++) {
        const uu = ix / W;
        const psi = Math.PI * 2 * (uu - 0.5);
        const ph = psi - Math.sin(psi) * aU; // φ=0 → +z（正脸）
        const nx = st * Math.sin(ph), nyD = ct, nzD = st * Math.cos(ph);
        field(nx, nyD, nzD, _sf);
        let { x, y, z } = _sf;
        if (hd) {
          // 高段数下叠皮下微起伏（±0.4mm 三角噪声）：真皮不是完美曲面，
          // 高光在近景里必须「走」在轻微不平的面上才不读成蜡
          const mic = Math.sin(nx * 37 + nyD * 23) * Math.cos(nyD * 41 + nzD * 17) * Math.sin(nzD * 29 + nx * 13 + 1.7);
          x += nx * mic * 0.0005; y += nyD * mic * 0.0005; z += nzD * mic * 0.0005;
        }
        pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
        // UV 存实际方向的线性球面坐标（θ/π、φ/2π），不存网格坐标——
        // 网格翘曲只管把顶点密到脸上；纹理映射保持与 faces.js 全部标定
        //（照片仿射/眼AO/鼻烘焙/法线高频）一致的旧球面系，否则照片五官
        // 会被网格加密函数横压 2.6 倍、口鼻上抬 2cm（轮16A 的错位事故）
        uvA[k * 2] = 0.5 + ph / (Math.PI * 2);
        uvA[k * 2 + 1] = th / Math.PI;
        k++;
      }
    }
    const idx = [];
    for (let iy = 0; iy < H; iy++) {
      for (let ix = 0; ix < W; ix++) {
        const a = iy * (W + 1) + ix + 1, b = iy * (W + 1) + ix,
          c = (iy + 1) * (W + 1) + ix, d = (iy + 1) * (W + 1) + ix + 1;
        if (iy !== 0) idx.push(a, b, d);
        if (iy !== H - 1) idx.push(b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvA, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  });
}

/** 照片脸的鼻底竖向校准量：把几何鼻底线对齐到照片鼻孔阴影线（消「双鼻影」） */
function noseDyFor(P, photoKey) {
  const a = photoKey ? faceAnchor(photoKey) : null;
  if (!a) return 0;
  const def = -0.0415 - P.noseL * 0.003; // 默认几何鼻底线（相对颅心，米）——轮20 纵向重排
  return Math.max(-0.008, Math.min(0.006, a.noseY - def));
}

/** 耳廓（近距 LOD 带软骨起伏）：耳轮缘脊 / 耳舟沟 / 对耳轮 / 耳甲腔 / 耳屏 / 耳垂。
 *  皮肤背光透红 rim 要「走」在软骨的棱谷上才可信——光滑鸡蛋面上的 rim 读成描边。
 *  远景仍是缩放球（省顶点）；xform 会把 x 压到 ~0.3 倍，径向位移的 x 分量预放大补偿。
 *  side: -1 左耳 / +1 右耳（浮雕镜像）。 */
function earGeo(hd, side) {
  return G(`ear_${hd ? 'hd' : 'lo'}_${side}`, () => {
    const g = new THREE.SphereGeometry(0.021, hd ? 24 : 10, hd ? 18 : 8);
    if (!hd) return g;
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const rl = Math.hypot(x, y, z) || 1;
      const nx = (x / rl) * side, ny = y / rl, nz = z / rl; // nx>0 = 外侧面
      const a = Math.atan2(ny, nz);                // 0 前 / ±π 后 / +π/2 上
      const mask = 0.5 + 0.5 * Math.cos(a - 1.9);  // 缘脊沿上后弧，前下（耳垂/耳屏区）淡出
      const ax = Math.abs(nx);
      let d = 0;
      d += Math.exp(-((ax / 0.16) ** 2)) * 0.0036 * mask;            // 耳轮：外缘卷边脊
      d -= Math.exp(-(((ax - 0.30) / 0.09) ** 2)) * 0.0024 * mask;   // 耳舟：缘脊内一道沟
      d += Math.exp(-(((ax - 0.52) / 0.09) ** 2)) * 0.0018 * mask;   // 对耳轮：再起一道缓脊
      d -= _ss01(0.55, 0.85, nx) * (0.5 + 0.5 * Math.cos(a + 0.2)) * 0.005; // 耳甲腔（外面中前凹）
      d += Math.exp(-((nx - 0.5) ** 2) * 30 - ((a + 0.35) ** 2) * 9) * 0.0022; // 耳屏小凸
      d += _ss01(-0.55, -0.95, ny) * 0.001;                          // 耳垂微鼓
      pos.setXYZ(i, x + (x / rl) * d * 2.8, y + (y / rl) * d, z + (z / rl) * d);
    }
    g.computeVertexNormals();
    return g;
  });
}

/** 头部集合（头骨+耳；鼻/唇床/颏已内建进颅骨变形域——一体形体，不再贴件拼鼻）。
 *  皮肤材质一体网格；耳仍是独立小件（软骨形体另有雕刻）。 */
function headGeo(variant, P, hd = false, photoKey = null) {
  return G(`head_${variant}_${P.key}_${photoKey ?? 'x'}${hd ? '_hd' : ''}`, () => {
    const dy = noseDyFor(P, photoKey); // 照片脸：几何鼻底对齐到照片鼻影线
    const parts = [craniumGeo(variant, P, hd, dy).clone()];
    // 耳（带不对称：左右高低差半毫米——近景才读得出的活人证据）
    // 近距 LOD 换带软骨起伏的耳廓：rim 透红沿耳轮/对耳轮的棱走，不再是光球描边
    const earS = 0.28 + P.earS * 0.12;
    const earDy = (P.asym - 0.5) * 0.006;
    parts.push(xform(earGeo(hd, -1), -0.082, earDy, -0.008, 0, 0, 0.15, earS, 1 + P.earS * 0.15, 0.68));
    parts.push(xform(earGeo(hd, 1), 0.082, -earDy, -0.008, 0, 0, -0.15, earS, 1 + P.earS * 0.15, 0.68));
    // 球面投影 UV：整头（含鼻/耳）统一投到一张头皮上——照片脸横跨鼻梁不断缝
    return sphereProjectUV(merged(parts));
  });
}

/** 眼睑罩（半球，肤色）：给眼睛压出「疲惫的半合」。
 *  轮23·去瞪珠：壳弧 0.42π→0.52π——睑体真的「包」到眼球前面，配合基础旋角
 *  把睑裂压到照片档（真人睑裂高 9-11mm；旧值露出半颗球=玩偶圆瞪眼元凶） */
function lidGeo() {
  return G('lid23', () => new THREE.SphereGeometry(0.0135, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.52));
}

/** 下睑带（窄环帽 54°）：只做贴住眼球下前缘的睑缘条。
 *  旧版复用上睑的 75° 大帽壳转到下位——壳底越出加深后的眶下皮面，
 *  仰视读成眼下两颗光皮球（人偶感元凶）；窄带上缘停在虹膜下缘、
 *  下缘埋进眶腔，露出的只有「卧蚕」那一条肤色 */
function lidLoGeo() {
  // 轮23：下睑带加宽（0.3π→0.36π）——睑缘真的托到虹膜下缘，
  // 虹膜下方不再露一弯眼白（瞪珠感的下半来源）
  return G('lidLo23', () => new THREE.SphereGeometry(0.0135, 12, 5, 0, Math.PI * 2, 0, Math.PI * 0.36));
}

/** 眉毛贴片：沿眉弓弯曲的窄面片（毛发画在 alpha 贴图里，逐根可读） */
function browPatchGeo() {
  return G('browPatch', () => {
    const g = new THREE.PlaneGeometry(0.044, 0.014, 10, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      pos.setZ(i, -x * x * 5.5);   // 贴颅面弧（额头曲率半径 ~0.09m）
      pos.setY(i, pos.getY(i) + Math.sin((x / 0.044 + 0.5) * Math.PI) * 0.002); // 轻微眉拱
    }
    g.computeVertexNormals();
    return g;
  });
}

/** 睫毛几何：沿睑缘的窄弯带——弧向 14 段绕眼球球面回卷，两端随睑缘弧下落
 *  收进内外眦（配合贴图端点 alpha 渐隐，内眦不再留贴片尖角黑斑）。 */
function lashGeo() {
  return G('lashBand', () => {
    const g = new THREE.PlaneGeometry(0.03, 0.0068, 14, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const t = x / 0.015;                       // -1(内眦)..1(外眦)
      pos.setZ(i, -t * t * 0.0062);              // 绕眼球弧（两端向眼眶回卷藏边）
      pos.setY(i, pos.getY(i) - t * t * 0.0026); // 睑缘弧：中央高、两眦低
    }
    g.computeVertexNormals();
    return g;
  });
}

/** 嘴唇（独立体积几何，配湿润高光材质）：上唇双峰+唇珠（丘比特弓），下唇两瓣饱满。
 *  局部原点 = 口裂中心；由 P.lip/P.mouthW 参数化。 */
function lipsGeo(P) {
  return G(`lips_${Math.round(P.lip * 6)}_${Math.round(P.mouthW * 6)}`, () => {
    const lipS = 0.55 + P.lip * 0.42;    // 唇厚
    const mw = 1.05 + P.mouthW * 0.45;   // 嘴宽
    const parts = [];
    // 上唇：左右唇峰两瓣（微内旋出「M」形唇线）——薄、贴面，不外翻
    parts.push(xform(new THREE.SphereGeometry(0.0085, 14, 10), -0.0072 * mw, 0.0026, 0.0006, 0.28, 0, 0.13, mw * 1.0, lipS * 0.5, 0.48));
    parts.push(xform(new THREE.SphereGeometry(0.0085, 14, 10), 0.0072 * mw, 0.0026, 0.0006, 0.28, 0, -0.13, mw * 1.0, lipS * 0.5, 0.48));
    // 唇珠：上唇正中前凸的一粒（湿高光最先亮起的地方）
    parts.push(xform(new THREE.SphereGeometry(0.005, 10, 8), 0, 0.0008, 0.003, 0.3, 0, 0, 0.85, lipS * 0.62, 0.6));
    // 下唇：两瓣并置、中线微凹，比上唇略满
    parts.push(xform(new THREE.SphereGeometry(0.0095, 14, 10), -0.0042 * mw, -0.006, 0.0002, -0.18, 0, 0, mw * 0.92, lipS * 0.62, 0.52));
    parts.push(xform(new THREE.SphereGeometry(0.0095, 14, 10), 0.0042 * mw, -0.006, 0.0002, -0.18, 0, 0, mw * 0.92, lipS * 0.62, 0.52));
    return merged(parts);
  });
}

/** 口裂缝：唇间的暗色细管，两端向颊面回卷、中央沿丘比特弓微波动——是缝不是贴片 */
function lipSeamGeo(P) {
  return G(`lipseam_${Math.round(P.mouthW * 6)}`, () => {
    const mw = 1.05 + P.mouthW * 0.45;
    const w = 0.0185 * mw; // 轮20：口缝线不许伸出嘴角
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10 - 0.5;                                  // -0.5..0.5
      const x = t * 2 * w;
      const y = -Math.cos(t * Math.PI * 2) * 0.0006 + Math.abs(t) * 2 * 0.002; // 嘴角上收
      const z = 0.0044 - (Math.abs(t) * 2) ** 1.8 * 0.0075;    // 嘴角向颊面回卷
      pts.push(new THREE.Vector3(x, y, z));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.0006, 5);
  });
}

/** 发壳沿羽化：按 SphereGeometry 的 uv 写 RGBA 顶点色——
 *  alpha 由 fn(u,v) 给出（壳檐 v→1 处渐隐到头皮），RGB 全 1。
 *  配 vertexColors+transparent 的壳材质：发壳边缘不再是一条实心「头盔口」切线。 */
const _ss01 = (a, b, t) => {
  t = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function fadeRim(geo, fn) {
  const uv = geo.attributes.uv;
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 4).fill(1);
  if (fn && uv) for (let i = 0; i < n; i++) col[i * 4 + 3] = fn(uv.getX(i), uv.getY(i));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  return geo;
}
const rimV = (v0, v1) => (u, v) => 1 - _ss01(v0, v1, v); // 沿 v 到壳檐渐隐

/** 发壳绺团噪声（轮18·去头盔）：三频向噪沿法向揉皱整张壳面——
 *  低频=绺团起伏、中频=发束、高频=糙面。光滑烤漆穹顶从此不存在：
 *  任何角度的高光都碎在起伏里，壳发读成「一头压过的短发」而非泳帽 */
function hairClumpNoise(geo, amp = 1) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r = Math.hypot(x, y, z);
    if (r < 0.02) continue;
    const nx = x / r, ny = y / r, nz = z / r;
    const d = (Math.sin(nx * 21 + nz * 17) * Math.cos(ny * 13 + nx * 7) * 0.5
      + Math.sin(nx * 43 + ny * 31 + 2.1) * Math.sin(nz * 37 + 0.7) * 0.32
      + Math.sin((nx + nz) * 71 + ny * 53) * 0.18) * 0.0017 * amp;
    const k = 1 + d / r;
    pos.setXYZ(i, x * k, y * k, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/** 发壳竖向沟槽：沿方位角叠三组正弦把壳面「犁」出发绺——高光断成条，破头盔感 */
function hairGrooves(geo, amp = 1) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const rr = Math.hypot(x, z);
    if (rr < 0.02) continue;
    const az = Math.atan2(x, z);
    const d = (Math.sin(az * 16) * 0.5 + Math.sin(az * 29 + 1.7) * 0.32 + Math.sin(az * 47 + 4.1) * 0.18)
      * 0.0018 * amp;
    const k = 1 + d / rr;
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/** 发型（发际线必须露出额头——不能像头盔盖到眼睛）。
 *  壳体不再手工横向压扁：merge 后整体过颅骨变形域（conformSkull）——
 *  发壳随该种子的窄颅/颞侧平面/枕部收窄逐向贴合，壳檐在鬓角/枕骨处收进。 */
/** 轮23·发际线合一：发壳前檐 alpha 逐顶点裁剪到照片发际曲线
 *  hl(x)=hairY−sagK·x²（faceAnchor 反投影，与烘焙 hairGate 同一条线）——
 *  「照片发际 vs 壳檐」两条发际线合成一条；只作用前向扇区（nz 门控），
 *  枕侧不裁。羽化带 4→20mm：发根是「渐密」不是「切口」。 */
function clipHairline(geo, anch, tight = false) {
  if (!anch) return geo;
  const pos = geo.attributes.position, col = geo.attributes.color;
  if (!col) return geo;
  // 背头（tight）：拢梳出的发际是一条干净的梳线——羽化带收到 8mm；
  // 其余发型 16mm 渐稀带
  const f0 = tight ? 0.005 : 0.004, f1 = tight ? 0.013 : 0.020;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r = Math.hypot(x, y, z);
    if (r < 0.02 || z <= 0.005) continue;
    // 前向门控 × 方位门控：只裁「额前」窄扇区。鬓角/颞侧交给照片烘焙——
    // 上稿无 |x| 门控时，背头在耳上方被抛物线误裁出整片秃块（侧照穿帮元凶）
    const w = _ss01(0.10, 0.40, z / r) * _ss01(0.52, 0.34, Math.abs(x) / r);
    if (w <= 0) continue;
    // 线位下移 3.5mm：壳檐压过照片发际的皮发交界，盖住烘焙侧的浅色头皮条
    const hl = anch.hairY - anch.hairSagK * x * x - 0.0035;
    const a = _ss01(hl + f0, hl + f1, y);
    col.setW(i, Math.min(col.getW(i), 1 - w * (1 - a)));
  }
  return geo;
}

function hairGeo(style = 'crop', variant = 'm', P = null, photoKey = null) {
  const FP = P ?? faceParamsFrom(1);
  const anch = photoKey ? faceAnchor(photoKey) : null;
  return G(`hair_${style}_${variant}_${FP.key}_${photoKey ?? 'x'}`, () => {
    const parts = [];
    // 壳檐羽化：主壳 v∈[0.8,1] 渐隐（前檐即发际线——alpha 溶进头皮，不再是实心切线）；
    // 后脑补片下缘同理渐隐进颈窝
    const cap = (scaleY = 1, lift = 0, r = 0.108) => {
      // 发际线抬高：壳体后移+后仰，额头必须露出来（不能像头盔盖到眉毛）；
      // 壳弧加深到 0.5π——共形贴颅后壳檐要能包住鬓角，不悬在颅顶
      // 轮18：檐羽化带加宽（0.9→0.82）——发际是「渐稀两厘米」，不是一条切口
      // 轮19：后仰收半（0.3→0.19）+后移收小——旧值把发际推上颅顶，
      // 额头占掉半张脸，五官被挤进下半中心（face_a/waiter「头长额巨」元凶）
      // 轮24：壳体细分 24×16→36×24——壳檐 alpha 羽化走顶点色，粗网格的大三角
      // 插值出锯齿「撕纸边」（emcee 发际穿帮元凶之一）；细分后檐线是曲线
      parts.push(fadeRim(xform(new THREE.SphereGeometry(r, 36, 24, 0, Math.PI * 2, 0, Math.PI * 0.5),
        0, 0.03 + lift, -0.013, 0.19, 0, 0, 1.0, scaleY, 1.02), rimV(0.82, 1.0)));
      // 后脑+颈窝补片（φ π..2π 是 -z 后半球）——缺了这块，背影读成光头戴小帽
      parts.push(fadeRim(xform(new THREE.SphereGeometry(r - 0.001, 26, 14, Math.PI, Math.PI, Math.PI * 0.30, Math.PI * 0.42),
        0, 0.03 + lift, -0.012, 0.16, 0, 0, 1.0, scaleY * 1.02, 1.0), rimV(0.82, 1.0)));
    };
    switch (style) {
      case 'crop': { // 平头/寸头
        cap(0.9, 0, 0.1065);
        break;
      }
      case 'back': { // 大背头（报数员）——轮18：压薄压低，不再是罩在颅上的大穹顶
        cap(0.9, 0.003, 0.1072);
        parts.push(fadeRim(xform(new THREE.SphereGeometry(0.058, 12, 8), 0, 0.05, -0.068, 0.3, 0, 0, 1.1, 0.68, 0.92)));
        break;
      }
      case 'side': { // 三七分：整体壳微偏一侧（分头由轮廓不对称表达，不悬浮贴片）
        parts.push(fadeRim(xform(new THREE.SphereGeometry(0.107, 36, 24, 0, Math.PI * 2, 0, Math.PI * 0.5),
          -0.008, 0.03, -0.013, 0.19, 0, -0.06, 1.0, 0.95, 1.02), rimV(0.82, 1.0)));
        parts.push(fadeRim(xform(new THREE.SphereGeometry(0.106, 26, 14, Math.PI, Math.PI, Math.PI * 0.30, Math.PI * 0.42),
          0, 0.03, -0.012, 0.16, 0, 0, 1.0, 0.97, 1.0), rimV(0.82, 1.0)));
        break;
      }
      case 'bun': { // 盘发髻（理册婆）：壳贴颅、向后拢，束发圈勒出髻根
        cap(0.9, 0, 0.104);
        parts.push(fadeRim(xform(new THREE.SphereGeometry(0.04, 14, 10), 0, 0.026, -0.099, 0, 0, 0, 1, 0.78, 0.95)));
        parts.push(fadeRim(xform((() => { const t = new THREE.TorusGeometry(0.028, 0.0055, 6, 14); return t; })(),
          0, 0.028, -0.082, 0.35, 0, 0)));
        break;
      }
      case 'perm': { // 烫发（2001 阿姨）
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          const rr = 0.082 + (i % 3) * 0.008;
          parts.push(fadeRim(xform(new THREE.SphereGeometry(0.03, 8, 6),
            Math.cos(a) * rr * 0.88, 0.062 + Math.sin(i * 2.3) * 0.018, Math.sin(a) * rr * 0.7 - 0.014)));
        }
        cap(0.92, 0, 0.105);
        break;
      }
      case 'long': { // 长直发（周絮/女客）：球壳下半直接拉伸成垂帘——贴颅、无缝、发梢微撇
        cap(0.97, 0, 0.1055);
        // φ 0.72π..2.28π = 后半球+两侧（前脸留开口）；θ 到 0.8π 提供可拉伸的下摆
        const shell = new THREE.SphereGeometry(0.1075, 26, 18, Math.PI * 0.72, Math.PI * 1.56, 0, Math.PI * 0.8);
        {
          const sp = shell.attributes.position;
          for (let i = 0; i < sp.count; i++) {
            const sy = sp.getY(i);
            if (sy < 0) {
              // 耳线以下：竖向拉长成帘，微收腰再向发梢外撇
              const t = Math.min(1, -sy / 0.088);
              const flare = 1 - t * 0.16 + t * t * 0.24;
              sp.setX(i, sp.getX(i) * flare);
              sp.setZ(i, sp.getZ(i) * flare);
              sp.setY(i, sy * (1 + t * 2.6));
            }
          }
        }
        // 长发壳：发梢（v→1）渐隐 + 前开口两缘（u 0/1）羽化——壳与前帘的接缝不再是硬边
        parts.push(fadeRim(xform(shell, 0, 0.03, -0.008, 0.06, 0, 0, 1, 1, 0.97),
          (u, v) => (1 - _ss01(0.95, 1.0, v)) * _ss01(0.0, 0.045, u) * (1 - _ss01(0.955, 1.0, u))));
        break;
      }
    }
    // 先犁发绺再过变形域：沟槽随壳面一起贴颅；外扩收薄到 1.4%——发是「层」不是「壳」；
    // 变形域之后再揉绺团噪声（噪声要落在最终壳面上，不被共形抹平）
    // 轮22：沟槽/绺团双双加深（1→1.6/1→1.5）——几何起伏配合发绺贴图+碎发卡层，
    // 三层一起把「光滑头盔」拆掉
    // 轮23：末尾过 clipHairline——photo 脸的壳檐钉在照片发际曲线上
    return clipHairline(hairClumpNoise(conformSkull(hairGrooves(merged(parts), style === 'long' ? 1.4 : 1.6),
      variant, FP, { fadeLow: style === 'long', inflate: 1.014 }), style === 'long' ? 0.7 : 1.5), anch, style === 'back');
  });
}

/** 发丝卡片：贴颅面弧的小弯片（alpha 逐根发丝贴图）——发际线/鬓角/颈窝破「头盔感」 */
function hairCardGeo(w, h, curve = 5) {
  return G(`hairCard_${w}_${h}_${curve}`, () => {
    const g = new THREE.PlaneGeometry(w, h, 8, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      pos.setZ(i, -x * x * curve);
    }
    g.computeVertexNormals();
    return g;
  });
}

/** 分层碎发卡层（轮22·去头盔主件）：三圈发绺卡瓦片式伏贴在壳面上
 *  （顶圈/颞圈/枕圈，前脸发际带跳过）——壳的轮廓被碎发卡的锯齿 alpha 打散，
 *  「光滑穹顶剪影」从几何层面不存在。全部卡片合并为单网格（一只头一次 draw）。
 *  根位走颅骨变形域精确求壳面（与 conformSkull 同式）。 */
function hairClumpCardsGeo(style, variant, P) {
  return G(`hairClumps_${style}_${variant}_${P.key}`, () => {
    const fld = makeSkullField(variant, P, { bare: true });
    const sp = { x: 0, y: 0, z: 0 };
    const parts = [];
    // [极角, 片数]：bun 收拢只留顶两圈；long 有帘只留顶圈；
    // crop 补第四圈枕后环（el 1.38，前向滤掉）——侧照枕后弧线不再是光滑球缘
    // 轮24·碎发密度×2：每圈片数近倍增 + 插入中间圈——壳面被绺卡整面覆瓦，
    // 任何角度先读到「一头碎发」，再读到壳
    const rings = style === 'long' ? [[0.45, 14], [0.62, 12], [0.8, 18]]
      : style === 'bun' ? [[0.45, 14], [0.62, 12], [0.8, 18]]
        : [[0.42, 14], [0.6, 12], [0.78, 20], [0.95, 14], [1.1, 24], [1.38, 22]];
    let ci = 0;
    // 轮22二稿：欧拉角外翘（读成「故障黑尖刺」）废除——
    // 瓦片式切向标架：卡片贴伏壳面、发梢顺坡向下（毛流方向），
    // 梢部绕自身横轴外抬 12-22°——剪影是「层层压覆的发绺」不是辐射尖刺
    const m4 = new THREE.Matrix4(), mR = new THREE.Matrix4();
    const N = new THREE.Vector3(), T = new THREE.Vector3(), X = new THREE.Vector3(), Y = new THREE.Vector3();
    for (const [el, n] of rings) {
      for (let k = 0; k < n; k++) {
        ci++;
        const az = ((k + (ci % 2) * 0.5) / n) * Math.PI * 2 + P.asymPh * 0.8;
        const frontness = Math.cos(az); // +1 = 正前（发际带留给绒边卡，不许压到额头）
        if (el > 0.65 && frontness > 0.44) continue;
        if (el > 1.0 && frontness > 0.05) continue;
        const dx = Math.sin(el) * Math.sin(az), dy = Math.cos(el), dz = Math.sin(el) * Math.cos(az);
        fld(dx, dy, dz, sp);
        const k2 = ((0.103 + 0.03 * dy - 0.018 * dz) / SKULL_R) * 1.03;
        const w = 0.034 + ((ci * 5) % 3) * 0.007;
        const h = 0.03 + ((ci * 3) % 3) * 0.008;
        const g = hairCardGeo(w, h, 3).clone();
        N.set(dx, dy, dz);                                     // 壳面外法向（球近似）
        T.set(Math.cos(el) * Math.sin(az), -Math.sin(el), Math.cos(el) * Math.cos(az)); // 顺坡向下
        Y.copy(T).negate();                                    // 卡片根边朝坡上（发从根垂向梢）
        X.crossVectors(Y, N).normalize();
        m4.makeBasis(X, Y, N);
        // 梢部外抬（负角=梢离壳）+ 面内微旋（毛流参差）
        m4.multiply(mR.makeRotationX(-(0.2 + ((ci * 7) % 4) * 0.05)));
        m4.multiply(mR.makeRotationZ(((ci * 11) % 5 - 2) * 0.06));
        // 根边压进壳面下、梢端探出壳缘——中心顺坡下移 0.3h
        m4.setPosition(
          sp.x * k2 + T.x * h * 0.3 + dx * 0.001,
          sp.y * k2 + T.y * h * 0.3 + dy * 0.001,
          sp.z * k2 + T.z * h * 0.3 + dz * 0.001);
        g.applyMatrix4(m4);
        parts.push(g);
      }
    }
    return merged(parts);
  });
}

/** 大檐帽（岗亭员）：帽冠 + 帽墙 + 帽檐——帽体过颅骨变形域（0.7 权重保版型），
 *  帽墙随鬓角/枕骨收进，不再是扣在窄颅上的正圆筒 */
function peakedCapGeo(variant = 'gaunt', P = null) {
  const FP = P ?? faceParamsFrom(1);
  return G(`peakedCap_${variant}_${FP.key}`, () => conformSkull(merged([
    // 帽冠（前倾扁球）
    xform(new THREE.SphereGeometry(0.115, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), 0, 0.085, -0.005, 0.1, 0, 0, 1.0, 0.62, 1.05),
    // 帽墙
    xform(new THREE.CylinderGeometry(0.112, 0.116, 0.05, 20, 1, true), 0, 0.062, -0.005),
    // 帽檐（前伸的扁弧）
    xform(new THREE.CylinderGeometry(0.12, 0.12, 0.009, 16, 1, false, -Math.PI * 0.32, Math.PI * 0.64), 0, 0.048, 0.012, -0.12, 0, 0, 1, 1, 1.15),
  ]), variant, FP, { weight: 0.7 }));
}

/** 长发前帘（周絮/长发客）：垂在颊侧的曲面发帘——横向 10 段绕颊弧内扣、
 *  纵向 6 段供垂坠弯；前缘向脸内收（帘是「拢」在脸侧的，不是一块悬板）。
 *  枢轴在帘顶（挂点），配合锯齿 alpha 贴图与 animate 里的微摆。 */
function hairCurtainGeo(w = 0.052, h = 0.22) {
  return G(`hairCurtain_${w}_${h}`, () => {
    const g = new THREE.PlaneGeometry(w, h, 10, 6);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const tx = x / (w * 0.5);          // -1(后缘)..1(前缘)
      const ty = 0.5 - y / h;            // 0 顶 → 1 梢
      // 内缘贴颊剖面（随脸颊曲率，帘顶挂在耳上）：
      // 颧下起坡(ty~0.1) → 颊窝内扣最深(ty~0.20) → 颌缘再拢一道(ty~0.34) → 颏下释放垂坠
      // 旧单峰正弦峰值压在颌位、颊窝处离颊 3-4mm 悬空——帘与脸之间漏一条缝
      const hug = _ss01(0.0, 0.1, ty) * 0.0034
        + Math.exp(-((ty - 0.20) ** 2) * 90) * 0.0058
        + Math.exp(-((ty - 0.34) ** 2) * 120) * 0.0046;
      let z = -tx * tx * 0.014 - Math.max(0, tx) * hug * (1 - _ss01(0.5, 0.78, ty));
      // 垂坠：中段贴颊、梢部微离（下摆有自己的弧线，不是直板）
      z += ty * ty * 0.006 - Math.sin(ty * Math.PI) * 0.003;
      pos.setZ(i, z);
      // 帘身向梢部微收（发束向下拢紧）
      pos.setX(i, x * (1 - ty * 0.12));
    }
    g.translate(0, -h / 2, 0);           // 枢轴移到帘顶：微摆绕挂点转
    g.computeVertexNormals();
    return g;
  });
}

// ================= 躯干（服装车削） =================
function torsoProfile(kind) {
  // [r, y] 自腰际(0 附近)到肩颈；躯干组局部 y: 0 → 0.62
  // 半径给窄——肩宽由 torsoGeo 的肩部高斯加宽提供，手臂必须落在躯干轮廓之外
  switch (kind) {
    // 轮19：领口以下一档（y≈0.57）半径统一收 ~13%——旧值在颈根两侧留出横台，
    // 与高斯加宽叠成「方肩垫」；成人肩线是颈根→肩峰的连续斜坡
    case 'suit': // 西装：垫肩、下摆过臀（顶圈收进领筒之内——领由 mkCollar 出真几何）
      return [[0.175, -0.14], [0.163, -0.04], [0.148, 0.06], [0.145, 0.16], [0.152, 0.28],
        [0.162, 0.4], [0.168, 0.48], [0.152, 0.53], [0.108, 0.575], [0.055, 0.605]];
    case 'vest': // 马甲+衬衫：收身（肩段加宽——衬衫肩线仍是成人男 0.40m+ 的肩，收身收在腰）
      return [[0.148, -0.06], [0.14, 0.02], [0.134, 0.12], [0.142, 0.26], [0.156, 0.4],
        [0.166, 0.48], [0.147, 0.53], [0.104, 0.575], [0.053, 0.605]];
    case 'satin': // 缎袄：宽厚、直筒、下摆长
      return [[0.19, -0.24], [0.186, -0.1], [0.178, 0.04], [0.174, 0.2], [0.178, 0.36],
        [0.182, 0.46], [0.162, 0.52], [0.116, 0.57], [0.056, 0.605]];
    case 'work': // 工装夹克：微鼓腹
      return [[0.168, -0.1], [0.16, -0.02], [0.154, 0.08], [0.16, 0.2], [0.163, 0.34],
        [0.166, 0.44], [0.151, 0.51], [0.106, 0.565], [0.054, 0.605]];
    case 'dress': // 连衣裙上身
      return [[0.15, -0.06], [0.135, 0.04], [0.126, 0.14], [0.134, 0.28], [0.146, 0.4],
        [0.15, 0.47], [0.135, 0.52], [0.096, 0.57], [0.054, 0.615]];
    default:
      return torsoProfile('work');
  }
}
/** 按躯干轮廓插值某高度的半径（放纽扣/胸牌等贴身件用） */
function torsoRadiusAt(kind, y) {
  const pts = torsoProfile(kind);
  for (let i = 0; i < pts.length - 1; i++) {
    const [r0, y0] = pts[i], [r1, y1] = pts[i + 1];
    if (y >= y0 && y <= y1) return r0 + (r1 - r0) * ((y - y0) / (y1 - y0));
  }
  return y < pts[0][1] ? pts[0][0] : pts[pts.length - 1][0];
}
// ===== 轮23·上装放样重建（路径A·身体） =====
// 车削酒瓶躯干（旋转对称+高斯肩包）废除——西装/马甲/工装换环放样：
//   逐环给出「半宽 rx / 半厚 rz / 超椭圆方度 k / 前胸鼓 pad / 背胛棱 boss」，
//   肩段是**接近水平的肩峰台**（垫肩西装的肩线），胸背是有厚度的「箱体」，
//   腰有收、下摆微张。剪影从任何角度读「穿西装的成年男人」，不再是保龄球瓶。
const TORSO_SHOULDER_RX = 0.217; // 肩峰台半宽（metrics.shoulderW 与几何同源，不许各抄各的）
function torsoRingsFor(kind) {
  const S = TORSO_SHOULDER_RX;
  // [y, rx, rz, k, pad(前胸鼓), boss(背胛棱)]
  if (kind === 'vest') {
    return [
      [-0.06, 0.150, 0.116, 0.84, 0, 0],
      [0.02, 0.146, 0.112, 0.84, 0, 0],
      [0.12, 0.146, 0.112, 0.85, 0.01, 0.01],
      [0.24, 0.156, 0.120, 0.86, 0.03, 0.03],
      [0.34, 0.168, 0.126, 0.88, 0.05, 0.05],
      [0.42, 0.184, 0.118, 0.90, 0.04, 0.06],
      [0.48, 0.206, 0.107, 0.92, 0, 0.03],
      [0.515, S, 0.098, 0.80, 0, 0],
      [0.54, 0.204, 0.091, 0.80, 0, 0],
      [0.562, 0.170, 0.084, 0.84, 0, 0],
      [0.585, 0.115, 0.069, 0.88, 0, 0],
      [0.605, 0.057, 0.053, 1.0, 0, 0],
    ];
  }
  if (kind === 'work') {
    return [
      [-0.10, 0.172, 0.130, 0.80, 0, 0],
      [-0.02, 0.166, 0.126, 0.80, 0, 0],
      [0.08, 0.158, 0.120, 0.82, 0, 0],
      [0.20, 0.162, 0.124, 0.84, 0.02, 0.03],
      [0.33, 0.172, 0.128, 0.86, 0.04, 0.05],
      [0.42, 0.186, 0.120, 0.88, 0.03, 0.06],
      [0.48, 0.207, 0.108, 0.92, 0, 0.03],
      [0.515, S, 0.099, 0.80, 0, 0],
      [0.54, 0.204, 0.092, 0.80, 0, 0],
      [0.562, 0.170, 0.085, 0.84, 0, 0],
      [0.585, 0.116, 0.070, 0.88, 0, 0],
      [0.605, 0.057, 0.053, 1.0, 0, 0],
    ];
  }
  // suit（默认）：垫肩+驳领西装，下摆过臀
  return [
    [-0.145, 0.170, 0.127, 0.82, 0, 0],
    [-0.06, 0.164, 0.124, 0.82, 0, 0],
    [0.06, 0.152, 0.118, 0.84, 0, 0],
    [0.20, 0.160, 0.124, 0.86, 0.02, 0.04],
    [0.33, 0.172, 0.128, 0.88, 0.05, 0.05],
    [0.42, 0.186, 0.120, 0.90, 0.04, 0.06],
    [0.48, 0.208, 0.108, 0.92, 0, 0.03],
    [0.515, S, 0.100, 0.80, 0, 0],
    [0.54, 0.205, 0.094, 0.80, 0, 0],
    [0.562, 0.172, 0.085, 0.84, 0, 0],
    [0.585, 0.118, 0.070, 0.88, 0, 0],
    [0.605, 0.058, 0.054, 1.0, 0, 0],
  ];
}
function torsoGeo(kind) {
  if (kind === 'satin' || kind === 'dress') return torsoLatheGeo(kind);
  return G('torsoLoft23_' + kind, () => {
    const rings = torsoRingsFor(kind).map(([y, rx, rz, k, pad, boss]) => ({
      c: [0, y, 0], e1: [1, 0, 0], e2: [0, 0, 1],
      rx, rz, k, pad, boss, v: (y + 0.15) / 0.76,
    }));
    const g = loftRings(rings, 30);
    // 布身垂坠褶：胸线以下沿方位角低频起伏——衣料挂在身上有自己的褶落
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const az = Math.atan2(v.x, v.z);
      const drape = (Math.sin(az * 7 + 0.8) * 0.55 + Math.sin(az * 12 + 2.9) * 0.45)
        * _ss01(0.44, 0.1, v.y) * 0.0024;
      const rr = Math.hypot(v.x, v.z);
      if (rr > 0.02) {
        const kd = 1 + drape / rr;
        v.x *= kd; v.z *= kd;
      }
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  });
}
function torsoLatheGeo(kind) {
  return G('torso_' + kind, () => {
    const pts = torsoProfile(kind).map(([r, y]) => new THREE.Vector2(r, y));
    const g = new THREE.LatheGeometry(pts, 30, 0, Math.PI * 2);
    // 人不是圆桶：前后压扁 + 肩部高斯横向加宽（肩比胸宽、比髋宽）
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const sh = Math.exp(-(((v.y - 0.478) / 0.098) ** 2)) * (1 - _ss01(0.52, 0.585, v.y));
      v.x *= 1 + sh * 0.3;
      v.z *= 0.7;
      const az = Math.atan2(v.x, v.z);
      const drape = (Math.sin(az * 7 + 0.8) * 0.55 + Math.sin(az * 12 + 2.9) * 0.45)
        * _ss01(0.44, 0.1, v.y) * 0.0022;
      const rr = Math.hypot(v.x, v.z);
      if (rr > 0.02) {
        const kd = 1 + drape / rr;
        v.x *= kd; v.z *= kd;
      }
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  });
}

/** 放样躯干前缘 z(y)：与 torsoRingsFor 同源（rz*(1+pad)）——
 *  驳头/白V/领带全部从这条曲线取形，贴衣不悬空 */
const FRONT_FZ = {
  vest: [[0.24, 0.1236], [0.34, 0.1323], [0.42, 0.1227], [0.48, 0.107], [0.515, 0.098], [0.54, 0.091], [0.562, 0.084], [0.585, 0.069], [0.605, 0.053]],
  suit: [[0.20, 0.1265], [0.33, 0.1344], [0.42, 0.1248], [0.48, 0.108], [0.515, 0.100], [0.54, 0.094], [0.562, 0.085], [0.585, 0.070], [0.605, 0.054]],
};
function frontZAt(kind, y) {
  const fz = FRONT_FZ[kind] ?? FRONT_FZ.suit;
  if (y <= fz[0][0]) return fz[0][1];
  for (let i = 0; i < fz.length - 1; i++) {
    if (y >= fz[i][0] && y <= fz[i + 1][0]) {
      const t = (y - fz[i][0]) / (fz[i + 1][0] - fz[i][0]);
      return fz[i][1] + (fz[i + 1][1] - fz[i][1]) * t;
    }
  }
  return fz[fz.length - 1][1];
}
// 超椭圆前身在 |x|<0.06 内近乎平板（k≈0.85 方截面）——曲率修正只留 0.18 档
const frontCurve = (x) => 1 - 0.18 * Math.pow(x / 0.15, 2);

/** 西装驳头（轮23·曲面版）：沿放样躯干前表面贴伏的三角面板（s=±1 左右）。
 *  旧平板 Extrude 驳头下半埋进胸、上半悬空翘出——玩偶佩饰的老毛病 */
function lapelGeo(s = 1) {
  return G('lapel23s' + s, () => {
    const rows = 8, cols = 4;
    const A = [0.013, 0.610], B = [0.005, 0.372];   // 内缘：领口 → 扣位
    const C = [0.060, 0.578], D = [0.030, 0.382];   // 外缘：肩前 → 扣位外
    const pos = [], idxA = [];
    for (let i = 0; i <= rows; i++) {
      const t = i / rows;
      const ix = A[0] + (B[0] - A[0]) * t, iy = A[1] + (B[1] - A[1]) * t;
      const ox = C[0] + (D[0] - C[0]) * t + Math.sin(Math.PI * t) * 0.007; // 外缘微弓（翻驳线）
      const oy = C[1] + (D[1] - C[1]) * t;
      for (let j = 0; j <= cols; j++) {
        const u = j / cols;
        const x = (ix + (ox - ix) * u) * s;
        const y = iy + (oy - iy) * u;
        const z = frontZAt('suit', y) * frontCurve(x) + 0.0068 + 0.0022 * (1 - t);
        pos.push(x, y, z);
      }
    }
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j, b = a + cols + 1;
      if (s > 0) idxA.push(a, b, a + 1, a + 1, b, b + 1);
      else idxA.push(a, a + 1, b, a + 1, b + 1, b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idxA);
    g.computeVertexNormals();
    return g;
  });
}

/** 衬衫前胸 V 面（轮23·曲面版）：沿放样躯干前表面贴弧上行，
 *  顶缘塞进领折之下——白 V 从领口一路长到胸口，不再是悬在胸前的围嘴三角 */
function shirtVGeo(kind = 'vest') {
  return G('shirtV23_' + kind, () => {
    const zAt = (y) => frontZAt(kind, y);
    const yTop = 0.615, yBot = kind === 'vest' ? 0.315 : 0.36;
    const wTop = kind === 'vest' ? 0.058 : 0.034;
    const rows = 10, colsN = 8;
    const pos = [], uvA = [], idxA = [];
    for (let i = 0; i <= rows; i++) {
      const t = i / rows, y = yBot + (yTop - yBot) * t;
      const w = Math.max(0.005, wTop * Math.pow(t, 0.78));
      for (let j = 0; j <= colsN; j++) {
        const x = -w + (2 * w * j) / colsN;
        const z = zAt(y) * frontCurve(x) + 0.0052;
        pos.push(x, y, z); uvA.push(j / colsN, t);
      }
    }
    for (let i = 0; i < rows; i++) for (let j = 0; j < colsN; j++) {
      const a = i * (colsN + 1) + j, b = a + colsN + 1;
      idxA.push(a, a + 1, b, a + 1, b + 1, b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvA, 2));
    g.setIndex(idxA);
    g.computeVertexNormals();
    return g;
  });
}

/** 领带（轮23·贴胸版）：结顶到领口正前，叶片沿放样躯干前表面逐段弯垂——
 *  直板领带悬在胸前 2cm 是「玩偶佩饰」的老毛病 */
function tieGeo() {
  return G('tie23', () => {
    // 结：领口正前的小梯形块（上窄下宽），顶缘塞到领筒下
    const knot = new THREE.BoxGeometry(0.034, 0.036, 0.013, 1, 2, 1);
    {
      const p = knot.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const t = (p.getY(i) + 0.018) / 0.036;      // 0 底 → 1 顶
        p.setX(i, p.getX(i) * (1 - 0.28 * t));      // 顶收窄成结形
        p.setZ(i, p.getZ(i) + frontZAt('suit', 0.598 + p.getY(i)) + 0.0075);
      }
      knot.computeVertexNormals();
    }
    // 叶片：沿前身弯垂的布条（上窄下宽收尖）
    const blade = new THREE.BoxGeometry(0.044, 0.30, 0.007, 1, 12, 1);
    {
      const p = blade.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const yl = p.getY(i);                        // -0.15..0.15
        const y = 0.428 + yl;                        // 世界 0.278..0.578
        const t = (yl + 0.15) / 0.30;               // 0 底 → 1 顶
        const wScl = t > 0.92 ? 0.75 : (0.72 + 0.40 * (1 - t)); // 顶端进结收窄
        p.setX(i, p.getX(i) * wScl * (t < 0.08 ? (t / 0.08) * 0.7 + 0.3 : 1)); // 底端收尖
        p.setZ(i, p.getZ(i) + frontZAt('suit', y) + 0.006);
      }
      blade.computeVertexNormals();
    }
    return merged([xform(knot, 0, 0.598, 0), xform(blade, 0, 0.428, 0)]);
  });
}

/** 领结（侍应） */
function bowtieGeo() {
  // 轮21：两翼换「蝶形楔」——外端上下角折进、翼面向后掠 + 中结布带竖箍，
  // 不再是两只方几何块钉在领口
  return G('bowtie', () => {
    const wing = (s) => {
      const g2 = new THREE.CylinderGeometry(0.0125, 0.0042, 0.036, 6, 1);
      g2.scale(1, 1, 0.42);
      return xform(g2, s * 0.0245, 0, -0.0035, 0.14 * s, 0.1 * s, -s * (Math.PI / 2 + 0.1));
    };
    return merged([
      xform(new THREE.BoxGeometry(0.011, 0.017, 0.011), 0, 0, 0.002, 0, 0, 0.06),   // 中结布箍
      wing(-1), wing(1),
    ]);
  });
}

/** 立领+盘扣（缎袄）：扣子贴着缎袄弧面走 */
function knotButtonsGeo() {
  return G('knotBtns', () => {
    const parts = [];
    for (let i = 0; i < 4; i++) {
      const y = 0.42 - i * 0.11;
      const z = torsoRadiusAt('satin', y) * 0.7 + 0.008;
      parts.push(xform(new THREE.SphereGeometry(0.009, 8, 6), 0.035, y, z));
      parts.push(xform(new THREE.TorusGeometry(0.009, 0.003, 5, 10), -0.02, y, z));
    }
    return merged(parts);
  });
}

/** 胶皮围裙（理骨员）：包身弧面胸挡 + 喇叭裙摆 + 颈带（贴着躯干车削面走，不是悬空板） */
function apronGeo() {
  return G('apron', () => merged([
    // 胸挡：前向弧面壳（轮23：随放样躯干前胸鼓外让）
    xform(new THREE.CylinderGeometry(0.156, 0.162, 0.28, 14, 1, true, -0.55, 1.1), 0, 0.41, 0.008, 0, 0, 0, 1, 1, 0.86),
    // 裙摆：过膝喇叭壳
    xform(new THREE.CylinderGeometry(0.166, 0.2, 0.66, 16, 1, true, -0.72, 1.44), 0, -0.06, 0.008, 0, 0, 0, 1, 1, 0.86),
    // 颈带
    xform(new THREE.CylinderGeometry(0.005, 0.005, 0.17, 6), -0.075, 0.58, 0.055, 0.45, 0, 0.55),
    xform(new THREE.CylinderGeometry(0.005, 0.005, 0.17, 6), 0.075, 0.58, 0.055, 0.45, 0, -0.55),
    // 腰带扣结（背后系带在侧腰露一点头）
    xform(new THREE.SphereGeometry(0.012, 6, 5), -0.125, 0.3, 0.02),
  ]));
}

// ================= 四肢（车削：肌腹峰可调 + 端半径严格归零） =================
// 木人偶球节的根治：肌腹用 sin(π·t^p) ——两端严格回到 r1/r2，
// 关节填缝球半径 = 两侧端半径，直立时球完全藏进管内，屈曲时恰好补圆弯角；
// 旧版的「近关节收细」使 细管→球→细管，正是关节鼓包(球关节人偶)的来源。
function limbGeo(r1, r2, len, key, bulge = 0.1, opts = {}) {
  return G(key, () => {
    const pts = [];
    const N = opts.wrinkle ? 22 : 14; // 褶皱环需要更密的纵向采样
    const p = Math.log(0.5) / Math.log(opts.peak ?? 0.38); // sin(π·t^p) 峰位=peak
    const cuff = opts.cuff ?? 0;
    const wr = opts.wrinkle ?? 0;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const muscle = Math.sin(Math.PI * Math.pow(t, p)) * r1 * bulge;
      // 袖口/裤脚外扩：布管挂在肢体外，末端不许收成贴皮紧身裤
      const flare = cuff ? Math.pow(Math.max(0, (t - 0.78) / 0.22), 1.7) * cuff : 0;
      // 布管褶皱环（去人偶感）：衣料松于肢体——沿管长两频叠出堆褶，
      // 端部窗函数归零（不破坏关节接缝半径）；侧光下袖管高光断成布褶
      const wrk = wr ? (Math.sin(t * 21 + r1 * 90) * 0.62 + Math.sin(t * 47 + 1.9) * 0.38)
        * wr * Math.sin(Math.PI * Math.min(1, t * 1.12)) : 0;
      pts.push(new THREE.Vector2(r1 + (r2 - r1) * t + muscle + flare + wrk, -t * len));
    }
    const g = new THREE.LatheGeometry(pts, 16);
    g.computeVertexNormals();
    return g;
  });
}

/** 一体袖山臂管（轮22·肩球根除）：肩头是袖管自身收拢的布圆顶——
 *  独立缝球（shoulderCap）废除，从任何抬臂角度肩上读到的都是「一条布袖的袖山」，
 *  不存在与躯干并排的光球剪影。圆顶方肩过渡（q³）模拟垫肩西装的肩线。 */
function sleeveArmGeo(key, o = {}) {
  const {
    rTop = 0.052, rCuff = 0.0405, len = 0.312, dome = 0.055,
    wrinkle = 0.0032, muscle = 0.09, peak = 0.42,
  } = o;
  return G(key, () => {
    const pts = [];
    const N = 36;
    const p = Math.log(0.5) / Math.log(peak);
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const y = dome - t * (dome + len);
      let r;
      if (y >= 0) {
        const q2 = y / dome;
        r = rTop * Math.sqrt(Math.max(0.0001, 1 - q2 * q2 * q2 * 0.999));
      } else {
        const s = -y / len;
        r = rTop + (rCuff - rTop) * s + Math.sin(Math.PI * Math.pow(s, p)) * rTop * muscle;
        // 布褶环（端部窗归零——袖口圆缘不破）
        if (wrinkle) {
          r += (Math.sin(s * 23 + 1.3) * 0.6 + Math.sin(s * 45 + 4.2) * 0.4)
            * wrinkle * Math.sin(Math.PI * Math.min(1, s * 1.08));
        }
      }
      pts.push(new THREE.Vector2(Math.max(0.0006, r), y));
    }
    const g = new THREE.LatheGeometry(pts, 18);
    g.computeVertexNormals();
    return g;
  });
}

/** 闭合关节布荚（轮22·肘/膝球根除）：两端收拢的褶皱布包骑在关节上
 *  （updateJointFairings 每帧对分转角）。与旧「开口布管+内芯缝球」的本质区别：
 *  荚体两端闭合、荚径大于两侧管径——深屈从下方看不到管口环/缝隙/内芯盘的
 *  三层同心圆，任何角度读到的都是一团布包着的关节头。 */
function jointPodGeo(key, o = {}) {
  const { rMax = 0.047, up = 0.08, down = 0.078, wrinkle = 0.0028, radial = 16 } = o;
  return G(key, () => {
    const pts = [];
    const N = 26;
    for (let i = 0; i <= N; i++) {
      const t = i / N;                        // 0 上端极 → 1 下端极（下端=关节外侧肘头）
      const y = up - t * (up + down);
      const e = Math.sin(Math.PI * Math.pow(t, 0.9));
      let r = rMax * Math.pow(Math.max(0.0001, e), 0.58); // 中段饱满、两端快收
      if (wrinkle) r += (Math.sin(t * 26 + 0.7) * 0.55 + Math.sin(t * 53 + 3.1) * 0.45) * wrinkle * e;
      pts.push(new THREE.Vector2(Math.max(0.0006, r), y));
    }
    const g = new THREE.LatheGeometry(pts, radial);
    g.computeVertexNormals();
    return g;
  });
}

/** 浮木前臂（侍应异常）：浪蚀出的沟槽车削 */
function driftLimbGeo(r, len, key) {
  return G(key, () => {
    const pts = [];
    for (let i = 0; i <= 18; i++) {
      const t = i / 18;
      const groove = Math.sin(t * 26) * 0.16 + Math.sin(t * 9 + 1.7) * 0.1;
      pts.push(new THREE.Vector2(r * (0.86 + groove * 0.22 + (1 - t) * 0.12), -t * len));
    }
    const g = new THREE.LatheGeometry(pts, 12);
    g.computeVertexNormals();
    return g;
  });
}

// ================= 手（轮21·人手网格 v2——全新实现） =================
// 旧方案（掌=三颗压扁球拼装 + 指=CatmullRom 折线扫掠管）在舞台顶光下仍被
// 终审读成「木偶手」：指过长过直、指扇过开像扇骨、掌背没有骨相、
// 腕口一颗独立胶囊读成「腕球关节」、食指还长在小指位（解剖翻转）。
// v2 从零重建，一只手 = 一套连续皮肤放样：
//   掌体 = 沿掌长的超椭圆截面放样（袖内腕管→腕沟→掌骨扇→指节脊→指蹼收头），
//          鱼际/小鱼际直接烘进截面轮廓——没有任何独立球件；
//   手指 = 解析积分的连续锥管：屈度是弧长上的平滑曲率窝（smoothstep 集中在
//          指节处），节间指腹微鼓、指节背侧微棱、指背远端压出指甲小平面、
//          指尖软圆头——全指一条网格，没有分节缝、没有关节球；
//   拇指 = 同一生成器自鱼际斜出对掌；
//   腕   = 掌体放样向上延伸的皮管直接埋进袖口（独立腕胶囊废除）；
//   解剖 = 右手拇指/食指在 +X 侧（旧实现食指在小指位）；四指并拢微分不开扇。
// 顶点色 = 指蹼/指节沟接触影（配 faceNecks 皮肤材质族的 vertexColors）。

/** 环放样公共件：rings = [{c:中心Vec3片段, e1,e2:截面基, rx,rz:半轴, k:超椭圆方,
 *  pad:掌侧鼓, boss:背侧棱, shade:顶点色, v:UV纵坐标}] → 连续索引网格 */
function loftRings(rings, radial = 16) {
  const pos = [], uv = [], col = [], idx = [];
  for (let i = 0; i < rings.length; i++) {
    const rg = rings[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      // 超椭圆截面（k<1 → 圆角矩形趋势：掌背/指腹是「面」不是「管」）
      let ex = Math.sign(c) * Math.pow(Math.abs(c), rg.k) * rg.rx;
      let ez = Math.sign(s) * Math.pow(Math.abs(s), rg.k) * rg.rz;
      // 掌侧指腹鼓 / 背侧指节棱（法向微起伏，不是独立件）
      const w = 1 + (rg.pad ?? 0) * Math.max(0, s) + (rg.boss ?? 0) * Math.max(0, -s);
      ex *= w; ez *= w;
      // 局部鼓包（鱼际/小鱼际）：沿截面角度的高斯窗
      if (rg.lumps) {
        for (const [la, lw, lk] of rg.lumps) {
          let da = a - la;
          da -= Math.round(da / (Math.PI * 2)) * Math.PI * 2;
          const g2 = Math.exp(-(da * da) / (2 * lw * lw)) * lk;
          ex *= 1 + g2; ez *= 1 + g2;
        }
      }
      pos.push(
        rg.c[0] + rg.e1[0] * ex + rg.e2[0] * ez,
        rg.c[1] + rg.e1[1] * ex + rg.e2[1] * ez,
        rg.c[2] + rg.e1[2] * ex + rg.e2[2] * ez);
      uv.push(j / radial, rg.v);
      const sh = rg.shade ?? 1;
      col.push(sh, sh, sh);
    }
  }
  const W = radial + 1;
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * W + j, b2 = a + 1, c2 = a + W, d = a + W + 1;
      idx.push(a, c2, d, a, d, b2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 连续锥管手指：屈度 θ(s) 沿弧长积分——每个指节是一段 smoothstep 曲率窝，
 *  节间指腹微鼓、指节背侧微棱、节沟极浅收腰（<6%，只读「褶」不读「缝」），
 *  指尖圆头 + 背侧压平的指甲小平面。root 起点埋进掌体 12mm 软过渡。 */
function digitGeo({ root, d0, b0, lens, curls, r0, taper = 0.78, radial = 14 }) {
  const D = new THREE.Vector3(...d0).normalize();
  const B = new THREE.Vector3(...b0);
  B.addScaledVector(D, -B.dot(D)).normalize();      // 掌侧屈向（正交化）
  const E1 = new THREE.Vector3().crossVectors(B, D); // 屈轴（截面横向）
  const L = lens.reduce((a2, b2) => a2 + b2, 0);
  const joints = [0];
  for (const l of lens) joints.push(joints[joints.length - 1] + l);
  const ss01 = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
  const bendAt = (s) => {
    let th = 0;
    for (let i = 0; i < curls.length; i++) {
      const w = 0.008 + 0.004 * (i === 0 ? 1 : 0);  // 掌指关节屈段稍宽
      th += curls[i] * ss01((s - (joints[i] - w)) / (2 * w));
    }
    return th;
  };
  const S = 26;
  const bury = 0.012;
  const rings = [];
  const P = new THREE.Vector3(...root);
  // 根部两圈：略粗、埋进掌缘（网格交贯，无缝可读）
  P.addScaledVector(D, -bury);
  const rB = r0 * 1.16;
  rings.push({ c: [P.x, P.y, P.z], e1: E1.toArray(), e2: B.toArray(), rx: rB * 1.02, rz: rB * 0.9, k: 0.85, shade: 0.84, v: 0 });
  let prev = 0;
  const dcur = new THREE.Vector3(), e2c = new THREE.Vector3();
  for (let i = 0; i <= S; i++) {
    const s = (i / S) * L;
    const th = bendAt(s);
    dcur.copy(D).multiplyScalar(Math.cos(th)).addScaledVector(B, Math.sin(th));
    P.addScaledVector(dcur, s - prev + (i === 0 ? bury : 0));
    prev = s;
    e2c.copy(B).multiplyScalar(Math.cos(th)).addScaledVector(D, -Math.sin(th));
    let r = r0 * (1.04 - (1 - taper) * (s / L));
    let pad = 0.05, boss = 0, shade = 1;
    for (let jn = 1; jn < joints.length - 1; jn++) {
      const d2 = s - joints[jn];
      const g2 = Math.exp(-(d2 * d2) / (2 * 0.0045 * 0.0045));
      r *= 1 - 0.045 * g2;              // 节沟浅收腰
      boss += 0.04 * g2;                 // 背侧指节微棱
      shade -= 0.05 * g2;                // 节沟接触影（轮21二稿：减档——侧光下不许读成骨环带）
      const mid = (joints[jn] + joints[jn - 1]) / 2;
      const dm = s - mid;
      pad += 0.07 * Math.exp(-(dm * dm) / (2 * 0.008 * 0.008)); // 节间指腹
    }
    // 指背远端指甲位：背侧压平（甲面读平光，不加独立件）
    const nailZone = ss01((s - (L - lens[lens.length - 1] * 0.72)) / (lens[lens.length - 1] * 0.5));
    rings.push({
      c: [P.x, P.y, P.z], e1: E1.toArray(), e2: e2c.toArray(),
      rx: r * 1.04, rz: r * 0.93, k: 0.92 - nailZone * 0.18,
      pad, boss: boss - nailZone * 0.24, shade: shade + nailZone * 0.045, v: 0.1 + (s / L) * 0.8,
    });
  }
  // 指尖软圆头（沿末端切向收拢；背侧继承甲面压平）
  const thL = bendAt(L);
  dcur.copy(D).multiplyScalar(Math.cos(thL)).addScaledVector(B, Math.sin(thL));
  e2c.copy(B).multiplyScalar(Math.cos(thL)).addScaledVector(D, -Math.sin(thL));
  const rT = r0 * (1.04 - (1 - taper));
  let tipD = 0;
  for (const [dt, rk] of [[0.34, 0.88], [0.6, 0.62], [0.8, 0.3], [0.9, 0.05]]) {
    P.addScaledVector(dcur, rT * (dt - tipD));
    tipD = dt;
    rings.push({
      c: [P.x, P.y, P.z], e1: E1.toArray(), e2: e2c.toArray(),
      rx: rT * rk * 1.02, rz: rT * rk * 0.85, k: 0.95, boss: -0.2 * rk, shade: 1.04, v: 0.95 + dt * 0.05,
    });
  }
  return loftRings(rings, radial);
}

/** 手（轮21·v2）：单套连续放样。curl: 'relax'|'open'|'flat'。
 *  几何为右手（拇指/食指 +X 侧，掌心 +Z）；左手用 mirroredHandGeo 取真镜像。 */
function handGeo(curl = 'relax') {
  return G('hand21_' + curl, () => {
    const parts = [];
    const Y = [0, 1, 0], Z = [0, 0, 1], X = [1, 0, 0];
    // —— 掌体放样：腕管(入袖)→腕沟→掌骨扇(鱼际/小鱼际烘进 lumps)→指节脊→指蹼收头 ——
    const th2 = [[0.75, 0.62, 0.16], [2.5, 0.66, 0.09]]; // [鱼际, 小鱼际] 高斯窗
    const palmRow = (y, rx, rz, k, cz = 0, lumps = null, shade = 1, v = 0) =>
      ({ c: [0, y, cz], e1: X, e2: Z, rx, rz, k, lumps, shade, v });
    parts.push(loftRings([
      palmRow(0.042, 0.0242, 0.0176, 0.9, 0, null, 1, 0),
      palmRow(0.016, 0.0250, 0.0180, 0.88, 0, null, 1, 0.08),
      palmRow(-0.006, 0.0264, 0.0184, 0.85, 0.0004, null, 0.97, 0.16), // 腕沟
      palmRow(-0.030, 0.0328, 0.0200, 0.78, 0.0012, [[th2[0][0], 0.62, 0.10], th2[1]], 1, 0.3),
      palmRow(-0.054, 0.0384, 0.0208, 0.72, 0.0018, th2, 1, 0.45),
      palmRow(-0.074, 0.0417, 0.0198, 0.68, 0.0014, [[0.9, 0.5, 0.07], [2.45, 0.6, 0.05]], 0.97, 0.6),
      palmRow(-0.088, 0.0427, 0.0182, 0.66, 0.0008, null, 0.95, 0.72),  // 掌指沟/指节脊
      palmRow(-0.098, 0.0404, 0.0158, 0.7, 0.0004, null, 0.9, 0.82),
      palmRow(-0.1055, 0.0328, 0.0112, 0.8, 0, null, 0.87, 0.9),
      palmRow(-0.1105, 0.0202, 0.0064, 0.95, 0, null, 0.85, 0.96),
      palmRow(-0.1128, 0.0036, 0.0018, 1, 0, null, 0.85, 1),
    ]));
    // —— 四指：并拢微分（拇指侧为 +X：食→小从 +X 到 -X），屈度瀑布 ——
    // hold=握持（持麦/持刷：指裹住柄，掌心留 25mm 空腔）
    const CURL = {
      relax: [0.42, 0.5, 0.3], open: [0.17, 0.21, 0.13], flat: [0.1, 0.1, 0.06],
      hold: [0.88, 0.92, 0.5],
    }[curl];
    const CAS = curl === 'flat' ? [0.92, 1, 1.06, 1.12] : [0.82, 0.95, 1.1, 1.28];
    // 轮21二稿：指扇再收近半——张开的手指是「并拢微分」
    const FIN = [ // [x0, y0, z0, r0, L1, L2, L3, splay]
      [0.0300, -0.086, 0.0012, 0.0082, 0.040, 0.024, 0.019, 0.030],
      [0.0102, -0.090, 0.0018, 0.0086, 0.044, 0.027, 0.021, 0.005],
      [-0.0098, -0.088, 0.0015, 0.0080, 0.041, 0.0255, 0.020, -0.020],
      [-0.0285, -0.081, 0.0006, 0.0068, 0.031, 0.019, 0.016, -0.045],
    ];
    for (let i = 0; i < 4; i++) {
      const [x0, y0, z0, r0, l1, l2, l3, sp] = FIN[i];
      parts.push(digitGeo({
        root: [x0, y0, z0],
        d0: [Math.sin(sp), -Math.cos(sp), 0.06],
        b0: [0, 0, 1],
        lens: [l1, l2, l3],
        curls: CURL.map((c) => c * CAS[i]),
        r0,
      }));
    }
    // —— 拇指：自鱼际斜出对掌（2 节） ——
    const TC = { relax: [0.3, 0.42], open: [0.2, 0.3], flat: [0.16, 0.24], hold: [0.5, 0.62] }[curl];
    parts.push(digitGeo({
      root: [0.0252, -0.031, 0.0055],
      d0: [0.78, -0.5, 0.36],
      b0: [-0.3, -0.2, 0.9],
      lens: [0.037, 0.03],
      curls: TC,
      r0: 0.0096, taper: 0.72,
    }));
    return merged(parts);
  });
}
/** 左手：右手几何的真镜像（负缩放+翻转三角形绕向）——
 *  旧方案两手共用同一几何靠旋转摆位，左手其实是「转过去的右手」，
 *  拇指长在小指侧（分指手一做实立刻穿帮）。 */
function mirroredHandGeo(curl = 'relax') {
  return G('handMir_' + curl, () => {
    const g = handGeo(curl).clone();
    g.scale(-1, 1, 1);
    // 负缩放翻面：翻转三角形绕向恢复正面（合并几何带索引——翻的是索引序）
    if (g.index) {
      const idx = g.index.array;
      for (let t = 0; t + 2 < idx.length; t += 3) {
        const tmp = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = tmp;
      }
      g.index.needsUpdate = true;
    } else {
      for (const name of ['position', 'normal', 'uv']) {
        const at = g.attributes[name];
        if (!at) continue;
        const it = at.itemSize;
        for (let t = 0; t + 2 < at.count; t += 3) {
          for (let k = 0; k < it; k++) {
            const a = (t + 1) * it + k, b = (t + 2) * it + k;
            const tmp = at.array[a]; at.array[a] = at.array[b]; at.array[b] = tmp;
          }
        }
        at.needsUpdate = true;
      }
    }
    g.computeVertexNormals();
    return g;
  });
}

/** 皮鞋 */
function shoeGeo() {
  return G('shoe', () => merged([
    xform(new THREE.BoxGeometry(0.085, 0.018, 0.235), 0, -0.052, 0.05),
    xform(new THREE.SphereGeometry(0.052, 12, 9), 0, -0.02, 0.02, 0, 0, 0, 0.82, 0.62, 1.6),
    xform(new THREE.SphereGeometry(0.045, 10, 8), 0, -0.028, 0.13, 0, 0, 0, 0.78, 0.42, 1.15),
  ]));
}
/** 布鞋/胶鞋（镇民） */
function clothShoeGeo() {
  return G('clothShoe', () => merged([
    xform(new THREE.BoxGeometry(0.088, 0.02, 0.21), 0, -0.05, 0.04),
    xform(new THREE.SphereGeometry(0.05, 11, 8), 0, -0.022, 0.05, 0, 0, 0, 0.86, 0.6, 1.5),
  ]));
}
/** 胶靴（理骨员）：高筒 */
function bootGeo() {
  return G('boot', () => merged([
    xform(new THREE.BoxGeometry(0.09, 0.02, 0.24), 0, -0.05, 0.05),
    xform(new THREE.SphereGeometry(0.052, 11, 8), 0, -0.02, 0.05, 0, 0, 0, 0.85, 0.6, 1.55),
    xform(new THREE.CylinderGeometry(0.052, 0.056, 0.24, 12), 0, 0.09, -0.005),
  ]));
}

// ================= 工位异常部件 =================
/** 报数员：口部鱼籽状钙化（轮17 重做）——旧版 22 颗 6-13mm 大球糊住半张脸，
 *  0.5m 读成「粘上去的乒乓球」；现在是沿口裂缝挤出的一串 2-4mm 细籽：
 *  半埋进唇床皮面（球心压到皮下 40%），主串走口缝、两撮垂在下唇缘与嘴角——
 *  远看只是嘴上一块痂，近看才读出每一粒都是「从缝里长出来的」 */
function roeSealGeo() {
  return G('roeSeal', () => {
    const parts = [];
    let s = 12345;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    // 皮面深度（口周局部近似）：越偏离口心越靠后（轮20：随口裂线下移重标）
    const zSurf = (x, y) => 0.0805 - x * x * 2.6 - (y + 0.0685) * (y + 0.0685) * 1.9;
    // 主串：沿口裂弧线密排（籽从缝里挤出来）——轮18：粒径再压 (≤2.4mm)、
    // 球心沉进皮下 3/4，露头只剩一粒软鼓——0.5m 读成口缝上的一线痂
    for (let i = 0; i < 12; i++) {
      const t = i / 11 - 0.5;
      const x = t * 0.046 + (rnd() - 0.5) * 0.002;
      const y = -0.0685 - Math.cos(t * Math.PI) * 0.0015 + (rnd() - 0.5) * 0.0015;
      const r = 0.0012 + rnd() * 0.0008;
      parts.push(xform(new THREE.SphereGeometry(r, 7, 5), x, y, zSurf(x, y) - r * 0.74));
    }
    // 下唇缘垂串：一小撮（蔓延是不对称的）
    for (let i = 0; i < 5; i++) {
      const x = -0.011 + (rnd() - 0.5) * 0.009;
      const y = -0.075 - rnd() * 0.005;
      const r = 0.001 + rnd() * 0.0008;
      parts.push(xform(new THREE.SphereGeometry(r, 7, 5), x, y, zSurf(x, y) - r * 0.75));
    }
    // 左嘴角一小丛（最先钙化的地方）
    for (let i = 0; i < 4; i++) {
      const x = -0.024 - rnd() * 0.005;
      const y = -0.068 + (rnd() - 0.5) * 0.006;
      const r = 0.0012 + rnd() * 0.0009;
      parts.push(xform(new THREE.SphereGeometry(r, 7, 5), x, y, zSurf(x, y) - r * 0.72));
    }
    return merged(parts);
  });
}

/** 理册婆：第三眼矿物孔板（额头正中、眉心上方） */
function poreplateDiscGeo() {
  return G('poreDisc', () => {
    const g = new THREE.CylinderGeometry(0.02, 0.022, 0.008, 16);
    g.rotateX(Math.PI / 2 - 0.24);
    g.translate(0, 0.042, 0.0925); // 眉心上方的露肤额头（别嵌进发际线）
    return g;
  });
}

/** 岗亭员：投币口嘴——嘴的位置是一道钢缝（前探出面部表面，深根入头防碎片化） */
function ticketSlotGeo() {
  return G('ticketSlot', () => merged([
    xform(new THREE.BoxGeometry(0.056, 0.016, 0.02), 0, -0.0685, 0.086, -0.06), // 钢框（轮20：随口裂线下移）
  ]));
}

/** 盐霜附居痕迹（唯一主异常）：从颌角沿颧骨→外眼角→太阳穴→额角的**不对称**结晶蔓延，
 *  只长在一侧脸上。主脉一串晶壳 + 两条侧枝 + 数粒藤壶状附居锥。
 *  6m 外只是脸上一块浅色；2m 内读出它是「长在皮肤上的」。 */
function saltFrostGeo(seed) {
  return G('saltFrost_' + (seed % 8), () => {
    let s = ((seed + 3) * 2246822519) >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const parts = [];
    const surf = (az, el, rr = 0.1) => {
      const ce = Math.cos(el);
      return [-Math.sin(az) * ce * rr, Math.sin(el) * rr, Math.cos(az) * ce * rr];
    };
    const put = (az, el, size) => {
      const [x, y, z] = surf(az, el);
      parts.push(xform(new THREE.SphereGeometry(size, 7, 5), x, y, z,
        rnd() * 3, rnd() * 3, rnd() * 3, 1, 0.55 + rnd() * 0.35, 1));
    };
    // 主脉：颌角 → 颧骨 → 外眼角 → 太阳穴 → 额角（晶粒沿途变小——蔓延是有方向的）
    const N = 18;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const az = 0.52 + Math.sin(t * 2.6) * 0.26 + (rnd() - 0.5) * 0.09;
      const el = -0.44 + t * 1.06 + (rnd() - 0.5) * 0.07;
      put(az, el, 0.0112 * (1 - t * 0.5) * (0.7 + rnd() * 0.5));
    }
    // 侧枝：一条爬向鼻侧、一条绕向耳前
    for (const [az0, el0, daz, del] of [[0.6, -0.16, -0.12, 0.045], [0.72, 0.1, 0.13, 0.055]]) {
      for (let i = 0; i < 5; i++) {
        put(az0 + daz * i + (rnd() - 0.5) * 0.05, el0 + del * i + (rnd() - 0.5) * 0.05,
          0.0062 * (1 - i * 0.13) * (0.7 + rnd() * 0.5));
      }
    }
    // 附居痕迹：藤壶状小锥，壳口沿皮面法线朝外
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 6; i++) {
      const az = 0.54 + rnd() * 0.32, el = -0.36 + rnd() * 0.55;
      const [x, y, z] = surf(az, el);
      const cone = new THREE.ConeGeometry(0.0038 + rnd() * 0.0028, 0.0065, 7);
      const q = new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(x, y, z).normalize());
      cone.applyQuaternion(q);
      cone.translate(x * 1.03, y * 1.03, z * 1.03);
      parts.push(cone);
    }
    return merged(parts);
  });
}

/** 侍应托盘：不锈钢盘 + 沉积截面「菜」 */
function trayGeo() {
  return G('tray', () => merged([
    xform(new THREE.CylinderGeometry(0.165, 0.15, 0.014, 24), 0, 0, 0),
    xform(new THREE.TorusGeometry(0.16, 0.006, 6, 24), 0, 0.008, 0, Math.PI / 2),
  ]));
}
function traySedimentGeo() {
  return G('traySed', () => merged([
    xform(new THREE.CylinderGeometry(0.085, 0.09, 0.05, 16), 0, 0.032, 0),
    xform(new THREE.CylinderGeometry(0.06, 0.065, 0.035, 14), 0, 0.075, 0),
    xform(new THREE.SphereGeometry(0.035, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), 0, 0.09, 0),
  ]));
}

/** 麦克风（手持） */
function micGeo() {
  return G('mic', () => merged([
    xform(new THREE.CylinderGeometry(0.011, 0.014, 0.11, 10), 0, -0.02, 0),
    xform(new THREE.SphereGeometry(0.023, 12, 9), 0, 0.05, 0),
  ]));
}
/** 麦线：从手垂到台面没入 */
function micCableGeo() {
  return G('micCable', () => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.07, 0),
      new THREE.Vector3(0.06, -0.42, 0.04),
      new THREE.Vector3(0.03, -0.86, 0.1),
      new THREE.Vector3(-0.02, -1.28, 0.06),
    ]);
    return new THREE.TubeGeometry(curve, 14, 0.004, 5);
  });
}

/** 理骨员：长柄骨刷（竹柄 + 密毛刷头）——柄轴即局部 y 轴，挂点在柄中段 */
function boneBrushGeo() {
  return G('boneBrush', () => merged([
    xform(new THREE.CylinderGeometry(0.013, 0.015, 0.85, 8), 0, 0, 0),
    xform(new THREE.BoxGeometry(0.13, 0.045, 0.06), 0, -0.45, 0.01),
    xform(new THREE.BoxGeometry(0.12, 0.04, 0.05), 0, -0.487, 0.012),
  ]));
}

// ================= 角色配置 =================
// photo: 生图烘焙脸皮（M.faceMats 键）——同类角色共享一张照片脸，几何仍逐种子独特
const ROLE_DEFS = {
  emcee:    { torso: 'suit', hair: 'back', face: 'gaunt', skin: 'pale', photo: 'pale', shoe: 'leather', lapel: true, tie: true, mic: true, roeSeal: true, pants: 'suit' },
  waiter:   { torso: 'vest', hair: 'crop', face: 'gaunt', skin: 'pale', photo: 'pale', shoe: 'leather', shirtV: true, bowtie: true, drift: true, tray: true, pants: 'vest' },
  matron:   { torso: 'satin', hair: 'bun', face: 'old', skin: 'skin', photo: 'oldf', shoe: 'cloth', knots: true, poreplate: true, pants: 'satin' },
  guest_m:  { torso: 'suit', hairChoices: ['side', 'crop', 'back'], face: 'm', skin: 'skin', photo: 'm', shoe: 'leather', lapel: true, tie: true, pants: 'suit' },
  guest_m2: { torso: 'work', hairChoices: ['crop', 'side'], face: 'm', skin: 'skin', photo: 'm', shoe: 'leather', pants: 'work' },
  guest_f:  { torso: 'dress', hairChoices: ['perm', 'bun', 'long'], face: 'f', skin: 'skin', photo: 'f', shoe: 'leather', skirt: true, clavicle: true },
  // 周絮：主异常=盐霜附居痕迹沿左脸不对称蔓延（结晶从颌角爬到额角——她在被慢慢腌成礁石）
  bride:    { torso: 'satin', hair: 'long', face: 'f', skin: 'skin', photo: 'f', shoe: 'cloth', knots: true, pants: 'satin', saltFrost: true },
  townsman: { torso: 'work', hairChoices: ['crop', 'side'], face: 'm', skin: 'skin', photo: 'm', shoe: 'cloth', pants: 'work' },
  fisher:   { torso: 'work', hair: 'crop', face: 'old', skin: 'skin', photo: 'oldm', shoe: 'cloth', pants: 'work' },
  // —— 新增小镇威胁 ——
  // 岗亭员：镇口长途站的检票员。制服笔挺，嘴是一道投币口——规则一的执行者
  booth:    { torso: 'work', hair: 'crop', cap: true, face: 'gaunt', skin: 'pale', photo: 'pale', shoe: 'leather', uniform: true, ticketSlot: true, epaulet: true, pants: 'uniform' },
  // 理骨员：海洋馆巨骸厅的看守。胶皮围裙长手套，头永远歪向展缸那侧——它在听
  osteo:    { torso: 'work', hair: 'crop', face: 'gaunt', skin: 'chalk', photo: 'chalk', shoe: 'boot', apron: true, gloves: true, tiltHead: 0.3, brush: true, pants: 'work' },
  // 湿客：返潮后街上巡走的「打捞回来的人」——衣服还是镇民的，皮是泡过的
  returnee: { torso: 'work', hair: 'crop', face: 'gaunt', skin: 'corpse', photo: 'pale', shoe: 'cloth', pants: 'work', tiltHead: 0.18 },
  // 长途车司机：与镇民同一套 humanoid 骨相——制服外套+大檐帽（烘焙成静态扶盘姿）
  driver:   { torso: 'work', hair: 'crop', cap: true, face: 'm', skin: 'skin', photo: 'm', shoe: 'cloth', uniform: true, pants: 'work' },
};

function roleFromOpts(opts) {
  if (opts.role && ROLE_DEFS[opts.role]) return opts.role;
  // 旧接口兼容：cloth → 镇民/渔民
  if (opts.cloth === 'red') return 'bride';
  if (opts.hat || opts.tool) return 'fisher';
  return 'townsman';
}

export class Humanoid {
  /** 当前渲染相机的世界坐标（主循环/查看器每帧写入）——所有人形共用的 LOD 视点 */
  static viewer = new THREE.Vector3(0, -9999, 0);

  /**
   * @param M 材质库
   * @param opts { role, seed, hat, lantern, tool:'rake'|null, light, ghost }
   *   role: emcee|waiter|matron|guest_m|guest_m2|guest_f|bride|townsman|fisher|booth|osteo
   *   ghost: 回眸客——半透明多重曝光
   */
  constructor(M, opts = {}) {
    this.opts = opts;
    const role = roleFromOpts(opts);
    this.role = role;
    const D = ROLE_DEFS[role];
    const seed = (opts.seed ?? Math.random() * 1e9) >>> 0;
    const rnd = (() => { let s = seed; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
    const P = faceParamsFrom(seed);

    // ---- 材质选择 ----
    const ghost = !!opts.ghost;
    const ghostify = (m) => {
      const key = 'ghost_' + m.uuid;
      return Mtl(key, () => {
        const g2 = m.clone();
        g2.transparent = true; g2.opacity = 0.42; g2.depthWrite = false;
        return g2;
      });
    };
    const pick = (m) => (ghost ? ghostify(m) : m);
    // 肤色池：同一张贴图配不同年龄/色调——人群不再共享同一张皮
    const pickSkin = () => {
      if (D.skin === 'corpse') return M.corpseSkin ?? M.skinPale;
      if (D.skin === 'chalk') return M.skinChalk ?? M.skinPale;
      if (D.skin === 'pale') {
        const pool = M.skinPales ?? [M.skinPale];
        return pool[seed % pool.length];
      }
      if (D.face === 'old') {
        const pool = M.skinOlds ?? [M.skin];
        return pool[seed % pool.length];
      }
      const pool = M.skinTones ?? [M.skin];
      return pool[seed % pool.length];
    };
    const skin = pick(pickSkin());
    const clothMap = {
      suit: M.clothSuit, vest: M.clothVest, satin: M.satin, work: M.clothWork,
      dress: rnd() < 0.5 ? M.clothBrown : M.clothRed,
    };
    let torsoMat = pick(clothMap[D.torso] ?? M.clothWork);
    if (D.uniform) torsoMat = pick(M.clothUniform ?? M.clothWork);
    const pantsMat = pick(D.pants === 'suit' ? M.clothSuit : D.pants === 'vest' ? M.clothVest
      : D.pants === 'satin' ? M.clothSuit : D.pants === 'uniform' ? (M.clothUniform ?? M.clothWork) : M.clothWork);
    const shirtMat = pick(M.clothShirt);
    const hairPool = M.hairTones ?? [M.hair];
    // 轮23：photo 脸发色钉死为照片发色（FACE_HAIR 读图标定）——
    // 照片烘进头皮的鬓角/发根与 3D 发壳必须是同一头发；
    // 黑发照片配随机棕壳=「戴假发」（轮22 终审「发壳」否决项之一）
    const hairMat = pick(role === 'matron' || D.face === 'old'
      ? Mtl('hairGrey', () => new THREE.MeshStandardMaterial({ color: 0x4e4a46, roughness: 0.85 }))
      : (D.photo && FACE_HAIR[D.photo] !== undefined)
        ? Mtl('hairPhoto_' + D.photo, () => new THREE.MeshStandardMaterial({ color: FACE_HAIR[D.photo], roughness: 0.88 }))
        : hairPool[seed % hairPool.length]);
    const leather = pick(Mtl('leather', () => new THREE.MeshStandardMaterial({ color: 0x1c1713, roughness: 0.38, metalness: 0.08, envMapIntensity: 1.1 })));
    const clothShoe = pick(Mtl('clothShoe', () => new THREE.MeshStandardMaterial({ color: 0x26282c, roughness: 0.9 })));
    const rubber = pick(M.rubber ?? Mtl('rubberFallback', () => new THREE.MeshStandardMaterial({ color: 0x22282a, roughness: 0.32, envMapIntensity: 1.4 })));
    const drift = pick(M.driftwood);

    // ---- 个体差异 ----
    this.gait = {
      limp: (role === 'townsman' || role === 'fisher') ? rnd() * 0.4 : 0,
      limpSide: rnd() < 0.5 ? -1 : 1,
      tilt: D.tiltHead !== undefined ? D.tiltHead : (rnd() - 0.5) * (role === 'waiter' ? 0.02 : 0.12),
      droop: (rnd() - 0.5) * 0.18,
      pace: 0.92 + rnd() * 0.16,
    };
    this.conveyor = role === 'waiter' || role === 'booth'; // 匀速传送带步态/永不眨眼
    if (role === 'osteo') this.conveyor = true;            // 理骨员也不眨眼——它在听，不在看

    this.group = new THREE.Group();
    // 轮17·比例铁律：整套骨架按真人人体测量重标——
    //   头高 ≈ 身高 1/7.2-7.5（旧 1/8.8 的时装人台比是人偶感的骨相根源）
    //   颏底→锁骨 ≈ 0.10-0.13m；男身高均值 ~1.74m / 女 ~1.63m
    const hScale = (D.face === 'f' || role === 'matron' ? 0.87 : 0.91) + rnd() * 0.07;
    this.group.scale.setScalar(hScale);

    // ---- 骨架枢轴（与 v2 兼容：pelvis/torso/neck/head + 肩肘髋膝）----
    this.pelvis = new THREE.Group(); this.pelvis.position.y = 0.82; this.group.add(this.pelvis);
    this.torso = new THREE.Group(); this.torso.position.y = 0.10; this.pelvis.add(this.torso);
    // 轮22：颈长逐种子解算（旧 0.084 常量废除）——直接扫该种子头模网格的颏底顶点，
    // 反解出「颏底恒落在领口环顶(0.6744)下 3mm」的颈长：长脸种子不再露 8mm 裸颈柱、
    // 短脸种子不再把颏埋进领筒。领口从公式上顶住下颌，露颈忽长忽短双向出局
    const faceVariant = D.face === 'gaunt' ? 'gaunt' : D.face === 'old' ? 'old' : D.face;
    const photoKey = D.photo;
    let chinLocal = Infinity;
    {
      const hp = headGeo(faceVariant, P, false, photoKey ?? null).attributes.position;
      for (let i = 0; i < hp.count; i++) { const y = hp.getY(i); if (y < chinLocal) chinLocal = y; }
    }
    const neckLen = Math.min(0.098, Math.max(0.058, 0.6714 - 0.58 - (0.115 + chinLocal) * 1.16));
    this.neck = new THREE.Group(); this.neck.position.y = 0.58; this.torso.add(this.neck);
    this.head = new THREE.Group(); this.head.position.y = neckLen; this.neck.add(this.head);
    this.head.scale.setScalar(1.16); // 头高 0.25-0.257m 档：1.87m 骨架 ÷ 7.28-7.48 头
    // 轮18·颅骨横向收窄：旧头宽 0.205m/深 0.242m（真人 0.15-0.16/0.19-0.20）正是
    // 「头大脸宽下颌尖+颈细长」的骨相根源——高度不动（头身比铁律不破），
    // 颅壳网格与全部贴颅面附件统一乘 HX/HZ（眼球/睫/唇小件保持自身形状，只挪位）
    // 轮20三稿：HX 0.84→0.775（颊宽 165→152mm 真人档）；瞳距三处同乘 1.149 外移相抵——
    // 「五官挤中心」的横向维度：瞳距/脸宽 0.38→0.44
    const HX = 0.775, HZ = 0.90;
    this.headNarrow = { x: HX, z: HZ };

    const mkMesh = (geo, mat, px = 0, py = 0, pz = 0, sx = 1, sy = 1, sz = 1) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.scale.set(sx, sy, sz);
      return m;
    };

    // ---- 躯干（逐种子肩宽/胸厚） ----
    const shW = 1.02 + rnd() * 0.05;  // 肩宽系数（成人男全肩宽落在 0.40-0.46m，下限抬进铁律区）
    const chD = 0.94 + rnd() * 0.14;  // 胸厚系数
    this.torsoScl = { x: shW, z: chD };
    // 数值化比例（轮17 铁律，供 charshot 断言）：颅心 = torso 局部 0.688 + 0.115·1.16
    {
      const fl = headBase(D.face, P).faceLen; // 与颅骨雕刻域同一份基频
      const base = 0.82 + 0.10;
      const headOrg = 0.58 + neckLen + 0.006; // 轮22：随逐种子颈长
      const crown = base + headOrg + (0.115 + 0.105 * fl) * 1.16 + 0.006; // 颅顶+发壳厚
      const chin = base + headOrg + (0.115 - 0.105 * fl * 1.03) * 1.16;
      const clav = base + 0.578;
      // 轮23：肩宽与几何同源——放样上装直接用肩峰台半宽（TORSO_SHOULDER_RX），
      // 车削族（缎袄/连衣裙）沿用轮廓×高斯峰公式
      const lofted = !(D.torso === 'satin' || D.torso === 'dress');
      const shR = lofted ? 0
        : torsoProfile(D.torso).reduce((m2, [r, y2]) => (Math.abs(y2 - 0.48) < 0.06 ? Math.max(m2, r) : m2), 0.14);
      this.metrics = {
        height: crown * hScale,
        headH: (crown - chin) * hScale,
        neckLen: (chin - clav) * hScale,
        shoulderW: lofted ? 2 * TORSO_SHOULDER_RX * shW * hScale : 2 * shR * 1.3 * shW * hScale,
      };
      this.metrics.headRatio = this.metrics.height / this.metrics.headH;
    }
    this.torsoMesh = mkMesh(torsoGeo(D.torso), torsoMat, 0, 0, 0, shW, 1, chD);
    this.torso.add(this.torsoMesh);
    // 颈（轮17：浮木长颈废除——侍应的异常收敛到前臂/托盘，颈必须读成人的颈；
    // 「导管颈」的竖拉伸浮木贴图从此不可能出现在颈上）
    // 轮21：neckMat 提升到构造器作用域——手与脸/颈同一皮肤材质族（faceNecks
    // 同源取色+同一张毛孔调频贴图），舞台光下「手比脸白一档=蜡手/木手」根治
    const neckMat = (D.photo && M.faceNecks?.[D.photo]) ? pick(M.faceNecks[D.photo])
      : pick(Mtl('neckV_' + skin.uuid, () => {
        const m = skin.clone();
        m.vertexColors = true;
        return m;
      }));
    {
      const nkG = G('neckSkirt', () => {
        // 轮18：颈柱几何加宽（顶径 87→97mm）+ 下段更快铺进斜方肌——
        // 「大头顶细管」的对比消失；配合头组下移，裸颈段只剩喉那 2cm
        // 轮19：整柱再 +8%（成人男颈横径 ~110mm）——face_a「大头细颈」终审否决项；
        // 领筒/颌裙环/喉结同步扩径
        // 轮21：整柱再 +6%（随头组下移，颈更粗更短——「细长管」双向出局）
        const prof = [
          [0.0491, 0.105], [0.0524, 0.085], [0.0545, 0.06], [0.0545, 0.035],
          [0.0562, 0.012], [0.0621, -0.008], [0.0724, -0.026], [0.0896, -0.042], [0.1123, -0.055],
        ].map(([r, y2]) => new THREE.Vector2(r * 1.06, y2));
        const g2 = new THREE.LatheGeometry(prof, 18);
        g2.scale(1, 1, 0.8); // 颈截面前后略薄（加宽后压回——颈前不许越过下巴）
        const pos2 = g2.attributes.position;
        const col = new Float32Array(pos2.count * 3);
        for (let i = 0; i < pos2.count; i++) {
          // 轮15：接触阴影主责移交颌裙环（随头转的那圈才是真「下颌影」）——
          // 静止颈裙只留极浅的收头（0.10），且整段上移到 0.072 起——
          // 可见段（环圈以下）几乎均亮，旧的「暗脊」不再落在颌缘可见带上
          const t = Math.min(1, Math.max(0, (pos2.getY(i) - 0.072) / 0.05));
          const s2 = t * t * (3 - 2 * t);
          const sh = 1 - s2 * 0.10;
          col[i * 3] = sh; col[i * 3 + 1] = sh; col[i * 3 + 2] = sh;
        }
        g2.setAttribute('color', new THREE.BufferAttribute(col, 3));
        g2.computeVertexNormals();
        return g2;
      });
      // 轮22：颈裙随逐种子颈长整柱平移——顶段始终埋进颌裙环，不露管口
      const nkMesh = mkMesh(nkG, neckMat, 0, 0.6 + (neckLen - 0.084), 0.005);
      nkMesh.name = 'neckSkirt';
      this.torso.add(nkMesh);
      // 颌裙环（轮15·下颌-颈接缝根治）：挂在 head 组上、随头转的一圈「皮领」——
      // 上缘藏进下颌腔、下摆罩过颈裙顶段（颈顶的暗带整个盖在环里面）。
      // 头模底缘的剪影线从此压在同材质的环面上：同色（faceNecks 同一份材质）、
      // 同频（同一张颈皮调频贴图）——颌缘不再是「头壳切口 vs 颈筒」的明暗断面
      {
        const jrG = G('jawRing', () => {
          // 头组局部（按 head.scale=1.16 重标；轮18 随颈柱加宽同步扩径——
          // 环径仍只比颈裙宽 2mm=颌影圈，不许退化成「导管颈后的灰板」）
          const prof = [
            [0.0448, 0.0362], [0.0458, 0.0224], [0.0462, 0.0043],
            [0.0458, -0.0087], [0.0446, -0.0164],
          ].map(([r, y2]) => new THREE.Vector2(r, y2));
          const g2 = new THREE.LatheGeometry(prof, 18);
          g2.scale(1, 1, 0.8);
          const pos2 = g2.attributes.position;
          const col = new Float32Array(pos2.count * 3);
          for (let i = 0; i < pos2.count; i++) {
            // 下颌接触阴影烘在环自己身上：越往上钻进颌腔越暗（0.14），
            // 露出的下摆归一亮——与其下方的颈裙同色衔接
            const t = Math.min(1, Math.max(0, (pos2.getY(i) - 0.0019) / 0.0322));
            const s2 = t * t * (3 - 2 * t);
            const sh = 1 - s2 * 0.14;
            col[i * 3] = sh; col[i * 3 + 1] = sh; col[i * 3 + 2] = sh;
          }
          g2.setAttribute('color', new THREE.BufferAttribute(col, 3));
          g2.computeVertexNormals();
          return g2;
        });
        const jr = mkMesh(jrG, neckMat, 0, 0, 0.0046);
        jr.name = 'jawRing';
        this.head.add(jr);
      }
      // 喉结（男性；2 米内的活人证据）——半埋进颈面的软鼓包，不是贴在管上的蛋
      //（轮17二稿：射线证实旧参数仍整颗骑在领口上读成「贴上去的蛋」——
      // 加宽压扁(z 0.28→0.13)+再后沉 5mm：只留一道皮下软起伏，轮廓不再有独立剪影）
      if ((D.face === 'm' || D.face === 'gaunt' || D.face === 'old') && role !== 'matron') {
        // 轮18：顶点色 0.95→1.0（比颈面暗 5% 的球=近景一枚「灰色圆贴片」）+再沉 0.7mm
        this.torso.add(mkMesh(G('adam', () => {
          const g2 = new THREE.SphereGeometry(0.012, 8, 6);
          g2.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g2.attributes.position.count * 3).fill(1.0), 3));
          return g2;
        }), neckMat, 0, 0.664 + (neckLen - 0.084), 0.0405, 0.66, 0.9, 0.13));
      }
    }
    // 轮18·斜方肌过渡：颈根—肩峰两道衣料包着的斜坡（capsule 斜置）。
    // 轮19二稿（换色探针实锤）：一稿参数正视仍是领口两侧两片「花瓣」、
    // 侧视胸前一颗「泪滴球」——就是 face_a 否决单里的「肩球」本体。
    // 现在减径(42→28mm)+削薄(z 0.72→0.5)+放平(1.30→1.44)+外移下沉，
    // 胶囊几乎整根埋进躯干，肩上只露一道 <2cm 的斜方肌坡棱
    {
      const trapG = G('trapWedge', () => {
        const g2 = new THREE.CapsuleGeometry(0.028, 0.108, 6, 10);
        g2.scale(1, 1, 0.5);
        return g2;
      });
      for (const s of [-1, 1]) {
        const tp = mkMesh(trapG, torsoMat, s * 0.096 * shW, 0.534, -0.006, 1, 0.62, chD);
        tp.rotation.z = s * 1.44;
        this.torso.add(tp);
      }
    }
    // 锁骨（连衣裙领口露出）
    if (D.clavicle) {
      // 半埋进领口皮面（旧值 z0.052 整根浮在布面外，读成两根天线）
      const clavG = G('clav', () => new THREE.CapsuleGeometry(0.006, 0.062, 4, 8));
      const cl = mkMesh(clavG, skin, -0.044, 0.578, 0.044); cl.rotation.set(0.25, 0, 1.28);
      const cr = mkMesh(clavG, skin, 0.044, 0.578, 0.044); cr.rotation.set(0.25, 0, -1.28);
      this.torso.add(cl, cr);
    }
    // 服装细件
    // —— 领体系（轮17）：领筒贴颈 + 领口 4mm 厚度圆缘 + 可选外翻领面 ——
    // 「颈过长」的一半是错觉：真人锁骨以下的颈都埋在领子里。领筒上缘压到
    // 颏下 5cm（露肤仅一段喉），领口是一圈有厚度的布缘，不是零厚布纸筒
    const mkCollar = (mat, style = 'fold') => {
      // 轮23·领体系瘦身：旧领筒（径 59/76.5mm×高 88mm）是一只「颈托巨环」，
      // 顶着头读成加长的粗脖子（face_a「长颈」终审印象的真正来源一半在领不在颈）。
      // 现收到真衬衫领档：径 52/64mm×高 56mm，领口顶仍钉在 0.67（颏下 3mm 铁律不动）
      // 领径下限=颈柱顶径+4mm（颈 prof 顶 0.052——领必须包住颈，不许被皮顶穿）
      // 领筒前顶缘下压：真领子在喉前低、颈后高（band 全高露到颏下=牧师立领）。
      // fold 款压 16mm 露一段喉，band 款压 8mm（前面还有领结/领带结盖住）
      const dip = style === 'fold' ? 0.016 : 0.008;
      this.torso.add(mkMesh(G('collarBand23' + style, () => {
        const c = new THREE.CylinderGeometry(0.0565, 0.070, 0.058, 18, 2, true);
        const p = c.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
          if (y <= 0) continue;
          const f = Math.max(0, z / Math.hypot(x, z));
          p.setY(i, y - dip * f * f * (y / 0.029));
        }
        c.computeVertexNormals();
        return c;
      }), mat, 0, 0.641, 0.004));
      const rim = mkMesh(G('collarRim23' + style, () => {
        const t = new THREE.TorusGeometry(0.0565, 0.0044, 6, 18);
        t.rotateX(Math.PI / 2);
        // 厚度环随领筒前顶缘同步下压（否则悬浮在凹口上方）
        const p = t.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), z = p.getZ(i);
          const f = Math.max(0, z / Math.hypot(x, z));
          p.setY(i, p.getY(i) - dip * f * f);
        }
        t.computeVertexNormals();
        return t;
      }), mat, 0, 0.67, 0.004);
      rim.name = 'collarRim';
      this.torso.add(rim);
      // —— 轮24·领内闭合（face_a「领内露网」根治）——
      // ① 顶口封环：领筒顶缘与颈柱之间的环形空隙用一片随前缘下压的环面封死，
      //    俯角看进领口是「领内阴影」，不是穿透衣身的镂空网底；
      // ② 内衬筒：领筒背面补一层深色衬（BackSide）——侧缝角度也看不穿
      const innerM = Mtl('collarInnerDark', () => new THREE.MeshStandardMaterial({
        color: 0x17120f, roughness: 0.96,
      }));
      const cap = mkMesh(G('collarCap24' + style, () => {
        const rg = new THREE.RingGeometry(0.034, 0.0567, 18, 1);
        rg.rotateX(-Math.PI / 2);
        const p = rg.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), z = p.getZ(i);
          const f = Math.max(0, z / Math.hypot(x, z));
          p.setY(i, p.getY(i) - dip * f * f);
        }
        rg.computeVertexNormals();
        return rg;
      }), pick(innerM), 0, 0.6685, 0.004);
      cap.name = 'collarCap';
      cap.userData.noShadow = true;
      this.torso.add(cap);
      const lin = mkMesh(G('collarLining24' + style, () => {
        const c = new THREE.CylinderGeometry(0.0555, 0.069, 0.056, 18, 1, true);
        const p = c.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
          if (y <= 0) continue;
          const f = Math.max(0, z / Math.hypot(x, z));
          p.setY(i, y - dip * f * f * (y / 0.028));
        }
        c.computeVertexNormals();
        return c;
      }), pick(Mtl('collarLiningM', () => new THREE.MeshStandardMaterial({
        color: 0x1a1512, roughness: 0.95, side: THREE.BackSide,
      }))), 0, 0.641, 0.004);
      lin.name = 'collarLining';
      lin.userData.noShadow = true;
      this.torso.add(lin);
      if (style === 'fold') {
        // 翻领面：领筒外翻出的坡面——轮23 二刀：**前开口**。全圈领折=高领毛衣漏斗，
        // 真衬衫/夹克的翻领只包后颈与两侧，前面敞开露 V。开口 ±0.24π
        this.torso.add(mkMesh(G('collarFold23o', () => new THREE.CylinderGeometry(0.061, 0.084, 0.036, 18, 1, true, Math.PI * 0.24, Math.PI * 1.52)), mat, 0, 0.632, 0.004));
        // 领尖两片：开口两缘折向锁骨的小三角（衬衫领的「尖」），
        // 贴伏在领折坡面上（rotateX 外倾角=坡面母线角，不悬浮不出黑缝）
        const tipG = G('collarTip23', () => {
          const s = new THREE.Shape();
          s.moveTo(0, 0); s.lineTo(0.027, -0.004); s.lineTo(0.011, -0.033); s.closePath();
          const g2 = new THREE.ExtrudeGeometry(s, { depth: 0.0018, bevelEnabled: false });
          g2.rotateX(-0.62);
          return g2;
        });
        for (const s of [-1, 1]) {
          const tp = mkMesh(tipG, mat, s * 0.044, 0.648, 0.047, s < 0 ? -1 : 1, 1, 1);
          tp.rotation.y = s * 0.66;
          tp.userData.noShadow = true;
          this.torso.add(tp);
        }
      }
    };
    if (D.lapel) {
      // 驳头：贴放样前身的曲面三角面板。躯干网格带 (shW,1,chD) 逐种子缩放——
      // 前身附件必须同步缩放，否则胸厚 chD>1 的个体驳头/白V被衣身吃掉（蛀边）
      for (const s of [1, -1]) {
        const lp = mkMesh(lapelGeo(s), torsoMat, 0, 0, 0, shW, 1, chD);
        lp.userData.noShadow = true; this.torso.add(lp);
      }
      // 曲面白 V：贴放样躯干前表面，顶缘塞进领下
      const svS = mkMesh(shirtVGeo('suit'), shirtMat, 0, 0, 0, shW, 1, chD);
      svS.userData.noShadow = true; this.torso.add(svS);
      mkCollar(shirtMat, 'band');       // 白衬衫领贴颈（领口厚度环=衬衫布缘）
      // 西装外领面：披在衬衫领外的后半圈坡面（前开让位驳头+领带结）。
      // 上抬到 0.640：白衬衫领只露顶上一指宽（露全高=牧师立领）
      this.torso.add(mkMesh(G('collarFoldSuit23o', () => new THREE.CylinderGeometry(0.0655, 0.090, 0.046, 18, 1, true, Math.PI * 0.17, Math.PI * 1.66)), torsoMat, 0, 0.640, 0.002));
      // 轮23·前门襟（西装是「开襟的衣服」不是喷漆桶）：右盖左的门襟边一条 +
      // 开缝阴影线一条 + 两粒包布扣——中景剪影里西装前身有了「衣」的构造线。
      // 门襟条沿前身放样曲线取形（直盒会在弧面胸口两头悬空/中段埋肉）
      {
        const frontZ = (y) => {
          // suit 环表前缘（含前胸鼓）的分段线性近似 +5mm 出布
          const pts = [[-0.145, 0.127], [-0.06, 0.124], [0.06, 0.119], [0.20, 0.128], [0.33, 0.135], [0.42, 0.126]];
          for (let i = 0; i < pts.length - 1; i++) {
            if (y >= pts[i][0] && y <= pts[i + 1][0]) {
              const t = (y - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
              return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t;
            }
          }
          return y < 0 ? 0.127 : 0.126;
        };
        const stripG = (key, w, d) => G(key, () => {
          const g = new THREE.BoxGeometry(w, 0.44, d, 1, 10, 1);
          const p = g.attributes.position;
          for (let i = 0; i < p.count; i++) {
            const y = p.getY(i) + 0.13; // 条中心落 y=0.13
            p.setZ(i, p.getZ(i) + frontZ(Math.max(-0.145, Math.min(0.42, y))) + 0.004);
          }
          g.computeVertexNormals();
          return g;
        });
        const darkM = pick(Mtl('plackShade', () => new THREE.MeshStandardMaterial({ color: 0x0c0b0a, roughness: 0.95 })));
        const btnM = pick(Mtl('suitBtn', () => new THREE.MeshStandardMaterial({ color: 0x191512, roughness: 0.5 })));
        const btnG = G('suitBtnG', () => new THREE.SphereGeometry(0.0072, 8, 6));
        for (const m of [
          mkMesh(stripG('plackSeam23', 0.0036, 0.004), darkM, 0.010, 0.13, 0, 1, 1, chD),
          mkMesh(stripG('plackEdge23', 0.013, 0.0065), torsoMat, 0.0195, 0.13, 0, 1, 1, chD),
          mkMesh(btnG, btnM, 0.013, 0.245, (frontZ(0.245) + 0.006) * chD, 1, 1, 0.45),
          mkMesh(btnG, btnM, 0.013, 0.155, (frontZ(0.155) + 0.006) * chD, 1, 1, 0.45),
        ]) { m.userData.noShadow = true; this.torso.add(m); }
      }
    }
    if (D.shirtV) {
      // 轮23：曲面白 V 贴放样马甲前身（随躯干逐种子缩放），顶缘塞进前开领折之下
      const svV = mkMesh(shirtVGeo('vest'), shirtMat, 0, 0, 0, shW, 1, chD);
      svV.userData.noShadow = true; this.torso.add(svV);
      mkCollar(shirtMat, 'fold');       // 衬衫翻领（侍应）——前开+领尖
    }
    if (D.torso === 'work' && !D.epaulet) mkCollar(torsoMat, 'fold'); // 工装夹克翻领（镇民/渔民/湿客/理骨员）
    if (D.tie) {
      const tie = mkMesh(tieGeo(), pick(Mtl('tieRed', () => new THREE.MeshStandardMaterial({ color: 0x6e1414, roughness: 0.55 }))), 0, 0, 0, 1, 1, chD);
      tie.userData.noShadow = true; this.torso.add(tie);
    }
    // 轮23：领结钉在领筒前面（领折已前开，蝶结落在开口正中不再埋进领面）
    if (D.bowtie) {
      const bt = mkMesh(bowtieGeo(), pick(Mtl('bowtieBlk', () => new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.6 }))), 0, 0.631, 0.077);
      bt.userData.noShadow = true; this.torso.add(bt);
    }
    if (D.knots) {
      this.torso.add(mkMesh(knotButtonsGeo(), pick(Mtl('knotGold', () => new THREE.MeshStandardMaterial({ color: 0xb8923e, roughness: 0.45, metalness: 0.4 }))), 0, 0, 0));
      mkCollar(torsoMat, 'band');       // 缎袄立领（盘扣领）
    }
    if (D.epaulet) {
      // 制服肩章 + 铜扣列
      const brassM = pick(Mtl('uniformBrass', () => new THREE.MeshStandardMaterial({ color: 0xb09244, roughness: 0.4, metalness: 0.6 })));
      for (const side of [-1, 1]) {
        const ep = mkMesh(G('epaulet', () => new THREE.BoxGeometry(0.1, 0.012, 0.05)), torsoMat, 0.17 * side, 0.55, 0.01);
        ep.rotation.z = -0.35 * side;
        this.torso.add(ep);
        this.torso.add(mkMesh(G('epBtn', () => new THREE.SphereGeometry(0.007, 6, 5)), brassM, 0.115 * side, 0.575, 0.02));
      }
      for (let i = 0; i < 4; i++) {
        const by = 0.46 - i * 0.11;
        this.torso.add(mkMesh(G('uBtn' + i, () => new THREE.SphereGeometry(0.008, 6, 5)), brassM, 0.012, by, (torsoRadiusAt('work', by) * 0.7 + 0.008) * chD));
      }
      // 制服领（领筒+领口厚度环+外翻领面）
      mkCollar(torsoMat, 'fold');
    }
    if (D.apron) {
      this.torso.add(mkMesh(apronGeo(), rubber, 0, 0, 0, 1, 1, 1));
    }

    // ---- 头（逐种子面孔；近距 LOD 由 updateLOD 惰性换高模） ----
    // faceVariant/photoKey 已在颈长解算处求出（轮22）
    this.faceVariant = faceVariant;
    this.P = P;
    // 生图烘焙脸皮：头皮换成照片投影材质（球面 UV 对齐眼嘴）；小件同调纯色
    const headSkin = (photoKey && M.faceMats?.[photoKey]) ? pick(M.faceMats[photoKey]) : skin;
    const lidSkin = (photoKey && M.faceLids?.[photoKey]) ? pick(M.faceLids[photoKey]) : skin;
    this.skinMat = headSkin;
    this.photoKey = photoKey ?? null;
    this.headMesh = mkMesh(headGeo(faceVariant, P, false, this.photoKey), headSkin, 0, 0.115, 0, HX, 1, HZ);
    this.headMesh.name = 'headSkin';
    this.head.add(this.headMesh);
    this.headHD = null;   // 2m 内惰性构建的高段数头模
    this._hd = false;
    this._lodT = Math.random() * 0.3;
    // 眼（轮17·黑珠眼根治）：巩膜球 + 虹膜纹理盘（色环/纤维/瞳孔）+ 角膜凸透高光
    // + 角膜定位捕捉光点——任何光照下眼里都有一粒「活」的高光；虹膜直径回到
    // 解剖比（≈眼球一半），巩膜在两眦真的露出来——纯黑玻璃珠从此非法
    // 轮24·去灯泡眼：巩膜反射再压两档（顶光/聚光下整球泛灰白=「金属珠眼」元凶）——
    // 眼睛的「湿」只留给角膜壳与捕捉光点；巩膜自己是偏暖的哑骨白
    const scleraMat = pick(Mtl('scleraWet', () => new THREE.MeshPhysicalMaterial({
      color: 0xcfc2b1, roughness: 0.46, envMapIntensity: 0.28,
      clearcoat: 0.28, clearcoatRoughness: 0.3,
    })));
    // 虹膜盘材质：贴图带色环+瞳孔；emissive 通道保留给潮光（sightjack 发光）
    const irisTint = (seed % 3 === 0) ? 0x6a4526 : 0x53341e; // 深褐/暖褐两档
    this.eyeMat = Mtl('irisTex_' + irisTint.toString(16), () => new THREE.MeshStandardMaterial({
      map: irisTexture(irisTint), transparent: true, roughness: 0.6,
      envMapIntensity: 0.3, emissive: 0x4a6a70, emissiveIntensity: 0,
      // 虹膜盘是正对相机的平面：镜面反射一大就整盘糊白（白珠眼回魂）——
      // 湿光交给角膜壳与捕捉光点，虹膜自己只出「色」
      depthWrite: false,
    })).clone();
    if (ghost) this.eyeMat.opacity = 0.5;
    const eyeG = G('eyeball', () => new THREE.SphereGeometry(0.0125, 14, 11));
    // 虹膜壳：0.5m 近景里虹膜必须「占住」睑裂——直径提到眼球 62%。
    // 关键：不能是平面盘！球面前极比平面盘心凸 2.3mm，深度测试会把盘心裁掉、
    // 只剩外缘一圈细环（历轮「白珠眼上一粒点」的真正根因）。改为贴球曲面壳：
    // 平面 UV 不动，顶点 z 压到略大于巩膜半径的球面上——虹膜整面浮出巩膜 0.1mm
    const irisG = G('irisDisc', () => {
      // 球冠段（20×8 细分）而非三角扇：单圈扇的平面片中段塌进巩膜面片里，
      // 渲成一圈黑白交替楔（虹膜被巩膜条纹状咬穿）；细分球冠全程贴合有余量
      const g = new THREE.SphereGeometry(0.0126, 20, 8, 0, Math.PI * 2, 0, 0.675);
      g.rotateX(Math.PI / 2); // 冠顶转向 +z（面前方）
      const p2 = g.attributes.position, uv2 = g.attributes.uv;
      for (let i = 0; i < p2.count; i++) {
        // 平面投影 UV：贴图按弦盘展开（与旧平面盘同一坐标约定）
        uv2.setXY(i, p2.getX(i) / 0.0156 + 0.5, p2.getY(i) / 0.0156 + 0.5);
      }
      return g;
    });
    // 角膜凸：罩在虹膜上的一层湿透壳（高光走在这层上，虹膜纹理在壳下）
    const corneaG = G('cornea', () => new THREE.SphereGeometry(0.008, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5));
    const corneaMat = pick(Mtl('corneaWet', () => new THREE.MeshPhysicalMaterial({
      // 轮24：opacity 0.1→0.05、环反射 1.1→0.5、清漆 1.0→0.7——聚光下角膜壳
      // 整面糊成灰镜=「虹膜被洗掉的金属球」另一半元凶；湿高光留一点就够
      color: 0xffffff, transparent: true, opacity: 0.05, roughness: 0.06,
      envMapIntensity: 0.5, clearcoat: 0.7, clearcoatRoughness: 0.1,
      depthWrite: false,
    })));
    // 捕捉光点：角膜上永远亮着的一粒（暗厅里眼睛也得是「湿」的——活人证据第一条）
    const glintG = G('eyeGlint', () => new THREE.CircleGeometry(0.0015, 8));
    const glintMat = pick(Mtl('eyeGlintM', () => new THREE.MeshBasicMaterial({
      color: 0xd8e4e8, transparent: true, opacity: 0.62, depthWrite: false, // 轮24：捕捉光点收敛——一粒湿光，不是车灯
    })));
    // 轮20三稿：横向摊脸——眼球随眼窝/照片同乘 1.149 外移（HX 收颅宽相抵，
    // 世界瞳距守 63-65mm）；skull 域 eyeNX 同步（除以 0.0882 换算）
    const eyeXoff = 0.0385 + P.eyeX * 0.0055;
    const eyeYoff = 0.113 + (P.eyeH - 0.5) * 0.006; // 眼睛在头高一半处（婴儿化=眼太高）
    // 轮24·去鼓眼：球径再收一档（0.86→0.81 基）——特写里眼球顶着睑缘外凸
    // =「惊恐灯泡眼」的几何来源；配合退窝 1.4mm，眼是「嵌在眶里」的
    const eyeScl = 0.81 + P.eyeS * 0.07;
    this.eyeSclY = eyeScl;
    this.eyeXoff = eyeXoff;
    // 眼球退进眼窝（z 0.0726→0.0712）——球体藏在眶缘/睑缘之内，只露睑裂那一条
    // （轮18：所有贴颅面附件的挂点随颅壳收窄同乘 HX/HZ——件不变形，只跟着面走）
    this.eyeGL = new THREE.Group(); this.eyeGL.position.set(-eyeXoff * HX, eyeYoff, 0.0712 * HZ);
    this.eyeGR = new THREE.Group(); this.eyeGR.position.set(eyeXoff * HX, eyeYoff, 0.0712 * HZ);
    this.eyeL = mkMesh(eyeG, scleraMat, 0, 0, 0, eyeScl, eyeScl, eyeScl);
    this.eyeR = mkMesh(eyeG, scleraMat, 0, 0, 0, eyeScl, eyeScl, eyeScl);
    // 虹膜壳几何自带球面 z（0.0126 球）——网格只加 0.2mm 前浮防 z-fight
    this.irisL = mkMesh(irisG, this.eyeMat, 0, 0, 0.0002 * eyeScl, eyeScl, eyeScl, eyeScl);
    this.irisR = mkMesh(irisG, this.eyeMat, 0, 0, 0.0002 * eyeScl, eyeScl, eyeScl, eyeScl);
    this.irisL.renderOrder = 1; this.irisR.renderOrder = 1;
    for (const [grp, iris] of [[this.eyeGL, this.irisL], [this.eyeGR, this.irisR]]) {
      grp.add(iris);
      const cor = mkMesh(corneaG, corneaMat, 0, 0, 0.0085 * eyeScl, eyeScl, eyeScl, 0.62 * eyeScl);
      cor.rotation.x = Math.PI / 2; // 壳顶朝前
      cor.renderOrder = 2;
      cor.userData.noShadow = true;
      grp.add(cor);
      const gl = mkMesh(glintG, glintMat, -0.0021 * eyeScl, 0.0023 * eyeScl, 0.0129 * eyeScl, 1, 1, 1);
      gl.renderOrder = 3;
      gl.userData.noShadow = true;
      grp.add(gl);
    }
    this.eyeGL.add(this.eyeL);
    this.eyeGR.add(this.eyeR);
    this.head.add(this.eyeGL, this.eyeGR);
    // 上睑接触阴影：罩在眼球前上缘的一圈软影带——眼球「压」在眼睑下面，不是并排摆着
    {
      const aoM = pick(Mtl('eyeAO', () => new THREE.MeshBasicMaterial({
        color: 0x1a100a, transparent: true, opacity: 0.15, depthWrite: false,
      })));
      const aoG = G('eyeAOBand', () => new THREE.SphereGeometry(0.0129, 20, 6, 0, Math.PI * 2, 0.66, 0.22));
      for (const s of [-1, 1]) {
        const ao = mkMesh(aoG, aoM, s * eyeXoff * HX, eyeYoff, 0.0712 * HZ, eyeScl * 1.02, eyeScl * 1.02, eyeScl * 1.02);
        ao.rotation.x = -0.5;
        ao.renderOrder = 1;
        ao.userData.noShadow = true;
        this.head.add(ao);
      }
    }
    // 眼睑：左右独立下垂量——「哪只眼皮更沉」是每个人自己的事；眨眼转的就是这两片
    // 轮23·睑裂收窄（照片档）：基础旋角 -0.72→-0.40 配合加宽壳弧（0.52π），
    // 上睑盖到虹膜上缘下 1-2mm——照片素材里的人全是半垂睑的普通邻居，
    // 旧值露出整颗虹膜+四周眼白 = 玩偶圆瞪眼的第一元凶
    // 轮24：基础旋角 -0.44→-0.37——上睑再压半档盖到虹膜上缘下 2mm，
    // 「上睑半垂的普通邻居」而非「瞪圆的玩偶」；挂点 z 随眼球退窝同移
    this.lidBaseL = -0.37 + P.droopL * 0.10;
    this.lidBaseR = -0.37 + P.droopR * 0.10;
    this.lidL = mkMesh(lidGeo(), lidSkin, -eyeXoff * HX, eyeYoff + 0.002, 0.0721 * HZ, eyeScl * 1.1, eyeScl * 1.1, eyeScl * 1.1);
    this.lidL.rotation.x = this.lidBaseL;
    this.lidR = mkMesh(lidGeo(), lidSkin, eyeXoff * HX, eyeYoff + 0.002, 0.0721 * HZ, eyeScl * 1.1, eyeScl * 1.1, eyeScl * 1.1);
    this.lidR.rotation.x = this.lidBaseR;
    // 睑缘厚度带（轮17）：上睑壳口一圈 1mm 圆环——眼皮是有「厚度」的皮盖，
    // 不是零厚度蛋壳切口；随睑一起眨（挂在睑网格下），色比睑面深半档=睑缘线
    {
      const rimG = G('lidRimBand24', () => {
        // 轮24：睑缘管径 1.0→1.4mm——眼皮是有厚度的皮盖；近景睑缘一条实在的「肉线」
        const t = new THREE.TorusGeometry(0.0135, 0.0014, 5, 20);
        t.rotateX(Math.PI / 2);           // 环面绕 y 轴（壳口纬线）
        t.translate(0, 0.0008, 0);        // 落到 0.52π 壳口纬度（轮23 随壳弧加宽下移）
        return t;
      });
      const rimM = pick(Mtl('lidRimM', () => new THREE.MeshStandardMaterial({
        color: 0x8d6a56, roughness: 0.72, envMapIntensity: 0.5,
      })));
      for (const lid of [this.lidL, this.lidR]) {
        const rim = new THREE.Mesh(rimG, rimM);
        rim.userData.noShadow = true;
        lid.add(rim);
      }
    }
    this.head.add(this.lidL, this.lidR);
    // 下睑：窄睑缘带从下前方贴住眼球（几乎不动——眨眼是上睑的事；眯眼时上抬）
    // 位置整体后收（z 0.0738→0.0720）：带体埋进眶腔，只露睑缘线
    // 轮23：随加宽带体上抬（-0.58→-0.665）——下睑缘托到虹膜下缘
    // 轮24：-0.665→-0.70 下睑缘再托高 1mm + 挂点随眼球退窝同移
    this.lidLoBase = Math.PI - 0.70;
    this.lidLoL = mkMesh(lidLoGeo(), lidSkin, -eyeXoff * HX, eyeYoff - 0.0026, 0.0706 * HZ, eyeScl * 1.03, eyeScl * 0.8, eyeScl * 1.03);
    this.lidLoL.rotation.x = this.lidLoBase;
    this.lidLoR = mkMesh(lidLoGeo(), lidSkin, eyeXoff * HX, eyeYoff - 0.0026, 0.0706 * HZ, eyeScl * 1.03, eyeScl * 0.8, eyeScl * 1.03);
    this.lidLoR.rotation.x = this.lidLoBase;
    this.head.add(this.lidLoL, this.lidLoR);
    // 睫毛：上睑缘窄弯带（贴图两端 alpha 渐隐——内外眦无贴片尖角）
    const lashMat = pick(Mtl('lashM', () => new THREE.MeshStandardMaterial({
      map: M.textures?.lash, color: 0x171310, transparent: true, alphaTest: 0.1,
      depthWrite: false, side: THREE.DoubleSide, roughness: 0.8,
    })));
    if (M.textures?.lash) {
      const lashL = mkMesh(lashGeo(), lashMat, -eyeXoff * HX, eyeYoff + 0.0058, 0.0824 * HZ, eyeScl, eyeScl, 1);
      lashL.rotation.x = -0.62;
      const lashR = mkMesh(lashGeo(), lashMat, eyeXoff * HX, eyeYoff + 0.0058, 0.0824 * HZ, -eyeScl, eyeScl, 1);
      lashR.rotation.x = -0.62;
      this.head.add(lashL, lashR);
    }
    // 眉毛：alpha 贴片逐根毛（内浓外疏）；高度/角度左右不对称，微动画挑的就是它
    const browCol = (role === 'matron' || D.face === 'old') ? 0x6e675e : 0x241a12;
    const browMat = pick(Mtl('browM_' + browCol.toString(16), () => new THREE.MeshStandardMaterial({
      map: M.textures?.brow, color: browCol, transparent: true, alphaTest: 0.1,
      depthWrite: false, side: THREE.DoubleSide, roughness: 0.75,
    })));
    const browGeoUse = M.textures?.brow ? browPatchGeo()
      : G('browBox', () => xform(new THREE.BoxGeometry(0.032, 0.0045, 0.006), 0, 0, 0));
    const browMatUse = M.textures?.brow ? browMat : hairMat;
    // 眉线落位：照片脸把 3D 眉压到照片眉的反投影线上（3D 眉叠在烘焙眉上=一副眉）；
    // 程序脸也压回眶上缘——旧值高出眼线 2cm，正是「额头上第二副眉」的元凶
    const anch = this.photoKey ? faceAnchor(this.photoKey) : null;
    const browLine = anch ? Math.min(0.016, Math.max(0.002, anch.browY)) : 0.0105;
    const browJit = anch ? 0.0015 : 0.004;
    this.browBaseY = [0.115 + browLine + (P.browTL - 0.5) * browJit, 0.115 + browLine + (P.browTR - 0.5) * browJit];
    // 眉弓骨棱前凸到 ~0.098：眉贴片跟着趴上骨棱，不许埋进皮下
    const browZ = Math.min(0.099, Math.max(0.0905, 0.0925 + (browLine - 0.006) * 0.55)) * HZ;
    this.browBaseX = [(-eyeXoff - 0.002) * HX, (eyeXoff + 0.002) * HX];
    this.browBaseRZ = [0.04 + P.browTL * 0.08, -(0.04 + P.browTR * 0.08)];
    this.browL = mkMesh(browGeoUse, browMatUse, this.browBaseX[0], this.browBaseY[0], browZ);
    this.browL.rotation.set(-0.35, 0, this.browBaseRZ[0]);
    this.browR = mkMesh(browGeoUse, browMatUse, this.browBaseX[1], this.browBaseY[1], browZ);
    this.browR.rotation.set(-0.35, 0, this.browBaseRZ[1]);
    this.browR.scale.x = -1; // 镜像贴图：两条眉共用一张毛流
    // 轮23：照片脸的眉主体在照片里（烘焙保真）——3D 眉贴片收薄收窄成「补毛层」，
    // 只负责挑眉/皱眉微动画；旧全尺寸贴片叠在照片眉上错半档=「双眉毛虫」
    if (this.photoKey) {
      this.browL.scale.set(0.82, 0.62, 1);
      this.browR.scale.set(-0.82, 0.62, 1);
    }
    this.head.add(this.browL, this.browR);
    // 鼻孔暗腔垫底：几何鼻孔凹里再嵌两粒近黑球——腔底吃不到光，孔是「通」的
    {
      const nostrilM = pick(Mtl('nostrilVoid', () => new THREE.MeshStandardMaterial({ color: 0x140c0a, roughness: 1 })));
      const nG = G('nostril', () => new THREE.SphereGeometry(0.0042, 8, 6));
      const noseW2 = 0.178 + P.noseW * 0.063; // 与变形域同一份鼻翼半宽（方向空间）
      const nY = 0.115 - 0.0415 - P.noseL * 0.003 + noseDyFor(P, this.photoKey) + 0.002; // 轮20：随鼻底下移
      for (const s of [-1, 1]) {
        const nm = mkMesh(nG, nostrilM, s * noseW2 * 0.45 * 0.089 * HX, nY, 0.0905 * HZ, 1.15, 0.6, 0.8);
        nm.rotation.x = 0.55;
        this.head.add(nm);
      }
    }
    // 嘴：独立体积唇（湿润高光）+ 口裂缝管；岗亭员的嘴是投币口
    if (D.ticketSlot) {
      const steelM = pick(Mtl('slotSteel', () => new THREE.MeshStandardMaterial({ color: 0x888c90, roughness: 0.3, metalness: 0.8 })));
      this.head.add(mkMesh(ticketSlotGeo(), steelM, 0, 0.115, 0, HX, 1, HZ));
      this.head.add(mkMesh(G('slotDark', () => new THREE.BoxGeometry(0.046, 0.006, 0.022)),
        pick(Mtl('slotVoid', () => new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: 1 }))), 0, 0.0465, 0.088 * HZ));
      // 2m 细节：面板嵌进皮肉——磨旧钢板 + 四粒十字螺钉 + 卡半枚的硬币 + 皮肉增生环
      const plateM = pick(Mtl('slotPlate', () => new THREE.MeshStandardMaterial({ color: 0x6e7276, roughness: 0.44, metalness: 0.75 })));
      const plate = mkMesh(G('slotPlateG', () => new THREE.BoxGeometry(0.072, 0.04, 0.006)), plateM, 0, 0.0465, 0.0855 * HZ);
      plate.rotation.x = -0.06;
      this.head.add(plate);
      const screwM = pick(Mtl('slotScrew', () => new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.3, metalness: 0.85 })));
      const screwG = G('slotScrewG', () => {
        const g = new THREE.CylinderGeometry(0.0032, 0.0036, 0.003, 8);
        g.rotateX(Math.PI / 2);
        return g;
      });
      for (const [sx2, sy2] of [[-0.029, 0.014], [0.029, 0.014], [-0.029, -0.014], [0.029, -0.014]]) {
        this.head.add(mkMesh(screwG, screwM, sx2 * HX, 0.0465 + sy2, 0.089 * HZ));
      }
      // 硬币：卡在缝里只进去一半——它在等下一枚
      const coinM = pick(Mtl('slotCoin', () => new THREE.MeshStandardMaterial({ color: 0xb09244, roughness: 0.35, metalness: 0.7 })));
      const coin = mkMesh(G('slotCoinG', () => new THREE.CylinderGeometry(0.0095, 0.0095, 0.0022, 14)), coinM, 0.011 * HX, 0.0467, 0.0935 * HZ);
      coin.rotation.z = 0.08;
      this.head.add(coin);
      // 皮肉增生环：皮肤从钢板四缘漫上来——面板不是戴的，是长的
      const swellG = G('slotSwell', () => {
        const g = new THREE.TorusGeometry(0.037, 0.007, 8, 16);
        g.scale(1.15, 0.72, 1);
        return g;
      });
      this.head.add(mkMesh(swellG, lidSkin, 0, 0.0465, 0.0815 * HZ)); // 半埋进吻部——皮肉是「漫」上钢板的
    } else if (photoKey && M.faceMats?.[photoKey]) {
      // 轮23·双嘴根治：照片脸的嘴 = 照片自己的嘴（烘焙保真、去光照对口区豁免 55%）。
      // 旧方案在照片唇上再叠一副带随机倾角的 3D 体积唇+口缝管——两副嘴错位叠印，
      // 近景读成「涂抹的伤口」（轮22 终审否决项）。唇的「形」由变形域唇床（真几何）
      // 承担、唇的「色/缝/纹」由照片承担——一张嘴，只有一张嘴
      this.mouthBaseTilt = 0;
      this.mouthG = null;
    } else {
      // 程序脸（无照片）：保留 3D 体积唇
      const lipCol = D.skin === 'pale' ? 0x83707a : D.skin === 'chalk' ? 0x93857c
        : D.face === 'old' ? 0x92625a : 0xa66d5f;
      const lipMat = pick(Mtl('lip_' + lipCol.toString(16), () => new THREE.MeshPhysicalMaterial({
        color: lipCol, roughness: 0.44, envMapIntensity: 1.1,
        clearcoat: 0.75, clearcoatRoughness: 0.18, // 湿润高光：唇是脸上最湿的一块
      })));
      this.mouthBaseTilt = P.mouthTilt * 0.12; // 嘴角一边耷一边翘
      this.mouthG = new THREE.Group();
      this.mouthG.position.set(0, 0.0465, 0.0775 * HZ);
      this.mouthG.rotation.z = this.mouthBaseTilt;
      this.mouthG.scale.set(1.40 * HX, 0.72, 0.62);
      this.mouthG.add(mkMesh(lipsGeo(P), lipMat));
      this.mouthG.add(mkMesh(lipSeamGeo(P),
        pick(Mtl('lipSeam', () => new THREE.MeshStandardMaterial({ color: 0x301c18, roughness: 0.9 }))),
        0, -0.0022, 0));
      this.head.add(this.mouthG);
    }
    // 发（角色可有发型池：同角色不同人不同头）——发壳与该种子的颅骨共形；
    // 壳材质开顶点色 RGBA：壳檐 alpha 羽化到头皮（发际线是「渐稀」，不是「切口」）
    const shellMat = Mtl('hairShellB_' + hairMat.uuid, () => {
      const m = hairMat.clone();
      m.vertexColors = true;
      m.transparent = true;
      // 轮18·去头盔：壳发必须哑光——烤漆高光是「泳帽壳」读感的第一元凶
      m.roughness = Math.max(m.roughness ?? 0.8, 0.93);
      m.envMapIntensity = 0.35;
      // 轮22：壳面贴平铺发绺（map+bump 同图）——壳色被逐绺明暗打碎、
      // 高光沿绺断条；「一整块均色塑料壳」从贴图层面不存在
      if (M.textures?.hairShell) {
        m.map = M.textures.hairShell;
        m.bumpMap = M.textures.hairShellBump ?? M.textures.hairShell;
        m.bumpScale = 0.6;
        // 贴图均值 ~0.78：色乘回一档，发色总亮度与旧纯色壳持平
        m.color.multiplyScalar(1.25);
      }
      return m;
    });
    const hairStyle = D.hairChoices ? D.hairChoices[seed % D.hairChoices.length] : D.hair;
    if (hairStyle && !D.cap) {
      this.head.add(mkMesh(hairGeo(hairStyle, faceVariant, P, this.photoKey), shellMat, 0, 0.115, 0, HX, 1, HZ));
    }
    // 发丝卡片：发际线/鬓角/颈窝贴 alpha 发丝 + 顶部逆光碎发——壳发边缘不再是「头盔口」
    if (M.textures?.hairStrand && !ghost) {
      const hairHex = hairMat.color?.getHex?.() ?? 0x14161a;
      // 轮22二稿：发卡族色乘 ×1.3 与壳发贴图乘色(×1.25)亮度对齐——
      // 旧卡片按原始发色直乘，在壳上读成「焦黑贴片/尖刺」而不是同一头发
      const strandM = Mtl('hairCardM_' + hairHex.toString(16), () => {
        const m = new THREE.MeshStandardMaterial({
          map: M.textures.hairStrand, color: hairHex, alphaTest: 0.24,
          side: THREE.DoubleSide, roughness: 0.6, envMapIntensity: 0.7,
        });
        m.color.multiplyScalar(1.3);
        return m;
      });
      const wispM = Mtl('hairWispM_' + hairHex.toString(16), () => {
        const m = new THREE.MeshStandardMaterial({
          map: M.textures.hairWisp, color: hairHex, alphaTest: 0.18,
          side: THREE.DoubleSide, roughness: 0.65, envMapIntensity: 0.7,
        });
        m.color.multiplyScalar(1.3);
        return m;
      });
      // 发际线绒边材质：软 alpha 混合（硬 alphaTest 的离散笔画贴裸皮=涂鸦感元凶）
      const fringeM = Mtl('hairFringeM_' + hairHex.toString(16), () => new THREE.MeshStandardMaterial({
        map: M.textures.hairFringe ?? M.textures.hairWisp, color: hairHex,
        transparent: true, alphaTest: 0.03, depthWrite: false,
        side: THREE.DoubleSide, roughness: 0.62, envMapIntensity: 0.7,
      }));
      const addCard = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, sx2 = 1) => {
        // 挂点随颅壳收窄同乘（卡片自身不变形）——碎发继续贴在缩窄后的壳面上
        const m = mkMesh(geo, mat, x * HX, 0.115 + y, z * HZ, sx2, 1, 1);
        m.rotation.set(rx, ry, rz);
        m.castShadow = false;
        this.head.add(m);
        return m;
      };
      if (!D.cap) {
        // 轮22·分层碎发卡层：三圈发绺卡瓦片式伏在壳上（单网格一次 draw）——
        // 壳的光滑轮廓被锯齿卡打散，任何角度「泳帽穹顶」剪影不再成立
        if (hairStyle) {
          const clumps = mkMesh(hairClumpCardsGeo(hairStyle, faceVariant, P), strandM, 0, 0.115, 0, HX, 1, HZ);
          clumps.castShadow = false;
          this.head.add(clumps);
        }
        // 前发际线：绒边贴图卡片（顶带近实接壳檐、向下稀疏成绒毛梢）——
        // 中央一片 + 左右两小片，硬笔画换软绒边，裸皮上不再是「涂鸦」
        // 轮23：photo 脸的发际卡沿照片发际曲线落位（与壳檐 clipHairline 同一条线）；
        // 背头(back)是「拢上去」的——垂落刘海卡非法，换贴壳倒伏的碎根卡
        const anchHL = this.photoKey ? faceAnchor(this.photoKey) : null;
        const hlAt = (x) => (anchHL ? anchHL.hairY - anchHL.hairSagK * x * x : 0.06);
        // 轮24·发际带密度×2：沿照片发际曲线布双排碎根卡（下排贴线、上排压壳檐），
        // 「发根渐密」由真卡片承担——秃带/撕纸边从此没有露出的机会
        if (hairStyle === 'back') {
          // 背头发际碎根：小卡贴着发际线向上倒伏（发是拢回去的，根部略毛）
          for (let bi = 0; bi < 9; bi++) {
            const bx = (bi - 4) * 0.0115 + (P.asym - 0.5) * 0.005;
            addCard(hairCardGeo(0.017, 0.011, 4), fringeM, bx, hlAt(bx) + 0.007 + (bi % 2) * 0.004,
              0.0765 - Math.abs(bx) * 0.16, -1.35, bx * 3.2, (P.asymPh - 0.5) * 0.15 + ((bi * 3) % 5 - 2) * 0.05);
          }
          for (let bi = 0; bi < 5; bi++) {
            const bx = (bi - 2) * 0.021 + (P.asymPh - 0.5) * 0.004;
            addCard(hairCardGeo(0.024, 0.013, 4), fringeM, bx, hlAt(bx) + 0.016, 0.0735 - Math.abs(bx) * 0.14,
              -1.2, bx * 3.0, ((bi * 7) % 5 - 2) * 0.06);
          }
        } else if (hairStyle !== 'bun') {
          addCard(hairCardGeo(0.07, 0.034, 5), fringeM, 0, hlAt(0) + 0.004, 0.0795, -0.55, 0, (P.asym - 0.5) * 0.24);
          addCard(hairCardGeo(0.042, 0.026, 6), fringeM, -0.038, hlAt(-0.038) + 0.005, 0.072, -0.55, -0.44, 0.14);
          addCard(hairCardGeo(0.042, 0.026, 6), fringeM, 0.038, hlAt(0.038) + 0.007, 0.072, -0.55, 0.44, -0.14);
          // 加密排：中央两小片错位 + 两鬓过渡片——刘海是「一绺绺」，不是三块布
          addCard(hairCardGeo(0.036, 0.024, 6), fringeM, -0.017, hlAt(-0.017) + 0.008, 0.0775, -0.62, -0.2, 0.08);
          addCard(hairCardGeo(0.036, 0.024, 6), fringeM, 0.017, hlAt(0.017) + 0.009, 0.0775, -0.62, 0.2, -0.08);
          addCard(hairCardGeo(0.03, 0.022, 6), fringeM, -0.054, hlAt(-0.054) + 0.006, 0.0645, -0.5, -0.72, 0.18);
          addCard(hairCardGeo(0.03, 0.022, 6), fringeM, 0.054, hlAt(0.054) + 0.008, 0.0645, -0.5, 0.72, -0.18);
        } else {
          // 盘发：发际线是「拢回去」的——低角度贴额扫向后（绒边，不压成刘海）
          addCard(hairCardGeo(0.055, 0.026, 5), fringeM, -0.024, 0.066, 0.074, -1.0, -0.3, 0.5);
          addCard(hairCardGeo(0.055, 0.026, 5), fringeM, 0.024, 0.066, 0.074, -1.0, 0.3, -0.5);
          addCard(hairCardGeo(0.04, 0.02, 5), fringeM, -0.048, 0.058, 0.063, -0.9, -0.7, 0.4);
          addCard(hairCardGeo(0.04, 0.02, 5), fringeM, 0.048, 0.058, 0.063, -0.9, 0.7, -0.4);
        }
        // 鬓角（贴耳前，随不对称一高一低）+ 耳后补片——
        // 轮18：下移贴耳 + 换稀疏软 wisp（硬 alphaTest 密股卡在高发际颅型上
        // 顶端会戳出壳缘、贴在裸皮上读成「黑条码」贴纸）
        addCard(hairCardGeo(0.03, 0.038, 5), wispM, -0.072, -0.004, 0.035, -0.14, -1.18, 0.1);
        addCard(hairCardGeo(0.03, 0.038, 5), wispM, 0.072, -0.002, 0.035, -0.14, 1.18, -0.1);
        addCard(hairCardGeo(0.028, 0.04, 5), wispM, -0.078, -0.014, -0.012, 0.05, -1.62, 0.12);
        addCard(hairCardGeo(0.028, 0.04, 5), wispM, 0.078, -0.012, -0.012, 0.05, 1.62, -0.12);
        // 颈窝碎发（两片错位）
        addCard(hairCardGeo(0.06, 0.055, 4), strandM, 0, -0.052, -0.078, 0.35, Math.PI, 0);
        addCard(hairCardGeo(0.05, 0.05, 5), strandM, -0.024, -0.048, -0.072, 0.3, Math.PI - 0.5, 0.1);
        // 头顶散丝重做：高密度短绒卡×12 绕颅顶两圈立根——
        // 旧方案是两片大卡打十字（0.05 高），逆光下读成「贴片玻璃」；
        // 改为短绒卡（长度减半 ~0.02，数量翻六倍）。根位走颅骨变形域精确求壳面：
        // 壳 = field(dir) × (r_orig/R)×1.02（conformSkull 同式），根部沉进壳面 1/4 卡高
        {
          const fld2 = makeSkullField(faceVariant, P, { bare: true });
          const sp2 = { x: 0, y: 0, z: 0 };
          for (let ci = 0; ci < 18; ci++) { // 轮24：12→18——顶心绒毛层加密
            const az2 = (ci / 18) * Math.PI * 2 + (ci % 2) * 0.26 + P.asymPh * 0.8;
            const el2 = 0.24 + (ci % 3) * 0.15;          // 距顶极角两圈（0.24/0.39/0.54 rad）
            const dx2 = Math.sin(el2) * Math.sin(az2), dy2 = Math.cos(el2), dz2 = Math.sin(el2) * Math.cos(az2);
            const ch2 = 0.009 + (ci % 3) * 0.002;        // 轮23：再缩 30%——只留贴壳绒毛感
            fld2(dx2, dy2, dz2, sp2);                    // 该方向的颅面点
            // 壳共形倍率：cap 球心 (0,+0.03,-0.018) 抬高了原始顶点半径——按方向重建
            const k2 = ((0.103 + 0.03 * dy2 - 0.018 * dz2) / SKULL_R) * 1.02;
            const wsp = mkMesh(hairCardGeo(0.026 + (ci % 2) * 0.008, ch2, 3), fringeM,
              (sp2.x * k2 + dx2 * ch2 * 0.25) * HX,
              0.115 + sp2.y * k2 + dy2 * ch2 * 0.25,
              (sp2.z * k2 + dz2 * ch2 * 0.25) * HZ);
            wsp.rotation.order = 'YXZ';                  // 先方位后外倾再翻根
            // 轮23：外倾再加大（0.55→0.8）——绒卡完全伏贴壳面顺毛流，剪影零尖刺
            wsp.rotation.set(el2 * 0.85 + 0.8 + ((ci * 7) % 5) * 0.04, az2, Math.PI);
            wsp.castShadow = false;
            this.head.add(wsp);
          }
        }
        // 轮23：顶心两根「不听话的长丝」删除——逆光剪影里读成「故障黑刺」，
        // 破坏轮廓的收益早被玩偶感罚没；碎发层次由贴壳短绒卡承担
        if (hairStyle === 'long') {
          // 前帘双层：内帘实（绺芯缎带+密股，贴颊，是帘的「体」）
          //           外帘散（稀股大摆，浮在内帘外 4mm，是帘的「散」）
          // 贴图沿宽分 3-4 绺、帘根压暗接壳带——绕颊内扣 + 锯齿 alpha 收梢 + 双频微摆
          const curtM = (texKey, aTest) => Mtl(`hairCurtainM_${texKey}_${hairHex.toString(16)}`, () => new THREE.MeshStandardMaterial({
            map: M.textures[texKey] ?? M.textures.hairCurtain ?? M.textures.hairStrand, color: hairHex,
            transparent: true, alphaTest: aTest, depthWrite: false,
            side: THREE.DoubleSide, roughness: 0.58, envMapIntensity: 0.7,
          }));
          const curtIn = curtM('hairCurtainIn', 0.12);
          const curtOut = curtM('hairCurtainOut', 0.05);
          this.hairCurtains = [];
          for (const s of [-1, 1]) {
            // 挂点外让 1.5mm：贴颊剖面加深后帘内缘更靠脸，根位外移保住不穿颊的安全距
            const inner = mkMesh(hairCurtainGeo(0.05, 0.21), curtIn, s * 0.0895 * HX, 0.115 + 0.018, 0.012 * HZ);
            inner.rotation.set(0.05, s * 1.32, s * -0.04);
            inner.renderOrder = 1;
            inner.userData.baseRZ = s * -0.04;
            inner.userData.swayPh = s < 0 ? 0 : 1.9; // 两侧错拍
            inner.userData.swayAmp = 0.6;            // 内帘贴颊，摆幅小
            const outer = mkMesh(hairCurtainGeo(0.057, 0.228), curtOut, s * 0.0955 * HX, 0.115 + 0.02, 0.017 * HZ);
            outer.rotation.set(0.08, s * 1.3, s * -0.07);
            outer.renderOrder = 2;
            outer.userData.baseRZ = s * -0.07;
            outer.userData.swayPh = (s < 0 ? 0.7 : 2.6); // 内外错拍
            outer.userData.swayAmp = 1.25;               // 外帘散股，摆幅大
            for (const cur of [inner, outer]) {
              cur.castShadow = false;
              this.head.add(cur);
              this.hairCurtains.push(cur);
            }
          }
          // 后帘三片——壳面高光被发丝打碎
          addCard(hairCardGeo(0.075, 0.25, 1.6), strandM, 0, -0.12, -0.112, 0.05, Math.PI, 0, 1.25);
          addCard(hairCardGeo(0.06, 0.23, 2.2), strandM, -0.068, -0.11, -0.088, 0.04, Math.PI - 0.65, 0.06, 1.15);
          addCard(hairCardGeo(0.06, 0.23, 2.2), strandM, 0.068, -0.108, -0.088, 0.04, Math.PI + 0.65, -0.06, 1.15);
          // 壳-帘接缝碎发过渡卡片：耳上鬓角处两片竖挂的碎发，骑在壳前开口缘与帘根之间——
          // 长发壳羽化边和帘顶挂点被碎发「缝」起来，侧脸看不到一条几何接缝
          for (const s of [-1, 1]) {
            addCard(hairCardGeo(0.038, 0.075, 6), strandM, s * 0.081, 0.02, 0.03, -0.14, s * 1.08, s * -0.1);
            addCard(hairCardGeo(0.032, 0.065, 6), strandM, s * 0.087, 0.008, -0.006, -0.04, s * 1.52, s * -0.08);
          }
        }
        if (hairStyle === 'bun') {
          // 髻根碎发：盘不进去的那几根
          addCard(hairCardGeo(0.04, 0.045, 4), wispM, 0, 0.005, -0.1, 0.5, Math.PI, 0);
        }
      } else {
        // 大檐帽下只露颈窝一撮
        addCard(hairCardGeo(0.055, 0.04, 4), strandM, 0, -0.05, -0.076, 0.35, Math.PI, 0);
      }
    }
    if (D.cap) {
      // 大檐帽 + 帽徽；帽下露一圈寸发（帽体/寸发都过该种子的颅骨变形域）
      this.head.add(mkMesh(hairGeo('crop', faceVariant, P, this.photoKey), shellMat, 0, 0.112, 0, HX, 0.9, HZ));
      this.head.add(mkMesh(peakedCapGeo(faceVariant, P), torsoMat, 0, 0.125, 0, HX, 1, HZ));
      this.head.add(mkMesh(G('capBadge', () => new THREE.SphereGeometry(0.011, 8, 6)),
        pick(Mtl('uniformBrass', () => new THREE.MeshStandardMaterial({ color: 0xb09244, roughness: 0.4, metalness: 0.6 }))),
        0, 0.19, 0.112 * HZ, 1, 1, 0.5));
    }
    // 斗笠（渔民可选）
    if (opts.hat) this.head.add(mkMesh(G('hat', () => new THREE.ConeGeometry(0.25, 0.12, 14)), M.wood, 0, 0.26, 0));

    // ---- 工位主异常 ----
    if (D.roeSeal) {
      // 鱼籽钙化（轮18 再收敛）：0.5m 近景旧版仍读成「嘴边粘珠」——粒径再压、
      // 球心沉进皮下 3/4、色再暗一档、去清漆湿光——远看是一线干痂，近看才是籽
      this.head.add(mkMesh(roeSealGeo(), pick(Mtl('roe', () => new THREE.MeshPhysicalMaterial({
        color: 0x74583c, roughness: 0.72, envMapIntensity: 0.45,
        clearcoat: 0.1, clearcoatRoughness: 0.5,
      }))), 0, 0.115, 0, HX, 1, HZ));
    }
    if (D.poreplate) {
      this.head.add(mkMesh(poreplateDiscGeo(), pick(M.poreplate), 0, 0.115, 0, HX, 1, HZ));
    }
    if (D.saltFrost || opts.saltFrost) {
      // 盐霜附居痕迹：按头形参数缩放贴面（晶壳长在皮上，不悬空）
      const { headW: hw, faceLen: fl } = headBase(faceVariant, P);
      const saltM = mkMesh(saltFrostGeo(seed),
        pick(M.saltFrost ?? Mtl('saltFrostFb', () => new THREE.MeshStandardMaterial({ color: 0xf2efe2, roughness: 0.55, envMapIntensity: 1.5 }))),
        0, 0.115, 0);
      saltM.scale.set(hw * HX, fl, 0.96 * HZ);
      this.head.add(saltM);
    }

    // ---- 手臂（逐种子粗细） ----
    const limbScl = 0.94 + rnd() * 0.12;
    const mkArm = (side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.194 * shW * side, 0.49 - this.gait.droop * 0.03 * side, 0);
      this.torso.add(shoulder);
      // 轮22·肩球物理根除：独立缝球（shoulderCap 椭球）删除——袖管换成
      // 「袖山圆顶+管身」一体放样（sleeveArmGeo）：肩头是袖管自己收拢的布圆顶，
      // 任何抬臂角度肩上只有袖山布面，不存在能读成球窝的独立球件剪影。
      // 袖管过肘 12mm（管-管重叠）：屈肘张口被袖管自身延伸接住
      const sleeve = mkMesh(sleeveArmGeo('sleeveArm'), torsoMat, 0, 0, 0, limbScl, 1, limbScl);
      sleeve.name = 'sleeveArm';
      shoulder.add(sleeve);
      const elbow = new THREE.Group();
      elbow.position.y = -0.3;
      shoulder.add(elbow);
      const foreMat = D.drift ? drift : D.gloves ? rubber : (D.torso === 'dress' ? skin : torsoMat);
      // 轮22·肘球物理根除：缝球（elbowCap）+开口布罩（elbowFair 管）全部废除——
      // 关节上骑一只**两端闭合**的褶皱布荚（jointPodGeo），animate 每帧转到上下臂
      // 夹角平分线：深屈从下方看不到「管口环+缝隙+内芯盘」同心圆，肘点永远是布包肘头；
      // 裙装裸臂用皮肤肘荚（鹰嘴软鼓包），胶皮手套用胶荚，浮木臂外照样套布荚（袖口布堆）
      const podMat = D.gloves ? rubber : (D.torso === 'dress' ? skin : torsoMat);
      // 轮22二稿：荚径回收到袖口径+3mm（0.047→0.044）——荚要「藏在袖里」只在
      // 屈肘时露出布鼓包；上一稿荚径超袖口 6.5mm，直臂垂放读成「戴着护肘」
      const fair = mkMesh(
        D.torso === 'dress'
          ? jointPodGeo('elbowPodSkin', { rMax: 0.0405, up: 0.072, down: 0.068, wrinkle: 0.0006 })
          : jointPodGeo('elbowPod', { rMax: 0.044, up: 0.075, down: 0.072, wrinkle: 0.002 }),
        podMat, 0, 0, 0, limbScl, 1, limbScl);
      fair.name = 'elbowPod';
      elbow.add(fair);
      if (D.drift) {
        elbow.add(mkMesh(driftLimbGeo(0.045, 0.24, 'foreDrift'), drift, 0, 0, 0));
      } else {
        // 露臂（裙装）收细到腕；衣袖收到袖口并外扩一圈——袖管不是喷漆；
        // 轮18：前臂袖褶皱环加深（抬臂近景里前臂必须读出「布」）
        elbow.add(mkMesh(
          D.torso === 'dress'
            ? limbGeo(0.041, 0.029, 0.22, 'foreArmSkin', 0.13, { peak: 0.3 })
            : limbGeo(0.041, 0.035, 0.226, 'foreArmCuff', 0.1, { peak: 0.3, cuff: 0.007, wrinkle: 0.0026 }),
          foreMat, 0, 0.008, 0, limbScl, 1, limbScl));
      }
      // 轮21：独立腕胶囊废除——v2 手网格自带入袖腕管（袖口里长出的是同一条皮），
      // 「腕口一颗球」从任何角度都不再存在
      // 手材质 = 脸/颈同一 faceNecks 皮肤族（裸臂裙装跟前臂 skin 防腕口换皮；
      // 手套角色胶皮）；浮木侍应的手也必须是活人肉手——异常只留在前臂
      const handMat = D.gloves ? rubber : (D.torso === 'dress' ? skin : neckMat);
      const flat = D.tray && side < 0;
      // 左手真镜像几何（拇指在拇指侧）；持麦者：抬臂左手用 open 屈度（对观众的
      // 掌是「张开的软手」），持麦右手用 hold 屈度（指真的裹在麦杆上，不是
      // 直指贴着杆「比划」）；理骨员持刷右手同理
      const curlKind = flat ? 'flat'
        : (D.mic && side < 0) ? 'open'
          : ((D.mic || D.brush) && side > 0) ? 'hold' : 'relax';
      const handG = side < 0 ? mirroredHandGeo(curlKind) : handGeo(curlKind);
      const hand = mkMesh(handG, handMat, 0, -0.2405, 0.002, 0.92, 0.92, 0.92);
      // 静息掌心朝腿（解剖静息位是半旋前），托盘手保持掌心向上的旧取向
      hand.rotation.y = flat ? Math.PI : (side < 0 ? 1.2 : -1.2);
      elbow.add(hand);
      return { shoulder, elbow, hand, fair };
    };
    this.armL = mkArm(-1);
    this.armR = mkArm(1);
    // 静息解剖姿：臂沿体侧微外张 + 肘微屈——垂直吊直的手臂是标本不是人
    this.armL.shoulder.rotation.z = -0.05;
    this.armR.shoulder.rotation.z = 0.05;
    this.armL.elbow.rotation.x = -0.12;
    this.armR.elbow.rotation.x = -0.12;

    // ---- 腿 ----
    const skirted = D.skirt || D.torso === 'satin';
    const mkLeg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(0.095 * side, 0.02, 0);
      this.pelvis.add(hip);
      // 裙装大腿是腿不是裤——裙摆之下露出的必须是皮肤
      const thighMat = D.skirt ? skin : pantsMat;
      hip.add(mkMesh(G('hipCap', () => new THREE.SphereGeometry(0.074, 12, 10)), thighMat, 0, 0.012, 0, limbScl, 0.72, 0.85 * limbScl));
      // 裤管过膝 15mm：管-管重叠盖住缝球，行走屈膝不再亮出球节
      //（轮17：大腿/小腿各缩 7cm——腿长回到真人比，头身 1/7.4）
      hip.add(mkMesh(
        D.skirt ? limbGeo(0.074, 0.052, 0.33, 'thighSkin', 0.06, { peak: 0.35 })
          : limbGeo(0.078, 0.054, 0.345, 'thighPants23', 0.06, { peak: 0.35, wrinkle: 0.0013 }),
        thighMat, 0, 0, 0, limbScl, 1, limbScl));
      const knee = new THREE.Group();
      knee.position.y = -0.35;
      hip.add(knee);
      // 轮22·膝球物理根除（同肘荚机制）：缝球+开口裤罩废除——两端闭合的褶皱布荚
      // 骑在膝上（updateJointFairings 对分），行走/坐姿任何屈膝角度膝点都是布包膝头；
      // 裙装裸膝用皮肤荚（髌骨软鼓包）
      // 轮22二稿：膝荚径回收到裤管径+2.5mm（0.058→0.054）——上一稿超管径 6.5mm
      // 直立时在裤管上鼓出一圈「护膝」，腿读成分段人偶腿
      const fair = mkMesh(
        D.skirt
          ? jointPodGeo('kneePodSkin', { rMax: 0.052, up: 0.078, down: 0.072, wrinkle: 0.0004 })
          : jointPodGeo('kneePod23', { rMax: 0.0565, up: 0.082, down: 0.077, wrinkle: 0.0016 }),
        D.skirt ? skin : pantsMat, 0, 0, 0, limbScl, 1, limbScl);
      fair.name = 'kneePod';
      knee.add(fair);
      // 小腿三型：裸腿(腓肠肌肌腹+细踝)/胶靴筒(近直)/裤管(微锥+裤脚外扩盖住鞋口)
      knee.add(mkMesh(
        D.skirt ? limbGeo(0.052, 0.03, 0.31, 'shinSkin', 0.18, { peak: 0.3 })
          : D.shoe === 'boot' ? limbGeo(0.052, 0.049, 0.31, 'shinBoot', 0.05, { peak: 0.3 })
            : limbGeo(0.055, 0.0435, 0.32, 'shinPants23', 0.08, { peak: 0.3, cuff: 0.007, wrinkle: 0.0015 }),
        D.skirt ? skin : (D.shoe === 'boot' ? rubber : pantsMat), 0, 0.01, 0, limbScl, 1, limbScl));
      const shoeMat = D.shoe === 'leather' ? leather : D.shoe === 'boot' ? rubber : clothShoe;
      const shoeG = D.shoe === 'leather' ? shoeGeo() : D.shoe === 'boot' ? bootGeo() : clothShoeGeo();
      const shoe = mkMesh(shoeG, shoeMat, 0, -0.33, 0.02);
      knee.add(shoe);
      return { hip, knee, shoe, fair };
    };
    this.legL = mkLeg(-1);
    this.legR = mkLeg(1);
    // 臀/裤腰 或 裙摆
    if (D.skirt) {
      // 裙摆过膝（2001 县镇的裙长）：摆下露出的是小腿肚，不是裹着裤料的假腿
      this.pelvis.add(mkMesh(G('skirt', () => {
        const g = new THREE.LatheGeometry([
          new THREE.Vector2(0.17, 0.08), new THREE.Vector2(0.185, -0.08),
          new THREE.Vector2(0.215, -0.28), new THREE.Vector2(0.25, -0.46),
        ], 24);
        g.scale(1, 1, 0.86); g.computeVertexNormals(); return g;
      }), torsoMat, 0, 0, 0));
    } else {
      this.pelvis.add(mkMesh(G('hipC', () => {
        const g = new THREE.LatheGeometry([
          new THREE.Vector2(0.155, 0.14), new THREE.Vector2(0.17, 0.04), new THREE.Vector2(0.165, -0.04), new THREE.Vector2(0.13, -0.1),
        ], 22);
        g.scale(1, 1, 0.78); g.computeVertexNormals(); return g;
      }), pantsMat, 0, 0, 0));
    }
    if (skirted && !D.skirt) {
      // 缎袄长下摆
      this.pelvis.add(mkMesh(G('aoHem', () => {
        const g = new THREE.LatheGeometry([
          new THREE.Vector2(0.2, 0.1), new THREE.Vector2(0.215, -0.06), new THREE.Vector2(0.225, -0.2),
        ], 24);
        g.scale(1, 1, 0.8); g.computeVertexNormals(); return g;
      }), torsoMat, 0, 0, 0));
    }

    // ---- 手持道具 ----
    if (D.tray) {
      // 托盘托在左手掌上（serve 姿态锁定左臂）
      this.trayG = new THREE.Group();
      this.trayG.add(mkMesh(trayGeo(), pick(M.steel ?? Mtl('traySteel', () => new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.35, metalness: 0.85 }))), 0, 0, 0));
      this.trayG.add(mkMesh(traySedimentGeo(), pick(M.sediment), 0, 0.01, 0));
      // 端平补偿：serve 姿态下肩 -0.25 + 肘 -1.62 ≈ -1.87，盘面反向转回世界水平
      this.trayG.rotation.x = 1.87;
      this.trayG.position.set(0, -0.27, 0.03);
      this.armL.elbow.add(this.trayG);
    }
    if (D.mic) {
      const micDark = pick(Mtl('micDark', () => new THREE.MeshStandardMaterial({ color: 0x232326, roughness: 0.4, metalness: 0.5 })));
      this.micG = new THREE.Group();
      this.micG.add(mkMesh(micGeo(), micDark, 0, 0, 0));
      this.micG.add(mkMesh(micCableGeo(), micDark, 0, 0, 0));
      this.micG.position.set(0, -0.26, 0.03);
      // mc 姿态下肩肘累计约 -2.5 rad，反转让麦头朝上、麦线垂向舞台
      this.micG.rotation.x = 2.42;
      this.armR.elbow.add(this.micG);
    }
    if (D.brush) {
      // 骨刷握在右手：柄沿前臂斜出、刷头朝下前方
      const brush = mkMesh(boneBrushGeo(), pick(M.woodDark), 0, -0.26, 0.05);
      brush.rotation.x = -0.5;
      this.armR.elbow.add(brush);
    }
    if (opts.lantern) {
      this.lanternG = new THREE.Group();
      const pole = mkMesh(G('lanternPole', () => new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6)), M.woodDark, 0, 0.1, 0);
      pole.rotation.z = Math.PI / 2.2;
      this.lanternG.add(pole);
      this.lanternG.add(mkMesh(G('lanternPaperC', () => new THREE.CylinderGeometry(0.11, 0.11, 0.2, 10)), M.lanternPaper, 0.22, -0.08, 0));
      this.lanternG.add(mkMesh(G('lanternRing', () => new THREE.CylinderGeometry(0.115, 0.115, 0.015, 10)), M.ironDark, 0.22, 0.03, 0));
      this.lanternG.add(mkMesh(G('lanternRing', () => new THREE.CylinderGeometry(0.115, 0.115, 0.015, 10)), M.ironDark, 0.22, -0.19, 0));
      if (opts.light !== false) {
        this.lanternLight = new THREE.PointLight(0xff8438, 7, 11, 2);
        this.lanternLight.position.set(0.22, -0.08, 0);
        this.lanternG.add(this.lanternLight);
      }
      this.lanternG.position.y = -0.27;
      this.armR.elbow.add(this.lanternG);
    }
    if (opts.tool === 'rake') {
      const tool = new THREE.Group();
      const pole = mkMesh(G('rakePole', () => new THREE.CylinderGeometry(0.02, 0.02, 1.5, 6)), M.woodDark, 0, 0, 0);
      pole.rotation.x = 0.9;
      tool.add(pole);
      tool.add(mkMesh(G('rakeHead', () => new THREE.BoxGeometry(0.5, 0.05, 0.08)), M.woodDark, 0, -0.55, 0.5));
      tool.position.y = -0.26;
      this.toolG = tool;
      this.armR.elbow.add(tool);
    }

    // 回眸客残影：头+肩的两层错位曝光
    if (ghost) {
      const echoMat = Mtl('gazeEcho', () => new THREE.MeshBasicMaterial({
        color: 0xb8c4c0, transparent: true, opacity: 0.14, depthWrite: false, fog: true,
      }));
      for (const [dy, yaw] of [[0.02, 0.35], [0.05, 0.7]]) {
        const e = mkMesh(craniumGeo(faceVariant, P), echoMat, 0, 0.115 + dy, -0.01, HX, 1, HZ);
        e.rotation.y = yaw;
        e.userData.noShadow = true;
        this.head.add(e);
      }
    }

    this.group.traverse((o) => {
      if (o.isMesh) o.castShadow = !ghost && !o.userData.noShadow;
    });

    // 动画状态
    this.phase = Math.random() * 10;
    this.alertShudder = 0;
    this.lifeT = Math.random() * 100;
    this.blinkT = 2 + Math.random() * 3;
    this.blinkPh = -1;                             // <0 未眨；≥0 眨眼进行到的秒数
    this.blinkOff = 0.035 + Math.random() * 0.055; // 右眼错拍：两只眼皮从不同时落下
    this.sacT = 0.4 + Math.random();               // 眼球扫视计时
    this.sacY = 0; this.sacP = 0; this.sacTY = 0; this.sacTP = 0;
    this.mtwT = 5 + Math.random() * 9;             // 嘴角抽动计时
    this.mtw = 0; this.mtwSide = 1;
    this.brwT = 7 + Math.random() * 10;            // 挑眉计时
    this.brw = 0; this.brwSide = 0;
    this.eyeIntensity = 0.7;
    this.twitchT = 5 + Math.random() * 7;
    this.twitch = 0;
    this.stumbleT = 2 + Math.random() * 4;
    this.stumble = 0;
    this.exF = 0; this.exS = 0; this.exN = 0;   // 表情肌：皱眉 / 眯眼 / 上唇提
    this.gazeOn = 0; this.gzY = 0; this.gzP = 0; // 近距眼球追踪（被盯感）
  }

  setEyeIntensity(v) {
    // v: 0.5 常态 → 4 警戒。潮光是「湿反光」，不是霓虹。
    this.eyeIntensity = v;
    this.eyeMat.emissiveIntensity = Math.max(0, (v - 0.5) * 0.5);
  }

  /** 近距 LOD：2m 内换高段数头模+法线细节层（滞回 2.1/2.9m 防抖）。
   *  Humanoid.viewer 由主循环/查看器每帧写入当前渲染相机位置。 */
  updateLOD() {
    if (!this.group.parent || this.opts.ghost) return; // 烘焙用临时人形/残影不参与
    const d = this.head.getWorldPosition(_lodV).distanceTo(Humanoid.viewer);
    if (!this._hd && d < 2.1) {
      if (!this.headHD) {
        this.headHD = new THREE.Mesh(headGeo(this.faceVariant, this.P, true, this.photoKey), hdSkinVariant(this.skinMat));
        this.headHD.position.copy(this.headMesh.position);
        this.headHD.scale.copy(this.headMesh.scale); // 轮18：高模同吃颅壳收窄
        this.headHD.castShadow = this.headMesh.castShadow;
        this.head.add(this.headHD);
      }
      this._hd = true;
      this.headMesh.visible = false;
      this.headHD.visible = true;
    } else if (this._hd && d > 2.9) {
      this._hd = false;
      this.headMesh.visible = true;
      this.headHD.visible = false;
    }
  }

  /**
   * 程序动画
   * @param mode 'idle'|'walk'|'chase'|'alert'|'grab'|'watch'|'sing'|
   *             'work_net'|'work_rake'|'work_pray'|
   *             'post'|'serve'|'mc'|'float'|'sit'|'backstep'
   * @param dt 帧时长  @param speed 步频系数
   */
  animate(mode, dt, speed = 1) {
    const P = this.phase;
    const Gt = this.gait;
    const lerp = (o, k, v, r = 8) => { o[k] += (v - o[k]) * Math.min(1, dt * r); };

    // ---- 近距 LOD（节流 0.25s） ----
    this._lodT -= dt;
    if (this._lodT <= 0) { this._lodT = 0.25; this.updateLOD(); }

    // ---- 常驻生命体征 ----
    this.lifeT += dt;
    // 呼吸（侍应/岗亭员/理骨员刻意几乎不呼吸——空间耐压证据）
    const breath = this.conveyor ? 0.002 : 0.011;
    this.torsoMesh.scale.z = this.torsoScl.z * (1 + Math.sin(this.lifeT * 1.7) * breath);
    // 长发前帘微摆：垂发有自己的惯性（双频错拍；纹丝不动的发帘一眼读成假发套）
    if (this.hairCurtains) {
      for (const cur of this.hairCurtains) {
        const ph = cur.userData.swayPh;
        const amp = cur.userData.swayAmp ?? 1;
        cur.rotation.z = cur.userData.baseRZ
          + (Math.sin(this.lifeT * 1.5 + ph) * 0.02 + Math.sin(this.lifeT * 2.7 + ph * 2.3) * 0.01) * amp;
      }
    }
    // ---- 被盯感（死魂曲式）：3.5m 内且在其面前时，眼球锁定观察者 ----
    // 冻结脸的酒店员工也追——脸不动、只有两颗眼球跟着你，比整脸转过来更瘆
    _gzV.copy(Humanoid.viewer);
    this.head.worldToLocal(_gzV);
    const gd = _gzV.length();
    let hasGaze = 0;
    if (gd > 0.3 && gd < 3.5 && _gzV.z > gd * 0.12) {
      hasGaze = 1;
      this.gzY = Math.max(-0.42, Math.min(0.42, Math.atan2(_gzV.x, _gzV.z)));
      this.gzP = Math.max(-0.26, Math.min(0.28, -Math.atan2(_gzV.y - 0.11, Math.hypot(_gzV.x, _gzV.z))));
    }
    this.gazeOn += (hasGaze - this.gazeOn) * Math.min(1, dt * 7);

    // ---- 表情肌（警戒=皱眉+眯眼；追击/扑抓再加上唇提）；员工冻结脸不动 ----
    const exFT = !this.conveyor && this.eyeIntensity > 1.4 ? 1 : 0;
    const exNT = !this.conveyor && (mode === 'chase' || mode === 'grab') ? 1 : 0;
    const exR = Math.min(1, dt * 5);
    this.exF += (exFT - this.exF) * exR;
    this.exS += (exFT * 0.8 - this.exS) * exR;
    this.exN += (exNT - this.exN) * exR;

    // ---- 面部微动画（酒店员工三件套全部冻结——它们的脸是「营业状态」）----
    if (!this.conveyor) {
      // 眨眼：眼睑真的落下来（左右错拍 35-90ms——同时闭合的是人偶）
      this.blinkT -= dt;
      if (this.blinkT <= 0 && this.blinkPh < 0) {
        this.blinkPh = 0;
        // 偶发连眨（活人捋干眼睛的小动作）
        this.blinkT = (Math.random() < 0.14 ? 0.28 : 2.2) + Math.random() * 3.6;
      }
      let cL = 0, cR = 0;
      if (this.blinkPh >= 0) {
        this.blinkPh += dt;
        const cl = (p) => { // 闭合曲线：70ms 合上 → 60ms 停 → 130ms 睁开
          if (p < 0) return 0;
          if (p < 0.07) return p / 0.07;
          if (p < 0.13) return 1;
          if (p < 0.26) return 1 - (p - 0.13) / 0.13;
          return 0;
        };
        cL = cl(this.blinkPh); cR = cl(this.blinkPh - this.blinkOff);
        if (this.blinkPh > 0.27 + this.blinkOff) this.blinkPh = -1;
      }
      // 眼睑 = 基础下垂 + 眯眼(表情肌) + 眨眼；下睑眯眼时上抬（睑缘真的在包眼球）
      const sq = this.exS * 0.4;
      this.lidL.rotation.x = this.lidBaseL + sq + cL * (1.0 - sq);
      this.lidR.rotation.x = this.lidBaseR + sq + cR * (1.0 - sq);
      this.lidLoL.rotation.x = this.lidLoBase + this.exS * 0.15;
      this.lidLoR.rotation.x = this.lidLoBase + this.exS * 0.15;
      this.eyeL.scale.y = this.eyeSclY * (1 - Math.max(cL * 0.82, this.exS * 0.2));
      this.eyeR.scale.y = this.eyeSclY * (1 - Math.max(cR * 0.82, this.exS * 0.2));
      // 眼球扫视：目标阶跃 + 弹道快移 + 注视微漂（警戒时死盯正前——扫视停了比动着更瘆）
      this.sacT -= dt;
      if (this.sacT <= 0) {
        if (this.eyeIntensity > 1.4) {
          this.sacTY = 0; this.sacTP = 0; this.sacT = 0.8;
        } else {
          this.sacTY = (Math.random() - 0.5) * 0.26;
          this.sacTP = (Math.random() - 0.5) * 0.1;
          this.sacT = 0.4 + Math.random() * 2.0;
        }
      }
      const sr = Math.min(1, dt * 26); // 扫视是弹道式的：快到、停住
      this.sacY += (this.sacTY - this.sacY) * sr;
      this.sacP += (this.sacTP - this.sacP) * sr;
      const drift = Math.sin(this.lifeT * 8.3) * 0.006 + Math.sin(this.lifeT * 13.7) * 0.004;
      // 近距时扫视让位给追踪：眼球钉在你脸上，微漂只剩一点
      const gw = this.gazeOn;
      this.eyeGL.rotation.y = (this.sacY + drift) * (1 - gw) + (this.gzY + drift * 0.3) * gw;
      this.eyeGR.rotation.y = (this.sacY + drift) * (1 - gw) + (this.gzY + drift * 0.3) * gw;
      this.eyeGL.rotation.x = (this.sacP + drift * 0.4) * (1 - gw) + this.gzP * gw;
      this.eyeGR.rotation.x = (this.sacP + drift * 0.4) * (1 - gw) + this.gzP * gw;
      // 嘴：上唇提（露凶）+ 嘴角单侧抽动
      if (this.mouthG) {
        this.mouthG.position.y = 0.0465 + this.exN * 0.0034; // 轮20：口裂线随纵向重排下移
        this.mouthG.rotation.x = -this.exN * 0.22;
        this.mtwT -= dt;
        if (this.mtwT <= 0) {
          this.mtwT = 6 + Math.random() * 10;
          this.mtw = 1;
          this.mtwSide = Math.random() < 0.5 ? -1 : 1;
        }
        if (this.mtw > 0) {
          this.mtw = Math.max(0, this.mtw - dt * 3.2);
          this.mouthG.rotation.z = this.mouthBaseTilt + Math.sin(this.mtw * Math.PI) * 0.08 * this.mtwSide;
        }
      }
      // 眉：皱眉（内收+内端压低）+ 单侧挑眉微动
      this.brwT -= dt;
      if (this.brwT <= 0) {
        this.brwT = 7 + Math.random() * 11;
        this.brw = 1;
        this.brwSide = Math.random() < 0.5 ? 0 : 1;
      }
      let lift = 0;
      if (this.brw > 0) {
        this.brw = Math.max(0, this.brw - dt * 2.6);
        lift = Math.sin(this.brw * Math.PI) * 0.0038;
      }
      const fr = this.exF;
      this.browL.position.x = this.browBaseX[0] + fr * 0.004;
      this.browR.position.x = this.browBaseX[1] - fr * 0.004;
      this.browL.rotation.z = this.browBaseRZ[0] + fr * 0.17;
      this.browR.rotation.z = this.browBaseRZ[1] - fr * 0.17;
      this.browL.position.y = this.browBaseY[0] - fr * 0.0052 + (this.brwSide === 0 ? lift : 0);
      this.browR.position.y = this.browBaseY[1] - fr * 0.0052 + (this.brwSide === 1 ? lift : 0);
    } else {
      // 冻结脸：只有眼球在追（营业状态的脸 + 活的眼睛）
      const gw = this.gazeOn;
      this.eyeGL.rotation.y = this.gzY * gw;
      this.eyeGR.rotation.y = this.gzY * gw;
      this.eyeGL.rotation.x = this.gzP * gw;
      this.eyeGR.rotation.x = this.gzP * gw;
    }
    // 偶发颈部微动（活人的小动作；报数员/侍应频率低到诡异）
    this.twitchT -= dt;
    if (this.twitchT <= 0) {
      this.twitchT = (this.conveyor ? 11 : 5) + Math.random() * 8;
      this.twitch = 0.3 + Math.random() * 0.25;
      this.twitchSide = Math.random() < 0.5 ? -1 : 1;
    }
    if (this.twitch > 0) {
      this.twitch = Math.max(0, this.twitch - dt * 2.2);
      this.head.rotation.z = Math.sin(this.twitch * Math.PI) * 0.1 * this.twitchSide + Gt.tilt;
    } else {
      this.head.rotation.z += (Gt.tilt - this.head.rotation.z) * Math.min(1, dt * 4);
    }

    switch (mode) {
      case 'walk': {
        if (this.conveyor) { this.animConveyor(dt, speed, 0); break; }
        this.phase += dt * 5.0 * speed * Gt.pace;
        const sw = Math.sin(this.phase);
        const lampL = 1 + Gt.limp * 0.25 * Gt.limpSide;
        const lampR = 1 - Gt.limp * 0.25 * Gt.limpSide;
        lerp(this.torso.rotation, 'x', 0.08);
        lerp(this.neck.rotation, 'x', 0.06);
        lerp(this.pelvis.position, 'y', 0.815 + Math.abs(Math.cos(this.phase)) * 0.022 - Gt.limp * 0.02);
        lerp(this.legL.hip.rotation, 'x', sw * 0.48 * lampL, 12);
        lerp(this.legR.hip.rotation, 'x', -sw * 0.48 * lampR, 12);
        lerp(this.legL.knee.rotation, 'x', Math.max(0, -sw) * 0.65 * lampL + 0.08, 12);
        lerp(this.legR.knee.rotation, 'x', Math.max(0, sw) * 0.65 * lampR + 0.08, 12);
        lerp(this.armL.shoulder.rotation, 'x', -sw * 0.32, 8);
        lerp(this.armR.shoulder.rotation, 'x', sw * 0.32, 8);
        lerp(this.armL.elbow.rotation, 'x', -0.25, 8);
        lerp(this.armR.elbow.rotation, 'x', -0.25, 8);
        lerp(this.torso.rotation, 'z', sw * 0.03 + Gt.droop * 0.06);
        break;
      }
      case 'chase': {
        if (this.conveyor) { this.animConveyor(dt, Math.max(1.35, speed * 1.3), 0.16); break; }
        this.phase += dt * 8.2 * Math.max(1, speed) * Gt.pace;
        const sw = Math.sin(this.phase);
        this.stumbleT -= dt;
        if (this.stumbleT <= 0) { this.stumbleT = 2.5 + Math.random() * 3.5; this.stumble = 0.5; }
        this.stumble = Math.max(0, this.stumble - dt * 1.8);
        const stmb = Math.sin(this.stumble * Math.PI) * 0.1;
        lerp(this.torso.rotation, 'x', 0.32 + stmb, 10);
        lerp(this.neck.rotation, 'x', -0.28, 10);
        lerp(this.legL.hip.rotation, 'x', sw * 0.8, 14);
        lerp(this.legR.hip.rotation, 'x', -sw * 0.8, 14);
        lerp(this.legL.knee.rotation, 'x', Math.max(0, -sw) * 1.05 + 0.12, 14);
        lerp(this.legR.knee.rotation, 'x', Math.max(0, sw) * 1.05 + 0.12, 14);
        lerp(this.armL.shoulder.rotation, 'x', -1.1 + sw * 0.18, 10);
        lerp(this.armR.shoulder.rotation, 'x', -1.1 - sw * 0.18, 10);
        lerp(this.armL.elbow.rotation, 'x', -0.4, 10);
        lerp(this.armR.elbow.rotation, 'x', -0.4, 10);
        lerp(this.pelvis.position, 'y', 0.795 + Math.abs(Math.cos(this.phase)) * 0.045 - stmb * 0.25);
        lerp(this.torso.rotation, 'z', sw * 0.07, 10);
        break;
      }
      case 'alert': {
        this.alertShudder += dt * 36;
        lerp(this.torso.rotation, 'x', 0.06, 10);
        lerp(this.neck.rotation, 'x', -0.12 + Math.sin(this.alertShudder) * 0.012, 14);
        lerp(this.armL.shoulder.rotation, 'x', -0.12, 10);
        lerp(this.armR.shoulder.rotation, 'x', -0.12, 10);
        lerp(this.legL.hip.rotation, 'x', 0, 10);
        lerp(this.legR.hip.rotation, 'x', 0, 10);
        lerp(this.pelvis.position, 'y', 0.84, 10);
        break;
      }
      case 'grab': {
        // 侍应=引座（欠身+摊掌），其余=前扑双手
        this.phase += dt * 6;
        if (this.role === 'waiter') {
          lerp(this.torso.rotation, 'x', 0.3, 10);
          lerp(this.neck.rotation, 'x', -0.22, 10);
          lerp(this.armR.shoulder.rotation, 'x', -1.15, 12);
          lerp(this.armR.shoulder.rotation, 'z', -0.5, 12);
          lerp(this.armR.elbow.rotation, 'x', -0.25, 12);
          lerp(this.armL.shoulder.rotation, 'x', -0.25, 12); // 托盘手仍端着（水平不洒）
          lerp(this.armL.elbow.rotation, 'x', -1.62, 12);
          lerp(this.pelvis.position, 'y', 0.805, 10);
        } else {
          lerp(this.torso.rotation, 'x', 0.5, 12);
          lerp(this.neck.rotation, 'x', -0.5, 12);
          lerp(this.armL.shoulder.rotation, 'x', -1.6 + Math.sin(P * 3) * 0.04, 14);
          lerp(this.armR.shoulder.rotation, 'x', -1.6 - Math.sin(P * 3) * 0.04, 14);
          lerp(this.armL.shoulder.rotation, 'z', 0.24, 12);
          lerp(this.armR.shoulder.rotation, 'z', -0.24, 12);
          lerp(this.armL.elbow.rotation, 'x', -0.4, 14);
          lerp(this.armR.elbow.rotation, 'x', -0.4, 14);
          lerp(this.pelvis.position, 'y', 0.855, 10);
        }
        break;
      }
      case 'post': {
        // 岗亭员/侍应待命：笔直，纹丝不动；有托盘则左臂永远端着
        this.phase += dt * 0.3;
        lerp(this.torso.rotation, 'x', 0.0, 5);
        lerp(this.neck.rotation, 'x', 0.02, 5);
        if (this.trayG) {
          lerp(this.armL.shoulder.rotation, 'x', -0.25, 5);
          lerp(this.armL.elbow.rotation, 'x', -1.62, 5);
          lerp(this.armL.shoulder.rotation, 'z', 0, 5);
        } else {
          lerp(this.armL.shoulder.rotation, 'x', 0.35, 5);
          lerp(this.armL.shoulder.rotation, 'z', 0.12, 5);
          lerp(this.armL.elbow.rotation, 'x', -0.9, 5);
        }
        lerp(this.armR.shoulder.rotation, 'x', 0.35, 5);
        lerp(this.armR.shoulder.rotation, 'z', -0.12, 5);
        lerp(this.armR.elbow.rotation, 'x', -0.9, 5);
        lerp(this.legL.hip.rotation, 'x', 0, 5);
        lerp(this.legR.hip.rotation, 'x', 0, 5);
        lerp(this.pelvis.position, 'y', 0.855, 5);
        break;
      }
      case 'serve': {
        this.animConveyor(dt, speed, 0);
        break;
      }
      case 'mc': {
        // 报数员：左手持麦贴近封死的口部；右臂周期性抬起「宣布」——声音先于手势
        this.phase += dt * 0.8;
        lerp(this.torso.rotation, 'x', 0.02, 4);
        lerp(this.neck.rotation, 'x', 0.04, 4);
        lerp(this.armR.shoulder.rotation, 'x', -1.35, 5); // 持麦臂
        lerp(this.armR.elbow.rotation, 'x', -1.15, 5);
        const announce = Math.max(0, Math.sin(this.phase * 0.5 - 1.2)) ** 3;
        lerp(this.armL.shoulder.rotation, 'x', -0.2 - announce * 1.1, 5);
        lerp(this.armL.shoulder.rotation, 'z', 0.15 + announce * 0.4, 5);
        // 轮21：宣布臂前臂抬起（肘 -0.4→-0.95）——开掌举到脸侧高度对观众，
        // 旧值手停在腰腹前读成「摸肚子」
        lerp(this.armL.elbow.rotation, 'x', -0.2 - announce * 0.75, 5);
        // 抬臂时腕部旋前——掌面转向观众（背手曲指对镜头是「探爪」读法）
        lerp(this.armL.hand.rotation, 'y', 1.2 - 0.62 * announce, 5);
        lerp(this.armL.hand.rotation, 'z', -0.5 * announce, 5);
        lerp(this.armL.hand.rotation, 'x', -0.3 * announce, 5);
        lerp(this.legL.hip.rotation, 'x', 0, 4);
        lerp(this.legR.hip.rotation, 'x', 0, 4);
        lerp(this.pelvis.position, 'y', 0.855, 4);
        break;
      }
      case 'float': {
        // 浮客：脚尖离地半寸（Y 由实体控制），足尖下压、缓慢摇摆
        this.phase += dt * 0.6;
        lerp(this.torso.rotation, 'x', 0.03, 3);
        lerp(this.neck.rotation, 'x', 0.05, 3);
        lerp(this.torso.rotation, 'z', Math.sin(P) * 0.02, 3);
        lerp(this.armL.shoulder.rotation, 'x', 0.04, 3);
        lerp(this.armR.shoulder.rotation, 'x', 0.04, 3);
        lerp(this.legL.hip.rotation, 'x', 0.02, 3);
        lerp(this.legR.hip.rotation, 'x', -0.02, 3);
        lerp(this.legL.shoe.rotation, 'x', 0.55, 3);
        lerp(this.legR.shoe.rotation, 'x', 0.55, 3);
        lerp(this.pelvis.position, 'y', 0.855 + Math.sin(P * 1.7) * 0.012, 3);
        break;
      }
      case 'sit': {
        // 入席：坐姿，双手搁膝
        lerp(this.pelvis.position, 'y', 0.56, 8);
        lerp(this.legL.hip.rotation, 'x', -1.45, 8);
        lerp(this.legR.hip.rotation, 'x', -1.45, 8);
        lerp(this.legL.knee.rotation, 'x', 1.5, 8);
        lerp(this.legR.knee.rotation, 'x', 1.5, 8);
        lerp(this.torso.rotation, 'x', 0.06, 8);
        lerp(this.neck.rotation, 'x', 0.05, 8);
        lerp(this.armL.shoulder.rotation, 'x', -0.5, 8);
        lerp(this.armR.shoulder.rotation, 'x', -0.5, 8);
        lerp(this.armL.elbow.rotation, 'x', -0.5, 8);
        lerp(this.armR.elbow.rotation, 'x', -0.5, 8);
        break;
      }
      case 'backstep': {
        // 理册婆：面朝你倒退着走，头完全不动
        this.phase += dt * 3.6 * speed;
        const sw = Math.sin(this.phase);
        lerp(this.torso.rotation, 'x', -0.02, 8);
        lerp(this.neck.rotation, 'x', 0.0, 12);
        lerp(this.legL.hip.rotation, 'x', -sw * 0.34, 10);
        lerp(this.legR.hip.rotation, 'x', sw * 0.34, 10);
        lerp(this.legL.knee.rotation, 'x', Math.max(0, sw) * 0.5 + 0.06, 10);
        lerp(this.legR.knee.rotation, 'x', Math.max(0, -sw) * 0.5 + 0.06, 10);
        lerp(this.armL.shoulder.rotation, 'x', -0.1, 6);
        lerp(this.armR.shoulder.rotation, 'x', -0.1, 6);
        lerp(this.pelvis.position, 'y', 0.82, 8);
        break;
      }
      case 'work_net': {
        this.phase += dt * 2.2;
        lerp(this.torso.rotation, 'x', 0.58 + Math.sin(P * 0.5) * 0.03);
        lerp(this.neck.rotation, 'x', 0.45);
        const pull = Math.sin(P * 2);
        lerp(this.armL.shoulder.rotation, 'x', -0.9 + pull * 0.25, 10);
        lerp(this.armR.shoulder.rotation, 'x', -0.9 - pull * 0.25, 10);
        lerp(this.armL.elbow.rotation, 'x', -1.1 - pull * 0.3, 10);
        lerp(this.armR.elbow.rotation, 'x', -1.1 + pull * 0.3, 10);
        lerp(this.legL.hip.rotation, 'x', -0.1);
        lerp(this.legR.hip.rotation, 'x', 0.08);
        lerp(this.pelvis.position, 'y', 0.755);
        break;
      }
      case 'work_rake': {
        this.phase += dt * 1.6;
        const push = Math.sin(P);
        lerp(this.torso.rotation, 'x', 0.42 + push * 0.12);
        lerp(this.neck.rotation, 'x', 0.38);
        lerp(this.armR.shoulder.rotation, 'x', -0.75 + push * 0.4, 10);
        lerp(this.armL.shoulder.rotation, 'x', -0.6 + push * 0.35, 10);
        lerp(this.armR.elbow.rotation, 'x', -0.4, 10);
        lerp(this.armL.elbow.rotation, 'x', -0.5, 10);
        lerp(this.legL.hip.rotation, 'x', push * 0.12);
        lerp(this.legR.hip.rotation, 'x', -push * 0.12);
        lerp(this.pelvis.position, 'y', 0.785);
        break;
      }
      case 'work_brush': {
        // 理骨员：贴着骨面慢刷——整个人只有右臂在动
        this.phase += dt * 1.1;
        const stroke = Math.sin(P);
        lerp(this.torso.rotation, 'x', 0.3, 5);
        lerp(this.neck.rotation, 'x', 0.22, 5);
        lerp(this.armR.shoulder.rotation, 'x', -0.85 + stroke * 0.25, 8);
        lerp(this.armR.elbow.rotation, 'x', -0.5 + stroke * 0.15, 8);
        lerp(this.armL.shoulder.rotation, 'x', 0.1, 5);
        lerp(this.armL.elbow.rotation, 'x', -0.15, 5);
        lerp(this.legL.hip.rotation, 'x', 0, 5);
        lerp(this.legR.hip.rotation, 'x', 0, 5);
        lerp(this.pelvis.position, 'y', 0.795, 5);
        break;
      }
      case 'work_pray': {
        this.phase += dt * 0.9;
        const bow = (Math.sin(P) + 1) * 0.5;
        lerp(this.torso.rotation, 'x', 0.25 + bow * 0.75, 5);
        lerp(this.neck.rotation, 'x', 0.3 + bow * 0.3, 5);
        lerp(this.armL.shoulder.rotation, 'x', -1.2 - bow * 0.3, 6);
        lerp(this.armR.shoulder.rotation, 'x', -1.2 - bow * 0.3, 6);
        lerp(this.armL.elbow.rotation, 'x', -0.9, 6);
        lerp(this.armR.elbow.rotation, 'x', -0.9, 6);
        lerp(this.pelvis.position, 'y', 0.575, 5);
        lerp(this.legL.hip.rotation, 'x', -1.2, 5);
        lerp(this.legR.hip.rotation, 'x', -1.2, 5);
        lerp(this.legL.knee.rotation, 'x', 1.9, 5);
        lerp(this.legR.knee.rotation, 'x', 1.9, 5);
        break;
      }
      case 'sing': {
        this.phase += dt * 0.7;
        lerp(this.torso.rotation, 'x', -0.06, 4);
        lerp(this.neck.rotation, 'x', -0.4, 4);
        lerp(this.torso.rotation, 'z', Math.sin(P) * 0.05, 4);
        lerp(this.armL.shoulder.rotation, 'x', -0.25, 4);
        lerp(this.armR.shoulder.rotation, 'x', -0.25, 4);
        lerp(this.armL.shoulder.rotation, 'z', 0.3 + Math.sin(P * 0.8) * 0.07, 4);
        lerp(this.armR.shoulder.rotation, 'z', -0.3 - Math.sin(P * 0.8) * 0.07, 4);
        lerp(this.legL.hip.rotation, 'x', 0, 4);
        lerp(this.legR.hip.rotation, 'x', 0, 4);
        lerp(this.pelvis.position, 'y', 0.855, 4);
        break;
      }
      case 'watch': {
        this.phase += dt * 0.3;
        lerp(this.torso.rotation, 'x', 0.03, 3);
        lerp(this.neck.rotation, 'x', -0.1, 3);
        lerp(this.torso.rotation, 'z', Math.sin(P) * 0.012, 3);
        lerp(this.armL.shoulder.rotation, 'x', 0.02, 3);
        lerp(this.armR.shoulder.rotation, 'x', 0.02, 3);
        lerp(this.legL.hip.rotation, 'x', 0, 3);
        lerp(this.legR.hip.rotation, 'x', 0, 3);
        lerp(this.pelvis.position, 'y', 0.855, 3);
        break;
      }
      default: { // idle：站姿，重心慢移
        this.phase += dt * 0.8;
        lerp(this.torso.rotation, 'x', 0.06);
        lerp(this.neck.rotation, 'x', 0.08 + Math.sin(P * 0.35) * 0.04);
        lerp(this.armL.shoulder.rotation, 'x', 0.03);
        lerp(this.armR.shoulder.rotation, 'x', 0.03);
        lerp(this.armL.elbow.rotation, 'x', -0.14);
        lerp(this.armR.elbow.rotation, 'x', -0.14);
        lerp(this.legL.hip.rotation, 'x', 0);
        lerp(this.legR.hip.rotation, 'x', 0);
        lerp(this.torso.rotation, 'z', Math.sin(P * 0.5) * 0.015 + Gt.droop * 0.04);
        lerp(this.pelvis.position, 'y', 0.825);
      }
    }
    this.updateJointFairings();
  }

  /** 肘/膝铰接袖罩每帧对分：罩管永远骑在关节夹角的平分线上——
   *  任何屈曲角度关节点都盖在布罩之内（球关节人偶的机制级根治） */
  updateJointFairings() {
    for (const a of [this.armL, this.armR]) if (a?.fair) a.fair.rotation.x = a.elbow.rotation.x * -0.5;
    for (const l of [this.legL, this.legR]) if (l?.fair) l.fair.rotation.x = l.knee.rotation.x * -0.5;
  }

  /** 侍应传送带步态：骨盆水平如轨道、小碎步、托盘绝对水平、头锁死 */
  animConveyor(dt, speed, lean) {
    const lerp = (o, k, v, r = 10) => { o[k] += (v - o[k]) * Math.min(1, dt * r); };
    this.phase += dt * 7.2 * speed;
    const sw = Math.sin(this.phase);
    lerp(this.pelvis.position, 'y', 0.82, 20);         // 无起伏
    lerp(this.torso.rotation, 'x', lean, 8);
    lerp(this.neck.rotation, 'x', -lean * 0.9, 8);      // 头保持水平锁定
    lerp(this.legL.hip.rotation, 'x', sw * 0.3, 16);
    lerp(this.legR.hip.rotation, 'x', -sw * 0.3, 16);
    lerp(this.legL.knee.rotation, 'x', Math.max(0, -sw) * 0.45 + 0.05, 16);
    lerp(this.legR.knee.rotation, 'x', Math.max(0, sw) * 0.45 + 0.05, 16);
    // 左臂端盘锁定：上臂垂、前臂抬平
    lerp(this.armL.shoulder.rotation, 'x', this.trayG ? -0.25 : 0.02, 12);
    lerp(this.armL.elbow.rotation, 'x', this.trayG ? -1.62 : -0.05, 12);
    // 右臂完全静止贴身——不摆
    lerp(this.armR.shoulder.rotation, 'x', 0.02, 12);
    lerp(this.armR.elbow.rotation, 'x', -0.05, 12);
    this.torso.rotation.z = 0;
  }

  /** 头部世界坐标（视奸相机挂点） */
  headWorldPos(target) {
    return this.head.getWorldPosition(target ?? new THREE.Vector3());
  }

  /** 轮18·渲染后世界空间人体测量（charshot 断言口）：
   *  逐顶点过 matrixWorld 实测——不是内部骨骼公式。
   *  chinY: 头皮网格世界最低点（=颏底）；collarTopY: 领口厚度环世界最高点；
   *  exposedNeck = chinY − collarTopY 即画面里裸露的那段颈；
   *  neckW/headW: 露颈带内颈裙宽 vs 头皮网格宽——「大头细管」的数值化否决口 */
  measureWorld() {
    this.group.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    const scan = (mesh, fn) => {
      const p = mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
        fn(v);
      }
    };
    let chinY = Infinity, crownY = -Infinity, hxMin = Infinity, hxMax = -Infinity;
    scan(this.headMesh, (w) => {
      if (w.y < chinY) chinY = w.y;
      if (w.y > crownY) crownY = w.y;
      if (w.x < hxMin) hxMin = w.x;
      if (w.x > hxMax) hxMax = w.x;
    });
    let collarTopY = -Infinity;
    this.torso.traverse((o) => {
      if (o.isMesh && o.name === 'collarRim') scan(o, (w) => { if (w.y > collarTopY) collarTopY = w.y; });
    });
    if (collarTopY === -Infinity) {
      // 无领角色（连衣裙）：以躯干网格中柱最高点（领口缘）代位
      const cx = this.headWorldPos(new THREE.Vector3()).x;
      scan(this.torsoMesh, (w) => { if (Math.abs(w.x - cx) < 0.035 && w.y > collarTopY) collarTopY = w.y; });
      collarTopY -= 0.02; // 领口缘是斜的，压回到锁骨位
    }
    let nMin = Infinity, nMax = -Infinity;
    const nk = this.torso.getObjectByName('neckSkirt');
    if (nk) {
      // 量颈裙「顶环」（颏下裸颈段，local y>0.095）的世界 x 跨度：
      // 世界横向 Y 带在姿态微倾时会斜切环面、只捞到 x≈0 的前后弧（宽度虚小一半），
      // 按局部顶环选点再过 matrixWorld 才是稳定的「渲染后颈宽」
      const p = nk.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) < 0.095) continue;
        v.fromBufferAttribute(p, i).applyMatrix4(nk.matrixWorld);
        if (v.x < nMin) nMin = v.x;
        if (v.x > nMax) nMax = v.x;
      }
    }
    const headW = hxMax - hxMin;
    const neckW = nMax > nMin ? nMax - nMin : 0;
    return {
      chinY, crownY, collarTopY,
      headW, neckW,
      headH: crownY - chinY,
      exposedNeck: chinY - collarTopY,
      neckHeadRatio: headW > 0 ? neckW / headW : 0,
      headWH: crownY - chinY > 0 ? headW / (crownY - chinY) : 0,
    };
  }
}

// ================= 静态人群烘焙 =================
/**
 * 把一个摆好姿势的人形烘焙成少量合并网格（按材质分组）——宴会厅满员/CRT 预现人群用。
 * 20 个活体人形 ≈ 900 draw call；20 个烘焙人形 ≈ 100。
 * @param M 材质库  @param opts Humanoid opts  @param pose (h)=>void 摆姿势（可多次调 animate 收敛）
 * @returns THREE.Group（含少量 Mesh）
 */
export function bakeFigure(M, opts, pose) {
  const h = new Humanoid(M, { ...opts, light: false });
  if (pose) pose(h);
  h.group.updateMatrixWorld(true);
  const byMat = new Map();
  h.group.traverse((o) => {
    if (!o.isMesh) return;
    // 统一为非索引几何，避免 merge 因索引属性不齐失败
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(g);
  });
  const out = new THREE.Group();
  for (const [mat, geos] of byMat) {
    // 丢弃属性不齐的（防 merge 失败）
    const ok = geos.filter((g) => g.attributes.position && g.attributes.normal);
    for (const g of ok) { if (g.attributes.uv === undefined) { const n = g.attributes.position.count; g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2)); } }
    // 顶点色补齐（颈裙 RGB / 发壳 RGBA，同材质小件没有——缺的补全白；
    // itemSize 不齐时统一升到最大（RGB→RGBA 补 alpha=1），否则 merge 失败）
    if (ok.some((g) => g.attributes.color)) {
      const csize = Math.max(...ok.map((g) => g.attributes.color?.itemSize ?? 3));
      for (const g of ok) {
        const n = g.attributes.position.count;
        const c = g.attributes.color;
        if (!c) {
          g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * csize).fill(1), csize));
        } else if (c.itemSize !== csize) {
          const arr = new Float32Array(n * csize).fill(1);
          for (let i = 0; i < n; i++) {
            for (let k = 0; k < Math.min(c.itemSize, csize); k++) arr[i * csize + k] = c.array[i * c.itemSize + k];
          }
          g.setAttribute('color', new THREE.BufferAttribute(arr, csize));
        }
      }
    }
    const mg = BufferGeometryUtils.mergeGeometries(ok, false);
    if (!mg) continue;
    const mesh = new THREE.Mesh(mg, mat);
    mesh.castShadow = true;
    out.add(mesh);
  }
  return out;
}

/** 快速摆姿势：以大 dt 反复调用 animate 使 lerp 收敛 */
export function poseAs(mode, phase = 0) {
  return (h) => {
    h.phase = phase;
    for (let i = 0; i < 4; i++) h.animate(mode, 3, 0);
    h.phase = phase;
    h.animate(mode, 0.001, 0);
  };
}
