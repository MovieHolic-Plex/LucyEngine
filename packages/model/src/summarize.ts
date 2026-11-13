import { type Project, type Scene, resolveProps } from "./schema";
import { footprintOf, frameSize } from "./passability";

const LETTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** 지형을 글자 격자로 그린다. 범례는 재질 id → 글자. */
export function terrainLegend(scene: Scene): { legend: Record<string, string>; rows: string[] } {
  const legend: Record<string, string> = {};
  let n = 0;
  for (const id of scene.terrain) if (!(id in legend)) legend[id] = LETTERS[n++ % LETTERS.length];
  const rows: string[] = [];
  for (let y = 0; y < scene.h; y++) {
    let row = "";
    for (let x = 0; x < scene.w; x++) row += legend[scene.terrain[y * scene.w + x]];
    rows.push(row);
  }
  return { legend, rows };
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

/** 에이전트가 읽는 장면 요약. 좌표는 타일 단위이고 (0,0) 이 왼쪽 위다. */
export function describeScene(project: Project, sceneId: string): string {
  const scene = project.scenes[sceneId];
  if (!scene) return `scene ${sceneId} does not exist`;
  const tile = project.style.tile;
  const out: string[] = [];
  out.push(`scene "${scene.id}" (${scene.name}) ${scene.w}x${scene.h} tiles, tile=${tile}px. Coordinates are in tiles; (0,0) is the top-left corner; an entity's x,y is the centre of its feet.`);

  const { legend, rows } = terrainLegend(scene);
  out.push("", "terrain legend:");
  for (const [id, ch] of Object.entries(legend)) {
    const m = project.materials[id];
    out.push(`  ${ch} = ${id}${m ? ` (${m.name}; ${m.walkable ? "walkable" : "BLOCKS walking"}; priority ${m.priority})` : " (MISSING material)"}`);
  }
  out.push("terrain rows (row index, then one letter per tile):");
  rows.forEach((r, y) => out.push(`  ${String(y).padStart(2)} ${r}`));

  const ents = Object.values(scene.entities);
  out.push("", `entities (${ents.length}):`);
  for (const e of ents) {
    const p = project.prefabs[e.prefab];
    const props = resolveProps(project, e);
    const extra = Object.entries(e.props ?? {}).map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`).join(" ");
    out.push(`  ${e.id}: ${e.prefab}${p ? ` [${p.kind}]` : " [MISSING prefab]"} at (${fmt(e.x)}, ${fmt(e.y)})${props.name ? ` name="${props.name}"` : ""}${extra ? ` overrides: ${extra}` : ""}`);
  }

  out.push("", `ambient light: ${scene.ambient}; post: bloom ${scene.post.bloom}, vignette ${scene.post.vignette}, saturation ${scene.post.saturation}, contrast ${scene.post.contrast}`);
  const lights = Object.values(scene.lights);
  out.push(`lights (${lights.length}):`);
  for (const l of lights) out.push(`  ${l.id}: at (${fmt(l.x)}, ${fmt(l.y)}) color ${l.color} radius ${l.radius} intensity ${l.intensity}${l.flicker ? " flicker" : ""}`);

  const dialogues = Object.values(scene.dialogues);
  out.push("", `dialogues (${dialogues.length}):`);
  for (const d of dialogues) out.push(`  ${d.id}: ${d.nodes.length} lines; starts "${d.nodes[0].speaker}: ${d.nodes[0].text.slice(0, 50)}"`);

  const events = Object.values(scene.events);
  out.push("", `events (${events.length}):`);
  for (const ev of events) {
    const t = ev.trigger.type === "touch" ? `touch area (${ev.trigger.area.x}, ${ev.trigger.area.y}, ${ev.trigger.area.w}x${ev.trigger.area.h})` : ev.trigger.type === "interact" ? `interact with ${ev.trigger.entity}` : "scene start";
    out.push(`  ${ev.id}: on ${t}${ev.once ? " (once)" : ""}${ev.condition ? ` if ${ev.condition.flag}=${ev.condition.equals}` : ""} -> ${ev.actions.map((a) => a.type + (a.type === "dialogue" ? `(${a.dialogue})` : "")).join(", ")}`);
  }
  return out.join("\n");
}

/** 프로젝트에 등록된 재질·프리팹·에셋 목록. */
export function describeLibrary(project: Project): string {
  const tile = project.style.tile;
  const out: string[] = [];
  out.push(`project "${project.meta.name}"; style mood: ${project.style.mood || "(not set)"}`);
  out.push("", "materials:");
  for (const m of Object.values(project.materials))
    out.push(`  ${m.id}: "${m.name}" ${m.walkable ? "walkable" : "blocks walking"}, priority ${m.priority}, edge ${m.edge}, ${m.asset ? `texture ${m.asset}` : `flat colour ${m.color} (no texture yet)`}`);
  out.push("", "prefabs:");
  for (const p of Object.values(project.prefabs)) {
    const a = project.assets[p.asset];
    const size = a ? frameSize(a) : { w: 0, h: 0 };
    const fp = footprintOf(a, p.kind);
    const props = Object.entries(p.props).map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`).join(" ");
    out.push(`  ${p.id}: "${p.name}" [${p.kind}] asset ${p.asset}${a ? ` ${size.w}x${size.h}px (${fmt(size.w / tile)}x${fmt(size.h / tile)} tiles), footprint ${fmt(fp.w / tile)}x${fmt(fp.h / tile)} tiles${a.file ? "" : ", PLACEHOLDER image"}` : " (MISSING asset)"}${props ? `; ${props}` : ""}`);
  }
  const unused = Object.values(project.assets).filter((a) => !Object.values(project.prefabs).some((p) => p.asset === a.id) && !Object.values(project.materials).some((m) => m.asset === a.id));
  if (unused.length) {
    out.push("", "assets not used by any prefab or material:");
    for (const a of unused) out.push(`  ${a.id}: ${a.kind} ${a.w}x${a.h}px`);
  }
  return out.join("\n");
}
