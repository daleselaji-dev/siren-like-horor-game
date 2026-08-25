// 《返潮》M01 垂直切片：蚀湾「迎宾楼」千禧婚宴酒店
// 布局：前庭(蚀湾海雾锚点) → 大堂 → 保卫室 → 客房走廊(Depth 异常体) → 婚宴厅 → 后厨 → 楼梯间
// 输出：网格、碰撞体、heightAt、互动点 locations、巡逻路点 patrols、房间区域 rooms、
//        走廊加深开关 setCorridorExtended、门开关 setDoorOpen、录像机位 banquetCam、屏幕 videoScreens
import * as THREE from 'three';
import { Batcher, GEO } from './batcher.js';
import { mulberry32 } from './textures.js';
import { makeLightCone } from './materials.js';

// ---------------- 高度场 ----------------
// 室内全平 y=0；舞台 0.45；前庭台阶下 -0.45；海床向外缓降
const STAGE = { minX: -26, maxX: -21.6, minZ: -34.4, maxZ: -21.6 };

export function heightAt(x, z) {
  if (x >= STAGE.minX && x <= STAGE.maxX && z >= STAGE.minZ && z <= STAGE.maxZ) return 0.45;
  if (z <= 4) return 0;                     // 室内 + 门廊平台
  if (z < 6) return -(z - 4) / 2 * 0.45;    // 台阶坡
  if (z < 40) return -0.45;                 // 前庭
  return -0.45 - Math.min(1.4, (z - 40) * 0.09); // 滩与海
}

// ---------------- 世界构建 ----------------
export function buildHotel(scene, M) {
  const B = new Batcher();
  const colliders = [];
  const locations = {};
  const patrols = {};
  const dynamic = { doors: {} };
  const lights = [];
  const corridorLamps = [];
  const rand = mulberry32(20031107);
  const bounds = { minX: -29, maxX: 21, minZ: -44, maxZ: 33 };

  const boxC = (minX, maxX, minZ, maxZ, maxY) => {
    const c = { minX, maxX, minZ, maxZ, maxY };
    colliders.push(c);
    return c;
  };
  const cylC = (x, z, r, maxY, noSightBlock = false) => {
    const c = { x, z, r, maxY, noSightBlock };
    colliders.push(c);
    return c;
  };

  /** 沿 Z 走向的墙（x 固定） */
  const wallX = (x, z1, z2, h, mat, t = 0.28, y0 = 0) => {
    const zm = (z1 + z2) / 2;
    B.add(GEO.box, mat, x, y0 + h / 2, zm, 0, t, h, Math.abs(z2 - z1));
    if (y0 < 1.8) boxC(x - t / 2, x + t / 2, Math.min(z1, z2), Math.max(z1, z2), y0 + h);
  };
  /** 沿 X 走向的墙（z 固定） */
  const wallZ = (z, x1, x2, h, mat, t = 0.28, y0 = 0) => {
    const xm = (x1 + x2) / 2;
    B.add(GEO.box, mat, xm, y0 + h / 2, z, 0, Math.abs(x2 - x1), h, t);
    if (y0 < 1.8) boxC(Math.min(x1, x2), Math.max(x1, x2), z - t / 2, z + t / 2, y0 + h);
  };
  /** 地板/天花板 */
  const slab = (x1, z1, x2, z2, y, mat, t = 0.1) => {
    B.add(GEO.box, mat, (x1 + x2) / 2, y - t / 2, (z1 + z2) / 2, 0, Math.abs(x2 - x1), t, Math.abs(z2 - z1));
  };

  const pointLight = (color, intensity, dist, x, y, z, decay = 1.8) => {
    const l = new THREE.PointLight(color, intensity, dist, decay);
    l.position.set(x, y, z);
    scene.add(l);
    lights.push(l);
    return l;
  };

  /** 可开关门。along: 门板法向('z'=门面朝z)；hinge 铰链侧 */
  const makeDoor = (name, { x, z, w = 1.1, h = 2.2, mat, alongX = true, hinge = 1, swing = 1.9, t = 0.06 }) => {
    const pivot = new THREE.Group();
    pivot.position.set(alongX ? x + (w / 2) * hinge : x, 0, alongX ? z : z + (w / 2) * hinge);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(alongX ? w : t, h, alongX ? t : w), mat);
    panel.position.set(alongX ? -(w / 2) * hinge : 0, h / 2, alongX ? 0 : -(w / 2) * hinge);
    panel.castShadow = true;
    pivot.add(panel);
    // 门把
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), M.brass);
    knob.position.set(alongX ? -w * 0.82 * hinge : t, 1.02, alongX ? t : -w * 0.82 * hinge);
    pivot.add(knob);
    scene.add(pivot);
    const col = alongX
      ? boxC(x - w / 2, x + w / 2, z - 0.1, z + 0.1, h)
      : boxC(x - 0.1, x + 0.1, z - w / 2, z + w / 2, h);
    const d = { pivot, col, colHome: { ...col }, targetAng: 0, ang: 0, swing: swing * hinge, name };
    dynamic.doors[name] = d;
    return d;
  };

  // ============================================================
  // 前庭（蚀湾锚点）
  // ============================================================
  {
    slab(-24, 4, 24, 40, -0.45, M.asphalt, 0.12);
    for (let i = 0; i < 3; i++) {
      B.add(GEO.box, M.granite, 0, -0.06 - i * 0.15, 4.3 + i * 0.7, 0, 12, 0.14, 0.75);
    }
    slab(-7, 1.6, 7, 4.3, 0.02, M.granite, 0.14);
    for (const px of [-5, 5]) {
      B.add(GEO.cyl, M.facade, px, 2.6, 3.4, 0, 0.84, 5.2, 0.84);
      cylC(px, 3.4, 0.5, 5.2);
    }
    B.add(GEO.box, M.facade, 0, 5.4, 3.2, 0, 12.4, 0.5, 3.4);

    // 立面 + 二层暗窗
    wallZ(1.9, -16, -1.9, 9.2, M.facade, 0.5);
    wallZ(1.9, 1.9, 16, 9.2, M.facade, 0.5);
    B.add(GEO.box, M.facade, 0, 7.2, 1.9, 0, 3.8, 4.6, 0.5);
    for (let i = 0; i < 8; i++) {
      const wx = -13 + i * 3.7;
      if (Math.abs(wx) < 2.4) continue;
      const lit = i === 2 || i === 6;
      B.add(GEO.box, lit ? M.bulbWarm : M.plasticDark, wx, 6.8, 2.18, 0, 1.5, 1.9, 0.06);
    }
    // 招牌灯箱：迎宾楼
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 1.85), M.hotelSign);
    sign.position.set(0, 8.05, 2.22);
    scene.add(sign);
    dynamic.hotelSign = sign;
    pointLight(0xffc9a0, 9, 13, 0, 7.4, 4.6);
    // 门廊顶灯
    pointLight(0xffd0a2, 5, 8, 0, 4.9, 3.2);

    // 旗杆
    for (const fx of [-8, -5.4, 8]) {
      B.add(GEO.cyl, M.steelWorn, fx, 2.9, 12, 0, 0.1, 7, 0.1);
      cylC(fx, 12, 0.14, 6.5);
    }
    // 死喷泉
    B.add(GEO.cyl, M.granite, 0, -0.28, 18, 0, 10.8, 0.5, 10.8);
    B.add(GEO.cyl, M.granite, 0, -0.02, 18, 0, 9.2, 0.36, 9.2);
    B.add(GEO.cyl, M.concrete, 0, 0.5, 18, 0, 1.6, 1.4, 1.6);
    cylC(0, 18, 2.6, 0.6, true);
    locations.fountain = new THREE.Vector3(0, 0.3, 14.8);

    // 大门柱 + 拆迁公告
    for (const gx of [-14, 14]) {
      B.add(GEO.box, M.facade, gx, 0.85, 30, 0, 1.1, 2.6, 1.1);
      boxC(gx - 0.55, gx + 0.55, 29.45, 30.55, 2.2);
    }
    B.add(GEO.box, M.veneerDark, 9, 0.75, 28.5, -0.3, 1.7, 2.4, 0.12);
    const notice = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.5), M.notice);
    notice.position.set(8.97, 1.05, 28.42);
    notice.rotation.y = Math.PI - 0.3;
    scene.add(notice);
    locations.noticeBoard = new THREE.Vector3(9, 0.6, 28.5);

    // 蚀湾的海（比记忆里近）
    const seaMat = new THREE.MeshStandardMaterial({
      color: 0x2a3a3c, roughness: 0.32,
      normalMap: M.textures.waterNormal, normalScale: new THREE.Vector2(0.55, 0.55),
      envMapIntensity: 1.6,
    });
    seaMat.normalMap.repeat.set(24, 12);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(280, 130), seaMat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, -1.15, 108);
    scene.add(sea);
    dynamic.sea = sea;

    // 停建的内湾大桥桥墩（千禧工程遗骸）
    for (let i = 0; i < 3; i++) {
      const px = -34 + i * 30, pz = 76 + i * 10;
      B.add(GEO.box, M.concrete, px, 2.7, pz, 0.12 * i, 3.2, 8.5, 3.2);
      for (let k = 0; k < 4; k++) {
        B.add(GEO.cyl, M.ironDark, px - 1 + k * 0.7, 7.4, pz + (k % 2) * 0.8, 0.2 * k, 0.08, 1.4, 0.08);
      }
    }
    // 远处镇子剪影
    for (let i = 0; i < 7; i++) {
      const bx = -80 + i * 26 + (rand() - 0.5) * 8, bz = 62 + rand() * 26;
      const bh = 5 + rand() * 9;
      B.add(GEO.box, M.concrete, bx, bh / 2 - 1.4, bz, rand() * 0.6, 6 + rand() * 7, bh, 6);
      if (rand() < 0.6) B.add(GEO.box, M.bulbWarm, bx + 1, bh * 0.55, bz - 3.05, 0, 0.7, 0.9, 0.05);
    }

    locations.spawn = { x: 0, z: 26, yaw: 0 };
    locations.gateLook = new THREE.Vector3(0, 0.8, 30);
  }

  // ============================================================
  // 大堂
  // ============================================================
  {
    slab(-11, -16, 11, 2, 0, M.tileLobby);
    slab(-11, -16, 11, 2, 4.3, M.ceiling, 0.2);
    wallX(-11, -16, 2, 4.3, M.wallWhite);
    wallX(11, -16, -6.6, 4.3, M.wallWhite);
    wallX(11, -5.4, 2, 4.3, M.wallWhite);
    wallZ(-16, -11, -2, 4.3, M.wallpaper);
    wallZ(-16, 2, 5.6, 4.3, M.wallpaper);
    wallZ(-16, 9.4, 11, 4.3, M.wallpaper);
    B.add(GEO.box, M.wallpaper, 0, 3.4, -16, 0, 4.4, 1.8, 0.3);  // 走廊口门楣
    B.add(GEO.box, M.wallWhite, 11, 3.4, -6, 0, 0.28, 1.8, 1.6); // 保卫室门楣

    // 主入口玻璃门（双开）
    makeDoor('mainL', { x: -0.95, z: 1.9, w: 1.9, mat: M.glass, alongX: true, hinge: -1, swing: -1.7 });
    makeDoor('mainR', { x: 0.95, z: 1.9, w: 1.9, mat: M.glass, alongX: true, hinge: 1, swing: 1.7 });

    // 停运电梯
    B.add(GEO.box, M.steelWorn, 7.5, 1.25, -15.8, 0, 3.2, 2.5, 0.14);
    B.add(GEO.box, M.plasticDark, 7.5, 1.25, -15.72, 0, 0.06, 2.5, 0.02);
    const elevNote = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.42), M.paper);
    elevNote.position.set(7.5, 1.5, -15.63);
    scene.add(elevNote);
    B.add(GEO.box, M.brass, 8.9, 1.1, -15.75, 0, 0.12, 0.3, 0.06);
    locations.elevator = new THREE.Vector3(7.5, 1.2, -15.4);

    // 前台
    B.add(GEO.box, M.veneer, -8.2, 0.55, -5.5, 0, 1.1, 1.1, 5.6);
    B.add(GEO.box, M.granite, -8.2, 1.14, -5.5, 0, 1.3, 0.08, 5.9);
    boxC(-8.9, -7.5, -8.4, -2.6, 1.2);
    B.add(GEO.box, M.veneerDark, -10.6, 1.6, -5.5, 0, 0.5, 3.2, 5.8);
    boxC(-10.9, -10.3, -8.4, -2.6, 3.2);
    for (let i = 0; i < 24; i++) {
      const kx = -10.32, ky = 1.15 + Math.floor(i / 6) * 0.42, kz = -7.6 + (i % 6) * 0.84;
      B.add(GEO.box, M.plasticDark, kx, ky, kz, 0, 0.04, 0.3, 0.6);
      if (i === 8 || i === 15) B.add(GEO.box, M.brass, kx + 0.04, ky - 0.05, kz, 0, 0.02, 0.1, 0.04);
    }
    B.add(GEO.box, M.paperGlow, -8.2, 1.21, -4.2, 0.2, 0.42, 0.05, 0.32);  // 登记簿
    locations.registry = new THREE.Vector3(-8.2, 1.2, -4.2);
    B.add(GEO.cyl, M.brass, -8.2, 1.32, -7.2, 0, 0.08, 0.3, 0.08);
    B.add(GEO.cone, M.exitGreen, -8.2, 1.56, -7.2, 0, 0.44, 0.18, 0.44);
    pointLight(0xd6e8b0, 3.2, 4.5, -8.2, 1.5, -7.2);
    B.add(GEO.sphere, M.brass, -8.2, 1.24, -5.4, 0, 0.18, 0.14, 0.18);     // 前台铃
    locations.deskBell = new THREE.Vector3(-8.2, 1.2, -5.4);
    // 墙钟（比监控慢十八秒的那口钟）
    B.add(GEO.cyl, M.plasticDark, -10.28, 3.0, -5.5, 0, 0.8, 0.06, 0.8, Math.PI / 2);
    B.add(GEO.cyl, M.paper, -10.24, 3.0, -5.5, 0, 0.7, 0.04, 0.7, Math.PI / 2);
    locations.wallClock = new THREE.Vector3(-9.8, 1.4, -5.5);

    // 大堂吊灯（亮着一半的千禧水晶灯）
    const chG = new THREE.Group();
    chG.position.set(0, 3.7, -7);
    const ringM = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.05, 8, 28), M.brass);
    ringM.rotation.x = Math.PI / 2;
    chG.add(ringM);
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2;
      const on = i % 3 !== 0;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), on ? M.bulbWarm : M.fluorescentDead);
      bulb.position.set(Math.cos(a) * 0.85, -0.08, Math.sin(a) * 0.85);
      chG.add(bulb);
      const str = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.5, 5), M.glass);
      str.position.set(Math.cos(a) * 0.55, -0.26, Math.sin(a) * 0.55);
      chG.add(str);
    }
    B.add(GEO.cyl, M.brass, 0, 4.05, -7, 0, 0.06, 0.5, 0.06);
    scene.add(chG);
    dynamic.chandelier = chG;
    const chL = pointLight(0xffd2a0, 26, 16, 0, 3.4, -7);
    chL.castShadow = true;
    chL.shadow.mapSize.set(512, 512);
    const chCone = makeLightCone(0xffd2a0, 0.04, 0.9, 3.4, 3.4);
    chCone.position.set(0, 3.55, -7);
    scene.add(chCone);

    // 红地毯甬道：门 → 前台
    B.add(GEO.box, M.carpet, -2.4, 0.012, -2.6, 0.35, 2.2, 0.024, 9.5);
    // 沙发组 + 茶几 + 立式烟灰缸
    const sofa = (x, z, ry) => {
      B.add(GEO.box, M.curtain, x, 0.24, z, ry, 1.9, 0.42, 0.85);
      B.add(GEO.box, M.curtain, x - Math.sin(ry) * 0.36, 0.62, z - Math.cos(ry) * 0.36, ry, 1.9, 0.5, 0.24);
      B.add(GEO.box, M.veneerDark, x, 0.06, z, ry, 1.96, 0.12, 0.9);
      cylC(x, z, 0.85, 0.9, true);
    };
    sofa(6.2, -3.4, 0);
    sofa(6.2, -8.6, Math.PI);
    B.add(GEO.box, M.glass, 6.2, 0.42, -6, 0, 1.2, 0.05, 0.8);
    B.add(GEO.box, M.veneerDark, 6.2, 0.2, -6, 0, 1.0, 0.4, 0.6);
    cylC(6.2, -6, 0.6, 0.5, true);
    B.add(GEO.cyl, M.steelWorn, 8.6, 0.35, -6, 0, 0.24, 0.7, 0.24);
    // 枯掉的盆栽
    for (const [px, pz] of [[-10, 0.5], [10, 0.8], [-10.2, -14.8]]) {
      B.add(GEO.cyl, M.granite, px, 0.25, pz, 0, 0.6, 0.5, 0.6);
      B.add(GEO.cone, M.plasticDark, px, 0.9, pz, rand() * 3, 0.5, 0.9, 0.5);
      cylC(px, pz, 0.34, 1.2, true);
    }
    // 行李车（黄铜框）
    B.add(GEO.box, M.brass, -4.5, 0.1, -13.5, 0.4, 1.1, 0.06, 0.6);
    for (const [ox, oz] of [[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]]) {
      B.add(GEO.cyl, M.brass, -4.5 + ox, 0.9, -13.5 + oz, 0, 0.04, 1.8, 0.04);
    }
    B.add(GEO.cyl, M.brass, -4.5, 1.82, -13.5, Math.PI / 2, 0.04, 1.15, 0.04, 0, Math.PI / 2);
    cylC(-4.5, -13.5, 0.55, 1.8, true);

    // 婚纱照展架（那对新人）
    const easel = (x, z, ry, mi) => {
      B.add(GEO.box, M.veneerDark, x, 0.9, z, ry, 0.9, 1.3, 0.06);
      const ph = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 1.1), M.photos[mi % M.photos.length]);
      ph.position.set(x - Math.sin(ry) * 0.05, 0.92, z - Math.cos(ry) * 0.05);
      ph.rotation.y = ry + Math.PI;
      scene.add(ph);
      B.add(GEO.cyl, M.veneerDark, x, 0.35, z + Math.cos(ry) * 0.2, 0, 0.05, 0.9, 0.05, 0.35);
      cylC(x, z, 0.3, 1.5, true);
    };
    easel(-4.6, -1.2, 2.6, 0);
    easel(3.8, -13.8, -0.5, 1);
    locations.photoBoard = new THREE.Vector3(-4.6, 0.9, -1.2);
    // 千禧剪报框（内湾工程中止）
    B.add(GEO.box, M.veneerDark, -10.8, 2.0, -11.5, 0, 0.06, 0.9, 1.3);
    const clip = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7), M.paper);
    clip.position.set(-10.75, 2.0, -11.5);
    clip.rotation.y = Math.PI / 2;
    scene.add(clip);
    locations.clipping = new THREE.Vector3(-10.4, 1.5, -11.5);
  }

  // ============================================================
  // 保卫室（监控与录像 —— 千禧监控墙）
  // ============================================================
  const videoScreens = { monitors: [] };
  {
    slab(11, -10, 16, -4, 0, M.tileKitchen);
    slab(11, -10, 16, -4, 2.7, M.ceiling, 0.15);
    wallX(16, -10, -4, 2.7, M.concrete);
    wallZ(-10, 11, 16, 2.7, M.concrete);
    wallZ(-4, 11, 16, 2.7, M.concrete);
    makeDoor('security', { x: 11, z: -6, w: 1.2, mat: M.veneerDark, alongX: false, hinge: 1, swing: 1.8 });

    // 监控桌 + 监视器墙
    B.add(GEO.box, M.steelWorn, 14.8, 0.4, -7, 0, 1.4, 0.8, 2.6);
    boxC(14.0, 15.6, -8.4, -5.6, 0.9);
    for (let i = 0; i < 3; i++) {
      const my = 1.5 + Math.floor(i / 2) * 0.75, mz = -8 + (i % 2) * 1.4;
      B.add(GEO.box, M.crtCase, 15.6, my, mz, 0, 0.55, 0.62, 0.66);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.42), M.crt.clone());
      scr.position.set(15.3, my, mz);
      scr.rotation.y = -Math.PI / 2;
      scene.add(scr);
      videoScreens.monitors.push(scr);
    }
    B.add(GEO.box, M.crtCase, 14.8, 1.0, -6.2, 0, 0.5, 0.4, 0.55); // 桌面录像机
    B.add(GEO.box, M.standby, 14.62, 1.0, -6.0, 0, 0.03, 0.03, 0.03);
    pointLight(0x9fc4d0, 3.4, 5, 14.6, 1.7, -7);
    // 深度尺（工程测深仪：借去测走廊）
    B.add(GEO.box, M.plastic, 14.7, 0.86, -8.9, 0.3, 0.5, 0.12, 0.2);
    locations.depthGauge = new THREE.Vector3(14.7, 0.9, -8.9);
    // 保卫日志
    B.add(GEO.box, M.paperGlow, 13.6, 0.84, -6.4, -0.25, 0.32, 0.04, 0.25);
    locations.guardLog = new THREE.Vector3(13.6, 0.85, -6.4);
    // 行军床 + 热水壶 + 2003 挂历
    B.add(GEO.box, M.workwear, 12.2, 0.3, -9.2, 0, 1.9, 0.25, 0.8);
    boxC(11.2, 13.2, -9.7, -8.7, 0.6);
    B.add(GEO.cyl, M.steelWorn, 11.6, 0.62, -4.6, 0, 0.3, 0.35, 0.3);
    const cal = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.75), M.paper);
    cal.position.set(11.15, 1.8, -8);
    cal.rotation.y = Math.PI / 2;
    scene.add(cal);
    // 监控房日光灯（冷绿）
    pointLight(0xcfe0c8, 6, 6.5, 13.5, 2.5, -7);
    locations.securityRoom = new THREE.Vector3(13.5, 1, -7);
  }

  // ============================================================
  // 客房走廊（Depth 异常体）：基础段 z -16→-30，加深段 -30→-42
  // ============================================================
  const extGroup = new THREE.Group();
  const extColliders = [];
  let endWallCol;
  {
    // 基础段
    slab(-2, -30, 2, -16, 0, M.carpet);
    slab(-2, -30, 2, -16, 2.7, M.ceiling, 0.15);
    // 西墙（留宴会厅前室口 z∈[-27,-24.6]）
    wallX(-2, -16, -24.6, 2.7, M.wallpaper);
    wallX(-2, -27, -30, 2.7, M.wallpaper);
    // 东墙（留后厨口 z∈[-26,-24.8]）
    wallX(2, -16, -24.8, 2.7, M.wallpaper);
    wallX(2, -26, -30, 2.7, M.wallpaper);
    // 门楣
    B.add(GEO.box, M.wallpaper, -2, 2.35, -25.8, 0, 0.28, 0.7, 2.4);
    B.add(GEO.box, M.wallpaper, 2, 2.35, -25.4, 0, 0.28, 0.7, 1.2);

    // 客房门（贴墙装饰，锁死）：西墙 3 扇 + 东墙 2 扇
    const guestDoor = (x, z, side) => {
      B.add(GEO.box, M.veneer, x + side * 0.02, 1.05, z, 0, 0.1, 2.1, 1.0);
      B.add(GEO.box, M.veneerDark, x + side * 0.05, 2.18, z, 0, 0.06, 0.16, 1.12);
      B.add(GEO.sphere, M.brass, x + side * 0.09, 1.0, z + 0.36, 0, 0.06, 0.06, 0.06);
      // 门牌
      B.add(GEO.box, M.brass, x + side * 0.07, 1.85, z, 0, 0.02, 0.09, 0.22);
    };
    for (const z of [-18.5, -21.5, -28.7]) guestDoor(-1.95, z, 1);
    for (const z of [-18.5, -22]) guestDoor(1.95, z, -1);

    // 平面图铭牌（Depth 测量对照物：图上 12.6m）
    B.add(GEO.box, M.plasticDark, -1.93, 1.5, -17.2, 0, 0.05, 0.65, 0.9);
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.55), M.paper);
    plaque.position.set(-1.88, 1.5, -17.2);
    plaque.rotation.y = Math.PI / 2;
    scene.add(plaque);
    locations.corridorPlaque = new THREE.Vector3(-1.7, 1.3, -17.2);

    // 灭火器 + 客房托盘
    B.add(GEO.cyl, M.standby, 1.8, 0.35, -20.4, 0, 0.16, 0.55, 0.16);
    B.add(GEO.cyl, M.tileKitchen, -1.3, 0.02, -23.2, 0, 0.5, 0.035, 0.5);
    B.add(GEO.cyl, M.steelWorn, -1.3, 0.09, -23.2, 0, 0.24, 0.12, 0.24);

    // 走廊尽头墙（基础态：z=-30，可撤除）
    const endWall = new THREE.Group();
    const ew = new THREE.Mesh(new THREE.BoxGeometry(4.3, 2.7, 0.28), M.wallpaper);
    ew.position.set(0, 1.35, -30);
    ew.castShadow = ew.receiveShadow = true;
    endWall.add(ew);
    // 尽头挂着一幅褪色的海湾风景画
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), M.photos[2]);
    pic.position.set(0, 1.55, -29.84);
    endWall.add(pic);
    scene.add(endWall);
    endWallCol = boxC(-2.2, 2.2, -30.14, -29.86, 2.7);
    dynamic.corridorEndWall = endWall;
    locations.corridorEnd = new THREE.Vector3(0, 1.2, -29.4);

    // 走廊日光灯（听得见镇流器嗡嗡响的那种）
    for (let i = 0; i < 4; i++) {
      const z = -18 - i * 3.6;
      const tube = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 1.15), M.fluorescent.clone());
      tube.position.set(0, 2.62, z);
      scene.add(tube);
      const l = pointLight(0xd8e4cf, 4.6, 6.2, 0, 2.45, z);
      const cone = makeLightCone(0xd8e4cf, 0.028, 0.5, 1.9, 2.5);
      cone.position.set(0, 2.6, z);
      scene.add(cone);
      corridorLamps.push({ tube, light: l, cone, z, on: true, baseI: 4.6 });
    }

    // ---- 加深段（Leak 后出现）：更长、更多门、尽头是一面镜子 ----
    const extB = new Batcher();
    extB.add(GEO.box, M.carpet, 0, -0.05, -36, 0, 4, 0.1, 12);
    extB.add(GEO.box, M.ceiling, 0, 2.775, -36, 0, 4, 0.15, 12);
    extB.add(GEO.box, M.wallpaper, -2, 1.35, -36, 0, 0.28, 2.7, 12);
    extB.add(GEO.box, M.wallpaper, 2, 1.35, -36, 0, 0.28, 2.7, 12);
    // 更多客房门——比楼层平面图上多出来的那些
    for (const z of [-31.6, -34.4, -37.2, -40]) {
      extB.add(GEO.box, M.veneer, -1.93, 1.05, z, 0, 0.1, 2.1, 1.0);
      extB.add(GEO.sphere, M.brass, -1.86, 1.0, z + 0.36, 0, 0.06, 0.06, 0.06);
      extB.add(GEO.box, M.veneer, 1.93, 1.05, z - 1.4, 0, 0.1, 2.1, 1.0);
      extB.add(GEO.sphere, M.brass, 1.86, 1.0, z - 1.04, 0, 0.06, 0.06, 0.06);
    }
    // 尽头墙 + 一面等身镜（Depth 读数在这里出错）
    extB.add(GEO.box, M.wallpaper, 0, 1.35, -42, 0, 4.3, 2.7, 0.28);
    extB.add(GEO.box, M.veneerDark, 0, 1.3, -41.8, 0, 0.9, 2.0, 0.08);
    const extMeshes = extB.flush(extGroup);
    void extMeshes;
    const mirror = new THREE.Mesh(
      new THREE.PlaneGeometry(0.76, 1.86),
      new THREE.MeshStandardMaterial({ color: 0x84959a, roughness: 0.08, metalness: 0.9, envMapIntensity: 2.4 })
    );
    mirror.position.set(0, 1.3, -41.74);
    extGroup.add(mirror);
    // 加深段的灯：只有两盏亮，色温更冷
    for (let i = 0; i < 3; i++) {
      const z = -32.5 - i * 3.6;
      const on = i !== 1;
      const tube = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 1.15), on ? M.fluorescent.clone() : M.fluorescentDead);
      tube.position.set(0, 2.62, z);
      extGroup.add(tube);
      if (on) {
        const l = new THREE.PointLight(0xc4d8cc, 3.8, 6, 1.8);
        l.position.set(0, 2.45, z);
        extGroup.add(l);
        corridorLamps.push({ tube, light: l, cone: null, z, on: true, baseI: 3.8, ext: true });
      }
    }
    extGroup.visible = false;
    scene.add(extGroup);
    extColliders.push(
      { minX: -2.14, maxX: -1.86, minZ: -42, maxZ: -30, maxY: 2.7 },
      { minX: 1.86, maxX: 2.14, minZ: -42, maxZ: -30, maxY: 2.7 },
      { minX: -2.2, maxX: 2.2, minZ: -42.14, maxZ: -41.86, maxY: 2.7 },
    );
    locations.mirrorEnd = new THREE.Vector3(0, 1.2, -41.4);
  }

  // ============================================================
  // 宴会厅前室 + 婚宴厅
  // ============================================================
  {
    // 前室
    slab(-4, -27, -2, -24.6, 0, M.carpet);
    slab(-4, -27, -2, -24.6, 2.7, M.ceiling, 0.15);
    wallZ(-24.6, -4, -2, 2.7, M.wallpaper);
    wallZ(-27, -4, -2, 2.7, M.wallpaper);
    // 婚宴厅双开门
    makeDoor('banquetL', { x: -4, z: -25.14, w: 1.08, mat: M.veneerDark, alongX: false, hinge: -1, swing: -1.9 });
    makeDoor('banquetR', { x: -4, z: -26.26, w: 1.08, mat: M.veneerDark, alongX: false, hinge: 1, swing: 1.9 });
    B.add(GEO.box, M.veneerDark, -4, 1.1, -26.9, 0, 0.3, 2.2, 0.24); // 门框填板
    boxC(-4.15, -3.85, -27.02, -26.78, 2.2);
    locations.banquetDoors = new THREE.Vector3(-3, 1.1, -25.7);

    // 厅体
    slab(-26, -36, -4, -20, 0, M.carpet);
    slab(-26, -36, -4, -20, 5.2, M.ceiling, 0.2);
    wallX(-26, -36, -20, 5.2, M.wallpaper);
    wallX(-4, -36, -27, 5.2, M.wallpaper);
    wallX(-4, -24.6, -20, 5.2, M.wallpaper);
    wallZ(-36, -26, -4, 5.2, M.wallpaper);
    wallZ(-20, -26, -4, 5.2, M.wallpaper);
    B.add(GEO.box, M.wallpaper, -4, 3.95, -25.7, 0, 0.28, 2.5, 2.8); // 门上墙

    // 舞台
    B.add(GEO.box, M.veneerDark, -23.8, 0.225, -28, 0, 4.4, 0.45, 12.8);
    // 台口罗马柱一对
    for (const sz of [-21.9, -34.1]) {
      B.add(GEO.cyl, M.granite, -21.9, 2.6, sz, 0, 0.5, 5.2, 0.5);
      cylC(-21.9, sz, 0.3, 5.2);
    }
    // 囍（舞台背板）
    B.add(GEO.box, M.curtain, -25.7, 2.4, -28, 0, 0.3, 4.4, 12.0);
    const xi = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), M.doubleXi);
    xi.position.set(-25.5, 2.5, -28);
    xi.rotation.y = Math.PI / 2;
    scene.add(xi);
    dynamic.doubleXi = xi;
    // 横幅
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 1.0), M.banner);
    banner.position.set(-21.3, 4.3, -28);
    banner.rotation.y = Math.PI / 2;
    scene.add(banner);
    // 婚台：香槟塔 + 话筒架 + 新娘的信
    B.add(GEO.box, M.tablecloth, -23.5, 0.85, -28, 0, 1.6, 0.8, 2.4);
    for (let i = 0; i < 3; i++) {
      for (let k = 0; k <= i; k++) {
        B.add(GEO.cyl, M.glass, -23.5, 1.5 - i * 0.16, -28 - i * 0.1 + k * 0.2, 0, 0.07, 0.16, 0.07);
      }
    }
    B.add(GEO.cyl, M.ironDark, -22.8, 1.05, -30.5, 0, 0.04, 1.3, 0.04);
    B.add(GEO.cyl, M.ironDark, -22.8, 1.62, -30.4, 0.9, 0.03, 0.3, 0.03);
    B.add(GEO.box, M.paperGlow, -23.4, 0.92, -26.9, 0.4, 0.24, 0.03, 0.16);
    locations.brideLetter = new THREE.Vector3(-23.4, 1.0, -26.9);

    // 圆桌阵（8 桌：红台布垂地 + 转盘 + 摞好的碗碟 + 折好的口布）
    const tables = [];
    let ti = 0;
    for (let gx = 0; gx < 3; gx++) {
      for (let gz = 0; gz < 3; gz++) {
        if (gx === 2 && gz === 1) continue; // 留出主通道
        const tx = -17.5 + gx * 5.2, tz = -32.4 + gz * 5.2;
        B.add(GEO.cyl, M.tablecloth, tx, 0.42, tz, rand() * 3, 1.9, 0.84, 1.9);
        B.add(GEO.cyl, M.glass, tx, 0.9, tz, 0, 1.1, 0.05, 1.1);
        for (let p = 0; p < 5; p++) {
          const pa = rand() * Math.PI * 2, pr = 0.55 + rand() * 0.25;
          B.add(GEO.cyl, M.plastic, tx + Math.cos(pa) * pr, 0.9, tz + Math.sin(pa) * pr, 0, 0.16, 0.05, 0.16);
        }
        B.add(GEO.box, M.tablecloth, tx + 0.3, 0.94, tz - 0.2, rand(), 0.14, 0.1, 0.14);
        cylC(tx, tz, 1.02, 0.93, false);
        // 椅子 4 把（红布罩椅）
        for (let c = 0; c < 4; c++) {
          const ca = c / 4 * Math.PI * 2 + 0.4;
          const cx = tx + Math.cos(ca) * 1.42, cz = tz + Math.sin(ca) * 1.42;
          B.add(GEO.box, M.tablecloth, cx, 0.26, cz, -ca, 0.44, 0.52, 0.44);
          B.add(GEO.box, M.tablecloth, cx - Math.cos(ca) * 0.2, 0.72, cz - Math.sin(ca) * 0.2, -ca, 0.44, 0.5, 0.1);
        }
        tables.push([tx, tz]);
        ti++;
      }
    }
    dynamic.banquetTables = tables;
    // 角落里摞起的备用椅
    B.add(GEO.box, M.tablecloth, -5.2, 0.8, -34.8, 0.2, 1.0, 1.6, 1.0);
    boxC(-5.9, -4.5, -35.5, -34.1, 1.7);

    // 北墙丝绒帘（三幅，垂到地）
    for (let i = 0; i < 3; i++) {
      const cx = -21 + i * 6.4;
      B.add(GEO.box, M.curtain, cx, 2.2, -35.7, 0, 3.6, 4.4, 0.22);
    }
    // 音箱一对（婚宴音响）
    for (const sz of [-21.5, -34.5]) {
      B.add(GEO.box, M.plasticDark, -20.6, 0.85, sz, 0.2, 0.7, 1.7, 0.6);
      cylC(-20.6, sz, 0.55, 1.8, true);
    }

    // 录像电视车（大屁股彩电 + 录像机，婚宴录像事件的现场屏）
    B.add(GEO.box, M.steelWorn, -6, 0.5, -21.6, 0.35, 0.9, 1.0, 0.7);
    B.add(GEO.box, M.crtCase, -6, 1.35, -21.6, 0.35, 0.86, 0.72, 0.78);
    const tvScr = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.48), M.crt.clone());
    tvScr.position.set(-6.31, 1.38, -21.32);
    tvScr.rotation.y = Math.PI + 0.35;
    scene.add(tvScr);
    videoScreens.tv = tvScr;
    B.add(GEO.box, M.crtCase, -6, 0.86, -21.6, 0.35, 0.6, 0.18, 0.5);
    B.add(GEO.box, M.standby, -6.25, 0.86, -21.35, 0.35, 0.03, 0.03, 0.03);
    cylC(-6, -21.6, 0.7, 1.8, true);
    locations.tvTrolley = new THREE.Vector3(-6.2, 1.1, -21.5);

    // 婚宴厅吊灯（两盏，只剩暗红的余光）+ 舞台顶红洗光
    for (const [lx, lz] of [[-11, -28], [-17.5, -28]]) {
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), M.brass);
      bowl.position.set(lx, 4.4, lz);
      bowl.rotation.x = Math.PI;
      scene.add(bowl);
      pointLight(0xff9a5c, 9, 12, lx, 4.1, lz);
      const cone = makeLightCone(0xff9a5c, 0.03, 0.7, 3.6, 4.0);
      cone.position.set(lx, 4.3, lz);
      scene.add(cone);
    }
    const stageWash = pointLight(0xc0392b, 7, 9, -23.5, 4.2, -28);
    dynamic.stageWash = stageWash;
    locations.stageCenter = new THREE.Vector3(-23.5, 1.0, -28);
  }

  // ============================================================
  // 后厨 + 楼梯间
  // ============================================================
  {
    slab(2, -32, 16, -20, 0, M.tileKitchen);
    slab(2, -32, 16, -20, 3.0, M.ceiling, 0.15);
    wallX(16, -32, -20, 3.0, M.tileKitchen);
    wallZ(-20, 2, 16, 3.0, M.tileKitchen);
    wallZ(-32, 2, 12, 3.0, M.tileKitchen);
    wallZ(-32, 13.2, 16, 3.0, M.tileKitchen);
    wallX(2, -30, -32, 3.0, M.tileKitchen);
    // 后厨门（从走廊）
    makeDoor('kitchen', { x: 2, z: -25.4, w: 1.2, mat: M.steelWorn, alongX: false, hinge: -1, swing: -1.9 });
    B.add(GEO.box, M.exitGreen, 1.8, 2.32, -25.4, 0, 0.06, 0.18, 0.5); // 出口牌

    // 不锈钢中岛台两条
    for (const [ix, iz] of [[7, -26.5], [11.5, -23.5]]) {
      B.add(GEO.box, M.steel, ix, 0.45, iz, 0, 3.2, 0.9, 1.2);
      B.add(GEO.box, M.steelWorn, ix, 0.06, iz, 0, 3.0, 0.12, 1.0);
      boxC(ix - 1.6, ix + 1.6, iz - 0.6, iz + 0.6, 0.95);
    }
    // 灶台 + 排烟罩
    B.add(GEO.box, M.steelWorn, 14.9, 0.5, -28, 0, 2.0, 1.0, 3.6);
    boxC(13.9, 15.9, -29.8, -26.2, 1.1);
    B.add(GEO.box, M.ironDark, 14.7, 2.3, -28, 0, 1.8, 0.8, 3.4);
    for (let i = 0; i < 3; i++) B.add(GEO.cyl, M.ironDark, 14.9, 1.06, -29.2 + i * 1.2, 0, 0.3, 0.12, 0.3);
    // 吊挂的勺铲排钩
    B.add(GEO.cyl, M.steelWorn, 9, 2.2, -25, Math.PI / 2, 0.02, 3.0, 0.02, 0, Math.PI / 2);
    for (let i = 0; i < 6; i++) {
      B.add(GEO.box, M.steelWorn, 7.8 + i * 0.5, 1.95, -25, rand() * 0.3, 0.06, 0.4, 0.02);
    }
    // 摞起的碗碟与蒸笼
    for (let i = 0; i < 4; i++) B.add(GEO.cyl, M.plastic, 6.2 + (i % 2) * 0.4, 1.0 + Math.floor(i / 2) * 0.12, -26.6, 0, 0.2, 0.12, 0.2);
    for (let i = 0; i < 3; i++) B.add(GEO.cyl, M.veneer, 11.5, 1.0 + i * 0.16, -23.4, 0, 0.36, 0.16, 0.36);
    // 冷库门（厚的，把手上挂着锁）
    B.add(GEO.box, M.steelWorn, 15.8, 1.1, -21.5, 0, 0.24, 2.2, 1.5);
    B.add(GEO.box, M.ironDark, 15.62, 1.05, -21.1, 0, 0.08, 0.5, 0.12);
    locations.freezer = new THREE.Vector3(15.4, 1.1, -21.5);
    // 进货单（案台上）
    B.add(GEO.box, M.paperGlow, 7.6, 0.93, -26.3, 0.5, 0.3, 0.03, 0.22);
    locations.kitchenNote = new THREE.Vector3(7.6, 0.95, -26.3);
    // 洗碗池
    B.add(GEO.box, M.steel, 3.2, 0.45, -21.0, 0, 1.8, 0.9, 1.0);
    boxC(2.3, 4.1, -21.5, -20.5, 0.95);
    // 拖把桶与拖把（斜倚墙角）
    B.add(GEO.cyl, M.standby, 2.8, 0.25, -30.8, 0, 0.4, 0.5, 0.4);
    B.add(GEO.cyl, M.veneer, 3.1, 0.85, -31.0, 0.35, 0.04, 1.6, 0.04, 0, 0.3);
    // 排班表（走廊后厨门边）
    const roster = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.8), M.paper);
    roster.position.set(1.83, 1.5, -23.4);
    roster.rotation.y = -Math.PI / 2;
    scene.add(roster);
    locations.staffBoard = new THREE.Vector3(1.7, 1.4, -23.4);
    // 后厨日光灯：一根稳、一根接触不良
    const kt1 = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.05, 0.09), M.fluorescent.clone());
    kt1.position.set(7, 2.92, -26);
    scene.add(kt1);
    pointLight(0xd8e4cf, 6, 8, 7, 2.7, -26);
    const kt2 = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.05, 0.09), M.fluorescent.clone());
    kt2.position.set(12, 2.92, -24);
    scene.add(kt2);
    const flickL = pointLight(0xd8e4cf, 5, 7, 12, 2.7, -24);
    dynamic.kitchenFlicker = { light: flickL, tube: kt2, t: 0 };

    // 楼梯间
    slab(10, -38, 16, -32, 0, M.concrete);
    slab(10, -38, 16, -32, 3.2, M.concrete, 0.15);
    wallX(10, -38, -32, 3.2, M.concrete);
    wallX(16, -38, -32, 3.2, M.concrete);
    wallZ(-38, 10, 16, 3.2, M.concrete);
    makeDoor('stairwell', { x: 12.6, z: -32, w: 1.2, mat: M.ironDark, alongX: true, hinge: 1, swing: 1.9 });
    // 上行楼梯：五步以后被旧家具堵死
    for (let i = 0; i < 5; i++) {
      B.add(GEO.box, M.concrete, 14.8 - i * 0.001, 0.12 + i * 0.24, -36.5 + i * 0.0, 0, 2.2, 0.24, 0.9);
    }
    B.add(GEO.box, M.veneerDark, 14.8, 1.9, -36.8, 0.3, 2.0, 1.6, 1.4);
    boxC(13.4, 16, -37.6, -35.6, 3.0);
    // 应急灯（绿的，常亮）
    B.add(GEO.box, M.exitGreen, 12.6, 2.5, -32.3, 0, 0.4, 0.14, 0.06);
    pointLight(0x86b890, 2.4, 5, 12.6, 2.4, -33);
    locations.stairwell = new THREE.Vector3(12, 1, -35);
  }

  // ---- 提交静态合批 ----
  B.flush(scene);

  // ================= 巡逻/工位 =================
  patrols.cleanerWork = [-2.5, -3];                       // 苏阿姨拖大堂
  patrols.cleaner = [[-5, -3], [3.4, -1.6], [4.6, -10], [-3, -12]];
  patrols.guard = [[8, -2], [8.4, -12], [0, -14.5], [0, -27.5], [0, -14.5], [-5.5, -12.5], [-6, -2.5]];
  patrols.kitchenWork = [8.4, -26.9];                     // 黄师傅切配
  patrols.f01Work = [-12.4, -29.7];                       // 王承海擦桌
  patrols.f01 = [[-9, -24], [-16.5, -30.5], [-19.5, -24.5], [-11, -31.5]];

  // ================= 区域（叙事触发） =================
  const rooms = {
    forecourt: { minX: -20, maxX: 20, minZ: 5, maxZ: 32 },
    porch: { minX: -7, maxX: 7, minZ: 1, maxZ: 5 },
    lobby: { minX: -11, maxX: 11, minZ: -16, maxZ: 2 },
    security: { minX: 11, maxX: 16, minZ: -10, maxZ: -4 },
    corridor: { minX: -2, maxX: 2, minZ: -30, maxZ: -16 },
    corridorDeep: { minX: -2, maxX: 2, minZ: -42, maxZ: -30 },
    vestibule: { minX: -4, maxX: -2, minZ: -27, maxZ: -24.6 },
    banquet: { minX: -26, maxX: -4, minZ: -36, maxZ: -20 },
    stage: STAGE,
    kitchen: { minX: 2, maxX: 16, minZ: -32, maxZ: -20 },
    stairwell: { minX: 10, maxX: 16, minZ: -38, maxZ: -32 },
  };

  // ================= 世界接口 =================
  const world = {
    colliders, bounds, heightAt, locations, patrols, rooms, lights, dynamic,
    corridorLamps, videoScreens,
    // 婚宴录像机位（挂在厅东北角上方，俯视全厅与舞台）
    banquetCam: {
      pos: new THREE.Vector3(-5.2, 4.6, -20.8),
      look: new THREE.Vector3(-19, 0.8, -29),
      fov: 62,
    },
    waterLevelRef: { value: -1.15 },
    waterLevel() { return this.waterLevelRef.value; },
    corridorExtended: false,

    /** 脚步声表面：地毯(soft) / 瓷砖石面(hard) / 湿(wet) */
    surfaceAt(x, z) {
      if (z > 2) return 'stone'; // 花岗岩台阶与沥青
      const soft =
        (x >= -2 && x <= 2 && z <= -16) ||          // 走廊（含加深段）
        (x >= -26 && x <= -2 && z >= -36 && z <= -20) || // 婚宴厅+前室
        (x >= -3.5 && x <= 0 && z >= -13 && z <= 2);     // 大堂红毯
      return soft ? 'sand' : 'stone';
    },

    /** Leak：走廊变深——撤掉尽头墙，放出加深段 */
    setCorridorExtended(on) {
      if (on === this.corridorExtended) return;
      this.corridorExtended = on;
      extGroup.visible = on;
      dynamic.corridorEndWall.visible = !on;
      if (on) {
        // 撤除尽头墙碰撞
        endWallCol.minX = 9999; endWallCol.maxX = 9999.1;
        for (const c of extColliders) colliders.push(c);
      } else {
        Object.assign(endWallCol, { minX: -2.2, maxX: 2.2 });
        for (const c of extColliders) {
          const i = colliders.indexOf(c);
          if (i >= 0) colliders.splice(i, 1);
        }
      }
    },

    /** 门开关（带动画）。instant 用于载入/检查点 */
    setDoorOpen(name, open, instant = false) {
      const d = dynamic.doors[name];
      if (!d) return;
      d.targetAng = open ? d.swing : 0;
      if (instant) d.ang = d.targetAng;
      // 开门即撤碰撞（门板薄，忽略开启状态的门板体）
      if (open) {
        d.col.minX = 9999; d.col.maxX = 9999.1;
      } else {
        Object.assign(d.col, d.colHome);
      }
    },
    isDoorOpen(name) {
      const d = dynamic.doors[name];
      return d ? Math.abs(d.targetAng) > 0.1 : false;
    },

    /** 走廊灯开关（追逐时身后的灯一盏盏灭掉） */
    setLampOn(i, on) {
      const lamp = corridorLamps[i];
      if (!lamp || lamp.on === on) return;
      lamp.on = on;
      lamp.light.intensity = on ? lamp.baseI : 0;
      if (lamp.cone) lamp.cone.visible = on;
      lamp.tube.material.color?.setHex?.(on ? 0xd9e4d6 : 0x565b55);
    },

    /** 每帧特效 */
    updateFx(time) {
      // 门动画
      for (const k in dynamic.doors) {
        const d = dynamic.doors[k];
        d.ang += (d.targetAng - d.ang) * 0.08;
        d.pivot.rotation.y = d.ang;
      }
      // 海面流动
      if (dynamic.sea) {
        const nm = dynamic.sea.material.normalMap;
        nm.offset.set(time * 0.008, time * 0.013);
      }
      // 招牌灯箱偶尔哑一下（镇流器老化，不是恐怖闪烁）
      if (dynamic.hotelSign) {
        const s = Math.sin(time * 0.7) + Math.sin(time * 3.1 + 2);
        dynamic.hotelSign.material.emissiveIntensity = s > 1.93 ? 0.25 : 0.9;
      }
      // 后厨接触不良的那根灯管
      const kf = dynamic.kitchenFlicker;
      if (kf) {
        const f = Math.sin(time * 17.3) * Math.sin(time * 5.1) > 0.86 ? 0.1 : 1;
        kf.light.intensity = 5 * f;
        kf.tube.material.color.setHex(f < 0.5 ? 0x565b55 : 0xd9e4d6);
      }
      // 走廊镇流器嗡嗡的呼吸
      for (let i = 0; i < corridorLamps.length; i++) {
        const lamp = corridorLamps[i];
        if (!lamp.on) continue;
        const f = Math.sin(time * 9.1 + i * 2.7) * 0.06 + Math.sin(time * 1.3 + i) * 0.05;
        lamp.light.intensity = lamp.baseI * (0.94 + f);
      }
      // 吊灯极缓慢的晃（没有风，它也在晃）
      if (dynamic.chandelier) {
        dynamic.chandelier.rotation.z = Math.sin(time * 0.4) * 0.006;
        dynamic.chandelier.rotation.x = Math.cos(time * 0.31) * 0.005;
      }
    },
  };
  return world;
}
