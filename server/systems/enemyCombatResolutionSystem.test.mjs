import assert from 'node:assert/strict';

import { EnemyCombatResolutionService } from './enemyCombatResolutionSystem.mjs';

export function runEnemyCombatResolutionSystemTests() {
  const retaliations = [];
  const xpAwards = [];

  const service = new EnemyCombatResolutionService({
    enemyAttackAccuracy: 16,
    combatEnemyBaseAffinityPct: 55,
    combatEnemyHitModifierPct: 0,
    defenseXpPerHitTaken: 12,
    getPlayerArmorRating: () => 10,
    getCombatHitChance: () => 1,
    randomIntBetween: () => 7,
    addSkillXp: (player, skillName, amount) => {
      xpAwards.push({ playerId: player.id, skillName, amount });
    },
    shouldBeginAutoRetaliation: () => true,
    beginPlayerCombatTarget: (player, enemyId, nowMs) => {
      retaliations.push({ playerId: player.id, enemyId, nowMs });
      player.combatTargetEnemyId = enemyId;
    },
    rollChance: () => 0,
  });

  const enemy = {
    id: 'e-1',
    name: 'Goblin',
    attackAccuracy: 10,
    attackDamageMin: 3,
    attackDamageMax: 6,
    attackCooldownMs: 1300,
    nextAttackAt: 0,
  };

  const player = {
    id: 'p-1',
    hp: 30,
    combatTargetEnemyId: null,
    activeInteractionNodeId: 'tree-1',
    lastActionText: '',
  };

  const beganRetaliation = service.resolveEnemyAttack(enemy, player, 1000);
  assert.equal(beganRetaliation, true);
  assert.equal(player.hp, 23);
  assert.equal(player.lastActionText, 'Goblin crushes you for 7.');
  assert.equal(enemy.nextAttackAt, 2300);
  assert.equal(player.activeInteractionNodeId, null);
  assert.equal(player.combatTargetEnemyId, 'e-1');
  assert.deepEqual(xpAwards, [{ playerId: 'p-1', skillName: 'defense', amount: 12 }]);
  assert.deepEqual(retaliations, [{ playerId: 'p-1', enemyId: 'e-1', nowMs: 1000 }]);

  const missService = new EnemyCombatResolutionService({
    enemyAttackAccuracy: 16,
    combatEnemyBaseAffinityPct: 55,
    combatEnemyHitModifierPct: 0,
    defenseXpPerHitTaken: 12,
    getPlayerArmorRating: () => 10,
    getCombatHitChance: () => 0,
    randomIntBetween: () => 5,
    addSkillXp: () => {
      throw new Error('addSkillXp should not be called on miss');
    },
    shouldBeginAutoRetaliation: () => false,
    beginPlayerCombatTarget: () => {
      throw new Error('beginPlayerCombatTarget should not be called when retaliation is false');
    },
    rollChance: () => 1,
  });

  const missEnemy = {
    id: 'e-2',
    name: 'Skeleton',
    attackAccuracy: 12,
    attackDamageMin: 2,
    attackDamageMax: 4,
    attackCooldownMs: 1000,
    nextAttackAt: 0,
  };

  const missPlayer = {
    id: 'p-2',
    hp: 25,
    combatTargetEnemyId: null,
    activeInteractionNodeId: null,
    lastActionText: '',
  };

  const missRetaliation = missService.resolveEnemyAttack(missEnemy, missPlayer, 500);
  assert.equal(missRetaliation, false);
  assert.equal(missPlayer.hp, 25);
  assert.equal(missPlayer.lastActionText, "You block Skeleton's attack with your armor.");
  assert.equal(missEnemy.nextAttackAt, 1500);
}