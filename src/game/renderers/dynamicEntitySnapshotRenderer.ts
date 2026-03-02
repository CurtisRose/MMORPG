import Phaser from 'phaser';
import type { EnemyState, GroundItemState } from '../net/MultiplayerClient';

interface EnemyVisualLike {
  state: EnemyState;
  sprite: Phaser.GameObjects.Sprite;
  targetTilePosition: Phaser.Math.Vector2;
  renderedTilePosition: Phaser.Math.Vector2;
  pathWaypoints: Phaser.Math.Vector2[];
  healthBar: Phaser.GameObjects.Graphics;
  healthBarVisibleUntil: number;
}

interface GroundItemVisualLike {
  state: GroundItemState;
  sprite: Phaser.GameObjects.Image;
  quantityText: Phaser.GameObjects.Text;
}

export function syncEnemyVisuals(params: {
  enemies: Record<string, EnemyState>;
  worldEnemies: Map<string, EnemyVisualLike>;
  getWorldPositionFromTile: (tileX: number, tileY: number) => Phaser.Math.Vector2;
  buildEnemyPathWaypoints: (enemyState: EnemyState) => Phaser.Math.Vector2[];
  createEnemySprite: (x: number, y: number, textureKey: string) => Phaser.GameObjects.Sprite;
  createEnemyHealthBar: () => Phaser.GameObjects.Graphics;
  showFloatingText: (worldX: number, worldY: number, text: string, color: string) => void;
  enemyTextureKey: string;
  healthBarVisibleMs: number;
  tileSize: number;
}): void {
  for (const enemyState of Object.values(params.enemies)) {
    const position = params.getWorldPositionFromTile(enemyState.tileX, enemyState.tileY);
    const existingEnemy = params.worldEnemies.get(enemyState.id);
    const targetTilePosition = new Phaser.Math.Vector2(enemyState.tileX, enemyState.tileY);
    const waypoints = params.buildEnemyPathWaypoints(enemyState);

    if (existingEnemy) {
      const hpChanged = existingEnemy.state.hp !== enemyState.hp;
      const previousHp = existingEnemy.state.hp;
      existingEnemy.state = enemyState;
      existingEnemy.targetTilePosition.copy(targetTilePosition);
      existingEnemy.pathWaypoints = waypoints;

      if (
        Phaser.Math.Distance.Between(
          existingEnemy.renderedTilePosition.x,
          existingEnemy.renderedTilePosition.y,
          existingEnemy.targetTilePosition.x,
          existingEnemy.targetTilePosition.y,
        ) > 4
      ) {
        existingEnemy.renderedTilePosition.copy(existingEnemy.targetTilePosition);
      }

      existingEnemy.sprite.setPosition(position.x, position.y);
      existingEnemy.sprite.setVisible(!enemyState.isDead);
      existingEnemy.sprite.setAlpha(enemyState.isDead ? 0.35 : 1);

      if (hpChanged) {
        existingEnemy.healthBarVisibleUntil = Date.now() + params.healthBarVisibleMs;

        if (previousHp > enemyState.hp) {
          params.showFloatingText(
            existingEnemy.sprite.x,
            existingEnemy.sprite.y - params.tileSize * 0.7,
            `-${Math.round(previousHp - enemyState.hp)}`,
            '#ffe08a',
          );
        }
      }
      continue;
    }

    const enemySprite = params
      .createEnemySprite(position.x, position.y, params.enemyTextureKey)
      .setTint(0xff8a8a)
      .setDepth(2)
      .setVisible(!enemyState.isDead)
      .setAlpha(enemyState.isDead ? 0.35 : 1);
    const healthBar = params.createEnemyHealthBar().setDepth(60);
    healthBar.setVisible(false);

    params.worldEnemies.set(enemyState.id, {
      state: enemyState,
      sprite: enemySprite,
      targetTilePosition: targetTilePosition.clone(),
      renderedTilePosition: targetTilePosition.clone(),
      pathWaypoints: waypoints,
      healthBar,
      healthBarVisibleUntil: 0,
    });
  }

  const visibleEnemyIds = new Set(Object.keys(params.enemies));
  for (const [enemyId, enemyVisual] of params.worldEnemies.entries()) {
    if (visibleEnemyIds.has(enemyId)) {
      continue;
    }

    enemyVisual.sprite.destroy();
    enemyVisual.healthBar.destroy();
    params.worldEnemies.delete(enemyId);
  }
}

export function syncGroundItemVisuals(params: {
  groundItems: Record<string, GroundItemState>;
  worldGroundItems: Map<string, GroundItemVisualLike>;
  getWorldPositionFromTile: (tileX: number, tileY: number) => Phaser.Math.Vector2;
  ensureGroundItemTextureLoaded: (textureKey: string, imagePath: string) => boolean;
  createGroundItemSprite: (x: number, y: number, textureKey: string) => Phaser.GameObjects.Image;
  createGroundItemQuantityText: (x: number, y: number, text: string) => Phaser.GameObjects.Text;
  fallbackTextureKey: string;
}): void {
  const visibleGroundStackByTile = new Set<string>();

  for (const groundItemState of Object.values(params.groundItems)) {
    const position = params.getWorldPositionFromTile(groundItemState.tileX, groundItemState.tileY);
    const existingGroundItem = params.worldGroundItems.get(groundItemState.id);
    const textureKey = `ground-item-${groundItemState.itemId}`;
    const textureReady = params.ensureGroundItemTextureLoaded(textureKey, groundItemState.image);
    const tileKey = `${groundItemState.tileX},${groundItemState.tileY}`;
    const showStackVisual = !visibleGroundStackByTile.has(tileKey);
    if (showStackVisual) {
      visibleGroundStackByTile.add(tileKey);
    }

    if (existingGroundItem) {
      existingGroundItem.state = groundItemState;
      existingGroundItem.sprite.setPosition(position.x, position.y);
      existingGroundItem.sprite.setDisplaySize(18, 18);
      if (textureReady) {
        existingGroundItem.sprite.setTexture(textureKey);
        existingGroundItem.sprite.setVisible(showStackVisual);
      }
      existingGroundItem.quantityText
        .setPosition(position.x + 10, position.y - 11)
        .setText(groundItemState.quantity > 1 ? `x${groundItemState.quantity}` : '')
        .setVisible(showStackVisual);
      continue;
    }

    const sprite = params
      .createGroundItemSprite(
        position.x,
        position.y,
        textureReady ? textureKey : params.fallbackTextureKey,
      )
      .setDisplaySize(18, 18)
      .setDepth(3.2)
      .setVisible(textureReady && showStackVisual);

    const quantityText = params
      .createGroundItemQuantityText(
        position.x + 10,
        position.y - 11,
        groundItemState.quantity > 1 ? `x${groundItemState.quantity}` : '',
      )
      .setOrigin(0, 0.5)
      .setDepth(4)
      .setVisible(showStackVisual);

    params.worldGroundItems.set(groundItemState.id, {
      state: groundItemState,
      sprite,
      quantityText,
    });
  }

  const visibleGroundItemIds = new Set(Object.keys(params.groundItems));
  for (const [groundItemId, groundItemVisual] of params.worldGroundItems.entries()) {
    if (visibleGroundItemIds.has(groundItemId)) {
      continue;
    }

    groundItemVisual.sprite.destroy();
    groundItemVisual.quantityText.destroy();
    params.worldGroundItems.delete(groundItemId);
  }
}
