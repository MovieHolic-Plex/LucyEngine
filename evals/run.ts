// 고정된 요청들로 에이전트를 돌려 장면이 v1 기준을 채우는지 잰다. 편집기 없이 서버 쪽에서만 돈다.
//
//   pnpm eval                 내장 키트만 쓴다 (빠르고 싸다)
//   pnpm eval --generate      그림을 새로 생성한다 (v1 성공 기준 그대로, 요청마다 몇 분)
//   pnpm eval --only station,mine
//
// 결과는 evals/out/<시각>/ 에 요청별 문서와 report.json, report.md 로 남는다.
import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyTransaction, createBlankProject, findPlayer, lintProject, resolveProps, type Command, type Project } from "@age/model";
import { agentConfigFromEnv, runTurn, type AgentHost, type GeneratedArt } from "@age/agent";
import { generateAsset, providerFromEnv, recolorPng } from "@age/assets";
import { fight, talkTo } from "@age/runtime";
import { SqliteStore } from "@age/server/db";
import { StarterKit } from "@age/server/starter";

const args = process.argv.slice(2);
const generate = args.includes("--generate");
const only = args.find((a) => a.startsWith("--only"))?.split("=")[1] ?? (args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined);
const prompts = (JSON.parse(readFileSync(new URL("./prompts.json", import.meta.url), "utf8")) as Array<{ id: string; text: string }>).filter((p) => !only || only.split(",").includes(p.id));

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = join("evals", "out", stamp);
mkdirSync(outDir, { recursive: true });
const store = new SqliteStore(join("evals", "out", "store"));
const kit = new StarterKit(store);
const provider = generate ? providerFromEnv(process.env) : null;
if (generate && !provider) throw new Error("--generate 에는 IMAGE_API_BASE 나 ANTHROPIC_BASE_URL 이 필요합니다");
const client = new Anthropic();
const cfg = agentConfigFromEnv(process.env);

interface Row {
  id: string;
  ok: boolean;
  seconds: number;
  ended: string;
  toolCalls: number;
  tokensOut: number;
  checks: Record<string, boolean>;
  notes: string[];
  reply: string;
}

const rows: Row[] = [];
for (const p of prompts) {
  const started = Date.now();
  let doc: Project = createBlankProject("평가");
  const commands: Command[] = [];
  const host: AgentHost = {
    sceneId: doc.startScene,
    signal: new AbortController().signal,
    doc: () => doc,
    apply: (cmds) => {
      const r = applyTransaction(doc, cmds);
      doc = r.doc;
      commands.push(...cmds);
      return r.created;
    },
    generate: provider
      ? async (req): Promise<GeneratedArt> => {
          const g = await generateAsset(provider, { ...req, style: doc.style });
          return { file: store.putAsset(g.png, "png"), w: g.w, h: g.h, frames: g.frames, color: g.color, footprint: g.footprint };
        }
      : null,
    recolor: async (file, adjust) => store.putAsset(await recolorPng(store.readAsset(file), doc.style.palette, adjust), "png"),
    starterCommands: () => kit.registerCommands(),
    capture: async () => null,
    status: () => {},
  };
  const notes: string[] = [];
  let result: Awaited<ReturnType<typeof runTurn>> | null = null;
  try {
    result = await runTurn(client, host, { text: p.text, chips: [], history: [], canGenerate: !!provider, canLook: false }, cfg);
  } catch (e) {
    notes.push(`turn failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  const seconds = Math.round((Date.now() - started) / 1000);
  const scene = doc.scenes[doc.startScene];
  const ents = Object.values(scene.entities);
  const kindOf = (prefab: string) => doc.prefabs[prefab]?.kind;
  const npcs = ents.filter((e) => kindOf(e.prefab) === "npc" && resolveProps(doc, e).dialogue);
  const enemies = ents.filter((e) => kindOf(e.prefab) === "enemy");
  const talk = npcs[0] ? talkTo(doc, scene.id, npcs[0].id) : null;
  const battle = enemies[0] ? fight(doc, scene.id, enemies[0].id) : null;
  const placeholders = Object.values(doc.assets).filter((a) => !a.file).length;
  const issues = lintProject(doc);
  const checks = {
    finished: result?.ended === "done",
    player: !!findPlayer(doc, scene),
    talkable: !!talk?.talked,
    winnable: battle?.outcome === "enemy-defeated",
    lit: scene.ambient.toLowerCase() !== "#ffffff" || Object.keys(scene.lights).length > 0,
    lint: issues.length === 0,
    art: placeholders === 0,
  };
  if (talk && !talk.talked) notes.push(`talk to ${npcs[0].id}: ${talk.notes.join("; ")}`);
  if (battle && battle.outcome !== "enemy-defeated") notes.push(`fight vs ${enemies[0].id}: ${battle.outcome}`);
  for (const i of issues) notes.push(i.message);
  if (placeholders) notes.push(`${placeholders} placeholder assets`);
  const row: Row = { id: p.id, ok: Object.values(checks).every(Boolean), seconds, ended: result?.ended ?? "error", toolCalls: result?.toolCalls ?? 0, tokensOut: result?.usage.output ?? 0, checks, notes, reply: result?.text ?? "" };
  rows.push(row);
  writeFileSync(join(outDir, `${p.id}.json`), JSON.stringify({ prompt: p.text, doc, commands: commands.length, row }, null, 2));
  console.log(`${row.ok ? "PASS" : "FAIL"} ${p.id} ${seconds}s ${row.toolCalls} tools ${Object.entries(checks).filter(([, v]) => !v).map(([k]) => `-${k}`).join(" ")}`);
}

const pass = rows.filter((r) => r.ok).length;
const md = [
  `# 평가 ${stamp} (${generate ? "그림 생성" : "내장 키트"}, ${cfg.model}, effort ${cfg.effort})`,
  "",
  `통과 ${pass}/${rows.length}`,
  "",
  "| 요청 | 결과 | 시간 | 도구 | 출력 토큰 | 빠진 것 |",
  "|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.id} | ${r.ok ? "통과" : "실패"} | ${r.seconds}s | ${r.toolCalls} | ${r.tokensOut} | ${Object.entries(r.checks).filter(([, v]) => !v).map(([k]) => k).join(", ") || "—"} |`),
  "",
  ...rows.filter((r) => r.notes.length).flatMap((r) => [`## ${r.id}`, ...r.notes.map((n) => `- ${n}`), ""]),
].join("\n");
writeFileSync(join(outDir, "report.json"), JSON.stringify(rows, null, 2));
writeFileSync(join(outDir, "report.md"), md);
console.log(`\n${md}\n\n→ ${outDir}`);
store.close();
