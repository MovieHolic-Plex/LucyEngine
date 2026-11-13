import { useEffect, useState } from "react";
import { deleteSelection, duplicateSelection, nudgeSelection } from "../actions";
import { createProject, forgetProject, navigate, newProject, openProject, recentProjects, redo, rememberProject, select, setLighting, setPlaying, setTool, undo, useStore } from "../store";
import { getView } from "../view";
import { Chat } from "./Chat";
import { HistoryBar } from "./HistoryBar";
import { Icon } from "./icons";
import { Palette } from "./Palette";
import { PlayBar, Toolbar } from "./Toolbar";
import { Viewport } from "./Viewport";

const projectIdFromUrl = () => location.pathname.match(/^\/p\/([A-Za-z0-9_-]+)/)?.[1] ?? null;

function useRoute(): string | null {
  const [id, setId] = useState(projectIdFromUrl);
  useEffect(() => {
    const on = () => setId(projectIdFromUrl());
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  return id;
}

function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      const mod = e.metaKey || e.ctrlKey;
      const typing = !!(e.target as HTMLElement)?.closest?.("input,textarea,select,[contenteditable]");
      const key = e.key.toLowerCase();

      if (mod && key === "k") {
        e.preventDefault();
        if (s.playing) setPlaying(false);
        return useStore.setState({ paletteOpen: !s.paletteOpen });
      }
      if (s.paletteOpen) return;
      if (mod && e.key === "Enter") {
        e.preventDefault();
        return setPlaying(!s.playing);
      }
      if (s.playing) {
        if (e.key === "Escape") setPlaying(false);
        return;
      }
      if (mod && key === "z") {
        if (typing) return;
        e.preventDefault();
        return e.shiftKey ? redo() : undo();
      }
      if (mod && key === "y" && !typing) {
        e.preventDefault();
        return redo();
      }
      if (mod && e.key === "\\") {
        e.preventDefault();
        return useStore.setState({ chatOpen: !s.chatOpen });
      }
      if (typing) return;
      if (mod && key === "d") {
        e.preventDefault();
        return duplicateSelection();
      }
      if (mod || e.altKey) return;
      switch (e.key) {
        case "Escape":
          if (s.panel) return useStore.setState({ panel: null });
          if (s.tool !== "select") return setTool("select");
          return select(null);
        case "Delete":
        case "Backspace":
          if (s.selection) {
            e.preventDefault();
            deleteSelection();
          }
          return;
        case "ArrowLeft":
        case "ArrowRight":
        case "ArrowUp":
        case "ArrowDown": {
          if (!s.selection) return;
          e.preventDefault();
          const d = e.shiftKey ? 1 : 0.25;
          return nudgeSelection(e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0, e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0);
        }
        case "/":
          e.preventDefault();
          return useStore.setState({ chatOpen: true, compose: { text: "", key: Date.now() } });
      }
      switch (key) {
        case "v":
          return setTool("select");
        case "b":
          return setTool(s.tool === "brush" ? "select" : "brush");
        case "n":
          return useStore.setState({ panel: s.panel === "library" ? null : "library" });
        case "l":
          return setLighting(!s.lighting);
        case "f":
          return void getView()?.fit();
        case "1":
        case "2":
        case "3":
          if (s.tool === "brush") useStore.setState({ brush: { ...s.brush, size: Number(key) } });
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function Toast() {
  const toast = useStore((s) => s.toast);
  if (!toast) return null;
  return (
    <div key={toast.key} className="toast glass" role="status">
      {toast.text}
    </div>
  );
}

/** 주소에 프로젝트가 없으면 마지막에 열었던 것을 열고, 그것도 없으면 빈 프로젝트를 만든다. */
function Launcher() {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      for (const r of recentProjects()) {
        const res = await fetch(`/api/projects/${r.id}`).catch(() => null);
        if (!alive) return;
        if (res?.ok) return navigate(r.id);
        if (res?.status === 404) forgetProject(r.id);
      }
      try {
        const id = await createProject("blank");
        if (alive) navigate(id);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div className="center-note">
      {failed ? (
        <>
          <h1>서버에 연결하지 못했어요</h1>
          <p>서버가 켜져 있는지 확인한 뒤 새로 고쳐 주세요.</p>
          <button className="btn primary" onClick={() => location.reload()}>다시 시도</button>
        </>
      ) : (
        <div className="spinner" />
      )}
    </div>
  );
}

function Editor({ id }: { id: string }) {
  const conn = useStore((s) => s.conn);
  const loaded = useStore((s) => !!s.doc);
  const name = useStore((s) => s.doc?.meta.name);
  const playing = useStore((s) => s.playing);
  const busy = useStore((s) => s.busy);
  const chatOpen = useStore((s) => s.chatOpen);
  // 아무것도 없는 새 프로젝트: 화면은 물러나고 입력창이 주인공이 된다
  const blank = useStore((s) => !!s.doc && !s.preview && Object.keys(s.doc.prefabs).length === 0 && Object.keys(s.doc.scenes[s.doc.startScene]?.entities ?? {}).length === 0);
  useShortcuts();

  useEffect(() => {
    openProject(id);
  }, [id]);

  useEffect(() => {
    if (!name) return;
    rememberProject(id, name);
    document.title = `${name} — LucyEngine`;
  }, [id, name]);

  if (conn === "missing")
    return (
      <div className="center-note">
        <h1>이 프로젝트를 찾을 수 없어요</h1>
        <p>주소가 바뀌었거나 지워진 프로젝트입니다.</p>
        <button
          className="btn primary"
          onClick={() => {
            forgetProject(id);
            void newProject("blank");
          }}
        >
          새 프로젝트 만들기
        </button>
      </div>
    );

  return (
    <div className={`app${playing ? " playing" : ""}${busy ? " busy" : ""}${chatOpen ? " with-chat" : ""}${blank ? " blank" : ""}`}>
      <Viewport />
      {blank && !busy && (
        <div className="blank-note">
          <Icon.sparkle size={20} />
          <span>말하면 여기에 장면이 생겨요</span>
        </div>
      )}
      <div className="ai-veil" />
      {!loaded && (
        <div className="center-note" style={{ pointerEvents: "none" }}>
          <div className="spinner" />
        </div>
      )}
      <Chat />
      {!chatOpen && (
        <button className="reopen glass chrome from-left" title="채팅 펴기" aria-label="채팅 펴기" onClick={() => useStore.setState({ chatOpen: true })}>
          <Icon.chat size={18} />
        </button>
      )}
      <Toolbar />
      <PlayBar />
      <HistoryBar />
      <Palette />
      <Toast />
    </div>
  );
}

export function App() {
  const id = useRoute();
  return id ? <Editor id={id} /> : <Launcher />;
}
