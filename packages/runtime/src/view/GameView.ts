import Phaser from "phaser";
import { type Project, type Scene, type Entity, type Asset, type Prefab, hexToInt, resolveProps, isCharacterKind, frameSize } from "@age/model";
import { bakeTerrain } from "../terrain/bake";
import { createWorld, step, getPlayer, currentLine, STEP } from "../sim/world";
import { findInteractable } from "../sim/script";
import { ATTACK_TIME } from "../sim/combat";
import type { Actor, SimEvent, World } from "../sim/types";
import { TextureStore, type TexRef } from "./textures";
import { Lighting, type LightDraw } from "./lighting";
import { PlayInput } from "./input";
import { Hud } from "./hud";

export interface GameViewOptions {
  /** 에셋 파일 이름을 받아 주소를 돌려준다. */
  assetUrl: (file: string) => string;
  /** 화면에 보이지 않는 캡처 전용 인스턴스. 크기를 직접 정하고, 탭이 뒤에 있어도 돈다. */
  offscreen?: { width: number; height: number };
}

export interface Camera {
  /** 화면 가운데가 보는 월드 위치 (화소). */
  x: number;
  y: number;
  zoom: number;
}

export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface EntityView {
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image | null;
  entity: Entity;
  prefab: Prefab | undefined;
  asset: Asset | undefined;
  ref: TexRef;
  previewKey: string;
}

interface Particle {
  img: Phaser.GameObjects.Rectangle;
  vx: number;
  vy: number;
  life: number;
}

const DEPTH_TERRAIN = -1_000_000;
const DEPTH_SHADOW = -500_000;
const DEPTH_FX = 800_000;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

class ViewScene extends Phaser.Scene {
  store!: TextureStore;
  lighting!: Lighting;
  doc: Project | null = null;
  sceneId = "";
  camState: Camera = { x: 0, y: 0, zoom: 2 };
  insets = { left: 0, right: 0, top: 0, bottom: 0 };
  lightingOn = true;
  mode: "edit" | "play" = "edit";
  world: World | null = null;
  input2 = new PlayInput();
  hud!: Hud;
  frames = 0;
  onFrame: (() => void) | null = null;
  onPlayEvent: ((e: SimEvent) => void) | null = null;
  preview = new Map<string, { x: number; y: number }>();

  private views = new Map<string, EntityView>();
  private dirty = true;
  private terrainKey = "";
  private terrainCanvas: HTMLCanvasElement | null = null;
  private terrainImage: Phaser.GameObjects.Image | null = null;
  private terrainPrev: { terrain: string[]; sig: string; w: number; h: number } | null = null;
  private acc = 0;
  private slash: Phaser.GameObjects.Image | null = null;
  private orbs: Phaser.GameObjects.Arc[] = [];
  private particles: Particle[] = [];
  private flash = new Map<string, number>();
  private playCam = { x: 0, y: 0, ready: false };
  private restartKey = (e: KeyboardEvent) => {
    if (this.mode === "play" && e.code === "KeyR" && !(e.target as HTMLElement)?.closest?.("input,textarea")) this.startPlay();
  };

  constructor(private opts: GameViewOptions, private hudParent: HTMLElement | null, private ready: () => void) {
    super("view");
  }

  create(): void {
    this.store = new TextureStore(this, this.opts.assetUrl);
    this.store.onLoaded = () => (this.dirty = true);
    this.lighting = new Lighting(this);
    if (this.hudParent) this.hud = new Hud(this.hudParent);
    window.addEventListener("keydown", this.restartKey);
    this.events.once(Phaser.Scenes.Events.DESTROY, () => {
      window.removeEventListener("keydown", this.restartKey);
      this.input2.detach();
      this.hud?.destroy();
    });
    this.ready();
  }

  get tile(): number {
    return this.doc?.style.tile ?? 24;
  }

  get sceneData(): Scene | null {
    return this.doc?.scenes[this.sceneId] ?? null;
  }

  setDoc(doc: Project, sceneId?: string): void {
    const id = sceneId ?? (this.doc && this.doc.scenes[this.sceneId] ? this.sceneId : doc.startScene);
    this.doc = doc;
    this.sceneId = doc.scenes[id] ? id : doc.startScene;
    this.dirty = true;
  }

  markDirty(): void {
    this.dirty = true;
  }

  get idle(): boolean {
    return !this.dirty && this.store.pending === 0;
  }

  // ── 카메라 ────────────────────────────────────────────────

  /** 떠 있는 패널을 뺀 영역의 가운데가 화면 가운데에서 얼마나 벗어나 있는가 (화면 화소). */
  private freeOffset(): { x: number; y: number } {
    return { x: (this.insets.left - this.insets.right) / 2, y: (this.insets.top - this.insets.bottom) / 2 };
  }

  private applyCamera(): void {
    const cam = this.cameras.main;
    cam.setZoom(this.camState.zoom);
    cam.centerOn(this.camState.x, this.camState.y);
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const { width, height } = this.scale;
    return { x: this.camState.x + (sx - width / 2) / this.camState.zoom, y: this.camState.y + (sy - height / 2) / this.camState.zoom };
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const { width, height } = this.scale;
    return { x: (wx - this.camState.x) * this.camState.zoom + width / 2, y: (wy - this.camState.y) * this.camState.zoom + height / 2 };
  }

  /** 월드의 한 점이 빈 영역 가운데에 오도록 카메라를 놓는다. */
  centerFreeOn(wx: number, wy: number): void {
    const off = this.freeOffset();
    this.camState.x = wx - off.x / this.camState.zoom;
    this.camState.y = wy - off.y / this.camState.zoom;
  }

  fitScene(): void {
    const s = this.sceneData;
    if (!s) return;
    const { width, height } = this.scale;
    const fw = Math.max(120, width - this.insets.left - this.insets.right - 48), fh = Math.max(120, height - this.insets.top - this.insets.bottom - 48);
    const z = Math.min(fw / (s.w * this.tile), fh / (s.h * this.tile));
    this.camState.zoom = z >= 1 ? Math.max(1, Math.min(4, Math.floor(z * 2) / 2)) : Math.max(0.25, z);
    this.centerFreeOn((s.w * this.tile) / 2, (s.h * this.tile) / 2);
  }

  // ── 문서 → 화면 ───────────────────────────────────────────

  private syncTerrain(): void {
    const doc = this.doc!, s = this.sceneData!;
    const ids = Object.keys(doc.materials).sort();
    const { materials, sig } = this.store.bakeMaterials(doc, ids);
    const index = new Map(ids.map((id, i) => [id, i]));
    const prev = this.terrainPrev;
    const tile = this.tile;
    const sizeChanged = !prev || prev.w !== s.w || prev.h !== s.h || !this.terrainCanvas;
    if (!sizeChanged && prev!.sig === sig && prev!.terrain === s.terrain) return;

    const cells = new Uint16Array(s.w * s.h);
    for (let i = 0; i < cells.length; i++) cells[i] = index.get(s.terrain[i]) ?? 0;
    const input = { w: s.w, h: s.h, cells, tile, materials };

    if (sizeChanged) {
      this.terrainImage?.destroy();
      if (this.terrainKey && this.textures.exists(this.terrainKey)) this.textures.remove(this.terrainKey);
      this.terrainCanvas = document.createElement("canvas");
      this.terrainCanvas.width = s.w * tile;
      this.terrainCanvas.height = s.h * tile;
      this.terrainKey = `age:terrain:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
      this.textures.addCanvas(this.terrainKey, this.terrainCanvas);
      this.terrainImage = this.add.image(0, 0, this.terrainKey).setOrigin(0).setDepth(DEPTH_TERRAIN);
    }
    const g = this.terrainCanvas!.getContext("2d")!;
    let region = { x: 0, y: 0, w: s.w, h: s.h };
    if (!sizeChanged && prev!.sig === sig) {
      // 바뀐 칸을 감싸는 상자만 다시 굽는다 (가장자리가 이웃 칸으로 번지므로 한 칸 넓힌다)
      let x0 = s.w, y0 = s.h, x1 = -1, y1 = -1;
      for (let i = 0; i < s.terrain.length; i++)
        if (s.terrain[i] !== prev!.terrain[i]) {
          const x = i % s.w, y = (i / s.w) | 0;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      if (x1 >= 0) {
        x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(s.w - 1, x1 + 1); y1 = Math.min(s.h - 1, y1 + 1);
        region = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
      }
    }
    const baked = bakeTerrain(input, region);
    g.putImageData(new ImageData(baked.data as unknown as Uint8ClampedArray<ArrayBuffer>, baked.w, baked.h), region.x * tile, region.y * tile);
    (this.textures.get(this.terrainKey) as Phaser.Textures.CanvasTexture).refresh();
    this.terrainPrev = { terrain: s.terrain, sig, w: s.w, h: s.h };
  }

  private syncEntities(): void {
    const doc = this.doc!, s = this.sceneData!;
    const tile = this.tile;
    for (const [id, v] of this.views)
      if (!s.entities[id]) {
        v.sprite.destroy();
        v.shadow?.destroy();
        this.views.delete(id);
      }
    for (const e of Object.values(s.entities)) {
      const prefab = doc.prefabs[e.prefab];
      const asset = prefab ? doc.assets[prefab.asset] : undefined;
      const ref = this.store.ref(asset);
      const pv = this.preview.get(e.id);
      const previewKey = pv ? `${pv.x},${pv.y}` : "";
      let v = this.views.get(e.id);
      if (v && v.entity === e && v.prefab === prefab && v.asset === asset && v.ref.key === ref.key && v.previewKey === previewKey) continue;
      if (!v) {
        v = { sprite: this.add.image(0, 0, ref.key).setOrigin(0.5, 1), shadow: null, entity: e, prefab, asset, ref, previewKey };
        this.views.set(e.id, v);
      }
      const refChanged = v.ref.key !== ref.key || !v.shadow;
      v.entity = e; v.prefab = prefab; v.asset = asset; v.ref = ref; v.previewKey = previewKey;
      const props = resolveProps(doc, e);
      const x = Math.round((pv?.x ?? e.x) * tile), y = Math.round((pv?.y ?? e.y) * tile);
      v.sprite.setTexture(ref.key, ref.sheet ? 0 : undefined).setPosition(x, y).setFlipX(!!props.flip).setAlpha(1).setVisible(true).clearTint();
      v.sprite.setDepth(y - (asset?.sortOffset ?? 0));
      const isChar = isCharacterKind(prefab?.kind);
      if (refChanged) {
        v.shadow?.destroy();
        v.shadow = isChar
          ? this.add.image(0, 0, this.store.blob(ref.w * 0.62)).setOrigin(0.5, 0.5)
          : this.add.image(0, 0, this.store.shadow(ref)).setOrigin(0, 0);
        v.shadow.setDepth(DEPTH_SHADOW).setAlpha(isChar ? 0.3 : 0.34);
      }
      if (isChar) v.shadow!.setPosition(x, y - 1);
      else v.shadow!.setPosition(x - ref.w / 2, y - 2);
      v.shadow!.setVisible(true);
    }
  }

  private gatherLights(time: number): LightDraw[] {
    const doc = this.doc!, s = this.sceneData!;
    const tile = this.tile;
    const out: LightDraw[] = [];
    const push = (id: string, x: number, y: number, l: { color: string; radius: number; intensity: number; flicker?: boolean }) => {
      let k = 1;
      if (l.flicker) {
        const p = hash(id) * 100;
        k = 0.9 + 0.06 * Math.sin(time * 11 + p) + 0.04 * Math.sin(time * 23.7 + p * 2);
      }
      out.push({ x, y, radius: l.radius * tile * (0.97 + 0.03 * k), color: hexToInt(l.color), intensity: l.intensity * k });
    };
    for (const l of Object.values(s.lights)) push(l.id, l.x * tile, (l.y - (l.height ?? 0)) * tile, l);
    for (const e of Object.values(s.entities)) {
      const light = resolveProps(doc, e).light;
      if (!light) continue;
      const v = this.views.get(e.id);
      const actor = this.world?.actors.find((a) => a.id === e.id);
      if (actor && !actor.alive) continue;
      const pv = this.preview.get(e.id);
      const x = actor ? actor.x : (pv?.x ?? e.x) * tile, y = actor ? actor.y : (pv?.y ?? e.y) * tile;
      const up = light.height !== undefined ? light.height * tile : (v?.ref.h ?? tile) * 0.78;
      push(e.id, x, y - up, light);
    }
    if (this.world) for (const p of this.world.projectiles) out.push({ x: p.x, y: p.y, radius: tile * 1.6, color: 0xff9a5a, intensity: 0.8 });
    return out;
  }

  // ── 플레이 ────────────────────────────────────────────────

  startPlay(): void {
    if (!this.doc || !this.sceneData) return;
    this.world = createWorld(this.doc, this.sceneId);
    this.mode = "play";
    this.acc = 0;
    this.flash.clear();
    this.playCam.ready = false;
    this.input2.attach();
    this.hud?.setVisible(true);
    this.dirty = true;
  }

  stopPlay(): void {
    this.world = null;
    this.mode = "edit";
    this.input2.detach();
    this.hud?.setVisible(false);
    this.slash?.setVisible(false);
    for (const o of this.orbs) o.setVisible(false);
    for (const p of this.particles) p.img.destroy();
    this.particles = [];
    // 플레이가 건드린 스프라이트를 문서 상태로 되돌린다
    for (const v of this.views.values()) v.previewKey = "\u0000";
    this.dirty = true;
  }

  private burst(x: number, y: number, color: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 90;
      const img = this.add.rectangle(x, y, 2, 2, color).setDepth(DEPTH_FX);
      this.particles.push({ img, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, life: 0.25 + Math.random() * 0.25 });
    }
  }

  private handleSimEvent(e: SimEvent): void {
    const world = this.world!;
    if (e.type === "hit") {
      this.flash.set(e.target, 0.12);
      this.burst(e.x, e.y, e.target === world.playerId ? 0xff6a7a : 0xfff2c0, 6);
      if (e.target === world.playerId) this.cameras.main.shake(140, 0.004);
    } else if (e.type === "death") this.burst(e.x, e.y - 8, 0xffffff, 12);
    this.onPlayEvent?.(e);
  }

  private frameFor(v: EntityView, a: Actor, time: number): { frame: number | undefined; flip: boolean } {
    const frames = v.asset?.frames;
    if (!v.ref.sheet || !frames) return { frame: undefined, flip: a.facing === "left" };
    const want = a.facing === "down" ? "down" : a.facing === "up" ? "up" : "side";
    let row = frames.rows.indexOf(want);
    if (row < 0) row = 0;
    const col = a.moving && frames.perRow > 1 ? 1 + (Math.floor(time * 8 + hash(a.id) * 4) % (frames.perRow - 1)) : 0;
    return { frame: row * frames.perRow + col, flip: a.facing === "left" };
  }

  private syncWorld(time: number, dt: number): void {
    const world = this.world!;
    for (const a of world.actors) {
      const v = this.views.get(a.id);
      if (!v) continue;
      const x = Math.round(a.x), y = Math.round(a.y);
      const { frame, flip } = this.frameFor(v, a, time);
      if (frame !== undefined) v.sprite.setFrame(frame);
      v.sprite.setPosition(x, y).setFlipX(flip).setDepth(y - (v.asset?.sortOffset ?? 0));
      v.shadow?.setPosition(x, y - 1);
      const f = this.flash.get(a.id) ?? 0;
      if (f > 0) {
        this.flash.set(a.id, f - dt);
        v.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      } else v.sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      if (!a.alive) {
        const k = Math.max(0, 1 - a.deadFor / 0.45);
        v.sprite.setAlpha(k);
        v.shadow?.setAlpha(0.3 * k);
        v.sprite.setVisible(k > 0);
        v.shadow?.setVisible(k > 0);
      } else v.sprite.setAlpha(a.invuln > 0 && f <= 0 && Math.floor(time * 16) % 2 === 0 ? 0.45 : 1);
    }

    // 휘두르는 궤적
    const p = getPlayer(world);
    if (p && p.attackTimer > 0) {
      if (!this.slash) {
        const c = document.createElement("canvas");
        c.width = c.height = 40;
        const g = c.getContext("2d")!;
        g.imageSmoothingEnabled = false;
        g.strokeStyle = "#ffffff";
        g.lineWidth = 5;
        g.lineCap = "round";
        g.beginPath();
        g.arc(8, 20, 24, -0.95, 0.95);
        g.stroke();
        g.strokeStyle = "rgba(255,236,170,0.9)";
        g.lineWidth = 2;
        g.beginPath();
        g.arc(8, 20, 20, -0.8, 0.8);
        g.stroke();
        this.textures.addCanvas("age:slash", c);
        this.slash = this.add.image(0, 0, "age:slash").setOrigin(0.2, 0.5);
      }
      const angle = { right: 0, down: 90, left: 180, up: 270 }[p.facing];
      const t = 1 - p.attackTimer / ATTACK_TIME;
      this.slash.setVisible(true).setPosition(Math.round(p.x), Math.round(p.y - 12)).setAngle(angle - 35 + t * 70).setAlpha(1 - t * 0.7).setDepth(DEPTH_FX);
    } else this.slash?.setVisible(false);

    while (this.orbs.length < world.projectiles.length) this.orbs.push(this.add.circle(0, 0, 3, 0xffc27a).setDepth(DEPTH_FX));
    this.orbs.forEach((o, i) => {
      const pr = world.projectiles[i];
      if (!pr) return void o.setVisible(false);
      o.setVisible(true).setPosition(Math.round(pr.x), Math.round(pr.y));
    });
  }

  private updatePlayCamera(dt: number): void {
    const world = this.world!, p = getPlayer(world);
    const { width, height } = this.scale;
    const fh = height - this.insets.top - this.insets.bottom, fw = width - this.insets.left - this.insets.right;
    this.camState.zoom = Math.max(1, Math.min(6, Math.round(Math.min(fw / 520, fh / 300))));
    const z = this.camState.zoom;
    const target = world.cameraTarget ?? (p ? { x: p.x, y: p.y - 14 } : { x: world.width / 2, y: world.height / 2 });
    // 장면 밖이 보이지 않게 가둔다. 장면이 화면보다 작으면 가운데 둔다.
    const halfW = fw / 2 / z, halfH = fh / 2 / z;
    const clamp = (v: number, half: number, size: number) => (size <= half * 2 ? size / 2 : Math.max(half, Math.min(size - half, v)));
    const tx = clamp(target.x, halfW, world.width), ty = clamp(target.y, halfH, world.height);
    if (!this.playCam.ready) {
      this.playCam = { x: tx, y: ty, ready: true };
    } else {
      const k = 1 - Math.exp(-(world.cameraTarget ? 4 : 9) * dt);
      this.playCam.x += (tx - this.playCam.x) * k;
      this.playCam.y += (ty - this.playCam.y) * k;
    }
    this.centerFreeOn(this.playCam.x, this.playCam.y);
  }

  // ── 매 프레임 ─────────────────────────────────────────────

  update(_t: number, deltaMs: number): void {
    this.frames++;
    const dt = Math.min(0.1, deltaMs / 1000);
    const time = this.time.now / 1000;
    const s = this.sceneData;
    if (!this.doc || !s) return;

    if (this.dirty) {
      this.dirty = false;
      this.syncTerrain();
      this.syncEntities();
    }

    if (this.mode === "play" && this.world) {
      const world = this.world;
      this.acc += dt;
      let guard = 0;
      while (this.acc >= STEP && guard++ < 6) {
        this.acc -= STEP;
        // 대사 글자가 나오는 중에 누르면 넘기지 않고 글자를 마저 보여 준다
        if (world.dialogue && this.hud?.typing && this.input2.peekPress()) {
          this.hud.finishTyping();
          this.input2.clearPress();
        }
        for (const e of step(world, this.input2.take())) this.handleSimEvent(e);
      }
      if (guard >= 6) this.acc = 0;
      this.syncWorld(time, dt);
      this.updatePlayCamera(dt);
      const p = getPlayer(world);
      const target = world.dialogue || world.running.length ? null : findInteractable(world);
      let prompt: { x: number; y: number } | null = null;
      if (target) {
        const v = this.views.get(target.id);
        const sp = this.worldToScreen(target.x, target.y - (v?.ref.h ?? this.tile) - 4);
        // worldToScreen 은 이번 프레임 카메라 기준이다
        prompt = sp;
      }
      this.hud?.update({ hp: p?.hp ?? 0, maxHp: p?.maxHp ?? 0, line: currentLine(world), prompt, dead: world.status === "dead", insetLeft: this.insets.left, insetRight: this.insets.right }, dt);
    }

    for (const pt of this.particles) {
      pt.life -= dt;
      pt.vy += 260 * dt;
      pt.img.x += pt.vx * dt;
      pt.img.y += pt.vy * dt;
      pt.img.setAlpha(Math.max(0, pt.life * 3));
    }
    if (this.particles.some((pt) => pt.life <= 0)) {
      for (const pt of this.particles) if (pt.life <= 0) pt.img.destroy();
      this.particles = this.particles.filter((pt) => pt.life > 0);
    }

    this.applyCamera();
    const { width, height } = this.scale;
    const z = this.camState.zoom;
    const view = { x: this.camState.x - width / 2 / z, y: this.camState.y - height / 2 / z, w: width / z, h: height / z };
    this.lighting.update(view, s.ambient, this.gatherLights(time), this.lightingOn);
    this.lighting.setPost(this.cameras.main, s.post, this.lightingOn);
    this.onFrame?.();
  }

  // ── 고르기 ────────────────────────────────────────────────

  /** 화면 좌표에 있는 맨 앞의 엔티티. 투명한 화소는 건너뛴다. */
  pick(sx: number, sy: number): string | null {
    const w = this.screenToWorld(sx, sy);
    let best: string | null = null, bestDepth = -Infinity;
    for (const [id, v] of this.views) {
      const sp = v.sprite;
      if (!sp.visible) continue;
      const left = sp.x - v.ref.w / 2, top = sp.y - v.ref.h;
      if (w.x < left || w.x >= left + v.ref.w || w.y < top || w.y >= top + v.ref.h) continue;
      let lx = Math.floor(w.x - left);
      const ly = Math.floor(w.y - top);
      if (sp.flipX) lx = v.ref.w - 1 - lx;
      if (!v.ref.placeholder) {
        const alpha = this.textures.getPixelAlpha(lx, ly, v.ref.key, v.ref.sheet ? 0 : undefined);
        // 작은 대상은 고르기 쉽도록 투명 검사를 느슨하게 한다
        if (alpha !== null && alpha < 20 && v.ref.w * v.ref.h > 900) continue;
      }
      if (sp.depth > bestDepth) { bestDepth = sp.depth; best = id; }
    }
    return best;
  }

  boundsOf(id: string): ScreenRect | null {
    const v = this.views.get(id);
    if (!v) return null;
    const tl = this.worldToScreen(v.sprite.x - v.ref.w / 2, v.sprite.y - v.ref.h);
    return { x: tl.x, y: tl.y, w: v.ref.w * this.camState.zoom, h: v.ref.h * this.camState.zoom };
  }
}

/** 프로젝트 문서를 그리고 플레이하는 화면. 편집기의 뷰포트이자 게임 그 자체다. */
export class GameView {
  private game: Phaser.Game;
  private scene: ViewScene;
  private readyPromise: Promise<void>;
  private pendingDoc: { doc: Project; sceneId?: string } | null = null;
  private isReady = false;
  private fitWhenReady = false;

  constructor(private parent: HTMLElement, private opts: GameViewOptions) {
    let resolve!: () => void;
    this.readyPromise = new Promise((r) => (resolve = r));
    const off = opts.offscreen;
    this.scene = new ViewScene(opts, off ? null : parent, () => {
      this.isReady = true;
      if (this.pendingDoc) this.scene.setDoc(this.pendingDoc.doc, this.pendingDoc.sceneId);
      this.pendingDoc = null;
      if (this.fitWhenReady) this.scene.fitScene();
      resolve();
    });
    this.game = new Phaser.Game({
      type: Phaser.WEBGL,
      parent,
      backgroundColor: "#0c0c11",
      pixelArt: true,
      banner: false,
      audio: { noAudio: true },
      input: { keyboard: false, mouse: false, touch: false, gamepad: false },
      fps: off ? { forceSetTimeOut: true, target: 30 } : undefined,
      render: { antialias: false, roundPixels: true, powerPreference: "high-performance" },
      scale: off ? { mode: Phaser.Scale.NONE, width: off.width, height: off.height } : { mode: Phaser.Scale.RESIZE, width: parent.clientWidth || 800, height: parent.clientHeight || 600 },
      scene: this.scene,
    });
    this.game.canvas.style.imageRendering = "pixelated";
    this.game.canvas.style.display = "block";
  }

  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  /** 문서를 바꾼다. 플레이 중이면 플레이가 끝난 뒤에 반영된다. */
  setDoc(doc: Project, sceneId?: string): void {
    if (!this.isReady) {
      this.pendingDoc = { doc, sceneId };
      return;
    }
    if (this.scene.mode === "play") {
      this.pendingDoc = { doc, sceneId };
      return;
    }
    this.scene.setDoc(doc, sceneId);
  }

  get mode(): "edit" | "play" {
    return this.scene.mode;
  }

  play(): void {
    if (this.isReady) this.scene.startPlay();
  }

  stop(): void {
    if (!this.isReady || this.scene.mode !== "play") return;
    this.scene.stopPlay();
    if (this.pendingDoc) {
      this.scene.setDoc(this.pendingDoc.doc, this.pendingDoc.sceneId);
      this.pendingDoc = null;
    }
  }

  restart(): void {
    if (this.isReady && this.scene.mode === "play") this.scene.startPlay();
  }

  /** 플레이 중인 월드 (테스트·디버그용). */
  get world(): World | null {
    return this.scene.world;
  }

  getCamera(): Camera {
    return { ...this.scene.camState };
  }

  setCamera(cam: Partial<Camera>): void {
    Object.assign(this.scene.camState, cam);
  }

  panBy(dxScreen: number, dyScreen: number): void {
    this.scene.camState.x -= dxScreen / this.scene.camState.zoom;
    this.scene.camState.y -= dyScreen / this.scene.camState.zoom;
  }

  /** 화면의 한 점을 붙잡은 채 확대·축소한다. */
  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.scene.screenToWorld(sx, sy);
    let z = Math.max(0.25, Math.min(8, this.scene.camState.zoom * factor));
    // 정수 배율 근처에서는 달라붙어 화소가 고르게 보인다
    const near = Math.round(z);
    if (near >= 1 && Math.abs(z - near) < 0.06) z = near;
    this.scene.camState.zoom = z;
    const after = this.scene.screenToWorld(sx, sy);
    this.scene.camState.x += before.x - after.x;
    this.scene.camState.y += before.y - after.y;
  }

  fit(): void {
    if (this.isReady) this.scene.fitScene();
    else this.fitWhenReady = true;
  }

  setInsets(insets: Partial<{ left: number; right: number; top: number; bottom: number }>): void {
    Object.assign(this.scene.insets, insets);
  }

  /** 조명과 후처리를 끄면 밝은 작업등 아래에서 편집할 수 있다. */
  setLighting(on: boolean): void {
    this.scene.lightingOn = on;
  }

  get lighting(): boolean {
    return this.scene.lightingOn;
  }

  /** 화면 좌표(캔버스 왼쪽 위 기준) → 타일 좌표. */
  screenToTile(sx: number, sy: number): { x: number; y: number } {
    const w = this.scene.screenToWorld(sx, sy);
    return { x: w.x / this.scene.tile, y: w.y / this.scene.tile };
  }

  tileToScreen(tx: number, ty: number): { x: number; y: number } {
    return this.scene.worldToScreen(tx * this.scene.tile, ty * this.scene.tile);
  }

  /** 타일 한 칸이 화면에서 차지하는 화소 수. */
  get tileScreenSize(): number {
    return this.scene.tile * this.scene.camState.zoom;
  }

  pickEntity(sx: number, sy: number): string | null {
    return this.isReady ? this.scene.pick(sx, sy) : null;
  }

  entityBounds(id: string): ScreenRect | null {
    return this.isReady ? this.scene.boundsOf(id) : null;
  }

  /** 끌어 옮기는 동안 문서를 바꾸지 않고 그림만 옮겨 보인다. null 이면 되돌린다. */
  previewMove(id: string, pos: { x: number; y: number } | null): void {
    if (pos) this.scene.preview.set(id, pos);
    else this.scene.preview.delete(id);
    this.scene.markDirty();
  }

  onFrame(cb: (() => void) | null): void {
    this.scene.onFrame = cb;
  }

  onPlayEvent(cb: ((e: SimEvent) => void) | null): void {
    this.scene.onPlayEvent = cb;
  }

  /** 그림을 모두 받고 화면에 반영될 때까지 기다린다. */
  async settle(timeoutMs = 8000): Promise<boolean> {
    await this.readyPromise;
    const start = performance.now();
    let stable = 0, last = -1;
    while (performance.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 30));
      if (this.scene.idle && this.scene.frames !== last) stable++;
      else if (!this.scene.idle) stable = 0;
      last = this.scene.frames;
      if (stable >= 3) return true;
    }
    return false;
  }

  /** 지금 캔버스에 그려진 그림. */
  snapshot(type: "image/png" | "image/jpeg" = "image/png", quality = 0.9): Promise<string> {
    return new Promise((resolve) => {
      this.game.renderer.snapshot((img) => resolve((img as HTMLImageElement).src), type, quality);
    });
  }

  resize(width: number, height: number): void {
    this.game.scale.resize(width, height);
  }

  destroy(): void {
    this.game.destroy(true);
  }
}

export interface CaptureOptions {
  /** 찍을 구역 (타일). 없으면 장면 전체. */
  region?: { x: number; y: number; w: number; h: number };
  /** 긴 변의 최대 화소 수. */
  maxSize?: number;
  /** 조명과 후처리를 켠 채 찍는다 (기본 켬). */
  lighting?: boolean;
  type?: "image/png" | "image/jpeg";
  sceneId?: string;
}

/** 보이지 않는 화면에 장면을 그려 사진을 찍는다. 사용자가 보는 화면은 건드리지 않는다. */
export class SceneCapturer {
  private host: HTMLDivElement;
  private view: GameView;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(assetUrl: (file: string) => string) {
    this.host = document.createElement("div");
    this.host.setAttribute("aria-hidden", "true");
    this.host.style.cssText = "position:fixed;left:-20000px;top:0;width:640px;height:360px;overflow:hidden;pointer-events:none;";
    document.body.appendChild(this.host);
    this.view = new GameView(this.host, { assetUrl, offscreen: { width: 640, height: 360 } });
  }

  /** 장면(또는 구역)을 찍어 데이터 주소로 돌려준다. */
  capture(doc: Project, opts: CaptureOptions = {}): Promise<{ image: string; width: number; height: number; scale: number }> {
    const run = async () => {
      await this.view.whenReady();
      const scene = doc.scenes[opts.sceneId ?? doc.startScene];
      const tile = doc.style.tile;
      const full = { x: 0, y: 0, w: scene.w, h: scene.h };
      const r = opts.region ?? full;
      const region = { x: Math.max(0, r.x), y: Math.max(0, r.y), w: Math.min(scene.w - Math.max(0, r.x), r.w), h: Math.min(scene.h - Math.max(0, r.y), r.h) };
      const pw = Math.max(tile, region.w * tile), ph = Math.max(tile, region.h * tile);
      const max = opts.maxSize ?? 1024;
      const fit = Math.min(max / pw, max / ph);
      const scale = fit >= 1 ? Math.min(4, Math.floor(fit)) : fit;
      const width = Math.max(16, Math.round(pw * scale)), height = Math.max(16, Math.round(ph * scale));
      this.host.style.width = `${width}px`;
      this.host.style.height = `${height}px`;
      this.view.resize(width, height);
      this.view.setLighting(opts.lighting ?? true);
      this.view.setDoc(doc, scene.id);
      this.view.setCamera({ x: (region.x + region.w / 2) * tile, y: (region.y + region.h / 2) * tile, zoom: scale });
      await this.view.settle();
      const image = await this.view.snapshot(opts.type ?? "image/png");
      return { image, width, height, scale };
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  destroy(): void {
    this.view.destroy();
    this.host.remove();
  }
}

export { frameSize };
