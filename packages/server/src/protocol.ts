import type { Command, Project } from "@age/model";
import type { ChatEntry, Chip } from "./db";

// 편집기와 서버가 WebSocket 으로 주고받는 메시지.

export interface TxMeta {
  id: string;
  label: string;
  source: "user" | "ai";
  at: number;
}

export interface CaptureRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ClientMessage =
  /** 손 편집 한 번. 편집기는 먼저 자기 화면에 반영해 두고 보낸다. */
  | { t: "tx"; id: string; label: string; commands: Command[] }
  /** 히스토리의 한 시점으로 간다 (되돌리기·다시 하기 포함). */
  | { t: "goto"; cursor: number }
  | { t: "chat"; text: string; chips: Chip[] }
  | { t: "stop" }
  | { t: "captured"; req: number; data: string | null; mime?: "image/png" | "image/jpeg"; note?: string }
  /** 변경 카드에 붙일 전/후 그림. */
  | { t: "thumbs"; chat: string; before?: string; after?: string };

export type ServerMessage =
  | { t: "init"; doc: Project; history: TxMeta[]; cursor: number; chat: ChatEntry[]; busy: boolean; canGenerate: boolean }
  /** 보낸 손 편집이 받아들여졌다. */
  | { t: "ack"; id: string; meta: TxMeta; cursor: number }
  /** 다른 곳에서 확정된 변경. */
  | { t: "applied"; meta: TxMeta; commands: Command[]; cursor: number }
  /** 문서를 통째로 다시 맞춘다 (거부된 편집, 시점 이동). */
  | { t: "reset"; doc: Project; history: TxMeta[]; cursor: number; reason?: string }
  /** AI 가 작업 중인 변경. 아직 확정되지 않았다. */
  | { t: "preview"; commands: Command[] }
  /** AI 턴이 확정됐다. */
  | { t: "turn-commit"; doc: Project; meta: TxMeta; cursor: number; chat: string }
  /** AI 턴이 버려졌다. 미리보기를 지운다. */
  | { t: "turn-discard" }
  | { t: "busy"; busy: boolean }
  | { t: "status"; text: string | null }
  | { t: "chat-entry"; entry: ChatEntry }
  | { t: "chat-delta"; id: string; delta: string }
  | { t: "chat-clear"; id: string }
  | { t: "capture"; req: number; region?: CaptureRegion }
  | { t: "error"; message: string };

export type { ChatEntry, Chip, ChangeCard } from "./db";
