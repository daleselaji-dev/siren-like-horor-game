// 《咸潮》入口：装配引擎/世界/角色/AI/视奸/叙事/音频/HUD，驱动主循环
import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { Input } from './core/input.js';
import { AudioEngine } from './core/audio.js';
import { buildMaterials } from './world/materials.js';
import { buildVillage } from './world/village.js';
import { Ocean } from './world/water.js';
import { Sky } from './world/sky.js';
import { Player } from './entities/player.js';
import { Enemy, Dog, BirdFlock, Watcher } from './entities/enemy.js';
import { SightjackSystem } from './systems/sightjack.js';
import { StealthSystem } from './systems/stealth.js';
import { Story, NOTES } from './systems/story.js';
import { HUD } from './ui/hud.js';
import { TitleSea } from './ui/title.js';

// ---------------- 装配 ----------------
// ?lowspec=1 → 低画质模式（无头验证 / 低配机器）：关阴影与 Bloom、降分辨率
const LOWSPEC = new URLSearchParams(location.search).has('lowspec');
const app = document.getElementById('app');
const engine = new Engine(app, { lowspec: LOWSPEC });
const input = new Input(engine.renderer.domElement);
const audio = new AudioEngine();
const hud = new HUD();

const M = buildMaterials(LOWSPEC);
const world = buildVillage(engine.scene, M);
const ocean = new Ocean(engine.scene, M.textures, world);
const sky = new Sky(engine.scene);
world.waterLevel = () => ocean.level;

const player = new Player(engine.camera, input, world, audio);
player.setPosition(world.locations.spawn.x, world.locations.spawn.z, world.locations.spawn.yaw);
player.frozen = true; // 标题画面锁定

// ---------------- 敌人编制 ----------------
const P = world.patrols;
const enemyDefs = [
  {
    id: 'netMender', label: '补网的人', kind: 'worker',
    workPos: P.netMenderWork, workMode: 'work_net', workYaw: 2.6,
    cloth: 'navy', hat: true, fov: 80, sightRange: 15, hearRange: 12,
    waypoints: [[12, 47], [4, 56], [18, 60], [26, 50]],
  },
  {
    id: 'saltWorker', label: '晒盐的人', kind: 'worker',
    workPos: P.saltWorkerWork, workMode: 'work_rake', workYaw: -0.6,
    cloth: 'grey', hat: true, tool: 'rake', fov: 85, sightRange: 16, hearRange: 13,
    waypoints: [[-44, 4], [-30, 12], [-24, -4], [-40, -8]],
  },
  {
    id: 'dikePatrol', label: '巡堤的人', kind: 'patrol',
    waypoints: P.dike, lantern: true, lanternLight: true,
    cloth: 'navy', fov: 88, sightRange: 18, hearRange: 15, walkSpeed: 1.0,
  },
  {
    id: 'villagePatrol1', label: '提灯的祭仆', kind: 'patrol',
    waypoints: P.village1, lantern: true, lanternLight: true,
    cloth: 'grey', fov: 92, sightRange: 18, hearRange: 15,
  },
  {
    id: 'villagePatrol2', label: '挑水的人', kind: 'patrol',
    waypoints: P.village2, hat: true,
    cloth: 'navy', fov: 84, sightRange: 16, hearRange: 14,
  },
  {
    id: 'templeGuard', label: '守殿的人', kind: 'patrol',
    waypoints: P.templeGuard, lantern: true, lanternLight: true,
    cloth: 'grey', fov: 90, sightRange: 17, hearRange: 15,
  },
  {
    // 祭师对玩家全盲全聋——他的眼睛只看得见他没做完的祭（安全的视奸对象）
    id: 'priest', label: '祭师 闫守潮', kind: 'worker',
    workPos: P.priestWork, workMode: 'work_pray', workYaw: Math.PI / 2,
    cloth: 'grey', fov: 1, sightRange: 0, hearRange: 0,
  },
  {
    id: 'singer', label: '唱歌的人', kind: 'singer',
    waypoints: P.singer, cloth: 'red', enabled: false,
  },
  {
    id: 'warden', label: '守塔的人', kind: 'patrol',
    waypoints: P.wardenPost, lantern: true, lanternLight: true,
    cloth: 'navy', fov: 90, sightRange: 17, hearRange: 15, enabled: false,
  },
];

const enemies = enemyDefs.map((d) => new Enemy(engine.scene, world, M, d));
const dog = new Dog(engine.scene, world, M, { id: 'dog', label: '村犬', waypoints: P.dogWander });
const birds = new BirdFlock(engine.scene, world, { id: 'birds', label: '海鸟群', center: [0, 0], radius: 46, height: 34 });
// 望海者：站在滩涂尽头的水里，面向海。血潮之后他们会转过身来。
const watchers = [
  new Watcher(engine.scene, world, M, { id: 'watcher1', x: 104, z: 131, yaw: 0.75, seed: 1101, cloth: 'grey' }),
  new Watcher(engine.scene, world, M, { id: 'watcher2', x: 42, z: 125, yaw: 0.2, seed: 2202, cloth: 'navy' }),
  new Watcher(engine.scene, world, M, { id: 'watcher3', x: 103, z: -95, yaw: 1.5, seed: 3303, cloth: 'grey' }),
];
const viewers = [...enemies, dog, birds, ...watchers]; // 视奸信道
const byId = {};
for (const e of enemies) byId[e.id] = e;

// ---------------- 系统 ----------------
const sightjack = new SightjackSystem(engine, player, audio);
const stealth = new StealthSystem(world, player);

const game = {
  scene: engine.scene, engine, world, player, hud, audio,
  enemies, byId, viewers, watchers, sightjack, stealth, ocean, sky, M,
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

// ---------------- 标题 → 开始 ----------------
const titleScreen = document.getElementById('title-screen');
const titleSea = new TitleSea(document.getElementById('title-sea'));
titleSea.start();
requestAnimationFrame(() => titleScreen.classList.add('ready')); // 触发字幕显现动画
document.getElementById('title-start').addEventListener('click', () => {
  if (game.state !== 'TITLE') return;
  audio.init();
  audio.update(0, { playerPos: player.pos, danger: 0, chase: 0, songBase: 0.14 });
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
  if (story.caughtSeq) return; // 被抓演出中

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
let reedRustleT = 0; // 苇丛沙沙声节流

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  elapsed += dt;

  handleInput(dt);

  const playing = game.state === 'PLAY' || game.state === 'ENDED';
  if (playing) {
    // 玩家
    player.update(dt);

    // 敌人 AI
    const ctx = {
      player, dt, audio,
      // 芦苇隐蔽直接折进环境视觉系数：蹲满时敌人视距缩到约 1/3
      envSightFactor: stealth.envSightFactor * (1 - stealth.concealment * 0.65),
      noiseEvents: [...stealth.noiseEvents, ...(player.noiseLevel > 0 ? [] : [])],
      onCaught: (enemy) => {
        story.beginCaught(enemy); // 近身抓住演出 → 溺毙
      },
      onAlerted: (enemy) => {
        // 呼喊惊动附近同伴
        for (const e of enemies) {
          if (e === enemy || !e.enabled) continue;
          const d = Math.hypot(e.pos.x - enemy.pos.x, e.pos.z - enemy.pos.z);
          if (d < 26) e.hearAlarm(player.pos);
        }
      },
    };
    for (const e of enemies) e.update(ctx);
    dog.update(ctx);
    birds.update(ctx);
    ctx.bloodTide = story.flags.bloodTide;
    for (const w of watchers) w.update(ctx);

    // 系统
    stealth.update(dt, enemies, byId.singer);
    story.update(dt);
    sightjack.update(dt, elapsed);

    // 世界
    ocean.update(dt);
    sky.update(dt, player.pos);
    world.updateFx(elapsed);

    // 远处无声闪电 → 后处理闪光；数秒后隔海传来一声闷雷
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
      songBase: story.flags.ended ? 0.4 : story.flags.bloodTide ? 0.1 : elapsed < 60 ? 0.1 : 0.03,
      singer: { x: byId.singer.pos.x, z: byId.singer.pos.z, on: byId.singer.enabled },
      radio: { x: world.locations.radio.x, z: world.locations.radio.z, on: story.flags.radioOn },
      resonance: stealth.resonance,
    });

    // 血潮后画面常驻轻微偏红
    if (story.flags.bloodTide && !player.dead && !story.deathSeq) {
      const target = 0.12 + stealth.resonance * 0.25;
      const u = engine.finalPass.uniforms.uRedShift;
      u.value += (target - u.value) * Math.min(1, dt * 2);
    }
    // 镜头水痕：血潮的浪雾扑上镜片没人擦；涉水/溺水时拉满
    {
      const uw = engine.finalPass.uniforms.uWet;
      const target = Math.max(story.drownView ?? 0, story.flags.bloodTide ? 0.45 : 0);
      uw.value += (target - uw.value) * Math.min(1, dt * (target > uw.value ? 2.5 : 0.35));
    }
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
  }

  // 苇丛隐蔽教学（一次性）
  if (game.state === 'PLAY' && !story.introSeq && stealth.inReeds > 0.5 && !game._reedTip) {
    game._reedTip = true;
    hud.subtitle('苇丛能藏人。蹲下去，别动。', 3.5);
  }
  // 苇丛沙沙：走动时苇秆擦过身体（也会把自己吓一跳）
  if (game.state === 'PLAY' && stealth.inReeds > 0.35 && player.moveAmt > 0.2) {
    reedRustleT -= dt * (0.6 + player.moveAmt);
    if (reedRustleT <= 0) {
      reedRustleT = 0.5 + Math.random() * 0.5;
      audio.reedRustle?.(player.crouching ? 0.5 : 1);
    }
  }

  // HUD
  hud.update(dt, {
    danger: player.dead ? 0 : stealth.danger,
    resonance: stealth.resonance,
    crouching: player.crouching && game.state === 'PLAY',
    conceal: stealth.concealment,
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
  engine, player, world, ocean, sky, input, enemies, byId, dog, birds, watchers,
  sightjack, stealth, story, hud, audio, game,
};
