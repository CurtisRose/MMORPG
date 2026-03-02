import assert from 'node:assert/strict';

import { PlayerCombatPositioningPolicy } from './playerCombatPositioningSystem.mjs';

export function runPlayerCombatPositioningSystemTests() {
  const pathCalls = [];
  const policy = new PlayerCombatPositioningPolicy({
    worldWidthTiles: 80,
    worldHeightTiles: 80,
    isWalkableTile: (tileX, tileY) => !(tileX === 0 || tileY === 0),
    findBestAdjacentTileToTarget: () => ({ tileX: 12, tileY: 11 }),
    setPathTarget: (player, tileX, tileY) => {
      pathCalls.push({ playerId: player.id, tileX, tileY });
      player.targetTileX = tileX;
      player.targetTileY = tileY;
      return true;
    },
    isWithinRange: (fromX, fromY, toX, toY, maxDistance) =>
      Math.abs(fromX - toX) + Math.abs(fromY - toY) <= maxDistance,
    playerAttackRangeTiles: 1,
  });

  const overlapPlayer = {
    id: 'p1',
    tileX: 10,
    tileY: 10,
    previousTraversedTileX: 9,
    previousTraversedTileY: 10,
    targetTileX: 10,
    targetTileY: 10,
    targetPath: [{ tileX: 10, tileY: 10 }],
  };
  const enemy = { tileX: 10, tileY: 10 };

  assert.equal(policy.resolvePositioning(overlapPlayer, enemy), false);
  assert.equal(overlapPlayer.tileX, 9);
  assert.equal(overlapPlayer.tileY, 10);
  assert.equal(overlapPlayer.targetTileX, null);
  assert.equal(overlapPlayer.targetTileY, null);
  assert.deepEqual(overlapPlayer.targetPath, []);

  const noFallbackPlayer = {
    id: 'p2',
    tileX: 10,
    tileY: 10,
    previousTraversedTileX: 0,
    previousTraversedTileY: 0,
    targetTileX: null,
    targetTileY: null,
    targetPath: [],
  };
  assert.equal(policy.resolvePositioning(noFallbackPlayer, enemy), false);
  assert.deepEqual(pathCalls[pathCalls.length - 1], { playerId: 'p2', tileX: 12, tileY: 11 });

  const outOfRangePlayer = {
    id: 'p3',
    tileX: 2,
    tileY: 2,
    targetTileX: null,
    targetTileY: null,
    targetPath: [],
  };
  const farEnemy = { tileX: 9, tileY: 9 };
  assert.equal(policy.resolvePositioning(outOfRangePlayer, farEnemy), false);
  assert.deepEqual(pathCalls[pathCalls.length - 1], { playerId: 'p3', tileX: 12, tileY: 11 });

  const inRangePlayer = {
    id: 'p4',
    tileX: 5,
    tileY: 5,
    targetTileX: null,
    targetTileY: null,
    targetPath: [],
  };
  const nearEnemy = { tileX: 5, tileY: 6 };
  assert.equal(policy.resolvePositioning(inRangePlayer, nearEnemy), true);
}