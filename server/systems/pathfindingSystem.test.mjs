import assert from 'node:assert/strict';

import { GridPathfindingService } from './pathfindingSystem.mjs';

function createService(blockedTiles = []) {
  const blocked = new Set(blockedTiles.map(([tileX, tileY]) => `${tileX},${tileY}`));

  const isWalkableTile = (tileX, tileY) => {
    if (tileX < 0 || tileX > 20 || tileY < 0 || tileY > 20) {
      return false;
    }

    return !blocked.has(`${tileX},${tileY}`);
  };

  return new GridPathfindingService({
    isWalkableTile,
    moveFallbackSearchRadius: 4,
  });
}

export function runPathfindingSystemTests() {
  const traversalService = createService([[1, 0]]);
  assert.equal(traversalService.canTraverseBetween(0, 0, 1, 1), false);

  const pathService = createService([[2, 2]]);
  assert.equal(pathService.findPath(0, 0, 2, 2), null);

  const path = pathService.findPath(0, 0, 3, 0);
  assert.ok(Array.isArray(path));
  assert.equal(path.length, 3);
  assert.deepEqual(path[path.length - 1], { tileX: 3, tileY: 0 });

  const fallbackBlockedTiles = [[4, 4], [3, 4], [4, 3]];
  const fallbackBlocked = new Set(fallbackBlockedTiles.map(([tileX, tileY]) => `${tileX},${tileY}`));
  const fallbackService = createService(fallbackBlockedTiles);
  const entity = { tileX: 2, tileY: 2 };
  const fallback = fallbackService.findNearestReachableDestination(entity, 4, 4);
  assert.ok(fallback);
  assert.equal(fallback.tileX === 4 && fallback.tileY === 4, false);
  assert.equal(fallbackBlocked.has(`${fallback.tileX},${fallback.tileY}`), false);
  assert.ok(Array.isArray(fallback?.path));
  assert.ok(fallback.path.length > 0);

  const moveTargetEntity = {
    tileX: 2,
    tileY: 2,
    directionX: 1,
    directionY: -1,
    targetTileX: null,
    targetTileY: null,
    targetPath: [],
  };

  const setResult = fallbackService.setPathTarget(moveTargetEntity, 4, 4);
  assert.equal(setResult, true);
  assert.equal(moveTargetEntity.directionX, 0);
  assert.equal(moveTargetEntity.directionY, 0);
  assert.equal(fallbackBlocked.has(`${moveTargetEntity.targetTileX},${moveTargetEntity.targetTileY}`), false);
  assert.equal(moveTargetEntity.targetTileX === 4 && moveTargetEntity.targetTileY === 4, false);
  assert.ok(moveTargetEntity.targetPath.length > 0);
}