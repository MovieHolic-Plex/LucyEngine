import type { ClientMessage, ServerMessage } from "@age/server/protocol";

/** 프로젝트 하나에 붙는 WebSocket. 끊기면 다시 붙고, 다시 붙으면 서버가 init 으로 상태를 맞춰 준다. */
export class Connection {
  private ws: WebSocket | null = null;
  private closed = false;
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private projectId: string,
    private onMessage: (msg: ServerMessage) => void,
    private onState: (state: "connecting" | "open" | "closed" | "missing") => void,
  ) {
    this.connect();
  }

  private connect(): void {
    this.onState("connecting");
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws/${encodeURIComponent(this.projectId)}`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.onState("open");
    };
    ws.onmessage = (ev) => {
      try {
        this.onMessage(JSON.parse(ev.data as string));
      } catch (e) {
        console.error("bad message", e);
      }
    };
    ws.onclose = (ev) => {
      this.ws = null;
      if (this.closed) return;
      if (ev.code === 4404) return this.onState("missing");
      this.onState("closed");
      const wait = Math.min(8000, 400 * 2 ** this.retry++);
      this.timer = setTimeout(() => this.connect(), wait);
    };
  }

  get open(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  send(msg: ClientMessage): boolean {
    if (!this.open) return false;
    this.ws!.send(JSON.stringify(msg));
    return true;
  }

  close(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
  }
}
