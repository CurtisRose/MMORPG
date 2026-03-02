import Phaser from 'phaser';
import type { NpcState, WorldNodeState, WorldObjectState } from '../net/MultiplayerClient';

export interface EntityTextureKeys {
  player: string;
  tree: string;
  rock: string;
}

export function styleNodeSprite(
  sprite: Phaser.GameObjects.Sprite,
  nodeState: WorldNodeState,
): void {
  sprite.setAlpha(nodeState.isDepleted ? 0.35 : 1);
  sprite.clearTint();

  const resourceTintById: Record<string, number> = {
    birch_tree: 0x9ed37c,
    oak_tree: 0x4a8f3a,
    copper_rock: 0xc9834f,
    tin_rock: 0xa8b7c7,
    iron_rock: 0x7f8c98,
  };

  const resourceTint = resourceTintById[nodeState.resourceId];
  if (resourceTint !== undefined) {
    sprite.setTint(resourceTint);
  }

  if (nodeState.isDepleted) {
    sprite.setTint(0x7a7a7a);
  }
}

export function styleObjectSprite(
  sprite: Phaser.GameObjects.Sprite,
  objectState: WorldObjectState,
  textureKeys: EntityTextureKeys,
): void {
  sprite.clearTint();

  if (objectState.objectTypeId === 'signpost') {
    sprite.setTexture(textureKeys.tree).setTint(0xc9a45d);
    return;
  }

  if (objectState.objectTypeId === 'fence') {
    sprite.setTexture(textureKeys.rock).setTint(0x8e6b45);
    return;
  }

  if (objectState.objectTypeId === 'bank_building') {
    sprite.setTexture(textureKeys.rock).setTint(0x8a8f95);
    return;
  }

  if (objectState.objectTypeId === 'general_store_building') {
    sprite.setTexture(textureKeys.rock).setTint(0x7e6b52);
    return;
  }

  if (objectState.objectTypeId === 'smelting_station') {
    sprite.setTexture(textureKeys.rock).setTint(0xd07f3f);
    return;
  }

  if (objectState.objectTypeId === 'smithing_station') {
    sprite.setTexture(textureKeys.rock).setTint(0x9a9ea8);
    return;
  }

  if (objectState.objectTypeId === 'fletching_station') {
    sprite.setTexture(textureKeys.tree).setTint(0x8d6f47);
    return;
  }

  sprite.setTexture(textureKeys.rock).setTint(0x9b9b9b);
}

export function styleNpcSprite(
  sprite: Phaser.GameObjects.Sprite,
  npcState: NpcState,
  textureKeys: EntityTextureKeys,
): void {
  if (npcState.type === 'bank_chest') {
    sprite.setTexture(textureKeys.rock).setTint(0xb08b4f);
    return;
  }

  sprite.setTexture(textureKeys.player).setTint(0xc9a4ff);
}
