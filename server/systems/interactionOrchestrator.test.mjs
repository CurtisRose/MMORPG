import assert from 'node:assert/strict';

import { InteractionOrchestrator } from './interactionOrchestrator.mjs';

function createBaseDeps(overrides = {}) {
  const nodeMap = new Map();
  const defaultResourceConfig = {
    id: 'tree',
    skill: 'woodcutting',
    requiredLevel: 1,
    successChance: 1,
    gatherIntervalMs: 1200,
    drops: [{ itemId: 'logs', xp: 22, quantity: { min: 1, max: 1 }, weight: 1 }],
    messages: {
      success: 'You gather {quantity} {itemName} ({xp} xp).',
      levelUp: 'Level up! {level}',
      depleted: '{resourceName} depleted.',
      locked: 'Need level {requiredLevel}.',
      gatherFail: 'You fail to gather {resourceName}.',
    },
  };

  return {
    deps: {
      getWorldNodeById: (nodeId) => nodeMap.get(nodeId) ?? null,
      isWithinInteractionRange: () => true,
      getResourceName: () => 'Tree',
      getHarvestResourceConfig: () => defaultResourceConfig,
      interpolateTemplate: (template, vars) => {
        let rendered = template;
        for (const [key, value] of Object.entries(vars)) {
          rendered = rendered.replaceAll(`{${key}}`, String(value));
        }
        return rendered;
      },
      rollDepletionHits: () => 2,
      getPlayerSkillActionBonuses: () => ({ successChanceBonus: 0, gatherIntervalMultiplier: 1 }),
      harvestSuccessChanceBonusMax: 0.3,
      harvestSuccessChanceBonusPerLevel: 0.005,
      clamp01: (value) => Math.max(0, Math.min(1, value)),
      rollDepletionDurationMs: () => 5000,
      pickWeightedDrop: (drops) => drops[0] ?? null,
      getItemDefinition: () => ({ id: 'logs', name: 'Logs' }),
      randomIntBetween: () => 1,
      addItemToInventory: () => true,
      applyQuestObjectiveProgress: () => {},
      addSkillXp: () => ({ leveledUp: false }),
      ...overrides,
    },
    nodeMap,
  };
}

export function runInteractionOrchestratorTests() {
  {
    const { deps } = createBaseDeps();
    const orchestrator = new InteractionOrchestrator(deps);
    const player = { activeInteractionNodeId: null };
    orchestrator.process(player, 1000);
    assert.equal(player.activeInteractionNodeId, null);
  }

  {
    const { deps } = createBaseDeps();
    const orchestrator = new InteractionOrchestrator(deps);
    const player = { activeInteractionNodeId: 'missing', lastActionText: '' };
    orchestrator.process(player, 1000);
    assert.equal(player.activeInteractionNodeId, null);
  }

  {
    const { deps, nodeMap } = createBaseDeps({ isWithinInteractionRange: () => false });
    nodeMap.set('n1', {
      resourceId: 'tree',
      type: 'oak_tree',
      depletedUntil: 0,
      hitsRemaining: 2,
      respawnMs: 3000,
    });
    const orchestrator = new InteractionOrchestrator(deps);
    const player = { activeInteractionNodeId: 'n1', nextInteractionAt: 0, lastActionText: '' };
    orchestrator.process(player, 1000);
    assert.equal(player.lastActionText, 'Out of range for Tree');
  }

  {
    const { deps, nodeMap } = createBaseDeps();
    nodeMap.set('n2', {
      resourceId: 'tree',
      type: 'oak_tree',
      depletedUntil: 0,
      hitsRemaining: 2,
      respawnMs: 3000,
    });
    const orchestrator = new InteractionOrchestrator(deps);
    const player = {
      activeInteractionNodeId: 'n2',
      nextInteractionAt: 0,
      lastActionText: '',
      skills: { woodcutting: { level: 0 } },
    };
    orchestrator.process(player, 1000);
    assert.equal(player.lastActionText, 'Need level 1.');
    assert.equal(player.activeInteractionNodeId, null);
  }

  {
    const { deps, nodeMap } = createBaseDeps();
    nodeMap.set('n3', {
      resourceId: 'tree',
      type: 'oak_tree',
      depletedUntil: 0,
      hitsRemaining: 1,
      respawnMs: 3000,
    });
    const orchestrator = new InteractionOrchestrator(deps);
    const player = {
      activeInteractionNodeId: 'n3',
      nextInteractionAt: 0,
      lastActionText: '',
      skills: { woodcutting: { level: 5 } },
    };
    orchestrator.process(player, 1000);
    assert.equal(player.lastActionText, 'You gather 1 logs (22 xp).');
    assert.equal(player.nextInteractionAt, 2200);
    assert.equal(player.activeInteractionNodeId, null);
  }
}