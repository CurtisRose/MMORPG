import { type SkillName } from '../player/skillTypes';

export type ClickFeedbackKind = 'walk' | 'interact' | 'npc-interact';

export type InteractionTargetType =
  | 'node-harvest'
  | 'npc-talk'
  | 'npc-trade'
  | 'object-bank'
  | 'enemy-attack'
  | 'ground-pickup'
  | 'object-crafting'
  | 'object-use';

export interface InteractionTarget {
  type: InteractionTargetType;
  id: string;
  tileX: number;
  tileY: number;
  name: string;
  range: number;
  approachTileX?: number;
  approachTileY?: number;
}

export type SkillLevelSnapshot = Record<SkillName, number>;
