// 海面 v2：滚动双层法线 + 顶点微波 + 近岸浅水变色 + 岸线白沫（跟随潮位）
// + 血潮变色/水位上涨 + 血潮后海平线上的灯笼串（它的鳞，随歌一明一灭）
import * as THREE from 'three';

export class Ocean {
  constructor(scene, textures, world) {
    this.level = 0;          // 当前海平面
    this.targetLevel = 0;
    this.blood = 0;          // 0 正常 → 1 血潮
    this.time = 0;

    const geo = new THREE.PlaneGeometry(720, 720, 110, 110);
    geo.rotateX(-Math.PI / 2);

    // 每个顶点记录脚下地形高（供 shader 算水深 → 浅水色/白沫线）
    {
      const pos = geo.attributes.position;
      const shore = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) {
        shore[i] = world ? world.heightAt(pos.getX(i), pos.getZ(i)) : -3;
      }
      geo.setAttribute('aShore', new THREE.BufferAttribute(shore, 1));
    }

    const normalMap = textures.waterNormal;
    normalMap.repeat.set(24, 24);

    this.uniforms = {
      uTime: { value: 0 },
      uBlood: { value: 0 },
      uMeshY: { value: 0 },
    };

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x1c2f30),
      normalMap,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughness: 0.14,
      metalness: 0.6,
      transparent: false,
    });

    // 注入顶点微波 + 随时间滚动法线（第二层反向）+ 浪尖白沫 + 近岸白沫/浅水 + 血潮微光
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.uniforms.uTime;
      shader.uniforms.uBlood = this.uniforms.uBlood;
      shader.uniforms.uMeshY = this.uniforms.uMeshY;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          uniform float uTime;
          uniform float uBlood;
          uniform float uMeshY;
          attribute float aShore;
          varying float vWave;
          varying float vShoreD;`)
        .replace('#include <begin_vertex>', `
          #include <begin_vertex>
          float chop = 1.0 + uBlood * 0.9;      // 返潮后浪更躁
          float wa = sin(position.x * 0.11 + uTime * 0.9) * 0.14 * chop
                   + cos(position.z * 0.13 + uTime * 0.7) * 0.12 * chop
                   + sin((position.x + position.z) * 0.05 + uTime * 0.45) * 0.2
                   + sin(position.x * 0.31 - uTime * 1.7) * 0.045 * chop;
          // 近岸浪收小（水浅打不起来）
          float shoreDepth = uMeshY - aShore;
          wa *= clamp(shoreDepth * 0.7 + 0.25, 0.15, 1.0);
          transformed.y += wa;
          vWave = wa;
          vShoreD = shoreDepth;
        `);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uTime;
          uniform float uBlood;
          varying float vWave;
          varying float vShoreD;`)
        .replace('#include <normal_fragment_maps>', `
          // 双层滚动法线
          vec3 mapN1 = texture2D( normalMap, vNormalMapUv + vec2(uTime*0.008, uTime*0.011) ).xyz * 2.0 - 1.0;
          vec3 mapN2 = texture2D( normalMap, vNormalMapUv * 1.7 - vec2(uTime*0.013, uTime*0.007) ).xyz * 2.0 - 1.0;
          vec3 mapN = normalize(mapN1 + mapN2 * 0.7);
          mapN.xy *= normalScale;
          normal = normalize( tbn * mapN );
        `)
        .replace('#include <color_fragment>', `
          #include <color_fragment>
          // 血潮变色：暗红 + 轻微自发光感
          vec3 bloodCol = vec3(0.045, 0.082, 0.074);  // 返潮：来的不是血，是深度
          diffuseColor.rgb = mix(diffuseColor.rgb, bloodCol, uBlood);
          // 近岸浅水：悬浮泥沙让水色变浊变浅
          float shallow = 1.0 - smoothstep(0.0, 2.6, vShoreD);
          vec3 shallowCol = mix(vec3(0.215, 0.285, 0.265), vec3(0.10, 0.14, 0.12), uBlood);
          diffuseColor.rgb = mix(diffuseColor.rgb, shallowCol, shallow * 0.5);
          // 岸线白沫：贴着潮线的一条不肯退的碎沫（噪声破碎 + 缓慢呼吸）
          float foamN = texture2D( normalMap, vNormalMapUv * 3.1 + vec2(uTime*0.020, -uTime*0.013) ).y;
          float band = 1.0 - smoothstep(0.02, 0.85, abs(vShoreD - 0.22));
          float foam = band * smoothstep(0.34, 0.78, foamN + sin(uTime*0.7 + vShoreD*8.0) * 0.13);
          vec3 foamCol = mix(vec3(0.70, 0.75, 0.73), vec3(0.44, 0.52, 0.48), uBlood);
          diffuseColor.rgb = mix(diffuseColor.rgb, foamCol, foam * 0.8);
          // 浪尖碎沫：只有掀得最高的浪头翻出一线白（血潮翻出粉灰）
          float capN = texture2D( normalMap, vNormalMapUv * 2.3 + vec2(uTime*0.017, -uTime*0.009) ).x;
          float cap = smoothstep(0.30, 0.46, vWave) * smoothstep(0.45, 0.75, capN);
          vec3 capCol = mix(vec3(0.62, 0.68, 0.66), vec3(0.40, 0.48, 0.44), uBlood);
          diffuseColor.rgb = mix(diffuseColor.rgb, capCol, cap * 0.55);
        `)
        .replace('#include <emissivemap_fragment>', `
          #include <emissivemap_fragment>
          // 血潮：水体从内部透出的一点血光，随潮歌节律呼吸
          float pulse = 0.5 + 0.5 * sin(uTime * 0.8);
          totalEmissiveRadiance += vec3(0.008, 0.032, 0.026) * uBlood * (0.6 + pulse * 0.4);
        `);
    };

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.position.y = 0;
    scene.add(this.mesh);

    // —— 血潮后海平线上的一串灯（成串的"鳞"，随歌一明一灭）——
    {
      const N = 22;
      const pos = new Float32Array(N * 3);
      const col = new Float32Array(N * 3);
      this._lanternPhase = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        pos[i * 3] = -140 + t * 420 + Math.sin(i * 2.7) * 14;
        pos[i * 3 + 1] = 1.6 + Math.sin(i * 1.3) * 0.8;
        pos[i * 3 + 2] = -252 - Math.sin(t * Math.PI) * 62;
        this._lanternPhase[i] = Math.random() * 6.28;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      this.seaLanterns = new THREE.Points(g, new THREE.PointsMaterial({
        size: 2.0, transparent: true, opacity: 0, vertexColors: true,
        depthWrite: false, sizeAttenuation: true, fog: false,
        blending: THREE.AdditiveBlending,
      }));
      this.seaLanterns.visible = false;
      scene.add(this.seaLanterns);
    }
  }

  /** 触发血潮：变色 + 水位上升 */
  setBloodTide(on, level = 1.8) {
    this.targetLevel = on ? level : 0;
    this._bloodTarget = on ? 1 : 0;
  }

  update(dt) {
    this.time += dt;
    this.uniforms.uTime.value = this.time;
    // 水位缓慢上涨（高潮演出）
    this.level += (this.targetLevel - this.level) * Math.min(1, dt * 0.08);
    this.blood += ((this._bloodTarget ?? 0) - this.blood) * Math.min(1, dt * 0.1);
    this.uniforms.uBlood.value = this.blood;
    // 潮汐呼吸
    const breathe = Math.sin(this.time * 0.22) * 0.06;
    this.mesh.position.y = this.level + breathe;
    this.uniforms.uMeshY.value = this.mesh.position.y;
    this.mesh.material.color.setRGB(
      0.11 + this.blood * 0.1,
      0.184 - this.blood * 0.13,
      0.188 - this.blood * 0.14
    );

    // 海平线灯笼串：血潮后浮现，逐盏按各自的相位一明一灭（像在应和什么）
    if (this.blood > 0.02) {
      this.seaLanterns.visible = true;
      const m = this.seaLanterns.material;
      m.opacity = Math.min(0.85, this.blood * 0.85);
      const colors = this.seaLanterns.geometry.attributes.color;
      const n = colors.count;
      for (let i = 0; i < n; i++) {
        const tw = Math.max(0, Math.sin(this.time * 0.55 + this._lanternPhase[i]));
        const b = 0.25 + tw * tw * 0.75;
        colors.setXYZ(i, 1.0 * b, 0.52 * b, 0.2 * b);
      }
      colors.needsUpdate = true;
    } else {
      this.seaLanterns.visible = false;
    }
  }
}
