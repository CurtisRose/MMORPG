export class EnemyAiOrchestrator {
  constructor(deps) {
    this.deps = deps;
  }

  process(nowMs) {
    this.deps.forEachEnemy((enemy) => {
      this.processEnemy(enemy, nowMs);
    });
  }

  processEnemy(enemy, nowMs) {
    if (this.deps.shouldSkipEnemyForDeath(enemy, nowMs)) {
      return;
    }

    this.deps.applyEnemyRegeneration(enemy, nowMs);

    if (this.deps.handleEnemyOutOfChaseRange(enemy, nowMs)) {
      return;
    }

    const targetEntry = this.deps.selectAggroTargetEntry(enemy);

    enemy.targetPlayerId = targetEntry?.playerId ?? null;
    if (!targetEntry) {
      this.deps.handleEnemyNoTarget(enemy, nowMs);
      return;
    }

    const targetPlayer = targetEntry.player;
    const inAttackRange = this.deps.isEnemyInAttackRange(enemy, targetPlayer);

    if (inAttackRange) {
      this.deps.enterEnemyAttackStance(enemy);

      if (nowMs >= enemy.nextAttackAt) {
        this.deps.resolveEnemyAttack(enemy, targetPlayer, nowMs);
      }
      return;
    }

    this.deps.updateEnemyPursuitPath(enemy, targetPlayer);
    this.deps.stepEnemyTowardPursuitTarget(enemy, nowMs);
  }
}

export function createEnemyAiOrchestrator(deps) {
  return new EnemyAiOrchestrator(deps);
}