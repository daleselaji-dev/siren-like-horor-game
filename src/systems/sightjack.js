// 视奸（Sightjacking）：切入附近载体（潮尸/村犬/海鸟）的视野
// 玩家本体静止且失明——用别人的眼睛侦察巡逻路线、钥匙位置、祭文顺序
import * as THREE from 'three';

const RANGE = 55; // 可感知信道的半径

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
    this.staticCanvas = document.getElementById('sj-static');
    this.staticCtx = this.staticCanvas.getContext('2d');
    this.staticCanvas.width = 320;
    this.staticCanvas.height = 180;

    this._headPos = new THREE.Vector3();
  }

  /** 收集附近信道（按距离排序） */
  collectChannels(entities) {
    const p = this.player.pos;
    this.channels = entities
      .filter((e) => e.enabled)
      .map((e) => ({
        e,
        dist: e.kind === 'birds' ? 40 : Math.hypot(e.pos.x - p.x, e.pos.z - p.z),
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
  }

  update(dt, elapsed) {
    if (!this.active || !this.current) return;

    // 相机跟随载体头部（平滑）
    this.current.viewPos(this._headPos);
    const { yaw, pitch } = this.current.viewYawPitch();
    this.camera.position.lerp(this._headPos, Math.min(1, dt * 10));
    const qTarget = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    this.camera.quaternion.slerp(qTarget, Math.min(1, dt * 6));
    this.engine.setCamera(this.camera);

    // 噪点强度：切台脉冲 + 距离底噪
    this.staticBurst = Math.max(0, this.staticBurst - dt * 2.2);
    const dist = this.channels[this.index]?.dist ?? 20;
    const base = 0.1 + Math.min(0.4, dist / RANGE * 0.45);
    const intensity = Math.min(1, base + this.staticBurst);
    this.drawStatic(intensity, elapsed);

    // 标签
    const name = this.current.label ?? '？？？';
    this.labelEl.textContent =
      `信道 ${this.index + 1}/${Math.max(1, this.channels.length)} — ${name}`;

    // 后处理脉冲（心跳）
    this.engine.finalPass.uniforms.uPulse.value = 0.6 + this.staticBurst * 0.5;
    this.engine.finalPass.uniforms.uAberration.value = 0.003 + this.staticBurst * 0.004;

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
    ctx.putImageData(img, 0, 0);
    this.staticCanvas.style.opacity = (0.1 + intensity * 0.5).toFixed(2);
  }
}
