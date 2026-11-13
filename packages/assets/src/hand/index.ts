import type { Canvas } from "./kit";
import * as terrain from "./terrain";
import * as chars from "./chars";
import * as props from "./props";
import * as buildings from "./buildings";

export * from "./kit";
export * from "./specs";

/** 손으로 그린 그림들. 이름은 specs.ts 의 id 와 같다. */
export const HAND: Record<string, () => Canvas> = {
  grass: terrain.grass,
  dirt: terrain.dirt,
  pavement: terrain.pavement,
  water: terrain.water,
  planks: terrain.planks,
  hero: chars.hero,
  oldman: chars.oldman,
  villager: chars.villager,
  slime: chars.slime,
  crab: chars.crab,
  ...props.PROPS,
  ...buildings.BUILDINGS,
};
