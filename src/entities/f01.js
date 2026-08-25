// F01「井身者」：可信的中年酒店维修工 + 三口"井"（左眼/右眼/口腔）
// Canon 要点：
//   · 6m 外：他只是一个还在上班的人——深色的眼窝、微张的嘴，没有任何怪物特征。
//   · 2m 内：往他眼里看——那不是眼球，是向内延伸的井。内壁一圈一圈往下退，
//     井口比井身窄（几何上真实的"里面比外面大"），最深处有一线不该存在的水光。
//   · 禁止：黑贴图破洞 / 发光眼 / 僵尸步态。井必须是真实向内的多层深度几何。
// 技术：雕刻头在眼位/口位删除面片开出真孔 → 孔内接 BackSide 反锥井壁（越深越宽）
//        + 递进环圈 + 井底吸光盖 + 水光点。所有几何真实存在于头颅内部。
import * as THREE from 'three';
import { Humanoid, sculptHeadGeometry } from './humanoid.js';

/**
 * 在几何上开真孔：删除中心落在任一 hole 球域内的三角形
 * holes: [{x,y,z,r}] 头局部坐标
 */
function punchHoles(geo, holes) {
  const src = geo.index ? geo.toNonIndexed() : geo;
  const pos = src.attributes.position;
  const norm = src.attributes.normal;
  const uv = src.attributes.uv;
  const keepPos = [], keepNorm = [], keepUv = [];
  const c = new THREE.Vector3();
  for (let f = 0; f < pos.count; f += 3) {
    c.set(
      (pos.getX(f) + pos.getX(f + 1) + pos.getX(f + 2)) / 3,
      (pos.getY(f) + pos.getY(f + 1) + pos.getY(f + 2)) / 3,
      (pos.getZ(f) + pos.getZ(f + 1) + pos.getZ(f + 2)) / 3
    );
    let inside = false;
    for (const h of holes) {
      const dx = c.x - h.x, dy = c.y - h.y, dz = c.z - h.z;
      if (dx * dx + dy * dy + dz * dz < h.r * h.r) { inside = true; break; }
    }
    if (inside) continue;
    for (let k = 0; k < 3; k++) {
      keepPos.push(pos.getX(f + k), pos.getY(f + k), pos.getZ(f + k));
      keepNorm.push(norm.getX(f + k), norm.getY(f + k), norm.getZ(f + k));
      if (uv) keepUv.push(uv.getX(f + k), uv.getY(f + k));
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(keepPos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(keepNorm, 3));
  if (uv) out.setAttribute('uv', new THREE.Float32BufferAttribute(keepUv, 2));
  return out;
}

/**
 * 一口"井"：从孔口向头颅内部延伸。
 * 反锥井身（口径 rMouth < 井腹 rBelly：几何上里面比外面大）+ 递进环 + 井底 + 水光。
 * 返回 group（+z 朝外即孔口方向），及供动画用的 glint。
 */
function makeWell(M, { rMouth = 0.012, rBelly = 0.02, depth = 0.15, rings = 6 } = {}) {
  const g = new THREE.Group();

  // 井壁：LatheGeometry 侧影——口窄腹宽再缓收，BackSide 只从内部可见
  const prof = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const t = i / N;                    // 0 井口 → 1 井底
    const belly = Math.sin(Math.min(1, t * 1.5) * Math.PI * 0.5);
    const r = rMouth + (rBelly - rMouth) * belly * (1 - t * 0.25);
    prof.push(new THREE.Vector2(Math.max(0.004, r), -t * depth));
  }
  const wallGeo = new THREE.LatheGeometry(prof, 24);
  // Lathe 侧影沿 -Y 展开；rotateX(+π/2) 把 -Y 映射到 -z：开口在 z=0，井身真实伸向头颅内部
  wallGeo.rotateX(Math.PI / 2);
  const wall = new THREE.Mesh(wallGeo, M.wellWall);
  g.add(wall);

  // 递进环圈：井壁的"砌层"，间距越深越大——透视被打乱，读作更深
  for (let i = 1; i <= rings; i++) {
    const t = Math.pow(i / (rings + 0.5), 1.35);
    const belly = Math.sin(Math.min(1, t * 1.5) * Math.PI * 0.5);
    const r = (rMouth + (rBelly - rMouth) * belly * (1 - t * 0.25)) * 0.94;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.0016 + t * 0.0012, 6, 22), M.wellRing);
    ring.position.z = -t * depth;
    g.add(ring);
  }

  // 井底：吃光的盖
  const cap = new THREE.Mesh(new THREE.CircleGeometry(rBelly * 0.85, 20), M.wellDeep);
  cap.position.z = -depth + 0.002;
  g.add(cap);

  // 井底水光：一线比井底更远的反光（2m 内才可辨）
  const glint = new THREE.Mesh(new THREE.CircleGeometry(rMouth * 0.22, 10), M.wellGlint);
  glint.position.set(rMouth * 0.1, -rMouth * 0.15, -depth + 0.004);
  g.add(glint);

  // 井口箍圈：封住孔缘与井壁的接缝（湿的软组织色）
  const grommet = new THREE.Mesh(new THREE.TorusGeometry(rMouth * 1.05, 0.0028, 8, 22), M.wellRing);
  grommet.position.z = 0.001;
  g.add(grommet);

  return { group: g, glint };
}

export class F01Body extends Humanoid {
  constructor(M) {
    super(M, {
      role: 'f01',
      hair: 'side',
      tool: 'rag',
      noEyes: true,
      seed: 20031107,
      headOpts: {
        browHeavy: 1.25,   // 厚重的眉弓压住眼窝
        socketDepth: 1.35, // 更深的窝——远看只是"眼窝深的人"
        cheekHollow: 0.72,
        ageSag: 0.85,
        chinSize: 0.9,
        jawWidth: 0.95,
        segW: 96, segH: 72, // 高分段：井口孔缘更圆
      },
    });

    // ---- 用开孔头替换原雕刻头 ----
    const headOpts = this.opts.headOpts;
    const raw = sculptHeadGeometry(headOpts);
    // 孔位（头局部）：与 humanoid 眼锚一致；口比正常唇缝略低略开
    const eyeL = { x: -0.0295, y: 0.008, z: 0.0782, r: 0.0125 };
    const eyeR = { x: 0.0295, y: 0.008, z: 0.0782, r: 0.0125 };
    const mouth = { x: 0, y: -0.0455, z: 0.0865, r: 0.0135 };
    const punched = punchHoles(raw, [eyeL, eyeR, mouth]);
    this.headMesh.geometry.dispose();
    this.headMesh.geometry = punched;

    // ---- 三口井 ----
    // 眼井：略朝内下倾——井身沉进颅腔，不越界
    this.wellL = makeWell(M, { rMouth: 0.0122, rBelly: 0.021, depth: 0.145, rings: 6 });
    this.wellL.group.position.set(eyeL.x, eyeL.y + 0.001, eyeL.z - 0.002);
    this.wellL.group.rotation.set(0.1, 0.12, 0);
    this.head.add(this.wellL.group);

    this.wellR = makeWell(M, { rMouth: 0.0122, rBelly: 0.021, depth: 0.145, rings: 6 });
    this.wellR.group.position.set(eyeR.x, eyeR.y + 0.001, eyeR.z - 0.002);
    this.wellR.group.rotation.set(0.1, -0.12, 0);
    this.head.add(this.wellR.group);

    // 口腔井：更宽更深，向咽喉方向斜落
    this.wellM = makeWell(M, { rMouth: 0.0132, rBelly: 0.026, depth: 0.16, rings: 7 });
    this.wellM.group.position.set(mouth.x, mouth.y, mouth.z - 0.002);
    this.wellM.group.rotation.set(-0.28, 0, 0); // 向下沉进颈腔
    this.head.add(this.wellM.group);

    this._wellT = 0;
    this._nearAmt = 0;
  }

  /** F01 没有发光的眼。警戒强度只让井底的水光"活"起来。 */
  setEyeIntensity(v) {
    this._eyeI = v;
  }

  /**
   * 井的近距表现：2m 内水光缓慢晃动（井底有水，而且在动）
   * @param dist 玩家距离
   */
  updateWells(dist, dt) {
    this._wellT += dt;
    const near = THREE.MathUtils.clamp((6 - dist) / 4, 0, 1); // 6m 开始，2m 满
    this._nearAmt += (near - this._nearAmt) * Math.min(1, dt * 3);
    const a = this._nearAmt;
    const sway = Math.sin(this._wellT * 0.8) * 0.0012 * a;
    const alertBoost = Math.min(1, (this._eyeI ?? 0) / 3);
    for (const w of [this.wellL, this.wellR, this.wellM]) {
      w.glint.position.x = sway + Math.sin(this._wellT * 1.7 + w.glint.id) * 0.0008 * a;
      const s = 0.7 + a * 0.9 + alertBoost * 0.8;
      w.glint.scale.setScalar(s);
      w.glint.visible = a > 0.02 || alertBoost > 0.1;
    }
  }
}

export { punchHoles, makeWell };
