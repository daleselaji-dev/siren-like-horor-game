// 程序化人形 v2：分层骨架(Group 枢轴) + 程序动画
// 潮尸剪影规范（美术圣经）：微驼、头略垂、臂下沉、喉部鼓起、眼窝一点冷光
// v2 细节：肿胀灌水的躯干、手掌与蜷曲手指、可开合下颌、湿发贴头、盐结晶痂、
//          破渔网披、赤足、每具尸体独有的跛行步态与体形差异
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

// ---- 共享几何缓存（全部人形共用，省内存省初始化） ----
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

/** 手：掌 + 四指微蜷 + 拇指（合并为单几何） */
function handGeo() {
  return G('hand', () => {
    const parts = [];
    parts.push(xform(new THREE.BoxGeometry(0.085, 0.1, 0.038), 0, -0.05, 0));
    for (let i = 0; i < 4; i++) {
      const x = -0.031 + i * 0.0207;
      parts.push(xform(new THREE.BoxGeometry(0.017, 0.088, 0.02), x, -0.135, 0.02, 0.5));
      // 第二指节（更弯）
      parts.push(xform(new THREE.BoxGeometry(0.016, 0.05, 0.018), x, -0.172, 0.055, 1.05));
    }
    parts.push(xform(new THREE.BoxGeometry(0.02, 0.06, 0.02), 0.055, -0.075, 0.018, 0.35, 0, -0.6));
    return BufferGeometryUtils.mergeGeometries(parts, false);
  });
}

/** 赤足：脚背 + 脚趾 */
function footGeo() {
  return G('foot', () => BufferGeometryUtils.mergeGeometries([
    xform(new THREE.BoxGeometry(0.088, 0.055, 0.2), 0, 0, 0.045),
    xform(new THREE.BoxGeometry(0.082, 0.042, 0.055), 0, -0.005, 0.165),
  ], false));
}

/** 湿发贴头 + 几缕垂下的发条 */
function hairGeo() {
  return G('hair', () => {
    const parts = [];
    const cap = new THREE.SphereGeometry(0.122, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.62);
    parts.push(xform(cap, 0, 0.115, -0.008, 0.06, 0, 0, 1));
    // 发条（贴颈背/侧脸）
    const strand = (x, y, z, rx, rz, len) =>
      parts.push(xform(new THREE.BoxGeometry(0.02, len, 0.013), x, y, z, rx, 0, rz));
    strand(-0.06, 0.02, -0.09, -0.25, 0.1, 0.16);
    strand(0.04, 0.0, -0.1, -0.3, -0.12, 0.19);
    strand(-0.09, 0.04, -0.03, -0.1, 0.28, 0.14);
    strand(0.1, 0.03, -0.02, -0.12, -0.3, 0.15);
    strand(0.0, 0.02, -0.11, -0.35, 0.02, 0.17);
    return BufferGeometryUtils.mergeGeometries(parts, false);
  });
}

/** 盐结晶簇：几粒白色晶锥 */
function saltClusterGeo() {
  return G('saltCluster', () => {
    const parts = [];
    const rnd = [[0, 0, 0, 0.035], [0.03, 0, 0.015, 0.022], [-0.025, 0, 0.02, 0.026], [0.012, 0, -0.028, 0.018]];
    for (const [x, z, zz, s] of rnd) {
      parts.push(xform(new THREE.ConeGeometry(s * 0.7, s * 2.2, 4), x, s, z + zz, (x) * 4, x * 9, z * 7));
    }
    return BufferGeometryUtils.mergeGeometries(parts, false);
  });
}

export class Humanoid {
  /**
   * @param M 材质库
   * @param opts { cloth:'navy'|'grey'|'red', hat:boolean, lantern:boolean, tool:'net'|'rake'|null,
   *               light:boolean, seed:number }
   */
  constructor(M, opts = {}) {
    this.opts = opts;
    const cloth = opts.cloth === 'red' ? M.clothRed : opts.cloth === 'grey' ? M.clothGrey : M.clothNavy;
    const skin = M.corpseSkin;
    const isSinger = opts.cloth === 'red';
    const rnd = (() => { let s = (opts.seed ?? Math.random() * 1e9) >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();

    // 每具尸体独有的"泡坏程度"
    this.gait = {
      limp: 0.25 + rnd() * 0.75,          // 跛行程度
      limpSide: rnd() < 0.5 ? -1 : 1,     // 哪条腿是坏的
      tilt: (rnd() - 0.5) * 0.24,         // 头长期歪向一侧
      droop: (rnd() - 0.5) * 0.3,         // 肩一高一低
      pace: 0.9 + rnd() * 0.2,            // 步频个体差
    };
    if (isSinger) { this.gait.limp = 0; this.gait.tilt = 0; this.gait.droop = 0; }

    this.group = new THREE.Group();
    const hScale = 0.95 + rnd() * 0.1;
    this.group.scale.setScalar(hScale);

    // ---- 骨架枢轴 ----
    this.pelvis = new THREE.Group(); this.pelvis.position.y = 0.96; this.group.add(this.pelvis);
    this.torso = new THREE.Group(); this.torso.position.y = 0.12; this.pelvis.add(this.torso);
    this.neck = new THREE.Group(); this.neck.position.y = 0.58; this.torso.add(this.neck);
    this.head = new THREE.Group(); this.head.position.y = 0.1; this.neck.add(this.head);

    const mkMesh = (geo, mat, px, py, pz, sx = 1, sy = 1, sz = 1) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.scale.set(sx, sy, sz);
      m.castShadow = true;
      return m;
    };

    // ---- 躯干：胸 + 灌水的肚腹 + 背弓 ----
    this.torso.add(mkMesh(G('chest', () => new THREE.CylinderGeometry(0.155, 0.205, 0.6, 9)), cloth, 0, 0.29, 0));
    // 肿胀的腹（水在里面）——会随喉咙一起微微鼓动
    const bloat = 0.9 + rnd() * (isSinger ? 0 : 0.5);
    this.belly = mkMesh(G('belly', () => new THREE.SphereGeometry(0.19, 10, 8)), cloth, 0, 0.06, 0.045, bloat, bloat * 0.85, bloat * 0.9);
    this.torso.add(this.belly);
    // 背弓（驼起来的那一块）
    this.torso.add(mkMesh(G('hump', () => new THREE.SphereGeometry(0.14, 9, 7)), cloth, 0, 0.42, -0.1, 1.15, 0.85, 0.8));
    // 肩
    this.torso.add(mkMesh(G('shoulder', () => new THREE.SphereGeometry(0.1, 8, 6)), cloth, -0.21, 0.52 + this.gait.droop * 0.05, 0));
    this.torso.add(mkMesh(G('shoulder', () => new THREE.SphereGeometry(0.1, 8, 6)), cloth, 0.21, 0.52 - this.gait.droop * 0.05, 0));
    // 衣领
    this.torso.add(mkMesh(G('collar', () => new THREE.CylinderGeometry(0.1, 0.13, 0.09, 8)), cloth, 0, 0.57, 0));
    // 下摆/裤
    this.pelvis.add(mkMesh(G('hem', () => new THREE.CylinderGeometry(0.2, 0.235, 0.26, 9)), cloth, 0, 0.0, 0));
    // 草绳腰带
    const belt = mkMesh(G('belt', () => new THREE.TorusGeometry(0.215, 0.022, 5, 12)), M.woodDark, 0, 0.1, 0);
    belt.rotation.x = Math.PI / 2;
    this.pelvis.add(belt);

    // ---- 破渔网披（生前的活计缠在身上）----
    if (!isSinger && rnd() < 0.75) {
      const shawl = new THREE.Mesh(G('shawl', () => new THREE.PlaneGeometry(0.5, 0.62)), M.net);
      shawl.position.set(0.05, 0.32, -0.19);
      shawl.rotation.set(0.24, 0.15, 0.5 + rnd() * 0.4);
      shawl.userData.noShadow = true;
      this.torso.add(shawl);
      const shawl2 = new THREE.Mesh(G('shawl2', () => new THREE.PlaneGeometry(0.34, 0.5)), M.net);
      shawl2.position.set(-0.16, 0.18, 0.16);
      shawl2.rotation.set(-0.3, 0.3, -0.4);
      shawl2.userData.noShadow = true;
      this.torso.add(shawl2);
    }

    // ---- 头 ----
    const headMesh = mkMesh(G('skull', () => new THREE.SphereGeometry(0.115, 12, 9)), skin, 0, 0.115, 0, 1, 1.14, 1.02);
    this.head.add(headMesh);
    // 下颌（可开合：追击嘶吼/歌唱）
    this.jaw = new THREE.Group();
    this.jaw.position.set(0, 0.045, 0.015);
    this.jaw.add(mkMesh(G('jawB', () => new THREE.BoxGeometry(0.082, 0.048, 0.1)), skin, 0, -0.018, 0.045));
    this.head.add(this.jaw);
    // 喉部鼓起（灌满海水）——会缓慢地吞咽
    this.throat = mkMesh(G('throat', () => new THREE.SphereGeometry(0.055, 8, 6)), skin, 0, -0.05, 0.05, 1, 1.3, 1);
    this.head.add(this.throat);
    // 眼窝（凹陷的暗坑）+ 一点冷光
    const socketMat = G('socketMat', () => new THREE.MeshBasicMaterial({ color: 0x0c1214 }));
    this.head.add(mkMesh(G('socket', () => new THREE.SphereGeometry(0.026, 6, 6)), socketMat, -0.046, 0.128, 0.088));
    this.head.add(mkMesh(G('socket', () => new THREE.SphereGeometry(0.026, 6, 6)), socketMat, 0.046, 0.128, 0.088));
    const eyeGeo = G('eye', () => new THREE.SphereGeometry(0.013, 6, 6));
    this.eyeL = mkMesh(eyeGeo, M.eyeGlow.clone(), -0.046, 0.13, 0.104);
    this.eyeR = mkMesh(eyeGeo, M.eyeGlow.clone(), 0.046, 0.13, 0.104);
    this.eyeL.material.color.setHex(0x9fd8e8);
    this.eyeR.material = this.eyeL.material;
    this.head.add(this.eyeL); this.head.add(this.eyeR);
    // 鼻梁
    this.head.add(mkMesh(G('nose', () => new THREE.BoxGeometry(0.026, 0.06, 0.03)), skin, 0, 0.1, 0.105, 1, 1, 1));
    // 湿发（斗笠下也有）
    this.head.add(mkMesh(hairGeo(), M.hair, 0, 0.02, 0));
    if (isSinger) {
      // 小满：一头长发直垂到背——全图唯一梳得整齐的头发
      this.head.add(mkMesh(G('longHair', () => new THREE.BoxGeometry(0.17, 0.62, 0.05)), M.hair, 0, -0.16, -0.1, 1, 1, 1));
    }
    // 斗笠
    if (opts.hat) {
      this.head.add(mkMesh(G('hat', () => new THREE.ConeGeometry(0.24, 0.12, 10)), M.wood, 0, 0.245, 0));
    }

    // ---- 盐结晶痂（肩头/背上，海替他们结的霜）----
    if (!isSinger) {
      const nClust = 2 + (rnd() * 2 | 0);
      for (let i = 0; i < nClust; i++) {
        const c = mkMesh(saltClusterGeo(), M.salt,
          (rnd() - 0.5) * 0.36, 0.4 + rnd() * 0.16, -0.08 - rnd() * 0.1, 0.8 + rnd() * 0.5, 0.8 + rnd() * 0.5, 0.8 + rnd() * 0.5);
        c.rotation.set(rnd() * 0.6 - 0.9, rnd() * 6.28, 0);
        this.torso.add(c);
      }
    }

    // ---- 手臂（肩枢轴→上臂→肘枢轴→前臂+手掌手指）----
    const mkArm = (side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.22 * side, 0.5 - this.gait.droop * 0.04 * side, 0);
      this.torso.add(shoulder);
      shoulder.add(mkMesh(G('upperArm', () => new THREE.CylinderGeometry(0.05, 0.046, 0.3, 7)), cloth, 0, -0.15, 0));
      const elbow = new THREE.Group();
      elbow.position.y = -0.3;
      shoulder.add(elbow);
      // 泡胀的前臂（皮肤）
      elbow.add(mkMesh(G('foreArm', () => new THREE.CylinderGeometry(0.05, 0.056, 0.26, 7)), skin, 0, -0.13, 0));
      // 手：掌+指（180°Y 旋转做左右）
      const hand = mkMesh(handGeo(), skin, 0, -0.26, 0.004);
      if (side < 0) hand.rotation.y = Math.PI;
      elbow.add(hand);
      return { shoulder, elbow, hand };
    };
    this.armL = mkArm(-1);
    this.armR = mkArm(1);

    // ---- 腿（髋枢轴→大腿→膝枢轴→小腿+赤足）----
    const mkLeg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(0.1 * side, 0.02, 0);
      this.pelvis.add(hip);
      hip.add(mkMesh(G('thigh', () => new THREE.CylinderGeometry(0.075, 0.062, 0.42, 7)), cloth, 0, -0.21, 0));
      const knee = new THREE.Group();
      knee.position.y = -0.42;
      hip.add(knee);
      // 卷起的裤脚
      knee.add(mkMesh(G('cuff', () => new THREE.CylinderGeometry(0.068, 0.072, 0.1, 7)), cloth, 0, -0.05, 0));
      knee.add(mkMesh(G('shin', () => new THREE.CylinderGeometry(0.05, 0.044, 0.42, 7)), skin, 0, -0.22, 0));
      knee.add(mkMesh(footGeo(), skin, 0, -0.45, 0.03));
      return { hip, knee };
    };
    this.legL = mkLeg(-1);
    this.legR = mkLeg(1);

    // ---- 歌唱者红裙：垂到脚面的整片红 ----
    if (isSinger) {
      const robe = mkMesh(G('robe', () => new THREE.CylinderGeometry(0.21, 0.36, 1.0, 12, 1, true)), cloth, 0, -0.44, 0);
      robe.material = cloth;
      this.pelvis.add(robe);
      // 宽袖
      this.armL.shoulder.add(mkMesh(G('sleeve', () => new THREE.CylinderGeometry(0.055, 0.11, 0.34, 8, 1, true)), cloth, 0, -0.18, 0));
      this.armR.shoulder.add(mkMesh(G('sleeve', () => new THREE.CylinderGeometry(0.055, 0.11, 0.34, 8, 1, true)), cloth, 0, -0.18, 0));
    }

    // ---- 手持物 ----
    if (opts.lantern) {
      // 提灯(挂在右手)
      this.lanternG = new THREE.Group();
      const pole = mkMesh(G('lanternPole', () => new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6)), M.woodDark, 0, 0.1, 0);
      pole.rotation.z = Math.PI / 2.2;
      this.lanternG.add(pole);
      const paper = mkMesh(G('lanternPaper', () => new THREE.CylinderGeometry(0.11, 0.11, 0.2, 10)), M.lanternPaper, 0.22, -0.08, 0);
      this.lanternG.add(paper);
      // 灯箍
      this.lanternG.add(mkMesh(G('lanternRing', () => new THREE.CylinderGeometry(0.115, 0.115, 0.015, 10)), M.ironDark, 0.22, 0.03, 0));
      this.lanternG.add(mkMesh(G('lanternRing', () => new THREE.CylinderGeometry(0.115, 0.115, 0.015, 10)), M.ironDark, 0.22, -0.19, 0));
      if (opts.light !== false) {
        this.lanternLight = new THREE.PointLight(0xff8438, 7, 11, 2);
        this.lanternLight.position.set(0.22, -0.08, 0);
        this.lanternG.add(this.lanternLight);
        // 提灯的光在雾里拖出一小截光锥
        const cone = new THREE.Mesh(
          G('lanternConeGeo', () => {
            const g = new THREE.CylinderGeometry(0.12, 0.75, 1.5, 10, 1, true);
            g.translate(0, -0.75, 0);
            return g;
          }),
          G('lanternConeMat', () => new THREE.MeshBasicMaterial({
            color: 0xff8438, transparent: true, opacity: 0.05,
            blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
          }))
        );
        cone.position.set(0.22, -0.14, 0);
        cone.userData.noShadow = true;
        this.lanternG.add(cone);
      }
      this.lanternG.position.y = -0.29;
      this.armR.elbow.add(this.lanternG);
    }
    if (opts.tool === 'rake') {
      const tool = new THREE.Group();
      const pole = mkMesh(G('rakePole', () => new THREE.CylinderGeometry(0.02, 0.02, 1.5, 6)), M.woodDark, 0, 0, 0);
      pole.rotation.x = 0.9;
      tool.add(pole);
      tool.add(mkMesh(G('rakeHead', () => new THREE.BoxGeometry(0.5, 0.05, 0.08)), M.woodDark, 0, -0.55, 0.5));
      tool.position.y = -0.28;
      this.toolG = tool;
      this.armR.elbow.add(tool);
    }

    this.group.traverse((o) => { if (o.isMesh && !o.userData.noShadow) o.castShadow = true; else if (o.isMesh) o.castShadow = false; });

    // 动画状态
    this.phase = Math.random() * 10;
    this.alertShudder = 0;
    this.lifeT = Math.random() * 100;  // 喉咙吞咽/火苗抖动的私有时钟
    this.twitchT = 3 + Math.random() * 6; // 下一次颈部抽动
    this.twitch = 0;
    this.stumbleT = 2 + Math.random() * 4; // 追击中的踉跄
    this.stumble = 0;
    this.jawOpen = 0;
  }

  setEyeIntensity(v) {
    // v: 0.5 常态微光 → 3 警戒亮
    this.eyeL.material.color.setRGB(0.62 * v, 0.85 * v, 0.91 * v);
  }

  /**
   * 程序动画
   * @param mode 'work_net'|'work_rake'|'work_pray'|'walk'|'chase'|'alert'|'grab'|'sing'|'watch'|'idle'
   * @param dt 帧时长
   * @param speed 移动速度（walk/chase 步频用）
   */
  animate(mode, dt, speed = 1) {
    const P = this.phase;
    const Gt = this.gait;
    const lerp = (o, k, v, r = 8) => { o[k] += (v - o[k]) * Math.min(1, dt * r); };

    // ---- 常驻生命体征（不管在做什么都在发生） ----
    this.lifeT += dt;
    // 喉咙每隔几秒鼓动一次——里面的水在动；肚腹跟着轻轻一沉
    const gulp = Math.max(0, Math.sin(this.lifeT * 0.9)) ** 6;
    this.throat.scale.set(1 + gulp * 0.35, 1.3 + gulp * 0.28, 1 + gulp * 0.35);
    if (this.belly) {
      if (this.belly._by === undefined) this.belly._by = this.belly.scale.y;
      this.belly.scale.y = this.belly._by * (1 + gulp * 0.05);
    }
    // 提灯火苗在风里抖
    if (this.lanternLight) {
      this.lanternLight.intensity = 7 * (0.82 + Math.sin(this.lifeT * 9.1) * 0.1 + Math.sin(this.lifeT * 17.3) * 0.08);
    }
    // 颈部偶发抽动：像被人从水底拽了一下
    this.twitchT -= dt;
    if (this.twitchT <= 0) {
      this.twitchT = 4 + Math.random() * 8;
      this.twitch = 0.35 + Math.random() * 0.3;
      this.twitchSide = Math.random() < 0.5 ? -1 : 1;
    }
    if (this.twitch > 0) {
      this.twitch = Math.max(0, this.twitch - dt * 2.4);
      this.head.rotation.z = Math.sin(this.twitch * Math.PI) * 0.22 * this.twitchSide + Gt.tilt;
    } else {
      this.head.rotation.z += (Gt.tilt - this.head.rotation.z) * Math.min(1, dt * 4);
    }
    // 下颌开合（目标由各姿态设定，平滑跟随）
    let jawTarget = 0.04;
    this.jaw.rotation.x += ((this._jawT ?? jawTarget) - this.jaw.rotation.x) * Math.min(1, dt * 6);

    switch (mode) {
      case 'work_net': {
        this.phase += dt * 2.2;
        // 弓背坐姿感：深驼背 + 双手在胸前交替拉扯
        lerp(this.torso.rotation, 'x', 0.62 + Math.sin(P * 0.5) * 0.03);
        lerp(this.neck.rotation, 'x', 0.5);
        const pull = Math.sin(P * 2);
        lerp(this.armL.shoulder.rotation, 'x', -0.9 + pull * 0.25, 10);
        lerp(this.armR.shoulder.rotation, 'x', -0.9 - pull * 0.25, 10);
        lerp(this.armL.elbow.rotation, 'x', -1.1 - pull * 0.3, 10);
        lerp(this.armR.elbow.rotation, 'x', -1.1 + pull * 0.3, 10);
        lerp(this.legL.hip.rotation, 'x', -0.1);
        lerp(this.legR.hip.rotation, 'x', 0.08);
        lerp(this.pelvis.position, 'y', 0.9);
        this._jawT = 0.05;
        break;
      }
      case 'work_rake': {
        this.phase += dt * 1.6;
        const push = Math.sin(P);
        lerp(this.torso.rotation, 'x', 0.45 + push * 0.12);
        lerp(this.neck.rotation, 'x', 0.42);
        lerp(this.armR.shoulder.rotation, 'x', -0.75 + push * 0.4, 10);
        lerp(this.armL.shoulder.rotation, 'x', -0.6 + push * 0.35, 10);
        lerp(this.armR.elbow.rotation, 'x', -0.4, 10);
        lerp(this.armL.elbow.rotation, 'x', -0.5, 10);
        // 步子随耙子小挪
        lerp(this.legL.hip.rotation, 'x', push * 0.12);
        lerp(this.legR.hip.rotation, 'x', -push * 0.12);
        lerp(this.pelvis.position, 'y', 0.93);
        this._jawT = 0.05;
        break;
      }
      case 'work_pray': {
        this.phase += dt * 0.9;
        // 反复叩拜
        const bow = (Math.sin(P) + 1) * 0.5; // 0..1
        lerp(this.torso.rotation, 'x', 0.25 + bow * 0.75, 5);
        lerp(this.neck.rotation, 'x', 0.3 + bow * 0.3, 5);
        lerp(this.armL.shoulder.rotation, 'x', -1.2 - bow * 0.3, 6);
        lerp(this.armR.shoulder.rotation, 'x', -1.2 - bow * 0.3, 6);
        lerp(this.armL.elbow.rotation, 'x', -0.9, 6);
        lerp(this.armR.elbow.rotation, 'x', -0.9, 6);
        lerp(this.pelvis.position, 'y', 0.72); // 半跪
        lerp(this.legL.hip.rotation, 'x', -1.2, 5);
        lerp(this.legR.hip.rotation, 'x', -1.2, 5);
        lerp(this.legL.knee.rotation, 'x', 1.9, 5);
        lerp(this.legR.knee.rotation, 'x', 1.9, 5);
        // 念念有词
        this._jawT = 0.08 + Math.max(0, Math.sin(this.lifeT * 5.3)) * 0.07;
        break;
      }
      case 'walk': {
        this.phase += dt * 5.2 * speed * Gt.pace;
        const sw = Math.sin(P);
        // 跛行：坏腿摆幅小、好腿代偿大，骨盆随之一沉一沉
        const lampL = 1 + Gt.limp * 0.28 * Gt.limpSide;
        const lampR = 1 - Gt.limp * 0.28 * Gt.limpSide;
        lerp(this.torso.rotation, 'x', 0.3);           // 驼背
        lerp(this.neck.rotation, 'x', 0.45);            // 垂头
        const sink = Math.max(0, Math.sin(P + (Gt.limpSide > 0 ? Math.PI : 0))) * Gt.limp * 0.035;
        lerp(this.pelvis.position, 'y', 0.94 + Math.abs(Math.cos(P)) * 0.02 - sink);
        lerp(this.legL.hip.rotation, 'x', sw * 0.5 * lampL, 12);
        lerp(this.legR.hip.rotation, 'x', -sw * 0.5 * lampR, 12);
        lerp(this.legL.knee.rotation, 'x', Math.max(0, -sw) * 0.7 * lampL + 0.1, 12);
        lerp(this.legR.knee.rotation, 'x', Math.max(0, sw) * 0.7 * lampR + 0.1, 12);
        // 臂下沉几乎不摆——“身体记得劳作，不记得走路”
        lerp(this.armL.shoulder.rotation, 'x', -sw * 0.12 + 0.05, 8);
        lerp(this.armR.shoulder.rotation, 'x', sw * 0.12 + 0.05, 8);
        lerp(this.armL.elbow.rotation, 'x', -0.15);
        lerp(this.armR.elbow.rotation, 'x', -0.15);
        lerp(this.torso.rotation, 'z', Math.sin(P) * 0.05 + Gt.droop * 0.1);
        this._jawT = 0.05;
        break;
      }
      case 'chase': {
        this.phase += dt * 8.5 * Math.max(1, speed) * Gt.pace;
        const sw = Math.sin(P);
        // 偶发踉跄：像有半步突然踩进了水里
        this.stumbleT -= dt;
        if (this.stumbleT <= 0) {
          this.stumbleT = 2.2 + Math.random() * 3.5;
          this.stumble = 0.5;
        }
        this.stumble = Math.max(0, this.stumble - dt * 1.8);
        const stmb = Math.sin(this.stumble * Math.PI) * 0.14;
        // 头后仰(喉咙朝天灌水)、双臂前探、大步踉跄、嘶吼开颌
        lerp(this.torso.rotation, 'x', 0.5 + stmb, 10);
        lerp(this.neck.rotation, 'x', -0.55, 10);
        const lampL = 1 + Gt.limp * 0.2 * Gt.limpSide;
        const lampR = 1 - Gt.limp * 0.2 * Gt.limpSide;
        lerp(this.legL.hip.rotation, 'x', sw * 0.85 * lampL, 14);
        lerp(this.legR.hip.rotation, 'x', -sw * 0.85 * lampR, 14);
        lerp(this.legL.knee.rotation, 'x', Math.max(0, -sw) * 1.1 + 0.15, 14);
        lerp(this.legR.knee.rotation, 'x', Math.max(0, sw) * 1.1 + 0.15, 14);
        lerp(this.armL.shoulder.rotation, 'x', -1.35 + sw * 0.15, 10);
        lerp(this.armR.shoulder.rotation, 'x', -1.35 - sw * 0.15, 10);
        lerp(this.armL.elbow.rotation, 'x', -0.35, 10);
        lerp(this.armR.elbow.rotation, 'x', -0.35, 10);
        lerp(this.pelvis.position, 'y', 0.92 + Math.abs(Math.cos(P)) * 0.05 - stmb * 0.3);
        lerp(this.torso.rotation, 'z', sw * 0.1 + stmb * Gt.limpSide, 10);
        this._jawT = 0.5 + Math.sin(this.lifeT * 7) * 0.1;
        break;
      }
      case 'alert': {
        // 僵直 + 高频颤抖（喉咙里灌水声的身体化）
        this.alertShudder += dt * 40;
        const sh = Math.sin(this.alertShudder) * 0.02;
        lerp(this.torso.rotation, 'x', 0.15, 10);
        lerp(this.neck.rotation, 'x', -0.2 + sh, 14);
        this.neck.rotation.z = Math.sin(this.alertShudder * 1.3) * 0.03;
        lerp(this.armL.shoulder.rotation, 'x', -0.2, 10);
        lerp(this.armR.shoulder.rotation, 'x', -0.2, 10);
        lerp(this.legL.hip.rotation, 'x', 0, 10);
        lerp(this.legR.hip.rotation, 'x', 0, 10);
        lerp(this.pelvis.position, 'y', 0.98, 10);
        this._jawT = 0.22;
        break;
      }
      case 'grab': {
        // 近身抓住：整个人扑过来，双手掐向你的喉咙，头凑到你脸前
        this.phase += dt * 6;
        lerp(this.torso.rotation, 'x', 0.72, 12);
        lerp(this.neck.rotation, 'x', -0.75, 12);
        lerp(this.armL.shoulder.rotation, 'x', -1.72 + Math.sin(P * 3) * 0.05, 14);
        lerp(this.armR.shoulder.rotation, 'x', -1.72 - Math.sin(P * 3) * 0.05, 14);
        lerp(this.armL.shoulder.rotation, 'z', 0.30, 12);
        lerp(this.armR.shoulder.rotation, 'z', -0.30, 12);
        lerp(this.armL.elbow.rotation, 'x', -0.55, 14);
        lerp(this.armR.elbow.rotation, 'x', -0.55, 14);
        lerp(this.pelvis.position, 'y', 1.0, 10);
        lerp(this.legL.hip.rotation, 'x', -0.25, 10);
        lerp(this.legR.hip.rotation, 'x', 0.18, 10);
        // 掐住时全身高频痉挛 + 下颌大张（往你喉咙里灌）
        this.alertShudder += dt * 46;
        this.torso.rotation.z = Math.sin(this.alertShudder) * 0.035;
        this._jawT = 0.72;
        break;
      }
      case 'sing': {
        this.phase += dt * 0.7;
        // 唯一挺立的身影：头后仰对海而歌，缓慢摇摆，下颌随歌开合
        lerp(this.torso.rotation, 'x', -0.08, 4);
        lerp(this.neck.rotation, 'x', -0.5, 4);
        lerp(this.torso.rotation, 'z', Math.sin(P) * 0.06, 4);
        lerp(this.armL.shoulder.rotation, 'x', -0.25, 4);
        lerp(this.armR.shoulder.rotation, 'x', -0.25, 4);
        lerp(this.armL.shoulder.rotation, 'z', 0.35 + Math.sin(P * 0.8) * 0.08, 4);
        lerp(this.armR.shoulder.rotation, 'z', -0.35 - Math.sin(P * 0.8) * 0.08, 4);
        lerp(this.legL.hip.rotation, 'x', 0, 4);
        lerp(this.legR.hip.rotation, 'x', 0, 4);
        lerp(this.pelvis.position, 'y', 1.0, 4);
        this._jawT = 0.2 + Math.max(0, Math.sin(this.lifeT * 2.1)) * 0.22;
        break;
      }
      case 'watch': {
        // 望海者：不自然的笔直，几乎不动——只有喉咙还在咽
        this.phase += dt * 0.3;
        lerp(this.torso.rotation, 'x', 0.04, 3);
        lerp(this.neck.rotation, 'x', -0.12, 3);
        lerp(this.torso.rotation, 'z', Math.sin(P) * 0.012, 3);
        lerp(this.armL.shoulder.rotation, 'x', 0.02, 3);
        lerp(this.armR.shoulder.rotation, 'x', 0.02, 3);
        lerp(this.legL.hip.rotation, 'x', 0, 3);
        lerp(this.legR.hip.rotation, 'x', 0, 3);
        lerp(this.pelvis.position, 'y', 1.0, 3);
        this._jawT = 0.03;
        break;
      }
      default: { // idle：站着，偶尔望海
        this.phase += dt * 0.8;
        lerp(this.torso.rotation, 'x', 0.32);
        lerp(this.neck.rotation, 'x', 0.4 + Math.sin(P * 0.35) * 0.1);
        lerp(this.armL.shoulder.rotation, 'x', 0.02);
        lerp(this.armR.shoulder.rotation, 'x', 0.02);
        lerp(this.legL.hip.rotation, 'x', 0);
        lerp(this.legR.hip.rotation, 'x', 0);
        lerp(this.pelvis.position, 'y', 0.96);
        this._jawT = 0.05;
      }
    }
  }

  /** 头部世界坐标（视奸相机挂点） */
  headWorldPos(target) {
    return this.head.getWorldPosition(target ?? new THREE.Vector3());
  }
}
