import type { Input } from "../sim/types";

const MOVE: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
  KeyA: [-1, 0], KeyD: [1, 0], KeyW: [0, -1], KeyS: [0, 1],
};
const ATTACK = new Set(["KeyJ", "KeyZ", "Space"]);
const INTERACT = new Set(["KeyE", "KeyX", "Enter"]);

/** 플레이 중 키보드 입력. 글을 치는 중이면 가로채지 않는다. */
export class PlayInput {
  private down = new Set<string>();
  private attackPressed = false;
  private interactPressed = false;
  private attached = false;

  private typing(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
  }

  private onDown = (e: KeyboardEvent) => {
    if (this.typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    const code = e.code;
    if (!(code in MOVE) && !ATTACK.has(code) && !INTERACT.has(code)) return;
    e.preventDefault();
    if (!e.repeat) {
      if (ATTACK.has(code)) this.attackPressed = true;
      if (INTERACT.has(code)) this.interactPressed = true;
    }
    this.down.add(code);
  };

  private onUp = (e: KeyboardEvent) => {
    this.down.delete(e.code);
  };

  private onBlur = () => this.down.clear();

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener("keydown", this.onDown);
    window.addEventListener("keyup", this.onUp);
    window.addEventListener("blur", this.onBlur);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener("keydown", this.onDown);
    window.removeEventListener("keyup", this.onUp);
    window.removeEventListener("blur", this.onBlur);
    this.down.clear();
    this.attackPressed = this.interactPressed = false;
  }

  /** 지금 눌린 방향. */
  move(): { moveX: number; moveY: number } {
    let x = 0, y = 0;
    for (const code of this.down) {
      const m = MOVE[code];
      if (m) { x += m[0]; y += m[1]; }
    }
    return { moveX: Math.sign(x), moveY: Math.sign(y) };
  }

  /** 한 걸음에 쓸 입력을 꺼낸다. 눌림은 한 번만 전달된다. */
  take(): Input {
    const input: Input = { ...this.move(), attack: this.attackPressed, interact: this.interactPressed };
    this.attackPressed = this.interactPressed = false;
    return input;
  }

  /** 눌림만 버린다 (대사 글자를 마저 보여 줄 때). */
  peekPress(): boolean {
    return this.attackPressed || this.interactPressed;
  }

  clearPress(): void {
    this.attackPressed = this.interactPressed = false;
  }
}
