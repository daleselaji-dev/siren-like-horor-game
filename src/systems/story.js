// 叙事与关卡逻辑：文书、互动、触发器、谜题、血潮、检查点、死亡、终局
// 20 分钟节拍见 docs/设计文档.md 第四节
import * as THREE from 'three';

// ---------------- 文书全文 ----------------
export const NOTES = [
  {
    id: 'note1', title: '① 姐姐的信（最后一封）',
    body: `弟：

不要回来。这不是气话。
村里在办第二次锁潮祭，闫伯说这次的祭文是"倒着写的"。
倒着写的祭文不是给神念的。

昨夜退潮，潮汐线没有退。今早我去看，
线上挂着的不是海带，是头发。

潮母在点名。点到陈家了。
我听见有人在水底下喊我的小名——是妈的声音。
可妈走了十一年了。

不要回来。替我把窗关好。

                         ——织晚，四月初八`,
  },
  {
    id: 'note2', title: '② 渔民日记（渔寮·残页）',
    body: `四月初九　阴

浪把船顶回来了。不是浪。是浪底下有手。

出不了海就补网。老三坐在门口补了一天，
我叫他吃饭他不应。凑近看，
他补的哪里是网，他把自己的裤脚和网织在一起了。
他冲我笑，喉咙里"咕咚咕咚"响，像泡在水里说话。

四月初十　阴

今天全村都在补网。
我数了数，连死了三年的春伯也坐在堤上补。

我不敢再写了。墨是咸的。`,
  },
  {
    id: 'note3', title: '③ 盐工账本（批注）',
    body: `【账本正文】四月初七　出盐九担半　湿　再晒
四月初八　出盐——

【页边批注，字迹潦草】
盐晒不干。三天了。
盐板上的盐每天早上都摆成一样的花纹，
像鳞。

婆娘说：别扫，那是潮母的鳞，扫了她要来收。
我扫了。

【最后一行，几乎划破纸面】
她今晚真的来收了　她拿我的嗓子装盐`,
  },
  {
    id: 'note4', title: '④ 广播站录音稿（誊抄）',
    body: `【盐门村广播站　四月初八　台风警报誊抄稿】

"……沿海渔船请注意，今夜有强台风过境，
琅屿以东海面阵风十一级，所有船只回港避风……
重复，所有船只回港避……避……"

【以下为当值员手写】
警报念到一半，喇叭里进来了别的声音。
不是串台。那声音是从海里灌上来的，
是唱歌。调子我认得，是小满姑娘的调子。
可小满前年就沉在东礁了。

我把广播关了。歌没停。
喇叭明明断了电，歌没停。

我最后广播一句话，谁听到谁记住：
锁潮祭没锁住东西，是把东西请进来了。`,
  },
  {
    id: 'note5', title: '⑤ 祭师忏悔文（潮母宫偏殿）',
    body: `罪人闫守潮，叩首血书。

甲子大祭，我改了祭文。
锁潮祭本意：沉铃赎喉，锁潮于外。
我把"送"字全改成了"迎"字，
倒点三炷香，把我女儿小满的名字，
写进了请神的位置。

我只想让她回来唱一句。一句就好。

潮母应了。
潮母把全村的喉咙都应给了她。

如今满村都是她的声音，
唯独没有一张嘴是她的。

要止潮，须补祭：
倒香复正——先北，再南，后中。
取回喉铃，送还海心。
若无人送铃，则满村永不退潮，
若有人送铃——送铃的人，替全村唱下去。

罪人叩首。叩首。叩首。`,
  },
  {
    id: 'note6', title: '⑥ 小满的歌词册（潮母宫后廊）',
    body: `【一本晒盐女工的手抄歌册，纸页被海水泡涨】

《咸水谣》　盐门村调

　　潮水涨，涨过窗，
　　阿妹梳头对海望。
　　潮水落，落过堤，
　　阿哥摇橹不回西。

【下面一首的字迹不一样。很旧，像是很多年前就写在这里等着】

　　潮水涨，涨过喉，
　　替我唱歌的人不用愁。
　　一人唱，全村和，
　　海底点灯十万座。

【页脚小字】
这不是我写的。这本子买来就有这一页。
我唱给爹听，爹把本子抢去烧了三次，
三次都完完整整回到我枕头底下。
它想让我学会。`,
  },
  {
    id: 'note7', title: '⑦ 灯塔看守日志（末页）',
    body: `第 41 夜。

灯油还够。眼药水没了。
我现在不敢眨眼。眨眼的功夫他们就换姿势。

白天从塔顶往下看，村里人都在干活：
补网的补网，晒盐的晒盐，谁都不闲着。
可你盯住任何一个人看足一炷香，
就会发现他手里的活永远差最后一针。
永远差一针。他们不是在干活，
他们是被钉在"干活"里。

海上今夜有灯。不是渔火。
渔火不会排成那么长的一条线，
渔火也不会随着歌声一明一灭。

如果有人看到这本日志：
别灭塔灯。塔灯一灭，她就知道岸上没人守着了。

【字迹到此为止。桌上有半杯水，是咸的。】`,
  },
  {
    id: 'note8', title: '⑧ 海洋站电报（未发出）',
    body: `【电报底稿　加急】

致县海洋站：

盐门村海域观测异常如下——
一、该海域潮位连续三十七个月无落潮记录。
二、水温恒定，与人体温相同。
三、水下测音器录得连续声源，
　　频谱分析结果为人声，女性，单一声部。
　　注：声源深度九百米。
　　注：九百米无光无氧。
　　注：唱的人不需要换气。

四、建议海图将本村标注为——

【电报未写完。落款处只有一行小字】

查无此村。查无此村。查无此村。`,
  },
];

// 石碑铭文（气氛互动，不计入文书）
const STELE_TEXT = '碑文风化难辨，只余八字——「潮起还人　潮落收喉」';

// ---------------- 主控 ----------------
export class Story {
  constructor(game) {
    this.g = game; // {scene,engine,world,player,hud,audio,enemies,byId,sightjack,stealth,ocean,sky,M}
    this.flags = {
      intro: false, stealthTip: false, sightjackTip: false,
      knowKeySpot: false, hasKey: false, gateOpen: false,
      radioOn: true, radioHeard: false,
      puzzleProgress: 0, puzzleSolved: false, bellTaken: false,
      bloodTide: false, wreckTip: false, breakerOn: false,
      atTop: false, ended: false, singerTip: false,
    };
    this.notesFound = new Set();
    this.checkpoint = null;
    this.deathSeq = null;   // 死亡协程状态
    this.endSeq = null;
    this.drownTimer = 0;
    this.ritual = { seq: [2, 0, 1], idx: 0, t: 0, phase: 'gaze' }; // 先北(2) 再南(0) 后中(1)
    this.time = 0;

    this.interactables = [];
    this.triggers = [];
    this.noteMeshes = new Map();

    this.buildNotes();
    this.buildInteractables();
    this.buildTriggers();
    this.buildTideMother();
    this.setupGhostFlames();

    // 海的视角（终局强制视奸载体）
    const lp = this.g.world.locations.bellTop;
    this.seaViewer = {
      id: 'sea', label: '海', kind: 'sea', enabled: true, pos: new THREE.Vector3(118, 2, -168),
      viewPos: (out) => (out ?? new THREE.Vector3()).set(118, 6, -168),
      viewYawPitch: () => {
        const yaw = Math.atan2(lp.x - 118, lp.z - (-168)) + Math.PI;
        return { yaw, pitch: 0.12 };
      },
      update: () => {},
      setEnabled: () => {},
    };

    this.saveCheckpoint('spawn');
  }

  // ---------- 文书可视化 ----------
  buildNotes() {
    const L = this.g.world.locations;
    const spots = {
      note1: L.luggage, note2: L.note2, note3: L.note3,
      note5: L.note5, note6: L.note6, note7: L.note7, note8: L.note8,
    };
    for (const [id, pos] of Object.entries(spots)) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.42), this.g.M.paperGlow);
      m.position.copy(pos);
      m.rotation.x = -Math.PI / 2 + 0.25;
      m.rotation.z = Math.random() * 3;
      this.g.scene.add(m);
      this.noteMeshes.set(id, m);
    }
    // note4 在收音机上，无纸张
  }

  notePickupAction(id) {
    return () => {
      const note = NOTES.find((n) => n.id === id);
      this.notesFound.add(id);
      this.noteMeshes.get(id)?.removeFromParent();
      this.g.audio.paper();
      this.g.openNote(note);
    };
  }

  // ---------- 互动点 ----------
  buildInteractables() {
    const L = this.g.world.locations;
    const F = this.flags;
    const add = (o) => this.interactables.push(o);

    // 文书
    const noteSpots = { note1: L.luggage, note2: L.note2, note3: L.note3, note5: L.note5, note6: L.note6, note7: L.note7, note8: L.note8 };
    for (const [id, pos] of Object.entries(noteSpots)) {
      add({
        id, pos, r: 2.0, prompt: '拾取文书',
        cond: () => !this.notesFound.has(id),
        act: this.notePickupAction(id),
      });
    }

    // 石碑
    add({
      id: 'stele', pos: L.stele, r: 2.2, prompt: '辨认碑文',
      cond: () => true,
      act: () => { this.g.hud.subtitle(STELE_TEXT, 5); this.g.audio.paper(); },
    });

    // 堤门
    add({
      id: 'gate', pos: L.gate, r: 3.4, prompt: '推门',
      cond: () => !F.gateOpen,
      act: () => {
        if (F.hasKey) {
          F.gateOpen = true;
          this.g.audio.doorCreak();
          this.g.stealth.emitNoise(L.gate.x, L.gate.z, 18);
          this.g.hud.subtitle('锈锁应声而开。门轴的吱呀声传得很远。', 4);
          this.g.hud.objective('穿过村子，寻找还醒着的声音');
          this.saveCheckpoint('gate', L.gate.x, L.gate.z + 3);
        } else {
          this.g.hud.subtitle('锁着。锁眼里塞满了盐粒。', 3.5);
          if (!F.sightjackTip) {
            F.sightjackTip = true;
            this.g.hud.subtitle('堤上有个提灯的人来回走。他生前管这道门。', 4.5);
            this.g.hud.subtitle('静下来，按 Q ——借他的眼睛看。', 5);
            this.g.hud.objective('视奸提灯人，找到堤门钥匙');
          }
        }
      },
    });

    // 水缸下的钥匙（必须先视奸获知）
    add({
      id: 'vat', pos: () => this.g.world.dynamic.hut2.local(-1.35, 0.6, 1.0), r: 1.8,
      prompt: '搬开水缸',
      cond: () => F.knowKeySpot && !F.hasKey,
      act: () => {
        F.hasKey = true;
        this.g.audio.blip(500, 0.1, 0.2);
        this.g.hud.subtitle('缸底压着一把黄铜钥匙，缠着红线。', 4);
        this.g.hud.objective('打开堤门');
      },
    });

    // 收音机
    add({
      id: 'radio', pos: L.radio, r: 2.2, prompt: '调收音机',
      cond: () => !this.notesFound.has('note4'),
      act: () => {
        this.notesFound.add('note4');
        this.g.audio.paper();
        this.g.hud.subtitle('喇叭里的警报是三年前的。桌上压着当值员的誊抄稿。', 4.5, 'radio');
        this.g.openNote(NOTES.find((n) => n.id === 'note4'));
        this.g.hud.objective('去潮母宫，补完那场锁潮祭');
        this.saveCheckpoint('radio');
      },
    });

    // 三只香炉（谜题）
    this.g.world.dynamic.censers.forEach((c, i) => {
      add({
        id: `censer${i}`, pos: c.pos, r: 1.7, prompt: '点香',
        cond: () => !F.puzzleSolved,
        act: () => this.lightCenser(i),
      });
    });

    // 喉铃
    add({
      id: 'bell', pos: L.altar, r: 2.0, prompt: '请下喉铃',
      cond: () => F.puzzleSolved && !F.bellTaken,
      act: () => this.takeBell(),
    });

    // 灯塔电闸
    add({
      id: 'breaker', pos: L.breaker, r: 1.8, prompt: '合上电闸',
      cond: () => !F.breakerOn,
      act: () => {
        F.breakerOn = true;
        this.g.audio.blip(120, 0.25, 0.5);
        this.g.audio.blip(1900, 0.06, 0.4, 0.3);
        const d = this.g.world.dynamic;
        d.lighthouseLamp.material.emissiveIntensity = 2.6;
        d.lighthouseBeam.children[0].material.opacity = 0.16;
        this.g.hud.subtitle('发电机咳嗽了几声，活了过来。塔灯亮了。', 4);
        this.g.hud.subtitle('歌声顿了一拍——她知道岸上还有人。', 4.5, 'song');
        this.saveCheckpoint('lighthouse');
      },
    });

    // 梯子（上/下）
    add({
      id: 'ladderUp', pos: L.ladderBottom, r: 1.6, prompt: '攀上灯塔',
      cond: () => this.flags.breakerOn,
      act: () => {
        const t = L.ladderTopSpot;
        this.teleport(t.x, t.z, t.yaw, () => {
          this.flags.atTop = true;
          if (!this.flags.ended) {
            this.g.hud.subtitle('风从四面八方来。海在下面看着你。', 4);
            this.g.hud.objective('敲响喉铃');
          }
        });
      },
    });
    add({
      id: 'ladderDown', pos: () => {
        const t = L.ladderTopSpot;
        return new THREE.Vector3(t.x, this.g.world.heightAt(t.x, t.z), t.z);
      },
      r: 1.5, prompt: '爬下灯塔',
      cond: () => this.flags.atTop && !this.flags.ended,
      act: () => {
        // 落点在塔顶补丁范围之外，避免多层高度歧义
        this.teleport(72.6, -115.4, 2.4, () => { this.flags.atTop = false; });
      },
    });

    // 终局铃架
    add({
      id: 'bellTop', pos: L.bellTop, r: 2.0, prompt: '把喉铃挂上，敲响',
      cond: () => this.flags.atTop && this.flags.bellTaken && !this.flags.ended,
      act: () => this.beginEnding(),
    });
  }

  // ---------- 触发区 ----------
  buildTriggers() {
    const Z = this.g.world.zones;
    const add = (o) => this.triggers.push(o);

    add({
      zone: Z.dikeArea, once: true,
      act: () => {
        this.g.hud.subtitle('堤上有人。是熟面孔——李家的三叔，三年前就该下葬的三叔。', 5);
        this.g.hud.subtitle('他还在补网。按住 Shift 放低身子，别让他直起腰。', 5.5);
        this.flags.stealthTip = true;
        this.saveCheckpoint('dike');
      },
    });
    add({
      zone: Z.villageCenter, once: true, cond: () => this.flags.gateOpen,
      act: () => {
        this.g.hud.subtitle('村子还是老样子。太"老样子"了——香烛没灭，灶台温着，广播响着。', 6);
        this.g.hud.subtitle('三年，没有一样东西敢动。', 4);
      },
    });
    add({
      zone: Z.saltField, once: true,
      act: () => this.g.hud.subtitle('盐田里的盐摆成鳞片的纹路。有人在夜里一片一片摆好。', 5),
    });
    add({
      zone: Z.temple, once: true,
      act: () => {
        this.g.hud.subtitle('潮母宫。祭师还跪在里面，重复着三年前没做完的动作。', 5);
        this.g.hud.subtitle('他在演练点香的次序。借他的眼睛（Q），看清楚。', 5.5);
        this.saveCheckpoint('temple');
      },
    });
    add({
      zone: Z.wreckBay, once: true, cond: () => this.flags.bloodTide,
      act: () => {
        this.flags.wreckTip = true;
        this.g.hud.subtitle('湾里的水涨红了。走沉船的龙骨——别碰水，水里有手。', 5.5);
      },
    });
    add({
      zone: Z.lighthouse, once: true,
      act: () => {
        this.g.hud.subtitle('灯塔是黑的。守塔人说过：塔灯一灭，她就知道岸上没人了。', 5.5);
        this.g.hud.objective('让灯塔重新亮起来');
      },
    });
  }

  // ---------- 鬼火（只在视奸相机可见 → 强制机制#2） ----------
  setupGhostFlames() {
    for (const c of this.g.world.dynamic.censers) {
      c.flames.traverse((o) => o.layers.set(1));
      c.flames.visible = true;
      c.ghostOn = false;
      c.lit = false;
      this.setFlameVisual(c);
    }
    this.g.sightjack.camera.layers.enable(1);
  }

  setFlameVisual(c) {
    // lit: 主相机+视奸都可见; ghost: 仅视奸(layer1); off: 隐藏
    if (c.lit) {
      c.flames.traverse((o) => o.layers.enableAll());
      c.flames.visible = true;
    } else if (c.ghostOn) {
      c.flames.traverse((o) => { o.layers.set(1); });
      c.flames.visible = true;
    } else {
      c.flames.visible = false;
    }
  }

  lightCenser(i) {
    const F = this.flags;
    const censers = this.g.world.dynamic.censers;
    if (F.puzzleSolved) return;
    const expect = this.ritual.seq[F.puzzleProgress];
    if (i === expect) {
      F.puzzleProgress++;
      censers[i].lit = true;
      this.setFlameVisual(censers[i]);
      this.g.audio.incense();
      if (F.puzzleProgress >= 3) {
        F.puzzleSolved = true;
        this.g.audio.bellSmall();
        this.g.hud.subtitle('三炷香复正。神台后传来一声轻响，像什么东西松开了。', 5);
        this.g.hud.subtitle('神台上——喉铃。', 3);
      } else {
        this.g.hud.subtitle(`香点着了。（${F.puzzleProgress} / 3）`, 2.5);
      }
    } else {
      F.puzzleProgress = 0;
      for (const c of censers) { c.lit = false; this.setFlameVisual(c); }
      this.g.audio.wrong();
      this.g.stealth.emitNoise(censers[i].pos.x, censers[i].pos.z, 22);
      this.g.hud.subtitle('香一齐灭了。风是从殿里往外吹的。', 4);
      this.g.hud.subtitle('顺序不对。祭师每晚都在演练——用他的眼睛看（Q）。', 5);
    }
  }

  takeBell() {
    const F = this.flags;
    F.bellTaken = true;
    this.g.world.dynamic.altarBell.visible = false;
    this.g.audio.bellSmall();
    this.g.hud.subtitle('铃很轻。轻得像一截空了的喉咙。', 4);
    // —— 血潮 ——
    setTimeout(() => this.beginBloodTide(), 2500);
  }

  beginBloodTide() {
    const F = this.flags;
    if (F.bloodTide) return;
    F.bloodTide = true;
    const g = this.g;
    g.audio.setBloodTide(true);
    g.ocean.setBloodTide(true, 1.8);
    g.sky.setBloodTide(true);
    g.stealth.resonanceActive = true;
    g.stealth.envSightFactor = 0.8;
    g.hud.subtitle('潮来了。不是涨——是整个海往村里挪。', 5, 'song');
    g.hud.subtitle('全村的喉咙一起响了。她们在和。', 5, 'song');
    g.hud.objective('去灯塔——把铃还给海');
    // 敌人变化：劳作者起身巡游，歌唱者与看守者入场
    const byId = g.byId;
    byId.netMender.kind = 'patrol';
    byId.netMender.def.waypoints = [[12, 47], [4, 56], [18, 60], [26, 50]];
    byId.netMender.state = 'PATROL';
    byId.saltWorker.kind = 'patrol';
    byId.saltWorker.def.waypoints = [[-44, 4], [-30, 12], [-24, -4], [-40, -8]];
    byId.saltWorker.state = 'PATROL';
    byId.singer.setEnabled(true);
    byId.warden.setEnabled(true);
    // 祭师瘫在原地(他的祭做完了)
    byId.priest.def.workMode = 'idle';
    this.saveCheckpoint('bloodtide', -50, -66);
  }

  // ---------- 演练仪式（祭师） ----------
  updateRitual(dt) {
    if (this.flags.puzzleSolved || this.flags.bloodTide) return;
    const priest = this.g.byId.priest;
    if (!priest || priest.state !== 'WORK') {
      // 被惊动时鬼火全灭
      for (const c of this.g.world.dynamic.censers) { c.ghostOn = false; if (!c.lit) this.setFlameVisual(c); }
      return;
    }
    const R = this.ritual;
    const censers = this.g.world.dynamic.censers;
    R.t += dt;
    if (R.phase === 'gaze') {
      const target = censers[R.seq[R.idx]];
      // 祭师面向当前香炉；鬼火亮（只在视奸中可见）
      priest.def.workYaw = Math.atan2(target.pos.x - priest.pos.x, target.pos.z - priest.pos.z);
      if (!target.ghostOn) {
        target.ghostOn = true;
        if (!target.lit) this.setFlameVisual(target);
      }
      if (R.t > 2.4) {
        target.ghostOn = false;
        if (!target.lit) this.setFlameVisual(target);
        R.t = 0;
        R.idx++;
        if (R.idx >= 3) { R.idx = 0; R.phase = 'bow'; }
      }
    } else {
      // 叩拜间歇
      priest.def.workYaw = Math.atan2(this.g.world.locations.altar.x - priest.pos.x,
        this.g.world.locations.altar.z - priest.pos.z);
      if (R.t > 3.2) { R.t = 0; R.phase = 'gaze'; }
    }
    // 玩家在视奸祭师时给一次提示
    if (!this.flags.ritualTip && this.g.sightjack.active && this.g.sightjack.current === priest) {
      this.flags.ritualTip = true;
      this.g.hud.subtitle('他在看香炉——记住次序。', 4);
    }
  }

  // ---------- 视奸获知钥匙 ----------
  updateKeySpy() {
    const F = this.flags;
    if (F.knowKeySpot || !this.g.sightjack.active) return;
    const patrol = this.g.byId.dikePatrol;
    if (this.g.sightjack.current !== patrol) return;
    // 巡堤人走进渔寮二的路段（路点 5~7 段）
    if (patrol.state === 'PATROL' && patrol.wpIndex >= 5 && patrol.wpIndex <= 7) {
      const d = Math.hypot(patrol.pos.x - 20, patrol.pos.z - 59);
      if (d < 4.5) {
        F.knowKeySpot = true;
        this.g.hud.subtitle('他每晚都要看一眼那口水缸的缸底。', 4.5);
        this.g.hud.subtitle('钥匙在渔寮里的水缸下面。', 4);
      }
    }
  }

  // ---------- 开场 ----------
  beginIntro() {
    const F = this.flags;
    if (F.intro) return;
    F.intro = true;
    const hud = this.g.hud;
    hud.subtitle('……沿海渔船请注意……阵风十一级……所有船只回港避风……', 5, 'radio');
    hud.subtitle('……重复……盐门村渡口……停航……停航……', 4.5, 'radio');
    hud.subtitle('渡船在礁上撞碎的时候，收音机还在念三年前的台风警报。', 5);
    hud.subtitle('姐姐的信在口袋里泡咸了。邮戳永远是同一天：四月初八。', 5.5);
    hud.subtitle('潮声里有人在唱歌。调子很熟，像小时候听过。', 5, 'song');
    setTimeout(() => {
      hud.objective('沿礁滩上岸，找到进村的路');
    }, 12000);
  }

  // ---------- 检查点 ----------
  saveCheckpoint(name, x, z) {
    const p = this.g.player;
    this.checkpoint = {
      name,
      x: x ?? p.pos.x, z: z ?? p.pos.z, yaw: p.yaw,
      y: x !== undefined ? undefined : p.pos.y, // 自定义坐标时按最高面解析
    };
  }

  respawn() {
    const g = this.g;
    const c = this.checkpoint;
    g.player.setPosition(c.x, c.z, c.yaw, c.y);
    g.player.dead = false;
    g.player.frozen = false;
    // 敌人复位（保留 permAlertBonus——永不忘记）
    for (const e of g.enemies) e.reset?.();
    g.stealth.resonance = 0;
    g.stealth.danger = 0;
    this.drownTimer = 0;
    g.hud.setDeath(false);
    g.hud.fade(false);
  }

  // ---------- 死亡 ----------
  kill(reason, sub) {
    if (this.g.player.dead || this.flags.ended) return;
    const g = this.g;
    g.player.dead = true;
    g.player.frozen = true;
    g.audio.drown();
    g.sightjack.exit();
    g.sightjack.restorePost();
    g.hud.clearSubtitles();
    this.deathSeq = { t: 0, reason, sub };
    g.engine.finalPass.uniforms.uRedShift.value = 0.5;
    document.getElementById('death-text').textContent = reason ?? '溺';
    g.hud.setDeath(true, sub ?? '潮水替你记住了这里 —— 正在回到检查点');
  }

  updateDeath(dt) {
    if (!this.deathSeq) return;
    this.deathSeq.t += dt;
    const t = this.deathSeq.t;
    this.g.engine.finalPass.uniforms.uRedShift.value = Math.min(0.75, 0.5 + t * 0.1);
    if (t > 2.2 && !this.deathSeq.faded) {
      this.deathSeq.faded = true;
      this.g.hud.fade(true);
    }
    if (t > 4.2) {
      this.deathSeq = null;
      this.g.engine.finalPass.uniforms.uRedShift.value = this.flags.bloodTide ? 0.12 : 0;
      this.respawn();
    }
  }

  // ---------- 溺水（深水危险） ----------
  updateDrown(dt) {
    const p = this.g.player;
    if (p.dead || this.flags.ended) return;
    if (p.inWaterDepth > 1.02) {
      this.drownTimer += dt;
      if (this.drownTimer > 0.4 && !this._drownWarned) {
        this._drownWarned = true;
        this.g.hud.subtitle('水下有手在拽你的裤脚。', 3);
      }
      if (this.drownTimer > 2.0) this.kill('溺', '海把你收下了。—— 回到检查点');
    } else {
      this.drownTimer = Math.max(0, this.drownTimer - dt * 2);
      if (this.drownTimer === 0) this._drownWarned = false;
    }
    this.drownView = Math.min(1, this.drownTimer / 2);
  }

  // ---------- 共鸣崩溃 ----------
  updateResonance() {
    const g = this.g;
    if (g.stealth.resonance >= 1 && !g.player.dead && !this.flags.ended) {
      if (!this.flags.singerTip) this.flags.singerTip = true;
      // 强制视奸：被拽进歌唱者的眼睛
      g.stealth.resonance = 0.99;
      g.player.dead = true;
      g.player.frozen = true;
      g.hud.clearSubtitles();
      g.hud.subtitle('歌词突然听清了。每一个字都是你的名字。', 4, 'song');
      g.sightjack.forceView(g.byId.singer, 3.2, () => {
        g.sightjack.exit();
        this.kill('和', '你差点跟着唱出来。—— 回到检查点');
      });
    }
    // 首次共鸣警告
    if (g.stealth.resonance > 0.35 && !this._resonanceWarned) {
      this._resonanceWarned = true;
      g.hud.subtitle('喉咙在自己发痒。离那个红衣服的声音远一点。', 4.5, 'song');
    }
  }

  // ---------- 传送（梯子等） ----------
  teleport(x, z, yaw, after) {
    const g = this.g;
    g.player.frozen = true;
    g.hud.fade(true);
    setTimeout(() => {
      g.player.setPosition(x, z, yaw);
      g.hud.fade(false);
      g.player.frozen = false;
      after?.();
    }, 900);
  }

  // ---------- 潮母 ----------
  buildTideMother() {
    const grp = new THREE.Group();
    const dark = new THREE.MeshBasicMaterial({ color: 0x0a0d12, fog: false });
    const mk = (geo, x, y, z, sx, sy, sz) => {
      const m = new THREE.Mesh(geo, dark);
      m.position.set(x, y, z); m.scale.set(sx, sy, sz);
      grp.add(m);
    };
    // 山一样的轮廓：驼峰 + 抬起的"头"
    mk(new THREE.SphereGeometry(1, 24, 16), 0, 0, 0, 42, 30, 30);
    mk(new THREE.SphereGeometry(1, 24, 16), -30, 12, 4, 22, 26, 18);
    mk(new THREE.SphereGeometry(1, 20, 14), -46, 34, 6, 9, 14, 8);
    // 鳞＝成串灯笼
    const lm = new THREE.MeshBasicMaterial({ color: 0xff9440, fog: false });
    for (let i = 0; i < 14; i++) {
      const a = i / 14;
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.9, 6, 6), lm);
      m.position.set(-44 + a * 80, 16 + Math.sin(a * Math.PI) * 16 + Math.sin(i * 2.7) * 2, 10 - a * 6);
      grp.add(m);
    }
    grp.position.set(150, -70, -215);
    grp.visible = false;
    this.g.scene.add(grp);
    this.tideMother = grp;
  }

  // ---------- 终局 ----------
  beginEnding() {
    const g = this.g;
    this.flags.ended = true;
    g.player.frozen = true;
    g.hud.prompt(null);
    g.audio.bellBig();
    this.endSeq = { t: 0, stage: 0 };
    g.hud.clearSubtitles();
    g.hud.subtitle('铃声出去了。海面安静了一秒。', 4);
  }

  updateEnding(dt) {
    if (!this.endSeq) return;
    const g = this.g;
    const s = this.endSeq;
    s.t += dt;

    // 潮母上升贯穿阶段1~2（仅阶段1不够升到位）
    if (s.stage >= 1 && s.stage <= 2) {
      this.tideMother.position.y = Math.min(-6, this.tideMother.position.y + dt * 7);
    }
    // 塔灯光束被"她"攫住：缓缓转向潮母并停住（避免光锥乱扫穿插剪影）
    if (s.stage >= 1) {
      const b = g.world.dynamic.lighthouseBeam;
      const dx = this.tideMother.position.x - b.position.x;
      const dz = this.tideMother.position.z - b.position.z;
      const target = Math.atan2(-dz, dx);
      b.rotation.y += (((target - b.rotation.y + Math.PI) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 0.8);
    }

    switch (s.stage) {
      case 0:
        if (s.t > 3) {
          s.stage = 1; s.t = 0;
          this.tideMother.visible = true;
          g.scene.fog.density = 0.006; // 让海平线的轮廓显形
          g.hud.subtitle('然后，海平线站了起来。', 5, 'song');
          g.audio.setBloodTide(true);
        }
        break;
      case 1: {
        // 玩家视线被拽向它
        const p = g.player;
        const dx = this.tideMother.position.x - p.pos.x;
        const dz = this.tideMother.position.z - p.pos.z;
        const targetYaw = Math.atan2(-dx, -dz);
        p.yaw += (((targetYaw - p.yaw + Math.PI) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 1.5);
        p.pitch += (0.08 - p.pitch) * Math.min(1, dt * 2);
        p.syncCamera(dt);
        if (s.t > 7) {
          s.stage = 2; s.t = 0;
          g.hud.subtitle('那些灯不是灯。是鳞。每一片鳞里都点着一户人家。', 6, 'song');
        }
        break;
      }
      case 2:
        if (s.t > 5) {
          s.stage = 3; s.t = 0;
          g.hud.subtitle('喉咙里涌上咸水。不疼。像回家。', 5, 'song');
          // 强制视奸：从海的视角看灯塔上的自己
          g.sightjack.forceView(this.seaViewer, 6.5, () => {});
        }
        break;
      case 3:
        if (s.t > 6.8) {
          s.stage = 4; s.t = 0;
          g.hud.fade(true);
          g.audio.songGain?.gain.setTargetAtTime(0.7, g.audio.ctx.currentTime, 1.5);
        }
        break;
      case 4:
        if (s.t > 3) {
          s.stage = 5;
          g.sightjack.exit();
          g.sightjack.restorePost();
          g.player.frozen = true;
          g.hud.showEnding(
            ['你也开始唱了。', '', '—— Demo 结束 ——'],
            `咸潮 SALT TIDE · 中式民俗海洋恐怖<br/>
             文书拾获：${this.notesFound.size} / 8<br/><br/>
             「潮起还人，潮落收喉。」<br/><br/>
             按 F5 重新入村`
          );
          g.onEnded?.();
        }
        break;
    }
  }

  // ---------- 主更新 ----------
  update(dt) {
    this.time += dt;
    const g = this.g;

    this.updateDeath(dt);
    if (this.flags.ended) { this.updateEnding(dt); return; }
    if (g.player.dead) return;

    this.updateDrown(dt);
    this.updateRitual(dt);
    this.updateKeySpy();
    this.updateResonance();

    // 触发区
    const p = g.player.pos;
    for (const t of this.triggers) {
      if (t.done) continue;
      if (t.cond && !t.cond()) continue;
      const z = t.zone;
      if (p.x >= z.minX && p.x <= z.maxX && p.z >= z.minZ && p.z <= z.maxZ) {
        t.done = t.once !== false;
        t.act();
      }
    }

    // 堤门动画
    const d = g.world.dynamic;
    if (this.flags.gateOpen && d.gateDoor.rotation.y > -1.9) {
      d.gateDoor.rotation.y = Math.max(-1.9, d.gateDoor.rotation.y - dt * 1.4);
      d.gateCollider.maxY = -Infinity; // 失效
      d.gateCollider.minX = 9999; d.gateCollider.maxX = 9999;
    }

    // 收音机刻度盘闪烁
    if (d.radioDial) {
      d.radioDial.material.color.setHSL(0.08, 0.9, 0.4 + Math.sin(this.time * 7) * 0.12);
    }

    // 灯塔光束旋转
    if (this.flags.breakerOn) {
      d.lighthouseBeam.rotation.y += dt * 0.5;
    }

    // 文书纸片轻微浮动
    for (const [, m] of this.noteMeshes) {
      m.rotation.z += dt * 0.15;
    }
  }

  /** 找到当前可互动对象 */
  findInteractable() {
    const p = this.g.player.pos;
    let best = null, bestD = 1e9;
    for (const it of this.interactables) {
      if (it.cond && !it.cond()) continue;
      const pos = typeof it.pos === 'function' ? it.pos() : it.pos;
      const d = Math.hypot(pos.x - p.x, pos.z - p.z);
      const vert = Math.abs((pos.y ?? p.y) - p.y);
      if (d < it.r && vert < 3.2 && d < bestD) { best = it; bestD = d; }
    }
    return best;
  }
}
