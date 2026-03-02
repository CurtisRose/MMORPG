import { runCommerceSystemTests } from '../server/systems/commerceSystem.test.mjs';
import { runCombatTargetingSystemTests } from '../server/systems/combatTargetingSystem.test.mjs';
import { runCreateServerSystemsTests } from '../server/systems/createServerSystems.test.mjs';
import { runCraftingSystemTests } from '../server/systems/craftingSystem.test.mjs';
import { runEnemyCombatPositioningSystemTests } from '../server/systems/enemyCombatPositioningSystem.test.mjs';
import { runEnemyCombatResolutionSystemTests } from '../server/systems/enemyCombatResolutionSystem.test.mjs';
import { runEnemyAiOrchestratorTests } from '../server/systems/enemyAiOrchestrator.test.mjs';
import { runEnemyNavigationSystemTests } from '../server/systems/enemyNavigationSystem.test.mjs';
import { runEnemyStateSystemTests } from '../server/systems/enemyStateSystem.test.mjs';
import { runGroundItemSystemTests } from '../server/systems/groundItemSystem.test.mjs';
import { runInventorySystemTests } from '../server/systems/inventorySystem.test.mjs';
import { runInteractionOrchestratorTests } from '../server/systems/interactionOrchestrator.test.mjs';
import { runMovementSystemTests } from '../server/systems/movementSystem.test.mjs';
import { runPathfindingSystemTests } from '../server/systems/pathfindingSystem.test.mjs';
import { runPlayerCombatOrchestratorTests } from '../server/systems/playerCombatOrchestrator.test.mjs';
import { runPlayerCombatPositioningSystemTests } from '../server/systems/playerCombatPositioningSystem.test.mjs';
import { runPlayerCombatResolutionSystemTests } from '../server/systems/playerCombatResolutionSystem.test.mjs';
import { runSkillProgressionSystemTests } from '../server/systems/skillProgressionSystem.test.mjs';

const suites = [
  ['inventorySystem', runInventorySystemTests],
  ['groundItemSystem', runGroundItemSystemTests],
  ['skillProgressionSystem', runSkillProgressionSystemTests],
  ['createServerSystems', runCreateServerSystemsTests],
  ['craftingSystem', runCraftingSystemTests],
  ['commerceSystem', runCommerceSystemTests],
  ['combatTargetingSystem', runCombatTargetingSystemTests],
  ['enemyCombatPositioningSystem', runEnemyCombatPositioningSystemTests],
  ['enemyCombatResolutionSystem', runEnemyCombatResolutionSystemTests],
  ['enemyAiOrchestrator', runEnemyAiOrchestratorTests],
  ['enemyNavigationSystem', runEnemyNavigationSystemTests],
  ['enemyStateSystem', runEnemyStateSystemTests],
  ['interactionOrchestrator', runInteractionOrchestratorTests],
  ['pathfindingSystem', runPathfindingSystemTests],
  ['playerCombatOrchestrator', runPlayerCombatOrchestratorTests],
  ['playerCombatPositioningSystem', runPlayerCombatPositioningSystemTests],
  ['playerCombatResolutionSystem', runPlayerCombatResolutionSystemTests],
  ['movementSystem', runMovementSystemTests],
];

let failed = 0;
for (const [name, suite] of suites) {
  try {
    suite();
    console.log(`[pass] ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`[fail] ${name}`);
    console.error(error);
  }
}

if (failed > 0) {
  console.error(`Regression suite failed: ${failed} suite(s).`);
  process.exit(1);
}

console.log('Regression suite passed.');
