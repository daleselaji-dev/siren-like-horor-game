// 雨夜：跟随相机的雨丝（LineSegments 流条）——蚀湾整夜下着一场不肯变大的雨。
// 雨滴在「遮蔽矩形」（车站雨棚/牌坊/岗亭等）内重生时隐藏，棚下不穿帮；
// 室内（酒店/海洋馆/祠殿）整体关闭。
import * as THREE from 'three';

const _v = new THREE.Vector3();

export class Rain {
  constructor(scene, { lowspec = false, covers = [] } = {}) {
    this.covers = covers;
    this.count = lowspec ? 260 : 720;
    this.area = 26;           // 以相机为中心的雨箱边长
    this.top = 13;            // 雨箱高度
    this.len = 0.62;          // 雨丝长度（快门拖影）
    const n = this.count;
    this.pos = new Float32Array(n * 6);
    this.spd = new Float32Array(n);
    this.x = new Float32Array(n);
    this.z = new Float32Array(n);
    this.y = new Float32Array(n);
    this.hid = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      this.x[i] = (Math.random() - 0.5) * this.area;
      this.z[i] = (Math.random() - 0.5) * this.area;
      this.y[i] = Math.random() * this.top;
      this.spd[i] = 8.5 + Math.random() * 3.5;
    }
    const geo = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.attr);
    const mat = new THREE.LineBasicMaterial({
      color: 0x9fb4ba, transparent: true, opacity: lowspec ? 0.26 : 0.34,
      depthWrite: false, fog: true,
    });
    this.mesh = new THREE.LineSegments(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    scene.add(this.mesh);
    // 风向：雨丝统一斜一点——垂直的雨是舞台雨
    this.windX = 0.14; this.windZ = 0.05;
    this._camY = 0;
  }

  /** 室内判定：矩形组内不下雨 */
  _indoor(world, x, z) {
    const rects = [];
    const HI = world.dynamic?.hotelInfo;
    if (HI?.footprint) rects.push(HI.footprint);
    if (HI?.annexRect) rects.push(HI.annexRect);
    if (world.dynamic?.aquaMainRect) rects.push(world.dynamic.aquaMainRect);
    if (world.zones?.temple) rects.push(world.zones.temple);
    for (const r of rects) {
      if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return true;
    }
    return false;
  }

  update(dt, camera, world) {
    camera.getWorldPosition(_v);
    const indoor = this._indoor(world, _v.x, _v.z);
    this.mesh.visible = !indoor;
    if (indoor) return;
    const n = this.count, A = this.area, half = A / 2;
    const cx = _v.x, cz = _v.z;
    const floorY = _v.y - 2.4;
    for (let i = 0; i < n; i++) {
      this.y[i] -= this.spd[i] * dt;
      this.x[i] += this.windX * this.spd[i] * dt * 0.32;
      this.z[i] += this.windZ * this.spd[i] * dt * 0.32;
      if (this.y[i] < 0) {
        // 重生：回到顶部换个位置；查遮蔽矩形（棚/檐下不出现雨丝）
        this.y[i] += this.top;
        this.x[i] = (Math.random() - 0.5) * A;
        this.z[i] = (Math.random() - 0.5) * A;
        const wx = cx + this.x[i], wz = cz + this.z[i];
        this.hid[i] = 0;
        for (const c of this.covers) {
          if (wx >= c.minX && wx <= c.maxX && wz >= c.minZ && wz <= c.maxZ) { this.hid[i] = 1; break; }
        }
      }
      const o = i * 6;
      if (this.hid[i]) {
        this.pos[o] = this.pos[o + 1] = this.pos[o + 2] = 0;
        this.pos[o + 3] = this.pos[o + 4] = this.pos[o + 5] = 0;
        continue;
      }
      // 环绕包裹：相机移动时雨箱跟着走
      let lx = this.x[i], lz = this.z[i];
      if (lx > half) { lx -= A; this.x[i] = lx; } else if (lx < -half) { lx += A; this.x[i] = lx; }
      if (lz > half) { lz -= A; this.z[i] = lz; } else if (lz < -half) { lz += A; this.z[i] = lz; }
      const wy = floorY + this.y[i];
      this.pos[o] = cx + lx;
      this.pos[o + 1] = wy;
      this.pos[o + 2] = cz + lz;
      this.pos[o + 3] = cx + lx - this.windX * this.len;
      this.pos[o + 4] = wy + this.len;
      this.pos[o + 5] = cz + lz - this.windZ * this.len;
    }
    this.attr.needsUpdate = true;
  }
}
