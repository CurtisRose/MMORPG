import { createInteractionOrchestrator } from './interactionOrchestrator.mjs';

export function processInteraction(player, nowMs, deps) {
  const orchestrator = createInteractionOrchestrator(deps);
  orchestrator.process(player, nowMs);
}