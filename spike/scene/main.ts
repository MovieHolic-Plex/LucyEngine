// 0단계 확인용 정지 장면: 생성한 에셋 + 구운 바닥 + 조명·후처리.
import Phaser from "phaser";
import { bakeTerrain } from "../../packages/runtime/src/terrain/bake";

const TILE = 24, MW = 30, MH = 18;
const params = new URLSearchParams(location.search);
const LIT = params.get("lit") !== "0";
const ZOOM = Number(params.get("zoom") ?? 2);

const KEYS = ["b_house", "b_shop", "c_crab", "c_hero.front", "c_npc.front", "c_slime", "p_barrel", "p_bench", "p_bush", "p_crate", "p_lamp", "p_sign", "p_tree", "p_vending", "t_dirt", "t_grass", "t_pavement"];

// 0 흙, 1 포장, 2 풀
const rows = [
  "222222222222222222222222222222",
  "222222222222222222222222222222",
  "222220000000022222000000002222",
  "222200000000002220000000000222",
  "222200000000000000000000000222",
  "222200000000000000000000000022",
  "222201111111111111111111100022",
  "222001111111111111111111100022",
  "220001111111111111111111100222",
  "220001111111111111111111100222",
  "222001111111111111111111100222",
  "222201111111111111111111100022",
  "222200000000110000000000000022",
  "222220000000110000000000002222",
  "222222200000110000000022222222",
  "222222222000110000222222222222",
  "222222222220112222222222222222",
  "222222222222112222222222222222",
];

interface Ent { key: string; x: number; y: number }
const ents: Ent[] = [
  { key: "b_house", x: 7.5, y: 6.2 }, { key: "b_shop", x: 21, y: 6.1 },
  { key: "p_tree", x: 2.2, y: 9.5 }, { key: "p_tree", x: 27.6, y: 13.2 },
  { key: "p_lamp", x: 13.6, y: 7.2 }, { key: "p_lamp", x: 3.9, y: 14.6 },
  { key: "p_vending", x: 25.4, y: 6.6 }, { key: "p_barrel", x: 11.3, y: 6.5 }, { key: "p_barrel", x: 12.1, y: 6.9 },
  { key: "p_crate", x: 17.2, y: 6.6 }, { key: "p_bench", x: 9, y: 11.6 }, { key: "p_sign", x: 14.2, y: 13.4 },
  { key: "p_bush", x: 4.6, y: 5.6 }, { key: "p_bush", x: 24.2, y: 13.6 }, { key: "p_bush", x: 18.8, y: 15.2 },
  { key: "c_hero.front", x: 14.8, y: 9.6 }, { key: "c_npc.front", x: 20.6, y: 7.6 },
  { key: "c_slime", x: 8.2, y: 14.2 }, { key: "c_crab", x: 22.4, y: 11.2 },
];
const lights = [
  { x: 13.6, y: 4.9, color: 0xffb46a, radius: 210, intensity: 0.95 },
  { x: 3.9, y: 12.3, color: 0xffb46a, radius: 190, intensity: 0.9 },
  { x: 25.4, y: 5.6, color: 0x6fe6d6, radius: 110, intensity: 0.7 },
  { x: 20.6, y: 4.6, color: 0xffd9a0, radius: 150, intensity: 0.75 },
  { x: 7.3, y: 5.2, color: 0xffc070, radius: 100, intensity: 0.55 },
];
const AMBIENT = Number(params.get("amb") ?? 0x7d7ab8);

class Main extends Phaser.Scene {
  private rt!: Phaser.GameObjects.RenderTexture;

  preload() {
    for (const k of KEYS) this.load.image(k, `assets/${k}.png`);
  }

  create() {
    const pixelsOf = (key: string) => {
      const src = this.textures.get(key).getSourceImage() as HTMLImageElement;
      const c = document.createElement("canvas");
      c.width = src.width;
      c.height = src.height;
      const g = c.getContext("2d")!;
      g.drawImage(src, 0, 0);
      return { size: src.width, pixels: g.getImageData(0, 0, src.width, src.height).data };
    };
    const mats = [
      { ...pixelsOf("t_dirt"), priority: 1, edge: "soft" as const },
      { ...pixelsOf("t_pavement"), priority: 2, edge: "hard" as const },
      { ...pixelsOf("t_grass"), priority: 3, edge: "soft" as const },
    ];
    const cells = new Uint8Array(MW * MH);
    rows.forEach((row, y) => [...row].forEach((ch, x) => (cells[y * MW + x] = Number(ch))));
    const t0 = performance.now();
    const baked = bakeTerrain({ w: MW, h: MH, cells, tile: TILE, materials: mats });
    (window as any).__bakeMs = performance.now() - t0;
    const canvas = document.createElement("canvas");
    canvas.width = baked.w;
    canvas.height = baked.h;
    canvas.getContext("2d")!.putImageData(new ImageData(baked.data as any, baked.w, baked.h), 0, 0);
    this.textures.addCanvas("terrain", canvas);
    this.add.image(0, 0, "terrain").setOrigin(0).setDepth(0);

    // 기울인 그림자 (빛은 왼쪽 위)
    const shadowKey = (key: string) => {
      const sk = `shadow:${key}`;
      if (this.textures.exists(sk)) return sk;
      const src = this.textures.get(key).getSourceImage() as HTMLImageElement;
      const kx = 0.55, ky = 0.32, w = src.width, h = src.height;
      const c = document.createElement("canvas");
      c.width = Math.ceil(w + h * kx);
      c.height = Math.ceil(h * ky) + 1;
      const g = c.getContext("2d")!;
      g.setTransform(1, 0, -kx, -ky, h * kx, h * ky);
      g.drawImage(src, 0, 0);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = "source-in";
      g.fillStyle = "#120a26";
      g.fillRect(0, 0, c.width, c.height);
      this.textures.addCanvas(sk, c);
      return sk;
    };
    for (const e of ents) {
      const x = Math.round(e.x * TILE), y = Math.round(e.y * TILE);
      const img = this.add.image(x, y, e.key).setOrigin(0.5, 1).setDepth(y);
      this.add.image(x - img.width / 2, y - 2, shadowKey(e.key)).setOrigin(0, 0).setDepth(1).setAlpha(0.34);
    }

    const cam = this.cameras.main;
    cam.setZoom(ZOOM);
    cam.setBounds(0, 0, MW * TILE, MH * TILE);
    cam.centerOn(15 * TILE, 9.2 * TILE);

    if (LIT) {
      const gc = document.createElement("canvas");
      gc.width = gc.height = 256;
      const gg = gc.getContext("2d")!;
      const grad = gg.createRadialGradient(128, 128, 0, 128, 128, 128);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.25, "rgba(255,255,255,0.62)");
      grad.addColorStop(0.6, "rgba(255,255,255,0.18)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      gg.fillStyle = grad;
      gg.fillRect(0, 0, 256, 256);
      this.textures.addCanvas("glow", gc);
      this.textures.get("glow").setFilter(Phaser.Textures.FilterMode.LINEAR);

      const vw = Math.ceil(this.scale.width / ZOOM) + 2, vh = Math.ceil(this.scale.height / ZOOM) + 2;
      this.rt = this.add.renderTexture(0, 0, vw, vh).setOrigin(0).setDepth(9000);
      this.rt.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
      this.rt.setBlendMode(Phaser.BlendModes.MULTIPLY);
      for (const l of lights)
        this.add
          .image(l.x * TILE, l.y * TILE, "glow")
          .setDepth(9001)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(l.color)
          .setAlpha(0.3 * l.intensity)
          .setScale((l.radius * 0.9) / 128);

      const cm = cam.filters.internal.addColorMatrix();
      cm.colorMatrix.saturate(0.12);
      cm.colorMatrix.contrast(0.08, true);
      const pf = cam.filters.internal.addParallelFilters();
      pf.top.addThreshold(0.62, 1);
      pf.top.addBlur(1, 3, 3, 1.2);
      pf.blend.blendMode = Phaser.BlendModes.ADD;
      pf.blend.amount = 0.55;
      cam.filters.external.addVignette(0.5, 0.5, 0.92, 0.3);
    }
    this.time.delayedCall(600, () => ((window as any).__ready = true));
  }

  update() {
    if (!this.rt) return;
    const v = this.cameras.main.worldView;
    this.rt.setPosition(v.x, v.y);
    this.rt.clear();
    this.rt.fill(AMBIENT);
    for (const l of lights)
      this.rt.stamp("glow", undefined, l.x * TILE - v.x, l.y * TILE - v.y, {
        tint: l.color,
        alpha: l.intensity,
        scale: l.radius / 128,
        blendMode: Phaser.BlendModes.ADD,
      });
    this.rt.render();
  }
}

new Phaser.Game({
  type: Phaser.WEBGL,
  parent: "game",
  backgroundColor: "#0b0b10",
  pixelArt: true,
  scale: { mode: Phaser.Scale.RESIZE, width: 1280, height: 720 },
  scene: Main,
});
