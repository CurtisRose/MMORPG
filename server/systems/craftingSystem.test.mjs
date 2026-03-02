import assert from 'node:assert/strict';

import { performCraftingAtStation, sendCraftingOpenToSocket } from './craftingSystem.mjs';
import { addItemToContainer, canAddItemToContainer } from './inventorySystem.mjs';

const itemDefs = {
  copper_ore: { id: 'copper_ore', name: 'Copper Ore', stackable: true },
  bronze_bar: { id: 'bronze_bar', name: 'Bronze Bar', stackable: true },
};

function clamp01(value, fallback = 1) {
  const safe = Number.isFinite(Number(value)) ? Number(value) : fallback;
  return Math.max(0, Math.min(1, safe));
}

function createInventorySlot(itemDefinition, quantity) {
  return { itemId: itemDefinition.id, quantity, name: itemDefinition.name };
}

function getInventoryItemCount(player, itemId) {
  return player.inventory.slots
    .filter((slot) => slot.itemId === itemId)
    .reduce((sum, slot) => sum + slot.quantity, 0);
}

function cloneInventory(inventory, maxSlots) {
  return {
    maxSlots,
    slots: inventory.slots.map((slot) => ({ ...slot })),
  };
}

function removeItemFromInventory(player, itemId, quantity) {
  let remaining = quantity;
  for (let index = player.inventory.slots.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const slot = player.inventory.slots[index];
    if (slot.itemId !== itemId) {
      continue;
    }
    const consumed = Math.min(slot.quantity, remaining);
    slot.quantity -= consumed;
    remaining -= consumed;
    if (slot.quantity <= 0) {
      player.inventory.slots.splice(index, 1);
    }
  }
  return remaining === 0;
}

function addItemToInventory(player, itemId, quantity) {
  const def = itemDefs[itemId];
  if (!def) {
    return false;
  }
  return addItemToContainer(player.inventory, def, quantity, { createInventorySlot });
}

export function runCraftingSystemTests() {
  const payloads = [];
  const socket = { send: (value) => payloads.push(JSON.parse(value)) };
  const openPlayer = { inventory: { maxSlots: 28, slots: [] } };

  const ok = sendCraftingOpenToSocket(socket, openPlayer, {
    stationType: 'smelting',
    recipeSkill: 'smithing',
    title: 'Smelting Furnace',
  }, 'obj-smelting', {
    craftingSkillConfigs: {
      smithing: {
        recipes: [{ id: 'bar', inputs: [], outputs: [{ itemId: 'bronze_bar', quantity: 1 }] }],
      },
    },
    sendChatToSocket: () => {},
    toInventorySnapshot: (inventory) => inventory,
    clamp01,
    getItemDefinition: (itemId) => itemDefs[itemId] ?? null,
  });

  assert.equal(ok, true);
  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].type, 'craftingOpen');
  assert.equal(payloads[0].recipes.length, 1);

  const player = {
    skills: { smithing: { level: 10, xp: 0 } },
    inventory: {
      maxSlots: 28,
      slots: [{ itemId: 'copper_ore', quantity: 3, name: 'Copper Ore' }],
    },
  };

  const result = performCraftingAtStation(player, 'smelting', 'bronze', 1, {
    craftingStations: {
      smelting: { stationType: 'smelting', recipeSkill: 'smithing', xpSkill: 'smithing' },
    },
    craftingSkillConfigs: {
      smithing: {
        recipes: [{
          id: 'bronze',
          requiredLevel: 1,
          successChance: 1,
          xp: 10,
          inputs: [{ itemId: 'copper_ore', quantity: 2 }],
          outputs: [{ itemId: 'bronze_bar', quantity: 1 }],
        }],
      },
    },
    clamp01,
    getItemDefinition: (itemId) => itemDefs[itemId] ?? null,
    getInventoryItemCount,
    cloneInventory,
    inventoryMaxSlots: 28,
    canAddItemToContainer,
    addItemToContainer: (container, itemDefinition, quantity) =>
      addItemToContainer(container, itemDefinition, quantity, { createInventorySlot }),
    removeItemFromInventory,
    addItemToInventory,
    addSkillXp: () => {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.craftedCount, 1);
  assert.equal(getInventoryItemCount(player, 'copper_ore'), 1);
  assert.equal(getInventoryItemCount(player, 'bronze_bar'), 1);
}
