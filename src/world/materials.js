// 材质库《返潮》：基于程序化贴图的 PBR(MeshStandardMaterial) 材质
// 千禧婚宴酒店语汇：脏白乳胶漆 / 褪色粉墙纸 / 抛光砖 / 红金婚宴 / 不锈钢后厨 / 灰绿水泥后勤
import * as THREE from 'three';
import { buildTextureSet } from './textures.js';

export function buildMaterials(lowspec = false) {
  const T = buildTextureSet(lowspec);
  const M = {};

  const std = (tex, opts = {}) => new THREE.MeshStandardMaterial({
    map: tex?.map, normalMap: tex?.normalMap,
    roughnessMap: tex?.roughnessMap,
    roughness: tex?.roughnessMap ? (opts.roughness ?? 1.0) : (opts.roughness ?? 0.9),
    metalness: opts.metalness ?? 0.0,
    color: opts.color ?? 0xffffff,
    normalScale: new THREE.Vector2(opts.normalScale ?? 1, opts.normalScale ?? 1),
    envMapIntensity: opts.envInt ?? 1.0,
    ...opts.extra,
  });

  // ---- 建筑面 ----
  M.wallWhite = std(T.wallWhite, { normalScale: 1.0, envInt: 0.5 });
  M.wallpaper = std(T.wallpaper, { normalScale: 1.1, envInt: 0.45 });
  M.tileLobby = std(T.tileLobby, { normalScale: 0.8, envInt: 1.5 });   // 抛光砖：残余镜面
  M.tileKitchen = std(T.tileKitchen, { normalScale: 1.0, envInt: 1.1 });
  M.carpet = std(T.carpet, { normalScale: 1.2, envInt: 0.25 });
  M.veneer = std(T.veneer, { normalScale: 0.9, envInt: 0.8 });
  M.veneerDark = std(T.veneer, { color: 0x8a8078, normalScale: 0.9, envInt: 0.6 });
  M.ceiling = std(T.ceiling, { normalScale: 0.8, envInt: 0.35 });
  M.tablecloth = std(T.tablecloth, { normalScale: 1.1, envInt: 0.7 });
  M.curtain = std(T.curtain, { normalScale: 1.3, envInt: 0.55, extra: { side: THREE.DoubleSide } });
  M.concrete = std(T.concrete, { normalScale: 1.2, envInt: 0.6 });
  M.facade = std(T.facade, { normalScale: 1.2, envInt: 0.9 });
  M.asphalt = std(T.asphalt, { normalScale: 1.1, envInt: 0.8 });
  M.granite = std(T.granite, { normalScale: 1.3, envInt: 1.0 });

  // ---- 人体 / 制服（员工与 F01） ----
  // 皮肤：中年人的皮，微微出汗的油光——不是尸体，更不是橡胶
  M.skin = std(T.skin, { normalScale: 0.8, envInt: 1.15, roughness: 1.0 });
  M.workwear = std(T.workwear, { normalScale: 1.15, envInt: 0.4 });     // 灰蓝工装
  M.trouser = std(T.trouser, { normalScale: 1.0, envInt: 0.3 });        // 深色化纤裤
  M.shirt = std(T.shirt, { normalScale: 0.9, envInt: 0.45 });           // 泛黄白衬衫
  M.hair = std(T.hair, { normalScale: 0.9, envInt: 0.9, roughness: 1.0 }); // 侧分短发的油光
  M.collar = new THREE.MeshStandardMaterial({ color: 0x571c1e, roughness: 0.82, envMapIntensity: 0.5 }); // 酒店制服的暗红领
  M.shoe = new THREE.MeshStandardMaterial({ color: 0x1c1a18, roughness: 0.5, envMapIntensity: 0.9 });    // 旧皮鞋
  M.eyeDark = new THREE.MeshStandardMaterial({ color: 0x141210, roughness: 0.25, envMapIntensity: 1.6 }); // 6m 外：只是深色的眼
  // 井：向内延伸的湿壁。BackSide——只有凑近往"里"看才存在
  M.wellWall = new THREE.MeshStandardMaterial({
    color: 0x2a2320, roughness: 0.35, metalness: 0.05,
    envMapIntensity: 1.4, side: THREE.BackSide,
  });
  M.wellRing = new THREE.MeshStandardMaterial({
    color: 0x191411, roughness: 0.3, envMapIntensity: 1.5, side: THREE.DoubleSide,
  });
  M.wellDeep = new THREE.MeshBasicMaterial({ color: 0x06090c });        // 井底：吃光的深
  M.wellGlint = new THREE.MeshBasicMaterial({ color: 0x3d5a63 });       // 井底极远处的一线水光

  // ---- 金属 / 玻璃 / 灯 ----
  M.steel = new THREE.MeshStandardMaterial({ color: 0x9aa1a6, roughness: 0.34, metalness: 0.85, envMapIntensity: 1.3 });
  M.steelWorn = new THREE.MeshStandardMaterial({ color: 0x767c80, roughness: 0.55, metalness: 0.7, envMapIntensity: 1.0 });
  M.ironDark = new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.42, metalness: 0.78, envMapIntensity: 1.2 });
  M.brass = new THREE.MeshStandardMaterial({ color: 0xb08d4a, roughness: 0.38, metalness: 0.9, envMapIntensity: 1.4 });
  M.glass = new THREE.MeshPhysicalMaterial({
    color: 0xb9c4c4, roughness: 0.06, metalness: 0, transmission: 0,
    transparent: true, opacity: 0.18, envMapIntensity: 2.0, side: THREE.DoubleSide,
  });
  M.plastic = new THREE.MeshStandardMaterial({ color: 0xd8d2c2, roughness: 0.6, envMapIntensity: 0.7 });
  M.plasticDark = new THREE.MeshStandardMaterial({ color: 0x2c2c2e, roughness: 0.55, envMapIntensity: 0.8 });
  M.fluorescent = new THREE.MeshBasicMaterial({ color: 0xd9e4d6 });      // 日光灯管（亮）
  M.fluorescentDead = new THREE.MeshStandardMaterial({ color: 0x8b9089, roughness: 0.4 }); // 熄灭的灯管
  M.bulbWarm = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });         // 大堂吊灯钨丝色
  M.exitGreen = new THREE.MeshBasicMaterial({ color: 0x3fae62 });        // 安全出口的绿
  M.standby = new THREE.MeshBasicMaterial({ color: 0xc03a2a });          // 电器待机红点

  // ---- 婚宴装饰 ----
  M.doubleXi = new THREE.MeshStandardMaterial({
    map: T.doubleXi, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide,
    roughness: 0.7, emissive: 0x7a1618, emissiveMap: T.doubleXi, emissiveIntensity: 0.22,
  });
  M.banner = new THREE.MeshStandardMaterial({ map: T.banner, roughness: 0.85, side: THREE.DoubleSide });
  M.hotelSign = new THREE.MeshStandardMaterial({
    map: T.hotelSign, emissive: 0xffffff, emissiveMap: T.hotelSign, emissiveIntensity: 0.9,
    roughness: 0.6,
  });
  M.photos = T.photos.map((p) => new THREE.MeshStandardMaterial({ map: p, roughness: 0.4, envMapIntensity: 1.1 }));
  M.notice = new THREE.MeshStandardMaterial({ map: T.notice, roughness: 0.92, side: THREE.DoubleSide });
  M.paper = new THREE.MeshStandardMaterial({ color: 0xcfc8b2, roughness: 0.95, side: THREE.DoubleSide });
  M.paperGlow = new THREE.MeshStandardMaterial({
    color: 0xd8d0b6, roughness: 0.9, side: THREE.DoubleSide,
    emissive: 0x9a8d64, emissiveIntensity: 0.3,
  });

  // ---- 录像监视器 ----
  // 屏幕材质：story 里会把 map 换成 RenderTarget 纹理
  M.crt = new THREE.MeshBasicMaterial({ color: 0x0a0f10 });
  M.crtCase = new THREE.MeshStandardMaterial({ color: 0xb9b2a0, roughness: 0.7, envMapIntensity: 0.5 }); // 米黄机壳

  M.textures = T;
  return M;
}

// —— 假体积光锥：加法混合的软光锥（顶点色渐隐，无需贴图）——
// 光在潮湿的空气里显形——日光灯/吊灯/手电下面拖出一段被雾抓住的光
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

export function makeLightCone(color = 0xd8e2cf, opacity = 0.05, topR = 0.18, botR = 1.6, height = 2.8) {
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
