// 反击工具系统：三件有限资源工具——都不是武器，只买时间
//   ① 海鸥牌旧相机(F)：镁光泡闪一下，看见光的人捂眼愣住、追踪断线
//   ② 发条闹钟(G)：上弦搁在地上走开；它替你在别处响
//   ③ 贝灰线(V)：理骨的灰。倒一道界，履职的人不肯踩过去——它们对「界」比对你更认真
import * as THREE from 'three';
import { hasLineOfSight } from '../world/collision.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class ToolsSystem {
  constructor({ scene, engine, player, world, stealth, hud, audio, enemies, guest }) {
    this.scene = scene;
    this.engine = engine;
    this.player = player;
    this.world = world;
    this.stealth = stealth;
    this.hud = hud;
    this.audio = audio;
    this.enemies = enemies;
    this.guest = guest; // 上宾（主压迫）——三件工具对它有专门的规矩

    this.hasCamera = false;
    this.bulbs = 0;
    this.clocks = 0;
    this.lime = 0;

    // 手提录音机 + 对照磁带（轮11 箱庭）：磁带在「它录下的地方」放，能听出对不上的那一处
    this.hasRecorder = false;
    this.tapesOwned = [];   // {id,label,spot,r,lines,compare,hint,done}
    this.tapePlayT = 0;     // 回放冷却（一盘放完才能放下一盘）
    this.tapeCycle = 0;
    this.onTapeMatch = null; // (id)=>void 由剧情侧接：解锁奖励点

    this.flashVal = 0;        // 叠加到后处理 uFlash
    this.flashCd = 0;         // 换泡时间
    this.activeClocks = [];   // {mesh,x,z,y,t,phase:'wind'|'ring'|'dead',trill}
    this.limeLines = [];      // {x1,z1,x2,z2,y,ttl,mesh}
    world.dynamic.limeLines = this.limeLines; // 敌人 AI 读这份

    // 材质：贝灰线（干白、微微返光——夜里也读得出一道界）
    this.limeMat = new THREE.MeshStandardMaterial({
      color: 0xe8e6da, roughness: 0.95,
      emissive: 0x55534a, emissiveIntensity: 0.5,
    });
  }

  // ---------- 拾取 ----------
  pickupCamera(bulbs = 2) {
    this.hasCamera = true;
    this.bulbs += bulbs;
    this.syncHud();
  }
  addBulbs(n) { this.bulbs += n; this.syncHud(); }
  addClocks(n) { this.clocks += n; this.syncHud(); }
  addLime(n) { this.lime += n; this.syncHud(); }
  pickupRecorder() { this.hasRecorder = true; this.syncHud(); }
  addTape(t) { this.tapesOwned.push({ ...t, done: false }); this.syncHud(); }

  syncHud() {
    this.hud.setTools({
      camera: this.hasCamera, bulbs: this.bulbs, clocks: this.clocks, lime: this.lime,
      recorder: this.hasRecorder, tapes: this.tapesOwned.filter((t) => !t.done).length,
      fuses: this.power?.spare ?? 0, fusesEver: this.power?.everPulled ?? false,
    });
  }

  // ---------- ④ 手提录音机（R）：对照回放 ----------
  playTape() {
    if (!this.hasRecorder) return false;
    if (this.tapePlayT > 0) return false;
    if (this.tapesOwned.length === 0) {
      this.audio.blip(500, 0.05, 0.06);
      this.hud.subtitle('录音机里没有磁带。仓门里积着盐末。', 3);
      return false;
    }
    const p = this.player.pos;
    // 站在某盘磁带的「录制地」半径内 → 对照回放；否则平放（给提示）
    let tape = null;
    for (const t of this.tapesOwned) {
      if (t.done) continue;
      const d = Math.hypot(p.x - t.spot.x, p.z - t.spot.z);
      if (d <= t.r && Math.abs(p.y - t.spot.y) < 3.5) { tape = t; break; }
    }
    const onSpot = !!tape;
    if (!tape) {
      const undone = this.tapesOwned.filter((t) => !t.done);
      const pool = undone.length ? undone : this.tapesOwned;
      tape = pool[this.tapeCycle++ % pool.length];
    }
    this.tapePlayT = 9;
    // 磁头咬带：沙沙底噪 + 断续的浊音（说话声闷在铁皮匣里）
    this.audio.paper();
    this.audio.blip(160, 0.12, 0.5, 0.3);
    this.audio.blip(210, 0.1, 0.4, 1.1);
    this.audio.blip(140, 0.12, 0.6, 2.0);
    this.hud.subtitle(`〔磁带 · ${tape.label}〕`, 2.2);
    for (const ln of tape.lines) this.hud.subtitle(ln, 4.2, 'radio');
    if (onSpot && !tape.done) {
      tape.done = true;
      for (const ln of tape.compare) this.hud.subtitle(ln, 4.8, 'song');
      this.audio.wrong?.();
      this.onTapeMatch?.(tape.id);
      this.syncHud();
    } else if (!onSpot) {
      this.hud.subtitle(tape.hint, 4.2);
    }
    return true;
  }

  // ---------- ① 镁光闪 ----------
  flash() {
    if (!this.hasCamera) return false;
    if (this.flashCd > 0) return false;
    if (this.bulbs <= 0) {
      this.audio.blip(300, 0.05, 0.08);
      this.hud.subtitle('快门空响了一声。镁光泡用完了。', 3);
      return false;
    }
    this.bulbs -= 1;
    this.flashCd = 1.6; // 换泡：烫手，得等
    this.flashVal = 2.6;
    // 声音：低频砰 + 玻璃泡爆丝
    this.audio.blip(90, 0.3, 0.16);
    this.audio.blip(2600, 0.1, 0.05, 0.01);
    this.stealth.emitNoise(this.player.pos.x, this.player.pos.z, 10); // 闪光也是动静
    // 看见光的人定住：同层、9m 内、与玩家之间无遮挡
    const p = this.player;
    _v1.copy(p.pos); _v1.y += 1.4;
    let hit = 0;
    for (const e of this.enemies) {
      if (!e.enabled || e.grabbing) continue;
      const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
      if (d > 9 || Math.abs(e.pos.y - p.pos.y) > 2.4) continue;
      _v2.set(e.pos.x, e.pos.y + 1.55, e.pos.z);
      if (!hasLineOfSight(_v1, _v2, this.world.colliders, (x, z) => this.world.heightAt(x, z, p.pos.y))) continue;
      e.flashStun?.(d < 4 ? 5.5 : 4.0); // 越近晃得越久
      hit++;
    }
    if (hit > 0) this.hud.subtitle(hit > 1 ? '几张脸同时白了一下，定在原地。' : '那张脸白了一下，定在原地。', 3.5);
    // 上宾：被拍下来的东西必须先跟照片对齐——板材排齐、收指僵直
    const gu = this.guest;
    if (gu?.enabled) {
      const gd = Math.hypot(gu.hand.x - p.pos.x, gu.hand.z - p.pos.z);
      if (gd < 14 && Math.abs(gu.hand.y - p.pos.y) < 4.5) {
        _v2.set(gu.hand.x, gu.hand.y + 0.6, gu.hand.z);
        if (hasLineOfSight(_v1, _v2, this.world.colliders, (x, z) => this.world.heightAt(x, z, p.pos.y))) {
          gu.flashStun(6);
          this.hud.subtitle('板材「咔」地排齐了——像被钉回上一张照片。', 4, 'song');
        }
      }
    }
    this.syncHud();
    return true;
  }

  // ---------- ② 发条闹钟 ----------
  placeClock() {
    if (this.clocks <= 0) return false;
    this.clocks -= 1;
    const p = this.player;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const cx = p.pos.x + fx * 0.9, cz = p.pos.z + fz * 0.9;
    const cy = this.world.heightAt(cx, cz, p.pos.y);
    // 小闹钟：铁壳圆盒 + 双铃帽
    const grp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 12), new THREE.MeshStandardMaterial({ color: 0x8c2020, roughness: 0.4, metalness: 0.4 }));
    body.rotation.x = Math.PI / 2;
    body.position.y = 0.1;
    grp.add(body);
    for (const ox of [-0.05, 0.05]) {
      const bell = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), new THREE.MeshStandardMaterial({ color: 0xc9a24e, roughness: 0.3, metalness: 0.9 }));
      bell.position.set(ox, 0.19, 0);
      grp.add(bell);
    }
    grp.position.set(cx, cy, cz);
    this.scene.add(grp);
    this.activeClocks.push({ mesh: grp, x: cx, z: cz, y: cy, t: 0, phase: 'wind', trill: 0 });
    this.audio.blip(1400, 0.06, 0.04); // 上弦咔哒
    this.audio.blip(1400, 0.05, 0.04, 0.12);
    this.hud.subtitle('发条上满了。走远点——它只响给别人听。', 3.5);
    this.syncHud();
    return true;
  }

  // ---------- ③ 贝灰线 ----------
  pourLime() {
    if (this.lime <= 0) return false;
    const p = this.player;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const cx = p.pos.x + fx * 1.2, cz = p.pos.z + fz * 1.2;
    const cy = this.world.heightAt(cx, cz, p.pos.y);
    if (Math.abs(cy - p.pos.y) > 0.9) {
      this.hud.subtitle('这儿不平，灰倒不成一条线。', 3);
      return false;
    }
    this.lime -= 1;
    // 与视线垂直的一道线，半长 1.25m
    const px = fz, pz = -fx;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.015, 0.085), this.limeMat);
    mesh.position.set(cx, cy + 0.012, cz);
    mesh.rotation.y = Math.atan2(px, pz) + Math.PI / 2;
    this.scene.add(mesh);
    this.limeLines.push({
      x1: cx - px * 1.25, z1: cz - pz * 1.25,
      x2: cx + px * 1.25, z2: cz + pz * 1.25,
      y: cy, ttl: 55, mesh,
    });
    this.audio.paper(); // 灰簌簌地落
    this.hud.subtitle('灰线倒好了。守规矩的东西不肯踩它——不守规矩的另说。', 4);
    this.syncHud();
    return true;
  }

  // ---------- 帧更新 ----------
  update(dt) {
    if (this.flashVal > 0) this.flashVal = Math.max(0, this.flashVal - dt * 6.5);
    if (this.flashCd > 0) this.flashCd -= dt;
    if (this.tapePlayT > 0) this.tapePlayT -= dt;

    // 闹钟：上弦 2.5s 后响 9s；响时持续制造噪音事件 + 把附近的人骗去绕圈搜
    for (const c of this.activeClocks) {
      c.t += dt;
      if (c.phase === 'wind' && c.t > 2.5) {
        c.phase = 'ring';
        c.t = 0;
        // 开响的一瞬：拉走能听见的人
        for (const e of this.enemies) {
          if (!e.enabled || e.grabbing) continue;
          const d = Math.hypot(e.pos.x - c.x, e.pos.z - c.z);
          const dy = Math.abs(e.pos.y - c.y);
          if (d > e.hearRange * 1.6 + 8 || dy > 3.2) continue;
          e.lureTo?.(c.x, c.z);
        }
        // 上宾：铃震着地板——出声的东西要先清点
        const gu = this.guest;
        if (gu?.enabled && Math.hypot(gu.hand.x - c.x, gu.hand.z - c.z) < 24
          && c.x >= gu.area.minX - 4 && c.x <= gu.area.maxX + 4
          && c.z >= gu.area.minZ - 4 && c.z <= gu.area.maxZ + 4) {
          gu.lureTo(c.x, c.z);
        }
      } else if (c.phase === 'ring') {
        if (c.t > 9) {
          c.phase = 'dead'; // 弹簧走完，铃哑了。壳留在原地。
        } else {
          this.stealth.emitNoise(c.x, c.z, 17);
          c.mesh.rotation.z = Math.sin(c.t * 55) * 0.09; // 铃震
          c.trill -= dt;
          if (c.trill <= 0) {
            c.trill = 0.11;
            const d = Math.hypot(this.player.pos.x - c.x, this.player.pos.z - c.z);
            const amp = Math.max(0.015, 0.14 - d * 0.007);
            this.audio.bell(2350 + Math.random() * 160, 0.05, amp);
          }
        }
      }
    }

    // 贝灰线：界维持不了一整夜——潮气从两头往里吃
    for (let i = this.limeLines.length - 1; i >= 0; i--) {
      const l = this.limeLines[i];
      l.ttl -= dt;
      if (l.ttl < 6) {
        if (!l.fadeMat) {
          l.fadeMat = this.limeMat.clone();
          l.fadeMat.transparent = true;
          l.mesh.material = l.fadeMat;
        }
        l.fadeMat.opacity = Math.max(0, l.ttl / 6);
      }
      if (l.ttl <= 0) {
        l.mesh.removeFromParent();
        l.fadeMat?.dispose();
        this.limeLines.splice(i, 1);
      }
    }
  }
}
