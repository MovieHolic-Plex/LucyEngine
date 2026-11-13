import { useEffect, useState, type CSSProperties } from "react";
import { PREFAB_KINDS, type Command, type Post } from "@age/model";
import { addLight, placePrefab } from "../actions";
import { AMBIENT_PRESETS, KIND_LABEL, MOD, spriteStyle } from "../labels";
import { edit, previewEdit, sceneOf, setLighting, setPlaying, setTool, useStore, viewDoc } from "../store";
import { assetUrl, getView } from "../view";
import { ColorField, Slider, TextField } from "./controls";
import { Icon } from "./icons";

export function Toolbar() {
  const tool = useStore((s) => s.tool);
  const panel = useStore((s) => s.panel);
  const lighting = useStore((s) => s.lighting);
  const ready = useStore((s) => !!sceneOf(viewDoc(s)));
  const hasPlayer = useStore((s) => {
    const d = viewDoc(s), sc = sceneOf(d);
    return !!d && !!sc && Object.values(sc.entities).some((e) => d.prefabs[e.prefab]?.kind === "player");
  });
  const toggle = (p: "scene" | "library") => useStore.setState({ panel: panel === p ? null : p });
  return (
    <>
      <div className="toolbar chrome from-top">
        <div className="tool-group glass">
          <button className={`icon-btn${tool === "select" ? " on" : ""}`} title="고르기 (V)" aria-label="고르기" onClick={() => setTool("select")}>
            <Icon.cursor />
          </button>
          <button className={`icon-btn${tool === "brush" ? " on" : ""}`} title="바닥 칠하기 (B)" aria-label="바닥 칠하기" onClick={() => setTool(tool === "brush" ? "select" : "brush")}>
            <Icon.brush />
          </button>
          <button className={`icon-btn${panel === "library" ? " on" : ""}`} title="놓기 (N)" aria-label="놓기" onClick={() => toggle("library")}>
            <Icon.plus />
          </button>
          <span className="tool-sep" />
          <button className={`icon-btn${panel === "scene" ? " on" : ""}`} title="장면 분위기" aria-label="장면 분위기" onClick={() => toggle("scene")}>
            <Icon.scene />
          </button>
          <button className={`icon-btn${lighting ? "" : " on"}`} title={lighting ? "작업등 켜기 — 조명 끄고 보기 (L)" : "조명 다시 켜기 (L)"} aria-label="조명 켜고 끄기" onClick={() => setLighting(!lighting)}>
            {lighting ? <Icon.bulb /> : <Icon.bulbOff />}
          </button>
          <button className="icon-btn" title="화면에 맞추기 (F)" aria-label="화면에 맞추기" onClick={() => getView()?.fit()}>
            <Icon.fit />
          </button>
        </div>
        <button className="play-btn" disabled={!ready} title={hasPlayer ? `플레이 (${MOD}↵)` : "주인공이 없어도 둘러볼 수 있어요"} onClick={() => setPlaying(true)}>
          <Icon.play size={14} />
          플레이
        </button>
      </div>
      {panel === "scene" && <ScenePanel />}
      {panel === "library" && <Library />}
      {tool === "brush" && <BrushBar />}
    </>
  );
}

export function PlayBar() {
  const playing = useStore((s) => s.playing);
  const [keys, setKeys] = useState(false);
  useEffect(() => {
    if (!playing) return;
    setKeys(true);
    const t = setTimeout(() => setKeys(false), 6000);
    return () => clearTimeout(t);
  }, [playing]);
  return (
    <>
      <div className="playbar">
        <button className="pill" tabIndex={playing ? 0 : -1} onClick={() => getView()?.restart()}>
          <Icon.restart size={14} />
          처음부터 <kbd>R</kbd>
        </button>
        <button className="pill" tabIndex={playing ? 0 : -1} onClick={() => setPlaying(false)}>
          <Icon.stop size={12} />
          편집으로 <kbd>Esc</kbd>
        </button>
      </div>
      <div className={`play-keys${keys ? " show" : ""}`}>
        <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>이동</span>
        <span><kbd>J</kbd>공격</span>
        <span><kbd>E</kbd>말 걸기</span>
      </div>
    </>
  );
}

function ScenePanel() {
  const doc = useStore(viewDoc);
  const scene = sceneOf(doc);
  if (!doc || !scene) return null;
  const post = (patch: Partial<Post>): Command => ({ type: "setPost", scene: scene.id, patch });
  const ambient = (color: string): Command => ({ type: "setAmbient", scene: scene.id, color });
  const slider = (label: string, key: keyof Post, min: number, max: number) => (
    <div className="row">
      <label>{label}</label>
      <Slider value={scene.post[key]} min={min} max={max} step={0.02} format={(v) => String(Math.round(v * 100))} onPreview={(v) => previewEdit([post({ [key]: v })])} onCommit={(v) => edit(label, [post({ [key]: v })])} />
    </div>
  );
  return (
    <div className="scene-panel glass chrome">
      <div className="pop-head">
        <div className="pop-title">
          <b>장면 분위기</b>
          <small>{scene.w} × {scene.h}칸</small>
        </div>
      </div>
      <div className="rows">
        <div className="row">
          <label>장면 이름</label>
          <TextField value={scene.name} maxLength={80} onCommit={(v) => v.trim() && edit("장면 이름", [{ type: "renameScene", scene: scene.id, name: v.trim() }])} />
        </div>
        <div className="row block">
          <label>시간대</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {AMBIENT_PRESETS.map((p) => (
              <button key={p.name} className="preset" onClick={() => edit(`시간대: ${p.name}`, [ambient(p.color)])}>
                <i style={{ background: p.color }} />
                {p.name}
              </button>
            ))}
          </div>
        </div>
        <div className="row">
          <label>주변 빛</label>
          <ColorField value={scene.ambient} onPreview={(c) => previewEdit([ambient(c)])} onCommit={(c) => edit("주변 빛", [ambient(c)])} />
        </div>
      </div>
      <div className="sep" />
      <div className="rows">
        {slider("빛 번짐", "bloom", 0, 1)}
        {slider("가장자리 어둡게", "vignette", 0, 1)}
        {slider("색 진하기", "saturation", -0.6, 0.6)}
        {slider("대비", "contrast", -0.4, 0.4)}
      </div>
      <div className="sep" />
      <div className="pop-actions">
        <button className="btn" onClick={addLight}><Icon.bulb size={13} />광원 놓기</button>
      </div>
    </div>
  );
}

function Library() {
  const doc = useStore((s) => s.doc);
  if (!doc) return null;
  const prefabs = Object.values(doc.prefabs).sort((a, b) => PREFAB_KINDS.indexOf(a.kind) - PREFAB_KINDS.indexOf(b.kind));
  return (
    <div className="library glass chrome">
      <div className="pop-head">
        <div className="pop-title">
          <b>놓기</b>
          <small>{prefabs.length ? "누르면 화면 가운데에 놓입니다" : "아직 놓을 것이 없어요"}</small>
        </div>
      </div>
      {prefabs.length === 0 ? (
        <p style={{ color: "var(--text-2)", margin: "0 0 4px", fontSize: 12.5 }}>채팅으로 장면을 만들면 그때 그려진 인물·소품이 여기에 모입니다.</p>
      ) : (
        <div className="grid">
          {prefabs.map((p) => (
            <button key={p.id} className="tile-btn" title={`${p.name} · ${KIND_LABEL[p.kind]}`} onClick={() => placePrefab(p.id)}>
              <div className="spr" style={spriteStyle(doc.assets[p.asset], 52)} />
              <span>{p.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BrushBar() {
  const doc = useStore((s) => s.doc);
  const brush = useStore((s) => s.brush);
  if (!doc) return null;
  const set = (patch: Partial<typeof brush>) => useStore.setState({ brush: { ...brush, ...patch } });
  return (
    <div className="brushbar glass chrome">
      {Object.values(doc.materials).map((m) => {
        const file = m.asset ? doc.assets[m.asset]?.file : null;
        const style: CSSProperties = file ? { backgroundImage: `url(${assetUrl(file)})` } : { background: m.color };
        return (
          <button key={m.id} className={`mat${brush.material === m.id ? " on" : ""}`} onClick={() => set({ material: m.id })} title={m.walkable ? m.name : `${m.name} · 지나갈 수 없음`}>
            <i style={style} />
            {m.name}
          </button>
        );
      })}
      <span className="tool-sep" />
      <div className="sizes" role="group" aria-label="붓 크기">
        {[1, 2, 3].map((n) => (
          <button key={n} className={brush.size === n ? "on" : ""} aria-label={`${n}칸`} title={`${n}칸 붓`} onClick={() => set({ size: n })}>
            <i style={{ width: 3 + n * 3, height: 3 + n * 3 }} />
          </button>
        ))}
      </div>
    </div>
  );
}
