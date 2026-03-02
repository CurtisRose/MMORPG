function hasRequiredItemsForRecipe(player, recipe, deps) {
  for (const input of recipe.inputs) {
    const quantity = Math.max(1, Math.floor(Number(input.quantity ?? 1)));
    if (deps.getInventoryItemCount(player, input.itemId) < quantity) {
      return false;
    }
  }

  return true;
}

function canReceiveRecipeOutputs(player, recipe, deps) {
  const projectedInventory = deps.cloneInventory(player.inventory, deps.inventoryMaxSlots);

  for (const input of recipe.inputs) {
    let remaining = Math.max(1, Math.floor(Number(input.quantity ?? 1)));

    for (let index = projectedInventory.slots.length - 1; index >= 0 && remaining > 0; index -= 1) {
      const slot = projectedInventory.slots[index];
      if (slot.itemId !== input.itemId) {
        continue;
      }

      const available = Math.max(0, Math.floor(Number(slot.quantity ?? 0)));
      if (available <= 0) {
        continue;
      }

      const consumed = Math.min(available, remaining);
      slot.quantity -= consumed;
      remaining -= consumed;

      if (slot.quantity <= 0) {
        projectedInventory.slots.splice(index, 1);
      }
    }

    if (remaining > 0) {
      return false;
    }
  }

  for (const output of recipe.outputs) {
    const itemDefinition = deps.getItemDefinition(output.itemId);
    if (!itemDefinition) {
      return false;
    }

    const quantity = Math.max(1, Math.floor(Number(output.quantity ?? 1)));
    if (!deps.canAddItemToContainer(projectedInventory, itemDefinition, quantity)) {
      return false;
    }

    deps.addItemToContainer(projectedInventory, itemDefinition, quantity);
  }

  return true;
}

export function getCraftingRecipeDisplayName(recipe, deps) {
  const firstOutput = Array.isArray(recipe?.outputs) && recipe.outputs.length > 0
    ? recipe.outputs[0]
    : null;
  const outputDefinition = firstOutput ? deps.getItemDefinition(firstOutput.itemId) : null;
  if (outputDefinition?.name) {
    return outputDefinition.name;
  }

  return String(recipe?.id ?? 'Recipe');
}

export function toCraftingRecipeSnapshot(recipe, deps) {
  return {
    id: String(recipe.id),
    name: getCraftingRecipeDisplayName(recipe, {
      getItemDefinition: deps.getItemDefinition,
    }),
    requiredLevel: Math.max(1, Math.floor(Number(recipe.requiredLevel ?? 1))),
    durationMs: Math.max(100, Math.floor(Number(recipe.durationMs ?? 1000))),
    successChance: deps.clamp01(recipe.successChance, 1),
    xp: Math.max(0, Number(recipe.xp ?? 0)),
    inputs: (Array.isArray(recipe.inputs) ? recipe.inputs : []).map((entry) => ({
      itemId: String(entry.itemId),
      name: deps.getItemDefinition(entry.itemId)?.name ?? String(entry.itemId),
      quantity: Math.max(1, Math.floor(Number(entry.quantity ?? 1))),
    })),
    outputs: (Array.isArray(recipe.outputs) ? recipe.outputs : []).map((entry) => ({
      itemId: String(entry.itemId),
      name: deps.getItemDefinition(entry.itemId)?.name ?? String(entry.itemId),
      quantity: Math.max(1, Math.floor(Number(entry.quantity ?? 1))),
    })),
  };
}

export function sendCraftingOpenToSocket(socket, player, station, objectId, deps) {
  const craftingConfig = deps.craftingSkillConfigs[station.recipeSkill];
  if (!craftingConfig || !Array.isArray(craftingConfig.recipes) || craftingConfig.recipes.length === 0) {
    deps.sendChatToSocket(socket, '[Crafting] No recipes are configured for this station yet.');
    return false;
  }

  socket.send(
    JSON.stringify({
      type: 'craftingOpen',
      stationType: station.stationType,
      title: station.title,
      objectId,
      inventory: deps.toInventorySnapshot(player.inventory),
      recipes: craftingConfig.recipes.map((recipe) => toCraftingRecipeSnapshot(recipe, {
        clamp01: deps.clamp01,
        getItemDefinition: deps.getItemDefinition,
      })),
    }),
  );
  return true;
}

export function performCraftingAtStation(player, stationType, recipeId, quantity, deps) {
  const station = deps.craftingStations[String(stationType ?? '')] ?? null;
  if (!station) {
    return { ok: false, reason: 'Unknown crafting station.' };
  }

  const config = deps.craftingSkillConfigs[station.recipeSkill];
  if (!config || !Array.isArray(config.recipes)) {
    return { ok: false, reason: 'No recipes configured for this station.' };
  }

  const recipe = config.recipes.find((entry) => String(entry.id) === String(recipeId ?? ''));
  if (!recipe) {
    return { ok: false, reason: 'Unknown recipe.' };
  }

  const skillState = player.skills?.[station.xpSkill] ?? { level: 1 };
  const requiredLevel = Math.max(1, Math.floor(Number(recipe.requiredLevel ?? 1)));
  if (Math.max(1, Math.floor(Number(skillState.level ?? 1))) < requiredLevel) {
    return { ok: false, reason: `Requires ${station.xpSkill} level ${requiredLevel}.` };
  }

  const craftAttempts = Math.max(1, Math.min(28, Math.floor(Number(quantity ?? 1))));
  let craftedCount = 0;

  for (let index = 0; index < craftAttempts; index += 1) {
    if (!hasRequiredItemsForRecipe(player, recipe, {
      getInventoryItemCount: deps.getInventoryItemCount,
    })) {
      break;
    }

    if (!canReceiveRecipeOutputs(player, recipe, {
      cloneInventory: deps.cloneInventory,
      inventoryMaxSlots: deps.inventoryMaxSlots,
      getItemDefinition: deps.getItemDefinition,
      canAddItemToContainer: deps.canAddItemToContainer,
      addItemToContainer: deps.addItemToContainer,
    })) {
      if (craftedCount === 0) {
        return { ok: false, reason: 'Not enough inventory space.' };
      }
      break;
    }

    for (const input of recipe.inputs) {
      const inputQuantity = Math.max(1, Math.floor(Number(input.quantity ?? 1)));
      const removed = deps.removeItemFromInventory(player, input.itemId, inputQuantity);
      if (!removed) {
        return craftedCount > 0
          ? { ok: true, craftedCount, recipe: toCraftingRecipeSnapshot(recipe, deps), partial: true }
          : { ok: false, reason: 'Missing required materials.' };
      }
    }

    const successChance = deps.clamp01(recipe.successChance, 1);
    if (Math.random() > successChance) {
      continue;
    }

    for (const output of recipe.outputs) {
      const outputQuantity = Math.max(1, Math.floor(Number(output.quantity ?? 1)));
      const added = deps.addItemToInventory(player, output.itemId, outputQuantity);
      if (!added) {
        return craftedCount > 0
          ? { ok: true, craftedCount, recipe: toCraftingRecipeSnapshot(recipe, deps), partial: true }
          : { ok: false, reason: 'Not enough inventory space.' };
      }
    }

    const xpGain = Math.max(0, Number(recipe.xp ?? 0));
    if (xpGain > 0) {
      deps.addSkillXp(player, station.xpSkill, xpGain);
    }

    craftedCount += 1;
  }

  if (craftedCount <= 0) {
    return { ok: false, reason: 'You do not have the required materials.' };
  }

  return {
    ok: true,
    craftedCount,
    recipe: toCraftingRecipeSnapshot(recipe, deps),
    partial: craftedCount < craftAttempts,
  };
}