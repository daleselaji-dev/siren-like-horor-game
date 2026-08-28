// 《返潮》入口：装配引擎/蚀湾小镇/南方大酒店/角色/AI/三轴系统(CRT预现·议程·振动)/叙事/音频/HUD
import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { Input } from './core/input.js';
import { AudioEngine } from './core/audio.js';
import { buildMaterials } from './world/materials.js';
import { bakeFaces } from './world/faces.js';
import { buildTown } from './world/town.js';
import { Rain } from './world/rain.js';
import { Ocean } from './world/water.js';
import { Sky } from './world/sky.js';
import { Player } from './entities/player.js';
import { Enemy, Dog, BirdFlock, Watcher, Floater, Gaze, HonoredGuest } from './entities/enemy.js';
import { Humanoid } from './entities/humanoid.js';
import { SightjackSystem } from './systems/sightjack.js';
import { StealthSystem } from './systems/stealth.js';
import { CRTSystem } from './systems/crt.js';
import { ToolsSystem } from './systems/tools.js';
import { PowerSystem } from './systems/power.js';
import { Agenda } from './systems/agenda.js';
import { Story, NOTES } from './systems/story.js';
import { HUD } from './ui/hud.js';
import { TitleSea } from './ui/title.js';
import { HeroFigures } from './world/heroModels.js';

// ---------------- 装配 ----------------
// ?lowspec=1 → 低画质模式（无头验证 / 低配机器）：关阴影与 Bloom、降分辨率
const LOWSPEC = new URLSearchParams(location.search).has('lowspec');
const app = document.getElementById('app');
const engine = new Engine(app, { lowspec: LOWSPEC });
const input = new Input(engine.renderer.domElement);
const audio = new AudioEngine();
const hud = new HUD();

const M = buildMaterials(LOWSPEC);
bakeFaces(M).then(() => { window.__facesReady = true; }); // 照片脸皮异步烘焙（不阻塞启动）
const world = buildTown(engine.scene, M);
const rain = new Rain(engine.scene, { lowspec: LOWSPEC, covers: world.dynamic.rainCovers ?? [] });
const ocean = new Ocean(engine.scene, M.textures, world);
const sky = new Sky(engine.scene);
world.waterLevel = () => ocean.level;

// Blender 细模英雄件（bpy→GLB 管线）：车站守夜人/祠像/迎宾侍应/床单巷湿客
const heroFigures = new HeroFigures(engine.scene, world, hud);

const player = new Player(engine.camera, input, world, audio);
player.setPosition(world.locations.spawn.x, world.locations.spawn.z, world.locations.spawn.yaw);
player.frozen = true; // 标题画面锁定

// ---------------- 实体编制 ----------------
// 镇上：还在履职的普通人；酒店：核册工位（报数员/侍应/保卫科/理册婆）
const P = world.patrols;
const HFY = P.hotelFloorY; // { f1, f2, f3 }
const enemyDefs = [
  // —— 蚀湾镇（外景） ——
  {
    id: 'netMender', label: '补网的人', kind: 'worker', role: 'fisher',
    workPos: P.netMenderWork, workMode: 'work_net', workYaw: 2.6,
    fov: 80, sightRange: 15, hearRange: 12,
    waypoints: [[12, 47], [4, 56], [18, 60], [26, 50]],
  },
  {
    id: 'saltWorker', label: '晒盐的人', kind: 'worker', role: 'fisher',
    workPos: P.saltWorkerWork, workMode: 'work_rake', workYaw: -0.6, tool: 'rake',
    fov: 85, sightRange: 16, hearRange: 13,
    waypoints: [[-44, 4], [-30, 12], [-24, -4], [-40, -8]],
  },
  {
    id: 'dikePatrol', label: '巡堤的人', kind: 'patrol', role: 'townsman',
    waypoints: P.dike, lantern: true, lanternLight: true,
    fov: 88, sightRange: 18, hearRange: 15, walkSpeed: 1.0,
  },
  {
    id: 'runner1', label: '送席的伙计', kind: 'patrol', role: 'townsman',
    waypoints: P.village1, lantern: true, lanternLight: true,
    fov: 92, sightRange: 18, hearRange: 15,
  },
  {
    id: 'runner2', label: '挑担的伙计', kind: 'patrol', role: 'townsman',
    waypoints: P.village2, hat: true,
    fov: 84, sightRange: 16, hearRange: 14,
  },
  {
    id: 'streetRunner', label: '跑腿的伙计', kind: 'patrol', role: 'townsman',
    waypoints: P.townStreet,
    fov: 86, sightRange: 16, hearRange: 14, walkSpeed: 1.05,
  },
  {
    // 守祀人对玩家全盲全聋——他的眼睛只看得见旧海祀没做完的祭（安全的视奸对象）
    id: 'keeper', label: '守祀的人', kind: 'worker', role: 'fisher',
    workPos: P.priestWork, workMode: 'work_pray', workYaw: Math.PI / 2,
    fov: 1, sightRange: 0, hearRange: 0,
  },
  {
    // 岗亭员：镇口栅门的守夜人。对玩家全盲全聋——视奸教学位：
    // 他的眼睛一整夜都钉在栅门内侧的闩杆上
    id: 'booth', label: '岗亭员', kind: 'worker', role: 'booth',
    workPos: P.boothWork, workMode: 'post', workYaw: -2.33,
    fov: 1, sightRange: 0, hearRange: 0,
  },
  {
    id: 'templeGuard', label: '看祠的人', kind: 'patrol', role: 'townsman',
    waypoints: P.templeGuard, lantern: true, lanternLight: true,
    fov: 90, sightRange: 17, hearRange: 15,
  },
  // —— 南方大酒店（核册工位） ——
  {
    // 报数员不追人：他的职是念议程。全盲全聋——但他的眼睛看得见整个宴会厅（视奸侦察位）
    // P0：舞台上站的是 Blender 细模（emcee_stage.glb 持麦变体）——与橱窗立像同一张脸
    id: 'emcee', label: '报数员', kind: 'worker', role: 'emcee', glbStation: 'emcee',
    workPos: P.emceeStage, workMode: 'mc', workYaw: 0, floorY: HFY.f1,
    fov: 1, sightRange: 0, hearRange: 0,
  },
  {
    id: 'waiterBanquet', label: '侍应', kind: 'patrol', role: 'waiter', fxKind: 'waiter', mute: true,
    glbStation: 'waiter',
    waypoints: P.waiterBanquet, floorY: HFY.f1,
    fov: 88, sightRange: 13, hearRange: 11, walkSpeed: 0.85, chaseSpeed: 2.55,
  },
  {
    id: 'waiterLobby', label: '侍应', kind: 'patrol', role: 'waiter', fxKind: 'waiter', mute: true,
    glbStation: 'waiter',
    waypoints: P.waiterLobby, floorY: HFY.f1,
    fov: 88, sightRange: 13, hearRange: 11, walkSpeed: 0.85, chaseSpeed: 2.55,
  },
  {
    id: 'waiterEast', label: '侍应', kind: 'patrol', role: 'waiter', fxKind: 'waiter', mute: true,
    glbStation: 'waiter',
    waypoints: P.waiterEast, floorY: HFY.f1,
    fov: 86, sightRange: 12, hearRange: 11, walkSpeed: 0.8, chaseSpeed: 2.5,
  },
  {
    id: 'security', label: '保卫科值班员', kind: 'patrol', role: 'townsman',
    waypoints: P.security2F, floorY: HFY.f2, enabled: false,
    fov: 92, sightRange: 14, hearRange: 12, walkSpeed: 0.95, chaseSpeed: 2.7,
  },
  {
    id: 'matron', label: '理册婆', kind: 'patrol', role: 'matron', glbStation: 'matron',
    waypoints: P.matron3F, floorY: HFY.f3, enabled: false,
    fov: 104, sightRange: 15, hearRange: 13, walkSpeed: 0.78, chaseSpeed: 2.35,
  },
  {
    // 理骨员：海洋馆主展厅的看守。绕残骸台座巡一整夜——头永远歪向骨头那侧。
    // 母带在处理间：侦察他的巡线（视奸），沿展柜外圈绕行
    id: 'osteo', label: '理骨员', kind: 'patrol', role: 'osteo', mute: true,
    waypoints: P.osteoHall, floorY: HFY.f1,
    fov: 92, sightRange: 13, hearRange: 12, walkSpeed: 0.68, chaseSpeed: 2.3,
  },
  // —— 湿客（返潮后才上街）：衣服是镇民的，皮是泡过的 ——
  // 泡过的眼睛不太吃镁光(flashK)，也不认贝灰的界(ignoreLime)——但耳朵灌了水更好骗（hearRange 高=闹钟更好用）
  {
    id: 'wetcomer1', label: '湿客', kind: 'patrol', role: 'returnee', fxKind: 'wet', mute: true, enabled: false,
    waypoints: P.wet1,
    fov: 100, sightRange: 14, hearRange: 18, walkSpeed: 0.56, chaseSpeed: 2.4,
    flashK: 0.55, ignoreLime: true,
  },
  {
    id: 'wetcomer2', label: '湿客', kind: 'patrol', role: 'returnee', fxKind: 'wet', mute: true, enabled: false,
    waypoints: P.wet2,
    fov: 100, sightRange: 14, hearRange: 18, walkSpeed: 0.6, chaseSpeed: 2.4,
    flashK: 0.55, ignoreLime: true,
  },
  {
    id: 'wetcomer3', label: '湿客', kind: 'patrol', role: 'returnee', fxKind: 'wet', mute: true, enabled: false,
    waypoints: P.wet3,
    fov: 100, sightRange: 15, hearRange: 18, walkSpeed: 0.6, chaseSpeed: 2.45,
    flashK: 0.55, ignoreLime: true,
  },
  // —— 轮12 增生：异化态的镇不止三个湿客——家属楼院与盐田绕行道也被认领了 ——
  {
    id: 'wetcomer4', label: '湿客', kind: 'patrol', role: 'returnee', fxKind: 'wet', mute: true, enabled: false,
    waypoints: P.wet4,
    fov: 100, sightRange: 14, hearRange: 18, walkSpeed: 0.52, chaseSpeed: 2.35,
    flashK: 0.55, ignoreLime: true,
  },
  {
    id: 'wetcomer5', label: '湿客', kind: 'patrol', role: 'returnee', fxKind: 'wet', mute: true, enabled: false,
    waypoints: P.wet5,
    fov: 100, sightRange: 14, hearRange: 18, walkSpeed: 0.58, chaseSpeed: 2.4,
    flashK: 0.55, ignoreLime: true,
  },
];

const enemies = enemyDefs.map((d) => new Enemy(engine.scene, world, M, d));
const dog = new Dog(engine.scene, world, M, { id: 'dog', label: '镇犬', waypoints: P.dogWander });
const birds = new BirdFlock(engine.scene, world, { id: 'birds', label: '海鸟群', center: [0, 0], radius: 46, height: 34 });
// 望潮者：站在滩涂尽头的水里，面向海。验户（返潮点火）之后他们会转过身来。
const watchers = [
  new Watcher(engine.scene, world, M, { id: 'watcher1', x: 104, z: 131, yaw: 0.75, seed: 1101 }),
  new Watcher(engine.scene, world, M, { id: 'watcher2', x: 42, z: 125, yaw: 0.2, seed: 2202 }),
  new Watcher(engine.scene, world, M, { id: 'watcher3', x: 103, z: -95, yaw: 1.5, seed: 3303 }),
];

// —— 浮客：验户后才浮起来的宾客（非敌对·视奸载体） ——
const HI = world.dynamic.hotelInfo;
const hb = HI.origin.y, hx = HI.origin.x, hz = HI.origin.z;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const floaters = [
  new Floater(engine.scene, world, M, {
    id: 'floater1', label: '宾客', role: 'guest_m', seed: 501, enabled: false, floorY: hb,
    spots: [V3(hx - 3, hb, hz + 7.5), V3(hx + 2, hb, hz + 4), V3(hx - 5, hb, hz + 3.5)],
  }),
  new Floater(engine.scene, world, M, {
    id: 'floater2', label: '宾客', role: 'guest_f', seed: 502, enabled: false, floorY: hb,
    spots: [V3(hx + 4, hb, hz + 8.5), V3(hx + 6, hb, hz + 3), V3(hx + 1, hb, hz + 9)],
  }),
  new Floater(engine.scene, world, M, {
    id: 'floater3', label: '宾客', role: 'guest_m2', seed: 503, enabled: false, floorY: hb,
    spots: [V3(hx - 12, hb, hz + 6), V3(hx - 10, hb, hz - 2), V3(hx - 14.5, hb, hz + 2)],
  }),
  new Floater(engine.scene, world, M, {
    id: 'floater4', label: '宾客', role: 'guest_f', seed: 504, enabled: false, floorY: hb,
    spots: [V3(hx - 10, hb, hz + 8), V3(hx - 15, hb, hz + 7), V3(hx - 12.5, hb, hz + 3.5)],
  }),
  new Floater(engine.scene, world, M, {
    id: 'floater5', label: '宾客', role: 'guest_m', seed: 505, enabled: false, floorY: hb,
    spots: [V3(hx - 10, hb, hz - 5.5), V3(hx - 14, hb, hz - 4), V3(hx - 11, hb, hz - 7.5)],
  }),
];

// —— 回眸客：非敌对指针，出现在关键路口，回头看向你该去的方向 ——
const gaze = new Gaze(engine.scene, world, M, { id: 'gaze', label: '回眸的人', seed: 77 });

// —— 上宾：破像后进驻大堂挑空的板重组前肢——它听楼板的振动 ——
const guest = new HonoredGuest(engine.scene, world, M, {
  id: 'guest', label: '上宾',
  area: { minX: hx - 8, maxX: hx + 8, minZ: hz, maxZ: hz + 11 },
  shoulder: [hx + 7.2, hb + 6.3, hz + 9.6],
  anchors: [
    [hx - 5, hb + 0.7, hz + 8],
    [hx + 3, hb + 0.7, hz + 3],
    [hx - 2, hb + 0.7, hz + 6],
    [hx + 5, hb + 0.7, hz + 9],
  ],
});

const viewers = [...enemies, dog, birds, ...watchers, ...floaters, gaze]; // 视奸信道
const byId = {};
for (const e of enemies) byId[e.id] = e;

// ---------------- 系统 ----------------
const sightjack = new SightjackSystem(engine, player, audio);
const stealth = new StealthSystem(world, player);
const crt = new CRTSystem(engine, world);
crt.gainLight = sky.hemi; // 监控头自动增益用
const tools = new ToolsSystem({ scene: engine.scene, engine, player, world, stealth, hud, audio, enemies, guest });
const power = new PowerSystem({ world, hud, audio, player });
tools.power = power;
power.onChanged = () => tools.syncHud();

const game = {
  scene: engine.scene, engine, world, player, hud, audio,
  enemies, byId, viewers, watchers, floaters, gaze, guest, dog,
  sightjack, stealth, crt, tools, power, ocean, sky, M,
  state: 'TITLE', // TITLE | PLAY | NOTE | PAUSE | ENDED
  openNote(note) {
    hud.showNote(note);
    game.state = 'NOTE';
    player.frozen = true;
  },
  closeNote() {
    hud.hideNote();
    game.state = 'PLAY';
    if (!player.dead && !story.flags.ended && !story.introSeq) player.frozen = false;
  },
  onEnded() { game.state = 'ENDED'; },
};
const agenda = new Agenda(game);
game.agenda = agenda;
const story = new Story(game);
game.story = story;

// ---------------- 标题 → 开始 ----------------
const titleScreen = document.getElementById('title-screen');
const titleSea = new TitleSea(document.getElementById('title-sea'));
titleSea.start();
requestAnimationFrame(() => titleScreen.classList.add('ready')); // 触发字幕显现动画
document.getElementById('title-start').addEventListener('click', () => {
  if (game.state !== 'TITLE') return;
  audio.init();
  audio.update(0, { playerPos: player.pos, danger: 0, chase: 0, songBase: 0.12 });
  titleScreen.classList.add('fading');
  setTimeout(() => { titleScreen.classList.add('hidden'); titleSea.stop(); }, 2700);
  hud.fade(false);
  hud.setCrosshair(true);
  game.state = 'PLAY';
  input.requestLock();
  story.beginIntro(); // 运镜期间玩家保持锁定，由 introSeq 释放
});
engine.renderer.domElement.addEventListener('click', () => {
  if (game.state === 'PLAY') input.requestLock();
});

// 暂停菜单
document.getElementById('pause-resume').addEventListener('click', () => togglePause(false));
function togglePause(on) {
  if (on && game.state === 'PLAY') {
    game.state = 'PAUSE';
    hud.setPause(true, story.notesFound.size, NOTES.length);
    input.releaseLock();
  } else if (!on && game.state === 'PAUSE') {
    game.state = 'PLAY';
    hud.setPause(false);
    input.requestLock();
  }
}

// ---------------- 输入处理 ----------------
function handleInput(dt) {
  // Esc：暂停 / 关文书
  if (input.justPressed('Escape')) {
    if (game.state === 'NOTE') game.closeNote();
    else if (game.state === 'PLAY') togglePause(true);
    else if (game.state === 'PAUSE') togglePause(false);
    return;
  }
  if (game.state === 'NOTE') {
    if (input.justPressed('KeyE') || input.justPressed('Enter')) game.closeNote();
    return;
  }
  if (game.state !== 'PLAY' || player.dead || story.flags.ended) return;

  // 开场运镜：任意动作键跳过
  if (story.introSeq) {
    if (['KeyE', 'Space', 'Enter', 'KeyQ'].some((k) => input.justPressed(k))) {
      story.endIntro();
      hud.clearSubtitles(); // 跳过时不让开场旁白拖进正式游玩
      hud.subtitle('（已跳过开场）', 1.5);
    }
    return;
  }
  if (story.caughtSeq || story.tapeSeq) return; // 演出中

  // 视奸
  const sjKey = input.justPressed('KeyQ') || input.justPressed('Tab');
  if (sjKey) {
    if (!sightjack.active) {
      if (!sightjack.enter(viewers)) {
        hud.subtitle('潮声太乱，收不到别人的眼睛。', 2.5);
      } else {
        audio.setSightjack(true);
        hud.setCrosshair(false);
      }
    } else {
      sightjack.cycle();
    }
  }
  // 移动/互动键退出视奸
  if (sightjack.active && !sightjack.forced) {
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE'].some((k) => input.justPressed(k))) {
      sightjack.exit();
      sightjack.restorePost();
      audio.setSightjack(false);
      hud.setCrosshair(true);
    }
    return; // 视奸中不处理互动
  }

  // 反击工具：F 镁光闪 / G 发条闹钟 / V 贝灰线 / R 录音对照
  if (input.justPressed('KeyF')) tools.flash();
  if (input.justPressed('KeyG')) tools.placeClock();
  if (input.justPressed('KeyV')) tools.pourLime();
  if (input.justPressed('KeyR')) tools.playTape();

  // 保险丝板开着：1/2/3 拔插三路分闸
  if (power.panelOpen) {
    if (input.justPressed('Digit1')) power.toggle(0);
    if (input.justPressed('Digit2')) power.toggle(1);
    if (input.justPressed('Digit3')) power.toggle(2);
  }

  // 互动
  const it = story.findInteractable();
  hud.prompt(it ? it.prompt : null);
  if (it && input.justPressed('KeyE')) {
    it.act();
    hud.prompt(null);
  }
}

// ---------------- 灯光预算 ----------------
// 前向渲染下每盏点光源都参与全部片元计算——小镇灯笼+酒店灯箱加起来 40+ 盏会把
// 低端 GPU（尤其 SwiftShader 无头验证）拖到个位数帧。只保留离相机最近的 N 盏可见；
// 数量恒定，three.js 不会反复重编译着色器。
// r20 修复：英雄件 GLB 是异步装配的，它们的实用光/轮廓光在这行代码执行之后
// 才 push 进 world.lights——旧版用扩展运算符快照数组，这些灯永远进不了预算、
// visible 永远是 false（「英雄件读成黑管」的第一元凶）。改成 world.lights
// 长度变化时重建预算数组。
let allPointLights = [];
let lightCountSeen = -1;
function rebuildLightList() {
  allPointLights = [
    ...world.lights,
    ...(world.dynamic.hotelLights ?? []).map((h) => h.pl),
  ];
}
rebuildLightList();
const LIGHT_BUDGET = LOWSPEC ? 10 : 16;
let lightBudgetT = 0;
function updateLightBudget(dt, camPos) {
  lightBudgetT -= dt;
  if (lightBudgetT > 0) return;
  lightBudgetT = 0.3;
  if (world.lights.length !== lightCountSeen) {
    lightCountSeen = world.lights.length;
    rebuildLightList();
  }
  for (const pl of allPointLights) {
    const dx = pl.position.x - camPos.x, dy = pl.position.y - camPos.y, dz = pl.position.z - camPos.z;
    pl._d2 = dx * dx + dy * dy + dz * dz;
  }
  allPointLights.sort((a, b) => a._d2 - b._d2);
  for (let i = 0; i < allPointLights.length; i++) allPointLights[i].visible = i < LIGHT_BUDGET;
}

// ---------------- 主循环 ----------------
const clock = new THREE.Clock();
let elapsed = 0;

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  elapsed += dt;

  handleInput(dt);

  const playing = game.state === 'PLAY' || game.state === 'ENDED';
  if (playing) {
    // 玩家
    player.update(dt);

    // 敌人/实体 AI
    const ctx = {
      player, dt, audio,
      envSightFactor: stealth.envSightFactor * power.playerSightK(), // 断电堂口里的人不容易被看见
      noiseEvents: stealth.noiseEvents,
      vibration: stealth.vibration,      // 上宾循振
      leaked: story.flags.leaked,        // 望潮者转身
      onCaught: (enemy) => {
        story.beginCaught(enemy); // 近身抓住演出 → 引座
      },
      onAlerted: (enemy) => {
        // 呼喊惊动附近同伴（同层）
        for (const e of enemies) {
          if (e === enemy || !e.enabled) continue;
          const d = Math.hypot(e.pos.x - enemy.pos.x, e.pos.z - enemy.pos.z);
          if (d < 26 && Math.abs(e.pos.y - enemy.pos.y) < 2.4) e.hearAlarm(player.pos);
        }
      },
    };
    for (const e of enemies) e.update(ctx);
    dog.update(ctx);
    birds.update(ctx);
    for (const w of watchers) w.update(ctx);
    for (const f of floaters) f.update(ctx);
    gaze.update(ctx);
    guest.update(ctx);

    // 系统
    stealth.update(dt, enemies);
    tools.update(dt);
    power.update(dt);
    agenda.update(dt);
    story.update(dt);
    sightjack.update(dt, elapsed);
    crt.update(dt, player.pos);

    // Blender 英雄件微动画（呼吸/慢转头/祠像的「你看它就不动」）
    heroFigures.update({
      player, dt,
      leaked: story.flags.leaked,
      camera: engine.renderPass.camera,
      state: game.state,
    });

    // 世界
    ocean.update(dt);
    sky.update(dt, player.pos);
    world.updateFx(elapsed);
    rain.update(dt, engine.renderPass.camera, world);
    updateLightBudget(dt, engine.camera.position);

    // 远处无声闪电 + 镁光泡 → 后处理闪光；数秒后隔海传来一声闷雷
    engine.finalPass.uniforms.uFlash.value = sky.flash + tools.flashVal;
    if (sky.thunderQueued) {
      sky.thunderQueued = 0;
      audio.thunderDistant(2.5 + Math.random() * 2);
    }

    // 音频：点名谣从酒店方向飘来；广播站转播实况
    const stageP = world.locations.stageMic;
    // 巨影过顶低鸣（轮15）：幻潮显形后，那条 13m 的影子游到头顶附近时，
    // 一声从胸腔下面顶上来的持续低鸣——26m 内渐起，平方衰减，正过顶=1
    let giantK = 0;
    const LT = world.dynamic.leakState?.applied ? world.dynamic.leakState.tide : null;
    if (LT?.giantPos) {
      const gd = Math.hypot(LT.giantPos.x - player.pos.x, LT.giantPos.z - player.pos.z);
      giantK = Math.max(0, 1 - gd / 26);
      giantK *= giantK;
    }
    audio.update(dt, {
      playerPos: player.pos,
      playerYaw: player.yaw,
      crouching: player.crouching,
      danger: stealth.danger,
      chase: stealth.chaseCount,
      songBase: story.flags.ended ? 0.26 : story.flags.leaked ? 0.09 : elapsed < 60 ? 0.08 : 0.03,
      singer: { x: stageP.x, z: stageP.z, on: agenda.silence <= 0 },
      radio: { x: world.locations.radio.x, z: world.locations.radio.z, on: story.flags.radioOn && agenda.silence <= 0 },
      resonance: stealth.vibrationActive ? stealth.vibration * 0.5 : 0,
      giantK,
    });

    // 视奸心跳复位
    if (!sightjack.active) {
      engine.finalPass.uniforms.uPulse.value *= Math.max(0, 1 - dt * 3);
    }
  }

  // 威胁方向：被谁盯上了，从哪边来
  let threat = null, threatLevel = 0;
  if (!player.dead && (game.state === 'PLAY')) {
    for (const e of enemies) {
      if (!e.enabled || !e.state) continue;
      const lvl = e.state === 'ALERT' ? 1 : e.state === 'SUSPECT' ? 0.4 + (e.suspectMeter ?? 0) * 0.35 : 0;
      if (lvl > threatLevel) { threatLevel = lvl; threat = e; }
    }
    // 上宾的手逼近也算威胁
    if (guest.enabled && guest.nameT > 0.02) {
      threatLevel = Math.max(threatLevel, Math.min(1, guest.nameT * 2.2));
      threat = guest;
    }
  }

  // HUD
  hud.update(dt, {
    danger: player.dead ? 0 : stealth.danger,
    resonance: stealth.vibrationActive && !player.dead ? stealth.vibration : 0,
    crouching: player.crouching && game.state === 'PLAY',
    drown: story.drownView ?? 0,
    noise: player.dead ? 0 : player.noiseLevel / 14,
    threat: threat ? {
      angle: -(Math.atan2(threat.pos.x - player.pos.x, threat.pos.z - player.pos.z) - (player.yaw + Math.PI)),
      level: threatLevel,
    } : null,
  });

  // 人形近距 LOD 视点：跟当前渲染相机走（视奸时换成载体的眼睛）
  engine.renderPass.camera.getWorldPosition(Humanoid.viewer);

  engine.render(elapsed);
  input.endFrame();
}
loop();

// 供无头验证注入（THREE：取证脚本射线定凶/几何巡检用）
window.__game = {
  engine, player, world, ocean, sky, input, enemies, byId, dog, birds, watchers,
  floaters, gaze, guest, crt, agenda, M, THREE, heroFigures,
  sightjack, stealth, tools, power, story, hud, audio, game,
};
