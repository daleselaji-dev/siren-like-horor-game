// 《返潮》M01 叙事系统：迎宾楼的一夜
// 节拍：Normal(登记) → Leak(走廊变深) → Measure(深度尺) → 录像超前现实 → F01 遭遇 → 追逐 → Aftermath
// 主题：保存 vs 占有——失踪的人不是被杀死的，是被"保存"起来的。
import * as THREE from 'three';
import { F01Body } from '../entities/f01.js';

// ============================================================
// 证据文书（拼出"保存即占有"）
// ============================================================
export const NOTES = [
  {
    id: 'registry', title: '婚宴预订登记簿',
    body: '（皮面登记簿，翻开在最后一页）\n\n2003.10.25　陈志明 · 林小满　囍宴 40 桌　定金已付\n2003.10.25　陈志明 · 林小满　囍宴 40 桌　定金已付\n2003.10.25　陈志明 · 林小满　囍宴 40 桌　定金已付\n2003.10.25　陈志明 · 林小满　囍宴 40 桌　定金已付\n\n同一行写了四遍。笔迹一遍比一遍用力，\n最后一遍把纸划破了。\n\n再往前翻，前面几十页全是空的。',
  },
  {
    id: 'notice', title: '拆迁公告',
    body: '根据蚀湾旧城改造规划（二〇〇三），迎宾楼（原水产公司招待所）列入第三批拆除范围。\n\n请住户及原单位于本月内完成搬迁、注销登记。逾期视为放弃。\n\n——蚀湾镇改造办\n\n（公告右下角有一行很小的铅笔字：\n"楼可以拆。东西我都收好了。"）',
  },
  {
    id: 'roster', title: '员工排班表',
    body: '迎宾楼十月排班\n\n前厅　苏凤英　—— 十月十五日止\n保卫　秦国栋　—— 十月二十日止\n后厨　黄有德　—— 十月二十四日止\n维修　王承海　—— （无终止日期）\n\n王承海的名字后面，排班一直排下去：\n十一月、十二月、来年一月……\n表格印到哪里，他的班就排到哪里。\n最后一格里写的不是日期，是一个字：\n\n"守"。',
  },
  {
    id: 'guardLog', title: '保卫室值班日志',
    body: '10.19　晚十一点，宴会厅监控又有画面。厅里没人。查线，线是好的。\n\n10.20　监控画面比墙上的钟快十八秒。我对了三遍表。\n是监控快，还是我们这边慢？\n\n10.20（补）　不对。不是快慢的事。\n录像带里的东西，是还没发生的。\n\n我明天不来了。老王说他会看着。\n他说这楼里的东西，他都会看着。',
  },
  {
    id: 'kitchenNote', title: '后厨进货单',
    body: '10.25　鲳鱼 40 斤 · 基围虾 30 斤 · 老酒 12 坛　（囍宴 40 桌）\n10.25　鲳鱼 40 斤 · 基围虾 30 斤 · 老酒 12 坛　（囍宴 40 桌）\n10.25　鲳鱼 40 斤 · 基围虾 30 斤 · 老酒 12 坛　（囍宴 40 桌）\n\n每一张的日期都是同一天。\n纸张的新旧不一样——有的黄脆，有的像昨天才写的。\n\n最底下压着一张便条：\n"标准不变。人到齐再开席。——王"',
  },
  {
    id: 'clipping', title: '剪报：内湾工程中止',
    body: '《蚀湾日报》2000 年 3 月\n\n"千禧内湾填海工程全面中止。\n已建成的三座桥墩将予保留，待后续规划。"\n\n配图里，斜拉桥的效果图横跨整个内湾，\n图说写着：蚀湾的明天。\n\n有人用红笔把"明天"两个字圈了起来，\n旁边写：\n\n"第一次是海收走的。\n这一次，是人自己退的。"',
  },
  {
    id: 'plaque', title: '楼层平面图（工程注记）',
    body: '迎宾楼一层平面图　1998 年测绘\n\n客房走廊：全长 12.6 米，客房五间。\n\n图纸边缘有铅笔补注，笔迹很新：\n\n"实测 21.9 米。复测 34.0 米。\n图纸与楼不一致时，以楼为准。\n楼与楼自己不一致时——\n以深的那个为准。　——王"',
  },
  {
    id: 'brideLetter', title: '新娘的信',
    body: '志明：\n\n婚期定在十月二十五。可我先走了，你别找我。\n\n蚀湾留不住人了。厂子没了，桥也不修了，\n连海都往回退。我不想一辈子守着一间\n要拆的酒楼办喜事。\n\n王师傅人很好，替我们看着场地，说什么都\n"给你们留着"。可是志明，昨天我回去取东西，\n看见他把我们的婚纱照擦了又擦，摆回原位，\n像那是他家的东西。\n\n有些人告别的方式是放手。\n有些人告别的方式，是把你收进柜子里。\n\n别回迎宾楼。\n\n小满　十月二十一日',
  },
];

const CHECKPOINTS = {
  forecourt: { x: 0, z: 26, yaw: 0, label: '前庭' },
  lobby: { x: 0, z: -5, yaw: 0, label: '大堂' },
  corridor: { x: 0, z: -18, yaw: 0, label: '客房走廊' },
  banquet: { x: -7, z: -24, yaw: Math.PI * 0.5, label: '婚宴厅' },
};

const _v = new THREE.Vector3();

export class Story {
  constructor(game) {
    this.g = game;
    const { world, engine } = game;

    this.flags = {
      entered: false, tutorialListen: false, hasGauge: false,
      measured: false, extended: false, deepMeasured: false,
      banquetOpen: false, videoSeen: false, replayDone: false,
      letterTaken: false, chase: false, escaped: false, ended: false,
      staffGone: false, monitorSeen: false,
    };
    this.beat = 'arrive';
    this.notesFound = new Set();
    this.checkpointId = 'forecourt';
    this.deaths = 0;
    this.startTime = performance.now();

    this.introSeq = null;
    this.caughtSeq = null;
    this.deathSeq = null;
    this.drownView = 0;      // 井视野蒙版（HUD drown overlay 复用）
    this.schedule = [];      // [{t, fn}]
    this.elapsed = 0;
    this.chaseLampT = 0;
    this.f01Script = null;   // 脚本化行走 { points, i, onDone, faceTo, faceT }

    // ---- 婚宴录像：RenderTarget + 独立机位 + 幽灵 F01（只存在于录像图层） ----
    this.videoRT = new THREE.WebGLRenderTarget(320, 240);
    this.videoCam = new THREE.PerspectiveCamera(world.banquetCam.fov, 4 / 3, 0.1, 60);
    this.videoCam.position.copy(world.banquetCam.pos);
    this.videoCam.lookAt(world.banquetCam.look);
    this.videoCam.layers.enable(2);
    engine.scene.traverse((o) => { if (o.isLight) o.layers.enable(2); });
    this.ghost = new F01Body(game.M);
    this.ghost.group.traverse((o) => o.layers.set(2));
    this.ghost.group.visible = false;
    engine.scene.add(this.ghost.group);
    this.videoEvent = null;  // { t }
    this.videoLive = false;

    // 录像机路径：门口 → 中央过道 → 婚台（与 18 秒后现实中 F01 的路一致）
    this.replayPath = [[-4.6, -25.7], [-9, -26.5], [-14, -27.2], [-19, -27.6], [-22.4, -27.8]];

    this.buildInteractables();
    this.applyBeatState();
  }

  // ============================================================
  // 互动点
  // ============================================================
  buildInteractables() {
    const L = this.g.world.locations;
    const F = this.flags;
    const g = this.g;

    const note = (id) => NOTES.find((n) => n.id === id);
    const pickNote = (id, extra) => () => {
      this.notesFound.add(id);
      g.audio?.paper();
      g.openNote(note(id));
      extra?.();
    };

    this.interactables = [
      {
        pos: new THREE.Vector3(0, 1.2, 2.4), r: 2.4,
        prompt: '推门',
        cond: () => !F.entered,
        act: () => {
          F.entered = true;
          this.g.world.setDoorOpen('mainL', true);
          this.g.world.setDoorOpen('mainR', true);
          g.audio?.doorCreak();
          this.sub('门没有锁。大堂的灯还亮着一半。', 3.5);
          this.setObjective('找到还有人的地方');
        },
      },
      {
        pos: L.registry, r: 2.0, prompt: '翻看登记簿',
        act: pickNote('registry', () => {
          if (!F.tutorialListen) {
            F.tutorialListen = true;
            this.sub('同一场婚宴，登记了四遍。', 3.2);
            this.sub('这楼里还有人在上班。按 Q——借他们的眼睛看看这座楼。', 5);
            this.setObjective('听潮（Q）：借员工或监控的眼睛看看这座楼');
          }
        }),
      },
      {
        pos: L.deskBell, r: 1.8, prompt: '按前台铃',
        act: () => {
          g.audio?.bellSmall();
          g.stealth?.emitNoise(this.g.player.pos.x, this.g.player.pos.z, 14);
          this.sub('铃声在大堂里荡了一圈。没有人应。', 3);
        },
      },
      {
        pos: L.wallClock, r: 2.2, prompt: '看钟',
        act: () => {
          this.sub('23:42。秒针每走一格，都像要想一下。', 3.5);
          if (F.monitorSeen) this.sub('保卫日志说得对——监控那边，比这口钟快十八秒。', 4);
        },
      },
      {
        pos: L.photoBoard, r: 2.0, prompt: '看婚纱照',
        act: () => {
          this.sub('陈志明，林小满。照片上的脸被水汽糊住了。', 3.6);
          this.sub('拍的是外景——身后是内湾大桥的效果图。桥没建成。', 4);
        },
      },
      { pos: L.clipping, r: 1.8, prompt: '读剪报', act: pickNote('clipping') },
      { pos: L.noticeBoard, r: 2.2, prompt: '读公告', act: pickNote('notice') },
      {
        pos: new THREE.Vector3(11, 1.1, -6), r: 1.8, prompt: '开保卫室的门',
        cond: () => !this.g.world.isDoorOpen('security'),
        act: () => { this.g.world.setDoorOpen('security', true); g.audio?.doorCreak(); },
      },
      {
        pos: L.depthGauge, r: 1.8, prompt: '拿起工程深度尺',
        cond: () => !F.hasGauge,
        act: () => {
          F.hasGauge = true;
          g.audio?.blip(660, 0.05, 0.12);
          this.sub('【工程深度尺】内湾工程队的东西。测的不是长度，是"深"。', 4.5);
          this.setObjective('用深度尺测一测客房走廊（走廊口的平面图）');
        },
      },
      { pos: L.guardLog, r: 1.8, prompt: '读值班日志', act: pickNote('guardLog') },
      {
        pos: L.securityRoom, r: 2.2, prompt: '看监控',
        act: () => {
          F.monitorSeen = true;
          this.videoLive = true;
          this.sub('三块屏。大堂、走廊——还有一块，接的是宴会厅的录像机。', 4.5);
          this.sub('画面右下角的时间，比你进门时看的钟快。', 3.6);
        },
      },
      {
        pos: L.corridorPlaque, r: 2.0, prompt: () => F.hasGauge ? '对着平面图测量走廊' : '看平面图',
        act: () => {
          if (!F.hasGauge) {
            this.sub('一层平面图：客房走廊，全长 12.6 米。', 3.2);
            return;
          }
          this.notesFound.add('plaque');
          g.audio?.blip(880, 0.04, 0.1);
          if (!F.extended) {
            F.measured = true;
            this.sub('【深度尺】图纸 12.6m —— 实测 21.9m。', 4);
            this.sub('多出来的 9 米，就在你眼前这条走廊里。', 3.6);
            this.setObjective('走到走廊尽头，再走回来');
          } else {
            this.sub('【深度尺】实测 34.0m。还在变深。', 4);
          }
          g.openNote(NOTES.find((n) => n.id === 'plaque'));
        },
      },
      {
        pos: L.mirrorEnd, r: 2.0, prompt: '照镜子',
        cond: () => F.extended,
        act: () => {
          F.deepMeasured = true;
          this.sub('镜子里的走廊，比你身后这条，还要再长一截。', 4.2);
          this.sub('镜子里亮着五盏灯。你回头数——三盏。', 4.2);
          g.audio?.wrong();
          if (!F.banquetOpen) this.openBanquet();
        },
      },
      { pos: L.staffBoard, r: 1.8, prompt: '看排班表', act: pickNote('roster') },
      { pos: L.kitchenNote, r: 1.8, prompt: '看进货单', act: pickNote('kitchenNote') },
      {
        pos: new THREE.Vector3(2, 1.1, -25.4), r: 1.8, prompt: '推后厨的门',
        cond: () => !this.g.world.isDoorOpen('kitchen'),
        act: () => { this.g.world.setDoorOpen('kitchen', true); g.audio?.doorCreak(); },
      },
      {
        pos: new THREE.Vector3(12.6, 1.1, -32), r: 1.8, prompt: '推楼梯间的门',
        cond: () => !this.g.world.isDoorOpen('stairwell'),
        act: () => {
          this.g.world.setDoorOpen('stairwell', true);
          g.audio?.doorCreak();
          this.sub('楼梯往上五步，就被旧家具堵死了。二楼不要人上去。', 4);
        },
      },
      {
        pos: L.banquetDoors, r: 2.2, prompt: '推婚宴厅的门',
        cond: () => !F.banquetOpen,
        act: () => {
          if (F.deepMeasured || F.extended) {
            this.openBanquet();
          } else {
            g.audio?.doorCreak();
            this.sub('锁着。门缝里有红光，像里面还摆着席。', 3.6);
          }
        },
      },
      {
        pos: L.tvTrolley, r: 2.0, prompt: '播放录像',
        cond: () => F.banquetOpen && !F.videoSeen && !this.videoEvent,
        act: () => this.startVideoEvent(),
      },
      {
        pos: L.brideLetter, r: 1.6, prompt: '拿起那封信',
        cond: () => F.videoSeen && !F.letterTaken,
        act: () => {
          F.letterTaken = true;
          this.notesFound.add('brideLetter');
          g.audio?.paper();
          g.openNote(NOTES.find((n) => n.id === 'brideLetter'));
          this.schedule.push({ t: this.elapsed + 0.5, fn: () => this.beginChase() });
        },
      },
      {
        pos: L.fountain, r: 2.4, prompt: '看喷泉',
        act: () => this.sub('喷泉是干的。池底用红漆描过一个"囍"，褪得只剩个框。', 4),
      },
      {
        pos: L.gateLook, r: 3.0, prompt: '回头看迎宾楼',
        cond: () => F.escaped && !F.ended,
        act: () => this.beginEnding(),
      },
    ];
  }

  findInteractable() {
    if (this.g.state !== 'PLAY' || this.g.player.dead || this.introSeq || this.caughtSeq) return null;
    const p = this.g.player.pos;
    let best = null, bestD = 1e9;
    for (const it of this.interactables) {
      if (it.cond && !it.cond()) continue;
      const d = Math.hypot(it.pos.x - p.x, it.pos.z - p.z) + Math.abs((it.pos.y ?? 1) - (p.y + 1.2)) * 0.3;
      if (d < it.r && d < bestD) { best = it; bestD = d; }
    }
    if (!best) return null;
    return {
      prompt: typeof best.prompt === 'function' ? best.prompt() : best.prompt,
      act: best.act,
    };
  }

  // ============================================================
  // 开场运镜
  // ============================================================
  beginIntro() {
    const cam = this.g.engine.camera;
    this.introSeq = { t: 0, dur: 14 };
    this.g.player.frozen = true;
    this.g.hud.setLetterbox(true);
    // 起点：大门口高处望向酒店
    cam.position.set(-10, 6, 31);
    cam.lookAt(0, 4, 3);
    this.sub('2003 年，蚀湾。', 3.2);
    this.sub('厂子没了，桥停了，海往回退了三年——今年又漫回来了。', 4.6);
    this.sub('镇上叫这个"返潮"。东西受了潮，本该结束的事，就会重新走一遍。', 5.2);
    this.sub('姐姐的婚宴定在迎宾楼。十月二十五。她没有出席自己的婚礼。', 5.2);
    this.g.hud.objective('进入迎宾楼');
  }

  endIntro() {
    if (!this.introSeq) return;
    this.introSeq = null;
    this.g.hud.setLetterbox(false);
    this.g.player.frozen = false;
    this.g.player.syncCamera(0);
  }

  updateIntro(dt) {
    const seq = this.introSeq;
    seq.t += dt;
    const t = Math.min(1, seq.t / seq.dur);
    const e = t * t * (3 - 2 * t);
    const cam = this.g.engine.camera;
    // 从大门高处缓缓沉到玩家眼位
    const p = this.g.player;
    const eye = new THREE.Vector3(p.pos.x, p.pos.y + 1.62, p.pos.z);
    const start = new THREE.Vector3(-10, 6, 31);
    cam.position.lerpVectors(start, eye, e);
    const lookStart = new THREE.Vector3(0, 5, 3);
    const lookEnd = new THREE.Vector3(0, 1.4, 3);
    const lk = lookStart.clone().lerp(lookEnd, e);
    cam.lookAt(lk);
    if (seq.t >= seq.dur) this.endIntro();
  }

  // ============================================================
  // 节拍推进
  // ============================================================
  setObjective(text) { this.g.hud.objective(text); }
  sub(text, dur, sp) { this.g.hud.subtitle(text, dur, sp); }

  openBanquet() {
    const F = this.flags;
    if (F.banquetOpen) return;
    F.banquetOpen = true;
    this.g.world.setDoorOpen('banquetL', true);
    this.g.world.setDoorOpen('banquetR', true);
    this.g.audio?.doorCreak();
    this.sub('走廊那头传来两扇门磨开地毯的声音。', 3.6);
    this.setObjective('去婚宴厅');
    this.checkpoint('corridor');
    // 员工下班了——这层楼开始只剩下"他"；而他此刻不在厅里
    if (!F.staffGone) {
      F.staffGone = true;
      for (const id of ['cleaner', 'guard', 'chef']) {
        this.g.byId[id]?.setEnabled(false);
      }
      if (!F.replayDone) this.g.byId.f01?.setEnabled(false);
      this.sub('大堂的拖把倒在地上。到点了，人都走了。', 3.6);
    }
  }

  /** Leak：从走廊尽头折返 → 走廊变深 */
  triggerExtend() {
    const F = this.flags;
    if (F.extended || !F.measured) return;
    F.extended = true;
    this.g.world.setCorridorExtended(true);
    this.g.audio?.wrong();
    this.g.sky?.setPressure(0.45);
    this.sub('身后的走廊，比你走来的时候深。', 4);
    this.sub('多出来的那段没有开灯。门也变多了。', 4);
    this.setObjective('走到走廊"现在的"尽头');
  }

  // ============================================================
  // 婚宴录像（超前现实 18 秒）
  // ============================================================
  startVideoEvent() {
    const F = this.flags;
    this.videoEvent = { t: 0 };
    this.videoLive = true;
    this.g.audio?.blip(220, 0.06, 0.3);
    this.sub('录像机咔哒一声。屏幕亮了——是这间厅。', 4);
    this.checkpoint('banquet');
    this.setObjective('看完这盘带子');
  }

  updateVideoEvent(dt) {
    const ev = this.videoEvent;
    ev.t += dt;
    const t = ev.t;
    const ghost = this.ghost;

    if (t < 4) {
      ghost.group.visible = false;
    } else if (t < 14) {
      // 幽灵沿路径走（只存在于录像图层）
      ghost.group.visible = true;
      const seg = (t - 4) / 10 * (this.replayPath.length - 1);
      const i = Math.min(this.replayPath.length - 2, Math.floor(seg));
      const f = seg - i;
      const a = this.replayPath[i], b = this.replayPath[i + 1];
      const x = a[0] + (b[0] - a[0]) * f;
      const z = a[1] + (b[1] - a[1]) * f;
      ghost.group.position.set(x, this.g.world.heightAt(x, z), z);
      ghost.group.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]);
      ghost.animate('walk', dt, 0.85);
      if (t > 5.4 && t < 5.7) this.sub('厅里有个人。灰蓝工装。', 3, null);
    } else if (t < 18) {
      // 停在婚台前，头相位滞后地转向镜头
      ghost.animate('idle', dt, 1);
      const toCam = Math.atan2(
        this.videoCam.position.x - ghost.group.position.x,
        this.videoCam.position.z - ghost.group.position.z
      );
      ghost.group.rotation.y += (toCam - ghost.group.rotation.y) * Math.min(1, dt * 1.2);
      if (t > 15.4 && t < 15.7) this.sub('录像里的人停住了。他在看镜头。', 3.4);
    } else {
      // 带子到头
      this.videoEvent = null;
      this.ghost.group.visible = false;
      this.videoLive = false;
      this.flags.videoSeen = true;
      this.g.audio?.blip(140, 0.06, 0.4);
      this.sub('……带子到这里就没有了。', 3.4);
      this.sub('屏幕右下角的时间戳，是十八秒之后。', 4);
      this.setObjective('台上有一封信。厅里最好别出声。');
      // 十八秒后，现实追上录像
      this.schedule.push({ t: this.elapsed + 18, fn: () => this.beginReplay() });
    }
  }

  /** 十八秒后：现实里的 F01 走进厅，把录像里的动作再做一遍 */
  beginReplay() {
    const f01 = this.g.byId.f01;
    if (!f01 || this.flags.replayDone) return;
    this.flags.replayDone = true;
    f01.setEnabled(true);
    f01.pos.set(this.replayPath[0][0], 0, this.replayPath[0][1]);
    f01.pos.y = this.g.world.heightAt(f01.pos.x, f01.pos.z);
    this.g.audio?.doorCreak();
    this.f01Script = {
      points: this.replayPath.slice(1),
      i: 0,
      faceTo: this.g.world.banquetCam.pos,
      faceT: 3.4,
      onDone: () => {
        // 转头看完镜头（也就是看向你看录像的位置），回去擦他的婚台
        f01.def.workPos = [-22.4, -27.8];
        f01.def.workMode = 'work_wipe';
        f01.def.workYaw = -Math.PI / 2;
        f01.state = 'WORK';
        this.sub('他擦着婚台，像每天都这么擦。', 3.6);
      },
    };
    f01.scripted = true;
    this.sub('门口——刚才录像里的脚步声，现在在厅里。', 4);
  }

  updateF01Script(dt) {
    const s = this.f01Script;
    const f01 = this.g.byId.f01;
    if (!s || !f01) return;
    if (s.i < s.points.length) {
      const [tx, tz] = s.points[s.i];
      const left = f01.moveToward(tx, tz, 0.95, dt);
      f01.body.animate('walk', dt, 0.85);
      if (left < 0.3) s.i++;
    } else if (s.faceT > 0) {
      s.faceT -= dt;
      f01.faceToward(s.faceTo.x, s.faceTo.z, dt, 1.4);
      f01.body.animate('idle', dt, 1);
    } else {
      f01.scripted = false;
      this.f01Script = null;
      s.onDone?.();
    }
    f01.syncBody(dt);
    // 脚本期间玩家被看到依然会触发警戒
    const sight = f01.senseSight(this.g.player, this.g.stealth.envSightFactor);
    if (sight > 0.6 && !this.flags.chase) this.beginChase(true);
  }

  // ============================================================
  // 追逐（空间压迫：身后的灯一盏盏灭）
  // ============================================================
  beginChase(spotted = false) {
    const F = this.flags;
    if (F.chase || F.escaped) return;
    F.chase = true;
    const f01 = this.g.byId.f01;
    f01.scripted = false;
    this.f01Script = null;
    f01.enterAlert(this.g.player, this.g.audio, null);
    this.g.sky?.setPressure(1);
    this.g.audio?.chaseDrum?.(true);
    if (spotted) this.sub('他看见你了。', 2.2);
    else {
      this.sub('他没有喊。他只是放下抹布，朝你走过来。', 3.6);
      this.sub('比走路快一点。比跑慢一点。像去接一个客人。', 3.6);
    }
    this.setObjective('离开这栋楼——大门还开着');
    this.chaseLampT = 1.2;
  }

  updateChase(dt) {
    const p = this.g.player;
    const f01 = this.g.byId.f01;
    // 身后的灯一盏盏灭掉（空间压迫）
    this.chaseLampT -= dt;
    if (this.chaseLampT <= 0) {
      this.chaseLampT = 1.6;
      const lamps = this.g.world.corridorLamps;
      // 找一盏在玩家身后（更靠深处）的亮灯
      for (let i = lamps.length - 1; i >= 0; i--) {
        if (lamps[i].on && lamps[i].z < p.pos.z - 2) {
          this.g.world.setLampOn(i, false);
          this.g.audio?.blip(90, 0.08, 0.25);
          break;
        }
      }
    }
    // F01 永不忘记你要去哪：目标点持续刷新为大门与你的连线
    if (f01.state !== 'ALERT') f01.enterAlert(p, this.g.audio, null);
    // 逃出大门 → 追逐结束
    if (p.pos.z > 4.5) this.endChase();
  }

  endChase() {
    const F = this.flags;
    if (F.escaped) return;
    F.escaped = true;
    F.chase = false;
    const f01 = this.g.byId.f01;
    // 他停在门里，不出来
    f01.state = 'WORK';
    f01.def.workPos = [0, -1.2];
    f01.def.workMode = 'idle';
    f01.def.workYaw = 0;
    f01.pos.set(0, 0, -1.2);
    f01.scripted = false;
    this.g.sky?.setPressure(0.6);
    this.g.audio?.chaseDrum?.(false);
    this.sub('他停在玻璃门里面。手贴着玻璃。', 4.2);
    this.sub('他不出来。楼里的东西，他都看着。', 4.2);
    this.setObjective('走到大门口，回头看一眼');
    this.checkpoint('forecourt');
  }

  // ============================================================
  // 被抓 / 死亡 / 检查点
  // ============================================================
  beginCaught(enemy) {
    if (this.caughtSeq || this.g.player.dead) return;
    enemy.grabbing = true;
    this.caughtSeq = { t: 0, enemy, isF01: enemy.id === 'f01' };
    this.g.player.frozen = true;
    this.g.hud.setLetterbox(true);
    this.g.audio?.grabSting();
    this.g.hud.setCrosshair(false);
    if (this.g.sightjack.active) {
      this.g.sightjack.exit();
      this.g.sightjack.restorePost();
      this.g.audio?.setSightjack(false);
    }
  }

  updateCaught(dt) {
    const seq = this.caughtSeq;
    seq.t += dt;
    const cam = this.g.engine.camera;
    const enemy = seq.enemy;
    const head = enemy.body.headWorldPos(_v);

    if (seq.isF01) {
      // 他捧住你的头，把你举到他的左眼跟前——镜头沉进井里
      const t = Math.min(1, seq.t / 2.6);
      const e = t * t;
      const eye = head.clone();
      eye.y += 0.01;
      eye.x += Math.sin(enemy.yaw - 0.16) * 0.06;
      eye.z += Math.cos(enemy.yaw - 0.16) * 0.06;
      cam.position.lerp(eye, Math.min(1, dt * (2 + e * 10)));
      cam.lookAt(head.x, head.y + 0.005, head.z);
      this.g.engine.finalPass.uniforms.uDistort.value = e * 0.9;
      this.g.engine.finalPass.uniforms.uDesat.value = 0.12 + e * 0.5;
      this.drownView = e;
      if (seq.t > 0.4 && seq.t < 0.7) this.sub('他把你的头捧起来了。不重。很稳。', 3);
      if (seq.t > 1.6 && seq.t < 1.9) this.sub('左眼里没有眼睛。有一口井。井里有水光。', 3);
      if (seq.t >= 3.2) this.die('井', '他把你保存好了 —— 正在回到检查点');
    } else {
      // 员工：像扭送一个走错宴席的客人
      const t = Math.min(1, seq.t / 1.6);
      cam.lookAt(head);
      this.g.engine.finalPass.uniforms.uDesat.value = 0.12 + t * 0.4;
      this.drownView = t * 0.6;
      if (seq.t > 0.3 && seq.t < 0.6) this.sub('"跟我出去。"', 2.4);
      if (seq.t >= 2.0) this.die('送客', '他们把你送出了门 —— 正在回到检查点');
    }
  }

  die(char, text) {
    const p = this.g.player;
    if (p.dead) return;
    p.dead = true;
    this.deaths++;
    this.caughtSeq = null;
    document.getElementById('death-text').textContent = char;
    this.g.hud.setDeath(true, text,
      `证据 ${this.notesFound.size}/${NOTES.length} · 检查点：${CHECKPOINTS[this.checkpointId].label}`);
    this.g.audio?.drown();
    this.deathSeq = { t: 0 };
  }

  updateDeath(dt) {
    this.deathSeq.t += dt;
    if (this.deathSeq.t > 4.2) {
      this.deathSeq = null;
      this.respawn();
    }
  }

  checkpoint(id) {
    this.checkpointId = id;
    this.g.hud.checkpointToast();
  }

  respawn() {
    const cp = CHECKPOINTS[this.checkpointId];
    const p = this.g.player;
    p.dead = false;
    p.frozen = false;
    this.drownView = 0;
    this.g.hud.setDeath(false);
    this.g.hud.setLetterbox(false);
    this.g.hud.setCrosshair(true);
    this.g.engine.finalPass.uniforms.uDistort.value = 0;
    this.g.engine.finalPass.uniforms.uDesat.value = 0.12;
    p.setPosition(cp.x, cp.z, cp.yaw);
    for (const e of this.g.enemies) { e.grabbing = false; e.reset(); }
    // 追逐失败：回到婚宴厅节拍，他回到婚台继续擦
    if (this.flags.chase || this.flags.letterTaken) {
      this.flags.chase = false;
      this.g.sky?.setPressure(0.45);
      const f01 = this.g.byId.f01;
      f01.def.workPos = [-22.4, -27.8];
      f01.def.workMode = 'work_wipe';
      f01.def.workYaw = -Math.PI / 2;
      f01.reset();
      if (this.flags.letterTaken) {
        this.setObjective('信已经在你身上——离开这栋楼');
        this.sub('他回到婚台边上，继续擦。像什么都没有发生。', 4);
        this.sub('可他记得你。', 2.4);
      }
    }
    this.applyBeatState();
  }

  /** 按 flags 恢复世界状态（重生/读档幂等） */
  applyBeatState() {
    const F = this.flags;
    const w = this.g.world;
    if (F.entered) { w.setDoorOpen('mainL', true, true); w.setDoorOpen('mainR', true, true); }
    if (F.extended) w.setCorridorExtended(true);
    if (F.banquetOpen) {
      w.setDoorOpen('banquetL', true, true);
      w.setDoorOpen('banquetR', true, true);
    }
    if (F.staffGone) {
      for (const id of ['cleaner', 'guard', 'chef']) this.g.byId[id]?.setEnabled(false);
    }
    if (F.replayDone) {
      const f01 = this.g.byId.f01;
      if (f01 && !this.f01Script) {
        f01.def.workPos = [-22.4, -27.8];
        f01.def.workMode = 'work_wipe';
        f01.def.workYaw = -Math.PI / 2;
      }
    }
  }

  // ============================================================
  // 结局
  // ============================================================
  beginEnding() {
    const F = this.flags;
    F.ended = true;
    this.g.player.frozen = true;
    this.g.hud.setLetterbox(true);
    this.g.hud.setCrosshair(false);
    this.endingSeq = { t: 0 };
    // 相机回望酒店
    this.sub('招牌还亮着最后几个字。', 3.6);
    this.g.audio?.hornDistant?.();
  }

  updateEnding(dt) {
    const seq = this.endingSeq;
    seq.t += dt;
    const cam = this.g.engine.camera;
    const p = this.g.player;
    // 缓慢转向酒店
    const eye = new THREE.Vector3(p.pos.x, p.pos.y + 1.62, p.pos.z);
    cam.position.copy(eye);
    const look = new THREE.Vector3(0, 3.2 + Math.min(1, seq.t / 6) * 3.4, 2);
    cam.lookAt(look);

    if (seq.t > 3 && !seq.signOff) {
      seq.signOff = true;
      this.g.world.dynamic.hotelSign.material.emissiveIntensity = 0.05;
      this.g.audio?.blip(70, 0.1, 0.5);
      this.sub('灯箱灭了。', 2.4);
    }
    if (seq.t > 5.5 && !seq.f01AtDoor) {
      seq.f01AtDoor = true;
      this.sub('玻璃门后面站着一个人。工装。侧分的头发。', 4.2);
      this.sub('他在替这栋楼，把你也记住。', 3.6);
    }
    if (seq.t > 10.5 && !seq.credits) {
      seq.credits = true;
      const mins = ((performance.now() - this.startTime) / 60000).toFixed(1);
      this.g.hud.fade(true);
      setTimeout(() => {
        this.g.hud.showEnding(
          [
            '楼可以拆。',
            '海可以退。',
            '可是有人分不清"留住"和"占有"。',
            '',
            '姐姐没有回来。',
            '但你把她的信带出来了——',
            '这一次，告别是她自己说的。',
          ],
          `《返潮 FANCHAO》 M01 垂直切片<br/>蚀湾 · 迎宾楼 · 2003<br/><br/>证据 ${this.notesFound.size} / ${NOTES.length} · 用时 ${mins} 分钟 · 被保存 ${this.deaths} 次<br/><br/>程序化生成 · 无预制资产`
        );
        this.g.onEnded();
      }, 2600);
    }
  }

  // ============================================================
  // 主更新
  // ============================================================
  update(dt) {
    this.elapsed += dt;
    const F = this.flags;
    const p = this.g.player;

    // 计划任务
    for (let i = this.schedule.length - 1; i >= 0; i--) {
      if (this.elapsed >= this.schedule[i].t) {
        const fn = this.schedule[i].fn;
        this.schedule.splice(i, 1);
        fn();
      }
    }

    if (this.introSeq) { this.updateIntro(dt); return; }
    if (this.deathSeq) { this.updateDeath(dt); return; }
    if (this.caughtSeq) { this.updateCaught(dt); return; }
    if (F.ended && this.endingSeq) { this.updateEnding(dt); return; }

    this.drownView = Math.max(0, this.drownView - dt * 0.8);

    // ---- 区域节拍触发 ----
    const rooms = this.g.world.rooms;
    const inRoom = (r) => p.pos.x >= r.minX && p.pos.x <= r.maxX && p.pos.z >= r.minZ && p.pos.z <= r.maxZ;

    if (F.entered && !this._cpLobby && inRoom(rooms.lobby)) {
      this._cpLobby = true;
      this.checkpoint('lobby');
      this.setObjective('前台的灯还亮着——去看看登记簿');
    }
    // 第一次踏进走廊
    if (!this._corridorIn && inRoom(rooms.corridor)) {
      this._corridorIn = true;
      this.sub('走廊闻起来像晒过又受了潮的地毯。', 3.6);
    }
    // 走到基础段尽头
    if (F.measured && !this._reachedEnd && p.pos.z < -28 && inRoom(rooms.corridor)) {
      this._reachedEnd = true;
      this.sub('尽头挂着一幅内湾的风景画。画里的桥是修好的。', 4);
      this.setObjective('走回大堂方向');
    }
    // 折返 → Leak
    if (this._reachedEnd && !F.extended && p.pos.z > -20) {
      this.triggerExtend();
    }
    // 深段检查点
    if (F.extended && !this._cpDeep && inRoom(rooms.corridorDeep)) {
      this._cpDeep = true;
      this.sub('这里的门牌没有数字。', 3.2);
    }
    // 婚宴厅初进
    if (F.banquetOpen && !this._banquetIn && inRoom(rooms.banquet)) {
      this._banquetIn = true;
      this.checkpoint('banquet');
      this.sub('四十桌的席。台布都铺好了。碗筷都摆好了。', 4.2);
      this.sub('角落里有一台电视车，接着录像机。', 3.6);
      this.setObjective('播放婚宴录像');
    }
    // 逃脱后回到前庭
    if (F.escaped && !this._aftermathIn && inRoom(rooms.forecourt)) {
      this._aftermathIn = true;
      this.sub('海雾漫上了前庭。海比你进楼的时候，又近了一截。', 4.6);
    }

    // ---- 录像事件 ----
    if (this.videoEvent) this.updateVideoEvent(dt);
    // ---- F01 脚本行走 ----
    if (this.f01Script) this.updateF01Script(dt);
    // ---- 追逐 ----
    if (F.chase) this.updateChase(dt);
    // 被抓重来后：信还在身上，走出大门同样算逃脱（防软锁）
    if (F.letterTaken && !F.escaped && !F.chase && p.pos.z > 4.5) this.endChase();

    // ---- 暴露崩溃：他借走你的眼睛 ----
    if (this.g.stealth.resonance >= 1 && !this._exposeBurst) {
      this._exposeBurst = true;
      const f01 = this.g.byId.f01;
      if (this.g.sightjack.active) {
        this.g.sightjack.exit();
        this.g.sightjack.restorePost();
        this.g.audio?.setSightjack(false);
      }
      this.sub('井底的水光晃了一下——他察觉到有人在借他的眼睛。', 4.2);
      if (f01?.enabled) {
        this.g.sightjack.forceView(f01, 3.2, () => {
          this.g.sightjack.exit();
          this.g.sightjack.restorePost();
          this.g.audio?.setSightjack(false);
          this.g.hud.setCrosshair(true);
          this.g.stealth.resonance = 0.35;
          this._exposeBurst = false;
          f01.hearAlarm(p.pos);
          this.sub('现在他知道楼里还有一双别人的眼睛了。', 4);
        });
      } else {
        this.g.stealth.resonance = 0.4;
        this._exposeBurst = false;
      }
    }

    // ---- 监控/录像 RTT 渲染 ----
    const needFeed = this.videoLive || this.videoEvent || inRoom(rooms.security);
    if (needFeed) {
      this._feedFrame = (this._feedFrame ?? 0) + 1;
      if (this._feedFrame % 2 === 0) {
        const renderer = this.g.engine.renderer;
        renderer.setRenderTarget(this.videoRT);
        renderer.render(this.g.engine.scene, this.videoCam);
        renderer.setRenderTarget(null);
        const screens = [this.g.world.videoScreens.tv, ...this.g.world.videoScreens.monitors];
        for (const s of screens) {
          if (!s) continue;
          if (this.videoEvent || this.videoLive) {
            if (s.material.map !== this.videoRT.texture) {
              s.material.map = this.videoRT.texture;
              s.material.color.setHex(0x9fd8b4); // 老监视器的冷绿
              s.material.needsUpdate = true;
            }
          }
        }
      }
    } else if (this._feedOn) {
      // 关闭屏幕
      const screens = [this.g.world.videoScreens.tv, ...this.g.world.videoScreens.monitors];
      for (const s of screens) {
        if (!s) continue;
        s.material.map = null;
        s.material.color.setHex(0x0a0f10);
        s.material.needsUpdate = true;
      }
    }
    this._feedOn = !!needFeed;
  }
}
