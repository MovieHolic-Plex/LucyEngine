import { Canvas, col, paper, rng, type Family } from "./kit";

// 건물. 3/4 시점이라 지붕면이 크게 보이고 그 아래로 앞벽이 선다.

/** 골함석: 세로 골이 밝음-바탕-바탕-어둠으로 반복된다. */
function tin(c: Canvas, x: number, y: number, fam: Family, tone: number): void {
  const k = ((x % 4) + 4) % 4;
  c.set(x, y, col(fam, k === 0 ? tone + 1 : k === 3 ? tone - 1 : tone));
}

function litWindow(c: Canvas, x: number, y: number, w: number, h: number): void {
  c.rect(x, y, w, h, col("wood", 4));
  c.rect(x + 1, y + 1, w - 2, h - 2, col("gold", 5));
  // 안쪽 불빛: 가운데 위가 가장 밝다
  c.ellipse(x + w / 2 - 0.5, y + h * 0.45, w * 0.3, h * 0.28, col("gold", 6));
  c.rect(x + 1, y + h - 4, w - 2, 3, col("orange", 4));
  c.vline(x + Math.floor(w / 2), y + 1, y + h - 2, col("wood", 2));
  c.hline(x + 1, x + w - 2, y + Math.floor(h / 2), col("wood", 2));
  c.hline(x, x + w - 1, y + h - 1, col("wood", 2));
  c.vline(x + w - 1, y, y + h - 1, col("wood", 2));
  c.hline(x - 1, x + w, y + h, col("wood", 4)); // 창턱
  c.hline(x - 1, x + w, y + h + 1, col("wood", 1));
}

function house(): Canvas {
  const c = new Canvas(112, 132);
  const r = rng(7);
  const WX0 = 8, WX1 = 103, WY0 = 56, WY1 = 126;

  // ── 앞벽: 세로 널 ──
  let x = WX0;
  while (x <= WX1) {
    const w = Math.min(WX1 - x + 1, 5 + Math.floor(r() * 3));
    const pick = r();
    const fam: Family = pick < 0.14 ? "rustM" : "wood";
    const tone = pick < 0.14 ? 2 : pick < 0.5 ? 2 : pick < 0.9 ? 3 : 4;
    for (let y = WY0; y <= WY1; y++)
      for (let i = 0; i < w; i++) {
        let t = tone;
        if (i === w - 1) t = 1;
        else if (i === 0) t = tone + 1;
        c.set(x + i, y, col(i === w - 1 ? "wood" : fam, t));
      }
    // 널마다 못과 짧은 결
    c.set(x + 1, WY0 + 6, col("stone", 5));
    c.set(x + 1, WY1 - 6, col("stone", 5));
    if (w > 5) c.vline(x + 3, WY0 + 12 + Math.floor(r() * 30), WY0 + 22 + Math.floor(r() * 30), col("wood", 1));
    x += w;
  }
  // 처마 그늘
  for (let y = WY0; y <= WY0 + 3; y++) for (let i = WX0; i <= WX1; i++) c.set(i, y, y < WY0 + 2 ? col("violet", 0) : col("wood", 0));
  // 층 사이 가로 띠
  c.rect(WX0, 88, WX1 - WX0 + 1, 3, col("wood", 3));
  c.hline(WX0, WX1, 88, col("wood", 5));
  c.hline(WX0, WX1, 90, col("wood", 0));
  // 벽 가장자리 기둥
  c.rect(WX0, WY0 + 4, 3, WY1 - WY0 - 3, col("wood", 2)).vline(WX0, WY0 + 4, WY1, col("wood", 4));
  c.rect(WX1 - 2, WY0 + 4, 3, WY1 - WY0 - 3, col("wood", 1)).vline(WX1 - 2, WY0 + 4, WY1, col("wood", 2));

  // 위층 오른쪽: 구멍을 막은 골함석
  for (let y = 62; y <= 82; y++) for (let i = 68; i <= 94; i++) tin(c, i, y, "tealM", 3);
  c.hline(68, 94, 62, col("tealM", 5)).hline(68, 94, 82, col("tealM", 1)).vline(94, 62, 82, col("tealM", 1));
  for (const [px, py] of [[70, 64], [92, 64], [70, 80], [92, 80]]) c.set(px, py, col("steel", 5));
  for (let y = 70; y <= 82; y++) c.over(86 + (y % 3 === 0 ? 1 : 0), y, col("rust", y > 76 ? 2 : 3)); // 녹물
  c.rect(84, 68, 5, 2, col("rust", 2));
  // 덧댄 판자
  c.line(40, 60, 58, 66, col("wood", 4)).line(40, 61, 58, 67, col("wood", 3)).line(40, 62, 58, 68, col("wood", 1));
  c.set(41, 61, col("stone", 5)).set(57, 66, col("stone", 5));

  // 창
  litWindow(c, 18, 64, 18, 17);
  litWindow(c, 16, 98, 20, 17);
  // 화분 상자
  c.rect(15, 117, 22, 4, col("rustM", 2)).hline(15, 36, 117, col("rustM", 3));
  for (let i = 0; i < 7; i++) {
    c.rect(16 + i * 3, 114 + (i % 2), 2, 3, col("leaf", 3 + (i % 2)));
    if (i % 2 === 0) c.set(16 + i * 3, 113 + (i % 2), i % 4 === 0 ? col("rose", 5) : col("gold", 6));
  }
  // 아래층 오른쪽: 판자를 덧댄 어두운 창
  c.rect(74, 98, 20, 17, col("wood", 4)).rect(75, 99, 18, 15, col("blueM", 0));
  c.hline(76, 82, 101, col("blueM", 2)).hline(77, 80, 103, col("blueM", 1));
  c.line(73, 102, 95, 108, col("wood", 3)).line(73, 103, 95, 109, col("wood", 1));
  c.line(73, 111, 95, 104, col("wood", 4)).line(73, 112, 95, 105, col("wood", 2));
  c.hline(73, 94, 115, col("wood", 4)).hline(73, 94, 116, col("wood", 1));

  // 문
  c.rect(45, 93, 20, 34, col("wood", 0));
  c.rect(47, 95, 16, 32, col("tealM", 2));
  c.vline(47, 95, 126, col("tealM", 3)).vline(55, 107, 126, col("tealM", 1)).vline(62, 95, 126, col("tealM", 1));
  c.rect(50, 98, 10, 7, col("gold", 5)).rect(51, 99, 8, 4, col("gold", 6)).vline(55, 98, 104, col("tealM", 1));
  c.hline(49, 60, 105, col("tealM", 1));
  c.rect(59, 112, 2, 2, col("gold", 6)).set(60, 113, col("gold", 3));
  c.rect(49, 116, 5, 6, col("tealM", 1)).rect(57, 116, 4, 6, col("tealM", 1)); // 아래 판
  c.over(48, 124, col("rust", 2)).over(49, 125, col("rust", 2)).over(61, 123, col("rust", 3));
  // 문 위 등
  c.rect(53, 87, 4, 2, col("steel", 1)).rect(54, 89, 3, 3, col("gold", 6)).set(55, 90, paper).set(55, 92, col("orange", 4));
  // 문 앞 디딤돌
  c.rect(42, 126, 26, 4, col("stone", 3)).hline(42, 67, 126, col("stone", 5)).hline(42, 67, 129, col("stone", 1)).vline(67, 126, 129, col("stone", 2));
  // 기초
  for (let i = WX0; i <= WX1; i++) {
    if (i >= 42 && i <= 67) continue;
    c.set(i, 124, col("stone", 3)).set(i, 125, col("stone", 2)).set(i, 126, col("stone", 1));
    if (i % 9 === 0) c.vline(i, 124, 126, col("stone", 1));
  }
  // 왼쪽 모서리를 타고 오르는 덩굴
  const vr = rng(9);
  for (let y = 126; y >= 92; y -= 2) {
    const vx = 9 + Math.round(Math.sin(y / 5) * 2);
    c.set(vx, y, col("green", 2)).set(vx, y - 1, col("green", 2));
    if (vr() < 0.7) c.rect(vx + (vr() < 0.5 ? -2 : 1), y - 1, 2, 2, col("leaf", vr() < 0.5 ? 3 : 4));
  }
  c.rect(96, 122, 3, 3, col("leaf", 3)).rect(99, 120, 2, 5, col("leaf", 4)).set(101, 123, col("green", 2));

  // ── 지붕: 여러 장의 골함석을 이어 덮었다 ──
  const RY0 = 12, RY1 = 54;
  const sheets: Array<{ to: number; fam: Family; tone: number }> = [
    { to: 30, fam: "rustM", tone: 3 },
    { to: 52, fam: "tealM", tone: 3 },
    { to: 70, fam: "rustM", tone: 2 },
    { to: 88, fam: "steel", tone: 3 },
    { to: 200, fam: "rustM", tone: 3 },
  ];
  for (let y = RY0; y <= RY1; y++) {
    const t = (y - RY0) / (RY1 - RY0);
    const left = Math.round(15 - t * 12), right = Math.round(96 + t * 12);
    for (let i = left; i <= right; i++) {
      const s = sheets.find((q) => i <= q.to + (y > 32 ? 4 : 0))!;
      tin(c, i, y, s.fam, s.tone);
    }
  }
  // 장과 장이 겹친 이음: 가로 한 줄, 아래는 그늘
  for (let i = 9; i <= 102; i++) {
    c.over(i, 32, col("steel", 5));
    c.over(i, 33, col("violet", 0));
  }
  // 녹물이 골을 따라 흘러내린다
  for (const [sx, sy, len] of [[22, 14, 16], [26, 36, 12], [44, 18, 10], [61, 34, 18], [76, 13, 14], [92, 36, 14], [99, 40, 10], [36, 38, 9]]) {
    for (let j = 0; j < len; j++) {
      c.over(sx, sy + j, col("rust", j < len * 0.6 ? 3 : 2));
      if (j < len * 0.4) c.over(sx + 1, sy + j, col("orange", 3));
    }
  }
  c.rect(56, 40, 9, 8, col("gold", 3)); // 새로 덧댄 조각
  for (let y = 40; y <= 47; y++) for (let i = 56; i <= 64; i++) tin(c, i, y, "goldM", 3);
  c.hline(56, 64, 40, col("goldM", 5)).hline(56, 64, 47, col("goldM", 1));
  // 용마루와 처마 끝
  c.rect(14, RY0 - 2, 84, 3, col("steel", 2)).hline(14, 97, RY0 - 2, col("steel", 4)).hline(14, 97, RY0, col("steel", 0));
  for (let i = 3; i <= 108; i++) {
    c.set(i, RY1 + 1, col("steel", 4));
    c.set(i, RY1 + 2, col("steel", 1));
  }
  // 연통
  c.rect(78, 1, 6, 18, col("steel", 2)).vline(78, 1, 18, col("steel", 4)).vline(83, 1, 18, col("steel", 1)).vline(82, 1, 18, col("steel", 1));
  c.rect(76, 0, 10, 3, col("steel", 1)).hline(76, 84, 0, col("steel", 3));
  c.rect(77, 9, 8, 2, col("steel", 1)).hline(77, 80, 9, col("steel", 3));
  c.rect(76, 18, 10, 2, col("steel", 0));
  c.over(80, 5, col("rust", 2)).over(80, 6, col("rust", 2)).over(81, 13, col("rust", 3));
  return c.outline(3);
}

const FONT: Record<string, string[]> = {
  T: ["###", ".#.", ".#.", ".#.", ".#."],
  I: ["###", ".#.", ".#.", ".#.", "###"],
  C: ["###", "#..", "#..", "#..", "###"],
  K: ["#.#", "#.#", "##.", "#.#", "#.#"],
  E: ["###", "#..", "##.", "#..", "###"],
  S: ["###", "#..", "###", "..#", "###"],
};

function shop(): Canvas {
  const c = new Canvas(112, 114);
  const BX0 = 6, BX1 = 105, BY0 = 38, BY1 = 96;

  // ── 차체 ──
  for (let y = BY0; y <= BY1; y++)
    for (let x = BX0; x <= BX1; x++) {
      const low = y > 78;
      let t = low ? 2 : 3;
      if (x === BX0) t += 1;
      if (x >= BX1 - 1) t -= 1;
      c.set(x, y, col("rust", t));
    }
  // 창 띠 (크림색)와 허리선
  c.rect(BX0, BY0, BX1 - BX0 + 1, 5, col("skin", 6)).hline(BX0, BX1, BY0 + 4, col("skin", 4)).hline(BX0, BX1, BY0, paper);
  c.hline(BX0, BX1, 78, col("gold", 5)).hline(BX0, BX1, 79, col("rust", 1));
  for (let x = BX0 + 4; x <= BX1; x += 8) c.set(x, 81, col("rust", 4)); // 리벳
  for (const x of [BX0 + 2, 62, 68]) c.vline(x, 44, 95, col("rust", x === BX0 + 2 ? 4 : 2)); // 판 이음
  // 벗겨진 칠과 녹
  c.rect(60, 84, 9, 7, col("skin", 6)).rect(61, 85, 7, 5, col("skin", 5));
  c.stamp(62, 86, ["#.##", "#.#.", "#.##"], { "#": col("rust", 1) }); // 차 번호
  for (const [x, y] of [[9, 90], [10, 91], [11, 92], [10, 93], [98, 88], [99, 89], [100, 90], [99, 92], [48, 92], [49, 93]]) c.over(x, y, col("rust", 1));
  c.over(12, 91, col("gold", 3)).over(101, 91, col("gold", 3)).over(50, 92, col("gold", 3));

  // ── 매표창 ──
  const WX0 = 14, WX1 = 56, WY0 = 48, WY1 = 72;
  c.rect(WX0 - 1, WY0 - 1, WX1 - WX0 + 3, WY1 - WY0 + 2, col("rust", 1));
  c.rect(WX0, WY0, WX1 - WX0 + 1, WY1 - WY0 + 1, col("violet", 0));
  // 안쪽 불빛
  c.ellipse(34, 57, 18, 9, (_x, _y, nx, ny) => (nx * nx + ny * ny < 0.2 ? col("gold", 6) : nx * nx + ny * ny < 0.62 ? col("gold", 5) : col("orange", 3)));
  c.rect(WX0, WY0, WX1 - WX0 + 1, 3, col("violet", 0)); // 차양 그늘
  c.rect(33, 51, 3, 3, col("steel", 1)).rect(33, 54, 3, 2, paper).vline(34, 48, 50, col("steel", 1)); // 매달린 등
  // 선반과 물건
  c.hline(WX0, WX1, 62, col("wood", 1));
  for (const [x, f] of [[17, "teal"], [20, "rose"], [24, "gold"], [44, "leaf"], [48, "rose"], [52, "teal"]] as Array<[number, Family]>) {
    c.rect(x, 58, 2, 4, col(f, 3)).set(x, 58, col(f, 5));
  }
  c.rect(27, 64, 12, 8, col("violet", 1)); // 안에 선 사람 그림자
  c.ellipse(32.5, 64, 3.5, 3.5, col("violet", 1));
  // 창구 받침
  c.rect(WX0 - 4, 73, WX1 - WX0 + 9, 3, col("wood", 4)).hline(WX0 - 4, WX1 + 4, 73, col("wood", 5));
  c.rect(WX0 - 3, 76, WX1 - WX0 + 7, 2, col("wood", 1));
  c.rect(20, 70, 4, 3, paper).set(21, 71, col("rust", 3)); // 표 묶음
  c.rect(46, 70, 3, 3, col("gold", 5)).set(46, 70, paper).set(47, 69, col("gold", 4)); // 종

  // ── 차양: 빨강·크림 줄무늬 ──
  for (let y = 40; y <= 49; y++) {
    const spread = Math.round((y - 40) * 0.35);
    for (let x = WX0 - 4 - spread; x <= WX1 + 4 + spread; x++) {
      const stripe = Math.floor((x - WX0 + 40) / 5) % 2 === 0;
      const t = y <= 41 ? 1 : 0;
      c.set(x, y, stripe ? col("rust", 3 + t) : y <= 41 ? paper : col("skin", 6));
    }
  }
  for (let x = WX0 - 7; x <= WX1 + 7; x++) {
    const k = ((x - WX0 + 40) % 5 + 5) % 5;
    const stripe = Math.floor((x - WX0 + 40) / 5) % 2 === 0;
    if (k !== 0 && k !== 4) c.set(x, 50, stripe ? col("rust", 2) : col("skin", 5));
    if (k === 2) c.set(x, 51, stripe ? col("rust", 2) : col("skin", 5));
  }

  // ── 문 ──
  c.rect(72, 50, 20, 47, col("steel", 0));
  c.rect(74, 52, 16, 45, col("tealM", 3));
  c.vline(74, 52, 96, col("tealM", 4)).vline(89, 52, 96, col("tealM", 1));
  c.rect(76, 55, 12, 13, col("tealM", 1)).rect(77, 56, 10, 11, col("gold", 5)).rect(78, 57, 8, 6, col("gold", 6));
  c.vline(82, 56, 66, col("tealM", 1)).hline(77, 86, 62, col("tealM", 1));
  c.rect(76, 73, 12, 9, col("tealM", 2)).rect(76, 85, 12, 9, col("tealM", 2));
  c.hline(76, 87, 73, col("tealM", 1)).hline(76, 87, 85, col("tealM", 1));
  c.rect(86, 76, 2, 3, col("gold", 6)).set(87, 78, col("gold", 3));
  // 계단
  c.rect(69, 97, 26, 4, col("wood", 3)).hline(69, 94, 97, col("wood", 5)).hline(69, 94, 100, col("wood", 1));
  c.rect(67, 101, 30, 5, col("wood", 2)).hline(67, 96, 101, col("wood", 4)).hline(67, 96, 105, col("wood", 0));

  // ── 하부: 바퀴는 반쯤 풀에 묻혔다 ──
  c.rect(BX0 + 2, 97, 60, 5, col("steel", 0)).hline(BX0 + 2, 66, 97, col("steel", 2));
  for (const wx of [20, 36, 54]) {
    c.ellipse(wx, 104, 6, 6, (_x, _y, nx, ny) => (nx * nx + ny * ny > 0.6 ? col("steel", 1) : col("steel", 2)));
    c.ellipse(wx, 104, 2, 2, col("rust", 2));
    c.set(wx - 3, 100, col("steel", 4)).set(wx - 2, 99, col("steel", 4));
  }
  c.rect(BX0, 108, 62, 3, col("wood", 1)).hline(BX0, 67, 108, col("wood", 3)); // 침목
  c.rect(98, 97, 6, 12, col("steel", 0)).hline(98, 103, 97, col("steel", 2));
  for (const [x, h] of [[8, 4], [12, 3], [28, 3], [45, 4], [63, 3], [100, 4], [104, 3]]) {
    c.vline(x, 111 - h, 111, col("leaf", 3));
    c.set(x + 1, 111 - h + 1, col("leaf", 4)).set(x - 1, 110, col("green", 2));
  }

  // ── 지붕: 둥근 객차 지붕 ──
  c.rows(24, [[14, 97], [10, 101], [7, 104], [5, 106], [4, 107], [4, 107], [4, 107], [4, 107], [4, 107], [4, 107], [4, 107], [4, 107], [4, 107], [5, 106]], (x, y) => col("steel", y < 27 ? 4 : y < 32 ? 3 : y < 36 ? 2 : 1));
  for (let x = 20; x <= 100; x += 16) c.vline(x, 25, 37, col("steel", 1));
  c.hline(14, 60, 25, col("steel", 5));
  c.rect(84, 20, 9, 6, col("steel", 2)).hline(84, 92, 20, col("steel", 4)).rect(86, 22, 5, 2, col("steel", 0)); // 환기통
  for (const [x, y, len] of [[30, 28, 7], [46, 30, 6], [66, 27, 8], [98, 29, 7]]) for (let j = 0; j < len; j++) c.over(x, y + j, col("rust", j < 4 ? 3 : 2));

  // ── 손으로 쓴 간판 ──
  c.rect(34, 15, 2, 9, col("wood", 1)).rect(74, 15, 2, 9, col("wood", 1));
  c.rect(26, 2, 58, 14, col("wood", 2));
  c.rect(27, 3, 56, 12, col("skin", 6)).hline(27, 82, 3, paper).hline(27, 82, 14, col("skin", 4));
  c.hline(26, 83, 2, col("wood", 4)).hline(26, 83, 15, col("wood", 0)).vline(26, 2, 15, col("wood", 3)).vline(83, 2, 15, col("wood", 0));
  [..."TICKETS"].forEach((ch, i) => c.stamp(41 + i * 4, 6, FONT[ch], { "#": col("rust", 2) }));
  c.set(33, 8, col("gold", 4)).set(32, 9, col("gold", 4)).set(34, 9, col("gold", 4)).set(33, 10, col("gold", 4)); // 장식
  c.set(76, 8, col("gold", 4)).set(75, 9, col("gold", 4)).set(77, 9, col("gold", 4)).set(76, 10, col("gold", 4));
  c.set(28, 4, col("stone", 4)).set(81, 4, col("stone", 4)).set(28, 13, col("stone", 4)).set(81, 13, col("stone", 4));
  return c.outline(3);
}

export const BUILDINGS: Record<string, () => Canvas> = { house, shop };
