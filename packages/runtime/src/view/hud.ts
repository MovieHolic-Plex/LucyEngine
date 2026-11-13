const STYLE_ID = "age-hud-style";

const CSS = `
.age-hud { position: absolute; inset: 0; pointer-events: none; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Segoe UI", sans-serif; color: #fff; }
.age-hud[hidden] { display: none; }
.age-hud-hearts { position: absolute; top: 18px; display: flex; gap: 5px; filter: drop-shadow(0 1px 2px rgba(0,0,0,.6)); }
.age-hud-heart { width: 22px; height: 20px; }
.age-hud-heart path { stroke: rgba(30,8,20,.85); stroke-width: 1.4; }
.age-hud-dialogue { position: absolute; bottom: 28px; max-width: 720px; padding: 16px 22px 18px; border-radius: 16px; background: rgba(18,16,26,.84); border: 1px solid rgba(255,255,255,.14); box-shadow: 0 12px 40px rgba(0,0,0,.45); backdrop-filter: blur(14px) saturate(1.3); -webkit-backdrop-filter: blur(14px) saturate(1.3); transform: translateY(8px); opacity: 0; transition: opacity .16s ease, transform .2s cubic-bezier(.2,.9,.3,1.2); }
.age-hud-dialogue.on { opacity: 1; transform: none; }
.age-hud-speaker { font-size: 13px; font-weight: 650; letter-spacing: .01em; color: #ffd28a; margin-bottom: 5px; }
.age-hud-text { font-size: 17px; line-height: 1.55; min-height: 1.55em; white-space: pre-wrap; word-break: keep-all; }
.age-hud-choices { margin-top: 10px; display: grid; gap: 4px; }
.age-hud-choice { font-size: 15.5px; padding: 6px 12px; border-radius: 9px; color: rgba(255,255,255,.72); }
.age-hud-choice.sel { background: rgba(255,255,255,.14); color: #fff; }
.age-hud-choice.sel::before { content: "▸ "; color: #ffd28a; }
.age-hud-more { position: absolute; right: 16px; bottom: 9px; font-size: 11px; color: rgba(255,255,255,.6); animation: age-bob 1s ease-in-out infinite; }
@keyframes age-bob { 50% { transform: translateY(3px); } }
.age-hud-prompt { position: absolute; transform: translate(-50%, -100%); padding: 2px 8px 3px; border-radius: 7px; font-size: 12px; font-weight: 700; background: rgba(18,16,26,.82); border: 1px solid rgba(255,255,255,.22); box-shadow: 0 2px 8px rgba(0,0,0,.4); }
.age-hud-dead { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; gap: 8px; background: rgba(10,6,14,.55); opacity: 0; transition: opacity .5s ease; }
.age-hud-dead.on { opacity: 1; }
.age-hud-dead b { font-size: 26px; letter-spacing: -.01em; }
.age-hud-dead span { font-size: 14px; color: rgba(255,255,255,.7); }
@media (prefers-reduced-motion: reduce) { .age-hud-dialogue, .age-hud-dead { transition: none; } .age-hud-more { animation: none; } }
`;

const HEART = "M11 18.5 C4 13.5 1.5 10 1.5 6.6 C1.5 3.8 3.6 1.8 6.2 1.8 C8.2 1.8 9.9 2.9 11 4.6 C12.1 2.9 13.8 1.8 15.8 1.8 C18.4 1.8 20.5 3.8 20.5 6.6 C20.5 10 18 13.5 11 18.5 Z";

export interface HudState {
  hp: number;
  maxHp: number;
  line: { speaker: string; text: string; choices: string[]; choice: number } | null;
  /** 말을 걸 수 있는 대상의 화면 위치. */
  prompt: { x: number; y: number } | null;
  dead: boolean;
  /** 왼쪽·오른쪽에서 비워 둘 폭 (떠 있는 패널). */
  insetLeft: number;
  insetRight: number;
}

/** 플레이 중 화면 위에 얹는 체력·대사 상자. 한글을 또렷이 그리려고 DOM 으로 만든다. */
export class Hud {
  private root: HTMLDivElement;
  private hearts: HTMLDivElement;
  private dialogue: HTMLDivElement;
  private speaker: HTMLDivElement;
  private text: HTMLDivElement;
  private choices: HTMLDivElement;
  private more: HTMLDivElement;
  private prompt: HTMLDivElement;
  private dead: HTMLDivElement;
  private heartSig = "";
  private lineKey = "";
  private shown = 0;
  private fullText = "";
  private choiceSig = "";

  constructor(parent: HTMLElement) {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    const el = (cls: string, into: HTMLElement) => {
      const d = document.createElement("div");
      d.className = cls;
      into.appendChild(d);
      return d;
    };
    this.root = el("age-hud", parent);
    this.root.hidden = true;
    this.hearts = el("age-hud-hearts", this.root);
    this.prompt = el("age-hud-prompt", this.root);
    this.prompt.textContent = "E";
    this.dialogue = el("age-hud-dialogue", this.root);
    this.dialogue.setAttribute("role", "status");
    this.speaker = el("age-hud-speaker", this.dialogue);
    this.text = el("age-hud-text", this.dialogue);
    this.choices = el("age-hud-choices", this.dialogue);
    this.more = el("age-hud-more", this.dialogue);
    this.more.textContent = "▼";
    this.dead = el("age-hud-dead", this.root);
    this.dead.innerHTML = "<b>쓰러졌습니다</b><span>R 을 눌러 다시 시작</span>";
  }

  setVisible(on: boolean): void {
    this.root.hidden = !on;
    if (!on) {
      this.lineKey = "";
      this.dialogue.classList.remove("on");
      this.dead.classList.remove("on");
    }
  }

  /** 대사 글자가 아직 다 나오지 않았는가. */
  get typing(): boolean {
    return this.lineKey !== "" && this.shown < this.fullText.length;
  }

  finishTyping(): void {
    this.shown = this.fullText.length;
    this.text.textContent = this.fullText;
  }

  update(s: HudState, dt: number): void {
    const heartSig = `${s.hp}/${s.maxHp}`;
    if (heartSig !== this.heartSig) {
      this.heartSig = heartSig;
      const total = Math.min(12, Math.ceil(s.maxHp / 2));
      let html = "";
      for (let i = 0; i < total; i++) {
        const fill = Math.max(0, Math.min(2, s.hp - i * 2));
        const id = `age-h${i}`;
        html += `<svg class="age-hud-heart" viewBox="0 0 22 20"><defs><linearGradient id="${id}"><stop offset="${fill * 50}%" stop-color="#ff5a6e"/><stop offset="${fill * 50}%" stop-color="rgba(40,22,36,.78)"/></linearGradient></defs><path d="${HEART}" fill="url(#${id})"/></svg>`;
      }
      this.hearts.innerHTML = html;
    }
    this.hearts.style.left = `${s.insetLeft + 20}px`;

    const free = this.root.clientWidth - s.insetLeft - s.insetRight;
    const width = Math.min(720, free - 48);
    this.dialogue.style.width = `${Math.max(240, width)}px`;
    this.dialogue.style.left = `${s.insetLeft + (free - Math.max(240, width)) / 2}px`;

    if (s.line) {
      const key = `${s.line.speaker}\u0000${s.line.text}`;
      if (key !== this.lineKey) {
        this.lineKey = key;
        this.fullText = s.line.text;
        this.shown = 0;
        this.speaker.textContent = s.line.speaker;
        this.speaker.style.display = s.line.speaker ? "" : "none";
        this.choiceSig = "";
      }
      if (this.shown < this.fullText.length) {
        this.shown = Math.min(this.fullText.length, this.shown + dt * 48);
        this.text.textContent = this.fullText.slice(0, Math.floor(this.shown));
      }
      const done = this.shown >= this.fullText.length;
      const choiceSig = done ? `${s.line.choices.join("\u0000")}|${s.line.choice}` : "";
      if (choiceSig !== this.choiceSig) {
        this.choiceSig = choiceSig;
        this.choices.replaceChildren(
          ...(done ? s.line.choices : []).map((c, i) => {
            const d = document.createElement("div");
            d.className = `age-hud-choice${i === s.line!.choice ? " sel" : ""}`;
            d.textContent = c;
            return d;
          }),
        );
      }
      this.more.style.display = done && s.line.choices.length === 0 ? "" : "none";
      this.dialogue.classList.add("on");
    } else {
      this.lineKey = "";
      this.dialogue.classList.remove("on");
    }

    if (s.prompt && !s.line && !s.dead) {
      this.prompt.style.display = "";
      this.prompt.style.left = `${s.prompt.x}px`;
      this.prompt.style.top = `${s.prompt.y}px`;
    } else this.prompt.style.display = "none";

    this.dead.classList.toggle("on", s.dead);
  }

  destroy(): void {
    this.root.remove();
  }
}
