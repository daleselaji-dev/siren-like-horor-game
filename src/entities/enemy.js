// 潮尸 AI：劳作型 / 巡游型 / 歌唱者 + 村犬 + 海鸟群（视奸载体）
// 状态机：WORK/PATROL → SUSPECT → ALERT(追踪) → SEARCH → RETURN
// 设计要点（死魂曲精神）：不冲刺跳脸；维持生前劳作；被惊动后执着、永不忘记（警戒范围永久上调）
import * as THREE from 'three';
import { Humanoid } from './humanoid.js';
import { slideMove, hasLineOfSight } from '../world/collision.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

function angleWrap(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class Enemy {
  /**
   * def: {
   *   id, label, kind: 'worker'|'patrol'|'singer',
   *   workPos:[x,z], workMode, waypoints:[[x,z]...],
   *   cloth, hat, lantern, tool, fov(度), sightRange, hearRange, chaseSpeed, walkSpeed,
   *   enabled: 初始是否激活
   * }
   */
  constructor(scene, world, M, def) {
    this.world = world;
    this.def = def;
    this.id = def.id;
    this.label = def.label;
    this.kind = def.kind;
    this.enabled = def.enabled !== false;

    this.body = new Humanoid(M, {
      cloth: def.cloth, hat: def.hat, lantern: def.lantern, tool: def.tool,
      light: def.lanternLight,
    });
    scene.add(this.body.group);
    this.body.group.visible = this.enabled;

    this.pos = new THREE.Vector3();
    if (def.workPos) this.pos.set(def.workPos[0], 0, def.workPos[1]);
    else if (def.waypoints) this.pos.set(def.waypoints[0][0], 0, def.waypoints[0][1]);
    this.pos.y = world.heightAt(this.pos.x, this.pos.z);
    this.yaw = def.yaw ?? 0;

    this.state = def.kind === 'patrol' ? 'PATROL' : def.kind === 'singer' ? 'SING' : 'WORK';
    this.wpIndex = 0;
    this.stateTimer = 0;
    this.gazeTimer = 5 + Math.random() * 8; // 劳作者抬头望海计时
    this.gazing = false;
    this.suspectPos = new THREE.Vector3();
    this.lastSeenPos = new THREE.Vector3();
    this.loseTimer = 0;
    this.permAlertBonus = 0;    // 永不忘记：每次警报永久+
    this.moveBlocked = 0;
    this.avoidSide = 1;
    this.stuckJiggle = 0;

    // 参数
    this.fov = (def.fov ?? 75) * Math.PI / 180;
    this.sightRange = def.sightRange ?? 17;
    this.hearRange = def.hearRange ?? 14;
    this.walkSpeed = def.walkSpeed ?? 0.95;
    this.chaseSpeed = def.chaseSpeed ?? 2.9;

    this.visibilityOfPlayer = 0; // 供 HUD 显示危险度
    this.body.setEyeIntensity(0.7);
    this.syncBody(0);
  }

  setEnabled(on) {
    this.enabled = on;
    this.body.group.visible = on;
  }

  /** 检查点重试：复位位置与状态（保留 permAlertBonus——永不忘记） */
  reset() {
    const def = this.def;
    if (def.workPos && this.kind !== 'patrol') this.pos.set(def.workPos[0], 0, def.workPos[1]);
    else if (def.waypoints) this.pos.set(def.waypoints[0][0], 0, def.waypoints[0][1]);
    this.pos.y = this.world.heightAt(this.pos.x, this.pos.z);
    this.state = this.kind === 'patrol' ? 'PATROL' : this.kind === 'singer' ? 'SING' : 'WORK';
    this.wpIndex = 0;
    this.stateTimer = 0;
    this.loseTimer = 0;
    this.searchTotal = 0;
    this.suspectMeter = 0;
    this.moveBlocked = 0;
    this.stuckJiggle = 0;
    this.syncBody(0);
  }

  /** 视奸信道接口 */
  viewPos(out) {
    return this.body.headWorldPos(out);
  }
  viewYawPitch() {
    // 头部朝向 = 身体朝向 + 颈部俯仰
    const pitch = -(this.body.neck.rotation.x + this.body.torso.rotation.x) * 0.8;
    return { yaw: this.yaw + Math.PI, pitch }; // 人形面向 +z, 相机看 -z → 转半圈
  }

  /** 感知玩家：返回可见强度 0..1 */
  senseSight(player, environmentFactor) {
    if (player.dead) return 0;
    const dx = player.pos.x - this.pos.x;
    const dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    let range = (this.sightRange + this.permAlertBonus) * environmentFactor;
    if (player.crouching) range *= 0.55;
    // 劳作低头时视野打折；凝望时增强
    if (this.state === 'WORK' && !this.gazing) range *= 0.45;
    if (this.gazing) range *= 1.25;
    if (dist > range) return 0;
    // 视锥
    const angTo = Math.atan2(dx, dz);
    const diff = Math.abs(angleWrap(angTo - this.yaw));
    const halfFov = this.fov / 2 * (this.state === 'ALERT' ? 1.5 : 1);
    if (diff > halfFov) return 0;
    // 遮挡
    _v1.set(this.pos.x, this.pos.y + 1.55, this.pos.z);
    _v2.copy(player.pos); _v2.y += player.crouching ? 0.8 : 1.5;
    if (!hasLineOfSight(_v1, _v2, this.world.colliders, this.world.heightAt)) return 0;
    // 越近越清楚
    return Math.min(1, (1 - dist / range) * 1.6 + 0.15);
  }

  senseHearing(player) {
    if (player.dead || player.noiseLevel <= 0) return false;
    const dist = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    return dist < Math.min(player.noiseLevel, this.hearRange + this.permAlertBonus);
  }

  /** 移动到目标点，带避障；返回剩余距离 */
  moveToward(tx, tz, speed, dt) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return 0;
    let dirX = dx / dist, dirZ = dz / dist;
    // 卡住时侧向绕行
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
    this.pos.y = this.world.heightAt(this.pos.x, this.pos.z);
    return dist - step;
  }

  faceToward(x, z, dt, rate = 5) {
    const targetYaw = Math.atan2(x - this.pos.x, z - this.pos.z);
    this.yaw += angleWrap(targetYaw - this.yaw) * Math.min(1, dt * rate);
  }

  /**
   * @param ctx { player, dt, envSightFactor, audio, onCaught, onAlerted, noiseEvents:[{x,z,r}] }
   */
  update(ctx) {
    const { player, dt, audio } = ctx;
    if (!this.enabled) return;
    this.stateTimer += dt;

    const sight = this.kind === 'singer' ? 0 : this.senseSight(player, ctx.envSightFactor);
    this.visibilityOfPlayer = sight;
    const heard = this.kind === 'singer' ? false : this.senseHearing(player);
    const distToPlayer = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);

    // 外部噪音事件
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
        // 周期性直起身"望海"
        this.gazeTimer -= dt;
        if (this.gazing) {
          anim = 'idle';
          this.yaw += dt * 0.25; // 缓缓扫视
          if (this.gazeTimer < 0) { this.gazing = false; this.gazeTimer = 7 + Math.random() * 9; }
        } else if (this.gazeTimer < 0) {
          this.gazing = true;
          this.gazeTimer = 2.5 + Math.random() * 2;
        }
        if (this.def.workYaw !== undefined && !this.gazing) {
          this.yaw += angleWrap(this.def.workYaw - this.yaw) * Math.min(1, dt * 3);
        }
        if (sight > 0.5 || (sight > 0 && heard)) this.enterSuspect(player.pos, audio, distToPlayer, player);
        else if (heard || noiseAt) this.enterSuspect(noiseAt ?? player.pos, audio, distToPlayer, player);
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
        if (sight > 0.5 || (sight > 0 && heard)) this.enterSuspect(player.pos, audio, distToPlayer, player);
        else if (heard || noiseAt) this.enterSuspect(noiseAt ?? player.pos, audio, distToPlayer, player);
        break;
      }
      case 'PAUSE': {
        anim = 'idle';
        if (this.stateTimer > 2 + Math.random()) this.state = 'PATROL';
        if (sight > 0.4 || heard || noiseAt) this.enterSuspect(noiseAt ?? player.pos, audio, distToPlayer, player);
        break;
      }
      case 'SUSPECT': {
        anim = 'alert';
        this.faceToward(this.suspectPos.x, this.suspectPos.z, dt, 4);
        // 持续看到 → 警报；否则回归
        if (sight > 0.25) {
          this.suspectMeter += sight * dt * 1.7;
        } else {
          this.suspectMeter -= dt * 0.5;
        }
        if (heard) this.suspectMeter += dt * 0.5;
        if (this.suspectMeter >= 1) this.enterAlert(player, audio, ctx.onAlerted);
        else if (this.suspectMeter <= 0 || this.stateTimer > 6) {
          this.state = this.kind === 'patrol' ? 'PATROL' : 'RETURN';
        }
        break;
      }
      case 'ALERT': {
        anim = 'chase'; animSpeed = 1.1;
        if (sight > 0 || distToPlayer < 4) {
          this.lastSeenPos.copy(player.pos);
          this.loseTimer = 0;
        } else {
          this.loseTimer += dt;
        }
        this.moveToward(this.lastSeenPos.x, this.lastSeenPos.z, this.chaseSpeed, dt);
        // 抓住玩家
        if (distToPlayer < 1.15 && !player.dead) ctx.onCaught(this);
        // 丢失目标
        if (this.loseTimer > 5.5) { this.state = 'SEARCH'; this.stateTimer = 0; }
        break;
      }
      case 'SEARCH': {
        anim = 'walk'; animSpeed = 0.7;
        // 在最后目击点附近徘徊
        if (!this.searchTarget || this.stateTimer > 3) {
          this.stateTimer = 0;
          this.searchTarget = {
            x: this.lastSeenPos.x + (Math.random() - 0.5) * 10,
            z: this.lastSeenPos.z + (Math.random() - 0.5) * 10,
          };
        }
        this.moveToward(this.searchTarget.x, this.searchTarget.z, this.walkSpeed * 1.15, dt);
        this.searchTotal = (this.searchTotal ?? 0) + dt;
        if (sight > 0.2) this.enterAlert(player, audio, ctx.onAlerted);
        else if (this.searchTotal > 9) {
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
        if (sight > 0.4 || heard) this.enterSuspect(player.pos, audio, distToPlayer, player);
        break;
      }
      case 'SING': {
        anim = 'sing';
        // 歌唱者沿路点极缓慢游荡，永不追
        if (this.def.waypoints) {
          const wp = this.def.waypoints[this.wpIndex];
          const left = this.moveToward(wp[0], wp[1], 0.55, dt);
          if (left < 0.5) this.wpIndex = (this.wpIndex + 1) % this.def.waypoints.length;
          anim = distToPlayer < 20 ? 'sing' : 'walk';
          if (anim === 'walk') animSpeed = 0.5;
        }
        break;
      }
    }

    // 眼点亮度
    const eyeTarget = this.state === 'ALERT' ? 3.2 : this.state === 'SUSPECT' ? 1.8 : 0.7;
    this._eye = (this._eye ?? 0.7) + (eyeTarget - (this._eye ?? 0.7)) * Math.min(1, dt * 6);
    this.body.setEyeIntensity(this._eye);

    this.body.animate(anim, dt, animSpeed);
    this.syncBody(dt);
  }

  enterSuspect(atPos, audio, distToPlayer, player) {
    if (this.state === 'ALERT' || this.state === 'SUSPECT') return;
    this.state = 'SUSPECT';
    this.stateTimer = 0;
    this.suspectMeter = 0.25;
    this.suspectPos.copy(atPos.x !== undefined && atPos.isVector3 ? atPos : new THREE.Vector3(atPos.x, 0, atPos.z));
    audio?.suspect(distToPlayer);
  }

  enterAlert(player, audio, onAlerted) {
    if (this.state !== 'ALERT') {
      const dist = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
      audio?.alertShout(dist);
      this.permAlertBonus = Math.min(this.permAlertBonus + 3, 9); // 永不忘记
      onAlerted?.(this);
    }
    this.state = 'ALERT';
    this.stateTimer = 0;
    this.loseTimer = 0;
    this.lastSeenPos.copy(player.pos);
  }

  /** 被同伴警报呼叫 */
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

// ---------------- 村犬（非敌对视奸载体） ----------------
export class Dog {
  constructor(scene, world, M, def) {
    this.world = world;
    this.def = def;
    this.id = def.id;
    this.label = def.label;
    this.kind = 'dog';
    this.enabled = true;
    this.visibilityOfPlayer = 0;

    const fur = new THREE.MeshStandardMaterial({ color: 0x4a423a, roughness: 0.95 });
    this.group = new THREE.Group();
    const mk = (geo, x, y, z, sx = 1, sy = 1, sz = 1) => {
      const m = new THREE.Mesh(geo, fur);
      m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true;
      this.group.add(m);
      return m;
    };
    mk(new THREE.BoxGeometry(0.22, 0.24, 0.62), 0, 0.38, 0);
    this.headM = mk(new THREE.BoxGeometry(0.16, 0.16, 0.22), 0, 0.52, 0.36);
    mk(new THREE.BoxGeometry(0.05, 0.09, 0.05), -0.05, 0.64, 0.32);
    mk(new THREE.BoxGeometry(0.05, 0.09, 0.05), 0.05, 0.64, 0.32);
    this.legs = [
      mk(new THREE.BoxGeometry(0.06, 0.3, 0.06), -0.08, 0.15, 0.22),
      mk(new THREE.BoxGeometry(0.06, 0.3, 0.06), 0.08, 0.15, 0.22),
      mk(new THREE.BoxGeometry(0.06, 0.3, 0.06), -0.08, 0.15, -0.22),
      mk(new THREE.BoxGeometry(0.06, 0.3, 0.06), 0.08, 0.15, -0.22),
    ];
    this.tail = mk(new THREE.BoxGeometry(0.045, 0.045, 0.3), 0, 0.46, -0.42);
    // 狗眼也有一点冷光——它也被腌住了
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 6), M.eyeGlow);
    eye.position.set(-0.04, 0.54, 0.47); this.group.add(eye);
    const eye2 = eye.clone(); eye2.position.x = 0.04; this.group.add(eye2);
    scene.add(this.group);

    this.pos = new THREE.Vector3(def.waypoints[0][0], 0, def.waypoints[0][1]);
    this.yaw = 0;
    this.wpIndex = 0;
    this.phase = 0;
    this.waitTimer = 0;
  }

  setEnabled(on) { this.enabled = on; this.group.visible = on; }

  viewPos(out) {
    const v = out ?? new THREE.Vector3();
    return this.headM.getWorldPosition(v);
  }
  viewYawPitch() { return { yaw: this.yaw + Math.PI, pitch: -0.1 }; }

  update(ctx) {
    const { dt, player } = ctx;
    const distP = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    if (distP < 4) {
      // 站定，盯着玩家看——不叫，只是看
      const targetYaw = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
      this.yaw += angleWrap(targetYaw - this.yaw) * Math.min(1, dt * 5);
      this.phase *= 0.9;
    } else if (this.waitTimer > 0) {
      this.waitTimer -= dt;
    } else {
      const wp = this.def.waypoints[this.wpIndex];
      const dx = wp[0] - this.pos.x, dz = wp[1] - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.4) {
        this.wpIndex = (this.wpIndex + 1) % this.def.waypoints.length;
        this.waitTimer = 2 + Math.random() * 5;
      } else {
        const speed = 0.8;
        const targetYaw = Math.atan2(dx, dz);
        this.yaw += angleWrap(targetYaw - this.yaw) * Math.min(1, dt * 5);
        slideMove(this.pos, (dx / dist) * speed * dt, (dz / dist) * speed * dt, 0.2,
          this.world.colliders, this.world.bounds, this.pos.y);
        this.phase += dt * 9;
      }
    }
    this.pos.y = this.world.heightAt(this.pos.x, this.pos.z);
    // 腿部小跑动画
    for (let i = 0; i < 4; i++) {
      this.legs[i].rotation.x = Math.sin(this.phase + (i % 2) * Math.PI) * 0.5 * Math.min(1, this.phase % 1 + 0.5);
    }
    this.tail.rotation.y = Math.sin(this.phase * 0.7) * 0.2;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
  }
}

// ---------------- 海鸟群（高空俯瞰视奸载体） ----------------
export class BirdFlock {
  constructor(scene, world, def) {
    this.world = world;
    this.id = def.id;
    this.label = def.label;
    this.kind = 'birds';
    this.enabled = true;
    this.visibilityOfPlayer = 0;
    this.center = new THREE.Vector3(def.center[0], def.height, def.center[1]);
    this.radius = def.radius;
    this.angle = 0;

    // 一群小三角
    const mat = new THREE.MeshBasicMaterial({ color: 0x2a2f33, side: THREE.DoubleSide });
    const geo = new THREE.ConeGeometry(0.25, 0.7, 3);
    this.birds = [];
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Mesh(geo, mat);
      b.rotation.x = Math.PI / 2;
      scene.add(b);
      this.birds.push({ mesh: b, off: i * 0.7, r: this.radius + (i % 3) * 3, h: (i % 4) * 1.5 });
    }
    this.pos = new THREE.Vector3();
  }

  setEnabled(on) { this.enabled = on; this.birds.forEach(b => b.mesh.visible = on); }

  viewPos(out) {
    const v = out ?? new THREE.Vector3();
    return v.copy(this.pos);
  }
  viewYawPitch() {
    // 朝圆心俯视
    const yaw = Math.atan2(this.center.x - this.pos.x, this.center.z - this.pos.z) + Math.PI;
    return { yaw, pitch: -0.72 };
  }

  update(ctx) {
    this.angle += ctx.dt * 0.11;
    for (const b of this.birds) {
      const a = this.angle + b.off;
      b.mesh.position.set(
        this.center.x + Math.cos(a) * b.r,
        this.center.y + b.h + Math.sin(a * 2.3) * 1.2,
        this.center.z + Math.sin(a) * b.r
      );
      b.mesh.rotation.z = -a;
      // 翅膀扑动（缩放模拟）
      b.mesh.scale.x = 1 + Math.sin(a * 14) * 0.5;
    }
    const lead = this.birds[0].mesh.position;
    this.pos.copy(lead);
  }
}
