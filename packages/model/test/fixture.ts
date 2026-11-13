import { applyTransaction, createBlankProject, type Command, type Project } from "../src";

/** 테스트용 작은 마을: 흙·풀·물, 집 한 채, 통, 주인공, NPC, 적 둘. 명령으로만 만든다. */
export const FIXTURE_COMMANDS: Command[] = [
  { type: "registerAsset", asset: { id: "tex_grass", kind: "texture", file: "grass.png", w: 72, h: 72, color: "#4f7a3a" } },
  { type: "registerAsset", asset: { id: "tex_water", kind: "texture", file: "water.png", w: 72, h: 72, color: "#3b6ea8" } },
  { type: "registerAsset", asset: { id: "spr_house", kind: "sprite", file: "house.png", w: 96, h: 120, color: "#8a5a3c" } },
  { type: "registerAsset", asset: { id: "spr_barrel", kind: "sprite", file: "barrel.png", w: 22, h: 30, color: "#a35f3a" } },
  { type: "registerAsset", asset: { id: "chr_hero", kind: "character", file: "hero.png", w: 140, h: 120, frames: { frameW: 28, frameH: 40, perRow: 5, rows: ["down", "up", "side"] }, color: "#d9a441" } },
  { type: "registerAsset", asset: { id: "chr_old", kind: "character", file: "old.png", w: 140, h: 120, frames: { frameW: 28, frameH: 40, perRow: 5, rows: ["down", "up", "side"] }, color: "#4a8a5c" } },
  { type: "registerAsset", asset: { id: "chr_slime", kind: "character", file: "slime.png", w: 145, h: 72, frames: { frameW: 29, frameH: 24, perRow: 5, rows: ["down", "up", "side"] }, color: "#3fa6a0" } },
  { type: "defineMaterial", material: { id: "grass", name: "풀", asset: "tex_grass", color: "#4f7a3a", walkable: true, priority: 3, edge: "soft" } },
  { type: "defineMaterial", material: { id: "water", name: "물", asset: "tex_water", color: "#3b6ea8", walkable: false, priority: -1, edge: "soft" } },
  { type: "definePrefab", prefab: { id: "house", name: "집", kind: "building", asset: "spr_house", props: {} } },
  { type: "definePrefab", prefab: { id: "barrel", name: "통", kind: "prop", asset: "spr_barrel", props: {} } },
  { type: "definePrefab", prefab: { id: "hero", name: "주인공", kind: "player", asset: "chr_hero", props: { hp: 6, speed: 4, damage: 1 } } },
  { type: "definePrefab", prefab: { id: "old", name: "노인", kind: "npc", asset: "chr_old", props: { name: "노인", behavior: "idle" } } },
  { type: "definePrefab", prefab: { id: "slime", name: "슬라임", kind: "enemy", asset: "chr_slime", props: { hp: 2, speed: 1.6, damage: 1, behavior: "chase", aggroRange: 5 } } },
  { type: "fillTerrain", scene: "main", rect: { x: 0, y: 0, w: 30, h: 3 }, material: "grass" },
  { type: "fillTerrain", scene: "main", rect: { x: 22, y: 8, w: 6, h: 4 }, material: "water" },
  { type: "addEntity", scene: "main", entity: { id: "player", prefab: "hero", x: 10.5, y: 9.5 } },
  { type: "addEntity", scene: "main", entity: { id: "home", prefab: "house", x: 6, y: 6 } },
  { type: "addEntity", scene: "main", entity: { id: "elder", prefab: "old", x: 14.5, y: 7.5, props: { dialogue: "hello" } } },
  { type: "addEntity", scene: "main", entity: { prefab: "barrel", x: 9.5, y: 6.5 } },
  { type: "addEntity", scene: "main", entity: { id: "slime1", prefab: "slime", x: 18.5, y: 13.5 } },
  { type: "setDialogue", scene: "main", dialogue: { id: "hello", nodes: [
    { id: "a", speaker: "노인", text: "어서 오게." },
    { id: "b", speaker: "노인", text: "역에 가 보겠나?", choices: [{ text: "네", next: "c" }, { text: "아니요", next: null }] },
    { id: "c", speaker: "노인", text: "조심하게.", next: null },
  ] } },
  { type: "addLight", scene: "main", light: { x: 12, y: 5, color: "#ffb46a", radius: 6, intensity: 0.9 } },
  { type: "setAmbient", scene: "main", color: "#7d7ab8" },
  { type: "addEvent", scene: "main", event: { trigger: { type: "touch", area: { x: 16, y: 12, w: 2, h: 2 } }, once: true, actions: [{ type: "flag", flag: "met", value: true }] } },
];

export function fixtureProject(): Project {
  return applyTransaction(createBlankProject("테스트"), FIXTURE_COMMANDS).doc;
}
