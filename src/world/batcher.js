// 静态网格合批器：按材质收集几何体，最终每种材质合并成一个 Mesh，控制 draw call
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

const _m4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _euler = new THREE.Euler();

export class Batcher {
  constructor() {
    this.byMaterial = new Map(); // material -> geometry[]
  }

  /**
   * 添加一个几何体实例
   * @param geo BufferGeometry（会被克隆变换，调用方可复用原件）
   * @param material 材质（作为合批 key）
   * @param x,y,z 位置; ry 绕Y旋转; sx,sy,sz 缩放; rx,rz 附加旋转
   */
  add(geo, material, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
    _pos.set(x, y, z);
    _euler.set(rx, ry, rz, 'YXZ');
    _quat.setFromEuler(_euler);
    _scale.set(sx, sy, sz);
    _m4.compose(_pos, _quat, _scale);
    const g = geo.clone().applyMatrix4(_m4);
    // 文字招牌等「整幅贴图」材质保持 0..1 UV，不做世界空间平铺
    if (geo === GEO.box && !material.userData?.fullUV) worldScaleBoxUV(g);
    if (!this.byMaterial.has(material)) this.byMaterial.set(material, []);
    this.byMaterial.get(material).push(g);
  }

  /** 合并并加入场景，返回生成的 Mesh 列表 */
  flush(scene, { castShadow = true, receiveShadow = true } = {}) {
    const meshes = [];
    for (const [mat, geos] of this.byMaterial) {
      if (!geos.length) continue;
      const merged = BufferGeometryUtils.mergeGeometries(geos, false);
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      mesh.matrixAutoUpdate = false;
      scene.add(mesh);
      meshes.push(mesh);
      geos.length = 0;
    }
    this.byMaterial.clear();
    return meshes;
  }
}

// 盒体 UV 世界空间归一：每 2.4m 一个纹理平铺周期，保证纹理密度与几何尺寸无关
const TEXEL_METERS = 2.4;
function worldScaleBoxUV(g) {
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3();
  for (let f = 0; f < 6; f++) {
    const i0 = f * 4;
    vA.fromBufferAttribute(pos, i0);
    vB.fromBufferAttribute(pos, i0 + 1);
    vC.fromBufferAttribute(pos, i0 + 2);
    const lenU = vA.distanceTo(vB) / TEXEL_METERS;
    const lenV = vA.distanceTo(vC) / TEXEL_METERS;
    for (let k = 0; k < 4; k++) {
      uv.setXY(i0 + k, uv.getX(i0 + k) * lenU, uv.getY(i0 + k) * lenV);
    }
  }
}

// 共享基础几何体（模块级复用，避免重复分配）
export const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  cone: new THREE.ConeGeometry(0.5, 1, 10),
  sphere: new THREE.SphereGeometry(0.5, 12, 10),
  plane: new THREE.PlaneGeometry(1, 1),
};
