import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defaultStyle, flattenPalette } from "@age/model";
import { decode, recolorPng } from "../src";

const slime = readFileSync(new URL("../../server/starter/slime.png", import.meta.url));

describe("recolorPng", () => {
  it("색을 돌려도 팔레트 안에 있고 투명한 곳과 윤곽선은 그대로다", async () => {
    const style = defaultStyle();
    const out = await decode(await recolorPng(slime, style.palette, { hue: 120, saturation: 1, lightness: 0 }));
    const src = await decode(slime);
    const allowed = new Set(flattenPalette(style.palette).map((c) => c.toLowerCase()));
    let changed = 0;
    for (let i = 0; i < src.data.length; i += 4) {
      expect(out.data[i + 3]).toBe(src.data[i + 3]);
      if (src.data[i + 3] === 0) continue;
      const hex = "#" + [0, 1, 2].map((k) => out.data[i + k].toString(16).padStart(2, "0")).join("");
      expect(allowed.has(hex)).toBe(true);
      if (out.data[i] !== src.data[i] || out.data[i + 1] !== src.data[i + 1] || out.data[i + 2] !== src.data[i + 2]) changed++;
    }
    expect(changed).toBeGreaterThan(20);
  });
});
