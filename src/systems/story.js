// 《返潮》叙事与关卡逻辑：八节拍主线 · 文书 · 议程联动 · CRT 预现/破像 · 引座 · 检查点 · 终局
// 2001 年秋，蚀湾。三年前填湾借地起楼，今夜「核册还地」。
// 你是外乡人阿澄——周絮写信求你来做核册的「外证」。镇上没人看你，也没人拦你。
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { Humanoid, poseAs } from '../entities/humanoid.js';

// ---------------- 文书全文 ----------------
export const NOTES = [
  {
    id: 'note1', title: '① 外证凭条（长途车站·行李箱）',
    body: `【铅印凭条，边角盖了半枚红章】

兹聘　外证壹名
辛巳年九月十九（公历二〇〇一年十一月三日）
戌时到南方大酒店一楼宴会厅
核册在场　毋误

　　　　　　　　　　蚀湾镇核册处

【凭条背面，是絮絮的字】
阿澄：
你一定要来。外证只能是你。
镇上的规矩多，你什么都不用懂，
理册婆让你做什么，你就做什么。
只有一条是我求你的——
验户念名的时候，不管念到什么，
不要应。`,
  },
  {
    id: 'note9', title: '② 蚀湾镇夜间告示（镇前街·告示墙）',
    body: `【蚀湾镇夜间告示　二〇〇一年十一月】

一、广播报时期间，行人止步，
　　背海而立，勿面向海。
　　广播念完再走。

二、家中电视若映出本人影像，
　　当即断电，或离开该房间。
　　（供电所岁修期间映像不准，
　　一切以画面为先。）

三、核册之夜，全镇同往，不留人看家。
　　各家灯留一盏，人走灯不灭。

　　　　　　蚀湾镇人民政府（代章）

【告示右下角，另有一行手写小字，很急】
第二条说轻了。断电要快——
你那格录像播完之前，
必须让画面跟现实对不上。
它才会作废重播。`,
  },
  {
    id: 'note3', title: '③ 核册告示（镇公告栏）',
    body: `【告　示】

蚀湾核册，全镇同往。
今晚还地饭设南方大酒店一楼宴会厅，
按户入席，桌牌为准。缺席者除名。

议程如下：
　酉时　起雾
　戌时　收港
　戌时三刻　归屋
　亥时　验户
　亥时三刻　熄灯
　子时　还地

【页脚一行小字，墨色比正文旧得多】
议程即潮汛。时辰一到，报数员口中念的
就不再是人写给人的话。逐条应完，海才销账。`,
  },
  {
    id: 'note4', title: '④ 广播站值班记录（誊抄）',
    body: `【蚀湾广播站　值班登记　十一月三日】

18:40　转播酒店核册实况，线路正常。
19:05　点名谣《数户调》，磁带 A 面。
19:32　……磁带走完了。歌没停。

【以下为当值员手写】
我把放音机的电源拔了。歌没停。
歌从线里来。不是我们的线——
是埋在填湾地基底下的那些"旧线"。

报数员每念一条议程，全镇的喇叭一起响。
我对了表：他开口，比我这边的信号
早半秒钟。

广播是跟着他念的。不是他跟着广播。`,
  },
  {
    id: 'note10', title: '⑤ 员工须知（酒店服务走廊）',
    body: `【南方大酒店　宴会部　员工须知】

一、托盘不离手。上菜满盘，收盘空盘。
二、空盘回廊时，目不视客；
　　客亦当收手侧立，勿使空盘见掌。
三、见掌者，按引座例办理。

【下面是另一种笔迹，写给新来的】
说人话：他们端空盘回来的时候，
别让他们看见你的手。
手背过去，或者蹲下来把手收在膝上。

盘子空着，就得有东西往上放。
别让那是你的。`,
  },
  {
    id: 'note5', title: '⑥ 酒店登记簿（总台）',
    body: `【南方大酒店　客房登记　十一月三日】

103　周宅亲眷　　已到
105　周宅亲眷　　已到
107　县里来宾　　未到（钥匙未取）
109　渔业社　　　已到
104　——　　　　（本页被水渍洇开）
106　——　　　　（本页被水渍洇开）

807　照影房　　　【备注栏字迹工整】
　　三楼尽头挂八楼的门牌，是老师傅的意思：
　　"名要记在高过水面的地方。这个数是量过的。"

【登记簿最后一栏，笔迹与所有人都不同】
上宾　壹位　　席设宴会厅正中
　　到时自来　毋须引路`,
  },
  {
    id: 'note6', title: '⑦ 保卫科值班日志',
    body: `十月廿八　夜班　老鲁记

监控是新装的，九个头。夜里看屏幕，
七号头（宴会厅）拍到有人摆桌。
我下去看——厅里是空的，桌子没摆。
第二天一早，桌子摆好了。跟屏幕里一模一样。

十月三十　夜班

想明白了。这九个屏幕放的不是"现在"，
是"接下来"。电视先播，现实照着做。

试出来一个法子，记在这里，给接班的：
屏幕里播了什么，你抢在前头把它改了——
比如它播"灯亮着"，你去把总闸拉了——
那一段录像就作废，重播。
老师傅管这叫"破像"。一晚上只敢用一回。

十一月三日　加一句
海洋馆的钥匙我挂在柜里了。
今晚谁也别去西边。展缸里那个东西，
这几天不怎么沉底了。`,
  },
  {
    id: 'note7', title: '⑧ 海洋馆巡检单（末次）',
    body: `【蚀湾海洋馆　闭馆巡检单　2001.9.30】

一、主展厅："镇馆之物"在。
　　吊索三根，紧。姿势与昨日不同。
　　标本牌仍写"未定种"——
　　馆长说等县里给个说法。等了三年。
二、主展缸水位：未测（水位计读数为负）
三、增氧机：停（含氧量恒定，来源不明）
四、照明：只留检视灯。
五、理骨：进度照旧。理骨员说
　　骨头"越理越多"。已报馆长。

六、其他：
　　核册彩排母带（试机拍摄）
　　存处理间铁柜。周家的人说过两天来取，
　　叮嘱：不要在馆里放这盘带子。
　　它拍到了不该拍的东西——
　　摄像师没说是什么。摄像师第二天就退了押金走了。

【单末盖章处没有章，只有一圈盐霜】`,
  },
  {
    id: 'note8', title: '⑨ 还地旧俗（从母带里抄下的话）',
    body: `【母带 00:41:17 起，是一段老人的画外音。
录像里，彩排的持册人坐在三面镜前。】

"还地不是还土，是销账。
海要的从来不是在册的人——
在册的是正主，动了正主，账就烂了。

海收的是册末那行空名。
验户那晚，镜子里坐着两个人：
一个是持册的，一个是陪坐的。

海若认了这本册，两个都留下。
海若不认——
它就把镜子里那个陪坐的收走。
名字都想好了，就写在空席的桌牌上。

所以外证要挑外乡人。
外乡人走了，镇上不用挂白。"

【00:43:02，画外音停了。
录像里，镜中的理册婆转过头来，看镜头。
现实里的理册婆，晚了一拍才转。】`,
  },
  {
    id: 'note2', title: '⑩ 渔民日记（渔寮·残页）',
    body: `九月十二　阴

湾填了三年，酒店起了三年。
石头是从湾底捞的。老石匠说那不是石头，
是"床板"——海睡了一万年的床。

九月十四　阴

给酒店送鱼，走的后头服务道。
新来的侍应帮我卸筐。他不说话，光笑。
他的手腕搭在筐沿上，我看了一眼——
那不是晒黑。那是浪蚀的木头纹。

我这辈子在海上，什么怪浪都见过。
可我头一回见着：潮来了，水没有来。
滩涂是干的，蟹洞是干的，
但你把耳朵贴在泥上，底下是涨潮的声音。

核册我不去了。名字托人代画了押。`,
  },
];

// 石碑铭文（气氛互动，不计入文书）
const STELE_TEXT = '碑文风化难辨，只余八字——「地借于潮　名还于海」';

function angleWrap(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// ---------------- 主控 ----------------
export class Story {
  constructor(game) {
    this.g = game; // {scene,engine,world,player,hud,audio,enemies,byId,sightjack,stealth,ocean,sky,M,crt,agenda,guest,gaze,floaters}
    this.flags = {
      intro: false, stealthTip: false, sightjackTip: false,
      knowLatch: false, townGateOpen: false, gateOpen: false,
      radioOn: true, knowHotel: false,
      phoneRinging: false, phoneAnswered: false,
      inHotel: false, metBride: false, hasMirror: false,
      crtTip: false, leaked: false,
      namedByCrt: false, imageBroken: false,
      hasAquaKey: false, hasTape: false, tapeSeen: false,
      matronChase: false, finaleBroken: false,
      ended: false, breakerCut: false,
      ruleSeaViolated: 0, ruleNameExpired: 0, ruleTraySeen: 0,
    };
    this.notesFound = new Set();
    this.checkpoint = null;
    this.deathSeq = null;
    this.endSeq = null;
    this.introSeq = null;
    this.caughtSeq = null;
    this.tapeSeq = null;
    this.deathCount = 0;
    this.drownTimer = 0;
    this.time = 0;
    this.phoneT = -1;      // 前台电话调虎离山计时
    // —— 规则怪谈状态 ——
    this.broadcastT = 0;   // 规则一：广播在响的窗口（秒）
    this.seaGazeT = 0;     // 广播期间面朝海的累计秒数
    this.nextTownCast = -1;// 下一次镇广播报时
    this.nameCountdown = 0;// 规则二：CRT 点名倒计时
    this.boothSpyT = 0;    // 岗亭员视奸教学累计
    this.busGo = false;    // 末班车离站
    this.streetPhoneT = -1;// 街头电话亭响铃计时

    this.interactables = [];
    this.triggers = [];
    this.noteMeshes = new Map();

    this.buildNotes();
    this.buildCast();
    this.buildForetellProps();
    this.buildInteractables();
    this.buildTriggers();

    // 议程联动
    this.g.agenda.onStage = (stage) => this.applyStage(stage);

    // —— 环境氛围调度 ——
    this.ambient = {
      next: 40, idx: 0,
      pool: ['horn', 'gull', 'creak', 'buoy'],
      beats: [
        { at: 55, act: () => { this.g.audio.hornDistant(); this.g.hud.subtitle('站牌背后就是海。今晚不会再有车进蚀湾。', 5); } },
        { at: 170, cond: () => !this.flags.townGateOpen, act: () => this.g.hud.subtitle('镇里在放点名谣。调子从栅门里飘出来，潮声一顿一顿地和。', 5, 'song') },
        { at: 320, cond: () => this.flags.townGateOpen && !this.flags.inHotel, act: () => this.g.hud.subtitle('家家门框上钉着户牌，名字用红漆新描过。街上一个人也没有。', 5.5) },
        { at: 520, cond: () => this.flags.inHotel && !this.flags.leaked, act: () => this.g.hud.subtitle('酒店里很暖。暖得像是楼在替什么东西焐着。', 5) },
        { at: 700, cond: () => this.flags.leaked, act: () => this.g.hud.subtitle('墙纸在鼓包。楼是干的，可它在承受水压。', 5, 'song') },
      ],
    };

    // 海的视角（终局强制视奸载体）
    const lp = this.g.world.locations.lighthouseDoor;
    this.seaViewer = {
      id: 'sea', label: '海', kind: 'sea', enabled: true, pos: new THREE.Vector3(118, 2, -168),
      viewPos: (out) => (out ?? new THREE.Vector3()).set(118, 6, -168),
      viewYawPitch: () => {
        const yaw = Math.atan2(lp.x - 118, lp.z - (-168)) + Math.PI;
        return { yaw, pitch: 0.1 };
      },
      update: () => {},
      setEnabled: () => {},
    };

    this.saveCheckpoint('spawn');
  }

  // ---------- 人群与角色 ----------
  /** 把多个摆好姿势的人形烘焙成一组按材质合并的网格（全场人群 ≈ 15 draw call） */
  bakeCrowd(defs) {
    const byMat = new Map();
    for (const d of defs) {
      const h = new Humanoid(this.g.M, { role: d.role, seed: d.seed, light: false });
      poseAs(d.pose ?? 'sit', d.phase ?? Math.random() * 6)(h);
      h.group.position.set(d.x, d.y, d.z);
      h.group.rotation.y = d.ry ?? 0;
      h.group.updateMatrixWorld(true);
      h.group.traverse((o) => {
        if (!o.isMesh) return;
        let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        geo = geo.clone();
        geo.applyMatrix4(o.matrixWorld);
        if (!geo.attributes.uv) {
          geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
        }
        if (!byMat.has(o.material)) byMat.set(o.material, []);
        byMat.get(o.material).push(geo);
      });
    }
    const grp = new THREE.Group();
    for (const [mat, geos] of byMat) {
      const mg = BufferGeometryUtils.mergeGeometries(geos, false);
      if (!mg) continue;
      const mesh = new THREE.Mesh(mg, mat);
      mesh.castShadow = true;
      grp.add(mesh);
    }
    return grp;
  }

  buildCast() {
    const L = this.g.world.locations;
    const D = this.g.world.dynamic;
    const HI = D.hotelInfo;
    const hb = HI.origin.y;

    // —— 宴会厅满员（正常态·验户前）：每桌 5 客围坐 ——
    // 凳子在 hotel.js 摆在 a=(k/8)·2π、r=1.05 的 cos/sin 圆上——人要坐到凳子上
    const roles = ['guest_m', 'guest_f', 'guest_m2', 'guest_m', 'guest_f'];
    const defs = [];
    let seed = 40001;
    for (const t of D.banquetTables) {
      for (let k = 0; k < 5; k++) {
        const a = ((k * 2 + (seed % 2)) / 8) * Math.PI * 2; // 隔凳而坐，桌桌错位
        const sx = t.x + Math.cos(a) * 1.03;
        const sz = t.z + Math.sin(a) * 1.03;
        defs.push({
          role: roles[k % roles.length], seed: seed++, pose: 'sit', phase: k * 1.3,
          x: sx, y: hb + 0.02, z: sz,
          ry: Math.atan2(t.x - sx, t.z - sz), // 面朝桌心
        });
      }
    }
    // 大堂里三两站着寒暄的
    for (const [lx, lz, ry] of [[-2.2, 7.6, 0.6], [-1.4, 7.2, -2.4], [2.6, 3.5, 1.8], [3.3, 3.9, -1.2]]) {
      defs.push({ role: seed % 2 ? 'guest_m' : 'guest_m2', seed: seed++, pose: 'idle', x: HI.origin.x + lx, y: hb + 0.02, z: HI.origin.z + lz, ry });
    }
    this.crowdNormal = this.bakeCrowd(defs);
    this.g.scene.add(this.crowdNormal);

    // —— 渗漏态人群（验户后）：席位不空，人却"浮"了——脚尖离地的静止宾客 ——
    const leakDefs = [];
    for (const t of D.banquetTables) {
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + 1.1;
        leakDefs.push({
          role: roles[(k + 1) % roles.length], seed: seed++, pose: 'float', phase: k * 2.1,
          x: t.x + Math.sin(a) * 1.15, y: hb + 0.02, z: t.z + Math.cos(a) * 1.15,
          ry: a + Math.PI,
        });
      }
    }
    this.crowdLeak = this.bakeCrowd(leakDefs);
    this.crowdLeak.visible = false;
    this.g.scene.add(this.crowdLeak);

    // —— 周絮（持册人家的女儿）：807 照影房三面镜前坐着 ——
    this.bride = new Humanoid(this.g.M, { role: 'bride', seed: 8807 });
    this.bride.group.position.set(L.dresser807.x, HI.origin.y + HI.F3 + 0.02, L.dresser807.z + 0.75);
    this.bride.group.rotation.y = Math.PI; // 面向三面镜（朝南）
    this.g.scene.add(this.bride.group);
  }

  // ---------- CRT 预现内容 ----------
  buildForetellProps() {
    const g = this.g;
    const L = g.world.locations;
    const M = g.M;
    const D = g.world.dynamic;
    const HI = D.hotelInfo;
    const hb = HI.origin.y;

    // 预现①（渗漏态预告）：服务走廊口立着一名侍应，正对镜头；沉积更厚
    this.ftWaiter = this.bakeCrowd([{
      role: 'waiter', seed: 7101, pose: 'post',
      x: HI.origin.x - 4.3, y: hb + 0.02, z: HI.origin.z - 8.6, ry: Math.PI / 2,
    }]);
    const sed1 = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.2, 0.16), M.sediment);
    sed1.position.set(HI.origin.x + 1.5, hb + 1.1, HI.origin.z - 10.7);
    const sed2 = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.4, 0.13), M.sediment);
    sed2.position.set(HI.origin.x - 5.5, hb + 0.7, HI.origin.z - 10.72);
    this.ftSediment = new THREE.Group();
    this.ftSediment.add(sed1, sed2);

    // 预现②（点名）：上宾空席上坐着一个人——衣服和你一样
    this.ftSeated = this.bakeCrowd([{
      role: 'bride', seed: 9001, pose: 'sit',
      x: L.guestSeat.x, y: hb + 0.02, z: L.guestSeat.z - 0.6, ry: 0,
    }]);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3),
      new THREE.MeshBasicMaterial({ color: 0xd8b060 }));
    plate.position.set(L.guestSeat.x, hb + 1.05, L.guestSeat.z + 0.42);
    plate.rotation.x = -0.4;
    this.ftSeated.add(plate);

    // 初始预现：渗漏态预告（对照现实找差异）
    g.crt.setForetell([this.ftWaiter, this.ftSediment], [this.crowdNormal]);
  }

  // ---------- 文书可视化 ----------
  buildNotes() {
    const L = this.g.world.locations;
    const spots = {
      note1: L.luggage, note2: L.note2,
      note5: L.registry, note6: L.securityDesk, note7: L.tapeCabinet,
    };
    for (const [id, pos] of Object.entries(spots)) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.42), this.g.M.paperGlow);
      m.position.copy(pos);
      m.position.y += 0.03;
      m.rotation.x = -Math.PI / 2 + 0.25;
      m.rotation.z = Math.random() * 3;
      this.g.scene.add(m);
      this.noteMeshes.set(id, m);
    }
    // note3 公告栏 / note4 收音机 / note8 母带播放 / note9 告示墙 / note10 员工须知，无纸张网格
  }

  notePickupAction(id, after) {
    return () => {
      const note = NOTES.find((n) => n.id === id);
      this.notesFound.add(id);
      this.noteMeshes.get(id)?.removeFromParent();
      this.g.audio.paper();
      this.g.openNote(note);
      after?.();
    };
  }

  // ---------- 互动点 ----------
  buildInteractables() {
    const g = this.g;
    const L = g.world.locations;
    const F = this.flags;
    const add = (o) => this.interactables.push(o);

    // —— 文书 ——
    add({
      id: 'note1', pos: L.luggage, r: 2.0, prompt: '取回行李箱',
      cond: () => !this.notesFound.has('note1'),
      act: this.notePickupAction('note1', () => {
        g.hud.objective('过牌坊下的栅门进镇——核册在南方大酒店');
      }),
    });
    add({
      id: 'note2', pos: L.note2, r: 2.0, prompt: '翻看日记',
      cond: () => !this.notesFound.has('note2'),
      act: this.notePickupAction('note2'),
    });
    add({
      id: 'note10', pos: L.staffNotice, r: 2.2, prompt: '读员工须知',
      cond: () => !this.notesFound.has('note10'),
      act: this.notePickupAction('note10'),
    });
    add({
      id: 'note3', pos: L.noticeBoard, r: 2.2, prompt: '看公告栏',
      cond: () => !this.notesFound.has('note3'),
      act: this.notePickupAction('note3', () => {
        F.knowHotel = true;
        g.hud.objective('去镇南的南方大酒店——核册在一楼宴会厅');
      }),
    });
    add({
      id: 'note5', pos: L.registry, r: 2.0, prompt: '翻登记簿',
      cond: () => F.inHotel && !this.notesFound.has('note5'),
      act: this.notePickupAction('note5'),
    });
    add({
      id: 'note6', pos: L.securityDesk, r: 2.2, prompt: '读值班日志',
      cond: () => !this.notesFound.has('note6'),
      act: this.notePickupAction('note6'),
    });
    add({
      id: 'note7', pos: L.tapeCabinet, r: 2.0, prompt: F.hasAquaKey ? '开铁柜' : '开铁柜',
      cond: () => !this.notesFound.has('note7'),
      act: () => {
        if (!F.hasAquaKey) {
          g.hud.subtitle('铁柜锁着。柜面上一圈盐霜，像有人反复摸过。', 4);
          if (!F.aquaKeyTip) {
            F.aquaKeyTip = true;
            g.hud.subtitle('保卫科的日志提过钥匙——挂在二楼的柜子里。', 4.5);
          }
          return;
        }
        this.notePickupAction('note7', () => this.takeTape())();
      },
    });

    // —— 石碑 ——
    add({
      id: 'stele', pos: L.stele, r: 2.2, prompt: '辨认碑文',
      cond: () => true,
      act: () => { g.hud.subtitle(STELE_TEXT, 5); g.audio.paper(); },
    });

    // —— 镇口栅门（视奸教学：岗亭员整夜盯着闩杆） ——
    add({
      id: 'townGate', pos: L.townGate, r: 3.2, prompt: '过栅门',
      cond: () => !F.townGateOpen,
      act: () => {
        g.hud.subtitle('栅门落了闩。闩在里侧——从这边够不着。', 4);
        if (!F.sightjackTip) {
          F.sightjackTip = true;
          g.hud.subtitle('岗亭里有个人。灯亮着，他一动不动。', 4.5);
          g.hud.subtitle('静下来，按 Q ——借他的眼睛看看他在看什么。', 5.5);
          g.hud.objective('视奸岗亭员，找到过栅门的办法');
        } else if (F.knowLatch) {
          g.hud.subtitle('闩杆挨着岗亭的小窗。绕到岗亭跟前去。', 4);
        }
      },
    });

    // 岗亭小窗（视奸获知后可拨闩）
    add({
      id: 'boothWindow', pos: L.boothWindow, r: 2.2, prompt: '从小窗探手拨闩',
      cond: () => F.knowLatch && !F.townGateOpen,
      act: () => {
        F.townGateOpen = true;
        g.audio.doorCreak();
        g.stealth.emitNoise(L.townGate.x, L.townGate.z, 14);
        g.hud.subtitle('闩杆很凉，像刚从水里捞出来。栅门吱呀着荡开了。', 4.5);
        g.hud.subtitle('岗亭里的人没有转头。他看的还是那根已经不在了的闩。', 5, 'song');
        g.hud.objective('沿镇前街往里走——先看告示墙');
        this.saveCheckpoint('town', L.townGate.x - 3, L.townGate.z);
        if (g.agenda.stage < 0) g.agenda.advance(); // 起雾
      },
    });

    // —— 告示墙（文书②：夜间三则——规则怪谈的教学） ——
    add({
      id: 'ruleBoard', pos: L.ruleBoard, r: 2.4, prompt: '看告示',
      cond: () => !this.notesFound.has('note9'),
      act: this.notePickupAction('note9', () => {
        g.hud.subtitle('三条告示。第一条和第二条的纸比第三条新得多。', 4.5);
        g.hud.objective('去街心公告栏——打听核册的地方');
        this.saveCheckpoint('rules');
      }),
    });

    // —— 街头电话亭（路过时它响一次） ——
    add({
      id: 'streetPhone', pos: L.phoneBooth, r: 2.0, prompt: '接电话',
      cond: () => F.phoneRinging && !F.phoneAnswered,
      act: () => {
        F.phoneRinging = false;
        F.phoneAnswered = true;
        g.audio.blip(320, 0.25, 0.2);
        g.hud.subtitle('「……到了？」是个女声，隔着水响。', 4.5, 'radio');
        g.hud.subtitle('「到了就往回走。还地饭不缺你一双筷子。」', 5, 'radio');
        g.hud.subtitle('电话挂了。投币口退出来一枚湿的硬币。', 4.5);
        this.saveCheckpoint('phone');
      },
    });

    // —— 堤门（通滩涂的支线——闩在镇这侧） ——
    add({
      id: 'gate', pos: L.gate, r: 3.4, prompt: '拨闩推门',
      cond: () => !F.gateOpen,
      act: () => {
        F.gateOpen = true;
        g.audio.doorCreak();
        g.stealth.emitNoise(L.gate.x, L.gate.z, 18);
        g.hud.subtitle('门闩是从镇里落的。锈闩拨开，堤外滩涂的腥气涌进来。', 4.5);
        g.hud.subtitle('堤上有个提灯的人来回走。渔寮的灯也还亮着。', 4.5);
      },
    });

    // —— 主展厅标本牌 ——
    add({
      id: 'specimen', pos: L.specimenPlate, r: 2.2, prompt: '看标本牌',
      cond: () => true,
      act: () => {
        g.audio.paper();
        g.hud.subtitle('「未定种。一九九八年填湾工地出土。」', 4.5);
        g.hud.subtitle('牌子背面有一行粉笔字，擦过又写上：别念它的旧名。', 5, 'song');
      },
    });

    // —— 广播站收音机 ——
    add({
      id: 'radio', pos: L.radio, r: 2.2, prompt: '调收音机',
      cond: () => !this.notesFound.has('note4'),
      act: () => {
        this.notesFound.add('note4');
        g.audio.paper();
        g.hud.subtitle('喇叭里在转播酒店的核册实况。桌上压着当值员的记录。', 4.5, 'radio');
        g.openNote(NOTES.find((n) => n.id === 'note4'));
        if (!F.knowHotel) {
          F.knowHotel = true;
          g.hud.objective('去镇南的南方大酒店——核册在一楼宴会厅');
        }
        this.saveCheckpoint('radio');
      },
    });

    // —— 807：照影房陪周絮（持镜教学） ——
    add({
      id: 'bride807', pos: L.dresser807, r: 2.6, prompt: '在梳妆台边坐下',
      cond: () => F.inHotel && !F.metBride,
      act: () => this.brideScene(),
    });

    // —— 服务走廊 CRT（预现教学） ——
    add({
      id: 'crtCorridor', pos: L.crtCorridor, r: 2.2, prompt: '凑近看屏幕',
      cond: () => !F.crtTip && F.metBride,
      act: () => {
        F.crtTip = true;
        g.audio.tvBlip();
        g.hud.subtitle('屏幕里是这条走廊。但不是现在的这条——', 4.5);
        g.hud.subtitle('墙上的沉积更厚。走廊口立着一名侍应，面朝镜头。', 5);
        g.hud.subtitle('电视先播，现实照做。记住屏幕里的样子。', 5);
        g.hud.objective('去宴会厅——验户快开始了');
        this.saveCheckpoint('crtTip');
      },
    });

    // —— 保卫科钥匙柜 ——
    add({
      id: 'keyCabinet', pos: L.keyCabinet, r: 1.8, prompt: '开钥匙柜',
      cond: () => F.leaked && !F.hasAquaKey,
      act: () => {
        F.hasAquaKey = true;
        g.audio.blip(700, 0.08, 0.15);
        g.hud.subtitle('海洋馆值班室的钥匙。牌子上写着「西馆·铁柜」。', 4.5);
        this.nameByCrt();
      },
    });

    // —— 配电间总闸（破像） ——
    add({
      id: 'mainBreaker', pos: L.mainBreaker, r: 1.9, prompt: '拉下总闸（破像）',
      cond: () => F.namedByCrt && !F.imageBroken,
      act: () => this.breakImage(),
    });

    // —— 807 电视（播母带） ——
    add({
      id: 'tv807', pos: L.tv807, r: 2.2, prompt: '把母带塞进录像机',
      cond: () => F.hasTape && !F.tapeSeen,
      act: () => this.playTape(),
    });

    // —— 宴会厅「還」字金匾（终局大破像） ——
    add({
      id: 'xiPanel', pos: new THREE.Vector3(L.stageMic.x, L.stageMic.y, L.stageMic.z - 1.6), r: 3.0,
      prompt: '扯下「還」字金匾（大破像）',
      cond: () => F.tapeSeen && !F.finaleBroken,
      act: () => this.beginFinale(),
    });

    // —— 前台电话（可选：调虎离山） ——
    add({
      id: 'frontPhone', pos: L.frontPhone, r: 1.8, prompt: '拨内线电话',
      cond: () => F.leaked && this.phoneT < 0,
      act: () => {
        this.phoneT = 1.2;
        g.hud.subtitle('你拨了厨房的内线，把听筒搁在台上。', 4);
      },
    });

    // —— 反击工具（有限资源；都不是武器，只买时间） ——
    add({
      id: 'toolCamera', pos: L.photoCamera, r: 2.0, prompt: '取下三脚架上的海鸥牌相机',
      cond: () => !F.tookCamera,
      act: () => {
        F.tookCamera = true;
        g.tools.pickupCamera(2);
        g.audio.blip(700, 0.08, 0.15);
        g.hud.subtitle('皮腔相机沉得压手。皮套里还塞着两颗镁光泡。', 4.5);
        g.hud.subtitle('看见光的东西会愣住。愣多久——看它是什么。', 5, 'song');
        g.hud.objective('按 F 打闪：定住看见光的人');
      },
    });
    add({
      id: 'toolBulbs1', pos: L.darkroom, r: 1.8, prompt: '翻检显影台',
      cond: () => !F.tookDarkBulbs,
      act: () => {
        F.tookDarkBulbs = true;
        g.tools.addBulbs(2);
        g.audio.paper();
        g.hud.subtitle('显影盘底下压着两颗镁光泡，用报纸包着。', 4);
        g.hud.subtitle('报纸是一九九八年的。头版整版是填湾竣工。', 4.5);
      },
    });
    add({
      id: 'toolBulbs2', pos: L.dormBattery, r: 1.8, prompt: '拉开五斗橱',
      cond: () => !F.tookDormBulbs,
      act: () => {
        F.tookDormBulbs = true;
        g.tools.addBulbs(2);
        g.audio.paper();
        g.hud.subtitle('大新照相馆的纸袋。两颗镁光泡，还有一张全家福的取件单。', 4.5);
        g.hud.subtitle('取件日期空着。', 3.5, 'song');
      },
    });
    add({
      id: 'toolClock1', pos: L.dormClock, r: 1.8, prompt: '拿走发条闹钟',
      cond: () => !F.tookClock1,
      act: () => {
        F.tookClock1 = true;
        g.tools.addClocks(1);
        g.audio.blip(1400, 0.05, 0.05);
        g.hud.subtitle('发条闹钟。铃帽擦得很亮，像每天都有人上弦。', 4.5);
        g.hud.objective('按 G 放闹钟：它替你在别处响');
      },
    });
    add({
      id: 'toolClock2', pos: L.securityClock, r: 1.8, prompt: '拿走值班闹钟',
      cond: () => !F.tookClock2,
      act: () => {
        F.tookClock2 = true;
        g.tools.addClocks(1);
        g.audio.blip(1400, 0.05, 0.05);
        g.hud.subtitle('行军床头的闹钟。指针停在十一点四十七分。', 4.5);
      },
    });
    add({
      id: 'toolLime', pos: L.limeBag, r: 1.9, prompt: '拎起贝灰袋',
      cond: () => !F.tookLime,
      act: () => {
        F.tookLime = true;
        g.tools.addLime(3);
        g.audio.paper();
        g.hud.subtitle('理骨用的贝灰。烧过的壳，磨得极细，呛喉咙。', 4.5);
        g.hud.subtitle('袋口用红绳扎着三道。够倒三条界。', 4, 'song');
        g.hud.objective('按 V 倒灰线：守规矩的东西不肯踩过去');
      },
    });

    // —— 轮11 箱庭①：手提录音机 + 对照磁带（在录下它的地方放，听出对不上的那一处） ——
    add({
      id: 'toolRecorder', pos: L.recorder, r: 2.0, prompt: '拿走牌桌上的录音机',
      cond: () => !F.tookRecorder,
      act: () => {
        F.tookRecorder = true;
        g.tools.pickupRecorder();
        g.tools.addTape({
          id: 't1', label: '核册 · 西翼', spot: L.banquetCenter, r: 7,
          lines: ['「……东三桌，九位。九副碗，九盅茶。」', '带子里的人顿了顿，又数了一遍：「九位。」'],
          compare: ['你数了数眼前的席——每一桌都只摆八副碗。', '多出来的那一副，收在上宾席的桌布底下。'],
          hint: '标签写着「核册·西翼」。得对着宴会厅放。',
        });
        g.audio.blip(700, 0.08, 0.15);
        g.hud.subtitle('铁皮壳的手提录音机。按键停在半局，磁带没退出来。', 4.5);
        g.hud.subtitle('牌桌上四副牌都码得整整齐齐——没有人输，也没有人赢。', 4.5, 'song');
        g.hud.objective('按 R 回放磁带：在录下它的地方放，能听出对不上的');
      },
    });
    add({
      id: 'tape2', pos: L.videoHall, r: 2.2, prompt: '从还带箱里抽出一盘磁带',
      cond: () => !F.tookTape2,
      act: () => {
        F.tookTape2 = true;
        g.tools.addTape({
          id: 't2', label: '点名 · 家属楼', spot: L.dorm, r: 9,
          lines: ['「二〇一，到。二〇三，到。一〇四——」', '带子空转了几秒。「一〇四，到。」是另一个嗓子替答的。'],
          compare: ['楼道的门牌少了一块——104 的名字是后来补写的。', '替答的那个嗓子，是从 201 的方向录进来的。'],
          hint: '标签写着「点名·家属楼」。得对着筒子楼中庭放。',
        });
        g.audio.paper();
        g.hud.subtitle('还带箱里只有这一盘。标签不是店里的字。', 4);
        if (!F.tookRecorder) g.hud.subtitle('得有台能放的机子。', 3, 'song');
      },
    });
    add({
      id: 'tape3', pos: L.aquaOffice, r: 2.0, prompt: '打开值班桌抽屉',
      cond: () => !F.tookTape3,
      act: () => {
        F.tookTape3 = true;
        g.tools.addTape({
          id: 't3', label: '广播底带', spot: L.ruleBoard, r: 6,
          lines: ['「……第三条：桥不在名册上，请勿在桥上停留。」', '广播念完，底噪里有人小声说：不对。重录。'],
          compare: ['墙上的第三条告示写的不是这句。', '那张纸比另外两张新——是后来换过的。揭开看看。'],
          hint: '标签写着「广播底带」。得对着镇口的告示墙放。',
        });
        g.audio.paper();
        g.hud.subtitle('抽屉里一盘缠了防潮纸的磁带，和半盒受潮的曲别针。', 4.5);
      },
    });
    // 对照成功 → 奖励点亮起
    g.tools.onTapeMatch = (id) => {
      if (id === 't1') F.tapeCmp1 = true;
      if (id === 't2') F.tapeCmp2 = true;
      if (id === 't3') F.tapeCmp3 = true;
      this.saveCheckpoint?.('tape_' + id);
    };
    add({
      id: 'tapeR1', pos: L.guestSeat, r: 2.2, prompt: '掀开上宾席的桌布',
      cond: () => F.tapeCmp1 && !F.tapeRw1,
      act: () => {
        F.tapeRw1 = true;
        g.tools.addBulbs(2);
        g.audio.paper();
        g.hud.subtitle('桌布底下压着第九副碗——碗里码着两颗镁光泡。', 4.5);
        g.hud.subtitle('有人早就数出来了。他把答案留给下一个数的人。', 4.5, 'song');
      },
    });
    add({
      id: 'tapeR2', pos: L.dormBook2, r: 2.0, prompt: '摸 201 床板的夹缝',
      cond: () => F.tapeCmp2 && !F.tapeRw2,
      act: () => {
        F.tapeRw2 = true;
        g.tools.addClocks(1);
        g.tools.addLime(1);
        g.audio.blip(1400, 0.05, 0.05);
        g.hud.subtitle('床板夹缝里塞着一只上好弦的闹钟，和一小包贝灰。', 4.5);
        g.hud.subtitle('替 104 答到的人睡在这儿。他替人答到，也替人备好了跑的东西。', 5, 'song');
      },
    });
    add({
      id: 'tapeR3', pos: L.ruleBoard, r: 2.4, prompt: '揭开第三张告示',
      cond: () => F.tapeCmp3 && this.notesFound.has('note9') && !F.tapeRw3,
      act: () => {
        F.tapeRw3 = true;
        g.tools.addLime(1);
        g.tools.addBulbs(1);
        g.audio.paper();
        g.hud.subtitle('第三张告示背面用炭笔写着原文：「第三条：桥上点过的名不算。」', 5);
        g.hud.subtitle('纸和墙之间贴着一小包贝灰、一颗镁光泡——换告示的人留下的。', 4.5, 'song');
      },
    });

    // —— 轮11 箱庭②：配电间保险丝板（黑暗是能搬运的行装） ——
    add({
      id: 'fusePanel', pos: L.fusePanel, r: 1.9, prompt: '看保险丝板',
      cond: () => true,
      act: () => {
        g.power.openPanel(L.fusePanel);
        if (!F.fuseTipDone) {
          F.fuseTipDone = true;
          g.hud.subtitle('三只瓷座，三路灯：拔哪路，哪路的堂口就归黑暗管。', 4.5);
          g.hud.subtitle('黑处的你不容易被看见。黑处的它们也一样。', 4.5, 'song');
        }
      },
    });
    add({
      id: 'toolFuse', pos: L.kitchen, r: 2.0, prompt: '翻检传菜台下的纸箱',
      cond: () => !F.tookFuse,
      act: () => {
        F.tookFuse = true;
        g.power.addSpare(1);
        g.audio.blip(900, 0.06, 0.06);
        g.hud.subtitle('纸箱里是备品：一枚瓷底保险丝，芯是新的。', 4);
        g.hud.subtitle('揣上它——就多一路灯归你管。', 3.5, 'song');
      },
    });
  }

  // ---------- 触发区 ----------
  buildTriggers() {
    const g = this.g;
    const Z = g.world.zones;
    const add = (o) => this.triggers.push(o);

    add({
      zone: Z.frontStreet, once: true, cond: () => this.flags.townGateOpen,
      act: () => {
        g.hud.subtitle('镇前街。卷帘门都落了一半，杂货铺的灯还亮着。', 5);
        g.hud.subtitle('录像厅在放通宵场——里头只有雪花的声音。', 5);
        this.saveCheckpoint('frontstreet');
      },
    });
    add({
      zone: Z.villageCenter, once: true, cond: () => this.flags.townGateOpen,
      act: () => {
        g.hud.subtitle('每扇门都上了锁，锁眼里塞着红纸。灶是温的，碗筷齐整——人全在酒店。', 5.5);
        if (!this.flags.stealthTip) {
          this.flags.stealthTip = true;
          g.hud.subtitle('街心有挑担的伙计来回走。按住 Shift 放低身子，别撞进灯里。', 5.5);
        }
      },
    });
    add({
      zone: Z.dormArea, once: true,
      act: () => {
        g.hud.subtitle('水产公司家属楼。只有一扇窗亮着——灯后头没有人影。', 5.5);
        g.hud.subtitle('晾了一天的衣裳，夜里也没人收。', 4.5);
      },
    });
    add({
      zone: Z.aquaMain, once: true,
      act: () => {
        g.hud.subtitle('主展厅。房间尺度的肋骨罩着半个展台，吊索绷得很紧。', 5.5);
        g.hud.subtitle('眼眶是空的，是干的。标本牌上只写了三个字。', 5, 'song');
        this.saveCheckpoint('aquaMain');
      },
    });
    add({
      zone: Z.dikeArea, once: true, cond: () => this.flags.gateOpen,
      act: () => {
        g.hud.subtitle('石堤。提灯的人来回走——守堤是他的职，核册也没去。', 5);
        g.hud.subtitle('渔寮里有本没写完的日记。别惊动干活的人。', 5);
        this.saveCheckpoint('dike');
      },
    });
    add({
      zone: Z.beach, once: true,
      act: () => {
        g.hud.subtitle('滩涂。渡船在滩上搁了三年，龙骨陷进泥里。', 5);
        g.hud.subtitle('蟹洞是干的。可你把耳朵贴在泥上——底下是涨潮的声音。', 5.5, 'song');
      },
    });
    add({
      zone: Z.saltField, once: true,
      act: () => g.hud.subtitle('盐田干着。盐霜自己排成鳞片的纹路，一夜一换。', 5),
    });
    add({
      zone: Z.temple, once: true,
      act: () => {
        g.hud.subtitle('旧海祀。填湾之前，向潮借地的规矩从这里出。', 4.5);
        g.hud.subtitle('守祀人还跪在里面。他不看人——借他的眼睛（Q）也无妨。', 5);
      },
    });
    add({
      zone: Z.wreckBay, once: true,
      act: () => {
        g.hud.subtitle('湾里的沉船翻着龙骨。走龙骨过谷地——别下水。', 5);
      },
    });
    // —— 返潮之后的镇区（异化态叙事：地图变了，路也变了） ——
    add({
      zone: Z.frontStreet, once: true, cond: () => this.flags.leaked,
      act: () => {
        g.hud.subtitle('街心摆满了椅子。一排一排，全脸朝海。', 5, 'song');
        g.hud.subtitle('没有一把是空的——每把上面都放着一双叠好的鞋。', 5.5, 'song');
      },
    });
    add({
      zone: Z.villageCenter, once: true, cond: () => this.flags.leaked,
      act: () => {
        g.hud.subtitle('通酒店的主街隆起了一道脊。泥、壳，还有别人家的门。', 5.5);
        g.hud.subtitle('路从今晚起不走这里。要过去，钻床单巷，或者绕盐田。', 5.5);
      },
    });
    add({
      zone: Z.lighthouse, once: true, cond: () => !this.flags.finaleBroken,
      act: () => {
        g.hud.subtitle('灯塔是黑的。塔下的浪很稳，稳得像屏住呼吸。', 5),
        this.saveCheckpoint('lighthouse');
      },
    });
    // —— 酒店节拍 ——
    add({
      zone: Z.hotelFront, once: true,
      act: () => {
        g.hud.subtitle('南方大酒店。一九九八年填湾起楼，建材取自古海床。', 5);
        g.hud.subtitle('整面楼都亮着。「還」字灯箱把台阶照成红的。', 4.5);
        this.saveCheckpoint('hotelFront');
      },
    });
    add({
      zone: Z.hotelLobby, once: true,
      act: () => {
        this.flags.inHotel = true;
        g.hud.subtitle('大堂满员。水磨石地面，红毯直铺到大楼梯。', 4.5);
        g.hud.subtitle('总台的登记簿开着。你的房号——外证随持册人，807。', 5);
        g.hud.objective('上三楼 807 照影房，找周絮');
        if (g.agenda.stage < 1) g.agenda.advance(); // 收港
        g.crt.setEnabled(true);
        this.saveCheckpoint('lobby');
      },
    });
    add({
      zone: Z.banquet, once: true, cond: () => this.flags.crtTip && !this.flags.leaked,
      act: () => {
        // 验户 = 返潮点火
        if (this.g.agenda.stage < 3) this.g.agenda.advance(); // → 验户（applyStage 触发渗漏）
      },
    });
    add({
      zone: Z.serviceCorridor, once: true, cond: () => this.flags.metBride,
      act: () => {
        g.hud.subtitle('服务走廊。推车上有台电视——没接天线，屏幕却亮着。', 5);
      },
    });
    add({
      zone: Z.annex, once: true, cond: () => this.flags.imageBroken,
      act: () => {
        g.hud.subtitle('玻璃连廊。展缸的方向传来一声很低的嗡。', 4.5);
        g.hud.subtitle('铁柜在主展厅深处的处理间。理骨员在骨头边上绕圈。', 5);
        this.saveCheckpoint('annex');
      },
    });
  }

  // ---------- 节拍：807 照影 ----------
  brideScene() {
    const g = this.g;
    const F = this.flags;
    F.metBride = true;
    g.player.frozen = true;
    g.hud.setLetterbox(true);
    g.hud.subtitle('絮絮看见你，肩膀松了半寸。', 4);
    g.hud.subtitle('「阿澄。你坐我边上。」', 3.5);
    g.hud.subtitle('三面镜里坐着你们两个。照影的时辰还没到。', 4.5, null);
    setTimeout(() => {
      g.hud.subtitle('絮絮往你手里塞了面小镜子，掌心全是汗——', 4.5);
      g.hud.subtitle('「拿着。镜子里的事，比外头早一拍。看镜子，别看人。」', 5.5);
    }, 8000);
    setTimeout(() => {
      F.hasMirror = true;
      g.audio.bellSmall();
      g.hud.setLetterbox(false);
      g.player.frozen = false;
      g.hud.subtitle('（获得手镜：镜中之物先于现实半拍）', 4);
      g.hud.objective('下楼——去服务走廊，找那台亮着的电视');
      if (g.agenda.stage < 2) g.agenda.advance(); // 归屋
      this.saveCheckpoint('suite807');
    }, 13500);
  }

  // ---------- 节拍：验户 → 渗漏态 ----------
  beginLeak() {
    const F = this.flags;
    if (F.leaked) return;
    F.leaked = true;
    const g = this.g;
    g.audio.setBloodTide(true);   // 深海轰鸣一记（无水的潮）
    g.audio.setSongWarp(true);    // 点名谣换了唱法
    g.ocean.setBloodTide(true, 1.2);
    g.sky.setBloodTide(true);
    g.stealth.envSightFactor = 0.85;
    g.hud.subtitle('验户念到一半——整栋楼往下沉了一寸。没有水。来的是深度。', 6, 'song');
    g.hud.subtitle('大堂的人不见了。席上的人还在——脚尖离了地。', 5.5, 'song');
    g.hud.subtitle('侍应把托盘收空了。想想员工须知里那句话。', 5);
    // 人群切换：满员正常态 → 浮客
    this.crowdNormal.visible = false;
    this.crowdLeak.visible = true;
    for (const f of g.floaters) f.setEnabled(true);
    // 预现层兑现：现实长出沉积（把预现①搬进现实）
    this.ftSediment.traverse((o) => { o.visible = true; });
    g.scene.add(this.ftSediment);
    // 新预现：还没有内容（点名要等你拿钥匙——它在等你的名字）
    g.crt.setForetell([], []);
    // 敌人变化：侍应转为警戒巡逻，保卫科上岗
    const byId = g.byId;
    for (const id of ['waiterBanquet', 'waiterLobby', 'waiterEast']) {
      const w = byId[id];
      if (w) { w.sightRange += 2; w.walkSpeed = 1.15; }
    }
    byId.security?.setEnabled(true);
    // —— 镇区异化：外面那座镇，从这一拍起不再是原来的镇 ——
    // 主街隆脊封死/椅阵面海/CRT冢通电/床单巷挂帘（碰撞与视线遮挡一并启用）
    g.world.applyLeakState?.();
    // 履职的人一个不剩（守祀人除外——他的祭还没做完）
    for (const id of ['netMender', 'saltWorker', 'dikePatrol', 'runner1', 'runner2', 'streetRunner', 'templeGuard', 'booth']) {
      byId[id]?.setEnabled(false);
    }
    g.dog?.setEnabled(false);
    // 上街的换成湿客：不认贝灰的界、镁光打折——绕开或用闹钟钓走
    for (const id of ['wetcomer1', 'wetcomer2', 'wetcomer3']) byId[id]?.setEnabled(true);
    // 灯光：荧光变冷、闪烁加剧
    for (const hl of g.world.dynamic.hotelLights ?? []) {
      hl.flicker = Math.min(2.4, (hl.flicker ?? 0) + 0.8);
      hl.base *= 0.72;
    }
    // 画面：轻微冷绿下沉（不是红滤镜）
    g.engine.finalPass.uniforms.uTint.value.set(0.94, 1.0, 0.97);
    g.hud.objective('去二楼保卫科——拿海洋馆的钥匙');
    this.saveCheckpoint('leak', g.world.locations.kitchen.x, g.world.locations.kitchen.z);
  }

  // ---------- 节拍：CRT 点名 → 破像 ----------
  nameByCrt() {
    const F = this.flags;
    if (F.namedByCrt || F.imageBroken) return;
    F.namedByCrt = true;
    this.nameCountdown = 75; // 规则二：那格录像播完之前必须破像
    const g = this.g;
    g.audio.tvBlip();
    g.crt.setForetell([this.ftSeated], []);
    g.hud.subtitle('身后的九个屏幕同时换了画面——宴会厅，上宾的空席。', 5);
    g.hud.subtitle('席上坐了个人。那身衣服……是你的。', 5, 'song');
    g.hud.subtitle('告示第二条。你那格录像播完之前，得让画面跟现实对不上。', 5.5);
    g.hud.objective('去一楼配电间拉总闸：让现实与录像不符（破像）');
    this.saveCheckpoint('named');
  }

  breakImage() {
    const F = this.flags;
    F.imageBroken = true;
    F.namedByCrt = false;
    F.breakerCut = true;
    const g = this.g;
    g.audio.breakerClunk(false);
    g.crt.breakImage(30);
    g.crt.setForetell([], []);
    g.agenda.delay(30);
    // 灯光骤暗几秒
    const lights = g.world.dynamic.hotelLights ?? [];
    const bases = lights.map((l) => l.base);
    for (const l of lights) l.base = 0.06;
    setTimeout(() => {
      lights.forEach((l, i) => { l.base = bases[i] * 0.55; });
      g.audio.breakerClunk(true);
      if (!g.player.dead) g.hud.subtitle('应急电上来了。灯只剩一半。', 4);
    }, 5000);
    g.hud.subtitle('总闸落下。整栋楼黑了一拍——屏幕里的画面撕成雪花。', 5.5);
    g.hud.subtitle('录像作废了。这一次点名不算。', 4.5, 'song');
    g.hud.subtitle('但大堂里进来了别的东西。走红毯。硬地会把你的脚步传给它。', 6);
    g.hud.objective('从玻璃连廊进海洋馆——母带在主展厅深处的处理间');
    // 上宾入场
    g.guest.setEnabled(true);
    g.stealth.vibrationActive = true;
    this.saveCheckpoint('broken');
  }

  // ---------- 节拍：取母带 ----------
  takeTape() {
    const F = this.flags;
    F.hasTape = true;
    const g = this.g;
    g.hud.subtitle('母带很沉，像吸饱了水——可它是干的。', 4.5);
    g.hud.objective('回三楼 807，用房里的录像机放母带');
    if (g.agenda.stage < 4) g.agenda.advance(); // 熄灯
    this.saveCheckpoint('tape');
  }

  // ---------- 节拍：播母带 + 理册婆 ----------
  playTape() {
    const F = this.flags;
    F.tapeSeen = true;
    const g = this.g;
    g.player.frozen = true;
    g.audio.tvBlip();
    g.hud.setLetterbox(true);
    this.tapeSeq = { t: 0, stage: 0 };
  }

  updateTape(dt) {
    if (!this.tapeSeq) return;
    const s = this.tapeSeq;
    const g = this.g;
    s.t += dt;
    switch (s.stage) {
      case 0:
        if (s.t > 0.5) {
          s.stage = 1;
          g.hud.subtitle('雪花。然后是宴会厅——彩排那天的宴会厅。', 4.5);
          g.hud.subtitle('画外音是个老人。他在讲还地的规矩。', 4);
        }
        break;
      case 1:
        if (s.t > 8.5) {
          s.stage = 2;
          this.notesFound.add('note8');
          g.openNote(NOTES.find((n) => n.id === 'note8'));
        }
        break;
      case 2:
        if (this.g.state === 'PLAY') { // 文书已合上
          s.stage = 3; s.t = 0;
          g.player.frozen = true;
          g.hud.subtitle('……销账。销的是册末的空名。外证要挑外乡人。', 5.5, 'song');
          g.hud.subtitle('絮絮知道。她把镜子塞给你的时候，手在抖。', 5);
        }
        break;
      case 3:
        if (s.t > 6) {
          this.tapeSeq = null;
          g.hud.setLetterbox(false);
          g.player.frozen = false;
          this.beginMatronChase();
        }
        break;
    }
  }

  beginMatronChase() {
    const F = this.flags;
    if (F.matronChase) return;
    F.matronChase = true;
    const g = this.g;
    const matron = g.byId.matron;
    if (matron) {
      matron.setEnabled(true);
      matron.permAlertBonus = 6;
      matron.enterAlert(g.player, g.audio, null);
    }
    g.audio.bellSmall();
    g.hud.subtitle('走廊尽头的镜子里——理册婆已经站在你门口了。', 5, 'song');
    g.hud.subtitle('现实里她还没到。镜子早一拍。趁这一拍，走。', 5);
    g.hud.objective('甩开理册婆，下楼去宴会厅——扯下「還」字金匾，大破像');
    this.saveCheckpoint('tape807');
  }

  // ---------- 终局 ----------
  beginFinale() {
    const F = this.flags;
    F.finaleBroken = true;
    const g = this.g;
    g.audio.bellBig();
    g.crt.breakImage(9999);
    g.agenda.advanceTo(5); // 还地（广播在雪花里变形）
    // 匾落下：席位的名字没了着落
    const plate = g.world.dynamic.guestSeatPlate;
    if (plate) plate.visible = false;
    g.hud.subtitle('金匾砸在舞台上。「還」字断成两半。', 4.5);
    g.hud.subtitle('全楼的屏幕一起转成雪花——没有下一个画面了。', 5, 'song');
    g.hud.subtitle('报数员还举着册。他的嘴被鱼籽封着，声音却没停：——还地——还地——', 6, 'song');
    // 全体警觉但失去目标：搜索状态
    for (const e of g.enemies) {
      if (!e.enabled || !e.lastSeenPos) continue;
      e.lastSeenPos.set(g.world.locations.banquetCenter.x, 0, g.world.locations.banquetCenter.z);
      if (e.state === 'ALERT') { e.state = 'SEARCH'; e.stateTimer = 0; e.searchTotal = 0; e.searchTarget = null; }
    }
    g.hud.objective('离开酒店——去灯塔，等海雾散');
    this.saveCheckpoint('finale');
  }

  tryEnd() {
    if (this.flags.ended || !this.flags.finaleBroken) return;
    const p = this.g.player.pos;
    const Z = this.g.world.zones.lighthouse;
    if (p.x >= Z.minX && p.x <= Z.maxX && p.z >= Z.minZ && p.z <= Z.maxZ) {
      this.beginEnding();
    }
  }

  beginEnding() {
    const g = this.g;
    this.flags.ended = true;
    g.player.frozen = true;
    g.hud.prompt(null);
    this.endSeq = { t: 0, stage: 0 };
    g.hud.clearSubtitles();
    g.hud.subtitle('潮声退了半拍。像一本册子合上了页。', 5);
  }

  updateEnding(dt) {
    if (!this.endSeq) return;
    const g = this.g;
    const s = this.endSeq;
    s.t += dt;
    switch (s.stage) {
      case 0:
        if (s.t > 4) {
          s.stage = 1; s.t = 0;
          g.ocean.setBloodTide(false);
          g.sky.setBloodTide(false);
          g.audio.setSongWarp(false);
          g.engine.finalPass.uniforms.uTint.value.set(1, 1, 1);
          g.hud.subtitle('海雾散了。楼里的灯一层一层地灭，像退潮。', 5.5);
        }
        break;
      case 1:
        if (s.t > 5.5) {
          s.stage = 2; s.t = 0;
          g.sightjack.forceView(this.seaViewer, 6.0, () => {});
          g.hud.subtitle('最后你借了一次海的眼睛。它看了看灯塔上的你——', 5.5, 'song');
          g.hud.subtitle('然后收回了视线。今晚点到的名字，不是你的。', 5.5, 'song');
        }
        break;
      case 2:
        if (s.t > 7) {
          s.stage = 3; s.t = 0;
          g.hud.fade(true);
        }
        break;
      case 3:
        if (s.t > 2.5) {
          s.stage = 4;
          g.sightjack.exit();
          g.sightjack.restorePost();
          g.player.frozen = true;
          g.hud.showEnding(
            ['潮退了半寸。', '絮絮还在楼里。她的名字还压在册底。', '', '—— Demo 结束 ——'],
            `返潮 FANCHAO · 蚀湾 2001<br/>
             文书拾获：${this.notesFound.size} / ${NOTES.length} · 被引座 ${this.deathCount} 次<br/><br/>
             「电视先播，现实照做。名册不许缺页。」<br/><br/>
             按 F5 重新入镇`
          );
          g.onEnded?.();
        }
        break;
    }
  }

  // ---------- 议程 → 世界状态 ----------
  applyStage(stage) {
    const g = this.g;
    switch (stage) {
      case 0: // 起雾：酒店灯箱更亮
        break;
      case 1: // 收港
        break;
      case 2: { // 归屋：侍应加速
        for (const id of ['waiterBanquet', 'waiterLobby']) {
          const w = g.byId[id];
          if (w) w.walkSpeed = 1.1;
        }
        break;
      }
      case 3: // 验户 = 返潮点火
        this.beginLeak();
        break;
      case 4: { // 熄灯：理册婆上三楼（等母带播完转为追）
        const matron = g.byId.matron;
        if (matron) matron.setEnabled(true);
        g.hud.subtitle('楼上传来翻册页的声音。一页，一页。', 5, 'song');
        break;
      }
      case 5: // 还地（终局压力）
        for (const e of g.enemies) {
          if (e.enabled && e.permAlertBonus !== undefined) e.permAlertBonus = Math.min(9, e.permAlertBonus + 2);
        }
        break;
    }
  }

  // ---------- 视奸获知闩杆（镇口岗亭） ----------
  updateBoothSpy(dt) {
    const F = this.flags;
    if (F.knowLatch || !this.g.sightjack.active) return;
    if (this.g.sightjack.current !== this.g.byId.booth) return;
    this.boothSpyT += dt;
    if (this.boothSpyT > 1.4) {
      F.knowLatch = true;
      this.g.hud.subtitle('他的眼睛一整夜没动过——钉着栅门内侧的那根闩杆。', 5);
      this.g.hud.subtitle('闩杆挨着岗亭的小窗。手能探进去。', 4.5);
      this.g.hud.objective('从岗亭小窗探手，拨开栅门的闩');
    }
  }

  // ---------- 开场 ----------
  beginIntro() {
    const F = this.flags;
    if (F.intro) return;
    F.intro = true;
    const hud = this.g.hud;
    this.introSeq = { t: 0, dur: 12.0, thunder2: false };
    hud.setLetterbox(true);
    this.g.player.frozen = true;
    // 光雷谱一拍：开场首闪（远雷慢半拍跟上）；二拍双闪由 updateIntro 按真实时钟触发
    this.g.sky.flashSeq = { t: 0, strikes: [0.6, 0.85] };
    this.g.sky.thunderQueued = 1;
    this.g.sky._boltAz = -1.7; // 闪电裂纹立在牌坊背后的西天——剪影要有光源
    this.g.sky.boltMesh.visible = true;
    hud.subtitle('二〇〇一年，秋。蚀湾。雨没有停过。', 4);
    hud.subtitle('……核册实况转播……南方大酒店……全镇同往……', 5, 'radio');
    hud.subtitle('末班长途车。司机没熄火——他等的不是你，是掉头。', 5.5);
    hud.subtitle('絮絮的信在行李箱里。她只求了你一件事：念名的时候，别应。', 6);
    setTimeout(() => this.g.audio.doorCreak(), 1200); // 车门合拢
    setTimeout(() => {
      hud.objective('从站台长椅上取回行李');
    }, 13000);
  }

  updateIntro(dt) {
    if (!this.introSeq) return;
    const s = this.introSeq;
    // 用真实时钟驱动（低配下游戏 dt 被钳制会拖慢三拍，与字幕/音效的墙钟错拍）
    if (s.t0 === undefined) s.t0 = performance.now();
    s.t = (performance.now() - s.t0) / 1000;
    const g = this.g;
    const p = g.player;
    const cam = g.engine.camera;
    const gnd = (x, z) => g.world.heightAt(x, z);
    const ss = (a, b, t) => {
      t = Math.min(1, Math.max(0, (t - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    const lv = (a, b, t) => a + (b - a) * t;
    if (s.t > 1.6) this.busGo = true; // 末班车掉头回县城
    // 门 3 冲击拍：镜头咬住牌坊剪影的同一瞬，双闪+近雷同拍压下
    if (!s.thunder2 && s.t >= 5.2) {
      s.thunder2 = true;
      g.sky.flashSeq = { t: 0, strikes: [0.05, 0.28] };
      g.sky._boltAz = -1.7;
      g.sky.boltMesh.visible = true;
      g.audio.thunderDistant(0.15);
    }
    let px, py, pz, tx, ty, tz, roll = 0;
    if (s.t < 5.0) {
      // 【一拍 · 低机位仰拍】蹲在湿沥青上：大巴车身压着镜头驶离，
      // 车灯锥扎进雨里，尾灯两点红缩进雾里
      const u = ss(0, 5.0, s.t);
      px = 60.9 - u * 0.7;
      pz = 2.0 + u * 0.4;
      py = gnd(px, pz) + 0.35;
      const bus = g.world.dynamic.bus;
      const bx = bus ? bus.position.x : 64.5;
      tx = bx + 2.6;
      ty = gnd(64.5, -1.3) + 1.55 + u * 0.5;
      tz = -1.3;
      roll = Math.sin(s.t * 0.7) * 0.028;
    } else if (s.t < 8.4) {
      // 【二拍 · 牌坊剪影】低机位仰角咬住「蚀湾」牌坊——双闪把瓦顶石柱烧成剪影，雷声同拍
      const u = ss(5.0, 8.4, s.t);
      px = 51.5 - u * 1.6;
      pz = 1.3 - u * 0.4;
      py = gnd(px, pz) + 0.45 + u * 0.4;
      tx = 44;
      ty = gnd(44, 0) + 5.1 - u * 1.4;
      tz = 0;
    } else {
      // 【三拍 · 落回眼睛】从眼前两米倒退着落回眼窝，接第一人称
      const u = ss(8.4, s.dur, s.t);
      const ex = p.pos.x, ez = p.pos.z, ey = p.pos.y + 1.62;
      const fdx = -Math.sin(p.yaw), fdz = -Math.cos(p.yaw);
      const back = (1 - u) * 2.2;
      px = ex + fdx * back;
      pz = ez + fdz * back;
      py = ey + (1 - u) * 0.22;
      tx = ex + fdx * 9;
      ty = lv(ey - 0.4, ey, u);
      tz = ez + fdz * 9;
    }
    cam.position.set(px, py, pz);
    cam.lookAt(tx, ty, tz);
    if (roll) cam.rotation.z += roll;
    if (s.t >= s.dur) this.endIntro();
  }

  endIntro() {
    if (!this.introSeq) return;
    this.introSeq = null;
    this.busGo = true;
    this.g.hud.setLetterbox(false);
    if (this.g.state === 'PLAY' && !this.g.player.dead) this.g.player.frozen = false;
    this.g.player.syncCamera(0);
  }

  // ---------- 末班车离站 ----------
  updateBus(dt) {
    if (!this.busGo) return;
    const bus = this.g.world.dynamic.bus;
    if (!bus || !bus.visible) return;
    // 碰撞体随首次移动作废
    const col = this.g.world.dynamic.busCollider;
    if (col && col.minX < 9000) { col.minX = 9999; col.maxX = 9999; col.maxY = -Infinity; }
    this._busV = Math.min(9, (this._busV ?? 1.2) + dt * 2.2);
    bus.position.x += this._busV * dt;
    const g2 = this.g.world.heightAt(bus.position.x, bus.position.z);
    bus.position.y += (g2 + 0.06 - bus.position.y) * Math.min(1, dt * 4);
    // 轮迹水花：按车速点亮轮后水雾尾（湿沥青被轮胎带起——车是「碾着水」走的）
    const sprays = this.g.world.dynamic.busSprays;
    if (sprays) {
      const k = Math.min(1, this._busV / 7);
      const on = k > 0.14;
      this.g.world.dynamic.busSprayMat.opacity = on
        ? Math.max(0, 0.13 + 0.2 * k + Math.sin(this.time * 37) * 0.04 * k) : 0;
      for (const sp of sprays) {
        sp.visible = on;
        const pulse = 1 + Math.sin(this.time * 23 + sp.position.x * 3.1) * 0.12;
        sp.scale.set((0.35 + 0.6 * k) * pulse, 0.35 + 0.85 * k, (0.3 + 0.4 * k) * pulse);
      }
    }
    if (bus.position.x > 128) bus.visible = false;
  }

  // ---------- 检查点 ----------
  saveCheckpoint(name, x, z) {
    const p = this.g.player;
    this.checkpoint = {
      name,
      x: x ?? p.pos.x, z: z ?? p.pos.z, yaw: p.yaw,
      y: x !== undefined ? undefined : p.pos.y,
    };
    if (this.time > 4) this.g.hud.checkpointToast();
  }

  respawn() {
    const g = this.g;
    const c = this.checkpoint;
    g.player.setPosition(c.x, c.z, c.yaw, c.y);
    g.player.dead = false;
    g.player.frozen = false;
    for (const e of g.enemies) e.reset?.();
    g.guest?.reset?.();
    g.stealth.vibration = 0;
    g.stealth.danger = 0;
    this.drownTimer = 0;
    // 规则状态复位：点名倒计时重新走，广播窗口清空
    this.broadcastT = 0;
    this.seaGazeT = 0;
    if (this.flags.namedByCrt && !this.flags.imageBroken) this.nameCountdown = 75;
    this._nameWarn30 = false;
    this._nameWarn10 = false;
    g.hud.setDeath(false);
    g.hud.fade(false);
  }

  // ---------- 被抓演出（引座） ----------
  beginCaught(enemy) {
    if (this.g.player.dead || this.flags.ended || this.caughtSeq) return;
    const g = this.g;
    this.caughtSeq = { t: 0, enemy };
    if (enemy.grabbing !== undefined) enemy.grabbing = true;
    g.player.frozen = true;
    g.sightjack.exit();
    g.sightjack.restorePost();
    g.audio.grabSting?.();
    g.hud.prompt(null);
  }

  updateCaught(dt) {
    if (!this.caughtSeq) return;
    const s = this.caughtSeq;
    s.t += dt;
    const g = this.g;
    const p = g.player;
    const e = s.enemy;
    const ex = e.pos?.x ?? p.pos.x, ez = e.pos?.z ?? p.pos.z;
    const targetYaw = Math.atan2(-(ex - p.pos.x), -(ez - p.pos.z));
    p.yaw += angleWrap(targetYaw - p.yaw) * Math.min(1, dt * 10);
    p.pitch += (-0.08 - p.pitch) * Math.min(1, dt * 8);
    p.syncCamera(dt);
    const u = g.engine.finalPass.uniforms;
    u.uPulse.value = Math.min(1.5, s.t * 2.2);
    u.uDistort.value = Math.min(0.55, s.t * 0.5);
    if (s.t > 1.45) {
      this.caughtSeq = null;
      if (e.grabbing !== undefined) e.grabbing = false;
      const isGuest = e.kind === 'guest';
      this.kill('席',
        isGuest
          ? '前肢在你头顶合拢。等你能动的时候，你坐在空席上，桌牌写着——「上宾」。—— 回到检查点'
          : `${e.label}把你引回了宴会厅。空席的桌牌翻了过来——是你的名字。—— 回到检查点`);
    }
  }

  // ---------- 死亡（引座失败态） ----------
  kill(reason, sub, force = false) {
    if ((this.g.player.dead && !force) || this.flags.ended) return;
    const g = this.g;
    this.deathCount++;
    g.player.dead = true;
    g.player.frozen = true;
    g.audio.drown();
    g.sightjack.exit();
    g.sightjack.restorePost();
    g.hud.clearSubtitles();
    this.deathSeq = { t: 0, reason, sub };
    g.engine.finalPass.uniforms.uRedShift.value = 0.35;
    document.getElementById('death-text').textContent = reason ?? '席';
    const m = Math.floor(this.time / 60);
    const stats = `入镇 ${m} 分 · 文书 ${this.notesFound.size}/${NOTES.length} · 第 ${this.deathCount} 次被引座`;
    g.hud.setDeath(true, sub ?? '名册不许缺页 —— 正在回到检查点', stats);
  }

  updateDeath(dt) {
    if (!this.deathSeq) return;
    this.deathSeq.t += dt;
    const t = this.deathSeq.t;
    this.g.engine.finalPass.uniforms.uRedShift.value = Math.min(0.6, 0.35 + t * 0.08);
    if (t > 2.2 && !this.deathSeq.faded) {
      this.deathSeq.faded = true;
      this.g.hud.fade(true);
    }
    if (t > 4.2) {
      this.deathSeq = null;
      const u = this.g.engine.finalPass.uniforms;
      u.uRedShift.value = 0;
      u.uDistort.value = 0;
      u.uPulse.value = 0;
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
        this.g.hud.subtitle('水下有东西托了你一把——往深处托。', 3);
      }
      if (this.drownTimer > 2.0) this.kill('沉', '海把你收进册里了。—— 回到检查点');
    } else {
      this.drownTimer = Math.max(0, this.drownTimer - dt * 2);
      if (this.drownTimer === 0) this._drownWarned = false;
    }
    this.drownView = Math.min(1, this.drownTimer / 2);
  }

  // ---------- 振动警告 ----------
  updateVibration() {
    const g = this.g;
    const v = g.stealth.vibration;
    if (v > 0.4 && !this._vibWarned && g.stealth.vibrationActive) {
      this._vibWarned = true;
      g.hud.subtitle('地面在把你的脚步一格一格递过去。走红毯。慢下来。', 5);
    }
    if (v < 0.15) this._vibWarned = false;
  }

  // ---------- 规则怪谈 ----------
  /** 玩家是否在室内（规则一只对露天生效） */
  isIndoors() {
    const p = this.g.player.pos;
    const D = this.g.world.dynamic;
    const HI = D.hotelInfo;
    const rects = [HI?.footprint, HI?.annexRect, D.aquaMainRect, D.videoHallRect];
    for (const r of rects) {
      if (r && p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ) return true;
    }
    return false;
  }

  /** 广播开始（议程推进或镇报时都会调）——规则一的判定窗口 */
  onBroadcast(dur = 8) {
    this.broadcastT = dur;
    this.seaGazeT = 0;
    this._seaWarned = false;
    if (!this.isIndoors() && !this.g.player.dead) {
      if (this.notesFound.has('note9')) {
        this.g.hud.subtitle('广播。止步——背海而立。', 3.5, 'radio');
      } else {
        this.g.hud.subtitle('全镇的喇叭一起响了。', 3.5, 'radio');
      }
    }
  }

  /** 规则一：广播在响时不许看向海的方向 */
  updateRuleSea(dt) {
    if (this.broadcastT <= 0) return;
    this.broadcastT -= dt;
    const g = this.g;
    const p = g.player;
    if (p.dead || p.frozen || this.flags.ended || g.sightjack.active) return;
    if (this.isIndoors()) { this.seaGazeT = Math.max(0, this.seaGazeT - dt); return; }
    // 海的方向 = 背离岛心 (-10,-10) 的方向
    const dx = p.pos.x + 10, dz = p.pos.z + 10;
    const dl = Math.hypot(dx, dz) || 1;
    const lookDot = (-Math.sin(p.yaw)) * (dx / dl) + (-Math.cos(p.yaw)) * (dz / dl);
    if (lookDot > 0.7 && p.pitch > -0.5) {
      this.seaGazeT += dt;
      if (this.seaGazeT > 0.7 && !this._seaWarned) {
        this._seaWarned = true;
        g.audio.blip(170, 0.35, 0.3);
        g.hud.subtitle('（喉咙里发紧）——别看海。', 2.8, 'song');
      }
      if (this.seaGazeT > 2.1) {
        this.broadcastT = 0;
        this.flags.ruleSeaViolated++;
        g.sightjack.forceView(this.seaViewer, 2.2, () => {});
        g.hud.subtitle('你的视线被接走了。海从它那头看了回来。', 4, 'song');
        setTimeout(() => {
          if (!this.flags.ended) {
            g.sightjack.exit();
            g.sightjack.restorePost();
            this.kill('望', '广播念到一半，你看了海。海也看了你——把你的名字添进了席单。—— 回到检查点', true);
          }
        }, 2300);
      }
    } else {
      this.seaGazeT = Math.max(0, this.seaGazeT - dt * 1.4);
    }
  }

  /** 镇广播报时：进镇后周期性响起（规则一的日常考验） */
  updateTownCast() {
    const F = this.flags;
    if (!F.townGateOpen || F.ended || F.finaleBroken) return;
    if (this.nextTownCast < 0) this.nextTownCast = this.time + 45;
    if (this.time >= this.nextTownCast) {
      this.nextTownCast = this.time + 75 + Math.random() * 40;
      if (this.g.player.dead || this.g.agenda.silence > 0) return;
      this.g.audio.broadcast();
      this.g.hud.subtitle('……蚀湾广播站。现在报时——', 4, 'radio');
      this.onBroadcast(8);
    }
  }

  /** 规则二：CRT 点名倒计时——那格录像播完之前必须破像 */
  updateRuleName(dt) {
    const F = this.flags;
    if (!F.namedByCrt || F.imageBroken || this.g.player.dead || F.ended) return;
    this.nameCountdown -= dt;
    if (this.nameCountdown < 30 && !this._nameWarn30) {
      this._nameWarn30 = true;
      this.g.audio.tvBlip();
      this.g.hud.subtitle('录像在走。你还在画面里。', 4, 'song');
    }
    if (this.nameCountdown < 12 && !this._nameWarn10) {
      this._nameWarn10 = true;
      this.g.audio.blip(240, 0.3, 0.3);
      this.g.hud.subtitle('快没时间了——拉总闸，让画面作废。', 4, 'song');
    }
    if (this.nameCountdown <= 0) {
      this.flags.ruleNameExpired++;
      this.kill('名', '那格录像播完了。画面里的人坐进了席，现实照做。—— 回到检查点');
    }
  }

  /** 规则三：侍应托盘空着时不要让他看见你的手（蹲下=收手） */
  updateRuleTray(dt) {
    const F = this.flags;
    if (!F.leaked || this.g.player.dead || F.ended) return;
    const g = this.g;
    for (const id of ['waiterBanquet', 'waiterLobby', 'waiterEast']) {
      const w = g.byId[id];
      if (!w || !w.enabled || w.state !== 'SUSPECT') continue;
      if (!g.player.crouching && w.suspectMeter > 0.12) {
        F.ruleTraySeen++;
        w.enterAlert(g.player, g.audio, undefined);
        if (!this._trayShown) {
          this._trayShown = true;
          g.hud.subtitle('他的托盘是空的。他看见了你的手。', 4.5, 'song');
        }
      } else if (g.player.crouching) {
        w.suspectMeter = Math.max(0, w.suspectMeter - dt * 0.55);
        if (!this._trayGood && w.suspectMeter <= 0.01) {
          this._trayGood = true;
          g.hud.subtitle('你把手收在膝上。空托盘从你面前过去了。', 4.5);
        }
      }
    }
  }

  /** 街头电话亭：第一次路过时响铃 */
  updateStreetPhone(dt) {
    const F = this.flags;
    if (F.phoneAnswered) return;
    const L = this.g.world.locations;
    const p = this.g.player.pos;
    const d = Math.hypot(L.phoneBooth.x - p.x, L.phoneBooth.z - p.z);
    if (!F.phoneRinging && !this._phoneDone && F.townGateOpen && d < 10) {
      this._phoneDone = true;
      this.streetPhoneT = 0.8;
    }
    if (this.streetPhoneT > 0) {
      this.streetPhoneT -= dt;
      if (this.streetPhoneT <= 0) {
        F.phoneRinging = true;
        this.g.audio.phoneRing();
        this.g.hud.subtitle('电话亭响了。这个点，不会有人打给这个亭子。', 4.5);
        this._phoneRering = this.time + 6;
      }
    }
    if (F.phoneRinging && this.time > (this._phoneRering ?? 0)) {
      this._phoneRering = this.time + 6;
      if (d < 26) this.g.audio.phoneRing();
    }
  }

  // ---------- 前台电话（调虎离山） ----------
  updatePhone(dt) {
    if (this.phoneT < 0) return;
    this.phoneT -= dt;
    if (this.phoneT <= 0) {
      this.phoneT = -999; // 一次性
      const g = this.g;
      const L = g.world.locations;
      g.audio.phoneRing();
      g.stealth.emitNoise(L.frontPhone.x, L.frontPhone.z, 20);
      g.hud.subtitle('前台的电话响了。侍应的头一起转过去。', 4.5);
    }
  }

  // ---------- 环境氛围 ----------
  updateAmbient() {
    const g = this.g;
    const a = this.ambient;
    for (const b of a.beats) {
      if (b.done || this.time < b.at) continue;
      if (b.cond && !b.cond()) continue;
      b.done = true;
      b.act();
    }
    if (this.time >= a.next) {
      a.next = this.time + 45 + Math.random() * 30;
      if (g.stealth.danger < 0.25 && !g.sightjack.active) {
        const kind = a.pool[a.idx++ % a.pool.length];
        if (kind === 'horn') g.audio.hornDistant();
        else if (kind === 'gull') g.audio.gullDistant();
        else if (kind === 'creak') g.audio.doorCreak();
        else g.audio.bell(820, 2.4, 0.055);
      }
    }
    // 海洋馆展缸低鸣
    if (this.flags.imageBroken && !this.flags.ended) {
      const L = this.g.world.locations;
      const d = Math.hypot(L.aquaHall.x - g.player.pos.x, L.aquaHall.z - g.player.pos.z);
      if (d < 16) g.audio.tankHum(d);
    }
  }

  // ---------- 望潮者（环境叙事） ----------
  updateWatchers() {
    const ws = this.g.watchers;
    if (!ws) return;
    if (this._watcherSeen && this._watcherTurnSeen) return;
    const p = this.g.player.pos;
    for (const w of ws) {
      const d = Math.hypot(w.pos.x - p.x, w.pos.z - p.z);
      if (d > 26) continue;
      if (!this.flags.leaked && !this._watcherSeen) {
        this._watcherSeen = true;
        this.g.hud.subtitle('滩尾的水里站着人。不上岸，也不回头。', 5);
        this.g.hud.subtitle('他们在等验户开始。', 4);
      } else if (this.flags.leaked && !this._watcherTurnSeen) {
        this._watcherTurnSeen = true;
        this.g.hud.subtitle('……望潮的人转过身来了。', 4.5, 'song');
        this.g.hud.subtitle('验户之后，他们望着酒店。望着你。', 4.5, 'song');
      }
    }
  }

  // ---------- 湿客（异化态敌人——初见叙事） ----------
  updateWetcomers() {
    if (this._wetSeen || !this.flags.leaked) return;
    const p = this.g.player.pos;
    for (const id of ['wetcomer1', 'wetcomer2', 'wetcomer3']) {
      const w = this.g.byId[id];
      if (!w || !w.enabled) continue;
      if (Math.hypot(w.pos.x - p.x, w.pos.z - p.z) > 15) continue;
      this._wetSeen = true;
      this.g.hud.subtitle('街上有人在走。那不是镇上的人——衣服是镇上的。', 5.5, 'song');
      this.g.hud.subtitle('裤脚一直在滴水。滴到地上，就不见了。', 5, 'song');
      this.g.hud.subtitle('灰线拦不住它。想过去：别出声，或者拿闹钟把它钓开。', 5.5);
      break;
    }
  }

  // ---------- 回眸客指路 ----------
  updateGaze() {
    const g = this.g;
    const gz = g.gaze;
    if (!gz) return;
    const L = g.world.locations;
    const F = this.flags;
    // 分阶段出现在关键路口，回眸指向下一个目标
    let want = null;
    if (F.inHotel && !F.metBride) {
      want = { x: L.stairwell1F.x, z: L.stairwell1F.z + 2.5, target: new THREE.Vector3(L.stairwell1F.x + 2, L.stairwell1F.y + 4, L.stairwell1F.z), floorY: L.stairwell1F.y };
    } else if (F.leaked && !F.hasAquaKey) {
      want = { x: L.lobbyCenter.x + 3, z: L.lobbyCenter.z - 3, target: new THREE.Vector3(L.securityDesk.x, L.securityDesk.y, L.securityDesk.z), floorY: L.lobbyCenter.y };
    } else if (F.imageBroken && !F.hasTape) {
      want = { x: L.lobbyCenter.x + 5.5, z: L.lobbyCenter.z + 1, target: new THREE.Vector3(L.aquaHall.x, L.aquaHall.y, L.aquaHall.z), floorY: L.lobbyCenter.y };
    }
    if (want) {
      if (!gz.enabled || Math.hypot(gz.pos.x - want.x, gz.pos.z - want.z) > 1) {
        gz.appearAt(want.x, want.z, want.target, want.floorY);
      }
    } else if (gz.enabled) {
      gz.setEnabled(false);
    }
  }

  // ---------- 主更新 ----------
  update(dt) {
    this.time += dt;
    const g = this.g;

    this.updateIntro(dt);
    this.updateBus(dt);
    this.updateCaught(dt);
    this.updateDeath(dt);
    this.updateTape(dt);
    if (this.flags.ended) { this.updateEnding(dt); return; }
    if (g.player.dead || this.caughtSeq || this.tapeSeq) return;

    this.updateDrown(dt);
    this.updateBoothSpy(dt);
    this.updateVibration();
    this.updatePhone(dt);
    this.updateStreetPhone(dt);
    this.updateTownCast();
    this.updateRuleSea(dt);
    this.updateRuleName(dt);
    this.updateRuleTray(dt);
    this.updateAmbient();
    this.updateWatchers();
    this.updateWetcomers();
    this.updateGaze();
    this.tryEnd();

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
      d.gateCollider.maxY = -Infinity;
      d.gateCollider.minX = 9999; d.gateCollider.maxX = 9999;
    }
    // 镇口栅门动画
    if (this.flags.townGateOpen && d.townGate && d.townGate.rotation.y < 1.7) {
      d.townGate.rotation.y = Math.min(1.7, d.townGate.rotation.y + dt * 1.3);
      d.townGateCollider.maxY = -Infinity;
      d.townGateCollider.minX = 9999; d.townGateCollider.maxX = 9999;
    }

    // 收音机刻度盘
    if (d.radioDial) {
      d.radioDial.material.color.setHSL(0.08, 0.9, 0.4 + Math.sin(this.time * 7) * 0.12);
    }

    // 周絮小动作
    if (this.bride && this.bride.group.visible) {
      this.bride.animate('sit', dt, 0.6);
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
