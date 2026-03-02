import assert from 'node:assert/strict';

import { EnemyAiOrchestrator } from './enemyAiOrchestrator.mjs';

function createDeps(overrides = {}) {
  const calls = [];
  const defaultEnemy = { id: 'e1', targetPlayerId: null, nextAttackAt: 1000 };
  const defaultTargetPlayer = { id: 'p1' };

  const deps = {
    forEachEnemy: (handler) => handler(defaultEnemy),
    shouldSkipEnemyForDeath: () => false,
    applyEnemyRegeneration: () => calls.push('regen'),
    handleEnemyOutOfChaseRange: () => false,
    selectAggroTargetEntry: () => ({ playerId: 'p1', player: defaultTargetPlayer }),
    handleEnemyNoTarget: () => calls.push('noTarget'),
    isEnemyInAttackRange: () => false,
    enterEnemyAttackStance: () => calls.push('stance'),
    resolveEnemyAttack: () => calls.push('attack'),
    updateEnemyPursuitPath: () => calls.push('pursuit'),
    stepEnemyTowardPursuitTarget: () => calls.push('step'),
    ...overrides,
  };

  return { deps, calls, defaultEnemy };
}

export function runEnemyAiOrchestratorTests() {
  {
    const { deps, calls } = createDeps({
      shouldSkipEnemyForDeath: () => true,
    });
    const orchestrator = new EnemyAiOrchestrator(deps);
    orchestrator.process(1000);
    assert.deepEqual(calls, []);
  }

  {
    const { deps, calls } = createDeps({
      handleEnemyOutOfChaseRange: () => true,
    });
    const orchestrator = new EnemyAiOrchestrator(deps);
    orchestrator.process(1000);
    assert.deepEqual(calls, ['regen']);
  }

  {
    const { deps, calls, defaultEnemy } = createDeps({
      selectAggroTargetEntry: () => null,
    });
    const orchestrator = new EnemyAiOrchestrator(deps);
    orchestrator.process(1000);
    assert.deepEqual(calls, ['regen', 'noTarget']);
    assert.equal(defaultEnemy.targetPlayerId, null);
  }

  {
    const { deps, calls } = createDeps({
      isEnemyInAttackRange: () => true,
    });
    const orchestrator = new EnemyAiOrchestrator(deps);
    orchestrator.process(900);
    assert.deepEqual(calls, ['regen', 'stance']);
  }

  {
    const { deps, calls } = createDeps({
      isEnemyInAttackRange: () => true,
    });
    const orchestrator = new EnemyAiOrchestrator(deps);
    orchestrator.process(1000);
    assert.deepEqual(calls, ['regen', 'stance', 'attack']);
  }

  {
    const { deps, calls } = createDeps({
      isEnemyInAttackRange: () => false,
    });
    const orchestrator = new EnemyAiOrchestrator(deps);
    orchestrator.process(1000);
    assert.deepEqual(calls, ['regen', 'pursuit', 'step']);
  }
}