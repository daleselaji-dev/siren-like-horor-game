// 《返潮》AI：还在上班的员工 + F01「井身者」+ 监控摄像头（听潮载体）
// 状态机：WORK/PATROL → SUSPECT → ALERT(追踪) → SEARCH → RETURN
// 设计（死魂曲精神 × F01 Canon）：不冲刺跳脸；维持岗位职责；被惊动后执着、永不忘记。
// F01 特有：6m 先读出"他只是个人"；2m 读出井；追逐 = 一个赶路的中年人快步走来——这才吓人。
import * as THREE from 'three';
import { Humanoid } from './humanoid.js';
import { F01Body } from './f01.js';
import { slideMove, hasLineOfSight } from '../world/collision.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

function angleWrap(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class Staff {
  /**
   * def: {
   *   id, label, kind: 'worker'|'patrol',
   *   role: humanoid role, tool, hair,
   *   workPos:[x,z], workMode, workYaw, waypoints:[[x,z]...],
   *   fov(度), sightRange, hearRange, chaseSpeed, walkSpeed, enabled
   * }
   */
  constructor(scene, world, M, def) {
    this.world = world;
    this.def = def;
    this.id = def.id;
    this.label = def.label;
    this.kind = def.kind;
    this.enabled = def.enabled !== false;

    this.body = this.makeBody(M, def);
    scene.add(this.body.group);
    this.body.group.visible = this.enabled;

    this.pos = new THREE.Vector3();
    if (def.workPos) this.pos.set(def.workPos[0], 0, def.workPos[1]);
    else if (def.waypoints) this.pos.set(def.waypoints[0][0], 0, def.waypoints[0][1]);
    this.pos.y = world.heightAt(this.pos.x, this.pos.z);
    this.yaw = def.yaw ?? 0;

    this.state = def.kind === 'patrol' ? 'PATROL' : 'WORK';
    this.wpIndex = 0;
    this.stateTimer = 0;
    this.pauseTimer = 8 + Math.random() * 10; // 偶尔停下来，像在听什么
    this.pausing = false;
    this.suspectPos = new THREE.Vector3();
    this.lastSeenPos = new THREE.Vector3();
    this.loseTimer = 0;
    this.permAlertBonus = 0;
    this.moveBlocked = 0;
    this.avoidSide = 1;
    this.stuckJiggle = 0;
    this.grabbing = false;
    this.vocalT = 0;
    this.searchLook = 0;
    this.searchRing = 0;

    this.fov = (def.fov ?? 75) * Math.PI / 180;
    this.sightRange = def.sightRange ?? 15;
    this.hearRange = def.hearRange ?? 12;
    this.walkSpeed = def.walkSpeed ?? 0.95;
    this.chaseSpeed = def.chaseSpeed ?? 2.7;

    this.visibilityOfPlayer = 0;
    this.syncBody(0);
  }

  makeBody(M, def) {
    return new Humanoid(M, {
      role: def.role ?? 'staff', tool: def.tool, hair: def.hair,
      flashlightOn: def.flashlightOn,
      seed: (def.id ?? '').split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0,
    });
  }

  setEnabled(on) {
    this.enabled = on;
    this.body.group.visible = on;
  }

  /** 检查点重试：复位（保留 permAlertBonus——他们记得你） */
  reset() {
    const def = this.def;
    if (def.workPos && this.kind !== 'patrol') this.pos.set(def.workPos[0], 0, def.workPos[1]);
    else if (def.waypoints) this.pos.set(def.waypoints[0][0], 0, def.waypoints[0][1]);
    this.pos.y = this.world.heightAt(this.pos.x, this.pos.z);
    this.state = this.kind === 'patrol' ? 'PATROL' : 'WORK';
    this.wpIndex = 0;
    this.stateTimer = 0;
    this.loseTimer = 0;
    this.searchTotal = 0;
    this.suspectMeter = 0;
    this.moveBlocked = 0;
    this.stuckJiggle = 0;
    this.grabbing = false;
    this.searchLook = 0;
    this.searchRing = 0;
    this.searchTarget = null;
    this.syncBody(0);
  }

  /** 听潮信道接口（借他的眼睛） */
  viewPos(out) {
    const v = this.body.headWorldPos(out);
    v.x += Math.sin(this.yaw) * 0.22;
    v.z += Math.cos(this.yaw) * 0.22;
    return v;
  }
  viewYawPitch() {
    const pitch = -(this.body.neck.rotation.x + this.body.torso.rotation.x) * 0.8;
    return { yaw: this.yaw + Math.PI, pitch };
  }

  senseSight(player, environmentFactor) {
    if (player.dead) return 0;
    const dx = player.pos.x - this.pos.x;
    const dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    let range = (this.sightRange + this.permAlertBonus) * environmentFactor;
    if (player.crouching) range *= 0.55;
    if (this.state === 'WORK' && !this.pausing) range *= 0.45; // 低头干活
    if (this.pausing) range *= 1.2;
    if (dist > range) return 0;
    const angTo = Math.atan2(dx, dz);
    const diff = Math.abs(angleWrap(angTo - this.yaw));
    const halfFov = this.fov / 2 * (this.state === 'ALERT' ? 1.5 : 1);
    if (diff > halfFov) return 0;
    _v1.set(this.pos.x, this.pos.y + 1.55, this.pos.z);
    _v2.copy(player.pos); _v2.y += player.crouching ? 0.8 : 1.5;
    if (!hasLineOfSight(_v1, _v2, this.world.colliders, null)) return 0;
    return Math.min(1, (1 - dist / range) * 1.6 + 0.15);
  }

  senseHearing(player) {
    if (player.dead || player.noiseLevel <= 0) return false;
    const dist = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    return dist < Math.min(player.noiseLevel, this.hearRange + this.permAlertBonus);
  }

  moveToward(tx, tz, speed, dt) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return 0;
    let dirX = dx / dist, dirZ = dz / dist;
    if (this.stuckJiggle > 0) {
      const px = -dirZ * this.avoidSide, pz = dirX * this.avoidSide;
      dirX = dirX * 0.35 + px * 0.65;
      dirZ = dirZ * 0.35 + pz * 0.65;
      this.stuckJiggle -= dt;
    }
    const targetYaw = Math.atan2(dirX, dirZ);
    this.yaw += angleWrap(targetYaw - this.yaw) * Math.min(1, dt * 6);

    const step = Math.min(speed * dt, dist);
    const beforeX = this.pos.x, beforeZ = this.pos.z;
    slideMove(this.pos, dirX * step, dirZ * step, 0.34, this.world.colliders, this.world.bounds, this.pos.y);
    const moved = Math.hypot(this.pos.x - beforeX, this.pos.z - beforeZ);
    if (moved < step * 0.3) {
      this.moveBlocked += dt;
      if (this.moveBlocked > 0.4) {
        this.stuckJiggle = 0.7;
        this.avoidSide = Math.random() < 0.5 ? -this.avoidSide : this.avoidSide;
        this.moveBlocked = 0;
      }
    } else {
      this.moveBlocked = Math.max(0, this.moveBlocked - dt);
    }
    this.pos.y = this.world.heightAt(this.pos.x, this.pos.z, this.pos.y);
    return dist - step;
  }

  faceToward(x, z, dt, rate = 5) {
    const targetYaw = Math.atan2(x - this.pos.x, z - this.pos.z);
    this.yaw += angleWrap(targetYaw - this.yaw) * Math.min(1, dt * rate);
  }

  /** @param ctx { player, dt, envSightFactor, audio, onCaught, onAlerted, noiseEvents } */
  update(ctx) {
    const { player, dt, audio } = ctx;
    if (!this.enabled) return;
    this.stateTimer += dt;

    // ---- 抓住演出 ----
    if (this.grabbing) {
      this.faceToward(player.pos.x, player.pos.z, dt, 14);
      const d = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
      if (d > 0.62) this.moveToward(player.pos.x, player.pos.z, 2.0, dt);
      this.body.animate('grab', dt, 1);
      this.syncBody(dt);
      return;
    }

    const sight = this.senseSight(player, ctx.envSightFactor);
    this.visibilityOfPlayer = sight;
    const heard = this.senseHearing(player);
    const distToPlayer = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);

    let noiseAt = null;
    for (const n of ctx.noiseEvents) {
      const d = Math.hypot(n.x - this.pos.x, n.z - this.pos.z);
      if (d < n.r + this.hearRange * 0.5) noiseAt = n;
    }

    let anim = 'idle';
    let animSpeed = 1;

    switch (this.state) {
      case 'WORK': {
        anim = this.def.workMode ?? 'idle';
        // 偶尔直起身，停一拍——像在听远处的什么
        this.pauseTimer -= dt;
        if (this.pausing) {
          anim = 'idle';
          this.yaw += dt * 0.18;
          if (this.pauseTimer < 0) { this.pausing = false; this.pauseTimer = 9 + Math.random() * 11; }
        } else if (this.pauseTimer < 0) {
          this.pausing = true;
          this.pauseTimer = 2.2 + Math.random() * 2;
        }
        if (this.def.workYaw !== undefined && !this.pausing) {
          this.yaw += angleWrap(this.def.workYaw - this.yaw) * Math.min(1, dt * 3);
        }
        if (sight > 0.5 || (sight > 0 && heard)) this.enterSuspect(player.pos, audio, distToPlayer);
        else if (heard || noiseAt) this.enterSuspect(noiseAt ?? player.pos, audio, distToPlayer);
        break;
      }
      case 'PATROL': {
        const wp = this.def.waypoints[this.wpIndex];
        const left = this.moveToward(wp[0], wp[1], this.walkSpeed, dt);
        anim = 'walk'; animSpeed = 0.9;
        if (left < 0.4) {
          this.wpIndex = (this.wpIndex + 1) % this.def.waypoints.length;
          if (Math.random() < 0.3) { this.state = 'PAUSE'; this.stateTimer = 0; }
        }
        if (sight > 0.5 || (sight > 0 && heard)) this.enterSuspect(player.pos, audio, distToPlayer);
        else if (heard || noiseAt) this.enterSuspect(noiseAt ?? player.pos, audio, distToPlayer);
        break;
      }
      case 'PAUSE': {
        anim = 'idle';
        if (this.stateTimer > 2 + Math.random()) this.state = 'PATROL';
        if (sight > 0.4 || heard || noiseAt) this.enterSuspect(noiseAt ?? player.pos, audio, distToPlayer);
        break;
      }
      case 'SUSPECT': {
        anim = 'alert';
        this.faceToward(this.suspectPos.x, this.suspectPos.z, dt, 4);
        if (sight > 0.25) this.suspectMeter += sight * dt * 1.7;
        else this.suspectMeter -= dt * 0.5;
        if (heard) this.suspectMeter += dt * 0.5;
        if (this.suspectMeter >= 1) this.enterAlert(player, audio, ctx.onAlerted);
        else if (this.suspectMeter <= 0 || this.stateTimer > 6) {
          this.state = this.kind === 'patrol' ? 'PATROL' : 'RETURN';
        }
        break;
      }
      case 'ALERT': {
        anim = 'chase'; animSpeed = 1.05;
        if (sight > 0 || distToPlayer < 4) {
          this.lastSeenPos.copy(player.pos);
          this.loseTimer = 0;
        } else {
          this.loseTimer += dt;
        }
        this.moveToward(this.lastSeenPos.x, this.lastSeenPos.z, this.chaseSpeed, dt);
        // 追赶时的声音：员工呵斥；F01 覆写为湿的呼吸
        this.vocalT -= dt;
        if (this.vocalT <= 0) {
          this.vocalT = 1.8 + Math.random() * 1.6;
          this.chaseVocal(audio, distToPlayer);
        }
        if (distToPlayer < 1.15 && !player.dead) ctx.onCaught(this);
        if (this.loseTimer > 5.5) {
          this.state = 'SEARCH'; this.stateTimer = 0;
          this.searchTotal = 0; this.searchRing = 0; this.searchLook = 0;
          this.searchTarget = null;
        }
        break;
      }
      case 'SEARCH': {
        this.searchTotal = (this.searchTotal ?? 0) + dt;
        if (!this.searchTarget) this.pickSearchPoint();
        if (this.searchLook > 0) {
          this.searchLook -= dt;
          anim = 'alert';
          this.yaw += Math.sin(this.stateTimer * 1.35) * dt * 1.15;
          if (this.searchLook <= 0) this.pickSearchPoint();
        } else {
          anim = 'walk'; animSpeed = 0.75;
          const left = this.moveToward(this.searchTarget.x, this.searchTarget.z, this.walkSpeed * 1.2, dt);
          if (left < 0.5 || this.stateTimer > 6) {
            this.searchLook = 1.3 + Math.random() * 1.4;
            this.stateTimer = 0;
          }
        }
        if (sight > 0.2) this.enterAlert(player, audio, ctx.onAlerted);
        else if (this.searchTotal > 15) {
          this.searchTotal = 0;
          this.state = this.kind === 'patrol' ? 'PATROL' : 'RETURN';
        }
        break;
      }
      case 'RETURN': {
        anim = 'walk'; animSpeed = 0.8;
        const wp = this.def.workPos ?? this.def.waypoints[0];
        const left = this.moveToward(wp[0], wp[1], this.walkSpeed, dt);
        if (left < 0.4) this.state = this.kind === 'patrol' ? 'PATROL' : 'WORK';
        if (sight > 0.4 || heard) this.enterSuspect(player.pos, audio, distToPlayer);
        break;
      }
    }

    this.body.animate(anim, dt, animSpeed);
    this.postUpdate(ctx, distToPlayer);
    this.syncBody(dt);
  }

  /** 子类扩展点 */
  postUpdate() {}
  chaseVocal(audio, dist) { audio?.alertShout?.(Math.max(6, dist)); }

  pickSearchPoint() {
    this.searchRing += 1;
    const a = Math.random() * Math.PI * 2;
    const r = 2 + this.searchRing * (1.2 + Math.random() * 1.2);
    this.searchTarget = {
      x: this.lastSeenPos.x + Math.sin(a) * r,
      z: this.lastSeenPos.z + Math.cos(a) * r,
    };
    this.stateTimer = 0;
  }

  enterSuspect(atPos, audio, distToPlayer) {
    if (this.state === 'ALERT' || this.state === 'SUSPECT') return;
    this.state = 'SUSPECT';
    this.stateTimer = 0;
    this.suspectMeter = 0.25;
    this.suspectPos.copy(atPos.isVector3 ? atPos : new THREE.Vector3(atPos.x, 0, atPos.z));
    audio?.suspect(distToPlayer);
  }

  enterAlert(player, audio, onAlerted) {
    if (this.state !== 'ALERT') {
      const dist = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
      audio?.alertShout(dist);
      this.permAlertBonus = Math.min(this.permAlertBonus + 3, 9);
      onAlerted?.(this);
    }
    this.state = 'ALERT';
    this.stateTimer = 0;
    this.loseTimer = 0;
    this.lastSeenPos.copy(player.pos);
  }

  hearAlarm(pos) {
    if (!this.enabled) return;
    if (this.state === 'ALERT') return;
    this.state = 'SUSPECT';
    this.stateTimer = 0;
    this.suspectMeter = 0.5;
    this.suspectPos.copy(pos);
  }

  syncBody(dt) {
    this.body.group.position.copy(this.pos);
    this.body.group.rotation.y = this.yaw;
  }
}

// ============================================================
// F01「井身者」王承海：维修工。
// 平时擦桌子/巡他的厅。6m 内第一次读出"人"，2m 内第一次读出"井"。
// 追逐 = 一个中年人快步走来，不喊。抓住 = 把你的头捧起来，凑近他的左眼。
// ============================================================
export class F01 extends Staff {
  constructor(scene, world, M, def) {
    super(scene, world, M, {
      fov: 92, sightRange: 14, hearRange: 13,
      walkSpeed: 0.9, chaseSpeed: 2.55,
      ...def,
      role: 'f01', kind: def.kind ?? 'worker',
    });
    this.read6 = false;   // 6m 读取已触发
    this.read2 = false;   // 2m 读取已触发
    this.onSixMeter = def.onSixMeter;
    this.onTwoMeter = def.onTwoMeter;
    this.wellsAwake = 0;
  }

  makeBody(M) {
    return new F01Body(M);
  }

  chaseVocal(audio, dist) {
    // 不喊。只有一声很近的、湿的吞咽。
    audio?.chaseGurgle?.(dist);
  }

  postUpdate(ctx, distToPlayer) {
    // 井的近距表现
    this.body.setEyeIntensity(this.state === 'ALERT' ? 3 : this.state === 'SUSPECT' ? 1.5 : 0.4);
    this.body.updateWells?.(distToPlayer, ctx.dt);
    // 6m / 2m 读取事件（每次靠近只触发一次，远离 10m 复位）
    if (distToPlayer > 10) { this.read6 = false; this.read2 = false; }
    if (!ctx.player.dead && this.enabled) {
      if (!this.read6 && distToPlayer < 6) {
        this.read6 = true;
        this.onSixMeter?.(this, distToPlayer);
      }
      if (!this.read2 && distToPlayer < 2.2) {
        this.read2 = true;
        this.onTwoMeter?.(this, distToPlayer);
      }
    }
  }
}

// ============================================================
// 监控摄像头：不动的眼睛（听潮载体 + 录像事件的机位）
// ============================================================
export class SecurityCamera {
  constructor(scene, world, M, def) {
    this.world = world;
    this.id = def.id;
    this.label = def.label ?? '监控';
    this.kind = 'camera';
    this.enabled = def.enabled !== false;
    this.visibilityOfPlayer = 0;
    this.state = null;

    this.pos = new THREE.Vector3(def.x, def.y ?? 2.5, def.z);
    this.baseYaw = def.yaw ?? 0;
    this.pitch = def.pitch ?? -0.35;
    this.panRange = def.panRange ?? 0.5;
    this.panSpeed = def.panSpeed ?? 0.14;
    this.yaw = this.baseYaw;
    this.t = Math.random() * 20;

    // 外形：墙装小盒 + 镜头筒 + 待机红点
    this.group = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.3), M.plastic);
    box.castShadow = true;
    this.group.add(box);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.1, 12), M.plasticDark);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, -0.01, 0.18);
    this.group.add(lens);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6), M.standby);
    dot.position.set(0.05, 0.05, 0.16);
    this.group.add(dot);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 8), M.steelWorn);
    arm.position.set(0, 0.14, -0.06);
    this.group.add(arm);
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    this.group.rotation.x = -this.pitch * 0.6;
    scene.add(this.group);
  }

  setEnabled(on) { this.enabled = on; this.group.visible = on; }
  reset() {}
  hearAlarm() {}

  viewPos(out) {
    const v = out ?? new THREE.Vector3();
    v.copy(this.pos);
    v.x += Math.sin(this.yaw) * 0.3;
    v.z += Math.cos(this.yaw) * 0.3;
    v.y -= 0.05;
    return v;
  }
  viewYawPitch() {
    return { yaw: this.yaw + Math.PI, pitch: this.pitch };
  }

  update(ctx) {
    this.t += ctx.dt;
    // 缓慢左右巡摆（老监控的马达声）
    this.yaw = this.baseYaw + Math.sin(this.t * this.panSpeed * Math.PI) * this.panRange;
    this.group.rotation.y = this.yaw;
  }
}
