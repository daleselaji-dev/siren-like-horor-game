// 视奸（Sightjacking）：切入附近载体（潮尸/村犬/海鸟）的视野
// 玩家本体静止且失明——用别人的眼睛侦察巡逻路线、钥匙位置、祭文顺序
import * as THREE from 'three';

const RANGE = 55; // 可感知信道的半径

// 每种载体的眼睛看到的世界不一样：视场角 / 色偏 / 去饱和 / 呼吸频率
const CARRIER_FX = {
  default: { fov: 74, tint: [0.85, 1.0, 0.94], desat: 0.34, breath: 1.15 },  // 履职的人：泡绿的浑浊
  dog: { fov: 88, tint: [1.0, 0.95, 0.74], desat: 0.55, breath: 3.4 },       // 犬：色盲的暖黄，喘得急
  birds: { fov: 96, tint: [0.86, 0.94, 1.08], desat: 0.18, breath: 0 },      // 鸟：高冷通透的广角
  watcher: { fov: 70, tint: [0.8, 0.92, 1.0], desat: 0.42, breath: 0.6 },    // 望潮者：褪色的凝视
  floater: { fov: 66, tint: [1.02, 0.9, 0.82], desat: 0.3, breath: 0.35 },   // 浮客：醉了半分的暖
  gaze: { fov: 60, tint: [0.9, 0.86, 1.05], desat: 0.15, breath: 0.2 },      // 回眸客：过曝的残影
  waiter: { fov: 72, tint: [0.82, 0.96, 0.98], desat: 0.4, breath: 0 },      // 侍应：不呼吸的匀速
  sea: { fov: 58, tint: [0.78, 0.94, 1.06], desat: 0.28, breath: 0.5 },      // 海：它的眼睛
};

export class SightjackSystem {
  constructor(engine, player, audio) {
    this.engine = engine;
    this.player = player;
    this.audio = audio;

    this.camera = engine.camera.clone();
    this.active = false;
    this.channels = [];
    this.index = 0;
    this.current = null;
    this.staticBurst = 0;   // 切台噪点脉冲
    this.forced = null;     // 强制视奸（演出）

    // DOM
    this.overlay = document.getElementById('sightjack-overlay');
    this.labelEl = document.getElementById('sj-label');
    this.signalEl = document.getElementById('sj-signal');
    this.staticCanvas = document.getElementById('sj-static');
    this.staticCtx = this.staticCanvas.getContext('2d');
    this.staticCanvas.width = 320;
    this.staticCanvas.height = 180;

    this._headPos = new THREE.Vector3();
    this.breathT = 0;       // 载体呼吸相位（借来的肺）
  }

  /** 收集附近信道（按距离排序） */
  collectChannels(entities) {
    const p = this.player.pos;
    this.channels = entities
      .filter((e) => e.enabled)
      .map((e) => ({
        e,
        // 海鸟不看距离——它们永远在天上盘旋，给一个中等的伪距离让鸟瞰保持可读
        dist: e.kind === 'birds' ? 22 : Math.hypot(e.pos.x - p.x, e.pos.z - p.z),
      }))
      .filter((c) => c.dist < RANGE)
      .sort((a, b) => a.dist - b.dist);
  }

  enter(entities) {
    this.collectChannels(entities);
    if (this.channels.length === 0) return false;
    this.active = true;
    this.index = 0;
    this.current = this.channels[0].e;
    this.staticBurst = 1;
    this.player.frozen = true;
    this.overlay.classList.add('active');
    this.audio?.sightjackEnter();
    this.snapCamera();
    return true;
  }

  cycle() {
    if (!this.active || this.channels.length === 0) return;
    this.index = (this.index + 1) % this.channels.length;
    this.current = this.channels[this.index].e;
    this.staticBurst = 1;
    this.audio?.sightjackTune();
    this.snapCamera();
  }

  exit() {
    if (!this.active) return;
    this.active = false;
    this.current = null;
    this.player.frozen = false;
    this.overlay.classList.remove('active');
    this.engine.setCamera(this.engine.camera);
    this.audio?.sightjackExit();
  }

  /** 强制视奸（共鸣崩溃/终局演出） */
  forceView(entity, duration, onDone) {
    this.forced = { entity, t: duration, onDone };
    this.active = true;
    this.current = entity;
    this.index = 0;
    this.staticBurst = 1;
    this.player.frozen = true;
    this.overlay.classList.add('active');
    this.audio?.sightjackEnter(true);
    this.snapCamera();
  }

  snapCamera() {
    if (!this.current) return;
    this.current.viewPos(this._headPos);
    const { yaw, pitch } = this.current.viewYawPitch();
    this.camera.position.copy(this._headPos);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(yaw);
    this.camera.rotateX(pitch);
    // 借体滤镜：不同的眼睛有不同的视场与色觉
    const fx = CARRIER_FX[this.current.fxKind ?? this.current.kind] ?? CARRIER_FX.default;
    this._fx = fx;
    this.camera.fov = fx.fov;
    this.camera.aspect = this.engine.camera.aspect;
    this.camera.updateProjectionMatrix();
    this.engine.finalPass.uniforms.uTint.value.set(fx.tint[0], fx.tint[1], fx.tint[2]);
    this.engine.finalPass.uniforms.uDesat.value = fx.desat;
  }

  update(dt, elapsed) {
    if (!this.active || !this.current) return;

    // 窗口比例变化时同步借眼相机
    if (this.camera.aspect !== this.engine.camera.aspect) {
      this.camera.aspect = this.engine.camera.aspect;
      this.camera.updateProjectionMatrix();
    }

    // 相机跟随载体头部（平滑）+ 借来的肺在呼吸
    this.breathT += dt * (this._fx?.breath ?? 1.15);
    const breathe = Math.sin(this.breathT * 2.2);
    this.current.viewPos(this._headPos);
    this._headPos.y += breathe * 0.014;
    const { yaw, pitch } = this.current.viewYawPitch();
    this.camera.position.lerp(this._headPos, Math.min(1, dt * 10));
    const qTarget = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      pitch + breathe * 0.006,
      yaw + Math.sin(this.breathT * 0.7) * 0.008,
      Math.sin(this.breathT * 1.1) * 0.006, 'YXZ'));
    this.camera.quaternion.slerp(qTarget, Math.min(1, dt * 6));
    this.engine.setCamera(this.camera);

    // 噪点强度：切台脉冲 + 距离底噪
    this.staticBurst = Math.max(0, this.staticBurst - dt * 2.2);
    const dist = this.channels[this.index]?.dist ?? 20;
    const base = 0.1 + Math.min(0.4, dist / RANGE * 0.45);
    const intensity = Math.min(1, base + this.staticBurst);
    this.drawStatic(intensity, elapsed);

    // 标签 + 信号强度条
    const name = this.current.label ?? '？？？';
    this.labelEl.textContent =
      `信道 ${this.index + 1}/${Math.max(1, this.channels.length)} — ${name}`;
    const bars = Math.max(1, Math.min(5, Math.round((1 - dist / RANGE) * 5)));
    const flick = this.staticBurst > 0.4 && Math.random() < 0.5 ? -1 : 0;
    this.signalEl.textContent =
      '信号 ' + '▮'.repeat(Math.max(1, bars + flick)) + '▯'.repeat(5 - Math.max(1, bars + flick));

    // 后处理脉冲（心跳）+ 借眼畸变：别人的眼眶不合你的脸
    this.engine.finalPass.uniforms.uPulse.value = 0.6 + this.staticBurst * 0.5;
    this.engine.finalPass.uniforms.uAberration.value = 0.003 + this.staticBurst * 0.004;
    this.engine.finalPass.uniforms.uDistort.value = 0.16 + this.staticBurst * 0.22 + breathe * 0.008;

    // 强制视奸倒计时
    if (this.forced) {
      this.forced.t -= dt;
      if (this.forced.t <= 0) {
        const cb = this.forced.onDone;
        this.forced = null;
        cb?.();
      }
    }
  }

  /** 退出后复位后处理 */
  restorePost() {
    this.engine.finalPass.uniforms.uPulse.value = 0;
    this.engine.finalPass.uniforms.uAberration.value = 0.0009;
    this.engine.finalPass.uniforms.uDistort.value = 0;
    this.engine.finalPass.uniforms.uTint.value.set(1, 1, 1);
    this.engine.finalPass.uniforms.uDesat.value = 0.12;
  }

  drawStatic(intensity, t) {
    const ctx = this.staticCtx;
    const w = this.staticCanvas.width, h = this.staticCanvas.height;
    const img = ctx.createImageData(w, h);
    const d = img.data;
    const n = w * h;
    for (let i = 0; i < n; i++) {
      const v = Math.random() * 255;
      const i4 = i * 4;
      d[i4] = v; d[i4 + 1] = v; d[i4 + 2] = v;
      d[i4 + 3] = Math.random() < intensity ? 190 : 0;
    }
    // 滚动横纹
    const band = Math.floor(((t * 40) % h));
    for (let x = 0; x < w; x++) {
      const i4 = (band * w + x) * 4;
      d[i4] = d[i4 + 1] = d[i4 + 2] = 255;
      d[i4 + 3] = 120;
    }
    // 信号撕裂条：强噪点时整行搬移
    if (intensity > 0.35) {
      const tears = 1 + ((Math.random() * 2) | 0);
      for (let k = 0; k < tears; k++) {
        const y = (Math.random() * h) | 0;
        const shift = ((Math.random() - 0.5) * 30) | 0;
        for (let x = 0; x < w; x++) {
          const sx = (x + shift + w) % w;
          const di = (y * w + x) * 4, si = (y * w + sx) * 4;
          d[di] = d[si]; d[di + 1] = d[si + 1]; d[di + 2] = d[si + 2];
          d[di + 3] = 200;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    this.staticCanvas.style.opacity = (0.1 + intensity * 0.5).toFixed(2);
  }
}
