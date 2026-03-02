export function canAddItemToContainer(container, itemDefinition, quantity) {
  if (quantity <= 0) {
    return false;
  }

  if (itemDefinition.stackable) {
    const existingSlot = container.slots.find((slot) => slot.itemId === itemDefinition.id);
    if (existingSlot) {
      return true;
    }

    return container.slots.length < container.maxSlots;
  }

  return container.slots.length + quantity <= container.maxSlots;
}

export function addItemToContainer(
  container,
  itemDefinition,
  quantity,
  deps,
) {
  if (!canAddItemToContainer(container, itemDefinition, quantity)) {
    return false;
  }

  if (itemDefinition.stackable) {
    const existingSlot = container.slots.find((slot) => slot.itemId === itemDefinition.id);
    if (existingSlot) {
      existingSlot.quantity += quantity;
      return true;
    }

    container.slots.push(deps.createInventorySlot(itemDefinition, quantity));
    return true;
  }

  for (let index = 0; index < quantity; index += 1) {
    container.slots.push(deps.createInventorySlot(itemDefinition, 1));
  }

  return true;
}

export function transferContainerSlot(source, destination, slotIndex, quantity, deps) {
  const index = Math.floor(Number(slotIndex));
  if (!Number.isFinite(index) || index < 0 || index >= source.slots.length) {
    return null;
  }

  const sourceSlot = source.slots[index];
  if (!sourceSlot) {
    return null;
  }

  const itemDefinition = deps.getItemDefinition(sourceSlot.itemId);
  if (!itemDefinition) {
    return null;
  }

  const requestedQuantity = Math.max(1, Math.floor(Number(quantity ?? 1)));
  const transferQuantity = Math.min(requestedQuantity, sourceSlot.quantity);

  if (!canAddItemToContainer(destination, itemDefinition, transferQuantity)) {
    return null;
  }

  sourceSlot.quantity -= transferQuantity;
  if (sourceSlot.quantity <= 0) {
    source.slots.splice(index, 1);
  }

  const moved = addItemToContainer(destination, itemDefinition, transferQuantity, {
    createInventorySlot: deps.createInventorySlot,
  });
  if (!moved) {
    return null;
  }

  return {
    quantity: transferQuantity,
    itemName: itemDefinition.name,
  };
}
