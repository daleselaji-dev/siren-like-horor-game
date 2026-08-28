// 天空穹顶（分形云层着色器）+ 全局光照 + 雾 + 盐雾粒子 + 贴地雾卡 + 远处无声闪电
import * as THREE from 'three';

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.blood = 0;
    this._bloodTarget = 0;
    this.time = 0;

    // 闪电：远处的、没有雷声跟上来的那种
    this.flash = 0;             // 0..1 供后处理读取
    this.flashTimer = 22 + Math.random() * 20;
    this.flashSeq = null;       // { t, strikes:[延迟…] }
    this.thunderQueued = 0;     // >0 时 main 循环触发一次远雷

    // ---- 穹顶 ----
    this.uniforms = {
      uBlood: { value: 0 },
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
          gl_Position.z = gl_Position.w; // 永远在最远
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uBlood;
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
          // 青灰阴天：地平线亮灰 → 顶部铅蓝
          vec3 horizon = mix(vec3(0.52, 0.56, 0.57), vec3(0.16, 0.215, 0.205), uBlood);
          vec3 zenith  = mix(vec3(0.16, 0.20, 0.24), vec3(0.045, 0.075, 0.082), uBlood);
          vec3 col = mix(horizon, zenith, pow(max(h, 0.0), 0.55));

          // 隔湿布的月亮：清晰盘面 + 两级光晕；血潮后翻成锈红的月
          vec3 moonDir = normalize(vec3(-0.4, 0.35, -0.6));
          float md = max(dot(normalize(vDir), moonDir), 0.0);
          float disk = smoothstep(0.99938, 0.99972, md);
          // 轮24：宽晕 0.10→0.05——广角对月时半边天糊成白雾（hotel_wide 泛白元凶）
          float halo = pow(md, 90.0) * 0.26 + pow(md, 14.0) * 0.05;
          vec3 moonCol = mix(vec3(0.85, 0.89, 0.90), vec3(0.58, 0.70, 0.62), uBlood);
          // 月面暗斑（简单噪声侵蚀盘面）
          float mare = fbm(vDir.xz * 40.0 + vec2(3.7, 9.2));
          col += moonCol * (disk * (0.85 - mare * 0.38) + halo) * (1.0 - uBlood * 0.35);

          // 分形云层：投影到天顶平面上缓慢推移，低垂、压顶
          if (h > 0.02) {
            vec2 cp = vDir.xz / (vDir.y + 0.22);
            float drift = uTime * (0.006 + uBlood * 0.010);
            float n = fbm(cp * 1.35 + vec2(drift, drift * 0.6));
            float n2 = fbm(cp * 3.1 - vec2(drift * 1.7, drift));
            float n3 = fbm(cp * 6.4 + vec2(drift * 2.6, -drift * 1.4));
            float cloud = smoothstep(0.42, 0.78, n * 0.62 + n2 * 0.27 + n3 * 0.11);
            // 云底更暗，云隙微亮；血潮后云翻成瘀紫
            vec3 cloudDark = mix(vec3(0.115, 0.145, 0.170), vec3(0.06, 0.095, 0.095), uBlood);
            vec3 cloudLit  = mix(vec3(0.30, 0.335, 0.35),  vec3(0.15, 0.21, 0.20),  uBlood);
            vec3 cloudCol = mix(cloudLit, cloudDark, smoothstep(0.35, 0.95, n));
            // 月亮附近的云被从背后照亮（银边）
            cloudCol += moonCol * pow(md, 10.0) * 0.16 * (1.0 - uBlood * 0.6);
            float fade = smoothstep(0.02, 0.24, h);           // 地平线附近云被雾吃掉
            col = mix(col, cloudCol, cloud * fade * 0.85);
            // 闪电照亮云底
            col += uFlash * cloud * fade * vec3(0.5, 0.55, 0.66);
          }

          // 闪电抬亮地平线
          col += uFlash * vec3(0.30, 0.33, 0.40) * (1.0 - smoothstep(0.0, 0.45, h));

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(800, 24, 16), skyMat);
    scene.add(this.dome);

    // ---- 闪电分叉：一道贴在远天的白色裂纹，只在闪的那一瞬显形 ----
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

    // ---- 程序化环境反射（equirect）：给 PBR 材质一层阴天海面的 IBL ----
    {
      const makeEnv = (blood) => {
        const c = document.createElement('canvas');
        c.width = 128; c.height = 64;
        const cx = c.getContext('2d');
        const grad = cx.createLinearGradient(0, 0, 0, 64);
        if (!blood) {
          grad.addColorStop(0, '#2c3a44');
          grad.addColorStop(0.42, '#5a666b');
          grad.addColorStop(0.5, '#78827f');
          grad.addColorStop(0.56, '#2c3a3a');
          grad.addColorStop(1, '#0c1416');
        } else {
          grad.addColorStop(0, '#221018');
          grad.addColorStop(0.42, '#4a2226');
          grad.addColorStop(0.5, '#6a3030');
          grad.addColorStop(0.56, '#301012');
          grad.addColorStop(1, '#0c0406');
        }
        cx.fillStyle = grad;
        cx.fillRect(0, 0, 128, 64);
        // 月位亮斑
        cx.fillStyle = blood ? 'rgba(190,90,60,0.5)' : 'rgba(210,220,225,0.6)';
        cx.beginPath(); cx.arc(34, 22, 5, 0, 6.28); cx.fill();
        const t = new THREE.CanvasTexture(c);
        t.mapping = THREE.EquirectangularReflectionMapping;
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      };
      this.envNormal = makeEnv(false);
      this.envBlood = makeEnv(true);
      scene.environment = this.envNormal;
      scene.environmentIntensity = 0.34;
      this._envSwapped = false;
    }

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

    // ---- 贴地雾卡：低伏在滩涂与谷地上缓慢爬行的湿雾 ----
    const fogTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const cx = c.getContext('2d');
      const g = cx.createRadialGradient(64, 64, 4, 64, 64, 62);
      g.addColorStop(0, 'rgba(210,220,220,0.55)');
      g.addColorStop(0.55, 'rgba(200,212,212,0.22)');
      g.addColorStop(1, 'rgba(200,212,212,0)');
      cx.fillStyle = g;
      cx.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    })();
    this.fogCards = [];
    for (let i = 0; i < 12; i++) {
      const mat = new THREE.SpriteMaterial({
        map: fogTex, transparent: true, depthWrite: false,
        opacity: 0.05 + Math.random() * 0.05, color: 0xb9c6c6,
      });
      const sp = new THREE.Sprite(mat);
      const sc = 26 + Math.random() * 34;
      sp.scale.set(sc, sc * 0.32, 1);
      sp.position.set((Math.random() - 0.5) * 220, 1.2 + Math.random() * 1.8, (Math.random() - 0.5) * 240);
      scene.add(sp);
      this.fogCards.push({
        sp, baseOp: mat.opacity,
        vx: (Math.random() - 0.5) * 0.5, vz: (Math.random() - 0.5) * 0.5,
        ph: Math.random() * 6.28,
      });
    }
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

    // ---- 远处无声闪电（双闪 + 一道贴天的裂纹） ----
    this.flashTimer -= dt;
    if (this.flashTimer <= 0 && !this.flashSeq) {
      this.flashSeq = { t: 0, strikes: [0, 0.18 + Math.random() * 0.2] };
      this.flashTimer = 26 + Math.random() * 34;
      this.thunderQueued = 1; // 数秒后隔海传来的一声闷雷（由 main 触发）
      this._boltAz = Math.random() * Math.PI * 2;
      this.boltMesh.visible = true;
    }
    if (this.flashSeq) {
      this.flashSeq.t += dt;
      let f = 0;
      for (const st of this.flashSeq.strikes) {
        const lt = this.flashSeq.t - st;
        if (lt > 0) f = Math.max(f, Math.exp(-lt * 14) * 0.9);
      }
      this.flash = f * (1 - this.blood * 0.5);
      // 序列存活到最后一击之后 1.2s（开场运镜的第二组双闪排在 5s+）
      const last = this.flashSeq.strikes[this.flashSeq.strikes.length - 1] ?? 0;
      if (this.flashSeq.t > last + 1.2) { this.flashSeq = null; this.flash = 0; this.boltMesh.visible = false; }
    } else {
      this.flash = 0;
    }
    this.uniforms.uFlash.value = this.flash;
    this.boltMesh.material.opacity = this.flash * 0.85;

    // 环境反射随血潮换调
    if (this.blood > 0.5 && !this._envSwapped) {
      this._envSwapped = true;
      this.scene.environment = this.envBlood;
    }
    this.scene.environmentIntensity = 0.34 - this.blood * 0.1;

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
    this.motes.material.color.setRGB(0.62 + this.blood * 0.18, 0.69 - this.blood * 0.25, 0.69 - this.blood * 0.28);

    // 穹顶与粒子跟随玩家（雾里看不出移动）
    if (playerPos) {
      this.dome.position.set(playerPos.x, 0, playerPos.z);
      this.sun.position.set(playerPos.x - 60, 80, playerPos.z - 90);
      this.sun.target.position.set(playerPos.x, 0, playerPos.z);
      // 闪电裂纹立在远海上，正对玩家
      if (this.boltMesh.visible) {
        this.boltMesh.position.set(
          playerPos.x + Math.sin(this._boltAz) * 620,
          52,
          playerPos.z + Math.cos(this._boltAz) * 620
        );
        this.boltMesh.lookAt(playerPos.x, 30, playerPos.z);
      }

      // 雾卡缓慢爬行，绕着玩家循环
      for (const f of this.fogCards) {
        f.sp.position.x += f.vx * dt;
        f.sp.position.z += f.vz * dt;
        f.sp.material.opacity = f.baseOp * (0.7 + Math.sin(this.time * 0.13 + f.ph) * 0.3) * (1 + this.blood * 0.6);
        if (this.blood > 0.05) {
          f.sp.material.color.setRGB(0.73, 0.62 - this.blood * 0.14, 0.62 - this.blood * 0.16);
        }
        const dx = f.sp.position.x - playerPos.x;
        const dz = f.sp.position.z - playerPos.z;
        if (Math.abs(dx) > 130) f.sp.position.x = playerPos.x - Math.sign(dx) * 128;
        if (Math.abs(dz) > 140) f.sp.position.z = playerPos.z - Math.sign(dz) * 138;
      }
    }
    this.motes.rotation.y += dt * 0.004;
  }
}
