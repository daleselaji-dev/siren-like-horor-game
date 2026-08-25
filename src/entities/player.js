// 第一人称控制器：WASD + 潜行 + 圆形碰撞体贴 AABB 滑动 + 地形高度 + 头部摆动
import * as THREE from 'three';
import { slideMove } from '../world/collision.js';

const STAND_EYE = 1.62;
const CROUCH_EYE = 0.92;
const WALK_SPEED = 3.6;
const CROUCH_SPEED = 1.7;
const RADIUS = 0.38;

export class Player {
  constructor(camera, input, world, audio) {
    this.camera = camera;
    this.input = input;
    this.world = world;   // { heightAt(x,z), colliders:[{minX,maxX,minZ,maxZ,minY?,maxY?}], waterLevel() }
    this.audio = audio;

    this.pos = new THREE.Vector3(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.crouching = false;
    this.eyeH = STAND_EYE;
    this.bobPhase = 0;
    this.moveAmt = 0;          // 0-1 当前移动幅度（供潜行系统）
    this.frozen = false;       // 演出/视奸/死亡时锁定
    this.noiseLevel = 0;       // 当前发出的噪音半径（供 AI 听觉）
    this.stepTimer = 0;
    this.dead = false;
    this.inWaterDepth = 0;
  }

  setPosition(x, z, yaw = 0, yHint) {
    this.pos.set(x, this.world.heightAt(x, z, yHint), z);
    this.yaw = yaw;
    this.pitch = 0;
    this.syncCamera(0);
  }

  update(dt) {
    if (this.frozen) { this.moveAmt = 0; this.noiseLevel = 0; this.syncCamera(dt); return; }
    const inp = this.input;

    // 视角
    const m = inp.consumeMouse();
    const sens = 0.0023;
    this.yaw -= m.x * sens;
    this.pitch -= m.y * sens;
    this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch));

    // 潜行
    this.crouching = inp.down('ShiftLeft') || inp.down('ShiftRight') || inp.down('KeyC');
    const targetEye = this.crouching ? CROUCH_EYE : STAND_EYE;
    this.eyeH += (targetEye - this.eyeH) * Math.min(1, dt * 9);

    // 移动
    let fx = 0, fz = 0;
    if (inp.down('KeyW')) fz += 1;
    if (inp.down('KeyS')) fz -= 1;
    if (inp.down('KeyA')) fx -= 1;
    if (inp.down('KeyD')) fx += 1;
    const len = Math.hypot(fx, fz);
    let speed = this.crouching ? CROUCH_SPEED : WALK_SPEED;

    // 水深减速
    const waterD = Math.max(0, this.world.waterLevel() - this.world.heightAt(this.pos.x, this.pos.z, this.pos.y));
    this.inWaterDepth = waterD;
    if (waterD > 0.25) speed *= Math.max(0.45, 1 - waterD * 0.5);

    if (len > 0) {
      fx /= len; fz /= len;
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      const dx = (fx * cos - fz * sin) * speed * dt;
      const dz = (-fx * sin - fz * cos) * speed * dt;
      this.moveCollide(dx, dz);
      this.moveAmt = Math.min(1, speed / WALK_SPEED);
      this.bobPhase += dt * (this.crouching ? 7 : 10.5);

      // 脚步声与噪音（按地面材质：水洼溅 / 滩涂沙 / 石板叩 / 红毯闷 / 瓷砖脆）
      const gh = this.world.heightAt(this.pos.x, this.pos.z, this.pos.y);
      const surface = waterD > 0.06 ? 'wet'
        : (this.world.surfaceAt?.(this.pos.x, this.pos.z, this.pos.y)
          ?? (gh > 2.1 ? 'stone' : 'sand'));
      this.surface = surface;
      this.stepTimer -= dt * speed;
      if (this.stepTimer <= 0) {
        this.stepTimer = 2.0;
        this.audio?.footstep(this.crouching ? 0.35 : 1.0, surface);
      }
      // 噪音半径：红毯吃声，瓷砖/水磨石传远
      const surfNoise = surface === 'carpet' ? 0.6 : surface === 'tile' ? 1.35 : surface === 'wet' ? 1.6 : 1;
      this.noiseLevel = (this.crouching ? 3.5 : 9) * surfNoise;
    } else {
      this.moveAmt = 0;
      this.noiseLevel = 0;
      this.bobPhase *= 0.9;
    }

    // 贴地（多层高度：以当前高度为参考选层）
    const gy = this.world.heightAt(this.pos.x, this.pos.z, this.pos.y);
    this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 12);

    this.syncCamera(dt);
  }

  moveCollide(dx, dz) {
    slideMove(this.pos, dx, dz, RADIUS, this.world.colliders, this.world.bounds, this.pos.y);
  }

  syncCamera(dt) {
    const bobY = Math.sin(this.bobPhase * 2) * 0.035 * this.moveAmt;
    const bobX = Math.cos(this.bobPhase) * 0.02 * this.moveAmt;
    this.camera.position.set(
      this.pos.x + bobX * Math.cos(this.yaw),
      this.pos.y + this.eyeH + bobY,
      this.pos.z - bobX * Math.sin(this.yaw)
    );
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch);
    // 移动时轻微滚转（湿滑感）
    this.camera.rotateZ(Math.sin(this.bobPhase) * 0.006 * this.moveAmt);
  }

  /** 视线方向 */
  forward() {
    return new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );
  }

  get headPos() {
    return new THREE.Vector3(this.pos.x, this.pos.y + this.eyeH, this.pos.z);
  }
}
