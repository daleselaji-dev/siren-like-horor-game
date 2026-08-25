// 南方大酒店（1998 年落成，填湾地基）+ 蚀湾海洋馆售票厅连廊
// 2001 年中国县镇酒店：水磨石+金不锈钢包边+红漆总台+红毯大楼梯+镜面柱+囍
// 结构（局部坐标，+z 朝北面向镇中心，原点在酒店平面中心）：
//   1F: 大堂(挑空)/宴会厅(西翼)/服务走廊(南)/备餐间(东南)/楼梯间(东)/配电间/东廊→海洋馆连廊
//   2F: 回廊(环挑空)/南走廊/保卫科监控室(东南)/棋牌室/布草间
//   3F: 客房走廊(103/105/107/109…)/807 套房(西南)
// 输出挂载: locations.* / patrols.* / dynamic.crts / dynamic.mirrors / dynamic.hotel*
import * as THREE from 'three';
import { GEO } from './batcher.js';

// 门牌/标牌小贴图（按文本缓存）
const _plateCache = new Map();
function plateMat(text, { w = 128, h = 64, bg = '#3a2c22', fg = '#d8cfb8', font = 0.5, emissive = 0 } = {}) {
  const key = `${text}|${bg}|${fg}|${w}x${h}|${emissive}`;
  if (_plateCache.has(key)) return _plateCache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = fg; ctx.lineWidth = 2; ctx.strokeRect(3, 3, w - 6, h - 6);
  ctx.fillStyle = fg;
  ctx.font = `bold ${Math.floor(h * font)}px "Songti SC","SimSun",serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 1);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.6,
    emissive: emissive ? 0xffffff : 0x000000, emissiveMap: emissive ? tex : null, emissiveIntensity: emissive,
  });
  _plateCache.set(key, m);
  return m;
}

/**
 * @param ctx { B, M, scene, colliders, addPatch, locations, patrols, dynamic, lights, makeSmoke, heightGround }
 */
export function buildHotel(ctx) {
  const { B, M, scene, colliders, addPatch, locations, patrols, dynamic, lights } = ctx;

  // ---- 场地 ----
  const hx = -4, hz = -56;   // 世界锚点
  const hb = 3.0;            // 1F 地面(世界 y)
  const F2 = 3.4, F3 = 6.8, ROOF = 10.2;
  const T = 0.3;             // 墙厚

  const box = (mat, lx, ly, lz, sx, sy, sz, ry = 0, rx = 0, rz = 0) =>
    B.add(GEO.box, mat, hx + lx, hb + ly, hz + lz, ry, sx, sy, sz, rx, rz);
  const cyl = (mat, lx, ly, lz, sx, sy, sz, ry = 0, rx = 0, rz = 0) =>
    B.add(GEO.cyl, mat, hx + lx, hb + ly, hz + lz, ry, sx, sy, sz, rx, rz);
  const world = (lx, ly, lz) => new THREE.Vector3(hx + lx, hb + ly, hz + lz);

  /** 墙体：中心+尺寸；带层高碰撞 */
  const wall = (mat, lx, ly, lz, sx, sy, sz, opts = {}) => {
    box(mat, lx, ly, lz, sx, sy, sz);
    if (!opts.noCol) {
      colliders.push({
        minX: hx + lx - sx / 2, maxX: hx + lx + sx / 2,
        minZ: hz + lz - sz / 2, maxZ: hz + lz + sz / 2,
        minY: hb + ly - sy / 2, maxY: hb + ly + sy / 2,
        ...(opts.col ?? {}),
      });
    }
  };
  const lintelX = (mat, x1, x2, lz, yBot, yTop) =>
    wall(mat, (x1 + x2) / 2, (yBot + yTop) / 2, lz, x2 - x1, yTop - yBot, T);
  const lintelZ = (mat, z1, z2, lx, yBot, yTop) =>
    wall(mat, lx, (yBot + yTop) / 2, (z1 + z2) / 2, T, yTop - yBot, z2 - z1);
  /** 沿 X 的墙，在 [holes] 处留门/窗洞  y0..y1 层带；hole: {from,to,top?,sill?} */
  const wallX = (mat, x1, x2, lz, y0, y1, holes = []) => {
    let segs = [[x1, x2]];
    for (const h of holes) {
      const next = [];
      for (const [a, b] of segs) {
        if (h.from > a) next.push([a, Math.min(b, h.from)]);
        if (h.to < b) next.push([Math.max(a, h.to), b]);
      }
      segs = next;
      const hTop = h.top ?? 2.1;
      if (y0 + hTop < y1) lintelX(mat, h.from, h.to, lz, y0 + hTop, y1); // 楣
      if (h.sill) lintelX(mat, h.from, h.to, lz, y0, y0 + h.sill);      // 槛
    }
    for (const [a, b] of segs) {
      if (b - a < 0.01) continue;
      wall(mat, (a + b) / 2, (y0 + y1) / 2, lz, b - a, y1 - y0, T);
    }
  };
  /** 沿 Z 的墙 */
  const wallZ = (mat, z1, z2, lx, y0, y1, holes = []) => {
    let segs = [[z1, z2]];
    for (const h of holes) {
      const next = [];
      for (const [a, b] of segs) {
        if (h.from > a) next.push([a, Math.min(b, h.from)]);
        if (h.to < b) next.push([Math.max(a, h.to), b]);
      }
      segs = next;
      const hTop = h.top ?? 2.1;
      if (y0 + hTop < y1) lintelZ(mat, h.from, h.to, lx, y0 + hTop, y1);
      if (h.sill) lintelZ(mat, h.from, h.to, lx, y0, y0 + h.sill);
    }
    for (const [a, b] of segs) {
      if (b - a < 0.01) continue;
      wall(mat, lx, (y0 + y1) / 2, (a + b) / 2, T, y1 - y0, b - a);
    }
  };

  /** 楼板（顶面 topY）：吊顶盒 + 面层 + slab 视线遮挡 + 行走 patch */
  const slabRect = (x1, z1, x2, z2, topY, floorMat, { thick = 0.22, walk = true } = {}) => {
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2, w = x2 - x1, d = z2 - z1;
    box(M.ceilingTile, cx, topY - thick / 2, cz, w, thick, d);
    if (floorMat) box(floorMat, cx, topY + 0.012, cz, w, 0.025, d);
    colliders.push({
      minX: hx + x1, maxX: hx + x2, minZ: hz + z1, maxZ: hz + z2,
      minY: hb + topY - thick, maxY: hb + topY, noCollide: true, slab: true,
    });
    if (walk) addPatch(hx + cx, hz + cz, 0, w, d, hb + topY, hb + topY);
  };

  /** 栏杆：沿 X 或 Z（挡人不挡视线），floorY 所在楼层 */
  const railing = (x1, z1, x2, z2, floorY) => {
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    const alongX = Math.abs(x2 - x1) > Math.abs(z2 - z1);
    const len = alongX ? x2 - x1 : z2 - z1;
    // 扶手 + 立柱
    box(M.brass, cx, floorY + 0.92, cz, alongX ? len : 0.06, 0.06, alongX ? 0.06 : len);
    const n = Math.max(2, Math.round(len / 0.9));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      cyl(M.ironDark, x1 + (x2 - x1) * t, floorY + 0.45, z1 + (z2 - z1) * t, 0.05, 0.9, 0.05);
    }
    colliders.push({
      minX: hx + Math.min(x1, x2) - 0.05, maxX: hx + Math.max(x1, x2) + 0.05,
      minZ: hz + Math.min(z1, z2) - 0.05, maxZ: hz + Math.max(z1, z2) + 0.05,
      minY: hb + floorY, maxY: hb + floorY + 0.95, noSightBlock: true,
    });
  };

  /** 直跑楼梯：从 (lx0,lz0,y0) 沿方向到 (lx1,lz1,y1)。踏步视觉 + 行走 patch 坡 */
  const stairs = (lx0, lz0, y0, lx1, lz1, y1, width, mat, carpet = null) => {
    const dx = lx1 - lx0, dz = lz1 - lz0;
    const run = Math.hypot(dx, dz);
    const ang = Math.atan2(dx, dz); // 朝向
    const steps = Math.max(2, Math.round((y1 - y0) / 0.17));
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      const sx = lx0 + dx * t, sz = lz0 + dz * t;
      const sy = y0 + (y1 - y0) * (i + 1) / steps;
      box(mat, sx, sy - 0.09, sz, width, 0.18, run / steps + 0.06, ang);
      if (carpet) box(carpet, sx, sy + 0.005, sz, width * 0.7, 0.012, run / steps + 0.02, ang);
    }
    // 行走坡（起点略前伸，保证上/下沿连续）
    addPatch(hx + (lx0 + lx1) / 2, hz + (lz0 + lz1) / 2, Math.atan2(dz, dx), run + 0.5, width, hb + y0, hb + y1);
    // 楼梯底斜封板（视觉）
    box(M.plaster, (lx0 + lx1) / 2, (y0 + y1) / 2 - 0.35, (lz0 + lz1) / 2, width, 0.12, run, ang, Math.atan2(y1 - y0, run), 0);
  };

  /** CRT 一台：外壳+屏幕；注册进 dynamic.crts 由预现系统驱动 */
  dynamic.crts = dynamic.crts ?? [];
  const crt = (id, lx, ly, lz, ry, scale, viewPos, viewLook) => {
    const g = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.BoxGeometry(0.62 * scale, 0.5 * scale, 0.55 * scale), M.crtShell);
    shell.castShadow = true;
    g.add(shell);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.46 * scale, 0.36 * scale), M.crtGlass.clone());
    screen.position.set(0, 0.01 * scale, 0.281 * scale);
    g.add(screen);
    g.position.copy(world(lx, ly, lz));
    g.rotation.y = ry;
    scene.add(g);
    dynamic.crts.push({
      id, group: g, screen,
      viewPos: world(viewPos[0], viewPos[1], viewPos[2]),
      viewLook: world(viewLook[0], viewLook[1], viewLook[2]),
    });
    return g;
  };

  dynamic.mirrors = dynamic.mirrors ?? [];
  const mirror = (id, lx, ly, lz, ry, w, h) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), M.mirror);
    m.position.copy(world(lx, ly, lz));
    m.rotation.y = ry;
    scene.add(m);
    box(M.brass, lx - Math.cos(ry) * 0.02, ly, lz + Math.sin(ry) * 0.02, Math.abs(Math.cos(ry)) * (w + 0.1) + Math.abs(Math.sin(ry)) * 0.06, h + 0.1, Math.abs(Math.sin(ry)) * (w + 0.1) + Math.abs(Math.cos(ry)) * 0.06);
    dynamic.mirrors.push({ id, mesh: m, pos: m.position.clone(), ry });
    return m;
  };

  const hotelLights = [];
  const addLight = (color, intensity, dist, lx, ly, lz, flicker = 0) => {
    const pl = new THREE.PointLight(color, intensity, dist, 2);
    pl.position.copy(world(lx, ly, lz));
    scene.add(pl);
    hotelLights.push({ pl, base: intensity, flicker });
    return pl;
  };
  dynamic.hotelLights = hotelLights;

  // ================= 台基与外壳 =================
  // 台基（视觉底座，下探入填湾平台；行走 patch 覆盖楼体+门廊，不含台阶区）
  box(M.terrazzo, 0, -0.65, 0, 38, 1.35, 26);
  addPatch(hx, hz + 0.4, 0, 38, 23.6, hb, hb);
  // 海洋馆翼台基
  box(M.terrazzo, 28, -0.65, 4, 22.4, 1.35, 15);
  // 正门台阶（北）：从镇地面升上台基门廊
  {
    const gFront = ctx.heightGround(hx, hz + 15.5);
    stairs(0, 15, gFront - hb, 0, 12.2, 0, 8, M.terrazzo);
  }
  // 后勤门台阶（南）
  {
    const gBack = ctx.heightGround(hx + 12.25, hz - 13.5);
    stairs(12.25, -13.4, gBack - hb, 12.25, -11.3, 0, 2.2, M.terrazzo);
  }

  // 外墙（瓷砖）——含全部窗洞
  const TILE = M.tile, PLA = M.plaster, WP = M.wallpaper;
  // 北立面 z=11：大堂玻璃门区 x -6..6 留空(1F)，宴会厅窗、东翼窗
  wallX(TILE, -17, -6, 11, 0, F2, [
    { from: -15.5, to: -13, top: 2.6, sill: 0.9 }, { from: -12, to: -9.5, top: 2.6, sill: 0.9 },
  ]);
  wallX(TILE, 6, 17, 11, 0, F2, [
    { from: 12, to: 14.5, top: 2.6, sill: 0.9 },
  ]);
  lintelX(TILE, -6, 6, 11, 2.7, F2); // 大堂门楣上带
  // 2F/3F 北立面（窗带）
  const winRow = (y0) => {
    wallX(TILE, -17, 17, 11, y0, y0 + 3.4, [
      { from: -15.5, to: -13.5, top: 2.4, sill: 1.0 }, { from: -11.5, to: -9.5, top: 2.4, sill: 1.0 },
      { from: -7, to: -5, top: 2.4, sill: 1.0 }, { from: -2.5, to: -0.5, top: 2.4, sill: 1.0 },
      { from: 1.5, to: 3.5, top: 2.4, sill: 1.0 }, { from: 6, to: 8, top: 2.4, sill: 1.0 },
      { from: 10.5, to: 12.5, top: 2.4, sill: 1.0 }, { from: 14, to: 16, top: 2.4, sill: 1.0 },
    ]);
  };
  winRow(F2); winRow(F3);
  // 窗玻璃（整排一次性，暗色，个别房间亮灯）
  for (const y0 of [F2, F3]) {
    box(M.crtGlass, 0, y0 + 1.7, 10.86, 33.4, 1.35, 0.04);
  }
  // 南立面 z=-11：厨房后门 + 窗
  wallX(TILE, -17, 17, -11, 0, F2, [
    { from: 11.5, to: 13, top: 2.2 },          // 后勤门
    { from: -4, to: -2, top: 2.4, sill: 1.2 }, { from: 2, to: 4, top: 2.4, sill: 1.2 },
  ]);
  wallX(TILE, -17, 17, -11, F2, ROOF, [
    { from: -14, to: -12, top: 2.4, sill: 4.4 }, { from: -8, to: -6, top: 2.4, sill: 4.4 },
    { from: -2, to: 0, top: 2.4, sill: 4.4 }, { from: 4, to: 6, top: 2.4, sill: 4.4 }, { from: 10, to: 12, top: 2.4, sill: 4.4 },
  ]);
  // 西立面 x=-17
  wallZ(TILE, -11, 11, -17, 0, ROOF, [
    { from: -6, to: -4, top: 2.4, sill: 1.0 }, { from: 1, to: 3, top: 2.4, sill: 1.0 }, { from: 6, to: 8, top: 2.4, sill: 1.0 },
  ]);
  // 东立面 x=17：海洋馆连廊口 z 8.6..11 (1F)
  wallZ(TILE, -11, 8.6, 17, 0, F2, [
    { from: -8, to: -6, top: 2.4, sill: 1.2 }, { from: 0, to: 2, top: 2.4, sill: 1.2 },
  ]);
  lintelZ(TILE, 8.6, 11, 17, 2.3, F2);
  wallZ(TILE, -11, 11, 17, F2, ROOF, [
    { from: -6, to: -4, top: 2.4, sill: 4.4 }, { from: 0, to: 2, top: 2.4, sill: 4.4 }, { from: 5, to: 7, top: 2.4, sill: 4.4 },
  ]);
  // 屋顶
  slabRect(-17, -11, 17, 11, ROOF, null, { walk: false });
  // 女儿墙
  wallX(M.plaster, -17.2, 17.2, 11.1, ROOF, ROOF + 0.9);
  wallX(M.plaster, -17.2, 17.2, -11.1, ROOF, ROOF + 0.9);
  wallZ(M.plaster, -11.1, 11.1, -17.1, ROOF, ROOF + 0.9);
  wallZ(M.plaster, -11.1, 11.1, 17.1, ROOF, ROOF + 0.9);
  // 楼顶大招牌（钢架 + 灯箱）
  box(M.signSouth, 0, ROOF + 2.1, 10.4, 10.5, 1.7, 0.25);
  for (const sx of [-4.5, 0, 4.5]) box(M.ironDark, sx, ROOF + 1.0, 10.2, 0.12, 2.0, 0.12, 0, 0.25, 0);
  // 侧壁竖招牌
  box(M.signSouthV, 17.15, F3 + 0.4, 9.0, 0.22, 5.6, 1.1);
  // 外立面空调机位/雨渍(快速细节)
  for (const [wx, wy] of [[-10.6, F2 + 0.7], [2.6, F3 + 0.7], [7.1, F2 + 0.7], [-6.1, F3 + 0.7]]) {
    box(M.steel, wx, wy, 11.25, 0.85, 0.62, 0.4);
  }

  // ================= 正门：雨棚 + 灯箱 + 玻璃门 =================
  {
    // 雨棚
    box(M.terrazzo, 0, 3.35, 12.6, 10.5, 0.28, 3.6);
    box(M.brass, 0, 3.22, 14.3, 10.6, 0.1, 0.14);
    // 雨棚立柱（镜面不锈钢包柱）
    for (const px of [-4.6, 4.6]) {
      cyl(M.mirror, px, 1.6, 13.9, 0.5, 3.2, 0.5);
      colliders.push({ x: hx + px, z: hz + 13.9, r: 0.3, maxY: hb + 3.2 });
    }
    // 门楣灯箱
    box(M.signSouth, 0, 2.95, 11.3, 7.2, 0.9, 0.18);
    // 玻璃门框（中缝常开 1.4m）
    for (const px of [-2.4, 2.4]) {
      box(M.brass, px, 1.25, 11, 0.12, 2.5, 0.12);
      colliders.push({ x: hx + px, z: hz + 11, r: 0.09, maxY: hb + 2.5 });
    }
    box(M.crtGlass, -1.75, 1.25, 11, 1.2, 2.4, 0.05);
    colliders.push({ minX: hx - 2.36, maxX: hx - 1.15, minZ: hz + 10.9, maxZ: hz + 11.1, maxY: hb + 2.4 });
    box(M.crtGlass, 1.75, 1.25, 11, 1.2, 2.4, 0.05);
    colliders.push({ minX: hx + 1.15, maxX: hx + 2.36, minZ: hz + 10.9, maxZ: hz + 11.1, maxY: hb + 2.4 });
    // 两侧玻璃幕墙（大堂临街面）
    box(M.crtGlass, -4.2, 1.35, 11, 3.5, 2.7, 0.05);
    colliders.push({ minX: hx - 5.95, maxX: hx - 2.45, minZ: hz + 10.9, maxZ: hz + 11.1, maxY: hb + 2.7, noSightBlock: true });
    box(M.crtGlass, 4.2, 1.35, 11, 3.5, 2.7, 0.05);
    colliders.push({ minX: hx + 2.45, maxX: hx + 5.95, minZ: hz + 10.9, maxZ: hz + 11.1, maxY: hb + 2.7, noSightBlock: true });
    for (const px of [-2.45, 2.45, -5.95, 5.95]) box(M.brass, px, 1.35, 11, 0.1, 2.7, 0.1);
    // 囍字红灯笼一对（真实光）
    for (const px of [-3.4, 3.4]) {
      const lan = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.55, 12), M.lanternPaperXi);
      lan.position.copy(world(px, 2.55, 12.6));
      scene.add(lan);
      addLight(0xff5040, 8, 8, px, 2.4, 12.6, 0.4);
    }
    // 台阶两侧石狮座(简化)
    for (const px of [-5.2, 5.2]) {
      box(M.stone, px, 0.45, 12.5, 0.9, 0.9, 0.9);
      colliders.push({ x: hx + px, z: hz + 12.5, r: 0.55, maxY: hb + 1.4 });
    }
    locations.hotelEntrance = world(0, 0.5, 12);
  }

  // ================= 内墙骨架 1F =================
  // 大堂/宴会厅隔墙 x=-8：双开门洞 z 4.5..6.5 + 服务门 z -9.5..-8
  wallZ(PLA, -11, 11, -8, 0, F2, [
    { from: 4.5, to: 6.5, top: 2.6 },
    { from: -9.5, to: -8.2, top: 2.1 },
  ]);
  // 大堂南墙 z=0：楼梯口 x -1.9..1.9
  wallX(PLA, -8, 8, 0, 0, F2, [{ from: -1.9, to: 1.9, top: 3.2 }]);
  // 大堂东墙 x=8：东廊门 z 5..6.8
  wallZ(PLA, 0, 11, 8, 0, F2, [{ from: 5, to: 6.8, top: 2.4 }]);
  // 服务走廊北墙 z=-8（与员工区分隔）：门 x -5..-3.6 / x 3..4.4
  wallX(PLA, -8, 8, -8, 0, F2, [
    { from: -5, to: -3.6, top: 2.1 }, { from: 3, to: 4.4, top: 2.1 },
  ]);
  // 员工区被大楼梯一分为二：楼梯两侧封板（经理室/布草间的内墙）
  for (const sx of [-1.9, 1.9]) box(PLA, sx, F2 / 2, -3.05, 0.12, F2, 6.5);
  // 布草间东墙缺口段 x=8, z -2..0
  wallZ(PLA, -2, 0, 8, 0, F2);
  // 厨房西墙 x=8：走廊门 z -10.4..-9
  wallZ(PLA, -11, -2, 8, 0, F2, [{ from: -10.4, to: -9, top: 2.1 }]);
  // 厨房北墙 z=-2 (x 8..17)
  wallX(PLA, 8, 17, -2, 0, F2);
  // 楼梯间（x 11..16.5, z -2..3）西墙带门
  wallZ(PLA, -2, 3, 11, 0, F2, [{ from: 0.6, to: 2.0, top: 2.1 }]);
  wallX(PLA, 11, 17, 3, 0, F2);
  // 配电间 x 11..17, z 3..6（门在 x=11, z 4..5.2）
  wallZ(PLA, 3, 6, 11, 0, F2, [{ from: 4, to: 5.2, top: 2.1 }]);
  wallX(PLA, 11, 17, 6, 0, F2);
  // 卫生间 x 11..17, z 6..9.2（门 x=11, z 7..8.2）
  wallZ(PLA, 6, 9.2, 11, 0, F2, [{ from: 7, to: 8.2, top: 2.1 }]);
  wallX(PLA, 11, 17, 9.2, 0, F2);

  // ================= 楼板 =================
  // 2F 楼板：整层减去 大堂挑空(x -6.5..6.5, z 1..9.5)、主楼梯井(x -1.9..1.9, z -6.3..0.4)、楼梯间井(x 11..16.5, z -2..3)
  slabRect(-17, -11, 17, -6.3, F2, M.carpet);                    // 南带
  slabRect(-17, -6.3, -1.9, 0.4, F2, M.carpet);                  // 西带(避开主梯井)
  slabRect(1.9, -6.3, 11, 0.4, F2, M.carpet);                    // 东带(至楼梯间西墙)
  slabRect(11, -6.3, 17, -2, F2, M.carpet);                      // 保卫科北半(楼梯间井以南)
  slabRect(-17, 0.4, -6.5, 9.5, F2, M.carpet);                   // 西回廊
  slabRect(6.5, 0.4, 11, 9.5, F2, M.carpet);                     // 东回廊(至楼梯间西墙)
  slabRect(-17, 9.5, 17, 11, F2, M.carpet);                      // 北回廊(前带)
  slabRect(11, 3, 17, 9.5, F2, M.carpet);                        // 东北角(配电/卫生间上方)
  // 3F 楼板：整层减楼梯间井(x 11..16.5, z -2..3)
  slabRect(-17, -11, 11, 11, F3, M.carpet);
  slabRect(11, 3, 17, 11, F3, M.carpet);
  slabRect(11, -11, 17, -2, F3, M.carpet);
  slabRect(16.5, -2, 17, 3, F3, null, { walk: false });

  // ================= 大堂 =================
  {
    // 水磨石地面(细纹面层) + 红毯从正门到楼梯
    box(M.terrazzo, 0, 0.02, 5.5, 15.9, 0.05, 10.9);
    box(M.carpet, 0, 0.06, 5.5, 2.6, 0.03, 10.8);
    dynamic.lobbyCarpetRect = { minX: hx - 1.3, maxX: hx + 1.3, minZ: hz - 7.6, maxZ: hz + 10.9 };
    // 总台（西侧红漆柜台 + 金包边 + 钥匙架 + 台灯）
    box(M.veneerRed, -6.4, 0.55, 4.5, 1.1, 1.1, 4.6);
    box(M.marble, -6.4, 1.14, 4.5, 1.3, 0.08, 4.8);
    box(M.brass, -6.4, 0.16, 4.5, 1.2, 0.08, 4.7);
    colliders.push({ minX: hx - 7.0, maxX: hx - 5.8, minZ: hz + 2.2, maxZ: hz + 6.8, minY: hb, maxY: hb + 1.15 });
    // 背柜钥匙架
    box(M.veneer, -7.7, 1.5, 4.5, 0.25, 2.2, 4.2);
    box(plateMat('客房钥匙', { w: 192, h: 96 }), -7.55, 2.1, 4.5, 0.04, 0.6, 1.3);
    for (let i = 0; i < 12; i++) {
      box(M.brass, -7.62, 1.15 + (i % 4) * 0.28, 3.4 + Math.floor(i / 4) * 0.8, 0.05, 0.14, 0.05);
    }
    // 前台电话（振动/剧情道具）
    box(M.ironDark, -6.4, 1.24, 3.2, 0.32, 0.12, 0.24);
    locations.frontPhone = world(-6.4, 1.3, 3.2);
    // 台灯 + 登记簿
    box(M.tungsten, -6.4, 1.42, 5.6, 0.16, 0.14, 0.16);
    addLight(0xffc880, 5, 5, -6.4, 1.6, 5.6, 0.1);
    box(M.paper, -6.4, 1.2, 4.6, 0.5, 0.04, 0.36);
    locations.registry = world(-6.4, 1.25, 4.6);
    // 镜面柱 ×4（金箍）
    for (const [px, pz] of [[-4, 2.5], [4, 2.5], [-4, 8], [4, 8]]) {
      cyl(M.mirror, px, F2 * 0.98 / 2 + 0.02, pz, 0.62, F2 * 0.96, 0.62);
      cyl(M.brass, px, 0.25, pz, 0.7, 0.5, 0.7);
      cyl(M.brass, px, F2 - 0.2, pz, 0.7, 0.4, 0.7);
      colliders.push({ x: hx + px, z: hz + pz, r: 0.4, maxY: hb + F2 });
    }
    // 大吊灯（挑空中央，黄铜+灯球）
    cyl(M.brass, 0, 6.6, 5.2, 0.5, 0.5, 0.5);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      box(M.brass, Math.cos(a) * 0.9, 6.2, 5.2 + Math.sin(a) * 0.9, 0.06, 0.5, 0.06, 0, 0, Math.cos(a) * 0.4);
      B.add(GEO.sphere, M.tungsten, hx + Math.cos(a) * 1.15, hb + 5.95, hz + 5.2 + Math.sin(a) * 1.15, 0, 0.14, 0.14, 0.14);
    }
    B.add(GEO.sphere, M.tungsten, hx, hb + 5.85, hz + 5.2, 0, 0.2, 0.2, 0.2);
    addLight(0xffd9a0, 30, 22, 0, 5.7, 5.2, 0.15);
    // 塑料绿植 ×3
    for (const [px, pz] of [[7, 9.8], [-7, 9.8], [7, 1]]) {
      cyl(M.veneerRed, px, 0.3, pz, 0.5, 0.6, 0.5);
      B.add(GEO.sphere, M.plasticGreen, hx + px, hb + 1.2, hz + pz, 0, 0.55, 0.8, 0.55);
      B.add(GEO.sphere, M.plasticGreen, hx + px + 0.15, hb + 1.7, hz + pz, 0, 0.35, 0.5, 0.35);
      colliders.push({ x: hx + px, z: hz + pz, r: 0.35, maxY: hb + 1.1, noSightBlock: true });
    }
    // 沙发组（西北角）
    box(M.clothRed, -4.5, 0.3, 9.7, 2.2, 0.6, 0.9);
    box(M.clothRed, -4.5, 0.85, 10.1, 2.2, 0.6, 0.25);
    box(M.veneer, -2.6, 0.28, 9.7, 0.8, 0.56, 0.8);
    colliders.push({ minX: hx - 5.6, maxX: hx - 2.2, minZ: hz + 9.2, maxZ: hz + 10.3, minY: hb, maxY: hb + 0.9, noSightBlock: true });
    // 大堂山水壁画（南墙上方，跨楼梯口）
    box(M.mural, 0, 4.6, 0.18, 7.5, 2.4, 0.08);
    // 婚宴指示水牌
    box(M.brass, 3.2, 0.8, 9.0, 0.05, 1.6, 0.05);
    box(plateMat('周宅喜宴 · 宴会厅', { w: 256, h: 128, bg: '#8c1616', fg: '#f0d28c' }), 3.2, 1.35, 9.0, 0.9, 0.62, 0.05);
    colliders.push({ x: hx + 3.2, z: hz + 9.0, r: 0.2, maxY: hb + 1.6, noSightBlock: true });
    // 挂钟（停在 11:47）
    cyl(M.brass, -7.85, 2.6, 8.0, 0.45, 0.1, 0.45, 0, 0, Math.PI / 2);
    box(plateMat('11:47', { w: 96, h: 96, bg: '#e8e0cc', fg: '#33291e', font: 0.34 }), -7.78, 2.6, 8.0, 0.03, 0.62, 0.62);
    // 荧光顶灯带（回廊下沿）
    for (const px of [-5, 0, 5]) {
      box(M.fluorescent, px, F2 - 0.06, 0.8, 1.4, 0.05, 0.16);
    }
    addLight(0xdfe8d8, 8, 10, 0, F2 - 0.3, 1.2, 0.5);
    locations.lobbyCenter = world(0, 0.5, 5.5);
  }

  // ================= 大楼梯（红毯，大堂→2F） =================
  {
    stairs(0, 0.2, 0, 0, -6.3, F2, 3.4, M.terrazzo, M.carpet);
    // 楼梯铜扶手
    for (const sx of [-1.75, 1.75]) {
      box(M.brass, sx, F2 / 2 + 0.75, -3.05, 0.07, 0.07, 7.3, 0, Math.atan2(F2, 6.5), 0);
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        cyl(M.ironDark, sx, t * F2 + 0.45, 0.2 - t * 6.5, 0.05, 0.9, 0.05);
      }
    }
    // 楼梯侧墙(半高) 挡视线
    for (const sx of [-1.9, 1.9]) {
      colliders.push({ minX: hx + sx - 0.06, maxX: hx + sx + 0.06, minZ: hz - 6.3, maxZ: hz + 0.2, minY: hb, maxY: hb + F2 + 0.9, noSightBlock: true });
    }
    // 梯下储物围板（1F 走廊侧看到的斜顶储物间门）
    wallX(PLA, -1.9, 1.9, -6.3, 0, 2.2);
    // 2F 井口三面栏杆
    railing(-1.9, -6.3, -1.9, 0.4, F2);
    railing(1.9, -6.3, 1.9, 0.4, F2);
    // 挑空回廊栏杆
    railing(-6.5, 1, -6.5, 9.5, F2);
    railing(6.5, 1, 6.5, 9.5, F2);
    railing(-6.5, 9.5, 6.5, 9.5, F2);
    railing(-6.5, 1, -1.9, 1, F2);
    railing(1.9, 1, 6.5, 1, F2);
  }

  // ================= 宴会厅 =================
  {
    // 红毯满铺
    box(M.carpet, -12.5, 0.02, 0, 8.9, 0.05, 21.9);
    // 舞台（南端，抬高 0.45）
    box(M.wood, -12.5, 0.22, -9.2, 8.6, 0.45, 3.2);
    addPatch(hx - 12.5, hz - 9.2, 0, 8.6, 3.2, hb + 0.45, hb + 0.45);
    addPatch(hx - 12.5, hz - 7.3, Math.PI / 2, 1.2, 3, hb + 0.45, hb); // 台前小坡(靠台端高)
    // 舞台红幕（背景）+ 金布褶
    box(M.curtain, -12.5, 2.0, -10.6, 8.4, 3.2, 0.22);
    colliders.push({ minX: hx - 16.7, maxX: hx - 8.3, minZ: hz - 10.75, maxZ: hz - 10.45, minY: hb, maxY: hb + 3.4 });
    // 囍字金匾（幕中央）
    box(M.xiPanel, -12.5, 2.1, -10.4, 2.2, 2.2, 0.1);
    // 立式麦克风（司仪位）：线没入舞台
    cyl(M.ironDark, -12.5, 1.0, -8.6, 0.03, 1.1, 0.03);
    B.add(GEO.sphere, M.ironDark, hx - 12.5, hb + 1.62, hz - 8.6, 0, 0.05, 0.05, 0.05);
    box(M.ironDark, -12.4, 0.46, -8.4, 0.02, 0.02, 0.5, 0.4);
    locations.stageMic = world(-12.5, 1.0, -8.6);
    // 音箱一对
    for (const pz of [-10.2]) {
      for (const px of [-16.2, -8.8]) {
        box(M.woodDark, px, 1.05, pz, 0.6, 1.2, 0.5);
        colliders.push({ x: hx + px, z: hz + pz, r: 0.4, maxY: hb + 1.7 });
      }
    }
    // 圆桌 ×6（红台布+转盘+碗碟+方凳）
    const tables = [[-14.5, -4], [-10.5, -4], [-14.5, 0.5], [-10.5, 0.5], [-14.5, 5], [-10.5, 5]];
    dynamic.banquetTables = [];
    for (let ti = 0; ti < tables.length; ti++) {
      const [px, pz] = tables[ti];
      cyl(M.tableCloth, px, 0.42, pz, 1.5, 0.84, 1.5);
      cyl(M.crtGlass, px, 0.89, pz, 0.85, 0.04, 0.85); // 玻璃转盘
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        cyl(M.clothShirt, px + Math.cos(a) * 0.58, 0.875, pz + Math.sin(a) * 0.58, 0.11, 0.03, 0.11);
        // 方凳
        box(M.veneer, px + Math.cos(a) * 1.05, 0.24, pz + Math.sin(a) * 1.05, 0.34, 0.48, 0.34);
      }
      colliders.push({ x: hx + px, z: hz + pz, r: 0.85, maxY: hb + 0.95, noSightBlock: true });
      dynamic.banquetTables.push(world(px, 0.9, pz));
    }
    // 上宾空席：舞台下正对的独桌——单椅、餐具未动、桌牌
    {
      const px = -12.5, pz = -5.6;
      cyl(M.tableCloth, px, 0.42, pz, 1.1, 0.84, 1.1);
      box(M.veneerRed, px, 0.5, pz - 1.25, 0.5, 1.15, 0.5); // 高背椅
      box(M.veneerRed, px, 1.35, pz - 1.45, 0.5, 0.9, 0.12);
      cyl(M.clothShirt, px, 0.875, pz, 0.13, 0.03, 0.13);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.03), plateMat('上宾', { bg: '#8c1616', fg: '#f0d28c', font: 0.55 }));
      plate.position.copy(world(px, 0.99, pz + 0.4));
      plate.rotation.x = -0.35;
      scene.add(plate);
      dynamic.guestSeatPlate = plate;
      colliders.push({ x: hx + px, z: hz + pz, r: 0.7, maxY: hb + 0.95, noSightBlock: true });
      locations.guestSeat = world(px, 0.9, pz);
    }
    // 挂串红灯笼两列
    for (const pz of [-2, 3]) {
      for (const px of [-15.5, -12.5, -9.5]) {
        const lan = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.42, 10), M.lanternPaperXi);
        lan.position.copy(world(px, F2 - 0.55, pz));
        scene.add(lan);
      }
    }
    addLight(0xff5040, 10, 12, -12.5, F2 - 0.8, 0.5, 0.3);
    addLight(0xffd9a0, 12, 12, -12.5, F2 - 0.6, -7, 0.15);
    // 墙面囍剪纸 + 荧光灯管
    box(M.xiPanel, -16.85, 1.9, 2, 0.06, 1.2, 1.2);
    box(M.xiPanel, -16.85, 1.9, -4, 0.06, 1.2, 1.2);
    for (const pz of [-6, 0, 6]) box(M.fluorescent, -12.5, F2 - 0.06, pz, 1.5, 0.05, 0.16);
    locations.banquetCenter = world(-12.5, 0.5, 0);
  }

  // ================= 服务走廊 + 员工区 + 厨房 =================
  {
    // 走廊地面瓷砖(响)
    box(M.tile, 0, 0.02, -9.5, 15.9, 0.045, 2.9);
    // 传菜台/不锈钢层架
    box(M.steel, -6, 0.85, -10.5, 3.2, 0.08, 0.7);
    box(M.steel, -6, 0.45, -10.5, 3.0, 0.06, 0.65);
    colliders.push({ minX: hx - 7.6, maxX: hx - 4.4, minZ: hz - 10.85, maxZ: hz - 10.15, minY: hb, maxY: hb + 0.95, noSightBlock: true });
    // 摞起的塑料凳
    for (let i = 0; i < 3; i++) cyl(M.plasticGreen, 1.5 + i * 0.05, 0.3 + i * 0.24, -10.4, 0.35, 0.42, 0.35);
    colliders.push({ x: hx + 1.5, z: hz - 10.4, r: 0.3, maxY: hb + 1.0, noSightBlock: true });
    // 沉积覆层（墙面结壳——残骸证据③）
    box(M.sediment, 6.5, 1.1, -10.82, 2.6, 2.2, 0.12);
    box(M.sediment, -2.5, 0.6, -10.84, 1.8, 1.2, 0.09);
    locations.sedimentWall = world(6.5, 1.2, -10.6);
    // 推车 CRT（预现教学机）
    box(M.steel, 4.8, 0.5, -9.4, 0.7, 0.06, 0.6);
    for (const [ox, oz] of [[-0.28, -0.22], [0.28, -0.22], [-0.28, 0.22], [0.28, 0.22]]) {
      cyl(M.ironDark, 4.8 + ox, 0.24, -9.4 + oz, 0.05, 0.48, 0.05);
    }
    crt('corridor', 4.8, 0.82, -9.4, Math.PI, 1.0, [0, 1.5, -9.5], [-6, 1.2, -9.5]);
    colliders.push({ x: hx + 4.8, z: hz - 9.4, r: 0.45, maxY: hb + 1.1, noSightBlock: true });
    locations.crtCorridor = world(4.8, 1.0, -8.9);
    // 走廊冷荧光
    for (const px of [-5, 0.5, 6]) box(M.fluorescent, px, F2 - 0.06, -9.5, 1.4, 0.05, 0.14);
    addLight(0xdfe8d8, 9, 11, 0.5, F2 - 0.4, -9.5, 0.8);
    // 员工告示
    box(plateMat('今晚喜宴 全员留守', { w: 256, h: 96, bg: '#c8bfa8', fg: '#4a3428', font: 0.36 }), -1.5, 1.6, -8.16, 0.9, 0.4, 0.04);
    // 经理室(西)：桌+柜+文书
    box(M.veneer, -5.5, 0.4, -4, 1.6, 0.8, 0.8);
    box(M.veneer, -7.5, 1.1, -2.5, 0.5, 2.2, 1.6);
    colliders.push({ minX: hx - 7.8, maxX: hx - 7.2, minZ: hz - 3.3, maxZ: hz - 1.7, minY: hb, maxY: hb + 2.2 });
    locations.managerDesk = world(-5.5, 0.9, -4);
    addLight(0xffc880, 4, 6, -5.5, 2.2, -4, 0.1);
    // 布草间(东)：架子+床单堆
    box(M.steel, 5, 1.0, -2.5, 3.0, 2.0, 0.6);
    colliders.push({ minX: hx + 3.5, maxX: hx + 6.5, minZ: hz - 2.8, maxZ: hz - 2.2, minY: hb, maxY: hb + 2.0 });
    box(M.clothShirt, 5, 0.4, -5, 1.8, 0.8, 1.2);
    // 厨房：灶台+大锅+挂钩+瓷砖墙裙
    box(M.tile, 12.5, 0.02, -6.5, 8.9, 0.045, 8.9);
    box(M.tile, 16.8, 1.1, -6.5, 0.14, 2.2, 8.6);
    box(M.steel, 14.5, 0.5, -9.8, 4.4, 1.0, 1.6);
    colliders.push({ minX: hx + 12.3, maxX: hx + 16.7, minZ: hz - 10.6, maxZ: hz - 9.0, minY: hb, maxY: hb + 1.05 });
    for (const px of [13.4, 15.2]) {
      cyl(M.ironDark, px, 1.1, -9.8, 0.5, 0.3, 0.5);
    }
    box(M.steel, 10, 0.85, -5, 1.4, 0.08, 2.8);
    colliders.push({ minX: hx + 9.3, maxX: hx + 10.7, minZ: hz - 6.4, maxZ: hz - 3.6, minY: hb, maxY: hb + 0.9, noSightBlock: true });
    // 挂钩排(空的)
    for (let i = 0; i < 5; i++) box(M.ironDark, 11 + i * 1.1, 2.3, -8.8, 0.04, 0.5, 0.04);
    addLight(0xdfe8d8, 7, 9, 13, F2 - 0.4, -6, 1.2);
    locations.kitchen = world(12.5, 0.5, -6);
    // 后门(逃生口)标牌
    box(plateMat('后勤通道', { w: 160, h: 64, bg: '#2a3a2a', fg: '#cfe0c8', font: 0.44, emissive: 0.5 }), 12.25, 2.35, -10.8, 0.8, 0.32, 0.05);
  }

  // ================= 配电间 + 卫生间 + 东廊 =================
  {
    // 东廊地面
    box(M.terrazzo, 9.5, 0.02, 5.5, 2.9, 0.05, 10.9);
    // 配电间：总闸（破像教学道具）
    box(M.ironDark, 14, 1.5, 4.5, 0.9, 1.6, 0.3);
    colliders.push({ minX: hx + 13.5, maxX: hx + 14.5, minZ: hz + 4.3, maxZ: hz + 4.65, minY: hb, maxY: hb + 2.3 });
    locations.mainBreaker = world(14, 1.5, 4.7);
    box(plateMat('配电重地', { w: 160, h: 64, bg: '#7a2020', fg: '#e8d8b8', font: 0.4 }), 11.16, 1.9, 4.6, 0.05, 0.36, 0.8);
    addLight(0xffc880, 3, 5, 14, 2.4, 4.5, 0.6);
    // 卫生间：隔断+洗手台+镜(全福婆镜像点位①)
    box(M.tile, 14, 0.02, 7.6, 5.9, 0.045, 3.1);
    box(M.marble, 12.5, 0.75, 8.9, 2.2, 0.1, 0.55);
    colliders.push({ minX: hx + 11.4, maxX: hx + 13.6, minZ: hz + 8.6, maxZ: hz + 9.2, minY: hb, maxY: hb + 0.8, noSightBlock: true });
    mirror('toilet', 12.5, 1.55, 9.15, Math.PI, 2.0, 0.9);
    for (const px of [15, 16.2]) {
      box(PLA, px, 1.1, 8.2, 0.08, 2.2, 1.8);
      colliders.push({ minX: hx + px - 0.05, maxX: hx + px + 0.05, minZ: hz + 7.3, maxZ: hz + 9.1, minY: hb, maxY: hb + 2.2 });
    }
    addLight(0xdfe8d8, 5, 6, 13.5, 2.5, 7.8, 2.0); // 频闪最凶的一支
    // 东廊指示
    box(plateMat('→ 蚀湾海洋馆', { w: 256, h: 72, bg: '#12303a', fg: '#9fd8e8', font: 0.4, emissive: 0.6 }), 10.5, 2.3, 9.8, 0.05, 0.4, 1.4);
  }

  // ================= 楼梯间（1F↔2F↔3F） =================
  {
    const sw = { x1: 11, x2: 16.5, z1: -2, z2: 3 };
    // 地面
    box(M.terrazzo, 13.75, 0.02, 0.5, 5.4, 0.045, 4.9);
    // 内部隔墙已由外围完成；补 2F/3F 层的围墙（门在西墙）
    wallZ(PLA, sw.z1, sw.z2, sw.x1, F2, F3, [{ from: 0.6, to: 2.0, top: 2.1 }]);
    wallX(PLA, sw.x1, 17, sw.z2, F2, F3);
    wallX(PLA, sw.x1, 17, sw.z1, F2, F3);
    wallZ(PLA, sw.z1, sw.z2, sw.x1, F3, ROOF, [{ from: 0.6, to: 2.0, top: 2.1 }]);
    wallX(PLA, sw.x1, 17, sw.z2, F3, ROOF);
    wallX(PLA, sw.x1, 17, sw.z1, F3, ROOF);
    // 1F 内的南北墙(z=-2 已由厨房北墙覆盖 x8..17)
    // 梯段：1F→半层平台(东端)→2F；2F→半层→3F
    const flight = (yBase) => {
      stairs(11.6, -0.9, yBase, 15.2, -0.9, yBase + 1.7, 1.5, M.terrazzo);
      // 半层平台
      slabRect(15.3, -2, 16.5, 3, yBase + 1.7, M.terrazzo);
      stairs(15.2, 1.9, yBase + 1.7, 11.2, 1.9, yBase + 3.4, 1.5, M.terrazzo);
      // 中央扶手
      box(M.ironDark, 13.4, yBase + 1.35, -0.15, 3.6, 0.06, 0.06, 0, -Math.atan2(1.7, 3.6), 0);
      box(M.ironDark, 13.4, yBase + 3.05, 1.15, 3.6, 0.06, 0.06, 0, Math.atan2(1.7, 3.6), 0);
      // 中隔护板（两跑之间）
      colliders.push({ minX: hx + 11.8, maxX: hx + 15.2, minZ: hz + 0.35, maxZ: hz + 0.65, minY: hb + yBase, maxY: hb + yBase + 3.4, noSightBlock: true });
      box(PLA, 13.5, yBase + 1.7, 0.5, 3.4, 3.2, 0.12);
    };
    flight(0);
    flight(F2);
    // 「南方大酒店」楼梯间墙标（每层）
    for (const [fy, txt] of [[1.6, '南方大酒店 一层'], [F2 + 1.6, '南方大酒店 二层'], [F3 + 1.6, '南方大酒店 三层']]) {
      box(plateMat(txt, { w: 320, h: 80, bg: '#b8b0a0', fg: '#5a2020', font: 0.4 }), 16.42, fy, 0.5, 0.05, 0.5, 2.4);
    }
    // 每层一支荧光管（1F 这支坏了会闪）
    box(M.fluorescent, 13.75, F2 - 0.08, 0.5, 1.3, 0.05, 0.13);
    box(M.fluorescent, 13.75, F3 - 0.08, 0.5, 1.3, 0.05, 0.13);
    box(M.fluorescent, 13.75, ROOF - 0.5, 0.5, 1.3, 0.05, 0.13);
    addLight(0xdfe8d8, 6, 7, 13.75, F2 - 0.4, 0.5, 1.6);
    addLight(0xdfe8d8, 6, 7, 13.75, F3 - 0.4, 0.5, 0.3);
    locations.stairwell1F = world(12, 0.5, 1.3);
  }

  // ================= 2F：回廊 + 南走廊 + 保卫科 =================
  {
    // 2F 内墙：南走廊(z -6.3..-11 区)与房间
    // 保卫科 x 8..17, z -11..-2，门在 x=8 墙 z -5..-3.8
    wallZ(PLA, -11, -2, 8, F2, F3, [{ from: -5, to: -3.8, top: 2.1 }]);
    wallX(PLA, 8, 11, -2, F2, F3);
    // 棋牌室 x -17..-8, z -5..3，门 x=-8, z -1..-2.2 → 开向回廊西带
    wallZ(PLA, -5, 3, -8, F2, F3, [{ from: -2.2, to: -1, top: 2.1 }]);
    wallX(PLA, -17, -8, 3, F2, F3);
    wallX(PLA, -17, -8, -5, F2, F3);
    // 布草间 x -17..-8, z 3..11 门 x=-8, z 5..6.2
    wallZ(PLA, 3, 11, -8, F2, F3, [{ from: 5, to: 6.2, top: 2.1 }]);
    // 保卫科：值班桌 + 九宫格监视墙 + 钥匙柜 + 行军床
    box(M.veneer, 12.5, F2 + 0.4, -8.5, 2.4, 0.8, 0.9);
    colliders.push({ minX: hx + 11.3, maxX: hx + 13.7, minZ: hz - 8.95, maxZ: hz - 8.05, minY: hb + F2, maxY: hb + F2 + 0.85, noSightBlock: true });
    // 九宫格 CRT 墙（3×3）
    const camViews = [
      [[0, 1.6, 8], [0, 1.2, 2]],         // 大堂
      [[-12.5, 1.6, 3], [-12.5, 1.1, -6]],// 宴会厅
      [[0, F3 + 1.6, 2], [-8, F3 + 1.4, 2]], // 3F 走廊
      [[0, 1.8, 13.5], [0, 1.2, 9]],      // 正门
      [[0.5, 1.6, -9.5], [-6, 1.2, -9.5]],// 服务走廊
      [[13.75, 1.8, 1.5], [13.75, 3.2, -0.5]], // 楼梯间
      [[22, 1.6, 9.5], [30, 1.2, 6]],     // 海洋馆连廊
      [[-12.5, F2 + 1.6, 7], [-12.5, F2 + 1.2, 4.5]], // 布草间(坏)
      [[0, 1.6, 5.5], [0, 1.4, 9.5]],     // 大堂反角
    ];
    for (let i = 0; i < 9; i++) {
      const col = i % 3, row = Math.floor(i / 3);
      crt('sec' + i, 16.1, F2 + 2.15 - row * 0.62, -7.6 + col * 0.72, -Math.PI / 2, 0.62,
        camViews[i][0], camViews[i][1]);
    }
    box(M.steel, 16.35, F2 + 1.5, -6.9, 0.3, 2.2, 2.6); // 监视架
    colliders.push({ minX: hx + 16.1, maxX: hx + 16.6, minZ: hz - 8.3, maxZ: hz - 5.5, minY: hb + F2, maxY: hb + F2 + 2.6 });
    locations.securityDesk = world(13.5, F2 + 1.0, -8);
    // 钥匙柜（807 钥匙）
    box(M.ironDark, 9.5, F2 + 1.4, -10.5, 1.0, 1.2, 0.3);
    locations.keyCabinet = world(9.5, F2 + 1.4, -10.3);
    // 行军床
    box(M.clothWork, 14.5, F2 + 0.25, -10.3, 1.9, 0.3, 0.8);
    // CRT 冷光
    addLight(0x9fd8e8, 6, 7, 15.2, F2 + 1.8, -7, 0.5);
    box(plateMat('保卫科', { w: 160, h: 64, bg: '#3a3a3a', fg: '#d8d0b8', font: 0.44 }), 8.16, F2 + 2.2, -4.4, 0.05, 0.35, 0.8);
    // 棋牌室：麻将桌+散牌+烟灰
    box(M.clothGrey, -12.5, F2 + 0.42, -1, 1.1, 0.84, 1.1);
    for (let i = 0; i < 8; i++) box(M.clothShirt, -12.9 + (i % 4) * 0.26, F2 + 0.87, -1.3 + Math.floor(i / 4) * 0.5, 0.09, 0.06, 0.13, (i * 1.3) % 1);
    for (const [ox, oz] of [[-1.2, 0], [1.2, 0], [0, -1.2], [0, 1.2]]) {
      box(M.veneer, -12.5 + ox, F2 + 0.24, -1 + oz, 0.36, 0.48, 0.36);
    }
    colliders.push({ x: hx - 12.5, z: hz - 1, r: 0.75, maxY: hb + F2 + 0.9, noSightBlock: true });
    addLight(0xffc880, 6, 8, -12.5, F2 + 2.3, -1, 0.2);
    // 布草间：布草架成排（视线遮挡好地形）
    for (const pz of [5.5, 7.5, 9.5]) {
      box(M.steel, -12.5, F2 + 1.0, pz, 6.5, 2.0, 0.5);
      colliders.push({ minX: hx - 15.75, maxX: hx - 9.25, minZ: hz + pz - 0.28, maxZ: hz + pz + 0.28, minY: hb + F2, maxY: hb + F2 + 2.0 });
      box(M.clothShirt, -12.5, F2 + 0.7, pz, 5.8, 0.5, 0.44);
      box(M.clothShirt, -12.5, F2 + 1.5, pz, 5.4, 0.4, 0.44);
    }
    // 南走廊荧光
    for (const px of [-12, -4, 4]) box(M.fluorescent, px, F3 - 0.06, -8.6, 1.4, 0.05, 0.14);
    addLight(0xdfe8d8, 8, 12, -4, F3 - 0.4, -8.6, 0.4);
    // 回廊装饰：镜面柱头对位的栏杆已建；墙挂旧照片框
    for (const pz of [3, 6]) box(M.veneer, -7.9, F2 + 1.8, pz, 0.05, 0.7, 0.5);
  }

  // ================= 3F：客房走廊 + 807 =================
  {
    // 走廊 z 0..3，x -13..12；墙纸内墙
    wallX(WP, -13, 12, 3, F3, ROOF, [
      { from: -12, to: -10.8, top: 2.05 },  // 103
      { from: -6, to: -4.8, top: 2.05 },    // 105
      { from: 0, to: 1.2, top: 2.05 },      // 107
      { from: 6, to: 7.2, top: 2.05 },      // 109
    ]);
    wallX(WP, -13, 12, 0, F3, ROOF, [
      { from: -10.5, to: -9.3, top: 2.05 }, // 807(西南)
      { from: -3, to: -1.8, top: 2.05 },    // 104(锁)
      { from: 4, to: 5.2, top: 2.05 },      // 106(锁)
    ]);
    // 走廊西端封墙（东端 x=11 的墙已在楼梯间段带门建好）
    wallZ(WP, 0, 3, -13, F3, ROOF);
    // 北侧房间隔墙
    for (const px of [-7, -1, 5]) wallZ(WP, 3, 11, px, F3, ROOF);
    // 南侧房间隔墙
    wallZ(WP, -11, 0, -8, F3, ROOF); // 807 与 104 之间
    for (const px of [-2, 4]) wallZ(WP, -11, 0, px, F3, ROOF);
    wallX(WP, -17, -8, -3.5, F3, ROOF, [{ from: -13.5, to: -12.3, top: 2.05 }]); // 807 内间隔墙
    // 走廊地毯 + 壁灯
    box(M.carpet, -1, F3 + 0.03, 1.5, 23.9, 0.03, 2.9);
    for (const px of [-11, -5, 1, 7]) {
      box(M.tungsten, px, F3 + 2.2, 2.86, 0.3, 0.18, 0.08);
    }
    addLight(0xffc880, 7, 9, -5, F3 + 2.2, 1.5, 0.12);
    addLight(0xffc880, 7, 9, 5, F3 + 2.2, 1.5, 0.12);
    // 走廊尽头镜（全福婆早一拍点位②）
    mirror('corridor3F', -12.9, F3 + 1.5, 1.5, Math.PI / 2, 1.4, 1.8);
    // 门与门牌
    const doorAt = (px, pz, num, open = 0) => {
      const doorM = M.veneer;
      if (open > 0) {
        box(doorM, px - 0.6 + Math.sin(open) * 0.5, F3 + 1.02, pz + (pz > 1.5 ? 1 : -1) * Math.sin(open) * 0.45, 1.1, 2.02, 0.06, (pz > 1.5 ? -open : open));
      } else {
        box(doorM, px, F3 + 1.02, pz, 1.16, 2.02, 0.07);
        colliders.push({ minX: hx + px - 0.6, maxX: hx + px + 0.6, minZ: hz + pz - 0.05, maxZ: hz + pz + 0.05, minY: hb + F3, maxY: hb + F3 + 2.05 });
      }
      box(plateMat(num, { w: 96, h: 56, bg: '#5a2020', fg: '#e8d8a8', font: 0.5 }), px + 0.75, F3 + 1.75, pz + (pz > 1.5 ? -0.08 : 0.08), 0.3, 0.18, 0.03);
    };
    doorAt(-11.4, 3, '103');
    doorAt(-5.4, 3, '105');
    doorAt(0.6, 3, '107', 0.7);   // 107 虚掩
    doorAt(6.6, 3, '109');
    doorAt(-2.4, 0, '104');
    doorAt(4.6, 0, '106');
    doorAt(-9.9, 0, '807', 1.1);  // 807 门大开——三层走廊尽头挂着八楼的门牌
    // 107 客房（可进）：双床+印花被+暖瓶+窗
    {
      box(M.carpet, 2, F3 + 0.03, 7, 5.9, 0.03, 7.9);
      for (const px of [0.6, 3.4]) {
        box(M.veneer, px, F3 + 0.25, 8.5, 1.25, 0.5, 2.1);
        box(M.clothShirt, px, F3 + 0.56, 8.5, 1.22, 0.16, 2.05);
        box(M.clothRed, px, F3 + 0.62, 9.1, 1.22, 0.1, 0.9);
        colliders.push({ minX: hx + px - 0.65, maxX: hx + px + 0.65, minZ: hz + 7.4, maxZ: hz + 9.6, minY: hb + F3, maxY: hb + F3 + 0.7, noSightBlock: true });
      }
      box(M.veneer, 2, F3 + 0.35, 8.5, 0.5, 0.7, 0.5); // 床头柜
      box(M.crtShell, 2, F3 + 0.78, 8.5, 0.22, 0.3, 0.22); // 暖瓶
      locations.room107 = world(2, F3 + 0.8, 7);
      addLight(0xffc880, 4, 6, 2, F3 + 2.3, 7, 0.1);
    }
    // 807 套房：外间(圆桌茶具) + 卧室(喜床/三面镜梳妆台/CRT 电视)
    {
      box(M.carpet, -12.5, F3 + 0.03, -5.5, 8.9, 0.03, 10.9);
      // 外间
      cyl(M.veneerRed, -10.5, F3 + 0.42, -1.8, 0.9, 0.84, 0.9);
      colliders.push({ x: hx - 10.5, z: hz - 1.8, r: 0.55, maxY: hb + F3 + 0.9, noSightBlock: true });
      cyl(M.clothShirt, -10.5, F3 + 0.88, -1.8, 0.3, 0.04, 0.3); // 茶盘
      // 红枣花生盘（撒了一半在桌上）
      for (let i = 0; i < 7; i++) B.add(GEO.sphere, M.clothRed, hx - 10.5 + Math.sin(i * 2.1) * 0.2, hb + F3 + 0.92, hz - 1.8 + Math.cos(i * 1.7) * 0.18, 0, 0.03, 0.025, 0.03);
      // 卧室：喜床
      box(M.veneerRed, -14, F3 + 0.3, -8.5, 2.3, 0.6, 2.6);
      box(M.satin, -14, F3 + 0.66, -8.5, 2.26, 0.16, 2.5);
      box(M.satin, -14, F3 + 0.78, -9.4, 2.2, 0.3, 0.7);
      box(M.veneerRed, -14, F3 + 1.3, -9.75, 2.3, 1.4, 0.12);
      colliders.push({ minX: hx - 15.2, maxX: hx - 12.8, minZ: hz - 9.85, maxZ: hz - 7.2, minY: hb + F3, maxY: hb + F3 + 0.85, noSightBlock: true });
      // 囍字贴床头
      box(M.xiPanel, -14, F3 + 1.7, -9.68, 0.9, 0.9, 0.05);
      // 三面镜梳妆台（上头仪式位）
      box(M.veneerRed, -9.5, F3 + 0.4, -9.2, 1.5, 0.8, 0.55);
      colliders.push({ minX: hx - 10.25, maxX: hx - 8.75, minZ: hz - 9.5, maxZ: hz - 8.9, minY: hb + F3, maxY: hb + F3 + 0.85, noSightBlock: true });
      mirror('dresserC', -9.5, F3 + 1.45, -9.42, 0, 0.85, 1.05);
      mirror('dresserL', -10.2, F3 + 1.45, -9.35, 0.5, 0.5, 0.95);
      mirror('dresserR', -8.8, F3 + 1.45, -9.35, -0.5, 0.5, 0.95);
      box(M.veneerRed, -9.5, F3 + 0.86, -9.3, 0.4, 0.12, 0.3); // 妆盒
      locations.dresser807 = world(-9.5, F3 + 1.0, -8.6);
      // CRT 电视（母带播放点）
      box(M.veneer, -11.8, F3 + 0.35, -9.3, 1.0, 0.7, 0.55);
      crt('room807', -11.8, F3 + 1.0, -9.3, 0, 0.9, [-12.5, F3 + 1.5, -5], [-12.5, F3 + 1.0, -8.5]);
      colliders.push({ minX: hx - 12.3, maxX: hx - 11.3, minZ: hz - 9.6, maxZ: hz - 9.0, minY: hb + F3, maxY: hb + F3 + 1.3, noSightBlock: true });
      locations.tv807 = world(-11.8, F3 + 1.0, -8.9);
      // 立式衣柜 + 红皮箱
      box(M.veneerRed, -16.3, F3 + 1.05, -6, 0.6, 2.1, 1.4);
      colliders.push({ minX: hx - 16.6, maxX: hx - 16.0, minZ: hz - 6.7, maxZ: hz - 5.3, minY: hb + F3, maxY: hb + F3 + 2.1 });
      box(M.clothRed, -16.2, F3 + 0.3, -3.5, 0.7, 0.5, 0.45);
      // 床头灯（暖）
      addLight(0xffc880, 6, 7, -14, F3 + 1.4, -7.5, 0.1);
      addLight(0xff5040, 4, 6, -10.5, F3 + 2.2, -1.8, 0.2);
      locations.room807 = world(-12, F3 + 0.8, -5.5);
      locations.suite807Door = world(-9.9, F3 + 1.0, 0.5);
    }
  }

  // ================= 海洋馆连廊 + 售票厅 =================
  {
    // 连廊 x 17..27, z 8.6..11：玻璃廊
    box(M.terrazzo, 22, 0.02, 9.8, 10, 0.05, 2.4);
    addPatch(hx + 22, hz + 9.8, 0, 10, 2.4, hb, hb);
    slabRect(17, 8.6, 27, 11, 2.7, null, { walk: false });
    // 廊柱与玻璃
    for (let px = 17.5; px <= 26.5; px += 3) {
      for (const pz of [8.72, 10.9]) {
        box(M.steel, px, 1.3, pz, 0.16, 2.6, 0.16);
      }
    }
    box(M.aquaGlass, 22, 1.35, 8.66, 10, 2.5, 0.06);
    colliders.push({ minX: hx + 17, maxX: hx + 27, minZ: hz + 8.56, maxZ: hz + 8.76, minY: hb, maxY: hb + 2.7, noSightBlock: true });
    box(M.aquaGlass, 22, 1.35, 10.94, 10, 2.5, 0.06);
    colliders.push({ minX: hx + 17, maxX: hx + 27, minZ: hz + 10.84, maxZ: hz + 11.04, minY: hb, maxY: hb + 2.7, noSightBlock: true });
    // 售票厅 x 27..39, z -3..11
    box(M.terrazzo, 33, 0.02, 4, 11.9, 0.05, 13.9);
    addPatch(hx + 33, hz + 4, 0, 11.9, 13.9, hb, hb);
    wallX(TILE, 27, 39, 11, 0, 4.6, [{ from: 31, to: 35, top: 3.2, sill: 0.8 }]);
    wallX(TILE, 27, 39, -3, 0, 4.6);
    wallZ(TILE, -3, 11, 39, 0, 4.6);
    wallZ(TILE, -3, 8.6, 27, 0, 4.6, [{ from: 2, to: 4, top: 2.4, sill: 1.1 }]);
    slabRect(27, -3, 39, 11, 4.6, null, { walk: false });
    // 大门脸招牌
    box(M.signAqua, 33, 3.9, 11.2, 7.5, 1.3, 0.2);
    // 售票亭
    box(M.veneer, 30, 0.75, 8, 1.8, 1.5, 1.4);
    box(M.crtGlass, 30, 1.9, 8, 1.7, 0.8, 1.3);
    colliders.push({ minX: hx + 29.1, maxX: hx + 30.9, minZ: hz + 7.3, maxZ: hz + 8.7, minY: hb, maxY: hb + 2.4 });
    box(plateMat('票价 成人5元', { w: 224, h: 96, bg: '#e0d8c0', fg: '#333', font: 0.3 }), 30, 1.35, 8.75, 0.9, 0.45, 0.03);
    // 三道闸机
    for (const pz of [4.5, 5.7, 6.9]) {
      box(M.steel, 33.5, 0.55, pz, 0.25, 1.1, 0.9);
      colliders.push({ minX: hx + 33.35, maxX: hx + 33.65, minZ: hz + pz - 0.45, maxZ: hz + pz + 0.45, minY: hb, maxY: hb + 1.1, noSightBlock: true });
      box(M.ironDark, 33.9, 0.85, pz - 0.3, 0.55, 0.05, 0.05);
    }
    // 大展缸墙（暗的，里面沉着白化珊瑚/沉积柱——馆已停业）
    box(M.ironDark, 33, 2.3, -2.6, 11.5, 4.4, 0.5);
    box(M.aquaGlass, 33, 1.9, -2.25, 10.5, 3.0, 0.12);
    colliders.push({ minX: hx + 27.6, maxX: hx + 38.4, minZ: hz - 2.5, maxZ: hz - 2.0, minY: hb, maxY: hb + 4.4 });
    // 缸内沉积轮廓（贴着玻璃后面）
    for (let i = 0; i < 6; i++) {
      const px2 = 28.6 + i * 1.8;
      B.add(GEO.cone, M.sediment, hx + px2, hb + 0.8 + (i % 3) * 0.5, hz - 2.44, i, 0.8, 1.6 + (i % 3), 0.5);
    }
    addLight(0x2a5a5a, 8, 12, 33, 3.2, -1.5, 0.35);
    // 值班室（西南角）：母带柜
    wallZ(PLA, -3, 1.5, 36, 0, 2.6, [{ from: -0.5, to: 0.7, top: 2.05 }]);
    wallX(PLA, 36, 39, 1.5, 0, 2.6);
    box(M.veneer, 38, 1.1, -1.5, 0.6, 2.2, 1.6);
    colliders.push({ minX: hx + 37.7, maxX: hx + 38.3, minZ: hz - 2.3, maxZ: hz - 0.7, minY: hb, maxY: hb + 2.2 });
    box(M.veneer, 37, 0.4, 0.5, 1.2, 0.8, 0.7);
    locations.tapeCabinet = world(38, 1.2, -1.2);
    locations.aquaOffice = world(37.5, 0.6, 0.2);
    crt('aqua', 37, 0.95, 0.5, Math.PI, 0.8, [33, 1.5, 6], [33, 1.1, 0]);
    addLight(0xffc880, 4, 6, 37.5, 2.2, 0, 0.4);
    // 宣传横幅（褪色）
    box(plateMat('看海底一万年', { w: 320, h: 72, bg: '#3a5a62', fg: '#cfe0e0', font: 0.4 }), 33, 3.1, 10.86, 5.5, 0.7, 0.06);
    locations.aquaHall = world(33, 0.6, 5);
  }

  // ================= 巡逻/工位 =================
  patrols.waiterBanquet = [[-14.5, -6.8], [-10.5, -6.8], [-9.2, 2.8], [-13.5, 2.8], [-15.6, -2]].map(([x, z]) => [hx + x, hz + z]);
  patrols.waiterLobby = [[3, -9.5], [-6, -9.5], [-6.5, -3], [-4.5, 1.8], [4.5, 3.5], [6.8, 8.5], [0, 9.6]].map(([x, z]) => [hx + x, hz + z]);
  patrols.waiterEast = [[9.5, 1.5], [9.5, 9.6], [22, 9.8], [30.5, 5.5], [33, 1]].map(([x, z]) => [hx + x, hz + z]);
  patrols.security2F = [[12.5, -7], [9, -4.5], [-1, -8.6], [-12, -8.6], [-1, -8.6], [9, -4.5]].map(([x, z]) => [hx + x, hz + z]);
  patrols.matron3F = [[-11.5, 1.5], [7, 1.5], [1, 1.5], [-9.9, 0.8]].map(([x, z]) => [hx + x, hz + z]);
  patrols.emceeStage = [hx - 12.5, hz - 8.6];
  patrols.hotelFloorY = { f1: hb, f2: hb + F2, f3: hb + F3 };

  // ================= 浮客布点（实体系统取用） =================
  dynamic.floaterSpots = [
    world(-2.5, 0, 7.5), world(2.8, 0, 3.2), world(-5.5, 0, 1.2),
    world(-10.5, 0, 6.5), world(-15, 0, 2.2),
  ];
  dynamic.hotelInfo = {
    origin: { x: hx, y: hb, z: hz }, F2, F3,
    lobbyRect: { minX: hx - 8, maxX: hx + 8, minZ: hz + 0, maxZ: hz + 11 },
    banquetRect: { minX: hx - 17, maxX: hx - 8, minZ: hz - 11, maxZ: hz + 11 },
    footprint: { minX: hx - 17.4, maxX: hx + 17.4, minZ: hz - 11.4, maxZ: hz + 11.4 },
    annexRect: { minX: hx + 17, maxX: hx + 39.4, minZ: hz - 3.4, maxZ: hz + 11.4 },
  };

  return dynamic.hotelInfo;
}
