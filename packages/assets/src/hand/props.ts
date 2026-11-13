import { Canvas, col, ink, paper, rng, type Family } from "./kit";

// 소품. 빛은 왼쪽 위에서 온다. 형태를 먼저 채우고, 띠와 덩어리로 명암을 넣고, 눈에 띄는 흠집 몇 개로 마무리한다.

function barrel(): Canvas {
  const c = new Canvas(22, 32);
  // 몸통: 세로 띠로 둥근 기둥을 만든다
  const band = (x: number) => (x <= 2 ? 1 : x <= 4 ? 3 : x <= 7 ? 4 : x <= 12 ? 3 : x <= 15 ? 2 : 1);
  for (let y = 6; y <= 28; y++)
    for (let x = 2; x <= 19; x++) {
      const edge = y >= 27 && (x <= 3 || x >= 18);
      if (y === 28 && (x <= 4 || x >= 17)) continue;
      if (!edge) c.set(x, y, col(x - 2 <= 7 && x - 2 >= 5 ? "orange" : "rust", band(x - 2)));
    }
  // 테두리 띠 둘: 윗줄은 밝게, 아랫줄은 그늘
  for (const y of [11, 21]) {
    for (let x = 2; x <= 19; x++) {
      c.set(x, y, col("rust", Math.min(5, band(x - 2) + 1)));
      c.set(x, y + 1, col("rust", Math.max(0, band(x - 2) - 1)));
    }
  }
  // 윗면
  c.ellipse(10.5, 6, 8.5, 3.2, col("rust", 2));
  c.ellipse(10.5, 5.6, 7.2, 2.3, col("rust", 1));
  c.hline(5, 10, 4, col("rust", 4));
  c.hline(7, 14, 7, col("rust", 0));
  c.rect(13, 5, 2, 1, col("steel", 4)); // 마개
  // 녹과 흘러내린 자국
  c.over(6, 15, col("gold", 3)).over(7, 15, col("gold", 3)).over(6, 16, col("gold", 2)).over(6, 17, col("rust", 1));
  c.over(14, 24, col("gold", 2)).over(15, 24, col("rust", 0)).over(15, 25, col("rust", 0));
  c.over(11, 16, col("rust", 1)).over(12, 16, col("rust", 1)).over(11, 17, col("rust", 1)); // 찌그러진 곳
  c.over(10, 15, col("rust", 4));
  return c.outline(3);
}

function crate(): Canvas {
  const c = new Canvas(30, 28);
  const W = 26, x0 = 2;
  // 윗면
  c.rect(x0, 2, W, 8, col("wood", 4));
  c.hline(x0, x0 + W - 1, 2, col("wood", 5));
  c.hline(x0 + 1, x0 + W - 2, 5, col("wood", 3));
  c.hline(x0 + 1, x0 + W - 2, 8, col("wood", 3));
  c.vline(x0, 2, 9, col("wood", 5));
  c.vline(x0 + W - 1, 3, 9, col("wood", 3));
  // 앞면: 테두리 틀과 안쪽 널
  c.rect(x0, 10, W, 16, col("wood", 3));
  c.rect(x0 + 3, 13, W - 6, 10, col("wood", 2));
  for (let x = x0 + 7; x < x0 + W - 4; x += 5) c.vline(x, 13, 22, col("wood", 1));
  // 대각 버팀목
  for (let i = 0; i < W - 6; i++) {
    const y = 22 - Math.round((i * 9) / (W - 7));
    c.set(x0 + 3 + i, y, col("wood", 4));
    c.set(x0 + 3 + i, y + 1, col("wood", 3));
    if (y + 2 <= 22) c.set(x0 + 3 + i, y + 2, col("wood", 1));
  }
  c.hline(x0, x0 + W - 1, 10, col("wood", 4));
  c.hline(x0, x0 + W - 1, 25, col("wood", 1));
  c.vline(x0, 10, 25, col("wood", 4));
  c.vline(x0 + W - 1, 10, 25, col("wood", 1));
  c.hline(x0 + 3, x0 + W - 4, 12, col("wood", 1)); // 틀 그림자
  for (const [x, y] of [[x0 + 1, 11], [x0 + W - 2, 11], [x0 + 1, 24], [x0 + W - 2, 24]]) c.set(x, y, col("stone", 5));
  // 찍힌 자국과 표식
  c.set(x0 + 5, 4, col("wood", 2)).set(x0 + 6, 4, col("wood", 2));
  c.rect(x0 + 16, 15, 4, 3, col("rustM", 3));
  c.hline(x0 + 17, x0 + 18, 16, col("rustM", 1));
  return c.outline(3);
}

function lamp(): Canvas {
  const c = new Canvas(22, 66);
  const m = (t: number) => col("steel", t);
  // 받침
  c.rect(6, 61, 10, 3, m(1));
  c.rect(7, 58, 8, 3, m(2));
  c.rect(8, 55, 6, 3, m(1));
  c.hline(6, 12, 61, m(3)).hline(7, 11, 58, m(3)).vline(8, 55, 57, m(3));
  // 기둥
  c.rect(10, 20, 2, 35, m(1));
  c.vline(10, 20, 54, m(3));
  for (const y of [26, 42]) {
    c.rect(9, y, 4, 2, m(2));
    c.hline(9, 10, y, m(4));
  }
  c.over(11, 33, col("rust", 2)).over(11, 34, col("rust", 2)).over(10, 47, col("rust", 3)); // 녹
  // 등: 지붕, 유리, 받침
  c.rect(10, 1, 2, 2, m(2));
  c.rows(3, [[9, 12], [7, 14], [5, 16]], m(1));
  c.hline(6, 10, 5, m(3)).set(9, 3, m(3));
  c.rect(6, 6, 10, 10, col("gold", 5));
  c.ellipse(10.5, 10.5, 3.5, 4, (_x, _y, nx, ny) => (nx * nx + ny * ny < 0.25 ? paper : col("gold", 6)));
  c.rect(6, 14, 10, 2, col("orange", 4));
  c.vline(6, 6, 15, m(1)).vline(15, 6, 15, m(1)).vline(11, 6, 8, m(1)).vline(11, 13, 15, m(1));
  c.rows(16, [[6, 15], [7, 14], [9, 12], [9, 12]], m(1));
  c.hline(6, 9, 16, m(3));
  return c.outline(2);
}

function bench(): Canvas {
  const c = new Canvas(38, 24);
  const slat = (y: number, h: number, t: number) => {
    c.rect(3, y, 32, h, col("wood", t));
    c.hline(3, 34, y, col("wood", t + 1));
    c.hline(3, 34, y + h - 1, col("wood", t - 1));
  };
  // 쇠다리
  for (const x of [5, 31]) {
    c.rect(x, 3, 2, 19, col("steel", 1));
    c.vline(x, 3, 21, col("steel", 2));
    c.rect(x - 1, 21, 4, 2, col("steel", 1));
  }
  slat(2, 3, 3);
  slat(6, 3, 3);
  // 앉는 판: 위를 보는 면이라 더 밝다
  slat(11, 3, 4);
  slat(14, 2, 4);
  c.hline(3, 34, 16, col("wood", 1));
  c.rect(3, 17, 32, 1, col("wood", 2));
  // 닳은 자리와 빠진 못
  c.hline(14, 20, 12, col("wood", 5));
  c.set(9, 3, col("wood", 1)).set(27, 7, col("wood", 1)).set(22, 3, col("stone", 5));
  c.rect(24, 6, 3, 1, col("wood", 1));
  return c.outline(3);
}

function sign(): Canvas {
  const c = new Canvas(32, 38);
  // 기둥
  c.rect(15, 14, 3, 22, col("wood", 2));
  c.vline(15, 14, 35, col("wood", 3));
  c.vline(17, 14, 35, col("wood", 1));
  c.rect(13, 35, 7, 1, col("leaf", 3)).set(12, 35, col("leaf", 2)).set(14, 34, col("leaf", 4)).set(19, 34, col("leaf", 3));
  // 녹슨 철판
  c.rect(3, 3, 26, 13, col("steel", 3));
  c.hline(3, 28, 3, col("steel", 5));
  c.vline(3, 3, 15, col("steel", 4));
  c.hline(3, 28, 15, col("steel", 1));
  c.vline(28, 4, 15, col("steel", 2));
  for (const [x, y] of [[5, 5], [26, 5], [5, 13], [26, 13]]) c.set(x, y, col("steel", 1));
  // 바랜 글씨
  c.hline(8, 15, 7, col("steel", 1)).hline(17, 22, 7, col("steel", 1));
  c.hline(8, 12, 10, col("steel", 1)).hline(14, 21, 10, col("steel", 2));
  // 녹: 모서리에서 번진다
  c.rect(22, 11, 6, 4, col("rust", 2)).rect(24, 9, 4, 2, col("rust", 3)).set(21, 13, col("rust", 3)).set(23, 10, col("gold", 3));
  c.rect(4, 4, 3, 2, col("rust", 3)).set(4, 6, col("rust", 2)).set(7, 4, col("gold", 3));
  return c.outline(3);
}

function vending(): Canvas {
  const c = new Canvas(36, 48);
  const body = (t: number) => col("tealM", t);
  // 윗면과 앞면
  c.rect(2, 2, 32, 5, body(4));
  c.hline(2, 33, 2, body(5));
  c.rect(2, 7, 32, 39, body(3));
  c.vline(2, 7, 45, body(4));
  c.vline(33, 7, 45, body(1));
  c.vline(32, 7, 45, body(2));
  c.hline(2, 33, 7, body(2));
  c.hline(2, 33, 45, body(1));
  // 진열창: 어두운 유리 안에 희미하게 빛나는 캔 줄
  c.rect(5, 10, 18, 22, col("blueM", 0));
  for (let row = 0; row < 3; row++) {
    const y = 12 + row * 7;
    c.hline(5, 22, y + 5, col("tealM", 2)); // 선반
    const cans: Family[] = ["rose", "gold", "leaf", "orange", "teal"];
    for (let i = 0; i < 5; i++) {
      const f = cans[(i + row * 2) % 5];
      if (row === 2 && i === 3) continue; // 팔린 자리
      c.rect(6 + i * 3 + (i > 2 ? 1 : 0), y + 1, 2, 4, col(f, 4));
      c.set(6 + i * 3 + (i > 2 ? 1 : 0), y + 1, col(f, 6));
    }
  }
  c.line(6, 20, 12, 11, col("tealM", 4)); // 유리 반사
  c.line(8, 22, 16, 11, col("tealM", 3));
  c.rect(4, 9, 20, 1, body(1)).rect(4, 32, 20, 1, body(5)).vline(4, 9, 32, body(1)).vline(23, 9, 32, body(5));
  // 오른쪽 조작부
  c.rect(26, 10, 5, 3, col("blueM", 0));
  c.hline(27, 29, 11, col("leaf", 5));
  c.rect(26, 15, 5, 8, body(2));
  for (let i = 0; i < 3; i++) c.set(27, 16 + i * 2, col("gold", 5)).set(29, 16 + i * 2, col("rose", 4));
  c.rect(27, 26, 3, 4, ink);
  c.set(28, 25, col("steel", 5));
  // 꺼내는 곳
  c.rect(6, 36, 18, 6, col("blueM", 0));
  c.hline(6, 23, 36, body(1));
  c.hline(7, 22, 41, col("steel", 3));
  // 찌그러짐과 녹
  c.rect(27, 37, 4, 3, body(2)).set(27, 37, body(4)).set(30, 39, body(1));
  c.rect(3, 42, 4, 3, col("rust", 2)).set(7, 44, col("rust", 3)).set(4, 41, col("rust", 3));
  c.rect(29, 43, 4, 2, col("rust", 2)).set(28, 44, col("rust", 3));
  c.rect(4, 46, 3, 1, col("steel", 1)).rect(29, 46, 3, 1, col("steel", 1)); // 발
  return c.outline(3);
}

/** 잎 덩어리 하나. 왼쪽 위가 밝고 오른쪽 아래가 어둡다. 가장자리에 잎 모양의 톱니를 낸다. */
function clump(c: Canvas, cx: number, cy: number, r: number, tones: [string, string, string, string], seed: number): void {
  const rnd = rng(seed);
  const [deep, dark, base, light] = tones;
  c.ellipse(cx, cy, r, r * 0.86, (_x, _y, nx, ny) => {
    const d = nx + ny;
    return d > 0.95 ? deep : d > 0.35 ? dark : d < -0.7 ? light : base;
  });
  // 잎 무리: 밝은 면에는 밝은 잎, 어두운 면에는 더 어두운 잎을 두세 칸씩
  const n = Math.round(r * 1.1);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * r * 0.8;
    const x = Math.round(cx + Math.cos(a) * d), y = Math.round(cy + Math.sin(a) * d * 0.86);
    const lit = Math.cos(a) + Math.sin(a) < 0;
    const cur = c.get(x, y);
    if (!cur) continue;
    const to = lit ? (cur === base ? light : cur === dark ? base : cur) : cur === base ? dark : cur === dark ? deep : cur;
    c.over(x, y, to).over(x + 1, y, to);
    if (rnd() < 0.5) c.over(x, y - 1, to);
  }
}

const LEAF: [string, string, string, string] = [col("green", 1), col("green", 2), col("leaf", 3), col("leaf", 4)];
const LEAF_BACK: [string, string, string, string] = [col("green", 0), col("green", 1), col("green", 2), col("leaf", 3)];
const LEAF_TOP: [string, string, string, string] = [col("green", 2), col("leaf", 3), col("leaf", 4), col("leaf", 4)];

function bush(): Canvas {
  const c = new Canvas(30, 24);
  clump(c, 9, 15, 7, LEAF_BACK, 1);
  clump(c, 21, 15, 7, LEAF_BACK, 2);
  clump(c, 15, 16, 7.5, LEAF, 3);
  clump(c, 10, 11, 6.5, LEAF, 4);
  clump(c, 19, 10, 6.5, LEAF, 5);
  clump(c, 13, 8, 5, LEAF_TOP, 6);
  c.hline(6, 24, 22, col("green", 0));
  // 붉은 열매 몇 알
  c.over(8, 13, col("rose", 4)).over(20, 16, col("rose", 4)).over(15, 12, col("rose", 5));
  return c.outline(2);
}

function tree(): Canvas {
  const c = new Canvas(92, 92);
  const cx = 46;
  // 줄기: 아래로 벌어지는 뿌리
  for (let y = 54; y <= 89; y++) {
    const flare = y > 82 ? (y - 82) * 0.7 + (y - 82) * (y - 82) * 0.06 : 0, half = 7 + flare;
    for (let x = Math.round(cx - half); x <= Math.round(cx + half - 1); x++) {
      const t = (x - (cx - half)) / (half * 2);
      c.set(x, y, col("wood", t < 0.22 ? 3 : t < 0.6 ? 2 : 1));
    }
  }
  c.rect(cx - 3, 88, 2, 2, col("wood", 0)).rect(cx + 4, 87, 2, 3, col("wood", 0)); // 뿌리 사이
  // 나무껍질 결과 옹이
  for (const [x, y0, y1] of [[cx - 3, 60, 70], [cx + 1, 64, 78], [cx - 1, 76, 86], [cx + 3, 58, 66], [cx - 5, 72, 82]]) c.vline(x, y0, y1, col("wood", 0));
  c.vline(cx - 5, 58, 68, col("wood", 4));
  c.ellipse(cx + 1, 71, 2, 2.5, col("wood", 0)).set(cx + 1, 70, col("wood", 1));
  // 가지가 갈라지는 곳
  c.line(cx - 4, 58, cx - 12, 50, col("wood", 2)).line(cx - 3, 58, cx - 11, 50, col("wood", 1));
  c.line(cx + 4, 58, cx + 12, 50, col("wood", 1)).line(cx + 3, 58, cx + 11, 50, col("wood", 2));

  // 잎: 뒤(어둡게) → 가운데 → 앞(밝게) 순으로 덩어리를 쌓는다
  const back: Array<[number, number, number]> = [[22, 44, 13], [70, 44, 13], [46, 50, 14], [34, 52, 10], [58, 52, 10]];
  const mid: Array<[number, number, number]> = [[14, 32, 12], [78, 32, 12], [28, 40, 12], [64, 40, 12], [46, 38, 15], [30, 20, 13], [62, 20, 13], [46, 14, 12]];
  const front: Array<[number, number, number]> = [[22, 26, 10], [40, 24, 11], [58, 30, 10], [72, 24, 9], [34, 36, 9], [50, 12, 9], [34, 12, 8]];
  back.forEach(([x, y, r], i) => clump(c, x, y, r, LEAF_BACK, 10 + i));
  mid.forEach(([x, y, r], i) => clump(c, x, y, r, LEAF, 30 + i));
  front.forEach(([x, y, r], i) => clump(c, x, y, r, LEAF_TOP, 50 + i));
  // 잎 사이로 보이는 어두운 틈
  for (const [x, y] of [[40, 46], [52, 44], [24, 48], [68, 49], [46, 30]]) c.rect(x, y, 3, 2, col("green", 0));
  return c.outline(2);
}

function rock(): Canvas {
  const c = new Canvas(26, 22);
  const top = col("stone", 5), left = col("stone", 4), right = col("stone", 2), dark = col("stone", 1);
  c.rows(3, [[9, 15], [6, 18], [4, 20], [3, 21], [2, 22], [2, 22], [2, 23], [1, 23], [1, 23], [1, 23], [1, 23], [1, 23], [2, 23], [2, 22], [3, 21], [5, 19]], left);
  // 밝은 윗면, 그늘진 오른쪽 면
  c.rows(3, [[9, 15], [6, 17], [5, 17], [5, 16], [6, 14]], top);
  for (let y = 5; y <= 18; y++) for (let x = 15 + Math.max(0, 9 - y); x <= 23; x++) c.over(x, y, right);
  c.rows(15, [[4, 22], [3, 22], [3, 21], [5, 19]], dark);
  c.rows(15, [[4, 12], [3, 9]], col("stone", 3));
  // 금과 이끼
  c.line(11, 8, 9, 14, dark).line(9, 14, 11, 17, dark).line(17, 9, 19, 13, dark);
  c.over(7, 4, col("leaf", 3)).over(8, 4, col("leaf", 4)).over(9, 3, col("leaf", 4)).over(10, 3, col("leaf", 3)).over(6, 5, col("leaf", 3)).over(7, 5, col("green", 2));
  c.over(5, 6, col("green", 2)).over(12, 4, col("leaf", 3)).over(3, 12, col("green", 2)).over(4, 13, col("leaf", 3));
  c.over(8, 7, paper);
  return c.outline(2);
}

function fence(): Canvas {
  const c = new Canvas(44, 26);
  // 가로대 둘
  for (const y of [10, 18]) {
    c.rect(2, y, 40, 2, col("wood", 2));
    c.hline(2, 41, y, col("wood", 3));
  }
  // 말뚝: 높이가 조금씩 다르고 하나는 기울었다
  const tops = [4, 3, 5, 3, 4, 6, 3];
  tops.forEach((top, i) => {
    const x = 2 + i * 6;
    const lean = i === 5 ? 1 : 0;
    for (let y = top; y <= 23; y++) {
      const dx = lean && y < 12 ? 1 : 0;
      c.rect(x + dx, y, 4, 1, col("wood", 3));
      c.set(x + dx, y, col("wood", 4));
      c.set(x + 3 + dx, y, col("wood", 2));
    }
    c.set(x + lean, top, null).set(x + 3 + lean, top, null); // 뾰족한 끝
    c.set(x + 1 + lean, top, col("wood", 5));
    c.set(x + 1, 11, col("stone", 5)).set(x + 1, 19, col("stone", 5)); // 못
    if (i % 3 === 1) c.vline(x + 2, top + 4, top + 9, col("wood", 1)); // 갈라진 금
  });
  c.rect(20, 22, 4, 2, null); // 부러진 말뚝 밑동
  c.set(3, 23, col("leaf", 3)).set(15, 23, col("leaf", 4)).set(38, 23, col("leaf", 3));
  return c.outline(3);
}

function flowers(): Canvas {
  const c = new Canvas(22, 16);
  const stem = col("leaf", 3), stemD = col("green", 2);
  const bloom = (x: number, y: number, petal: string, heart: string) => {
    c.set(x, y - 1, petal).set(x - 1, y, petal).set(x + 1, y, petal).set(x, y + 1, petal).set(x, y, heart);
  };
  for (const [x, top] of [[5, 5], [10, 3], [15, 6], [8, 8], [13, 9]]) c.vline(x, top + 2, 13, stem);
  c.line(5, 11, 3, 9, stemD).line(10, 10, 12, 8, stemD).line(15, 12, 17, 10, stemD).set(2, 9, stem).set(18, 10, stem);
  c.hline(3, 17, 13, stemD).hline(5, 15, 14, stemD);
  bloom(5, 5, paper, col("gold", 5));
  bloom(10, 3, col("gold", 6), col("orange", 4));
  bloom(15, 6, paper, col("gold", 5));
  bloom(8, 9, col("gold", 6), col("orange", 4));
  c.set(13, 9, paper).set(13, 8, paper).set(14, 9, col("gold", 5));
  return c.outline(2);
}

export const PROPS: Record<string, () => Canvas> = { barrel, crate, lamp, bench, sign, vending, bush, tree, rock, fence, flowers };

export { clump, LEAF, LEAF_BACK };
