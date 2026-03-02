export function rollMinionDrops(minionDefinition, deps) {
  const rolledDrops = [];
  const lootMultiplier = Math.max(1, Number(minionDefinition?.lootMultiplier ?? 1));

  const rollDropEntries = (
    entries,
    shouldRollChance,
    quantityMultiplier = 1,
    nestedLootTablePath = new Set(),
  ) => {
    for (const lootDrop of entries ?? []) {
      if (shouldRollChance) {
        const roll = Math.random() * 100;
        if (roll > lootDrop.chancePct) {
          continue;
        }
      }

      if (lootDrop.dropType === 'lootTable' || lootDrop.lootTableId) {
        const nestedLootTableId = String(lootDrop.lootTableId ?? '').trim();
        if (!nestedLootTableId) {
          continue;
        }

        if (nestedLootTablePath.has(nestedLootTableId)) {
          continue;
        }

        const nestedLootTableDefinition = deps.getLootTableDefinition(nestedLootTableId);
        if (!nestedLootTableDefinition) {
          continue;
        }

        const nestedQuantityMultiplier = quantityMultiplier === 1 ? lootMultiplier : quantityMultiplier;
        const nextLootTablePath = new Set(nestedLootTablePath);
        nextLootTablePath.add(nestedLootTableId);
        rollDropEntries(
          nestedLootTableDefinition.entries.map((entry) => ({
            ...entry,
            sourceLootTableId: nestedLootTableDefinition.id,
            sourceLootTableName: nestedLootTableDefinition.name,
          })),
          true,
          nestedQuantityMultiplier,
          nextLootTablePath,
        );
        continue;
      }

      const scaledMin = Math.max(1, Math.floor(lootDrop.quantity.min * quantityMultiplier));
      const scaledMax = Math.max(scaledMin, Math.floor(lootDrop.quantity.max * quantityMultiplier));
      const quantity = deps.randomIntBetween(scaledMin, scaledMax);
      if (quantity <= 0) {
        continue;
      }

      rolledDrops.push({
        itemId: lootDrop.itemId,
        quantity,
        sourceLootTableId: String(lootDrop.sourceLootTableId ?? ''),
        sourceLootTableName: String(lootDrop.sourceLootTableName ?? ''),
      });
    }
  };

  rollDropEntries(minionDefinition?.guaranteedDrops, false, 1);
  rollDropEntries(minionDefinition?.lootTable, true, 1, new Set());

  return rolledDrops;
}

export function applyMinionDropsToPlayer(player, minionDefinition, deps) {
  const rolledDrops = rollMinionDrops(minionDefinition, {
    getLootTableDefinition: deps.getLootTableDefinition,
    randomIntBetween: deps.randomIntBetween,
  });
  if (rolledDrops.length === 0) {
    return {
      droppedDrops: [],
      lootTableDrops: [],
    };
  }

  const mergedDrops = new Map();
  for (const drop of rolledDrops) {
    const current = mergedDrops.get(drop.itemId) ?? 0;
    mergedDrops.set(drop.itemId, current + drop.quantity);
  }

  const droppedDrops = [];
  const droppedItemIds = new Set();
  const dropTileX = Math.floor(Number(minionDefinition?.tileX ?? player.tileX));
  const dropTileY = Math.floor(Number(minionDefinition?.tileY ?? player.tileY));
  const nowMs = deps.now();
  for (const [itemId, quantity] of mergedDrops.entries()) {
    const droppedGroundItem = deps.dropItemToGround({
      itemId,
      quantity,
      tileX: dropTileX,
      tileY: dropTileY,
      ownerPlayerId: player.id,
      nowMs,
    });
    if (!droppedGroundItem) {
      continue;
    }

    droppedItemIds.add(itemId);
    droppedDrops.push({
      itemId,
      quantity,
      name: droppedGroundItem.name,
    });
  }

  const mergedLootTableDrops = new Map();
  for (const drop of rolledDrops) {
    const sourceLootTableId = String(drop.sourceLootTableId ?? '').trim();
    if (!sourceLootTableId || !droppedItemIds.has(drop.itemId)) {
      continue;
    }

    const mergeKey = `${sourceLootTableId}::${drop.itemId}`;
    const itemDefinition = deps.getItemDefinition(drop.itemId);
    const currentMerged = mergedLootTableDrops.get(mergeKey);
    if (currentMerged) {
      currentMerged.quantity += drop.quantity;
    } else {
      mergedLootTableDrops.set(mergeKey, {
        sourceLootTableId,
        sourceLootTableName: String(drop.sourceLootTableName ?? ''),
        itemId: drop.itemId,
        itemName: itemDefinition?.name ?? drop.itemId,
        quantity: drop.quantity,
      });
    }
  }

  return {
    droppedDrops,
    lootTableDrops: Array.from(mergedLootTableDrops.values()),
  };
}