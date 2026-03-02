import assert from 'node:assert/strict';

import { createServerSystems } from './createServerSystems.mjs';

export function runCreateServerSystemsTests() {
  const systems = createServerSystems({
    shared: {
      clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
      isWalkableTile: () => true,
      getCombatHitChance: () => 0.5,
      randomIntBetween: () => 1,
      addSkillXp: () => {},
    },
    world: {
      moveFallbackSearchRadius: 5,
      getWorldWidthTiles: () => 80,
      getWorldHeightTiles: () => 80,
      worldWidthTiles: 80,
      worldHeightTiles: 80,
    },
    movement: {
      tileStepIntervalMs: 200,
      diagonalStepMultiplier: 1.65,
      findPath: () => [],
      canTraverseBetween: () => true,
      setPathTarget: () => true,
      stepTowardTarget: () => 200,
      findBestAdjacentTileToTarget: () => ({ tileX: 1, tileY: 1 }),
      isWithinRange: () => true,
    },
    enemyCombat: {
      getPlayerAttackCooldownMs: () => 900,
      beginPlayerCombatTarget: () => {},
      enemyAttackAccuracy: 16,
      combatEnemyBaseAffinityPct: 55,
      combatEnemyHitModifierPct: 0,
      defenseXpPerHitTaken: 12,
      getPlayerArmorRating: () => 10,
      enemyAttackRangeTiles: 1,
    },
    playerCombat: {
      enemyArmor: 8,
      combatPlayerBaseAffinityPct: 55,
      combatPlayerHitModifierPct: 0,
      playerAttackDamageMin: 4,
      playerAttackDamageMax: 8,
      strengthXpPerHit: 16,
      constitutionXpPerHit: 6,
      getPlayerMeleeAccuracyRating: () => 10,
      getPlayerCombatBonuses: () => ({ minDamageBonus: 0, maxDamageBonus: 0 }),
      getPlayerWeaponBaseDamageTotal: () => 0,
      getPlayerEffectiveStrength: () => 1,
      applyQuestObjectiveProgress: () => {},
      applyMinionDropsToPlayer: () => ({ droppedDrops: [], lootTableDrops: [] }),
      sendChatToSocket: () => {},
      playerAttackRangeTiles: 1,
      clients: new Map(),
    },
  });

  assert.equal(typeof systems.pathfindingService.findPath, 'function');
  assert.equal(typeof systems.movementService.stepPlayerIfPossible, 'function');
  assert.equal(typeof systems.combatTargetingPolicy.selectAggroTargetEntry, 'function');
  assert.equal(typeof systems.enemyCombatResolutionService.resolveEnemyAttack, 'function');
  assert.equal(typeof systems.enemyStateService.handleNoTarget, 'function');
  assert.equal(typeof systems.enemyNavigationPolicy.updatePursuitPath, 'function');
  assert.equal(typeof systems.enemyCombatPositioningPolicy.enterAttackStance, 'function');
  assert.equal(typeof systems.playerCombatResolutionService.resolvePlayerAttack, 'function');
  assert.equal(typeof systems.playerCombatPositioningPolicy.resolvePositioning, 'function');
}