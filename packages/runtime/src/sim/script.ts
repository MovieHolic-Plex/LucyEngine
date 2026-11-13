import type { GameEvent } from "@age/model";
import { type Actor, type Input, type SimEvent, type World, NO_INPUT } from "./types";
import { getActor, getPlayer } from "./world";
import { facingOf } from "./actors";

const REACH = 1.15; // 말을 걸 수 있는 거리 (타일)

function conditionHolds(world: World, ev: GameEvent): boolean {
  if (ev.once && world.fired[ev.id]) return false;
  if (ev.condition && (world.flags[ev.condition.flag] ?? false) !== ev.condition.equals) return false;
  return true;
}

function fire(world: World, ev: GameEvent, events: SimEvent[]): void {
  world.fired[ev.id] = true;
  world.running.push({ event: ev.id, actions: ev.actions, index: 0, started: false, timer: 0 });
  events.push({ type: "event", event: ev.id });
}

export function openDialogue(world: World, id: string, events: SimEvent[]): boolean {
  const d = world.scene.dialogues[id];
  if (!d || d.nodes.length === 0) return false;
  world.dialogue = { dialogue: id, node: d.nodes[0].id, choice: 0 };
  events.push({ type: "dialogue-open", dialogue: id }, { type: "dialogue-line", speaker: d.nodes[0].speaker, text: d.nodes[0].text });
  return true;
}

function advanceDialogue(world: World, events: SimEvent[]): void {
  const st = world.dialogue!;
  const d = world.scene.dialogues[st.dialogue];
  const index = d.nodes.findIndex((n) => n.id === st.node);
  const node = d.nodes[index];
  let next: string | null | undefined;
  if (node.choices?.length) next = node.choices[Math.min(st.choice, node.choices.length - 1)].next;
  else next = node.next === undefined ? d.nodes[index + 1]?.id ?? null : node.next;
  const target = next ? d.nodes.find((n) => n.id === next) : undefined;
  if (!target) {
    world.dialogue = null;
    events.push({ type: "dialogue-close" });
    return;
  }
  world.dialogue = { dialogue: st.dialogue, node: target.id, choice: 0 };
  events.push({ type: "dialogue-line", speaker: target.speaker, text: target.text });
}

/** 주인공 앞에서 말을 걸거나 조사할 수 있는 대상을 찾는다. */
export function findInteractable(world: World): { id: string; x: number; y: number } | null {
  const player = getPlayer(world);
  if (!player || !player.alive) return null;
  const tile = world.tile;
  const withEvent = new Set<string>();
  for (const ev of Object.values(world.scene.events)) if (ev.trigger.type === "interact" && conditionHolds(world, ev)) withEvent.add(ev.trigger.entity);
  const face = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[player.facing];
  let best: { id: string; x: number; y: number } | null = null, bestScore = Infinity;
  const consider = (id: string, x: number, y: number, halfW: number, hasDialogue: boolean) => {
    if (id === player.id || (!hasDialogue && !withEvent.has(id))) return;
    const dx = x - player.x, dy = y - player.y;
    // 넓은 대상(건물 등)은 가장 가까운 가로 지점까지의 거리로 잰다
    const nx = Math.max(-halfW, Math.min(halfW, -dx));
    const ddx = dx + nx;
    const dist = Math.hypot(ddx, dy);
    if (dist > REACH * tile + 6) return;
    const dot = dist > 0 ? (ddx * face[0] + dy * face[1]) / dist : 1;
    if (dot < -0.25) return; // 등 뒤에 있는 것은 뺀다
    const score = dist - dot * tile * 0.5;
    if (score < bestScore) { bestScore = score; best = { id, x, y }; }
  };
  for (const a of world.actors) if (a.alive && a.kind !== "enemy") consider(a.id, a.x, a.y, a.w / 2, !!a.dialogue);
  for (const e of Object.values(world.scene.entities)) {
    const prefab = world.project.prefabs[e.prefab];
    if (!prefab || prefab.kind === "player" || prefab.kind === "npc" || prefab.kind === "enemy") continue;
    const asset = world.project.assets[prefab.asset];
    const dlg = e.props?.dialogue ?? prefab.props.dialogue;
    consider(e.id, e.x * tile, e.y * tile, (asset?.w ?? tile) / 2, !!dlg);
  }
  return best;
}

function interact(world: World, events: SimEvent[]): void {
  const target = findInteractable(world);
  if (!target) return;
  const player = getPlayer(world)!;
  player.facing = facingOf(target.x - player.x, target.y - player.y, player.facing);
  const actor = getActor(world, target.id);
  if (actor) actor.facing = facingOf(player.x - actor.x, player.y - actor.y, actor.facing);
  let fired = false;
  for (const ev of Object.values(world.scene.events))
    if (ev.trigger.type === "interact" && ev.trigger.entity === target.id && conditionHolds(world, ev)) { fire(world, ev, events); fired = true; }
  if (fired) return;
  const entity = world.scene.entities[target.id];
  const dlg = actor?.dialogue ?? entity?.props?.dialogue ?? world.project.prefabs[entity?.prefab ?? ""]?.props.dialogue;
  if (dlg) openDialogue(world, dlg, events);
}

/** 달리고 있는 이벤트의 동작을 차례로 실행한다. */
function runEvents(world: World, dt: number, events: SimEvent[]): void {
  while (world.running.length) {
    const run = world.running[0];
    const action = run.actions[run.index];
    if (!action) {
      world.running.shift();
      if (world.running.length === 0) world.cameraTarget = null;
      continue;
    }
    let done = false;
    switch (action.type) {
      case "flag":
        world.flags[action.flag] = action.value;
        events.push({ type: "flag", flag: action.flag, value: action.value });
        done = true;
        break;
      case "dialogue":
        if (!run.started) {
          run.started = true;
          if (!openDialogue(world, action.dialogue, events)) done = true;
        } else if (!world.dialogue) done = true;
        break;
      case "move": {
        const actor: Actor | undefined = getActor(world, action.entity);
        if (!actor || !actor.alive) { done = true; break; }
        if (!run.started) {
          run.started = true;
          actor.scripted = { x: action.to.x * world.tile, y: action.to.y * world.tile, speed: (action.speed ?? 3) * world.tile, timeout: 8 };
          actor.ai.path = null;
          actor.ai.repath = 0;
        } else if (!actor.scripted) done = true;
        break;
      }
      case "camera":
        if (!run.started) {
          run.started = true;
          run.timer = action.seconds;
          world.cameraTarget = { x: action.to.x * world.tile, y: action.to.y * world.tile };
        } else {
          run.timer -= dt;
          if (run.timer <= 0) done = true;
        }
        break;
    }
    if (!done) return;
    run.index++;
    run.started = false;
  }
}

/**
 * 대화와 이벤트를 진행한다. 대화가 입력을 먹었으면 빈 입력을, 아니면 받은 입력을 돌려준다.
 */
export function stepScript(world: World, input: Input, dt: number, events: SimEvent[]): Input {
  if (!world.started) {
    world.started = true;
    for (const ev of Object.values(world.scene.events)) if (ev.trigger.type === "start" && conditionHolds(world, ev)) fire(world, ev, events);
  }

  if (world.dialogue) {
    const line = world.scene.dialogues[world.dialogue.dialogue]?.nodes.find((n) => n.id === world.dialogue!.node);
    const count = line?.choices?.length ?? 0;
    if (count > 1) {
      if (input.moveY > 0.5 && world.prevMoveY <= 0.5) world.dialogue.choice = (world.dialogue.choice + 1) % count;
      if (input.moveY < -0.5 && world.prevMoveY >= -0.5) world.dialogue.choice = (world.dialogue.choice + count - 1) % count;
    }
    if (input.interact || input.attack) advanceDialogue(world, events);
    runEvents(world, dt, events);
    return NO_INPUT;
  }

  // 접촉 구역: 들어서는 순간에만 실행한다
  const player = getPlayer(world);
  if (player && player.alive) {
    const tx = player.x / world.tile, ty = (player.y - 2) / world.tile;
    for (const ev of Object.values(world.scene.events)) {
      if (ev.trigger.type !== "touch") continue;
      const a = ev.trigger.area;
      const inside = tx >= a.x && tx < a.x + a.w && ty >= a.y && ty < a.y + a.h;
      if (inside && !world.inside[ev.id] && conditionHolds(world, ev)) fire(world, ev, events);
      world.inside[ev.id] = inside;
    }
  }

  let control = input;
  if (input.interact && world.running.length === 0) {
    interact(world, events);
    control = { ...input, interact: false };
  }
  runEvents(world, dt, events);
  return world.dialogue ? NO_INPUT : control;
}
