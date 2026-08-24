import { Enemy } from "./enemy";
import { LevelData } from "./level";
import { Player } from "./player";
import { TILE, Vec2 } from "./types";

const FLASHLIGHT_RANGE = 220;
const FLASHLIGHT_HALF_ANGLE = Math.PI / 5;
const AMBIENT_RADIUS = 46;
const DARKNESS = 0.985;

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private light: HTMLCanvasElement;
  private lctx: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;

  constructor(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    this.width = canvas.width;
    this.height = canvas.height;
    this.light = document.createElement("canvas");
    this.light.width = canvas.width;
    this.light.height = canvas.height;
    this.lctx = this.light.getContext("2d")!;
  }

  render(level: LevelData, player: Player, enemy: Enemy, keyTaken: boolean): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    this.drawFloorAndWalls(level);
    if (!keyTaken) this.drawKey(level.keyPos);
    this.drawExit(level.exitPos, player.hasKey);
    this.drawEnemyBody(enemy);
    this.drawPlayer(player);

    this.applyDarkness(player);
    this.drawEnemyGaze(enemy);
  }

  private drawFloorAndWalls(level: LevelData): void {
    const ctx = this.ctx;
    for (let r = 0; r < level.rows; r++) {
      for (let c = 0; c < level.cols; c++) {
        const x = c * TILE;
        const y = r * TILE;
        if (level.grid[r][c] === 1) {
          ctx.fillStyle = "#20232e";
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = "#2b2f3d";
          ctx.fillRect(x, y, TILE, 3);
          ctx.strokeStyle = "#12141c";
          ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
        } else {
          ctx.fillStyle = (c + r) % 2 === 0 ? "#0c0e14" : "#0a0c11";
          ctx.fillRect(x, y, TILE, TILE);
        }
      }
    }
  }

  private drawKey(pos: Vec2): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.fillStyle = "#f2c14e";
    ctx.shadowColor = "#f2c14e";
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(-3, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(1, -2, 10, 4);
    ctx.fillRect(8, -2, 3, 7);
    ctx.restore();
  }

  private drawExit(pos: Vec2, unlocked: boolean): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.fillStyle = unlocked ? "#4ea3f2" : "#33404f";
    if (unlocked) {
      ctx.shadowColor = "#4ea3f2";
      ctx.shadowBlur = 20;
    }
    ctx.fillRect(-11, -13, 22, 26);
    ctx.fillStyle = unlocked ? "#0a2438" : "#20272f";
    ctx.fillRect(-7, -9, 14, 18);
    ctx.restore();
  }

  private drawEnemyBody(enemy: Enemy): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(enemy.pos.x, enemy.pos.y);
    ctx.fillStyle = "#b8b2a6";
    ctx.beginPath();
    ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#7a1c14";
    ctx.beginPath();
    ctx.arc(enemy.facing.x * 4, enemy.facing.y * 4, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawPlayer(player: Player): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(player.pos.x, player.pos.y);
    ctx.fillStyle = player.sneaking ? "#5b7fa6" : "#7fb0e0";
    ctx.beginPath();
    ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e8f0fb";
    ctx.beginPath();
    ctx.arc(player.facing.x * 4, player.facing.y * 4, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private applyDarkness(player: Player): void {
    const lctx = this.lctx;
    lctx.globalCompositeOperation = "source-over";
    lctx.fillStyle = `rgba(2,3,6,${DARKNESS})`;
    lctx.clearRect(0, 0, this.width, this.height);
    lctx.fillRect(0, 0, this.width, this.height);

    lctx.globalCompositeOperation = "destination-out";

    // Ambient glow immediately around the player.
    const amb = lctx.createRadialGradient(
      player.pos.x,
      player.pos.y,
      0,
      player.pos.x,
      player.pos.y,
      AMBIENT_RADIUS,
    );
    amb.addColorStop(0, "rgba(0,0,0,1)");
    amb.addColorStop(1, "rgba(0,0,0,0)");
    lctx.fillStyle = amb;
    lctx.beginPath();
    lctx.arc(player.pos.x, player.pos.y, AMBIENT_RADIUS, 0, Math.PI * 2);
    lctx.fill();

    // Directional flashlight cone.
    this.carveCone(
      lctx,
      player.pos,
      player.facing,
      FLASHLIGHT_RANGE,
      FLASHLIGHT_HALF_ANGLE,
    );

    lctx.globalCompositeOperation = "source-over";
    this.ctx.drawImage(this.light, 0, 0);
  }

  private carveCone(
    lctx: CanvasRenderingContext2D,
    origin: Vec2,
    facing: Vec2,
    range: number,
    halfAngle: number,
  ): void {
    const baseAngle = Math.atan2(facing.y, facing.x);
    const grad = lctx.createRadialGradient(
      origin.x,
      origin.y,
      0,
      origin.x,
      origin.y,
      range,
    );
    grad.addColorStop(0, "rgba(0,0,0,1)");
    grad.addColorStop(0.7, "rgba(0,0,0,0.85)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    lctx.fillStyle = grad;
    lctx.beginPath();
    lctx.moveTo(origin.x, origin.y);
    lctx.arc(origin.x, origin.y, range, baseAngle - halfAngle, baseAngle + halfAngle);
    lctx.closePath();
    lctx.fill();
  }

  /** Emissive red gaze that glows through the darkness to telegraph danger. */
  private drawEnemyGaze(enemy: Enemy): void {
    const ctx = this.ctx;
    const baseAngle = Math.atan2(enemy.facing.y, enemy.facing.x);
    const range = enemy.visionRange;
    const half = enemy.visionHalfAngle;
    const alpha = enemy.mode === "chase" ? 0.32 : 0.16;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const grad = ctx.createRadialGradient(
      enemy.pos.x,
      enemy.pos.y,
      0,
      enemy.pos.x,
      enemy.pos.y,
      range,
    );
    grad.addColorStop(0, `rgba(200,40,30,${alpha})`);
    grad.addColorStop(1, "rgba(120,10,10,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(enemy.pos.x, enemy.pos.y);
    ctx.arc(enemy.pos.x, enemy.pos.y, range, baseAngle - half, baseAngle + half);
    ctx.closePath();
    ctx.fill();

    // Glowing eye so the shibito is faintly visible in the dark.
    ctx.shadowColor = "#ff3b2f";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#ff4a3d";
    ctx.beginPath();
    ctx.arc(enemy.pos.x, enemy.pos.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
