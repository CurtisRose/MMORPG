import Phaser from 'phaser';
import type { NpcState, WorldNodeState, WorldObjectState } from '../net/MultiplayerClient';

interface EntityVisual<TState> {
  state: TState;
  sprite: Phaser.GameObjects.Sprite;
}

export function syncNodeVisuals(params: {
  nodes: Record<string, WorldNodeState>;
  worldNodes: Map<string, EntityVisual<WorldNodeState>>;
  getWorldPositionFromTile: (tileX: number, tileY: number) => Phaser.Math.Vector2;
  createNodeSprite: (worldX: number, worldY: number, textureKey: string) => Phaser.GameObjects.Sprite;
  styleNodeSprite: (sprite: Phaser.GameObjects.Sprite, nodeState: WorldNodeState) => void;
  treeTextureKey: string;
  rockTextureKey: string;
}): void {
  for (const nodeState of Object.values(params.nodes)) {
    const position = params.getWorldPositionFromTile(nodeState.tileX, nodeState.tileY);
    const textureKey = nodeState.type === 'tree' ? params.treeTextureKey : params.rockTextureKey;

    const existingNode = params.worldNodes.get(nodeState.id);
    if (existingNode) {
      existingNode.state = nodeState;
      existingNode.sprite.setPosition(position.x, position.y);
      params.styleNodeSprite(existingNode.sprite, nodeState);
      continue;
    }

    const nodeSprite = params.createNodeSprite(position.x, position.y, textureKey);
    params.styleNodeSprite(nodeSprite, nodeState);
    params.worldNodes.set(nodeState.id, {
      state: nodeState,
      sprite: nodeSprite,
    });
  }

  const visibleNodeIds = new Set(Object.keys(params.nodes));
  for (const [nodeId, nodeVisual] of params.worldNodes.entries()) {
    if (visibleNodeIds.has(nodeId)) {
      continue;
    }

    nodeVisual.sprite.destroy();
    params.worldNodes.delete(nodeId);
  }
}

export function syncNpcVisuals(params: {
  npcs: Record<string, NpcState>;
  worldNpcs: Map<string, EntityVisual<NpcState>>;
  getWorldPositionFromTile: (tileX: number, tileY: number) => Phaser.Math.Vector2;
  createNpcSprite: (worldX: number, worldY: number, textureKey: string) => Phaser.GameObjects.Sprite;
  styleNpcSprite: (sprite: Phaser.GameObjects.Sprite, npcState: NpcState) => void;
  defaultTextureKey: string;
}): void {
  for (const npcState of Object.values(params.npcs)) {
    const position = params.getWorldPositionFromTile(npcState.tileX, npcState.tileY);

    const existingNpc = params.worldNpcs.get(npcState.id);
    if (existingNpc) {
      existingNpc.state = npcState;
      existingNpc.sprite.setPosition(position.x, position.y);
      params.styleNpcSprite(existingNpc.sprite, npcState);
      continue;
    }

    const npcSprite = params.createNpcSprite(position.x, position.y, params.defaultTextureKey);
    params.styleNpcSprite(npcSprite, npcState);
    params.worldNpcs.set(npcState.id, {
      state: npcState,
      sprite: npcSprite,
    });
  }

  const visibleNpcIds = new Set(Object.keys(params.npcs));
  for (const [npcId, npcVisual] of params.worldNpcs.entries()) {
    if (visibleNpcIds.has(npcId)) {
      continue;
    }

    npcVisual.sprite.destroy();
    params.worldNpcs.delete(npcId);
  }
}

export function syncObjectVisuals(params: {
  objects: Record<string, WorldObjectState>;
  worldObjects: Map<string, EntityVisual<WorldObjectState>>;
  getWorldPositionFromTile: (tileX: number, tileY: number) => Phaser.Math.Vector2;
  createObjectSprite: (worldX: number, worldY: number, textureKey: string) => Phaser.GameObjects.Sprite;
  styleObjectSprite: (sprite: Phaser.GameObjects.Sprite, objectState: WorldObjectState) => void;
  defaultTextureKey: string;
}): void {
  for (const objectState of Object.values(params.objects)) {
    const position = params.getWorldPositionFromTile(objectState.tileX, objectState.tileY);

    const existingObject = params.worldObjects.get(objectState.id);
    if (existingObject) {
      existingObject.state = objectState;
      existingObject.sprite.setPosition(position.x, position.y);
      params.styleObjectSprite(existingObject.sprite, objectState);
      continue;
    }

    const objectSprite = params.createObjectSprite(position.x, position.y, params.defaultTextureKey);
    params.styleObjectSprite(objectSprite, objectState);
    params.worldObjects.set(objectState.id, {
      state: objectState,
      sprite: objectSprite,
    });
  }

  const visibleObjectIds = new Set(Object.keys(params.objects));
  for (const [objectId, objectVisual] of params.worldObjects.entries()) {
    if (visibleObjectIds.has(objectId)) {
      continue;
    }

    objectVisual.sprite.destroy();
    params.worldObjects.delete(objectId);
  }
}
