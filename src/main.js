// 入口：引导游戏（临时冒烟测试版，验证渲染管线+世界+玩家控制器）
import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { Input } from './core/input.js';
import { buildMaterials } from './world/materials.js';
import { buildVillage } from './world/village.js';
import { Ocean } from './world/water.js';
import { Sky } from './world/sky.js';
import { Player } from './entities/player.js';

const app = document.getElementById('app');
const engine = new Engine(app);
const input = new Input(engine.renderer.domElement);

const M = buildMaterials();
const world = buildVillage(engine.scene, M);
const ocean = new Ocean(engine.scene, M.textures);
const sky = new Sky(engine.scene);
world.waterLevelRef = { value: 0 };
world.waterLevel = function () { return ocean.level; };

const player = new Player(engine.camera, input, world, null);
player.setPosition(world.locations.spawn.x, world.locations.spawn.z, world.locations.spawn.yaw);

// 标题画面 → 开始
const titleScreen = document.getElementById('title-screen');
document.getElementById('title-start').addEventListener('click', () => {
  titleScreen.classList.add('fading');
  setTimeout(() => titleScreen.classList.add('hidden'), 2300);
  document.getElementById('fader').style.opacity = '0';
  input.requestLock();
});
engine.renderer.domElement.addEventListener('click', () => input.requestLock());

// 主循环
const clock = new THREE.Clock();
let elapsed = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  elapsed += dt;
  player.update(dt);
  ocean.update(dt);
  sky.update(dt, player.pos);
  engine.render(elapsed);
  input.endFrame();
}
loop();

// 供无头测试注入
window.__game = { engine, player, world, ocean, sky, input };
