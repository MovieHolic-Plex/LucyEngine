import { describe, expect, it } from "vitest";
import {
  applyCommand, applyTransaction, CommandError, createBlankProject, validateProject, runTransaction, commit, emptyHistory, goTo,
  type Command, type Project,
} from "../src";
import { FIXTURE_COMMANDS, fixtureProject } from "./fixture";

function roundTrip(doc: Project, cmd: Command): Project {
  const { doc: after, inverse } = applyCommand(doc, cmd);
  validateProject(after);
  const back = applyCommand(after, inverse).doc;
  expect(back).toEqual(doc);
  return after;
}

describe("명령 왕복: 적용 후 역명령 = 원본", () => {
  const base = fixtureProject();
  const cases: Array<[string, Command]> = [
    ["paintTerrain", { type: "paintTerrain", scene: "main", cells: [{ x: 1, y: 5, material: "grass" }, { x: 2, y: 5, material: "water" }, { x: 1, y: 5, material: "water" }] }],
    ["fillTerrain", { type: "fillTerrain", scene: "main", rect: { x: 3, y: 10, w: 4, h: 3 }, material: "grass" }],
    ["resizeScene 줄이기", { type: "resizeScene", scene: "main", w: 12, h: 10, fill: "grass" }],
    ["resizeScene 늘리기", { type: "resizeScene", scene: "main", w: 40, h: 24, fill: "water" }],
    ["defineMaterial", { type: "defineMaterial", material: { id: "sand", name: "모래", asset: null, color: "#d8c38a", walkable: true, priority: 2, edge: "soft" } }],
    ["updateMaterial", { type: "updateMaterial", id: "grass", patch: { walkable: false, priority: 9 } }],
    ["addEntity (id 자동)", { type: "addEntity", scene: "main", entity: { prefab: "barrel", x: 3, y: 12 } }],
    ["addEntity (id 지정)", { type: "addEntity", scene: "main", entity: { id: "b2", prefab: "barrel", x: 4, y: 12, props: { solid: false } } }],
    ["moveEntity", { type: "moveEntity", scene: "main", id: "elder", x: 2.5, y: 14 }],
    ["removeEntity", { type: "removeEntity", scene: "main", id: "elder" }],
    ["setEntityProps 추가", { type: "setEntityProps", scene: "main", id: "slime1", props: { hp: 5, behavior: "patrol" } }],
    ["setEntityProps 삭제", { type: "setEntityProps", scene: "main", id: "elder", props: { dialogue: null } }],
    ["registerAsset", { type: "registerAsset", asset: { id: "spr_crate", kind: "sprite", file: null, w: 24, h: 24, color: "#886644" } }],
    ["replaceAsset", { type: "replaceAsset", id: "spr_barrel", asset: { file: "barrel2.png", w: 24, h: 32 } }],
    ["definePrefab", { type: "definePrefab", prefab: { id: "lamp", name: "가로등", kind: "prop", asset: "spr_barrel", props: { light: { color: "#ffcc88", radius: 5, intensity: 1 } } } }],
    ["updatePrefab", { type: "updatePrefab", id: "slime", patch: { name: "큰 슬라임", props: { hp: 9, aggroRange: null } } }],
    ["addLight", { type: "addLight", scene: "main", light: { x: 3, y: 3, color: "#66e0d0", radius: 4, intensity: 0.7, flicker: true } }],
    ["setAmbient", { type: "setAmbient", scene: "main", color: "#223355" }],
    ["setPost", { type: "setPost", scene: "main", patch: { bloom: 0.8 } }],
    ["setDialogue", { type: "setDialogue", scene: "main", dialogue: { id: "bye", nodes: [{ id: "x", speaker: "노인", text: "잘 가게." }] } }],
    ["removeDialogue", { type: "removeDialogue", scene: "main", id: "hello" }],
    ["addEvent", { type: "addEvent", scene: "main", event: { trigger: { type: "start" }, once: true, actions: [{ type: "dialogue", dialogue: "hello" }] } }],
    ["setStyle", { type: "setStyle", patch: { mood: "rainy evening", outlineSteps: 3 } }],
    ["renameProject", { type: "renameProject", name: "기차역 마을" }],
    ["renameScene", { type: "renameScene", scene: "main", name: "광장" }],
  ];
  for (const [name, cmd] of cases) it(name, () => void roundTrip(base, cmd));

  it("만든 뒤 고치고 지우는 명령들", () => {
    let doc = base;
    doc = roundTrip(doc, { type: "addLight", scene: "main", light: { id: "lx", x: 3, y: 3, color: "#ffffff", radius: 4, intensity: 1 } });
    doc = roundTrip(doc, { type: "updateLight", scene: "main", id: "lx", patch: { radius: 9, flicker: true } });
    doc = roundTrip(doc, { type: "removeLight", scene: "main", id: "lx" });
    doc = roundTrip(doc, { type: "addEvent", scene: "main", event: { id: "evx", trigger: { type: "interact", entity: "elder" }, once: false, actions: [{ type: "camera", to: { x: 3, y: 3 }, seconds: 1 }] } });
    doc = roundTrip(doc, { type: "updateEvent", scene: "main", id: "evx", patch: { once: true } });
    doc = roundTrip(doc, { type: "removeEvent", scene: "main", id: "evx" });
    doc = roundTrip(doc, { type: "defineMaterial", material: { id: "tmp", name: "임시", asset: null, color: "#000000", walkable: true, priority: 0, edge: "hard" } });
    doc = roundTrip(doc, { type: "removeMaterial", id: "tmp" });
    doc = roundTrip(doc, { type: "registerAsset", asset: { id: "tmp_a", kind: "sprite", file: null, w: 8, h: 8, color: "#000000" } });
    doc = roundTrip(doc, { type: "definePrefab", prefab: { id: "tmp_p", name: "임시", kind: "prop", asset: "tmp_a", props: {} } });
    doc = roundTrip(doc, { type: "removePrefab", id: "tmp_p" });
    roundTrip(doc, { type: "removeAsset", id: "tmp_a" });
  });

  it("id 를 자동으로 붙이고 일련번호도 되돌린다", () => {
    const r = applyCommand(base, { type: "addEntity", scene: "main", entity: { prefab: "barrel", x: 1, y: 12 } });
    expect(r.created).toMatch(/^e\d+$/);
    expect(r.doc.meta.seq).toBeGreaterThan(base.meta.seq);
    expect(applyCommand(r.doc, r.inverse).doc.meta.seq).toBe(base.meta.seq);
  });

  it("줄인 장면 밖의 엔티티를 안으로 옮긴다", () => {
    const after = applyCommand(base, { type: "resizeScene", scene: "main", w: 12, h: 10, fill: "grass" }).doc;
    for (const e of Object.values(after.scenes.main.entities)) {
      expect(e.x).toBeLessThanOrEqual(12);
      expect(e.y).toBeLessThanOrEqual(10);
    }
    expect(after.scenes.main.terrain.length).toBe(120);
  });
});

describe("검사에 실패하면 문서는 그대로다", () => {
  const base = fixtureProject();
  const bad: Array<[string, Command, string]> = [
    ["없는 장면", { type: "setAmbient", scene: "nope", color: "#000000" }, "no-scene"],
    ["장면 밖 칸", { type: "paintTerrain", scene: "main", cells: [{ x: 99, y: 0, material: "grass" }] }, "out-of-bounds"],
    ["없는 재질", { type: "paintTerrain", scene: "main", cells: [{ x: 0, y: 0, material: "lava" }] }, "no-material"],
    ["없는 프리팹", { type: "addEntity", scene: "main", entity: { prefab: "dragon", x: 1, y: 1 } }, "no-prefab"],
    ["장면 밖 엔티티", { type: "addEntity", scene: "main", entity: { prefab: "barrel", x: -3, y: 1 } }, "out-of-bounds"],
    ["두 번째 주인공", { type: "addEntity", scene: "main", entity: { prefab: "hero", x: 3, y: 12 } }, "second-player"],
    ["겹치는 id", { type: "addEntity", scene: "main", entity: { id: "elder", prefab: "barrel", x: 3, y: 12 } }, "exists"],
    ["잘못된 속성", { type: "setEntityProps", scene: "main", id: "slime1", props: { hp: -4 } }, "invalid"],
    ["쓰이는 에셋 삭제", { type: "removeAsset", id: "spr_barrel" }, "in-use"],
    ["쓰이는 프리팹 삭제", { type: "removePrefab", id: "barrel" }, "in-use"],
    ["쓰이는 재질 삭제", { type: "removeMaterial", id: "grass" }, "in-use"],
    ["없는 에셋의 프리팹", { type: "definePrefab", prefab: { id: "x", name: "x", kind: "prop", asset: "none", props: {} } }, "no-asset"],
    ["잘못된 색", { type: "setAmbient", scene: "main", color: "blue" }, "invalid"],
    ["대화의 끊긴 next", { type: "setDialogue", scene: "main", dialogue: { id: "d", nodes: [{ id: "a", speaker: "s", text: "t", next: "zzz" }] } }, "invalid"],
    ["모르는 명령", { type: "explode" } as unknown as Command, "unknown-command"],
  ];
  for (const [name, cmd, code] of bad)
    it(name, () => {
      const before = JSON.stringify(base);
      let caught: unknown;
      try { applyCommand(base, cmd); } catch (e) { caught = e; }
      expect(caught).toBeInstanceOf(CommandError);
      expect((caught as CommandError).code).toBe(code);
      expect(JSON.stringify(base)).toBe(before);
    });

  it("트랜잭션은 하나라도 실패하면 전체가 적용되지 않는다", () => {
    const cmds: Command[] = [
      { type: "setAmbient", scene: "main", color: "#000000" },
      { type: "addEntity", scene: "main", entity: { prefab: "dragon", x: 1, y: 1 } },
    ];
    let caught: CommandError | undefined;
    try { applyTransaction(base, cmds); } catch (e) { caught = e as CommandError; }
    expect(caught?.index).toBe(1);
    expect(base.scenes.main.ambient).toBe("#7d7ab8");
  });
});

describe("히스토리", () => {
  it("명령으로 장면을 만들고, 되돌리고, 다시 적용한다", () => {
    const blank = createBlankProject("테스트");
    let doc = blank;
    let history = emptyHistory();
    const snapshots: Project[] = [doc];
    FIXTURE_COMMANDS.forEach((cmd, i) => {
      const r = runTransaction(doc, [cmd], { id: `t${i}`, label: cmd.type, source: "user", at: i });
      doc = r.doc;
      history = commit(history, r.record);
      snapshots.push(doc);
    });
    expect(doc).toEqual(fixtureProject());
    for (const target of [10, 0, FIXTURE_COMMANDS.length, 3, 17]) {
      const r = goTo(doc, history, target);
      doc = r.doc;
      history = r.history;
      expect(doc).toEqual(snapshots[target]);
    }
  });

  it("과거 시점에서 새로 편집하면 그 뒤의 기록은 버린다", () => {
    let doc = fixtureProject();
    let history = emptyHistory();
    for (const color of ["#111111", "#222222", "#333333"]) {
      const r = runTransaction(doc, [{ type: "setAmbient", scene: "main", color }], { id: color, label: "ambient", source: "user", at: 0 });
      doc = r.doc;
      history = commit(history, r.record);
    }
    ({ doc, history } = goTo(doc, history, 1));
    const r = runTransaction(doc, [{ type: "setAmbient", scene: "main", color: "#abcdef" }], { id: "new", label: "ambient", source: "ai", at: 0 });
    history = commit(history, r.record);
    expect(history.records.map((x) => x.id)).toEqual(["#111111", "new"]);
    expect(history.cursor).toBe(2);
  });
});
