import { describe, expect, it } from "vitest";
import { applyTransaction, type Command, type Project } from "@age/model";
import { createWorld, step, getPlayer, getActor, currentLine, walkTo, talkTo, fight, NO_INPUT, STEP, bakeTerrain, type World, type Input, type SimEvent } from "../src";
import { fixtureProject } from "../../model/test/fixture";

function withCommands(cmds: Command[]): Project {
  return applyTransaction(fixtureProject(), cmds).doc;
}

function run(world: World, seconds: number, input: Partial<Input> = {}): SimEvent[] {
  const all: SimEvent[] = [];
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i++) all.push(...step(world, { ...NO_INPUT, ...input }));
  return all;
}

describe("이동과 충돌", () => {
  it("입력 방향으로 걷고 그쪽을 본다", () => {
    const world = createWorld(fixtureProject());
    const p = getPlayer(world)!;
    const x0 = p.x;
    run(world, 0.5, { moveX: 1 });
    expect(p.x).toBeCloseTo(x0 + 0.5 * 4 * 24, 0);
    expect(p.facing).toBe("right");
    expect(p.moving).toBe(true);
  });

  it("대각선으로 걸어도 빨라지지 않는다", () => {
    const world = createWorld(fixtureProject());
    const p = getPlayer(world)!;
    const x0 = p.x, y0 = p.y;
    run(world, 0.5, { moveX: 1, moveY: 1 });
    expect(Math.hypot(p.x - x0, p.y - y0)).toBeCloseTo(0.5 * 4 * 24, 0);
  });

  it("물에 막히고, 막힌 채 옆으로 미끄러진다", () => {
    const world = createWorld(withCommands([{ type: "moveEntity", scene: "main", id: "player", x: 21, y: 9.5 }]));
    const p = getPlayer(world)!;
    const y0 = p.y;
    run(world, 1, { moveX: 1, moveY: 0.5 });
    expect(p.x + p.w / 2).toBeLessThanOrEqual(22 * 24 + 0.01); // 물은 x=22 칸부터
    expect(p.y).toBeGreaterThan(y0 + 10);
  });

  it("집과 통 같은 고정물에 막힌다", () => {
    const world = createWorld(withCommands([{ type: "moveEntity", scene: "main", id: "player", x: 6, y: 9 }]));
    const p = getPlayer(world)!;
    run(world, 2, { moveY: -1 });
    // 집의 발밑은 y = 6 * 24
    expect(p.y - p.h).toBeGreaterThanOrEqual(6 * 24 - 0.01);
    expect(p.y).toBeLessThan(6 * 24 + 12);
  });

  it("장면 밖으로 나가지 못한다", () => {
    const world = createWorld(withCommands([{ type: "moveEntity", scene: "main", id: "player", x: 1, y: 9 }]));
    const p = getPlayer(world)!;
    run(world, 2, { moveX: -1 });
    expect(p.x - p.w / 2).toBeGreaterThanOrEqual(0);
  });
});

describe("전투", () => {
  const setup = () => withCommands([{ type: "moveEntity", scene: "main", id: "slime1", x: 11.6, y: 9.5 }, { type: "setEntityProps", scene: "main", id: "slime1", props: { behavior: "idle" } }]);

  it("앞에 있는 적을 때리면 체력이 줄고 밀려난다", () => {
    const world = createWorld(setup());
    const slime = getActor(world, "slime1")!;
    run(world, 0.1, { moveX: 1 });
    const x0 = slime.x;
    const events = [...step(world, { ...NO_INPUT, attack: true }), ...run(world, 0.3)];
    expect(events.some((e) => e.type === "hit" && e.target === "slime1")).toBe(true);
    expect(slime.hp).toBe(1);
    expect(slime.x).toBeGreaterThan(x0);
  });

  it("한 번 휘두르면 한 번만 맞는다", () => {
    const world = createWorld(setup());
    run(world, 0.1, { moveX: 1 });
    const events = [...step(world, { ...NO_INPUT, attack: true }), ...run(world, 0.25)];
    expect(events.filter((e) => e.type === "hit").length).toBe(1);
  });

  it("체력이 다하면 죽는다", () => {
    const world = createWorld(setup());
    const slime = getActor(world, "slime1")!;
    run(world, 0.1, { moveX: 1 });
    const events: SimEvent[] = [];
    for (let i = 0; i < 6 && slime.alive; i++) {
      // 밀려난 적을 따라가서 다시 친다
      events.push(...run(world, 0.5, { moveX: slime.x > getPlayer(world)!.x + 22 ? 1 : 0 }));
      events.push(...step(world, { ...NO_INPUT, attack: true }), ...run(world, 0.2));
    }
    expect(slime.alive).toBe(false);
    expect(events.some((e) => e.type === "death" && e.actor === "slime1")).toBe(true);
  });

  it("등 뒤의 적은 맞지 않는다", () => {
    const world = createWorld(setup());
    run(world, 0.1, { moveX: -1 });
    const events = [...step(world, { ...NO_INPUT, attack: true }), ...run(world, 0.3)];
    expect(events.some((e) => e.type === "hit")).toBe(false);
  });

  it("쫓아오는 적에게 닿으면 다치고 잠시 무적이 된다", () => {
    const world = createWorld(withCommands([{ type: "moveEntity", scene: "main", id: "slime1", x: 12.5, y: 9.5 }]));
    const p = getPlayer(world)!;
    const events = run(world, 3);
    const hits = events.filter((e) => e.type === "hit" && e.target === "player");
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits.length).toBeLessThanOrEqual(4); // 무적 시간 0.9초
    expect(p.hp).toBe(6 - hits.length);
  });

  it("주인공이 죽으면 상태가 바뀌고 더 진행하지 않는다", () => {
    const world = createWorld(withCommands([
      { type: "moveEntity", scene: "main", id: "slime1", x: 12, y: 9.5 },
      { type: "updatePrefab", id: "hero", patch: { props: { hp: 1 } } },
    ]));
    const events = run(world, 3);
    expect(world.status).toBe("dead");
    expect(events.some((e) => e.type === "player-dead")).toBe(true);
  });

  it("멀리 있는 적은 쫓아오지 않는다", () => {
    const world = createWorld(fixtureProject());
    const slime = getActor(world, "slime1")!;
    const x0 = slime.x, y0 = slime.y;
    run(world, 2);
    expect(Math.hypot(slime.x - x0, slime.y - y0)).toBeLessThan(1);
  });

  it("원거리 적은 투사체를 쏘고 맞으면 다친다", () => {
    const world = createWorld(withCommands([
      { type: "moveEntity", scene: "main", id: "slime1", x: 14, y: 12.5 },
      { type: "moveEntity", scene: "main", id: "player", x: 10.5, y: 12.5 },
      { type: "setEntityProps", scene: "main", id: "slime1", props: { behavior: "ranged" } },
    ]));
    const events = run(world, 4);
    expect(events.some((e) => e.type === "shoot")).toBe(true);
    expect(events.some((e) => e.type === "hit" && e.target === "player")).toBe(true);
  });

  it("순찰하는 적은 두 지점을 오간다", () => {
    const world = createWorld(withCommands([
      { type: "setEntityProps", scene: "main", id: "slime1", props: { behavior: "patrol", patrol: [{ x: 3, y: 0 }], aggroRange: 0 } },
    ]));
    const slime = getActor(world, "slime1")!;
    let maxX = slime.x;
    for (let i = 0; i < 12 / STEP; i++) { step(world, NO_INPUT); maxX = Math.max(maxX, slime.x); }
    expect(maxX).toBeGreaterThan(slime.homeX + 2.5 * 24);
  });
});

describe("대화와 이벤트", () => {
  const near = () => withCommands([{ type: "moveEntity", scene: "main", id: "player", x: 14.5, y: 8.4 }]);

  it("NPC 앞에서 말을 걸면 대화가 열리고 차례로 넘어간다", () => {
    const world = createWorld(near());
    run(world, 0.05, { moveY: -1 });
    step(world, { ...NO_INPUT, interact: true });
    expect(currentLine(world)).toMatchObject({ speaker: "노인", text: "어서 오게." });
    step(world, NO_INPUT);
    step(world, { ...NO_INPUT, interact: true });
    expect(currentLine(world)?.choices).toEqual(["네", "아니요"]);
  });

  it("선택지에 따라 갈린다", () => {
    for (const [down, expected] of [[false, "조심하게."], [true, null]] as const) {
      const world = createWorld(near());
      run(world, 0.05, { moveY: -1 });
      for (const _ of [0, 1]) { step(world, { ...NO_INPUT, interact: true }); step(world, NO_INPUT); }
      if (down) { step(world, { ...NO_INPUT, moveY: 1 }); step(world, NO_INPUT); }
      step(world, { ...NO_INPUT, interact: true });
      expect(currentLine(world)?.text ?? null).toBe(expected);
    }
  });

  it("대화 중에는 움직이지 않고 적도 멈춘다", () => {
    const world = createWorld(near());
    const p = getPlayer(world)!;
    run(world, 0.05, { moveY: -1 });
    step(world, { ...NO_INPUT, interact: true });
    const x0 = p.x;
    run(world, 0.5, { moveX: 1 });
    expect(p.x).toBe(x0);
    expect(world.dialogue).not.toBeNull();
  });

  it("너무 멀면 말을 걸 수 없다", () => {
    const world = createWorld(fixtureProject());
    step(world, { ...NO_INPUT, interact: true });
    expect(world.dialogue).toBeNull();
  });

  it("접촉 이벤트는 구역에 들어설 때 한 번 실행된다", () => {
    const world = createWorld(withCommands([{ type: "moveEntity", scene: "main", id: "player", x: 15, y: 13 }, { type: "removeEntity", scene: "main", id: "slime1" }]));
    const first = run(world, 1.2, { moveX: 1 });
    expect(first.filter((e) => e.type === "event").length).toBe(1);
    expect(world.flags.met).toBe(true);
    run(world, 2, { moveX: -1 });
    const again = run(world, 2, { moveX: 1 });
    expect(again.filter((e) => e.type === "event").length).toBe(0);
  });

  it("시작 이벤트가 대화·이동·카메라·깃발을 차례로 실행한다", () => {
    const world = createWorld(withCommands([
      { type: "addEvent", scene: "main", event: { id: "intro", trigger: { type: "start" }, once: true, actions: [
        { type: "dialogue", dialogue: "hello" },
        { type: "move", entity: "elder", to: { x: 16.5, y: 8.5 } },
        { type: "camera", to: { x: 5, y: 5 }, seconds: 0.5 },
        { type: "flag", flag: "intro-done", value: true },
      ] } },
    ]));
    step(world, NO_INPUT);
    expect(currentLine(world)?.text).toBe("어서 오게.");
    // 대화를 끝까지 넘긴다 (첫 선택지 → "조심하게." → 끝)
    for (let i = 0; i < 6 && world.dialogue; i++) { step(world, { ...NO_INPUT, interact: true }); step(world, NO_INPUT); }
    expect(world.dialogue).toBeNull();
    const elder = getActor(world, "elder")!;
    // 이벤트 중에는 주인공이 조작되지 않는다
    const p = getPlayer(world)!;
    const px = p.x;
    run(world, 0.5, { moveX: 1 });
    expect(p.x).toBe(px);
    run(world, 3);
    expect(elder.x / 24).toBeCloseTo(16.5, 0);
    expect(world.flags["intro-done"]).toBe(true);
    expect(world.cameraTarget).toBeNull();
    expect(world.running.length).toBe(0);
  });

  it("조건이 맞을 때만 실행된다", () => {
    const world = createWorld(withCommands([
      { type: "moveEntity", scene: "main", id: "player", x: 14.5, y: 8.4 },
      { type: "addEvent", scene: "main", event: { id: "gate", trigger: { type: "interact", entity: "elder" }, condition: { flag: "met", equals: true }, once: false, actions: [{ type: "flag", flag: "opened", value: true }] } },
    ]));
    run(world, 0.05, { moveY: -1 });
    step(world, { ...NO_INPUT, interact: true });
    // 조건이 안 맞으면 원래 대화가 열린다
    expect(world.flags.opened).toBeUndefined();
    expect(world.dialogue).not.toBeNull();
  });
});

describe("플레이테스트", () => {
  it("장애물을 돌아 목표까지 걷는다", () => {
    const r = walkTo(fixtureProject(), "main", { x: 3, y: 5 });
    expect(r.reached).toBe(true);
    expect(r.seconds).toBeLessThan(15);
  });

  it("집 뒤쪽 좁은 곳으로도 돌아간다", () => {
    const r = walkTo(fixtureProject(), "main", { x: 6, y: 3.5 });
    expect(r.reached).toBe(true);
  });

  it("물 한가운데에는 닿지 못하고 그 까닭을 적는다", () => {
    const r = walkTo(fixtureProject(), "main", { x: 25, y: 10 }, { maxSeconds: 12 });
    expect(r.reached).toBe(false);
  });

  it("NPC 에게 걸어가 대화를 끝까지 본다", () => {
    const r = talkTo(fixtureProject(), "main", "elder");
    expect(r.talked).toBe(true);
    expect(r.lines[0]).toContain("어서 오게.");
    expect(r.lines.length).toBe(3);
  });

  it("대화가 없는 대상은 실패로 알린다", () => {
    const r = talkTo(fixtureProject(), "main", "home");
    expect(r.talked).toBe(false);
    expect(r.notes.join(" ")).toMatch(/nothing happened|could not/);
  });

  it("적과 싸워 이긴다", () => {
    const r = fight(fixtureProject(), "main", "slime1");
    expect(r.outcome).toBe("enemy-defeated");
    expect(r.playerHpLeft).toBeGreaterThan(0);
  });

  it("너무 센 적에게는 진다", () => {
    const r = fight(withCommands([{ type: "updatePrefab", id: "slime", patch: { props: { hp: 60, damage: 6, speed: 3 } } }]), "main", "slime1");
    expect(r.outcome).toBe("player-died");
  });

  it("같은 문서는 같은 결과를 낸다", () => {
    const a = fight(fixtureProject(), "main", "slime1"), b = fight(fixtureProject(), "main", "slime1");
    expect(a).toEqual(b);
  });

  it("문서를 고치지 않는다", () => {
    const doc = fixtureProject();
    const before = JSON.stringify(doc);
    fight(doc, "main", "slime1");
    walkTo(doc, "main", { x: 3, y: 5 });
    expect(JSON.stringify(doc)).toBe(before);
  });
});

describe("바닥 굽기", () => {
  const solid = (r: number, g: number, b: number) => {
    const pixels = new Uint8ClampedArray(8 * 8 * 4);
    for (let i = 0; i < 64; i++) { pixels[i * 4] = r; pixels[i * 4 + 1] = g; pixels[i * 4 + 2] = b; pixels[i * 4 + 3] = 255; }
    return pixels;
  };
  const materials = [
    { pixels: solid(100, 60, 30), size: 8, priority: 1, edge: "soft" as const },
    { pixels: solid(40, 160, 60), size: 8, priority: 3, edge: "soft" as const },
    { pixels: solid(120, 120, 120), size: 8, priority: 2, edge: "hard" as const },
  ];
  const at = (b: { w: number; data: Uint8ClampedArray }, x: number, y: number) => [b.data[(y * b.w + x) * 4], b.data[(y * b.w + x) * 4 + 1], b.data[(y * b.w + x) * 4 + 2]];

  it("칸 안쪽은 제 재질이고, 높은 재질은 낮은 칸으로 번진다", () => {
    // 왼쪽 두 칸 흙, 오른쪽 두 칸 풀
    const baked = bakeTerrain({ w: 4, h: 3, tile: 24, cells: [0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1], materials });
    expect(baked.w).toBe(96);
    expect(at(baked, 10, 36)).toEqual([100, 60, 30]);
    expect(at(baked, 80, 36)).toEqual([40, 160, 60]);
    // 경계(x = 48) 바로 왼쪽 열 어딘가에 풀색 기운이 번져 있다
    let spilled = 0;
    for (let y = 0; y < 72; y++) for (let x = 42; x < 48; x++) if (at(baked, x, y)[1] > 100) spilled++;
    expect(spilled).toBeGreaterThan(20);
    // 풀 칸 쪽으로는 흙이 넘어오지 않는다
    for (let y = 0; y < 72; y++) for (let x = 48; x < 54; x++) expect(at(baked, x, y)[1]).toBeGreaterThan(100);
  });

  it("딱딱한 재질은 칸 경계를 넘지 않고 그늘만 드리운다", () => {
    const baked = bakeTerrain({ w: 4, h: 1, tile: 24, cells: [0, 0, 2, 2], materials });
    for (let x = 0; x < 48; x++) expect(at(baked, x, 12)[0]).toBeGreaterThan(at(baked, x, 12)[2]); // 흙 계열 그대로
    expect(at(baked, 47, 12)[0]).toBeLessThan(100); // 경계 옆 그늘
    expect(at(baked, 20, 12)).toEqual([100, 60, 30]);
  });

  it("일부만 구워도 전체를 구운 것과 같다", () => {
    const cells = [0, 1, 0, 2, 1, 1, 0, 2, 0, 0, 2, 2];
    const full = bakeTerrain({ w: 4, h: 3, tile: 24, cells, materials });
    const part = bakeTerrain({ w: 4, h: 3, tile: 24, cells, materials }, { x: 1, y: 1, w: 2, h: 2 });
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) expect(at(part, x, y)).toEqual(at(full, x + 24, y + 24));
  });
});
