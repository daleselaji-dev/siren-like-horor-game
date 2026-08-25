// 《返潮 FANCHAO》M01 入口：装配引擎/酒店/员工/F01/听潮/叙事/音频/HUD，驱动主循环
import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { Input } from './core/input.js';
import { AudioEngine } from './core/audio.js';
import { buildMaterials } from './world/materials.js';
import { buildHotel } from './world/hotel.js';
import { Sky } from './world/sky.js';
import { Player } from './entities/player.js';
import { Staff, F01, SecurityCamera } from './entities/enemy.js';
import { SightjackSystem } from './systems/sightjack.js';
import { StealthSystem } from './systems/stealth.js';
import { Story, NOTES } from './systems/story.js';
import { HUD } from './ui/hud.js';
import { TitleSea } from './ui/title.js';

// ---------------- 装配 ----------------
// ?lowspec=1 → 低画质模式（无头验证 / 低配机器）
const LOWSPEC = new URLSearchParams(location.search).has('lowspec');
const app = document.getElementById('app');
const engine = new Engine(app, { lowspec: LOWSPEC });
const input = new Input(engine.renderer.domElement);
const audio = new AudioEngine();
const hud = new HUD();

const M = buildMaterials(LOWSPEC);
const world = buildHotel(engine.scene, M);
const sky = new Sky(engine.scene);

const player = new Player(engine.camera, input, world, audio);
player.setPosition(world.locations.spawn.x, world.locations.spawn.z, world.locations.spawn.yaw);
player.frozen = true; // 标题画面锁定

// ---------------- 员工与 F01 ----------------
const P = world.patrols;
const staff = [
  new Staff(engine.scene, world, M, {
    id: 'cleaner', label: '前厅 · 苏凤英', kind: 'worker',
    role: 'cleaner', tool: 'mop', hair: 'bun',
    workPos: P.cleanerWork, workMode: 'work_mop', workYaw: 0.8,
    waypoints: P.cleaner, fov: 78, sightRange: 12, hearRange: 10,
  }),
  new Staff(engine.scene, world, M, {
    id: 'guard', label: '保卫 · 秦国栋', kind: 'patrol',
    role: 'guard', tool: 'flashlight', flashlightOn: !LOWSPEC,
    waypoints: P.guard, fov: 86, sightRange: 15, hearRange: 13, walkSpeed: 0.9,
  }),
  new Staff(engine.scene, world, M, {
    id: 'chef', label: '后厨 · 黄有德', kind: 'worker',
    role: 'kitchen', tool: 'cleaver',
    workPos: P.kitchenWork, workMode: 'work_chop', workYaw: Math.PI,
    waypoints: [[8, -24], [12, -26], [6, -29]], fov: 72, sightRange: 10, hearRange: 11,
  }),
];
const f01 = new F01(engine.scene, world, M, {
  id: 'f01', label: '维修 · 王承海', kind: 'worker',
  workPos: P.f01Work, workMode: 'work_wipe', workYaw: -1.2,
  waypoints: P.f01,
});
const enemies = [...staff, f01];

// 监控摄像头（听潮载体）
const cameras = [
  new SecurityCamera(engine.scene, world, M, {
    id: 'camLobby', label: '监控 · 大堂', x: 10.4, y: 3.6, z: 1.2,
    yaw: -2.2, pitch: -0.4, panRange: 0.45, panSpeed: 0.1,
  }),
  new SecurityCamera(engine.scene, world, M, {
    id: 'camCorridor', label: '监控 · 走廊', x: 1.6, y: 2.5, z: -16.6,
    yaw: Math.PI, pitch: -0.22, panRange: 0.16, panSpeed: 0.07,
  }),
];
const viewers = [...enemies, ...cameras]; // 听潮信道
const byId = {};
for (const e of [...enemies, ...cameras]) byId[e.id] = e;

// ---------------- 系统 ----------------
const sightjack = new SightjackSystem(engine, player, audio);
const stealth = new StealthSystem(world, player);

const game = {
  scene: engine.scene, engine, world, player, hud, audio,
  enemies, byId, viewers, cameras, sightjack, stealth, sky, M,
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
const story = new Story(game);
game.story = story;

// F01 的 6m/2m 读取（Canon：先读出人，再读出井）
f01.onSixMeter = () => {
  if (story.flags.chase || player.dead) return;
  hud.subtitle('一个中年人。灰蓝工装，暗红领子，头发往一边梳。', 4);
  hud.subtitle('他往你这边侧了侧耳朵——在你看清他之前，他就知道你在哪。', 4.4);
  audio.suspect(5);
};
f01.onTwoMeter = () => {
  if (story.flags.chase || player.dead) return;
  hud.subtitle('【深度尺】表面 0.4m —— 内部 3.8m。', 3.6);
  hud.subtitle('读数是对的。他里面比外面大。', 3.6);
  audio.wrong();
};

// ---------------- 标题 → 开始 ----------------
const titleScreen = document.getElementById('title-screen');
const titleSea = new TitleSea(document.getElementById('title-sea'));
titleSea.start();
requestAnimationFrame(() => titleScreen.classList.add('ready'));
document.getElementById('title-start').addEventListener('click', () => {
  if (game.state !== 'TITLE') return;
  audio.init();
  audio.update(0, { playerPos: player.pos, danger: 0, chase: 0, songBase: 0 });
  titleScreen.classList.add('fading');
  setTimeout(() => { titleScreen.classList.add('hidden'); titleSea.stop(); }, 2700);
  hud.fade(false);
  hud.setCrosshair(true);
  game.state = 'PLAY';
  input.requestLock();
  story.beginIntro();
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
      hud.clearSubtitles();
      hud.subtitle('（已跳过开场）', 1.5);
    }
    return;
  }
  if (story.caughtSeq) return;

  // 听潮
  const sjKey = input.justPressed('KeyQ') || input.justPressed('Tab');
  if (sjKey) {
    if (!sightjack.active) {
      if (!sightjack.enter(viewers)) {
        hud.subtitle('附近收不到别人的眼睛。', 2.5);
      } else {
        audio.setSightjack(true);
        hud.setCrosshair(false);
      }
    } else {
      sightjack.cycle();
    }
  }
  // 移动/互动键退出听潮
  if (sightjack.active && !sightjack.forced) {
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE'].some((k) => input.justPressed(k))) {
      sightjack.exit();
      sightjack.restorePost();
      audio.setSightjack(false);
      hud.setCrosshair(true);
    }
    return;
  }

  // 互动
  const it = story.findInteractable();
  hud.prompt(it ? it.prompt : null);
  if (it && input.justPressed('KeyE')) {
    it.act();
    hud.prompt(null);
  }
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
    player.update(dt);

    // AI
    const ctx = {
      player, dt, audio,
      envSightFactor: stealth.envSightFactor,
      noiseEvents: stealth.noiseEvents,
      onCaught: (enemy) => story.beginCaught(enemy),
      onAlerted: (enemy) => {
        for (const e of enemies) {
          if (e === enemy || !e.enabled) continue;
          const d = Math.hypot(e.pos.x - enemy.pos.x, e.pos.z - enemy.pos.z);
          if (d < 22) e.hearAlarm(player.pos);
        }
      },
    };
    for (const e of enemies) {
      if (!e.scripted) e.update(ctx);
    }
    for (const c of cameras) c.update(ctx);

    // 系统
    stealth.update(dt, enemies, sightjack);
    story.update(dt);
    sightjack.update(dt, elapsed);

    // 世界与天穹
    sky.update(dt, player.pos);
    world.updateFx(elapsed);

    // 远海无声闪电 → 后处理闪光；数秒后传来一声闷雷
    engine.finalPass.uniforms.uFlash.value = sky.flash;
    if (sky.thunderQueued) {
      sky.thunderQueued = 0;
      audio.thunderDistant(2.5 + Math.random() * 2);
    }

    // 音频
    audio.update(dt, {
      playerPos: player.pos,
      playerYaw: player.yaw,
      crouching: player.crouching,
      danger: stealth.danger,
      chase: stealth.chaseCount,
      songBase: 0,
      singer: { x: 0, z: 0, on: false },
      radio: { x: 13.5, z: -7, on: false },
      resonance: stealth.resonance,
    });

    // 听潮心跳复位
    if (!sightjack.active) {
      engine.finalPass.uniforms.uPulse.value *= Math.max(0, 1 - dt * 3);
    }
    // 追逐时的空间压迫：轻微畸变
    if (story.flags.chase && !sightjack.active && !story.caughtSeq) {
      const u = engine.finalPass.uniforms.uDistort;
      u.value += (0.08 - u.value) * Math.min(1, dt * 2);
    }
  }

  // 威胁方向
  let threat = null, threatLevel = 0;
  if (!player.dead && game.state === 'PLAY') {
    for (const e of enemies) {
      if (!e.enabled || !e.state) continue;
      const lvl = e.state === 'ALERT' ? 1 : e.state === 'SUSPECT' ? 0.4 + (e.suspectMeter ?? 0) * 0.35 : 0;
      if (lvl > threatLevel) { threatLevel = lvl; threat = e; }
    }
  }

  // HUD
  hud.update(dt, {
    danger: player.dead ? 0 : stealth.danger,
    resonance: stealth.resonance,
    crouching: player.crouching && game.state === 'PLAY',
    drown: story.drownView ?? 0,
    noise: player.dead ? 0 : player.noiseLevel / 14,
    threat: threat ? {
      angle: -(Math.atan2(threat.pos.x - player.pos.x, threat.pos.z - player.pos.z) - (player.yaw + Math.PI)),
      level: threatLevel,
    } : null,
  });

  engine.render(elapsed);
  input.endFrame();
}
loop();

// 供无头验证注入
window.__game = {
  engine, player, world, sky, input, enemies, byId, cameras, f01,
  sightjack, stealth, story, hud, audio, game,
};
