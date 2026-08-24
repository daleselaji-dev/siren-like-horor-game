import { Enemy } from "./enemy";
import { Input } from "./input";
import { loadLevel, LevelData } from "./level";
import { Player } from "./player";
import { Renderer } from "./renderer";
import { dist, GameState } from "./types";

const KEY_PICKUP_DIST = 22;
const EXIT_DIST = 22;

export class Game {
  private renderer: Renderer;
  private input: Input;
  private hud: HTMLElement;

  private level!: LevelData;
  private player!: Player;
  private enemy!: Enemy;
  private state: GameState = "playing";
  private keyTaken = false;
  private elapsed = 0;
  private lastTime = 0;
  private rafId = 0;

  constructor(canvas: HTMLCanvasElement, hud: HTMLElement) {
    this.renderer = new Renderer(canvas);
    this.hud = hud;
    this.input = new Input(() => this.reset());
    this.reset();
  }

  private reset(): void {
    this.level = loadLevel();
    this.player = new Player(this.level.playerSpawn);
    this.enemy = new Enemy(this.level.enemySpawn, this.level.patrol);
    this.state = "playing";
    this.keyTaken = false;
    this.elapsed = 0;
  }

  start(): void {
    this.lastTime = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - this.lastTime) / 1000);
      this.lastTime = now;
      this.update(dt);
      this.renderer.render(this.level, this.player, this.enemy, this.keyTaken);
      this.updateHud();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private update(dt: number): void {
    if (this.state === "dead" || this.state === "won") return;
    this.elapsed += dt;

    this.player.update(dt, this.input, this.level);

    if (!this.keyTaken && dist(this.player.pos, this.level.keyPos) < KEY_PICKUP_DIST) {
      this.keyTaken = true;
      this.player.hasKey = true;
    }

    if (
      this.player.hasKey &&
      dist(this.player.pos, this.level.exitPos) < EXIT_DIST
    ) {
      this.state = "won";
      return;
    }

    const caught = this.enemy.update(dt, this.level, this.player);
    if (caught) {
      this.state = "dead";
      return;
    }

    this.state = this.enemy.mode === "chase" ? "hunted" : "playing";
  }

  private updateHud(): void {
    let statusClass = "safe";
    let statusText = "Hidden";
    if (this.state === "hunted") {
      statusClass = "hunted";
      statusText = "HUNTED";
    } else if (this.state === "dead") {
      statusClass = "dead";
      statusText = "YOU DIED";
    } else if (this.state === "won") {
      statusClass = "won";
      statusText = "YOU ESCAPED";
    }

    const objective = this.player.hasKey
      ? "Key acquired — reach the glowing exit."
      : "Find the key hidden in the dark.";

    const time = this.elapsed.toFixed(1);
    const detectMeter = Math.round(
      (this.enemy.mode === "chase" ? 1 : this.enemy.mode === "search" ? 0.5 : 0.12) *
        100,
    );

    let footer = `Time survived: <strong>${time}s</strong>`;
    if (this.state === "dead") {
      footer = "The Shibito found you. Press <kbd>R</kbd> to try again.";
    } else if (this.state === "won") {
      footer = `You escaped in <strong>${time}s</strong>! Press <kbd>R</kbd> to replay.`;
    }

    this.hud.innerHTML = `
      <h3>Status</h3>
      <div class="status ${statusClass}">${statusText}</div>
      <div class="objective">${objective}</div>
      <div class="meter" title="How aware the Shibito is"><span style="width:${detectMeter}%"></span></div>
      <div class="objective" style="margin-top:12px">${footer}</div>
    `;
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.input.dispose();
  }
}
