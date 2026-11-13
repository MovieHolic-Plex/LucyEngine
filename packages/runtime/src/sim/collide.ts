import type { Box } from "@age/model";
import type { Actor, World } from "./types";

export function boxOf(a: Actor, x: number = a.x, y: number = a.y): Box {
  return { x: x - a.w / 2, y: y - a.h, w: a.w, h: a.h };
}

export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** 상자가 장면 밖이나 걸을 수 없는 지형·고정물과 겹치는가. */
export function hitsStatic(world: World, box: Box): boolean {
  if (box.x < 0 || box.y < 0 || box.x + box.w > world.width || box.y + box.h > world.height) return true;
  const t = world.tile;
  const x0 = Math.floor(box.x / t), x1 = Math.floor((box.x + box.w - 0.001) / t);
  const y0 = Math.floor(box.y / t), y1 = Math.floor((box.y + box.h - 0.001) / t);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!world.walkable[y * world.scene.w + x]) return true;
  for (const s of world.statics) if (overlaps(box, s)) return true;
  return false;
}

/** 다른 살아 있는 단단한 캐릭터와 겹치는가. */
export function hitsActor(world: World, self: Actor, box: Box): Actor | null {
  for (const o of world.actors) {
    if (o === self || !o.alive || !o.solid) continue;
    if (overlaps(box, boxOf(o))) return o;
  }
  return null;
}

function blocked(world: World, self: Actor, x: number, y: number): boolean {
  const box = boxOf(self, x, y);
  return hitsStatic(world, box) || (self.solid && hitsActor(world, self, box) !== null);
}

/**
 * (dx, dy) 만큼 움직인다. 막히면 축을 나눠 미끄러진다.
 * 이미 무언가와 겹친 채 시작했다면 빠져나올 수 있도록 막지 않는다.
 */
export function moveActor(world: World, a: Actor, dx: number, dy: number): boolean {
  if (dx === 0 && dy === 0) return false;
  if (blocked(world, a, a.x, a.y)) {
    // 끼어 있다. 장면 밖으로만 못 나가게 한다.
    a.x = Math.max(a.w / 2, Math.min(world.width - a.w / 2, a.x + dx));
    a.y = Math.max(a.h, Math.min(world.height, a.y + dy));
    return true;
  }
  let moved = false;
  // 큰 걸음은 잘게 나눠 얇은 벽을 건너뛰지 않게 한다
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 4));
  const sx = dx / steps, sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    if (sx !== 0 && !blocked(world, a, a.x + sx, a.y)) { a.x += sx; moved = true; }
    if (sy !== 0 && !blocked(world, a, a.x, a.y + sy)) { a.y += sy; moved = true; }
  }
  return moved;
}

/** 두 점 사이에 지형·고정물이 가로막지 않는가 (투사체와 시야). */
export function clearLine(world: World, x0: number, y0: number, x1: number, y1: number): boolean {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.ceil(dist / 6));
  for (let i = 1; i < n; i++) {
    const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n;
    if (hitsStatic(world, { x: x - 1, y: y - 1, w: 2, h: 2 })) return false;
  }
  return true;
}
