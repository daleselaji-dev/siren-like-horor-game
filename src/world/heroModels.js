// Blender 细模英雄件（bpy 管线 → gltfpack meshopt GLB → ?inline 内联 → 运行时装配）
// 四件：司仪(祠像)/侍应(迎宾)/守夜镇民(车站)/湿客(床单巷)——
// 全部是「站在那里的普通人」，2 米内才读出不对劲；微动画只有三种：
// 呼吸、极慢的转头、以及「你看着它时它不动」。
// GLB 以 base64 内联进 bundle：dev/verify(http) 与 Electron(file://) 三端同路径，零 fetch。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import emceeUri from '../assets/models/emcee.glb?inline';
import waiterUri from '../assets/models/waiter.glb?inline';
import townsmanUri from '../assets/models/townsman.glb?inline';
import wetguestUri from '../assets/models/wetguest.glb?inline';
import seagodUri from '../assets/models/seagod.glb?inline';

function dataUriToBuffer(uri) {
  const b64 = uri.slice(uri.indexOf(',') + 1);
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8.buffer;
}

const URIS = { emcee: emceeUri, waiter: waiterUri, townsman: townsmanUri, wetguest: wetguestUri, seagod: seagodUri };

export class HeroFigures {
  constructor(scene, world, hud) {
    this.scene = scene;
    this.world = world;
    this.hud = hud;
    this.ready = 0;        // 已装配数（verify 断言）
    this.figures = [];
    this.seen = {};        // 首次接近字幕（once）
    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();

    const HI = world.dynamic.hotelInfo;
    const hx = HI?.origin.x ?? 0, hb = HI?.origin.y ?? 0, hz = HI?.origin.z ?? 0;
    // —— 摆位表（世界坐标；face=看向的点；track=转头行为）——
    // r20 游戏内可读性：r19 复盘——固定机位中近景里五件读成「黑管/无五官」。
    // 三个根：①守夜人/侍应完全没有实用光，只吃半球底光；②环反射 0.55 太弱，
    // 阴面死黑；③没有轮廓光，深色衣料剪影融进夜景。逐件补「实用键光 + 冷轮
    // 廓光」（rim 从背向面方向的反侧上方打），全部进灯光预算调度，远了自动灭。
    this.defs = [
      {
        key: 'townsman', label: '守夜的人',
        pos: [62.2, 5.4], face: [110, 16], track: 'slow', trackR: 7,
        sub: '站台边守夜的人没有看车。他看的是海。', subR: 6.5,
        // 站台灯的冷白洒下来（同款 0xd8e4dc）：斗笠下的脸才有明暗
        light: { color: 0xd8e4dc, intensity: 2.6, dist: 6, dy: 2.35, dxz: [1.1, 0.5] },
        rim: { color: 0x8fb4c8, intensity: 2.4, dist: 4.5, dy: 1.9 },
      },
      {
        // 大新照相馆橱窗内的「立牌人形」——照相馆不做人形立牌。
        // 这张脸，之后你会在宴会厅的台上再见到一次。
        key: 'emcee', label: '橱窗里的像',
        pos: [15.35, 1.18], face: [15.35, -2.5], track: 'unseen', trackR: 7, dusty: true,
        groundAt: [14, 2.8], yOff: 0.44, // 照相馆抬高木地板：以铺面基座地面为准

        sub: '橱窗里立着个人形：中山装，红袖章，落着灰。大新照相不做人形立牌。', subR: 4.5,
        // r20：键光从头顶正上挪到脸前上方 45°（顶光把眶窝/人中打成黑洞）
        light: { color: 0xffb066, intensity: 3.2, dist: 4.5, dy: 1.9, dxz: [0.25, -1.1] },
        rim: { color: 0x9fb4c8, intensity: 2.0, dist: 4, dy: 2.0 },
      },
      {
        key: 'waiter', label: '迎宾的侍应',
        pos: [hx + 5.9, hz + 8.4], y: hb, face: [hx + 3.0, hz + 5.2], track: 'none',
        sub: '迎宾的侍应鞠得太低了。托盘里那只碗，擦得太亮。', subR: 5,
        // 大堂门灯的暖光从他迎宾的方向打来：白衫/黑领结/托盘立起来
        light: { color: 0xffc088, intensity: 2.6, dist: 5.5, dy: 2.1, dxz: [-1.3, -1.4] },
        rim: { color: 0x8fb4c8, intensity: 2.2, dist: 4.5, dy: 2.0 },
      },
      {
        // 场景关键件：塌祠里请出来的无面海神像（Blender bpy 细模）
        key: 'seagod', label: '无面的像', minTris: 2000, statue: true,
        pos: [-18.4, -31.4], face: [-14.5, -30.6], track: 'none',
        sub: '祠塌了，像被请出来立在道边。脸不是风磨平的——是手，一天一天，把眉眼抹掉。', subR: 4.5,
        light: { color: 0xff8a3a, intensity: 1.6, dist: 4, dy: 0.35, dxz: [0, -0.5] },
        rim: { color: 0x9fc0d4, intensity: 2.0, dist: 4.5, dy: 2.2 },
      },
      {
        key: 'wetguest', label: '数床单的人',
        pos: [17.55, -25.45], face: [17.55, -24.6], track: 'creep', trackR: 6, needLeak: true,
        sub: '床单巷里多了一个人。他面对着床单站着，离布只有一拳。别打扰他数。', subR: 6,
        light: { color: 0x5a7a86, intensity: 1.8, dist: 5, dy: 2.2, dxz: [0, -1.2] },
        rim: { color: 0x7da4b8, intensity: 2.6, dist: 4.5, dy: 1.85 },
      },
    ];

    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    for (const def of this.defs) this._load(loader, def);
  }

  _load(loader, def) {
    loader.parse(dataUriToBuffer(URIS[def.key]), '', (gltf) => {
      const root = gltf.scene;
      const gy = def.y ?? (def.groundAt
        ? this.world.heightAt(def.groundAt[0], def.groundAt[1]) + (def.yOff ?? 0)
        : this.world.heightAt(def.pos[0], def.pos[1]));
      root.position.set(def.pos[0], gy, def.pos[1]);
      root.rotation.y = Math.atan2(def.face[0] - def.pos[0], def.face[1] - def.pos[1]);
      let tris = 0;
      root.traverse((o) => {
        if (!o.isMesh) return;
        tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
        o.castShadow = true;
        o.receiveShadow = true;
        const m = o.material;
        if (m) {
          // r20：0.55→1.0——夜景环反射是阴面唯一的补光来源，0.55 时
          // 深色衣料/背光半张脸直接读成死黑（「黑管」主因之一）
          m.envMapIntensity = 1.0;
          if (def.dusty) { // 祠像落灰三年：压彩、哑光
            if (m.color) m.color.multiply(new THREE.Color(0.80, 0.78, 0.74));
            m.roughness = Math.min(1, (m.roughness ?? 0.8) * 1.25);
          }
          if (def.key === 'wetguest') m.envMapIntensity = 1.5; // 湿皮吃反光
        }
      });
      const fig = {
        def, root, tris,
        head: root.getObjectByName('HeadPivot'),
        headBase: null, headYaw: 0, breath: Math.random() * 9,
        enabled: !def.needLeak,
      };
      if (fig.head) fig.headBase = fig.head.quaternion.clone();
      root.visible = fig.enabled;
      this.scene.add(root);
      // 人形碰撞柱（不遮视线；未到岗时关闭）
      fig.collider = { x: def.pos[0], z: def.pos[1], r: 0.28, maxY: gy + 1.9, noSightBlock: true, off: !fig.enabled };
      this.world.colliders.push(fig.collider);
      if (def.light) {
        const pl = new THREE.PointLight(def.light.color, def.light.intensity, def.light.dist, 2);
        pl.position.set(def.pos[0] + def.light.dxz[0], gy + def.light.dy, def.pos[1] + def.light.dxz[1]);
        pl.visible = false;
        this.scene.add(pl);
        this.world.lights.push(pl); // 交给灯光预算调度
        fig.light = pl;
        if (def.needLeak) { pl._base = pl.intensity; pl.intensity = 0; }
      }
      if (def.rim) {
        // 冷轮廓光：立在「面向」的反方向后上方——剪影从夜景里剥出来
        const fl = Math.hypot(def.face[0] - def.pos[0], def.face[1] - def.pos[1]) || 1;
        const bx = -(def.face[0] - def.pos[0]) / fl, bz = -(def.face[1] - def.pos[1]) / fl;
        const rl = new THREE.PointLight(def.rim.color, def.rim.intensity, def.rim.dist, 2);
        rl.position.set(def.pos[0] + bx * 1.0, gy + def.rim.dy, def.pos[1] + bz * 1.0);
        rl.visible = false;
        this.scene.add(rl);
        this.world.lights.push(rl);
        fig.rim = rl;
        if (def.needLeak) { rl._base = rl.intensity; rl.intensity = 0; }
      }
      this.figures.push(fig);
      this.ready++;
    }, (err) => console.error('[heroModels] parse failed:', def.key, err));
  }

  /** 每帧：呼吸 / 转头读法 / 首见字幕。ctx: { player, dt, leaked, camera, state } */
  update(ctx) {
    const { player, dt } = ctx;
    for (const fig of this.figures) {
      const def = fig.def;
      // 返潮点火后湿客才「到岗」
      if (def.needLeak && !fig.enabled && ctx.leaked) {
        fig.enabled = true;
        fig.root.visible = true;
        if (fig.collider) fig.collider.off = false;
        if (fig.light && fig.light._base) fig.light.intensity = fig.light._base;
        if (fig.rim && fig.rim._base) fig.rim.intensity = fig.rim._base;
      }
      if (!fig.enabled) continue;
      const dx = player.pos.x - fig.root.position.x;
      const dz = player.pos.z - fig.root.position.z;
      const d = Math.hypot(dx, dz);

      // 呼吸：活人有，祠像与湿客没有（不喘气这件事本身就是读法）
      fig.breath += dt;
      if (def.key === 'townsman' || def.key === 'waiter') {
        const k = 1 + Math.sin(fig.breath * 1.35) * 0.004;
        fig.root.scale.set(1, k, 1);
      }

      // 转头
      if (fig.head && def.track !== 'none') {
        let targetYaw = 0;
        const local = Math.atan2(dx, dz) - fig.root.rotation.y; // 玩家在其面向系的方位
        const norm = Math.atan2(Math.sin(local), Math.cos(local));
        const inR = d < (def.trackR ?? 6) && Math.abs(player.pos.y - fig.root.position.y) < 2.5;
        let speed = 0;
        if (def.track === 'slow' && inR) { targetYaw = THREE.MathUtils.clamp(norm, -0.65, 0.65); speed = 0.5; }
        else if (def.track === 'creep' && inR) { targetYaw = THREE.MathUtils.clamp(norm, -0.9, 0.9); speed = 0.11; }
        else if (def.track === 'unseen' && inR && ctx.camera) {
          // 祠像：只在你没看它的时候转。回头看，它停在半途。
          ctx.camera.getWorldDirection(this._v);
          const toFig = Math.atan2(-dx, -dz); // 玩家→像 的朝向
          const camYaw = Math.atan2(this._v.x, this._v.z);
          const off = Math.abs(Math.atan2(Math.sin(toFig - camYaw), Math.cos(toFig - camYaw)));
          if (off > 1.15) { targetYaw = THREE.MathUtils.clamp(norm, -0.4, 0.4); speed = 0.35; }
          else { targetYaw = fig.headYaw; speed = 0; } // 被注视：冻结在半途
        } else if (!inR) { targetYaw = 0; speed = 0.3; }
        if (speed > 0) {
          const dy = targetYaw - fig.headYaw;
          const step = Math.sign(dy) * Math.min(Math.abs(dy), speed * dt);
          fig.headYaw += step;
        }
        fig.head.quaternion.copy(fig.headBase);
        this._q.setFromAxisAngle(HEAD_UP, fig.headYaw);
        fig.head.quaternion.multiply(this._q);
      }

      // 首见字幕
      if (!this.seen[def.key] && d < def.subR && ctx.state === 'PLAY') {
        this.seen[def.key] = true;
        this.hud.subtitle(def.sub, 5.5, def.key === 'wetguest' ? 'song' : null);
      }
    }
  }
}

const HEAD_UP = new THREE.Vector3(0, 1, 0);
