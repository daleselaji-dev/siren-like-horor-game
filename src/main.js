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
import { Enemy, Dog, BirdFlock } from './entities/enemy.js';
import { SightjackSystem } from './systems/sightjack.js';
import { StealthSystem } from './systems/stealth.js';
import { Story, NOTES } from './systems/story.js';
import { HUD } from './ui/hud.js';

// ---------------- 装配 ----------------
// ?lowspec=1 → 低画质模式（无头验证 / 低配机器）：关阴影与 Bloom、降分辨率
const LOWSPEC = new URLSearchParams(location.search).has('lowspec');
const app = document.getElementById('app');
const engine = new Engine(app, { lowspec: LOWSPEC });
const input = new Input(engine.renderer.domElement);
const audio = new AudioEngine();
const hud = new HUD();

const M = buildMaterials();
const world = buildVillage(engine.scene, M);
const ocean = new Ocean(engine.scene, M.textures);
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
const viewers = [...enemies, dog, birds]; // 视奸信道
const byId = {};
for (const e of enemies) byId[e.id] = e;

// ---------------- 系统 ----------------
const sightjack = new SightjackSystem(engine, player, audio);
const stealth = new StealthSystem(world, player);

const game = {
  scene: engine.scene, engine, world, player, hud, audio,
  enemies, byId, viewers, sightjack, stealth, ocean, sky, M,
  state: 'TITLE', // TITLE | PLAY | NOTE | PAUSE | ENDED
  openNote(note) {
    hud.showNote(note);
    game.state = 'NOTE';
    player.frozen = true;
  },
  closeNote() {
    hud.hideNote();
    game.state = 'PLAY';
    if (!player.dead && !story.flags.ended) player.frozen = false;
  },
  onEnded() { game.state = 'ENDED'; },
};
const story = new Story(game);
game.story = story;

// ---------------- 标题 → 开始 ----------------
const titleScreen = document.getElementById('title-screen');
document.getElementById('title-start').addEventListener('click', () => {
  if (game.state !== 'TITLE') return;
  audio.init();
  audio.update(0, { playerPos: player.pos, danger: 0, chase: 0, songBase: 0.14 });
  titleScreen.classList.add('fading');
  setTimeout(() => titleScreen.classList.add('hidden'), 2300);
  hud.fade(false);
  hud.setCrosshair(true);
  game.state = 'PLAY';
  player.frozen = false;
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
      envSightFactor: stealth.envSightFactor,
      noiseEvents: [...stealth.noiseEvents, ...(player.noiseLevel > 0 ? [] : [])],
      onCaught: (enemy) => {
        story.kill('溺', `${enemy.label}把你按进了水里。—— 回到检查点`);
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

    // 系统
    stealth.update(dt, enemies, byId.singer);
    story.update(dt);
    sightjack.update(dt, elapsed);

    // 世界
    ocean.update(dt);
    sky.update(dt, player.pos);
    world.updateFx(elapsed);

    // 音频
    audio.update(dt, {
      playerPos: player.pos,
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
    // 视奸心跳复位
    if (!sightjack.active) {
      engine.finalPass.uniforms.uPulse.value *= Math.max(0, 1 - dt * 3);
    }
  }

  // HUD
  hud.update(dt, {
    danger: player.dead ? 0 : stealth.danger,
    resonance: stealth.resonance,
    crouching: player.crouching && game.state === 'PLAY',
    drown: story.drownView ?? 0,
  });

  engine.render(elapsed);
  input.endFrame();
}
loop();

// 供无头验证注入
window.__game = {
  engine, player, world, ocean, sky, input, enemies, byId, dog, birds,
  sightjack, stealth, story, hud, audio, game,
};
