// 听潮（Structural Listening）：借入附近载体的眼睛——员工 / 监控摄像头 / F01
// 玩家本体静止且失明——用别人的视角侦察巡逻路线、房间结构、Depth 异常。
// 代价：听得越久、离 F01 的井越近，暴露越深（见 stealth.js）。
// 表现禁则（美术圣经）：禁止 VHS glitch/噪点撕裂。切入感 = 水压、呼吸、耳鸣，不是电视雪花。
import * as THREE from 'three';

const RANGE = 42; // 可感知信道的半径

// 每种载体的眼睛不一样：视场角 / 色偏 / 去饱和 / 呼吸频率 / 暴露倍率
const CARRIER_FX = {
  default: { fov: 70, tint: [0.94, 1.0, 0.97], desat: 0.3, breath: 1.1, expose: 0.5 },   // 员工：疲惫的浑浊
  camera: { fov: 88, tint: [0.88, 1.0, 0.92], desat: 0.55, breath: 0, expose: 0.15 },    // 监控：冷绿的不眨眼
  f01: { fov: 62, tint: [0.82, 0.9, 1.0], desat: 0.15, breath: 0.55, expose: 1.6 },      // F01：井底朝上看的冷
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
    this.plungeBurst = 0;   // 切入时的水压脉冲
    this.forced = null;     // 强制听潮（演出）
    this.exposeRate = 0;    // 当前暴露速率（stealth 读取）

    // DOM
    this.overlay = document.getElementById('sightjack-overlay');
    this.labelEl = document.getElementById('sj-label');
    this.signalEl = document.getElementById('sj-signal');

    this._headPos = new THREE.Vector3();
    this.breathT = 0;
  }

  /** 收集附近信道（按距离排序，摄像头永远可听——线是通的） */
  collectChannels(entities) {
    const p = this.player.pos;
    this.channels = entities
      .filter((e) => e.enabled)
      .map((e) => ({
        e,
        dist: e.kind === 'camera' ? 18 : Math.hypot(e.pos.x - p.x, e.pos.z - p.z),
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
    this.plungeBurst = 1;
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
    this.plungeBurst = 1;
    this.audio?.sightjackTune();
    this.snapCamera();
  }

  exit() {
    if (!this.active) return;
    this.active = false;
    this.current = null;
    this.exposeRate = 0;
    this.player.frozen = false;
    this.overlay.classList.remove('active');
    this.engine.setCamera(this.engine.camera);
    this.audio?.sightjackExit();
  }

  /** 强制听潮（暴露崩溃 / 演出） */
  forceView(entity, duration, onDone) {
    this.forced = { entity, t: duration, onDone };
    this.active = true;
    this.current = entity;
    this.index = 0;
    this.plungeBurst = 1;
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
    const fx = CARRIER_FX[this.current.kind === 'f01' ? 'f01' : this.current.kind] ?? CARRIER_FX.default;
    this._fx = fx;
    this.camera.fov = fx.fov;
    this.camera.aspect = this.engine.camera.aspect;
    this.camera.updateProjectionMatrix();
    this.engine.finalPass.uniforms.uTint.value.set(fx.tint[0], fx.tint[1], fx.tint[2]);
    this.engine.finalPass.uniforms.uDesat.value = fx.desat;
  }

  update(dt, elapsed) {
    if (!this.active || !this.current) { this.exposeRate = 0; return; }

    if (this.camera.aspect !== this.engine.camera.aspect) {
      this.camera.aspect = this.engine.camera.aspect;
      this.camera.updateProjectionMatrix();
    }

    // 相机跟随载体头部 + 借来的肺在呼吸（摄像头不呼吸，只有马达的匀速摆）
    this.breathT += dt * (this._fx?.breath ?? 1.1);
    const breathe = this._fx?.breath ? Math.sin(this.breathT * 2.2) : 0;
    this.current.viewPos(this._headPos);
    this._headPos.y += breathe * 0.012;
    const { yaw, pitch } = this.current.viewYawPitch();
    this.camera.position.lerp(this._headPos, Math.min(1, dt * 10));
    const qTarget = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      pitch + breathe * 0.005,
      yaw + Math.sin(this.breathT * 0.7) * 0.007,
      Math.sin(this.breathT * 1.1) * 0.005, 'YXZ'));
    this.camera.quaternion.slerp(qTarget, Math.min(1, dt * 6));
    this.engine.setCamera(this.camera);

    // 水压脉冲衰减
    this.plungeBurst = Math.max(0, this.plungeBurst - dt * 1.6);
    const dist = this.channels[this.index]?.dist ?? 16;

    // 暴露速率：F01 信道最深；离载体越近越深
    this.exposeRate = (this._fx?.expose ?? 0.5) * (0.6 + Math.max(0, 1 - dist / RANGE) * 0.8);

    // 标签：在听谁
    const name = this.current.label ?? '？？？';
    this.labelEl.textContent =
      `听潮 ${this.index + 1}/${Math.max(1, this.channels.length)} — ${name}`;
    this.signalEl.textContent = this.current.kind === 'camera'
      ? '线路 · 通'
      : `距离 ${dist.toFixed(1)}m`;

    // 后处理：水压畸变 + 心跳 + 轻色差（没有噪点，没有撕裂）
    this.engine.finalPass.uniforms.uPulse.value = 0.5 + this.plungeBurst * 0.5;
    this.engine.finalPass.uniforms.uAberration.value = 0.0022 + this.plungeBurst * 0.003;
    this.engine.finalPass.uniforms.uDistort.value = 0.14 + this.plungeBurst * 0.3 + breathe * 0.008;

    // 强制听潮倒计时
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
}
