// 潜行聚合系统：噪音事件总线 + 威胁度(HUD/音乐) + 歌唱者共鸣 + 芦苇隐蔽
import * as THREE from 'three';

export class StealthSystem {
  constructor(world, player) {
    this.world = world;
    this.player = player;
    this.noiseEvents = [];      // {x,z,r,ttl}
    this.danger = 0;            // 0..1 被怀疑/追踪程度（驱动 HUD 红边与音乐）
    this.chaseCount = 0;
    this.resonance = 0;         // 0..1 歌唱者共鸣（满 → 强制视奸崩溃）
    this.resonanceActive = false;
    this.envSightFactor = 1;    // 血潮浓雾时 0.75
    this.inReeds = 0;           // 0..1 身在苇丛的深度（不计蹲姿）
    this.concealment = 0;       // 0..1 有效隐蔽度（蹲下才吃满）
  }

  emitNoise(x, z, r) {
    this.noiseEvents.push({ x, z, r, ttl: 0.6 });
  }

  update(dt, enemies, singer) {
    // 噪音事件老化
    for (const n of this.noiseEvents) n.ttl -= dt;
    this.noiseEvents = this.noiseEvents.filter((n) => n.ttl > 0);

    // 芦苇隐蔽：蹲进苇丛，轮廓被苇秆吃掉大半——他们的眼睛认人形，不认草
    {
      let deep = 0;
      const clusters = this.world.locations?.reedClusters;
      if (clusters && !this.player.dead) {
        for (const c of clusters) {
          const d = Math.hypot(c.x - this.player.pos.x, c.z - this.player.pos.z);
          if (d < c.r + 1.0) deep = Math.max(deep, Math.min(1, 1 - (d - c.r * 0.5) / (c.r * 0.5 + 1.0)));
        }
      }
      this.inReeds = deep;
      // 站着只有下半身遮着；蹲下整个人沉进苇海
      this.concealment = deep * (this.player.crouching ? 1 : 0.3);
    }

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

    // 歌唱者共鸣：靠近歌声 → 共鸣涨；远离 → 慢慢退
    if (singer && singer.enabled && this.resonanceActive && !this.player.dead) {
      const dist = Math.hypot(singer.pos.x - this.player.pos.x, singer.pos.z - this.player.pos.z);
      const R = 17;
      if (dist < R) {
        // 蹲下捂住耳朵？不行——歌是从喉咙里进来的。只有拉开距离。
        const rate = (1 - dist / R) * 0.16 * (this.player.crouching ? 0.8 : 1);
        this.resonance = Math.min(1, this.resonance + rate * dt * 60 * 0.016);
      } else {
        this.resonance = Math.max(0, this.resonance - dt * 0.09);
      }
    } else {
      this.resonance = Math.max(0, this.resonance - dt * 0.15);
    }
  }
}
