// 예시 장면(기차역 앞 광장)에 쓰이는 그림 목록. 손으로 그린 판과 언어 모델이 그린 판이 같은 주문서를 쓴다.

export type SpecKind = "terrain" | "prop" | "building" | "character" | "creature";

export interface Spec {
  /** 내장 키트의 프리팹(또는 재질) 이름. */
  id: string;
  kind: SpecKind;
  /** 그릴 대상 (영어). */
  desc: string;
  /** 권장 크기(화소). character·creature 는 프레임 하나의 크기. */
  w: number;
  h: number;
  /** 충돌 발자국. 그림 아래 가운데의 상자. */
  footprint?: { w: number; h: number };
}

export const SPECS: Spec[] = [
  { id: "grass", kind: "terrain", desc: "overgrown wild grass, a little unkempt, with a few tiny flowers", w: 144, h: 144 },
  { id: "dirt", kind: "terrain", desc: "packed brown dirt ground with a few pebbles", w: 144, h: 144 },
  { id: "pavement", kind: "terrain", desc: "old cracked concrete paving slabs with weeds growing in the joints", w: 144, h: 144 },
  { id: "water", kind: "terrain", desc: "calm dark teal pond water with small ripples", w: 144, h: 144 },

  { id: "barrel", kind: "prop", desc: "a rusty red oil drum", w: 20, h: 30, footprint: { w: 18, h: 9 } },
  { id: "crate", kind: "prop", desc: "a weathered wooden shipping crate", w: 28, h: 26, footprint: { w: 26, h: 8 } },
  { id: "lamp", kind: "prop", desc: "an old iron street lamp post with a glowing warm lantern on top", w: 20, h: 64, footprint: { w: 9, h: 6 } },
  { id: "bench", kind: "prop", desc: "a worn wooden station bench with iron legs, facing the viewer", w: 36, h: 22, footprint: { w: 27, h: 7 } },
  { id: "sign", kind: "prop", desc: "a wooden signpost with a rusty metal plate with faded unreadable writing", w: 30, h: 36, footprint: { w: 6, h: 6 } },
  { id: "vending", kind: "prop", desc: "an old dented drinks vending machine with faded teal paint and a faintly glowing display window", w: 34, h: 46, footprint: { w: 31, h: 14 } },
  { id: "bush", kind: "prop", desc: "a round leafy green bush", w: 26, h: 22, footprint: { w: 13, h: 7 } },
  { id: "tree", kind: "prop", desc: "a broad leafy tree with a thick trunk and a wide round canopy", w: 88, h: 88, footprint: { w: 30, h: 18 } },
  { id: "rock", kind: "prop", desc: "a mossy grey boulder", w: 22, h: 20, footprint: { w: 18, h: 7 } },
  { id: "fence", kind: "prop", desc: "a short section of old wooden picket fence, some pickets crooked", w: 42, h: 24, footprint: { w: 34, h: 7 } },
  { id: "flowers", kind: "prop", desc: "a small patch of wild flowers, white and yellow", w: 18, h: 14, footprint: { w: 9, h: 6 } },

  { id: "house", kind: "building", desc: "a small ramshackle two-storey house patched together from wooden planks and corrugated tin, a door in the middle of the front wall, lit windows, a slanted rusty tin roof and a stovepipe chimney", w: 106, h: 128, footprint: { w: 98, h: 46 } },
  { id: "shop", kind: "building", desc: "a small ticket-booth shop converted from an old red train carriage, with a red-and-cream striped awning over a counter window, a door on the right and a hand-painted sign on the roof", w: 106, h: 110, footprint: { w: 92, h: 42 } },

  { id: "hero", kind: "character", desc: "a young adventurer girl with short dark hair, a red scarf, a mustard-yellow jacket, dark trousers and a big wrench strapped on her back", w: 24, h: 36 },
  { id: "oldman", kind: "character", desc: "an old shopkeeper man with a white beard, a flat cap, a cream shirt and a green apron", w: 24, h: 36 },
  { id: "villager", kind: "character", desc: "a young mechanic woman with auburn hair in a bob, blue overalls over a cream shirt", w: 24, h: 36 },

  { id: "slime", kind: "creature", desc: "a small blobby teal mould slime with glowing yellow eyes", w: 24, h: 20 },
  { id: "crab", kind: "creature", desc: "a small rusty scrap-metal crab robot with one glowing red eye, two claws and six legs", w: 32, h: 22 },
];
