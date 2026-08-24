import { TILE, Vec2 } from "./types";

/**
 * Tile legend:
 *   # wall
 *   . floor
 *   P player spawn
 *   E enemy spawn
 *   K key pickup
 *   X exit door (only usable once the key is collected)
 *   o enemy patrol waypoint (walkable floor)
 */
const MAP: string[] = [
  "##############################",
  "#P...........#..........o....#",
  "#....#####...#...####........#",
  "#....#...#...#...#..#...####..#",
  "#....#.o.#.......#..#...#..#..#",
  "#....#...#####...#..#...#..#..#",
  "#....#.......#...#......#.....#",
  "#....######..#...########..####",
  "#.........#..#.........#......#",
  "####..###.#..#####.###.#..##..#",
  "#.....#...#......#...#....o#..#",
  "#..o..#...#####..#...#######..#",
  "#.....#.......#..#............#",
  "#.###########.#..######.####.##",
  "#.#.......E.#.#.......#..#....#",
  "#.#.#####..###.#####..#..#.##.#",
  "#...#...#.........#......#..#.#",
  "#####...#########.#.####.#..#.#",
  "#K......#.......o.#....#....#X#",
  "##############################",
];

export interface LevelData {
  grid: number[][]; // 1 = wall, 0 = floor
  cols: number;
  rows: number;
  playerSpawn: Vec2;
  enemySpawn: Vec2;
  keyPos: Vec2;
  exitPos: Vec2;
  patrol: Vec2[];
}

function center(col: number, row: number): Vec2 {
  return { x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 };
}

export function loadLevel(): LevelData {
  const rows = MAP.length;
  const cols = MAP[0].length;
  const grid: number[][] = [];
  let playerSpawn: Vec2 = center(1, 1);
  let enemySpawn: Vec2 = center(1, 1);
  let keyPos: Vec2 = center(1, 1);
  let exitPos: Vec2 = center(1, 1);
  const patrol: Vec2[] = [];

  for (let r = 0; r < rows; r++) {
    const line = MAP[r];
    const gridRow: number[] = [];
    for (let c = 0; c < cols; c++) {
      const ch = line[c] ?? "#";
      gridRow.push(ch === "#" ? 1 : 0);
      switch (ch) {
        case "P":
          playerSpawn = center(c, r);
          break;
        case "E":
          enemySpawn = center(c, r);
          break;
        case "K":
          keyPos = center(c, r);
          break;
        case "X":
          exitPos = center(c, r);
          break;
        case "o":
          patrol.push(center(c, r));
          break;
      }
    }
    grid.push(gridRow);
  }

  return { grid, cols, rows, playerSpawn, enemySpawn, keyPos, exitPos, patrol };
}

export function isWallAt(level: LevelData, x: number, y: number): boolean {
  const c = Math.floor(x / TILE);
  const r = Math.floor(y / TILE);
  if (c < 0 || r < 0 || c >= level.cols || r >= level.rows) return true;
  return level.grid[r][c] === 1;
}

/**
 * Bresenham-style ray march to test whether the straight segment a->b
 * is blocked by any wall tile. Used for line-of-sight checks.
 */
export function lineBlocked(level: LevelData, a: Vec2, b: Vec2): boolean {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (TILE / 4));
  if (steps === 0) return false;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    if (isWallAt(level, x, y)) return true;
  }
  return false;
}
