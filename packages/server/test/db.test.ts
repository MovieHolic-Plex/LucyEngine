import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commit, createBlankProject, emptyHistory, goTo, runTransaction, type Command, type Project } from "@age/model";
import { SqliteStore } from "../src/db";
import { FIXTURE_COMMANDS } from "../../model/test/fixture";

const dirs: string[] = [];
function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), "age-db-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("SQLite 저장", () => {
  it("명령으로 장면을 만들고, 되돌리고, 저장 후 새 연결에서 다시 불러온다", () => {
    const dir = tempDir();
    let store = new SqliteStore(dir);
    let doc: Project = createBlankProject("기차역");
    let history = emptyHistory();
    store.createProject("p1", doc);

    const run = (cmds: Command[], label: string) => {
      const r = runTransaction(doc, cmds, { id: `t${history.cursor}-${label}`, label, source: "user", at: 1 });
      store.commit("p1", r.doc, history.cursor, r.record);
      doc = r.doc;
      history = commit(history, r.record);
    };
    // 장면 만들기: 자료 등록 한 묶음, 배치 한 묶음, 그 뒤 손 편집 둘
    run(FIXTURE_COMMANDS.slice(0, 14), "자료");
    run(FIXTURE_COMMANDS.slice(14), "배치");
    run([{ type: "moveEntity", scene: "main", id: "elder", x: 3, y: 12 }], "옮기기");
    run([{ type: "setAmbient", scene: "main", color: "#102030" }], "주변광");
    const full = doc;

    // 두 단계 되돌리기
    const back = goTo(doc, history, 2);
    doc = back.doc;
    history = back.history;
    store.setCursor("p1", doc, history.cursor);
    expect(doc.scenes.main.entities.elder.x).toBe(14.5);
    expect(doc.scenes.main.ambient).toBe("#7d7ab8");
    store.close();

    // 새 연결에서 불러오기
    store = new SqliteStore(dir);
    const loaded = store.loadProject("p1")!;
    expect(loaded.doc).toEqual(doc);
    expect(loaded.history.cursor).toBe(2);
    expect(loaded.history.records.length).toBe(4);

    // 불러온 히스토리로 다시 앞으로
    const forward = goTo(loaded.doc, loaded.history, 4);
    expect(forward.doc).toEqual(full);
    store.close();
  });

  it("과거 시점에서 저장하면 그 뒤의 기록이 지워진다", () => {
    const dir = tempDir();
    const store = new SqliteStore(dir);
    let doc = createBlankProject();
    let history = emptyHistory();
    store.createProject("p", doc);
    for (const color of ["#111111", "#222222", "#333333"]) {
      const r = runTransaction(doc, [{ type: "setAmbient", scene: "main", color }], { id: color, label: color, source: "user", at: 0 });
      store.commit("p", r.doc, history.cursor, r.record);
      doc = r.doc;
      history = commit(history, r.record);
    }
    ({ doc, history } = goTo(doc, history, 1));
    const r = runTransaction(doc, [{ type: "setAmbient", scene: "main", color: "#abcdef" }], { id: "new", label: "new", source: "ai", at: 0 });
    store.commit("p", r.doc, history.cursor, r.record);
    const loaded = store.loadProject("p")!;
    expect(loaded.history.records.map((x) => x.id)).toEqual(["#111111", "new"]);
    expect(loaded.doc.scenes.main.ambient).toBe("#abcdef");
    store.close();
  });

  it("채팅과 에셋 파일을 저장한다", () => {
    const dir = tempDir();
    const store = new SqliteStore(dir);
    store.createProject("p", createBlankProject());
    store.appendChat("p", { id: "c1", role: "user", text: "기차역 마을", at: 1 });
    store.appendChat("p", { id: "c2", role: "assistant", text: "", at: 2 });
    store.updateChat("p", { id: "c2", role: "assistant", text: "만들었습니다", at: 2, card: { txId: "t", summary: "장면 생성", issues: [], placeholders: [] } });
    expect(store.loadProject("p")!.chat.map((c) => c.text)).toEqual(["기차역 마을", "만들었습니다"]);
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const file = store.putAsset(bytes, "png");
    expect(store.putAsset(bytes, "png")).toBe(file);
    expect([...store.readAsset(file)]).toEqual([1, 2, 3, 4]);
    expect(() => store.assetPath("../../etc/passwd")).toThrow();
    store.close();
  });
});
