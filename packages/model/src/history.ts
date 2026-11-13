import { applyCommand, applyTransaction, type Command } from "./commands";
import type { Project } from "./schema";

/** 한 번에 되돌려지는 단위. AI 의 한 턴이나 손 조작 한 번이 트랜잭션 하나다. */
export interface TxRecord {
  id: string;
  /** 변경 카드와 히스토리에 보이는 한 줄 요약. */
  label: string;
  source: "user" | "ai";
  commands: Command[];
  /** 되돌릴 때 이 순서대로 적용한다. */
  inverses: Command[];
  at: number;
}

/** 선형 히스토리. cursor 는 지금 문서에 적용돼 있는 기록 수다. */
export interface History {
  records: TxRecord[];
  cursor: number;
}

export const emptyHistory = (): History => ({ records: [], cursor: 0 });

/** 명령 묶음을 적용하고 기록을 만든다. 실패하면 CommandError 를 던진다. */
export function runTransaction(doc: Project, commands: Command[], info: { id: string; label: string; source: "user" | "ai"; at: number }): { doc: Project; record: TxRecord; created: Array<string | undefined> } {
  const r = applyTransaction(doc, commands);
  return { doc: r.doc, record: { ...info, commands, inverses: r.inverses }, created: r.created };
}

/** 새 기록을 쌓는다. 과거 시점에 있었다면 그 뒤의 기록은 버린다. */
export function commit(history: History, record: TxRecord): History {
  return { records: [...history.records.slice(0, history.cursor), record], cursor: history.cursor + 1 };
}

function applyAll(doc: Project, commands: Command[]): Project {
  let cur = doc;
  for (const c of commands) cur = applyCommand(cur, c).doc;
  return cur;
}

export function undoRecord(doc: Project, record: TxRecord): Project {
  return applyAll(doc, record.inverses);
}

export function redoRecord(doc: Project, record: TxRecord): Project {
  return applyAll(doc, record.commands);
}

/** 히스토리의 target 시점(적용된 기록 수)으로 문서를 옮긴다. */
export function goTo(doc: Project, history: History, target: number): { doc: Project; history: History } {
  const to = Math.max(0, Math.min(history.records.length, target));
  let cur = doc;
  for (let i = history.cursor; i > to; i--) cur = undoRecord(cur, history.records[i - 1]);
  for (let i = history.cursor; i < to; i++) cur = redoRecord(cur, history.records[i]);
  return { doc: cur, history: { records: history.records, cursor: to } };
}

/** 기록 하나만 골라 되돌린다 (변경 카드의 되돌리기). 맨 끝 기록일 때만 히스토리에서 뺀다. */
export function canUndo(history: History): boolean {
  return history.cursor > 0;
}

export function canRedo(history: History): boolean {
  return history.cursor < history.records.length;
}
