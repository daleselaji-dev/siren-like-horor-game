// 渲染引擎：WebGL2 渲染器 + ACES 色调映射 + 后处理链（Bloom → 暗角/颗粒/色差/调色）
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// 最终合成着色器：暗角 + 胶片颗粒 + 色差 + 轻度色阶
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.055 },       // 颗粒强度
    uVignette: { value: 1.12 },     // 暗角强度
    uAberration: { value: 0.0009 }, // 色差
    uDesat: { value: 0.12 },        // 去饱和
    uLift: { value: 0.015 },        // 黑位提升(湿雾感)
    uRedShift: { value: 0.0 },      // 血潮/受伤时整体偏红
    uPulse: { value: 0.0 },         // 心跳脉冲(视奸/共鸣)
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uGrain, uVignette, uAberration, uDesat, uLift, uRedShift, uPulse;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);

      // 心跳脉冲：轻微径向缩放
      float pulse = uPulse * 0.012 * sin(uTime * 7.0);
      uv = 0.5 + c * (1.0 - pulse);

      // 色差（边缘更强）
      float ab = uAberration * (1.0 + r2 * 6.0 + uPulse * 2.0);
      vec2 dir = normalize(c + 1e-6);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + dir * ab).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - dir * ab).b;

      // 去饱和 + 黑位提升（湿冷雾感）
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(lum), uDesat);
      col = col * (1.0 - uLift) + uLift * vec3(0.55, 0.62, 0.66);

      // 血潮 / 受伤偏红
      col = mix(col, col * vec3(1.25, 0.62, 0.55) + vec3(0.03,0.0,0.0), uRedShift);

      // 暗角
      float vig = 1.0 - uVignette * r2 * (1.3 + uPulse);
      col *= clamp(vig, 0.0, 1.0);

      // 胶片颗粒
      float g = hash(vUv * (uTime * 60.0 + 1.0)) - 0.5;
      col += g * uGrain * (0.6 + r2 * 1.2);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class Engine {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 900);

    // 后处理链
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.42,  // strength：只让灯火与眼点溢光
      0.55,  // radius
      0.82   // threshold
    );
    this.composer.addPass(this.bloomPass);

    // OutputPass：色调映射(ACES) + sRGB 输出（新版 three 组合链必需）
    this.composer.addPass(new OutputPass());

    // 最终风格化（在显示空间处理暗角/颗粒/色差）
    this.finalPass = new ShaderPass(FinalShader);
    this.composer.addPass(this.finalPass);

    window.addEventListener('resize', () => this.onResize());
  }

  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  /** 切换主渲染相机（视奸时切入他者视野） */
  setCamera(cam) {
    this.renderPass.camera = cam;
  }

  render(time) {
    this.finalPass.uniforms.uTime.value = time;
    this.composer.render();
  }
}
