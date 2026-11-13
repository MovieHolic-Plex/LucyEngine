import { GameView, SceneCapturer } from "@age/runtime/view";
import type { Project } from "@age/model";

export const assetUrl = (file: string) => `/assets/${file}`;

// 편집기에는 뷰포트가 하나뿐이다. 여러 컴포넌트가 같은 인스턴스를 쓴다.
let view: GameView | null = null;
let capturer: SceneCapturer | null = null;

export function setView(v: GameView | null): void {
  view = v;
}

export function getView(): GameView | null {
  return view;
}

function getCapturer(): SceneCapturer {
  capturer ??= new SceneCapturer(assetUrl);
  return capturer;
}

/** 변경 카드에 붙일 작은 그림. */
export async function thumbnail(doc: Project): Promise<string | undefined> {
  try {
    const r = await getCapturer().capture(doc, { maxSize: 360, type: "image/jpeg" });
    return r.image;
  } catch (e) {
    console.warn("thumbnail failed", e);
    return undefined;
  }
}

/** 에이전트가 보는 사진. 가장자리에 타일 좌표 눈금을 붙인다. */
export async function captureForAgent(doc: Project, region?: { x: number; y: number; w: number; h: number }): Promise<{ data: string; note: string } | null> {
  const scene = doc.scenes[doc.startScene];
  if (!scene) return null;
  const r = await getCapturer().capture(doc, { region, maxSize: 1000, type: "image/png" });
  const tile = doc.style.tile;
  const rx = Math.max(0, region?.x ?? 0), ry = Math.max(0, region?.y ?? 0);
  const rw = Math.min(scene.w - rx, region?.w ?? scene.w), rh = Math.min(scene.h - ry, region?.h ?? scene.h);
  const px = tile * r.scale;

  const img = new Image();
  img.src = r.image;
  await img.decode();
  const M = 22;
  const c = document.createElement("canvas");
  c.width = r.width + M;
  c.height = r.height + M;
  const g = c.getContext("2d")!;
  g.fillStyle = "#16161c";
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, M, M);
  g.fillStyle = "#d8d8e0";
  g.strokeStyle = "rgba(255,255,255,.35)";
  g.font = "11px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const every = Math.max(1, Math.ceil(36 / px));
  const step = [1, 2, 5, 10, 20].find((s) => s >= every) ?? every;
  for (let t = Math.ceil(rx / step) * step; t <= rx + rw; t += step) {
    const x = M + (t - rx) * px;
    g.beginPath();
    g.moveTo(x + 0.5, M - 5);
    g.lineTo(x + 0.5, M);
    g.stroke();
    g.fillText(String(t), x, 9);
  }
  g.textAlign = "right";
  for (let t = Math.ceil(ry / step) * step; t <= ry + rh; t += step) {
    const y = M + (t - ry) * px;
    g.beginPath();
    g.moveTo(M - 5, y + 0.5);
    g.lineTo(M, y + 0.5);
    g.stroke();
    g.fillText(String(t), M - 6, y);
  }
  const data = c.toDataURL("image/jpeg", 0.88).split(",")[1];
  const note = `Scene "${scene.name}" is ${scene.w}×${scene.h} tiles. This picture covers tiles x ${rx}–${rx + rw}, y ${ry}–${ry + rh}; one tile is ${Math.round(px)} px. The numbers on the top and left edges are tile coordinates. Lighting and post-processing are on.`;
  return { data, note };
}
