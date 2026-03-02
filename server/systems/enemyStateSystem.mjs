export class EnemyStateService {
  constructor({ setPathTarget, stepTowardTarget }) {
    this.setPathTarget = setPathTarget;
    this.stepTowardTarget = stepTowardTarget;
  }

  shouldSkipForDeath(enemy, nowMs) {
    if (enemy.deadUntil > nowMs) {
      return true;
    }

    if (enemy.deadUntil !== 0 && enemy.deadUntil <= nowMs) {
      enemy.deadUntil = 0;
      enemy.hp = enemy.maxHp;
      enemy.tileX = enemy.spawnTileX;
      enemy.tileY = enemy.spawnTileY;
      enemy.targetTileX = null;
      enemy.targetTileY = null;
      enemy.targetPath = [];
      enemy.targetPlayerId = null;
      enemy.nextMoveAllowedAt = nowMs;
      enemy.nextAttackAt = nowMs;
      enemy.nextHpRegenAt = nowMs + enemy.hpRegenIntervalMs;
    }

    return false;
  }

  applyRegeneration(enemy, nowMs) {
    if (enemy.hp < enemy.maxHp && nowMs >= enemy.nextHpRegenAt) {
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.hpRegenAmount);
      enemy.nextHpRegenAt = nowMs + enemy.hpRegenIntervalMs;
    }
  }

  isBeyondChaseDistance(enemy) {
    const distanceFromSpawn =
      Math.abs(enemy.tileX - enemy.spawnTileX) + Math.abs(enemy.tileY - enemy.spawnTileY);
    return distanceFromSpawn > enemy.maxChaseDistanceTiles;
  }

  moveTowardSpawn(enemy, nowMs) {
    const shouldReturnToSpawn =
      enemy.targetTileX !== enemy.spawnTileX ||
      enemy.targetTileY !== enemy.spawnTileY ||
      enemy.targetPath.length === 0;
    if (shouldReturnToSpawn) {
      this.setPathTarget(enemy, enemy.spawnTileX, enemy.spawnTileY);
    }

    if (nowMs >= enemy.nextMoveAllowedAt) {
      const moveDelayMs = this.stepTowardTarget(enemy);
      if (moveDelayMs > 0) {
        enemy.nextMoveAllowedAt = nowMs + moveDelayMs;
      }
    }
  }

  handleOutOfChaseRange(enemy, nowMs) {
    if (!this.isBeyondChaseDistance(enemy)) {
      return false;
    }

    enemy.targetPlayerId = null;
    this.moveTowardSpawn(enemy, nowMs);
    return true;
  }

  handleNoTarget(enemy, nowMs) {
    const atSpawn = enemy.tileX === enemy.spawnTileX && enemy.tileY === enemy.spawnTileY;
    if (atSpawn) {
      enemy.targetTileX = null;
      enemy.targetTileY = null;
      enemy.targetPath = [];
      return true;
    }

    this.moveTowardSpawn(enemy, nowMs);
    return true;
  }
}

export function createEnemyStateService(options) {
  return new EnemyStateService(options);
}