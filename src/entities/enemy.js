// 蚀湾实体 AI：核册工位（报数员/侍应/理册婆）+ 镇民/渔民 + 镇犬 + 海鸟群（视奸载体）
// 状态机：WORK/PATROL → SUSPECT → ALERT(追踪) → SEARCH → RETURN
// 设计要点（死魂曲精神）：不冲刺跳脸；维持职守；被惊动后执着、永不忘记（警戒范围永久上调）
// 特殊实体：浮客(非敌对漂浮宾客)、回眸客(非敌对指针)、上宾(房间尺度前肢，感知振动)
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

/** 点到线段距离（XZ 平面）——贝灰线判定 */
function distToSeg(px, pz, l) {
  const dx = l.x2 - l.x1, dz = l.z2 - l.z1;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((px - l.x1) * dx + (pz - l.z1) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (l.x1 + dx * t), pz - (l.z1 + dz * t));
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
    this.fxKind = def.fxKind;  // 视奸滤镜风格（waiter 等）
    this.enabled = def.enabled !== false;

    this.body = new Humanoid(M, {
      role: def.role, cloth: def.cloth, hat: def.hat, lantern: def.lantern, tool: def.tool,
      light: def.lanternLight, seed: (def.id ?? '').split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0,
    });
    scene.add(this.body.group);
    this.body.group.visible = this.enabled;
    this.floorY = def.floorY; // 多层建筑内的所在楼层（高度解析参照）

    // 歌唱者：歌声可视化——从她喉咙里荡出去的涟漪
    if (def.kind === 'singer') {
      this.songFx = new THREE.Group();
      const ringGeo = new THREE.RingGeometry(0.94, 1.0, 40);
      ringGeo.rotateX(-Math.PI / 2);
      this.songRings = [];
      for (let i = 0; i < 3; i++) {
        const rm = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
          color: 0xb84052, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false,
          side: THREE.DoubleSide, fog: false,
        }));
        rm.renderOrder = 6;
        this.songFx.add(rm);
        this.songRings.push(rm);
      }
      this.songFx.visible = this.enabled;
      scene.add(this.songFx);
      this.songT = 0;
    }

    this.pos = new THREE.Vector3();
    if (def.workPos) this.pos.set(def.workPos[0], 0, def.workPos[1]);
    else if (def.waypoints) this.pos.set(def.waypoints[0][0], 0, def.waypoints[0][1]);
    this.pos.y = this.floorY !== undefined
      ? world.heightAt(this.pos.x, this.pos.z, this.floorY + 0.5)
      : world.heightAt(this.pos.x, this.pos.z);
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
    this.grabbing = false;      // 抓住玩家演出中
    this.gurgleT = 0;           // 追击喉音计时
    this.searchLook = 0;        // 搜索张望计时
    this.searchRing = 0;        // 搜索圈数（越搜越大）
    this.stunT = 0;             // 镁光定身剩余秒
    this.stunDur = 0;
    this.limeStall = 0;         // 贝灰线前的僵持秒

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
    if (this.songFx) this.songFx.visible = on;
  }

  /** 检查点重试：复位位置与状态（保留 permAlertBonus——永不忘记） */
  reset() {
    const def = this.def;
    if (def.workPos && this.kind !== 'patrol') this.pos.set(def.workPos[0], 0, def.workPos[1]);
    else if (def.waypoints) this.pos.set(def.waypoints[0][0], 0, def.waypoints[0][1]);
    this.pos.y = this.floorY !== undefined
      ? this.world.heightAt(this.pos.x, this.pos.z, this.floorY + 0.5)
      : this.world.heightAt(this.pos.x, this.pos.z);
    this.state = this.kind === 'patrol' ? 'PATROL' : this.kind === 'singer' ? 'SING' : 'WORK';
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
    this.stunT = 0;
    this.limeStall = 0;
    this.syncBody(0);
  }

  /** 视奸信道接口（向面朝方向前移，避免看到自己的头模型） */
  viewPos(out) {
    const v = this.body.headWorldPos(out);
    v.x += Math.sin(this.yaw) * 0.22;
    v.z += Math.cos(this.yaw) * 0.22;
    return v;
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
    // 遮挡（地形采样带自身楼层参考——多层楼内不许把楼上楼板当地形）
    _v1.set(this.pos.x, this.pos.y + 1.55, this.pos.z);
    _v2.copy(player.pos); _v2.y += player.crouching ? 0.8 : 1.5;
    if (!hasLineOfSight(_v1, _v2, this.world.colliders, (x, z) => this.world.heightAt(x, z, this.pos.y))) return 0;
    // 越近越清楚
    return Math.min(1, (1 - dist / range) * 1.6 + 0.15);
  }

  senseHearing(player) {
    if (player.dead || player.noiseLevel <= 0) return false;
    // 楼层间衰减：隔一层楼板，声音要翻好几倍距离才传得到
    const dy = Math.abs(player.pos.y - this.pos.y);
    const dist = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z)
      + (dy > 1.8 ? dy * 4 : 0);
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
    this.pos.y = this.world.heightAt(this.pos.x, this.pos.z, this.pos.y);
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

    // ---- 抓住演出：贴上来，掐住，别的什么都不做 ----
    if (this.grabbing) {
      this.faceToward(player.pos.x, player.pos.z, dt, 14);
      const d = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
      if (d > 0.62) this.moveToward(player.pos.x, player.pos.z, 2.2, dt);
      this._eye = 4;
      this.body.setEyeIntensity(4);
      this.body.animate('grab', dt, 1);
      this.syncBody(dt);
      return;
    }

    // ---- 镁光定身：看见闪光的人捂着眼，愣在原地 ----
    if (this.stunT > 0) {
      this.stunT -= dt;
      this.visibilityOfPlayer = 0;
      const recoil = (this.stunDur - this.stunT) < 0.8;
      this.body.animate(recoil ? 'backstep' : 'idle', dt, recoil ? 1.2 : 0.4);
      this.yaw += Math.sin(this.stateTimer * 0.9) * dt * 0.3; // 晃着脑袋等视野回来
      this._eye = 0.15; // 眼点几乎熄灭——看不见
      this.body.setEyeIntensity(0.15);
      this.syncBody(dt);
      return;
    }

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
        // 贝灰线：追到界前站定——它们对「界」比对你更认真
        const lime = this.limeAhead(this.lastSeenPos.x, this.lastSeenPos.z);
        if (lime) {
          anim = 'alert';
          this.faceToward(this.lastSeenPos.x, this.lastSeenPos.z, dt, 6);
          this.limeStall += dt;
          if (this.limeStall > 2.8) {
            // 僵持够久：认了。只肯在界这一侧筛
            this.limeStall = 0;
            this.lastSeenPos.copy(this.pos);
            this.state = 'SEARCH'; this.stateTimer = 0;
            this.searchTotal = 0; this.searchRing = 0; this.searchLook = 0;
            this.searchTarget = null;
            break;
          }
        } else {
          this.limeStall = Math.max(0, this.limeStall - dt);
          this.moveToward(this.lastSeenPos.x, this.lastSeenPos.z, this.chaseSpeed, dt);
        }
        // 追击声：侍应无声（只有托盘沉积面的细响），镇民是喘着追
        if (!this.def.mute) {
          this.gurgleT -= dt;
          if (this.gurgleT <= 0) {
            this.gurgleT = 1.8 + Math.random() * 1.6;
            audio?.chaseGurgle?.(distToPlayer);
          }
        }
        // 抓住玩家（须在同一层，且没被界拦住）
        if (!lime && distToPlayer < 1.15 && Math.abs(player.pos.y - this.pos.y) < 1.7 && !player.dead) ctx.onCaught(this);
        // 丢失目标
        if (this.loseTimer > 5.5) {
          this.state = 'SEARCH'; this.stateTimer = 0;
          this.searchTotal = 0; this.searchRing = 0; this.searchLook = 0;
          this.searchTarget = null;
        }
        break;
      }
      case 'SEARCH': {
        // 执着的筛查：围着最后目击点一圈圈找，走到点上就站定张望
        this.searchTotal = (this.searchTotal ?? 0) + dt;
        if (!this.searchTarget) this.pickSearchPoint();
        if (this.searchLook > 0) {
          this.searchLook -= dt;
          anim = 'idle';
          this.yaw += Math.sin(this.stateTimer * 1.35) * dt * 1.15; // 缓慢左右扫头
          if (this.searchLook <= 0) this.pickSearchPoint();
        } else if (this.limeAhead(this.searchTarget.x, this.searchTarget.z)) {
          anim = 'idle';
          this.pickSearchPoint(); // 这一点在界外——换一处筛
        } else {
          anim = 'walk'; animSpeed = 0.75;
          const left = this.moveToward(this.searchTarget.x, this.searchTarget.z, this.walkSpeed * 1.2, dt);
          if (left < 0.5 || this.stateTimer > 6) {
            this.searchLook = 1.3 + Math.random() * 1.4;
            this.stateTimer = 0;
          }
        }
        if (sight > 0.2) this.enterAlert(player, audio, ctx.onAlerted);
        else if (this.searchTotal > 16) {
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
        // 歌声涟漪：一圈圈荡到共鸣半径的边上
        if (this.songFx) {
          this.songT += dt;
          this.songFx.position.set(this.pos.x, this.pos.y + 1.35, this.pos.z);
          for (let i = 0; i < this.songRings.length; i++) {
            const t = (this.songT * 0.22 + i / this.songRings.length) % 1;
            const s = 0.6 + t * 16.4;
            this.songRings[i].scale.set(s, 1, s);
            this.songRings[i].material.opacity = (1 - t) * (1 - t) * 0.28;
          }
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

  /** 搜索点：绕最后目击点螺旋外扩 */
  pickSearchPoint() {
    this.searchRing += 1;
    const a = Math.random() * Math.PI * 2;
    const r = 2.5 + this.searchRing * (1.4 + Math.random() * 1.4);
    this.searchTarget = {
      x: this.lastSeenPos.x + Math.sin(a) * r,
      z: this.lastSeenPos.z + Math.cos(a) * r,
    };
    this.stateTimer = 0;
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

  /** 镁光定身：看见闪光——捂眼、断追踪（泡过的眼睛不太吃光：flashK 打折） */
  flashStun(sec) {
    if (!this.enabled || this.grabbing) return;
    sec *= this.def.flashK ?? 1;
    this.stunT = this.stunDur = Math.max(this.stunT, sec);
    this.stateTimer = 0;
    if (this.state === 'ALERT' || this.state === 'SUSPECT') {
      // 视野白掉的那几秒你跑了——醒来后只会围着自己站的地方筛
      if (this.state === 'SUSPECT') this.lastSeenPos.copy(this.pos);
      this.state = 'SEARCH';
      this.searchTotal = 0; this.searchRing = 0;
      this.searchLook = 0; this.searchTarget = null;
      this.loseTimer = 0;
      this.suspectMeter = 0;
    }
  }

  /** 闹钟诱饵：注意力被钓到一点——绕着它一圈圈筛 */
  lureTo(x, z) {
    if (!this.enabled || this.grabbing || this.stunT > 0) return;
    if (this.state === 'ALERT') {
      if (this.visibilityOfPlayer > 0) return; // 正看着你的人骗不走
      this.lastSeenPos.set(x, this.pos.y, z);
      return;
    }
    this.lastSeenPos.set(x, this.pos.y, z);
    this.state = 'SEARCH';
    this.stateTimer = 0; this.searchTotal = 0; this.searchRing = 0;
    this.searchLook = 0; this.searchTarget = null;
    this.suspectMeter = 0;
  }

  /** 贝灰线判定：脚下或去路一步之内有界 → 返回该线（湿客不认界——它们已经不守规矩了） */
  limeAhead(tx, tz) {
    if (this.def.ignoreLime) return null;
    const lines = this.world.dynamic.limeLines;
    if (!lines || !lines.length) return null;
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const nx = this.pos.x + (dx / d) * 0.6, nz = this.pos.z + (dz / d) * 0.6;
    for (const l of lines) {
      if (Math.abs(l.y - this.pos.y) > 1.6) continue;
      if (distToSeg(nx, nz, l) < 0.5 || distToSeg(this.pos.x, this.pos.z, l) < 0.42) return l;
    }
    return null;
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
    this.pos.y = this.world.heightAt(this.pos.x, this.pos.z, this.pos.y);
    // 腿部小跑动画
    for (let i = 0; i < 4; i++) {
      this.legs[i].rotation.x = Math.sin(this.phase + (i % 2) * Math.PI) * 0.5 * Math.min(1, this.phase % 1 + 0.5);
    }
    this.tail.rotation.y = Math.sin(this.phase * 0.7) * 0.2;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
  }
}

// ---------------- 望海者（滩涂尽头站在水里的人） ----------------
// 不巡逻、不追人、不说话。只是站着，面向海。
// 血潮之后再看——他们全体转过身来，面向村子。
export class Watcher {
  constructor(scene, world, M, def) {
    this.world = world;
    this.id = def.id;
    this.label = def.label ?? '望海的人';
    this.kind = 'watcher';
    this.enabled = true;
    this.visibilityOfPlayer = 0;
    this.body = new Humanoid(M, { cloth: def.cloth ?? 'grey', seed: def.seed });
    scene.add(this.body.group);
    this.pos = new THREE.Vector3(def.x, 0, def.z);
    this.pos.y = world.heightAt(def.x, def.z);
    this.yaw = def.yaw ?? 0;
    this._turned = false;
    this.targetYaw = this.yaw;
    this.body.group.position.copy(this.pos);
    this.body.group.rotation.y = this.yaw;
  }

  setEnabled(on) { this.enabled = on; this.body.group.visible = on; }

  viewPos(out) {
    const v = this.body.headWorldPos(out);
    v.x += Math.sin(this.yaw) * 0.22;
    v.z += Math.cos(this.yaw) * 0.22;
    return v;
  }
  viewYawPitch() { return { yaw: this.yaw + Math.PI, pitch: -0.03 }; }

  update(ctx) {
    const { dt } = ctx;
    // 验户（返潮点火）之后：一夜之间换了姿势
    if (ctx.leaked && !this._turned) {
      this._turned = true;
      this.targetYaw = this.yaw + Math.PI;
    }
    this.yaw += angleWrap(this.targetYaw - this.yaw) * Math.min(1, dt * 0.5);
    this.body.animate('watch', dt, 1);
    this.body.group.rotation.y = this.yaw;
  }
}

// ---------------- 浮客（脚尖离地半寸的宾客·非敌对·视奸载体） ----------------
// 他们真心来吃这顿还地饭。只是脚忘了落地。
export class Floater {
  constructor(scene, world, M, def) {
    this.world = world;
    this.id = def.id;
    this.label = def.label ?? '宾客';
    this.kind = 'floater';
    this.enabled = def.enabled !== false;
    this.visibilityOfPlayer = 0;
    this.body = new Humanoid(M, { role: def.role ?? 'guest_m', seed: def.seed });
    scene.add(this.body.group);
    this.body.group.visible = this.enabled;
    this.spots = def.spots; // [Vector3...] 漂移锚点
    this.spotIdx = def.startIdx ?? 0;
    this.pos = new THREE.Vector3().copy(this.spots[this.spotIdx]);
    this.floorY = def.floorY ?? this.pos.y;
    this.pos.y = world.heightAt(this.pos.x, this.pos.z, this.floorY + 0.5);
    this.yaw = Math.random() * Math.PI * 2;
    this.t = Math.random() * 10;
    this.waitT = Math.random() * 6;
  }

  setEnabled(on) { this.enabled = on; this.body.group.visible = on; }

  viewPos(out) {
    const v = this.body.headWorldPos(out);
    v.x += Math.sin(this.yaw) * 0.22;
    v.z += Math.cos(this.yaw) * 0.22;
    return v;
  }
  viewYawPitch() { return { yaw: this.yaw + Math.PI, pitch: -0.06 }; }

  update(ctx) {
    if (!this.enabled) return;
    const { dt } = ctx;
    this.t += dt;
    if (this.waitT > 0) {
      this.waitT -= dt;
    } else {
      const target = this.spots[this.spotIdx];
      const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.3) {
        this.spotIdx = (this.spotIdx + 1) % this.spots.length;
        this.waitT = 4 + Math.random() * 7;
      } else {
        // 匀速滑移——不是走，是被端着挪
        const sp = 0.3;
        this.pos.x += (dx / dist) * sp * dt;
        this.pos.z += (dz / dist) * sp * dt;
        const targetYaw = Math.atan2(dx, dz);
        this.yaw += angleWrap(targetYaw - this.yaw) * Math.min(1, dt * 1.5);
      }
    }
    const ground = this.world.heightAt(this.pos.x, this.pos.z, this.floorY + 0.5);
    this.pos.y = ground; // Humanoid float 动画自带离地半寸
    this.body.animate('float', dt, 1);
    this.body.group.position.copy(this.pos);
    this.body.group.rotation.y = this.yaw;
  }
}

// ---------------- 回眸客（半透明多重曝光·非敌对指针） ----------------
// 一位不断回头看向某处的宾客残影。他看哪里，哪里就是你该去/该躲开的地方。
export class Gaze {
  constructor(scene, world, M, def) {
    this.world = world;
    this.id = def.id;
    this.label = def.label ?? '回眸的人';
    this.kind = 'gaze';
    this.enabled = false;
    this.visibilityOfPlayer = 0;
    this.group = new THREE.Group();
    this.echoes = [];
    for (let i = 0; i < 3; i++) {
      const h = new Humanoid(M, { role: 'guest_f', seed: (def.seed ?? 77) + i * 13, ghost: true });
      h.group.position.set(i * 0.06, 0, -i * 0.09);
      this.group.add(h.group);
      this.echoes.push(h);
    }
    this.group.visible = false;
    scene.add(this.group);
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.lookTarget = new THREE.Vector3();
    this.t = 0;
  }

  setEnabled(on) { this.enabled = on; this.group.visible = on; }

  /** 摆到一个位置，回眸指向 target */
  appearAt(x, z, target, floorY) {
    this.pos.set(x, this.world.heightAt(x, z, (floorY ?? 0) + 0.5), z);
    this.lookTarget.copy(target);
    this.group.position.copy(this.pos);
    this.setEnabled(true);
  }

  viewPos(out) {
    const v = this.echoes[0].headWorldPos(out);
    return v;
  }
  viewYawPitch() {
    const yaw = Math.atan2(this.lookTarget.x - this.pos.x, this.lookTarget.z - this.pos.z) + Math.PI;
    return { yaw, pitch: -0.04 };
  }

  update(ctx) {
    if (!this.enabled) return;
    const { dt } = ctx;
    this.t += dt;
    // 身体背对目标，头部回眸——三重残影相位错开
    const toward = Math.atan2(this.lookTarget.x - this.pos.x, this.lookTarget.z - this.pos.z);
    this.yaw = toward + Math.PI; // 身体背向
    this.group.rotation.y = this.yaw;
    for (let i = 0; i < this.echoes.length; i++) {
      const h = this.echoes[i];
      h.animate('watch', dt, 1);
      // 回眸：脖子拧向目标（超过常人角度一点点）
      const phase = Math.sin(this.t * 0.6 - i * 0.5);
      h.neck.rotation.y = 2.35 + phase * 0.12 + i * 0.1;
      h.torso.rotation.y = 0.5 + i * 0.06;
    }
  }
}

// ---------------- 上宾（房间尺度外板重组的前肢·板间无肉） ----------------
// 空间自己长出来的手：衣柜门板、床板、门框板在挑空里连成一条前肢，
// 板与板之间没有任何东西，却一起动。它没有眼睛——它听楼板的振动。
export class HonoredGuest {
  constructor(scene, world, M, def) {
    this.world = world;
    this.id = def.id;
    this.label = def.label ?? '上宾';
    this.kind = 'guest';
    this.enabled = false;
    this.visibilityOfPlayer = 0;
    this.state = null; // 不参与常规威胁度
    this.area = def.area;               // {minX,maxX,minZ,maxZ} 可及范围（大堂）
    this.shoulder = new THREE.Vector3(def.shoulder[0], def.shoulder[1], def.shoulder[2]);
    this.anchors = def.anchors.map((a) => new THREE.Vector3(a[0], a[1], a[2]));
    this.anchorIdx = 0;
    this.hand = new THREE.Vector3().copy(this.anchors[0]);
    this.handTarget = new THREE.Vector3().copy(this.anchors[0]);
    this.creakT = 0;
    this.nameT = 0; // 被点名进度（贴近玩家时上涨）

    this.group = new THREE.Group();
    const mats = [M.veneerRed, M.woodDark, M.driftwood, M.veneer];
    // 臂：8 节板，沿肩→手贝塞尔摆放
    this.armPanels = [];
    for (let i = 0; i < 8; i++) {
      const w = 1.7 - i * 0.12, h = 0.09, d = 0.8 - i * 0.05;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[i % mats.length]);
      m.castShadow = true;
      this.group.add(m);
      this.armPanels.push(m);
    }
    // 手：4 指，每指 2 板
    this.fingers = [];
    for (let f = 0; f < 4; f++) {
      const seg1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.42), mats[(f + 1) % mats.length]);
      const seg2 = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.42, 0.34), mats[(f + 2) % mats.length]);
      seg1.castShadow = seg2.castShadow = true;
      this.group.add(seg1, seg2);
      this.fingers.push({ seg1, seg2, ang: (f / 3 - 0.5) * 1.5 });
    }
    this.group.visible = false;
    scene.add(this.group);
    this.pos = this.hand; // 供距离判断
  }

  setEnabled(on) {
    this.enabled = on;
    this.group.visible = on;
  }

  reset() {
    this.hand.copy(this.anchors[0]);
    this.handTarget.copy(this.anchors[0]);
    this.nameT = 0;
  }

  update(ctx) {
    if (!this.enabled) return;
    const { dt, player, audio } = ctx;
    const vib = ctx.vibration ?? 0;

    // 目标：振动大 → 循声压向玩家；否则沿锚点缓慢巡摸
    const inArea = player.pos.x >= this.area.minX && player.pos.x <= this.area.maxX
      && player.pos.z >= this.area.minZ && player.pos.z <= this.area.maxZ
      && Math.abs(player.pos.y - this.hand.y) < 2.5;
    if (vib > 0.5 && inArea && !player.dead) {
      this.handTarget.set(
        Math.max(this.area.minX, Math.min(this.area.maxX, player.pos.x)),
        player.pos.y,
        Math.max(this.area.minZ, Math.min(this.area.maxZ, player.pos.z)));
    } else {
      const a = this.anchors[this.anchorIdx];
      if (this.hand.distanceTo(a) < 0.5) this.anchorIdx = (this.anchorIdx + 1) % this.anchors.length;
      this.handTarget.copy(this.anchors[this.anchorIdx]);
    }
    const speed = vib > 0.5 ? 1.9 : 0.75;
    const d = this.handTarget.clone().sub(this.hand);
    const dist = d.length();
    if (dist > 0.05) {
      d.multiplyScalar(Math.min(1, (speed * dt) / dist));
      this.hand.add(d);
      this.creakT -= dt;
      if (this.creakT <= 0) {
        this.creakT = 0.9 + Math.random() * 1.3;
        audio?.woodStrain?.(this.hand.distanceTo(player.pos));
      }
    }

    // 点名：手贴近玩家 → 数拍子；或振动满格直接点名
    const dp = Math.hypot(player.pos.x - this.hand.x, player.pos.z - this.hand.z);
    if (!player.dead && inArea && (dp < 1.35 || vib >= 0.98)) {
      this.nameT += dt;
      if (this.nameT > 0.4) ctx.onCaught?.(this);
    } else {
      this.nameT = Math.max(0, this.nameT - dt);
    }

    // ---- 摆件：肩→手 贝塞尔，板间留缝 ----
    const s = this.shoulder, hnd = this.hand;
    const ctrl = _v1.set((s.x + hnd.x) / 2, Math.max(s.y, hnd.y + 2.6), (s.z + hnd.z) / 2);
    for (let i = 0; i < this.armPanels.length; i++) {
      const t = (i + 0.5) / this.armPanels.length;
      const it = 1 - t;
      // 二次贝塞尔
      const px = it * it * s.x + 2 * it * t * ctrl.x + t * t * hnd.x;
      const py = it * it * s.y + 2 * it * t * ctrl.y + t * t * hnd.y;
      const pz = it * it * s.z + 2 * it * t * ctrl.z + t * t * hnd.z;
      const p = this.armPanels[i];
      p.position.set(px, py, pz);
      // 板面朝向沿切线，微微各自错开（板间无肉——没有统一的骨）
      const tx = 2 * it * (ctrl.x - s.x) + 2 * t * (hnd.x - ctrl.x);
      const ty = 2 * it * (ctrl.y - s.y) + 2 * t * (hnd.y - ctrl.y);
      const tz = 2 * it * (ctrl.z - s.z) + 2 * t * (hnd.z - ctrl.z);
      p.rotation.set(
        Math.atan2(-ty, Math.hypot(tx, tz)) + Math.sin(i * 2.7) * 0.1,
        Math.atan2(tx, tz) + Math.sin(i * 1.3) * 0.14,
        Math.sin(i * 3.9 + t * 4) * 0.12
      );
    }
    // 手指扒地
    const gy = this.world.heightAt(hnd.x, hnd.z, hnd.y + 0.5);
    for (const f of this.fingers) {
      const fx = hnd.x + Math.sin(f.ang) * 0.72;
      const fz = hnd.z + Math.cos(f.ang) * 0.72;
      f.seg1.position.set(hnd.x + Math.sin(f.ang) * 0.35, gy + 0.62, hnd.z + Math.cos(f.ang) * 0.35);
      f.seg1.rotation.set(0.5, f.ang, 0);
      f.seg2.position.set(fx, gy + 0.2, fz);
      f.seg2.rotation.set(1.15, f.ang, 0);
    }
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
