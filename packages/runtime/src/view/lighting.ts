import Phaser from "phaser";
import { hexToInt, type Post } from "@age/model";

export interface LightDraw {
  /** 화소. */
  x: number;
  y: number;
  radius: number;
  color: number;
  intensity: number;
}

const GLOW = "age:glow";

/**
 * 조명: 화면 크기 렌더 텍스처에 주변광을 칠하고 점광원을 더한 뒤 장면 위에 곱한다.
 * 그 위에 광원마다 빛 번짐을 더하고, 카메라 필터로 색 보정·블룸·비네트를 건다.
 */
export class Lighting {
  private rt: Phaser.GameObjects.RenderTexture;
  private glows: Phaser.GameObjects.Image[] = [];
  private postSig = "";

  constructor(private scene: Phaser.Scene) {
    if (!scene.textures.exists(GLOW)) {
      const c = document.createElement("canvas");
      c.width = c.height = 256;
      const g = c.getContext("2d")!;
      const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.25, "rgba(255,255,255,0.62)");
      grad.addColorStop(0.6, "rgba(255,255,255,0.18)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 256, 256);
      scene.textures.addCanvas(GLOW, c);
      scene.textures.get(GLOW).setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
    this.rt = scene.add.renderTexture(0, 0, 64, 64).setOrigin(0).setDepth(900000).setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.rt.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }

  /** view 는 화면에 보이는 월드 영역(화소)이다. */
  update(view: { x: number; y: number; w: number; h: number }, ambient: string, lights: LightDraw[], enabled: boolean): void {
    const lit = enabled && (ambient.toLowerCase() !== "#ffffff" || lights.length > 0);
    this.rt.setVisible(lit);
    if (!lit) {
      for (const g of this.glows) g.setVisible(false);
      return;
    }
    const w = Math.max(8, Math.ceil(view.w) + 2), h = Math.max(8, Math.ceil(view.h) + 2);
    if (Math.abs(this.rt.width - w) > 1 || Math.abs(this.rt.height - h) > 1) this.rt.resize(w, h);
    const ox = Math.floor(view.x), oy = Math.floor(view.y);
    this.rt.setPosition(ox, oy);
    this.rt.clear();
    this.rt.fill(hexToInt(ambient));
    for (const l of lights)
      this.rt.stamp(GLOW, undefined, l.x - ox, l.y - oy, { tint: l.color, alpha: Math.min(1, l.intensity), scale: l.radius / 128, blendMode: Phaser.BlendModes.ADD });
    this.rt.render();

    while (this.glows.length < lights.length) this.glows.push(this.scene.add.image(0, 0, GLOW).setDepth(900001).setBlendMode(Phaser.BlendModes.ADD));
    this.glows.forEach((g, i) => {
      const l = lights[i];
      if (!l) return void g.setVisible(false);
      g.setVisible(true).setPosition(l.x, l.y).setTint(l.color).setAlpha(Math.min(0.5, 0.3 * l.intensity)).setScale((l.radius * 0.9) / 128);
    });
  }

  /** 카메라 필터를 후처리 설정에 맞춘다. 설정이 바뀌었을 때만 다시 만든다. */
  setPost(cam: Phaser.Cameras.Scene2D.Camera, post: Post, enabled: boolean): void {
    const sig = enabled ? `${post.bloom}|${post.vignette}|${post.saturation}|${post.contrast}` : "off";
    if (sig === this.postSig) return;
    this.postSig = sig;
    cam.filters.internal.clear();
    cam.filters.external.clear();
    if (!enabled) return;
    if (post.saturation !== 0 || post.contrast !== 0) {
      const cm = cam.filters.internal.addColorMatrix();
      if (post.saturation !== 0) cm.colorMatrix.saturate(post.saturation);
      if (post.contrast !== 0) cm.colorMatrix.contrast(post.contrast, true);
    }
    if (post.bloom > 0) {
      const pf = cam.filters.internal.addParallelFilters();
      pf.top.addThreshold(0.62, 1);
      pf.top.addBlur(1, 3, 3, 1.2);
      pf.blend.blendMode = Phaser.BlendModes.ADD;
      pf.blend.amount = post.bloom * 1.3;
    }
    if (post.vignette > 0) cam.filters.external.addVignette(0.5, 0.5, 0.95, post.vignette);
  }

  destroy(): void {
    this.rt.destroy();
    for (const g of this.glows) g.destroy();
    this.glows = [];
  }
}
