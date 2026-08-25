// 程序化人形 v4（蚀湾）：先真实后异常 · 逐种子独特面孔
// 美术铁律：6 米外是具体的 2001 年中国人（工装/司仪西装/白衬衫黑马甲/枣红缎袄），
//           2 米内才读出「唯一主异常」。禁止方块人剪影，禁止一张脸复制粘贴。
// v4 要点：
//   头部：逐种子参数化雕刻（头宽/面长/下颌/下巴/颧骨/颊陷/眉弓/眼距/鼻唇/耳/不对称翘曲）
//   眼睛：湿润高反光巩膜+虹膜、左右眼睑不对称下垂、眨眼
//   躯干：Lathe 车削轮廓按服装换型 + 逐种子肩宽/胸厚；男性喉结、连衣裙锁骨
//   四肢：16 段车削（肌腹起伏、腕踝收细）、分指手、皮鞋/布鞋
//   工位异常：司仪(口部鱼籽钙化)、侍应(浮木颈臂+沉积托盘+传送带步态)、
//             全福婆(第三眼矿物孔板+倒退步)、岗亭员(投币口嘴+大檐帽)、
//             理骨员(胶皮围裙长手套+永久歪头听缸)、浮客(脚尖离地)、回眸客(残影)
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

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
/**
 * 雕刻头骨：从细分球体位移出真实头形（36×28 段，近景不见棱）
 * variant: 'm' 男 | 'f' 女(圆润) | 'old' 老年(消瘦) | 'gaunt' 深压失水(酒店员工)
 * P: faceParamsFrom 的形状参数
 */
function craniumGeo(variant, P) {
  return G(`cranium_${variant}_${P.key}`, () => {
    const R = 0.105;
    const g = new THREE.SphereGeometry(R, 36, 28);
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    const old = variant === 'old' || variant === 'gaunt';
    const fem = variant === 'f';
    const headW = (fem ? 0.87 : 0.85) + P.headW * 0.05;
    const faceLen = 0.96 + P.faceLen * 0.06;
    const jawT = (fem ? 0.28 : 0.23) + P.jaw * 0.09;
    const chinZ = 0.018 + P.chin * 0.016;
    const cheekAmp = 0.003 + P.cheek * 0.007 + (old ? 0.003 : 0);
    const hollowAmp = (old ? 0.007 : 0.001) + P.hollow * 0.006;
    const browAmp = (fem ? 0.002 : 0.004) + P.brow * 0.005;
    const eyeNX = 0.3 + P.eyeX * 0.14;   // 眼窝横位
    const asymAmp = P.asym * 0.005;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const nx = v.x / R, ny = v.y / R, nz = v.z / R;
      let x = v.x, y = v.y * faceLen, z = v.z;
      x *= headW;                          // 头侧收窄
      if (nz < 0) z *= 1.05 + P.headW * 0.05; // 后脑饱满
      else z *= 0.94;                      // 面部略平
      // 下颌到下巴：前下方收拢（幂次曲线——收得柔和，下巴不变锥子）
      if (ny < -0.12 && nz > -0.25) {
        const t = Math.min(1, (-ny - 0.12) / 0.88) ** 1.35;
        x *= 1 - t * jawT;
        z = z * (1 - t * 0.2) + t * chinZ;
        y *= 1.03;
      }
      const front = Math.max(0, nz);
      // 颧骨
      const cheek = Math.exp(-((ny + 0.06) ** 2) * 16 - ((Math.abs(nx) - 0.7) ** 2) * 20) * front;
      x += Math.sign(nx) * cheek * cheekAmp;
      // 颊部凹陷（老年/失水/瘦脸）
      const hollow = Math.exp(-((ny + 0.22) ** 2) * 22 - ((Math.abs(nx) - 0.45) ** 2) * 30) * front;
      x -= Math.sign(nx) * hollow * hollowAmp;
      z -= hollow * hollowAmp * 0.6;
      // 眉弓
      z += Math.exp(-((ny - 0.2) ** 2) * 55) * front * browAmp;
      // 眼窝（中心略低于头心——真人眼睛在头高一半处）
      z -= Math.exp(-((ny - 0.02) ** 2) * 80 - ((Math.abs(nx) - eyeNX) ** 2) * 55) * front * (old ? 0.012 : 0.009);
      // 太阳穴微凹
      x -= Math.sign(nx) * Math.exp(-((ny - 0.25) ** 2) * 30 - ((Math.abs(nx) - 0.85) ** 2) * 40) * 0.004;
      // 法令纹（老年更深）
      z -= Math.exp(-((Math.abs(nx) - 0.24) ** 2) * 140 - ((ny + 0.3) ** 2) * 34) * front * (old ? 0.0042 : 0.0014);
      // 不对称翘曲：整张脸沿 x 做低频偏移——没有一张活人的脸是镜像对称的
      x += front * asymAmp * Math.sin(ny * 2.6 + P.asymPh * 6.28) * R;
      z += front * asymAmp * 0.35 * Math.cos(ny * 3.1 + P.asymPh * 4.1) * R * Math.sign(nx);
      pos.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    return g;
  });
}

/** 头部集合（头骨+鼻+耳+唇）：皮肤材质一体网格，鼻唇耳全部由 P 参数化 */
function headGeo(variant, P) {
  return G(`head_${variant}_${P.key}`, () => {
    const parts = [craniumGeo(variant, P).clone()];
    const noseLen = 0.85 + P.noseL * 0.55;
    const noseW = 0.8 + P.noseW * 0.5;
    // 鼻：鼻梁 + 鼻头 + 鼻翼
    parts.push(xform(new THREE.SphereGeometry(0.012, 10, 8), 0, 0.02, 0.088 + P.noseL * 0.004, -0.24, 0, 0, 0.68 * noseW, 1.35 * noseLen, 0.85));
    parts.push(xform(new THREE.SphereGeometry(0.0125, 10, 8), 0, -0.004 - P.noseL * 0.006, 0.094 + P.noseL * 0.005, 0, 0, 0, noseW, 0.8, 1));
    parts.push(xform(new THREE.SphereGeometry(0.008, 8, 6), -0.0105 * noseW, -0.009 - P.noseL * 0.005, 0.089, 0, 0, 0, noseW, 0.85, 0.9));
    parts.push(xform(new THREE.SphereGeometry(0.008, 8, 6), 0.0105 * noseW, -0.009 - P.noseL * 0.005, 0.089, 0, 0, 0, noseW, 0.85, 0.9));
    // 耳（带不对称：左右高低差半毫米——近景才读得出的活人证据）
    const earS = 0.28 + P.earS * 0.12;
    const earDy = (P.asym - 0.5) * 0.006;
    parts.push(xform(new THREE.SphereGeometry(0.021, 10, 8), -0.082, earDy, -0.008, 0, 0, 0.15, earS, 1 + P.earS * 0.15, 0.68));
    parts.push(xform(new THREE.SphereGeometry(0.021, 10, 8), 0.082, -earDy, -0.008, 0, 0, -0.15, earS, 1 + P.earS * 0.15, 0.68));
    // 上唇/下唇（唇厚与嘴宽参数化；前移到面部表面之外，确保近景可读）
    const lipS = 0.35 + P.lip * 0.35;
    const mw = 1.05 + P.mouthW * 0.45;
    parts.push(xform(new THREE.SphereGeometry(0.016, 10, 6), 0, -0.035, 0.088, 0.1, 0, P.mouthTilt * 0.1, mw, lipS, 0.62));
    parts.push(xform(new THREE.SphereGeometry(0.014, 10, 6), 0, -0.046, 0.0855, -0.12, 0, P.mouthTilt * 0.1, mw * 0.9, lipS * 0.9, 0.6));
    // 下巴球（把尖锥兜圆）
    parts.push(xform(new THREE.SphereGeometry(0.02, 10, 8), 0, -0.068, 0.062, 0, 0, 0, 1.35, 0.95, 0.85));
    return merged(parts);
  });
}

/** 眼睑罩（半球，肤色）：给眼睛压出「疲惫的半合」 */
function lidGeo() {
  return G('lid', () => new THREE.SphereGeometry(0.0135, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.42));
}

/** 眉毛：细弯条 */
function browGeo() {
  return G('brow', () => xform(new THREE.BoxGeometry(0.032, 0.0045, 0.006), 0, 0, 0));
}

/** 发型（发际线必须露出额头——不能像头盔盖到眼睛） */
function hairGeo(style = 'crop') {
  return G('hair_' + style, () => {
    const parts = [];
    const cap = (scaleY = 1, lift = 0) => {
      // 发际线抬高：壳体后移+后仰，额头必须露出来（不能像头盔盖到眉毛）
      parts.push(xform(new THREE.SphereGeometry(0.108, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.44),
        0, 0.034 + lift, -0.02, 0.3, 0, 0, 0.89, scaleY, 0.99));
      // 后脑+颈窝补片（φ π..2π 是 -z 后半球）——缺了这块，背影读成光头戴小帽
      parts.push(xform(new THREE.SphereGeometry(0.107, 18, 10, Math.PI, Math.PI, Math.PI * 0.30, Math.PI * 0.42),
        0, 0.03 + lift, -0.012, 0.16, 0, 0, 0.9, scaleY * 1.02, 0.97));
    };
    switch (style) {
      case 'crop': { // 平头/寸头
        cap(0.96);
        break;
      }
      case 'back': { // 大背头（司仪）
        cap(1.02, 0.006);
        parts.push(xform(new THREE.SphereGeometry(0.07, 12, 8), 0, 0.06, -0.075, 0.3, 0, 0, 1.1, 0.8, 1.1));
        break;
      }
      case 'side': { // 三七分：整体壳微偏一侧（分头由轮廓不对称表达，不悬浮贴片）
        parts.push(xform(new THREE.SphereGeometry(0.108, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.44),
          -0.008, 0.034, -0.02, 0.3, 0, -0.06, 0.9, 0.95, 0.99));
        parts.push(xform(new THREE.SphereGeometry(0.107, 18, 10, Math.PI, Math.PI, Math.PI * 0.30, Math.PI * 0.42),
          0, 0.03, -0.012, 0.16, 0, 0, 0.9, 0.97, 0.97));
        break;
      }
      case 'bun': { // 盘发髻（全福婆）
        cap(0.92);
        parts.push(xform(new THREE.SphereGeometry(0.042, 12, 9), 0, 0.028, -0.1, 0, 0, 0, 1, 0.85, 1));
        break;
      }
      case 'perm': { // 烫发（2001 阿姨）
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          const rr = 0.082 + (i % 3) * 0.008;
          parts.push(xform(new THREE.SphereGeometry(0.03, 8, 6),
            Math.cos(a) * rr * 0.8, 0.062 + Math.sin(i * 2.3) * 0.018, Math.sin(a) * rr * 0.68 - 0.014));
        }
        cap(0.92);
        break;
      }
      case 'long': { // 长直发（新娘/伴娘）
        cap(0.98);
        parts.push(xform(new THREE.BoxGeometry(0.15, 0.5, 0.04), 0, -0.14, -0.095, -0.06, 0, 0));
        parts.push(xform(new THREE.BoxGeometry(0.03, 0.3, 0.03), -0.09, -0.06, 0.01, 0, 0, 0.08));
        parts.push(xform(new THREE.BoxGeometry(0.03, 0.3, 0.03), 0.09, -0.06, 0.01, 0, 0, -0.08));
        break;
      }
    }
    return merged(parts);
  });
}

/** 大檐帽（岗亭员）：帽冠 + 帽墙 + 帽檐 */
function peakedCapGeo() {
  return G('peakedCap', () => merged([
    // 帽冠（前倾扁球）
    xform(new THREE.SphereGeometry(0.115, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), 0, 0.085, -0.005, 0.1, 0, 0, 1.0, 0.62, 1.05),
    // 帽墙
    xform(new THREE.CylinderGeometry(0.112, 0.116, 0.05, 20, 1, true), 0, 0.062, -0.005),
    // 帽檐（前伸的扁弧）
    xform(new THREE.CylinderGeometry(0.12, 0.12, 0.009, 16, 1, false, -Math.PI * 0.32, Math.PI * 0.64), 0, 0.048, 0.012, -0.12, 0, 0, 1, 1, 1.15),
  ]));
}

// ================= 躯干（服装车削） =================
function torsoProfile(kind) {
  // [r, y] 自腰际(0 附近)到肩颈；躯干组局部 y: 0 → 0.62
  // 半径给窄——肩宽由 torsoGeo 的肩部高斯加宽提供，手臂必须落在躯干轮廓之外
  switch (kind) {
    case 'suit': // 西装：垫肩、下摆过臀
      return [[0.175, -0.14], [0.163, -0.04], [0.148, 0.06], [0.145, 0.16], [0.152, 0.28],
        [0.162, 0.4], [0.168, 0.48], [0.158, 0.53], [0.125, 0.575], [0.062, 0.615]];
    case 'vest': // 马甲+衬衫：收身
      return [[0.148, -0.06], [0.14, 0.02], [0.134, 0.12], [0.142, 0.26], [0.152, 0.4],
        [0.157, 0.48], [0.147, 0.53], [0.118, 0.575], [0.058, 0.615]];
    case 'satin': // 缎袄：宽厚、直筒、下摆长
      return [[0.19, -0.24], [0.186, -0.1], [0.178, 0.04], [0.174, 0.2], [0.178, 0.36],
        [0.182, 0.46], [0.168, 0.52], [0.132, 0.57], [0.068, 0.615]];
    case 'work': // 工装夹克：微鼓腹
      return [[0.168, -0.1], [0.16, -0.02], [0.154, 0.08], [0.16, 0.2], [0.163, 0.34],
        [0.166, 0.44], [0.157, 0.51], [0.122, 0.565], [0.06, 0.615]];
    case 'dress': // 连衣裙上身
      return [[0.15, -0.06], [0.135, 0.04], [0.126, 0.14], [0.134, 0.28], [0.146, 0.4],
        [0.15, 0.47], [0.14, 0.52], [0.11, 0.57], [0.054, 0.615]];
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
function torsoGeo(kind) {
  return G('torso_' + kind, () => {
    const pts = torsoProfile(kind).map(([r, y]) => new THREE.Vector2(r, y));
    const g = new THREE.LatheGeometry(pts, 30);
    // 人不是圆桶：前后压扁 + 肩部高斯横向加宽（肩比胸宽、比髋宽）
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const sh = Math.exp(-(((v.y - 0.48) / 0.09) ** 2));
      v.x *= 1 + sh * 0.3;
      v.z *= 0.7;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  });
}

/** 西装翻领（左右对称三角折面） */
function lapelGeo() {
  return G('lapel', () => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(0.075, 0.22); shape.lineTo(0.028, 0.24);
    shape.lineTo(-0.012, 0.1); shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.008, bevelEnabled: false });
    return g;
  });
}

/** 衬衫前胸 V 面（马甲/西装的白色三角） */
function shirtVGeo() {
  return G('shirtV', () => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.055, 0.24); shape.lineTo(0.055, 0.24); shape.lineTo(0.0, 0.0);
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: false });
  });
}

/** 领带 */
function tieGeo() {
  return G('tie', () => merged([
    xform(new THREE.BoxGeometry(0.045, 0.05, 0.012), 0, -0.02, 0, 0, 0, 0.6),
    xform(new THREE.BoxGeometry(0.05, 0.26, 0.01), 0, -0.18, -0.002),
    xform(new THREE.ConeGeometry(0.032, 0.05, 4), 0, -0.33, -0.002, Math.PI, Math.PI / 4, 0),
  ]));
}

/** 领结（侍应） */
function bowtieGeo() {
  return G('bowtie', () => merged([
    xform(new THREE.SphereGeometry(0.014, 8, 6), 0, 0, 0),
    xform(new THREE.BoxGeometry(0.035, 0.024, 0.012), -0.024, 0, 0, 0, 0, 0.12),
    xform(new THREE.BoxGeometry(0.035, 0.024, 0.012), 0.024, 0, 0, 0, 0, -0.12),
  ]));
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
    // 胸挡：前向弧面壳
    xform(new THREE.CylinderGeometry(0.152, 0.158, 0.28, 14, 1, true, -0.55, 1.1), 0, 0.41, 0.004, 0, 0, 0, 1, 1, 0.78),
    // 裙摆：过膝喇叭壳
    xform(new THREE.CylinderGeometry(0.162, 0.2, 0.66, 16, 1, true, -0.72, 1.44), 0, -0.06, 0.004, 0, 0, 0, 1, 1, 0.8),
    // 颈带
    xform(new THREE.CylinderGeometry(0.005, 0.005, 0.17, 6), -0.075, 0.58, 0.055, 0.45, 0, 0.55),
    xform(new THREE.CylinderGeometry(0.005, 0.005, 0.17, 6), 0.075, 0.58, 0.055, 0.45, 0, -0.55),
    // 腰带扣结（背后系带在侧腰露一点头）
    xform(new THREE.SphereGeometry(0.012, 6, 5), -0.125, 0.3, 0.02),
  ]));
}

// ================= 四肢（16 段车削：肌腹起伏 + 关节收细） =================
function limbGeo(r1, r2, len, key, bulge = 0.1) {
  return G(key, () => {
    const pts = [];
    const N = 12;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      // 肌腹（上 1/3 鼓）+ 近关节收细
      const muscle = Math.sin(Math.min(1, t * 1.6) * Math.PI) * r1 * bulge;
      const jointPinch = t > 0.85 ? (t - 0.85) / 0.15 * r2 * 0.12 : 0;
      pts.push(new THREE.Vector2(r1 + (r2 - r1) * t + muscle - jointPinch, -t * len));
    }
    const g = new THREE.LatheGeometry(pts, 16);
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

/** 手：掌+四指(两节链式相接+指节鼓包)+拇指  curl: 'relax'|'open'|'flat'
 *  指节严格首尾相接（上一节终点=下一节起点），指尖向掌心(+z)侧蜷 */
function handGeo(curl = 'relax') {
  return G('hand_' + curl, () => {
    const parts = [];
    parts.push(xform(new THREE.SphereGeometry(0.042, 12, 10), 0, -0.048, 0.004, 0.12, 0, 0, 0.85, 1.2, 0.45));
    const c1 = curl === 'open' ? 0.2 : curl === 'flat' ? 0.06 : 0.55;  // 第一节屈
    const c2 = curl === 'open' ? 0.25 : curl === 'flat' ? 0.08 : 0.7;  // 第二节屈
    for (let i = 0; i < 4; i++) {
      const x = -0.026 + i * 0.0175;
      const l1 = 0.038 - Math.abs(i - 1.4) * 0.006, l2 = 0.028;
      // 基节起点（掌缘）
      let py = -0.09, pz = 0.008;
      parts.push(xform(new THREE.SphereGeometry(0.0085, 6, 5), x, py, pz)); // 掌指指节
      // 第一节：方向 (0,-cos c1, sin c1)
      const d1y = -Math.cos(c1), d1z = Math.sin(c1);
      parts.push(xform(new THREE.CapsuleGeometry(0.008, l1, 4, 8), x, py + d1y * (l1 * 0.5 + 0.004), pz + d1z * (l1 * 0.5 + 0.004), -c1));
      py += d1y * (l1 + 0.008); pz += d1z * (l1 + 0.008);
      parts.push(xform(new THREE.SphereGeometry(0.0075, 6, 5), x, py, pz)); // 近节间关节
      // 第二节：累计屈曲
      const a2 = c1 + c2;
      const d2y = -Math.cos(a2), d2z = Math.sin(a2);
      parts.push(xform(new THREE.CapsuleGeometry(0.007, l2, 4, 8), x, py + d2y * (l2 * 0.5 + 0.003), pz + d2z * (l2 * 0.5 + 0.003), -a2));
    }
    // 拇指：从掌侧斜出
    parts.push(xform(new THREE.SphereGeometry(0.0095, 6, 5), 0.038, -0.05, 0.014));
    parts.push(xform(new THREE.CapsuleGeometry(0.0088, 0.036, 4, 8), 0.047, -0.072, 0.024, -0.5, 0, -0.55));
    return merged(parts);
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
/** 司仪：口部鱼籽状钙化封死（成串小球覆住下半脸） */
function roeSealGeo() {
  return G('roeSeal', () => {
    const parts = [];
    let s = 12345;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < 22; i++) {
      const ang = rnd() * Math.PI * 2, rad = Math.sqrt(rnd());
      const x = Math.cos(ang) * rad * 0.038;
      const y = -0.052 + Math.sin(ang) * rad * 0.03;
      const z = 0.083 + (1 - rad) * 0.012;
      parts.push(xform(new THREE.SphereGeometry(0.006 + rnd() * 0.007, 8, 6), x, y, z));
    }
    return merged(parts);
  });
}

/** 全福婆：第三眼矿物孔板（额头正中、眉心上方） */
function poreplateDiscGeo() {
  return G('poreDisc', () => {
    const g = new THREE.CylinderGeometry(0.02, 0.022, 0.008, 16);
    g.rotateX(Math.PI / 2 - 0.28);
    g.translate(0, 0.058, 0.089);
    return g;
  });
}

/** 岗亭员：投币口嘴——嘴的位置是一道钢缝（前探出面部表面，深根入头防碎片化） */
function ticketSlotGeo() {
  return G('ticketSlot', () => merged([
    xform(new THREE.BoxGeometry(0.056, 0.016, 0.02), 0, -0.038, 0.086, -0.06), // 钢框
  ]));
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
const ROLE_DEFS = {
  emcee:    { torso: 'suit', hair: 'back', face: 'gaunt', skin: 'pale', shoe: 'leather', lapel: true, tie: true, mic: true, roeSeal: true, pants: 'suit' },
  waiter:   { torso: 'vest', hair: 'crop', face: 'gaunt', skin: 'pale', shoe: 'leather', shirtV: true, bowtie: true, drift: true, tray: true, pants: 'vest' },
  matron:   { torso: 'satin', hair: 'bun', face: 'old', skin: 'skin', shoe: 'cloth', knots: true, poreplate: true, pants: 'satin' },
  guest_m:  { torso: 'suit', hairChoices: ['side', 'crop', 'back'], face: 'm', skin: 'skin', shoe: 'leather', lapel: true, tie: true, pants: 'suit' },
  guest_m2: { torso: 'work', hairChoices: ['crop', 'side'], face: 'm', skin: 'skin', shoe: 'leather', pants: 'work' },
  guest_f:  { torso: 'dress', hairChoices: ['perm', 'bun', 'long'], face: 'f', skin: 'skin', shoe: 'leather', skirt: true, clavicle: true },
  bride:    { torso: 'satin', hair: 'long', face: 'f', skin: 'skin', shoe: 'cloth', knots: true, pants: 'satin' },
  townsman: { torso: 'work', hairChoices: ['crop', 'side'], face: 'm', skin: 'skin', shoe: 'cloth', pants: 'work' },
  fisher:   { torso: 'work', hair: 'crop', face: 'old', skin: 'skin', shoe: 'cloth', pants: 'work' },
  // —— 新增小镇威胁 ——
  // 岗亭员：镇口长途站的检票员。制服笔挺，嘴是一道投币口——规则一的执行者
  booth:    { torso: 'work', hair: 'crop', cap: true, face: 'gaunt', skin: 'pale', shoe: 'leather', uniform: true, ticketSlot: true, epaulet: true, pants: 'uniform' },
  // 理骨员：海洋馆巨骸厅的看守。胶皮围裙长手套，头永远歪向展缸那侧——它在听
  osteo:    { torso: 'work', hair: 'crop', face: 'gaunt', skin: 'chalk', shoe: 'boot', apron: true, gloves: true, tiltHead: 0.3, brush: true, pants: 'work' },
};

function roleFromOpts(opts) {
  if (opts.role && ROLE_DEFS[opts.role]) return opts.role;
  // 旧接口兼容：cloth → 镇民/渔民
  if (opts.cloth === 'red') return 'bride';
  if (opts.hat || opts.tool) return 'fisher';
  return 'townsman';
}

export class Humanoid {
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
    const hairMat = pick(role === 'matron' || D.face === 'old'
      ? Mtl('hairGrey', () => new THREE.MeshStandardMaterial({ color: 0x4e4a46, roughness: 0.85 }))
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
    const hScale = (D.face === 'f' || role === 'matron' ? 0.93 : 0.97) + rnd() * 0.09;
    this.group.scale.setScalar(hScale);

    // ---- 骨架枢轴（与 v2 兼容：pelvis/torso/neck/head + 肩肘髋膝）----
    this.pelvis = new THREE.Group(); this.pelvis.position.y = 0.96; this.group.add(this.pelvis);
    this.torso = new THREE.Group(); this.torso.position.y = 0.12; this.pelvis.add(this.torso);
    const neckLen = D.drift ? 0.115 : 0.08; // 侍应的浮木颈比常人长——2 米内才会意识到
    this.neck = new THREE.Group(); this.neck.position.y = 0.58; this.torso.add(this.neck);
    this.head = new THREE.Group(); this.head.position.y = neckLen; this.neck.add(this.head);
    this.head.scale.setScalar(1.08); // 真人头身比 ~1/7.3，头偏小会读成人偶

    const mkMesh = (geo, mat, px = 0, py = 0, pz = 0, sx = 1, sy = 1, sz = 1) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.scale.set(sx, sy, sz);
      return m;
    };

    // ---- 躯干（逐种子肩宽/胸厚） ----
    const shW = 0.96 + rnd() * 0.1;   // 肩宽系数
    const chD = 0.94 + rnd() * 0.14;  // 胸厚系数
    this.torsoScl = { x: shW, z: chD };
    this.torsoMesh = mkMesh(torsoGeo(D.torso), torsoMat, 0, 0, 0, shW, 1, chD);
    this.torso.add(this.torsoMesh);
    // 颈
    if (D.drift) {
      this.torso.add(mkMesh(driftLimbGeo(0.05, neckLen + 0.08, 'neck_drift'), drift, 0, 0.62 + neckLen, 0));
    } else {
      this.torso.add(mkMesh(G('neckC', () => new THREE.CapsuleGeometry(0.052, 0.08, 6, 14)), skin, 0, 0.615, 0.006));
      // 喉结（男性；2 米内的活人证据）
      if (D.face === 'm' || D.face === 'gaunt' || D.face === 'old') {
        this.torso.add(mkMesh(G('adam', () => new THREE.SphereGeometry(0.012, 8, 6)), skin, 0, 0.635, 0.052, 0.8, 1.35, 0.7));
      }
    }
    // 锁骨（连衣裙领口露出）
    if (D.clavicle) {
      const clavG = G('clav', () => new THREE.CapsuleGeometry(0.007, 0.07, 4, 8));
      const cl = mkMesh(clavG, skin, -0.048, 0.585, 0.052); cl.rotation.set(0.25, 0, 1.28);
      const cr = mkMesh(clavG, skin, 0.048, 0.585, 0.052); cr.rotation.set(0.25, 0, -1.28);
      this.torso.add(cl, cr);
    }
    // 服装细件
    if (D.lapel) {
      const lp = mkMesh(lapelGeo(), torsoMat, -0.012, 0.28, 0.112, 1, 1, 1); lp.rotation.set(0.12, 0.25, 0.06); this.torso.add(lp);
      const rp = mkMesh(lapelGeo(), torsoMat, 0.012, 0.28, 0.112, -1, 1, 1); rp.rotation.set(0.12, -0.25, -0.06); this.torso.add(rp);
      const sv = mkMesh(shirtVGeo(), shirtMat, 0, 0.27, 0.104); sv.rotation.x = 0.1; this.torso.add(sv);
    }
    if (D.shirtV) {
      const sv = mkMesh(shirtVGeo(), shirtMat, 0, 0.27, 0.102); sv.rotation.x = 0.1; this.torso.add(sv);
      // 衬衫领
      this.torso.add(mkMesh(G('collarW', () => new THREE.CylinderGeometry(0.062, 0.075, 0.05, 14, 1, true)), shirtMat, 0, 0.57, 0.005));
    }
    if (D.tie) this.torso.add(mkMesh(tieGeo(), pick(Mtl('tieRed', () => new THREE.MeshStandardMaterial({ color: 0x6e1414, roughness: 0.55 }))), 0, 0.52, 0.112));
    if (D.bowtie) this.torso.add(mkMesh(bowtieGeo(), pick(Mtl('bowtieBlk', () => new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.6 }))), 0, 0.535, 0.106));
    if (D.knots) {
      this.torso.add(mkMesh(knotButtonsGeo(), pick(Mtl('knotGold', () => new THREE.MeshStandardMaterial({ color: 0xb8923e, roughness: 0.45, metalness: 0.4 }))), 0, 0, 0));
      this.torso.add(mkMesh(G('collarStand', () => new THREE.CylinderGeometry(0.06, 0.068, 0.06, 14, 1, true)), torsoMat, 0, 0.585, 0.004));
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
      // 立领
      this.torso.add(mkMesh(G('uCollar', () => new THREE.CylinderGeometry(0.058, 0.066, 0.05, 14, 1, true)), torsoMat, 0, 0.585, 0.004));
    }
    if (D.apron) {
      this.torso.add(mkMesh(apronGeo(), rubber, 0, 0, 0, 1, 1, 1));
    }

    // ---- 头（逐种子面孔） ----
    const faceVariant = D.face === 'gaunt' ? 'gaunt' : D.face === 'old' ? 'old' : D.face;
    const headMesh = mkMesh(headGeo(faceVariant, P), skin, 0, 0.115, 0);
    this.head.add(headMesh);
    // 眼（湿润巩膜+瞳，可发潮光）+ 眼睑（左右不对称下垂）+ 眉
    const scleraMat = pick(Mtl('scleraWet', () => new THREE.MeshStandardMaterial({
      color: 0xd6cfc0, roughness: 0.12, envMapIntensity: 2.0,
    })));
    this.eyeMat = Mtl('irisBase', () => new THREE.MeshStandardMaterial({
      color: 0x231c16, roughness: 0.06, envMapIntensity: 2.4,
      emissive: 0x4a6a70, emissiveIntensity: 0,
    })).clone();
    if (ghost) { this.eyeMat.transparent = true; this.eyeMat.opacity = 0.5; }
    const eyeG = G('eyeball', () => new THREE.SphereGeometry(0.0125, 10, 8));
    const irisG = G('iris', () => new THREE.SphereGeometry(0.0062, 8, 6));
    const eyeXoff = 0.028 + P.eyeX * 0.009;
    const eyeYoff = 0.113 + (P.eyeH - 0.5) * 0.006; // 眼睛在头高一半处（婴儿化=眼太高）
    const eyeScl = 0.94 + P.eyeS * 0.18;
    this.eyeL = mkMesh(eyeG, scleraMat, -eyeXoff, eyeYoff, 0.08, eyeScl, eyeScl, eyeScl);
    this.eyeR = mkMesh(eyeG, scleraMat, eyeXoff, eyeYoff, 0.08, eyeScl, eyeScl, eyeScl);
    this.irisL = mkMesh(irisG, this.eyeMat, -eyeXoff, eyeYoff, 0.08 + 0.0102 * eyeScl);
    this.irisR = mkMesh(irisG, this.eyeMat, eyeXoff, eyeYoff, 0.08 + 0.0102 * eyeScl);
    this.head.add(this.eyeL, this.eyeR, this.irisL, this.irisR);
    // 眼睑：左右独立下垂量——「哪只眼皮更沉」是每个人自己的事
    const lidL = mkMesh(lidGeo(), skin, -eyeXoff, eyeYoff + 0.002, 0.0805, eyeScl * 1.1, eyeScl * 1.1, eyeScl * 1.1);
    lidL.rotation.x = -0.95 + P.droopL * 0.3;
    const lidR = mkMesh(lidGeo(), skin, eyeXoff, eyeYoff + 0.002, 0.0805, eyeScl * 1.1, eyeScl * 1.1, eyeScl * 1.1);
    lidR.rotation.x = -0.95 + P.droopR * 0.3;
    this.head.add(lidL, lidR);
    // 眉毛：高度/角度左右不对称（前移贴住眉弓表面）
    const browL = mkMesh(browGeo(), hairMat, -eyeXoff - 0.002, 0.135 + P.browTL * 0.005, 0.093);
    browL.rotation.set(-0.3, 0, 0.04 + P.browTL * 0.1);
    const browR = mkMesh(browGeo(), hairMat, eyeXoff + 0.002, 0.135 + P.browTR * 0.005, 0.093);
    browR.rotation.set(-0.3, 0, -(0.04 + P.browTR * 0.1));
    this.head.add(browL, browR);
    // 嘴线（薄暗条，微张即消失在阴影里）；岗亭员的嘴是投币口
    if (D.ticketSlot) {
      const steelM = pick(Mtl('slotSteel', () => new THREE.MeshStandardMaterial({ color: 0x888c90, roughness: 0.3, metalness: 0.8 })));
      this.head.add(mkMesh(ticketSlotGeo(), steelM, 0, 0.115, 0));
      this.head.add(mkMesh(G('slotDark', () => new THREE.BoxGeometry(0.046, 0.006, 0.022)),
        pick(Mtl('slotVoid', () => new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: 1 }))), 0, 0.077, 0.088));
    } else if (!D.roeSeal) {
      // 嘴缝：唇间的暗线（根扎进头里、缝头刚好停在唇面之下——是缝不是板）
      const mouth = mkMesh(G('mouthLine', () => new THREE.BoxGeometry(0.04, 0.003, 0.012)),
        pick(Mtl('mouthDark', () => new THREE.MeshStandardMaterial({ color: 0x3a2420, roughness: 0.8 }))),
        0, 0.0745, 0.089, 1.0 + P.mouthW * 0.35, 1, 1);
      mouth.rotation.z = P.mouthTilt * 0.12; // 嘴角一边耷一边翘
      this.head.add(mouth);
    }
    // 发（角色可有发型池：同角色不同人不同头）
    const hairStyle = D.hairChoices ? D.hairChoices[seed % D.hairChoices.length] : D.hair;
    if (hairStyle && !D.cap) {
      this.head.add(mkMesh(hairGeo(hairStyle), hairMat, 0, 0.115, 0));
    }
    if (D.cap) {
      // 大檐帽 + 帽徽；帽下露一圈寸发
      this.head.add(mkMesh(hairGeo('crop'), hairMat, 0, 0.112, 0, 1, 0.9, 1));
      this.head.add(mkMesh(peakedCapGeo(), torsoMat, 0, 0.125, 0));
      this.head.add(mkMesh(G('capBadge', () => new THREE.SphereGeometry(0.011, 8, 6)),
        pick(Mtl('uniformBrass', () => new THREE.MeshStandardMaterial({ color: 0xb09244, roughness: 0.4, metalness: 0.6 }))),
        0, 0.19, 0.112, 1, 1, 0.5));
    }
    // 斗笠（渔民可选）
    if (opts.hat) this.head.add(mkMesh(G('hat', () => new THREE.ConeGeometry(0.25, 0.12, 14)), M.wood, 0, 0.26, 0));

    // ---- 工位主异常 ----
    if (D.roeSeal) {
      this.head.add(mkMesh(roeSealGeo(), pick(Mtl('roe', () => new THREE.MeshStandardMaterial({
        color: 0xd8c9a2, roughness: 0.24, envMapIntensity: 1.5,
      }))), 0, 0.115, 0));
    }
    if (D.poreplate) {
      this.head.add(mkMesh(poreplateDiscGeo(), pick(M.poreplate), 0, 0.115, 0));
    }

    // ---- 手臂（逐种子粗细） ----
    const limbScl = 0.94 + rnd() * 0.12;
    const mkArm = (side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.198 * shW * side, 0.49 - this.gait.droop * 0.03 * side, 0);
      this.torso.add(shoulder);
      // 肩头填缝球（衣料包住关节，藏进肩线内，不冒头）
      shoulder.add(mkMesh(G('shoulderCap', () => new THREE.SphereGeometry(0.047, 12, 10)), torsoMat, -0.008 * side, -0.002, 0, limbScl, 0.78, 0.85 * limbScl));
      shoulder.add(mkMesh(limbGeo(0.052, 0.042, 0.3, 'upperArm', 0.12), torsoMat, 0, 0, 0, limbScl, 1, limbScl));
      const elbow = new THREE.Group();
      elbow.position.y = -0.3;
      shoulder.add(elbow);
      const foreMat = D.drift ? drift : D.gloves ? rubber : (D.torso === 'dress' ? skin : torsoMat);
      elbow.add(mkMesh(G('elbowCap', () => new THREE.SphereGeometry(0.04, 10, 8)), foreMat, 0, 0.005, 0, limbScl, 1, limbScl));
      if (D.drift) {
        elbow.add(mkMesh(driftLimbGeo(0.045, 0.24, 'foreDrift'), drift, 0, 0, 0));
      } else {
        elbow.add(mkMesh(limbGeo(0.045, 0.036, 0.22, 'foreArm', 0.14), foreMat, 0, 0, 0, limbScl, 1, limbScl));
        // 袖口露腕（手套角色腕部也是胶皮）
        elbow.add(mkMesh(G('wrist', () => new THREE.CapsuleGeometry(0.03, 0.05, 4, 10)), D.gloves ? rubber : skin, 0, -0.24, 0));
      }
      const handMat = D.drift ? drift : D.gloves ? rubber : skin;
      const hand = mkMesh(handGeo(D.tray && side < 0 ? 'flat' : 'relax'), handMat, 0, -0.252, 0.004);
      if (side < 0) hand.rotation.y = Math.PI;
      elbow.add(hand);
      return { shoulder, elbow, hand };
    };
    this.armL = mkArm(-1);
    this.armR = mkArm(1);

    // ---- 腿 ----
    const skirted = D.skirt || D.torso === 'satin';
    const mkLeg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(0.095 * side, 0.02, 0);
      this.pelvis.add(hip);
      hip.add(mkMesh(G('hipCap', () => new THREE.SphereGeometry(0.068, 12, 10)), pantsMat, 0, 0.01, 0, limbScl, 0.8, 0.9 * limbScl));
      hip.add(mkMesh(limbGeo(0.078, 0.058, 0.4, 'thigh', 0.08), pantsMat, 0, 0, 0, limbScl, 1, limbScl));
      const knee = new THREE.Group();
      knee.position.y = -0.42;
      hip.add(knee);
      knee.add(mkMesh(G('kneeCap', () => new THREE.SphereGeometry(0.05, 11, 9)), D.skirt ? skin : pantsMat, 0, 0.01, 0, limbScl, 1, limbScl));
      // 小腿：腓肠肌肌腹 + 踝部收细
      knee.add(mkMesh(limbGeo(0.055, 0.032, 0.38, 'shin', 0.22), D.skirt ? skin : (D.shoe === 'boot' ? rubber : pantsMat), 0, 0, 0, limbScl, 1, limbScl));
      const shoeMat = D.shoe === 'leather' ? leather : D.shoe === 'boot' ? rubber : clothShoe;
      const shoeG = D.shoe === 'leather' ? shoeGeo() : D.shoe === 'boot' ? bootGeo() : clothShoeGeo();
      const shoe = mkMesh(shoeG, shoeMat, 0, -0.4, 0.02);
      knee.add(shoe);
      return { hip, knee, shoe };
    };
    this.legL = mkLeg(-1);
    this.legR = mkLeg(1);
    // 臀/裤腰 或 裙摆
    if (D.skirt) {
      this.pelvis.add(mkMesh(G('skirt', () => {
        const g = new THREE.LatheGeometry([
          new THREE.Vector2(0.17, 0.08), new THREE.Vector2(0.19, -0.1), new THREE.Vector2(0.23, -0.34),
        ], 24);
        g.scale(1, 1, 0.8); g.computeVertexNormals(); return g;
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
        const e = mkMesh(craniumGeo(faceVariant, P), echoMat, 0, 0.115 + dy, -0.01);
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
    this.blink = 0;
    this.twitchT = 5 + Math.random() * 7;
    this.twitch = 0;
    this.stumbleT = 2 + Math.random() * 4;
    this.stumble = 0;
  }

  setEyeIntensity(v) {
    // v: 0.5 常态 → 4 警戒。潮光是「湿反光」，不是霓虹。
    this.eyeMat.emissiveIntensity = Math.max(0, (v - 0.5) * 0.5);
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

    // ---- 常驻生命体征 ----
    this.lifeT += dt;
    // 呼吸（侍应/岗亭员/理骨员刻意几乎不呼吸——空间耐压证据）
    const breath = this.conveyor ? 0.002 : 0.011;
    this.torsoMesh.scale.z = this.torsoScl.z * (1 + Math.sin(this.lifeT * 1.7) * breath);
    // 眨眼（侍应从不眨）
    if (!this.conveyor) {
      this.blinkT -= dt;
      if (this.blinkT <= 0) { this.blinkT = 2.4 + Math.random() * 4; this.blink = 1; }
      this.blink = Math.max(0, this.blink - dt * 9);
      const sy = this.blink > 0.5 ? 0.12 : 1;
      this.eyeL.scale.y = sy; this.eyeR.scale.y = sy;
    }
    // 偶发颈部微动（活人的小动作；司仪/侍应频率低到诡异）
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
        lerp(this.pelvis.position, 'y', 0.96 + Math.abs(Math.cos(this.phase)) * 0.022 - Gt.limp * 0.02);
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
        lerp(this.pelvis.position, 'y', 0.94 + Math.abs(Math.cos(this.phase)) * 0.045 - stmb * 0.25);
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
        lerp(this.pelvis.position, 'y', 0.985, 10);
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
          lerp(this.pelvis.position, 'y', 0.95, 10);
        } else {
          lerp(this.torso.rotation, 'x', 0.5, 12);
          lerp(this.neck.rotation, 'x', -0.5, 12);
          lerp(this.armL.shoulder.rotation, 'x', -1.6 + Math.sin(P * 3) * 0.04, 14);
          lerp(this.armR.shoulder.rotation, 'x', -1.6 - Math.sin(P * 3) * 0.04, 14);
          lerp(this.armL.shoulder.rotation, 'z', 0.24, 12);
          lerp(this.armR.shoulder.rotation, 'z', -0.24, 12);
          lerp(this.armL.elbow.rotation, 'x', -0.4, 14);
          lerp(this.armR.elbow.rotation, 'x', -0.4, 14);
          lerp(this.pelvis.position, 'y', 1.0, 10);
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
        lerp(this.pelvis.position, 'y', 1.0, 5);
        break;
      }
      case 'serve': {
        this.animConveyor(dt, speed, 0);
        break;
      }
      case 'mc': {
        // 司仪：左手持麦贴近封死的口部；右臂周期性抬起「宣布」——声音先于手势
        this.phase += dt * 0.8;
        lerp(this.torso.rotation, 'x', 0.02, 4);
        lerp(this.neck.rotation, 'x', 0.04, 4);
        lerp(this.armR.shoulder.rotation, 'x', -1.35, 5); // 持麦臂
        lerp(this.armR.elbow.rotation, 'x', -1.15, 5);
        const announce = Math.max(0, Math.sin(this.phase * 0.5 - 1.2)) ** 3;
        lerp(this.armL.shoulder.rotation, 'x', -0.2 - announce * 1.1, 5);
        lerp(this.armL.shoulder.rotation, 'z', 0.15 + announce * 0.4, 5);
        lerp(this.armL.elbow.rotation, 'x', -0.2 - announce * 0.2, 5);
        lerp(this.legL.hip.rotation, 'x', 0, 4);
        lerp(this.legR.hip.rotation, 'x', 0, 4);
        lerp(this.pelvis.position, 'y', 1.0, 4);
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
        lerp(this.pelvis.position, 'y', 0.985 + Math.sin(P * 1.7) * 0.012, 3);
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
        // 全福婆：面朝你倒退着走，头完全不动
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
        lerp(this.pelvis.position, 'y', 0.965, 8);
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
        lerp(this.pelvis.position, 'y', 0.9);
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
        lerp(this.pelvis.position, 'y', 0.93);
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
        lerp(this.pelvis.position, 'y', 0.94, 5);
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
        lerp(this.pelvis.position, 'y', 0.72, 5);
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
        lerp(this.pelvis.position, 'y', 1.0, 4);
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
        lerp(this.pelvis.position, 'y', 1.0, 3);
        break;
      }
      default: { // idle：站姿，重心慢移
        this.phase += dt * 0.8;
        lerp(this.torso.rotation, 'x', 0.06);
        lerp(this.neck.rotation, 'x', 0.08 + Math.sin(P * 0.35) * 0.04);
        lerp(this.armL.shoulder.rotation, 'x', 0.03);
        lerp(this.armR.shoulder.rotation, 'x', 0.03);
        lerp(this.armL.elbow.rotation, 'x', -0.08);
        lerp(this.armR.elbow.rotation, 'x', -0.08);
        lerp(this.legL.hip.rotation, 'x', 0);
        lerp(this.legR.hip.rotation, 'x', 0);
        lerp(this.torso.rotation, 'z', Math.sin(P * 0.5) * 0.015 + Gt.droop * 0.04);
        lerp(this.pelvis.position, 'y', 0.97);
      }
    }
  }

  /** 侍应传送带步态：骨盆水平如轨道、小碎步、托盘绝对水平、头锁死 */
  animConveyor(dt, speed, lean) {
    const lerp = (o, k, v, r = 10) => { o[k] += (v - o[k]) * Math.min(1, dt * r); };
    this.phase += dt * 7.2 * speed;
    const sw = Math.sin(this.phase);
    lerp(this.pelvis.position, 'y', 0.965, 20);        // 无起伏
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
