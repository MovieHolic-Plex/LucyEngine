import {
  type Project, type Asset, type Material, type Prefab, type EntityProps, type Light, type Post, type Dialogue, type GameEvent, type Style, type Scene,
  AssetSchema, MaterialSchema, PrefabSchema, EntityPropsSchema, EntitySchema, LightSchema, PostSchema, DialogueSchema, GameEventSchema, StyleSchema,
} from "./schema";

// 명령 계층: 프로젝트 문서를 바꾸는 유일한 통로.
// applyCommand 는 순수 함수이고, 적용한 결과와 되돌리는 명령을 함께 돌려준다.

/** null 은 "이 속성을 지운다"는 뜻이다. */
type Nullable<T> = { [K in keyof T]?: T[K] | null };

export type Command =
  | { type: "paintTerrain"; scene: string; cells: Array<{ x: number; y: number; material: string }> }
  | { type: "fillTerrain"; scene: string; rect: { x: number; y: number; w: number; h: number }; material: string }
  | { type: "resizeScene"; scene: string; w: number; h: number; fill: string }
  | { type: "defineMaterial"; material: Material }
  | { type: "updateMaterial"; id: string; patch: Partial<Omit<Material, "id">> }
  | { type: "removeMaterial"; id: string }
  | { type: "addEntity"; scene: string; entity: { id?: string; prefab: string; x: number; y: number; props?: EntityProps } }
  | { type: "moveEntity"; scene: string; id: string; x: number; y: number }
  | { type: "removeEntity"; scene: string; id: string }
  | { type: "setEntityProps"; scene: string; id: string; props: Nullable<EntityProps> }
  | { type: "registerAsset"; asset: Asset }
  | { type: "replaceAsset"; id: string; asset: Partial<Omit<Asset, "id">> }
  | { type: "removeAsset"; id: string }
  | { type: "definePrefab"; prefab: Prefab }
  | { type: "updatePrefab"; id: string; patch: { name?: string; kind?: Prefab["kind"]; asset?: string; props?: Nullable<EntityProps> } }
  | { type: "removePrefab"; id: string }
  | { type: "addLight"; scene: string; light: Omit<Light, "id"> & { id?: string } }
  | { type: "updateLight"; scene: string; id: string; patch: Nullable<Omit<Light, "id">> }
  | { type: "removeLight"; scene: string; id: string }
  | { type: "setAmbient"; scene: string; color: string }
  | { type: "setPost"; scene: string; patch: Partial<Post> }
  | { type: "setDialogue"; scene: string; dialogue: Dialogue }
  | { type: "removeDialogue"; scene: string; id: string }
  | { type: "addEvent"; scene: string; event: Omit<GameEvent, "id"> & { id?: string } }
  | { type: "updateEvent"; scene: string; id: string; patch: Partial<Omit<GameEvent, "id">> }
  | { type: "removeEvent"; scene: string; id: string }
  | { type: "setStyle"; patch: Partial<Style> }
  | { type: "renameProject"; name: string }
  | { type: "renameScene"; scene: string; name: string }
  /** 역명령 전용: 경로별로 예전 값을 되돌려 놓는다. */
  | { type: "restore"; writes: Write[] };

export type CommandType = Command["type"];

export interface Write {
  path: string[];
  value?: unknown;
  /** true 면 그 자리를 지운다. */
  absent?: boolean;
}

export class CommandError extends Error {
  constructor(readonly code: string, message: string, readonly index?: number) {
    super(message);
    this.name = "CommandError";
  }
}

function fail(code: string, message: string): never {
  throw new CommandError(code, message);
}

function getIn(obj: unknown, path: string[]): unknown {
  let cur: any = obj;
  for (const k of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[k];
  }
  return cur;
}

function setIn(obj: any, path: string[], write: Write): any {
  if (path.length === 0) return write.value;
  const [k, ...rest] = path;
  const base = obj && typeof obj === "object" ? obj : {};
  if (rest.length === 0) {
    if (write.absent) {
      if (!(k in base)) return base;
      const { [k]: _gone, ...others } = base;
      return others;
    }
    return { ...base, [k]: write.value };
  }
  return { ...base, [k]: setIn(base[k], rest, write) };
}

function parse<T>(schema: { safeParse(v: unknown): { success: boolean; data?: T; error?: { issues: Array<{ path: PropertyKey[]; message: string }> } } }, value: unknown, what: string): T {
  const r = schema.safeParse(value);
  if (!r.success) {
    const issue = r.error!.issues[0];
    fail("invalid", `${what}: ${issue.path.join(".") || "(값)"} ${issue.message}`);
  }
  return r.data as T;
}

/** null 로 온 속성은 지우고 나머지는 덮어쓴다. */
function mergeNullable<T extends object>(base: T, patch: Nullable<T>): T {
  const out: any = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k];
    else if (v !== undefined) out[k] = v;
  }
  return out;
}

function sceneOf(doc: Project, id: string): Scene {
  return doc.scenes[id] ?? fail("no-scene", `장면 ${id} 이 없습니다`);
}

function newId(doc: Project, prefix: string, taken: Record<string, unknown>, seqRef: { seq: number }): string {
  let id: string;
  do {
    seqRef.seq++;
    id = `${prefix}${seqRef.seq}`;
  } while (id in taken);
  return id;
}

interface Planned {
  writes: Write[];
  inverse?: Command;
  created?: string;
}

function plan(doc: Project, cmd: Command): Planned {
  const seqRef = { seq: doc.meta.seq };
  const withSeq = (p: Planned): Planned =>
    seqRef.seq === doc.meta.seq ? p : { ...p, writes: [...p.writes, { path: ["meta", "seq"], value: seqRef.seq }] };

  switch (cmd.type) {
    case "paintTerrain": {
      const s = sceneOf(doc, cmd.scene);
      if (cmd.cells.length === 0) return { writes: [] };
      const terrain = s.terrain.slice();
      const before = new Map<number, string>();
      for (const c of cmd.cells) {
        if (!Number.isInteger(c.x) || !Number.isInteger(c.y) || c.x < 0 || c.y < 0 || c.x >= s.w || c.y >= s.h)
          fail("out-of-bounds", `칸 (${c.x}, ${c.y}) 은 장면(${s.w}×${s.h}) 밖입니다`);
        if (!doc.materials[c.material]) fail("no-material", `재질 ${c.material} 이 없습니다`);
        const i = c.y * s.w + c.x;
        if (!before.has(i)) before.set(i, terrain[i]);
        terrain[i] = c.material;
      }
      const inverse: Command = {
        type: "paintTerrain",
        scene: cmd.scene,
        cells: [...before].map(([i, material]) => ({ x: i % s.w, y: Math.floor(i / s.w), material })),
      };
      return { writes: [{ path: ["scenes", cmd.scene, "terrain"], value: terrain }], inverse };
    }
    case "fillTerrain": {
      const s = sceneOf(doc, cmd.scene);
      if (!doc.materials[cmd.material]) fail("no-material", `재질 ${cmd.material} 이 없습니다`);
      const { x, y, w, h } = cmd.rect;
      if (![x, y, w, h].every(Number.isInteger) || w <= 0 || h <= 0 || x < 0 || y < 0 || x + w > s.w || y + h > s.h)
        fail("out-of-bounds", `구역 (${x}, ${y}, ${w}×${h}) 이 장면(${s.w}×${s.h}) 밖으로 나갑니다`);
      const cells: Array<{ x: number; y: number; material: string }> = [];
      for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) cells.push({ x: i, y: j, material: cmd.material });
      return plan(doc, { type: "paintTerrain", scene: cmd.scene, cells });
    }
    case "resizeScene": {
      const s = sceneOf(doc, cmd.scene);
      if (!doc.materials[cmd.fill]) fail("no-material", `재질 ${cmd.fill} 이 없습니다`);
      if (!Number.isInteger(cmd.w) || !Number.isInteger(cmd.h) || cmd.w < 4 || cmd.h < 4 || cmd.w > 96 || cmd.h > 96)
        fail("invalid", "장면 크기는 4~96칸이어야 합니다");
      const terrain: string[] = new Array(cmd.w * cmd.h);
      for (let y = 0; y < cmd.h; y++)
        for (let x = 0; x < cmd.w; x++) terrain[y * cmd.w + x] = x < s.w && y < s.h ? s.terrain[y * s.w + x] : cmd.fill;
      const writes: Write[] = [
        { path: ["scenes", cmd.scene, "w"], value: cmd.w },
        { path: ["scenes", cmd.scene, "h"], value: cmd.h },
        { path: ["scenes", cmd.scene, "terrain"], value: terrain },
      ];
      // 밖으로 밀려난 엔티티와 광원은 안쪽 가장자리로 옮긴다
      for (const e of Object.values(s.entities))
        if (e.x > cmd.w || e.y > cmd.h)
          writes.push({ path: ["scenes", cmd.scene, "entities", e.id], value: { ...e, x: Math.min(e.x, cmd.w - 0.5), y: Math.min(e.y, cmd.h - 0.5) } });
      for (const l of Object.values(s.lights))
        if (l.x > cmd.w || l.y > cmd.h)
          writes.push({ path: ["scenes", cmd.scene, "lights", l.id], value: { ...l, x: Math.min(l.x, cmd.w - 0.5), y: Math.min(l.y, cmd.h - 0.5) } });
      return { writes };
    }

    case "defineMaterial": {
      const m = parse(MaterialSchema, cmd.material, "재질");
      if (m.asset && !doc.assets[m.asset]) fail("no-asset", `에셋 ${m.asset} 이 없습니다`);
      return { writes: [{ path: ["materials", m.id], value: m }], created: m.id };
    }
    case "updateMaterial": {
      const cur = doc.materials[cmd.id] ?? fail("no-material", `재질 ${cmd.id} 이 없습니다`);
      const m = parse(MaterialSchema, { ...cur, ...cmd.patch, id: cmd.id }, "재질");
      if (m.asset && !doc.assets[m.asset]) fail("no-asset", `에셋 ${m.asset} 이 없습니다`);
      return { writes: [{ path: ["materials", cmd.id], value: m }] };
    }
    case "removeMaterial": {
      if (!doc.materials[cmd.id]) fail("no-material", `재질 ${cmd.id} 이 없습니다`);
      for (const s of Object.values(doc.scenes)) if (s.terrain.includes(cmd.id)) fail("in-use", `재질 ${cmd.id} 은 장면 ${s.id} 에서 쓰이고 있습니다`);
      return { writes: [{ path: ["materials", cmd.id], absent: true }] };
    }

    case "addEntity": {
      const s = sceneOf(doc, cmd.scene);
      if (!doc.prefabs[cmd.entity.prefab]) fail("no-prefab", `프리팹 ${cmd.entity.prefab} 이 없습니다`);
      const id = cmd.entity.id ?? newId(doc, "e", s.entities, seqRef);
      if (s.entities[id]) fail("exists", `엔티티 ${id} 가 이미 있습니다`);
      const e = parse(EntitySchema, { ...cmd.entity, id }, "엔티티");
      if (e.x < 0 || e.y < 0 || e.x > s.w || e.y > s.h) fail("out-of-bounds", `위치 (${e.x}, ${e.y}) 는 장면(${s.w}×${s.h}) 밖입니다`);
      if (doc.prefabs[e.prefab].kind === "player")
        for (const o of Object.values(s.entities))
          if (doc.prefabs[o.prefab]?.kind === "player") fail("second-player", `주인공(${o.id})이 이미 있습니다. 옮기려면 moveEntity 를 쓰세요`);
      return withSeq({ writes: [{ path: ["scenes", cmd.scene, "entities", id], value: e }], created: id });
    }
    case "moveEntity": {
      const s = sceneOf(doc, cmd.scene);
      const cur = s.entities[cmd.id] ?? fail("no-entity", `엔티티 ${cmd.id} 가 없습니다`);
      if (!Number.isFinite(cmd.x) || !Number.isFinite(cmd.y) || cmd.x < 0 || cmd.y < 0 || cmd.x > s.w || cmd.y > s.h)
        fail("out-of-bounds", `위치 (${cmd.x}, ${cmd.y}) 는 장면(${s.w}×${s.h}) 밖입니다`);
      return { writes: [{ path: ["scenes", cmd.scene, "entities", cmd.id], value: { ...cur, x: cmd.x, y: cmd.y } }] };
    }
    case "removeEntity": {
      const s = sceneOf(doc, cmd.scene);
      if (!s.entities[cmd.id]) fail("no-entity", `엔티티 ${cmd.id} 가 없습니다`);
      return { writes: [{ path: ["scenes", cmd.scene, "entities", cmd.id], absent: true }] };
    }
    case "setEntityProps": {
      const s = sceneOf(doc, cmd.scene);
      const cur = s.entities[cmd.id] ?? fail("no-entity", `엔티티 ${cmd.id} 가 없습니다`);
      const props = parse(EntityPropsSchema, mergeNullable(cur.props ?? {}, cmd.props), "속성");
      const next = { ...cur, props };
      if (Object.keys(props).length === 0) delete (next as any).props;
      return { writes: [{ path: ["scenes", cmd.scene, "entities", cmd.id], value: next }] };
    }

    case "registerAsset": {
      const a = parse(AssetSchema, cmd.asset, "에셋");
      if (doc.assets[a.id]) fail("exists", `에셋 ${a.id} 가 이미 있습니다. 바꾸려면 replaceAsset 을 쓰세요`);
      return { writes: [{ path: ["assets", a.id], value: a }], created: a.id };
    }
    case "replaceAsset": {
      const cur = doc.assets[cmd.id] ?? fail("no-asset", `에셋 ${cmd.id} 이 없습니다`);
      const merged: any = { ...cur, ...cmd.asset, id: cmd.id };
      // 정지 그림으로 바뀌면 예전 프레임 정보를 남기지 않는다
      if (cmd.asset.kind && cmd.asset.kind !== "character" && !cmd.asset.frames) delete merged.frames;
      const a = parse(AssetSchema, merged, "에셋");
      return { writes: [{ path: ["assets", cmd.id], value: a }] };
    }
    case "removeAsset": {
      if (!doc.assets[cmd.id]) fail("no-asset", `에셋 ${cmd.id} 이 없습니다`);
      for (const p of Object.values(doc.prefabs)) if (p.asset === cmd.id) fail("in-use", `에셋 ${cmd.id} 은 프리팹 ${p.id} 가 쓰고 있습니다`);
      for (const m of Object.values(doc.materials)) if (m.asset === cmd.id) fail("in-use", `에셋 ${cmd.id} 은 재질 ${m.id} 가 쓰고 있습니다`);
      return { writes: [{ path: ["assets", cmd.id], absent: true }] };
    }
    case "definePrefab": {
      const p = parse(PrefabSchema, cmd.prefab, "프리팹");
      if (!doc.assets[p.asset]) fail("no-asset", `에셋 ${p.asset} 이 없습니다`);
      return { writes: [{ path: ["prefabs", p.id], value: p }], created: p.id };
    }
    case "updatePrefab": {
      const cur = doc.prefabs[cmd.id] ?? fail("no-prefab", `프리팹 ${cmd.id} 이 없습니다`);
      const { props, ...rest } = cmd.patch;
      const p = parse(PrefabSchema, { ...cur, ...rest, props: props ? mergeNullable(cur.props, props) : cur.props, id: cmd.id }, "프리팹");
      if (!doc.assets[p.asset]) fail("no-asset", `에셋 ${p.asset} 이 없습니다`);
      return { writes: [{ path: ["prefabs", cmd.id], value: p }] };
    }
    case "removePrefab": {
      if (!doc.prefabs[cmd.id]) fail("no-prefab", `프리팹 ${cmd.id} 이 없습니다`);
      for (const s of Object.values(doc.scenes))
        for (const e of Object.values(s.entities)) if (e.prefab === cmd.id) fail("in-use", `프리팹 ${cmd.id} 은 엔티티 ${e.id} 가 쓰고 있습니다`);
      return { writes: [{ path: ["prefabs", cmd.id], absent: true }] };
    }

    case "addLight": {
      const s = sceneOf(doc, cmd.scene);
      const id = cmd.light.id ?? newId(doc, "l", s.lights, seqRef);
      if (s.lights[id]) fail("exists", `광원 ${id} 가 이미 있습니다`);
      const l = parse(LightSchema, { ...cmd.light, id }, "광원");
      return withSeq({ writes: [{ path: ["scenes", cmd.scene, "lights", id], value: l }], created: id });
    }
    case "updateLight": {
      const s = sceneOf(doc, cmd.scene);
      const cur = s.lights[cmd.id] ?? fail("no-light", `광원 ${cmd.id} 가 없습니다`);
      const l = parse(LightSchema, { ...mergeNullable(cur, cmd.patch as Nullable<Light>), id: cmd.id }, "광원");
      return { writes: [{ path: ["scenes", cmd.scene, "lights", cmd.id], value: l }] };
    }
    case "removeLight": {
      const s = sceneOf(doc, cmd.scene);
      if (!s.lights[cmd.id]) fail("no-light", `광원 ${cmd.id} 가 없습니다`);
      return { writes: [{ path: ["scenes", cmd.scene, "lights", cmd.id], absent: true }] };
    }
    case "setAmbient": {
      sceneOf(doc, cmd.scene);
      if (!/^#[0-9a-fA-F]{6}$/.test(cmd.color)) fail("invalid", `색 ${cmd.color} 은 #rrggbb 형식이어야 합니다`);
      return { writes: [{ path: ["scenes", cmd.scene, "ambient"], value: cmd.color }] };
    }
    case "setPost": {
      const s = sceneOf(doc, cmd.scene);
      const post = parse(PostSchema, { ...s.post, ...cmd.patch }, "후처리");
      return { writes: [{ path: ["scenes", cmd.scene, "post"], value: post }] };
    }

    case "setDialogue": {
      sceneOf(doc, cmd.scene);
      const d = parse(DialogueSchema, cmd.dialogue, "대화");
      const ids = new Set(d.nodes.map((n) => n.id));
      if (ids.size !== d.nodes.length) fail("invalid", "대화 안의 대사 id 가 겹칩니다");
      for (const n of d.nodes) {
        if (n.next && !ids.has(n.next)) fail("invalid", `대사 ${n.id} 의 next(${n.next}) 가 이 대화에 없습니다`);
        for (const c of n.choices ?? []) if (c.next && !ids.has(c.next)) fail("invalid", `대사 ${n.id} 의 선택지 next(${c.next}) 가 이 대화에 없습니다`);
      }
      return { writes: [{ path: ["scenes", cmd.scene, "dialogues", d.id], value: d }], created: d.id };
    }
    case "removeDialogue": {
      const s = sceneOf(doc, cmd.scene);
      if (!s.dialogues[cmd.id]) fail("no-dialogue", `대화 ${cmd.id} 가 없습니다`);
      return { writes: [{ path: ["scenes", cmd.scene, "dialogues", cmd.id], absent: true }] };
    }
    case "addEvent": {
      const s = sceneOf(doc, cmd.scene);
      const id = cmd.event.id ?? newId(doc, "ev", s.events, seqRef);
      if (s.events[id]) fail("exists", `이벤트 ${id} 가 이미 있습니다`);
      const ev = parse(GameEventSchema, { ...cmd.event, id }, "이벤트");
      return withSeq({ writes: [{ path: ["scenes", cmd.scene, "events", id], value: ev }], created: id });
    }
    case "updateEvent": {
      const s = sceneOf(doc, cmd.scene);
      const cur = s.events[cmd.id] ?? fail("no-event", `이벤트 ${cmd.id} 가 없습니다`);
      const ev = parse(GameEventSchema, { ...cur, ...cmd.patch, id: cmd.id }, "이벤트");
      return { writes: [{ path: ["scenes", cmd.scene, "events", cmd.id], value: ev }] };
    }
    case "removeEvent": {
      const s = sceneOf(doc, cmd.scene);
      if (!s.events[cmd.id]) fail("no-event", `이벤트 ${cmd.id} 가 없습니다`);
      return { writes: [{ path: ["scenes", cmd.scene, "events", cmd.id], absent: true }] };
    }

    case "setStyle": {
      const style = parse(StyleSchema, { ...doc.style, ...cmd.patch }, "스타일");
      return { writes: [{ path: ["style"], value: style }] };
    }
    case "renameProject": {
      if (typeof cmd.name !== "string" || cmd.name.length === 0 || cmd.name.length > 80) fail("invalid", "이름은 1~80자여야 합니다");
      return { writes: [{ path: ["meta", "name"], value: cmd.name }] };
    }
    case "renameScene": {
      sceneOf(doc, cmd.scene);
      if (typeof cmd.name !== "string" || cmd.name.length === 0 || cmd.name.length > 80) fail("invalid", "이름은 1~80자여야 합니다");
      return { writes: [{ path: ["scenes", cmd.scene, "name"], value: cmd.name }] };
    }

    case "restore":
      return { writes: cmd.writes };

    default: {
      const unknown = cmd as { type?: string };
      return fail("unknown-command", `모르는 명령입니다: ${unknown.type}`);
    }
  }
}

export interface Applied {
  doc: Project;
  /** 이 명령을 되돌리는 명령. */
  inverse: Command;
  /** 새로 만든 것의 id (있을 때). */
  created?: string;
}

/** 명령 하나를 적용한다. 검사에 실패하면 CommandError 를 던지고 문서는 그대로다. */
export function applyCommand(doc: Project, cmd: Command): Applied {
  const planned = plan(doc, cmd);
  let next: any = doc;
  const undo: Write[] = [];
  for (const w of planned.writes) {
    const old = getIn(next, w.path);
    undo.unshift(old === undefined ? { path: w.path, absent: true } : { path: w.path, value: old });
    next = setIn(next, w.path, w);
  }
  let inverse: Command;
  if (planned.inverse) {
    // 손수 만든 역명령을 쓰되, 그 밖의 쓰기(일련번호 등)가 있으면 함께 되돌린다
    const extra = undo.filter((u) => u.path[0] === "meta");
    inverse = extra.length ? { type: "restore", writes: undo } : planned.inverse;
  } else inverse = { type: "restore", writes: undo };
  return { doc: next as Project, inverse, created: planned.created };
}

export interface AppliedTransaction {
  doc: Project;
  /** 되돌릴 때 이 순서대로 적용한다 (마지막 명령의 역명령이 먼저). */
  inverses: Command[];
  created: Array<string | undefined>;
}

/** 명령 여러 개를 한 묶음으로 적용한다. 하나라도 실패하면 전체가 적용되지 않는다. */
export function applyTransaction(doc: Project, commands: Command[]): AppliedTransaction {
  let cur = doc;
  const inverses: Command[] = [];
  const created: Array<string | undefined> = [];
  commands.forEach((cmd, index) => {
    try {
      const r = applyCommand(cur, cmd);
      cur = r.doc;
      inverses.unshift(r.inverse);
      created.push(r.created);
    } catch (e) {
      if (e instanceof CommandError) throw new CommandError(e.code, e.message, index);
      throw e;
    }
  });
  return { doc: cur, inverses, created };
}
