import Anthropic from "@anthropic-ai/sdk";
import { nanoid } from "nanoid";
import {
  type Command, type History, type Project, type TxRecord, CommandError, applyTransaction, commit, goTo, lintProject, runTransaction,
} from "@age/model";
import { type AgentConfig, type AgentHost, type CaptureResult, type GeneratedArt, runTurn } from "@age/agent";
import { type ImageProvider, generateAsset, recolorPng } from "@age/assets";
import type { ChatEntry, Chip, Store } from "./db";
import type { ClientMessage, ServerMessage, TxMeta } from "./protocol";
import type { StarterKit } from "./starter";

export interface Client {
  send(msg: ServerMessage): void;
}

export interface SessionDeps {
  store: Store;
  kit: StarterKit;
  provider: ImageProvider | null;
  anthropic: Anthropic | null;
  agent: AgentConfig;
  log(msg: string): void;
}

const meta = (r: TxRecord): TxMeta => ({ id: r.id, label: r.label, source: r.source, at: r.at });

function firstSentence(text: string, max = 70): string {
  const line = text.replace(/\s+/g, " ").trim();
  const m = line.match(/^.+?[.!?。](?=\s|$)/);
  const s = (m ? m[0] : line).trim();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/** 프로젝트 하나의 권위 있는 상태. 연결된 편집기들과 에이전트가 이것을 통해서만 문서를 바꾼다. */
export class Session {
  private clients = new Set<Client>();
  private turn: { abort: AbortController; working: Project; commands: Command[] } | null = null;
  private captureSeq = 0;
  private captures = new Map<number, (r: CaptureResult | null) => void>();
  private status: string | null = null;

  constructor(readonly id: string, private doc: Project, private history: History, private chat: ChatEntry[], private deps: SessionDeps) {
    // 답을 쓰다 서버가 꺼졌던 턴은 아무것도 남기지 않았다. 그렇게 알려 준다.
    for (const c of chat)
      if (c.role === "assistant" && !c.text && !c.card && !c.error) {
        c.error = "서버가 다시 시작되어 이 요청은 중단됐습니다. 바뀐 것은 없습니다.";
        deps.store.updateChat(id, c);
      }
  }

  get clientCount(): number {
    return this.clients.size;
  }

  get busy(): boolean {
    return this.turn !== null;
  }

  private broadcast(msg: ServerMessage, except?: Client): void {
    if (msg.t === "status") this.status = msg.text;
    for (const c of this.clients) if (c !== except) c.send(msg);
  }

  private historyMeta(): TxMeta[] {
    return this.history.records.map(meta);
  }

  join(client: Client): void {
    this.clients.add(client);
    client.send({ t: "init", doc: this.doc, history: this.historyMeta(), cursor: this.history.cursor, chat: this.chat, busy: this.busy, canGenerate: !!this.deps.provider });
    // 턴 도중에 들어왔으면 지금까지의 작업을 미리보기로 보낸다
    if (this.turn?.commands.length) client.send({ t: "preview", commands: this.turn.commands });
    if (this.turn && this.status) client.send({ t: "status", text: this.status });
  }

  leave(client: Client): void {
    this.clients.delete(client);
  }

  handle(client: Client, msg: ClientMessage): void {
    switch (msg.t) {
      case "tx":
        return this.userTx(client, msg.id, msg.label, msg.commands);
      case "goto":
        return this.goto(client, msg.cursor);
      case "chat":
        void this.startTurn(client, msg.text, msg.chips ?? []);
        return;
      case "stop":
        this.turn?.abort.abort();
        return;
      case "captured": {
        const done = this.captures.get(msg.req);
        if (done) {
          this.captures.delete(msg.req);
          done(msg.data ? { data: msg.data, mime: msg.mime ?? "image/png", note: msg.note ?? "" } : null);
        }
        return;
      }
      case "thumbs": {
        const entry = this.chat.find((c) => c.id === msg.chat);
        if (!entry?.card) return;
        const ok = (v: unknown): v is string => typeof v === "string" && v.startsWith("data:image/") && v.length < 600_000;
        if (ok(msg.before)) entry.card.before = msg.before;
        if (ok(msg.after)) entry.card.after = msg.after;
        this.deps.store.updateChat(this.id, entry);
        this.broadcast({ t: "chat-entry", entry }, client);
        return;
      }
    }
  }

  private reset(client: Client, reason?: string): void {
    client.send({ t: "reset", doc: this.doc, history: this.historyMeta(), cursor: this.history.cursor, reason });
  }

  private commitRecord(doc: Project, record: TxRecord): void {
    this.deps.store.commit(this.id, doc, this.history.cursor, record);
    this.doc = doc;
    this.history = commit(this.history, record);
  }

  private userTx(client: Client, id: string, label: string, commands: Command[]): void {
    if (this.turn) return this.reset(client, "AI 가 작업하는 동안에는 편집할 수 없습니다");
    try {
      if (!Array.isArray(commands) || commands.length === 0 || commands.length > 5000) throw new CommandError("invalid", "빈 편집입니다");
      const r = runTransaction(this.doc, commands, { id: String(id).slice(0, 40) || nanoid(10), label: String(label).slice(0, 80), source: "user", at: Date.now() });
      this.commitRecord(r.doc, r.record);
      client.send({ t: "ack", id, meta: meta(r.record), cursor: this.history.cursor });
      this.broadcast({ t: "applied", meta: meta(r.record), commands, cursor: this.history.cursor }, client);
    } catch (e) {
      this.reset(client, e instanceof Error ? e.message : String(e));
    }
  }

  private goto(client: Client, cursor: number): void {
    if (this.turn) return this.reset(client, "AI 가 작업하는 동안에는 히스토리를 옮길 수 없습니다");
    const r = goTo(this.doc, this.history, Math.floor(Number(cursor)));
    this.doc = r.doc;
    this.history = r.history;
    this.deps.store.setCursor(this.id, this.doc, this.history.cursor);
    this.broadcast({ t: "reset", doc: this.doc, history: this.historyMeta(), cursor: this.history.cursor });
  }

  private pushChat(entry: ChatEntry): void {
    this.chat.push(entry);
    this.deps.store.appendChat(this.id, entry);
    this.broadcast({ t: "chat-entry", entry });
  }

  private updateChat(entry: ChatEntry): void {
    this.deps.store.updateChat(this.id, entry);
    this.broadcast({ t: "chat-entry", entry });
  }

  private requestCapture(client: Client, region?: { x: number; y: number; w: number; h: number }): Promise<CaptureResult | null> {
    // 요청한 화면이 닫혔으면 열려 있는 다른 화면에 부탁한다
    const target = this.clients.has(client) ? client : [...this.clients][0];
    if (!target) return Promise.resolve(null);
    const req = ++this.captureSeq;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.captures.delete(req);
        resolve(null);
      }, 20_000);
      this.captures.set(req, (r) => {
        clearTimeout(timer);
        resolve(r);
      });
      target.send({ t: "capture", req, region });
    });
  }

  /** AI 의 한 턴. 턴 전체가 한 트랜잭션이고, 실패하거나 중단되면 아무것도 남지 않는다. */
  private async startTurn(client: Client, text: string, chips: Chip[]): Promise<void> {
    const { anthropic, provider, kit, store, agent, log } = this.deps;
    text = String(text ?? "").trim().slice(0, 4000);
    if (!text) return;
    if (this.turn) return client.send({ t: "error", message: "아직 앞선 요청을 처리하고 있습니다" });
    const history = this.chat.filter((c) => c.text).map((c) => ({ role: c.role, text: c.text }));
    this.pushChat({ id: nanoid(10), role: "user", text, at: Date.now(), chips: chips.length ? chips : undefined });
    const reply: ChatEntry = { id: nanoid(10), role: "assistant", text: "", at: Date.now() };
    this.pushChat(reply);
    if (!anthropic) {
      reply.error = "AI 가 설정되지 않았습니다. 서버에 ANTHROPIC_API_KEY 를 넣어 주세요.";
      this.updateChat(reply);
      return this.broadcast({ t: "busy", busy: false });
    }

    const sceneId = this.doc.startScene;
    const turn = { abort: new AbortController(), working: this.doc, commands: [] as Command[] };
    this.turn = turn;
    this.broadcast({ t: "busy", busy: true });
    this.broadcast({ t: "status", text: "생각하는 중" });
    const started = Date.now();

    const host: AgentHost = {
      sceneId,
      signal: turn.abort.signal,
      doc: () => turn.working,
      apply: (commands) => {
        const r = applyTransaction(turn.working, commands);
        turn.working = r.doc;
        turn.commands.push(...commands);
        this.broadcast({ t: "preview", commands });
        return r.created;
      },
      generate: provider
        ? async (req): Promise<GeneratedArt> => {
            const g = await generateAsset(provider, { ...req, style: turn.working.style, signal: turn.abort.signal });
            return { file: store.putAsset(g.png, "png"), w: g.w, h: g.h, frames: g.frames, color: g.color, footprint: g.footprint };
          }
        : null,
      recolor: async (file, adjust) => store.putAsset(await recolorPng(store.readAsset(file), turn.working.style.palette, adjust), "png"),
      starterCommands: () => kit.registerCommands(),
      capture: (region) => this.requestCapture(client, region),
      status: (t) => this.broadcast({ t: "status", text: t }),
    };

    try {
      const result = await runTurn(
        anthropic,
        host,
        { text, chips: chips.map((c) => (c.kind === "area" ? { kind: "area", x: c.x, y: c.y, w: c.w, h: c.h } : { kind: c.kind, id: c.id })), history, canGenerate: !!provider, canLook: this.clients.size > 0 },
        agent,
        {
          onText: (delta) => this.broadcast({ t: "chat-delta", id: reply.id, delta }),
          onTextReset: () => this.broadcast({ t: "chat-clear", id: reply.id }),
        },
      );
      log(`turn ${this.id}: ${result.ended}, ${result.toolCalls} tool calls, ${result.steps} steps, ${Math.round((Date.now() - started) / 1000)}s, in ${result.usage.input} out ${result.usage.output} cached ${result.usage.cacheRead}`);
      reply.text = result.text || (turn.commands.length ? "요청하신 대로 바꿨습니다." : "");
      if (result.ended === "refusal") reply.error = "이 요청은 처리할 수 없었습니다.";
      else if (result.ended === "max-steps") reply.text += (reply.text ? "\n\n" : "") + "작업이 길어져 여기서 멈췄습니다. 이어서 하려면 다시 말씀해 주세요.";
      else if (result.ended === "truncated" && !reply.text) reply.error = "답이 중간에 끊겼습니다. 다시 시도해 주세요.";

      if (turn.commands.length && result.ended !== "refusal") {
        const label = firstSentence(reply.text || text);
        const r = runTransaction(this.doc, turn.commands, { id: nanoid(10), label, source: "ai", at: Date.now() });
        this.commitRecord(r.doc, r.record);
        const issues = lintProject(r.doc).map((i) => i.message);
        const placeholders = Object.values(r.doc.assets).filter((a) => !a.file && turn.commands.some((c) => c.type === "registerAsset" && c.asset.id === a.id)).map((a) => a.id);
        reply.card = { txId: r.record.id, summary: label, issues, placeholders };
        this.turn = null;
        this.broadcast({ t: "turn-commit", doc: this.doc, meta: meta(r.record), cursor: this.history.cursor, chat: reply.id });
      } else {
        this.turn = null;
        this.broadcast({ t: "turn-discard" });
      }
      this.updateChat(reply);
    } catch (e) {
      this.turn = null;
      this.broadcast({ t: "turn-discard" });
      const aborted = turn.abort.signal.aborted;
      let message = "문제가 생겨 이번 변경을 모두 되돌렸습니다.";
      if (aborted) message = "중단했습니다. 이번 요청으로 바뀐 것은 없습니다.";
      else if (e instanceof Anthropic.AuthenticationError) message = "AI 인증에 실패했습니다. 서버의 API 키를 확인해 주세요.";
      else if (e instanceof Anthropic.RateLimitError) message = "AI 사용 한도에 걸렸습니다. 잠시 뒤 다시 시도해 주세요. 이번 변경은 되돌렸습니다.";
      else if (e instanceof Anthropic.APIConnectionError) message = "AI 서버에 연결하지 못했습니다. 이번 변경은 되돌렸습니다.";
      if (!aborted) log(`turn ${this.id} failed: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
      reply.error = message;
      this.updateChat(reply);
    } finally {
      this.broadcast({ t: "status", text: null });
      this.broadcast({ t: "busy", busy: false });
    }
  }
}

/** 열려 있는 프로젝트들. 처음 열릴 때 저장소에서 읽어 메모리에 둔다. */
export class Sessions {
  private open = new Map<string, Session>();

  constructor(private deps: SessionDeps) {}

  get(id: string): Session | null {
    let s = this.open.get(id);
    if (s) return s;
    const stored = this.deps.store.loadProject(id);
    if (!stored) return null;
    s = new Session(id, stored.doc, stored.history, stored.chat, this.deps);
    this.open.set(id, s);
    return s;
  }

  create(doc: Project): string {
    const id = nanoid(18);
    this.deps.store.createProject(id, doc);
    return id;
  }
}
