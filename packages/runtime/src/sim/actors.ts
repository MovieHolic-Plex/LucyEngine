import { findPath } from "@age/model";
import type { Actor, Facing, Input, SimEvent, World } from "./types";
import { clearLine, moveActor } from "./collide";
import { getPlayer, random } from "./world";

export function facingOf(dx: number, dy: number, fallback: Facing): Facing {
  if (dx === 0 && dy === 0) return fallback;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

/** (tx, ty) 쪽으로 speed 로 걷는다. 닿았으면 true. */
function walkToward(world: World, a: Actor, tx: number, ty: number, speed: number, dt: number, arrive = 1.5): boolean {
  const dx = tx - a.x, dy = ty - a.y;
  const d = Math.hypot(dx, dy);
  if (d <= arrive) { a.moving = false; return true; }
  const stepLen = Math.min(d, speed * dt);
  a.facing = facingOf(dx, dy, a.facing);
  a.moving = moveActor(world, a, (dx / d) * stepLen, (dy / d) * stepLen);
  return false;
}

/** 길을 찾아 따라간다. 닿았으면 true. 길이 없으면 곧장 걸어 본다. */
function followPath(world: World, a: Actor, tx: number, ty: number, speed: number, dt: number, arrive: number): boolean {
  if (Math.hypot(tx - a.x, ty - a.y) <= arrive) { a.moving = false; return true; }
  a.ai.repath -= dt;
  if (a.ai.repath <= 0 || !a.ai.path) {
    a.ai.path = findPath(world.nav, a.x, a.y - a.h / 2, tx, ty - 2);
    a.ai.repath = 0.4;
  }
  const path = a.ai.path;
  if (!path || path.length === 0) {
    walkToward(world, a, tx, ty, speed, dt, arrive);
    return false;
  }
  // 발자국이 칸 가운데를 지나도록 경유점을 발밑 기준으로 옮긴다
  const wp = path[0];
  const wx = wp.x, wy = wp.y + a.h / 2;
  if (Math.hypot(wx - a.x, wy - a.y) < 3 || path.length === 1 && Math.hypot(tx - a.x, ty - a.y) < world.nav.cell) {
    path.shift();
    if (path.length === 0) return walkToward(world, a, tx, ty, speed, dt, arrive);
  }
  const next = path[0] ?? { x: tx, y: ty - a.h / 2 };
  walkToward(world, a, next.x, next.y + a.h / 2, speed, dt, 0.5);
  return false;
}

function controlPlayer(world: World, p: Actor, input: Input, dt: number): void {
  if (p.attackTimer > 0) { p.moving = false; return; }
  let mx = input.moveX, my = input.moveY;
  const len = Math.hypot(mx, my);
  if (len < 0.01) { p.moving = false; return; }
  if (len > 1) { mx /= len; my /= len; }
  p.facing = facingOf(mx, my, p.facing);
  p.moving = moveActor(world, p, mx * p.speed * dt, my * p.speed * dt);
}

function think(world: World, a: Actor, dt: number, events: SimEvent[]): void {
  const player = getPlayer(world);
  const ai = a.ai;
  const distToPlayer = player && player.alive ? Math.hypot(player.x - a.x, player.y - a.y) : Infinity;
  const hostile = a.kind === "enemy";
  const sees = hostile && distToPlayer <= a.aggroRange;

  if (a.behavior === "ranged" && hostile) {
    ai.shotCooldown -= dt;
    if (sees && player) {
      a.facing = facingOf(player.x - a.x, player.y - a.y, a.facing);
      const keep = world.tile * 3.5;
      if (distToPlayer < keep * 0.6) {
        // 너무 가까우면 물러난다
        const d = distToPlayer || 1;
        a.moving = moveActor(world, a, ((a.x - player.x) / d) * a.speed * dt, ((a.y - player.y) / d) * a.speed * dt);
        a.facing = facingOf(player.x - a.x, player.y - a.y, a.facing);
      } else if (distToPlayer > keep * 1.3) followPath(world, a, player.x, player.y, a.speed, dt, keep);
      else a.moving = false;
      if (ai.shotCooldown <= 0 && clearLine(world, a.x, a.y - a.h, player.x, player.y - player.h)) {
        const d = distToPlayer || 1;
        const speed = world.tile * 4.5;
        world.projectiles.push({ id: world.nextProjectile++, x: a.x, y: a.y - a.h, vx: ((player.x - a.x) / d) * speed, vy: ((player.y - a.y) / d) * speed, damage: a.damage, life: 2.5 });
        ai.shotCooldown = 1.6;
        events.push({ type: "shoot", actor: a.id });
      }
      return;
    }
    returnHome(world, a, dt);
    return;
  }

  if (sees && player && (a.behavior === "chase" || a.behavior === "patrol" || a.behavior === "wander")) {
    ai.state = "chase";
    followPath(world, a, player.x, player.y, a.speed, dt, (a.w + player.w) / 2 + 1);
    return;
  }
  if (ai.state === "chase") { ai.state = "return"; ai.path = null; }

  switch (a.behavior) {
    case "patrol": {
      const points = a.patrol.length ? [{ x: a.homeX, y: a.homeY }, ...a.patrol] : [{ x: a.homeX - world.tile * 2, y: a.homeY }, { x: a.homeX + world.tile * 2, y: a.homeY }];
      const target = points[ai.patrolIndex % points.length];
      if (ai.timer > 0) { ai.timer -= dt; a.moving = false; break; }
      if (followPath(world, a, target.x, target.y, a.speed * 0.6, dt, 2)) {
        ai.patrolIndex = (ai.patrolIndex + 1) % points.length;
        ai.timer = 0.8;
        ai.path = null;
      }
      break;
    }
    case "wander": {
      if (ai.state === "walk") {
        ai.timer -= dt;
        if (walkToward(world, a, ai.targetX, ai.targetY, a.speed * 0.5, dt, 2) || ai.timer <= 0 || !a.moving) {
          ai.state = "rest";
          ai.timer = 1.2 + random(world) * 2.2;
          a.moving = false;
        }
      } else {
        ai.timer -= dt;
        a.moving = false;
        if (ai.timer <= 0) {
          const angle = random(world) * Math.PI * 2, r = world.tile * (0.6 + random(world) * 1.6);
          ai.targetX = a.homeX + Math.cos(angle) * r;
          ai.targetY = a.homeY + Math.sin(angle) * r;
          ai.state = "walk";
          ai.timer = 3;
        }
      }
      break;
    }
    case "chase":
      returnHome(world, a, dt);
      break;
    default: {
      // idle: 제자리. 주인공이 가까이 오면 그쪽을 본다.
      a.moving = false;
      if (player && distToPlayer < world.tile * 2.5 && a.kind === "npc") a.facing = facingOf(player.x - a.x, player.y - a.y, a.facing);
    }
  }
}

function returnHome(world: World, a: Actor, dt: number): void {
  if (Math.hypot(a.homeX - a.x, a.homeY - a.y) > 3) followPath(world, a, a.homeX, a.homeY, a.speed * 0.7, dt, 2);
  else { a.moving = false; a.ai.state = "rest"; }
}

/** 캐릭터를 움직인다: 넉백, 이벤트가 건 이동, 주인공 조작, AI. */
export function stepActors(world: World, input: Input, dt: number, _events: SimEvent[]): void {
  const scripting = world.running.length > 0;
  for (const a of world.actors) {
    if (!a.alive) { a.deadFor += dt; continue; }
    if (a.invuln > 0) a.invuln -= dt;
    if (a.attackCooldown > 0) a.attackCooldown -= dt;

    if (Math.abs(a.knockX) > 4 || Math.abs(a.knockY) > 4) {
      moveActor(world, a, a.knockX * dt, a.knockY * dt);
      const decay = Math.exp(-9 * dt);
      a.knockX *= decay;
      a.knockY *= decay;
      a.moving = false;
      continue;
    }
    a.knockX = a.knockY = 0;

    if (a.scripted) {
      a.scripted.timeout -= dt;
      // 이벤트가 건 이동은 다른 캐릭터에 막히지 않도록 길을 찾아간다
      if (followPath(world, a, a.scripted.x, a.scripted.y, a.scripted.speed, dt, 2) || a.scripted.timeout <= 0) {
        a.scripted = null;
        a.moving = false;
        a.homeX = a.x;
        a.homeY = a.y;
      }
      continue;
    }
    if (a.id === world.playerId) {
      if (scripting) a.moving = false;
      else controlPlayer(world, a, input, dt);
    } else if (scripting) a.moving = false;
    else think(world, a, dt, _events);
  }
}
