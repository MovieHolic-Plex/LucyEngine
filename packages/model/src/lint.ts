import { type Project, type Scene, resolveProps } from "./schema";
import { buildNavGrid, floodFrom, reachesBox, entityBox, isBlockedAt, isCharacterKind } from "./passability";

export interface LintIssue {
  rule: "player-count" | "missing-ref" | "dangling" | "unreachable" | "blocked-character";
  severity: "error" | "warn";
  message: string;
  scene?: string;
  entity?: string;
  /** 타일 좌표. */
  x?: number;
  y?: number;
}

/** 문서 전체를 읽어 문제를 찾는다. 명령을 막지는 않는다. */
export function lintProject(project: Project): LintIssue[] {
  const issues: LintIssue[] = [];
  for (const m of Object.values(project.materials))
    if (m.asset && !project.assets[m.asset]) issues.push({ rule: "missing-ref", severity: "error", message: `재질 ${m.id} 가 없는 에셋 ${m.asset} 을 가리킵니다` });
  for (const p of Object.values(project.prefabs))
    if (!project.assets[p.asset]) issues.push({ rule: "missing-ref", severity: "error", message: `프리팹 ${p.id} 가 없는 에셋 ${p.asset} 을 가리킵니다` });
  for (const scene of Object.values(project.scenes)) issues.push(...lintScene(project, scene));
  return issues;
}

export function lintScene(project: Project, scene: Scene): LintIssue[] {
  const issues: LintIssue[] = [];
  const tile = project.style.tile;
  const sid = scene.id;

  const missingMaterials = new Set<string>();
  for (const id of scene.terrain) if (!project.materials[id]) missingMaterials.add(id);
  for (const id of missingMaterials) issues.push({ rule: "missing-ref", severity: "error", scene: sid, message: `지형이 없는 재질 ${id} 를 쓰고 있습니다` });

  const entities = Object.values(scene.entities);
  for (const e of entities)
    if (!project.prefabs[e.prefab]) issues.push({ rule: "missing-ref", severity: "error", scene: sid, entity: e.id, x: e.x, y: e.y, message: `엔티티 ${e.id} 가 없는 프리팹 ${e.prefab} 을 가리킵니다` });

  const players = entities.filter((e) => project.prefabs[e.prefab]?.kind === "player");
  if (players.length === 0) issues.push({ rule: "player-count", severity: "error", scene: sid, message: "주인공이 없습니다" });
  if (players.length > 1) issues.push({ rule: "player-count", severity: "error", scene: sid, message: `주인공이 ${players.length}명입니다 (${players.map((p) => p.id).join(", ")})` });

  // 없는 대화·엔티티를 가리키는 참조
  for (const e of entities) {
    const d = resolveProps(project, e).dialogue;
    if (d && !scene.dialogues[d]) issues.push({ rule: "dangling", severity: "error", scene: sid, entity: e.id, x: e.x, y: e.y, message: `엔티티 ${e.id} 의 대화 ${d} 가 없습니다` });
  }
  for (const ev of Object.values(scene.events)) {
    if (ev.trigger.type === "interact" && !scene.entities[ev.trigger.entity])
      issues.push({ rule: "dangling", severity: "error", scene: sid, message: `이벤트 ${ev.id} 가 없는 엔티티 ${ev.trigger.entity} 를 조사 대상으로 삼습니다` });
    for (const a of ev.actions) {
      if (a.type === "dialogue" && !scene.dialogues[a.dialogue]) issues.push({ rule: "dangling", severity: "error", scene: sid, message: `이벤트 ${ev.id} 의 대화 ${a.dialogue} 가 없습니다` });
      if (a.type === "move" && !scene.entities[a.entity]) issues.push({ rule: "dangling", severity: "error", scene: sid, message: `이벤트 ${ev.id} 가 없는 엔티티 ${a.entity} 를 움직이려 합니다` });
    }
  }

  const nav = buildNavGrid(project, scene);

  // 통행 불가 칸 위의 캐릭터
  for (const e of entities) {
    if (!isCharacterKind(project.prefabs[e.prefab]?.kind)) continue;
    if (isBlockedAt(nav, e.x * tile, e.y * tile - 2))
      issues.push({ rule: "blocked-character", severity: "error", scene: sid, entity: e.id, x: e.x, y: e.y, message: `${e.id} 가 걸을 수 없는 자리(${e.x}, ${e.y})에 서 있습니다` });
  }

  // 주인공이 닿을 수 없는 대상
  const player = players[0];
  if (player) {
    const seen = floodFrom(nav, player.x * tile, player.y * tile - 2);
    const reach = tile * 1.1;
    const interactTargets = new Set<string>();
    for (const ev of Object.values(scene.events)) if (ev.trigger.type === "interact") interactTargets.add(ev.trigger.entity);
    for (const e of entities) {
      if (e.id === player.id) continue;
      const kind = project.prefabs[e.prefab]?.kind;
      const props = resolveProps(project, e);
      const needsReach = kind === "npc" || kind === "enemy" || !!props.dialogue || interactTargets.has(e.id);
      if (!needsReach) continue;
      if (!reachesBox(nav, seen, entityBox(project, e), reach))
        issues.push({ rule: "unreachable", severity: "error", scene: sid, entity: e.id, x: e.x, y: e.y, message: `주인공이 ${e.id} (${e.x}, ${e.y}) 에 걸어서 닿을 수 없습니다` });
    }
    for (const ev of Object.values(scene.events)) {
      if (ev.trigger.type !== "touch") continue;
      const a = ev.trigger.area;
      if (!reachesBox(nav, seen, { x: a.x * tile, y: a.y * tile, w: a.w * tile, h: a.h * tile }, 0))
        issues.push({ rule: "unreachable", severity: "error", scene: sid, x: a.x, y: a.y, message: `주인공이 이벤트 ${ev.id} 의 구역 (${a.x}, ${a.y}) 에 들어갈 수 없습니다` });
    }
  }
  return issues;
}
