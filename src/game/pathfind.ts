import { LevelData } from "./level";
import { TILE, Vec2 } from "./types";

interface Cell {
  c: number;
  r: number;
}

function toCell(p: Vec2): Cell {
  return { c: Math.floor(p.x / TILE), r: Math.floor(p.y / TILE) };
}

function walkable(level: LevelData, c: number, r: number): boolean {
  if (c < 0 || r < 0 || c >= level.cols || r >= level.rows) return false;
  return level.grid[r][c] === 0;
}

/**
 * Breadth-first search on the tile grid. Returns the world-space center of the
 * next tile to step toward, or null when no path exists.
 */
export function nextStep(
  level: LevelData,
  from: Vec2,
  to: Vec2,
): Vec2 | null {
  const start = toCell(from);
  const goal = toCell(to);
  if (start.c === goal.c && start.r === goal.r) return to;

  const key = (c: number, r: number) => r * level.cols + c;
  const cameFrom = new Map<number, number>();
  const queue: Cell[] = [start];
  const visited = new Set<number>([key(start.c, start.r)]);
  const dirs = [
    { c: 1, r: 0 },
    { c: -1, r: 0 },
    { c: 0, r: 1 },
    { c: 0, r: -1 },
  ];

  let found = false;
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.c === goal.c && cur.r === goal.r) {
      found = true;
      break;
    }
    for (const d of dirs) {
      const nc = cur.c + d.c;
      const nr = cur.r + d.r;
      const k = key(nc, nr);
      if (visited.has(k) || !walkable(level, nc, nr)) continue;
      visited.add(k);
      cameFrom.set(k, key(cur.c, cur.r));
      queue.push({ c: nc, r: nr });
    }
  }

  if (!found) return null;

  // Walk back from goal to the tile right after start.
  let curKey = key(goal.c, goal.r);
  const startKey = key(start.c, start.r);
  let prevKey = curKey;
  while (curKey !== startKey) {
    prevKey = curKey;
    const parent = cameFrom.get(curKey);
    if (parent === undefined) break;
    curKey = parent;
  }
  const stepC = prevKey % level.cols;
  const stepR = Math.floor(prevKey / level.cols);
  return { x: stepC * TILE + TILE / 2, y: stepR * TILE + TILE / 2 };
}
