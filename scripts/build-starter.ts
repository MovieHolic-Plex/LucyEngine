// 내장 키트를 만든다: 0단계에서 뽑아 둔 원본과 새로 생성한 그림을 같은 후처리로 에셋으로 만든다.
// 결과는 packages/server/starter 에 두고 저장소에 함께 올린다.
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { buildPalette, indexPalette, defaultStyle, type EntityProps, type PrefabKind } from "@age/model";
import { providerFromEnv, decode, encodePng, indexedToImg, processRaw, buildPrompt, DEFAULT_HEIGHT, HUMAN_HEIGHT, type GenKind } from "@age/assets";

const OUT = "packages/server/starter";
const RAW = "spike/out/kit";
await mkdir(OUT, { recursive: true });
await mkdir(RAW, { recursive: true });

const MOOD = "a run-down small town built around an abandoned railway station, rusty metal, weathered wood, overgrown plants, warm evening after rain";
const style = { ...defaultStyle(), mood: MOOD };
const palette = indexPalette(buildPalette());
const provider = providerFromEnv();

interface Item {
  id: string;
  name: string;
  kind: GenKind;
  /** 0단계에서 받아 둔 원본. 없으면 desc 로 새로 그린다. */
  from?: string;
  desc: string;
  height?: number;
  prefab?: { kind: PrefabKind; props?: EntityProps };
  material?: { walkable: boolean; priority: number; edge: "soft" | "hard" };
}

const items: Item[] = [
  { id: "dirt", name: "흙바닥", kind: "terrain", from: "a-r2/t_dirt", desc: "packed brown dirt ground with tiny pebbles", material: { walkable: true, priority: 1, edge: "soft" } },
  { id: "pavement", name: "낡은 포장", kind: "terrain", from: "a-r4/t_pavement", desc: "cracked old concrete pavement with small weeds in the cracks", material: { walkable: true, priority: 2, edge: "hard" } },
  { id: "grass", name: "풀밭", kind: "terrain", from: "a-r2/t_grass", desc: "overgrown wild grass with a few tiny clover leaves", material: { walkable: true, priority: 3, edge: "soft" } },
  { id: "water", name: "물", kind: "terrain", desc: "calm dark teal pond water with small soft ripples", material: { walkable: false, priority: -1, edge: "soft" } },
  { id: "planks", name: "나무 마루", kind: "terrain", desc: "old wooden floor planks laid horizontally, worn and faded", material: { walkable: true, priority: 4, edge: "hard" } },

  { id: "barrel", name: "드럼통", kind: "prop", from: "a-r2/p_barrel", desc: "a rusty oil drum barrel", height: 30, prefab: { kind: "prop" } },
  { id: "crate", name: "나무 상자", kind: "prop", from: "a-r4/p_crate", desc: "a weathered wooden shipping crate", height: 26, prefab: { kind: "prop" } },
  { id: "lamp", name: "가로등", kind: "prop", from: "a-r4/p_lamp", desc: "an old iron street lamp post with a glowing warm lantern on top", height: 64, prefab: { kind: "prop", props: { light: { color: "#ffb46a", radius: 6, intensity: 0.95 } } } },
  { id: "bench", name: "벤치", kind: "prop", from: "a-r5/p_bench", desc: "a worn wooden station bench facing the viewer", height: 22, prefab: { kind: "prop" } },
  { id: "sign", name: "표지판", kind: "prop", from: "a-r4/p_sign", desc: "a wooden signpost with a blank rusty metal plate", height: 36, prefab: { kind: "prop" } },
  { id: "vending", name: "자판기", kind: "prop", from: "a-r4/p_vending", desc: "an old dented vending machine with faded colours and a faint glow", height: 46, prefab: { kind: "prop", props: { light: { color: "#6fe6d6", radius: 3.5, intensity: 0.7 } } } },
  { id: "bush", name: "덤불", kind: "prop", from: "a-r2/p_bush", desc: "a round leafy green bush", height: 22, prefab: { kind: "prop" } },
  { id: "tree", name: "나무", kind: "prop", from: "a-r5/p_tree", desc: "a broad leafy tree with a thick trunk", height: 84, prefab: { kind: "prop" } },
  { id: "rock", name: "바위", kind: "prop", desc: "a mossy grey boulder", height: 22, prefab: { kind: "prop" } },
  { id: "fence", name: "울타리", kind: "prop", desc: "a short section of weathered wooden picket fence, seen from the front", height: 24, prefab: { kind: "prop" } },
  { id: "flowers", name: "들꽃", kind: "prop", desc: "a small patch of wild flowers, yellow and white, low to the ground", height: 14, prefab: { kind: "prop", props: { solid: false } } },
  { id: "campfire", name: "모닥불", kind: "prop", desc: "a small campfire with burning logs ringed by stones", height: 24, prefab: { kind: "prop", props: { light: { color: "#ff9a4a", radius: 5, intensity: 1, flicker: true, height: 0.4 } } } },
  { id: "chest", name: "보물 상자", kind: "prop", desc: "a closed wooden treasure chest with iron bands", height: 20, prefab: { kind: "prop" } },

  { id: "house", name: "판잣집", kind: "building", from: "a-r4/b_house", desc: "a small ramshackle two-storey house patched together from wood planks and corrugated tin, with a door in the middle of the front wall, a window and a slanted tin roof", height: 128, prefab: { kind: "building" } },
  { id: "shop", name: "매표소 가게", kind: "building", from: "a-r2/b_shop", desc: "a small ticket booth shop converted from an old train carriage, with an awning, a counter window and a door", height: 110, prefab: { kind: "building" } },

  { id: "hero", name: "주인공", kind: "character", from: "a-r4/c_hero", desc: "a young adventurer girl with short dark hair, a red scarf, a mustard jacket and a big wrench on her back", prefab: { kind: "player", props: { hp: 6, speed: 4, damage: 1 } } },
  { id: "oldman", name: "노인", kind: "character", from: "a-r4/c_npc", desc: "an old shopkeeper man with a white beard, a green apron and a flat cap", prefab: { kind: "npc", props: { name: "노인", behavior: "idle" } } },
  { id: "villager", name: "마을 사람", kind: "character", desc: "a village woman with a braided ponytail, a faded blue work dress and rubber boots", prefab: { kind: "npc", props: { name: "마을 사람", behavior: "wander", speed: 1.2 } } },

  { id: "slime", name: "곰팡이 슬라임", kind: "creature", from: "a-r4/c_slime", desc: "a small blobby mould slime monster, teal with glowing yellow eyes", height: 22, prefab: { kind: "enemy", props: { hp: 2, speed: 1.6, damage: 1, behavior: "chase", aggroRange: 5 } } },
  { id: "crab", name: "고철 게", kind: "creature", from: "a-r2/c_crab", desc: "a small rusty scrap-metal crab robot with one glowing red eye", height: 22, prefab: { kind: "enemy", props: { hp: 3, speed: 2.2, damage: 1, behavior: "patrol", aggroRange: 4 } } },
  { id: "spitter", name: "포자 꽃", kind: "creature", desc: "a carnivorous spore plant monster with a bulbous purple head and a toothy mouth, rooted in place", height: 28, prefab: { kind: "enemy", props: { hp: 2, speed: 0.6, damage: 1, behavior: "ranged", aggroRange: 6 } } },
];

const library = { mood: MOOD, assets: [] as unknown[], materials: [] as unknown[], prefabs: [] as unknown[] };

function dominant(idx: Int16Array): string {
  const counts = new Map<number, number>();
  for (const c of idx) if (c > 0) counts.set(c, (counts.get(c) ?? 0) + 1);
  let best = 1, n = -1;
  for (const [c, k] of counts) if (k > n) { n = k; best = c; }
  return palette.colors[best];
}

async function rawFor(it: Item): Promise<Buffer> {
  if (it.from) return readFile(`spike/out/${it.from}.raw.jpg`);
  const path = `${RAW}/${it.id}.raw.jpg`;
  if (existsSync(path)) return readFile(path);
  if (!provider) throw new Error("image provider is not configured");
  const prompt = buildPrompt({ kind: it.kind, description: it.desc, style });
  const bytes = await provider.generate({ prompt, aspect: it.kind === "character" ? "3:2" : "1:1" });
  await writeFile(path, bytes);
  return bytes;
}

async function one(it: Item): Promise<void> {
  const height = it.kind === "character" ? HUMAN_HEIGHT : it.height ?? DEFAULT_HEIGHT[it.kind];
  let done = processRaw(it.kind, await decode(await rawFor(it)), palette, height);
  for (let retry = 0; done.problems.length && retry < 2 && !it.from && provider; retry++) {
    console.log("retry", it.id, done.problems.join("; "));
    const prompt = buildPrompt({ kind: it.kind, description: it.desc, style });
    const bytes = await provider.generate({ prompt, aspect: it.kind === "character" ? "3:2" : "1:1" });
    await writeFile(`${RAW}/${it.id}.raw.jpg`, bytes);
    done = processRaw(it.kind, await decode(bytes), palette, height);
  }
  if (done.problems.length) throw new Error(`${it.id}: ${done.problems.join("; ")}`);
  const file = `${it.id}.png`;
  await writeFile(`${OUT}/${file}`, await encodePng(indexedToImg(done.ix, palette)));
  const prefix = it.kind === "terrain" ? "tex" : it.kind === "character" || it.kind === "creature" ? "chr" : "spr";
  const assetId = `${prefix}_${it.id}`;
  library.assets.push({
    id: assetId,
    kind: it.kind === "terrain" ? "texture" : done.frames ? "character" : "sprite",
    file,
    w: done.ix.w,
    h: done.ix.h,
    ...(done.frames ? { frames: done.frames } : {}),
    ...(done.footprint ? { footprint: done.footprint } : {}),
    color: dominant(done.ix.idx),
    prompt: it.desc,
  });
  if (it.material) library.materials.push({ id: it.id, name: it.name, asset: assetId, color: dominant(done.ix.idx), ...it.material });
  if (it.prefab) library.prefabs.push({ id: it.id, name: it.name, kind: it.prefab.kind, asset: assetId, props: it.prefab.props ?? {} });
  console.log("ok", it.id, `${done.ix.w}x${done.ix.h}`);
}

// 순서를 지키려고 결과를 따로 모은 뒤 항목 순서대로 정렬한다
const queue = [...items];
const failures: string[] = [];
await Promise.all(Array.from({ length: 4 }, async () => {
  for (let it = queue.shift(); it; it = queue.shift()) {
    try { await one(it); } catch (e) { failures.push(String(e)); console.log("FAIL", String(e).slice(0, 200)); }
  }
}));
const order = (id: string) => items.findIndex((it) => id.endsWith(`_${it.id}`) || id === it.id);
for (const key of ["assets", "materials", "prefabs"] as const) (library[key] as Array<{ id: string }>).sort((a, b) => order(a.id) - order(b.id));
await writeFile(`${OUT}/library.json`, JSON.stringify(library, null, 1) + "\n");
console.log(`${library.assets.length} assets, ${library.materials.length} materials, ${library.prefabs.length} prefabs; failures: ${failures.length}`);
if (failures.length) process.exitCode = 1;
