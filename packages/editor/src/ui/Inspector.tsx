import { BEHAVIORS, resolveProps, type Command, type Dialogue, type Entity, type EntityProps, type Light, type LightProps, type Project, type Scene } from "@age/model";
import { deleteSelection, duplicateSelection } from "../actions";
import { BEHAVIOR_LABEL, KIND_LABEL, LIGHT_PRESETS, prefabAsset, spriteStyle } from "../labels";
import { composeText, edit, previewEdit, sceneOf, useStore, viewDoc } from "../store";
import { ColorField, NumberField, Slider, Switch, TextArea, TextField } from "./controls";
import { Icon } from "./icons";

type Nullable<T> = { [K in keyof T]?: T[K] | null };

/** 고른 대상 옆에 뜨는 작은 인스펙터. 종류에 맞는 속성 몇 개만 보여 준다. */
export function Inspector() {
  const doc = useStore(viewDoc);
  const selection = useStore((s) => s.selection);
  const scene = sceneOf(doc);
  if (!doc || !scene || !selection) return null;
  const body = selection.kind === "entity" ? scene.entities[selection.id] && <EntityInspector doc={doc} scene={scene} entity={scene.entities[selection.id]} /> : scene.lights[selection.id] && <LightInspector scene={scene} light={scene.lights[selection.id]} />;
  if (!body) return null;
  return (
    <div className="popover glass" data-popover style={{ visibility: "hidden" }} onPointerDown={(e) => e.stopPropagation()} onPointerMove={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      {body}
    </div>
  );
}

function LightFields({ light, preview, commit }: { light: LightProps; preview(patch: Partial<LightProps>): void; commit(label: string, patch: Partial<LightProps>): void }) {
  return (
    <>
      <div className="row">
        <label>색</label>
        <ColorField value={light.color} presets={LIGHT_PRESETS.slice(0, 5)} onPreview={(color) => preview({ color })} onCommit={(color) => commit("광원 색", { color })} />
      </div>
      <div className="row">
        <label>퍼지는 범위</label>
        <Slider value={light.radius} min={1} max={14} step={0.5} format={(v) => `${v}칸`} onPreview={(radius) => preview({ radius })} onCommit={(radius) => commit("광원 범위", { radius })} />
      </div>
      <div className="row">
        <label>밝기</label>
        <Slider value={light.intensity} min={0} max={1.6} step={0.05} format={(v) => `${Math.round(v * 100)}`} onPreview={(intensity) => preview({ intensity })} onCommit={(intensity) => commit("광원 밝기", { intensity })} />
      </div>
      <div className="row">
        <label>일렁임</label>
        <Switch label="일렁임" checked={!!light.flicker} onChange={(flicker) => commit("광원 일렁임", { flicker })} />
      </div>
    </>
  );
}

function LightInspector({ scene, light }: { scene: Scene; light: Light }) {
  const cmd = (patch: Partial<LightProps>): Command => ({ type: "updateLight", scene: scene.id, id: light.id, patch });
  return (
    <>
      <div className="pop-head">
        <div className="pop-thumb" style={{ display: "grid", placeItems: "center" }}>
          <i style={{ width: 14, height: 14, borderRadius: "50%", background: light.color, boxShadow: `0 0 14px ${light.color}` }} />
        </div>
        <div className="pop-title">
          <b>광원</b>
          <small>끌어서 옮길 수 있어요</small>
        </div>
      </div>
      <div className="rows">
        <LightFields light={light} preview={(p) => previewEdit([cmd(p)])} commit={(label, p) => edit(label, [cmd(p)])} />
      </div>
      <div className="sep" />
      <div className="pop-actions">
        <button className="btn" onClick={duplicateSelection}><Icon.copy size={13} />복제</button>
        <button className="btn danger" onClick={deleteSelection}><Icon.trash size={13} />지우기</button>
      </div>
    </>
  );
}

function EntityInspector({ doc, scene, entity }: { doc: Project; scene: Scene; entity: Entity }) {
  const prefab = doc.prefabs[entity.prefab];
  const asset = prefabAsset(doc, entity.prefab);
  const props = resolveProps(doc, entity);
  const kind = prefab?.kind ?? "prop";
  const propsCmd = (patch: Nullable<EntityProps>): Command => ({ type: "setEntityProps", scene: scene.id, id: entity.id, props: patch });
  const set = (label: string, patch: Nullable<EntityProps>) => edit(label, [propsCmd(patch)]);
  const name = props.name || prefab?.name || entity.id;
  const character = kind === "player" || kind === "npc" || kind === "enemy";
  const dialogue = props.dialogue ? scene.dialogues[props.dialogue] : undefined;

  const startDialogue = () => {
    let id = `${entity.id}_talk`;
    for (let i = 2; scene.dialogues[id]; i++) id = `${entity.id}_talk${i}`;
    edit("대사 만들기", [
      { type: "setDialogue", scene: scene.id, dialogue: { id, nodes: [{ id: "a", speaker: kind === "npc" ? name : "", text: "…" }] } },
      propsCmd({ dialogue: id }),
    ]);
  };

  return (
    <>
      <div className="pop-head">
        <div className="pop-thumb" style={{ display: "grid", placeItems: "center", overflow: "hidden" }}>
          <div style={spriteStyle(asset, 32)} />
        </div>
        <div className="pop-title">
          <b>{name}</b>
          <small>{KIND_LABEL[kind]}{asset && !asset.file ? " · 그림 준비 중" : ""}</small>
        </div>
        <button className="icon-btn" title="AI 에게 이 대상에 대해 말하기" onClick={() => composeText("")}><Icon.sparkle size={15} /></button>
      </div>

      <div className="rows">
        <div className="row">
          <label>이름</label>
          <TextField value={props.name ?? ""} placeholder={prefab?.name} maxLength={60} onCommit={(v) => set("이름 바꾸기", { name: v.trim() || null })} />
        </div>
        {(kind === "player" || kind === "enemy") && (
          <div className="row">
            <label>체력</label>
            <NumberField value={props.hp ?? 1} min={1} max={99} onCommit={(hp) => set("체력 바꾸기", { hp })} />
          </div>
        )}
        {kind === "enemy" && (
          <>
            <div className="row">
              <label>행동</label>
              <select className="field" value={props.behavior ?? "idle"} onChange={(e) => set("행동 바꾸기", { behavior: e.target.value as EntityProps["behavior"] })} onKeyDown={(e) => e.stopPropagation()}>
                {BEHAVIORS.map((b) => (
                  <option key={b} value={b}>{BEHAVIOR_LABEL[b]}</option>
                ))}
              </select>
            </div>
            <div className="row">
              <label>공격력</label>
              <NumberField value={props.damage ?? 1} min={0} max={20} onCommit={(damage) => set("공격력 바꾸기", { damage })} />
            </div>
            <div className="row">
              <label>알아채는 거리</label>
              <Slider value={props.aggroRange ?? 5} min={0} max={16} step={0.5} format={(v) => `${v}칸`} onPreview={() => {}} onCommit={(aggroRange) => set("알아채는 거리", { aggroRange })} />
            </div>
          </>
        )}
        {kind === "npc" && (
          <div className="row">
            <label>행동</label>
            <select className="field" value={props.behavior === "wander" ? "wander" : "idle"} onChange={(e) => set("행동 바꾸기", { behavior: e.target.value as EntityProps["behavior"] })} onKeyDown={(e) => e.stopPropagation()}>
              <option value="idle">{BEHAVIOR_LABEL.idle}</option>
              <option value="wander">{BEHAVIOR_LABEL.wander}</option>
            </select>
          </div>
        )}
        {character && (
          <div className="row">
            <label>빠르기</label>
            <Slider value={props.speed ?? 3} min={0} max={10} step={0.25} format={(v) => String(v)} onPreview={() => {}} onCommit={(speed) => set("빠르기 바꾸기", { speed })} />
          </div>
        )}
        {!character && (
          <div className="row">
            <label>길을 막음</label>
            <Switch label="길을 막음" checked={props.solid !== false} onChange={(solid) => set(solid ? "길 막기" : "지나갈 수 있게", { solid })} />
          </div>
        )}
        {!character && (
          <div className="row">
            <label>좌우 뒤집기</label>
            <Switch label="좌우 뒤집기" checked={!!props.flip} onChange={(flip) => set("좌우 뒤집기", { flip: flip ? true : null })} />
          </div>
        )}
        {!character && (
          <div className="row">
            <label>빛을 냄</label>
            <Switch label="빛을 냄" checked={!!props.light} onChange={(on) => set(on ? "빛 켜기" : "빛 끄기", { light: on ? { color: "#ffd9a0", radius: 4, intensity: 0.8 } : null })} />
          </div>
        )}
        {!character && props.light && (
          <LightFields light={props.light} preview={(p) => previewEdit([propsCmd({ light: { ...props.light!, ...p } })])} commit={(label, p) => set(label, { light: { ...props.light!, ...p } })} />
        )}
      </div>

      {kind !== "player" && kind !== "enemy" && (
        <>
          <div className="sep" />
          {dialogue ? (
            <DialogueEditor scene={scene} dialogue={dialogue} defaultSpeaker={kind === "npc" ? name : ""} onDetach={() => set("대사 떼기", { dialogue: null })} />
          ) : (
            <button className="btn quiet" onClick={startDialogue}><Icon.chat size={13} />{kind === "npc" ? "대사 쓰기" : "조사하면 나오는 글 쓰기"}</button>
          )}
        </>
      )}

      <div className="sep" />
      <div className="pop-actions">
        {kind !== "player" && <button className="btn" onClick={duplicateSelection}><Icon.copy size={13} />복제</button>}
        <button className="btn" onClick={() => composeText(`이 ${prefab?.name ?? "대상"} 그림을 다시 그려줘. `)}><Icon.sparkle size={13} />다시 그리기</button>
        <button className="btn danger" onClick={deleteSelection}><Icon.trash size={13} />지우기</button>
      </div>
    </>
  );
}

function DialogueEditor({ scene, dialogue, defaultSpeaker, onDetach }: { scene: Scene; dialogue: Dialogue; defaultSpeaker: string; onDetach(): void }) {
  const save = (label: string, nodes: Dialogue["nodes"]) => edit(label, [{ type: "setDialogue", scene: scene.id, dialogue: { ...dialogue, nodes } }]);
  const nodes = dialogue.nodes;
  const addLine = () => {
    let i = nodes.length + 1;
    while (nodes.some((n) => n.id === `n${i}`)) i++;
    const last = nodes[nodes.length - 1];
    // 끝을 뜻하던 마지막 대사가 새 대사로 이어지게 한다
    const prev = last && last.next === null && !last.choices ? [...nodes.slice(0, -1), { ...last, next: undefined }] : nodes;
    save("대사 추가", [...prev, { id: `n${i}`, speaker: last?.speaker ?? defaultSpeaker, text: "…" }]);
  };
  const remove = (id: string) => {
    if (nodes.length <= 1) return onDetach();
    const rest = nodes.filter((n) => n.id !== id).map((n) => ({
      ...n,
      next: n.next === id ? undefined : n.next,
      choices: n.choices?.map((c) => (c.next === id ? { ...c, next: null } : c)),
    }));
    save("대사 지우기", rest);
  };
  return (
    <div>
      <div className="section-title">대사</div>
      <div className="lines">
        {nodes.map((n) => (
          <div key={n.id} className="line">
            <TextField className="field speaker" value={n.speaker} placeholder="말하는 이 (비우면 해설)" maxLength={60} onCommit={(speaker) => save("화자 바꾸기", nodes.map((m) => (m.id === n.id ? { ...m, speaker } : m)))} />
            <TextArea value={n.text} maxLength={600} onCommit={(text) => save("대사 고치기", nodes.map((m) => (m.id === n.id ? { ...m, text } : m)))} />
            {n.choices && n.choices.length > 0 && <div className="choices">선택지: {n.choices.map((c) => c.text).join(" · ")}</div>}
            <button className="x" title="이 대사 지우기" onClick={() => remove(n.id)}><Icon.x size={11} /></button>
          </div>
        ))}
      </div>
      <div className="pop-actions" style={{ marginTop: 8 }}>
        <button className="btn quiet" onClick={addLine}><Icon.plus size={13} />대사 추가</button>
      </div>
    </div>
  );
}
