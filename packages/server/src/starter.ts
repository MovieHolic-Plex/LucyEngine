import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyTransaction, createBlankProject, type Asset, type Command, type Material, type Prefab, type Project } from "@age/model";
import type { Store } from "./db";

const here = dirname(fileURLToPath(import.meta.url));
const STARTER_DIR = join(here, "..", "starter");

interface Library {
  mood: string;
  assets: Asset[];
  materials: Material[];
  prefabs: Prefab[];
}

/** 내장 키트. 그림 파일을 저장소에 넣고, 프로젝트에 등록하는 명령을 만들어 준다. */
export class StarterKit {
  private commands: Command[] = [];
  readonly available: boolean;

  constructor(store: Store) {
    const path = join(STARTER_DIR, "library.json");
    this.available = existsSync(path);
    if (!this.available) return;
    const lib = JSON.parse(readFileSync(path, "utf8")) as Library;
    const commands: Command[] = [{ type: "setStyle", patch: { mood: lib.mood } }];
    for (const a of lib.assets) {
      const file = a.file ? store.putAsset(readFileSync(join(STARTER_DIR, a.file)), "png") : null;
      commands.push({ type: "registerAsset", asset: { ...a, file } });
    }
    for (const m of lib.materials) commands.push({ type: "defineMaterial", material: m });
    for (const p of lib.prefabs) commands.push({ type: "definePrefab", prefab: p });
    this.commands = commands;
  }

  registerCommands(): Command[] {
    return this.commands;
  }
}

/** 예시 장면: 버려진 기차역 앞 광장. 내장 키트만으로 만든다. */
export function demoCommands(): Command[] {
  const rows = [
    "gggggggggggggggggggggggggggggggggg",
    "gggggggggggggggggggggggggggggggggg",
    "ggggddddddddddgggggddddddddddggggg",
    "gggdddddddddddddgdddddddddddddgggg",
    "gggddddddddddddddddddddddddddddggg",
    "gggddddddddddddddddddddddddddddwww",
    "ggddpppppppppppppppppppppppppdwwww",
    "ggddpppppppppppppppppppppppppdwwww",
    "gdddpppppppppppppppppppppppppddwww",
    "gdddpppppppppppppppppppppppppdddgg",
    "ggddpppppppppppppppppppppppppdddgg",
    "ggddpppppppppppppppppppppppppddggg",
    "gggdddddddddddppdddddddddddddddggg",
    "ggggdddddddddddppddddddddddddggggg",
    "gggggggddddddddppdddddddddgggggggg",
    "gggggggggdddddddppdddddggggggggggg",
    "ggggggggggggdddddppddggggggggggggg",
    "gggggggggggggggdddppgggggggggggggg",
    "ggggggggggggggggggppgggggggggggggg",
    "ggggggggggggggggggppgggggggggggggg",
  ];
  const legend: Record<string, string> = { g: "grass", d: "dirt", p: "pavement", w: "water" };
  const cells: Array<{ x: number; y: number; material: string }> = [];
  rows.forEach((row, y) => [...row].forEach((ch, x) => cells.push({ x, y, material: legend[ch] })));
  const add = (prefab: string, x: number, y: number, id?: string, props?: Record<string, unknown>): Command => ({ type: "addEntity", scene: "main", entity: { id, prefab, x, y, props: props as never } });
  return [
    { type: "renameProject", name: "기차역 앞 광장" },
    { type: "renameScene", scene: "main", name: "기차역 앞 광장" },
    { type: "resizeScene", scene: "main", w: 34, h: 20, fill: "grass" },
    { type: "paintTerrain", scene: "main", cells },
    add("house", 8.5, 6, "house"),
    add("shop", 22.5, 6, "shop"),
    add("tree", 2.5, 10.5), add("tree", 30.5, 15.5), add("tree", 5.5, 17.5), add("tree", 15.5, 2.2),
    add("lamp", 14.5, 7.2, "lamp_square"), add("lamp", 4.5, 13.6, "lamp_west"), add("lamp", 27.5, 12.4, "lamp_east"),
    add("vending", 27.2, 6.4), add("barrel", 12.3, 6.5), add("barrel", 13.1, 6.9), add("crate", 18.4, 6.5), add("crate", 19.2, 7.1),
    add("bench", 9.5, 11.6), add("sign", 15.6, 13.3, "sign", { dialogue: "sign" }),
    add("bush", 4.6, 5.4), add("bush", 26.2, 14.6), add("bush", 20.6, 16.4), add("rock", 31.4, 9.6), add("flowers", 6.5, 15.5), add("flowers", 24.5, 16.5), add("flowers", 2.5, 3.5),
    add("fence", 11, 15.4), add("fence", 12.7, 15.4),
    add("hero", 16.5, 10.5, "player"),
    add("oldman", 21.5, 7.7, "keeper", { name: "매표소 영감", dialogue: "keeper" }),
    add("villager", 9.5, 9.2, "villager", { name: "수리공 미나", dialogue: "villager" }),
    add("slime", 7.5, 13.6, "slime1"), add("slime", 25.5, 15.4, "slime2"),
    add("crab", 23.5, 11.6, "crab1", { patrol: [{ x: 3.5, y: 0 }] }),
    { type: "setAmbient", scene: "main", color: "#7d7ab8" },
    { type: "setPost", scene: "main", patch: { bloom: 0.42, vignette: 0.3, saturation: 0.12, contrast: 0.08 } },
    { type: "addLight", scene: "main", light: { id: "shop_window", x: 22.2, y: 4.6, color: "#ffd9a0", radius: 5, intensity: 0.7 } },
    { type: "addLight", scene: "main", light: { id: "house_window", x: 8.6, y: 4.2, color: "#ffc070", radius: 3.5, intensity: 0.5 } },
    { type: "setDialogue", scene: "main", dialogue: { id: "keeper", nodes: [
      { id: "a", speaker: "매표소 영감", text: "어이, 처음 보는 얼굴이구먼. 이 역엔 기차가 안 선 지 십 년이 넘었네." },
      { id: "b", speaker: "매표소 영감", text: "그래도 표는 팔지. 살 텐가?", choices: [{ text: "한 장 주세요", next: "c" }, { text: "괜찮아요", next: "d" }] },
      { id: "c", speaker: "매표소 영감", text: "허허, 농담일세. 대신 광장에 기어다니는 고철 게나 좀 쫓아 주게.", next: null },
      { id: "d", speaker: "매표소 영감", text: "그럼 구경이나 하다 가게. 남쪽 풀밭은 조심하고.", next: null },
    ] } },
    { type: "setDialogue", scene: "main", dialogue: { id: "villager", nodes: [
      { id: "a", speaker: "수리공 미나", text: "자판기 고치러 왔는데, 저 슬라임들이 자꾸 전선을 갉아먹어." },
      { id: "b", speaker: "수리공 미나", text: "그 렌치, 꽤 쓸 만해 보이네. 한 대 때리면 물러날 거야." },
    ] } },
    { type: "setDialogue", scene: "main", dialogue: { id: "sign", nodes: [{ id: "a", speaker: "", text: "「남쪽 선로 — 운행 중단」 누군가 그 아래에 작게 적어 놓았다. \"곧 돌아옵니다\"" }] } },
  ];
}

export function demoProject(kit: StarterKit): Project {
  return applyTransaction(createBlankProject("기차역 앞 광장"), [...kit.registerCommands(), ...demoCommands()]).doc;
}
