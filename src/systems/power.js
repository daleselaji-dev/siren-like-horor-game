// 配电间保险丝板：酒店三路分闸的资源箱庭
//   大堂 / 西翼(宴会厅+棋牌) / 客房层(3F) 各吃一枚瓷底保险丝。
//   保险丝可以拔下来揣走、插到别路——「黑暗」从此是一件能搬运的行装：
//   断电的堂口灯全灭，人在暗处不容易被看见（视程打六折）；
//   代价是你自己也只剩一双肉眼。后勤线/楼梯间走的是应急电，这块板管不着。
export class PowerSystem {
  constructor({ world, hud, audio, player }) {
    this.world = world;
    this.hud = hud;
    this.audio = audio;
    this.player = player;

    // 三路分区（世界坐标包围盒；y 轴区分客房层）
    this.zones = [
      { id: 'lobby', name: '大堂', on: true, minX: -12, maxX: 4.6, minZ: -56.2, maxZ: -43.0, maxY: 9.2, lights: [] },
      { id: 'west', name: '西翼', on: true, minX: -21, maxX: -12, minZ: -67.2, maxZ: -44.8, maxY: 9.2, lights: [] },
      { id: 'rooms', name: '客房层', on: true, minX: -21, maxX: 13, minZ: -67.2, maxZ: -44.8, minY: 9.2, lights: [] },
    ];
    this.spare = 0;          // 手里的保险丝
    this.everPulled = false; // HUD 行装栏出现条件
    this.panelPos = null;    // 由 story 传入（配电间板位）
    this.panelOpen = false;

    // 灯归路：按世界位置把酒店灯分进三路（没归进的走应急电，不受板控）
    for (const hl of world.dynamic.hotelLights ?? []) {
      const p = hl.pl.position;
      for (const z of this.zones) {
        const okY = (z.minY === undefined || p.y >= z.minY) && (z.maxY === undefined || p.y <= z.maxY);
        if (okY && p.x >= z.minX && p.x <= z.maxX && p.z >= z.minZ && p.z <= z.maxZ) {
          z.lights.push(hl);
          break;
        }
      }
    }
  }

  /** E 在保险丝板上：进入分闸操作（1/2/3 拔插），走远自动合上 */
  openPanel(pos) {
    this.panelPos = pos;
    this.panelOpen = true;
    this.audio.blip(1200, 0.05, 0.04);
    this.statusLine();
  }

  statusLine() {
    const rows = this.zones.map((z, i) => `${i + 1}·${z.name}〔${z.on ? '通' : '断'}〕`).join('　');
    this.hud.subtitle(`${rows}　｜　手里的保险丝 × ${this.spare}`, 4.5);
    this.hud.subtitle('按 1 / 2 / 3 拔下或插回那一路。', 3.5);
  }

  toggle(i) {
    if (!this.panelOpen) return;
    const z = this.zones[i];
    if (!z) return;
    if (z.on) {
      z.on = false;
      this.spare += 1;
      this.everPulled = true;
      this.audio.blip(70, 0.35, 0.22);          // 铁壳里闷响一声
      this.audio.blip(2400, 0.05, 0.03, 0.08);  // 瓷座退丝的脆音
      this.hud.subtitle(`${z.name}的灯灭了。瓷座还是温的。`, 3.5);
    } else {
      if (this.spare <= 0) {
        this.audio.blip(300, 0.06, 0.06);
        this.hud.subtitle('这一路空着——手里没有多余的保险丝。', 3);
        return;
      }
      this.spare -= 1;
      z.on = true;
      this.audio.blip(90, 0.3, 0.18);
      this.audio.blip(1800, 0.05, 0.04, 0.06);
      this.hud.subtitle(`${z.name}的灯回来了。`, 3);
    }
    this.applyPower();
    this.statusLine();
    this.onChanged?.();
  }

  addSpare(n) {
    this.spare += n;
    this.everPulled = true;
    this.onChanged?.();
  }

  applyPower() {
    for (const z of this.zones) {
      for (const hl of z.lights) hl.powerK = z.on ? 1 : 0;
    }
  }

  /** 玩家所在分区（无则 null） */
  zoneAt(x, y, z) {
    for (const zn of this.zones) {
      const okY = (zn.minY === undefined || y >= zn.minY - 1.2) && (zn.maxY === undefined || y <= zn.maxY);
      if (okY && x >= zn.minX && x <= zn.maxX && z >= zn.minZ && z <= zn.maxZ) return zn;
    }
    return null;
  }

  /** 玩家站在断电堂口 → 所有眼睛的视程打六折 */
  playerSightK() {
    const p = this.player.pos;
    const zn = this.zoneAt(p.x, p.y, p.z);
    return zn && !zn.on ? 0.6 : 1;
  }

  update() {
    if (this.panelOpen && this.panelPos) {
      const p = this.player.pos;
      const d = Math.hypot(p.x - this.panelPos.x, p.z - this.panelPos.z);
      if (d > 2.4) this.panelOpen = false;
    }
  }
}
