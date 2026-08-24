// 天空穹顶（青灰渐变着色器）+ 全局光照 + 雾 + 大气粒子（盐雾漂浮物）
import * as THREE from 'three';

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.blood = 0;
    this._bloodTarget = 0;
    this.time = 0;

    // ---- 穹顶 ----
    this.uniforms = {
      uBlood: { value: 0 },
      uTime: { value: 0 },
    };
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: this.uniforms,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_Position.z = gl_Position.w; // 永远在最远
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uBlood;
        uniform float uTime;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y, -0.1, 1.0);
          // 青灰阴天：地平线亮灰 → 顶部铅蓝
          vec3 horizon = mix(vec3(0.52, 0.56, 0.57), vec3(0.30, 0.16, 0.19), uBlood);
          vec3 zenith  = mix(vec3(0.16, 0.20, 0.24), vec3(0.10, 0.05, 0.10), uBlood);
          vec3 col = mix(horizon, zenith, pow(max(h, 0.0), 0.55));
          // 隔湿布的白斑太阳
          vec3 sunDir = normalize(vec3(-0.4, 0.35, -0.6));
          float sun = pow(max(dot(normalize(vDir), sunDir), 0.0), 18.0);
          col += vec3(0.20, 0.19, 0.17) * sun * (1.0 - uBlood * 0.8);
          // 低空流云（简单噪声带）
          float band = sin(vDir.x * 6.0 + uTime * 0.02) * sin(vDir.z * 5.0 - uTime * 0.013);
          col += band * 0.02 * (1.0 - h);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(800, 24, 16), skyMat);
    scene.add(this.dome);

    // ---- 光照 ----
    this.hemi = new THREE.HemisphereLight(0x9db0b8, 0x39424a, 1.0);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xc3ccce, 1.7);
    this.sun.position.set(-60, 80, -90);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = 320;
    const s = 110;
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun);
    scene.add(this.sun.target);

    // ---- 雾 ----
    scene.fog = new THREE.FogExp2(0x69767b, 0.016);

    // ---- 盐雾漂浮粒子 ----
    const N = 900;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 260;
      pos[i * 3 + 1] = Math.random() * 14 + 0.4;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 280;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.motes = new THREE.Points(pg, new THREE.PointsMaterial({
      color: 0x9fb0b0, size: 0.06, transparent: true, opacity: 0.4,
      depthWrite: false, sizeAttenuation: true,
    }));
    scene.add(this.motes);
  }

  /** 血潮气象切换 */
  setBloodTide(on) {
    this._bloodTarget = on ? 1 : 0;
  }

  update(dt, playerPos) {
    this.time += dt;
    this.uniforms.uTime.value = this.time;
    this.blood += (this._bloodTarget - this.blood) * Math.min(1, dt * 0.06);
    this.uniforms.uBlood.value = this.blood;

    // 雾密度/颜色随血潮变化
    const fog = this.scene.fog;
    fog.density = 0.016 + this.blood * 0.013;
    fog.color.setRGB(
      0.41 + this.blood * 0.02,
      0.463 - this.blood * 0.25,
      0.482 - this.blood * 0.27
    );
    this.hemi.intensity = 1.0 - this.blood * 0.42;
    this.hemi.color.setRGB(0.62 - this.blood * 0.18, 0.69 - this.blood * 0.38, 0.72 - this.blood * 0.4);
    this.sun.intensity = 1.7 - this.blood * 0.95;
    this.sun.color.setRGB(0.73 + this.blood * 0.1, 0.77 - this.blood * 0.42, 0.78 - this.blood * 0.45);
    this.motes.material.opacity = 0.4 + this.blood * 0.25;

    // 穹顶与粒子跟随玩家（雾里看不出移动）
    if (playerPos) {
      this.dome.position.set(playerPos.x, 0, playerPos.z);
      this.sun.position.set(playerPos.x - 60, 80, playerPos.z - 90);
      this.sun.target.position.set(playerPos.x, 0, playerPos.z);
    }
    this.motes.rotation.y += dt * 0.004;
  }
}
