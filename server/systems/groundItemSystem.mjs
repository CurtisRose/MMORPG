export function createGroundItem(dropRequest, deps) {
  const {
    itemId,
    quantity,
    tileX,
    tileY,
    ownerPlayerId = null,
    nowMs = Date.now(),
  } = dropRequest;

  const itemDefinition = deps.getItemDefinition(itemId);
  if (!itemDefinition) {
    return null;
  }

  const safeQuantity = Math.max(1, Math.floor(Number(quantity ?? 1)));
  const safeTileX = deps.clamp(
    Math.floor(Number(tileX ?? 0)),
    0,
    deps.worldWidthTiles - 1,
  );
  const safeTileY = deps.clamp(
    Math.floor(Number(tileY ?? 0)),
    0,
    deps.worldHeightTiles - 1,
  );
  const hasOwner = typeof ownerPlayerId === 'string' && ownerPlayerId.length > 0;

  return {
    id: `ground-${deps.randomUUID()}`,
    itemId: itemDefinition.id,
    name: itemDefinition.name,
    image: itemDefinition.image,
    examineText: itemDefinition.examineText,
    quantity: safeQuantity,
    tileX: safeTileX,
    tileY: safeTileY,
    ownerPlayerId: hasOwner ? ownerPlayerId : null,
    ownerOnlyUntil: hasOwner ? nowMs + deps.groundItemOwnerPriorityMs : nowMs,
    despawnAt: nowMs + deps.groundItemLifetimeMs,
    createdAt: nowMs,
  };
}

export function isGroundItemVisibleToPlayer(groundItem, viewerPlayerId, nowMs) {
  if (!groundItem || groundItem.despawnAt <= nowMs) {
    return false;
  }

  if (!groundItem.ownerPlayerId) {
    return true;
  }

  if (viewerPlayerId && groundItem.ownerPlayerId === viewerPlayerId) {
    return true;
  }

  return nowMs >= groundItem.ownerOnlyUntil;
}

export function processGroundItemLifecycle(worldGroundItems, nowMs) {
  for (const [groundItemId, groundItem] of worldGroundItems.entries()) {
    if (groundItem.despawnAt > nowMs) {
      continue;
    }

    worldGroundItems.delete(groundItemId);
  }
}

export function tryPickupGroundItem(player, groundItemId, nowMs, deps) {
  const id = String(groundItemId ?? '').trim();
  if (!id) {
    return { ok: false, reason: 'Invalid ground item.' };
  }

  const groundItem = deps.worldGroundItems.get(id);
  if (!groundItem) {
    return { ok: false, reason: 'That item is no longer there.' };
  }

  if (groundItem.despawnAt <= nowMs) {
    deps.worldGroundItems.delete(id);
    return { ok: false, reason: 'That item has already despawned.' };
  }

  if (!isGroundItemVisibleToPlayer(groundItem, player.id, nowMs)) {
    return { ok: false, reason: 'That item is not visible to you yet.' };
  }

  const distance = Math.abs(player.tileX - groundItem.tileX) + Math.abs(player.tileY - groundItem.tileY);
  if (distance > deps.groundItemPickupRangeTiles) {
    return { ok: false, reason: 'Move closer to pick that up.' };
  }

  const added = deps.addItemToInventory(player, groundItem.itemId, groundItem.quantity);
  if (!added) {
    return { ok: false, reason: 'Not enough inventory space.' };
  }

  deps.worldGroundItems.delete(id);
  return {
    ok: true,
    itemName: groundItem.name,
    quantity: groundItem.quantity,
  };
}