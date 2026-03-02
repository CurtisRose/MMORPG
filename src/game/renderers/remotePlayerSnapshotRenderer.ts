import Phaser from 'phaser';
import type { RemotePlayerState } from '../net/MultiplayerClient';

interface RemotePlayerVisualLike {
  state: RemotePlayerState;
  sprite: Phaser.GameObjects.Sprite;
  targetTilePosition: Phaser.Math.Vector2;
  renderedTilePosition: Phaser.Math.Vector2;
  pathWaypoints: Phaser.Math.Vector2[];
  healthBar: Phaser.GameObjects.Graphics;
  healthBarVisibleUntil: number;
  harvestingIndicator: Phaser.GameObjects.Image;
  harvestingIndicatorPhase: number;
}

export function upsertRemotePlayerVisual(params: {
  remotePlayers: Map<string, RemotePlayerVisualLike>;
  playerState: RemotePlayerState;
  resolveTilePosition: (playerState: RemotePlayerState) => Phaser.Math.Vector2;
  getWorldPositionFromTile: (tileX: number, tileY: number) => Phaser.Math.Vector2;
  buildPathWaypoints: (playerState: RemotePlayerState) => Phaser.Math.Vector2[];
  createPlayerSprite: (x: number, y: number, textureKey: string) => Phaser.GameObjects.Sprite;
  createHealthBar: () => Phaser.GameObjects.Graphics;
  createHarvestingIndicator: (x: number, y: number, textureKey: string) => Phaser.GameObjects.Image;
  playerTextureKey: string;
  harvestIndicatorTextureKey: string;
  healthBarVisibleMs: number;
  tileSize: number;
  showFloatingText: (worldX: number, worldY: number, text: string, color: string) => void;
}): void {
  const tilePosition = params.resolveTilePosition(params.playerState);
  const worldPosition = params.getWorldPositionFromTile(tilePosition.x, tilePosition.y);

  const existingPlayer = params.remotePlayers.get(params.playerState.id);
  if (existingPlayer) {
    const hpChanged = existingPlayer.state.hp !== params.playerState.hp;
    const previousHp = existingPlayer.state.hp;
    existingPlayer.state = params.playerState;
    existingPlayer.targetTilePosition.copy(tilePosition);
    existingPlayer.pathWaypoints = params.buildPathWaypoints(params.playerState);

    if (hpChanged) {
      existingPlayer.healthBarVisibleUntil = Date.now() + params.healthBarVisibleMs;

      if (previousHp > params.playerState.hp) {
        params.showFloatingText(
          existingPlayer.sprite.x,
          existingPlayer.sprite.y - params.tileSize * 0.7,
          `-${Math.round(previousHp - params.playerState.hp)}`,
          '#ffb1b1',
        );
      }
    }

    if (
      Phaser.Math.Distance.Between(
        existingPlayer.renderedTilePosition.x,
        existingPlayer.renderedTilePosition.y,
        existingPlayer.targetTilePosition.x,
        existingPlayer.targetTilePosition.y,
      ) > 4
    ) {
      existingPlayer.renderedTilePosition.copy(existingPlayer.targetTilePosition);
    }
    return;
  }

  const remotePlayer = params
    .createPlayerSprite(worldPosition.x, worldPosition.y, params.playerTextureKey)
    .setTint(0xffd38f);
  const healthBar = params.createHealthBar().setDepth(60);
  healthBar.setVisible(false);
  const harvestingIndicator = params
    .createHarvestingIndicator(
      worldPosition.x,
      worldPosition.y - params.tileSize * 0.95,
      params.harvestIndicatorTextureKey,
    )
    .setDepth(68)
    .setOrigin(0.5, 1)
    .setDisplaySize(11, 11)
    .setVisible(false);

  params.remotePlayers.set(params.playerState.id, {
    state: params.playerState,
    sprite: remotePlayer,
    targetTilePosition: tilePosition.clone(),
    renderedTilePosition: tilePosition.clone(),
    pathWaypoints: params.buildPathWaypoints(params.playerState),
    healthBar,
    healthBarVisibleUntil: 0,
    harvestingIndicator,
    harvestingIndicatorPhase: 0,
  });
}

export function removeRemotePlayerVisual(
  remotePlayers: Map<string, RemotePlayerVisualLike>,
  id: string,
): void {
  const remotePlayer = remotePlayers.get(id);
  if (!remotePlayer) {
    return;
  }

  remotePlayer.sprite.destroy();
  remotePlayer.healthBar.destroy();
  remotePlayer.harvestingIndicator.destroy();
  remotePlayers.delete(id);
}

export function pruneRemotePlayerVisuals(
  remotePlayers: Map<string, RemotePlayerVisualLike>,
  visibleIds: Set<string>,
): void {
  for (const [id] of remotePlayers.entries()) {
    if (visibleIds.has(id)) {
      continue;
    }

    removeRemotePlayerVisual(remotePlayers, id);
  }
}
