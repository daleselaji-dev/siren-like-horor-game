// 南方大酒店（1998 年落成，填湾地基）+ 蚀湾海洋馆售票厅连廊
// 2001 年中国县镇酒店：水磨石+金不锈钢包边+红漆总台+红毯大楼梯+镜面柱+核册红妆
// 结构（局部坐标，+z 朝北面向镇中心，原点在酒店平面中心）：
//   1F: 大堂(挑空)/宴会厅(西翼)/服务走廊(南)/备餐间(东南)/楼梯间(东)/配电间/东廊→海洋馆连廊
//   2F: 回廊(环挑空)/南走廊/保卫科监控室(东南)/棋牌室/布草间
//   3F: 客房走廊(103/105/107/109…)/807 套房(西南)
// 输出挂载: locations.* / patrols.* / dynamic.crts / dynamic.mirrors / dynamic.hotel*
import * as THREE from 'three';
import { GEO } from './batcher.js';
import { makeLightCone } from './materials.js';

// 门牌/标牌小贴图（按文本缓存）
const _plateCache = new Map();
export function plateMat(text, { w = 128, h = 64, bg = '#3a2c22', fg = '#d8cfb8', font = 0.5, emissive = 0 } = {}) {
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
  m.userData.fullUV = true; // 合批时保持 0..1 UV（世界平铺会把字条切掉）
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
  // 内墙画风区间：前场 PLA=乳白调和漆（营业中的旧），后勤/楼梯间 SVC=冷灰漆+机关绿墙裙
  const TILE = M.tile, PLA = M.hotelWall, SVC = M.serviceWall, WP = M.wallpaper;
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
  // 窗玻璃（整排一次性，藏进墙厚中缝——只在窗洞处露出，不能贴到内墙面）
  // 轮15：换 interior-mapping 假房间——16 樘客房窗后各自长出带视差的进深，
  // 两成亮着暖灯（住着人的楼），临街立面不再是一条黑玻璃带
  for (const y0 of [F2, F3]) {
    box(M.winRoom, 0, y0 + 1.7, 10.96, 33.4, 1.35, 0.04); // 轮16：玻璃退进墙厚——窗洞有了真进深
  }
  // 南立面 z=-11：厨房后门 + 窗
  wallX(TILE, -17, 17, -11, 0, F2, [
    { from: 11.5, to: 13, top: 2.2 },          // 后勤门
    { from: -4, to: -2, top: 2.4, sill: 1.2 }, { from: 2, to: 4, top: 2.4, sill: 1.2 },
  ]);
  wallX(TILE, -17, 17, -11, F2, ROOF, [
    { from: -14, to: -12, top: 5.8, sill: 4.4 }, { from: -8, to: -6, top: 5.8, sill: 4.4 },
    { from: -2, to: 0, top: 5.8, sill: 4.4 }, { from: 4, to: 6, top: 5.8, sill: 4.4 }, { from: 10, to: 12, top: 5.8, sill: 4.4 },
  ]);
  box(M.winRoom, -1, F3 + 1.7, -10.96, 27, 1.35, 0.04); // 3F 南窗假房间带（退进墙厚）
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
    { from: -6, to: -4, top: 5.8, sill: 4.4 }, { from: 0, to: 2, top: 5.8, sill: 4.4 }, { from: 5, to: 7, top: 5.8, sill: 4.4 },
  ]);
  box(M.winRoom, 16.96, F3 + 1.7, 0.5, 0.04, 1.35, 13.5); // 3F 东窗假房间带（退进墙厚）
  // 屋顶
  slabRect(-17, -11, 17, 11, ROOF, null, { walk: false });
  // 女儿墙
  wallX(M.plaster, -17.2, 17.2, 11.1, ROOF, ROOF + 0.9);
  wallX(M.plaster, -17.2, 17.2, -11.1, ROOF, ROOF + 0.9);
  wallZ(M.plaster, -11.1, 11.1, -17.1, ROOF, ROOF + 0.9);
  wallZ(M.plaster, -11.1, 11.1, 17.1, ROOF, ROOF + 0.9);
  // 楼顶大招牌（钢架 + 灯箱）——轮20：架上中央塔楼（整层高 4F 客房塔）的顶上，
  // 招牌成为塔楼的冠：广角剪影 = 低两翼(3F) → 高中央塔(4F+女儿墙) → 字架
  const ATTIC_T = ROOF + 4.15;   // 中央塔楼女儿墙顶（塔体在轮20 块里砌）
  box(M.signSouth, 0, ATTIC_T + 0.98, 8.9, 10.5, 1.7, 0.25);
  for (const sx of [-4.5, 0, 4.5]) box(M.ironDark, sx, ATTIC_T + 0.55, 8.6, 0.12, 1.1, 0.12, 0, 0.3, 0);
  // 侧壁竖招牌
  box(M.signSouthV, 17.15, F3 + 0.4, 9.0, 0.22, 5.6, 1.1);
  // （轮19：旧「快速细节」空调盒删除——正式机组在轮18 块里带架带栅，
  //   且随阳台挑板带整体下移到窗台线之下）
  // 立面层次（轮14）：层间腰线 + 逐窗出挑窗台 + 女儿墙压顶——
  // 三层大盒有了横向楼层节奏与逐窗投影，远看不再是一整块贴了窗纸的板
  {
    const winsN = [[-15.5, -13.5], [-11.5, -9.5], [-7, -5], [-2.5, -0.5], [1.5, 3.5], [6, 8], [10.5, 12.5], [14, 16]];
    for (const y0 of [F2, F3]) {
      box(M.concreteDark, 0, y0 + 0.05, 11.14, 34.6, 0.18, 0.28);       // 北腰线
      box(M.concreteDark, -17.14, y0 + 0.05, 0, 0.28, 0.18, 22.6);      // 西腰线
      box(M.concreteDark, 17.14, y0 + 0.05, 0, 0.28, 0.18, 22.6);       // 东腰线
      box(M.concreteDark, 0, y0 + 0.05, -11.14, 34.6, 0.18, 0.28);      // 南腰线
      for (const [a, b] of winsN) {
        box(M.concreteDark, (a + b) / 2, y0 + 0.955, 11.12, b - a + 0.22, 0.08, 0.24); // 窗台出挑
        box(M.concreteDark, (a + b) / 2, y0 + 2.46, 11.1, b - a + 0.18, 0.07, 0.2);    // 窗楣滴水
      }
    }
    // 女儿墙压顶一圈
    box(M.concreteDark, 0, ROOF + 0.93, 11.16, 34.8, 0.12, 0.32);
    box(M.concreteDark, 0, ROOF + 0.93, -11.16, 34.8, 0.12, 0.32);
    box(M.concreteDark, -17.16, ROOF + 0.93, 0, 0.32, 0.12, 22.6);
    box(M.concreteDark, 17.16, ROOF + 0.93, 0, 0.32, 0.12, 22.6);
    // （轮19：锈滴痕随空调机组一起移交轮18 块）
  }

  // ================= 立面轮16：真窗框/窗洞进深/勒脚/伸缩缝/落水管/屋顶设备层 =================
  // 门3审计的「灰盒大楼+扁窗带」根治：每一樘窗有绿漆钢框+中梃+上悬亮子，
  // 玻璃退进墙厚 19cm（洞口四壁是真的），墙面有分缝与污迹分层，屋顶轮廓不再是一条直线
  {
    const winsN = [[-15.5, -13.5], [-11.5, -9.5], [-7, -5], [-2.5, -0.5], [1.5, 3.5], [6, 8], [10.5, 12.5], [14, 16]];
    const frameM = new THREE.MeshStandardMaterial({
      color: 0x37544a, roughness: 0.5, metalness: 0.25, envMapIntensity: 0.9,
    }); // 老绿漆钢窗（1998 落成县镇酒店的标配）
    // 一樘窗的框系（朝 +z）：外框四边 + 竖中梃 + 上亮子横梃 + 洞口顶/侧反光板（进深读感）
    const winFrameN = (a, b, y0, lz) => {
      const cx2 = (a + b) / 2, w2 = b - a, sillY = y0 + 1.0, topY = y0 + 2.4, ch = topY - sillY;
      const fz = lz - 0.09; // 框面缩进墙面 9cm
      box(frameM, cx2, sillY + ch / 2, fz, w2, 0.055, 0.06);            // 下框（贴槛）
      box(frameM, cx2, topY - 0.03, fz, w2, 0.055, 0.06);               // 上框
      box(frameM, a + 0.03, sillY + ch / 2, fz, 0.055, ch, 0.06);       // 左框
      box(frameM, b - 0.03, sillY + ch / 2, fz, 0.055, ch, 0.06);       // 右框
      box(frameM, cx2, sillY + ch / 2, fz, 0.05, ch, 0.055);            // 竖中梃
      box(frameM, cx2, topY - 0.42, fz, w2, 0.05, 0.055);               // 上悬亮子横梃
      box(frameM, cx2, sillY + 0.035, fz, w2 - 0.1, 0.05, 0.05);        // 底框压条
      // 洞口四壁（墙厚里的反光面）：顶暗/侧亮——远看窗洞是「腔」，不是贴纸
      box(M.concreteDark, cx2, topY - 0.02, lz - 0.075, w2, 0.04, 0.15);
      box(M.plaster, a + 0.02, sillY + ch / 2, lz - 0.075, 0.04, ch, 0.15);
      box(M.plaster, b - 0.02, sillY + ch / 2, lz - 0.075, 0.04, ch, 0.15);
    };
    for (const y0 of [F2, F3]) for (const [a, b] of winsN) winFrameN(a, b, y0, 11.15);
    // 南立面 3F 五樘 + 东立面 3F 三樘 + 西立面三樘（同框系，朝向翻转）
    const winFrameS = (a, b, y0) => {
      const cx2 = (a + b) / 2, sillY = y0 + 1.0, topY = y0 + 2.4, ch = topY - sillY, w2 = b - a;
      box(frameM, cx2, sillY + ch / 2, -11.06, w2, 0.055, 0.06);
      box(frameM, cx2, topY - 0.03, -11.06, w2, 0.055, 0.06);
      box(frameM, a + 0.03, sillY + ch / 2, -11.06, 0.055, ch, 0.06);
      box(frameM, b - 0.03, sillY + ch / 2, -11.06, 0.055, ch, 0.06);
      box(frameM, cx2, sillY + ch / 2, -11.06, 0.05, ch, 0.055);
    };
    for (const [a, b] of [[-14, -12], [-8, -6], [-2, 0], [4, 6], [10, 12]]) winFrameS(a, b, F3); // 南3F窗带 sill=F2+4.4=F3+1.0
    const winFrameZ = (a, b, sillY, topY, lx) => {
      const cz2 = (a + b) / 2, ch = topY - sillY, w2 = b - a;
      box(frameM, lx, sillY + ch / 2, cz2, 0.06, ch, 0.05); // 竖中梃
      box(frameM, lx, sillY + 0.03, cz2, 0.06, 0.055, w2);
      box(frameM, lx, topY - 0.03, cz2, 0.06, 0.055, w2);
      box(frameM, lx, sillY + ch / 2, a + 0.03, 0.06, ch, 0.055);
      box(frameM, lx, sillY + ch / 2, b - 0.03, 0.06, ch, 0.055);
    };
    for (const [a, b] of [[-6, -4], [0, 2], [5, 7]]) winFrameZ(a, b, F2 + 4.4, F2 + 5.8, 17.15);
    for (const [a, b] of [[-6, -4], [1, 3], [6, 8]]) winFrameZ(a, b, 1.0, 2.4, -17.15);
    // —— 勒脚（水泥基座带）：楼是从地里长出来的，不是摆上去的 ——
    box(M.concreteDark, -11.7, 0.3, 11.18, 11.0, 0.6, 0.1);
    box(M.concreteDark, 11.7, 0.3, 11.18, 11.0, 0.6, 0.1);
    box(M.concreteDark, 0, 0.3, -11.18, 34.4, 0.6, 0.1);
    box(M.concreteDark, -17.18, 0.3, 0, 0.1, 0.6, 22.4);
    box(M.concreteDark, 17.18, 0.3, 0, 0.1, 0.6, 22.4);
    // —— 转角壁柱（水泥抹面）：盒子四棱断开瓷砖面 ——
    for (const [px, pz] of [[-17.1, 11.05], [17.1, 11.05], [-17.1, -11.05], [17.1, -11.05]]) {
      box(M.concrete, px, (ROOF + 0.9) / 2, pz, 0.5, ROOF + 0.9, 0.5);
    }
    // —— 伸缩缝（贯通竖缝两道）+ 逐段瓷砖色差补丁（旧楼修补过的面）——
    for (const jx of [-8.25, 9.25]) box(M.ironDark, jx, (ROOF + 0.6) / 2, 11.16, 0.07, ROOF + 0.6, 0.04);
    box(M.concreteDark, -3.7, F2 + 1.1, 11.155, 1.3, 1.6, 0.02);  // 修补砂浆片
    box(M.concreteDark, 12.9, F3 + 0.5, 11.155, 0.9, 1.1, 0.02);
    // —— 落水管两根（带弯头出水）+ 女儿墙泄水口锈痕 ——
    for (const px of [-16.5, 16.5]) {
      cyl(M.concrete, px, (ROOF + 0.7) / 2, 11.26, 0.13, ROOF + 0.7, 0.13);
      cyl(M.concrete, px, 0.18, 11.42, 0.12, 0.5, 0.12, 0, 1.2, 0);   // 弯头
      box(M.concreteDark, px, 0.02, 11.5, 0.7, 0.03, 0.5);            // 排水溅蚀斑
    }
    for (const px of [-13.2, -1.9, 6.4, 15.1]) {
      box(M.concreteDark, px, ROOF + 0.15, 11.17, 0.24, 1.3, 0.03);   // 泄水口下的黑水锈舌
    }
    // —— 屋顶设备层：电梯机房/水箱/天线/排气管——盒楼的天际线终于有了「上面」 ——
    // （压着楼顶北半布置：从镇街仰看，剪影要越过女儿墙）
    box(M.plaster, -12.5, ROOF + 1.2, 7.0, 4.6, 2.4, 4.6);            // 电梯机房
    box(M.concreteDark, -12.5, ROOF + 2.46, 7.0, 4.9, 0.14, 4.9);     // 机房压顶
    box(M.ironDark, -10.22, ROOF + 0.85, 7.0, 0.06, 1.7, 0.9);        // 机房铁门
    box(M.concreteDark, -12.5, ROOF + 1.7, 9.33, 3.2, 1.0, 0.04);     // 机房北墙雨渍
    cyl(M.steel, 11.5, ROOF + 2.35, 8.0, 2.6, 1.7, 2.6);              // 不锈钢水箱
    cyl(M.steel, 11.5, ROOF + 3.24, 8.0, 1.0, 0.3, 1.0);              // 水箱顶盖帽
    for (const [lx2, lz2] of [[10.6, 7.1], [12.4, 7.1], [10.6, 8.9], [12.4, 8.9]]) {
      cyl(M.ironDark, lx2, ROOF + 0.75, lz2, 0.09, 1.5, 0.09);        // 水箱腿
    }
    // 轮19：天线/烟囱挪出中央退台体footprint（x±8/z-9..9.5），落在两翼低屋面上——
    // 广角里「上面有东西」的锯齿全部长在退台后的侧翼屋顶，层级更分明
    cyl(M.ironDark, 14.6, ROOF + 2.9, 7.4, 0.07, 5.8, 0.07);          // 电视天线杆（东翼屋面）
    for (const ay of [4.6, 5.15]) box(M.ironDark, 14.6, ROOF + ay, 7.4, 1.7, 0.035, 0.035, 0.5);
    cyl(M.ironDark, 14.6, ROOF + 5.75, 7.4, 0.16, 0.05, 0.16);        // 杆顶避雷帽
    for (const [vx, vz] of [[-10.3, 2.6], [10.4, 1.2]]) cyl(M.concrete, vx, ROOF + 0.55, vz, 0.3, 1.1, 0.3); // 排气烟囱
  }

  // ================= 立面轮25：整幅风化蒙尘层 + 逐窗台淌水痕 =================
  // 父审「仍是低模雨夜灰楼/一整块米黄盒子」——瓷砖 tile 的砖缝/grime 频率太高，
  // 广角 30m 外读不出来；缺的是「低频」的脏：整幅雨洗蒙尘贴花（明度低频起伏
  // + 檐口淌水带 + 底部溅泥带）盖在三面外墙外 5mm，逐窗台再各贴一片淌水痕。
  // 全部透明贴花，不动墙体几何与既有断言标记色
  {
    const washM = new THREE.MeshStandardMaterial({
      map: M.textures.facadeWeather, transparent: true, depthWrite: false,
      roughness: 1.0, polygonOffset: true, polygonOffsetFactor: -1,
    });
    const mkWash = (w, h, pos, ry = 0) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), washM);
      m.position.copy(pos);
      m.rotation.y = ry;
      m.renderOrder = 1;
      m.castShadow = false;
      m.receiveShadow = false;
      scene.add(m);
    };
    mkWash(34.3, 10.0, world(0, 5.1, 11.157));                    // 北立面整幅
    mkWash(34.3, 10.0, world(0, 5.1, -11.157), Math.PI);          // 南立面
    mkWash(22.3, 10.0, world(-17.157, 5.1, 0), -Math.PI / 2);     // 西立面
    mkWash(22.3, 10.0, world(17.157, 5.1, 0), Math.PI / 2);       // 东立面
    // 逐窗台淌水痕（北立面 2F/3F 十六樘）：窗角起头、向下渐消
    const streakM = new THREE.MeshStandardMaterial({
      map: M.textures.sillStreak, transparent: true, depthWrite: false,
      roughness: 1.0, polygonOffset: true, polygonOffsetFactor: -2,
    });
    const winsN25 = [[-15.5, -13.5], [-11.5, -9.5], [-7, -5], [-2.5, -0.5], [1.5, 3.5], [6, 8], [10.5, 12.5], [14, 16]];
    for (const y0 of [F2, F3]) {
      for (const [a, b] of winsN25) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(b - a + 0.2, 0.95), streakM);
        m.position.copy(world((a + b) / 2, y0 + 0.48, 11.16));
        m.renderOrder = 2;
        m.castShadow = false;
        scene.add(m);
      }
    }
  }

  // ================= 立面轮17：窗套/竖壁柱/线脚层叠/逐窗雨痕/雨棚梁吊筋/屋顶栏杆 =================
  // 门3审计「整栋仍像浅灰矩形盒+扁窗」的加密轮：远看第一读是四道竖壁柱与
  // 逐窗抹灰窗套的凹凸网格 + 檐下阴影暗带；近看每樘窗有 10cm 出墙的围框、
  // 加厚窗台板与台下雨痕——立面每一格都有进深，污渍有年龄
  {
    const winsN = [[-15.5, -13.5], [-11.5, -9.5], [-7, -5], [-2.5, -0.5], [1.5, 3.5], [6, 8], [10.5, 12.5], [14, 16]];
    const surroundM = new THREE.MeshStandardMaterial({ color: 0x8d887c, roughness: 0.86 }); // 窗套抹灰（断言标记色）
    const pilM = new THREE.MeshStandardMaterial({ color: 0x767066, roughness: 0.9 });       // 壁柱水泥（断言标记色）
    let rs = 7;
    const rnd2 = () => (rs = (rs * 16807) % 2147483647) / 2147483647;
    for (const y0 of [F2, F3]) {
      for (const [a, b] of winsN) {
        const cx2 = (a + b) / 2, w2 = b - a, sillY = y0 + 1.0, topY = y0 + 2.4, ch = topY - sillY;
        box(surroundM, cx2, topY + 0.1, 11.2, w2 + 0.44, 0.2, 0.24);        // 窗套上枋（出墙 10cm）
        box(surroundM, a - 0.11, y0 + 1.71, 11.2, 0.22, ch + 0.4, 0.24);    // 窗套左梃
        box(surroundM, b + 0.11, y0 + 1.71, 11.2, 0.22, ch + 0.4, 0.24);    // 窗套右梃
        box(M.concreteDark, cx2, sillY - 0.1, 11.23, w2 + 0.52, 0.1, 0.34); // 窗台板加厚出挑
        // 台板下雨痕（位置/长短逐窗错落——同一场雨，不同的年龄）
        for (let k2 = 0; k2 < 2; k2++) {
          if (k2 && rnd2() < 0.4) continue;
          const sxp = cx2 - w2 * 0.3 + rnd2() * w2 * 0.6;
          const ln2 = 0.5 + rnd2() * 0.9;
          box(M.concreteDark, sxp, sillY - 0.18 - ln2 / 2, 11.157, 0.08 + rnd2() * 0.06, ln2, 0.012);
        }
      }
      // 腰线层叠：既有腰线下加一皮浅出挑 + 檐下阴影暗带（远距读得出的横刻痕）
      box(surroundM, 0, y0 - 0.08, 11.185, 34.6, 0.1, 0.2);
      box(M.ironDark, 0, y0 - 0.17, 11.152, 34.6, 0.08, 0.012);
    }
    box(M.ironDark, 0, ROOF + 0.8, 11.152, 34.8, 0.1, 0.012); // 女儿墙压顶下阴影带
    // —— 竖壁柱四道（出墙 13cm）：北立面切成五段竖构图，窗带在柱间成组 ——
    // 轮19：柱顶穿出女儿墙成墩（+0.55m）——长直檐口线被四只柱墩打断，
    // 天际线成「墩-檐-墩」的锯齿（广角「单灰砖」剪影的第三刀）
    for (const px of [-12.5, -3.75, 4.75, 13.25]) {
      box(pilM, px, (ROOF + 0.7) / 2, 11.2, 0.62, ROOF + 0.7, 0.17);
      box(pilM, px, ROOF + 1.05, 11.18, 0.72, 0.75, 0.3);            // 女儿墙上柱墩
      box(M.concreteDark, px, ROOF + 1.46, 11.2, 0.84, 0.14, 0.4);   // 墩顶压檐
    }
    // —— 雨棚结构可读：底板下三根纵梁 + 前缘横梁 + 斜拉吊筋（锚板入墙）——
    for (const bx of [-4.1, 0, 4.1]) box(M.concreteDark, bx, 3.21, 12.95, 0.16, 0.14, 3.66);
    box(M.concreteDark, 0, 3.21, 14.55, 12.1, 0.14, 0.16);
    for (const s of [-1, 1]) {
      cyl(M.steel, s * 5.2, 4.52, 12.88, 0.03, 3.5, 0.03, 0, -1.24, 0); // 吊筋斜拉杆
      box(M.ironDark, s * 5.2, 5.1, 11.19, 0.22, 0.26, 0.1);            // 上端锚板（入墙）
      box(M.ironDark, s * 5.2, 3.98, 14.52, 0.12, 0.12, 0.12);          // 下端节点
    }
    // —— 屋顶栏杆（北沿，两翼段）：细杆一排——天际线的锯齿。
    // 轮20：中央让位给塔楼（塔体自 x±8.7 起），栏杆只跑两翼屋面
    for (let px = -15; px <= 15; px += 2.5) {
      if (Math.abs(px) < 9.4) continue;
      cyl(M.ironDark, px, ROOF + 1.32, 10.85, 0.028, 0.75, 0.028);
    }
    for (const s of [-1, 1]) {
      box(M.ironDark, s * 12.55, ROOF + 1.68, 10.85, 5.9, 0.045, 0.045);
      box(M.ironDark, s * 12.55, ROOF + 1.34, 10.85, 5.9, 0.035, 0.035);
    }
  }

  // ================= 立面轮18→轮19：连续阳台挑板带/空调机架/勒脚加高/水平分缝 =================
  // 门3轮18审计「广角仍读成单灰砖」的体量级返工：零散单窗阳台升级为
  // 壁柱之间通长的「走马廊」挑板带——每层两道 60cm 出墙的水平体量横贯立面，
  // 广角里第一读是「层层挑板的旧楼」；空调机组吊到挑板之下的阴影带里
  {
    const balcM = new THREE.MeshStandardMaterial({ color: 0x837d6f, roughness: 0.88 }); // 阳台抹灰（断言标记色）
    // 轮22：挑板底阴影带（近黑贴墙条）——夜雾里挑板自身的投影读不出来，
    // 把「板下那道黑」直接砌上墙：广角第一读是层层水平暗带切开的立面
    const shadeM = new THREE.MeshStandardMaterial({ color: 0x101214, roughness: 1 });
    // 壁柱位 -12.5/-3.75/4.75/13.25（宽0.62）——挑板带只在柱间跑，竖构图不被切断
    const bandAt = (a, b, y0, zSh = 11.165) => {
      const cx2 = (a + b) / 2, w2 = b - a;
      box(balcM, cx2, y0 + 0.90, 11.58, w2, 0.13, 0.92);               // 通长挑板（出墙 0.9m）
      box(M.concreteDark, cx2, y0 + 0.835, 11.58, w2 + 0.04, 0.02, 0.96); // 板底滴水暗缝
      box(shadeM, cx2, y0 + 0.60, zSh, w2 - 0.06, 0.44, 0.02);         // 板底阴影带（轮22）
      box(balcM, cx2, y0 + 1.42, 12.0, w2, 0.92, 0.07);                // 通长实心栏板
      box(M.concreteDark, cx2, y0 + 1.905, 12.0, w2 + 0.06, 0.06, 0.13);  // 扶手压顶
      for (const ex of [a + 0.035, b - 0.035]) {
        box(balcM, ex, y0 + 1.42, 11.76, 0.07, 0.92, 0.56);            // 端头侧颊板
      }
      const nb = Math.max(2, Math.round(w2 / 1.9));
      for (let i = 0; i <= nb; i++) {
        box(M.concreteDark, a + (w2 * i) / nb, y0 + 0.74, 11.32, 0.16, 0.22, 0.36); // 牛腿托座列
      }
      box(M.concreteDark, cx2 + w2 * 0.22, y0 + 1.06, 12.045, 0.5, 0.5, 0.012);     // 栏板外挂雨渍
    };
    // 轮22：两端段让位给翼端挑楼塔（塔占 |x|>13.3）——带只跑塔间；
    // F2：雨棚占中央（|x|<7.7），两翼两段；F3：柱间三段通排（含中央）
    for (const [a, b] of [[-12.85, -8.1], [8.1, 12.85]]) bandAt(a, b, F2);
    // 中央段阴影带贴在塔色竖块面上（面深 11.23，其余段贴瓷砖面 11.15）
    for (const [a, b, zs] of [[-12.85, -4.2, undefined], [-3.3, 4.3, 11.245], [5.2, 12.85, undefined]]) bandAt(a, b, F3, zs);
    // 晾衣杆一根 + 搭着的旧布（有人住过的证据——2001 的阳台不是样板间）
    box(M.ironDark, 10.4, F2 + 1.62, 11.8, 2.3, 0.03, 0.03);
    box(M.clothRed, 9.9, F2 + 1.44, 11.8, 0.5, 0.36, 0.04);
    // —— 空调外机六台：吊在挑板底的阴影带里（窗台线之下），钢三角架+格栅+锈痕 ——
    const acGrill = new THREE.MeshStandardMaterial({ color: 0x565a5c, roughness: 0.6, metalness: 0.35 });
    const acUnits = [[-10.6, F2 + 0.42], [2.6, F3 + 0.42], [7.1, F2 + 0.42], [-6.1, F3 + 0.42], [-8.5, F3 + 0.42], [9.5, F2 + 0.42]];
    for (const [wx, wy] of acUnits) {
      box(M.steel, wx, wy, 11.25, 0.85, 0.62, 0.4);                    // 机壳
      box(acGrill, wx, wy, 11.46, 0.78, 0.54, 0.02);                   // 格栅前脸
      for (const s of [-1, 1]) {
        box(M.ironDark, wx + s * 0.32, wy - 0.38, 11.32, 0.05, 0.14, 0.34);  // 托架立板
        box(M.ironDark, wx + s * 0.32, wy - 0.33, 11.3, 0.05, 0.05, 0.42);   // 托架横杆
      }
      box(M.concreteDark, wx + 0.18, wy - 0.62, 11.16, 0.12, 0.6, 0.014);    // 锈滴痕
    }
    // —— 勒脚加高：第二皮基座带（0.6→1.15m 两皮叠涩）——楼是从地里长出来的 ——
    box(M.concreteDark, -11.7, 0.88, 11.155, 11.0, 0.55, 0.06);
    box(M.concreteDark, 11.7, 0.88, 11.155, 11.0, 0.55, 0.06);
    box(M.concreteDark, 0, 0.88, -11.155, 34.4, 0.55, 0.06);
    // —— 水平分缝：层中一道刻缝（楼板线之外的第二组横向节奏）——
    for (const sy of [F2 - 1.65, F3 - 1.65, ROOF - 1.65]) {
      box(M.ironDark, 0, sy, 11.153, 34.6, 0.035, 0.008);
    }
  }

  // ================= 立面轮20：真拆楼——中央塔楼（整层高 4F）+ 立面分色 =================
  // 门3轮19终审「广角仍读成浅灰矩形单盒」的体量级根治：
  //   ① 旧 2.55m 矮退台废除——中央砌**一整层高**的塔楼（3.4m 墙身 + 0.75m 女儿墙，
  //      高差 ≥1 层可读），北面只退 0.6m，塔上再架字架：剪影三级「翼-塔-字」
  //   ② 立面颜色分层：勒脚深（暗水泥裙 1.25m）/ 墙身浅（瓷砖）/ 檐口另一色（暗赭带）
  //   ③ 塔身用抹灰另色（0x8f8a80 断言标记色保持）——中央体与两翼不同皮
  {
    const atticM = new THREE.MeshStandardMaterial({ color: 0x8f8a80, roughness: 0.9, envMapIntensity: 1.3 }); // 塔身抹灰（断言标记色）
    const cornM = new THREE.MeshStandardMaterial({ color: 0x5e4a40, roughness: 0.92 });  // 檐口暗赭带（断言标记色）
    const plinthM = new THREE.MeshStandardMaterial({ color: 0x4c4844, roughness: 0.95 }); // 勒脚暗裙（断言标记色）
    // —— 塔体：x -8.7..8.7 / z -10.3..10.4 / ROOF..ROOF+3.4 ——
    box(atticM, 0, ROOF + 1.7, 0.05, 17.4, 3.4, 20.7);
    // 塔四角壁柱（水泥抹面，接续主楼竖构图）
    for (const s of [-1, 1]) {
      box(M.concrete, s * 8.5, ROOF + 1.8, 10.32, 0.55, 3.6, 0.4);
      box(M.concrete, s * 8.5, ROOF + 1.8, -10.2, 0.55, 3.6, 0.4);
    }
    // 塔檐口（另一色带）+ 女儿墙 + 压顶：塔顶不是一刀平
    box(cornM, 0, ROOF + 3.52, 0.05, 17.6, 0.3, 20.9);                 // 檐口暗赭带（出挑一皮）
    box(atticM, 0, ROOF + 3.9, 0.05, 17.3, 0.5, 20.6);                 // 女儿墙
    box(M.concreteDark, 0, ROOF + 4.2, 0.05, 17.56, 0.14, 20.86);      // 压顶
    box(M.concreteDark, 0, ROOF + 0.11, 0.05, 17.5, 0.22, 20.8);       // 底座圈梁（塔从翼顶「长」出来）
    // —— 塔北面 4F 客房窗四樘（绿钢框+暗腔玻带+窗套出挑）——塔是住人的层，不是碑 ——
    {
      const frameA = new THREE.MeshStandardMaterial({ color: 0x37544a, roughness: 0.5, metalness: 0.25 });
      const voidM = new THREE.MeshStandardMaterial({ color: 0x14171a, roughness: 1 });
      box(M.winRoom, 0, ROOF + 1.78, 10.42, 15.2, 1.4, 0.04);          // 暗腔玻璃带（贴塔面）
      for (const [a, b] of [[-6.9, -4.9], [-2.9, -0.9], [0.9, 2.9], [4.9, 6.9]]) {
        const cx2 = (a + b) / 2, w2 = b - a;
        const sillY = ROOF + 1.08, topY = ROOF + 2.48, ch = topY - sillY;
        box(voidM, cx2, topY - 0.11, 10.44, w2 - 0.05, 0.2, 0.03);     // 洞口顶阴影（窗是「腔」）
        box(frameA, cx2, sillY + 0.03, 10.46, w2, 0.055, 0.06);        // 下框
        box(frameA, cx2, topY - 0.03, 10.46, w2, 0.055, 0.06);         // 上框
        box(frameA, a + 0.03, sillY + ch / 2, 10.46, 0.055, ch, 0.06); // 左框
        box(frameA, b - 0.03, sillY + ch / 2, 10.46, 0.055, ch, 0.06); // 右框
        box(frameA, cx2, sillY + ch / 2, 10.46, 0.05, ch, 0.055);      // 竖中梃
        box(atticM, cx2, sillY - 0.08, 10.52, w2 + 0.4, 0.12, 0.2);    // 窗台出挑
        box(atticM, cx2, topY + 0.1, 10.5, w2 + 0.4, 0.18, 0.18);      // 窗套上枋
      }
      // 塔北墙雨渍两道 + 竖向伸缩缝——塔与主楼同一场雨里老去
      box(M.concreteDark, -7.3, ROOF + 2.4, 10.42, 0.5, 1.5, 0.02);
      box(M.concreteDark, 6.3, ROOF + 2.7, 10.42, 0.35, 0.9, 0.02);
      box(M.ironDark, -3.9, ROOF + 1.7, 10.42, 0.06, 3.3, 0.02);
    }
    // 塔东/西侧排风百叶两樘 + 层间分缝——侧面斜角也读得出「这是一层房」
    for (const s of [-1, 1]) {
      box(M.ironDark, s * 8.73, ROOF + 1.9, 2.0, 0.06, 1.0, 1.7);
      box(M.ironDark, s * 8.72, ROOF + 0.5, 0, 0.02, 0.04, 19.5);
    }
    // —— 两翼檐口另一色带（N/E/W/S 一圈）：翼顶在女儿墙下有一道暗赭檐带 ——
    box(cornM, 0, ROOF + 0.42, 11.2, 34.7, 0.55, 0.1);
    box(cornM, 0, ROOF + 0.42, -11.2, 34.7, 0.55, 0.1);
    box(cornM, -17.2, ROOF + 0.42, 0, 0.1, 0.55, 22.5);
    box(cornM, 17.2, ROOF + 0.42, 0, 0.1, 0.55, 22.5);
    // —— 勒脚暗裙加高到 1.25m（N/E/W/S 一圈）：楼是从地里长出来的 ——
    box(plinthM, 0, 0.625, 11.21, 34.6, 1.25, 0.1);
    box(plinthM, 0, 0.625, -11.21, 34.6, 1.25, 0.1);
    box(plinthM, -17.21, 0.625, 0, 0.1, 1.25, 22.5);
    box(plinthM, 17.21, 0.625, 0, 0.1, 1.25, 22.5);
    box(M.concreteDark, 0, 1.3, 11.24, 34.7, 0.1, 0.08);               // 勒脚收边线
    // —— 北立面逐窗洞口顶阴影条：窗上缘一道近黑（窗是挖进墙里的洞，不是贴纸）——
    {
      const voidM2 = new THREE.MeshStandardMaterial({ color: 0x14171a, roughness: 1 });
      const winsN2 = [[-15.5, -13.5], [-11.5, -9.5], [-7, -5], [-2.5, -0.5], [1.5, 3.5], [6, 8], [10.5, 12.5], [14, 16]];
      for (const y0 of [F2, F3]) {
        for (const [a, b] of winsN2) {
          box(voidM2, (a + b) / 2, y0 + 2.31, 11.08, b - a - 0.06, 0.18, 0.03); // 洞口顶暗带
          box(voidM2, a + 0.09, y0 + 1.7, 11.08, 0.12, 1.3, 0.03);              // 左侧洞影
        }
      }
    }
  }

  // ================= 立面轮21：三段式分色块——翼端暖灰实体 + 中央塔色贯通落地 =================
  // 门3轮20「有阳台但仍是灰矩形楼体」的再降一档：单一瓷砖皮切成
  //   「暖灰翼端块(另色出墙6cm+端头女儿墙抬升) | 瓷砖身 | 塔色中央竖块(与4F塔同皮贯通到雨棚)」
  // 广角第一读=三种墙皮三级天际线，不再是一整张灰纸上贴窗
  {
    // 翼端暖砂抹灰（断言标记色）——轮21二稿：0x82786a 在夜景灰雾里与瓷砖身几乎同灰阶；
    // 且裸建材质 envMapIntensity 默认 1.0 低于瓷砖的 1.5（夜里环境光是主光源之一）。
    // 提亮到暖砂白 + envInt 2.0：广角夜景「亮翼端-中灰瓷砖身-塔色中央」三段明度差第一眼可读
    const wingM = new THREE.MeshStandardMaterial({ color: 0xc4b69e, roughness: 0.85, envMapIntensity: 2.0 });
    const ctrM = new THREE.MeshStandardMaterial({ color: 0x8f8a80, roughness: 0.9, envMapIntensity: 1.3 }); // 中央竖块＝塔身同色（贯通）
    // —— 西翼端块（外墙皮出 6cm，窗洞保留成深腔）——
    wallX(wingM, -17.15, -12.81, 11.04, 1.3, F2, [{ from: -15.5, to: -13, top: 1.3 }]);
    wallX(wingM, -17.15, -12.81, 11.04, F2, F3, [{ from: -15.5, to: -13.5, sill: 1.0, top: 2.4 }]);
    wallX(wingM, -17.15, -12.81, 11.04, F3, ROOF + 0.32, [{ from: -15.5, to: -13.5, sill: 1.0, top: 2.4 }]);
    // —— 东翼端块 ——
    wallX(wingM, 13.56, 17.15, 11.04, 1.3, F2, [{ from: 13.6, to: 14.5, top: 1.3 }]);
    wallX(wingM, 13.56, 17.15, 11.04, F2, F3, [{ from: 14, to: 16, sill: 1.0, top: 2.4 }]);
    wallX(wingM, 13.56, 17.15, 11.04, F3, ROOF + 0.32, [{ from: 14, to: 16, sill: 1.0, top: 2.4 }]);
    // 翼端块拐角回包（东西山墙近北角一条同色竖带——分色块有「厚度」，不是贴纸）
    box(wingM, -17.19, 5.9, 9.7, 0.08, 9.2, 2.9);
    box(wingM, 17.19, 5.9, 9.7, 0.08, 9.2, 2.9);
    // 翼端女儿墙抬升块 + 压顶：天际线两端各抬一级——「翼端墩-长檐-中央塔」三级剪影
    box(wingM, -14.98, ROOF + 1.13, 11.02, 4.34, 0.62, 0.34);
    box(M.concreteDark, -14.98, ROOF + 1.48, 11.02, 4.54, 0.12, 0.44);
    box(wingM, 15.35, ROOF + 1.13, 11.02, 3.6, 0.62, 0.34);
    box(M.concreteDark, 15.35, ROOF + 1.48, 11.02, 3.8, 0.12, 0.44);
    box(wingM, -17.02, ROOF + 1.13, 9.8, 0.34, 0.62, 2.8);
    box(wingM, 17.02, ROOF + 1.13, 9.8, 0.34, 0.62, 2.8);
    // —— 中央竖块：塔身抹灰同色从塔根一直落到雨棚顶（2F/3F 两层，窗洞保留）——
    wallX(ctrM, -3.44, 4.44, 11.08, F2, F3, [{ from: -2.5, to: -0.5, sill: 1.0, top: 2.4 }, { from: 1.5, to: 3.5, sill: 1.0, top: 2.4 }]);
    wallX(ctrM, -3.44, 4.44, 11.08, F3, ROOF + 0.32, [{ from: -2.5, to: -0.5, sill: 1.0, top: 2.4 }, { from: 1.5, to: 3.5, sill: 1.0, top: 2.4 }]);
    // 中央块两肋暗竖缝（与瓷砖身的交界读成「两栋体量拼接」，不是喷色）
    box(M.ironDark, -3.5, (F2 + ROOF + 0.32) / 2, 11.22, 0.05, ROOF + 0.32 - F2, 0.03);
    box(M.ironDark, 4.5, (F2 + ROOF + 0.32) / 2, 11.22, 0.05, ROOF + 0.32 - F2, 0.03);
  }

  // ================= 立面轮22：翼端挑楼塔 + 窗洞进深分档 + 住人亮窗 =================
  // 门3轮21「有分色但仍读成一块灰砖」的体量级再拆：
  //   ① 翼端各挑出一座**悬挑封窗阳台塔**（2F 起挑、出墙 0.95m、比主檐高一层的女儿墙）——
  //      北立面在平面上真正断成「塔-带-中央-带-塔」五段，剪影两端各抬一级
  //   ② 窗洞进深分三档：塔窗玻璃退 0.45m（深腔）/主立面退 0.19m/中央块 F2 两樘压成近黑深洞
  //   ③ 住人亮窗四樘（暖帘光×3+冷电视光×1，自发光不吃灯预算）——夜里立面第一读
  //      是「有人住的旧楼」，不是一张灰纸
  {
    const wingM2 = new THREE.MeshStandardMaterial({ color: 0xc4b69e, roughness: 0.85, envMapIntensity: 2.0 }); // 与翼端块同断言标记色
    const frameM2 = new THREE.MeshStandardMaterial({ color: 0x37544a, roughness: 0.5, metalness: 0.25 });
    const voidDeep = new THREE.MeshStandardMaterial({ color: 0x0d0f11, roughness: 1 });
    const glowWarm = new THREE.MeshStandardMaterial({ color: 0x241a10, emissive: 0xffb26a, emissiveIntensity: 1.3, roughness: 1, fog: false }); // 轮24四稿:0.9→1.3+关雾
    const glowWarm2 = new THREE.MeshStandardMaterial({ color: 0x241a10, emissive: 0xffc07a, emissiveIntensity: 0.9, roughness: 1, fog: false }); // 轮24四稿:0.62→0.9+关雾
    const glowCool = new THREE.MeshStandardMaterial({ color: 0x10151a, emissive: 0x8fb4c8, emissiveIntensity: 0.75, roughness: 1, fog: false }); // 轮24四稿:0.5→0.75+关雾
    // —— 翼端挑楼塔（s=±1）：侧墩+层间腰板留出窗带，玻璃退进 0.45m 深腔 ——
    for (const s of [-1, 1]) {
      const wx = s * 15.25;
      const fullH = ROOF + 1.9 - F2, fy = F2 + fullH / 2;
      box(wingM2, wx - 1.5, fy, 11.42, 0.9, fullH, 1.05);              // 西墩
      box(wingM2, wx + 1.5, fy, 11.42, 0.9, fullH, 1.05);              // 东墩
      box(wingM2, wx, F2 + 0.5, 11.42, 3.9, 1.0, 1.05);                // 底腰板
      box(wingM2, wx, (F2 + 2.5 + F3 + 1.0) / 2, 11.42, 3.9, F3 + 1.0 - F2 - 2.5, 1.05); // 层间腰板
      box(wingM2, wx, (F3 + 2.5 + ROOF + 1.9) / 2, 11.42, 3.9, ROOF + 1.9 - F3 - 2.5, 1.05); // 顶腰板
      box(M.concreteDark, wx, ROOF + 1.98, 11.42, 4.14, 0.16, 1.29);   // 塔顶压檐
      box(wingM2, wx, ROOF + 2.16, 11.42, 3.0, 0.2, 0.8);              // 压檐上退台小帽（剪影再一级）
      // 悬挑基座：暗圈梁 + 三只斜撑牛腿（塔是从 2F 楼板挑出去的，不是贴纸）
      box(M.concreteDark, wx, F2 - 0.16, 11.4, 3.9, 0.32, 1.0);
      for (const bx of [wx - 1.4, wx, wx + 1.4]) {
        box(M.concreteDark, bx, F2 - 0.58, 11.26, 0.26, 0.62, 0.55, 0, 0.5, 0);
      }
      // 塔窗两层：深腔玻带（退 0.45m）+ 洞顶阴影 + 出挑台板 + 绿钢梃
      for (const y0 of [F2, F3]) {
        box(M.winRoom, wx, y0 + 1.75, 11.5, 2.04, 1.5, 0.05);          // 玻带（深腔）
        box(voidDeep, wx, y0 + 2.42, 11.68, 2.06, 0.18, 0.5);          // 洞顶暗带
        box(M.concreteDark, wx, y0 + 0.95, 11.82, 2.44, 0.1, 0.42);    // 出挑台板
        box(frameM2, wx, y0 + 1.75, 11.56, 0.05, 1.5, 0.05);           // 竖中梃
        box(frameM2, wx, y0 + 2.06, 11.56, 2.04, 0.05, 0.05);          // 亮子横梃
      }
      // 塔身雨渍（挑楼与主楼同一场雨里老去）
      box(M.concreteDark, wx - 1.5, ROOF - 0.6, 11.955, 0.4, 1.8, 0.012);
    }
    // 东塔 2F 一樘亮着暖帘光（半幅窗帘拉着）；西塔 3F 一樘弱暖光
    box(glowWarm, 15.75, F2 + 1.72, 11.62, 0.95, 1.42, 0.03);
    box(glowWarm2, -15.72, F3 + 1.72, 11.62, 0.92, 1.42, 0.03);
    // —— 主立面住人亮窗：暖帘光 F2 西翼一樘 + F3 东翼一樘；冷电视光 F3 西一樘 ——
    box(glowWarm2, -10.9, F2 + 1.7, 11.005, 0.85, 1.3, 0.015);
    box(glowWarm, 7.35, F3 + 1.72, 11.005, 0.9, 1.3, 0.015);
    box(glowCool, -6.2, F3 + 1.7, 11.005, 0.8, 1.28, 0.015);
    // —— 中央块 F2 两樘压成近黑深洞（第三档进深：没人住的黑腔）——
    for (const [a, b] of [[-2.5, -0.5], [1.5, 3.5]]) {
      box(voidDeep, (a + b) / 2, F2 + 1.7, 11.0, b - a - 0.1, 1.36, 0.012);
    }
  }

  // ================= 立面轮23：真阳台带 + 亮窗群 + 1F 店面分色 =================
  // 门3轮22「仍是 PS1 灰楼」的照片级三刀：
  //   ① 北立面 2F/3F 逐间**真阳台**（挑板 0.95m + 水泥栏板 + 侧privacy板 + 压顶 +
  //      板底檐下暗带 + 晾衣杆/床单/杂物）——广角里每层长出一排凹凸与投影，
  //      「多层进深/阳台阴影」不再靠贴纸；
  //   ② 亮窗群加密：暖帘光/弱暖光/荧光冷绿/电视蓝四种光温 12 樘错落——
  //      夜景照片的第一读是「亮着的窗」；
  //   ③ 1F 店面带墨绿釉面砖分色（90s 县镇酒店标配裙面）——楼体纵向三段
  //      「墨绿裙面-米瓷砖身-塔色顶」，不再一色到顶
  {
    const balcPanelM = new THREE.MeshStandardMaterial({ color: 0x8f8a76, roughness: 0.88 });
    const glazeGreenM = new THREE.MeshStandardMaterial({ color: 0x2d4a3e, roughness: 0.34, metalness: 0.08, envMapIntensity: 1.6 });
    const sheetM = new THREE.MeshStandardMaterial({ color: 0xb9c2bd, roughness: 0.95 });
    const shirtM2 = new THREE.MeshStandardMaterial({ color: 0x6d7f96, roughness: 0.95 });
    let bs = 11;
    const brnd = () => (bs = (bs * 16807) % 2147483647) / 2147483647;
    /** 一间阳台：挑板+栏板+侧板+压顶+板底暗带+可选晾衣/杂物 */
    const balcony = (a, b, y0, deco = 0) => {
      const cx2 = (a + b) / 2, w2 = b - a;
      box(M.concreteDark, cx2, y0 + 0.86, 11.62, w2 + 0.66, 0.13, 0.95);      // 挑板
      box(M.ironDark, cx2, y0 + 0.76, 11.17, w2 + 0.6, 0.06, 0.015);          // 板底檐下暗带
      // 轮24·栏板体量：正面板 0.07→0.12 厚 + 端柱两根 + 竖肋两道——
      // 广角里栏板是有厚度的「水泥构件」，不再是一张浮片
      box(balcPanelM, cx2, y0 + 1.32, 12.05, w2 + 0.52, 0.82, 0.12);          // 正面栏板
      box(M.concreteDark, cx2, y0 + 1.78, 12.05, w2 + 0.72, 0.10, 0.26);      // 栏板压顶（加厚出挑）
      for (const s2 of [-1, 1]) {
        box(balcPanelM, cx2 + s2 * (w2 / 2 + 0.26), y0 + 1.34, 12.02, 0.14, 0.98, 0.20);  // 端柱
        box(balcPanelM, cx2 + s2 * w2 * 0.17, y0 + 1.30, 12.115, 0.09, 0.78, 0.05);       // 竖肋
        box(balcPanelM, cx2 + s2 * (w2 / 2 + 0.24), y0 + 1.32, 11.62, 0.11, 0.82, 0.88);  // 侧板（0.07→0.11）
      }
      box(M.concreteDark, cx2, y0 + 1.02, 12.12, w2 + 0.52, 0.22, 0.012);     // 栏板根部雨渍带
      if (deco === 1) {                                                        // 晾衣杆+挂物
        cyl(M.ironDark, cx2, y0 + 2.02, 11.75, 0.022, w2 + 0.2, 0.022, 0, 0, Math.PI / 2);
        box(sheetM, cx2 - w2 * 0.22, y0 + 1.62, 11.76, 0.62, 0.78, 0.02);
        box(shirtM2, cx2 + w2 * 0.18, y0 + 1.75, 11.76, 0.34, 0.5, 0.02);
      } else if (deco === 2) {                                                 // 堆杂物
        box(M.concreteDark, cx2 + w2 * 0.2, y0 + 1.12, 11.5, 0.5, 0.4, 0.4, 0.3);
        box(M.ironDark, cx2 - w2 * 0.24, y0 + 1.05, 11.55, 0.4, 0.26, 0.34, -0.2);
      }
    };
    // 2F：中央两黑腔窗与门斗雨棚区跳过；3F：六间全排
    for (const [a, b] of [[-11.5, -9.5], [-7, -5], [6, 8], [10.5, 12.5]]) balcony(a, b, F2, Math.floor(brnd() * 3));
    for (const [a, b] of [[-11.5, -9.5], [-7, -5], [-2.5, -0.5], [1.5, 3.5], [6, 8], [10.5, 12.5]]) balcony(a, b, F3, Math.floor(brnd() * 3));
    // —— 亮窗群（自发光薄片贴窗洞内缝，不吃灯预算）——
    const glowA = new THREE.MeshStandardMaterial({ color: 0x241a10, emissive: 0xffb26a, emissiveIntensity: 1.6, roughness: 1, fog: false });   // 暖帘光(轮24四稿:1.1→1.6+关雾——雨夜亮窗穿雾)
    const glowB = new THREE.MeshStandardMaterial({ color: 0x241a10, emissive: 0xffc07a, emissiveIntensity: 0.95, roughness: 1, fog: false });  // 弱暖光(0.65→0.95+关雾)
    const glowF = new THREE.MeshStandardMaterial({ color: 0x101512, emissive: 0xbfe0c8, emissiveIntensity: 0.85, roughness: 1, fog: false });  // 荧光管冷绿(0.55→0.85+关雾)
    const glowT = new THREE.MeshStandardMaterial({ color: 0x10151a, emissive: 0x8fb4c8, emissiveIntensity: 0.75, roughness: 1, fog: false });   // 电视蓝(0.5→0.75+关雾)
    // [材质, cx, y0(层), 宽, 高偏移]——错落在各窗樘（部分藏在阳台栏板后：光从栏板上沿溢出）
    const glows = [
      [glowA, 6.6, F2, 0.9], [glowB, 11.4, F2, 0.85],
      [glowB, -1.8, F3, 0.85], [glowF, 2.3, F3, 0.8], [glowB, 11.2, F3, 0.9],
      [glowA, -10.6, F3, 0.92], [glowF, -14.6, F2, 0.8],
    ];
    for (const [gm, gx, gy, gw] of glows) box(gm, gx, gy + 1.7, 11.008, gw, 1.3, 0.012);
    // 东立面 3F 两樘（斜视图里侧脸也亮着）
    box(glowB, 17.008, F2 + 5.1, 0.8, 0.012, 1.3, 0.9);
    box(glowF, 17.008, F2 + 5.1, 6.1, 0.012, 1.3, 0.8);
    // —— 1F 店面墨绿釉面裙带（绕开窗/门洞的贴面）——
    // 北左段（洞 -15.5..-13 / -12..-9.5）
    for (const [x1, x2] of [[-16.85, -15.5], [-13, -12], [-9.5, -6.35]]) {
      box(glazeGreenM, (x1 + x2) / 2, 1.62, 11.17, x2 - x1, 2.0, 0.02);
    }
    // 北右段（洞 12..14.5）
    for (const [x1, x2] of [[6.35, 12], [14.5, 16.85]]) {
      box(glazeGreenM, (x1 + x2) / 2, 1.62, 11.17, x2 - x1, 2.0, 0.02);
    }
    // 窗下裙板（洞下沿 0.62..0.9 补齐一皮）
    for (const [x1, x2] of [[-15.5, -13], [-12, -9.5], [12, 14.5]]) {
      box(glazeGreenM, (x1 + x2) / 2, 0.76, 11.17, x2 - x1, 0.28, 0.02);
    }
    // 东西山墙 1F 裙带（斜视可读的分色包角）
    box(glazeGreenM, -17.17, 1.62, 0, 0.02, 2.0, 21.9);
    box(glazeGreenM, 17.17, 1.62, -1.5, 0.02, 2.0, 18.5);
    // 裙带压顶铜线（分色的「界」）
    box(M.brass, -11.6, 2.64, 11.18, 10.5, 0.05, 0.03);
    box(M.brass, 11.6, 2.64, 11.18, 10.5, 0.05, 0.03);
  }

  // ================= 正门：进深门斗 + 体积雨棚 + 灯箱 + 玻璃门 =================
  // 轮16门3：门脸从墙皮里长出 1.5m——玻璃门退在门斗腔里，雨棚是一只有檐口板带的
  // 「盒子」压在两墩一排柱上，不再是一片悬空薄板
  {
    // —— 门斗侧翼墩（瓷砖包面 + 石基座）：正门是一个腔，不是一张贴纸 ——
    for (const s of [-1, 1]) {
      const px = s * 6.0;
      wall(TILE, px, 1.62, 11.75, 0.7, 3.24, 1.5);             // 侧翼墩（承雨棚）
      box(M.stone, px, 0.34, 11.78, 0.86, 0.68, 1.62);         // 墩基座石
      box(M.concreteDark, px, 3.3, 11.75, 0.78, 0.12, 1.58);   // 墩顶收边
      box(M.concreteDark, px, 0.02, 12.7, 0.8, 0.03, 0.6);     // 墩前泛碱渍
    }
    // 门斗腔顶（侧翼墩之间、玻璃门之上的深门楣板——站在门口抬头是「顶」，不是天）
    box(M.veneerRed, 0, 3.02, 11.7, 11.3, 0.5, 1.4);
    box(M.brass, 0, 2.79, 12.38, 11.34, 0.05, 0.08);           // 门楣板收口金线
    // —— 体积雨棚：底板 + 三面檐口板带 + 出挑顶盖 + 檐底筒灯 ——
    box(M.terrazzo, 0, 3.38, 12.9, 12.4, 0.2, 4.0);            // 底板（soffit）
    box(M.terrazzo, 0, 3.86, 14.83, 12.4, 0.76, 0.14);         // 前檐口板带
    box(M.terrazzo, -6.13, 3.86, 12.9, 0.14, 0.76, 4.0);       // 左檐口
    box(M.terrazzo, 6.13, 3.86, 12.9, 0.14, 0.76, 4.0);        // 右檐口
    box(M.concrete, 0, 4.31, 12.9, 12.68, 0.14, 4.3);          // 顶盖压边（出挑一皮）
    box(M.brass, 0, 3.51, 14.88, 12.44, 0.07, 0.1);            // 檐底金压条
    box(M.concreteDark, 3.1, 3.86, 14.91, 1.1, 0.76, 0.02);    // 檐口板旧水渍片
    // 前檐口正中：店名灯箱（挂在檐口板带上，雨夜远处第一眼）
    box(M.signSouth, 0, 3.86, 14.94, 7.2, 0.66, 0.1);
    // 檐底嵌筒灯三只 + 暖光
    for (const lxq of [-3.4, 0, 3.4]) cyl(M.tungsten, lxq, 3.26, 13.2, 0.14, 0.05, 0.14);
    addLight(0xffd9a0, 9, 8.5, 0, 2.9, 13.1, 0.5); // 轮25：7→9——门前光池要摊到台阶下的湿地上
    // 轮24·入口体积光：筒灯下三束暖光锥 + 灯笼红光晕锥——雨雾夜里
    // 正门是「从光里走进去」的腔，不是一张亮贴纸（门3入口层次）
    // 轮25：束径/浓度/长度全抬档（0.055/1.35/3.3→0.085/1.8/4.1）——hotel_wide
    // 30m 外要能读出「三根光柱插进雨雾」，旧值只在 5m 内可见
    for (const lxq of [-3.4, 0, 3.4]) {
      const cone = makeLightCone(0xffd9a0, 0.085, 0.18, 1.8, 4.1);
      cone.position.copy(world(lxq, 3.24, 13.2));
      scene.add(cone);
    }
    for (const px of [-3.4, 3.4]) {
      const cone = makeLightCone(0xff6048, 0.06, 0.3, 1.2, 2.7);
      cone.position.copy(world(px, 2.35, 12.6));
      scene.add(cone);
    }
    // 轮25·门前湿地光池：暖光在积水地皮上的假反弹椭圆（additive 软片）——
    // 体积光有了「落点」，入口光才闭环（光柱→光池→反射）
    {
      const pc = document.createElement('canvas');
      pc.width = pc.height = 128;
      const px2 = pc.getContext('2d');
      const gr = px2.createRadialGradient(64, 64, 4, 64, 64, 62);
      gr.addColorStop(0, 'rgba(255,196,120,0.55)');
      gr.addColorStop(0.5, 'rgba(255,170,96,0.18)');
      gr.addColorStop(1, 'rgba(255,150,80,0)');
      px2.fillStyle = gr;
      px2.fillRect(0, 0, 128, 128);
      const pt = new THREE.CanvasTexture(pc);
      const poolM = new THREE.MeshBasicMaterial({
        map: pt, transparent: true, opacity: 0.5, depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 5.2), poolM);
      pool.rotation.x = -Math.PI / 2;
      pool.position.copy(world(0, 0.07, 14.6));
      pool.renderOrder = 3;
      scene.add(pool);
    }
    // 雨棚立柱（镜面不锈钢包柱 + 石柱础）
    for (const px of [-4.6, 4.6]) {
      cyl(M.mirror, px, 1.66, 13.9, 0.5, 3.44, 0.5);
      cyl(M.stone, px, 0.2, 13.9, 0.64, 0.42, 0.64);
      colliders.push({ x: hx + px, z: hz + 13.9, r: 0.3, maxY: hb + 3.4 });
    }
    // 门楣灯箱（门斗腔内低位一窄条：夜里两级亮面）
    box(M.signSouth, 0, 2.55, 11.32, 7.2, 0.42, 0.18);
    // —— 玻璃门整樘后退 40cm（轮17：门斗真正凹进墙皮）——
    // 门洞两颊红漆木侧颊 + 顶楣封板：站在门前先进「腔」，再推门
    for (const s of [-1, 1]) box(M.veneerRed, s * 2.52, 1.62, 10.85, 0.16, 3.24, 0.78);
    box(M.veneerRed, 0, 2.88, 10.85, 5.2, 0.76, 0.78);   // 凹腔顶楣
    box(M.brass, 0, 2.52, 10.62, 4.9, 0.05, 0.06);       // 楣底金压线
    // 玻璃门框（中缝常开 1.4m；门扇在凹腔底）
    for (const px of [-2.4, 2.4]) {
      box(M.brass, px, 1.25, 10.6, 0.12, 2.5, 0.12);
      colliders.push({ x: hx + px, z: hz + 10.6, r: 0.09, maxY: hb + 2.5 });
    }
    box(M.crtGlass, -1.75, 1.25, 10.6, 1.2, 2.4, 0.05);
    colliders.push({ minX: hx - 2.36, maxX: hx - 1.15, minZ: hz + 10.5, maxZ: hz + 10.7, maxY: hb + 2.4 });
    box(M.crtGlass, 1.75, 1.25, 10.6, 1.2, 2.4, 0.05);
    colliders.push({ minX: hx + 1.15, maxX: hx + 2.36, minZ: hz + 10.5, maxZ: hz + 10.7, maxY: hb + 2.4 });
    // 两侧玻璃幕墙（大堂临街面）
    box(M.crtGlass, -4.2, 1.35, 11, 3.5, 2.7, 0.05);
    colliders.push({ minX: hx - 5.95, maxX: hx - 2.45, minZ: hz + 10.9, maxZ: hz + 11.1, maxY: hb + 2.7, noSightBlock: true });
    box(M.crtGlass, 4.2, 1.35, 11, 3.5, 2.7, 0.05);
    colliders.push({ minX: hx + 2.45, maxX: hx + 5.95, minZ: hz + 10.9, maxZ: hz + 11.1, maxY: hb + 2.7, noSightBlock: true });
    for (const px of [-2.45, 2.45, -5.95, 5.95]) box(M.brass, px, 1.35, 11, 0.1, 2.7, 0.1);
    // 「名」字红灯笼一对（真实光，吊杆挂在雨棚底板下）
    for (const px of [-3.4, 3.4]) {
      const lan = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.55, 12), M.lanternPaperXi);
      lan.position.copy(world(px, 2.55, 12.6));
      scene.add(lan);
      cyl(M.ironDark, px, 3.05, 12.6, 0.02, 0.46, 0.02);
      addLight(0xff5040, 8, 8, px, 2.4, 12.6, 0.4);
    }
    // 台阶两侧石狮（座+蹲身+头，移出门斗墩外侧）
    for (const s of [-1, 1]) {
      const px = s * 7.4;
      box(M.stone, px, 0.4, 12.4, 1.0, 0.8, 1.1);              // 须弥座
      box(M.stone, px, 1.06, 12.35, 0.62, 0.56, 0.88, 0, 0.12, 0); // 蹲身（后高前低）
      box(M.stone, px, 1.5, 12.72, 0.5, 0.46, 0.44, 0, 0, s * 0.06); // 头
      colliders.push({ x: hx + px, z: hz + 12.4, r: 0.62, maxY: hb + 1.75 });
    }
    locations.hotelEntrance = world(0, 0.5, 12);
  }

  // ================= 门斗（风除室）：外门与大堂之间的阈限一格 =================
  // 低吊顶把人压一口气，再放进六米挑空的大堂——酒店的第一道「预先空间」。
  // 伞架里三把没人回来取的伞；行李车上一只旧箱；地垫的字磨得只剩个轮廓。
  {
    const VZ1 = 8.6, VZ2 = 11, VH = 2.5;
    // 低吊顶（顶面从二层回廊可见——门斗是大堂里的一只盒子）
    slabRect(-3.6, VZ1, 3.6, VZ2, VH, null, { walk: false });
    // 红漆木饰面侧壁（与总台同一副漆——门斗就是柜台的延伸）
    wallZ(M.veneerRed, VZ1, VZ2, -3.6, 0, VH);
    wallZ(M.veneerRed, VZ1, VZ2, 3.6, 0, VH);
    // 内侧玻璃隔断：黄铜框，中缝常开 1.6m
    for (const [gx, gw] of [[-2.2, 2.8], [2.2, 2.8]]) {
      box(M.shopGlass, gx, 1.25, VZ1, gw, 2.3, 0.05);
      colliders.push({
        minX: hx + gx - gw / 2, maxX: hx + gx + gw / 2,
        minZ: hz + VZ1 - 0.08, maxZ: hz + VZ1 + 0.08,
        minY: hb, maxY: hb + 2.4, noSightBlock: true,
      });
    }
    box(M.shopGlass, 0, 2.32, VZ1, 1.56, 0.26, 0.04); // 门顶亮子
    for (const px of [-3.55, -0.8, 0.8, 3.55]) {
      box(M.brass, px, 1.25, VZ1, 0.09, 2.5, 0.09);
      colliders.push({ x: hx + px, z: hz + VZ1, r: 0.07, maxY: hb + 2.5 });
    }
    box(M.brass, 0, 2.47, VZ1, 7.3, 0.07, 0.1);
    // 常开的一扇内门叶（玻璃+黄铜边，斜停着）
    box(M.brass, 1.5, 1.2, 8.25, 0.06, 2.35, 0.06, 0.55);
    box(M.shopGlass, 1.62, 1.2, 8.05, 0.72, 2.2, 0.04, 0.55);
    colliders.push({ x: hx + 1.6, z: hz + 8.1, r: 0.28, maxY: hb + 2.35, noSightBlock: true });
    // 地垫：字磨得快没了（压在红毯之上——红毯顶面 0.075）
    box(plateMat('宾至如归', { w: 256, h: 96, bg: '#48120e', fg: '#7c6a42', font: 0.5 }), 0, 0.088, 9.8, 1.9, 0.035, 0.85);
    // 伞架（三把黑伞，没人回来取）
    cyl(M.ironDark, -3.0, 0.36, 9.35, 0.24, 0.72, 0.24);
    colliders.push({ x: hx - 3.0, z: hz + 9.35, r: 0.26, maxY: hb + 0.75, noSightBlock: true });
    for (const [ox, oz, rx] of [[-0.07, 0.05, 0.16], [0.06, -0.04, -0.1], [0.0, 0.09, 0.06]]) {
      cyl(M.ironDark, -3.0 + ox, 0.82, 9.35 + oz, 0.035, 1.0, 0.035, 0, rx, 0.12);
    }
    // 行李推车：黄铜架+旧皮箱（客人再没下来拿）
    box(M.brass, 2.7, 0.18, 9.75, 1.1, 0.06, 0.55);
    for (const [ox, oz] of [[-0.45, -0.2], [0.45, -0.2], [-0.45, 0.2], [0.45, 0.2]]) {
      cyl(M.ironDark, 2.7 + ox, 0.08, 9.75 + oz, 0.07, 0.07, 0.07, 0, Math.PI / 2, 0);
    }
    for (const ox of [-0.52, 0.52]) {
      box(M.brass, 2.7 + ox, 0.98, 9.75, 0.05, 1.55, 0.05);
      box(M.brass, 2.7 + ox, 1.74, 9.75, 0.05, 0.05, 0.5);
    }
    box(M.veneer, 2.7, 0.4, 9.75, 0.62, 0.36, 0.42, 0.12);
    colliders.push({ minX: hx + 2.1, maxX: hx + 3.3, minZ: hz + 9.4, maxZ: hz + 10.1, minY: hb, maxY: hb + 1.78, noSightBlock: true });
    // 内门玻璃上的红纸条 + 门斗侧「欢迎」旧牌
    box(plateMat('今夜核册 · 请勿喧哗', { w: 320, h: 96, bg: '#8c1616', fg: '#f0d28c', font: 0.32 }), -1.9, 1.52, VZ1 - 0.06, 0.68, 0.32, 0.03);
    box(plateMat('南方大酒店欢迎您', { w: 384, h: 56, bg: '#5a1414', fg: '#c8a860', font: 0.5 }), 0, 2.28, VZ1 + 0.12, 1.7, 0.2, 0.04);
    // 门斗顶灯：一支接触不良的暖管
    box(M.tungsten, 0, VH - 0.07, 9.8, 0.55, 0.07, 0.2);
    addLight(0xffc880, 5, 6, 0, VH - 0.45, 9.8, 0.55);
    locations.vestibule = world(0, 0.5, 9.8);
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
  wallX(SVC, -8, 8, -8, 0, F2, [
    { from: -5, to: -3.6, top: 2.1 }, { from: 3, to: 4.4, top: 2.1 },
  ]);
  // 员工区被大楼梯一分为二：楼梯两侧封板（经理室/布草间的内墙）
  for (const sx of [-1.9, 1.9]) box(SVC, sx, F2 / 2, -3.05, 0.12, F2, 6.5);
  // 布草间东墙缺口段 x=8, z -2..0
  wallZ(SVC, -2, 0, 8, 0, F2);
  // 厨房西墙 x=8：走廊门 z -10.4..-9
  wallZ(SVC, -11, -2, 8, 0, F2, [{ from: -10.4, to: -9, top: 2.1 }]);
  // 厨房北墙 z=-2 (x 8..17)
  wallX(SVC, 8, 17, -2, 0, F2);
  // 楼梯间（x 11..16.5, z -2..3）西墙带门
  wallZ(SVC, -2, 3, 11, 0, F2, [{ from: 0.6, to: 2.0, top: 2.1 }]);
  wallX(SVC, 11, 17, 3, 0, F2);
  // 配电间 x 11..17, z 3..6（门在 x=11, z 4..5.2）
  wallZ(SVC, 3, 6, 11, 0, F2, [{ from: 4, to: 5.2, top: 2.1 }]);
  wallX(SVC, 11, 17, 6, 0, F2);
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
    // 大吊灯（挑空中央，黄铜+灯球）——吊杆从挑空顶(F3 楼板)垂下
    cyl(M.brass, 0, (6.35 + F3 - 0.2) / 2, 5.2, 0.06, F3 - 0.2 - 6.35, 0.06);
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
    // 沙发组（西窗角，门斗以西）
    box(M.clothRed, -5.4, 0.3, 9.7, 2.2, 0.6, 0.9);
    box(M.clothRed, -5.4, 0.85, 10.1, 2.2, 0.6, 0.25);
    colliders.push({ minX: hx - 6.5, maxX: hx - 4.3, minZ: hz + 9.2, maxZ: hz + 10.3, minY: hb, maxY: hb + 0.9, noSightBlock: true });
    // 茶几挪去东窗角绿植旁
    box(M.veneer, 5.9, 0.28, 9.8, 0.8, 0.56, 0.8);
    colliders.push({ x: hx + 5.9, z: hz + 9.8, r: 0.45, maxY: hb + 0.6, noSightBlock: true });
    // 大堂山水壁画（南墙上方，跨楼梯口）
    box(M.mural, 0, 4.6, 0.18, 7.5, 2.4, 0.08);
    // 核册指示水牌（出门斗第一眼）
    box(M.brass, 2.4, 0.8, 7.3, 0.05, 1.6, 0.05);
    box(plateMat('核册 · 宴会厅', { w: 256, h: 128, bg: '#8c1616', fg: '#f0d28c' }), 2.4, 1.35, 7.3, 0.9, 0.62, 0.05);
    colliders.push({ x: hx + 2.4, z: hz + 7.3, r: 0.2, maxY: hb + 1.6, noSightBlock: true });
    // 挂钟（停在 11:47）
    cyl(M.brass, -7.85, 2.6, 8.0, 0.45, 0.1, 0.45, 0, 0, Math.PI / 2);
    box(plateMat('11:47', { w: 96, h: 96, bg: '#e8e0cc', fg: '#33291e', font: 0.34 }), -7.78, 2.6, 8.0, 0.03, 0.62, 0.62);
    // 荧光顶灯带（回廊下沿）
    for (const px of [-5, 0, 5]) {
      box(M.fluorescent, px, F2 - 0.06, 0.8, 1.4, 0.05, 0.16);
    }
    addLight(0xdfe8d8, 8, 10, 0, F2 - 0.8, 1.2, 0.5);
    // —— 内装线脚（轮9）：木墙裙 + 铜压顶条 + 红木踢脚 + 檐口线 ——
    // 2001 县镇酒店的「体面」全在一米以下：墙裙包浆、踢脚磕痕、上沿一条铜线。
    {
      const dado = (alongX, fixed, a, b2) => {
        const len = b2 - a, mid = (a + b2) / 2;
        if (alongX) {
          box(M.veneer, mid, 0.5, fixed, len, 0.92, 0.045);
          box(M.brass, mid, 0.97, fixed, len, 0.035, 0.055);
          box(M.veneerRed, mid, 0.07, fixed, len, 0.14, 0.06);
        } else {
          box(M.veneer, fixed, 0.5, mid, 0.045, 0.92, len);
          box(M.brass, fixed, 0.97, mid, 0.055, 0.035, len);
          box(M.veneerRed, fixed, 0.07, mid, 0.06, 0.14, len);
        }
      };
      dado(true, 0.19, -7.9, -1.98);  // 南墙西段（避楼梯口）
      dado(true, 0.19, 1.98, 7.9);    // 南墙东段
      dado(false, 7.81, 0.3, 4.95);   // 东墙南段（避东廊门）
      dado(false, 7.81, 6.85, 10.85); // 东墙北段
      dado(false, -7.81, 0.3, 2.3);   // 西墙南段（背柜以南）
      dado(false, -7.81, 6.7, 10.85); // 西墙北段
      // 檐口线（2F 楼板下皮一圈石膏线近似——挑空四缘）
      for (const [cx2, cz2, cw, cd] of [
        [0, 0.32, 15.7, 0.14], [-7.83, 5.5, 0.14, 10.6], [7.83, 5.5, 0.14, 10.6],
      ]) {
        box(M.hotelWall, cx2, F2 - 0.1, cz2, cw, 0.2, cd);
      }
    }
    // 立式不锈钢烟灰缸一对（门斗两侧：沙面上摁着几枚旧烟头）
    for (const px of [-3.2, 3.4]) {
      cyl(M.steel, px, 0.32, 8.0, 0.13, 0.64, 0.13);
      cyl(M.sand ?? M.salt, px, 0.65, 8.0, 0.11, 0.03, 0.11);
      colliders.push({ x: hx + px, z: hz + 8.0, r: 0.15, maxY: hb + 0.68, noSightBlock: true });
    }
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
    wallX(SVC, -1.9, 1.9, -6.3, 0, 2.2);
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
    // 「還」字金匾（幕中央）
    box(M.xiPanel, -12.5, 2.1, -10.4, 2.2, 2.2, 0.1);
    // 立式麦克风（报数员位）：线没入舞台
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
    // 圆桌 ×6：席面全摆齐但一口没动——白瓷碗碟/红漆筷/茶盅，转盘上啤酒茶壶，席边暖瓶
    // 每桌留一副「倒扣的碗」：满堂席设里独一副是给不来的人的
    const tables = [[-14.5, -4], [-10.5, -4], [-14.5, 0.5], [-10.5, 0.5], [-14.5, 5], [-10.5, 5]];
    dynamic.banquetTables = [];
    for (let ti = 0; ti < tables.length; ti++) {
      const [px, pz] = tables[ti];
      cyl(M.tableCloth, px, 0.42, pz, 1.5, 0.84, 1.5);
      cyl(M.crtGlass, px, 0.89, pz, 0.85, 0.04, 0.85); // 玻璃转盘
      const deadSeat = (ti * 3) % 8;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + ti * 0.13;
        const bx2 = px + Math.cos(a) * 0.58, bz2 = pz + Math.sin(a) * 0.58;
        if (k === deadSeat) {
          // 倒扣白瓷碗 + 双筷平搁碗底（忌讳的摆法，摆得端端正正）
          cyl(M.porcelain, bx2, 0.868, bz2, 0.13, 0.055, 0.13);
          box(M.veneerRed, bx2, 0.902, bz2, 0.012, 0.012, 0.3, a + 0.5);
          box(M.veneerRed, bx2, 0.914, bz2, 0.012, 0.012, 0.3, a + 0.78);
        } else {
          cyl(M.porcelain, bx2, 0.849, bz2, 0.22, 0.018, 0.22);   // 骨碟
          cyl(M.porcelain, bx2, 0.885, bz2, 0.125, 0.05, 0.125);  // 白瓷碗
          // 红漆筷一双（斜搁碟边，角度略乱——摆桌的人手抖）
          box(M.veneerRed, bx2 + Math.cos(a) * 0.1, 0.862, bz2 + Math.sin(a) * 0.1, 0.011, 0.011, 0.29, a + 1.35 + ti * 0.2);
          box(M.veneerRed, bx2 + Math.cos(a) * 0.13, 0.862, bz2 + Math.sin(a) * 0.13, 0.011, 0.011, 0.29, a + 1.48 + ti * 0.2);
          // 茶盅
          cyl(M.porcelain, bx2 - Math.sin(a) * 0.19, 0.868, bz2 + Math.cos(a) * 0.19, 0.062, 0.055, 0.062);
        }
        // 方凳
        box(M.veneer, px + Math.cos(a) * 1.05, 0.24, pz + Math.sin(a) * 1.05, 0.34, 0.48, 0.34);
      }
      // 转盘上：绿玻璃啤酒瓶×2 + 白瓷茶壶 + 不锈钢烟灰缸（都没开封没斟过）
      const ba = ti * 1.3;
      for (let bi = 0; bi < 2; bi++) {
        const bbx = px + Math.cos(ba + bi * 2.3) * 0.24, bbz = pz + Math.sin(ba + bi * 2.3) * 0.24;
        cyl(M.glassGreen, bbx, 1.03, bbz, 0.09, 0.24, 0.09);
        cyl(M.glassGreen, bbx, 1.2, bbz, 0.032, 0.1, 0.032);
        cyl(M.brass, bbx, 1.253, bbz, 0.036, 0.012, 0.036); // 瓶盖
      }
      cyl(M.porcelain, px - Math.cos(ba) * 0.2, 0.985, pz - Math.sin(ba) * 0.2, 0.17, 0.15, 0.17);
      B.add(GEO.sphere, M.porcelain, hx + px - Math.cos(ba) * 0.2, hb + 1.08, hz + pz - Math.sin(ba) * 0.2, 0, 0.05, 0.04, 0.05);
      cyl(M.porcelain, px - Math.cos(ba) * 0.32, 1.0, pz - Math.sin(ba) * 0.32, 0.032, 0.14, 0.032, 0, 0, 0.9);
      cyl(M.steel, px + Math.sin(ba) * 0.3, 0.925, pz - Math.cos(ba) * 0.3, 0.1, 0.03, 0.1);
      // 印花铁皮暖瓶（席边地上——热水凉透了也没人倒过）
      const ta = ti * 0.9 + 0.5;
      const tx2 = px + Math.cos(ta) * 1.34, tz2 = pz + Math.sin(ta) * 1.34;
      cyl(M.thermosRed, tx2, 0.19, tz2, 0.15, 0.38, 0.15);
      cyl(M.porcelain, tx2, 0.415, tz2, 0.075, 0.07, 0.075);
      box(M.ironDark, tx2, 0.31, tz2, 0.18, 0.018, 0.018, ta);
      colliders.push({ x: hx + px, z: hz + pz, r: 0.85, maxY: hb + 0.95, noSightBlock: true });
      dynamic.banquetTables.push(world(px, 0.9, pz));
    }
    // 一只翻倒的方凳（3号桌外圈：席面纹丝不动，唯独有人从这里离开得很急）
    box(M.veneer, -13.1, 0.18, 2.05, 0.34, 0.48, 0.34, 0.7, Math.PI / 2);
    // 红木踢脚一圈（舞台以外三面，避东墙双开门/服务门洞）
    box(M.veneerRed, -12.5, 0.09, 10.79, 8.4, 0.18, 0.06);
    box(M.veneerRed, -16.79, 0.09, 1.65, 0.06, 0.18, 18.3);
    box(M.veneerRed, -8.21, 0.09, -1.55, 0.06, 0.18, 11.9);
    box(M.veneerRed, -8.21, 0.09, 8.7, 0.06, 0.18, 4.2);
    // 上宾空席：舞台下正对的独桌——单椅、餐具未动、桌牌
    {
      const px = -12.5, pz = -5.6;
      cyl(M.tableCloth, px, 0.42, pz, 1.1, 0.84, 1.1);
      box(M.veneerRed, px, 0.5, pz - 1.25, 0.5, 1.15, 0.5); // 高背椅
      box(M.veneerRed, px, 1.35, pz - 1.45, 0.5, 0.9, 0.12);
      // 上宾席面：骨碟上倒扣的碗、双筷交叠压在碗底、独一只茶盅——都在等一个不会用嘴吃饭的东西
      cyl(M.porcelain, px, 0.849, pz - 0.32, 0.24, 0.018, 0.24);
      cyl(M.porcelain, px, 0.868, pz - 0.32, 0.13, 0.055, 0.13);
      box(M.veneerRed, px, 0.902, pz - 0.32, 0.012, 0.012, 0.32, 0.42);
      box(M.veneerRed, px, 0.914, pz - 0.32, 0.012, 0.012, 0.32, 1.12);
      cyl(M.porcelain, px + 0.24, 0.868, pz - 0.22, 0.062, 0.055, 0.062);
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
    // 藻井灯箱（宴会厅主光源）：金边+暖白发光面，压在天花中央
    box(M.brass, -12.5, F2 - 0.05, 0.5, 6.6, 0.1, 5.6);
    box(M.tungsten, -12.5, F2 - 0.115, 0.5, 5.9, 0.05, 4.9);
    // 灯挂低一些：既照桌面又能把天花/灯笼打出来（贴顶时掠射角=全黑）
    addLight(0xffd9a0, 14, 14, -12.5, F2 - 1.35, 0.5, 0.2);
    addLight(0xff5040, 8, 10, -12.5, F2 - 1.1, 4.5, 0.3);
    addLight(0xffd9a0, 12, 12, -12.5, F2 - 1.0, -7, 0.15);
    // 墙面「還」字红板 + 红幔围边（东墙内侧原本是裸灰泥，核册之夜要挂红）
    box(M.xiPanel, -16.85, 1.9, 2, 0.06, 1.2, 1.2);
    box(M.xiPanel, -16.85, 1.9, -4, 0.06, 1.2, 1.2);
    box(M.xiPanel, -8.15, 1.9, -1, 0.06, 1.2, 1.2);
    for (const pz of [2.5, -4.5]) box(M.curtain, -8.18, 1.5, pz, 0.08, 3.0, 2.6);
    // 檐口红幔围边一圈（天花边界读得出来）
    box(M.curtain, -12.5, F2 - 0.32, 10.82, 8.5, 0.6, 0.1);
    box(M.curtain, -16.82, F2 - 0.32, 0, 0.1, 0.6, 21.4);
    box(M.curtain, -8.22, F2 - 0.32, 0, 0.1, 0.6, 21.4);
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
    addLight(0xdfe8d8, 9, 11, 0.5, F2 - 0.9, -9.5, 0.8);
    // 机关绿墙裙：前场红金一翻面就是这种颜色（画风区间切换的第一信号）
    box(M.paintDado, -6.5, 0.6, -8.17, 2.9, 1.2, 0.05);
    box(M.paintDado, -0.3, 0.6, -8.17, 6.5, 1.2, 0.05);
    box(M.paintDado, 6.2, 0.6, -8.17, 3.5, 1.2, 0.05);
    box(M.paintDado, -5.75, 0.6, -10.8, 4.4, 1.2, 0.05);
    box(M.paintDado, 1.8, 0.6, -10.8, 6.5, 1.2, 0.05);
    // 员工告示 + 员工须知（文书⑤：空托盘规则）
    box(plateMat('今晚核册 全员留守', { w: 256, h: 96, bg: '#c8bfa8', fg: '#4a3428', font: 0.36 }), -1.5, 1.6, -8.16, 0.9, 0.4, 0.04);
    {
      const memo = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.66), M.notice);
      memo.position.copy(world(-2.6, 1.45, -8.17));
      memo.rotation.y = Math.PI;
      memo.rotation.z = 0.04;
      scene.add(memo);
      locations.staffNotice = world(-2.6, 1.4, -8.4);
    }
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
    addLight(0xdfe8d8, 7, 9, 13, F2 - 1.0, -6, 1.2);
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
    // 分闸保险丝板（轮11 箱庭）：总闸旁的灰铁盒——三只瓷座保险丝各管一路
    box(M.steel, 15.3, 1.55, 4.52, 0.72, 0.9, 0.16);
    colliders.push({ minX: hx + 14.9, maxX: hx + 15.7, minZ: hz + 4.4, maxZ: hz + 4.62, minY: hb + 1.1, maxY: hb + 2.0, noSightBlock: true });
    for (let i = 0; i < 3; i++) {
      cyl(M.porcelain, 15.08 + i * 0.22, 1.62, 4.62, 0.09, 0.12, 0.09);   // 瓷座
      cyl(M.brass, 15.08 + i * 0.22, 1.7, 4.62, 0.035, 0.05, 0.035);      // 铜帽
    }
    box(plateMat('大堂·西翼·客房', { w: 256, h: 48, bg: '#3a3a3a', fg: '#d8d0b8', font: 0.5 }), 15.3, 1.32, 4.62, 0.6, 0.12, 0.03);
    locations.fusePanel = world(15.3, 1.5, 4.75);
    // 卫生间：隔断+洗手台+镜(理册婆镜像点位①)
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
    wallZ(SVC, sw.z1, sw.z2, sw.x1, F2, F3, [{ from: 0.6, to: 2.0, top: 2.1 }]);
    wallX(SVC, sw.x1, 17, sw.z2, F2, F3);
    wallX(SVC, sw.x1, 17, sw.z1, F2, F3);
    wallZ(SVC, sw.z1, sw.z2, sw.x1, F3, ROOF, [{ from: 0.6, to: 2.0, top: 2.1 }]);
    wallX(SVC, sw.x1, 17, sw.z2, F3, ROOF);
    wallX(SVC, sw.x1, 17, sw.z1, F3, ROOF);
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
      box(SVC, 13.5, yBase + 1.7, 0.5, 3.4, 3.2, 0.12);
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
    // 三层通高的机关绿墙裙：楼梯间不属于前场——它是酒店的骨头缝
    for (const fy of [0, F2, F3]) {
      box(M.paintDado, 16.83, fy + 0.6, 0.5, 0.05, 1.2, 4.9);
      box(M.paintDado, 11.17, fy + 0.6, -0.7, 0.05, 1.2, 2.6);
      box(M.paintDado, 11.17, fy + 0.6, 2.5, 0.05, 1.2, 1.0);
      box(M.paintDado, 13.75, fy + 0.6, 2.82, 5.4, 1.2, 0.05);
      box(M.paintDado, 13.75, fy + 0.6, -1.82, 5.4, 1.2, 0.05);
    }
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
      [[48, 2.2, 9.2], [45, 2.6, 4]],     // 海洋馆主展厅(巨骸)
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
    // 行军床 + 床头的发条闹钟（值夜的人靠它掐点——现在给你用）
    box(M.clothWork, 14.5, F2 + 0.25, -10.3, 1.9, 0.3, 0.8);
    box(M.brass, 15.35, F2 + 0.47, -10.3, 0.1, 0.14, 0.08);
    locations.securityClock = world(15.35, F2 + 0.5, -10.1);
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
    // 手提录音机（轮11）：牌桌上搁着一台——按停在半局，旁边一盘贴标签的磁带
    box(M.ironDark, -12.1, F2 + 0.93, -0.7, 0.3, 0.12, 0.2);
    cyl(M.steel, -12.16, F2 + 1.0, -0.7, 0.05, 0.02, 0.05);
    cyl(M.steel, -12.04, F2 + 1.0, -0.7, 0.05, 0.02, 0.05);
    box(M.crtShell, -12.4, F2 + 0.9, -1.15, 0.11, 0.02, 0.07, 0.3);
    locations.recorder = world(-12.2, F2 + 0.95, -0.8);
    // 布草间：布草架成排（视线遮挡好地形）
    for (const pz of [5.5, 7.5, 9.5]) {
      box(M.steel, -12.5, F2 + 1.0, pz, 6.5, 2.0, 0.5);
      colliders.push({ minX: hx - 15.75, maxX: hx - 9.25, minZ: hz + pz - 0.28, maxZ: hz + pz + 0.28, minY: hb + F2, maxY: hb + F2 + 2.0 });
      box(M.clothShirt, -12.5, F2 + 0.7, pz, 5.8, 0.5, 0.44);
      box(M.clothShirt, -12.5, F2 + 1.5, pz, 5.4, 0.4, 0.44);
    }
    // 南走廊荧光
    for (const px of [-12, -4, 4]) box(M.fluorescent, px, F3 - 0.06, -8.6, 1.4, 0.05, 0.14);
    addLight(0xdfe8d8, 8, 12, -4, F3 - 0.9, -8.6, 0.4);
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
    // 走廊尽头镜（理册婆早一拍点位②）
    mirror('corridor3F', -12.9, F3 + 1.5, 1.5, Math.PI / 2, 1.4, 1.8);
    // 楼梯间口的安全出口牌：整条暖走廊里唯一一点绿
    box(plateMat('安全出口', { w: 224, h: 64, bg: '#0e2e1a', fg: '#6fe89a', font: 0.4, emissive: 0.85 }), 10.78, F3 + 2.3, 1.5, 0.05, 0.26, 0.72);
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
    // 每扇锁着的门外一双摆正的白布鞋（鞋尖一律朝门）——
    // 全楼的客人都被叫去了某个地方，鞋按规矩留在门口
    for (const [sx2, sz2] of [[-11.4, 2.78], [-5.4, 2.78], [6.6, 2.78], [-2.4, 0.22], [4.6, 0.22]]) {
      const inward = sz2 > 1.5 ? 1 : -1;
      for (const ox of [-0.07, 0.07]) {
        box(M.clothShirt, sx2 + ox, F3 + 0.055, sz2, 0.09, 0.06, 0.24);
        box(M.clothShirt, sx2 + ox, F3 + 0.085, sz2 + inward * 0.055, 0.085, 0.05, 0.1);
      }
    }
    // 走廊陈设：消防栓箱/灭火器/房务推车（有人在营业，只是人不在）
    box(plateMat('消火栓', { w: 128, h: 160, bg: '#8c1616', fg: '#e8d8a8', font: 0.28 }), 9.4, F3 + 1.35, 2.86, 0.6, 0.85, 0.16);
    cyl(M.clothRed, 8.7, F3 + 0.3, 2.7, 0.16, 0.5, 0.16);
    cyl(M.ironDark, 8.7, F3 + 0.58, 2.7, 0.04, 0.12, 0.04);
    {
      box(M.steel, -7.6, F3 + 0.5, 0.52, 0.9, 0.06, 0.5);   // 房务推车（靠南墙，不挡巡线）
      box(M.steel, -7.6, F3 + 0.16, 0.52, 0.9, 0.06, 0.5);
      for (const [cx2, cz2] of [[-7.98, 0.32], [-7.22, 0.32], [-7.98, 0.72], [-7.22, 0.72]]) {
        cyl(M.ironDark, cx2, F3 + 0.06, cz2, 0.08, 0.08, 0.08);
      }
      box(M.clothShirt, -7.8, F3 + 0.6, 0.52, 0.4, 0.14, 0.36); // 叠好的白毛巾
      box(M.clothShirt, -7.8, F3 + 0.72, 0.52, 0.34, 0.1, 0.3);
      box(M.crtShell, -7.25, F3 + 0.64, 0.52, 0.2, 0.26, 0.2);  // 暖瓶
      colliders.push({ minX: hx - 8.1, maxX: hx - 7.1, minZ: hz + 0.25, maxZ: hz + 0.8, minY: hb + F3, maxY: hb + F3 + 0.8, noSightBlock: true });
    }
    // 107 客房（可进）：双床+印花被+暖瓶+窗
    {
      box(M.carpet, 2, F3 + 0.03, 7, 5.9, 0.03, 7.9);
      // 北墙(外墙)内面墙纸衬板（留出两扇窗）
      box(WP, 0.5, F3 + 1.7, 10.8, 2.0, 3.4, 0.08);
      box(WP, 4.25, F3 + 1.7, 10.8, 1.5, 3.4, 0.08);
      box(WP, -0.75, F3 + 0.5, 10.8, 0.5, 1.0, 0.08);
      box(WP, 2.5, F3 + 0.5, 10.8, 2.0, 1.0, 0.08);
      box(WP, -0.75, F3 + 2.9, 10.8, 0.5, 1.0, 0.08);
      box(WP, 2.5, F3 + 2.9, 10.8, 2.0, 1.0, 0.08);
      for (const px of [0.6, 3.4]) {
        box(M.veneer, px, F3 + 0.25, 8.5, 1.25, 0.5, 2.1);
        box(M.clothShirt, px, F3 + 0.56, 8.5, 1.22, 0.16, 2.05);
        box(M.clothRed, px, F3 + 0.62, 9.1, 1.22, 0.1, 0.9);
        colliders.push({ minX: hx + px - 0.65, maxX: hx + px + 0.65, minZ: hz + 7.4, maxZ: hz + 9.6, minY: hb + F3, maxY: hb + F3 + 0.7, noSightBlock: true });
      }
      box(M.veneer, 2, F3 + 0.35, 8.5, 0.5, 0.7, 0.5); // 床头柜
      box(M.crtShell, 2, F3 + 0.78, 8.5, 0.22, 0.3, 0.22); // 暖瓶
      // 陈设加密：立柜/行李架/搪瓷缸/床头灯罩/拖鞋/挂画/窗帘——住过人的房，不是样板间
      box(M.veneer, 4.42, F3 + 0.95, 4.6, 0.75, 1.9, 1.1);            // 立式衣柜（贴东墙）
      box(M.veneerRed, 4.42, F3 + 0.95, 4.03, 0.72, 1.84, 0.03);
      colliders.push({ minX: hx + 4.02, maxX: hx + 4.82, minZ: hz + 4.02, maxZ: hz + 5.15, minY: hb + F3, maxY: hb + F3 + 1.95 });
      box(M.woodDark, 4.45, F3 + 0.26, 6.5, 0.62, 0.05, 0.5);         // 行李架
      for (const [ox, oz] of [[-0.24, -0.18], [0.24, -0.18], [-0.24, 0.18], [0.24, 0.18]]) {
        cyl(M.woodDark, 4.45 + ox, F3 + 0.12, 6.5 + oz, 0.04, 0.24, 0.04);
      }
      box(M.clothGrey, 4.45, F3 + 0.36, 6.5, 0.5, 0.16, 0.34);        // 没打开的行李
      cyl(M.clothShirt, 1.8, F3 + 0.75, 8.35, 0.09, 0.1, 0.09);       // 搪瓷缸一对
      cyl(M.clothShirt, 2.2, F3 + 0.75, 8.6, 0.09, 0.1, 0.09);
      cyl(M.lanternPaper, 2, F3 + 1.5, 9.2, 0.24, 0.26, 0.24);        // 床头壁灯罩
      for (const px of [0.6, 3.4]) {                                   // 床脚拖鞋两双
        for (const ox of [-0.1, 0.1]) box(M.clothShirt, px + ox, F3 + 0.05, 7.25, 0.09, 0.05, 0.24);
      }
      box(M.veneerRed, -0.8, F3 + 1.7, 5.5, 0.05, 0.8, 1.1);          // 西墙挂画（框）
      box(M.mural, -0.76, F3 + 1.7, 5.5, 0.02, 0.68, 0.96);
      for (const wx2 of [-0.7, 1.6, 2.6, 4.6]) {                       // 窗帘四幅（半掩）
        box(M.curtain, wx2, F3 + 1.75, 10.6, 0.5, 2.5, 0.12);
      }
      box(M.woodDark, 2, F3 + 3.0, 10.62, 6.0, 0.06, 0.1);            // 窗帘盒
      locations.room107 = world(2, F3 + 0.8, 7);
      addLight(0xffc880, 4, 6, 2, F3 + 2.3, 7, 0.1);
    }
    // 807 照影房：外间(圆桌茶具) + 卧室(缎面大床/三面镜梳妆台/CRT 电视)
    {
      box(M.carpet, -12.5, F3 + 0.03, -5.5, 8.9, 0.03, 10.9);
      // 墙纸衬板：外墙内面是白瓷砖（外立面材质），客房里要读成墙纸
      box(WP, -16.8, F3 + 1.7, -5.5, 0.1, 3.4, 10.9);                 // 西墙
      box(WP, -15.6, F3 + 1.7, -10.78, 2.4, 3.4, 0.08);               // 南墙左段
      box(WP, -9.9, F3 + 1.7, -10.78, 3.8, 3.4, 0.08);                // 南墙右段
      box(WP, -13, F3 + 0.5, -10.78, 2.4, 1.0, 0.08);                 // 南窗下槛
      box(WP, -13, F3 + 2.9, -10.78, 2.4, 1.0, 0.08);                 // 南窗上楣
      // 外间
      cyl(M.veneerRed, -10.5, F3 + 0.42, -1.8, 0.9, 0.84, 0.9);
      colliders.push({ x: hx - 10.5, z: hz - 1.8, r: 0.55, maxY: hb + F3 + 0.9, noSightBlock: true });
      cyl(M.clothShirt, -10.5, F3 + 0.88, -1.8, 0.3, 0.04, 0.3); // 茶盘
      // 红枣花生盘（撒了一半在桌上）
      for (let i = 0; i < 7; i++) B.add(GEO.sphere, M.clothRed, hx - 10.5 + Math.sin(i * 2.1) * 0.2, hb + F3 + 0.92, hz - 1.8 + Math.cos(i * 1.7) * 0.18, 0, 0.03, 0.025, 0.03);
      // 卧室：缎面大床
      box(M.veneerRed, -14, F3 + 0.3, -8.5, 2.3, 0.6, 2.6);
      box(M.satin, -14, F3 + 0.66, -8.5, 2.26, 0.16, 2.5);
      box(M.satin, -14, F3 + 0.78, -9.4, 2.2, 0.3, 0.7);
      box(M.veneerRed, -14, F3 + 1.3, -9.75, 2.3, 1.4, 0.12);
      colliders.push({ minX: hx - 15.2, maxX: hx - 12.8, minZ: hz - 9.85, maxZ: hz - 7.2, minY: hb + F3, maxY: hb + F3 + 0.85, noSightBlock: true });
      // 「還」字红板贴床头
      box(M.xiPanel, -14, F3 + 1.7, -9.68, 0.9, 0.9, 0.05);
      // 三面镜梳妆台（照影仪式位）
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
    // 连廊应急灯：一支惨白的管子，照出玻璃上自己的影
    box(M.fluorescent, 22, 2.58, 9.8, 1.2, 0.05, 0.13);
    addLight(0xdfe8d8, 5, 8, 22, 2.3, 9.8, 0.9);
    // 售票厅 x 27..39, z -3..11
    box(M.terrazzo, 33, 0.02, 4, 11.9, 0.05, 13.9);
    addPatch(hx + 33, hz + 4, 0, 11.9, 13.9, hb, hb);
    wallX(TILE, 27, 39, 11, 0, 4.6, [{ from: 31, to: 35, top: 3.2, sill: 0.8 }]);
    wallX(TILE, 27, 39, -3, 0, 4.6);
    // 东墙开洞——通往主展厅（巨物残骸）
    wallZ(TILE, -3, 11, 39, 0, 4.6, [{ from: 3, to: 6, top: 2.8 }]);
    box(plateMat('→ 主展厅', { w: 224, h: 72, bg: '#12303a', fg: '#9fd8e8', font: 0.42, emissive: 0.55 }), 38.8, 2.9, 4.5, 0.05, 0.4, 1.5);
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
    // 停业的馆只留两支应急荧光：够看清闸机与展缸轮廓
    for (const [px2, pz2] of [[30, 7], [34.5, 2.5]]) {
      box(M.fluorescent, px2, 4.52, pz2, 1.3, 0.05, 0.14);
      addLight(0xcfdcd4, 6, 10, px2, 4.1, pz2, 1.1);
    }
    // 值班室（西南角）：母带柜——停业馆保持风化灰面
    wallZ(M.plaster, -3, 1.5, 36, 0, 2.6, [{ from: -0.5, to: 0.7, top: 2.05 }]);
    wallX(M.plaster, 36, 39, 1.5, 0, 2.6);
    box(M.veneer, 38, 1.1, -1.5, 0.6, 2.2, 1.6);
    colliders.push({ minX: hx + 37.7, maxX: hx + 38.3, minZ: hz - 2.3, maxZ: hz - 0.7, minY: hb, maxY: hb + 2.2 });
    box(M.veneer, 37, 0.4, 0.5, 1.2, 0.8, 0.7);
    locations.aquaOffice = world(37.5, 0.6, 0.2);
    crt('aqua', 37, 0.95, 0.5, Math.PI, 0.8, [33, 1.5, 6], [33, 1.1, 0]);
    addLight(0xffc880, 4, 6, 37.5, 2.2, 0, 0.4);
    // 宣传横幅（褪色）
    box(plateMat('看海底一万年', { w: 320, h: 72, bg: '#3a5a62', fg: '#cfe0e0', font: 0.4 }), 33, 3.1, 10.86, 5.5, 0.7, 0.06);
    locations.aquaHall = world(33, 0.6, 5);
  }

  // ================= 海洋馆 · 主展厅（巨物残骸） =================
  // 干燥的展厅——排水三年，主展缸的水从来没满过。缸底那具东西是 1998 年
  // 填湾工地挖出来的：房间尺度的肋骨，空的眼眶，标本牌上只写「未定种」。
  {
    const H = 7;                     // 展厅比售票厅高一档
    // 台基 + 地面
    box(M.terrazzo, 48, -0.65, 4, 18.6, 1.35, 15);
    addPatch(hx + 48, hz + 4, 0, 18, 14, hb, hb);
    box(M.terrazzo, 48, 0.02, 4, 17.9, 0.05, 13.9);
    // 外墙（北墙开公众入口 x 45..49；东墙高窗；售票厅共享墙的上带）
    wallX(TILE, 39, 57, 11, 0, H, [{ from: 45, to: 49, top: 3.2 }]);
    wallX(TILE, 39, 57, -3, 0, H);
    wallZ(TILE, -3, 11, 57, 0, H, [
      { from: 1, to: 3, top: 6.1, sill: 4.9 }, { from: 6, to: 8, top: 6.1, sill: 4.9 },
    ]);
    wallZ(TILE, -3, 11, 39, 4.6, H);
    slabRect(39, -3, 57, 11, H, null, { walk: false });
    // 公众入口：台阶 + 双开门(一扇虚掩) + 门脸招牌
    {
      const gN = ctx.heightGround(hx + 47, hz + 14.5);
      stairs(47, 14.2, gN - hb, 47, 11.4, 0, 5.2, M.terrazzo);
      box(M.veneer, 45.7, 1.25, 11.05, 1.3, 2.5, 0.08);
      colliders.push({ minX: hx + 45.05, maxX: hx + 46.35, minZ: hz + 10.95, maxZ: hz + 11.15, minY: hb, maxY: hb + 2.5 });
      box(M.veneer, 48.6, 1.25, 11.5, 1.3, 2.5, 0.08, 0.8); // 虚掩的一扇
      box(M.signAqua, 47, 4.1, 11.25, 6.8, 1.2, 0.2);
      box(plateMat('主展厅', { w: 224, h: 96, bg: '#12303a', fg: '#cfe0e0', font: 0.44, emissive: 0.4 }), 47, 2.9, 11.22, 2.0, 0.6, 0.1);
      box(plateMat('闭馆整修 · 谢绝参观', { w: 320, h: 72, bg: '#c8bfa8', fg: '#7a2020', font: 0.32 }), 45.7, 1.7, 11.14, 1.1, 0.34, 0.03);
    }
    // —— 残骸台座（干涸的主展缸缸底，垫高的沉积床） ——
    box(M.sediment, 48, 0.28, 4, 12.5, 0.52, 6.4);
    // 围索立柱 + 索线（挡人不挡视线：侦察/绕行只能沿外圈）
    {
      const posts = [];
      for (const px of [42, 45, 48, 51, 54]) { posts.push([px, 0.35]); posts.push([px, 7.65]); }
      posts.push([41.2, 4], [54.8, 4]);
      for (const [px, pz] of posts) {
        cyl(M.brass, px, 0.5, pz, 0.05, 1.0, 0.05);
        B.add(GEO.sphere, M.brass, hx + px, hb + 1.02, hz + pz, 0, 0.06, 0.06, 0.06);
      }
      box(M.ironDark, 48, 0.92, 0.35, 12.8, 0.03, 0.03);
      box(M.ironDark, 48, 0.92, 7.65, 12.8, 0.03, 0.03);
      box(M.ironDark, 41.2, 0.92, 4, 0.03, 0.03, 7.3, Math.PI / 2);
      box(M.ironDark, 54.8, 0.92, 4, 0.03, 0.03, 7.3, Math.PI / 2);
      colliders.push({ minX: hx + 41.2, maxX: hx + 54.8, minZ: hz + 0.25, maxZ: hz + 0.45, minY: hb, maxY: hb + 1.0, noSightBlock: true });
      colliders.push({ minX: hx + 41.2, maxX: hx + 54.8, minZ: hz + 7.55, maxZ: hz + 7.75, minY: hb, maxY: hb + 1.0, noSightBlock: true });
      colliders.push({ minX: hx + 41.1, maxX: hx + 41.3, minZ: hz + 0.25, maxZ: hz + 7.75, minY: hb, maxY: hb + 1.0, noSightBlock: true });
      colliders.push({ minX: hx + 54.7, maxX: hx + 54.9, minZ: hz + 0.25, maxZ: hz + 7.75, minY: hb, maxY: hb + 1.0, noSightBlock: true });
    }
    // —— 脊柱（12 节椎骨，弓起 3.2m；逐节沿弧线倾斜衔接）+ 棘突 ——
    const spineY = (t) => 1.4 + Math.sin(t * Math.PI) * 1.75;
    for (let i = 0; i < 12; i++) {
      const t = i / 11;
      const lx = 42.4 + t * 11.2;
      const y = spineY(t);
      const r = 0.42 - Math.abs(t - 0.45) * 0.3;
      const slope = (1.75 * Math.PI * Math.cos(t * Math.PI)) / 11.2;
      cyl(M.bone, lx, y, 4, r * 2, 0.94, r * 2, 0, 0, Math.PI / 2 + Math.atan(slope));
      box(M.bone, lx, y + r + 0.28, 4, 0.16, 0.6, 0.1, 0, 0, (t - 0.5) * 0.5);
    }
    // —— 肋骨（房间尺度的拱，半埋进沉积床；管径固定不随弧放大——否则像水管） ——
    for (let i = 0; i < 6; i++) {
      const t = 0.12 + i * 0.15;
      const lx = 42.4 + t * 11.2;
      const s = 1.6 + Math.sin(t * Math.PI) * 1.7;
      const ribGeo = new THREE.TorusGeometry(s, 0.085 + s * 0.016, 8, 26, Math.PI * 1.03);
      B.add(ribGeo, M.bone, hx + lx, hb + 0.5, hz + 4, Math.PI / 2 + (i % 2 ? 0.05 : -0.04), 1, 1, 1, 0, (i - 2.5) * 0.025);
      // 肋骨端点埋进床里的碎骨
      B.add(GEO.sphere, M.bone, hx + lx, hb + 0.55, hz + 4 - s, 0, 0.2, 0.14, 0.2);
      B.add(GEO.sphere, M.bone, hx + lx, hb + 0.55, hz + 4 + s, 0, 0.2, 0.14, 0.2);
    }
    // —— 头骨（西端，眼眶正对售票厅来客） ——
    {
      const sx = 41.3, sy = 1.35, sz = 4;
      // 颅腔（后宽前窄）+ 眉脊
      B.add(GEO.sphere, M.bone, hx + sx, hb + sy, hz + sz, 0.15, 1.45, 1.05, 1.2, 0, 0.1);
      B.add(GEO.sphere, M.bone, hx + sx - 0.8, hb + sy + 0.32, hz + sz, 0, 0.78, 0.52, 0.98);
      // 吻部（前伸收窄）
      box(M.bone, sx - 1.7, sy - 0.1, sz, 1.9, 0.55, 0.75, 0, 0, -0.06);
      box(M.bone, sx - 2.7, sy - 0.28, sz, 1.1, 0.36, 0.5, 0, 0, -0.04);
      // 下颌（半开，垂进沉积里）
      box(M.bone, sx - 1.7, sy - 0.72, sz + 0.05, 2.1, 0.22, 0.55, 0, 0, 0.2);
      // 空眼眶 ×2（凹在眉脊下·朝来路）——干的，黑的
      const socket = new THREE.MeshStandardMaterial({ color: 0x0a0b0d, roughness: 1 });
      B.add(GEO.sphere, socket, hx + sx - 1.3, hb + sy + 0.26, hz + sz - 0.54, 0, 0.3, 0.26, 0.23);
      B.add(GEO.sphere, socket, hx + sx - 1.26, hb + sy + 0.31, hz + sz + 0.57, 0, 0.27, 0.23, 0.2);
      colliders.push({ x: hx + sx, z: hz + sz, r: 1.2, maxY: hb + 2.2 });
    }
    // 缆绳固定（从屋面垂下吊着脊柱——像怕它自己走了）
    for (const [lx, ly] of [[44.5, spineY(0.19)], [48.4, spineY(0.54)], [52.2, spineY(0.87)]]) {
      cyl(M.ironDark, lx, (H - 0.2 + ly) / 2, 4, 0.025, H - 0.2 - ly, 0.025, 0, 0.06, 0.04);
    }
    // 标本牌（缆绳挂的铁牌 + 立牌）
    cyl(M.ironDark, 44.5, 0.7, 8.6, 0.04, 1.4, 0.04);
    box(plateMat('未定种', { w: 192, h: 96, bg: '#20262a', fg: '#c8d4d8', font: 0.42 }), 44.5, 1.5, 8.6, 0.9, 0.5, 0.05);
    box(plateMat('一九九八 · 填湾工地出土', { w: 384, h: 64, bg: '#20262a', fg: '#8a949a', font: 0.34 }), 44.5, 1.12, 8.6, 1.1, 0.24, 0.04);
    locations.specimenPlate = world(44.5, 1.3, 8.6);
    // 展柜（北墙下两座玻璃柜：碎骨、盐结核）
    for (const [cxl, label] of [[41.5, '肋骨残段'], [52.8, '盐结核']]) {
      box(M.veneer, cxl, 0.5, 9.6, 1.8, 1.0, 1.0);
      box(M.aquaGlass, cxl, 1.35, 9.6, 1.7, 0.7, 0.9);
      colliders.push({ minX: hx + cxl - 0.9, maxX: hx + cxl + 0.9, minZ: hz + 9.1, maxZ: hz + 10.1, minY: hb, maxY: hb + 1.75, noSightBlock: true });
      B.add(GEO.sphere, M.bone, hx + cxl - 0.3, hb + 1.15, hz + 9.6, 0.4, 0.3, 0.14, 0.16);
      B.add(GEO.box, M.bone, hx + cxl + 0.3, hb + 1.12, hz + 9.6, 0.9, 0.5, 0.1, 0.16);
      box(plateMat(label, { w: 160, h: 56, bg: '#20262a', fg: '#8a949a', font: 0.4 }), cxl, 0.82, 10.12, 0.7, 0.22, 0.03);
    }
    // 南墙高柜两组（实体遮挡——绕行掩体）
    for (const cxl of [42, 46.5]) {
      box(M.veneer, cxl, 1.1, -2.3, 2.6, 2.2, 0.9);
      colliders.push({ minX: hx + cxl - 1.3, maxX: hx + cxl + 1.3, minZ: hz - 2.75, maxZ: hz - 1.85, minY: hb, maxY: hb + 2.2 });
    }
    // 灯：两支高位惨白荧光 + 头骨旁一盏检视灯（干燥、无蓝滤）
    for (const lxl of [43.5, 52.5]) {
      box(M.fluorescent, lxl, H - 0.4, 4, 1.6, 0.06, 0.16);
    }
    addLight(0xd8e4dc, 9, 15, 43.5, H - 1.2, 4, 0.5);
    addLight(0xd8e4dc, 8, 14, 52.5, H - 1.2, 4, 0.25);
    box(M.tungsten, 40.3, 2.3, 6.2, 0.18, 0.5, 0.18);
    addLight(0xffc880, 6, 8, 40.5, 2.5, 6.0, 0.1);
    locations.aquaMainHall = world(48, 0.6, 4);

    // —— 处理间（东南角）：骨要一根根刷。母带的铁柜也在这儿。 ——
    wallX(M.plaster, 50, 57, 1, 0, 2.8, [{ from: 51, to: 52.2, top: 2.05 }]);
    wallZ(M.plaster, -3, 1, 50, 0, 2.8);
    slabRect(50, -3, 57, 1, 2.8, null, { walk: false });
    box(plateMat('处理间', { w: 160, h: 64, bg: '#3a3a3a', fg: '#d8d0b8', font: 0.44 }), 51.6, 2.35, 1.08, 0.8, 0.32, 0.05);
    // 不锈钢理骨台 + 未理完的骨
    box(M.steel, 54.5, 0.45, -1.6, 2.6, 0.9, 1.0);
    colliders.push({ minX: hx + 53.2, maxX: hx + 55.8, minZ: hz - 2.1, maxZ: hz - 1.1, minY: hb, maxY: hb + 0.95, noSightBlock: true });
    for (let i = 0; i < 4; i++) B.add(GEO.box, M.bone, hx + 53.6 + i * 0.55, hb + 0.98, hz - 1.6, i * 0.8, 0.5, 0.09, 0.14);
    // 水槽 + 皂
    box(M.steel, 51, 0.5, -2.4, 1.2, 1.0, 0.8);
    colliders.push({ minX: hx + 50.4, maxX: hx + 51.6, minZ: hz - 2.8, maxZ: hz - 2.0, minY: hb, maxY: hb + 1.0, noSightBlock: true });
    // 贝灰袋（理骨员刷骨用的灰——也能倒一道界）
    box(M.salt, 51.9, 1.13, -2.35, 0.5, 0.36, 0.4, 0.2);
    locations.limeBag = world(51.9, 1.1, -2.1);
    // 挂钩上的胶皮围裙（空的三副）
    for (let i = 0; i < 3; i++) {
      box(M.ironDark, 52.4 + i * 1.1, 2.3, 0.9, 0.04, 0.3, 0.04);
      box(M.rubber, 52.4 + i * 1.1, 1.7, 0.86, 0.5, 1.1, 0.06, 0, 0, (i - 1) * 0.05);
    }
    // 母带铁柜（东墙下）——挂牌「西馆·铁柜」
    box(M.ironDark, 56.4, 1.0, -0.6, 0.9, 1.7, 0.5);
    colliders.push({ minX: hx + 55.9, maxX: hx + 56.9, minZ: hz - 0.85, maxZ: hz - 0.35, minY: hb, maxY: hb + 1.75 });
    box(plateMat('西馆 · 铁柜', { w: 192, h: 64, bg: '#4a4438', fg: '#d8cfb8', font: 0.4 }), 55.9, 1.5, -0.6, 0.04, 0.3, 0.7);
    locations.tapeCabinet = world(55.8, 1.1, -0.6);
    addLight(0xffc880, 4, 6, 53.5, 2.4, -1, 0.35);
    locations.processing = world(53.5, 0.6, -1);
  }

  // ================= 巡逻/工位 =================
  patrols.waiterBanquet = [[-14.5, -6.8], [-10.5, -6.8], [-9.2, 2.8], [-13.5, 2.8], [-15.6, -2]].map(([x, z]) => [hx + x, hz + z]);
  // 门斗隔断后：末段沿玻璃缝正中穿进风除室，在地垫上停一拍再折返
  patrols.waiterLobby = [[3, -9.5], [-6, -9.5], [-6.5, -3], [-4.5, 1.8], [4.5, 3.5], [5.5, 7.0], [0.9, 7.6], [0, 9.7]].map(([x, z]) => [hx + x, hz + z]);
  patrols.waiterEast = [[9.5, 1.5], [9.5, 9.6], [22, 9.8], [30.5, 5.5], [33, 1]].map(([x, z]) => [hx + x, hz + z]);
  // 理骨员：绕残骸台座一圈，末了在处理间门口停一拍
  patrols.osteoHall = [[43, 8.6], [52.5, 8.6], [55.5, 3.2], [51.6, 0.4], [43.5, -0.8], [40.6, 3.4]].map(([x, z]) => [hx + x, hz + z]);
  patrols.osteoWork = [hx + 42.6, hz + 0.6]; // 理骨工位(南柜与围索之间)
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
    annexRect: { minX: hx + 17, maxX: hx + 57.4, minZ: hz - 3.4, maxZ: hz + 11.4 },
  };
  // 主展厅矩形（叙事触发/室内判定用）
  dynamic.aquaMainRect = { minX: hx + 39, maxX: hx + 57, minZ: hz - 3, maxZ: hz + 11 };
  // 地面材质区（脚步声/减振）：红毯吃振动，瓷砖传远，舞台木板
  dynamic.dampRects = [
    dynamic.lobbyCarpetRect,
    { minX: hx - 17, maxX: hx - 8, minZ: hz - 11, maxZ: hz + 11 },       // 宴会厅红毯
    { minX: hx - 1.8, maxX: hx + 1.8, minZ: hz - 6.3, maxZ: hz + 0.3 },  // 大楼梯红毯
  ];
  dynamic.tileRects = [
    { minX: hx - 8, maxX: hx + 8, minZ: hz - 11, maxZ: hz - 8 },    // 服务走廊
    { minX: hx + 8, maxX: hx + 17, minZ: hz - 11, maxZ: hz - 2 },   // 厨房
    { minX: hx + 11, maxX: hx + 17, minZ: hz + 6, maxZ: hz + 9.2 }, // 卫生间
  ];
  dynamic.stageRect = { minX: hx - 16.8, maxX: hx - 8.2, minZ: hz - 10.8, maxZ: hz - 7.6 };

  return dynamic.hotelInfo;
}
