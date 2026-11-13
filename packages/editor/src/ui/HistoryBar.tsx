import { useState } from "react";
import { goto, redo, undo, useStore } from "../store";
import { MOD } from "../labels";
import { Icon } from "./icons";

const WINDOW = 24;

/** 히스토리 타임라인. 점 하나가 변경 한 번이고, 눌러서 그 시점으로 간다. */
export function HistoryBar() {
  const history = useStore((s) => s.history);
  const cursor = useStore((s) => s.cursor);
  const busy = useStore((s) => s.busy);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  if (history.length === 0) return null;

  // 길어지면 지금 시점 둘레만 보인다
  const start = Math.max(0, Math.min(history.length - WINDOW, cursor - Math.floor(WINDOW * 0.7)));
  const shown = history.slice(start, start + WINDOW);
  const show = (e: React.MouseEvent, text: string) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ x: r.left + r.width / 2, y: r.top - 6, text });
  };

  return (
    <div className="history glass chrome from-bottom" onMouseLeave={() => setTip(null)}>
      <button className="icon-btn" disabled={busy || cursor === 0} title={`되돌리기 (${MOD}Z)`} aria-label="되돌리기" onClick={undo}>
        <Icon.undo />
      </button>
      <button className="icon-btn" disabled={busy || cursor >= history.length} title={`다시 하기 (⇧${MOD}Z)`} aria-label="다시 하기" onClick={redo}>
        <Icon.redo />
      </button>
      <div className="history-track" role="list">
        {start === 0 && (
          <button className={`tick${cursor === 0 ? " current" : ""}`} aria-label="처음" onMouseEnter={(e) => show(e, "처음 상태")} onClick={() => goto(0)} disabled={busy}>
            <i />
          </button>
        )}
        {shown.map((h, i) => {
          const at = start + i + 1;
          return (
            <button
              key={h.id}
              role="listitem"
              className={`tick${h.source === "ai" ? " ai" : ""}${at === cursor ? " current" : ""}${at > cursor ? " future" : ""}`}
              aria-label={h.label}
              disabled={busy}
              onMouseEnter={(e) => show(e, `${h.source === "ai" ? "AI · " : ""}${h.label}`)}
              onClick={() => goto(at)}
            >
              <i />
            </button>
          );
        })}
      </div>
      {tip && (
        <div className="tip" style={{ left: tip.x, top: tip.y }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}
