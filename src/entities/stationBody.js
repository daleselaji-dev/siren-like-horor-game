// 工位 GLB 身体（P0 双轨归一）：Blender bpy 细模直接站上 gameplay 工位——
// 报数员(emcee_stage.glb 持麦变体)、宴会厅/大堂/服务走廊侍应(waiter.glb)、
// 理册婆(matron.glb 第三眼)。对 Enemy 暴露与 Humanoid 相同的最小接口：
//   group / neck / torso / animate(mode,dt,speed) / setEyeIntensity / headWorldPos
// —— neck/torso 是「动画偏置代理」（rotation 语义与 Humanoid 一致：静止=0），
// 视奸 viewYawPitch 口径不变；真正的摆动写进 GLB 内嵌的关节 pivot 空节点
// （TorsoPivot/ArmPivotL/R/LegPivotL/R/HeadPivot：旋转≈基姿、位置即关节点），
// 每帧「基姿四元数 × 摆动欧拉」合成。直腿钟摆步态没有膝，读成蚀湾员工那种
// 「太规整」的碎步——细模的身体，Humanoid 的灵魂。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { Humanoid } from './humanoid.js';
import emceeStageUri from '../assets/models/emcee_stage.glb?inline';
import waiterUri from '../assets/models/waiter.glb?inline';
import matronUri from '../assets/models/matron.glb?inline';

function dataUriToBuffer(uri) {
  const b64 = uri.slice(uri.indexOf(',') + 1);
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8.buffer;
}

const URIS = { emcee_stage: emceeStageUri, waiter: waiterUri, matron: matronUri };
let _loader = null;
const _parsed = {};
/** 同键 GLB 只解析一次（三名侍应共享几何与材质），实例克隆节点树 */
function loadGlb(key) {
  if (!_parsed[key]) {
    if (!_loader) {
      _loader = new GLTFLoader();
      _loader.setMeshoptDecoder(MeshoptDecoder);
    }
    _parsed[key] = new Promise((resolve, reject) => {
      _loader.parse(dataUriToBuffer(URIS[key]), '', (g) => resolve(g.scene), reject);
    });
  }
  return _parsed[key].then((scene) => scene.clone(true));
}

// 每工位的读法配置：模型键 / 步态与手臂锁 / 实用键光与轮廓光（进灯光预算，随人走）
// lockArmR：持麦臂焊死在口缝前；clasped：拢手对（两臂只做等角 X 摆——
// 绕平行 X 轴的等角旋转保持双手相对位形，「拢着的手整对抬起来对你」）
const ROLECFG = {
  emcee: {
    key: 'emcee_stage', lockArmR: true,
    light: { color: 0xffb066, intensity: 3.0, dist: 5.0, dy: 1.95, fwd: 0.85, side: 0.35 },
    rim: { color: 0x8fb4c8, intensity: 2.2, dist: 4.5, dy: 2.05, fwd: -1.0, side: 0 },
  },
  waiter: {
    key: 'waiter', conveyor: true,
    light: { color: 0xffc088, intensity: 2.5, dist: 4.5, dy: 2.0, fwd: 0.8, side: -0.35 },
  },
  matron: {
    key: 'matron', clasped: true,
    light: { color: 0xd8b490, intensity: 2.5, dist: 4.5, dy: 1.9, fwd: 0.85, side: 0.3 },
    rim: { color: 0x8fb4c8, intensity: 1.8, dist: 4.0, dy: 1.85, fwd: -0.9, side: 0 },
  },
};

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();

export class StationBody {
  /** kind: 'emcee' | 'waiter' | 'matron'（def.glbStation） */
  constructor(scene, world, kind, role) {
    this.cfg = ROLECFG[kind];
    this.kind = kind;
    this.role = role;
    this.scene = scene;
    this.world = world;
    this.group = new THREE.Group();
    this.loaded = false;
    this.tris = 0;

    // 动画偏置代理（Enemy.viewYawPitch 读 rotation.x——语义与 Humanoid 相同：静止=0）
    this.neck = new THREE.Group();
    this.torso = new THREE.Group();

    this.eyeIntensity = 0.7;
    this.phase = Math.random() * Math.PI * 2;
    this.lifeT = Math.random() * 9;
    this.gazeOn = 0;
    this.gzY = 0;
    this.alertShudder = 0;
    // 摆动状态（每帧向目标指数趋近，再合成到 pivot 四元数上）
    this.s = { tx: 0, tz: 0, hx: 0, hy: 0, alx: 0, alz: 0, arx: 0, arz: 0, llx: 0, lrx: 0, bob: 0 };

    loadGlb(this.cfg.key).then((root) => this._assemble(root))
      .catch((err) => console.error('[stationBody] parse failed:', kind, err));
  }

  _assemble(root) {
    this.model = root;
    root.traverse((o) => {
      if (!o.isMesh) return;
      this.tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
      o.castShadow = true;
      o.receiveShadow = true;
      if (o.material) o.material.envMapIntensity = 1.0; // 与英雄件同口径：夜景环反射是阴面唯一补光
    });
    this.pv = {
      torso: root.getObjectByName('TorsoPivot'),
      head: root.getObjectByName('HeadPivot'),
      armL: root.getObjectByName('ArmPivotL'),
      armR: root.getObjectByName('ArmPivotR'),
      legL: root.getObjectByName('LegPivotL'),
      legR: root.getObjectByName('LegPivotR'),
    };
    this.base = {};
    for (const k in this.pv) if (this.pv[k]) this.base[k] = this.pv[k].quaternion.clone();
    this.head = this.pv.head;

    // 眼点冷光：挂在 EyeAnchorL/R（随 HeadPivot 转头）；常态熄灭，警戒才亮——
    // 与 Humanoid setEyeIntensity 同一读法（潮光是湿反光，v>1 才上亮）
    this.eyeDots = [];
    for (const name of ['EyeAnchorL', 'EyeAnchorR']) {
      const anchor = root.getObjectByName(name);
      if (!anchor) continue;
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.0085, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0x9fd8e8, transparent: true, opacity: 0, depthWrite: false }),
      );
      dot.position.z = 0.004; // 出瞳一线，防与眼球面 z-fight
      dot.renderOrder = 3;
      dot.userData.noShadow = true;
      anchor.add(dot);
      this.eyeDots.push(dot);
    }

    this.group.add(root);
    this.loaded = true;
    this._applyEye();

    // 实用键光（+可选轮廓光）：世界坐标随人每帧走，进灯光预算（近了才点亮）
    const mkLight = (spec) => {
      const pl = new THREE.PointLight(spec.color, spec.intensity, spec.dist, 2);
      pl.visible = false;
      this.scene.add(pl);
      this.world.lights.push(pl);
      return pl;
    };
    if (this.cfg.light) this.keyLight = mkLight(this.cfg.light);
    if (this.cfg.rim) this.rimLight = mkLight(this.cfg.rim);
    this._syncLights();
  }

  setEyeIntensity(v) {
    this.eyeIntensity = v;
    this._applyEye();
  }

  _applyEye() {
    if (!this.eyeDots) return;
    const op = Math.max(0, Math.min(0.9, (this.eyeIntensity - 1.0) * 0.5));
    for (const d of this.eyeDots) {
      d.material.opacity = op;
      d.visible = op > 0.02;
    }
  }

  headWorldPos(target) {
    target = target ?? new THREE.Vector3();
    if (this.head) return this.head.getWorldPosition(target);
    // GLB 未装配完的兜底：站高估读（三件都在 1.45-1.55m 档）
    return target.copy(this.group.position).setY(this.group.position.y + 1.5);
  }

  _syncLights() {
    const yaw = this.group.rotation.y;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const sx = fz, sz = -fx;
    const p = this.group.position;
    const put = (pl, spec) => {
      pl.position.set(
        p.x + fx * spec.fwd + sx * spec.side,
        p.y + spec.dy,
        p.z + fz * spec.fwd + sz * spec.side,
      );
    };
    if (this.keyLight) put(this.keyLight, this.cfg.light);
    if (this.rimLight) put(this.rimLight, this.cfg.rim);
  }

  animate(mode, dt, speed = 1) {
    this.lifeT += dt;
    if (!this.loaded) return;
    const s = this.s;
    const lerp = (k, v, r = 8) => { s[k] += (v - s[k]) * Math.min(1, dt * r); };
    const conveyor = !!this.cfg.conveyor;

    // ---- 被盯感：3.5m 内且在其面前时，头缓缓转向观察者（死魂曲式）。
    // 侍应不转——它的头是「垂着挂在那里」的；婆与报数员会慢慢把脸给你
    let hasGaze = 0;
    if (!conveyor) {
      _v.copy(Humanoid.viewer);
      this.group.worldToLocal(_v);
      const gd = Math.hypot(_v.x, _v.z);
      if (gd > 0.3 && gd < 3.5 && _v.z > gd * 0.12) {
        hasGaze = 1;
        this.gzY = Math.max(-0.55, Math.min(0.55, Math.atan2(_v.x, _v.z)));
      }
    }
    this.gazeOn += (hasGaze - this.gazeOn) * Math.min(1, dt * 2.2);

    switch (mode) {
      case 'walk': {
        if (conveyor) {
          // 侍应传送带步态：骨盆水平如轨道、小碎步、托盘臂锁死、右臂不摆、头保持垂挂
          this.phase += dt * 7.2 * speed;
          const sw = Math.sin(this.phase);
          lerp('llx', sw * 0.30, 16); lerp('lrx', -sw * 0.30, 16);
          lerp('tx', 0, 8); lerp('tz', 0, 10);
          lerp('hx', 0, 8);
          lerp('alx', 0, 12); lerp('arx', 0, 12); lerp('alz', 0, 12); lerp('arz', 0, 12);
          lerp('bob', 0, 20);
        } else {
          this.phase += dt * 5.0 * speed;
          const sw = Math.sin(this.phase);
          lerp('llx', sw * 0.42, 12); lerp('lrx', -sw * 0.42, 12);
          if (this.cfg.clasped) { // 理册婆：拢着手碎步——手不摆
            lerp('alx', 0, 8); lerp('arx', 0, 8);
          } else {
            lerp('alx', -sw * 0.26, 8);
            lerp('arx', this.cfg.lockArmR ? 0 : sw * 0.26, 8);
          }
          lerp('alz', 0, 8); lerp('arz', 0, 8);
          lerp('tx', 0.08); lerp('tz', sw * 0.03);
          lerp('hx', 0.04);
          lerp('bob', Math.abs(Math.cos(this.phase)) * 0.020 - 0.008, 12);
        }
        break;
      }
      case 'chase': {
        if (conveyor) {
          // 侍应追击：碎步提频 + 前倾；垂挂的头「抬起来看你」——只在追你时
          this.phase += dt * 7.2 * Math.max(1.35, speed * 1.3);
          const sw = Math.sin(this.phase);
          lerp('llx', sw * 0.34, 16); lerp('lrx', -sw * 0.34, 16);
          lerp('tx', 0.16, 8);
          lerp('hx', -0.34, 6);
          lerp('alx', 0, 12); lerp('arx', 0, 12);
          lerp('bob', 0, 20);
        } else {
          this.phase += dt * 8.2 * Math.max(1, speed);
          const sw = Math.sin(this.phase);
          lerp('llx', sw * 0.58, 14); lerp('lrx', -sw * 0.58, 14);
          if (this.cfg.clasped) { // 拢着的手整对端平抬起、直直向你——不摆不散
            lerp('alx', -1.05, 10); lerp('arx', -1.05, 10);
            lerp('alz', 0, 10); lerp('arz', 0, 10);
          } else {
            lerp('alx', -1.1 + sw * 0.15, 10);
            lerp('arx', this.cfg.lockArmR ? 0 : -1.1 - sw * 0.15, 10);
            lerp('alz', 0.16, 10); lerp('arz', this.cfg.lockArmR ? 0 : -0.16, 10);
          }
          lerp('tx', 0.30, 10); lerp('tz', sw * 0.06, 10);
          lerp('hx', -0.26, 10);
          lerp('bob', Math.abs(Math.cos(this.phase)) * 0.03 - 0.022, 12);
        }
        break;
      }
      case 'alert': {
        this.alertShudder += dt * 36;
        lerp('tx', 0.06, 10); lerp('tz', 0, 10);
        lerp('hx', (conveyor ? -0.22 : -0.10) + Math.sin(this.alertShudder) * 0.012, 14);
        lerp('alx', conveyor ? 0 : -0.10, 10);
        lerp('arx', (conveyor || this.cfg.lockArmR) ? 0 : -0.10, 10);
        lerp('alz', 0, 10); lerp('arz', 0, 10);
        lerp('llx', 0, 10); lerp('lrx', 0, 10);
        lerp('bob', 0.012, 10);
        break;
      }
      case 'grab': {
        this.phase += dt * 6;
        if (conveyor) {
          // 侍应=引座：欠身+右臂摊掌向席；托盘臂纹丝不动（水平不洒）
          lerp('tx', 0.30, 10);
          lerp('hx', -0.24, 10);
          lerp('arx', -1.15, 12); lerp('arz', -0.4, 12);
          lerp('alx', 0, 12); lerp('alz', 0, 12);
          lerp('bob', -0.02, 10);
        } else if (this.cfg.clasped) {
          // 理册婆扑抓：拢着的手整对压向你（等角 X——手对不散），头埋下来读你
          const tw = Math.sin(this.phase * 3) * 0.04;
          lerp('tx', 0.46, 12);
          lerp('hx', -0.42, 12);
          lerp('alx', -1.5 + tw, 14); lerp('arx', -1.5 + tw, 14);
          lerp('alz', 0, 12); lerp('arz', 0, 12);
          lerp('bob', 0.02, 10);
        } else {
          const tw = Math.sin(this.phase * 3) * 0.04;
          lerp('tx', 0.46, 12);
          lerp('hx', -0.42, 12);
          lerp('alx', -1.55 + tw, 14);
          lerp('arx', this.cfg.lockArmR ? 0 : -1.55 - tw, 14);
          lerp('alz', 0.22, 12); lerp('arz', this.cfg.lockArmR ? 0 : -0.22, 12);
          lerp('bob', 0.02, 10);
        }
        break;
      }
      case 'backstep': {
        // 理册婆（镁光后坐）：面朝你倒退，头完全不动
        this.phase += dt * 3.6 * speed;
        const sw = Math.sin(this.phase);
        lerp('llx', -sw * 0.30, 10); lerp('lrx', sw * 0.30, 10);
        lerp('tx', -0.02, 8); lerp('hx', 0, 12);
        lerp('alx', -0.1, 6); lerp('arx', -0.1, 6);
        lerp('alz', 0, 8); lerp('arz', 0, 8);
        lerp('bob', -0.004, 8);
        break;
      }
      case 'mc': {
        // 报数员：右手麦贴钙化口缝（GLB 基姿烧死），左臂周期抬起「宣布」——
        // 声先于手势；宣布到顶时头随之微昂
        this.phase += dt * 0.8;
        const announce = Math.max(0, Math.sin(this.phase * 0.5 - 1.2)) ** 3;
        lerp('alx', -0.2 - announce * 1.05, 5);
        lerp('alz', 0.12 + announce * 0.38, 5);
        lerp('arx', 0, 5); lerp('arz', 0, 5);
        lerp('tx', 0.02 + Math.sin(this.lifeT * 1.7) * 0.004, 4);
        lerp('hx', -announce * 0.05, 5);
        lerp('llx', 0, 4); lerp('lrx', 0, 4);
        lerp('bob', 0, 6);
        break;
      }
      default: { // idle / post / watch：站定，重心慢移 + 呼吸微起伏（侍应刻意几乎不呼吸）
        this.phase += dt * 0.8;
        const br = conveyor ? 0.001 : 0.004;
        lerp('tx', 0.02 + Math.sin(this.lifeT * 1.7) * br, 5);
        lerp('tz', Math.sin(this.phase * 0.5) * 0.012, 4);
        lerp('hx', 0.02, 5);
        lerp('alx', 0, 5); lerp('arx', 0, 5);
        lerp('alz', 0, 5); lerp('arz', 0, 5);
        lerp('llx', 0, 5); lerp('lrx', 0, 5);
        lerp('bob', 0, 6);
      }
    }

    // 头部转向观察者（yaw）：alert/chase 时身体已在转，凝视权重让位
    const gzTarget = (mode === 'chase' || mode === 'grab') ? 0 : this.gzY * this.gazeOn;
    this.s.hy += (gzTarget - this.s.hy) * Math.min(1, dt * 1.6);

    this._applyPose();
    this._syncLights();

    // 动画偏置代理同步（Enemy.viewYawPitch 口径：静止=0 的增量）
    this.torso.rotation.x = s.tx;
    this.neck.rotation.x = s.hx;
  }

  _applyPose() {
    const s = this.s;
    const put = (pv, baseQ, x, y, z) => {
      if (!pv) return;
      _e.set(x, y, z);
      _q.setFromEuler(_e);
      pv.quaternion.copy(baseQ).multiply(_q);
    };
    put(this.pv.torso, this.base.torso, s.tx, 0, s.tz);
    put(this.pv.head, this.base.head, s.hx, s.hy, 0);
    put(this.pv.armL, this.base.armL, s.alx, 0, s.alz);
    put(this.pv.armR, this.base.armR, s.arx, 0, s.arz);
    put(this.pv.legL, this.base.legL, s.llx, 0, 0);
    put(this.pv.legR, this.base.legR, s.lrx, 0, 0);
    this.model.position.y = s.bob;
  }
}
