// 程序化人形：分层骨架(Group 枢轴) + 程序动画
// 潮尸剪影规范（美术圣经）：微驼、头略垂、臂下沉、喉部鼓起、眼窝一点冷光
import * as THREE from 'three';

export class Humanoid {
  /**
   * @param M 材质库
   * @param opts { cloth:'navy'|'grey'|'red', hat:boolean, lantern:boolean, tool:'net'|'rake'|null, light:boolean }
   */
  constructor(M, opts = {}) {
    this.opts = opts;
    const cloth = opts.cloth === 'red' ? M.clothRed : opts.cloth === 'grey' ? M.clothGrey : M.clothNavy;
    const skin = M.corpseSkin;

    this.group = new THREE.Group();

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

    // ---- 躯干 ----
    // 上衣(略前倾驼背由动画控制)
    this.torso.add(mkMesh(new THREE.CylinderGeometry(0.16, 0.21, 0.62, 8), cloth, 0, 0.28, 0));
    // 肩
    this.torso.add(mkMesh(new THREE.SphereGeometry(0.1, 8, 6), cloth, -0.21, 0.52, 0));
    this.torso.add(mkMesh(new THREE.SphereGeometry(0.1, 8, 6), cloth, 0.21, 0.52, 0));
    // 下摆/裤
    this.pelvis.add(mkMesh(new THREE.CylinderGeometry(0.2, 0.23, 0.25, 8), cloth, 0, 0.0, 0));

    // ---- 头 ----
    const headMesh = mkMesh(new THREE.SphereGeometry(0.115, 10, 8), skin, 0, 0.1, 0, 1, 1.15, 1.05);
    this.head.add(headMesh);
    // 喉部鼓起（灌满海水）——会缓慢地吞咽
    this.throat = mkMesh(new THREE.SphereGeometry(0.055, 8, 6), skin, 0, -0.045, 0.055, 1, 1.3, 1);
    this.head.add(this.throat);
    // 眼窝冷光
    const eyeGeo = new THREE.SphereGeometry(0.016, 6, 6);
    this.eyeL = mkMesh(eyeGeo, M.eyeGlow.clone(), -0.045, 0.115, 0.098);
    this.eyeR = mkMesh(eyeGeo, M.eyeGlow.clone(), 0.045, 0.115, 0.098);
    this.eyeL.material.color.setHex(0x9fd8e8);
    this.eyeR.material = this.eyeL.material;
    this.head.add(this.eyeL); this.head.add(this.eyeR);
    // 斗笠
    if (opts.hat) {
      this.head.add(mkMesh(new THREE.ConeGeometry(0.24, 0.12, 10), M.wood, 0, 0.24, 0));
    }

    // ---- 手臂（肩枢轴→上臂→肘枢轴→前臂+手） ----
    const mkArm = (side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.22 * side, 0.5, 0);
      this.torso.add(shoulder);
      shoulder.add(mkMesh(new THREE.CylinderGeometry(0.05, 0.045, 0.3, 7), cloth, 0, -0.15, 0));
      const elbow = new THREE.Group();
      elbow.position.y = -0.3;
      shoulder.add(elbow);
      elbow.add(mkMesh(new THREE.CylinderGeometry(0.042, 0.035, 0.28, 7), skin, 0, -0.14, 0));
      elbow.add(mkMesh(new THREE.SphereGeometry(0.05, 7, 6), skin, 0, -0.29, 0));
      return { shoulder, elbow };
    };
    this.armL = mkArm(-1);
    this.armR = mkArm(1);

    // ---- 腿（髋枢轴→大腿→膝枢轴→小腿+脚） ----
    const mkLeg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(0.1 * side, 0.02, 0);
      this.pelvis.add(hip);
      hip.add(mkMesh(new THREE.CylinderGeometry(0.075, 0.06, 0.42, 7), cloth, 0, -0.21, 0));
      const knee = new THREE.Group();
      knee.position.y = -0.42;
      hip.add(knee);
      knee.add(mkMesh(new THREE.CylinderGeometry(0.055, 0.045, 0.44, 7), skin, 0, -0.22, 0));
      knee.add(mkMesh(new THREE.BoxGeometry(0.09, 0.05, 0.2), skin, 0, -0.46, 0.05));
      return { hip, knee };
    };
    this.legL = mkLeg(-1);
    this.legR = mkLeg(1);

    // ---- 手持物 ----
    if (opts.lantern) {
      // 提灯(挂在右手)
      this.lanternG = new THREE.Group();
      const pole = mkMesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6), M.woodDark, 0, 0.1, 0);
      pole.rotation.z = Math.PI / 2.2;
      this.lanternG.add(pole);
      const paper = mkMesh(new THREE.CylinderGeometry(0.11, 0.11, 0.2, 8), M.lanternPaper, 0.22, -0.08, 0);
      this.lanternG.add(paper);
      if (opts.light !== false) {
        this.lanternLight = new THREE.PointLight(0xff8438, 7, 11, 2);
        this.lanternLight.position.set(0.22, -0.08, 0);
        this.lanternG.add(this.lanternLight);
      }
      this.lanternG.position.y = -0.29;
      this.armR.elbow.add(this.lanternG);
    }
    if (opts.tool === 'rake') {
      const tool = new THREE.Group();
      const pole = mkMesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 6), M.woodDark, 0, 0, 0);
      pole.rotation.x = 0.9;
      tool.add(pole);
      tool.add(mkMesh(new THREE.BoxGeometry(0.5, 0.05, 0.08), M.woodDark, 0, -0.55, 0.5));
      tool.position.y = -0.28;
      this.toolG = tool;
      this.armR.elbow.add(tool);
    }

    this.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });

    // 动画状态
    this.phase = Math.random() * 10;
    this.alertShudder = 0;
    this.lifeT = Math.random() * 100;  // 喉咙吞咽/火苗抖动的私有时钟
    this.twitchT = 3 + Math.random() * 6; // 下一次颈部抽动
    this.twitch = 0;
  }

  setEyeIntensity(v) {
    // v: 0.5 常态微光 → 3 警戒亮
    this.eyeL.material.color.setRGB(0.62 * v, 0.85 * v, 0.91 * v);
  }

  /**
   * 程序动画
   * @param mode 'work_net'|'work_rake'|'work_pray'|'walk'|'chase'|'alert'|'sing'|'idle'
   * @param dt 帧时长
   * @param speed 移动速度（walk/chase 步频用）
   */
  animate(mode, dt, speed = 1) {
    const P = this.phase;
    const lerp = (o, k, v, r = 8) => { o[k] += (v - o[k]) * Math.min(1, dt * r); };

    // ---- 常驻生命体征（不管在做什么都在发生） ----
    this.lifeT += dt;
    // 喉咙每隔几秒鼓动一次——里面的水在动
    const gulp = Math.max(0, Math.sin(this.lifeT * 0.9)) ** 6;
    this.throat.scale.set(1 + gulp * 0.35, 1.3 + gulp * 0.28, 1 + gulp * 0.35);
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
      this.head.rotation.z = Math.sin(this.twitch * Math.PI) * 0.22 * this.twitchSide;
    } else {
      this.head.rotation.z *= Math.max(0, 1 - dt * 8);
    }

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
        break;
      }
      case 'walk': {
        this.phase += dt * 5.2 * speed;
        const sw = Math.sin(P);
        lerp(this.torso.rotation, 'x', 0.3);           // 驼背
        lerp(this.neck.rotation, 'x', 0.45);            // 垂头
        lerp(this.pelvis.position, 'y', 0.94 + Math.abs(Math.cos(P)) * 0.02);
        lerp(this.legL.hip.rotation, 'x', sw * 0.5, 12);
        lerp(this.legR.hip.rotation, 'x', -sw * 0.5, 12);
        lerp(this.legL.knee.rotation, 'x', Math.max(0, -sw) * 0.7 + 0.1, 12);
        lerp(this.legR.knee.rotation, 'x', Math.max(0, sw) * 0.7 + 0.1, 12);
        // 臂下沉几乎不摆——“身体记得劳作，不记得走路”
        lerp(this.armL.shoulder.rotation, 'x', -sw * 0.12 + 0.05, 8);
        lerp(this.armR.shoulder.rotation, 'x', sw * 0.12 + 0.05, 8);
        lerp(this.armL.elbow.rotation, 'x', -0.15);
        lerp(this.armR.elbow.rotation, 'x', -0.15);
        lerp(this.torso.rotation, 'z', Math.sin(P) * 0.05);
        break;
      }
      case 'chase': {
        this.phase += dt * 8.5 * Math.max(1, speed);
        const sw = Math.sin(P);
        // 头后仰(喉咙朝天灌水)、双臂前探、大步踉跄
        lerp(this.torso.rotation, 'x', 0.5, 10);
        lerp(this.neck.rotation, 'x', -0.55, 10);
        lerp(this.legL.hip.rotation, 'x', sw * 0.85, 14);
        lerp(this.legR.hip.rotation, 'x', -sw * 0.85, 14);
        lerp(this.legL.knee.rotation, 'x', Math.max(0, -sw) * 1.1 + 0.15, 14);
        lerp(this.legR.knee.rotation, 'x', Math.max(0, sw) * 1.1 + 0.15, 14);
        lerp(this.armL.shoulder.rotation, 'x', -1.35 + sw * 0.15, 10);
        lerp(this.armR.shoulder.rotation, 'x', -1.35 - sw * 0.15, 10);
        lerp(this.armL.elbow.rotation, 'x', -0.35, 10);
        lerp(this.armR.elbow.rotation, 'x', -0.35, 10);
        lerp(this.pelvis.position, 'y', 0.92 + Math.abs(Math.cos(P)) * 0.05);
        lerp(this.torso.rotation, 'z', sw * 0.1, 10);
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
        // 掐住时全身高频痉挛
        this.alertShudder += dt * 46;
        this.torso.rotation.z = Math.sin(this.alertShudder) * 0.035;
        break;
      }
      case 'sing': {
        this.phase += dt * 0.7;
        // 唯一挺立的身影：头后仰对海而歌，缓慢摇摆
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
      }
    }
  }

  /** 头部世界坐标（视奸相机挂点） */
  headWorldPos(target) {
    return this.head.getWorldPosition(target ?? new THREE.Vector3());
  }
}
