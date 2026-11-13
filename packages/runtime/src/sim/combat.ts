import type { Box } from "@age/model";
import type { Actor, Input, SimEvent, World } from "./types";
import { boxOf, hitsStatic, overlaps } from "./collide";
import { getPlayer } from "./world";

export const ATTACK_TIME = 0.24;
export const ATTACK_COOLDOWN = 0.36;
const PLAYER_INVULN = 0.9;
const ENEMY_INVULN = 0.22;

/** 주인공이 보는 쪽으로 뻗는 공격 판정 상자. */
export function attackBox(a: Actor): Box {
  const reach = 20, wide = 26, deep = 18;
  switch (a.facing) {
    case "left": return { x: a.x - a.w / 2 - reach, y: a.y - a.h - 12, w: reach, h: wide };
    case "right": return { x: a.x + a.w / 2, y: a.y - a.h - 12, w: reach, h: wide };
    case "up": return { x: a.x - wide / 2, y: a.y - a.h - deep, w: wide, h: deep };
    default: return { x: a.x - wide / 2, y: a.y - 2, w: wide, h: deep };
  }
}

/** 맞는 쪽 판정은 발자국보다 넉넉한 몸통 상자로 한다. */
function bodyBox(a: Actor): Box {
  return { x: a.x - a.w / 2 - 2, y: a.y - a.h - 12, w: a.w + 4, h: a.h + 14 };
}

function hurt(world: World, target: Actor, by: Actor | null, damage: number, fromX: number, fromY: number, events: SimEvent[]): void {
  if (!target.alive || target.invuln > 0 || damage <= 0) return;
  target.hp -= damage;
  target.invuln = target.id === world.playerId ? PLAYER_INVULN : ENEMY_INVULN;
  const dx = target.x - fromX, dy = target.y - fromY;
  const d = Math.hypot(dx, dy) || 1;
  const force = target.id === world.playerId ? 190 : 230;
  target.knockX = (dx / d) * force;
  target.knockY = (dy / d) * force;
  events.push({ type: "hit", target: target.id, by: by?.id ?? "", damage, x: target.x, y: target.y - target.h });
  if (target.hp <= 0) {
    target.hp = 0;
    target.alive = false;
    target.deadFor = 0;
    target.moving = false;
    events.push({ type: "death", actor: target.id, x: target.x, y: target.y });
    if (target.id === world.playerId) {
      world.status = "dead";
      events.push({ type: "player-dead" });
    }
  }
}

/** 공격, 접촉 피해, 투사체를 처리한다. */
export function stepCombat(world: World, input: Input, dt: number, events: SimEvent[]): void {
  const player = getPlayer(world);
  const scripting = world.running.length > 0;

  if (player && player.alive) {
    if (input.attack && !scripting && player.attackCooldown <= 0 && player.attackTimer <= 0) {
      player.attackTimer = ATTACK_TIME;
      player.attackCooldown = ATTACK_COOLDOWN;
      player.attackHit = [];
      events.push({ type: "attack", actor: player.id, facing: player.facing });
    }
    if (player.attackTimer > 0) {
      // 휘두르는 동안 판정이 살아 있고, 한 번 휘두를 때 한 대상은 한 번만 맞는다
      if (player.attackTimer > ATTACK_TIME * 0.35) {
        const box = attackBox(player);
        for (const t of world.actors) {
          if (t.kind !== "enemy" || !t.alive || player.attackHit.includes(t.id)) continue;
          if (overlaps(box, bodyBox(t))) {
            player.attackHit.push(t.id);
            hurt(world, t, player, player.damage, player.x, player.y, events);
          }
        }
      }
      player.attackTimer -= dt;
    }

    // 적에게 닿으면 다친다
    if (!scripting) {
      const pb = boxOf(player);
      const touch: Box = { x: pb.x - 2, y: pb.y - 2, w: pb.w + 4, h: pb.h + 4 };
      for (const e of world.actors) {
        if (e.kind !== "enemy" || !e.alive || e.behavior === "ranged") continue;
        if (overlaps(touch, boxOf(e))) {
          hurt(world, player, e, e.damage, e.x, e.y, events);
          break;
        }
      }
    }
  }

  for (const p of world.projectiles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) continue;
    if (hitsStatic(world, { x: p.x - 2, y: p.y - 2, w: 4, h: 4 })) { p.life = 0; continue; }
    if (player && player.alive && overlaps({ x: p.x - 3, y: p.y - 3, w: 6, h: 6 }, bodyBox(player))) {
      hurt(world, player, null, p.damage, p.x - p.vx, p.y - p.vy, events);
      p.life = 0;
    }
  }
  if (world.projectiles.some((p) => p.life <= 0)) world.projectiles = world.projectiles.filter((p) => p.life > 0);
}
