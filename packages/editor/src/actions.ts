import { findPlayer, type Command } from "@age/model";
import { edit, sceneOf, select, toast, useStore, viewDoc } from "./store";
import { getView } from "./view";

const get = useStore.getState;

const snap = (v: number, step = 0.25) => Math.round(v / step) * step;

/** 떠 있는 패널에 가리지 않는 화면 가운데의 타일 좌표. */
export function viewCenterTile(): { x: number; y: number } {
  const view = getView(), s = get(), scene = sceneOf(viewDoc(s));
  if (!view || !scene) return { x: 1, y: 1 };
  const left = s.chatOpen ? 396 : 0;
  const t = view.screenToTile(left + (window.innerWidth - left) / 2, window.innerHeight / 2);
  return { x: Math.max(0.5, Math.min(scene.w - 0.5, snap(t.x, 0.5))), y: Math.max(1, Math.min(scene.h - 0.25, snap(t.y, 0.5))) };
}

export function deleteSelection(): void {
  const s = get(), doc = s.doc, sel = s.selection;
  if (!doc || !sel) return;
  const scene = doc.startScene;
  if (sel.kind === "entity") edit("지우기", [{ type: "removeEntity", scene, id: sel.id }]);
  else edit("광원 지우기", [{ type: "removeLight", scene, id: sel.id }]);
}

export function duplicateSelection(): void {
  const s = get(), doc = s.doc, sel = s.selection, scene = sceneOf(doc);
  if (!doc || !sel || !scene) return;
  if (sel.kind === "entity") {
    const e = scene.entities[sel.id];
    if (!e) return;
    if (doc.prefabs[e.prefab]?.kind === "player") return toast("주인공은 한 명만 둘 수 있어요");
    const created = edit("복제", [{ type: "addEntity", scene: scene.id, entity: { prefab: e.prefab, x: Math.min(scene.w - 0.5, e.x + 1), y: e.y, props: e.props } }]);
    if (created?.[0]) select({ kind: "entity", id: created[0] });
  } else {
    const l = scene.lights[sel.id];
    if (!l) return;
    const { id: _id, ...rest } = l;
    const created = edit("광원 복제", [{ type: "addLight", scene: scene.id, light: { ...rest, x: Math.min(scene.w, l.x + 1.5) } }]);
    if (created?.[0]) select({ kind: "light", id: created[0] });
  }
}

export function nudgeSelection(dx: number, dy: number): void {
  const s = get(), sel = s.selection, scene = sceneOf(s.doc);
  if (!sel || !scene) return;
  const clampX = (v: number) => Math.max(0, Math.min(scene.w, v)), clampY = (v: number) => Math.max(0, Math.min(scene.h, v));
  if (sel.kind === "entity") {
    const e = scene.entities[sel.id];
    if (e) edit("옮기기", [{ type: "moveEntity", scene: scene.id, id: e.id, x: clampX(e.x + dx), y: clampY(e.y + dy) }]);
  } else {
    const l = scene.lights[sel.id];
    if (l) edit("광원 옮기기", [{ type: "updateLight", scene: scene.id, id: l.id, patch: { x: clampX(l.x + dx), y: clampY(l.y + dy) } }]);
  }
}

export function placePrefab(prefabId: string): void {
  const s = get(), doc = s.doc, scene = sceneOf(doc);
  if (!doc || !scene) return;
  const prefab = doc.prefabs[prefabId];
  if (!prefab) return;
  if (prefab.kind === "player" && findPlayer(doc, scene)) return toast("주인공은 한 명만 둘 수 있어요");
  const at = viewCenterTile();
  const created = edit(`${prefab.name} 놓기`, [{ type: "addEntity", scene: scene.id, entity: { prefab: prefabId, x: at.x, y: at.y } }]);
  if (created?.[0]) select({ kind: "entity", id: created[0] });
}

export function addLight(): void {
  const s = get(), scene = sceneOf(s.doc);
  if (!scene) return;
  const at = viewCenterTile();
  const created = edit("광원 놓기", [{ type: "addLight", scene: scene.id, light: { x: at.x, y: at.y, color: "#ffd9a0", radius: 4, intensity: 0.8 } }]);
  if (created?.[0]) select({ kind: "light", id: created[0] });
}

export function flipSelection(): void {
  const s = get(), sel = s.selection, scene = sceneOf(s.doc);
  if (!s.doc || !scene || sel?.kind !== "entity") return;
  const e = scene.entities[sel.id];
  if (!e) return;
  const cmd: Command = { type: "setEntityProps", scene: scene.id, id: e.id, props: { flip: e.props?.flip ? null : true } };
  edit("좌우 뒤집기", [cmd]);
}

export function setTheme(theme: "light" | "dark" | "system"): void {
  if (theme === "system") {
    delete document.documentElement.dataset.theme;
    localStorage.removeItem("age.theme");
  } else {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("age.theme", theme);
  }
}

export function restoreTheme(): void {
  const t = localStorage.getItem("age.theme");
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
}
