// 程序化人形 v3《返潮》：雕塑级可信人体
// 目标（美术圣经/F01 Canon）：远看是一个还在上班的中年人；近看解剖轮廓可读——
//   眉弓/眼窝/鼻梁/颧骨/法令区/下颌线/耳廓；锁骨与斜方肌；小腹微凸；
//   指节分明的手；工装外套的领与扣；侧分短发。
// 技术：高分段 Sphere/Capsule/Lathe + 顶点位移雕刻（高斯特征场），分层 Group 骨架 + 相位滞后程序动画。
// 禁则：主剪影不允许出现裸 Box / 低段 Cylinder；禁止僵尸跛行、抽搐。
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

// ---- 共享几何缓存 ----
const _geoCache = new Map();
function G(key, make) {
  if (!_geoCache.has(key)) _geoCache.set(key, make());
  return _geoCache.get(key);
}
const _m4 = new THREE.Matrix4();
function xform(geo, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) {
  const g = geo.clone();
  _m4.makeRotationFromEuler(new THREE.Euler(rx, ry, rz));
  _m4.setPosition(x, y, z);
  g.applyMatrix4(_m4);
  if (s !== 1) g.scale(s, s, s);
  return g;
}
function gauss(x, c, w) {
  const t = (x - c) / w;
  return Math.exp(-t * t);
}

// ============================================================
// 头部雕刻：从高分段球开始，用特征场做径向位移
// 局部坐标：头心原点，+z 是脸，+y 是头顶。单位球 → 椭球 (0.082, 0.105, 0.096)
// ============================================================
export function sculptHeadGeometry(opts = {}) {
  const {
    cheekHollow = 0.5,   // 中年颊部凹陷 0..1
    jawWidth = 1.0,      // 下颌宽
    noseSize = 1.0,
    browHeavy = 1.0,     // 眉弓厚重
    socketDepth = 1.0,   // 眼窝深度（F01 更深）
    chinSize = 1.0,
    ageSag = 0.5,        // 面颊下坠
    segW = 48,           // 球面分段（F01 开井需要更高分段让孔缘圆滑）
    segH = 40,
  } = opts;
  const geo = new THREE.SphereGeometry(1, segW, segH);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const { x, y, z } = v; // 单位球方向
    const ax = Math.abs(x);
    let d = 0; // 径向位移（单位球尺度）

    // —— 颅型 ——
    d += gauss(y, 0.35, 0.5) * gauss(z, -0.75, 0.6) * 0.05;            // 后脑凸
    d -= gauss(y, 0.95, 0.25) * 0.03;                                   // 头顶略平
    d -= gauss(ax, 1.0, 0.35) * gauss(y, 0.25, 0.45) * 0.05;            // 颞部收
    // —— 眉弓 / 额 ——
    d += gauss(y, 0.22, 0.16) * gauss(z, 0.92, 0.35) * gauss(ax, 0.3, 0.42) * 0.075 * browHeavy;
    d += gauss(y, 0.55, 0.3) * gauss(z, 0.85, 0.4) * 0.02;              // 额头饱满
    // —— 眼窝（凹） ——
    const sock = gauss(ax, 0.34, 0.18) * gauss(y, 0.075, 0.13) * gauss(z, 0.9, 0.3);
    d -= sock * 0.11 * socketDepth;
    // —— 鼻 ——
    const noseRidge = gauss(ax, 0, 0.1) * gauss(z, 0.97, 0.22);
    d += noseRidge * gauss(y, 0.02, 0.22) * 0.06 * noseSize;            // 鼻梁
    d += gauss(ax, 0, 0.13) * gauss(y, -0.22, 0.1) * gauss(z, 0.96, 0.18) * 0.12 * noseSize; // 鼻头
    d += gauss(ax, 0.14, 0.08) * gauss(y, -0.26, 0.08) * gauss(z, 0.9, 0.16) * 0.05;         // 鼻翼
    // —— 颧骨 / 面颊 ——
    d += gauss(ax, 0.58, 0.2) * gauss(y, -0.02, 0.16) * gauss(z, 0.55, 0.35) * 0.055;        // 颧骨
    d -= gauss(ax, 0.48, 0.22) * gauss(y, -0.3, 0.18) * gauss(z, 0.62, 0.35) * 0.05 * cheekHollow; // 颊凹
    d += gauss(ax, 0.3, 0.2) * gauss(y, -0.44, 0.14) * gauss(z, 0.72, 0.3) * 0.028 * ageSag; // 下坠的软组织
    // —— 口唇 ——
    d += gauss(ax, 0.12, 0.2) * gauss(y, -0.42, 0.07) * gauss(z, 0.92, 0.18) * 0.045;        // 上唇
    d += gauss(ax, 0.1, 0.18) * gauss(y, -0.52, 0.06) * gauss(z, 0.9, 0.18) * 0.04;          // 下唇
    d -= gauss(ax, 0.1, 0.2) * gauss(y, -0.47, 0.025) * gauss(z, 0.93, 0.15) * 0.03;         // 唇缝
    d -= gauss(ax, 0.26, 0.09) * gauss(y, -0.36, 0.12) * gauss(z, 0.82, 0.2) * 0.03;         // 法令沟
    // —— 颏 / 下颌 ——
    d += gauss(ax, 0, 0.22) * gauss(y, -0.72, 0.16) * gauss(z, 0.75, 0.3) * 0.06 * chinSize; // 下巴
    d -= gauss(ax, 0.55, 0.3) * gauss(y, -0.6, 0.25) * gauss(z, 0.35, 0.4) * 0.06 * (2 - jawWidth); // 颌线内收
    d += gauss(ax, 0.72, 0.2) * gauss(y, -0.38, 0.2) * gauss(z, 0.25, 0.3) * 0.02;           // 咬肌
    // —— 喉侧颈过渡由颈网格负责，这里把下缘收细 ——
    d -= gauss(y, -0.95, 0.18) * 0.12;

    const len = 1 + d;
    // 椭球化
    v.set(x * len * 0.082, y * len * 0.105, z * len * 0.096);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** 耳廓：外缘轮环 + 内凹碗，斜贴头侧 */
function earGeo() {
  return G('ear', () => {
    const parts = [];
    // 耳碗：半球内凹（BackSide 看进去太黑，直接用薄壳）
    const bowl = new THREE.SphereGeometry(0.021, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
    bowl.scale(0.62, 1, 1.35);
    parts.push(xform(bowl, 0, 0, 0, 0, 0, Math.PI / 2));
    // 耳轮
    const rim = new THREE.TorusGeometry(0.019, 0.006, 8, 18, Math.PI * 1.5);
    parts.push(xform(rim, 0.002, 0.001, 0, 0, 0, Math.PI * 0.55, 1));
    // 耳垂
    parts.push(xform(new THREE.SphereGeometry(0.008, 8, 6), 0.002, -0.021, 0.004));
    return BufferGeometryUtils.mergeGeometries(parts, false);
  });
}

/** 渐变半径的四肢段：胶囊体逐环缩放 + 骨点/肌腹 */
function limbGeo(key, r1, r2, len, bulges = []) {
  return G(key, () => {
    const geo = new THREE.CapsuleGeometry(1, 1, 7, 16);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      // CapsuleGeometry: 圆柱段 y ∈ [-0.5, 0.5]，帽在外
      const t = THREE.MathUtils.clamp(0.5 - v.y, 0, 1); // 0=顶(近端) 1=底(远端)
      let r = r1 + (r2 - r1) * t;
      for (const b of bulges) r *= 1 + b.amt * gauss(t, b.t, b.w);
      const yy = v.y > 0.5 ? (v.y - 0.5) * r1 + len / 2
        : v.y < -0.5 ? (v.y + 0.5) * r2 - len / 2
          : v.y * len;
      v.set(v.x * r, yy, v.z * r);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    geo.translate(0, -len / 2, 0); // 原点在近端关节
    return geo;
  });
}

/** 躯干（衬衫/工装下的胸腔）：Lathe 侧影 + 锁骨/肩胛/腹部雕刻 */
function torsoGeo(key, { paunch = 0.5, shoulder = 1.0, chest = 1.0 } = {}) {
  return G(key, () => {
    // 侧影：髋 → 腰 → 胸 → 肩 → 领口。y 0(髋顶) → 0.5(肩)
    const prof = [
      [0.150, 0.00], [0.163, 0.06], [0.158, 0.13],       // 髋上
      [0.148 + paunch * 0.02, 0.20],                     // 腰（有点肚子）
      [0.152 + chest * 0.012, 0.30], [0.16 + chest * 0.02, 0.38], // 胸腔
      [0.165 * shoulder, 0.44], [0.14, 0.485],           // 肩斜方
      [0.075, 0.51], [0.062, 0.53],                      // 颈根
    ];
    const pts = prof.map(([r, y]) => new THREE.Vector2(r, y));
    const geo = new THREE.LatheGeometry(pts, 30);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const ang = Math.atan2(v.x, v.z); // 0=+z 正面
      const front = Math.cos(ang);      // 1 正面, -1 背面
      const sideA = Math.abs(Math.sin(ang));
      const h = v.y;
      const rad = Math.hypot(v.x, v.z);
      if (rad > 1e-5) {
        let d = 0;
        // 锁骨：正面颈根下两道斜脊
        d += gauss(h, 0.46, 0.022) * Math.max(0, front) * gauss(sideA, 0.42, 0.3) * 0.018;
        // 胸骨浅沟
        d -= gauss(h, 0.36, 0.06) * Math.max(0, front) * gauss(sideA, 0, 0.14) * 0.008;
        // 肋弓起伏（正面两侧，呼吸时被布料带出来）
        d += gauss(h, 0.27, 0.035) * Math.max(0, front) * gauss(sideA, 0.5, 0.22) * 0.007;
        // 小腹
        d += gauss(h, 0.17, 0.07) * Math.max(0, front) * gauss(sideA, 0, 0.5) * 0.02 * paunch;
        // 肩胛骨：背面两块
        d += gauss(h, 0.4, 0.05) * Math.max(0, -front) * gauss(sideA, 0.55, 0.25) * 0.016;
        // 脊柱沟
        d -= gauss(h, 0.3, 0.18) * Math.max(0, -front) * gauss(sideA, 0, 0.12) * 0.01;
        const k = (rad + d) / rad;
        v.x *= k; v.z *= k;
      }
      // 横截面椭化：胸腔宽 > 厚
      v.x *= 1.22; v.z *= 0.92;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    return geo;
  });
}

/** 骨盆/臀（裤装）：Lathe 短鼓 */
function pelvisGeo() {
  return G('pelvis', () => {
    const pts = [
      new THREE.Vector2(0.10, -0.14), new THREE.Vector2(0.155, -0.1),
      new THREE.Vector2(0.168, -0.02), new THREE.Vector2(0.158, 0.05),
    ];
    const geo = new THREE.LatheGeometry(pts, 24);
    geo.scale(1.18, 1, 0.9);
    geo.computeVertexNormals();
    return geo;
  });
}

/** 手：掌 + 五指分节（微屈的工作手），指节起伏 */
function handGeo(side = 1) {
  return G('hand' + side, () => {
    const parts = [];
    // 掌：削过的椭球
    const palm = new THREE.SphereGeometry(1, 14, 10);
    palm.scale(0.041, 0.052, 0.016);
    parts.push(xform(palm, 0, -0.048, 0.004, 0.16 * side, 0, 0));
    // 四指：三节小胶囊，逐节加弯；指节处微鼓
    const seg = (r, l) => {
      const c = new THREE.CapsuleGeometry(r, l, 3, 8);
      return c;
    };
    for (let i = 0; i < 4; i++) {
      const fx = (-0.028 + i * 0.0185) * 1;
      const baseY = -0.095;
      const lens = [0.032, 0.026, 0.02];
      const rads = [0.0088, 0.008, 0.0072];
      const curls = [0.42, 0.5, 0.62];
      let y = baseY, z = 0.008, ang = 0.3;
      for (let j = 0; j < 3; j++) {
        ang += curls[j] * 0.5;
        parts.push(xform(seg(rads[j], lens[j]), fx, y - Math.cos(ang) * lens[j] * 0.5, z + Math.sin(ang) * lens[j] * 0.5, ang, 0, 0));
        y -= Math.cos(ang) * (lens[j] + rads[j] * 0.8);
        z += Math.sin(ang) * (lens[j] + rads[j] * 0.8);
        // 指节
        parts.push(xform(new THREE.SphereGeometry(rads[j] * 1.12, 8, 6), fx, y + Math.cos(ang) * 0.004, z - Math.sin(ang) * 0.004));
      }
    }
    // 拇指：斜出两节
    parts.push(xform(seg(0.0095, 0.03), 0.038 * side, -0.052, 0.012, 0.5, 0, -0.9 * side));
    parts.push(xform(seg(0.0085, 0.024), 0.052 * side, -0.075, 0.026, 0.85, 0, -0.7 * side));
    const g = BufferGeometryUtils.mergeGeometries(parts, false);
    g.computeVertexNormals();
    return g;
  });
}

/** 旧皮鞋：楦头 + 鞋跟 */
function shoeGeo() {
  return G('shoe', () => {
    const parts = [];
    const body = new THREE.SphereGeometry(1, 16, 10);
    body.scale(0.047, 0.032, 0.115);
    parts.push(xform(body, 0, 0.028, 0.045));
    const toe = new THREE.SphereGeometry(1, 12, 8);
    toe.scale(0.042, 0.026, 0.05);
    parts.push(xform(toe, 0, 0.022, 0.135));
    // 鞋跟
    parts.push(xform(new THREE.CylinderGeometry(0.037, 0.04, 0.024, 12), 0, 0.012, -0.045));
    // 鞋底沿
    const sole = new THREE.BoxGeometry(0.092, 0.012, 0.21);
    parts.push(xform(sole, 0, 0.006, 0.04));
    const g = BufferGeometryUtils.mergeGeometries(parts, false);
    g.computeVertexNormals();
    return g;
  });
}

/** 侧分短发：主发盖 + 分缝侧的低盖 + 鬓角 */
function hairGeoSidePart() {
  return G('hairSide', () => {
    const parts = [];
    // 主盖（覆盖头顶偏右）
    const cap = new THREE.SphereGeometry(0.0885, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.52);
    cap.scale(0.97, 1, 1.02);
    parts.push(xform(cap, 0.004, 0.028, -0.012, 0.1, 0, -0.06));
    // 分缝另一侧：更贴的一层
    const cap2 = new THREE.SphereGeometry(0.086, 20, 12, Math.PI * 0.9, Math.PI * 1.1, 0, Math.PI * 0.5);
    parts.push(xform(cap2, -0.004, 0.026, -0.01, 0.12, 0, 0.1));
    // 后脑延伸到颈
    const back = new THREE.SphereGeometry(0.088, 20, 12, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.26);
    back.scale(0.95, 1.1, 0.9);
    parts.push(xform(back, 0, 0.02, -0.018, 0.16, 0, 0));
    // 鬓角（贴耳前缘的窄条，避免读成耳罩）
    const sb = new THREE.BoxGeometry(0.008, 0.026, 0.02);
    parts.push(xform(sb, -0.081, -0.012, 0.002, 0, 0, 0.1));
    parts.push(xform(sb, 0.081, -0.012, 0.002, 0, 0, -0.1));
    const g = BufferGeometryUtils.mergeGeometries(parts, false);
    g.computeVertexNormals();
    return g;
  });
}

/** 盘发（清洁工陈姐） */
function hairGeoBun() {
  return G('hairBun', () => {
    const parts = [];
    const cap = new THREE.SphereGeometry(0.089, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.58);
    parts.push(xform(cap, 0, 0.024, -0.008, 0.1, 0, 0));
    parts.push(xform(new THREE.SphereGeometry(0.032, 12, 10), 0, 0.04, -0.085));
    const g = BufferGeometryUtils.mergeGeometries(parts, false);
    g.computeVertexNormals();
    return g;
  });
}

/** 平头短发（保安/厨工） */
function hairGeoCrew() {
  return G('hairCrew', () => {
    const cap = new THREE.SphereGeometry(0.0875, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.46);
    cap.scale(0.98, 0.92, 1.0);
    const g = xform(cap, 0, 0.03, -0.008, 0.06, 0, 0);
    g.computeVertexNormals();
    return g;
  });
}

/** 制服领：左右两片翻领 + 后领带 */
function collarGeo() {
  return G('collar', () => {
    const parts = [];
    const flap = new THREE.BoxGeometry(0.075, 0.055, 0.012);
    // 位移出翻折的楔形
    const p = flap.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y > 0) p.setZ(i, p.getZ(i) - 0.014);
    }
    flap.computeVertexNormals();
    parts.push(xform(flap.clone(), -0.048, 0.5, 0.085, -0.18, 0.45, 0.24));
    parts.push(xform(flap.clone(), 0.048, 0.5, 0.085, -0.18, -0.45, -0.24));
    // 后领
    const back = new THREE.CylinderGeometry(0.068, 0.072, 0.035, 18, 1, true, Math.PI * 0.6, Math.PI * 0.8);
    parts.push(xform(back, 0, 0.505, -0.012, 0.08, Math.PI, 0));
    const g = BufferGeometryUtils.mergeGeometries(parts, false);
    g.computeVertexNormals();
    return g;
  });
}

// ============================================================
// Humanoid：分层骨架 + 程序动画（相位滞后）
// ============================================================
export class Humanoid {
  /**
   * @param M 材质库
   * @param opts {
   *   role: 'staff'|'guard'|'cleaner'|'kitchen'|'f01',
   *   hair: 'side'|'bun'|'crew', tool: 'mop'|'flashlight'|'cleaver'|'rag'|null,
   *   flashlightOn: bool, seed: number,
   *   headOpts: 传给 sculptHeadGeometry 的雕刻参数,
   *   noEyes: bool（F01 用井替代眼球）
   * }
   */
  constructor(M, opts = {}) {
    this.opts = opts;
    this.M = M;
    const role = opts.role ?? 'staff';
    const rnd = (() => { let s = (opts.seed ?? Math.random() * 1e9) >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();

    // 正常中年人的个体差：非常克制（Canon：不是怪物步态）
    this.gait = {
      pace: 0.95 + rnd() * 0.12,
      sway: 0.8 + rnd() * 0.4,
      stoop: 0.02 + rnd() * 0.05,   // 久站的人微微含胸
      headLag: 0.1 + rnd() * 0.08,  // 头部相位滞后（F01 Canon 动画原则）
    };

    // 制服配色
    const jacket = role === 'guard' ? M.trouser : role === 'kitchen' ? M.shirt : M.workwear;
    const trouser = M.trouser;
    const skin = M.skin;

    this.group = new THREE.Group();
    const hScale = (role === 'cleaner' ? 0.94 : 0.99) + rnd() * 0.04;
    this.group.scale.setScalar(hScale);

    // ---- 骨架枢轴 ----
    this.pelvis = new THREE.Group(); this.pelvis.position.y = 0.96; this.group.add(this.pelvis);
    this.torso = new THREE.Group(); this.torso.position.y = 0.10; this.pelvis.add(this.torso);
    this.neck = new THREE.Group(); this.neck.position.y = 0.515; this.torso.add(this.neck);
    this.head = new THREE.Group(); this.head.position.y = 0.095; this.neck.add(this.head);

    const mk = (geo, mat, px = 0, py = 0, pz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.castShadow = true;
      return m;
    };

    // ---- 躯干 ----
    const paunch = role === 'f01' ? 0.66 : role === 'cleaner' ? 0.35 : 0.45 + rnd() * 0.3;
    this.torso.add(mk(torsoGeo('torso_' + role, { paunch, shoulder: role === 'cleaner' ? 0.92 : 1.0 }), jacket));
    this.torso.add(mk(collarGeo(), role === 'f01' ? M.collar : role === 'guard' ? M.plasticDark : jacket));
    // 领口里露一线衬衫
    this.torso.add(mk(G('shirtV', () => {
      const g = new THREE.CylinderGeometry(0.055, 0.06, 0.05, 14);
      return g;
    }), M.shirt, 0, 0.49, 0.012));
    // 扣子一列
    for (let i = 0; i < 4; i++) {
      this.torso.add(mk(G('button', () => new THREE.CylinderGeometry(0.008, 0.008, 0.005, 10)),
        M.plasticDark, 0.0, 0.42 - i * 0.1, 0.155 - i * 0.004).rotateX(Math.PI / 2));
    }
    // 胸牌（酒店员工）
    if (role !== 'f01') {
      this.torso.add(mk(G('badge', () => new THREE.BoxGeometry(0.05, 0.016, 0.004)), M.brass, -0.07, 0.4, 0.152));
    } else {
      // F01 的旧工牌：挂歪的
      const b = mk(G('badge2', () => new THREE.BoxGeometry(0.05, 0.016, 0.004)), M.plastic, -0.07, 0.39, 0.155);
      b.rotation.z = 0.14;
      this.torso.add(b);
    }
    // 骨盆（裤腰）
    this.pelvis.add(mk(pelvisGeo(), trouser, 0, 0.02, 0));
    // 围裙（厨工/清洁工）
    if (role === 'kitchen' || role === 'cleaner') {
      const ap = new THREE.PlaneGeometry(0.3, 0.5, 4, 6);
      const p = ap.attributes.position;
      const vv = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        vv.fromBufferAttribute(p, i);
        vv.z += Math.cos(vv.x * 5.5) * 0.03 - vv.y * vv.y * 0.14;
        p.setXYZ(i, vv.x, vv.y, vv.z);
      }
      ap.computeVertexNormals();
      const apron = new THREE.Mesh(ap, role === 'kitchen' ? M.shirt : M.workwear);
      apron.position.set(0, 0.18, 0.16);
      apron.material.side = THREE.DoubleSide;
      this.torso.add(apron);
    }

    // ---- 颈 ----
    this.neckMesh = mk(limbGeo('neckL', 0.049, 0.055, 0.09, [{ t: 0.45, w: 0.16, amt: 0.1 }]), skin, 0, 0.075, 0);
    this.neck.add(this.neckMesh);

    // ---- 头 ----
    const headOpts = { ...(opts.headOpts ?? {}) };
    if (role === 'cleaner') Object.assign(headOpts, { browHeavy: 0.6, jawWidth: 0.9, chinSize: 0.8, cheekHollow: 0.35 });
    this.headMesh = mk(sculptHeadGeometry(headOpts), skin, 0, 0.01, 0.006);
    this.head.add(this.headMesh);
    // 耳
    const earL = mk(earGeo(), skin, -0.083, -0.004, -0.004);
    earL.rotation.set(0.1, -0.25, -0.08);
    const earR = mk(earGeo(), skin, 0.083, -0.004, -0.004);
    earR.rotation.set(0.1, Math.PI + 0.25, 0.08);
    earR.scale.x = -1;
    this.head.add(earL, earR);
    // 发
    const hairStyle = opts.hair ?? (role === 'cleaner' ? 'bun' : role === 'f01' ? 'side' : 'crew');
    const hair = hairStyle === 'bun' ? hairGeoBun() : hairStyle === 'side' ? hairGeoSidePart() : hairGeoCrew();
    this.head.add(mk(hair, M.hair, 0, 0.012, 0));
    // 眼（F01 用井替换，这里跳过）
    this.eyeAnchorL = new THREE.Group(); this.eyeAnchorL.position.set(-0.0295, 0.008, 0.0782);
    this.eyeAnchorR = new THREE.Group(); this.eyeAnchorR.position.set(0.0295, 0.008, 0.0782);
    this.head.add(this.eyeAnchorL, this.eyeAnchorR);
    if (!opts.noEyes) {
      const eyeG = G('eyeball', () => new THREE.SphereGeometry(0.0115, 12, 10));
      const el = mk(eyeG, M.eyeDark); this.eyeAnchorL.add(el);
      const er = mk(eyeG, M.eyeDark); this.eyeAnchorR.add(er);
      // 上睑（皮肤薄壳压住眼球上缘）
      const lidG = G('lid', () => {
        const g = new THREE.SphereGeometry(0.0125, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.42);
        return g;
      });
      const ll = mk(lidG, skin, 0, 0.003, 0); ll.rotation.x = -0.35; this.eyeAnchorL.add(ll);
      const lr = mk(lidG, skin, 0, 0.003, 0); lr.rotation.x = -0.35; this.eyeAnchorR.add(lr);
    }

    // ---- 臂 ----
    const mkArm = (side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.195 * side, 0.455, 0);
      this.torso.add(shoulder);
      // 三角肌盖住肩点
      shoulder.add(mk(G('deltoid', () => {
        const s = new THREE.SphereGeometry(0.058, 14, 10);
        s.scale(1, 1.15, 0.95);
        return s;
      }), jacket, 0, -0.01, 0));
      // 上臂（袖）：肘上收
      shoulder.add(mk(limbGeo('upperArm', 0.05, 0.041, 0.28, [{ t: 0.35, w: 0.25, amt: 0.08 }]), jacket, 0, -0.02, 0));
      const elbow = new THREE.Group(); elbow.position.y = -0.3; shoulder.add(elbow);
      elbow.add(mk(G('elbowCap', () => new THREE.SphereGeometry(0.042, 10, 8)), jacket));
      // 前臂：腕部收细 + 尺骨脊
      elbow.add(mk(limbGeo('foreArm', 0.042, 0.028, 0.25, [{ t: 0.2, w: 0.2, amt: 0.1 }]), jacket, 0, -0.01, 0));
      // 袖口露腕
      elbow.add(mk(limbGeo('wristSkin', 0.028, 0.026, 0.05), skin, 0, -0.25, 0));
      const wrist = new THREE.Group(); wrist.position.y = -0.285; elbow.add(wrist);
      wrist.add(mk(handGeo(side), skin, 0, 0.015, 0));
      return { shoulder, elbow, wrist };
    };
    this.armL = mkArm(-1);
    this.armR = mkArm(1);

    // ---- 腿 ----
    const mkLeg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(0.092 * side, -0.06, 0);
      this.pelvis.add(hip);
      hip.add(mk(limbGeo('thigh', 0.082, 0.058, 0.42, [{ t: 0.25, w: 0.3, amt: 0.05 }]), trouser, 0, -0.02, 0));
      const knee = new THREE.Group(); knee.position.y = -0.45; hip.add(knee);
      knee.add(mk(G('kneeCap', () => new THREE.SphereGeometry(0.056, 10, 8)), trouser));
      knee.add(mk(limbGeo('shin', 0.057, 0.036, 0.38, [{ t: 0.3, w: 0.25, amt: 0.09 }]), trouser, 0, -0.01, 0));
      const ankle = new THREE.Group(); ankle.position.y = -0.42; knee.add(ankle);
      // 袜/踝
      ankle.add(mk(limbGeo('ankleSkin', 0.034, 0.03, 0.05), M.plasticDark, 0, 0.02, 0));
      ankle.add(mk(shoeGeo(), M.shoe, 0, -0.06, 0.01));
      return { hip, knee, ankle };
    };
    this.legL = mkLeg(-1);
    this.legR = mkLeg(1);

    // ---- 工具 ----
    this.tool = null;
    if (opts.tool === 'mop') {
      const t = new THREE.Group();
      t.add(mk(G('mopPole', () => new THREE.CylinderGeometry(0.014, 0.014, 1.4, 8)), M.veneer, 0, -0.45, 0));
      const headM = mk(G('mopHead', () => {
        const s = new THREE.SphereGeometry(0.09, 10, 8);
        s.scale(1, 0.45, 1);
        return s;
      }), M.workwear, 0, -1.16, 0.04);
      t.add(headM);
      t.rotation.x = 0.5;
      this.armR.wrist.add(t);
      this.tool = t;
    } else if (opts.tool === 'flashlight') {
      const t = new THREE.Group();
      t.add(mk(G('torchBody', () => new THREE.CylinderGeometry(0.021, 0.025, 0.19, 12)), M.ironDark, 0, 0, 0));
      const lensM = mk(G('torchLens', () => new THREE.CylinderGeometry(0.024, 0.021, 0.02, 12)), M.bulbWarm, 0, 0.1, 0);
      t.add(lensM);
      t.rotation.x = Math.PI / 2 - 0.12;
      t.position.set(0, -0.02, 0.03);
      this.armR.wrist.add(t);
      this.tool = t;
      if (opts.flashlightOn !== false) {
        this.flashlight = new THREE.SpotLight(0xffe0b0, 14, 15, 0.36, 0.55, 1.6);
        this.flashlight.castShadow = false;
        const tgt = new THREE.Object3D();
        tgt.position.set(0, 0.9, 0);
        t.add(tgt);
        this.flashlight.target = tgt;
        this.flashlight.position.set(0, 0.1, 0);
        t.add(this.flashlight);
      }
    } else if (opts.tool === 'cleaver') {
      const t = new THREE.Group();
      t.add(mk(G('cleaverBlade', () => new THREE.BoxGeometry(0.005, 0.1, 0.16)), M.steelWorn, 0, -0.1, 0.05));
      t.add(mk(G('cleaverHandle', () => new THREE.CylinderGeometry(0.011, 0.011, 0.1, 8)), M.veneerDark, 0, -0.02, 0));
      this.armR.wrist.add(t);
      this.tool = t;
    } else if (opts.tool === 'rag') {
      const t = mk(G('ragCloth', () => {
        const s = new THREE.SphereGeometry(0.05, 8, 6);
        s.scale(1.2, 0.5, 1);
        return s;
      }), M.shirt, 0, -0.04, 0.02);
      this.armR.wrist.add(t);
      this.tool = t;
    }

    // ---- 动画状态 ----
    this.phase = Math.random() * 10;
    this.breathT = Math.random() * 10;
    this._lagBuf = [];       // 头部滞后缓冲
    this._torsoYawV = 0;
    this._eyeI = 0;
  }

  /** 供 F01 覆写；普通员工无眼部发光（Canon：可信的人） */
  setEyeIntensity(v) { this._eyeI = v; }

  headWorldPos(target) {
    const v = target ?? new THREE.Vector3();
    this.head.getWorldPosition(v);
    return v;
  }

  /**
   * 程序动画。mode:
   *  idle / walk / chase / alert / grab / watch /
   *  work_mop(拖地) / work_desk(前台站立) / work_chop(切配) / work_wipe(擦桌)
   * 原则（F01 Canon）：所有转身经由躯干→头相位滞后；无跛行、无抽搐。
   */
  animate(mode, dt, speed = 1) {
    const g = this.gait;
    this.breathT += dt;
    const breath = Math.sin(this.breathT * 1.6) * 0.5 + 0.5;

    // 通用复位目标
    let torsoPitch = g.stoop, torsoYaw = 0, torsoRoll = 0;
    let neckPitch = 0.02, headYaw = 0, headTilt = 0;
    let aLsw = 0, aRsw = 0, aLlift = 0.06, aRlift = 0.06, eLbend = 0.22, eRbend = 0.22;
    let lLsw = 0, lRsw = 0, kL = 0.03, kR = 0.03;
    let bobY = 0;

    if (mode === 'walk' || mode === 'chase') {
      const rate = (mode === 'chase' ? 8.2 : 5.2) * g.pace * speed;
      this.phase += dt * rate;
      const p = this.phase;
      const amp = mode === 'chase' ? 0.62 : 0.42;
      lLsw = Math.sin(p) * amp;
      lRsw = Math.sin(p + Math.PI) * amp;
      kL = Math.max(0, -Math.sin(p - 0.7)) * amp * 1.15 + 0.04;
      kR = Math.max(0, -Math.sin(p + Math.PI - 0.7)) * amp * 1.15 + 0.04;
      aLsw = Math.sin(p + Math.PI) * amp * 0.55;
      aRsw = Math.sin(p) * amp * 0.55;
      eLbend = 0.3 + Math.max(0, Math.sin(p + Math.PI)) * 0.25;
      eRbend = 0.3 + Math.max(0, Math.sin(p)) * 0.25;
      bobY = Math.abs(Math.sin(p)) * (mode === 'chase' ? 0.035 : 0.022);
      torsoRoll = Math.sin(p) * 0.024 * g.sway;
      torsoYaw = Math.sin(p) * 0.05 * g.sway;
      torsoPitch = g.stoop + (mode === 'chase' ? 0.14 : 0.02);   // 赶路的人上身前倾
      neckPitch = mode === 'chase' ? -0.06 : 0.03;               // 追时抬头盯人
    } else if (mode === 'idle' || mode === 'alert' || mode === 'watch') {
      this.phase += dt * 1.1;
      const p = this.phase;
      bobY = Math.sin(p * 0.9) * 0.004;
      torsoRoll = Math.sin(p * 0.5) * 0.008;
      aLlift = 0.05; aRlift = 0.05;
      if (mode === 'alert') {
        torsoPitch = g.stoop + 0.05;
        neckPitch = -0.08;                       // 抬头张望
        headYaw = Math.sin(p * 0.7) * 0.3;       // 缓慢扫视——不是抽搐
        eLbend = 0.35; eRbend = 0.35;
      }
      if (mode === 'watch') {
        neckPitch = 0.0;
        headYaw = Math.sin(p * 0.13) * 0.05;
      }
    } else if (mode === 'work_mop') {
      this.phase += dt * 2.0 * speed;
      const p = this.phase;
      torsoPitch = 0.18 + Math.sin(p) * 0.04;
      torsoYaw = Math.sin(p) * 0.16;
      aRsw = 0.55 + Math.sin(p) * 0.3;
      aRlift = 0.15;
      eRbend = 0.5 + Math.sin(p + 0.5) * 0.2;
      aLsw = 0.35 + Math.sin(p) * 0.22;
      aLlift = 0.12; eLbend = 0.55;
      neckPitch = 0.34;                          // 低头看地
      lLsw = 0.06; lRsw = -0.06;
    } else if (mode === 'work_desk') {
      this.phase += dt * 0.8;
      const p = this.phase;
      torsoPitch = 0.1;
      neckPitch = 0.3 + Math.sin(p * 0.6) * 0.03; // 低头翻登记簿
      aLsw = 0.5; aRsw = 0.5; aLlift = 0.1; aRlift = 0.1;
      eLbend = 1.15; eRbend = 1.2 + Math.sin(p * 2.2) * 0.06; // 右手写字的小动作
    } else if (mode === 'work_chop') {
      this.phase += dt * 3.4 * speed;
      const p = this.phase;
      torsoPitch = 0.16;
      neckPitch = 0.32;
      aRsw = 0.5; aRlift = 0.1;
      eRbend = 0.75 + Math.max(0, Math.sin(p)) * 0.5;  // 起落的刀
      aLsw = 0.42; aLlift = 0.14; eLbend = 0.9;        // 左手按住案板
    } else if (mode === 'work_wipe') {
      this.phase += dt * 1.8 * speed;
      const p = this.phase;
      torsoPitch = 0.22 + Math.sin(p * 0.5) * 0.02;
      neckPitch = 0.3;
      aRsw = 0.62; aRlift = 0.2 + Math.sin(p) * 0.08;
      eRbend = 0.5 + Math.cos(p) * 0.18;               // 画圈擦桌
      aLsw = 0.2; eLbend = 0.5;
      torsoYaw = Math.sin(p) * 0.07;
    } else if (mode === 'grab') {
      this.phase += dt * 3;
      const p = this.phase;
      torsoPitch = 0.22;
      neckPitch = 0.1;
      aLsw = 1.35 + Math.sin(p * 1.4) * 0.04;          // 双臂前伸——不是扑，是"接住"
      aRsw = 1.3 + Math.cos(p * 1.3) * 0.04;
      aLlift = 0.3; aRlift = 0.32;
      eLbend = 0.28; eRbend = 0.26;
      bobY = Math.sin(p * 2.4) * 0.006;
    }

    // 呼吸：胸腔轻起伏（衣料被顶起一点）
    this.torso.scale.z = 1 + breath * 0.012;
    this.torso.scale.x = 1 + breath * 0.006;

    // 相位滞后：头晚于躯干 headLag 秒（Canon 动画原则）
    this._lagBuf.push({ t: g.headLag, yaw: torsoYaw, pitch: torsoPitch });
    let lagYaw = torsoYaw, lagPitch = torsoPitch;
    for (let i = this._lagBuf.length - 1; i >= 0; i--) {
      const e = this._lagBuf[i];
      e.t -= dt;
      if (e.t <= 0) {
        lagYaw = e.yaw; lagPitch = e.pitch;
        this._lagBuf.splice(0, i + 1);
        break;
      }
    }

    const L = (cur, tgt, k = 10) => cur + (tgt - cur) * Math.min(1, dt * k);
    this.pelvis.position.y = 0.96 + bobY;
    this.torso.rotation.x = L(this.torso.rotation.x, torsoPitch);
    this.torso.rotation.y = L(this.torso.rotation.y, torsoYaw);
    this.torso.rotation.z = L(this.torso.rotation.z, torsoRoll);
    this.neck.rotation.x = L(this.neck.rotation.x, neckPitch + (lagPitch - torsoPitch) * 0.6, 8);
    this.head.rotation.y = L(this.head.rotation.y, headYaw + (lagYaw - torsoYaw) * 0.8, 6);
    this.head.rotation.z = L(this.head.rotation.z, headTilt, 6);

    this.armL.shoulder.rotation.x = L(this.armL.shoulder.rotation.x, -aLsw);
    this.armR.shoulder.rotation.x = L(this.armR.shoulder.rotation.x, -aRsw);
    this.armL.shoulder.rotation.z = L(this.armL.shoulder.rotation.z, aLlift);
    this.armR.shoulder.rotation.z = L(this.armR.shoulder.rotation.z, -aRlift);
    this.armL.elbow.rotation.x = L(this.armL.elbow.rotation.x, -eLbend);
    this.armR.elbow.rotation.x = L(this.armR.elbow.rotation.x, -eRbend);

    this.legL.hip.rotation.x = L(this.legL.hip.rotation.x, -lLsw, 12);
    this.legR.hip.rotation.x = L(this.legR.hip.rotation.x, -lRsw, 12);
    this.legL.knee.rotation.x = L(this.legL.knee.rotation.x, kL, 12);
    this.legR.knee.rotation.x = L(this.legR.knee.rotation.x, kR, 12);
    this.legL.ankle.rotation.x = L(this.legL.ankle.rotation.x, lLsw * 0.4 - kL * 0.4, 12);
    this.legR.ankle.rotation.x = L(this.legR.ankle.rotation.x, lRsw * 0.4 - kR * 0.4, 12);
  }
}
