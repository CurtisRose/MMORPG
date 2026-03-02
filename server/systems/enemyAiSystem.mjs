import { createEnemyAiOrchestrator } from './enemyAiOrchestrator.mjs';

export function processEnemyAi(nowMs, deps) {
  const orchestrator = createEnemyAiOrchestrator(deps);
  orchestrator.process(nowMs);
}