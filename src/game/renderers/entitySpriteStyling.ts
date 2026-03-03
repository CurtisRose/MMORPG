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
}

export function styleObjectSprite(
  sprite: Phaser.GameObjects.Sprite,
  objectState: WorldObjectState,
  textureKeys: EntityTextureKeys,
): void {
  const hasCustomImage = Boolean(String(objectState.image ?? '').trim());
  if (hasCustomImage) {
    return;
  }

  if (objectState.objectTypeId === 'signpost') {
    sprite.setTexture(textureKeys.tree);
    return;
  }

  if (objectState.objectTypeId === 'fence') {
    sprite.setTexture(textureKeys.rock);
    return;
  }

  if (objectState.objectTypeId === 'bank_building') {
    sprite.setTexture(textureKeys.rock);
    return;
  }

  if (objectState.objectTypeId === 'general_store_building') {
    sprite.setTexture(textureKeys.rock);
    return;
  }

  if (objectState.objectTypeId === 'smelting_station') {
    sprite.setTexture(textureKeys.rock);
    return;
  }

  if (objectState.objectTypeId === 'smithing_station') {
    sprite.setTexture(textureKeys.rock);
    return;
  }

  if (objectState.objectTypeId === 'fletching_station') {
    sprite.setTexture(textureKeys.tree);
    return;
  }

  sprite.setTexture(textureKeys.rock);
}

export function styleNpcSprite(
  sprite: Phaser.GameObjects.Sprite,
  npcState: NpcState,
  textureKeys: EntityTextureKeys,
): void {
  const hasCustomImage = Boolean(String(npcState.image ?? '').trim());
  if (hasCustomImage) {
    return;
  }

  sprite.setTexture(textureKeys.player);
}
