import { Canvas, col, ink, paper, stack, strip } from "./kit";

// 사람 캐릭터. 한 벌의 뼈대로 방향 셋 × 자세 다섯을 그리고, 옷과 머리만 바꿔 여러 사람을 만든다.
// 프레임은 24×36, 발바닥이 맨 아랫줄이다. 머리가 큰 2.5등신.

export const CW = 24, CH = 36;
type Dir = "down" | "up" | "side";
type Tones = [dark: string, base: string, light: string];

export interface Look {
  skin: Tones;
  hair: Tones;
  hairStyle: "short" | "bob" | "bald";
  top: Tones;
  /** 소매 색. 없으면 윗옷과 같다. */
  sleeve?: Tones;
  pants: Tones;
  shoes: [string, string];
  scarf?: Tones;
  apron?: Tones;
  overalls?: Tones;
  beard?: Tones;
  cap?: Tones;
  back?: "wrench";
  blush?: boolean;
}

/** 걷기 자세. 0 = 서 있기, 1 = 왼발, 2 = 지나감, 3 = 오른발, 4 = 지나감. */
interface Pose {
  bob: number;
  /** 정면: 들어 올린 발 (-1 왼쪽, 1 오른쪽, 0 없음). 옆: 벌린 정도. */
  step: number;
}
const POSES: Pose[] = [{ bob: 0, step: 0 }, { bob: 0, step: -1 }, { bob: -1, step: 0 }, { bob: 0, step: 1 }, { bob: -1, step: 0 }];

// 머리 윤곽 (y 7~18): 위아래가 둥근 14칸 폭
const HEAD: Array<[number, number]> = [[8, 15], [6, 17], [5, 18], [5, 18], [5, 18], [5, 18], [5, 18], [5, 18], [5, 18], [5, 18], [6, 17], [8, 15]];

function legsFront(c: Canvas, L: Look, step: number): void {
  const [pd, pb, pl] = L.pants;
  const leg = (x: number, raised: boolean, lit: boolean) => {
    const bottom = raised ? 31 : 33;
    c.rect(x, 28, 3, bottom - 27, pb);
    c.vline(x + 2, 28, bottom, pd);
    if (lit) c.vline(x, 28, bottom, pl);
    const sy = bottom + 1;
    c.rect(x - 1, sy, 4, 2, L.shoes[0]);
    c.hline(x - 1, x + 1, sy, L.shoes[1]);
  };
  c.rect(8, 28, 8, 1, pd); // 가랑이
  leg(8, step === -1, true);
  leg(13, step === 1, false);
}

function legsSide(c: Canvas, L: Look, step: number): void {
  const [pd, pb, pl] = L.pants;
  if (step === 0) {
    c.rect(10, 28, 4, 6, pb);
    c.vline(13, 28, 33, pd);
    c.vline(10, 28, 33, pl);
    c.rect(10, 34, 5, 2, L.shoes[0]);
    c.hline(10, 13, 34, L.shoes[1]);
    return;
  }
  // 뒤로 뻗은 다리 (멀리 있는 쪽, 어둡게) → 앞으로 내디딘 다리
  const far = step === 1 ? pd : pb, near = step === 1 ? pb : pd;
  c.rect(9, 28, 3, 3, far);
  c.rect(7, 31, 3, 2, far);
  c.rect(6, 33, 4, 2, L.shoes[0]);
  c.rect(11, 28, 3, 3, near);
  c.rect(13, 31, 3, 3, near);
  c.vline(11, 28, 30, step === 1 ? pl : near);
  c.rect(13, 34, 5, 2, L.shoes[0]);
  c.hline(13, 16, 34, L.shoes[1]);
}

function torso(c: Canvas, L: Look, dir: Dir, by: number, step: number): void {
  const [td, tb, tl] = L.top;
  const [sd, sb, sl] = L.sleeve ?? L.top;
  const [kd, kb] = L.skin;
  const y = 19 + by;
  if (dir === "side") {
    c.rect(8, y, 8, 9, tb);
    c.vline(8, y, y + 8, tl);
    c.vline(15, y, y + 8, td);
    c.hline(8, 15, y + 8, td);
    if (L.overalls) {
      c.rect(9, y + 3, 6, 6, L.overalls[1]);
      c.vline(14, y + 3, y + 8, L.overalls[0]);
      c.vline(11, y, y + 2, L.overalls[1]);
    }
    if (L.apron) {
      c.rect(12, y + 2, 4, 7, L.apron[1]);
      c.vline(15, y + 2, y + 8, L.apron[0]);
      c.vline(12, y + 2, y + 8, L.apron[2]);
    }
    if (L.back === "wrench") {
      c.vline(7, y + 1, y + 7, col("steel", 4));
      c.rect(6, y - 1, 3, 2, col("steel", 5));
      c.set(7, y - 1, null);
    }
    // 팔: 걸음에 맞춰 앞뒤로 흔든다
    const sw = step === 0 ? 0 : step === 1 ? -2 : 2;
    c.rect(10, y + 1, 3, 3, sb);
    c.rect(10 + Math.sign(sw), y + 4, 3, 2, sb);
    c.vline(10, y + 1, y + 3, sl);
    c.hline(10 + Math.sign(sw), 12 + Math.sign(sw), y + 5, sd);
    c.rect(10 + sw, y + 6, 3, 2, kb);
    c.hline(10 + sw, 12 + sw, y + 7, kd);
    return;
  }
  c.rect(7, y, 10, 9, tb);
  c.vline(7, y, y + 8, tl);
  c.vline(16, y, y + 8, td);
  c.hline(7, 16, y + 8, td);
  if (dir === "down") {
    c.vline(11, y + 1, y + 7, td); // 여밈
    if (L.overalls) {
      c.rect(8, y + 3, 8, 6, L.overalls[1]);
      c.vline(15, y + 3, y + 8, L.overalls[0]);
      c.vline(8, y + 3, y + 8, L.overalls[2]);
      c.vline(9, y, y + 2, L.overalls[1]);
      c.vline(14, y, y + 2, L.overalls[1]);
      c.set(9, y + 3, col("gold", 5));
      c.set(14, y + 3, col("gold", 5));
      c.rect(10, y + 5, 4, 2, L.overalls[0]); // 가슴 주머니
    }
    if (L.apron) {
      c.rect(8, y + 2, 8, 7, L.apron[1]);
      c.vline(8, y + 2, y + 8, L.apron[2]);
      c.vline(15, y + 2, y + 8, L.apron[0]);
      c.set(9, y + 1, L.apron[1]);
      c.set(14, y + 1, L.apron[1]);
      c.hline(10, 13, y + 6, L.apron[0]); // 주머니
    }
  } else {
    c.vline(8, y + 1, y + 7, tl);
    if (L.overalls) {
      c.rect(8, y + 4, 8, 5, L.overalls[1]);
      c.vline(15, y + 4, y + 8, L.overalls[0]);
      c.line(9, y, 14, y + 4, L.overalls[1]);
      c.line(14, y, 9, y + 4, L.overalls[1]);
    }
    if (L.apron) {
      c.line(8, y + 1, 15, y + 5, L.apron[1]);
      c.line(15, y + 1, 8, y + 5, L.apron[1]);
      c.hline(8, 15, y + 6, L.apron[0]);
    }
    if (L.back === "wrench") {
      // 등에 비스듬히 멘 큰 렌치
      c.line(8, y + 7, 14, y + 1, col("steel", 5));
      c.line(9, y + 7, 15, y + 1, col("steel", 4));
      c.line(10, y + 7, 16, y + 1, col("steel", 2));
      c.rect(14, y - 3, 5, 4, col("steel", 4));
      c.hline(14, 18, y - 3, col("steel", 5));
      c.rect(16, y - 3, 1, 2, null);
      c.rect(7, y + 6, 3, 3, col("steel", 3));
    }
  }
  // 팔: 반대쪽 다리와 함께 나간다
  const la = step === 1 ? 1 : step === -1 ? -1 : 0;
  const arm = (x: number, dy: number, lit: boolean) => {
    c.rect(x, y + 1 + dy, 2, 6, sb);
    c.vline(lit ? x : x + 1, y + 1 + dy, y + 6 + dy, lit ? sl : sd);
    c.rect(x, y + 7 + dy, 2, 2, kb);
    c.hline(x, x + 1, y + 8 + dy, kd);
  };
  arm(5, la, true);
  arm(17, -la, false);
}

function head(c: Canvas, L: Look, dir: Dir, by: number): void {
  const [kd, kb, kl] = L.skin;
  const [hd, hb, hl] = L.hair;
  const y = 7 + by;
  c.rows(y, HEAD, kb);

  if (dir === "up") {
    // 뒤통수: 머리카락이 머리를 다 덮는다
    if (L.hairStyle === "bald") {
      c.rows(y, HEAD, hb);
      c.vline(18, y + 2, y + 9, hd);
      c.rows(y + 9, [[5, 18], [6, 17]], hd);
      c.hline(9, 14, y + 11, kd);
      c.hline(7, 10, y + 3, hl);
    } else {
      c.rows(y - 2, [[8, 15], [6, 17]], hb);
      c.rows(y, HEAD, hb);
      for (let j = 3; j < 10; j++) c.set(18, y + j, hd);
      c.rows(y + 9, [[5, 18], [6, 17], [8, 15]], hd);
      c.hline(8, 12, y - 1, hl);
      c.hline(7, 9, y + 1, hl);
      if (L.hairStyle === "bob") {
        c.rect(4, y + 5, 2, 7, hb);
        c.rect(18, y + 5, 2, 7, hd);
        c.hline(5, 18, y + 12, hd);
      } else c.hline(10, 13, y + 11, kd); // 목덜미
    }
  } else if (dir === "down") {
    c.vline(18, y + 4, y + 9, kd);
    c.hline(8, 15, y + 11, kd);
    c.vline(5, y + 4, y + 8, kl);
    if (L.hairStyle === "bald") {
      c.rect(5, y + 2, 1, 5, hb);
      c.rect(18, y + 2, 1, 5, hd);
    } else {
      c.rows(y - 2, [[8, 15], [6, 17], [5, 18], [5, 18], [5, 18]], hb);
      // 들쭉날쭉한 앞머리
      for (const x of [5, 6, 7, 9, 10, 13, 16, 17, 18]) c.set(x, y + 3, hb);
      for (const x of [5, 6, 17, 18]) c.set(x, y + 4, hb);
      c.vline(5, y + 5, y + 6, hb);
      c.vline(18, y + 3, y + 6, hd);
      c.hline(8, 12, y - 1, hl);
      c.hline(7, 9, y + 1, hl);
      c.hline(8, 15, y + 3, kd); // 앞머리 그늘
      for (const x of [9, 10, 13]) c.set(x, y + 3, hb);
      if (L.hairStyle === "bob") {
        c.rect(4, y + 3, 2, 8, hb);
        c.rect(18, y + 3, 2, 8, hd);
        c.vline(4, y + 4, y + 9, hl);
      }
    }
    // 얼굴
    c.rect(8, y + 5, 2, 2, ink);
    c.rect(14, y + 5, 2, 2, ink);
    c.set(8, y + 5, col("violet", 2));
    c.set(14, y + 5, col("violet", 2));
    if (L.blush) {
      c.set(7, y + 7, col("rose", 4));
      c.set(16, y + 7, col("rose", 4));
    }
    c.hline(11, 12, y + 8, kd);
    if (L.beard) {
      const [bd, bb, bl] = L.beard;
      c.rows(y + 7, [[6, 17], [6, 17], [6, 17], [7, 16], [8, 15], [9, 14], [10, 13]], bb);
      c.hline(8, 15, y + 7, bl);
      c.hline(10, 13, y + 8, kd); // 입
      c.vline(17, y + 8, y + 9, bd);
      c.hline(10, 13, y + 13, bd);
      c.set(9, y + 12, bd);
      c.set(14, y + 12, bd);
    }
  } else {
    // 옆모습 (오른쪽을 본다): 뒤쪽은 머리카락, 앞쪽은 얼굴
    c.set(19, y + 7, kb); // 코
    c.hline(12, 17, y + 11, kd);
    if (L.hairStyle === "bald") {
      c.rows(y + 2, [[5, 9], [5, 9], [5, 9], [5, 9], [5, 8], [5, 8], [6, 8]], hb);
      c.vline(5, y + 3, y + 7, hd);
      c.set(10, y + 5, kd);
    } else {
      c.rows(y - 2, [[8, 15], [6, 17], [5, 18], [5, 18], [5, 18]], hb);
      c.rows(y + 3, [[5, 13], [5, 11], [5, 10], [5, 10], [5, 9], [5, 9], [6, 9]], hb);
      c.set(15, y + 3, hb);
      c.set(17, y + 3, hb);
      c.vline(5, y + 3, y + 8, hd);
      c.hline(8, 12, y - 1, hl);
      c.hline(7, 9, y + 1, hl);
      if (L.hairStyle === "bob") {
        c.rect(4, y + 3, 6, 9, hb);
        c.vline(4, y + 4, y + 10, hd);
        c.hline(4, 9, y + 12, hd);
      }
    }
    c.rect(15, y + 5, 2, 2, ink);
    c.set(15, y + 5, col("violet", 2));
    if (L.blush) c.set(14, y + 7, col("rose", 4));
    c.set(17, y + 9, kd);
    if (L.beard) {
      const [bd, bb, bl] = L.beard;
      c.rows(y + 7, [[12, 18], [11, 19], [11, 19], [12, 18], [13, 17], [14, 16]], bb);
      c.hline(13, 18, y + 7, bl);
      c.hline(13, 16, y + 12, bd);
      c.set(19, y + 7, kb);
    }
  }

  if (L.cap) {
    const [cd, cb, cl] = L.cap;
    c.rows(y - 3, [[8, 15], [6, 17], [5, 18], [5, 18]], cb);
    c.hline(8, 12, y - 2, cl);
    c.hline(5, 18, y, cd);
    if (dir === "down") {
      c.hline(4, 19, y + 1, cb); // 챙
      c.hline(4, 19, y + 2, cd);
    } else if (dir === "side") {
      c.hline(12, 21, y + 1, cb);
      c.hline(13, 21, y + 2, cd);
    }
  }
}

function scarf(c: Canvas, L: Look, dir: Dir, by: number, pose: number): void {
  if (!L.scarf) return;
  const [sd, sb, sl] = L.scarf;
  const y = 19 + by;
  const flap = pose === 2 || pose === 4 ? 1 : 0;
  if (dir === "side") {
    c.rect(8, y, 8, 2, sb);
    c.hline(8, 15, y + 1, sd);
    c.hline(9, 12, y, sl);
    // 뒤로 날리는 자락
    c.rect(5, y + 1 - flap, 3, 2, sb);
    c.rect(3, y + 2 - flap, 3, 2, sb);
    c.hline(3, 5, y + 3 - flap, sd);
  } else {
    c.rect(7, y, 10, 2, sb);
    c.hline(7, 16, y + 1, sd);
    c.hline(8, 11, y, sl);
    if (dir === "down") {
      c.rect(14, y + 2, 2, 3 + flap, sb);
      c.vline(15, y + 2, y + 4 + flap, sd);
    } else {
      c.rect(11, y + 2, 2, 4 + flap, sb);
      c.vline(12, y + 2, y + 5 + flap, sd);
    }
  }
}

function frame(L: Look, dir: Dir, pose: number): Canvas {
  const c = new Canvas(CW, CH);
  const p = POSES[pose];
  if (dir === "side") legsSide(c, L, p.step);
  else legsFront(c, L, p.step);
  // 등에 멘 것은 뒤에서 볼 때 머리보다 앞에 온다
  if (dir === "up") {
    head(c, L, dir, p.bob);
    torso(c, L, dir, p.bob, p.step);
    scarf(c, L, dir, p.bob, pose);
  } else {
    torso(c, L, dir, p.bob, p.step);
    head(c, L, dir, p.bob);
    scarf(c, L, dir, p.bob, pose);
  }
  return c.outline(3);
}

export function sheet(L: Look): Canvas {
  return stack((["down", "up", "side"] as Dir[]).map((d) => strip([0, 1, 2, 3, 4].map((p) => frame(L, d, p)))));
}

const SKIN: Tones = [col("skin", 3), col("skin", 5), col("skin", 6)];

export const hero = () =>
  sheet({
    skin: SKIN,
    hair: [col("violet", 0), col("blueM", 1), col("blueM", 3)],
    hairStyle: "short",
    top: [col("gold", 2), col("gold", 4), col("gold", 5)],
    pants: [col("blueM", 0), col("blueM", 1), col("blueM", 2)],
    shoes: [col("wood", 1), col("wood", 3)],
    scarf: [col("rust", 2), col("rust", 3), col("orange", 4)],
    back: "wrench",
    blush: true,
  });

export const oldman = () =>
  sheet({
    skin: [col("skin", 2), col("skin", 4), col("skin", 5)],
    hair: [col("stone", 3), col("stone", 5), col("stone", 6)],
    hairStyle: "bald",
    top: [col("stone", 4), col("skin", 6), paper],
    pants: [col("wood", 0), col("wood", 1), col("wood", 2)],
    shoes: [col("rustM", 0), col("rustM", 2)],
    apron: [col("green", 1), col("green", 2), col("green", 3)],
    beard: [col("stone", 4), col("stone", 6), paper],
    cap: [col("greenM", 1), col("greenM", 2), col("greenM", 4)],
  });

export const villager = () =>
  sheet({
    skin: SKIN,
    hair: [col("rust", 1), col("rust", 3), col("orange", 4)],
    hairStyle: "bob",
    top: [col("stone", 4), col("skin", 6), paper],
    pants: [col("blue", 1), col("blue", 2), col("blue", 3)],
    shoes: [col("wood", 0), col("wood", 2)],
    overalls: [col("blue", 1), col("blue", 2), col("blue", 3)],
    blush: true,
  });

// ── 괴물 ────────────────────────────────────────────────────

export const SW = 24, SH = 20;

/** 곰팡이 슬라임: 눌렸다 늘어나며 통통 뛴다. */
export function slime(): Canvas {
  // [가로 반지름, 세로 반지름, 떠오른 높이]
  const hop: Array<[number, number, number]> = [[9, 6, 0], [10, 5, 0], [8, 7, 2], [8.5, 6.5, 3], [10, 5, 0]];
  const body = col("teal", 3), dark = col("teal", 2), deep = col("blue", 1), light = col("teal", 5);
  const one = (dir: Dir, i: number) => {
    const c = new Canvas(SW, SH);
    const [rx, ry, up] = hop[i];
    const cx = 11.5, cy = SH - 2 - ry - up;
    c.ellipse(cx, cy, rx, ry, (_x, _y, nx, ny) => (nx + ny > 0.75 ? deep : nx + ny > 0.25 ? dark : nx + ny < -0.8 ? light : body));
    // 바닥에 닿은 면은 평평하다
    const by = Math.round(cy + ry);
    c.hline(Math.round(cx - rx * 0.7), Math.round(cx + rx * 0.7), by, deep);
    // 윤기
    c.set(cx - rx * 0.45, cy - ry * 0.55, paper);
    c.set(cx - rx * 0.45 + 1, cy - ry * 0.55, light);
    // 곰팡이 점
    c.over(cx + rx * 0.45, cy - ry * 0.35, col("leaf", 4));
    c.over(cx - rx * 0.1, cy - ry * 0.7, col("leaf", 4));
    c.over(cx + rx * 0.15, cy + ry * 0.45, col("leaf", 3));
    const ey = Math.round(cy - ry * 0.05);
    const eye = (x: number) => {
      c.rect(x, ey, 2, 2, col("gold", 6));
      c.set(x + 1, ey + 1, col("gold", 4));
      c.set(x, ey - 1, deep);
      c.set(x + 1, ey - 1, deep);
    };
    if (dir === "down") {
      eye(Math.round(cx - 4.5));
      eye(Math.round(cx + 2.5));
    } else if (dir === "side") {
      eye(Math.round(cx + 1.5));
      eye(Math.round(cx + 5.5));
    } else c.over(cx, cy - ry * 0.2, dark);
    if (up === 0 && i > 0) {
      // 내려앉을 때 튀는 물방울
      c.set(cx - rx - 1, by, dark);
      c.set(cx + rx + 1, by, deep);
    }
    return c.outline(2);
  };
  return stack((["down", "up", "side"] as Dir[]).map((d) => strip([0, 1, 2, 3, 4].map((i) => one(d, i)))));
}

export const KW = 32, KH = 22;

/** 고철 게: 녹슨 등딱지에 붉은 외눈, 다리를 번갈아 든다. */
export function crab(): Canvas {
  const shell = col("rust", 3), sl = col("orange", 4), sd = col("rust", 2), sdd = col("rust", 1);
  const metal = col("steel", 3), md = col("steel", 1), ml = col("steel", 5);
  const one = (dir: Dir, i: number) => {
    const c = new Canvas(KW, KH);
    const a = i === 1 || i === 2 ? 1 : 0, b = i === 3 || i === 4 ? 1 : 0;
    const cx = 15.5;
    // 다리 셋씩: 번갈아 한 칸 든다
    const leg = (side: number, k: number, lift: number) => {
      const x0 = cx + side * (6 + k), y0 = 12 + k * 2;
      const x1 = cx + side * (10 + k * 1.5), y1 = 11 + k * 2 - lift;
      const x2 = cx + side * (12 + k * 1.2), y2 = KH - 2 - lift - (2 - k);
      c.line(x0, y0, x1, y1, metal);
      c.line(x1, y1, x2, y2, md);
      c.set(x1, y1, ml);
    };
    for (let k = 0; k < 3; k++) {
      leg(-1, k, k % 2 === 0 ? a : b);
      leg(1, k, k % 2 === 0 ? b : a);
    }
    if (dir === "side") {
      // 앞으로 내민 집게 하나
      c.rect(24, 12, 5, 3, metal);
      c.hline(24, 28, 12, ml);
      c.rect(28, 10, 3, 2, sd);
      c.rect(28, 15, 3, 2, sdd);
    } else if (dir === "down") {
      for (const s of [-1, 1]) {
        const x = cx + s * 10.5;
        c.rect(Math.round(x - 1.5), 14, 4, 4, shell);
        c.hline(Math.round(x - 1.5), Math.round(x + 1.5), 14, sl);
        c.rect(Math.round(x - 1.5), 18, 1, 2, md);
        c.rect(Math.round(x + 1.5), 18, 1, 2, md);
        c.set(Math.round(x), 18, sdd);
      }
    }
    // 등딱지: 납작한 돔
    c.ellipse(cx, 11, 9.5, 6, (_x, y, nx, ny) => (y > 14 ? sdd : nx + ny > 0.7 ? sd : nx + ny < -0.75 ? sl : shell));
    c.hline(8, 23, 15, md);
    c.hline(9, 22, 16, md);
    // 판금 이음과 리벳
    c.line(11, 6, 10, 13, sd);
    c.line(20, 6, 21, 13, sd);
    c.over(9, 10, ml);
    c.over(22, 10, md);
    c.over(15, 6, sl);
    c.over(18, 12, col("gold", 3)); // 녹 얼룩
    c.over(19, 12, col("gold", 3));
    if (dir === "down" || dir === "side") {
      const ex = dir === "down" ? 14 : 20;
      c.rect(ex - 1, 9, 5, 4, md);
      c.rect(ex, 10, 3, 2, col("rose", 4));
      c.set(ex + 1, 10, paper);
      c.set(ex + 2, 11, col("rust", 2));
    } else {
      // 뒤: 배기구
      c.rect(13, 9, 6, 3, md);
      c.hline(14, 17, 10, col("steel", 0));
      c.set(11, 4, md);
      c.vline(11, 3, 5, metal);
    }
    return c.outline(3);
  };
  return stack((["down", "up", "side"] as Dir[]).map((d) => strip([0, 1, 2, 3, 4].map((i) => one(d, i)))));
}
