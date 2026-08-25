// 潜行聚合系统：噪音事件总线 + 威胁度(HUD/音乐) + 听潮暴露
// 暴露（原共鸣槽）：听潮时缓涨——听 F01 的信道涨得最快；
// 涨满 = 他在井底察觉了你——强制反向听潮（他借你的眼），然后他知道你在哪。
import * as THREE from 'three';

export class StealthSystem {
  constructor(world, player) {
    this.world = world;
    this.player = player;
    this.noiseEvents = [];      // {x,z,r,ttl}
    this.danger = 0;            // 0..1 被怀疑/追踪程度
    this.chaseCount = 0;
    this.resonance = 0;         // 0..1 听潮暴露（HUD 槽沿用 resonance 命名）
    this.envSightFactor = 1;    // 压力锋面时 AI 视力打折
  }

  emitNoise(x, z, r) {
    this.noiseEvents.push({ x, z, r, ttl: 0.6 });
  }

  /**
   * @param enemies 有 state 的 AI 列表
   * @param sightjack 听潮系统（读 exposeRate）
   */
  update(dt, enemies, sightjack) {
    for (const n of this.noiseEvents) n.ttl -= dt;
    this.noiseEvents = this.noiseEvents.filter((n) => n.ttl > 0);

    // 威胁度
    let d = 0;
    let chases = 0;
    for (const e of enemies) {
      if (!e.enabled || !e.state) continue;
      if (e.state === 'ALERT') { d = Math.max(d, 1); chases++; }
      else if (e.state === 'SUSPECT') d = Math.max(d, 0.45 + (e.suspectMeter ?? 0) * 0.4);
      else if (e.visibilityOfPlayer > 0) d = Math.max(d, e.visibilityOfPlayer * 0.35);
    }
    this.chaseCount = chases;
    this.danger += (d - this.danger) * Math.min(1, dt * (d > this.danger ? 6 : 1.2));

    // 听潮暴露：听着就涨；断开慢慢退
    if (sightjack?.active && !this.player.dead) {
      this.resonance = Math.min(1, this.resonance + (sightjack.exposeRate ?? 0.4) * dt * 0.055);
    } else {
      this.resonance = Math.max(0, this.resonance - dt * 0.06);
    }
  }
}
