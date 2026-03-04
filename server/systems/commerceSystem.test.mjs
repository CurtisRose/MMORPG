import assert from 'node:assert/strict';

import { buyFromShop, openBankForPlayer, sellToShop, transferBankItem } from './commerceSystem.mjs';

export function runCommerceSystemTests() {
  const player = {
    activeBankObjectId: null,
    activeCraftingObjectId: 'obj-1',
    activeCraftingStationType: 'smelting',
  };

  const result = openBankForPlayer(player, 'obj-bank', {
    getBankObjectById: () => ({ id: 'obj-bank' }),
    isWithinObjectRange: () => true,
  });

  assert.equal(result.ok, true);
  assert.equal(player.activeBankObjectId, 'obj-bank');
  assert.equal(player.activeCraftingObjectId, null);
  assert.equal(player.activeCraftingStationType, null);

  const secondPlayer = {};
  const buyResult = buyFromShop(secondPlayer, { shopId: 'general', itemId: 'logs', quantity: 2 }, {
    resolveShopById: () => ({
      npcId: 'npc-shop',
      listings: [{ itemId: 'logs', name: 'Logs', buyPrice: 50 }],
    }),
    getNpcById: () => ({ id: 'npc-shop' }),
    isWithinNpcRange: () => true,
    canSpendPlayerGold: () => false,
    addItemToInventory: () => true,
    spendPlayerGold: () => {},
  });

  assert.equal(buyResult.ok, false);
  assert.equal(buyResult.reason, '[Shop] Not enough gold.');

  const sellPlayer = { lastActionText: null };
  let goldAdded = 0;

  const sellResult = sellToShop(sellPlayer, { shopId: 'general', itemId: 'logs', quantity: 3 }, {
    resolveShopById: () => ({
      npcId: 'npc-shop',
      listings: [{ itemId: 'logs', name: 'Logs', sellPrice: 7 }],
    }),
    getNpcById: () => ({ id: 'npc-shop' }),
    isWithinNpcRange: () => true,
    getInventoryItemCount: () => 3,
    removeItemFromInventory: () => true,
    addPlayerGold: (_player, amount) => {
      goldAdded = amount;
    },
  });

  assert.equal(sellResult.ok, true);
  assert.equal(goldAdded, 21);
  assert.equal(sellPlayer.lastActionText, 'Sold Logs x3');
  assert.equal(sellResult.chatText, '[Shop] Sold Logs x3.');

  const bankPlayer = {
    activeBankObjectId: 'obj-bank',
    inventory: {
      maxSlots: 28,
      slots: [
        { itemId: 'bronze_axe', quantity: 1, name: 'Bronze axe' },
        { itemId: 'bronze_axe', quantity: 1, name: 'Bronze axe' },
        { itemId: 'bronze_axe', quantity: 1, name: 'Bronze axe' },
        { itemId: 'apple', quantity: 2, name: 'Apple' },
      ],
    },
    bank: {
      maxSlots: 112,
      slots: [],
    },
    lastActionText: null,
  };

  const transferResult = transferBankItem(
    bankPlayer,
    { from: 'inventory', to: 'bank', slotIndex: 0, quantity: 3 },
    {
      getBankObjectById: () => ({ id: 'obj-bank' }),
      isWithinObjectRange: () => true,
      transferContainerSlot: (source, destination, slotIndex, quantity) => {
        const slot = source.slots[slotIndex];
        if (!slot) {
          return null;
        }

        const moved = Math.max(1, Math.min(Number(quantity), Number(slot.quantity ?? 1)));
        slot.quantity -= moved;
        if (slot.quantity <= 0) {
          source.slots.splice(slotIndex, 1);
        }

        const existing = destination.slots.find((entry) => entry.itemId === slot.itemId);
        if (existing) {
          existing.quantity += moved;
        } else {
          destination.slots.push({ itemId: slot.itemId, quantity: moved, name: slot.name });
        }

        return {
          quantity: moved,
          itemName: slot.name,
        };
      },
    },
  );

  assert.equal(transferResult.ok, true);
  assert.equal(bankPlayer.bank.slots.find((entry) => entry.itemId === 'bronze_axe')?.quantity, 3);
  assert.equal(bankPlayer.inventory.slots.filter((entry) => entry.itemId === 'bronze_axe').length, 0);
  assert.equal(bankPlayer.lastActionText, 'Deposited Bronze axe x3');
}
