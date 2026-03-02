import assert from 'node:assert/strict';

import { EnemyNavigationPolicy } from './enemyNavigationSystem.mjs';

export function runEnemyNavigationSystemTests() {
  const setPathCalls = [];
  let nextStepDelay = 200;
  const policy = new EnemyNavigationPolicy({
    findBestAdjacentTileToTarget: () => ({ tileX: 8, tileY: 9 }),
    setPathTarget: (enemy, tileX, tileY) => {
      setPathCalls.push({ enemyId: enemy.id, tileX, tileY });
      enemy.targetTileX = tileX;
      enemy.targetTileY = tileY;
      return true;
    },
    stepTowardTarget: () => nextStepDelay,
  });

  const enemy = {
    id: 'enemy-1',
    targetTileX: 1,
    targetTileY: 1,
    targetPath: [{ tileX: 1, tileY: 1 }],
    nextMoveAllowedAt: 1000,
  };
  const targetPlayer = { tileX: 10, tileY: 10 };

  policy.updatePursuitPath(enemy, targetPlayer);
  assert.equal(setPathCalls.length, 1);
  assert.equal(enemy.targetTileX, 8);
  assert.equal(enemy.targetTileY, 9);

  setPathCalls.length = 0;
  enemy.targetPath = [{ tileX: 8, tileY: 9 }];
  policy.updatePursuitPath(enemy, targetPlayer);
  assert.equal(setPathCalls.length, 0);

  enemy.targetPath = [];
  policy.updatePursuitPath(enemy, targetPlayer);
  assert.equal(setPathCalls.length, 1);

  enemy.nextMoveAllowedAt = 1500;
  policy.stepTowardPursuitTarget(enemy, 1400);
  assert.equal(enemy.nextMoveAllowedAt, 1500);

  policy.stepTowardPursuitTarget(enemy, 1500);
  assert.equal(enemy.nextMoveAllowedAt, 1700);

  nextStepDelay = 0;
  policy.stepTowardPursuitTarget(enemy, 1700);
  assert.equal(enemy.nextMoveAllowedAt, 1700);
}