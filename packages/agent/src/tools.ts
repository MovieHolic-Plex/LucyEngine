import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  type Command, type Project, type EntityProps, CommandError, EntityPropsSchema, LightPropsSchema, TriggerSchema, ActionSchema, PREFAB_KINDS,
  describeScene, describeLibrary, lintProject, frameSize, footprintOf,
} from "@age/model";
import { walkTo, talkTo, fight } from "@age/runtime";

// 에이전트의 도구. 문서를 바꾸는 도구는 모두 명령으로 바뀌어 host.apply 를 거친다.

export type GenKind = "terrain" | "prop" | "building" | "character" | "creature";

export interface GeneratedArt {
  /** 저장된 파일 이름. */
  file: string;
  w: number;
  h: number;
  frames?: { frameW: number; frameH: number; perRow: number; rows: Array<"down" | "up" | "side"> };
  color: string;
  footprint?: { w: number; h: number };
}

export interface CaptureResult {
  /** base64 (data 주소 머리말 없이). */
  data: string;
  mime: "image/png" | "image/jpeg";
  note: string;
}

/** 에이전트가 일하는 환경. 서버가 구현한다. */
export interface AgentHost {
  sceneId: string;
  /** 지금 작업 중인 문서 (이번 턴의 변경이 반영돼 있다). */
  doc(): Project;
  /** 명령 묶음을 작업 문서에 적용한다. 실패하면 CommandError 를 던지고 아무것도 바뀌지 않는다. */
  apply(commands: Command[]): Array<string | undefined>;
  /** 그림을 생성해 저장한다. 생성기가 없으면 null. */
  generate: ((req: { kind: GenKind; description: string; height?: number }) => Promise<GeneratedArt>) | null;
  /** 저장된 그림의 색을 바꿔 새 파일로 저장하고 그 이름을 돌려준다. 없으면 null. */
  recolor: ((file: string, adjust: { hue: number; saturation: number; lightness: number }) => Promise<string>) | null;
  /** 내장 키트를 등록하는 명령을 만든다. */
  starterCommands(): Command[];
  /** 편집기 화면에서 장면 사진을 찍는다. 화면이 없으면 null. */
  capture(region?: { x: number; y: number; w: number; h: number }): Promise<CaptureResult | null>;
  /** 사용자에게 보이는 진행 상황 한 줄. */
  status(text: string): void;
  signal: AbortSignal;
}

type ToolContent = string | Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam>;

interface ToolDef<S extends z.ZodType> {
  name: string;
  description: string;
  schema: S;
  /** 실행 중 사용자에게 보일 말. */
  status: string;
  run(input: z.infer<S>, host: AgentHost): Promise<ToolContent> | ToolContent;
}

const tools: Array<ToolDef<any>> = [];
function tool<S extends z.ZodType>(def: ToolDef<S>): void {
  tools.push(def);
}

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/).describe("colour as #rrggbb");
const Id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_.:-]+$/);
const Props = EntityPropsSchema.partial().describe(
  "entity properties: name (shown as the speaker), solid, hp, speed (tiles/second), damage, behavior (idle | wander | chase | patrol | ranged), aggroRange (tiles), patrol (relative waypoints), dialogue (dialogue id started when the player talks to it), light {color, radius, intensity, height?, flicker?}, flip",
);

function tileSize(doc: Project, prefabId: string): string {
  const p = doc.prefabs[prefabId];
  const a = p ? doc.assets[p.asset] : undefined;
  if (!p || !a) return "";
  const t = doc.style.tile, s = frameSize(a), f = footprintOf(a, p.kind);
  const r = (n: number) => Math.round((n / t) * 10) / 10;
  return `${r(s.w)}x${r(s.h)} tiles, blocks ${r(f.w)}x${r(f.h)} tiles at its base`;
}

function issuesText(doc: Project): string {
  const issues = lintProject(doc);
  if (!issues.length) return "No problems found.";
  return `${issues.length} problem(s):\n` + issues.map((i) => `- [${i.rule}] ${i.message}`).join("\n");
}

tool({
  name: "get_state",
  description: "Read the current scene (terrain grid, entities, lights, dialogues, events), the library of materials and prefabs you can use, and any problems. The state at the start of the turn is already in the user message; call this to refresh after many changes.",
  schema: z.object({}),
  status: "장면을 읽는 중",
  run: (_i, host) => `${describeScene(host.doc(), host.sceneId)}\n\n${describeLibrary(host.doc())}\n\n${issuesText(host.doc())}`,
});

tool({
  name: "set_style",
  description: "Set the art direction for the whole project. `mood` is a short English description of the world's look and atmosphere (place, era, materials, weather, time of day). Every generated image is conditioned on it, so set it before create_assets and keep it stable afterwards.",
  schema: z.object({ mood: z.string().min(3).max(500) }),
  status: "분위기를 정하는 중",
  run: (i, host) => {
    host.apply([{ type: "setStyle", patch: { mood: i.mood } }]);
    return "Style set.";
  },
});

const AssetItem = z.object({
  id: Id.describe("id of the new material (for terrain) or prefab (for everything else), e.g. grass, lamp, hero"),
  type: z.enum(["terrain", "prop", "building", "character", "creature"]).describe("terrain = tileable ground texture; prop = single object; building = a house-like structure with its door facing the camera; character = a humanoid (drawn from front, side and back, gets a walk cycle); creature = a non-humanoid monster or animal (one view)"),
  description: z.string().min(3).max(400).describe("what to draw, in English, concrete and visual. Describe only this one subject. For terrain describe just the surface material and its colour in a few words (\"short soft green grass\", \"wet dark cobblestones\"); never put objects, rails, puddles or patterns into a ground texture — those should be separate props, because a texture repeats every three tiles and any distinct feature becomes a visible grid."),
  name: z.string().max(60).describe("display name in the user's language"),
  height_tiles: z.number().min(0.4).max(8).optional().describe("sprite height in tiles (1 tile = 24px). Typical: barrel 1.2, bench 0.9, street lamp 2.7, bush 0.9, tree 3.5, house 5, small shop 4.5, creature 0.9. Ignored for terrain and for character (always about 1.6)."),
  role: z.enum(PREFAB_KINDS).optional().describe("prefab kind. Defaults: prop→prop, building→building, character→npc, creature→enemy. Exactly one prefab should be the player."),
  props: Props.optional().describe("default properties for the prefab (e.g. hp, speed, damage, behavior for enemies; light for lamps; solid:false for flat decorations)"),
  walkable: z.boolean().optional().describe("terrain only: can characters walk on it (default true; false for water, pits, lava)"),
  priority: z.number().int().optional().describe("terrain only: higher-priority materials spill over lower ones at borders. Typical: water -1, dirt 1, paving 2, grass 3"),
  edge: z.enum(["soft", "hard"]).optional().describe("terrain only: soft = organic ragged border (grass, dirt, sand, water), hard = straight tile border (paving, floors)"),
});

tool({
  name: "create_assets",
  description:
    "Generate new pixel art and register it: terrain items become materials you can paint with, the rest become prefabs you can place. All items in one call are generated in parallel (about 10 images per minute), so request everything a scene needs in ONE call rather than many small calls. If an image fails after retries, a flat placeholder is registered under the same id so the scene still works; the result tells you which ones.",
  schema: z.object({ items: z.array(AssetItem).min(1).max(24) }),
  status: "그림을 그리는 중",
  run: async (i, host) => {
    const doc = host.doc();
    const tile = doc.style.tile;
    const lines: string[] = [];
    const commands: Command[] = [];
    let done = 0;
    const results = await Promise.all(
      i.items.map(async (it) => {
        const height = it.type === "terrain" || it.type === "character" ? undefined : Math.round((it.height_tiles ?? { prop: 1.2, building: 5, creature: 0.9 }[it.type as "prop" | "building" | "creature"]) * tile);
        let art: GeneratedArt | null = null, error = "";
        if (!host.generate) error = "image generation is not configured on this server";
        else
          try {
            art = await host.generate({ kind: it.type, description: it.description, height });
          } catch (e) {
            if (host.signal.aborted) throw e;
            error = e instanceof Error ? e.message + ((e as { reasons?: string[] }).reasons?.length ? ` (${(e as { reasons?: string[] }).reasons!.slice(-1)[0]})` : "") : String(e);
          }
        done++;
        host.status(`그림을 그리는 중 (${done}/${i.items.length}) · ${it.name}`);
        return { it, art, error, height };
      }),
    );
    for (const { it, art, error, height } of results) {
      const prefix = it.type === "terrain" ? "tex" : it.type === "character" || it.type === "creature" ? "chr" : "spr";
      let assetId = `${prefix}_${it.id}`;
      for (let n = 2; doc.assets[assetId] || commands.some((c) => c.type === "registerAsset" && c.asset.id === assetId); n++) assetId = `${prefix}_${it.id}_${n}`;
      const fallbackH = it.type === "terrain" ? 72 : it.type === "character" ? 38 : height ?? 24;
      const fallbackW = it.type === "terrain" ? 72 : it.type === "building" ? Math.round(fallbackH * 0.9) : it.type === "character" ? 22 : Math.round(fallbackH * 0.8);
      commands.push({
        type: "registerAsset",
        asset: art
          ? { id: assetId, kind: it.type === "terrain" ? "texture" : art.frames ? "character" : "sprite", file: art.file, w: art.w, h: art.h, ...(art.frames ? { frames: art.frames } : {}), ...(art.footprint ? { footprint: art.footprint } : {}), color: art.color, prompt: it.description }
          : { id: assetId, kind: it.type === "terrain" ? "texture" : "sprite", file: null, w: fallbackW, h: fallbackH, color: "#8a7f9c", prompt: it.description },
      });
      if (it.type === "terrain") {
        const m = { id: it.id, name: it.name, asset: assetId, color: art?.color ?? "#8a7f9c", walkable: it.walkable ?? true, priority: it.priority ?? 1, edge: it.edge ?? "soft" } as const;
        commands.push(doc.materials[it.id] ? { type: "updateMaterial", id: it.id, patch: { name: m.name, asset: m.asset, color: m.color, walkable: m.walkable, priority: m.priority, edge: m.edge } } : { type: "defineMaterial", material: m });
      } else {
        const kind = it.role ?? ({ prop: "prop", building: "building", character: "npc", creature: "enemy" } as const)[it.type as "prop" | "building" | "character" | "creature"];
        commands.push(doc.prefabs[it.id] ? { type: "updatePrefab", id: it.id, patch: { name: it.name, kind, asset: assetId, props: it.props ?? {} } } : { type: "definePrefab", prefab: { id: it.id, name: it.name, kind, asset: assetId, props: (it.props ?? {}) as EntityProps } });
      }
      const size = art ? (it.type === "terrain" ? "tileable texture" : `${Math.round(((art.frames?.frameW ?? art.w) / tile) * 10) / 10}x${Math.round(((art.frames?.frameH ?? art.h) / tile) * 10) / 10} tiles`) : "";
      lines.push(art ? `- ${it.id}: ok (${size})` : `- ${it.id}: FAILED, placeholder registered. Reason: ${error}`);
    }
    host.apply(commands);
    const failed = results.filter((r) => !r.art).length;
    return `${results.length - failed} generated, ${failed} failed.\n${lines.join("\n")}${failed ? "\nTell the user which art is a placeholder. You can retry a failed one later with redraw_asset." : ""}`;
  },
});

tool({
  name: "redraw_asset",
  description: "Generate a new image for an existing prefab or material and swap it in everywhere it is used (the user's \"redraw this\"). Give a new description to change the design, or omit it to try again with the same one.",
  schema: z.object({
    id: Id.describe("prefab id or material id"),
    description: z.string().min(3).max(400).optional().describe("new English description; omit to reuse the previous one"),
    height_tiles: z.number().min(0.4).max(8).optional(),
  }),
  status: "다시 그리는 중",
  run: async (i, host) => {
    const doc = host.doc();
    const tile = doc.style.tile;
    const prefab = doc.prefabs[i.id], material = doc.materials[i.id];
    const assetId = prefab?.asset ?? material?.asset;
    if (!assetId) throw new Error(prefab || material ? `${i.id} has no image asset to redraw` : `there is no prefab or material called ${i.id}`);
    const asset = doc.assets[assetId];
    if (!host.generate) throw new Error("image generation is not configured on this server");
    const description = i.description ?? asset.prompt;
    if (!description) throw new Error("this asset has no stored description; pass one");
    const kind: GenKind = material ? "terrain" : asset.kind === "character" ? (asset.frames && asset.frames.frameH >= 34 ? "character" : "creature") : prefab?.kind === "building" ? "building" : prefab?.kind === "enemy" || prefab?.kind === "npc" || prefab?.kind === "player" ? "creature" : "prop";
    const height = kind === "terrain" || kind === "character" ? undefined : Math.round(i.height_tiles ? i.height_tiles * tile : asset.frames ? asset.frames.frameH - 2 : asset.h);
    const art = await host.generate({ kind, description, height });
    host.apply([{ type: "replaceAsset", id: assetId, asset: { kind: kind === "terrain" ? "texture" : art.frames ? "character" : "sprite", file: art.file, w: art.w, h: art.h, frames: art.frames, footprint: art.footprint, color: art.color, prompt: description } }]);
    return `Redrawn ${i.id}.`;
  },
});

tool({
  name: "recolor",
  description: "Recolour the image of an existing prefab or material without redrawing it (the user's \"make it blue\", \"a red version\"). Rotates the hue, scales saturation and shifts lightness, then snaps to the project palette, so shading and outlines stay intact. It is instant. With `new_prefab` it creates a colour variant as a new prefab (for example a red slime next to the green one) and leaves the original alone; otherwise the original changes everywhere it is used. Hue reference: +30 shifts green toward teal, about 120 turns green into blue, -100 turns green into orange or red.",
  schema: z.object({
    id: Id.describe("prefab id or material id"),
    hue_shift: z.number().min(-180).max(180).describe("degrees to rotate the hue"),
    saturation: z.number().min(0).max(3).optional().describe("saturation multiplier, default 1"),
    lightness: z.number().min(-40).max(40).optional().describe("added to lightness (0–100 scale), default 0"),
    new_prefab: z.object({ id: Id, name: z.string().min(1).max(60) }).optional(),
  }),
  status: "색을 바꾸는 중",
  run: async (i, host) => {
    const doc = host.doc();
    if (!host.recolor) throw new Error("recolouring is not available on this server");
    const prefab = doc.prefabs[i.id], material = doc.materials[i.id];
    const assetId = prefab?.asset ?? material?.asset;
    if (!assetId) throw new Error(prefab || material ? `${i.id} has no image to recolour` : `there is no prefab or material called ${i.id}`);
    const asset = doc.assets[assetId];
    if (!asset.file) throw new Error(`${i.id} only has a placeholder image; redraw it first`);
    const file = await host.recolor(asset.file, { hue: i.hue_shift, saturation: i.saturation ?? 1, lightness: i.lightness ?? 0 });
    if (i.new_prefab) {
      if (!prefab) throw new Error("new_prefab works only for prefabs");
      if (doc.prefabs[i.new_prefab.id]) throw new Error(`prefab ${i.new_prefab.id} already exists`);
      let newAsset = `${assetId}_${i.new_prefab.id}`.slice(0, 64);
      while (doc.assets[newAsset]) newAsset = `${newAsset.slice(0, 60)}_${Math.floor(Math.random() * 1000)}`;
      host.apply([
        { type: "registerAsset", asset: { ...asset, id: newAsset, file } },
        { type: "definePrefab", prefab: { ...prefab, id: i.new_prefab.id, name: i.new_prefab.name, asset: newAsset } },
      ]);
      return `Created prefab ${i.new_prefab.id} (${i.new_prefab.name}) as a recoloured copy of ${i.id}. Place it with place.`;
    }
    host.apply([{ type: "replaceAsset", id: assetId, asset: { file } }]);
    return `Recoloured ${i.id}.`;
  },
});

tool({
  name: "use_starter_kit",
  description: "Register the built-in asset kit (a run-down railway-station town: dirt, grass, paving, water, plank floor; barrel, crate, street lamp, bench, sign, vending machine, bush, tree, rock, fence, flowers, campfire, chest; a house and a shop; a hero, two villagers; slime, crab and spore-plant enemies). Use it when image generation is unavailable, or when the user wants something quick in that setting. Existing ids are kept.",
  schema: z.object({}),
  status: "내장 키트를 불러오는 중",
  run: (_i, host) => {
    const doc = host.doc();
    const commands = host.starterCommands().filter((c) => {
      if (c.type === "registerAsset") return !doc.assets[c.asset.id];
      if (c.type === "defineMaterial") return !doc.materials[c.material.id];
      if (c.type === "definePrefab") return !doc.prefabs[c.prefab.id];
      if (c.type === "setStyle") return !doc.style.mood;
      return true;
    });
    host.apply(commands);
    return `Starter kit registered.\n\n${describeLibrary(host.doc())}`;
  },
});

tool({
  name: "set_prefab",
  description: "Change an existing prefab's name, kind or default properties, or create a variant prefab that reuses another prefab's image (give `image_from`). Properties set to null are removed.",
  schema: z.object({
    id: Id,
    name: z.string().max(60).optional(),
    kind: z.enum(PREFAB_KINDS).optional(),
    image_from: Id.optional().describe("when creating a new prefab: the prefab whose image to reuse"),
    props: z.record(z.string(), z.unknown()).optional().describe("default properties (same keys as entity properties); null removes one"),
  }),
  status: "프리팹을 고치는 중",
  run: (i, host) => {
    const doc = host.doc();
    if (doc.prefabs[i.id]) {
      host.apply([{ type: "updatePrefab", id: i.id, patch: { name: i.name, kind: i.kind, asset: i.image_from ? doc.prefabs[i.image_from]?.asset : undefined, props: i.props as never } }]);
      return `Prefab ${i.id} updated.`;
    }
    const src = i.image_from ? doc.prefabs[i.image_from] : undefined;
    if (!src) throw new Error(`prefab ${i.id} does not exist; to create it pass image_from with an existing prefab id (or use create_assets for new art)`);
    host.apply([{ type: "definePrefab", prefab: { id: i.id, name: i.name ?? src.name, kind: i.kind ?? src.kind, asset: src.asset, props: { ...src.props, ...((i.props ?? {}) as EntityProps) } } }]);
    return `Prefab ${i.id} created from ${i.image_from}.`;
  },
});

tool({
  name: "set_material",
  description: "Change a material's name, walkability, border priority or edge style; or create a flat-colour material without a texture.",
  schema: z.object({ id: Id, name: z.string().max(60).optional(), walkable: z.boolean().optional(), priority: z.number().int().optional(), edge: z.enum(["soft", "hard"]).optional(), color: Hex.optional() }),
  status: "재질을 고치는 중",
  run: (i, host) => {
    const { id, ...patch } = i;
    if (host.doc().materials[id]) host.apply([{ type: "updateMaterial", id, patch }]);
    else host.apply([{ type: "defineMaterial", material: { id, name: i.name ?? id, asset: null, color: i.color ?? "#777777", walkable: i.walkable ?? true, priority: i.priority ?? 1, edge: i.edge ?? "soft" } }]);
    return `Material ${id} saved.`;
  },
});

tool({
  name: "resize_scene",
  description: "Change the scene size in tiles (4–96). New area is filled with `fill`; entities outside are moved inside. A single-screen scene is about 27x15; 30x18 to 40x24 gives room to walk.",
  schema: z.object({ w: z.number().int().min(4).max(96), h: z.number().int().min(4).max(96), fill: Id.describe("material id for new tiles") }),
  status: "장면 크기를 바꾸는 중",
  run: (i, host) => {
    host.apply([{ type: "resizeScene", scene: host.sceneId, w: i.w, h: i.h, fill: i.fill }]);
    return `Scene is now ${i.w}x${i.h}.`;
  },
});

tool({
  name: "paint_terrain",
  description:
    "Paint ground tiles. Use `rows` to draw a block as text: each string is one row of tiles, each character is looked up in `legend` (character → material id); a '.' leaves that tile unchanged. `origin` is the top-left tile of the block (default 0,0). To repaint the whole scene, give exactly scene-height rows of scene-width characters. Use `fills` for rectangles. Fills are applied first, then rows.",
  schema: z.object({
    rows: z.array(z.string()).optional(),
    legend: z.record(z.string(), Id).optional(),
    origin: z.object({ x: z.number().int(), y: z.number().int() }).optional(),
    fills: z.array(z.object({ x: z.number().int(), y: z.number().int(), w: z.number().int().positive(), h: z.number().int().positive(), material: Id })).optional(),
  }),
  status: "바닥을 칠하는 중",
  run: (i, host) => {
    const scene = host.doc().scenes[host.sceneId];
    const commands: Command[] = [];
    for (const f of i.fills ?? []) {
      // 장면 밖으로 나간 부분은 잘라낸다
      const x = Math.max(0, f.x), y = Math.max(0, f.y);
      const w = Math.min(scene.w, f.x + f.w) - x, h = Math.min(scene.h, f.y + f.h) - y;
      if (w > 0 && h > 0) commands.push({ type: "fillTerrain", scene: host.sceneId, rect: { x, y, w, h }, material: f.material });
    }
    let skipped = 0;
    if (i.rows?.length) {
      const legend = i.legend ?? {};
      const ox = i.origin?.x ?? 0, oy = i.origin?.y ?? 0;
      const cells: Array<{ x: number; y: number; material: string }> = [];
      i.rows.forEach((row: string, r: number) => {
        [...row].forEach((ch, c) => {
          if (ch === "." || ch === " ") return;
          const material = legend[ch];
          if (!material) throw new Error(`row ${r}: character "${ch}" is not in the legend`);
          const x = ox + c, y = oy + r;
          if (x < 0 || y < 0 || x >= scene.w || y >= scene.h) { skipped++; return; }
          cells.push({ x, y, material });
        });
      });
      if (cells.length) commands.push({ type: "paintTerrain", scene: host.sceneId, cells });
    }
    if (!commands.length) return "Nothing to paint.";
    host.apply(commands);
    return `Terrain painted.${skipped ? ` ${skipped} tile(s) were outside the ${scene.w}x${scene.h} scene and were skipped.` : ""}`;
  },
});

tool({
  name: "place",
  description: "Place entities. x,y are in tiles and mark the centre of the entity's feet (the bottom-centre of its image); the image extends upward from there. Use .5 coordinates to centre something in a tile (x=10.5 is the middle of column 10). Buildings and tall props cover the tiles above their base. Only one player may exist.",
  schema: z.object({ entities: z.array(z.object({ prefab: Id, x: z.number(), y: z.number(), id: Id.optional().describe("optional readable id, e.g. shopkeeper"), props: Props.optional() })).min(1).max(120) }),
  status: "배치하는 중",
  run: (i, host) => {
    const created = host.apply(i.entities.map((e: { prefab: string; x: number; y: number; id?: string; props?: EntityProps }) => ({ type: "addEntity", scene: host.sceneId, entity: { id: e.id, prefab: e.prefab, x: e.x, y: e.y, props: e.props && Object.keys(e.props).length ? e.props : undefined } }) as Command));
    const doc = host.doc();
    const sizes = [...new Set(i.entities.map((e: { prefab: string }) => e.prefab))].map((p) => `${p}: ${tileSize(doc, p as string)}`).join("; ");
    return `Placed ${created.length}: ${created.join(", ")}.\nSizes — ${sizes}`;
  },
});

tool({
  name: "update_entities",
  description: "Move entities and/or change their properties. Properties set to null are removed (falling back to the prefab default).",
  schema: z.object({ updates: z.array(z.object({ id: Id, x: z.number().optional(), y: z.number().optional(), props: z.record(z.string(), z.unknown()).optional() })).min(1).max(120) }),
  status: "고치는 중",
  run: (i, host) => {
    const scene = host.doc().scenes[host.sceneId];
    const commands: Command[] = [];
    for (const u of i.updates as Array<{ id: string; x?: number; y?: number; props?: Record<string, unknown> }>) {
      const cur = scene.entities[u.id];
      if (!cur) throw new Error(`entity ${u.id} does not exist`);
      if (u.x !== undefined || u.y !== undefined) commands.push({ type: "moveEntity", scene: host.sceneId, id: u.id, x: u.x ?? cur.x, y: u.y ?? cur.y });
      if (u.props && Object.keys(u.props).length) commands.push({ type: "setEntityProps", scene: host.sceneId, id: u.id, props: u.props as never });
    }
    host.apply(commands);
    return `Updated ${i.updates.length}.`;
  },
});

tool({
  name: "remove",
  description: "Remove entities, lights, dialogues or events by id.",
  schema: z.object({ entities: z.array(Id).optional(), lights: z.array(Id).optional(), dialogues: z.array(Id).optional(), events: z.array(Id).optional() }),
  status: "지우는 중",
  run: (i, host) => {
    const s = host.sceneId;
    const commands: Command[] = [
      ...(i.entities ?? []).map((id: string) => ({ type: "removeEntity", scene: s, id }) as Command),
      ...(i.lights ?? []).map((id: string) => ({ type: "removeLight", scene: s, id }) as Command),
      ...(i.dialogues ?? []).map((id: string) => ({ type: "removeDialogue", scene: s, id }) as Command),
      ...(i.events ?? []).map((id: string) => ({ type: "removeEvent", scene: s, id }) as Command),
    ];
    if (!commands.length) return "Nothing to remove.";
    host.apply(commands);
    return `Removed ${commands.length}.`;
  },
});

const LightIn = LightPropsSchema.extend({ x: z.number(), y: z.number(), id: Id.optional() });

tool({
  name: "set_lighting",
  description:
    "Set the mood lighting. `ambient` multiplies the whole scene: #ffffff is plain daylight with no darkness; a dim blue-violet such as #7d7ab8 is dusk; #4a4f86 is night; warm tones such as #c9a98f suit interiors and sunsets. Point lights add coloured light on top: radius in tiles (3–8), intensity 0–1.5. Lamps and fires should usually carry their own light as a prefab property instead of a separate light. `post` tunes bloom (glow around bright things), vignette, saturation and contrast.",
  schema: z.object({
    ambient: Hex.optional(),
    post: z.object({ bloom: z.number().min(0).max(1), vignette: z.number().min(0).max(1), saturation: z.number().min(-1).max(1), contrast: z.number().min(-1).max(1) }).partial().optional(),
    add: z.array(LightIn).optional(),
    update: z.array(LightIn.partial().extend({ id: Id })).optional(),
  }),
  status: "조명을 맞추는 중",
  run: (i, host) => {
    const s = host.sceneId;
    const commands: Command[] = [];
    if (i.ambient) commands.push({ type: "setAmbient", scene: s, color: i.ambient });
    if (i.post && Object.keys(i.post).length) commands.push({ type: "setPost", scene: s, patch: i.post });
    for (const l of i.add ?? []) commands.push({ type: "addLight", scene: s, light: l });
    for (const { id, ...patch } of (i.update ?? []) as Array<{ id: string }>) commands.push({ type: "updateLight", scene: s, id, patch });
    if (!commands.length) return "Nothing changed.";
    const created = host.apply(commands).filter(Boolean);
    return `Lighting updated.${created.length ? ` New lights: ${created.join(", ")}.` : ""}`;
  },
});

tool({
  name: "set_dialogue",
  description:
    "Create or replace a dialogue. Lines play in order. A line may offer up to 4 `choices`, each jumping to another line's id (or null to end). `next` overrides where a line goes (null ends the dialogue). To make a character speak it, set the entity's `dialogue` property to this id (pass `speaker_entity` to do that here). Write the text in the user's language.",
  schema: z.object({
    id: Id,
    lines: z.array(z.object({
      id: Id.optional(),
      speaker: z.string().max(60),
      text: z.string().min(1).max(600),
      choices: z.array(z.object({ text: z.string().max(120), next: Id.nullable() })).max(4).optional(),
      next: Id.nullable().optional(),
    })).min(1).max(60),
    speaker_entity: Id.optional().describe("entity that starts this dialogue when the player talks to it"),
  }),
  status: "대사를 쓰는 중",
  run: (i, host) => {
    const nodes = (i.lines as Array<{ id?: string; speaker: string; text: string; choices?: Array<{ text: string; next: string | null }>; next?: string | null }>).map((l, n) => ({ ...l, id: l.id ?? `l${n + 1}` }));
    const commands: Command[] = [{ type: "setDialogue", scene: host.sceneId, dialogue: { id: i.id, nodes } }];
    if (i.speaker_entity) commands.push({ type: "setEntityProps", scene: host.sceneId, id: i.speaker_entity, props: { dialogue: i.id } });
    host.apply(commands);
    return `Dialogue ${i.id} saved (${nodes.length} lines).`;
  },
});

tool({
  name: "set_event",
  description:
    "Create or replace a scripted event. Trigger: {type:'start'} when the scene begins, {type:'touch', area:{x,y,w,h}} when the player walks into a tile rectangle, or {type:'interact', entity} when the player examines or talks to an entity (this replaces that entity's own dialogue while the event can fire). Actions run in order: {type:'dialogue', dialogue}, {type:'move', entity, to:{x,y}, speed?}, {type:'camera', to:{x,y}, seconds}, {type:'flag', flag, value}. `condition` {flag, equals} gates the event on a flag; `once` (default true) fires it a single time.",
  schema: z.object({
    id: Id.optional(),
    trigger: TriggerSchema,
    condition: z.object({ flag: Id, equals: z.boolean() }).optional(),
    once: z.boolean().optional(),
    actions: z.array(ActionSchema).min(1).max(20),
  }),
  status: "이벤트를 만드는 중",
  run: (i, host) => {
    const scene = host.doc().scenes[host.sceneId];
    const event = { trigger: i.trigger, condition: i.condition, once: i.once ?? true, actions: i.actions };
    if (i.id && scene.events[i.id]) {
      host.apply([{ type: "updateEvent", scene: host.sceneId, id: i.id, patch: event }]);
      return `Event ${i.id} updated.`;
    }
    const [id] = host.apply([{ type: "addEvent", scene: host.sceneId, event: { ...event, id: i.id } }]);
    return `Event ${id} created.`;
  },
});

tool({
  name: "rename",
  description: "Rename the project and/or the scene (names the user sees).",
  schema: z.object({ project: z.string().min(1).max(80).optional(), scene: z.string().min(1).max(80).optional() }),
  status: "이름을 바꾸는 중",
  run: (i, host) => {
    const commands: Command[] = [];
    if (i.project) commands.push({ type: "renameProject", name: i.project });
    if (i.scene) commands.push({ type: "renameScene", scene: host.sceneId, name: i.scene });
    if (commands.length) host.apply(commands);
    return "Renamed.";
  },
});

tool({
  name: "check",
  description: "Run the scene checks: exactly one player, nothing references missing things, no character stands on unwalkable ground, and the player can walk to every NPC, enemy, interactable and touch area.",
  schema: z.object({}),
  status: "장면을 점검하는 중",
  run: (_i, host) => issuesText(host.doc()),
});

tool({
  name: "look",
  description: "Take a picture of the scene as the player will see it (with lighting), with tile coordinates along the edges. Give a region in tiles to zoom in; omit it for the whole scene. Use it to judge composition, overlaps, lighting and whether the art reads well. It may be unavailable if the user's editor is not open; then rely on get_state and check.",
  schema: z.object({ x: z.number().optional(), y: z.number().optional(), w: z.number().positive().optional(), h: z.number().positive().optional() }),
  status: "장면을 살펴보는 중",
  run: async (i, host) => {
    const region = i.w && i.h ? { x: i.x ?? 0, y: i.y ?? 0, w: i.w, h: i.h } : undefined;
    const shot = await host.capture(region);
    if (!shot) return "A picture is not available right now (the editor view is not open or did not answer). Continue using get_state and check.";
    return [{ type: "image", source: { type: "base64", media_type: shot.mime, data: shot.data } }, { type: "text", text: shot.note }];
  },
});

tool({
  name: "playtest",
  description: "Play the scene headlessly as the player and report what happened. Give exactly one of: `walk_to` {x,y} (walk there; reports if it is reachable and any damage taken on the way), `talk_to` entity id (walk up, interact, read the whole dialogue), `fight` enemy id (walk up and fight until one side falls; reports who won and hits taken). Use it to confirm the scene actually works before you finish.",
  schema: z.object({ walk_to: z.object({ x: z.number(), y: z.number() }).optional(), talk_to: Id.optional(), fight: Id.optional() }),
  status: "시험 플레이 중",
  run: (i, host) => {
    const doc = host.doc();
    if (i.talk_to) return JSON.stringify(talkTo(doc, host.sceneId, i.talk_to));
    if (i.fight) return JSON.stringify(fight(doc, host.sceneId, i.fight));
    if (i.walk_to) return JSON.stringify(walkTo(doc, host.sceneId, i.walk_to));
    throw new Error("give one of walk_to, talk_to or fight");
  },
});

/** Anthropic API 에 넘길 도구 정의. */
export function toolDefinitions(): Anthropic.Tool[] {
  return tools.map((t) => {
    const { $schema: _drop, ...schema } = z.toJSONSchema(t.schema, { unrepresentable: "any" }) as Record<string, unknown>;
    return { name: t.name, description: t.description, input_schema: schema as Anthropic.Tool["input_schema"] };
  });
}

export function toolStatus(name: string): string {
  return tools.find((t) => t.name === name)?.status ?? "작업 중";
}

export const TOOL_NAMES = tools.map((t) => t.name);

/** 도구 하나를 실행한다. 입력이 틀리거나 명령이 거부되면 is_error 결과를 돌려준다. */
export async function executeTool(host: AgentHost, name: string, input: unknown): Promise<{ content: ToolContent; isError: boolean }> {
  const t = tools.find((x) => x.name === name);
  if (!t) return { content: `unknown tool ${name}`, isError: true };
  const parsed = t.schema.safeParse(input ?? {});
  if (!parsed.success) {
    const msg = parsed.error.issues.slice(0, 5).map((i: { path: PropertyKey[]; message: string }) => `${i.path.join(".") || "(input)"}: ${i.message}`).join("; ");
    return { content: `invalid input: ${msg}`, isError: true };
  }
  try {
    return { content: await t.run(parsed.data, host), isError: false };
  } catch (e) {
    if (host.signal.aborted) throw e;
    if (e instanceof CommandError) return { content: `rejected${e.index !== undefined ? ` (item ${e.index})` : ""}: ${e.message}. Nothing from this call was applied.`, isError: true };
    return { content: `failed: ${e instanceof Error ? e.message : String(e)}`, isError: true };
  }
}
