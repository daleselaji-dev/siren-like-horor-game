// 潜行聚合系统：噪音事件总线 + 威胁度(HUD/音乐) + 地面振动（上宾感知）
// 振动规则：硬地（水磨石/瓷砖）走动传远；红毯减振；蹲行几乎无振。
export class StealthSystem {
  constructor(world, player) {
    this.world = world;
    this.player = player;
    this.noiseEvents = [];      // {x,z,r,ttl}
    this.danger = 0;            // 0..1 被怀疑/追踪程度（驱动 HUD 红边与音乐）
    this.chaseCount = 0;
    this.vibration = 0;         // 0..1 地面振动累积（满 → 被上宾点名）
    this.vibrationActive = false; // 上宾在场时开启
    this.envSightFactor = 1;    // 渗漏态浓雾时略降
  }

  emitNoise(x, z, r) {
    this.noiseEvents.push({ x, z, r, ttl: 0.6 });
  }

  /** 玩家当前是否踩在减振地面（大堂红毯等） */
  onDampSurface() {
    const rects = this.world.dynamic.dampRects ?? [];
    const p = this.player.pos;
    for (const r of rects) {
      if (p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ) return true;
    }
    return false;
  }

  update(dt, enemies) {
    // 噪音事件老化
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

    // 地面振动：上宾在场时，走动往楼板里灌振动
    if (this.vibrationActive && !this.player.dead) {
      const moving = this.player.noiseLevel > 0.5;
      if (moving) {
        let rate = this.player.crouching ? 0.045 : 0.24;
        if (this.onDampSurface()) rate *= 0.18;   // 红毯吃掉振动
        this.vibration = Math.min(1, this.vibration + rate * dt);
      } else {
        this.vibration = Math.max(0, this.vibration - dt * 0.14);
      }
    } else {
      this.vibration = Math.max(0, this.vibration - dt * 0.3);
    }
  }
}
