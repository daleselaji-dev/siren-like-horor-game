import { lineBlocked, LevelData } from "./level";
import { nextStep } from "./pathfind";
import { Player } from "./player";
import { dist, normalize, Vec2 } from "./types";

const PATROL_SPEED = 55;
const CHASE_SPEED = 108;
const VISION_RANGE = 260;
const VISION_HALF_ANGLE = Math.PI / 4; // 45 deg to each side -> 90 deg cone
const HEAR_RANGE = 150;
const CATCH_DIST = 18;
const LOSE_SIGHT_TIME = 2.5; // seconds of no sight before giving up

export type EnemyMode = "patrol" | "chase" | "search";

export class Enemy {
  pos: Vec2;
  facing: Vec2 = { x: 1, y: 0 };
  mode: EnemyMode = "patrol";
  radius = 12;

  private patrol: Vec2[];
  private patrolIndex = 0;
  private lastKnown: Vec2 | null = null;
  private lostTimer = 0;

  constructor(spawn: Vec2, patrol: Vec2[]) {
    this.pos = { x: spawn.x, y: spawn.y };
    this.patrol = patrol.length > 0 ? patrol : [spawn];
  }

  /** Returns true if the player is caught this frame. */
  update(dt: number, level: LevelData, player: Player): boolean {
    const canSee = this.canSee(level, player);
    const canHear =
      player.noise > 0.5 && dist(this.pos, player.pos) < HEAR_RANGE;

    if (canSee) {
      this.mode = "chase";
      this.lastKnown = { ...player.pos };
      this.lostTimer = 0;
    } else if (this.mode === "chase") {
      this.lostTimer += dt;
      if (canHear) this.lastKnown = { ...player.pos };
      if (this.lostTimer >= LOSE_SIGHT_TIME) {
        this.mode = "search";
      }
    } else if (canHear) {
      this.mode = "chase";
      this.lastKnown = { ...player.pos };
      this.lostTimer = 0;
    }

    if (this.mode === "chase" || this.mode === "search") {
      this.pursue(dt, level);
    } else {
      this.doPatrol(dt, level);
    }

    return dist(this.pos, player.pos) < CATCH_DIST + player.radius;
  }

  private pursue(dt: number, level: LevelData): void {
    const target = this.lastKnown;
    if (!target) {
      this.mode = "patrol";
      return;
    }
    if (dist(this.pos, target) < 6) {
      // Reached last known position without re-acquiring: resume patrol.
      this.mode = "patrol";
      this.lastKnown = null;
      return;
    }
    this.moveToward(dt, level, target, CHASE_SPEED);
  }

  private doPatrol(dt: number, level: LevelData): void {
    const target = this.patrol[this.patrolIndex];
    if (dist(this.pos, target) < 8) {
      this.patrolIndex = (this.patrolIndex + 1) % this.patrol.length;
    }
    this.moveToward(dt, level, target, PATROL_SPEED);
  }

  private moveToward(
    dt: number,
    level: LevelData,
    target: Vec2,
    speed: number,
  ): void {
    const step = nextStep(level, this.pos, target);
    if (!step) return;
    const dir = normalize({ x: step.x - this.pos.x, y: step.y - this.pos.y });
    if (dir.x !== 0 || dir.y !== 0) this.facing = dir;
    this.pos.x += dir.x * speed * dt;
    this.pos.y += dir.y * speed * dt;
  }

  private canSee(level: LevelData, player: Player): boolean {
    const to = { x: player.pos.x - this.pos.x, y: player.pos.y - this.pos.y };
    const d = Math.hypot(to.x, to.y);
    if (d > VISION_RANGE) return false;
    const dir = normalize(to);
    const dot = dir.x * this.facing.x + dir.y * this.facing.y;
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
    // Sneaking players are harder to notice at range.
    const effectiveAngle = player.sneaking
      ? VISION_HALF_ANGLE * 0.7
      : VISION_HALF_ANGLE;
    if (angle > effectiveAngle) return false;
    return !lineBlocked(level, this.pos, player.pos);
  }

  get visionRange(): number {
    return VISION_RANGE;
  }
  get visionHalfAngle(): number {
    return VISION_HALF_ANGLE;
  }
}
