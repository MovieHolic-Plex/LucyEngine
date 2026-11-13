import { useEffect, useRef, type CSSProperties, type PointerEvent as RPointerEvent } from "react";
import { GameView } from "@age/runtime/view";
import { clearDraft, edit, pointArea, previewEdit, sceneOf, select, setTool, toast, useStore, viewDoc } from "../store";
import { assetUrl, setView } from "../view";
import { Inspector } from "./Inspector";

type Drag =
  | { kind: "pan"; x: number; y: number }
  | { kind: "entity"; id: string; sx: number; sy: number; offX: number; offY: number; moved: boolean; dup: boolean; pos: { x: number; y: number } | null }
  | { kind: "light"; id: string; sx: number; sy: number; offX: number; offY: number; moved: boolean; pos: { x: number; y: number } | null }
  | { kind: "marquee"; sx: number; sy: number; x: number; y: number; moved: boolean }
  | { kind: "brush"; cells: Map<string, { x: number; y: number }>; last: { x: number; y: number } | null };

const CHAT_INSET = 396;

function place(el: HTMLElement | null, x: number, y: number, w?: number, h?: number): void {
  if (!el) return;
  el.style.display = "";
  el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  if (w !== undefined) el.style.width = `${Math.round(w)}px`;
  if (h !== undefined) el.style.height = `${Math.round(h)}px`;
}

function hide(el: HTMLElement | null): void {
  if (el) el.style.display = "none";
}

/** 뷰포트: 게임 화면 그 자체와, 그 위에서 고르고 옮기고 칠하는 손 편집. */
export function Viewport() {
  const hostRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const selRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef<HTMLDivElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);
  const brushRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<GameView | null>(null);
  const drag = useRef<Drag | null>(null);
  const hover = useRef<string | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const space = useRef(false);
  const fitted = useRef<string | null>(null);
  const sizeRef = useRef("");

  const doc = useStore(viewDoc);
  const projectId = useStore((s) => s.projectId);
  const selection = useStore((s) => s.selection);
  const chips = useStore((s) => s.chips);
  const tool = useStore((s) => s.tool);
  const playing = useStore((s) => s.playing);
  const chatOpen = useStore((s) => s.chatOpen);
  const scene = sceneOf(doc);

  // 화면 만들기
  useEffect(() => {
    const view = new GameView(hostRef.current!, { assetUrl });
    viewRef.current = view;
    setView(view);
    (window as unknown as { __view?: GameView }).__view = view;
    view.onFrame(frame);
    return () => {
      setView(null);
      viewRef.current = null;
      view.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !doc) return;
    view.setDoc(doc);
    // 처음 열 때와 장면 크기가 바뀔 때(AI 가 넓힐 때 등)는 화면에 맞춘다
    const sc = sceneOf(doc);
    const size = sc ? `${sc.w}x${sc.h}` : "";
    if (fitted.current !== projectId || sizeRef.current !== size) {
      fitted.current = projectId;
      sizeRef.current = size;
      if (!useStore.getState().playing) {
        view.setInsets({ left: useStore.getState().chatOpen ? CHAT_INSET : 0, top: 56, bottom: 56, right: 0 });
        view.fit();
      }
    }
  }, [doc, projectId]);

  useEffect(() => {
    viewRef.current?.setInsets(playing ? { left: 0, top: 0, bottom: 0, right: 0 } : { left: chatOpen ? CHAT_INSET : 0, top: 56, bottom: 56, right: 0 });
  }, [playing, chatOpen]);

  // 매 프레임: 화면 위에 얹은 표시들을 카메라에 맞춘다
  function frame(): void {
    const view = viewRef.current, overlay = overlayRef.current;
    if (!view || !overlay) return;
    const s = useStore.getState();
    const d = viewDoc(s), sc = sceneOf(d);
    if (s.playing || !sc) {
      for (const el of [selRef.current, hoverRef.current, marqueeRef.current, brushRef.current, ringRef.current]) hide(el);
      return;
    }
    const sel = s.selection;
    let anchor: { x: number; y: number; w: number; h: number } | null = null;

    if (sel?.kind === "entity") {
      const b = view.entityBounds(sel.id);
      if (b) {
        place(selRef.current, b.x - 4, b.y - 4, b.w + 8, b.h + 8);
        anchor = b;
      } else hide(selRef.current);
    } else hide(selRef.current);

    const h = hover.current;
    const hb = h && !(sel?.kind === "entity" && sel.id === h) && !drag.current ? view.entityBounds(h) : null;
    if (hb) place(hoverRef.current, hb.x - 3, hb.y - 3, hb.w + 6, hb.h + 6);
    else hide(hoverRef.current);

    const ts = view.tileScreenSize;
    for (const el of overlay.querySelectorAll<HTMLElement>("[data-light]")) {
      const l = sc.lights[el.dataset.light!];
      if (!l) continue;
      const moving = drag.current?.kind === "light" && drag.current.id === l.id ? drag.current.pos : null;
      const p = view.tileToScreen(moving?.x ?? l.x, (moving?.y ?? l.y) - (l.height ?? 0));
      place(el, p.x, p.y);
      if (sel?.kind === "light" && sel.id === l.id) {
        anchor = { x: p.x - 11, y: p.y - 11, w: 22, h: 22 };
        const r = l.radius * ts;
        place(ringRef.current, p.x - r, p.y - r, r * 2, r * 2);
      }
    }
    if (sel?.kind !== "light") hide(ringRef.current);

    for (const el of overlay.querySelectorAll<HTMLElement>("[data-area]")) {
      const c = s.chips[Number(el.dataset.area)];
      if (c?.kind !== "area") continue;
      const p = view.tileToScreen(c.x, c.y);
      place(el, p.x, p.y, c.w * ts, c.h * ts);
    }

    const dr = drag.current;
    if (dr?.kind === "marquee" && dr.moved) place(marqueeRef.current, Math.min(dr.sx, dr.x), Math.min(dr.sy, dr.y), Math.abs(dr.x - dr.sx), Math.abs(dr.y - dr.sy));
    else hide(marqueeRef.current);

    const pt = pointer.current;
    if (s.tool === "brush" && pt && dr?.kind !== "pan") {
      const t = view.screenToTile(pt.x, pt.y);
      const n = s.brush.size, o = Math.floor((n - 1) / 2);
      const p = view.tileToScreen(Math.floor(t.x) - o, Math.floor(t.y) - o);
      place(brushRef.current, p.x, p.y, n * ts, n * ts);
    } else hide(brushRef.current);

    // 인스펙터는 고른 대상 옆에 붙는다
    const pop = overlay.querySelector<HTMLElement>("[data-popover]");
    if (pop) {
      if (!anchor || (dr && dr.kind !== "pan" && "moved" in dr && dr.moved)) pop.style.visibility = "hidden";
      else {
        const W = overlay.clientWidth, H = overlay.clientHeight;
        const pw = pop.offsetWidth, ph = pop.offsetHeight;
        const minX = (s.chatOpen ? CHAT_INSET : 0) + 12;
        let x = anchor.x + anchor.w + 16;
        if (x + pw > W - 12) x = anchor.x - pw - 16;
        if (x < minX) x = Math.min(W - pw - 12, Math.max(minX, anchor.x + anchor.w / 2 - pw / 2));
        const y = Math.max(64, Math.min(H - ph - 64, anchor.y + anchor.h / 2 - ph / 3));
        pop.style.visibility = "visible";
        pop.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      }
    }
  }

  // 휠: 터치패드는 밀기, 마우스 휠과 핀치는 확대
  useEffect(() => {
    const host = hostRef.current!;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest?.("[data-popover]")) return;
      e.preventDefault();
      const view = viewRef.current;
      if (!view || useStore.getState().playing) return;
      const r = host.getBoundingClientRect();
      const mouseWheel = e.deltaMode !== 0 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
      if (e.ctrlKey || e.metaKey || mouseWheel) {
        const k = e.ctrlKey && !mouseWheel ? 0.012 : 0.0016;
        view.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : k)));
      } else view.panBy(-e.deltaX, -e.deltaY);
    };
    host.addEventListener("wheel", onWheel, { passive: false });
    const typing = (e: KeyboardEvent) => !!(e.target as HTMLElement)?.closest?.("input,textarea,[contenteditable]");
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !typing(e) && !useStore.getState().playing) {
        space.current = true;
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") space.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      host.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = hostRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const snap = (v: number, free: boolean) => (free ? Math.round(v * 24) / 24 : Math.round(v * 4) / 4);

  function brushCells(d: Extract<Drag, { kind: "brush" }>, tx: number, ty: number): boolean {
    const s = useStore.getState(), sc = sceneOf(s.doc);
    if (!sc || !s.brush.material) return false;
    const n = s.brush.size, o = Math.floor((n - 1) / 2);
    const from = d.last ?? { x: tx, y: ty };
    const steps = Math.max(Math.abs(tx - from.x), Math.abs(ty - from.y), 1);
    let changed = false;
    for (let i = 0; i <= steps; i++) {
      const cx = Math.round(from.x + ((tx - from.x) * i) / steps), cy = Math.round(from.y + ((ty - from.y) * i) / steps);
      for (let y = cy - o; y < cy - o + n; y++)
        for (let x = cx - o; x < cx - o + n; x++) {
          if (x < 0 || y < 0 || x >= sc.w || y >= sc.h) continue;
          const key = `${x},${y}`;
          if (d.cells.has(key) || sc.terrain[y * sc.w + x] === s.brush.material) continue;
          d.cells.set(key, { x, y });
          changed = true;
        }
    }
    d.last = { x: tx, y: ty };
    return changed;
  }

  function paintCommand(d: Extract<Drag, { kind: "brush" }>) {
    const s = useStore.getState();
    return { type: "paintTerrain" as const, scene: s.doc!.startScene, cells: [...d.cells.values()].map((c) => ({ ...c, material: s.brush.material! })) };
  }

  function onPointerDown(e: RPointerEvent<HTMLDivElement>): void {
    const view = viewRef.current, s = useStore.getState();
    if (!view || s.playing || !sceneOf(s.doc)) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    const p = local(e);
    hostRef.current!.setPointerCapture(e.pointerId);
    if (e.button === 1 || e.button === 2 || space.current) {
      drag.current = { kind: "pan", x: e.clientX, y: e.clientY };
      hostRef.current!.classList.add("panning");
      return;
    }
    if (e.button !== 0) return;
    if (s.panel) useStore.setState({ panel: null });
    const t = view.screenToTile(p.x, p.y);
    if (s.tool === "brush") {
      if (s.busy) return toast("AI 가 작업하는 동안에는 편집할 수 없어요");
      const d: Drag = { kind: "brush", cells: new Map(), last: null };
      drag.current = d;
      if (brushCells(d, Math.floor(t.x), Math.floor(t.y))) previewEdit([paintCommand(d)]);
      return;
    }
    const id = view.pickEntity(p.x, p.y);
    if (id) {
      select({ kind: "entity", id }, { additive: e.shiftKey });
      const ent = sceneOf(s.doc)!.entities[id];
      if (ent && !s.busy) drag.current = { kind: "entity", id, sx: p.x, sy: p.y, offX: ent.x - t.x, offY: ent.y - t.y, moved: false, dup: e.altKey, pos: null };
      return;
    }
    drag.current = { kind: "marquee", sx: p.x, sy: p.y, x: p.x, y: p.y, moved: false };
  }

  function onLightDown(e: RPointerEvent<HTMLDivElement>, id: string): void {
    const view = viewRef.current, s = useStore.getState(), l = sceneOf(s.doc)?.lights[id];
    if (!view || !l || e.button !== 0 || s.tool === "brush") return;
    e.stopPropagation();
    select({ kind: "light", id });
    if (s.busy) return;
    const p = local(e), t = view.screenToTile(p.x, p.y);
    hostRef.current!.setPointerCapture(e.pointerId);
    drag.current = { kind: "light", id, sx: p.x, sy: p.y, offX: l.x - t.x, offY: l.y - t.y, moved: false, pos: null };
  }

  function onPointerMove(e: RPointerEvent<HTMLDivElement>): void {
    const view = viewRef.current, s = useStore.getState();
    if (!view || s.playing) return;
    const p = local(e);
    pointer.current = p;
    const d = drag.current, sc = sceneOf(s.doc);
    if (!d) {
      hover.current = s.tool === "select" ? view.pickEntity(p.x, p.y) : null;
      return;
    }
    if (!sc) return;
    const t = view.screenToTile(p.x, p.y);
    const far = (sx: number, sy: number) => Math.hypot(p.x - sx, p.y - sy) > 4;
    switch (d.kind) {
      case "pan":
        view.panBy(e.clientX - d.x, e.clientY - d.y);
        d.x = e.clientX;
        d.y = e.clientY;
        return;
      case "entity": {
        if (!d.moved && !far(d.sx, d.sy)) return;
        d.moved = true;
        const free = e.ctrlKey || e.metaKey;
        d.pos = { x: Math.max(0, Math.min(sc.w, snap(t.x + d.offX, free))), y: Math.max(0, Math.min(sc.h, snap(t.y + d.offY, free))) };
        if (!d.dup) view.previewMove(d.id, d.pos);
        return;
      }
      case "light": {
        if (!d.moved && !far(d.sx, d.sy)) return;
        d.moved = true;
        const free = e.ctrlKey || e.metaKey;
        d.pos = { x: Math.max(0, Math.min(sc.w, snap(t.x + d.offX, free))), y: Math.max(0, Math.min(sc.h, snap(t.y + d.offY, free))) };
        previewEdit([{ type: "updateLight", scene: sc.id, id: d.id, patch: d.pos }]);
        return;
      }
      case "marquee":
        d.x = p.x;
        d.y = p.y;
        if (far(d.sx, d.sy)) d.moved = true;
        return;
      case "brush":
        if (brushCells(d, Math.floor(t.x), Math.floor(t.y))) previewEdit([paintCommand(d)]);
        return;
    }
  }

  function onPointerUp(e: RPointerEvent<HTMLDivElement>): void {
    const view = viewRef.current, d = drag.current;
    drag.current = null;
    hostRef.current!.classList.remove("panning");
    if (hostRef.current!.hasPointerCapture(e.pointerId)) hostRef.current!.releasePointerCapture(e.pointerId);
    if (!view || !d) return;
    const s = useStore.getState(), sc = sceneOf(s.doc);
    if (!sc || !s.doc) return;
    switch (d.kind) {
      case "entity": {
        view.previewMove(d.id, null);
        const ent = sc.entities[d.id];
        if (!d.moved || !d.pos || !ent) return;
        if (d.dup) {
          if (s.doc.prefabs[ent.prefab]?.kind === "player") return toast("주인공은 한 명만 둘 수 있어요");
          const created = edit("복제", [{ type: "addEntity", scene: sc.id, entity: { prefab: ent.prefab, x: d.pos.x, y: d.pos.y, props: ent.props } }]);
          if (created?.[0]) select({ kind: "entity", id: created[0] });
        } else if (d.pos.x !== ent.x || d.pos.y !== ent.y) edit("옮기기", [{ type: "moveEntity", scene: sc.id, id: d.id, x: d.pos.x, y: d.pos.y }]);
        return;
      }
      case "light":
        if (d.moved && d.pos) edit("광원 옮기기", [{ type: "updateLight", scene: sc.id, id: d.id, patch: d.pos }]);
        else clearDraft();
        return;
      case "marquee": {
        if (!d.moved) return select(null);
        const a = view.screenToTile(Math.min(d.sx, d.x), Math.min(d.sy, d.y)), b = view.screenToTile(Math.max(d.sx, d.x), Math.max(d.sy, d.y));
        const x0 = Math.max(0, Math.floor(a.x)), y0 = Math.max(0, Math.floor(a.y));
        const x1 = Math.min(sc.w, Math.ceil(b.x)), y1 = Math.min(sc.h, Math.ceil(b.y));
        if (x1 > x0 && y1 > y0) pointArea({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        else select(null);
        return;
      }
      case "brush":
        if (d.cells.size) edit(`${s.doc.materials[s.brush.material!]?.name ?? "지형"} 칠하기`, [paintCommand(d)]);
        else clearDraft();
        return;
    }
  }

  function onDoubleClick(e: React.MouseEvent<HTMLDivElement>): void {
    const view = viewRef.current, s = useStore.getState(), sc = sceneOf(s.doc);
    if (!view || !sc || s.playing || s.tool !== "select") return;
    const p = local(e);
    if (view.pickEntity(p.x, p.y)) return;
    // 맨바닥을 두 번 누르면 그 재질로 붓을 든다
    const t = view.screenToTile(p.x, p.y);
    const x = Math.floor(t.x), y = Math.floor(t.y);
    if (x < 0 || y < 0 || x >= sc.w || y >= sc.h) return void view.fit();
    useStore.setState({ brush: { ...s.brush, material: sc.terrain[y * sc.w + x] } });
    setTool("brush");
  }

  return (
    <div
      ref={hostRef}
      className={`viewport tool-${tool}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => {
        pointer.current = null;
        hover.current = null;
      }}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div ref={overlayRef} className="overlay" style={{ zIndex: 2 } as CSSProperties}>
        {!playing &&
          chips.map((c, i) => (c.kind === "area" ? <div key={i} className="area-chip" data-area={i} style={{ display: "none" }} /> : null))}
        <div ref={hoverRef} className="hover-box" style={{ display: "none" }} />
        <div ref={selRef} className="sel-box" style={{ display: "none" }} />
        <div ref={ringRef} className="light-ring" style={{ display: "none" }} />
        <div ref={marqueeRef} className="marquee" style={{ display: "none" }} />
        <div ref={brushRef} className="brush-cursor" style={{ display: "none" }} />
        {!playing &&
          scene &&
          tool === "select" &&
          Object.values(scene.lights).map((l) => (
            <div
              key={l.id}
              data-light={l.id}
              className={`light-dot${selection?.kind === "light" && selection.id === l.id ? " selected" : ""}`}
              style={{ "--c": l.color, display: "none" } as CSSProperties}
              title="광원"
              onPointerDown={(e) => onLightDown(e, l.id)}
            >
              <i />
            </div>
          ))}
        {!playing && selection && <Inspector key={`${selection.kind}:${selection.id}`} />}
      </div>
    </div>
  );
}
