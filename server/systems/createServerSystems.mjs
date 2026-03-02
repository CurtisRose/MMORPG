import { createCombatTargetingPolicy } from './combatTargetingSystem.mjs';
import { createEnemyCombatPositioningPolicy } from './enemyCombatPositioningSystem.mjs';
import { createEnemyCombatResolutionService } from './enemyCombatResolutionSystem.mjs';
import { createEnemyNavigationPolicy } from './enemyNavigationSystem.mjs';
import { createEnemyStateService } from './enemyStateSystem.mjs';
import { createGridMovementService } from './movementSystem.mjs';
import { createGridPathfindingService } from './pathfindingSystem.mjs';
import { createPlayerCombatPositioningPolicy } from './playerCombatPositioningSystem.mjs';
import { createPlayerCombatResolutionService } from './playerCombatResolutionSystem.mjs';

export function createServerSystems(options) {
  const { shared, world, movement, enemyCombat, playerCombat } = options;

  const pathfindingService = createGridPathfindingService({
    isWalkableTile: shared.isWalkableTile,
    moveFallbackSearchRadius: world.moveFallbackSearchRadius,
  });

  const movementService = createGridMovementService({
    clamp: shared.clamp,
    isWalkableTile: shared.isWalkableTile,
    getWorldWidthTiles: world.getWorldWidthTiles,
    getWorldHeightTiles: world.getWorldHeightTiles,
    tileStepIntervalMs: movement.tileStepIntervalMs,
    diagonalStepMultiplier: movement.diagonalStepMultiplier,
    findPath: movement.findPath,
    canTraverseBetween: movement.canTraverseBetween,
  });

  const combatTargetingPolicy = createCombatTargetingPolicy({
    getPlayerAttackCooldownMs: enemyCombat.getPlayerAttackCooldownMs,
  });

  const enemyCombatResolutionService = createEnemyCombatResolutionService({
    enemyAttackAccuracy: enemyCombat.enemyAttackAccuracy,
    combatEnemyBaseAffinityPct: enemyCombat.combatEnemyBaseAffinityPct,
    combatEnemyHitModifierPct: enemyCombat.combatEnemyHitModifierPct,
    defenseXpPerHitTaken: enemyCombat.defenseXpPerHitTaken,
    getPlayerArmorRating: enemyCombat.getPlayerArmorRating,
    getCombatHitChance: shared.getCombatHitChance,
    randomIntBetween: shared.randomIntBetween,
    addSkillXp: shared.addSkillXp,
    shouldBeginAutoRetaliation: (player) => combatTargetingPolicy.shouldBeginAutoRetaliation(player),
    beginPlayerCombatTarget: enemyCombat.beginPlayerCombatTarget,
  });

  const enemyStateService = createEnemyStateService({
    setPathTarget: movement.setPathTarget,
    stepTowardTarget: movement.stepTowardTarget,
  });

  const enemyNavigationPolicy = createEnemyNavigationPolicy({
    findBestAdjacentTileToTarget: movement.findBestAdjacentTileToTarget,
    setPathTarget: movement.setPathTarget,
    stepTowardTarget: movement.stepTowardTarget,
  });

  const enemyCombatPositioningPolicy = createEnemyCombatPositioningPolicy({
    isWithinRange: movement.isWithinRange,
    enemyAttackRangeTiles: enemyCombat.enemyAttackRangeTiles,
  });

  const playerCombatResolutionService = createPlayerCombatResolutionService({
    enemyArmor: playerCombat.enemyArmor,
    combatPlayerBaseAffinityPct: playerCombat.combatPlayerBaseAffinityPct,
    combatPlayerHitModifierPct: playerCombat.combatPlayerHitModifierPct,
    playerAttackDamageMin: playerCombat.playerAttackDamageMin,
    playerAttackDamageMax: playerCombat.playerAttackDamageMax,
    strengthXpPerHit: playerCombat.strengthXpPerHit,
    constitutionXpPerHit: playerCombat.constitutionXpPerHit,
    getPlayerMeleeAccuracyRating: playerCombat.getPlayerMeleeAccuracyRating,
    getCombatHitChance: shared.getCombatHitChance,
    getPlayerAttackCooldownMs: enemyCombat.getPlayerAttackCooldownMs,
    getPlayerCombatBonuses: playerCombat.getPlayerCombatBonuses,
    getPlayerWeaponBaseDamageTotal: playerCombat.getPlayerWeaponBaseDamageTotal,
    getPlayerEffectiveStrength: playerCombat.getPlayerEffectiveStrength,
    randomIntBetween: shared.randomIntBetween,
    addSkillXp: shared.addSkillXp,
    applyQuestObjectiveProgress: playerCombat.applyQuestObjectiveProgress,
    applyMinionDropsToPlayer: playerCombat.applyMinionDropsToPlayer,
    forEachClient: (handler) => {
      for (const client of playerCombat.clients.values()) {
        handler(client);
      }
    },
    getClientById: (clientId) => playerCombat.clients.get(clientId),
    sendChatToSocket: playerCombat.sendChatToSocket,
  });

  const playerCombatPositioningPolicy = createPlayerCombatPositioningPolicy({
    worldWidthTiles: world.worldWidthTiles,
    worldHeightTiles: world.worldHeightTiles,
    isWalkableTile: shared.isWalkableTile,
    findBestAdjacentTileToTarget: movement.findBestAdjacentTileToTarget,
    setPathTarget: movement.setPathTarget,
    isWithinRange: movement.isWithinRange,
    playerAttackRangeTiles: playerCombat.playerAttackRangeTiles,
  });

  return {
    pathfindingService,
    movementService,
    combatTargetingPolicy,
    enemyCombatResolutionService,
    enemyStateService,
    enemyNavigationPolicy,
    enemyCombatPositioningPolicy,
    playerCombatResolutionService,
    playerCombatPositioningPolicy,
  };
}