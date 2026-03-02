import assert from 'node:assert/strict';

import { CombatTargetingPolicy } from './combatTargetingSystem.mjs';

export function runCombatTargetingSystemTests() {
  const policy = new CombatTargetingPolicy({
    getPlayerAttackCooldownMs: () => 900,
  });

  assert.equal(policy.isWithinRange(1, 1, 2, 2, 2), true);
  assert.equal(policy.isWithinRange(1, 1, 4, 4, 2), false);

  const idlePlayer = {
    hp: 50,
    combatTargetEnemyId: null,
    targetTileX: null,
    targetTileY: null,
    directionX: 0,
    directionY: 0,
    nextCombatAt: 0,
  };

  assert.equal(policy.canAutoRetaliate(idlePlayer), true);
  assert.equal(policy.isPlayerMoving(idlePlayer), false);
  assert.equal(policy.shouldBeginAutoRetaliation(idlePlayer), true);

  const movingPlayer = {
    ...idlePlayer,
    directionX: 1,
  };
  assert.equal(policy.isPlayerMoving(movingPlayer), true);
  assert.equal(policy.shouldBeginAutoRetaliation(movingPlayer), true);

  const pathingPlayer = {
    ...idlePlayer,
    targetTileX: 5,
    targetTileY: 5,
  };
  assert.equal(policy.shouldBeginAutoRetaliation(pathingPlayer), false);

  policy.beginPlayerCombatTarget(idlePlayer, 'enemy-1', 1000);
  assert.equal(idlePlayer.combatTargetEnemyId, 'enemy-1');
  assert.equal(idlePlayer.nextCombatAt, 1900);

  policy.beginPlayerCombatTarget(idlePlayer, 'enemy-1', 1500);
  assert.equal(idlePlayer.nextCombatAt, 1900);

  const clients = new Map([
    ['a', { player: { hp: 80, tileX: 5, tileY: 5 } }],
    ['b', { player: { hp: 80, tileX: 3, tileY: 2 } }],
    ['c', { player: { hp: 0, tileX: 2, tileY: 2 } }],
  ]);

  const selected = policy.selectAggroTargetEntry(
    { tileX: 2, tileY: 2, aggroRangeTiles: 6 },
    (handler) => {
      for (const [playerId, client] of clients.entries()) {
        handler(playerId, client);
      }
    },
  );

  assert.equal(selected?.playerId, 'b');
}