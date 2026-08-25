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
  // 湿发（贴头皮的乱发）
  M.hair = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.55, envMapIntensity: 0.8 });

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
