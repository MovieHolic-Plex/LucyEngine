import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { addLight, deleteSelection, duplicateSelection, placePrefab, setTheme } from "../actions";
import { KIND_LABEL, MOD } from "../labels";
import { entityLabel, navigate, newProject, recentProjects, redo, sceneOf, select, setLighting, setPlaying, setTool, undo, useStore, viewDoc } from "../store";
import { getView } from "../view";
import { Icon } from "./icons";

interface Item {
  group: string;
  name: string;
  hint?: string;
  keys?: string;
  icon: ReactNode;
  run(): void;
}

function useItems(): Item[] {
  const doc = useStore(viewDoc);
  const selection = useStore((s) => s.selection);
  const lighting = useStore((s) => s.lighting);
  const projectId = useStore((s) => s.projectId);
  return useMemo(() => {
    const scene = sceneOf(doc);
    const items: Item[] = [
      { group: "하기", name: "플레이", keys: `${MOD}↵`, icon: <Icon.play size={13} />, run: () => setPlaying(true) },
      { group: "하기", name: "되돌리기", keys: `${MOD}Z`, icon: <Icon.undo />, run: undo },
      { group: "하기", name: "다시 하기", keys: `⇧${MOD}Z`, icon: <Icon.redo />, run: redo },
      { group: "하기", name: "AI 에게 말하기", keys: "/", icon: <Icon.sparkle />, run: () => useStore.setState({ chatOpen: true, compose: { text: "", key: Date.now() } }) },
    ];
    if (selection) {
      items.push(
        { group: "고른 것", name: "복제", keys: `${MOD}D`, icon: <Icon.copy />, run: duplicateSelection },
        { group: "고른 것", name: "지우기", keys: "⌫", icon: <Icon.trash />, run: deleteSelection },
      );
    }
    items.push(
      { group: "도구", name: "고르기", keys: "V", icon: <Icon.cursor />, run: () => setTool("select") },
      { group: "도구", name: "바닥 칠하기", keys: "B", icon: <Icon.brush />, run: () => setTool("brush") },
      { group: "도구", name: "놓기 목록 열기", keys: "N", icon: <Icon.plus />, run: () => useStore.setState({ panel: "library" }) },
      { group: "도구", name: "광원 놓기", icon: <Icon.bulb />, run: addLight },
      { group: "보기", name: "장면 분위기 (시간대·빛 번짐)", icon: <Icon.scene />, run: () => useStore.setState({ panel: "scene" }) },
      { group: "보기", name: lighting ? "작업등 켜기 (조명 끄고 보기)" : "조명 다시 켜기", keys: "L", icon: lighting ? <Icon.bulbOff /> : <Icon.bulb />, run: () => setLighting(!lighting) },
      { group: "보기", name: "화면에 맞추기", keys: "F", icon: <Icon.fit />, run: () => getView()?.fit() },
      { group: "보기", name: "채팅 접기·펴기", keys: `${MOD}\\`, icon: <Icon.sidebar />, run: () => useStore.setState({ chatOpen: !useStore.getState().chatOpen }) },
      { group: "보기", name: "밝은 화면", icon: <Icon.sun />, run: () => setTheme("light") },
      { group: "보기", name: "어두운 화면", icon: <Icon.moon />, run: () => setTheme("dark") },
      { group: "보기", name: "화면 밝기를 시스템에 맞추기", icon: <Icon.sun />, run: () => setTheme("system") },
    );
    if (doc && scene) {
      for (const e of Object.values(scene.entities)) {
        const kind = doc.prefabs[e.prefab]?.kind;
        if (!kind || kind === "prop") continue;
        items.push({
          group: "찾기",
          name: entityLabel(doc, e.id),
          hint: KIND_LABEL[kind],
          icon: <Icon.target />,
          run: () => {
            select({ kind: "entity", id: e.id });
            const view = getView();
            if (view) {
              const tile = doc.style.tile;
              const off = useStore.getState().chatOpen ? 396 / 2 / view.getCamera().zoom : 0;
              view.setCamera({ x: e.x * tile - off, y: (e.y - 0.8) * tile });
            }
          },
        });
      }
      for (const p of Object.values(doc.prefabs)) items.push({ group: "놓기", name: `${p.name} 놓기`, hint: KIND_LABEL[p.kind], icon: <Icon.plus />, run: () => placePrefab(p.id) });
    }
    items.push(
      { group: "프로젝트", name: "새 프로젝트", icon: <Icon.file />, run: () => void newProject("blank") },
      { group: "프로젝트", name: "예시 장면 열기 — 기차역 앞 광장", icon: <Icon.scene />, run: () => void newProject("demo") },
    );
    for (const r of recentProjects()) if (r.id !== projectId) items.push({ group: "최근 프로젝트", name: r.name, icon: <Icon.file />, run: () => navigate(r.id) });
    return items;
  }, [doc, selection, lighting, projectId]);
}

/** 초성 없이도 찾기 쉽게: 띄어쓰기로 나눈 낱말이 모두 들어 있으면 맞는다. */
function matches(item: Item, q: string): boolean {
  const hay = `${item.name} ${item.group} ${item.hint ?? ""}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

export function Palette() {
  const open = useStore((s) => s.paletteOpen);
  if (!open) return null;
  return <PaletteBody />;
}

function PaletteBody() {
  const items = useItems();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const shown = useMemo(() => {
    const f = items.filter((i) => matches(i, q));
    // 아무것도 안 쳤을 때는 긴 목록(찾기·놓기)을 감춘다
    return q.trim() ? f : f.filter((i) => i.group !== "찾기" && i.group !== "놓기");
  }, [items, q]);
  const close = () => useStore.setState({ paletteOpen: false });
  const run = (item: Item | undefined) => {
    if (!item) return;
    close();
    item.run();
  };
  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    list.current?.querySelector(".active")?.scrollIntoView({ block: "nearest" });
  }, [active]);

  let group = "";
  return (
    <div className="scrim" onPointerDown={close}>
      <div className="palette glass" role="dialog" aria-label="명령 찾기" onPointerDown={(e) => e.stopPropagation()}>
        <div className="palette-input">
          <Icon.search size={18} />
          <input
            autoFocus
            value={q}
            placeholder="무엇을 할까요?"
            spellCheck={false}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Escape") close();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(shown.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                run(shown[active]);
              }
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-list" ref={list}>
          {shown.length === 0 && <div className="palette-empty">맞는 명령이 없어요. 채팅으로 말해 보세요.</div>}
          {shown.map((item, i) => {
            const head = item.group !== group ? (group = item.group) : null;
            return (
              <div key={`${item.group}:${item.name}:${i}`}>
                {head && <div className="palette-group">{head}</div>}
                <button className={`palette-item${i === active ? " active" : ""}`} onMouseMove={() => setActive(i)} onClick={() => run(item)}>
                  <span className="ico">{item.icon}</span>
                  <span className="name">{item.name}</span>
                  {item.hint && <span className="hint">{item.hint}</span>}
                  {item.keys && <kbd>{item.keys}</kbd>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
