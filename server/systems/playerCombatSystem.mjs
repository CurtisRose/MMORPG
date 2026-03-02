import { createPlayerCombatOrchestrator } from './playerCombatOrchestrator.mjs';

export function processPlayerCombat(player, nowMs, deps) {
  const orchestrator = createPlayerCombatOrchestrator(deps);
  orchestrator.process(player, nowMs);
}