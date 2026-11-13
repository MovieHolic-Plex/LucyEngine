import { findPath, type Project } from "@age/model";
import { type Input, type SimEvent, type World, NO_INPUT } from "./types";
import { createWorld, getActor, getPlayer, step, STEP, currentLine } from "./world";
import { findInteractable } from "./script";

// 화면 없이 주인공을 대신 조작해 장면이 실제로 플레이되는지 확인한다.

export interface WalkResult {
  reached: boolean;
  seconds: number;
  /** 끝났을 때 주인공 위치 (타일). */
  at: { x: number; y: number };
  hpLeft: number;
  damageTaken: number;
  /** 가는 길에 일어난 일. */
  notes: string[];
}

class Bot {
  path: Array<{ x: number; y: number }> | null = null;
  repath = 0;
  stuck = 0;
  lastX = 0;
  lastY = 0;

  /** 목표(화소)로 가는 이동 입력을 만든다. */
  steer(world: World, tx: number, ty: number): { moveX: number; moveY: number } {
    const p = getPlayer(world)!;
    this.repath -= STEP;
    const movedLittle = Math.hypot(p.x - this.lastX, p.y - this.lastY) < 0.2;
    this.stuck = movedLittle ? this.stuck + STEP : 0;
    this.lastX = p.x;
    this.lastY = p.y;
    if (!this.path || this.repath <= 0 || this.stuck > 0.5) {
      this.path = findPath(world.nav, p.x, p.y - p.h / 2, tx, ty - p.h / 2);
      this.repath = 0.5;
      this.stuck = 0;
    }
    let gx = tx, gy = ty;
    if (this.path && this.path.length) {
      while (this.path.length > 1 && Math.hypot(this.path[0].x - p.x, this.path[0].y + p.h / 2 - p.y) < 3) this.path.shift();
      gx = this.path[0].x;
      gy = this.path[0].y + p.h / 2;
      if (this.path.length === 1 && Math.hypot(gx - p.x, gy - p.y) < 3) { gx = tx; gy = ty; }
    }
    const dx = gx - p.x, dy = gy - p.y;
    const d = Math.hypot(dx, dy);
    return d < 0.5 ? { moveX: 0, moveY: 0 } : { moveX: dx / d, moveY: dy / d };
  }
}

function note(notes: string[], events: SimEvent[], world: World): void {
  for (const e of events) {
    if (e.type === "hit" && e.target === world.playerId) notes.push(`took ${e.damage} damage from ${e.by || "a projectile"}`);
    else if (e.type === "dialogue-line") notes.push(`dialogue: ${e.speaker}: ${e.text}`);
    else if (e.type === "event") notes.push(`event ${e.event} fired`);
    else if (e.type === "death" && e.actor !== world.playerId) notes.push(`${e.actor} was defeated`);
    else if (e.type === "player-dead") notes.push("the player died");
  }
}

/** 대화가 열려 있으면 첫 선택지를 고르며 끝까지 넘긴다. */
function skipDialogue(world: World, notes: string[]): void {
  let guard = 0;
  while (world.dialogue && guard++ < 200) {
    note(notes, step(world, { ...NO_INPUT, interact: true }), world);
    note(notes, step(world, NO_INPUT), world);
  }
}

/** 주인공을 목표 지점(타일)까지 걷게 한다. */
export function walkTo(project: Project, sceneId: string, target: { x: number; y: number }, opts: { maxSeconds?: number; world?: World } = {}): WalkResult {
  const world = opts.world ?? createWorld(project, sceneId);
  const player = getPlayer(world);
  const notes: string[] = [];
  if (!player) return { reached: false, seconds: 0, at: { x: 0, y: 0 }, hpLeft: 0, damageTaken: 0, notes: ["there is no player in this scene"] };
  const startHp = player.hp;
  const bot = new Bot();
  const tx = target.x * world.tile, ty = target.y * world.tile;
  const max = opts.maxSeconds ?? 40;
  let reached = false;
  while (world.time < max && world.status === "playing") {
    if (world.dialogue) { skipDialogue(world, notes); continue; }
    if (Math.hypot(player.x - tx, player.y - ty) < world.tile * 0.6) { reached = true; break; }
    note(notes, step(world, { ...NO_INPUT, ...bot.steer(world, tx, ty) }), world);
  }
  if (!reached && world.status === "playing" && !findPath(world.nav, player.x, player.y - player.h / 2, tx, ty - player.h / 2)) notes.push("no walkable path to the target exists");
  return {
    reached,
    seconds: Math.round(world.time * 10) / 10,
    at: { x: Math.round((player.x / world.tile) * 100) / 100, y: Math.round((player.y / world.tile) * 100) / 100 },
    hpLeft: player.hp,
    damageTaken: startHp - player.hp,
    notes: dedupe(notes),
  };
}

function dedupe(notes: string[]): string[] {
  const out: string[] = [];
  for (const n of notes) if (out[out.length - 1] !== n) out.push(n);
  return out.slice(0, 40);
}

export interface TalkResult {
  talked: boolean;
  lines: string[];
  notes: string[];
}

/** 주인공을 엔티티 앞까지 걸어가게 해서 말을 건다. */
export function talkTo(project: Project, sceneId: string, entityId: string, opts: { maxSeconds?: number } = {}): TalkResult {
  const world = createWorld(project, sceneId);
  const player = getPlayer(world);
  const notes: string[] = [];
  if (!player) return { talked: false, lines: [], notes: ["there is no player in this scene"] };
  const entity = world.scene.entities[entityId];
  if (!entity) return { talked: false, lines: [], notes: [`entity ${entityId} does not exist`] };
  const bot = new Bot();
  const max = opts.maxSeconds ?? 40;
  const lines: string[] = [];
  let pressed = 0;
  while (world.time < max && world.status === "playing") {
    if (world.dialogue) {
      const line = currentLine(world);
      if (line) lines.push(`${line.speaker}: ${line.text}${line.choices.length ? ` [choices: ${line.choices.join(" / ")}]` : ""}`);
      step(world, { ...NO_INPUT, interact: true });
      step(world, NO_INPUT);
      if (!world.dialogue && world.running.length === 0) break;
      continue;
    }
    if (lines.length && world.running.length === 0) break;
    const actor = getActor(world, entityId);
    const ex = actor ? actor.x : entity.x * world.tile, ey = actor ? actor.y : entity.y * world.tile;
    const target = findInteractable(world);
    if (target?.id === entityId && pressed < 3) {
      pressed++;
      note(notes, step(world, { ...NO_INPUT, interact: true }), world);
      continue;
    }
    // 대상 바로 아래쪽으로 다가간 뒤 그쪽을 본다
    const dist = Math.hypot(player.x - ex, player.y - ey);
    const steer = dist < world.tile * 1.0 ? { moveX: Math.sign(ex - player.x) * 0.3, moveY: Math.sign(ey - player.y) * 0.3 } : bot.steer(world, ex, ey + world.tile * 0.7);
    note(notes, step(world, { ...NO_INPUT, ...steer }), world);
    if (pressed >= 3) break;
  }
  if (!lines.length) notes.push(pressed ? `pressed interact next to ${entityId} but nothing happened (it has no dialogue and no interact event)` : `could not get close enough to ${entityId} to interact`);
  return { talked: lines.length > 0, lines, notes: dedupe(notes) };
}

export interface FightResult {
  outcome: "enemy-defeated" | "player-died" | "timeout" | "unreachable" | "no-target";
  seconds: number;
  playerHpLeft: number;
  playerMaxHp: number;
  enemyHpLeft: number;
  hitsTaken: number;
  notes: string[];
}

/** 주인공이 적 하나와 싸우게 한다. 다가가서 마주 보고 공격하고, 맞으면 잠깐 물러난다. */
export function fight(project: Project, sceneId: string, enemyId: string, opts: { maxSeconds?: number } = {}): FightResult {
  const world = createWorld(project, sceneId);
  const player = getPlayer(world);
  const enemy = getActor(world, enemyId);
  const notes: string[] = [];
  if (!player || !enemy || enemy.kind !== "enemy")
    return { outcome: "no-target", seconds: 0, playerHpLeft: player?.hp ?? 0, playerMaxHp: player?.maxHp ?? 0, enemyHpLeft: enemy?.hp ?? 0, hitsTaken: 0, notes: [!player ? "there is no player in this scene" : `${enemyId} is not an enemy in this scene`] };
  const bot = new Bot();
  const max = opts.maxSeconds ?? 45;
  let hitsTaken = 0;
  let outcome: FightResult["outcome"] = "timeout";
  while (world.time < max) {
    if (world.status === "dead") { outcome = "player-died"; break; }
    if (!enemy.alive) { outcome = "enemy-defeated"; break; }
    if (world.dialogue) { skipDialogue(world, notes); continue; }
    const dx = enemy.x - player.x, dy = enemy.y - player.y;
    const dist = Math.hypot(dx, dy);
    let input: Input;
    if (dist < 30) {
      // 가까우면 적을 보는 쪽으로 살짝 움직여 방향을 맞추고 휘두른다
      const horizontal = Math.abs(dx) > Math.abs(dy);
      input = { moveX: horizontal ? Math.sign(dx) * 0.2 : 0, moveY: horizontal ? 0 : Math.sign(dy) * 0.2, attack: player.attackCooldown <= 0, interact: false };
    } else input = { ...NO_INPUT, ...bot.steer(world, enemy.x, enemy.y) };
    const events = step(world, input);
    for (const e of events) if (e.type === "hit" && e.target === player.id) hitsTaken++;
    note(notes, events, world);
  }
  if (outcome === "timeout" && !findPath(world.nav, player.x, player.y - player.h / 2, enemy.x, enemy.y - enemy.h / 2)) outcome = "unreachable";
  return { outcome, seconds: Math.round(world.time * 10) / 10, playerHpLeft: player.hp, playerMaxHp: player.maxHp, enemyHpLeft: enemy.hp, hitsTaken, notes: dedupe(notes) };
}
