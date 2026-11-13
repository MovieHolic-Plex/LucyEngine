import Phaser from "phaser";
import { hexToRgb, type Asset, type Material, type Project } from "@age/model";
import type { BakeMaterial } from "../terrain/bake";

export interface TexRef {
  key: string;
  /** 프레임 시트로 올라갔는가. 아니면 그림 한 장이다. */
  sheet: boolean;
  /** 실제 그림이 아니라 임시 상자다. */
  placeholder: boolean;
  w: number;
  h: number;
}

function hash(x: number, y: number): number {
  let n = (x * 374761393 + y * 668265263) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** 에셋 그림을 받아 Phaser 텍스처로 올리고, 없는 동안 쓸 임시 그림과 그림자·바닥 무늬를 만든다. */
export class TextureStore {
  private loading = new Set<string>();
  private attempts = new Map<string, number>();
  private pixelCache = new Map<string, { size: number; pixels: Uint8ClampedArray }>();
  /** 그림이 새로 올라올 때마다 불린다. */
  onLoaded: () => void = () => {};

  constructor(private scene: Phaser.Scene, private assetUrl: (file: string) => string) {}

  get pending(): number {
    return this.loading.size;
  }

  private frameSize(asset: Asset): { w: number; h: number } {
    return asset.frames ? { w: asset.frames.frameW, h: asset.frames.frameH } : { w: asset.w, h: asset.h };
  }

  private realKey(asset: Asset): string {
    return asset.frames ? `${asset.file}#${asset.frames.frameW}x${asset.frames.frameH}` : asset.file!;
  }

  /** 에셋의 텍스처. 아직 못 받았으면 받기 시작하고 임시 그림을 돌려준다. */
  ref(asset: Asset | undefined): TexRef {
    if (!asset) return this.placeholder("missing", 24, 24, "#c0407a");
    const size = this.frameSize(asset);
    if (!asset.file) return this.placeholder(asset.id, size.w, size.h, asset.color);
    const key = this.realKey(asset);
    const textures = this.scene.textures;
    if (textures.exists(key)) return { key, sheet: !!asset.frames, placeholder: false, w: size.w, h: size.h };
    if (!this.loading.has(key)) {
      this.loading.add(key);
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        this.loading.delete(key);
        if (!textures.exists(key)) {
          if (asset.frames) textures.addSpriteSheet(key, img, { frameWidth: asset.frames.frameW, frameHeight: asset.frames.frameH });
          else textures.addImage(key, img);
        }
        this.onLoaded();
      };
      img.onerror = () => {
        // 한 번 실패한 그림이 끝까지 임시 상자로 남지 않게, 간격을 늘려 가며 계속 다시 받아 본다
        const n = (this.attempts.get(key) ?? 0) + 1;
        this.attempts.set(key, n);
        setTimeout(() => {
          this.loading.delete(key);
          this.onLoaded();
        }, Math.min(30_000, 500 * 2 ** n));
      };
      img.src = this.assetUrl(asset.file);
    }
    return this.placeholder(asset.id, size.w, size.h, asset.color);
  }

  private placeholder(id: string, w: number, h: number, color: string): TexRef {
    const key = `ph:${w}x${h}:${color}`;
    if (!this.scene.textures.exists(key)) {
      const c = document.createElement("canvas");
      c.width = Math.max(2, w);
      c.height = Math.max(2, h);
      const g = c.getContext("2d")!;
      const [r, gr, b] = hexToRgb(color);
      g.fillStyle = `rgba(${r},${gr},${b},0.72)`;
      g.fillRect(0, 0, c.width, c.height);
      // 빗금
      g.fillStyle = `rgba(255,255,255,0.16)`;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if ((x + y) % 6 < 2) g.fillRect(x, y, 1, 1);
      g.strokeStyle = `rgba(${r * 0.45},${gr * 0.45},${b * 0.45},1)`;
      g.lineWidth = 2;
      g.strokeRect(1, 1, c.width - 2, c.height - 2);
      this.scene.textures.addCanvas(key, c);
    }
    return { key, sheet: false, placeholder: true, w, h };
  }

  /** 스프라이트 윤곽을 오른쪽 아래로 눕힌 그림자. */
  shadow(ref: TexRef, frame?: number): string {
    const key = `shadow:${ref.key}:${frame ?? 0}`;
    const textures = this.scene.textures;
    if (textures.exists(key)) return key;
    const f = textures.getFrame(ref.key, ref.sheet ? frame ?? 0 : undefined);
    const src = f.source.image as CanvasImageSource;
    const w = f.cutWidth, h = f.cutHeight;
    const kx = 0.55, ky = 0.32;
    const c = document.createElement("canvas");
    c.width = Math.ceil(w + h * kx);
    c.height = Math.ceil(h * ky) + 1;
    const g = c.getContext("2d")!;
    g.setTransform(1, 0, -kx, -ky, h * kx, h * ky);
    g.drawImage(src, f.cutX, f.cutY, w, h, 0, 0, w, h);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = "#120a26";
    g.fillRect(0, 0, c.width, c.height);
    textures.addCanvas(key, c);
    return key;
  }

  /** 발밑에 까는 둥근 그림자 (캐릭터용). */
  blob(w: number): string {
    const bw = Math.max(8, Math.round(w)), bh = Math.max(4, Math.round(w * 0.42));
    const key = `blob:${bw}`;
    if (!this.scene.textures.exists(key)) {
      const c = document.createElement("canvas");
      c.width = bw;
      c.height = bh;
      const g = c.getContext("2d")!;
      g.fillStyle = "#120a26";
      for (let y = 0; y < bh; y++)
        for (let x = 0; x < bw; x++) {
          const nx = (x + 0.5 - bw / 2) / (bw / 2), ny = (y + 0.5 - bh / 2) / (bh / 2);
          if (nx * nx + ny * ny <= 1) g.fillRect(x, y, 1, 1);
        }
      this.scene.textures.addCanvas(key, c);
    }
    return key;
  }

  /** 재질의 바닥 무늬 화소. 그림이 없으면 대표색에 옅은 얼룩을 넣어 만든다. */
  materialPixels(material: Material, project: Project): { size: number; pixels: Uint8ClampedArray; sig: string } {
    const asset = material.asset ? project.assets[material.asset] : undefined;
    if (asset?.file) {
      const ref = this.ref(asset);
      if (!ref.placeholder) {
        let hit = this.pixelCache.get(ref.key);
        if (!hit) {
          const img = this.scene.textures.get(ref.key).getSourceImage() as HTMLImageElement;
          const c = document.createElement("canvas");
          c.width = img.width;
          c.height = img.height;
          const g = c.getContext("2d", { willReadFrequently: true })!;
          g.drawImage(img, 0, 0);
          // 정사각 무늬만 쓴다. 아니면 짧은 변에 맞춘다.
          const size = Math.min(img.width, img.height);
          hit = { size, pixels: g.getImageData(0, 0, size, size).data };
          this.pixelCache.set(ref.key, hit);
        }
        return { ...hit, sig: ref.key };
      }
    }
    const key = `flat:${material.color}`;
    let hit = this.pixelCache.get(key);
    if (!hit) {
      const size = 24;
      const [r, g, b] = hexToRgb(material.color);
      const pixels = new Uint8ClampedArray(size * size * 4);
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const n = hash(x >> 1, y >> 1) > 0.82 ? 0.9 : hash(x + 31, y + 17) > 0.93 ? 1.08 : 1;
          const i = (y * size + x) * 4;
          pixels[i] = r * n; pixels[i + 1] = g * n; pixels[i + 2] = b * n; pixels[i + 3] = 255;
        }
      hit = { size, pixels };
      this.pixelCache.set(key, hit);
    }
    return { ...hit, sig: key };
  }

  /** 바닥 굽기에 넘길 재질 목록과, 바뀌었는지 알아보는 서명. */
  bakeMaterials(project: Project, ids: string[]): { materials: BakeMaterial[]; sig: string } {
    const materials: BakeMaterial[] = [];
    const sigs: string[] = [];
    for (const id of ids) {
      const m = project.materials[id] ?? ({ id, name: id, asset: null, color: "#c0407a", walkable: true, priority: 0, edge: "hard" } as Material);
      const px = this.materialPixels(m, project);
      materials.push({ pixels: px.pixels, size: px.size, priority: m.priority, edge: m.edge });
      sigs.push(`${id}|${px.sig}|${m.priority}|${m.edge}`);
    }
    return { materials, sig: sigs.join(";") };
  }
}
