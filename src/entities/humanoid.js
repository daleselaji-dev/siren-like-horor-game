// 程序化人形 v3（蚀湾）：先真实后异常
// 美术铁律：6 米外是具体的 2001 年中国人（工装/司仪西装/白衬衫黑马甲/枣红缎袄），
//           2 米内才读出「唯一主异常」。禁止方块人剪影。
// 头部：雕刻球体（眉弓/眼窝/颧骨/下颌收拢）+ 鼻/耳/眼睑/眉毛合并网格
// 躯干：Lathe 车削轮廓（前后压扁），按服装（西装/马甲/缎袄/工装/连衣裙）换型
// 四肢：胶囊体 + 皮鞋/布鞋；手 = 掌 + 分指
// 工位异常：司仪(口部鱼籽钙化+麦线)、侍应(浮木颈臂+沉积托盘+传送带步态)、
//           全福婆(第三眼矿物孔板+倒退步)、浮客(脚尖离地)、回眸客(多重曝光残影)
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

// ================= 头部雕刻 =================
/**
 * 雕刻头骨：从细分球体位移出真实头形
 * variant: 'm' 男 | 'f' 女(圆润) | 'old' 老年(消瘦) | 'gaunt' 深压失水(酒店员工)
 */
function craniumGeo(variant = 'm') {
  return G('cranium_' + variant, () => {
    const R = 0.105;
    const g = new THREE.SphereGeometry(R, 26, 20);
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    const old = variant === 'old' || variant === 'gaunt';
    const fem = variant === 'f';
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const nx = v.x / R, ny = v.y / R, nz = v.z / R;
      let x = v.x, y = v.y, z = v.z;
      x *= fem ? 0.84 : 0.82;              // 头侧收窄
      if (nz < 0) z *= 1.08;               // 后脑饱满
      else z *= 0.94;                      // 面部略平
      // 下颌到下巴：前下方收拢
      if (ny < -0.12 && nz > -0.25) {
        const t = Math.min(1, (-ny - 0.12) / 0.88);
        x *= 1 - t * (fem ? 0.38 : 0.32);
        z = z * (1 - t * 0.24) + t * 0.026;
        y *= 1.06;
      }
      const front = Math.max(0, nz);
      // 颧骨
      const cheek = Math.exp(-((ny + 0.06) ** 2) * 16 - ((Math.abs(nx) - 0.7) ** 2) * 20) * front;
      x += Math.sign(nx) * cheek * (old ? 0.008 : 0.005);
      // 老年/失水：颊部凹陷
      if (old) {
        const hollow = Math.exp(-((ny + 0.22) ** 2) * 22 - ((Math.abs(nx) - 0.45) ** 2) * 30) * front;
        x -= Math.sign(nx) * hollow * 0.01;
        z -= hollow * 0.006;
      }
      // 眉弓
      z += Math.exp(-((ny - 0.2) ** 2) * 55) * front * (fem ? 0.003 : 0.006);
      // 眼窝
      z -= Math.exp(-((ny - 0.05) ** 2) * 80 - ((Math.abs(nx) - 0.36) ** 2) * 55) * front * (old ? 0.011 : 0.008);
      // 太阳穴微凹
      x -= Math.sign(nx) * Math.exp(-((ny - 0.25) ** 2) * 30 - ((Math.abs(nx) - 0.85) ** 2) * 40) * 0.004;
      pos.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    return g;
  });
}

/** 头部集合（头骨+鼻+耳+下唇沟）：皮肤材质一体网格 */
function headGeo(variant = 'm') {
  return G('head_' + variant, () => {
    const parts = [craniumGeo(variant).clone()];
    // 鼻：鼻梁 + 鼻头 + 鼻翼
    parts.push(xform(new THREE.SphereGeometry(0.012, 8, 6), 0, 0.02, 0.09, -0.24, 0, 0, 0.7, 1.4, 0.85));
    parts.push(xform(new THREE.SphereGeometry(0.0125, 8, 6), 0, -0.006, 0.096, 0, 0, 0, 1, 0.82, 1));
    parts.push(xform(new THREE.SphereGeometry(0.008, 6, 5), -0.01, -0.01, 0.09));
    parts.push(xform(new THREE.SphereGeometry(0.008, 6, 5), 0.01, -0.01, 0.09));
    // 耳
    parts.push(xform(new THREE.SphereGeometry(0.021, 8, 6), -0.084, 0.0, -0.008, 0, 0, 0.15, 0.32, 1, 0.68));
    parts.push(xform(new THREE.SphereGeometry(0.021, 8, 6), 0.084, 0.0, -0.008, 0, 0, -0.15, 0.32, 1, 0.68));
    // 上唇/下唇微凸
    parts.push(xform(new THREE.SphereGeometry(0.016, 8, 5), 0, -0.038, 0.082, 0, 0, 0, 1.25, 0.5, 0.7));
    return merged(parts);
  });
}

/** 眼睑罩（半球，肤色）：给眼睛压出「疲惫的半合」 */
function lidGeo() {
  return G('lid', () => new THREE.SphereGeometry(0.0135, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.42));
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
      parts.push(xform(new THREE.SphereGeometry(0.108, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.47),
        0, 0.03 + lift, -0.014, 0.21, 0, 0, 0.84, scaleY, 0.99));
      // 后脑+颈窝补片（φ π..2π 是 -z 后半球）——缺了这块，背影读成光头戴小帽
      parts.push(xform(new THREE.SphereGeometry(0.107, 16, 8, Math.PI, Math.PI, Math.PI * 0.30, Math.PI * 0.42),
        0, 0.03 + lift, -0.012, 0.16, 0, 0, 0.85, scaleY * 1.02, 0.97));
    };
    switch (style) {
      case 'crop': { // 平头/寸头
        cap(0.96);
        break;
      }
      case 'back': { // 大背头（司仪）
        cap(1.02, 0.006);
        parts.push(xform(new THREE.SphereGeometry(0.07, 10, 7), 0, 0.06, -0.075, 0.3, 0, 0, 1.1, 0.8, 1.1));
        break;
      }
      case 'side': { // 三七分
        cap(0.94);
        parts.push(xform(new THREE.BoxGeometry(0.065, 0.012, 0.04), -0.026, 0.092, 0.062, 0.42, 0, -0.12));
        break;
      }
      case 'bun': { // 盘发髻（全福婆）
        cap(0.92);
        parts.push(xform(new THREE.SphereGeometry(0.042, 10, 8), 0, 0.028, -0.1, 0, 0, 0, 1, 0.85, 1));
        break;
      }
      case 'perm': { // 烫发（2001 阿姨）
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          const rr = 0.082 + (i % 3) * 0.008;
          parts.push(xform(new THREE.SphereGeometry(0.03, 7, 5),
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

// ================= 躯干（服装车削） =================
function torsoProfile(kind) {
  // [r, y] 自腰际(0 附近)到肩颈；躯干组局部 y: 0 → 0.62
  switch (kind) {
    case 'suit': // 西装：垫肩宽、下摆过臀
      return [[0.2, -0.14], [0.185, -0.04], [0.165, 0.06], [0.16, 0.16], [0.175, 0.28],
        [0.19, 0.4], [0.2, 0.48], [0.19, 0.53], [0.15, 0.575], [0.07, 0.615]];
    case 'vest': // 马甲+衬衫：收身
      return [[0.165, -0.06], [0.155, 0.02], [0.148, 0.12], [0.158, 0.26], [0.172, 0.4],
        [0.178, 0.48], [0.168, 0.53], [0.135, 0.575], [0.065, 0.615]];
    case 'satin': // 缎袄：宽厚、直筒、下摆长
      return [[0.215, -0.24], [0.21, -0.1], [0.2, 0.04], [0.195, 0.2], [0.2, 0.36],
        [0.205, 0.46], [0.19, 0.52], [0.15, 0.57], [0.075, 0.615]];
    case 'work': // 工装夹克：微鼓腹
      return [[0.19, -0.1], [0.18, -0.02], [0.175, 0.08], [0.182, 0.2], [0.186, 0.34],
        [0.19, 0.44], [0.18, 0.51], [0.14, 0.565], [0.068, 0.615]];
    case 'dress': // 连衣裙上身
      return [[0.17, -0.06], [0.15, 0.04], [0.14, 0.14], [0.15, 0.28], [0.165, 0.4],
        [0.17, 0.47], [0.16, 0.52], [0.125, 0.57], [0.06, 0.615]];
    default:
      return torsoProfile('work');
  }
}
function torsoGeo(kind) {
  return G('torso_' + kind, () => {
    const pts = torsoProfile(kind).map(([r, y]) => new THREE.Vector2(r, y));
    const g = new THREE.LatheGeometry(pts, 22);
    g.scale(1, 1, 0.72); // 前后压扁——人不是圆桶
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
    xform(new THREE.SphereGeometry(0.014, 6, 5), 0, 0, 0),
    xform(new THREE.BoxGeometry(0.035, 0.024, 0.012), -0.024, 0, 0, 0, 0, 0.12),
    xform(new THREE.BoxGeometry(0.035, 0.024, 0.012), 0.024, 0, 0, 0, 0, -0.12),
  ]));
}

/** 立领+盘扣（缎袄） */
function knotButtonsGeo() {
  return G('knotBtns', () => {
    const parts = [];
    for (let i = 0; i < 4; i++) {
      parts.push(xform(new THREE.SphereGeometry(0.009, 6, 5), 0.035, 0.42 - i * 0.11, 0.145 - i * 0.004));
      parts.push(xform(new THREE.TorusGeometry(0.009, 0.003, 4, 8), -0.02, 0.42 - i * 0.11, 0.145 - i * 0.004));
    }
    return merged(parts);
  });
}

// ================= 四肢 =================
function limbGeo(r1, r2, len, key) {
  return G(key, () => {
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      pts.push(new THREE.Vector2(r1 + (r2 - r1) * t + Math.sin(t * Math.PI) * (r1 * 0.08), -t * len));
    }
    const g = new THREE.LatheGeometry(pts, 10);
    g.computeVertexNormals();
    return g;
  });
}

/** 浮木前臂（侍应异常）：浪蚀出的沟槽车削 */
function driftLimbGeo(r, len, key) {
  return G(key, () => {
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const groove = Math.sin(t * 26) * 0.16 + Math.sin(t * 9 + 1.7) * 0.1;
      pts.push(new THREE.Vector2(r * (0.86 + groove * 0.22 + (1 - t) * 0.12), -t * len));
    }
    const g = new THREE.LatheGeometry(pts, 9);
    g.computeVertexNormals();
    return g;
  });
}

/** 手：掌+四指(微蜷)+拇指  curl: 'relax'|'open'|'flat' */
function handGeo(curl = 'relax') {
  return G('hand_' + curl, () => {
    const parts = [];
    parts.push(xform(new THREE.SphereGeometry(0.045, 10, 8), 0, -0.045, 0.004, 0.12, 0, 0, 0.82, 1.15, 0.42));
    const base = curl === 'open' ? 0.15 : curl === 'flat' ? 0.05 : 0.55;
    const seg2 = curl === 'flat' ? 0.1 : 1.0;
    for (let i = 0; i < 4; i++) {
      const x = -0.028 + i * 0.0185;
      const l1 = 0.043 - Math.abs(i - 1.4) * 0.005;
      parts.push(xform(new THREE.CapsuleGeometry(0.0082, l1, 3, 6), x, -0.1 - l1 * 0.4, 0.012 + base * 0.02, base));
      parts.push(xform(new THREE.CapsuleGeometry(0.0075, 0.03, 3, 6), x, -0.125 - l1 * 0.7, 0.024 + base * 0.045, base + seg2 * 0.5));
    }
    parts.push(xform(new THREE.CapsuleGeometry(0.009, 0.04, 3, 6), 0.048, -0.06, 0.016, 0.4, 0, -0.5));
    return merged(parts);
  });
}

/** 皮鞋 */
function shoeGeo() {
  return G('shoe', () => merged([
    xform(new THREE.BoxGeometry(0.085, 0.018, 0.235), 0, -0.052, 0.05),
    xform(new THREE.SphereGeometry(0.052, 10, 7), 0, -0.02, 0.02, 0, 0, 0, 0.82, 0.62, 1.6),
    xform(new THREE.SphereGeometry(0.045, 8, 6), 0, -0.028, 0.13, 0, 0, 0, 0.78, 0.42, 1.15),
  ]));
}
/** 布鞋/胶鞋（镇民） */
function clothShoeGeo() {
  return G('clothShoe', () => merged([
    xform(new THREE.BoxGeometry(0.088, 0.02, 0.21), 0, -0.05, 0.04),
    xform(new THREE.SphereGeometry(0.05, 9, 6), 0, -0.022, 0.05, 0, 0, 0, 0.86, 0.6, 1.5),
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
      const z = 0.079 + (1 - rad) * 0.012;
      parts.push(xform(new THREE.SphereGeometry(0.006 + rnd() * 0.007, 6, 5), x, y, z));
    }
    return merged(parts);
  });
}

/** 全福婆：第三眼矿物孔板（额头正中、眉心上方） */
function poreplateDiscGeo() {
  return G('poreDisc', () => {
    const g = new THREE.CylinderGeometry(0.02, 0.022, 0.008, 14);
    g.rotateX(Math.PI / 2 - 0.28);
    g.translate(0, 0.058, 0.089);
    return g;
  });
}

/** 侍应托盘：不锈钢盘 + 沉积截面「菜」 */
function trayGeo() {
  return G('tray', () => merged([
    xform(new THREE.CylinderGeometry(0.165, 0.15, 0.014, 20), 0, 0, 0),
    xform(new THREE.TorusGeometry(0.16, 0.006, 6, 20), 0, 0.008, 0, Math.PI / 2),
  ]));
}
function traySedimentGeo() {
  return G('traySed', () => merged([
    xform(new THREE.CylinderGeometry(0.085, 0.09, 0.05, 14), 0, 0.032, 0),
    xform(new THREE.CylinderGeometry(0.06, 0.065, 0.035, 12), 0, 0.075, 0),
    xform(new THREE.SphereGeometry(0.035, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.5), 0, 0.09, 0),
  ]));
}

/** 麦克风（手持） */
function micGeo() {
  return G('mic', () => merged([
    xform(new THREE.CylinderGeometry(0.011, 0.014, 0.11, 8), 0, -0.02, 0),
    xform(new THREE.SphereGeometry(0.023, 10, 8), 0, 0.05, 0),
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

// ================= 角色配置 =================
const ROLE_DEFS = {
  emcee:    { torso: 'suit', hair: 'back', face: 'gaunt', skin: 'pale', shoe: 'leather', lapel: true, tie: true, mic: true, roeSeal: true, pants: 'suit' },
  waiter:   { torso: 'vest', hair: 'crop', face: 'gaunt', skin: 'pale', shoe: 'leather', shirtV: true, bowtie: true, drift: true, tray: true, pants: 'vest' },
  matron:   { torso: 'satin', hair: 'bun', face: 'old', skin: 'skin', shoe: 'cloth', knots: true, poreplate: true, pants: 'satin' },
  guest_m:  { torso: 'suit', hair: 'side', face: 'm', skin: 'skin', shoe: 'leather', lapel: true, tie: true, pants: 'suit' },
  guest_m2: { torso: 'work', hair: 'crop', face: 'm', skin: 'skin', shoe: 'leather', pants: 'work' },
  guest_f:  { torso: 'dress', hair: 'perm', face: 'f', skin: 'skin', shoe: 'leather', skirt: true },
  bride:    { torso: 'satin', hair: 'long', face: 'f', skin: 'skin', shoe: 'cloth', knots: true, pants: 'satin' },
  townsman: { torso: 'work', hair: 'crop', face: 'm', skin: 'skin', shoe: 'cloth', pants: 'work' },
  fisher:   { torso: 'work', hair: 'crop', face: 'old', skin: 'skin', shoe: 'cloth', pants: 'work' },
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
   *   role: emcee|waiter|matron|guest_m|guest_m2|guest_f|bride|townsman|fisher
   *   ghost: 回眸客——半透明多重曝光
   */
  constructor(M, opts = {}) {
    this.opts = opts;
    const role = roleFromOpts(opts);
    this.role = role;
    const D = ROLE_DEFS[role];
    const rnd = (() => { let s = (opts.seed ?? Math.random() * 1e9) >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();

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
    const skin = pick(D.skin === 'pale' ? M.skinPale : M.skin);
    const clothMap = {
      suit: M.clothSuit, vest: M.clothVest, satin: M.satin, work: M.clothWork,
      dress: rnd() < 0.5 ? M.clothBrown : M.clothRed,
    };
    const torsoMat = pick(clothMap[D.torso] ?? M.clothWork);
    const pantsMat = pick(D.pants === 'suit' ? M.clothSuit : D.pants === 'vest' ? M.clothVest : D.pants === 'satin' ? M.clothSuit : M.clothWork);
    const shirtMat = pick(M.clothShirt);
    const hairMat = pick(role === 'matron' || D.face === 'old'
      ? Mtl('hairGrey', () => new THREE.MeshStandardMaterial({ color: 0x4e4a46, roughness: 0.85 }))
      : M.hair);
    const leather = pick(Mtl('leather', () => new THREE.MeshStandardMaterial({ color: 0x1c1713, roughness: 0.38, metalness: 0.08, envMapIntensity: 1.1 })));
    const clothShoe = pick(Mtl('clothShoe', () => new THREE.MeshStandardMaterial({ color: 0x26282c, roughness: 0.9 })));
    const drift = pick(M.driftwood);

    // ---- 个体差异 ----
    this.gait = {
      limp: (role === 'townsman' || role === 'fisher') ? rnd() * 0.4 : 0,
      limpSide: rnd() < 0.5 ? -1 : 1,
      tilt: (rnd() - 0.5) * (role === 'waiter' ? 0.02 : 0.12),
      droop: (rnd() - 0.5) * 0.18,
      pace: 0.92 + rnd() * 0.16,
    };
    this.conveyor = role === 'waiter'; // 匀速传送带步态

    this.group = new THREE.Group();
    const hScale = (D.face === 'f' || role === 'matron' ? 0.93 : 0.97) + rnd() * 0.09;
    this.group.scale.setScalar(hScale);

    // ---- 骨架枢轴（与 v2 兼容：pelvis/torso/neck/head + 肩肘髋膝）----
    this.pelvis = new THREE.Group(); this.pelvis.position.y = 0.96; this.group.add(this.pelvis);
    this.torso = new THREE.Group(); this.torso.position.y = 0.12; this.pelvis.add(this.torso);
    const neckLen = D.drift ? 0.16 : 0.1; // 侍应的浮木颈比常人长——2 米内才会意识到
    this.neck = new THREE.Group(); this.neck.position.y = 0.58; this.torso.add(this.neck);
    this.head = new THREE.Group(); this.head.position.y = neckLen; this.neck.add(this.head);

    const mkMesh = (geo, mat, px = 0, py = 0, pz = 0, sx = 1, sy = 1, sz = 1) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.scale.set(sx, sy, sz);
      return m;
    };

    // ---- 躯干 ----
    this.torsoMesh = mkMesh(torsoGeo(D.torso), torsoMat, 0, 0, 0);
    this.torso.add(this.torsoMesh);
    // 颈
    if (D.drift) {
      this.torso.add(mkMesh(driftLimbGeo(0.048, neckLen + 0.06, 'neck_drift'), drift, 0, 0.62 + neckLen, 0));
    } else {
      this.torso.add(mkMesh(G('neckC', () => new THREE.CapsuleGeometry(0.046, 0.09, 4, 10)), skin, 0, 0.615, 0.008));
    }
    // 服装细件
    if (D.lapel) {
      const lp = mkMesh(lapelGeo(), torsoMat, -0.012, 0.28, 0.128, 1, 1, 1); lp.rotation.set(0.12, 0.25, 0.06); this.torso.add(lp);
      const rp = mkMesh(lapelGeo(), torsoMat, 0.012, 0.28, 0.128, -1, 1, 1); rp.rotation.set(0.12, -0.25, -0.06); this.torso.add(rp);
      const sv = mkMesh(shirtVGeo(), shirtMat, 0, 0.27, 0.115); sv.rotation.x = 0.1; this.torso.add(sv);
    }
    if (D.shirtV) {
      const sv = mkMesh(shirtVGeo(), shirtMat, 0, 0.27, 0.112); sv.rotation.x = 0.1; this.torso.add(sv);
      // 衬衫领
      this.torso.add(mkMesh(G('collarW', () => new THREE.CylinderGeometry(0.062, 0.075, 0.05, 12, 1, true)), shirtMat, 0, 0.57, 0.005));
    }
    if (D.tie) this.torso.add(mkMesh(tieGeo(), pick(Mtl('tieRed', () => new THREE.MeshStandardMaterial({ color: 0x6e1414, roughness: 0.55 }))), 0, 0.52, 0.128));
    if (D.bowtie) this.torso.add(mkMesh(bowtieGeo(), pick(Mtl('bowtieBlk', () => new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.6 }))), 0, 0.535, 0.115));
    if (D.knots) {
      this.torso.add(mkMesh(knotButtonsGeo(), pick(Mtl('knotGold', () => new THREE.MeshStandardMaterial({ color: 0xb8923e, roughness: 0.45, metalness: 0.4 }))), 0, 0, 0));
      this.torso.add(mkMesh(G('collarStand', () => new THREE.CylinderGeometry(0.06, 0.068, 0.06, 12, 1, true)), torsoMat, 0, 0.585, 0.004));
    }

    // ---- 头 ----
    const headMesh = mkMesh(headGeo(D.face === 'gaunt' ? 'gaunt' : D.face === 'old' ? 'old' : D.face), skin, 0, 0.115, 0);
    this.head.add(headMesh);
    // 眼（眼白+瞳，可发潮光）+ 眼睑 + 眉
    const scleraMat = pick(Mtl('sclera', () => new THREE.MeshStandardMaterial({ color: 0xc4bcae, roughness: 0.25 })));
    this.eyeMat = Mtl('irisBase', () => new THREE.MeshStandardMaterial({ color: 0x231c16, roughness: 0.18, emissive: 0x4a6a70, emissiveIntensity: 0 })).clone();
    if (ghost) { this.eyeMat.transparent = true; this.eyeMat.opacity = 0.5; }
    const eyeG = G('eyeball', () => new THREE.SphereGeometry(0.0115, 8, 6));
    const irisG = G('iris', () => new THREE.SphereGeometry(0.0058, 6, 5));
    this.eyeL = mkMesh(eyeG, scleraMat, -0.031, 0.12, 0.076);
    this.eyeR = mkMesh(eyeG, scleraMat, 0.031, 0.12, 0.076);
    this.irisL = mkMesh(irisG, this.eyeMat, -0.031, 0.12, 0.0855);
    this.irisR = mkMesh(irisG, this.eyeMat, 0.031, 0.12, 0.0855);
    this.head.add(this.eyeL, this.eyeR, this.irisL, this.irisR);
    const lidL = mkMesh(lidGeo(), skin, -0.031, 0.121, 0.0765); lidL.rotation.x = -0.85;
    const lidR = mkMesh(lidGeo(), skin, 0.031, 0.121, 0.0765); lidR.rotation.x = -0.85;
    this.head.add(lidL, lidR);
    const browL = mkMesh(browGeo(), hairMat, -0.032, 0.141, 0.083); browL.rotation.set(-0.18, 0, 0.08);
    const browR = mkMesh(browGeo(), hairMat, 0.032, 0.141, 0.083); browR.rotation.set(-0.18, 0, -0.08);
    this.head.add(browL, browR);
    // 嘴线（薄暗条，微张即消失在阴影里）
    if (!D.roeSeal) {
      this.head.add(mkMesh(G('mouthLine', () => new THREE.BoxGeometry(0.042, 0.004, 0.006)),
        pick(Mtl('mouthDark', () => new THREE.MeshStandardMaterial({ color: 0x3a2420, roughness: 0.8 }))), 0, 0.076, 0.0815));
    }
    // 发
    if (hairGeo && ROLE_DEFS[role].hair) {
      this.head.add(mkMesh(hairGeo(D.hair), hairMat, 0, 0.115, 0));
    }
    // 斗笠（渔民可选）
    if (opts.hat) this.head.add(mkMesh(G('hat', () => new THREE.ConeGeometry(0.25, 0.12, 12)), M.wood, 0, 0.26, 0));

    // ---- 工位主异常 ----
    if (D.roeSeal) {
      this.head.add(mkMesh(roeSealGeo(), pick(Mtl('roe', () => new THREE.MeshStandardMaterial({
        color: 0xd8c9a2, roughness: 0.24, envMapIntensity: 1.5,
      }))), 0, 0.115, 0));
    }
    if (D.poreplate) {
      this.head.add(mkMesh(poreplateDiscGeo(), pick(M.poreplate), 0, 0.115, 0));
    }

    // ---- 手臂 ----
    const mkArm = (side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.185 * side, 0.5 - this.gait.droop * 0.03 * side, 0);
      this.torso.add(shoulder);
      // 肩头填缝球（衣料包住关节，藏进肩线内）
      shoulder.add(mkMesh(G('shoulderCap', () => new THREE.SphereGeometry(0.048, 10, 8)), torsoMat, -0.006 * side, 0.012, 0, 1, 0.88, 0.88));
      shoulder.add(mkMesh(limbGeo(0.052, 0.042, 0.3, 'upperArm'), torsoMat, 0, 0, 0));
      const elbow = new THREE.Group();
      elbow.position.y = -0.3;
      shoulder.add(elbow);
      const foreMat = D.drift ? drift : (D.torso === 'dress' ? skin : torsoMat);
      elbow.add(mkMesh(G('elbowCap', () => new THREE.SphereGeometry(0.04, 8, 7)), foreMat, 0, 0.005, 0));
      if (D.drift) {
        elbow.add(mkMesh(driftLimbGeo(0.045, 0.24, 'foreDrift'), drift, 0, 0, 0));
      } else {
        elbow.add(mkMesh(limbGeo(0.045, 0.04, 0.22, 'foreArm'), foreMat, 0, 0, 0));
        // 袖口露腕
        elbow.add(mkMesh(G('wrist', () => new THREE.CapsuleGeometry(0.032, 0.05, 3, 8)), D.drift ? drift : skin, 0, -0.24, 0));
      }
      const hand = mkMesh(handGeo(D.tray && side < 0 ? 'flat' : 'relax'), D.drift ? drift : skin, 0, -0.252, 0.004);
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
      hip.add(mkMesh(G('hipCap', () => new THREE.SphereGeometry(0.068, 10, 8)), pantsMat, 0, 0.01, 0, 1, 0.8, 0.9));
      hip.add(mkMesh(limbGeo(0.078, 0.06, 0.4, 'thigh'), pantsMat, 0, 0, 0));
      const knee = new THREE.Group();
      knee.position.y = -0.42;
      hip.add(knee);
      knee.add(mkMesh(G('kneeCap', () => new THREE.SphereGeometry(0.05, 9, 7)), D.skirt ? skin : pantsMat, 0, 0.01, 0));
      knee.add(mkMesh(limbGeo(0.058, 0.045, 0.38, 'shin'), D.skirt ? skin : pantsMat, 0, 0, 0));
      const shoe = mkMesh(D.shoe === 'leather' ? shoeGeo() : clothShoeGeo(), D.shoe === 'leather' ? leather : clothShoe, 0, -0.4, 0.02);
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
        ], 18);
        g.scale(1, 1, 0.8); g.computeVertexNormals(); return g;
      }), torsoMat, 0, 0, 0));
    } else {
      this.pelvis.add(mkMesh(G('hipC', () => {
        const g = new THREE.LatheGeometry([
          new THREE.Vector2(0.155, 0.14), new THREE.Vector2(0.17, 0.04), new THREE.Vector2(0.165, -0.04), new THREE.Vector2(0.13, -0.1),
        ], 16);
        g.scale(1, 1, 0.78); g.computeVertexNormals(); return g;
      }), pantsMat, 0, 0, 0));
    }
    if (skirted && !D.skirt) {
      // 缎袄长下摆
      this.pelvis.add(mkMesh(G('aoHem', () => {
        const g = new THREE.LatheGeometry([
          new THREE.Vector2(0.2, 0.1), new THREE.Vector2(0.215, -0.06), new THREE.Vector2(0.225, -0.2),
        ], 18);
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
      for (const [dy, yaw, op] of [[0.02, 0.35, 1], [0.05, 0.7, 0.6]]) {
        const e = mkMesh(craniumGeo(D.face), echoMat, 0, 0.115 + dy, -0.01);
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
    // 呼吸（侍应刻意几乎不呼吸——空间耐压证据）
    const breath = this.conveyor ? 0.002 : 0.011;
    this.torsoMesh.scale.z = 1 + Math.sin(this.lifeT * 1.7) * breath;
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
        // 侍应待命：笔直，纹丝不动；有托盘则左臂永远端着
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
    lerp(this.armL.shoulder.rotation, 'x', -0.25, 12);
    lerp(this.armL.elbow.rotation, 'x', -1.62, 12);
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
