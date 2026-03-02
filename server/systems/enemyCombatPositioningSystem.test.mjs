import assert from 'node:assert/strict';

import { EnemyCombatPositioningPolicy } from './enemyCombatPositioningSystem.mjs';

export function runEnemyCombatPositioningSystemTests() {
  const policy = new EnemyCombatPositioningPolicy({
    isWithinRange: (fromX, fromY, toX, toY, maxDistance) =>
      Math.abs(fromX - toX) + Math.abs(fromY - toY) <= maxDistance,
    enemyAttackRangeTiles: 1,
  });

  const enemy = {
    tileX: 10,
    tileY: 10,
    targetTileX: 9,
    targetTileY: 9,
    targetPath: [{ tileX: 9, tileY: 9 }],
  };
  const nearTarget = { tileX: 10, tileY: 11 };
  const farTarget = { tileX: 13, tileY: 13 };

  assert.equal(policy.isInAttackRange(enemy, nearTarget), true);
  assert.equal(policy.isInAttackRange(enemy, farTarget), false);

  policy.enterAttackStance(enemy);
  assert.equal(enemy.targetTileX, null);
  assert.equal(enemy.targetTileY, null);
  assert.deepEqual(enemy.targetPath, []);
}