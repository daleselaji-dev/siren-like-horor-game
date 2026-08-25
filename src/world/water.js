// 海面：滚动双层法线 + 顶点微波 + 菲涅尔提亮；支持“血潮”状态切换与水位上涨
import * as THREE from 'three';

export class Ocean {
  constructor(scene, textures) {
    this.level = 0;          // 当前海平面
    this.targetLevel = 0;
    this.blood = 0;          // 0 正常 → 1 血潮
    this.time = 0;

    const geo = new THREE.PlaneGeometry(720, 720, 96, 96);
    geo.rotateX(-Math.PI / 2);

    const normalMap = textures.waterNormal;
    normalMap.repeat.set(24, 24);

    this.uniforms = {
      uTime: { value: 0 },
      uBlood: { value: 0 },
    };

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x1c2f30),
      normalMap,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughness: 0.18,
      metalness: 0.55,
      transparent: false,
    });

    // 注入顶点微波 + 随时间滚动法线（第二层反向）+ 浪尖白沫 + 血潮微光
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.uniforms.uTime;
      shader.uniforms.uBlood = this.uniforms.uBlood;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nuniform float uTime;\nuniform float uBlood;\nvarying float vWave;`)
        .replace('#include <begin_vertex>', `
          #include <begin_vertex>
          float chop = 1.0 + uBlood * 0.9;      // 血潮时浪更躁
          float wa = sin(position.x * 0.11 + uTime * 0.9) * 0.14 * chop
                   + cos(position.z * 0.13 + uTime * 0.7) * 0.12 * chop
                   + sin((position.x + position.z) * 0.05 + uTime * 0.45) * 0.2
                   + sin(position.x * 0.31 - uTime * 1.7) * 0.045 * chop;
          transformed.y += wa;
          vWave = wa;
        `);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform float uTime;\nuniform float uBlood;\nvarying float vWave;`)
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
          vec3 bloodCol = vec3(0.30, 0.045, 0.035);
          diffuseColor.rgb = mix(diffuseColor.rgb, bloodCol, uBlood);
          // 浪尖碎沫：只有掀得最高的浪头翻出一线白（血潮翻出粉灰）
          float capN = texture2D( normalMap, vNormalMapUv * 2.3 + vec2(uTime*0.017, -uTime*0.009) ).x;
          float cap = smoothstep(0.30, 0.46, vWave) * smoothstep(0.45, 0.75, capN);
          vec3 capCol = mix(vec3(0.62, 0.68, 0.66), vec3(0.55, 0.30, 0.28), uBlood);
          diffuseColor.rgb = mix(diffuseColor.rgb, capCol, cap * 0.55);
        `)
        .replace('#include <emissivemap_fragment>', `
          #include <emissivemap_fragment>
          // 血潮：水体从内部透出的一点血光，随潮歌节律呼吸
          float pulse = 0.5 + 0.5 * sin(uTime * 0.8);
          totalEmissiveRadiance += vec3(0.10, 0.008, 0.006) * uBlood * (0.6 + pulse * 0.4);
        `);
    };

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.position.y = 0;
    scene.add(this.mesh);

    // 岸线白沫：一圈半透明噪声环（简化为低透明大平面叠加）
    const foamMat = new THREE.MeshBasicMaterial({
      color: 0xb8c4c2, transparent: true, opacity: 0.05, depthWrite: false,
    });
    this.foam = new THREE.Mesh(new THREE.PlaneGeometry(720, 720).rotateX(-Math.PI / 2), foamMat);
    this.foam.position.y = 0.03;
    scene.add(this.foam);
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
    this.foam.position.y = this.mesh.position.y + 0.03;
    this.mesh.material.color.setRGB(
      0.11 + this.blood * 0.1,
      0.184 - this.blood * 0.13,
      0.188 - this.blood * 0.14
    );
  }
}
