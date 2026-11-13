import { useEffect, useRef, useState, type CSSProperties } from "react";

/** 글 한 줄. 포커스를 잃거나 Enter 를 누르면 확정한다. */
export function TextField({ value, onCommit, placeholder, className = "field", maxLength }: { value: string; onCommit(v: string): void; placeholder?: string; className?: string; maxLength?: number }) {
  const [text, setText] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);
  const commit = () => {
    if (text !== value) onCommit(text);
  };
  return (
    <input
      className={className}
      value={text}
      placeholder={placeholder}
      maxLength={maxLength}
      spellCheck={false}
      onFocus={() => (focused.current = true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        focused.current = false;
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setText(value);
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
        e.stopPropagation();
      }}
    />
  );
}

/** 여러 줄 글. 내용에 맞춰 높이가 자란다. */
export function TextArea({ value, onCommit, placeholder, maxLength, rows = 1 }: { value: string; onCommit(v: string): void; placeholder?: string; maxLength?: number; rows?: number }) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);
  return (
    <textarea
      ref={ref}
      className="field"
      rows={rows}
      value={text}
      placeholder={placeholder}
      maxLength={maxLength}
      spellCheck={false}
      onFocus={() => (focused.current = true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        focused.current = false;
        if (text !== value) onCommit(text);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setText(value);
          requestAnimationFrame(() => ref.current?.blur());
        }
        e.stopPropagation();
      }}
    />
  );
}

export function NumberField({ value, onCommit, min, max, step = 1, suffix }: { value: number; onCommit(v: number): void; min: number; max: number; step?: number; suffix?: string }) {
  const [text, setText] = useState(String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(String(value));
  }, [value]);
  const commit = (raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n) || raw.trim() === "") return setText(String(value));
    const v = Math.max(min, Math.min(max, Math.round(n / step) * step));
    const fixed = Number(v.toFixed(4));
    setText(String(fixed));
    if (fixed !== value) onCommit(fixed);
  };
  return (
    <div className="num">
      <input
        className="field"
        inputMode="decimal"
        value={text}
        onFocus={(e) => {
          focused.current = true;
          e.target.select();
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => {
          focused.current = false;
          commit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const k = (e.shiftKey ? 10 : 1) * step * (e.key === "ArrowUp" ? 1 : -1);
            commit(String((Number(text) || 0) + k));
          }
          e.stopPropagation();
        }}
      />
      {suffix && <span style={{ color: "var(--text-3)", fontSize: 11.5, width: 22 }}>{suffix}</span>}
    </div>
  );
}

/** 끄는 동안에는 미리 보이기만 하고, 놓을 때 확정한다. */
export function Slider({ value, min, max, step, onPreview, onCommit, format }: { value: number; min: number; max: number; step: number; onPreview(v: number): void; onCommit(v: number): void; format?(v: number): string }) {
  const [live, setLive] = useState<number | null>(null);
  const v = live ?? value;
  const p = ((v - min) / (max - min)) * 100;
  const done = () => {
    if (live === null) return;
    setLive(null);
    onCommit(live);
  };
  return (
    <div className="slider">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={v}
        style={{ "--p": `${p}%` } as CSSProperties}
        onChange={(e) => {
          const n = Number(e.target.value);
          setLive(n);
          onPreview(n);
        }}
        onPointerUp={done}
        onKeyUp={done}
        onBlur={done}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <output>{format ? format(v) : v}</output>
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange(v: boolean): void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />;
}

export function ColorField({ value, onPreview, onCommit, presets }: { value: string; onPreview(v: string): void; onCommit(v: string): void; presets?: string[] }) {
  const pending = useRef<string | null>(null);
  return (
    <div className="color">
      <div className="color-well" style={{ background: value }}>
        <input
          type="color"
          value={value}
          aria-label="색"
          onInput={(e) => {
            pending.current = (e.target as HTMLInputElement).value;
            onPreview(pending.current);
          }}
          onChange={(e) => {
            // 색 고르기 창을 닫을 때 한 번 확정한다
            pending.current = null;
            onCommit(e.target.value);
          }}
          onBlur={() => {
            if (pending.current) onCommit(pending.current);
            pending.current = null;
          }}
        />
      </div>
      {presets && (
        <div className="swatches">
          {presets.map((c) => (
            <button key={c} type="button" className={`swatch${c.toLowerCase() === value.toLowerCase() ? " on" : ""}`} style={{ background: c }} aria-label={c} onClick={() => onCommit(c)} />
          ))}
        </div>
      )}
    </div>
  );
}
