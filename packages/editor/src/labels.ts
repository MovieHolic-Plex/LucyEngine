import type { Asset, PrefabKind, Project } from "@age/model";
import type { CSSProperties } from "react";
import { assetUrl } from "./view";

export const KIND_LABEL: Record<PrefabKind, string> = { player: "주인공", npc: "인물", enemy: "적", prop: "소품", building: "건물" };

export const BEHAVIOR_LABEL: Record<string, string> = { idle: "가만히 있기", wander: "돌아다니기", chase: "쫓아오기", patrol: "순찰하기", ranged: "멀리서 쏘기" };

export const AMBIENT_PRESETS: Array<{ name: string; color: string }> = [
  { name: "한낮", color: "#ffffff" },
  { name: "노을", color: "#e0a184" },
  { name: "해질녘", color: "#8f7fb8" },
  { name: "밤", color: "#4a4f8c" },
  { name: "동굴", color: "#2e2a44" },
];

export const LIGHT_PRESETS = ["#ffd9a0", "#ffb060", "#ff7a5c", "#9ad8ff", "#a0ffd0", "#d8a0ff", "#ffffff"];

/** 에셋 그림을 상자 안에 맞춰 보여 주는 배경 스타일. 캐릭터 시트는 첫 프레임만 보인다. */
export function spriteStyle(asset: Asset | undefined, box: number): CSSProperties {
  if (!asset) return {};
  if (!asset.file) return { width: box * 0.5, height: box * 0.5, background: asset.color, borderRadius: 4 };
  const fw = asset.frames?.frameW ?? asset.w, fh = asset.frames?.frameH ?? asset.h;
  const fit = Math.min(box / fw, box / fh);
  const k = fit >= 1 ? Math.max(1, Math.floor(fit)) : fit;
  return {
    width: fw * k,
    height: fh * k,
    backgroundImage: `url(${assetUrl(asset.file)})`,
    backgroundSize: `${asset.w * k}px ${asset.h * k}px`,
    backgroundPosition: "0 0",
    backgroundRepeat: "no-repeat",
    imageRendering: "pixelated",
  };
}

export function prefabAsset(doc: Project, prefabId: string): Asset | undefined {
  const p = doc.prefabs[prefabId];
  return p ? doc.assets[p.asset] : undefined;
}

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = isMac ? "⌘" : "Ctrl";
