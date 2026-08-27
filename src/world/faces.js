// 生图烘焙脸皮管线：6 张原创面部漫反射（AI 生成参考照，均匀无影棚光）
// 以「球面方向投影」近似 UV 映射到程序化头模：
//   头模 UV 由顶点方向重算（前脸 u=0.5，接缝藏后脑），照片按五官标定
//   （瞳距/眼线/嘴线）对齐到头模眼嘴的球面角位置——眼睛嘴巴逐像素落位。
// 程序化补法线（照片亮度高频→凹凸）与粗糙度（沿用皮肤油区图）。
// 材质先建（底皮=程序化皮肤贴图），照片异步解码后合成进 Canvas——不阻塞启动。
import * as THREE from 'three';

import urlMYoung from '../assets/faces/face_m_young.webp';
import urlFYoung from '../assets/faces/face_f_young.webp';
import urlMOld from '../assets/faces/face_m_old.webp';
import urlFOld from '../assets/faces/face_f_old.webp';
import urlPale from '../assets/faces/face_staff_pale.webp';
import urlChalk from '../assets/faces/face_chalk.webp';

// ---- 头模标定常量（与 humanoid.js 头部布局一致，均为「相对颅心」坐标）----
// 轮20·纵向标定重排（挤脸根治）：旧 MOUTH_Y=-0.0405 使「眼线→嘴线」只有 38mm，
// 而瞳距 65mm——照片脸投影上头时被竖向压扁 ~1.9 倍：鼻子缩成一截、嘴贴着鼻子、
// 下巴空出一大块、额头显巨（「五官挤在脸中心一小块」的真正元凶）。
// 现按真人人体测量重排：眼线→口裂 ≈66mm（局部 -0.0685）、口裂→颏 ≈35mm——
// 照片竖向压缩降到 ~1.1（肉眼读不出），五官摊满整张脸
// 轮20三稿·横向摊脸：EYE_X 0.0325→0.0384（照片仿射横向系数随之 ×1.149）——
// 照片五官摊满摊宽画布；与 humanoid.js eyeXoff/eyeNX 同一次标定
const EYE_X = 0.0384, EYE_Y = -0.002, EYE_Z = 0.08;   // 眼球中心
const MOUTH_Y = -0.0685, MOUTH_Z = 0.0775;            // 口裂中心
const R0 = 0.098;                                     // 前脸平均半径

// 每张脸的照片标定（画面比例 0..1）：眼线 y / 左右瞳 x / 嘴线 y / 下巴 y
// browY=眉中线 / noseY=鼻底孔线——3D 眉贴片与鼻件按此逐脸落位（消双眉/双鼻影残留）
// hairY=正中发际线 / hairSag=发际线向两鬓下垂量（抛物线，单位=瞳距平方系数）——
// 烘焙时发际以上像素一律 gate 掉：照片头发不再涂到头皮上、与 3D 发壳打成双重发际
// （由人工读图标定；照片要求正面、平光、中性表情）
const FACE_DEFS = {
  m: {
    url: urlMYoung, base: 'skin',
    eyeY: 0.433, eyeLX: 0.397, eyeRX: 0.620, mouthY: 0.708, chinY: 0.862,
    browY: 0.372, noseY: 0.593, hairY: 0.295, hairSag: 0.10,
    mat: { envInt: 0.6, cc: 0.3, ccRough: 0.32, normalScale: 0.85, poreScale: 0.9 },
  },
  f: {
    url: urlFYoung, base: 'skin',
    eyeY: 0.449, eyeLX: 0.400, eyeRX: 0.614, mouthY: 0.711, chinY: 0.845,
    browY: 0.378, noseY: 0.607, hairY: 0.180, hairSag: 0.33,
    mat: { envInt: 0.6, cc: 0.32, ccRough: 0.3, normalScale: 0.75, poreScale: 0.8 },
  },
  oldm: {
    url: urlMOld, base: 'skinOld',
    eyeY: 0.458, eyeLX: 0.386, eyeRX: 0.615, mouthY: 0.748, chinY: 0.878,
    browY: 0.398, noseY: 0.628, hairY: 0.245, hairSag: 0.10,
    mat: { envInt: 0.55, cc: 0.16, ccRough: 0.5, normalScale: 1.15, poreScale: 1.25 },
  },
  oldf: {
    url: urlFOld, base: 'skinOld',
    eyeY: 0.419, eyeLX: 0.388, eyeRX: 0.607, mouthY: 0.678, chinY: 0.792,
    browY: 0.345, noseY: 0.563, hairY: 0.290, hairSag: 0.28,
    mat: { envInt: 0.55, cc: 0.18, ccRough: 0.48, normalScale: 1.1, poreScale: 1.2 },
  },
  pale: {
    url: urlPale, base: 'skin',
    eyeY: 0.400, eyeLX: 0.407, eyeRX: 0.598, mouthY: 0.635, chinY: 0.714,
    browY: 0.352, noseY: 0.545, hairY: 0.295, hairSag: 0.13,
    // 轮17：失血员工脸清漆再减档（0.26→0.16）+ 环反射 0.42——「蜡像壳」高光出局
    mat: { envInt: 0.42, cc: 0.16, ccRough: 0.44, normalScale: 0.9, poreScale: 0.8 },
  },
  chalk: {
    url: urlChalk, base: 'skinOld',
    eyeY: 0.427, eyeLX: 0.400, eyeRX: 0.611, mouthY: 0.700, chinY: 0.812,
    browY: 0.388, noseY: 0.600, hairY: 0.280, hairSag: 0.10,
    mat: { envInt: 0.4, cc: 0.05, ccRough: 0.7, normalScale: 1.25, poreScale: 1.4 },
  },
};

// —— 逐脸五官锚点（相对颅心，米）：把照片的眉线/鼻底线反投影回头模球面 ——
// 3D 眉贴片、鼻件按这个 y 落位，才能和烘焙进皮的照片眉/鼻影重合成一副五官。
const _anchors = {};
export function faceAnchor(key) {
  const D = FACE_DEFS[key];
  if (!D) return null;
  if (_anchors[key]) return _anchors[key];
  const S = 1024;
  const eyeY3 = R0 * (EYE_Y / Math.hypot(EYE_X, EYE_Y, EYE_Z));
  const mouthY3 = R0 * (MOUTH_Y / Math.hypot(MOUTH_Y, MOUTH_Z));
  const sy = ((D.mouthY - D.eyeY) * S) / (eyeY3 - mouthY3);
  const cy = D.eyeY * S + eyeY3 * sy;
  return (_anchors[key] = {
    browY: (cy - D.browY * S) / sy,
    noseY: (cy - D.noseY * S) / sy,
    hairY: (cy - D.hairY * S) / sy, // 正中发际线（头局部米）——发壳前檐按此对位盖住烘焙边界
  });
}

function sstep(a, b, t) {
  t = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** 皮肤背光透光近似：耳缘/鼻翼等薄组织在掠射角泛一层暖红——
 *  注入 rim 项叠在 sheen 之上，且用「已接收的漫射光」门控（黑暗里不自发光）。
 *  clone() 不带走 onBeforeCompile：hdSkinVariant 等克隆处需重新调用本函数。 */
export function applySkinRim(m, k = 0.6) {
  m.userData.rimK = k;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRimK = { value: m.userData.rimK ?? 0.6 };
    sh.fragmentShader = ('uniform float uRimK;\n' + sh.fragmentShader).replace(
      '#include <opaque_fragment>',
      `{
        vec3 rimV = normalize( vViewPosition );
        float rimF = pow( clamp( 1.0 - dot( normal, rimV ), 0.0, 1.0 ), 3.0 );
        float rimLit = clamp( dot( reflectedLight.directDiffuse + reflectedLight.indirectDiffuse, vec3( 1.6 ) ), 0.0, 1.0 );
        outgoingLight += vec3( 0.62, 0.17, 0.11 ) * ( rimF * rimLit * uRimK );
      }
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'skinRim';
  return m;
}

/** 泡发次表面近似（湿客潮尸皮）：泡透的组织把光含在皮下——
 *  宽瓣冷青「肉里光」+ 窄瓣贴体水线（比皮脂高光更硬更细），都受光门控。
 *  活人皮走 applySkinRim 的暖红透光；这层冷的正是「不再是活人」的读法。 */
export function applySoakedSSS(m, k = 0.85) {
  m.userData.soakK = k;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSoakK = { value: m.userData.soakK ?? 0.85 };
    sh.fragmentShader = ('uniform float uSoakK;\n' + sh.fragmentShader).replace(
      '#include <opaque_fragment>',
      `{
        vec3 sV = normalize( vViewPosition );
        float sF = pow( clamp( 1.0 - dot( normal, sV ), 0.0, 1.0 ), 2.0 );
        float sLit = clamp( dot( reflectedLight.directDiffuse + reflectedLight.indirectDiffuse, vec3( 1.7 ) ), 0.0, 1.0 );
        outgoingLight += vec3( 0.10, 0.17, 0.16 ) * ( sF * sLit * uSoakK );
        float wF = pow( sF, 3.5 );
        outgoingLight += vec3( 0.13, 0.155, 0.15 ) * ( wF * sLit * uSoakK );
      }
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'soakSSS';
  return m;
}

/**
 * 同步建立逐脸头皮材质（底皮=程序化皮肤，照片稍后异步烘焙进同一张 Canvas）。
 * M.faceMats[key]   头皮 MeshPhysicalMaterial（漫反射/法线为独立 Canvas）
 * M.faceLids[key]   眼睑/鼻孔用同调材质（纯色，烘焙后取照片肤色均值）
 * M.faceLipMats[key] 唇材质（烘焙后取照片唇色）
 */
export function buildFaceMaterials(M, T, lowspec = false) {
  M.faceMats = {}; M.faceLids = {}; M.faceLipMats = {}; M.faceNecks = {};
  M._faceBake = [];
  // 颈皮调频贴图（按底皮类型缓存）：底皮亮度变化归一化到 ~0.8 均值——
  // 颈从「无频率的纯色塑料面」变成带毛孔明暗的皮（色调仍由材质色承担）
  const neckMaps = {};
  const neckMapFor = (baseKey, img) => {
    if (neckMaps[baseKey]) return neckMaps[baseKey];
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0, 256, 256);
    const id = x.getImageData(0, 0, 256, 256);
    const A = id.data;
    let mean = 0;
    for (let i = 0; i < A.length; i += 16) mean += A[i] * 0.35 + A[i + 1] * 0.5 + A[i + 2] * 0.15;
    mean /= A.length / 16;
    for (let i = 0; i < A.length; i += 4) {
      const l = A[i] * 0.35 + A[i + 1] * 0.5 + A[i + 2] * 0.15;
      const v = Math.max(0, Math.min(255, 205 + (l - mean) * 0.85));
      A[i] = A[i + 1] = A[i + 2] = v;
    }
    x.putImageData(id, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.repeat.set(2, 1);
    return (neckMaps[baseKey] = t);
  };
  for (const [key, D] of Object.entries(FACE_DEFS)) {
    const baseTex = T[D.base] ?? T.skin;
    // 漫反射画布：FULLSPEC 2048（近景可读脸的分辨率上探）/ lowspec 1024；
    // 照片仍是 1024——多出的分辨率给程序层（AO 渐变/统频微粒/发际羽化坡）用
    const S = lowspec ? 1024 : 2048;
    const cd = document.createElement('canvas');
    cd.width = cd.height = S;
    const xd = cd.getContext('2d', { willReadFrequently: true });
    xd.imageSmoothingEnabled = true;
    xd.imageSmoothingQuality = 'high';
    xd.drawImage(baseTex.map.image, 0, 0, S, S);
    const mapTex = new THREE.CanvasTexture(cd);
    mapTex.wrapS = mapTex.wrapT = THREE.RepeatWrapping;
    mapTex.colorSpace = THREE.SRGBColorSpace;
    mapTex.anisotropy = 8;
    mapTex.flipY = false; // 头皮 UV 约定：v=0 在头顶（画布行 0）——与球面投影一致
    // 法线画布：FULLSPEC 1024 / lowspec 768——先铺程序化皮肤法线
    const NS = lowspec ? 768 : 1024;
    const cn = document.createElement('canvas');
    cn.width = cn.height = NS;
    const xn = cn.getContext('2d', { willReadFrequently: true });
    xn.imageSmoothingEnabled = true;
    xn.imageSmoothingQuality = 'high';
    xn.drawImage(baseTex.normalMap.image, 0, 0, NS, NS);
    const nTex = new THREE.CanvasTexture(cn);
    nTex.wrapS = nTex.wrapT = THREE.RepeatWrapping;
    nTex.anisotropy = 8;
    nTex.flipY = false;

    // 皮脂分区粗糙度：底皮油区图上再压出 T 区油光（鼻尖/鼻梁/额心/颧骨/下巴亮，
    // 颊侧颌缘偏哑）——高光不再整脸一层匀「塑料壳」，而是走在皮脂分布上
    const cr = document.createElement('canvas');
    cr.width = cr.height = 512;
    const xr = cr.getContext('2d');
    xr.drawImage(baseTex.roughnessMap.image, 0, 0, 512, 512);
    const oil = (u, v, ru, rv, a) => {
      // 粗糙度图暗=光滑（油亮）：椭圆软斑向下压
      xr.save();
      xr.translate(u * 512, v * 512);
      xr.scale(1, rv / ru);
      const gr = xr.createRadialGradient(0, 0, 0, 0, 0, ru * 512);
      gr.addColorStop(0, `rgba(30,30,30,${a})`);
      gr.addColorStop(1, 'rgba(30,30,30,0)');
      xr.fillStyle = gr;
      xr.fillRect(-ru * 512, -ru * 512, ru * 1024, ru * 1024); // 缩放空间内等边覆盖
      xr.restore();
    };
    // 头皮球面 UV：前脸 u=0.5；v 由极角而来（额≈0.42 / 眼≈0.5 / 鼻底≈0.55 / 口≈0.58）
    const oilK = key === 'chalk' ? 0.3 : key.startsWith('old') ? 0.55 : 1.0; // 干皮油区弱
    oil(0.5, 0.525, 0.045, 0.1, 0.5 * oilK);            // 鼻梁—鼻尖（最油）
    oil(0.5, 0.415, 0.095, 0.055, 0.34 * oilK);         // 额心
    oil(0.385, 0.53, 0.05, 0.038, 0.3 * oilK);          // 颧骨左
    oil(0.615, 0.53, 0.05, 0.038, 0.3 * oilK);          // 颧骨右
    oil(0.5, 0.625, 0.038, 0.03, 0.28 * oilK);          // 下巴
    // 颊侧/颌缘反向提亮（更粗糙偏哑）：油区之外皮面是干的
    for (const [mu, mv] of [[0.32, 0.58], [0.68, 0.58]]) {
      xr.save();
      xr.translate(mu * 512, mv * 512);
      xr.scale(1, 0.055 / 0.07);
      const gm = xr.createRadialGradient(0, 0, 0, 0, 0, 0.07 * 512);
      gm.addColorStop(0, 'rgba(235,235,235,0.22)');
      gm.addColorStop(1, 'rgba(235,235,235,0)');
      xr.fillStyle = gm;
      xr.fillRect(-64, -82, 128, 164);
      xr.restore();
    }
    const rTex = new THREE.CanvasTexture(cr);
    rTex.wrapS = rTex.wrapT = THREE.RepeatWrapping;
    rTex.flipY = false;
    rTex.anisotropy = 8;

    const m = new THREE.MeshPhysicalMaterial({
      map: mapTex, normalMap: nTex, roughnessMap: rTex,
      roughness: 1.0, metalness: 0.0,
      normalScale: new THREE.Vector2(D.mat.normalScale, D.mat.normalScale),
      envMapIntensity: D.mat.envInt,
      clearcoat: D.mat.cc, clearcoatRoughness: D.mat.ccRough,
      // 绒毛边缘光（peach fuzz）：皮面掠射一层软散射——正是塑料没有的那层
      sheen: 0.3, sheenRoughness: 0.55, sheenColor: new THREE.Color(0xffe2d0),
    });
    m.clearcoatNormalMap = T.skinPoreN;
    m.clearcoatNormalScale = new THREE.Vector2(D.mat.poreScale, D.mat.poreScale);
    // 轮20三稿：pale 反照率乘暖暗底（0.95/0.91/0.88）——舞台顶光下中间调不再溢出成
    // 「蜡白扁脸」，眉眼鼻口的对比保得住；只动 pale，常人脸不受影响
    if (key === 'pale') m.color.setHex(0xf2e8e0);
    // 背光透光近似：耳缘/鼻翼掠射角一层暖红叠在 sheen 上（受光门控，暗处不亮）
    applySkinRim(m, key === 'chalk' ? 0.25 : key === 'pale' ? 0.4 : 0.7);
    M.faceMats[key] = m;
    // 眼睑/鼻翼小件：纯色同调（避免小件 UV 乱采照片）+ 毛孔清漆法线（近景不再是光塑料）
    const lidM = applySkinRim(new THREE.MeshPhysicalMaterial({
      color: 0xc9997c, roughness: 0.62, envMapIntensity: D.mat.envInt,
      clearcoat: Math.max(0.18, D.mat.cc * 0.7), clearcoatRoughness: D.mat.ccRough + 0.1,
      sheen: 0.25, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xffe2d0),
    }), key === 'chalk' ? 0.25 : 0.55);
    lidM.clearcoatNormalMap = T.skinPoreN;
    lidM.clearcoatNormalScale = new THREE.Vector2(D.mat.poreScale * 0.8, D.mat.poreScale * 0.8);
    M.faceLids[key] = lidM;
    // 颈裙材质：与脸皮同源取色、只降明度不动色相（烘焙后统一乘暗），
    // 开顶点色给下颌接触阴影用；轮14：挂亮度调频贴图 + 毛孔法线——
    // 颈与脸的微粒频率合流，颌缘不再是「照片皮 vs 塑料皮」的断面
    const neckPoreN = T.skinPoreN.clone();
    neckPoreN.needsUpdate = true;
    neckPoreN.repeat.set(2.6, 1.2);
    M.faceNecks[key] = new THREE.MeshPhysicalMaterial({
      color: 0xa17b63, roughness: 0.74, envMapIntensity: D.mat.envInt * 0.7,
      map: neckMapFor(D.base, baseTex.map.image),
      normalMap: neckPoreN, normalScale: new THREE.Vector2(0.5, 0.5),
      clearcoat: D.mat.cc * 0.4, clearcoatRoughness: D.mat.ccRough + 0.2,
      sheen: 0.22, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xffe2d0),
      vertexColors: true,
    });
    // 唇：湿润高光
    M.faceLipMats[key] = new THREE.MeshPhysicalMaterial({
      color: 0xa66d5f, roughness: 0.44, envMapIntensity: 1.1,
      clearcoat: 0.75, clearcoatRoughness: 0.18,
    });
    M._faceBake.push({ key, D, cd, xd, cn, xn, mapTex, nTex, S, NS });
  }
}

// 轮15：照片权重缓冲（逐脸复用）——主合成循环把每个像素最终的照片权重 w 记下来，
// 色斑合成按 (1-w) 铺进羽化带外的程序底皮区（照片区自己带斑，不再叠双份）
let _wBuf = null, _wBufS = 0;
function weightBuf(S) {
  if (_wBufS !== S) { _wBuf = new Float32Array(S * S); _wBufS = S; }
  else _wBuf.fill(0);
  return _wBuf;
}

// 轮15：照片高频色斑瓦片——从照片的干净皮区（双颊/额心/下巴）取若干小补丁，
// 减去补丁均值得到零均值的彩色残差，余弦窗拼贴进 256 瓦片（环绕连续）。
// 铺满整头皮后，羽化带外的底皮区也带上「这张脸自己的」红斑/色沉频率——
// 照片区与程序区的色度统计终于是同一张皮
function buildMottleTile(P, PS, D, cx, ioPx, mePx) {
  const MT = 256;
  const acc = new Float32Array(MT * MT * 3);
  const wsum = new Float32Array(MT * MT);
  let s = 1237;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  // 干净皮区（照片空间中心点）：双颊 / 额下段（眉上一指）/ 下巴
  const zones = [
    [cx - ioPx * 0.58, D.eyeY * PS + mePx * 0.52],
    [cx + ioPx * 0.58, D.eyeY * PS + mePx * 0.52],
    [cx, (D.browY - 0.045) * PS],
    [cx, D.mouthY * PS + mePx * 0.34],
  ];
  const PR = 30; // 补丁半径（照片 px）
  for (let k = 0; k < 44; k++) {
    const z = zones[k % zones.length];
    const px0 = Math.round(z[0] + (rnd() - 0.5) * ioPx * 0.22);
    const py0 = Math.round(z[1] + (rnd() - 0.5) * mePx * 0.2);
    if (px0 < PR + 1 || px0 > PS - PR - 2 || py0 < PR + 1 || py0 > PS - PR - 2) continue;
    // 补丁均值
    let mr = 0, mg = 0, mb = 0, mn = 0;
    for (let dy = -PR; dy <= PR; dy += 2) {
      for (let dx = -PR; dx <= PR; dx += 2) {
        const i = ((py0 + dy) * PS + (px0 + dx)) * 4;
        mr += P[i]; mg += P[i + 1]; mb += P[i + 2]; mn++;
      }
    }
    mr /= mn; mg /= mn; mb /= mn;
    // 目标落点（瓦片内随机，环绕写入）
    const tx0 = (rnd() * MT) | 0, ty0 = (rnd() * MT) | 0;
    for (let dy = -PR; dy <= PR; dy++) {
      for (let dx = -PR; dx <= PR; dx++) {
        const rr = Math.hypot(dx, dy) / PR;
        if (rr >= 1) continue;
        const w = 0.5 + 0.5 * Math.cos(rr * Math.PI); // 余弦窗
        const i = ((py0 + dy) * PS + (px0 + dx)) * 4;
        const ti = (((ty0 + dy + MT) % MT) * MT + ((tx0 + dx + MT) % MT)) * 3;
        acc[ti] += (P[i] - mr) * w;
        acc[ti + 1] += (P[i + 1] - mg) * w;
        acc[ti + 2] += (P[i + 2] - mb) * w;
        wsum[ti / 3] += w;
      }
    }
  }
  for (let i = 0; i < MT * MT; i++) {
    const w = Math.max(0.35, wsum[i]);
    acc[i * 3] /= w; acc[i * 3 + 1] /= w; acc[i * 3 + 2] /= w;
  }
  return acc; // 零均值 RGB 残差，256×256
}

// 统频微粒瓦片：128 细粒亮度噪声（均值 128）——以 overlay 混合铺满整头皮，
// 照片区与程序底皮区的微粒频率在同一层噪声里合流（「面具边界」的频率差根治）
let _grainPat = null;
function grainPattern(ctx2d) {
  if (_grainPat) return ctx2d.createPattern(_grainPat, 'repeat');
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const id = x.createImageData(128, 128);
  const A = id.data;
  let s = 911;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 128 * 128; i++) {
    const v = 128 + (rnd() - 0.5) * 46 + (rnd() - 0.5) * 22;
    A[i * 4] = A[i * 4 + 1] = A[i * 4 + 2] = v;
    A[i * 4 + 3] = 255;
  }
  x.putImageData(id, 0, 0);
  // 稀疏毛孔点：略暗的小凹，密度与皮肤毛孔同量级
  x.fillStyle = 'rgba(96,96,96,0.5)';
  for (let i = 0; i < 210; i++) {
    const r = 0.5 + rnd() * 0.9;
    x.beginPath();
    x.arc(rnd() * 128, rnd() * 128, r, 0, Math.PI * 2);
    x.fill();
  }
  _grainPat = c;
  return ctx2d.createPattern(c, 'repeat');
}

/** 异步：解码照片并烘焙进头皮 Canvas（漫反射合成 + 法线高频 + 睑/唇取色） */
export function bakeFaces(M) {
  if (!M._faceBake) return Promise.resolve();
  return Promise.all(M._faceBake.map((job) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try { compositeFace(M, job, img); } catch (e) { console.warn('face bake fail', job.key, e); }
      resolve();
    };
    img.onerror = () => resolve();
    img.src = job.D.url;
  }))).then(() => { M.facesReady = true; });
}

function compositeFace(M, job, img) {
  const { key, D, xd, xn, mapTex, nTex } = job;
  const S = job.S ?? 1024;   // 头皮画布分辨率（FULLSPEC 2048）
  const PS = 1024;           // 照片标定空间（照片素材 1024，标定值按此空间读图得出）
  const SC = S / 1024;       // 画布空间缩放（AO 椭圆等画布作图用）
  // 照片像素
  const cp = document.createElement('canvas');
  cp.width = cp.height = PS;
  const xp = cp.getContext('2d', { willReadFrequently: true });
  xp.drawImage(img, 0, 0, PS, PS);
  const P = xp.getImageData(0, 0, PS, PS).data;

  // —— 轮16·去光照缓冲：照片低频亮度（128 网格 + 双线性）——
  // 照片从此只当「肤色/毛孔/五官色彩参考」：影棚光形体明暗（鼻影/眶影/颊侧渐变）
  // 属于低频，除掉；毛孔红斑属于高频，保住。形体明暗交还给真几何+实时光。
  const BLW = 128;
  const cbl = document.createElement('canvas');
  cbl.width = cbl.height = BLW;
  const xbl = cbl.getContext('2d', { willReadFrequently: true });
  xbl.drawImage(cp, 0, 0, BLW, BLW);
  const BLD = xbl.getImageData(0, 0, BLW, BLW).data;
  const blurLum = (px, py) => {
    const fx = Math.min(BLW - 1.001, Math.max(0, (px / PS) * BLW - 0.5));
    const fy = Math.min(BLW - 1.001, Math.max(0, (py / PS) * BLW - 0.5));
    const xi = fx | 0, yi = fy | 0, xf = fx - xi, yf = fy - yi;
    const q = (xx, yy) => { const i = (yy * BLW + xx) * 4; return BLD[i] * 0.35 + BLD[i + 1] * 0.5 + BLD[i + 2] * 0.15; };
    return (q(xi, yi) * (1 - xf) + q(xi + 1, yi) * xf) * (1 - yf)
      + (q(xi, yi + 1) * (1 - xf) + q(xi + 1, yi + 1) * xf) * yf;
  };

  // ---- 标定：世界(头局部) → 照片像素 仿射 ----
  const eyeLen = Math.hypot(EYE_X, EYE_Y, EYE_Z);
  const thetaE = Math.acos(EYE_Y / eyeLen);
  const phiE = Math.atan2(EYE_X, EYE_Z);
  const eyeX3 = R0 * Math.sin(phiE) * Math.sin(thetaE); // 眼在球面近似上的 x
  const eyeY3 = R0 * Math.cos(thetaE);
  const mouthLen = Math.hypot(MOUTH_Y, MOUTH_Z);
  const thetaM = Math.acos(MOUTH_Y / mouthLen);
  const mouthY3 = R0 * Math.cos(thetaM);
  const sx = ((D.eyeRX - D.eyeLX) * PS) / (2 * eyeX3);          // 照片px / 世界米（横）
  const sy = ((D.mouthY - D.eyeY) * PS) / (eyeY3 - mouthY3);    // 照片px / 世界米（纵）
  const cx = ((D.eyeLX + D.eyeRX) / 2) * PS;
  const cy = D.eyeY * PS + eyeY3 * sy;

  // 椭圆蒙版（照片空间）：把照片的灰背景/衣领挡在外面
  // eax 贴脸缘（脸半宽≈瞳距），配合背景色门控双保险——灰背景一点不许上脸颊
  // 羽化圈外扩（1.1→1.18）：脸盖边界推出到太阳穴/颊侧转折之外，
  // 断层线不再落在脸颊正侧面的受光带上
  const ioPx = (D.eyeRX - D.eyeLX) * PS;
  const mePx = (D.mouthY - D.eyeY) * PS;
  const ecx = cx, ecy = D.eyeY * PS + mePx * 0.5;
  const eax = ioPx * 1.18, eay = mePx * 2.12;
  const chinPy = D.chinY * PS;
  // 眼裂蒙版（照片空间）：照片自带的眼球/睫毛不许烘进头皮——
  // 烘进去的「照片眼」垫在 3D 湿眼球后面，照片虹膜+烘焙 AO+3D 睫毛三层叠成黑窟窿；
  // 眼裂内退回调色底皮当「闭合睑面」，眼睛由 3D 眼球/眼睑/睫毛独立承担
  const eyeHole = (spx2, spy2) => {
    const dyE = (spy2 - D.eyeY * PS) / (ioPx * 0.115);
    const dxl = (spx2 - D.eyeLX * PS) / (ioPx * 0.185);
    const dxr = (spx2 - D.eyeRX * PS) / (ioPx * 0.185);
    const rl = Math.hypot(dxl, dyE), rr = Math.hypot(dxr, dyE);
    return 1 - sstep(0.62, 1.0, Math.min(rl, rr));
  };
  // 发际线 gate（照片空间）：正中 hairY、向两鬓按抛物线下垂——
  // 发际线及以上的照片头发一个像素都不许烘到头皮上（双重发际涂鸦的根治）。
  // 羽化带整个落在发际线以下（向皮肤渐入 ~4% 画幅）：底皮→照片的过渡是坡不是坎
  const hairGate = (spx, spy) => {
    const dxn = (spx - cx) / ioPx;
    const gy = (D.hairY + D.hairSag * dxn * dxn) * PS;
    // 轮20：羽化带加宽（0.042→0.058）——纵向重排放大了照片，发际过渡按比例放软
    return sstep(gy - PS * 0.002, gy + PS * 0.058, spy);
  };

  // 颊部取色（肤色均值→睑色/底皮色调匹配）
  const sampleAvg = (x0, y0, r) => {
    let sr = 0, sg = 0, sb = 0, n = 0;
    for (let dy = -r; dy <= r; dy += 3) {
      for (let dx = -r; dx <= r; dx += 3) {
        const i = ((y0 + dy) * PS + (x0 + dx)) * 4;
        sr += P[i]; sg += P[i + 1]; sb += P[i + 2]; n++;
      }
    }
    return [sr / n, sg / n, sb / n];
  };
  const cheekL = sampleAvg(Math.round(cx - ioPx * 0.62), Math.round(D.eyeY * PS + mePx * 0.55), 12);
  const cheekR = sampleAvg(Math.round(cx + ioPx * 0.62), Math.round(D.eyeY * PS + mePx * 0.55), 12);
  const skinAvg = [(cheekL[0] + cheekR[0]) / 2, (cheekL[1] + cheekR[1]) / 2, (cheekL[2] + cheekR[2]) / 2];
  const lipAvg = sampleAvg(Math.round(cx), Math.round(D.mouthY * PS - mePx * 0.03), 6);
  // 影棚背景取色（左右上角）：投影时凡颜色贴近背景的像素一律拒之脸外
  const bgTL = sampleAvg(Math.round(PS * 0.05), Math.round(PS * 0.06), 9);
  const bgTR = sampleAvg(Math.round(PS * 0.94), Math.round(PS * 0.06), 9);
  const bgGate = (pr, pg, pb) => {
    const dl = Math.abs(pr - bgTL[0]) + Math.abs(pg - bgTL[1]) + Math.abs(pb - bgTL[2]);
    const dr = Math.abs(pr - bgTR[0]) + Math.abs(pg - bgTR[1]) + Math.abs(pb - bgTR[2]);
    return sstep(16, 46, Math.min(dl, dr));
  };
  // 碎发亮度 gate（眉线以上的额区）：横过额头的散落发丝远暗于肤色——
  // 抛物线 gate 之下漏网的那几笔（老年脸的额前灰发）按亮度整根拒收
  const skinLum = skinAvg[0] * 0.35 + skinAvg[1] * 0.5 + skinAvg[2] * 0.15;
  const browGateY = (D.browY - 0.012) * PS;
  const strandGate = (spy, pr, pg, pb) =>
    spy >= browGateY ? 1 : sstep(0.42, 0.6, (pr * 0.35 + pg * 0.5 + pb * 0.15) / skinLum);

  // 睑/唇材质取色（略压暗睑色——上睑总在阴影里）
  // 照片像素是 sRGB——setRGB 必须声明色彩空间，否则被当线性值放亮（颈白脸黄的元凶）
  M.faceLids[key].color.setRGB(skinAvg[0] / 255 * 0.92, skinAvg[1] / 255 * 0.9, skinAvg[2] / 255 * 0.9, THREE.SRGBColorSpace);
  M.faceLipMats[key].color.setRGB(lipAvg[0] / 255, lipAvg[1] / 255, lipAvg[2] / 255, THREE.SRGBColorSpace);
  // 颈与脸皮同源：同一份颊部取色、RGB 同乘——只降明度不动色相
  //（颌下变暗交给顶点色 smoothstep 接触影；0.96 = 0.88 补偿颈皮调频贴图
  //  的 ~0.80 均值，总亮度与轮10 标定持平）
  M.faceNecks[key].color.setRGB(skinAvg[0] / 255 * 0.96, skinAvg[1] / 255 * 0.96, skinAvg[2] / 255 * 0.96, THREE.SRGBColorSpace);

  // 底皮均值（色调匹配：底皮乘到照片肤色）
  const base = xd.getImageData(0, 0, S, S);
  const B = base.data;
  let br = 0, bg = 0, bb = 0, bn = 0;
  for (let i = 0; i < B.length; i += 64) { br += B[i]; bg += B[i + 1]; bb += B[i + 2]; bn++; }
  br /= bn; bg /= bn; bb /= bn;
  const tint = [
    Math.min(1.9, Math.max(0.45, skinAvg[0] / br)),
    Math.min(1.9, Math.max(0.45, skinAvg[1] / bg)),
    Math.min(1.9, Math.max(0.45, skinAvg[2] / bb)),
  ];

  // ---- 逐像素合成：整张底皮调色 + 前脸照片球面投影 ----
  const TWO_PI = Math.PI * 2;
  const WB = weightBuf(S); // 轮15：记录逐像素照片权重，色斑合成按 (1-w) 铺
  for (let py2 = 0; py2 < S; py2++) {
    const v = (py2 + 0.5) / S;
    const theta = v * Math.PI;
    const st = Math.sin(theta), ct = Math.cos(theta);
    // 轮15·同色烘焙：下颌以下的头皮带（v>0.80）向颈皮有效色收敛——
    // 颈材质= skinAvg×0.96 色 × 调频贴图均值 ~0.80 ≈ 头皮的 0.775 倍亮度；
    // 头模底缘剪影两侧（头皮带 vs 颌裙环）从此是同一档明度，暗脊无处可立
    const neckQ = 1 - sstep(0.80, 0.94, v) * 0.225;
    for (let px2 = 0; px2 < S; px2++) {
      const i4 = (py2 * S + px2) * 4;
      // 底皮调色到照片肤色
      let r = B[i4] * tint[0], g = B[i4 + 1] * tint[1], b = B[i4 + 2] * tint[2];
      const u = (px2 + 0.5) / S;
      const phi = (u - 0.5) * TWO_PI;
      const dz = Math.cos(phi) * st;
      if (dz > 0.06) {
        const x3 = R0 * Math.sin(phi) * st;
        const y3 = R0 * ct;
        const spx = cx + x3 * sx;
        const spy = cy - y3 * sy;
        if (spx > 1 && spx < PS - 2 && spy > 1 && spy < PS - 2) {
          const frontW = sstep(0.14, 0.48, dz);
          const gate = hairGate(spx, spy);
          // 发际以上的头皮压暗一档（发根阴影）：发壳羽化边下露出的头皮不是亮粉的秃皮
          const rootDk = 1 - (1 - gate) * 0.18 * frontW;
          r *= rootDk; g *= rootDk; b *= rootDk;
          // 权重：朝前 × 椭圆 × 下巴截止 × 发际线 gate
          // 羽化带展宽三倍（0.72-0.98 → 0.52-1.0）：底皮→照片是长坡不是窄圈陡坎
          let w = frontW;
          const rex = (spx - ecx) / eax, rey = (spy - ecy) / eay;
          const err = Math.sqrt(rex * rex + rey * rey);
          w *= 1 - sstep(0.52, 1.0, err);
          w *= 1 - sstep(chinPy - 8, chinPy + 22, spy);
          w *= gate;
          w *= 1 - eyeHole(spx, spy);
          if (w > 0.003) {
            // 双线性采样照片
            const xi = spx | 0, yi = spy | 0, xf = spx - xi, yf = spy - yi;
            const p00 = (yi * PS + xi) * 4, p10 = p00 + 4, p01 = p00 + PS * 4, p11 = p01 + 4;
            let pr = (P[p00] * (1 - xf) + P[p10] * xf) * (1 - yf) + (P[p01] * (1 - xf) + P[p11] * xf) * yf;
            let pg = (P[p00 + 1] * (1 - xf) + P[p10 + 1] * xf) * (1 - yf) + (P[p01 + 1] * (1 - xf) + P[p11 + 1] * xf) * yf;
            let pb = (P[p00 + 2] * (1 - xf) + P[p10 + 2] * xf) * (1 - yf) + (P[p01 + 2] * (1 - xf) + P[p11 + 2] * xf) * yf;
            w *= bgGate(pr, pg, pb); // 背景色（灰墙/衣领）拒绝上皮
            w *= strandGate(spy, pr, pg, pb); // 额区散落发丝拒绝上皮
            // —— 轮16·去光照：像素亮度除以低频亮度、乘回肤色基准——
            // 照片自带的鼻侧影/眶影/影棚渐变被清空（真几何鼻自己会投影子），
            // 鼻区最强去光（双鼻影根治）；眉块/唇块是「五官色彩」，保住不抹平
            const bl = blurLum(spx, spy);
            if (bl > 12) {
              const nzx = (spx - cx) / (ioPx * 0.4), nzy = (spy - D.noseY * PS) / (mePx * 0.62);
              let kf = 0.55 + 0.38 * Math.exp(-(nzx * nzx + nzy * nzy * 0.8));
              const dBrow = (spy - D.browY * PS) / (mePx * 0.22);
              kf *= 1 - 0.62 * Math.exp(-dBrow * dBrow);
              const mlx = (spx - cx) / (ioPx * 0.42), mly = (spy - D.mouthY * PS) / (mePx * 0.3);
              kf *= 1 - 0.55 * Math.exp(-(mlx * mlx + mly * mly));
              const fDel = Math.min(1.75, Math.max(0.55, 1 + (skinLum / bl - 1) * kf));
              pr *= fDel; pg *= fDel; pb *= fDel;
            }
            // 照片肤色→底皮色彩迁移（脸盖消融的另一半）：羽化带内色度收敛到调色底皮，
            // 明度差也随迁移收敛 75%（照片脸缘的摄影亮斑正是「面具」最亮的一圈）——
            // 边界两侧的色与光已在坡上合流，太阳穴/颊侧不再有面具切线
            const mig = sstep(0.34, 0.82, err);
            if (mig > 0.01) {
              const pl0 = Math.min(1.7, Math.max(0.3, (pr * 0.35 + pg * 0.5 + pb * 0.15) / Math.max(1, skinLum)));
              const pl = 1 + (pl0 - 1) * (1 - mig * 0.75);
              pr += (r * pl - pr) * mig;
              pg += (g * pl - pg) * mig;
              pb += (b * pl - pb) * mig;
            }
            r += (pr - r) * w; g += (pg - g) * w; b += (pb - b) * w;
            WB[py2 * S + px2] = w;
          }
        }
      }
      B[i4] = r * neckQ; B[i4 + 1] = g * neckQ; B[i4 + 2] = b * neckQ;
    }
  }
  // ---- 轮15·照片高频色斑合成铺满整头皮 ----
  // 瓦片来自这张照片自己的皮（零均值彩色残差）；羽化带外全强度、
  // 照片区按权重递减到 15%——底皮区不再是「调过色的均匀皮」，
  // 而是带着同一张脸的红斑/色沉频率（面具边界最后一味统计差的根治）
  {
    const MTILE = buildMottleTile(P, PS, D, cx, ioPx, mePx);
    const MT = 256;
    const mk = 0.5; // 残差强度
    for (let py2 = 0; py2 < S; py2++) {
      const ty = ((py2 * 0.5) | 0) % MT;
      for (let px2 = 0; px2 < S; px2++) {
        const tx = ((px2 * 0.5) | 0) % MT;
        const ti = (ty * MT + tx) * 3;
        const g2 = mk * (1 - WB[py2 * S + px2] * 0.85);
        if (g2 < 0.02) continue;
        const i4 = (py2 * S + px2) * 4;
        B[i4] = Math.max(0, Math.min(255, B[i4] + MTILE[ti] * g2));
        B[i4 + 1] = Math.max(0, Math.min(255, B[i4 + 1] + MTILE[ti + 1] * g2));
        B[i4 + 2] = Math.max(0, Math.min(255, B[i4 + 2] + MTILE[ti + 2] * g2));
      }
    }
  }
  xd.putImageData(base, 0, 0);

  // ---- 眼周 AO 烘焙：眼窝-眼睑接触阴影层次（multiply 压进漫反射）----
  // 眼球/眼睑是独立网格，实时光照给不出接触阴影——把五层软影直接烘进头皮：
  // 眶缘软影 → 上睑褶皱带 → 内眦深影 → 下睑接触影 → 眉弓下投影，由大到小、由浅到深。
  // 眼睛因此「嵌」进眼眶：眶内是一个有层次的暗腔，不是平皮上摆两颗球
  {
    const eyeLen2 = Math.hypot(EYE_X, EYE_Y, EYE_Z);
    const phiE2 = Math.atan2(EYE_X, EYE_Z);
    const evy = (Math.acos(EYE_Y / eyeLen2) / Math.PI) * S;
    const aoK = key === 'chalk' ? 0.7 : key === 'pale' ? 0.85 : 1;
    xd.globalCompositeOperation = 'multiply';
    const soft = (px3, py3, rx3, ry3, a) => {
      xd.save();
      xd.translate(px3, py3);
      xd.scale(1, ry3 / rx3);
      const gr2 = xd.createRadialGradient(0, 0, 0, 0, 0, rx3);
      gr2.addColorStop(0, `rgba(118,86,72,${(a * aoK).toFixed(3)})`);
      gr2.addColorStop(0.6, `rgba(126,94,80,${(a * aoK * 0.5).toFixed(3)})`);
      gr2.addColorStop(1, 'rgba(126,94,80,0)');
      xd.fillStyle = gr2;
      xd.fillRect(-rx3, -rx3, rx3 * 2, rx3 * 2);
      xd.restore();
    };
    for (const sgn of [-1, 1]) {
      const ex2 = (0.5 + sgn * phiE2 / TWO_PI) * S; // 左右眼画布列
      const sideIn = -sgn;                          // 内眦朝画布中线
      soft(ex2, evy - 4 * SC, 56 * SC, 42 * SC, 0.2);                // 眶缘软影（整窝一层浅）
      soft(ex2, evy - 13 * SC, 42 * SC, 12 * SC, 0.27);              // 上睑褶皱带（最深的一道）
      soft(ex2 + sideIn * 24 * SC, evy + 2 * SC, 14 * SC, 11 * SC, 0.36); // 内眦深影
      soft(ex2, evy + 13 * SC, 36 * SC, 9 * SC, 0.18);               // 下睑接触影
      soft(ex2, evy - 24 * SC, 46 * SC, 12 * SC, 0.14);              // 眉弓下投影
    }
    xd.globalCompositeOperation = 'source-over';
  }
  // ---- 轮16·鼻几何注册烘焙：去光照清掉了照片自带鼻影——孔腔/翼沟的「暗」是
  // 洞穴光学，必须补回在真几何鼻孔的 UV 准确位上（几何鼻底已对齐照片鼻影线，
  // noseDyFor 保证两者逐点重合；这里的暗斑与鼻孔凹腔是同一坐标系）----
  {
    const noseY3 = (cy - D.noseY * PS) / sy; // 照片鼻底线（头局部米）
    const pxmX = S / (TWO_PI * R0), pxmY = S / (Math.PI * R0);
    const uvPt = (x3m, y3m) => {
      const ct2 = Math.max(-0.999, Math.min(0.999, y3m / R0));
      const th2 = Math.acos(ct2), st2 = Math.sin(th2);
      const sp2 = Math.max(-0.999, Math.min(0.999, x3m / (R0 * st2)));
      return [(0.5 + Math.asin(sp2) / TWO_PI) * S, (th2 / Math.PI) * S];
    };
    xd.globalCompositeOperation = 'multiply';
    const dark = (x3m, y3m, rxm, rym, a, rgb = '58,34,26') => {
      const [X, Y] = uvPt(x3m, y3m);
      const rx3 = rxm * pxmX, ry3 = rym * pxmY;
      xd.save();
      xd.translate(X, Y);
      xd.scale(1, ry3 / rx3);
      const gr2 = xd.createRadialGradient(0, 0, 0, 0, 0, rx3);
      gr2.addColorStop(0, `rgba(${rgb},${a.toFixed(3)})`);
      gr2.addColorStop(0.55, `rgba(${rgb},${(a * 0.45).toFixed(3)})`);
      gr2.addColorStop(1, `rgba(${rgb},0)`);
      xd.fillStyle = gr2;
      xd.fillRect(-rx3, -rx3, rx3 * 2, rx3 * 2);
      xd.restore();
    };
    for (const s2 of [-1, 1]) {
      dark(s2 * 0.0074, noseY3 + 0.0016, 0.0044, 0.0032, 0.5);  // 鼻孔腔暗
      dark(s2 * 0.0128, noseY3 + 0.003, 0.0034, 0.0048, 0.24);  // 鼻翼沟
    }
    dark(0, noseY3 - 0.003, 0.011, 0.0042, 0.15);               // 鼻底投影（软）
    xd.globalCompositeOperation = 'source-over';
  }
  // ---- 统频微粒：overlay 一层毛孔尺度的亮度噪声铺满整头皮 ----
  // 照片区（摄影平滑）与程序底皮区（过采样后偏软）在同一层微粒里合流——
  // 近景里「贴上去的照片脸」与周边皮面不再隔着一圈频率断层（面具感的最后一味根治）
  {
    xd.globalCompositeOperation = 'overlay';
    xd.globalAlpha = 0.42;
    xd.fillStyle = grainPattern(xd);
    xd.fillRect(0, 0, S, S);
    xd.globalAlpha = 1;
    xd.globalCompositeOperation = 'source-over';
  }
  mapTex.needsUpdate = true;

  // ---- 程序化补法线：照片亮度高频 → 前脸凹凸（皱纹/毛孔/唇纹跟着照片走）----
  const NS = job.NS ?? 768; // FULLSPEC 1024 / lowspec 768
  const nd = xn.getImageData(0, 0, NS, NS);
  const N = nd.data;
  // 亮度采样（照片空间 PS，含 5px 邻域模糊的高频提取）
  const lum = (x, y) => {
    const i = ((y | 0) * PS + (x | 0)) * 4;
    return P[i] * 0.35 + P[i + 1] * 0.5 + P[i + 2] * 0.15;
  };
  const hp = (x, y) => {
    const c = lum(x, y);
    const bl = (lum(x - 5, y) + lum(x + 5, y) + lum(x, y - 5) + lum(x, y + 5)) * 0.25;
    return c - bl;
  };
  const kN = 2.0; // 高频强度
  for (let py2 = 1; py2 < NS - 1; py2++) {
    const v = (py2 + 0.5) / NS;
    const theta = v * Math.PI;
    const st = Math.sin(theta), ct = Math.cos(theta);
    for (let px2 = 1; px2 < NS - 1; px2++) {
      const u = (px2 + 0.5) / NS;
      const phi = (u - 0.5) * TWO_PI;
      const dz = Math.cos(phi) * st;
      if (dz <= 0.12) continue;
      const x3 = R0 * Math.sin(phi) * st, y3 = R0 * ct;
      const spx = cx + x3 * sx, spy = cy - y3 * sy;
      if (spx < 8 || spx > PS - 9 || spy < 8 || spy > PS - 9) continue;
      let w = sstep(0.18, 0.5, dz);
      const rex = (spx - ecx) / eax, rey = (spy - ecy) / eay;
      w *= 1 - sstep(0.52, 0.95, Math.sqrt(rex * rex + rey * rey)); // 与漫反射同宽的羽化坡
      w *= 1 - sstep(chinPy - 10, chinPy + 16, spy);
      w *= hairGate(spx, spy); // 发际以上的照片头发假法线一并拒绝
      w *= 1 - eyeHole(spx, spy); // 照片眼球边缘的假法线一并拒绝
      if (w < 0.01) continue;
      const bi = ((spy | 0) * PS + (spx | 0)) * 4;
      w *= bgGate(P[bi], P[bi + 1], P[bi + 2]); // 背景边界的假法线一并拒绝
      w *= strandGate(spy, P[bi], P[bi + 1], P[bi + 2]); // 额区发丝假法线一并拒绝
      if (w < 0.01) continue;
      // 高频亮度差分 → 法线扰动（暗=凹：皱纹沟、唇纹、毛孔）
      const gx = (hp(spx + 2, spy) - hp(spx - 2, spy)) * kN * w;
      const gy = (hp(spx, spy + 2) - hp(spx, spy - 2)) * kN * w;
      const i4 = (py2 * NS + px2) * 4;
      N[i4] = Math.max(0, Math.min(255, N[i4] - gx));
      N[i4 + 1] = Math.max(0, Math.min(255, N[i4 + 1] - gy));
    }
  }
  xn.putImageData(nd, 0, 0);
  nTex.needsUpdate = true;
}
