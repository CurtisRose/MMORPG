export class EnemyNavigationPolicy {
  constructor({ findBestAdjacentTileToTarget, setPathTarget, stepTowardTarget }) {
    this.findBestAdjacentTileToTarget = findBestAdjacentTileToTarget;
    this.setPathTarget = setPathTarget;
    this.stepTowardTarget = stepTowardTarget;
  }

  updatePursuitPath(enemy, targetPlayer) {
    const adjacentTile = this.findBestAdjacentTileToTarget(enemy, targetPlayer.tileX, targetPlayer.tileY);
    if (!adjacentTile) {
      return;
    }

    const targetChanged =
      enemy.targetTileX !== adjacentTile.tileX || enemy.targetTileY !== adjacentTile.tileY;
    if (targetChanged || enemy.targetPath.length === 0) {
      this.setPathTarget(enemy, adjacentTile.tileX, adjacentTile.tileY);
    }
  }

  stepTowardPursuitTarget(enemy, nowMs) {
    if (nowMs < enemy.nextMoveAllowedAt) {
      return;
    }

    const moveDelayMs = this.stepTowardTarget(enemy);
    if (moveDelayMs > 0) {
      enemy.nextMoveAllowedAt = nowMs + moveDelayMs;
    }
  }
}

export function createEnemyNavigationPolicy(options) {
  return new EnemyNavigationPolicy(options);
}