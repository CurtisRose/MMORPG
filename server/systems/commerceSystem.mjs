export function openBankForPlayer(player, objectId, deps) {
  const bankObject = deps.getBankObjectById(String(objectId ?? ''));
  if (!bankObject || !deps.isWithinObjectRange(player, bankObject)) {
    return { ok: false, reason: '[Bank] You are too far away.' };
  }

  player.activeBankObjectId = bankObject.id;
  player.activeCraftingObjectId = null;
  player.activeCraftingStationType = null;
  return { ok: true };
}

export function transferBankItem(player, message, deps) {
  const from = message.from === 'bank' ? 'bank' : 'inventory';
  const to = message.to === 'bank' ? 'bank' : 'inventory';
  const slotIndex = message.slotIndex;
  const requestedQuantity = Number(message.quantity ?? 1);
  const quantity = Number.isFinite(requestedQuantity)
    ? Math.max(1, Math.floor(requestedQuantity))
    : 1;

  if (from === to) {
    return { ok: false, skipped: true };
  }

  const activeBankObject = player.activeBankObjectId
    ? deps.getBankObjectById(player.activeBankObjectId)
    : null;
  if (!activeBankObject || !deps.isWithinObjectRange(player, activeBankObject)) {
    player.activeBankObjectId = null;
    return { ok: false, reason: '[Bank] Move closer to the bank chest.' };
  }

  const sourceContainer = from === 'bank' ? player.bank : player.inventory;
  const destinationContainer = to === 'bank' ? player.bank : player.inventory;
  const transferResult = deps.transferContainerSlot(sourceContainer, destinationContainer, slotIndex, quantity);

  if (!transferResult) {
    return { ok: false, reason: '[Bank] Could not move that item.' };
  }

  const quantityText = transferResult.quantity > 1 ? ` x${transferResult.quantity}` : '';
  player.lastActionText = `${from === 'inventory' ? 'Deposited' : 'Withdrew'} ${transferResult.itemName}${quantityText}`;
  return { ok: true };
}

export function getShopOpenPayload(player, npcId, deps) {
  const safeNpcId = String(npcId ?? '');
  const npc = deps.getNpcById(safeNpcId);
  const shop = deps.getShopByNpcId(safeNpcId);
  if (!npc || npc.type !== 'shopkeeper' || !shop || !deps.isWithinNpcRange(player, npc)) {
    return null;
  }

  return {
    shopId: shop.id,
  };
}

export function buyFromShop(player, message, deps) {
  const shopId = String(message.shopId ?? '');
  const itemId = String(message.itemId ?? '');
  const quantity = Math.max(1, Math.min(999, Number(message.quantity ?? 1)));

  const shop = deps.resolveShopById(shopId);
  if (!shop) {
    return { ok: false, silent: true };
  }

  const npc = deps.getNpcById(shop.npcId);
  if (!npc || !deps.isWithinNpcRange(player, npc)) {
    return { ok: false, reason: '[Shop] You are too far away.' };
  }

  const listing = shop.listings.find((entry) => entry.itemId === itemId);
  if (!listing) {
    return { ok: false, silent: true };
  }

  const totalCost = listing.buyPrice * quantity;
  if (!deps.canSpendPlayerGold(player, totalCost)) {
    return { ok: false, reason: '[Shop] Not enough gold.' };
  }

  const added = deps.addItemToInventory(player, listing.itemId, quantity);
  if (!added) {
    return { ok: false, reason: '[Shop] Not enough inventory space.' };
  }

  deps.spendPlayerGold(player, totalCost);
  player.lastActionText = `Bought ${listing.name} x${quantity}`;
  return {
    ok: true,
    chatText: `[Shop] Bought ${listing.name} x${quantity}.`,
  };
}

export function sellToShop(player, message, deps) {
  const shopId = String(message.shopId ?? '');
  const itemId = String(message.itemId ?? '');
  const quantity = Math.max(1, Math.min(999, Number(message.quantity ?? 1)));

  const shop = deps.resolveShopById(shopId);
  if (!shop) {
    return { ok: false, silent: true };
  }

  const npc = deps.getNpcById(shop.npcId);
  if (!npc || !deps.isWithinNpcRange(player, npc)) {
    return { ok: false, reason: '[Shop] You are too far away.' };
  }

  const listing = shop.listings.find((entry) => entry.itemId === itemId);
  if (!listing) {
    return { ok: false, silent: true };
  }

  const currentCount = deps.getInventoryItemCount(player, itemId);
  if (currentCount < quantity) {
    return { ok: false, reason: '[Shop] Not enough items to sell.' };
  }

  const removed = deps.removeItemFromInventory(player, itemId, quantity);
  if (!removed) {
    return { ok: false, reason: '[Shop] Could not complete sale.' };
  }

  const totalGold = listing.sellPrice * quantity;
  deps.addPlayerGold(player, totalGold);
  player.lastActionText = `Sold ${listing.name} x${quantity}`;
  return {
    ok: true,
    chatText: `[Shop] Sold ${listing.name} x${quantity}.`,
  };
}