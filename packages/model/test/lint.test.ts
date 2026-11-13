import { describe, expect, it } from "vitest";
import { applyTransaction, lintProject, canReach, buildNavGrid, findPath, describeScene, describeLibrary, type Command } from "../src";
import { fixtureProject } from "./fixture";

const rules = (cmds: Command[]) => lintProject(applyTransaction(fixtureProject(), cmds).doc).map((i) => i.rule);

describe("린트", () => {
  it("멀쩡한 장면에는 문제가 없다", () => {
    expect(lintProject(fixtureProject())).toEqual([]);
  });

  it("주인공이 없으면 알린다", () => {
    expect(rules([{ type: "removeEntity", scene: "main", id: "player" }])).toContain("player-count");
  });

  it("없는 대화를 가리키는 엔티티를 알린다", () => {
    expect(rules([{ type: "removeDialogue", scene: "main", id: "hello" }])).toContain("dangling");
  });

  it("없는 엔티티를 가리키는 이벤트를 알린다", () => {
    expect(
      rules([
        { type: "addEvent", scene: "main", event: { trigger: { type: "interact", entity: "elder" }, once: false, actions: [{ type: "dialogue", dialogue: "hello" }] } },
        { type: "removeEntity", scene: "main", id: "elder" },
      ]),
    ).toContain("dangling");
  });

  it("물 위에 선 캐릭터를 알린다", () => {
    const issues = lintProject(applyTransaction(fixtureProject(), [{ type: "moveEntity", scene: "main", id: "slime1", x: 24.5, y: 10 }]).doc);
    expect(issues.some((i) => i.rule === "blocked-character" && i.entity === "slime1")).toBe(true);
  });

  it("물로 둘러싸여 닿을 수 없는 NPC 를 알린다", () => {
    const ring: Command[] = [];
    for (let x = 12; x <= 16; x++) for (let y = 5; y <= 9; y++) if (x === 12 || x === 16 || y === 5 || y === 9) ring.push({ type: "paintTerrain", scene: "main", cells: [{ x, y, material: "water" }] });
    const issues = lintProject(applyTransaction(fixtureProject(), ring).doc);
    expect(issues.some((i) => i.rule === "unreachable" && i.entity === "elder")).toBe(true);
  });

  it("없는 에셋을 가리키는 참조를 알린다", () => {
    const doc = fixtureProject();
    const broken = { ...doc, assets: { ...doc.assets } };
    delete broken.assets.spr_barrel;
    expect(lintProject(broken).some((i) => i.rule === "missing-ref")).toBe(true);
  });
});

describe("통행", () => {
  const doc = fixtureProject();
  it("열린 땅은 갈 수 있고 물 한가운데는 갈 수 없다", () => {
    expect(canReach(doc, doc.scenes.main, { x: 10.5, y: 9.5 }, { x: 2, y: 14 })).toBe(true);
    expect(canReach(doc, doc.scenes.main, { x: 10.5, y: 9.5 }, { x: 25, y: 10 }, 0.2)).toBe(false);
  });

  it("집의 발자국은 길을 막고, 길 찾기는 돌아간다", () => {
    const nav = buildNavGrid(doc, doc.scenes.main);
    const tile = doc.style.tile;
    // 집(6, 6) 발밑 바로 안쪽은 막혀 있다
    expect(nav.blocked[Math.floor((5.5 * tile) / nav.cell) * nav.w + Math.floor((6 * tile) / nav.cell)]).toBe(1);
    const path = findPath(nav, 3 * tile, 8 * tile, 9 * tile, 3.5 * tile);
    expect(path).not.toBeNull();
    for (const p of path!) expect(nav.blocked[Math.floor(p.y / nav.cell) * nav.w + Math.floor(p.x / nav.cell)]).toBe(0);
  });
});

describe("요약", () => {
  it("장면과 자료 목록을 글로 적는다", () => {
    const doc = fixtureProject();
    const text = describeScene(doc, "main");
    expect(text).toContain("30x18");
    expect(text).toContain("elder: old [npc] at (14.5, 7.5)");
    expect(text).toContain("BLOCKS walking");
    expect(describeLibrary(doc)).toContain("slime");
  });
});
