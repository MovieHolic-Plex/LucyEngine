// 지형 격자와 재질 무늬로 바닥 그림을 굽는다. 재질 사이 가장자리는 여기서 결정적으로 만든다.
// DOM·Phaser 에 기대지 않는다 (브라우저와 Node 양쪽에서 돈다).

export interface BakeMaterial {
  /** size × size RGBA 무늬. 이어 붙일 수 있어야 한다. */
  pixels: Uint8ClampedArray;
  size: number;
  /** 높은 재질이 낮은 재질 위로 번져 들어간다. */
  priority: number;
  /** soft = 울퉁불퉁하게 번진다 (풀, 흙). hard = 칸 경계 그대로 (포장, 마루). */
  edge: "soft" | "hard";
}

export interface BakeInput {
  /** 칸 수. */
  w: number;
  h: number;
  /** 칸마다 재질 번호 (materials 의 색인). 범위 밖 번호는 0 번으로 본다. */
  cells: ArrayLike<number>;
  tile: number;
  materials: BakeMaterial[];
}

export interface BakeRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Baked {
  w: number;
  h: number;
  data: Uint8ClampedArray;
}

function hash(ix: number, iy: number): number {
  let n = (ix * 374761393 + iy * 668265263) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** -1..1 값 잡음. 격자 간격 cell 화소. */
function noise(x: number, y: number, cell: number): number {
  const fx = x / cell, fy = y / cell;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = fx - ix, ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) * 2 - 1;
}

const NEIGHBOURS: Array<[number, number]> = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

/** region(칸 단위)만큼의 바닥을 굽는다. 없으면 전체. */
export function bakeTerrain(input: BakeInput, region?: BakeRegion): Baked {
  const { w, h, tile, materials } = input;
  const r = region ?? { x: 0, y: 0, w, h };
  const outW = r.w * tile, outH = r.h * tile;
  const data = new Uint8ClampedArray(outW * outH * 4);
  const matAt = (cx: number, cy: number): number => {
    const x = cx < 0 ? 0 : cx >= w ? w - 1 : cx, y = cy < 0 ? 0 : cy >= h ? h - 1 : cy;
    const m = input.cells[y * w + x];
    return m >= 0 && m < materials.length ? m : 0;
  };

  for (let cy = r.y; cy < r.y + r.h; cy++)
    for (let cx = r.x; cx < r.x + r.w; cx++) {
      const m0 = matAt(cx, cy);
      const p0 = materials[m0].priority;
      // 더 높은 이웃만 추린다. 없으면 칸 전체가 한 재질이다.
      const higher: Array<{ dx: number; dy: number; m: number }> = [];
      for (const [dx, dy] of NEIGHBOURS) {
        const m = matAt(cx + dx, cy + dy);
        if (m !== m0 && materials[m].priority > p0) higher.push({ dx, dy, m });
      }
      for (let py = 0; py < tile; py++)
        for (let px = 0; px < tile; px++) {
          const wx = cx * tile + px, wy = cy * tile + py;
          let mat = m0, shade = 1;
          if (higher.length) {
            let bestPri = p0, rim = Infinity, inner = Infinity;
            for (const nb of higher) {
              const ex = nb.dx < 0 ? px + 0.5 : nb.dx > 0 ? tile - px - 0.5 : 0;
              const ey = nb.dy < 0 ? py + 0.5 : nb.dy > 0 ? tile - py - 0.5 : 0;
              const d = Math.hypot(ex, ey);
              const nm = materials[nb.m];
              const reach = nm.edge === "soft" ? 2.6 + 2.4 * noise(wx, wy, 5) + 1.2 * noise(wx + 91, wy + 37, 2.2) : 0;
              const over = reach - d;
              if (over > 0) {
                if (nm.priority > bestPri) { bestPri = nm.priority; mat = nb.m; inner = over; }
                else if (nb.m === mat) inner = Math.max(inner === Infinity ? 0 : inner, over);
              } else if (-over < rim) rim = -over;
            }
            if (mat !== m0) shade = inner < 1 ? 0.84 : 1; // 번져 온 재질의 테두리
            else if (rim < 1.4) shade = 0.74; // 높은 재질 바로 아래의 그늘
            else if (rim < 2.6) shade = 0.9;
          }
          const tex = materials[mat];
          const ti = ((wy % tex.size) * tex.size + (wx % tex.size)) * 4;
          const oi = ((wy - r.y * tile) * outW + (wx - r.x * tile)) * 4;
          // 그늘은 푸른 쪽으로 살짝 기운다
          data[oi] = tex.pixels[ti] * shade * (shade < 1 ? 0.96 : 1);
          data[oi + 1] = tex.pixels[ti + 1] * shade;
          data[oi + 2] = Math.min(255, tex.pixels[ti + 2] * shade * (shade < 1 ? 1.06 : 1));
          data[oi + 3] = 255;
        }
    }
  return { w: outW, h: outH, data };
}
