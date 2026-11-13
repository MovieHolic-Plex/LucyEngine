import { buildPalette } from "./palette";
import { SCHEMA_VERSION, TILE, type Project, type Post, type Style } from "./schema";

export const DEFAULT_POST: Post = { bloom: 0.4, vignette: 0.3, saturation: 0.1, contrast: 0.06 };

export function defaultStyle(): Style {
  return { tile: TILE, palette: buildPalette(), mood: "", view: "three-quarter", light: "upper-left", outlineSteps: 2 };
}

/** 빈 프로젝트. 맨바닥 재질 하나로 채운 장면 하나가 있다. */
export function createBlankProject(name = "새 프로젝트", w = 30, h = 18): Project {
  return {
    meta: { name, schemaVersion: SCHEMA_VERSION, seq: 0 },
    style: defaultStyle(),
    assets: {},
    materials: {
      ground: { id: "ground", name: "맨바닥", asset: null, color: "#6e6558", walkable: true, priority: 0, edge: "soft" },
    },
    prefabs: {},
    scenes: {
      main: {
        id: "main",
        name: "첫 장면",
        w,
        h,
        terrain: new Array(w * h).fill("ground"),
        entities: {},
        lights: {},
        ambient: "#ffffff",
        post: { ...DEFAULT_POST },
        dialogues: {},
        events: {},
      },
    },
    startScene: "main",
  };
}
