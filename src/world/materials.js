// 材质库：基于程序化贴图的 PBR(MeshStandardMaterial) 材质
// v2：接入粗糙度图（湿面真正反光）+ 环境反射强度分级
import * as THREE from 'three';
import { buildTextureSet } from './textures.js';
import { buildFaceMaterials, applySkinRim } from './faces.js';

export function buildMaterials(lowspec = false) {
  const T = buildTextureSet(lowspec);
  const M = {};

  const std = (tex, opts = {}) => new THREE.MeshStandardMaterial({
    map: tex?.map, normalMap: tex?.normalMap,
    roughnessMap: tex?.roughnessMap,
    // 有粗糙度图时基值给 1，交由贴图调制
    roughness: tex?.roughnessMap ? (opts.roughness ?? 1.0) : (opts.roughness ?? 0.9),
    metalness: opts.metalness ?? 0.0,
    color: opts.color ?? 0xffffff,
    normalScale: new THREE.Vector2(opts.normalScale ?? 1, opts.normalScale ?? 1),
    envMapIntensity: opts.envInt ?? 1.0,
    ...opts.extra,
  });

  // 皮肤专用：双层法线物理材质
  //   底层 normalMap = 皮肤宏观（皱纹/斑驳/粗毛孔，烘进 skinTexture 高度场）
  //   清漆层 clearcoatNormalMap = 细胞噪声毛孔微法线（平铺 3.5x）——油光膜顺毛孔破碎
  //   clearcoat = 菲涅尔油光层：掠射角一条活人的「皮脂高光」，正视几乎不亮
  //   sheen = 绒毛边缘散射（peach fuzz）：轮廓掠射处一层暖软光——塑料恰恰没有这层
  const skinPhys = (tex, o = {}) => {
    const m = new THREE.MeshPhysicalMaterial({
      map: tex?.map, normalMap: tex?.normalMap, roughnessMap: tex?.roughnessMap,
      roughness: 1.0, metalness: 0.0,
      color: o.color ?? 0xffffff,
      normalScale: new THREE.Vector2(o.normalScale ?? 0.85, o.normalScale ?? 0.85),
      envMapIntensity: o.envInt ?? 0.7,
      clearcoat: o.cc ?? 0.3,
      clearcoatRoughness: o.ccRough ?? 0.34,
      sheen: o.sheen ?? 0.28, sheenRoughness: 0.55,
      sheenColor: new THREE.Color(o.sheenColor ?? 0xffe2d0),
    });
    m.clearcoatNormalMap = T.skinPoreN;
    m.clearcoatNormalScale = new THREE.Vector2(o.poreScale ?? 0.9, o.poreScale ?? 0.9);
    // 背光透光近似：耳缘/鼻翼掠射角泛暖红，叠在 sheen 绒毛光之上（受光门控）
    applySkinRim(m, o.rimK ?? 0.55);
    return m;
  };

  M.wood = std(T.wood, { normalScale: 1.25, envInt: 0.7 });
  M.woodDark = std(T.wood, { color: 0x9a9a9a, normalScale: 1.25, envInt: 0.6 });
  M.stone = std(T.stone, { normalScale: 1.5, envInt: 1.1 });
  M.plaster = std(T.plaster, { normalScale: 1.1, envInt: 0.55 });
  M.roof = std(T.roof, { normalScale: 1.6, envInt: 1.2 });
  M.sand = std(T.sand, { normalScale: 1.0, envInt: 0.9 });
  M.slab = std(T.slab, { normalScale: 1.4, envInt: 1.4 });
  M.salt = std(T.salt, { envInt: 1.3 });
  M.rock = std(T.rock, { normalScale: 1.9, envInt: 1.1 });

  // 潮尸皮肤：灌水的湿油光（清漆层拉满——泡过的皮面浮一层水膜）
  M.corpseSkin = skinPhys(T.corpseSkin, { normalScale: 0.9, envInt: 1.5, cc: 0.55, ccRough: 0.18, poreScale: 0.7 });
  M.clothNavy = std(T.clothNavy, { envInt: 0.4 });
  M.clothGrey = std(T.clothGrey, { envInt: 0.4 });
  M.clothRed = std(T.clothRed, { envInt: 0.55 });

  // ===== 蚀湾 · 人物 =====
  M.skin = skinPhys(T.skin, { envInt: 0.6, cc: 0.3, ccRough: 0.32 });
  M.skinPale = skinPhys(T.skin, { color: 0xd8dee0, envInt: 0.9, cc: 0.48, ccRough: 0.24, rimK: 0.35 }); // 深压下失血的脸——更湿
  // 肤色池：2 张底皮 × 色调乘子——人群不再共享同一张皮
  M.skinTones = [
    M.skin,
    skinPhys(T.skinB, { envInt: 0.6, cc: 0.3, ccRough: 0.32 }),
    skinPhys(T.skin, { color: 0xe8d4c2, envInt: 0.6, cc: 0.26, ccRough: 0.36 }),   // 偏黄气色
    skinPhys(T.skinB, { color: 0xd9b9a2, normalScale: 0.9, envInt: 0.65, cc: 0.34, ccRough: 0.3 }),// 海边晒褐（汗光）
    skinPhys(T.skin, { color: 0xf2dfd6, normalScale: 0.8, envInt: 0.6, cc: 0.28, ccRough: 0.34 }), // 白净
  ];
  // 老年皮池（皱纹沟+老年斑烘进贴图；油少——清漆弱、毛孔法线更重）
  M.skinOlds = [
    skinPhys(T.skinOld, { normalScale: 1.15, envInt: 0.55, cc: 0.16, ccRough: 0.5, poreScale: 1.25 }),
    skinPhys(T.skinOld, { color: 0xdcc2ac, normalScale: 1.2, envInt: 0.6, cc: 0.18, ccRough: 0.48, poreScale: 1.25 }), // 晒褐的老年
    skinPhys(T.skinOld, { color: 0xe4dcc6, normalScale: 1.1, envInt: 0.55, cc: 0.14, ccRough: 0.52, poreScale: 1.25 }),// 蜡黄的老年
  ];
  // 失血皮池（酒店员工：报数员/侍应/岗亭员）——湿、青、油光浮起
  M.skinPales = [
    M.skinPale,
    skinPhys(T.skinB, { color: 0xd2dce2, envInt: 0.95, cc: 0.5, ccRough: 0.22 }),
    skinPhys(T.skinOld, { color: 0xd8dcd4, normalScale: 1.0, envInt: 0.9, cc: 0.44, ccRough: 0.26 }),
  ];
  // 骨粉白垩皮（理骨员：干、白、粗糙——像常年裹着一层粉；几乎无油）
  M.skinChalk = skinPhys(T.skinOld, { color: 0xe2e4da, normalScale: 1.25, envInt: 0.4, cc: 0.05, ccRough: 0.7, poreScale: 1.4, rimK: 0.18 });
  // 盐霜附居痕迹（人脸上的结晶主异常）：干白晶壳、边缘微闪
  M.saltFrost = std(T.salt, { color: 0xf2efe2, normalScale: 1.1, envInt: 1.5, roughness: 1.0 });
  M.rubber = std(T.rubber, { normalScale: 1.2, envInt: 1.3, extra: { side: THREE.DoubleSide } }); // 胶皮围裙/手套/胶靴（围裙为开放壳，双面）
  M.clothUniform = std(T.clothUniform, { envInt: 0.4 });       // 岗亭员藏青制服
  M.clothDress = std(T.clothDress, { envInt: 0.4 });
  M.clothSuit = std(T.clothSuit, { envInt: 0.35 });
  M.clothShirt = std(T.clothShirt, { envInt: 0.4 });
  M.clothVest = std(T.clothVest, { envInt: 0.35 });
  M.clothWork = std(T.clothWork, { envInt: 0.35 });
  M.clothBrown = std(T.clothBrown, { envInt: 0.35 });
  M.satin = std(T.satin, { normalScale: 0.6, envInt: 0.7, roughness: 1.0 }); // 枣红缎袄
  M.driftwood = std(T.driftwood, { normalScale: 1.6, envInt: 0.8 }); // 侍应浮木颈臂
  M.sediment = std(T.sediment, { normalScale: 1.3, envInt: 0.9 }); // 沉积覆层
  M.poreplate = new THREE.MeshStandardMaterial({
    map: T.poreplate, roughness: 0.5, metalness: 0.15,
    emissive: 0x1a2224, emissiveIntensity: 0.25,
  }); // 理册婆第三眼矿物孔板

  // ===== 蚀湾 · 南方大酒店 =====
  M.terrazzo = std(T.terrazzo, { normalScale: 0.8, envInt: 1.5, roughness: 0.9 });
  M.carpet = std(T.carpet, { normalScale: 1.2, envInt: 0.25 });
  M.marble = std(T.marble, { normalScale: 0.5, envInt: 1.7, roughness: 0.8 });
  M.wallpaper = std(T.wallpaper, { normalScale: 0.9, envInt: 0.5 });
  M.hotelWall = std(T.paintedWall, { normalScale: 0.6, envInt: 0.75 });   // 前场乳白漆内墙：营业中的旧，不是废墟的旧
  M.serviceWall = std(T.paintedWall, { color: 0xaeb6ac, normalScale: 0.6, envInt: 0.5 }); // 后勤冷灰漆（上方配机关绿墙裙）
  M.tile = std(T.tile, { normalScale: 0.8, envInt: 1.5 });
  M.veneer = std(T.veneer, { normalScale: 0.9, envInt: 1.0, roughness: 0.85 });
  M.veneerRed = std(T.veneer, { color: 0xb05540, normalScale: 0.9, envInt: 1.1, roughness: 0.8 }); // 红漆总台
  M.curtain = std(T.curtain, { normalScale: 1.4, envInt: 0.7 });
  M.brass = new THREE.MeshStandardMaterial({ color: 0xc9a24e, roughness: 0.3, metalness: 0.9, envMapIntensity: 1.6 }); // 金不锈钢包边
  M.steel = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.35, metalness: 0.85, envMapIntensity: 1.3 });
  M.mirror = new THREE.MeshStandardMaterial({ color: 0xcfd6da, roughness: 0.06, metalness: 0.95, envMapIntensity: 2.2 }); // 镜面柱
  M.plasticGreen = new THREE.MeshStandardMaterial({ color: 0x2e5c30, roughness: 0.55, envMapIntensity: 0.7 }); // 塑料绿植
  // 矿棉吊顶：微量自发光=室内反弹光近似——朝下的面收不到半球光/掠射点光，
  // 没有这点假反弹整个天花会是纯黑，室内在夜里读成"没有屋顶"
  M.ceilingTile = std(T.ceiling, { normalScale: 0.7, envInt: 0.4 });
  M.ceilingTile.emissive = new THREE.Color(0x3a342c);
  M.ceilingTile.emissiveMap = T.ceiling.map;
  M.ceilingTile.emissiveIntensity = 1.15;
  M.crtGlass = new THREE.MeshStandardMaterial({ color: 0x0a0c0a, roughness: 0.15, metalness: 0.2, envMapIntensity: 1.5 }); // 熄屏CRT
  M.crtShell = new THREE.MeshStandardMaterial({ color: 0xb8b2a2, roughness: 0.7 }); // CRT米黄塑壳
  M.fluorescent = new THREE.MeshBasicMaterial({ color: 0xeef2e4 }); // 荧光灯管发光面
  M.tungsten = new THREE.MeshBasicMaterial({ color: 0xffd9a0 }); // 钨丝灯罩发光面
  M.xiPanel = new THREE.MeshStandardMaterial({
    map: T.xiPanel, roughness: 0.6, emissive: 0x841818, emissiveMap: T.xiPanel, emissiveIntensity: 0.22,
  }); // 红金「還」字屏
  M.lanternPaperXi = new THREE.MeshStandardMaterial({
    map: T.lanternXi, emissive: 0xff4030, emissiveMap: T.lanternXi, emissiveIntensity: 1.7, roughness: 0.8,
  });
  M.signSouth = new THREE.MeshStandardMaterial({
    map: T.signSouth, emissive: 0xffffff, emissiveMap: T.signSouth, emissiveIntensity: 0.85, roughness: 0.6,
  }); // 灯箱招牌（横）
  M.signSouthV = new THREE.MeshStandardMaterial({
    map: T.signSouthV, emissive: 0xffffff, emissiveMap: T.signSouthV, emissiveIntensity: 0.8, roughness: 0.6,
  });
  M.signAqua = new THREE.MeshStandardMaterial({
    map: T.signAqua, emissive: 0x9fd8e8, emissiveMap: T.signAqua, emissiveIntensity: 0.7, roughness: 0.6,
  });
  M.mural = new THREE.MeshStandardMaterial({ map: T.mural, roughness: 0.85 });
  // 整幅贴图类材质：合批时保持 0..1 UV，禁止世界空间平铺（否则字/画被切成色带）
  for (const sm of [M.xiPanel, M.signSouth, M.signSouthV, M.signAqua, M.mural]) sm.userData.fullUV = true;
  // 镇口公路沥青（2001 年的县道：骨料麻面+龟裂+灌缝蛇线+补丁）——雨夜压暗压湿，灯下起油亮
  M.asphalt = std(T.asphalt, { normalScale: 1.3, envInt: 1.35, roughness: 1.0 });
  M.asphalt.color = new THREE.Color(0x8e9296); // 贴图基色偏亮，整体压到湿夜县道
  // 现浇水泥：路缘石/人行道/勒脚/电杆——县镇街道的骨架色
  M.concrete = std(T.concrete, { normalScale: 1.1, envInt: 0.9 });
  M.concreteDark = std(T.concrete, { color: 0x8a8e8a, normalScale: 1.2, envInt: 0.7 }); // 勒脚/溅泥带
  // 道路白漆（磨旧的中线/停车线）：漆皮浮在沥青上，磨掉一半
  M.roadPaint = std(T.concrete, { color: 0xd8d8cc, normalScale: 0.5, envInt: 1.0, roughness: 0.92 });
  // 巨物残骸骨料：陈年象牙色，盐析出的干骨面
  M.bone = std(T.salt, { normalScale: 0.8, envInt: 1.1, roughness: 0.95 });
  M.bone.color = new THREE.Color(0xcfc4ac);
  M.notice = new THREE.MeshStandardMaterial({ map: T.notice, roughness: 0.9, side: THREE.DoubleSide });
  M.tableCloth = new THREE.MeshStandardMaterial({ color: 0xa41c1a, roughness: 0.85 }); // 圆桌红台布
  // 宴席餐具三件：白瓷(带一点青口冷光)/绿玻璃啤酒瓶/印花铁皮暖瓶
  M.porcelain = new THREE.MeshStandardMaterial({ color: 0xe6eae2, roughness: 0.18, envMapIntensity: 1.7 });
  M.glassGreen = new THREE.MeshStandardMaterial({ color: 0x274a26, roughness: 0.08, metalness: 0.15, envMapIntensity: 2.0 });
  M.thermosRed = new THREE.MeshStandardMaterial({ color: 0xb63430, roughness: 0.32, metalness: 0.25, envMapIntensity: 1.3 });
  M.aquaGlass = new THREE.MeshPhysicalMaterial({
    color: 0x18424a, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.55,
    envMapIntensity: 1.6,
  }); // 海洋馆展缸玻璃
  M.shopGlass = new THREE.MeshPhysicalMaterial({
    color: 0x9aa8a2, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.16,
    envMapIntensity: 1.8,
  }); // 沿街门市橱窗玻璃（薄透、留一点旧灰）
  M.paintDado = new THREE.MeshStandardMaterial({
    color: 0x2b4a3c, roughness: 0.38, envMapIntensity: 0.9,
  }); // 机关绿油漆墙裙（后勤走廊/楼梯间——前场红金一翻面就是这种颜色）

  M.net = new THREE.MeshStandardMaterial({
    map: T.net, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide,
    roughness: 0.95, color: 0xbbb49a,
  });

  M.lanternPaper = new THREE.MeshStandardMaterial({
    map: T.lantern, emissive: 0xff8a3a, emissiveMap: T.lantern, emissiveIntensity: 1.6,
    roughness: 0.8,
  });
  M.lanternPaperJi = new THREE.MeshStandardMaterial({
    map: T.lanternJi, emissive: 0xff7030, emissiveMap: T.lanternJi, emissiveIntensity: 1.4,
    roughness: 0.8,
  });
  M.talisman = new THREE.MeshStandardMaterial({ map: T.talisman, roughness: 0.9, side: THREE.DoubleSide });

  M.ironDark = new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.42, metalness: 0.78, envMapIntensity: 1.2 });
  M.candleFlame = new THREE.MeshBasicMaterial({ color: 0xffc266 });
  M.eyeGlow = new THREE.MeshBasicMaterial({ color: 0x9fd8e8 });
  M.paper = new THREE.MeshStandardMaterial({ color: 0xcfc4a4, roughness: 0.95, side: THREE.DoubleSide });
  M.paperGlow = new THREE.MeshStandardMaterial({
    color: 0xd8ccaa, roughness: 0.9, side: THREE.DoubleSide,
    emissive: 0xa8945e, emissiveIntensity: 0.35,
  });
  // 湿发（贴头皮的乱发）+ 发色池（纯黑/深棕/褐、2001 年偶见的酒红染发）
  M.hair = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.55, envMapIntensity: 0.8 });
  M.hairTones = [
    M.hair,
    new THREE.MeshStandardMaterial({ color: 0x1e1712, roughness: 0.6, envMapIntensity: 0.7 }),
    new THREE.MeshStandardMaterial({ color: 0x2a1e14, roughness: 0.62, envMapIntensity: 0.7 }),
    new THREE.MeshStandardMaterial({ color: 0x30181a, roughness: 0.58, envMapIntensity: 0.75 }),
  ];

  M.textures = T;
  // 生图烘焙脸皮：同步建材质（底皮），照片由 bakeFaces(M) 异步合成进 Canvas
  buildFaceMaterials(M, T, lowspec);
  return M;
}

// —— 假体积光锥：加法混合的软光锥（顶点色渐隐，无需贴图）——
// 光在盐雾里显形——灯笼/烛火/塔灯下面拖出一段被雾抓住的光
const _coneGrad = (() => {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 64;
  const cx = c.getContext('2d');
  const g = cx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.28)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  cx.fillStyle = g;
  cx.fillRect(0, 0, 8, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
})();

export function makeLightCone(color = 0xff8438, opacity = 0.05, topR = 0.18, botR = 1.6, height = 2.8) {
  const geo = new THREE.CylinderGeometry(topR, botR, height, 12, 1, true);
  geo.translate(0, -height / 2, 0); // 原点在光源处，向下展开
  const mat = new THREE.MeshBasicMaterial({
    map: _coneGrad, color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
    side: THREE.DoubleSide, fog: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 5;
  return m;
}
