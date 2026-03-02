import assert from 'node:assert/strict';

import {
  createGroundItem,
  isGroundItemVisibleToPlayer,
  tryPickupGroundItem,
} from './groundItemSystem.mjs';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function runGroundItemSystemTests() {
  const createResult = createGroundItem(
    {
      itemId: 'logs',
      quantity: 2,
      tileX: -5,
      tileY: 999,
      ownerPlayerId: 'p1',
      nowMs: 1000,
    },
    {
      getItemDefinition: () => ({
        id: 'logs',
        name: 'Logs',
        image: 'logs.png',
        examineText: 'A log.',
      }),
      clamp,
      randomUUID: () => 'abc',
      worldWidthTiles: 80,
      worldHeightTiles: 80,
      groundItemOwnerPriorityMs: 60000,
      groundItemLifetimeMs: 120000,
    },
  );

  assert.equal(createResult.id, 'ground-abc');
  assert.equal(createResult.tileX, 0);
  assert.equal(createResult.tileY, 79);
  assert.equal(createResult.ownerOnlyUntil, 61000);
  assert.equal(createResult.despawnAt, 121000);

  const map = new Map();
  map.set('g1', {
    id: 'g1',
    itemId: 'logs',
    name: 'Logs',
    quantity: 3,
    tileX: 10,
    tileY: 10,
    ownerPlayerId: null,
    ownerOnlyUntil: 0,
    despawnAt: 999999,
  });

  const player = { id: 'p1', tileX: 10, tileY: 11 };
  const result = tryPickupGroundItem(player, 'g1', 10, {
    worldGroundItems: map,
    addItemToInventory: () => true,
    groundItemPickupRangeTiles: 1,
  });

  assert.deepEqual(result, {
    ok: true,
    itemName: 'Logs',
    quantity: 3,
  });
  assert.equal(map.has('g1'), false);

  const groundItem = {
    despawnAt: 1000,
    ownerPlayerId: 'owner',
    ownerOnlyUntil: 500,
  };

  assert.equal(isGroundItemVisibleToPlayer(groundItem, 'other', 200), false);
  assert.equal(isGroundItemVisibleToPlayer(groundItem, 'other', 600), true);
}
