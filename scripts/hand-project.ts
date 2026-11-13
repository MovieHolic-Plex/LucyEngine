// 예시 장면의 그림을 다른 묶음으로 바꿔 끼운 프로젝트를 만든다.
//   pnpm exec tsx scripts/hand-project.ts <png 폴더> "<프로젝트 이름>"
// 폴더에 <id>.png 가 있는 것만 바꾼다. 캐릭터는 5×3 프레임 시트여야 한다.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { applyTransaction, type Command } from "@age/model";
import { decode } from "@age/assets";
import { SqliteStore } from "@age/server/db";
import { StarterKit, demoProject } from "@age/server/starter";
import { SPECS } from "../packages/assets/src/hand/specs";

const [dir, name = "그림 비교"] = process.argv.slice(2);
const store = new SqliteStore(process.env.DATA_DIR ?? "data");
const base = demoProject(new StarterKit(store));
const commands: Command[] = [{ type: "renameProject", name }];
let n = 0;
for (const s of SPECS) {
  const path = join(dir, `${s.id}.png`);
  if (!existsSync(path)) continue;
  const bytes = readFileSync(path);
  const img = await decode(bytes);
  const assetId = s.kind === "terrain" ? base.materials[s.id]?.asset : base.prefabs[s.id]?.asset;
  if (!assetId) continue;
  const sheet = s.kind === "character" || s.kind === "creature";
  commands.push({
    type: "replaceAsset",
    id: assetId,
    asset: {
      file: store.putAsset(bytes, "png"),
      w: img.w,
      h: img.h,
      frames: sheet ? { frameW: img.w / 5, frameH: img.h / 3, perRow: 5, rows: ["down", "up", "side"] } : undefined,
      footprint: s.footprint,
    },
  });
  n++;
}
const doc = applyTransaction(base, commands).doc;
const id = randomBytes(14).toString("base64url").slice(0, 18);
store.createProject(id, doc);
store.close();
console.log(`${n} assets replaced → project ${id}`);
