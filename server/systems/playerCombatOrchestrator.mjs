export class PlayerCombatOrchestrator {
  constructor(deps) {
    this.deps = deps;
  }

  process(player, nowMs) {
    if (!player.combatTargetEnemyId) {
      return;
    }

    const enemy = this.deps.getEnemyById(player.combatTargetEnemyId);
    if (!enemy || enemy.deadUntil > nowMs) {
      player.combatTargetEnemyId = null;
      return;
    }

    const canAttackFromCurrentPosition = this.deps.resolvePlayerCombatPositioning(player, enemy);
    if (!canAttackFromCurrentPosition) {
      return;
    }

    if (nowMs < player.nextCombatAt) {
      return;
    }

    player.targetTileX = null;
    player.targetTileY = null;
    player.targetPath = [];

    this.deps.resolvePlayerAttack(player, enemy, nowMs);
  }
}

export function createPlayerCombatOrchestrator(deps) {
  return new PlayerCombatOrchestrator(deps);
}