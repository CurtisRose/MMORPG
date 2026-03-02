import assert from 'node:assert/strict';

import { GridMovementService } from './movementSystem.mjs';

function createMovementService({ isWalkableTile, findPath, canTraverseBetween }) {
  return new GridMovementService({
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    isWalkableTile,
    getWorldWidthTiles: () => 10,
    getWorldHeightTiles: () => 10,
    tileStepIntervalMs: 200,
    diagonalStepMultiplier: 1.65,
    findPath,
    canTraverseBetween,
  });
}

export function runMovementSystemTests() {
  const blockedMovementTiles = new Set(['2,2']);
  const blockedStepService = createMovementService({
    isWalkableTile: (tileX, tileY) => !blockedMovementTiles.has(`${tileX},${tileY}`),
    findPath: () => [{ tileX: 3, tileY: 1 }],
    canTraverseBetween: () => true,
  });

  const walker = {
    tileX: 1,
    tileY: 1,
    previousTraversedTileX: 1,
    previousTraversedTileY: 1,
  };

  assert.equal(blockedStepService.attemptStep(walker, 1, 1), false);
  assert.equal(walker.tileX, 1);
  assert.equal(walker.tileY, 1);

  assert.equal(blockedStepService.attemptStep(walker, 1, 0), true);
  assert.equal(walker.tileX, 2);
  assert.equal(walker.tileY, 1);
  assert.equal(walker.previousTraversedTileX, 1);
  assert.equal(walker.previousTraversedTileY, 1);

  const service = createMovementService({
    isWalkableTile: () => true,
    findPath: () => [{ tileX: 3, tileY: 1 }],
    canTraverseBetween: () => true,
  });

  const directional = {
    tileX: 1,
    tileY: 1,
    previousTraversedTileX: 1,
    previousTraversedTileY: 1,
    directionX: 1,
    directionY: 1,
  };
  const diagonalDelay = service.stepWithDirection(directional);
  assert.equal(diagonalDelay, Math.round(200 * 1.65));
  assert.equal(directional.tileX, 2);
  assert.equal(directional.tileY, 2);

  const pathing = {
    tileX: 1,
    tileY: 1,
    previousTraversedTileX: 1,
    previousTraversedTileY: 1,
    targetTileX: 3,
    targetTileY: 1,
    targetPath: [],
    directionX: 0,
    directionY: 0,
    nextMoveAllowedAt: 0,
  };

  service.stepPlayerIfPossible(pathing, 1000);
  assert.equal(pathing.tileX, 3);
  assert.equal(pathing.tileY, 1);
  assert.equal(pathing.targetTileX, null);
  assert.equal(pathing.targetTileY, null);
  assert.deepEqual(pathing.targetPath, []);
  assert.equal(pathing.nextMoveAllowedAt, 1200);
}