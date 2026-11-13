import { type Project, buildNavGrid, entityBox, footprintOf, isCharacterKind, isSolid, resolveProps } from "@age/model";
import type { Actor, Behavior, Input, SimEvent, World } from "./types";
import { stepActors } from "./actors";
import { stepCombat } from "./combat";
import { stepScript } from "./script";

export const STEP = 1 / 60;

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** 결정적 난수 (0 이상 1 미만). */
export function random(world: World): number {
  world.rng = (world.rng + 0x6d2b79f5) | 0;
  let t = Math.imul(world.rng ^ (world.rng >>> 15), 1 | world.rng);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** 문서의 사본으로 월드를 만든다. 월드는 문서를 고치지 않는다. */
export function createWorld(project: Project, sceneId: string = project.startScene): World {
  const scene = project.scenes[sceneId];
  if (!scene) throw new Error(`scene ${sceneId} does not exist`);
  const tile = project.style.tile;
  const walkable = new Uint8Array(scene.w * scene.h);
  for (let i = 0; i < walkable.length; i++) walkable[i] = project.materials[scene.terrain[i]]?.walkable === false ? 0 : 1;

  const actors: Actor[] = [];
  const statics: World["statics"] = [];
  let playerId: string | null = null;
  for (const e of Object.values(scene.entities)) {
    const prefab = project.prefabs[e.prefab];
    if (!prefab) continue;
    const props = resolveProps(project, e);
    if (!isCharacterKind(prefab.kind)) {
      if (isSolid(project, e)) statics.push(entityBox(project, e));
      continue;
    }
    const fp = footprintOf(project.assets[prefab.asset], prefab.kind);
    const isPlayer = prefab.kind === "player";
    const isEnemy = prefab.kind === "enemy";
    const hp = props.hp ?? (isPlayer ? 6 : isEnemy ? 2 : 1);
    const behavior: Behavior = props.behavior ?? (isEnemy ? "chase" : "idle");
    if (isPlayer && !playerId) playerId = e.id;
    actors.push({
      id: e.id,
      prefab: e.prefab,
      kind: prefab.kind,
      name: props.name,
      x: e.x * tile,
      y: e.y * tile,
      homeX: e.x * tile,
      homeY: e.y * tile,
      w: fp.w,
      h: fp.h,
      solid: props.solid ?? true,
      facing: "down",
      moving: false,
      hp,
      maxHp: hp,
      speed: (props.speed ?? (isPlayer ? 4 : isEnemy ? 1.8 : 1.4)) * tile,
      damage: props.damage ?? (isPlayer || isEnemy ? 1 : 0),
      behavior,
      aggroRange: (props.aggroRange ?? 5) * tile,
      patrol: (props.patrol ?? []).map((p) => ({ x: (e.x + p.x) * tile, y: (e.y + p.y) * tile })),
      dialogue: props.dialogue,
      light: props.light,
      alive: true,
      deadFor: 0,
      invuln: 0,
      knockX: 0,
      knockY: 0,
      attackTimer: 0,
      attackCooldown: 0,
      attackHit: [],
      ai: { state: "rest", timer: 0.4 + (hashString(e.id) % 100) / 100, targetX: e.x * tile, targetY: e.y * tile, path: null, repath: 0, patrolIndex: 0, shotCooldown: 1 },
      scripted: null,
    });
  }

  return {
    project,
    scene,
    tile,
    width: scene.w * tile,
    height: scene.h * tile,
    walkable,
    statics,
    nav: buildNavGrid(project, scene),
    actors,
    playerId,
    projectiles: [],
    nextProjectile: 1,
    flags: {},
    dialogue: null,
    running: [],
    fired: {},
    inside: {},
    cameraTarget: null,
    started: false,
    time: 0,
    status: "playing",
    rng: hashString(scene.id) | 1,
    prevMoveY: 0,
  };
}

export function getActor(world: World, id: string | null): Actor | undefined {
  return id ? world.actors.find((a) => a.id === id) : undefined;
}

export function getPlayer(world: World): Actor | undefined {
  return getActor(world, world.playerId);
}

/** 시뮬레이션을 dt 초(보통 STEP) 진행하고 이번 걸음의 사건을 돌려준다. */
export function step(world: World, input: Input, dt: number = STEP): SimEvent[] {
  const events: SimEvent[] = [];
  world.time += dt;
  if (world.status === "dead") {
    for (const a of world.actors) if (!a.alive) a.deadFor += dt;
    return events;
  }
  // 대화와 이벤트가 먼저 입력을 가져간다. 남은 입력만 조작으로 쓴다.
  const control = stepScript(world, input, dt, events);
  if (!world.dialogue) {
    stepActors(world, control, dt, events);
    stepCombat(world, control, dt, events);
  }
  world.prevMoveY = input.moveY;
  return events;
}

/** 지금 대화 상자에 보일 내용. */
export function currentLine(world: World): { speaker: string; text: string; choices: string[]; choice: number } | null {
  if (!world.dialogue) return null;
  const d = world.scene.dialogues[world.dialogue.dialogue];
  const node = d?.nodes.find((n) => n.id === world.dialogue!.node);
  if (!node) return null;
  return { speaker: node.speaker, text: node.text, choices: (node.choices ?? []).map((c) => c.text), choice: world.dialogue.choice };
}
