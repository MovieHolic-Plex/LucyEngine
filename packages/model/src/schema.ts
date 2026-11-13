import { z } from "zod";

// 프로젝트 문서의 스키마. 이 문서가 유일한 정본이다.
// 좌표는 따로 적지 않으면 타일 단위(소수 가능)이고, 엔티티의 위치는 발밑 가운데다.

export const SCHEMA_VERSION = 1;
export const TILE = 24;

const Id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_.:-]+$/);
const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const Coord = z.number().finite();

export const StyleSchema = z.object({
  /** 타일 한 칸의 화소 수. */
  tile: z.number().int().min(8).max(64),
  /** 색 계열별 어두운 색 → 밝은 색. 모든 생성 그림이 이 팔레트로 맞춰진다. */
  palette: z.array(z.array(Hex).min(2)).min(1),
  /** 생성 프롬프트에 붙는 세계관·분위기 설명 (영어 권장). */
  mood: z.string().max(600),
  view: z.literal("three-quarter"),
  light: z.literal("upper-left"),
  /** 윤곽선을 같은 계열에서 몇 단계 어둡게 긋는가. */
  outlineSteps: z.number().int().min(0).max(4),
});
export type Style = z.infer<typeof StyleSchema>;

export const DIRECTIONS = ["down", "up", "side"] as const;

export const AssetSchema = z.object({
  id: Id,
  /** texture = 바닥 무늬, sprite = 정지 그림, character = 방향별 프레임 시트. */
  kind: z.enum(["texture", "sprite", "character"]),
  /** 내용 해시 이름의 파일. null 이면 아직 그림이 없어 임시 상자로 그린다. */
  file: z.string().nullable(),
  /** 파일 전체의 화소 크기. character 는 시트 전체 크기. */
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  /** character 전용: 프레임 배치. 행은 방향, 열은 [서 있기, 걷기 1~4]. */
  frames: z
    .object({
      frameW: z.number().int().positive(),
      frameH: z.number().int().positive(),
      perRow: z.number().int().positive(),
      rows: z.array(z.enum(DIRECTIONS)).min(1),
    })
    .optional(),
  /** 충돌 발자국(화소). 그림 아래 가운데에 놓인 w × h 상자. */
  footprint: z.object({ w: z.number().positive(), h: z.number().positive() }).optional(),
  /** 가림 경계선: 그림 맨 아래에서 이만큼 위가 깊이 정렬 기준이다 (화소). */
  sortOffset: z.number().optional(),
  /** 임시 상자나 미니맵에 쓰는 대표색. */
  color: Hex,
  /** 이 그림을 만든 요청. "다시 그려줘"에 쓴다. */
  prompt: z.string().max(1000).optional(),
});
export type Asset = z.infer<typeof AssetSchema>;

export const MaterialSchema = z.object({
  id: Id,
  name: z.string().max(60),
  /** 바닥 무늬 에셋. 없으면 color 로 칠한다. */
  asset: Id.nullable(),
  color: Hex,
  walkable: z.boolean(),
  /** 높은 재질이 낮은 재질 위로 번진다. */
  priority: z.number().int(),
  edge: z.enum(["soft", "hard"]),
});
export type Material = z.infer<typeof MaterialSchema>;

export const BEHAVIORS = ["idle", "wander", "chase", "patrol", "ranged"] as const;

export const LightPropsSchema = z.object({
  color: Hex,
  /** 타일 단위 반경. */
  radius: z.number().positive().max(40),
  intensity: z.number().min(0).max(2),
  /** 발밑에서 위로 올린 높이 (타일). */
  height: z.number().min(0).max(10).optional(),
  flicker: z.boolean().optional(),
});
export type LightProps = z.infer<typeof LightPropsSchema>;

/** 엔티티 속성. 프리팹이 기본값을 주고 엔티티가 덮어쓴다. */
export const EntityPropsSchema = z.object({
  /** 화면에 보이는 이름 (대화 화자 등). */
  name: z.string().max(60).optional(),
  solid: z.boolean().optional(),
  hp: z.number().int().min(1).max(999).optional(),
  /** 초당 타일. */
  speed: z.number().min(0).max(20).optional(),
  /** 닿거나 맞혔을 때 주는 피해. */
  damage: z.number().int().min(0).max(99).optional(),
  behavior: z.enum(BEHAVIORS).optional(),
  /** 주인공을 알아채는 거리 (타일). */
  aggroRange: z.number().min(0).max(40).optional(),
  /** patrol: 처음 위치에서 오가는 상대 좌표 (타일). */
  patrol: z.array(z.object({ x: Coord, y: Coord })).max(8).optional(),
  /** 말을 걸면 시작하는 대화. */
  dialogue: Id.optional(),
  /** 이 엔티티에 붙은 광원. */
  light: LightPropsSchema.optional(),
  /** 좌우 뒤집어 그린다. */
  flip: z.boolean().optional(),
});
export type EntityProps = z.infer<typeof EntityPropsSchema>;

export const PREFAB_KINDS = ["player", "npc", "enemy", "prop", "building"] as const;
export type PrefabKind = (typeof PREFAB_KINDS)[number];

export const PrefabSchema = z.object({
  id: Id,
  name: z.string().max(60),
  kind: z.enum(PREFAB_KINDS),
  asset: Id,
  props: EntityPropsSchema,
});
export type Prefab = z.infer<typeof PrefabSchema>;

export const EntitySchema = z.object({
  id: Id,
  prefab: Id,
  x: Coord,
  y: Coord,
  /** 프리팹 기본값을 덮어쓰는 속성. */
  props: EntityPropsSchema.optional(),
  /** 행동 스크립트 자리. v1 에서는 항상 비어 있다. */
  behaviorScript: z.null().optional(),
});
export type Entity = z.infer<typeof EntitySchema>;

export const LightSchema = LightPropsSchema.extend({ id: Id, x: Coord, y: Coord });
export type Light = z.infer<typeof LightSchema>;

export const PostSchema = z.object({
  bloom: z.number().min(0).max(1),
  vignette: z.number().min(0).max(1),
  saturation: z.number().min(-1).max(1),
  contrast: z.number().min(-1).max(1),
});
export type Post = z.infer<typeof PostSchema>;

export const DialogueNodeSchema = z.object({
  id: Id,
  speaker: z.string().max(60),
  text: z.string().max(600),
  /** 선택지. 있으면 next 대신 고른 선택지의 next 로 간다. */
  choices: z.array(z.object({ text: z.string().max(120), next: Id.nullable() })).max(4).optional(),
  /** 다음 대사. 생략하면 목록의 다음 대사, null 이면 끝. */
  next: Id.nullable().optional(),
});
export type DialogueNode = z.infer<typeof DialogueNodeSchema>;

export const DialogueSchema = z.object({ id: Id, nodes: z.array(DialogueNodeSchema).min(1).max(60) });
export type Dialogue = z.infer<typeof DialogueSchema>;

const Point = z.object({ x: Coord, y: Coord });
const Rect = z.object({ x: Coord, y: Coord, w: z.number().positive(), h: z.number().positive() });
export type RectT = z.infer<typeof Rect>;

export const TriggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start") }),
  /** 주인공이 구역(타일)에 들어설 때. */
  z.object({ type: z.literal("touch"), area: Rect }),
  /** 주인공이 엔티티에 말을 걸거나 조사할 때. */
  z.object({ type: z.literal("interact"), entity: Id }),
]);
export type Trigger = z.infer<typeof TriggerSchema>;

export const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("dialogue"), dialogue: Id }),
  z.object({ type: z.literal("move"), entity: Id, to: Point, speed: z.number().positive().max(20).optional() }),
  z.object({ type: z.literal("camera"), to: Point, seconds: z.number().min(0).max(20) }),
  z.object({ type: z.literal("flag"), flag: Id, value: z.boolean() }),
]);
export type Action = z.infer<typeof ActionSchema>;

export const GameEventSchema = z.object({
  id: Id,
  trigger: TriggerSchema,
  /** 이 깃발이 이 값일 때만 실행한다. */
  condition: z.object({ flag: Id, equals: z.boolean() }).optional(),
  once: z.boolean(),
  actions: z.array(ActionSchema).min(1).max(20),
});
export type GameEvent = z.infer<typeof GameEventSchema>;

export const SceneSchema = z.object({
  id: Id,
  name: z.string().max(80),
  /** 칸 수. */
  w: z.number().int().min(4).max(96),
  h: z.number().int().min(4).max(96),
  /** 칸마다 재질 id. 길이 w × h, 행 우선. */
  terrain: z.array(Id),
  entities: z.record(Id, EntitySchema),
  lights: z.record(Id, LightSchema),
  /** 주변광 색. 흰색이면 조명이 없는 낮이다. */
  ambient: Hex,
  post: PostSchema,
  dialogues: z.record(Id, DialogueSchema),
  events: z.record(Id, GameEventSchema),
});
export type Scene = z.infer<typeof SceneSchema>;

export const ProjectSchema = z.object({
  meta: z.object({
    name: z.string().max(80),
    schemaVersion: z.literal(SCHEMA_VERSION),
    /** id 를 만들 때 쓰는 일련번호. */
    seq: z.number().int().nonnegative(),
  }),
  style: StyleSchema,
  assets: z.record(Id, AssetSchema),
  materials: z.record(Id, MaterialSchema),
  prefabs: z.record(Id, PrefabSchema),
  scenes: z.record(Id, SceneSchema),
  startScene: Id,
});
export type Project = z.infer<typeof ProjectSchema>;

/** 프리팹 기본값 위에 엔티티의 덮어쓰기를 얹은 최종 속성. */
export function resolveProps(project: Project, entity: Entity): EntityProps {
  const prefab = project.prefabs[entity.prefab];
  return { ...(prefab?.props ?? {}), ...(entity.props ?? {}) };
}

export function findPlayer(project: Project, scene: Scene): Entity | null {
  for (const e of Object.values(scene.entities)) if (project.prefabs[e.prefab]?.kind === "player") return e;
  return null;
}

/** 스키마와 참조 무결성 밖의 구조 검사: 지형 길이가 맞는가. */
export function validateProject(value: unknown): Project {
  const p = ProjectSchema.parse(value);
  for (const s of Object.values(p.scenes)) {
    if (s.terrain.length !== s.w * s.h) throw new Error(`scene ${s.id}: terrain length ${s.terrain.length} != ${s.w}x${s.h}`);
  }
  if (!p.scenes[p.startScene]) throw new Error(`startScene ${p.startScene} does not exist`);
  return p;
}
