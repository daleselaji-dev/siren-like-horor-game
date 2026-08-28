// 碰撞与视线工具：圆形动体 vs AABB/圆柱 静态碰撞；2.5D 视线检测
// 碰撞体格式：
//   AABB: { minX, maxX, minZ, maxZ, maxY?, minY? }   maxY 顶面高；minY 底面高（多层楼：楼上的墙不挡楼下的人）
//   圆柱: { x, z, r, maxY?, minY? }
//   noCollide: 仅遮挡视线不阻挡移动（楼板等）；noSightBlock: 仅阻挡移动不遮视线（栏杆等）

/** 圆形动体滑动移动，返回新位置（原地修改 pos） */
export function slideMove(pos, dx, dz, radius, colliders, bounds, footY = 0) {
  const fits = (nx, nz) => {
    for (const c of colliders) {
      if (c.off) continue;                                         // 关闭中的碰撞体（异化态路线切换）
      if (c.noCollide) continue;                                   // 仅视线遮挡体
      if (c.maxY !== undefined && footY > c.maxY - 0.15) continue; // 站得比它高 → 可跨
      if (c.minY !== undefined && footY + 1.55 < c.minY) continue; // 整个人在它下面 → 可从下方通过
      if (c.r !== undefined) {
        const ddx = nx - c.x, ddz = nz - c.z;
        const rr = c.r + radius;
        if (ddx * ddx + ddz * ddz < rr * rr) return false;
      } else {
        const cx = Math.max(c.minX, Math.min(nx, c.maxX));
        const cz = Math.max(c.minZ, Math.min(nz, c.maxZ));
        const ddx = nx - cx, ddz = nz - cz;
        if (ddx * ddx + ddz * ddz < radius * radius) return false;
      }
    }
    return true;
  };
  const nx = pos.x + dx;
  if (fits(nx, pos.z)) pos.x = nx;
  const nz = pos.z + dz;
  if (fits(pos.x, nz)) pos.z = nz;
  if (bounds) {
    pos.x = Math.max(bounds.minX, Math.min(bounds.maxX, pos.x));
    pos.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, pos.z));
  }
}

/** 2D 线段与 AABB 相交 */
function segAABB(ax, az, bx, bz, c) {
  let tmin = 0, tmax = 1;
  const dx = bx - ax, dz = bz - az;
  // X 轴
  if (Math.abs(dx) < 1e-8) {
    if (ax < c.minX || ax > c.maxX) return false;
  } else {
    let t1 = (c.minX - ax) / dx, t2 = (c.maxX - ax) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  // Z 轴
  if (Math.abs(dz) < 1e-8) {
    if (az < c.minZ || az > c.maxZ) return false;
  } else {
    let t1 = (c.minZ - az) / dz, t2 = (c.maxZ - az) / dz;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return { t: tmin };
}

/** 2D 线段与圆相交 */
function segCircle(ax, az, bx, bz, c) {
  const dx = bx - ax, dz = bz - az;
  const fx = ax - c.x, fz = az - c.z;
  const a = dx * dx + dz * dz;
  const b = 2 * (fx * dx + fz * dz);
  const cc = fx * fx + fz * fz - c.r * c.r;
  let disc = b * b - 4 * a * cc;
  if (disc < 0) return false;
  disc = Math.sqrt(disc);
  const t1 = (-b - disc) / (2 * a);
  if (t1 >= 0 && t1 <= 1) return { t: t1 };
  const t2 = (-b + disc) / (2 * a);
  if (t2 >= 0 && t2 <= 1) return { t: t2 };
  return false;
}

/**
 * 视线检测（2.5D）：
 * a, b: {x,y,z} 眼睛位置；被墙(碰撞体, 且 maxY 高于视线)或地形遮挡返回 false
 */
export function hasLineOfSight(a, b, colliders, heightAt) {
  const ax = a.x, az = a.z, bx = b.x, bz = b.z;
  for (const c of colliders) {
    if (c.off) continue;
    if (c.noSightBlock) continue;
    const hit = c.r !== undefined ? segCircle(ax, az, bx, bz, c) : segAABB(ax, az, bx, bz, c);
    if (hit) {
      const topY = c.maxY ?? Infinity;
      const botY = c.minY ?? -Infinity;
      if (c.slab) {
        // 水平楼板：视线在其 XZ 覆盖内竖直跨过楼板高度带 → 遮挡
        const yLo = Math.min(a.y, b.y), yHi = Math.max(a.y, b.y);
        if (yHi > botY && yLo < topY) return false;
      } else {
        // 墙体：相交点处的视线高度落在墙的高度带内 → 遮挡
        const eyeY = a.y + (b.y - a.y) * hit.t;
        if (topY > eyeY - 0.1 && botY < eyeY + 0.1) return false;
      }
    }
  }
  // 地形遮挡：沿线采样
  if (heightAt) {
    const dist = Math.hypot(bx - ax, bz - az);
    const steps = Math.min(24, Math.max(4, Math.floor(dist / 3)));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      const eyeY = a.y + (b.y - a.y) * t;
      if (heightAt(x, z) > eyeY + 0.12) return false;
    }
  }
  return true;
}
