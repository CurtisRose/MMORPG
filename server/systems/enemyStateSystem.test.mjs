import assert from 'node:assert/strict';

import { EnemyStateService } from './enemyStateSystem.mjs';

export function runEnemyStateSystemTests() {
  const setPathCalls = [];
  const stepCalls = [];
  const service = new EnemyStateService({
    setPathTarget: (enemy, tileX, tileY) => {
      setPathCalls.push({ enemyId: enemy.id, tileX, tileY });
      enemy.targetTileX = tileX;
      enemy.targetTileY = tileY;
      return true;
    },
    stepTowardTarget: (enemy) => {
      stepCalls.push(enemy.id);
      return 200;
    },
  });

  const deadEnemy = { id: 'dead-1', deadUntil: 2000 };
  assert.equal(service.shouldSkipForDeath(deadEnemy, 1000), true);

  const revivingEnemy = {
    id: 'revive-1',
    deadUntil: 1000,
    hp: 0,
    maxHp: 35,
    tileX: 10,
    tileY: 10,
    spawnTileX: 3,
    spawnTileY: 4,
    targetTileX: 12,
    targetTileY: 12,
    targetPath: [{ tileX: 12, tileY: 12 }],
    targetPlayerId: 'p1',
    nextMoveAllowedAt: 0,
    nextAttackAt: 0,
    hpRegenIntervalMs: 2500,
    nextHpRegenAt: 0,
  };

  assert.equal(service.shouldSkipForDeath(revivingEnemy, 1000), false);
  assert.equal(revivingEnemy.deadUntil, 0);
  assert.equal(revivingEnemy.hp, 35);
  assert.equal(revivingEnemy.tileX, 3);
  assert.equal(revivingEnemy.tileY, 4);
  assert.equal(revivingEnemy.targetTileX, null);
  assert.equal(revivingEnemy.targetTileY, null);
  assert.deepEqual(revivingEnemy.targetPath, []);
  assert.equal(revivingEnemy.targetPlayerId, null);
  assert.equal(revivingEnemy.nextMoveAllowedAt, 1000);
  assert.equal(revivingEnemy.nextAttackAt, 1000);
  assert.equal(revivingEnemy.nextHpRegenAt, 3500);

  const regenEnemy = {
    hp: 9,
    maxHp: 12,
    nextHpRegenAt: 1000,
    hpRegenAmount: 2,
    hpRegenIntervalMs: 2500,
  };
  service.applyRegeneration(regenEnemy, 1000);
  assert.equal(regenEnemy.hp, 11);
  assert.equal(regenEnemy.nextHpRegenAt, 3500);

  const outOfRangeEnemy = {
    id: 'chase-1',
    tileX: 10,
    tileY: 10,
    spawnTileX: 1,
    spawnTileY: 1,
    maxChaseDistanceTiles: 2,
    targetTileX: 10,
    targetTileY: 10,
    targetPath: [],
    nextMoveAllowedAt: 900,
    targetPlayerId: 'p2',
  };

  assert.equal(service.handleOutOfChaseRange(outOfRangeEnemy, 1000), true);
  assert.equal(outOfRangeEnemy.targetPlayerId, null);
  assert.equal(outOfRangeEnemy.nextMoveAllowedAt, 1200);
  assert.equal(setPathCalls.length, 1);
  assert.equal(stepCalls.length, 1);

  const idleAtSpawnEnemy = {
    id: 'spawn-1',
    tileX: 5,
    tileY: 6,
    spawnTileX: 5,
    spawnTileY: 6,
    targetTileX: 7,
    targetTileY: 8,
    targetPath: [{ tileX: 7, tileY: 8 }],
  };

  assert.equal(service.handleNoTarget(idleAtSpawnEnemy, 1000), true);
  assert.equal(idleAtSpawnEnemy.targetTileX, null);
  assert.equal(idleAtSpawnEnemy.targetTileY, null);
  assert.deepEqual(idleAtSpawnEnemy.targetPath, []);
}