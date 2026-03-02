import assert from 'node:assert/strict';

import { buyFromShop, openBankForPlayer, sellToShop } from './commerceSystem.mjs';

export function runCommerceSystemTests() {
  const player = {
    activeBankNpcId: null,
    activeCraftingObjectId: 'obj-1',
    activeCraftingStationType: 'smelting',
  };

  const result = openBankForPlayer(player, 'npc-bank', {
    getBankNpcById: () => ({ id: 'npc-bank' }),
    isWithinNpcRange: () => true,
  });

  assert.equal(result.ok, true);
  assert.equal(player.activeBankNpcId, 'npc-bank');
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
}
