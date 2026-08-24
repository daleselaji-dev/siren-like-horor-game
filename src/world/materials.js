// 材质库：基于程序化贴图的 PBR(MeshStandardMaterial) 材质
import * as THREE from 'three';
import { buildTextureSet } from './textures.js';

export function buildMaterials() {
  const T = buildTextureSet();
  const M = {};

  const std = (tex, opts = {}) => new THREE.MeshStandardMaterial({
    map: tex?.map, normalMap: tex?.normalMap,
    roughness: opts.roughness ?? 0.9,
    metalness: opts.metalness ?? 0.0,
    color: opts.color ?? 0xffffff,
    normalScale: new THREE.Vector2(opts.normalScale ?? 1, opts.normalScale ?? 1),
    ...opts.extra,
  });

  M.wood = std(T.wood, { roughness: 0.82, normalScale: 1.2 });
  M.woodDark = std(T.wood, { roughness: 0.85, color: 0x9a9a9a, normalScale: 1.2 });
  M.stone = std(T.stone, { roughness: 0.72, normalScale: 1.4 });
  M.plaster = std(T.plaster, { roughness: 0.92 });
  M.roof = std(T.roof, { roughness: 0.68, normalScale: 1.5 });
  M.sand = std(T.sand, { roughness: 0.94 });
  M.slab = std(T.slab, { roughness: 0.62, normalScale: 1.3 });
  M.salt = std(T.salt, { roughness: 0.55 });
  M.rock = std(T.rock, { roughness: 0.68, normalScale: 1.8 });

  M.corpseSkin = std(T.corpseSkin, { roughness: 0.55, normalScale: 0.8 });
  M.clothNavy = std(T.clothNavy, { roughness: 0.95 });
  M.clothGrey = std(T.clothGrey, { roughness: 0.95 });
  M.clothRed = std(T.clothRed, { roughness: 0.9 });

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

  M.ironDark = new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.45, metalness: 0.75 });
  M.candleFlame = new THREE.MeshBasicMaterial({ color: 0xffc266 });
  M.eyeGlow = new THREE.MeshBasicMaterial({ color: 0x9fd8e8 });
  M.paper = new THREE.MeshStandardMaterial({ color: 0xcfc4a4, roughness: 0.95, side: THREE.DoubleSide });
  M.paperGlow = new THREE.MeshStandardMaterial({
    color: 0xd8ccaa, roughness: 0.9, side: THREE.DoubleSide,
    emissive: 0xa8945e, emissiveIntensity: 0.35,
  });

  M.textures = T;
  return M;
}
