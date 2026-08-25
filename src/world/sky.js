// 《返潮》天穹：阴天分形云 + 隔雾的月 + 全局光照 + 海雾（室内外分级）+ 远海无声闪电
// 压力锋面（Pressure Front）：Depth 泄漏时雾变密变冷、光被压低——灰绿，不是血红，不是蓝滤镜。
import * as THREE from 'three';

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.pressure = 0;          // 0..1 压力锋面强度
    this._pressureTarget = 0;
    this.time = 0;
    this._indoor = 0;           // 0 室外 / 1 室内（平滑）

    // 闪电：远处的、没有雷声跟上来的那种（只在海上）
    this.flash = 0;
    this.flashTimer = 20 + Math.random() * 18;
    this.flashSeq = null;
    this.thunderQueued = 0;

    // ---- 穹顶 ----
    this.uniforms = {
      uPressure: { value: 0 },
      uTime: { value: 0 },
      uFlash: { value: 0 },
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
          gl_Position.z = gl_Position.w;
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uPressure;
        uniform float uTime;
        uniform float uFlash;
        varying vec3 vDir;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
        float vnoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash(i), b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        float fbm(vec2 p) {
          float v = 0.0, amp = 0.5;
          for (int o = 0; o < 4; o++) { v += vnoise(p) * amp; p *= 2.13; amp *= 0.5; }
          return v;
        }

        void main() {
          float h = clamp(vDir.y, -0.1, 1.0);
          // 千禧海边小城的阴夜：地平线烟灰 → 顶部铅蓝；压力锋面把一切压成灰绿
          vec3 horizon = mix(vec3(0.50, 0.54, 0.55), vec3(0.30, 0.35, 0.33), uPressure);
          vec3 zenith  = mix(vec3(0.15, 0.19, 0.23), vec3(0.07, 0.10, 0.10), uPressure);
          vec3 col = mix(horizon, zenith, pow(max(h, 0.0), 0.55));

          // 隔湿布的月亮
          vec3 moonDir = normalize(vec3(-0.4, 0.35, 0.75)); // 挂在海那边
          float md = max(dot(normalize(vDir), moonDir), 0.0);
          float disk = smoothstep(0.99938, 0.99972, md);
          float halo = pow(md, 90.0) * 0.30 + pow(md, 14.0) * 0.10;
          vec3 moonCol = mix(vec3(0.85, 0.89, 0.90), vec3(0.55, 0.62, 0.60), uPressure);
          float mare = fbm(vDir.xz * 40.0 + vec2(3.7, 9.2));
          col += moonCol * (disk * (0.85 - mare * 0.38) + halo);

          // 低垂压顶的云
          if (h > 0.02) {
            vec2 cp = vDir.xz / (vDir.y + 0.22);
            float drift = uTime * (0.006 + uPressure * 0.008);
            float n = fbm(cp * 1.35 + vec2(drift, drift * 0.6));
            float n2 = fbm(cp * 3.1 - vec2(drift * 1.7, drift));
            float n3 = fbm(cp * 6.4 + vec2(drift * 2.6, -drift * 1.4));
            float cloud = smoothstep(0.42, 0.78, n * 0.62 + n2 * 0.27 + n3 * 0.11);
            vec3 cloudDark = mix(vec3(0.110, 0.140, 0.165), vec3(0.06, 0.085, 0.08), uPressure);
            vec3 cloudLit  = mix(vec3(0.29, 0.325, 0.34),  vec3(0.16, 0.20, 0.19), uPressure);
            vec3 cloudCol = mix(cloudLit, cloudDark, smoothstep(0.35, 0.95, n));
            cloudCol += moonCol * pow(md, 10.0) * 0.16 * (1.0 - uPressure * 0.5);
            float fade = smoothstep(0.02, 0.24, h);
            col = mix(col, cloudCol, cloud * fade * 0.85);
            col += uFlash * cloud * fade * vec3(0.5, 0.55, 0.66);
          }

          col += uFlash * vec3(0.30, 0.33, 0.40) * (1.0 - smoothstep(0.0, 0.45, h));

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(800, 24, 16), skyMat);
    scene.add(this.dome);

    // ---- 闪电裂纹 ----
    {
      const c = document.createElement('canvas');
      c.width = 128; c.height = 256;
      const cx = c.getContext('2d');
      const bolt = (x0, y0, len, ang, w) => {
        cx.strokeStyle = 'rgba(235,242,255,0.95)';
        cx.lineWidth = w;
        cx.shadowColor = 'rgba(160,190,255,0.9)';
        cx.shadowBlur = 6;
        cx.beginPath();
        cx.moveTo(x0, y0);
        let x = x0, y = y0;
        const steps = 14;
        for (let i = 0; i < steps; i++) {
          const t = i / steps;
          x += Math.sin(ang) * (len / steps) + (Math.random() - 0.5) * 14;
          y += Math.cos(ang) * (len / steps);
          cx.lineTo(x, y);
          if (w > 1.4 && Math.random() < 0.3 && t > 0.2) {
            bolt(x, y, len * (0.35 - t * 0.2), ang + (Math.random() - 0.5) * 1.6, w * 0.5);
            cx.moveTo(x, y);
          }
        }
        cx.stroke();
      };
      bolt(64, 4, 240, 0.06, 2.6);
      const tex = new THREE.CanvasTexture(c);
      const mat = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 0, fog: false,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      this.boltMesh = new THREE.Mesh(new THREE.PlaneGeometry(46, 130), mat);
      this.boltMesh.visible = false;
      scene.add(this.boltMesh);
    }

    // ---- 程序化环境反射（equirect IBL）：阴天海边 + 室内钨丝的一点暖 ----
    {
      const c = document.createElement('canvas');
      c.width = 128; c.height = 64;
      const cx = c.getContext('2d');
      const grad = cx.createLinearGradient(0, 0, 0, 64);
      grad.addColorStop(0, '#2c3a44');
      grad.addColorStop(0.42, '#59656a');
      grad.addColorStop(0.5, '#75807d');
      grad.addColorStop(0.56, '#2c3a3a');
      grad.addColorStop(1, '#0c1416');
      cx.fillStyle = grad;
      cx.fillRect(0, 0, 128, 64);
      cx.fillStyle = 'rgba(210,220,225,0.6)';
      cx.beginPath(); cx.arc(34, 22, 5, 0, 6.28); cx.fill();
      // 一点烟黄（室内钨丝反射语汇）
      cx.fillStyle = 'rgba(255,190,120,0.35)';
      cx.beginPath(); cx.arc(96, 30, 7, 0, 6.28); cx.fill();
      const t = new THREE.CanvasTexture(c);
      t.mapping = THREE.EquirectangularReflectionMapping;
      t.colorSpace = THREE.SRGBColorSpace;
      scene.environment = t;
      scene.environmentIntensity = 0.36;
    }

    // ---- 光照 ----
    this.hemi = new THREE.HemisphereLight(0x9db0b8, 0x39424a, 0.85);
    scene.add(this.hemi);

    this.moon = new THREE.DirectionalLight(0xbcc8cc, 1.15);
    this.moon.position.set(-45, 70, 95); // 从海那边照过来
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(2048, 2048);
    this.moon.shadow.camera.near = 10;
    this.moon.shadow.camera.far = 320;
    const s = 90;
    this.moon.shadow.camera.left = -s;
    this.moon.shadow.camera.right = s;
    this.moon.shadow.camera.top = s;
    this.moon.shadow.camera.bottom = -s;
    this.moon.shadow.bias = -0.0006;
    this.moon.shadow.normalBias = 0.03;
    scene.add(this.moon);
    scene.add(this.moon.target);

    // ---- 雾：海雾语义。室外浓（看得见它移动），室内只剩一点潮气 ----
    scene.fog = new THREE.FogExp2(0x66737a, 0.02);

    // ---- 空气里的浮尘/水汽微粒 ----
    const N = 500;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 90;
      pos[i * 3 + 1] = Math.random() * 8 + 0.3;
      pos[i * 3 + 2] = -44 + Math.random() * 90;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.motes = new THREE.Points(pg, new THREE.PointsMaterial({
      color: 0x9fb0ac, size: 0.045, transparent: true, opacity: 0.32,
      depthWrite: false, sizeAttenuation: true,
    }));
    scene.add(this.motes);

    // ---- 贴地海雾卡：从海那边爬上前庭的湿雾 ----
    const fogTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const cx = c.getContext('2d');
      const g = cx.createRadialGradient(64, 64, 4, 64, 64, 62);
      g.addColorStop(0, 'rgba(210,220,218,0.55)');
      g.addColorStop(0.55, 'rgba(200,212,208,0.22)');
      g.addColorStop(1, 'rgba(200,212,208,0)');
      cx.fillStyle = g;
      cx.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    })();
    this.fogCards = [];
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.SpriteMaterial({
        map: fogTex, transparent: true, depthWrite: false,
        opacity: 0.06 + Math.random() * 0.06, color: 0xb4c2be,
      });
      const sp = new THREE.Sprite(mat);
      const sc = 20 + Math.random() * 28;
      sp.scale.set(sc, sc * 0.3, 1);
      // 只铺在前庭与海上（z > 6）
      sp.position.set((Math.random() - 0.5) * 90, 0.4 + Math.random() * 1.6, 8 + Math.random() * 80);
      scene.add(sp);
      this.fogCards.push({
        sp, baseOp: mat.opacity,
        vx: (Math.random() - 0.5) * 0.4, vz: -0.15 - Math.random() * 0.3, // 从海往楼爬
        ph: Math.random() * 6.28,
      });
    }
  }

  /** 压力锋面（Leak/追逐/返潮之夜） */
  setPressure(on) {
    this._pressureTarget = typeof on === 'number' ? on : (on ? 1 : 0);
  }

  update(dt, playerPos) {
    this.time += dt;
    this.uniforms.uTime.value = this.time;
    this.pressure += (this._pressureTarget - this.pressure) * Math.min(1, dt * 0.25);
    this.uniforms.uPressure.value = this.pressure;

    // ---- 远海无声闪电 ----
    this.flashTimer -= dt;
    if (this.flashTimer <= 0 && !this.flashSeq) {
      this.flashSeq = { t: 0, strikes: [0, 0.18 + Math.random() * 0.2] };
      this.flashTimer = 24 + Math.random() * 30;
      this.thunderQueued = 1;
      this._boltAz = (Math.random() - 0.5) * 1.2; // 只在海那边（+z 方向 ±35°）
      this.boltMesh.visible = true;
    }
    if (this.flashSeq) {
      this.flashSeq.t += dt;
      let f = 0;
      for (const st of this.flashSeq.strikes) {
        const lt = this.flashSeq.t - st;
        if (lt > 0) f = Math.max(f, Math.exp(-lt * 14) * 0.9);
      }
      // 室内只看到窗与门口的光变化——整体贡献压低
      this.flash = f * (1 - this._indoor * 0.72);
      if (this.flashSeq.t > 1.2) { this.flashSeq = null; this.flash = 0; this.boltMesh.visible = false; }
    } else {
      this.flash = 0;
    }
    this.uniforms.uFlash.value = this.flash;
    this.boltMesh.material.opacity = this.flash * 0.85;

    // ---- 室内外雾分级 ----
    const indoorTarget = playerPos && playerPos.z < 2 ? 1 : 0;
    this._indoor += (indoorTarget - this._indoor) * Math.min(1, dt * 1.6);
    const fog = this.scene.fog;
    const outD = 0.024 + this.pressure * 0.02;   // 室外海雾
    const inD = 0.011 + this.pressure * 0.014;   // 室内潮气（压力时雾进了楼）
    fog.density = inD + (outD - inD) * (1 - this._indoor);
    fog.color.setRGB(
      0.40 - this.pressure * 0.09,
      0.45 - this.pressure * 0.08,
      0.475 - this.pressure * 0.10
    );
    this.hemi.intensity = 0.85 - this.pressure * 0.3;
    this.moon.intensity = 1.15 - this.pressure * 0.5;
    this.scene.environmentIntensity = 0.36 - this.pressure * 0.12;
    this.motes.material.opacity = 0.32 + this.pressure * 0.2;

    // 穹顶跟随玩家
    if (playerPos) {
      this.dome.position.set(playerPos.x, 0, playerPos.z);
      if (this.boltMesh.visible) {
        this.boltMesh.position.set(
          Math.sin(this._boltAz) * 620,
          52,
          Math.abs(Math.cos(this._boltAz)) * 620 // 永远在 +z 的海上
        );
        this.boltMesh.lookAt(playerPos.x, 30, playerPos.z);
      }
      // 海雾卡从海往楼爬，出界回收
      for (const f of this.fogCards) {
        f.sp.position.x += f.vx * dt;
        f.sp.position.z += f.vz * dt;
        f.sp.material.opacity = f.baseOp * (0.7 + Math.sin(this.time * 0.13 + f.ph) * 0.3) * (1 + this.pressure * 0.8);
        if (f.sp.position.z < 5) f.sp.position.z = 70 + Math.random() * 20;
        if (Math.abs(f.sp.position.x) > 60) f.sp.position.x *= -0.9;
      }
    }
    this.motes.rotation.y += dt * 0.003;
  }
}
