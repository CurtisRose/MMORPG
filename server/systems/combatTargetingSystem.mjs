export class CombatTargetingPolicy {
  constructor({ getPlayerAttackCooldownMs }) {
    this.getPlayerAttackCooldownMs = getPlayerAttackCooldownMs;
  }

  isWithinRange(fromTileX, fromTileY, toTileX, toTileY, maxDistance) {
    const distance = Math.abs(fromTileX - toTileX) + Math.abs(fromTileY - toTileY);
    return distance <= maxDistance;
  }

  canAutoRetaliate(player) {
    return (
      player.hp > 0 &&
      player.combatTargetEnemyId === null &&
      player.targetTileX === null &&
      player.targetTileY === null
    );
  }

  isPlayerMoving(player) {
    return (
      player.targetTileX !== null ||
      player.targetTileY !== null ||
      player.directionX !== 0 ||
      player.directionY !== 0
    );
  }

  beginPlayerCombatTarget(player, enemyId, nowMs) {
    const isNewTarget = player.combatTargetEnemyId !== enemyId;
    player.combatTargetEnemyId = enemyId;

    if (isNewTarget) {
      player.nextCombatAt = nowMs + this.getPlayerAttackCooldownMs(player);
    }
  }

  selectAggroTargetEntry(enemy, forEachClient) {
    let targetEntry = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    forEachClient((playerId, client) => {
      if (client.player.hp <= 0) {
        return;
      }

      const distance =
        Math.abs(client.player.tileX - enemy.tileX) + Math.abs(client.player.tileY - enemy.tileY);

      if (distance < bestDistance && distance <= enemy.aggroRangeTiles) {
        bestDistance = distance;
        targetEntry = { playerId, player: client.player };
      }
    });

    return targetEntry;
  }

  shouldBeginAutoRetaliation(player) {
    if (player.hp <= 0 || player.combatTargetEnemyId !== null) {
      return false;
    }

    if (!this.isPlayerMoving(player)) {
      return true;
    }

    return this.canAutoRetaliate(player);
  }
}

export function createCombatTargetingPolicy(options) {
  return new CombatTargetingPolicy(options);
}