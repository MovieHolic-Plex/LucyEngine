import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { ChatEntry, Chip } from "@age/server/protocol";
import { edit, goto, removeChip, sendChat, stopTurn, useStore } from "../store";
import { MOD } from "../labels";
import { Icon } from "./icons";
import { TextField } from "./controls";

const EXAMPLES: Array<{ em: string; text: string }> = [
  { em: "🚉", text: "비 갠 저녁, 버려진 기차역 앞 작은 광장. 매표소 영감이 말을 걸고, 풀숲에는 슬라임 두 마리가 있어." },
  { em: "🏮", text: "밤의 항구 시장 골목. 등불이 줄지어 켜져 있고, 생선 장수와 이야기할 수 있어. 부두 쪽에는 게 로봇이 순찰해." },
  { em: "🌲", text: "안개 낀 숲속 빈터의 모닥불 야영지. 떠돌이 상인이 쉬고 있고, 어둠 속에서 뭔가가 다가와." },
  { em: "⛏️", text: "버섯이 빛나는 지하 광산 입구. 늙은 광부가 길을 막고 있고, 안쪽에는 박쥐 떼가 있어." },
];

/** 굵은 글씨와 코드만 알아보는 아주 작은 마크다운. */
function rich(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(m[1] !== undefined ? <b key={k++}>{m[1]}</b> : <code key={k++}>{m[2]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function ChipView({ chip, onRemove }: { chip: Chip; onRemove?(): void }) {
  return (
    <span className={`chip${onRemove ? "" : " static"}`}>
      <span>{chip.label}</span>
      {onRemove && (
        <button type="button" aria-label="빼기" onClick={onRemove}>
          <Icon.x size={9} />
        </button>
      )}
    </span>
  );
}

function Card({ entry }: { entry: ChatEntry }) {
  const card = entry.card!;
  const history = useStore((s) => s.history);
  const cursor = useStore((s) => s.cursor);
  const busy = useStore((s) => s.busy);
  const index = history.findIndex((h) => h.id === card.txId);
  const applied = index >= 0 && index < cursor;
  const later = applied ? cursor - index - 1 : 0;
  return (
    <div className={`card${index >= 0 && !applied ? " undone" : ""}`}>
      {card.before && card.after && (
        <div className="card-shots">
          <figure>
            <img src={card.before} alt="바꾸기 전" draggable={false} />
            <figcaption>전</figcaption>
          </figure>
          <figure>
            <img src={card.after} alt="바꾼 뒤" draggable={false} />
            <figcaption>후</figcaption>
          </figure>
        </div>
      )}
      <div className="card-body">
        <div className="card-summary">{card.summary}</div>
        {index >= 0 &&
          (applied ? (
            <button className="btn" disabled={busy} title={later ? `이 뒤의 변경 ${later}개도 함께 되돌립니다` : undefined} onClick={() => goto(index)}>
              <Icon.undo size={13} />
              되돌리기
            </button>
          ) : (
            <button className="btn" disabled={busy} onClick={() => goto(index + 1)}>
              <Icon.redo size={13} />
              다시 적용
            </button>
          ))}
      </div>
      {(card.issues.length > 0 || card.placeholders.length > 0) && (
        <div className="card-notes">
          {card.placeholders.length > 0 && (
            <div className="card-note">
              <Icon.warn size={13} />
              <span>그림 {card.placeholders.length}개를 만들지 못해 임시 상자로 두었어요. “다시 그려줘”라고 하면 다시 시도합니다.</span>
            </div>
          )}
          {card.issues.slice(0, 3).map((issue, i) => (
            <div key={i} className="card-note">
              <Icon.warn size={13} />
              <span>{issue}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Message({ entry, working, status }: { entry: ChatEntry; working: boolean; status: string | null }) {
  if (entry.role === "user")
    return (
      <div className="msg user">
        {entry.chips && entry.chips.length > 0 && (
          <div className="msg-chips">
            {entry.chips.map((c, i) => (
              <span key={i} className="chip" style={{ paddingRight: 8 }}>
                <span>{c.label}</span>
              </span>
            ))}
          </div>
        )}
        <div className="bubble">{entry.text}</div>
      </div>
    );
  return (
    <div className="msg assistant">
      {entry.text && <div className="text">{rich(entry.text)}</div>}
      {working && (
        <div className="working" style={entry.text ? { marginTop: 8 } : undefined}>
          <span className="orb" />
          <span className="label">{status ?? "생각하는 중"}…</span>
        </div>
      )}
      {entry.error && (
        <div className="error" style={entry.text ? { marginTop: 8 } : undefined}>
          <Icon.warn size={14} />
          <span>{entry.error}</span>
        </div>
      )}
      {entry.card && <Card entry={entry} />}
    </div>
  );
}

function Composer({ autoFocus }: { autoFocus?: boolean }) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const chips = useStore((s) => s.chips);
  const busy = useStore((s) => s.busy);
  const ready = useStore((s) => s.conn === "open" && !!s.doc);
  const compose = useStore((s) => s.compose);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(150, el.scrollHeight)}px`;
  }, [text]);

  useEffect(() => {
    if (!compose) return;
    if (compose.text) setText(compose.text);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }, [compose]);

  const submit = () => {
    if (sendChat(text)) setText("");
  };

  return (
    <div className="composer">
      {chips.length > 0 && (
        <div className="composer-chips">
          {chips.map((c, i) => (
            <ChipView key={i} chip={c} onRemove={() => removeChip(i)} />
          ))}
        </div>
      )}
      <div className="composer-row">
        <textarea
          ref={ref}
          id="composer"
          rows={1}
          value={text}
          autoFocus={autoFocus}
          placeholder={chips.length ? "가리킨 것을 어떻게 할까요?" : "만들고 싶은 장면이나 바꿀 것을 말해 보세요"}
          maxLength={4000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (!busy) submit();
            }
            if (e.key === "Escape") ref.current?.blur();
            if (!(e.metaKey || e.ctrlKey)) e.stopPropagation();
          }}
        />
        {busy ? (
          <button type="button" className="send stop" title="멈추기" aria-label="멈추기" onClick={stopTurn}>
            <Icon.stop size={12} />
          </button>
        ) : (
          <button type="button" className="send" title="보내기" aria-label="보내기" disabled={!text.trim() || !ready} onClick={submit}>
            <Icon.send size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

export function Chat() {
  const chat = useStore((s) => s.chat);
  const busy = useStore((s) => s.busy);
  const status = useStore((s) => s.status);
  const conn = useStore((s) => s.conn);
  const open = useStore((s) => s.chatOpen);
  const name = useStore((s) => s.doc?.meta.name ?? "");
  const loaded = useStore((s) => !!s.doc);
  const emptyScene = useStore((s) => !!s.doc && Object.keys(s.doc.scenes[s.doc.startScene]?.entities ?? {}).length === 0);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [chat, status, busy]);

  const lastAssistant = [...chat].reverse().find((c) => c.role === "assistant");

  return (
    <aside className={`chat glass chrome from-left${open ? "" : " closed"}`} aria-label="채팅">
      <div className="chat-head">
        <span className={`conn-dot${conn === "open" ? "" : " off"}`} title={conn === "open" ? "연결됨" : "다시 연결하는 중"} />
        <div className="chat-title">{loaded && <TextField className="" value={name} maxLength={80} onCommit={(v) => v.trim() && edit("이름 바꾸기", [{ type: "renameProject", name: v.trim() }])} />}</div>
        <button className="icon-btn" title={`명령 찾기 (${MOD}K)`} onClick={() => useStore.setState({ paletteOpen: true })}>
          <Icon.search />
        </button>
        <button className="icon-btn" title={`채팅 접기 (${MOD}\\)`} onClick={() => useStore.setState({ chatOpen: false })}>
          <Icon.sidebar />
        </button>
      </div>
      <div
        className="chat-scroll"
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {loaded && chat.length === 0 && (
          <div className="empty">
            <h2>어떤 장면을<br />만들어 볼까요?</h2>
            <p>한두 문장이면 됩니다. 장소와 분위기, 누가 있는지 말해 주세요.</p>
            {EXAMPLES.map((ex) => (
              <button key={ex.text} className="example" onClick={() => sendChat(ex.text)}>
                <span className="em">{ex.em}</span>
                <span>{ex.text}</span>
              </button>
            ))}
          </div>
        )}
        {chat.map((entry) => (
          <Fragment key={entry.id}>
            <Message entry={entry} working={busy && entry === lastAssistant && !entry.card && !entry.error} status={status} />
          </Fragment>
        ))}
      </div>
      {/* 빈 프로젝트에서만 입력창에 바로 쓸 수 있게 한다. 아니면 단축키가 먼저다. */}
      <Composer key={loaded ? "ready" : "loading"} autoFocus={loaded && chat.length === 0 && emptyScene} />
    </aside>
  );
}
