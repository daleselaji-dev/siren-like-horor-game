// 宴会厅宾客群像（r22）：bpy 轻量坐姿剪影件（guest_a/b/c ≤8k tris/人）替换
// 程序化 Humanoid 球关节——「同一场还地饭的镇民」，不是玩具人偶。
// 烘焙口径与 story.bakeCrowd 相同：全部实例按材质合并（三变体共 ~20 draw call），
// 不进灯光预算、不做动画——背景群像是「席面的一部分」。
// 注意：GLB 走 gltfpack -cc（KHR_mesh_quantization），顶点属性是量化整型且
// 反量化变换烧在节点矩阵里——合并前必须经 getX/getY/getZ 解码成 float32，
// 再乘（实例矩阵 × 节点世界矩阵）；直接 applyMatrix4 会把米制坐标写回 int16 溢出。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import guestAUri from '../assets/models/guest_a.glb?inline';
import guestBUri from '../assets/models/guest_b.glb?inline';
import guestCUri from '../assets/models/guest_c.glb?inline';

const URIS = [guestAUri, guestBUri, guestCUri];

function dataUriToBuffer(uri) {
  const b64 = uri.slice(uri.indexOf(',') + 1);
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8.buffer;
}

let _variantsP = null;
/** 三变体各解析一次：返回 [{ meshes: [{ geo(float32/本地已含节点变换), mat }] }] */
function loadVariants() {
  if (_variantsP) return _variantsP;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  _variantsP = Promise.all(URIS.map((uri) => new Promise((resolve, reject) => {
    loader.parse(dataUriToBuffer(uri), '', (g) => {
      const scene = g.scene;
      scene.updateMatrixWorld(true);
      const meshes = [];
      scene.traverse((o) => {
        if (!o.isMesh) return;
        // 量化属性解码 → float32，并把节点世界矩阵（含反量化）烧进顶点
        const src = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
        const n = src.attributes.position.count;
        const geo = new THREE.BufferGeometry();
        for (const [name, item] of [['position', 3], ['normal', 3], ['uv', 2]]) {
          const a = src.attributes[name];
          const arr = new Float32Array(n * item);
          if (a) {
            for (let i = 0; i < n; i++) {
              arr[i * item] = a.getX(i);
              arr[i * item + 1] = a.getY(i);
              if (item > 2) arr[i * item + 2] = a.getZ(i);
            }
          }
          geo.setAttribute(name, new THREE.BufferAttribute(arr, item));
        }
        geo.applyMatrix4(o.matrixWorld);
        const mat = o.material;
        mat.envMapIntensity = 1.0; // 与英雄件/工位件同口径
        meshes.push({ geo, mat });
      });
      resolve({ meshes });
    }, reject);
  })));
  return _variantsP;
}

/**
 * defs: [{ x, y, z, ry, variant?, s? }]——variant 缺省按序轮换，s 为身量抖动。
 * 返回 Promise<THREE.Group>（merged 网格，userData.guestCount 供 verify 断言）。
 */
export async function bakeGuestCrowd(defs) {
  const variants = await loadVariants();
  const byMat = new Map();
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const eul = new THREE.Euler();
  defs.forEach((d, i) => {
    const v = variants[(d.variant ?? i) % variants.length];
    eul.set(0, d.ry ?? 0, 0);
    q.setFromEuler(eul);
    const s = d.s ?? 1;
    m4.compose(new THREE.Vector3(d.x, d.y, d.z), q, new THREE.Vector3(s, s, s));
    for (const { geo, mat } of v.meshes) {
      const g2 = geo.clone();
      g2.applyMatrix4(m4);
      if (!byMat.has(mat)) byMat.set(mat, []);
      byMat.get(mat).push(g2);
    }
  });
  const grp = new THREE.Group();
  for (const [mat, geos] of byMat) {
    const mg = BufferGeometryUtils.mergeGeometries(geos, false);
    if (!mg) continue;
    const mesh = new THREE.Mesh(mg, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    grp.add(mesh);
  }
  grp.userData.guestCount = defs.length;
  grp.userData.glbGuests = true;
  return grp;
}
