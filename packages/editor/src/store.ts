import { create } from "zustand";
import { applyTransaction, resolveProps, type Command, type Project, type Scene } from "@age/model";
import type { ChatEntry, Chip, ServerMessage, TxMeta } from "@age/server/protocol";
import { Connection } from "./net";
import { captureForAgent, getView, thumbnail } from "./view";

export type Selection = { kind: "entity"; id: string } | { kind: "light"; id: string } | null;
export type Tool = "select" | "brush";
export type Panel = null | "scene" | "library";

interface State {
  projectId: string | null;
  conn: "connecting" | "open" | "closed" | "missing";
  /** 확정된 문서 (내가 방금 한 편집 포함). */
  doc: Project | null;
  /** AI 가 작업 중인 문서. 턴이 끝나면 확정되거나 버려진다. */
  preview: Project | null;
  /** 끌어서 고치는 동안만 보이는 문서 (붓질, 슬라이더). */
  draft: Project | null;
  history: TxMeta[];
  cursor: number;
  chat: ChatEntry[];
  busy: boolean;
  status: string | null;
  canGenerate: boolean;
  selection: Selection;
  chips: Chip[];
  tool: Tool;
  brush: { material: string | null; size: number };
  panel: Panel;
  paletteOpen: boolean;
  playing: boolean;
  lighting: boolean;
  chatOpen: boolean;
  toast: { text: string; key: number } | null;
  /** 채팅 입력창에 넣어 줄 글 (인스펙터의 "다시 그려줘" 등). */
  compose: { text: string; key: number } | null;
}

export const useStore = create<State>(() => ({
  projectId: null,
  conn: "connecting",
  doc: null,
  preview: null,
  draft: null,
  history: [],
  cursor: 0,
  chat: [],
  busy: false,
  status: null,
  canGenerate: false,
  selection: null,
  chips: [],
  tool: "select",
  brush: { material: null, size: 1 },
  panel: null,
  paletteOpen: false,
  playing: false,
  lighting: true,
  chatOpen: true,
  toast: null,
  compose: null,
}));

const set = useStore.setState;
const get = useStore.getState;

export const viewDoc = (s: State): Project | null => s.draft ?? s.preview ?? s.doc;
export const sceneOf = (doc: Project | null): Scene | null => (doc ? (doc.scenes[doc.startScene] ?? null) : null);

let conn: Connection | null = null;
let toastKey = 0;
let txSeq = 0;
/** AI 턴이 시작될 때 찍어 둔 그림. 변경 카드의 "전". */
let beforeShot: Promise<string | undefined> | null = null;

export function toast(text: string): void {
  set({ toast: { text, key: ++toastKey } });
}

function withHistory(meta: TxMeta, cursor: number): Pick<State, "history" | "cursor"> {
  return { history: [...get().history.slice(0, cursor - 1), meta], cursor };
}

/** 문서가 바뀐 뒤 사라진 대상을 가리키고 있으면 놓는다. */
function prune(doc: Project | null): Partial<State> {
  const s = get();
  const scene = sceneOf(doc);
  if (!scene) return {};
  const out: Partial<State> = {};
  const sel = s.selection;
  if (sel && !(sel.kind === "entity" ? scene.entities[sel.id] : scene.lights[sel.id])) out.selection = null;
  const chips = s.chips.filter((c) => c.kind === "area" || (c.kind === "entity" ? scene.entities[c.id] : scene.lights[c.id]));
  if (chips.length !== s.chips.length) out.chips = chips;
  if (s.brush.material && !doc!.materials[s.brush.material]) out.brush = { ...s.brush, material: null };
  return out;
}

function onMessage(msg: ServerMessage): void {
  const s = get();
  switch (msg.t) {
    case "init":
      set({ doc: msg.doc, preview: null, draft: null, history: msg.history, cursor: msg.cursor, chat: msg.chat, busy: msg.busy, canGenerate: msg.canGenerate, status: null });
      set(prune(msg.doc));
      return;
    case "ack":
      set(withHistory(msg.meta, msg.cursor));
      return;
    case "applied": {
      if (!s.doc) return;
      try {
        const doc = applyTransaction(s.doc, msg.commands).doc;
        set({ doc, ...withHistory(msg.meta, msg.cursor) });
        set(prune(doc));
      } catch {
        // 내 문서가 어긋났다. 다시 붙어서 통째로 받는다.
        reconnect();
      }
      return;
    }
    case "reset":
      set({ doc: msg.doc, preview: null, draft: null, history: msg.history, cursor: msg.cursor });
      set(prune(msg.doc));
      if (msg.reason) toast(msg.reason);
      return;
    case "preview": {
      const base = s.preview ?? s.doc;
      if (!base) return;
      try {
        set({ preview: applyTransaction(base, msg.commands).doc });
      } catch (e) {
        console.warn("preview failed", e);
      }
      return;
    }
    case "turn-commit": {
      set({ doc: msg.doc, preview: null, draft: null, ...withHistory(msg.meta, msg.cursor) });
      set(prune(msg.doc));
      const before = beforeShot;
      beforeShot = null;
      if (before) {
        void Promise.all([before, thumbnail(msg.doc)]).then(([b, a]) => {
          if (!a) return;
          conn?.send({ t: "thumbs", chat: msg.chat, before: b, after: a });
          set({ chat: get().chat.map((c) => (c.id === msg.chat && c.card ? { ...c, card: { ...c.card, before: b, after: a } } : c)) });
        });
      }
      return;
    }
    case "turn-discard":
      beforeShot = null;
      set({ preview: null });
      return;
    case "busy":
      set({ busy: msg.busy, ...(msg.busy ? {} : { status: null }) });
      return;
    case "status":
      set({ status: msg.text });
      return;
    case "chat-entry": {
      const i = s.chat.findIndex((c) => c.id === msg.entry.id);
      if (i < 0) return set({ chat: [...s.chat, msg.entry] });
      const prev = s.chat[i];
      // 내가 먼저 붙여 둔 전/후 그림을 서버의 늦은 갱신이 지우지 않게 한다
      const card = msg.entry.card && prev.card ? { ...msg.entry.card, before: msg.entry.card.before ?? prev.card.before, after: msg.entry.card.after ?? prev.card.after } : msg.entry.card;
      const chat = s.chat.slice();
      chat[i] = { ...msg.entry, card };
      return set({ chat });
    }
    case "chat-delta":
      return set({ chat: s.chat.map((c) => (c.id === msg.id ? { ...c, text: c.text + msg.delta } : c)) });
    case "chat-clear":
      return set({ chat: s.chat.map((c) => (c.id === msg.id ? { ...c, text: "" } : c)) });
    case "capture": {
      const doc = s.preview ?? s.doc;
      const answer = (r: { data: string; note: string } | null) => conn?.send({ t: "captured", req: msg.req, data: r?.data ?? null, mime: "image/jpeg", note: r?.note });
      if (!doc) return void answer(null);
      captureForAgent(doc, msg.region).then(answer, () => answer(null));
      return;
    }
    case "error":
      toast(msg.message);
      return;
  }
}

export function openProject(id: string): void {
  conn?.close();
  set({ projectId: id, doc: null, preview: null, draft: null, history: [], cursor: 0, chat: [], selection: null, chips: [], busy: false, status: null, playing: false, panel: null, tool: "select" });
  conn = new Connection(id, onMessage, (state) => set({ conn: state }));
}

function reconnect(): void {
  const id = get().projectId;
  if (id) openProject(id);
}

/** 손 편집 한 번. 먼저 내 화면에 반영하고 서버에 보낸다. 실패하면 null. */
export function edit(label: string, commands: Command[]): Array<string | undefined> | null {
  const s = get();
  if (!s.doc || commands.length === 0) return null;
  if (s.busy) {
    toast("AI 가 작업하는 동안에는 편집할 수 없어요");
    set({ draft: null });
    return null;
  }
  if (!conn?.open) {
    toast("서버와 연결이 끊겼어요. 다시 연결하는 중입니다");
    set({ draft: null });
    return null;
  }
  try {
    const r = applyTransaction(s.doc, commands);
    set({ doc: r.doc, draft: null });
    set(prune(r.doc));
    conn.send({ t: "tx", id: `u${Date.now().toString(36)}${(txSeq++).toString(36)}`, label, commands });
    return r.created;
  } catch (e) {
    set({ draft: null });
    toast(e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** 확정하지 않고 화면에만 보인다. */
export function previewEdit(commands: Command[]): void {
  const s = get();
  if (!s.doc || s.busy) return;
  try {
    set({ draft: applyTransaction(s.doc, commands).doc });
  } catch {
    /* 끌어 고치는 도중의 잘못된 값은 무시한다 */
  }
}

export function clearDraft(): void {
  if (get().draft) set({ draft: null });
}

export function goto(cursor: number): void {
  const s = get();
  if (s.busy) return toast("AI 가 작업하는 동안에는 되돌릴 수 없어요");
  if (cursor < 0 || cursor > s.history.length || cursor === s.cursor) return;
  conn?.send({ t: "goto", cursor });
}

export const undo = () => goto(get().cursor - 1);
export const redo = () => goto(get().cursor + 1);

export function sendChat(text: string): boolean {
  const s = get();
  text = text.trim();
  if (!text || s.busy || !s.doc) return false;
  if (!conn?.open) {
    toast("서버와 연결이 끊겼어요. 다시 연결하는 중입니다");
    return false;
  }
  if (s.playing) setPlaying(false);
  beforeShot = thumbnail(s.doc);
  conn.send({ t: "chat", text, chips: s.chips });
  set({ chips: [], busy: true, status: "생각하는 중", chatOpen: true, panel: null });
  return true;
}

export function stopTurn(): void {
  conn?.send({ t: "stop" });
}

// ── 고르기 ──────────────────────────────────────────────────

export function entityLabel(doc: Project, id: string): string {
  const scene = sceneOf(doc);
  const e = scene?.entities[id];
  if (!e) return id;
  return resolveProps(doc, e).name || doc.prefabs[e.prefab]?.name || id;
}

export function select(sel: Selection, opts: { additive?: boolean } = {}): void {
  const s = get();
  const doc = viewDoc(s);
  if (!sel || !doc) return set({ selection: null, chips: opts.additive ? s.chips : [] });
  const chip: Chip = sel.kind === "entity" ? { kind: "entity", id: sel.id, label: entityLabel(doc, sel.id) } : { kind: "light", id: sel.id, label: "광원" };
  const keep = opts.additive ? s.chips.filter((c) => c.kind === "area" || c.id !== sel.id) : [];
  set({ selection: sel, chips: [...keep, chip].slice(-6), panel: null });
}

export function pointArea(area: { x: number; y: number; w: number; h: number }): void {
  set({ selection: null, chips: [{ kind: "area", ...area, label: `${area.w}×${area.h} 구역` }] });
}

export function removeChip(index: number): void {
  set({ chips: get().chips.filter((_, i) => i !== index) });
}

export function setTool(tool: Tool): void {
  const s = get();
  if (tool === "brush" && !s.brush.material && s.doc) {
    const first = Object.keys(s.doc.materials)[0] ?? null;
    set({ brush: { ...s.brush, material: first } });
  }
  set({ tool, panel: null, ...(tool === "brush" ? { selection: null, chips: [] } : {}) });
}

export function setPlaying(playing: boolean): void {
  const view = getView();
  if (!view || get().playing === playing) return;
  if (playing) {
    if (!sceneOf(viewDoc(get()))) return;
    set({ playing: true, selection: null, panel: null, paletteOpen: false, tool: "select", draft: null });
    view.setLighting(true);
    view.play();
    (document.activeElement as HTMLElement | null)?.blur?.();
  } else {
    view.stop();
    view.setLighting(get().lighting);
    set({ playing: false });
  }
}

export function setLighting(on: boolean): void {
  set({ lighting: on });
  if (!get().playing) getView()?.setLighting(on);
}

export function composeText(text: string): void {
  set({ compose: { text, key: Date.now() }, chatOpen: true });
}

// ── 프로젝트 ────────────────────────────────────────────────

const RECENT_KEY = "age.recent";

export interface Recent {
  id: string;
  name: string;
  at: number;
}

export function recentProjects(): Recent[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function rememberProject(id: string, name: string): void {
  const list = [{ id, name, at: Date.now() }, ...recentProjects().filter((r) => r.id !== id)].slice(0, 12);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}

export function forgetProject(id: string): void {
  localStorage.setItem(RECENT_KEY, JSON.stringify(recentProjects().filter((r) => r.id !== id)));
}

export async function createProject(template: "blank" | "demo"): Promise<string> {
  const res = await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ template }) });
  if (!res.ok) throw new Error("프로젝트를 만들지 못했어요");
  return ((await res.json()) as { id: string }).id;
}

export function navigate(id: string | null): void {
  history.pushState(null, "", id ? `/p/${id}` : "/");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export async function newProject(template: "blank" | "demo"): Promise<void> {
  try {
    navigate(await createProject(template));
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e));
  }
}
