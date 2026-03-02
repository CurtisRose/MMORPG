import assert from 'node:assert/strict';

import { PlayerCombatOrchestrator } from './playerCombatOrchestrator.mjs';

export function runPlayerCombatOrchestratorTests() {
  const calls = [];
  const baseEnemy = { id: 'e1', deadUntil: 0 };

  const deps = {
    getEnemyById: () => baseEnemy,
    resolvePlayerCombatPositioning: () => true,
    resolvePlayerAttack: () => calls.push('attack'),
  };

  {
    const orchestrator = new PlayerCombatOrchestrator(deps);
    const player = { combatTargetEnemyId: null };
    orchestrator.process(player, 1000);
    assert.deepEqual(calls, []);
  }

  {
    const orchestrator = new PlayerCombatOrchestrator({
      ...deps,
      getEnemyById: () => null,
    });
    const player = { combatTargetEnemyId: 'e1' };
    orchestrator.process(player, 1000);
    assert.equal(player.combatTargetEnemyId, null);
  }

  {
    const orchestrator = new PlayerCombatOrchestrator({
      ...deps,
      resolvePlayerCombatPositioning: () => false,
    });
    const player = { combatTargetEnemyId: 'e1', nextCombatAt: 0 };
    orchestrator.process(player, 1000);
    assert.deepEqual(calls, []);
  }

  {
    const orchestrator = new PlayerCombatOrchestrator(deps);
    const player = {
      combatTargetEnemyId: 'e1',
      nextCombatAt: 1500,
      targetTileX: 5,
      targetTileY: 6,
      targetPath: [{ tileX: 5, tileY: 6 }],
    };
    orchestrator.process(player, 1000);
    assert.equal(player.targetTileX, 5);
    assert.equal(player.targetTileY, 6);
    assert.deepEqual(calls, []);
  }

  {
    const orchestrator = new PlayerCombatOrchestrator(deps);
    const player = {
      combatTargetEnemyId: 'e1',
      nextCombatAt: 900,
      targetTileX: 2,
      targetTileY: 3,
      targetPath: [{ tileX: 2, tileY: 3 }],
    };
    orchestrator.process(player, 1000);
    assert.equal(player.targetTileX, null);
    assert.equal(player.targetTileY, null);
    assert.deepEqual(player.targetPath, []);
    assert.deepEqual(calls, ['attack']);
  }
}