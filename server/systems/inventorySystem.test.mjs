import assert from 'node:assert/strict';

import {
  addItemToContainer,
  canAddItemToContainer,
  transferContainerSlot,
} from './inventorySystem.mjs';

function createInventorySlot(itemDefinition, quantity) {
  return {
    itemId: itemDefinition.id,
    name: itemDefinition.name,
    quantity,
  };
}

export function runInventorySystemTests() {
  const container = {
    maxSlots: 1,
    slots: [{ itemId: 'logs', quantity: 10 }],
  };
  const item = { id: 'logs', name: 'Logs', stackable: true };

  assert.equal(canAddItemToContainer(container, item, 5), true);

  const source = {
    maxSlots: 28,
    slots: [{ itemId: 'logs', quantity: 7 }],
  };
  const destination = {
    maxSlots: 28,
    slots: [{ itemId: 'logs', quantity: 3 }],
  };
  const defs = {
    logs: { id: 'logs', name: 'Logs', stackable: true },
  };

  const result = transferContainerSlot(source, destination, 0, 4, {
    getItemDefinition: (itemId) => defs[itemId] ?? null,
    createInventorySlot,
  });

  assert.deepEqual(result, { quantity: 4, itemName: 'Logs' });
  assert.equal(source.slots[0].quantity, 3);
  assert.equal(destination.slots[0].quantity, 7);

  const nonStackableContainer = { maxSlots: 5, slots: [] };
  const nonStackableItem = { id: 'ore', name: 'Copper Ore', stackable: false };

  const ok = addItemToContainer(nonStackableContainer, nonStackableItem, 3, { createInventorySlot });
  assert.equal(ok, true);
  assert.equal(nonStackableContainer.slots.length, 3);
  assert.deepEqual(nonStackableContainer.slots.map((slot) => slot.quantity), [1, 1, 1]);
}
