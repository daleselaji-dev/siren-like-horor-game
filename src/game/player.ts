import { Input } from "./input";
import { isWallAt, LevelData } from "./level";
import { normalize, TILE, Vec2 } from "./types";

const RADIUS = 10;
const WALK_SPEED = 130; // px/s
const SNEAK_SPEED = 65;

export class Player {
  pos: Vec2;
  facing: Vec2 = { x: 0, y: 1 };
  hasKey = false;
  sneaking = false;
  /** How loud the player currently is (0..1), drives enemy hearing. */
  noise = 0;

  constructor(spawn: Vec2) {
    this.pos = { x: spawn.x, y: spawn.y };
  }

  update(dt: number, input: Input, level: LevelData): void {
    const axis = input.moveAxis();
    this.sneaking = input.sneaking();
    const dir = normalize(axis);
    const speed = this.sneaking ? SNEAK_SPEED : WALK_SPEED;

    if (dir.x !== 0 || dir.y !== 0) {
      this.facing = dir;
      this.noise = this.sneaking ? 0.25 : 1;
    } else {
      this.noise = 0;
    }

    // Move on each axis independently so we slide along walls.
    const nextX = this.pos.x + dir.x * speed * dt;
    if (!this.collides(nextX, this.pos.y, level)) this.pos.x = nextX;
    const nextY = this.pos.y + dir.y * speed * dt;
    if (!this.collides(this.pos.x, nextY, level)) this.pos.y = nextY;
  }

  private collides(x: number, y: number, level: LevelData): boolean {
    // Sample the circle's four cardinal edges against the tile grid.
    return (
      isWallAt(level, x - RADIUS, y) ||
      isWallAt(level, x + RADIUS, y) ||
      isWallAt(level, x, y - RADIUS) ||
      isWallAt(level, x, y + RADIUS)
    );
  }

  get radius(): number {
    return RADIUS;
  }

  tile(): Vec2 {
    return { x: Math.floor(this.pos.x / TILE), y: Math.floor(this.pos.y / TILE) };
  }
}
