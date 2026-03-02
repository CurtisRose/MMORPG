export class EnemyCombatResolutionService {
  constructor({
    enemyAttackAccuracy,
    combatEnemyBaseAffinityPct,
    combatEnemyHitModifierPct,
    defenseXpPerHitTaken,
    getPlayerArmorRating,
    getCombatHitChance,
    randomIntBetween,
    addSkillXp,
    shouldBeginAutoRetaliation,
    beginPlayerCombatTarget,
    rollChance = Math.random,
  }) {
    this.enemyAttackAccuracy = enemyAttackAccuracy;
    this.combatEnemyBaseAffinityPct = combatEnemyBaseAffinityPct;
    this.combatEnemyHitModifierPct = combatEnemyHitModifierPct;
    this.defenseXpPerHitTaken = defenseXpPerHitTaken;
    this.getPlayerArmorRating = getPlayerArmorRating;
    this.getCombatHitChance = getCombatHitChance;
    this.randomIntBetween = randomIntBetween;
    this.addSkillXp = addSkillXp;
    this.shouldBeginAutoRetaliation = shouldBeginAutoRetaliation;
    this.beginPlayerCombatTarget = beginPlayerCombatTarget;
    this.rollChance = rollChance;
  }

  resolveEnemyAttack(enemy, targetPlayer, nowMs) {
    const isTargetingThisEnemy = targetPlayer.combatTargetEnemyId === enemy.id;
    const nonTargetOffenseMultiplier = isTargetingThisEnemy ? 1 : 2;
    const enemyAccuracy = Math.max(
      1,
      Math.floor(Number(enemy.attackAccuracy ?? this.enemyAttackAccuracy) * nonTargetOffenseMultiplier),
    );
    const playerArmor = this.getPlayerArmorRating(targetPlayer);
    const hitChance = this.getCombatHitChance(
      enemyAccuracy,
      playerArmor,
      this.combatEnemyBaseAffinityPct,
      this.combatEnemyHitModifierPct,
    );
    const didHit = this.rollChance() <= hitChance;

    if (didHit) {
      const attackDamageMin = Math.max(
        1,
        Math.floor(enemy.attackDamageMin * nonTargetOffenseMultiplier),
      );
      const attackDamageMax = Math.max(
        attackDamageMin,
        Math.floor(enemy.attackDamageMax * nonTargetOffenseMultiplier),
      );
      const damage = this.randomIntBetween(attackDamageMin, attackDamageMax);
      targetPlayer.hp = Math.max(1, targetPlayer.hp - damage);
      this.addSkillXp(targetPlayer, 'defense', this.defenseXpPerHitTaken);
      targetPlayer.lastActionText = nonTargetOffenseMultiplier > 1
        ? `${enemy.name} crushes you for ${damage}.`
        : `${enemy.name} hits you for ${damage}.`;
    } else {
      targetPlayer.lastActionText = `You block ${enemy.name}'s attack with your armor.`;
    }

    enemy.nextAttackAt = nowMs + enemy.attackCooldownMs;

    if (this.shouldBeginAutoRetaliation(targetPlayer)) {
      targetPlayer.activeInteractionNodeId = null;
      this.beginPlayerCombatTarget(targetPlayer, enemy.id, nowMs);
      return true;
    }

    return false;
  }
}

export function createEnemyCombatResolutionService(options) {
  return new EnemyCombatResolutionService(options);
}