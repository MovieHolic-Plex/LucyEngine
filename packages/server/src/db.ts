import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validateProject, type History, type Project, type TxRecord } from "@age/model";

/** 채팅 한 줄. 변경 카드는 assistant 항목의 card 에 들어간다. */
export interface ChatEntry {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: number;
  /** 사용자가 가리킨 대상. */
  chips?: Chip[];
  card?: ChangeCard;
  /** 실패하거나 중단된 턴이면 그 사유. */
  error?: string;
}

export type Chip =
  | { kind: "entity"; id: string; label: string }
  | { kind: "light"; id: string; label: string }
  | { kind: "area"; x: number; y: number; w: number; h: number; label: string };

export interface ChangeCard {
  txId: string;
  summary: string;
  /** 전/후 썸네일 (데이터 주소). 없을 수 있다. */
  before?: string;
  after?: string;
  /** 턴이 끝났을 때 남은 린트 문제. */
  issues: string[];
  /** 임시 그림으로 대신한 에셋. */
  placeholders: string[];
}

export interface StoredProject {
  doc: Project;
  history: History;
  chat: ChatEntry[];
}

/** 저장 어댑터. 서버는 SQLite 구현을 쓰고, 데스크톱 버전은 같은 스키마를 로컬 파일로 쓴다. */
export interface Store {
  createProject(id: string, doc: Project): void;
  loadProject(id: string): StoredProject | null;
  listProjects(): Array<{ id: string; name: string; updatedAt: number }>;
  /** 새 기록을 쌓는다. cursor 뒤의 기록은 버린다. */
  commit(id: string, doc: Project, cursorBefore: number, record: TxRecord): void;
  /** 히스토리 시점만 옮긴다. */
  setCursor(id: string, doc: Project, cursor: number): void;
  appendChat(id: string, entry: ChatEntry): void;
  updateChat(id: string, entry: ChatEntry): void;
  putAsset(bytes: Uint8Array, ext: string): string;
  assetPath(file: string): string;
  readAsset(file: string): Buffer;
  close(): void;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  doc TEXT NOT NULL,
  cursor INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS transactions (
  project_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  record TEXT NOT NULL,
  PRIMARY KEY (project_id, seq)
);
CREATE TABLE IF NOT EXISTS chat (
  project_id TEXT NOT NULL,
  id TEXT NOT NULL,
  ord INTEGER NOT NULL,
  entry TEXT NOT NULL,
  PRIMARY KEY (project_id, id)
);
CREATE TABLE IF NOT EXISTS assets (
  file TEXT PRIMARY KEY,
  bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
`;

export class SqliteStore implements Store {
  private db: DatabaseSync;
  private assetDir: string;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.assetDir = join(dataDir, "assets");
    mkdirSync(this.assetDir, { recursive: true });
    this.db = new DatabaseSync(join(dataDir, "app.db"));
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
    this.db.exec(SCHEMA);
  }

  private tx<T>(fn: () => T): T {
    this.db.exec("BEGIN");
    try {
      const r = fn();
      this.db.exec("COMMIT");
      return r;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  createProject(id: string, doc: Project): void {
    const now = Date.now();
    this.db.prepare("INSERT INTO projects (id, name, doc, cursor, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)").run(id, doc.meta.name, JSON.stringify(doc), now, now);
  }

  loadProject(id: string): StoredProject | null {
    const row = this.db.prepare("SELECT doc, cursor FROM projects WHERE id = ?").get(id) as { doc: string; cursor: number } | undefined;
    if (!row) return null;
    const doc = validateProject(JSON.parse(row.doc));
    const records = (this.db.prepare("SELECT record FROM transactions WHERE project_id = ? ORDER BY seq").all(id) as Array<{ record: string }>).map((r) => JSON.parse(r.record) as TxRecord);
    const chat = (this.db.prepare("SELECT entry FROM chat WHERE project_id = ? ORDER BY ord").all(id) as Array<{ entry: string }>).map((r) => JSON.parse(r.entry) as ChatEntry);
    return { doc, history: { records, cursor: Math.min(row.cursor, records.length) }, chat };
  }

  listProjects(): Array<{ id: string; name: string; updatedAt: number }> {
    return (this.db.prepare("SELECT id, name, updated_at FROM projects ORDER BY updated_at DESC").all() as Array<{ id: string; name: string; updated_at: number }>).map((r) => ({ id: r.id, name: r.name, updatedAt: r.updated_at }));
  }

  commit(id: string, doc: Project, cursorBefore: number, record: TxRecord): void {
    this.tx(() => {
      this.db.prepare("DELETE FROM transactions WHERE project_id = ? AND seq >= ?").run(id, cursorBefore);
      this.db.prepare("INSERT INTO transactions (project_id, seq, record) VALUES (?, ?, ?)").run(id, cursorBefore, JSON.stringify(record));
      this.db.prepare("UPDATE projects SET doc = ?, name = ?, cursor = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(doc), doc.meta.name, cursorBefore + 1, Date.now(), id);
    });
  }

  setCursor(id: string, doc: Project, cursor: number): void {
    this.db.prepare("UPDATE projects SET doc = ?, name = ?, cursor = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(doc), doc.meta.name, cursor, Date.now(), id);
  }

  appendChat(id: string, entry: ChatEntry): void {
    const row = this.db.prepare("SELECT COALESCE(MAX(ord), 0) + 1 AS n FROM chat WHERE project_id = ?").get(id) as { n: number };
    this.db.prepare("INSERT INTO chat (project_id, id, ord, entry) VALUES (?, ?, ?, ?)").run(id, entry.id, row.n, JSON.stringify(entry));
  }

  updateChat(id: string, entry: ChatEntry): void {
    this.db.prepare("UPDATE chat SET entry = ? WHERE project_id = ? AND id = ?").run(JSON.stringify(entry), id, entry.id);
  }

  putAsset(bytes: Uint8Array, ext: string): string {
    const file = `${createHash("sha256").update(bytes).digest("hex").slice(0, 32)}.${ext}`;
    const path = join(this.assetDir, file);
    if (!existsSync(path)) {
      writeFileSync(path, bytes);
      this.db.prepare("INSERT OR IGNORE INTO assets (file, bytes, created_at) VALUES (?, ?, ?)").run(file, bytes.byteLength, Date.now());
    }
    return file;
  }

  assetPath(file: string): string {
    if (!/^[a-f0-9]{32}\.(png|jpg|webp)$/.test(file)) throw new Error("bad asset name");
    return join(this.assetDir, file);
  }

  readAsset(file: string): Buffer {
    return readFileSync(this.assetPath(file));
  }

  close(): void {
    this.db.close();
  }
}
