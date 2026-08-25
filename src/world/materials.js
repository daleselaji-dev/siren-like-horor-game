// 材质库：基于程序化贴图的 PBR(MeshStandardMaterial) 材质
// v2：接入粗糙度图（湿面真正反光）+ 环境反射强度分级
import * as THREE from 'three';
import { buildTextureSet } from './textures.js';

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

  M.wood = std(T.wood, { normalScale: 1.25, envInt: 0.7 });
  M.woodDark = std(T.wood, { color: 0x9a9a9a, normalScale: 1.25, envInt: 0.6 });
  M.stone = std(T.stone, { normalScale: 1.5, envInt: 1.1 });
  M.plaster = std(T.plaster, { normalScale: 1.1, envInt: 0.55 });
  M.roof = std(T.roof, { normalScale: 1.6, envInt: 1.2 });
  M.sand = std(T.sand, { normalScale: 1.0, envInt: 0.9 });
  M.slab = std(T.slab, { normalScale: 1.4, envInt: 1.4 });
  M.salt = std(T.salt, { envInt: 1.3 });
  M.rock = std(T.rock, { normalScale: 1.9, envInt: 1.1 });

  // 潮尸皮肤：灌水的湿油光
  M.corpseSkin = std(T.corpseSkin, { normalScale: 0.9, envInt: 1.5 });
  M.clothNavy = std(T.clothNavy, { envInt: 0.4 });
  M.clothGrey = std(T.clothGrey, { envInt: 0.4 });
  M.clothRed = std(T.clothRed, { envInt: 0.55 });

  // ===== 蚀湾 · 人物 =====
  M.skin = std(T.skin, { normalScale: 0.7, envInt: 0.6 });
  M.skinPale = std(T.skin, { color: 0xd8dee0, normalScale: 0.7, envInt: 0.9 }); // 深压下失血的脸
  // 肤色池：2 张底皮 × 色调乘子——人群不再共享同一张皮
  M.skinTones = [
    M.skin,
    std(T.skinB, { normalScale: 0.7, envInt: 0.6 }),
    std(T.skin, { color: 0xe8d4c2, normalScale: 0.7, envInt: 0.6 }),   // 偏黄气色
    std(T.skinB, { color: 0xd9b9a2, normalScale: 0.75, envInt: 0.65 }),// 海边晒褐
    std(T.skin, { color: 0xf2dfd6, normalScale: 0.65, envInt: 0.6 }),  // 白净
  ];
  // 老年皮池（皱纹沟+老年斑烘进贴图）
  M.skinOlds = [
    std(T.skinOld, { normalScale: 1.0, envInt: 0.55 }),
    std(T.skinOld, { color: 0xdcc2ac, normalScale: 1.05, envInt: 0.6 }), // 晒褐的老年
    std(T.skinOld, { color: 0xe4dcc6, normalScale: 0.95, envInt: 0.55 }),// 蜡黄的老年
  ];
  // 失血皮池（酒店员工：司仪/侍应/岗亭员）
  M.skinPales = [
    M.skinPale,
    std(T.skinB, { color: 0xd2dce2, normalScale: 0.7, envInt: 0.95 }),
    std(T.skinOld, { color: 0xd8dcd4, normalScale: 0.9, envInt: 0.9 }),
  ];
  // 骨粉白垩皮（理骨员：干、白、粗糙——像常年裹着一层粉）
  M.skinChalk = std(T.skinOld, { color: 0xe2e4da, normalScale: 1.1, envInt: 0.4 });
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
  }); // 全福婆第三眼矿物孔板

  // ===== 蚀湾 · 南方大酒店 =====
  M.terrazzo = std(T.terrazzo, { normalScale: 0.8, envInt: 1.5, roughness: 0.9 });
  M.carpet = std(T.carpet, { normalScale: 1.2, envInt: 0.25 });
  M.marble = std(T.marble, { normalScale: 0.5, envInt: 1.7, roughness: 0.8 });
  M.wallpaper = std(T.wallpaper, { normalScale: 0.9, envInt: 0.5 });
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
  }); // 红金囍屏
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
  // 镇口公路沥青（2001 年的县道：补丁摞补丁）
  M.asphalt = std(T.slab, { normalScale: 0.7, envInt: 0.6, roughness: 1.0 });
  M.asphalt.color = new THREE.Color(0x4a4c4e);
  // 巨物残骸骨料：陈年象牙色，盐析出的干骨面
  M.bone = std(T.salt, { normalScale: 0.8, envInt: 1.1, roughness: 0.95 });
  M.bone.color = new THREE.Color(0xcfc4ac);
  M.notice = new THREE.MeshStandardMaterial({ map: T.notice, roughness: 0.9, side: THREE.DoubleSide });
  M.tableCloth = new THREE.MeshStandardMaterial({ color: 0xa41c1a, roughness: 0.85 }); // 圆桌红台布
  M.aquaGlass = new THREE.MeshPhysicalMaterial({
    color: 0x18424a, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.55,
    envMapIntensity: 1.6,
  }); // 海洋馆展缸玻璃

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
