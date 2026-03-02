export type SkillName =
  | 'woodcutting'
  | 'mining'
  | 'smithing'
  | 'fletching'
  | 'strength'
  | 'defense'
  | 'constitution';

export interface SkillProgressState {
  xp: number;
  level: number;
}

export interface PlayerSkillsState {
  woodcutting: SkillProgressState;
  mining: SkillProgressState;
  smithing: SkillProgressState;
  fletching: SkillProgressState;
  strength: SkillProgressState;
  defense: SkillProgressState;
  constitution: SkillProgressState;
}
