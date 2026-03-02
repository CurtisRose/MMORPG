export class EnemyCombatPositioningPolicy {
  constructor({ isWithinRange, enemyAttackRangeTiles }) {
    this.isWithinRange = isWithinRange;
    this.enemyAttackRangeTiles = enemyAttackRangeTiles;
  }

  isInAttackRange(enemy, targetPlayer) {
    return this.isWithinRange(
      enemy.tileX,
      enemy.tileY,
      targetPlayer.tileX,
      targetPlayer.tileY,
      this.enemyAttackRangeTiles,
    );
  }

  enterAttackStance(enemy) {
    enemy.targetTileX = null;
    enemy.targetTileY = null;
    enemy.targetPath = [];
  }
}

export function createEnemyCombatPositioningPolicy(options) {
  return new EnemyCombatPositioningPolicy(options);
}