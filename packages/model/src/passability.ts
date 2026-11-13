import { type Project, type Scene, type Asset, type Entity, type PrefabKind, resolveProps } from "./schema";

// 통행 격자는 저장하지 않고, 지형 재질과 엔티티 발자국에서 유도한다.

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 에셋의 한 프레임 크기 (화소). */
export function frameSize(asset: Asset): { w: number; h: number } {
  return asset.frames ? { w: asset.frames.frameW, h: asset.frames.frameH } : { w: asset.w, h: asset.h };
}

/** 캐릭터 발자국의 최대 크기 (화소). 길 찾기 격자의 한 칸(타일의 절반)보다 작아야 벽을 따라 걸을 수 있다. */
export const CHAR_W = 10;
export const CHAR_H = 7;

/** 충돌 발자국. 에셋에 적혀 있지 않으면 그림 크기에서 어림한다. */
export function footprintOf(asset: Asset | undefined, kind: PrefabKind): { w: number; h: number } {
  if (asset?.footprint) return asset.footprint;
  if (!asset) return { w: 14, h: 8 };
  const { w, h } = frameSize(asset);
  if (kind === "player" || kind === "npc" || kind === "enemy") return { w: Math.max(8, Math.min(CHAR_W, w * 0.4)), h: CHAR_H };
  if (kind === "building") return { w: Math.max(8, w * 0.92), h: Math.max(8, h * 0.4) };
  return { w: Math.max(6, w * 0.7), h: Math.max(6, Math.min(h * 0.3, w * 0.55)) };
}

export function isSolid(project: Project, entity: Entity): boolean {
  const prefab = project.prefabs[entity.prefab];
  if (!prefab) return false;
  const props = resolveProps(project, entity);
  if (props.solid !== undefined) return props.solid;
  return prefab.kind !== "player";
}

/** 엔티티의 충돌 상자 (화소). 발밑 가운데가 기준이다. */
export function entityBox(project: Project, entity: Entity): Box {
  const prefab = project.prefabs[entity.prefab];
  const tile = project.style.tile;
  const fp = footprintOf(prefab ? project.assets[prefab.asset] : undefined, prefab?.kind ?? "prop");
  return { x: entity.x * tile - fp.w / 2, y: entity.y * tile - fp.h, w: fp.w, h: fp.h };
}

export function isCharacterKind(kind: PrefabKind | undefined): boolean {
  return kind === "player" || kind === "npc" || kind === "enemy";
}

/** 길 찾기용 격자. 한 칸은 타일의 절반이다. */
export interface NavGrid {
  w: number;
  h: number;
  /** 칸 한 변의 화소 수. */
  cell: number;
  blocked: Uint8Array;
}

export const NAV_SUB = 2;

/** 지형과 움직이지 않는 단단한 엔티티로 길 찾기 격자를 만든다. 캐릭터는 막힘으로 치지 않는다. */
export function buildNavGrid(project: Project, scene: Scene): NavGrid {
  const tile = project.style.tile;
  const cell = tile / NAV_SUB;
  const w = scene.w * NAV_SUB, h = scene.h * NAV_SUB;
  const blocked = new Uint8Array(w * h);
  for (let ty = 0; ty < scene.h; ty++)
    for (let tx = 0; tx < scene.w; tx++) {
      const m = project.materials[scene.terrain[ty * scene.w + tx]];
      if (m && !m.walkable)
        for (let j = 0; j < NAV_SUB; j++) for (let i = 0; i < NAV_SUB; i++) blocked[(ty * NAV_SUB + j) * w + tx * NAV_SUB + i] = 1;
    }
  // 칸 가운데에 선 캐릭터가 고정물과 부딪히면 그 칸은 막힌 칸이다 (약간의 여유를 둔다)
  const halfW = CHAR_W / 2 + 0.5, halfH = CHAR_H / 2 + 0.5;
  for (const e of Object.values(scene.entities)) {
    const kind = project.prefabs[e.prefab]?.kind;
    if (isCharacterKind(kind) || !isSolid(project, e)) continue;
    const b = entityBox(project, e);
    const x0 = Math.max(0, Math.floor((b.x - halfW) / cell)), x1 = Math.min(w - 1, Math.floor((b.x + b.w + halfW) / cell));
    const y0 = Math.max(0, Math.floor((b.y - halfH) / cell)), y1 = Math.min(h - 1, Math.floor((b.y + b.h + halfH) / cell));
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const mx = (cx + 0.5) * cell, my = (cy + 0.5) * cell;
        if (mx - halfW < b.x + b.w && mx + halfW > b.x && my - halfH < b.y + b.h && my + halfH > b.y) blocked[cy * w + cx] = 1;
      }
  }
  return { w, h, cell, blocked };
}

function cellOf(nav: NavGrid, px: number, py: number): number {
  const cx = Math.max(0, Math.min(nav.w - 1, Math.floor(px / nav.cell)));
  const cy = Math.max(0, Math.min(nav.h - 1, Math.floor(py / nav.cell)));
  return cy * nav.w + cx;
}

/** (px, py) 화소 위치가 막힌 칸인가. */
export function isBlockedAt(nav: NavGrid, px: number, py: number): boolean {
  if (px < 0 || py < 0 || px >= nav.w * nav.cell || py >= nav.h * nav.cell) return true;
  return nav.blocked[cellOf(nav, px, py)] === 1;
}

/** from(화소)에서 걸어서 닿는 칸 집합. 시작 칸이 막혀 있으면 가장 가까운 열린 칸에서 시작한다. */
export function floodFrom(nav: NavGrid, fromX: number, fromY: number): Uint8Array {
  const seen = new Uint8Array(nav.w * nav.h);
  let start = cellOf(nav, fromX, fromY);
  if (nav.blocked[start]) {
    const sx = start % nav.w, sy = Math.floor(start / nav.w);
    let best = -1, bd = Infinity;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const x = sx + dx, y = sy + dy;
        if (x < 0 || y < 0 || x >= nav.w || y >= nav.h || nav.blocked[y * nav.w + x]) continue;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = y * nav.w + x; }
      }
    if (best < 0) return seen;
    start = best;
  }
  const queue = [start];
  seen[start] = 1;
  while (queue.length) {
    const i = queue.pop()!;
    const x = i % nav.w, y = Math.floor(i / nav.w);
    const tryCell = (nx: number, ny: number) => {
      if (nx < 0 || ny < 0 || nx >= nav.w || ny >= nav.h) return;
      const n = ny * nav.w + nx;
      if (seen[n] || nav.blocked[n]) return;
      seen[n] = 1;
      queue.push(n);
    };
    tryCell(x - 1, y); tryCell(x + 1, y); tryCell(x, y - 1); tryCell(x, y + 1);
  }
  return seen;
}

/** 닿는 칸 중 하나가 목표 상자에서 range 화소 안에 있는가. */
export function reachesBox(nav: NavGrid, seen: Uint8Array, box: Box, range: number): boolean {
  const x0 = Math.max(0, Math.floor((box.x - range) / nav.cell)), x1 = Math.min(nav.w - 1, Math.floor((box.x + box.w + range) / nav.cell));
  const y0 = Math.max(0, Math.floor((box.y - range) / nav.cell)), y1 = Math.min(nav.h - 1, Math.floor((box.y + box.h + range) / nav.cell));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (seen[y * nav.w + x]) return true;
  return false;
}

/** 두 위치(타일 단위) 사이를 걸어서 갈 수 있는가. 목표 주변 range 타일 안에 닿으면 된다. */
export function canReach(project: Project, scene: Scene, from: { x: number; y: number }, to: { x: number; y: number }, rangeTiles = 0.75): boolean {
  const nav = buildNavGrid(project, scene);
  const tile = project.style.tile;
  const seen = floodFrom(nav, from.x * tile, from.y * tile - 2);
  return reachesBox(nav, seen, { x: to.x * tile, y: to.y * tile, w: 0, h: 0 }, rangeTiles * tile);
}

/** A* 길 찾기 (8방향, 모서리 끼어들기 없음). 화소 좌표의 경유점 목록을 돌려준다. 길이 없으면 null. */
export function findPath(nav: NavGrid, fromX: number, fromY: number, toX: number, toY: number, maxExpand = 4000): Array<{ x: number; y: number }> | null {
  const start = cellOf(nav, fromX, fromY);
  let goal = cellOf(nav, toX, toY);
  if (nav.blocked[goal]) {
    // 목표가 막혀 있으면 가장 가까운 열린 칸으로
    const gx = goal % nav.w, gy = Math.floor(goal / nav.w);
    let best = -1, bd = Infinity;
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const x = gx + dx, y = gy + dy;
        if (x < 0 || y < 0 || x >= nav.w || y >= nav.h || nav.blocked[y * nav.w + x]) continue;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = y * nav.w + x; }
      }
    if (best < 0) return null;
    goal = best;
  }
  if (start === goal) return [{ x: toX, y: toY }];
  const n = nav.w * nav.h;
  const g = new Float32Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const open: number[] = [start];
  const f = new Float32Array(n).fill(Infinity);
  const gx = goal % nav.w, gy = Math.floor(goal / nav.w);
  const hCost = (i: number) => {
    const dx = Math.abs((i % nav.w) - gx), dy = Math.abs(Math.floor(i / nav.w) - gy);
    return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
  };
  g[start] = 0;
  f[start] = hCost(start);
  let expanded = 0;
  while (open.length && expanded++ < maxExpand) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
    const cur = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % nav.w, cy = Math.floor(cur / nav.w);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= nav.w || ny >= nav.h) continue;
        const ni = ny * nav.w + nx;
        if (nav.blocked[ni] || closed[ni]) continue;
        if (dx && dy && (nav.blocked[cy * nav.w + nx] || nav.blocked[ny * nav.w + cx])) continue;
        const cost = g[cur] + (dx && dy ? 1.414 : 1);
        if (cost < g[ni]) {
          g[ni] = cost;
          came[ni] = cur;
          f[ni] = cost + hCost(ni);
          open.push(ni);
        }
      }
  }
  if (came[goal] < 0) return null;
  const cells: number[] = [];
  for (let c = goal; c !== start && c >= 0; c = came[c]) cells.push(c);
  cells.reverse();
  const pts = cells.map((c) => ({ x: ((c % nav.w) + 0.5) * nav.cell, y: (Math.floor(c / nav.w) + 0.5) * nav.cell }));
  return pts;
}
