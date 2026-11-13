import type { Project, Scene, PrefabKind, NavGrid, Box, Action, LightProps } from "@age/model";

// 시뮬레이션은 Phaser·DOM 을 모른다. 좌표는 모두 화소이고 캐릭터의 위치는 발밑 가운데다.

export type Facing = "down" | "up" | "left" | "right";

/** 한 걸음의 입력. attack·interact 는 "이번 걸음에 눌렸다"는 뜻이다. */
export interface Input {
  moveX: number;
  moveY: number;
  attack: boolean;
  interact: boolean;
}

export const NO_INPUT: Input = { moveX: 0, moveY: 0, attack: false, interact: false };

export type Behavior = "idle" | "wander" | "chase" | "patrol" | "ranged";

export interface Actor {
  id: string;
  prefab: string;
  kind: PrefabKind;
  name?: string;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  /** 충돌 발자국. */
  w: number;
  h: number;
  solid: boolean;
  facing: Facing;
  moving: boolean;
  hp: number;
  maxHp: number;
  /** 초당 화소. */
  speed: number;
  damage: number;
  behavior: Behavior;
  /** 화소. */
  aggroRange: number;
  patrol: Array<{ x: number; y: number }>;
  dialogue?: string;
  light?: LightProps;
  alive: boolean;
  /** 죽은 뒤 흐른 시간 (사라지는 연출용). */
  deadFor: number;
  /** 남은 무적 시간. */
  invuln: number;
  knockX: number;
  knockY: number;
  /** 0 보다 크면 공격 동작 중. */
  attackTimer: number;
  attackCooldown: number;
  /** 이번 공격에 이미 맞은 대상. */
  attackHit: string[];
  ai: {
    state: "rest" | "walk" | "chase" | "return" | "aim";
    timer: number;
    targetX: number;
    targetY: number;
    path: Array<{ x: number; y: number }> | null;
    repath: number;
    patrolIndex: number;
    shotCooldown: number;
  };
  /** 이벤트의 move 동작이 걸어 둔 목표. */
  scripted: { x: number; y: number; speed: number; timeout: number } | null;
}

export interface Projectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  life: number;
}

export interface DialogueState {
  dialogue: string;
  node: string;
  /** 고르고 있는 선택지. */
  choice: number;
}

export interface RunningEvent {
  event: string;
  actions: Action[];
  index: number;
  /** 지금 동작이 시작됐는가. */
  started: boolean;
  timer: number;
}

/** 화면 연출과 테스트가 읽는 사건 기록. */
export type SimEvent =
  | { type: "attack"; actor: string; facing: Facing }
  | { type: "hit"; target: string; by: string; damage: number; x: number; y: number }
  | { type: "death"; actor: string; x: number; y: number }
  | { type: "shoot"; actor: string }
  | { type: "dialogue-open"; dialogue: string }
  | { type: "dialogue-line"; speaker: string; text: string }
  | { type: "dialogue-close" }
  | { type: "event"; event: string }
  | { type: "flag"; flag: string; value: boolean }
  | { type: "player-dead" };

export interface World {
  project: Project;
  scene: Scene;
  tile: number;
  /** 화소 단위 장면 크기. */
  width: number;
  height: number;
  /** 칸마다 걸을 수 있는가 (지형만). */
  walkable: Uint8Array;
  /** 움직이지 않는 단단한 엔티티의 충돌 상자. */
  statics: Box[];
  nav: NavGrid;
  actors: Actor[];
  playerId: string | null;
  projectiles: Projectile[];
  nextProjectile: number;
  flags: Record<string, boolean>;
  dialogue: DialogueState | null;
  running: RunningEvent[];
  fired: Record<string, boolean>;
  /** 주인공이 지금 들어가 있는 접촉 구역의 이벤트. */
  inside: Record<string, boolean>;
  /** 이벤트가 카메라를 잡고 있으면 그 목표. */
  cameraTarget: { x: number; y: number } | null;
  started: boolean;
  time: number;
  status: "playing" | "dead";
  rng: number;
  prevMoveY: number;
}
