export class InteractionOrchestrator {
  constructor(deps) {
    this.deps = deps;
  }

  process(player, nowMs) {
    if (!player.activeInteractionNodeId) {
      return;
    }

    const node = this.deps.getWorldNodeById(player.activeInteractionNodeId);
    if (!node) {
      player.activeInteractionNodeId = null;
      return;
    }

    if (!this.deps.isWithinInteractionRange(player, node)) {
      player.lastActionText = `Out of range for ${this.deps.getResourceName(node.resourceId, node.type)}`;
      return;
    }

    if (nowMs < player.nextInteractionAt) {
      return;
    }

    if (node.depletedUntil > nowMs) {
      const depletedConfig = this.deps.getHarvestResourceConfig(node.resourceId, node.type);
      if (depletedConfig) {
        player.lastActionText = this.deps.interpolateTemplate(depletedConfig.messages.depleted, {
          resourceName: this.deps.getResourceName(depletedConfig.id, depletedConfig.id.replaceAll('_', ' ')),
        });
      } else {
        player.lastActionText = `${this.deps.getResourceName(node.resourceId, node.type)} depleted`;
      }

      player.activeInteractionNodeId = null;
      return;
    }

    const resourceConfig = this.deps.getHarvestResourceConfig(node.resourceId, node.type);
    if (!resourceConfig) {
      player.lastActionText = `No resource config for ${node.resourceId}`;
      return;
    }

    const playerSkill = player.skills[resourceConfig.skill];
    if (!playerSkill || playerSkill.level < resourceConfig.requiredLevel) {
      player.lastActionText = this.deps.interpolateTemplate(resourceConfig.messages.locked, {
        requiredLevel: resourceConfig.requiredLevel,
      });
      player.activeInteractionNodeId = null;
      return;
    }

    if (!Number.isFinite(node.hitsRemaining) || node.hitsRemaining <= 0) {
      node.hitsRemaining = this.deps.rollDepletionHits(resourceConfig);
    }

    const skillBonuses = this.deps.getPlayerSkillActionBonuses(player, resourceConfig.skill);
    const playerSkillLevel = Math.max(
      1,
      Math.floor(Number(player.skills?.[resourceConfig.skill]?.level ?? 1)),
    );
    const levelDifference = Math.max(0, playerSkillLevel - resourceConfig.requiredLevel);
    const levelSuccessChanceBonus = Math.min(
      this.deps.harvestSuccessChanceBonusMax,
      levelDifference * this.deps.harvestSuccessChanceBonusPerLevel,
    );
    const adjustedSuccessChance = this.deps.clamp01(
      resourceConfig.successChance + skillBonuses.successChanceBonus + levelSuccessChanceBonus,
      resourceConfig.successChance,
    );
    const adjustedGatherIntervalMs = Math.max(
      250,
      Math.floor(resourceConfig.gatherIntervalMs * skillBonuses.gatherIntervalMultiplier),
    );

    node.gatherIntervalMs = adjustedGatherIntervalMs;
    player.nextInteractionAt = nowMs + adjustedGatherIntervalMs;

    node.hitsRemaining -= 1;
    const depletedAfterThisHit = node.hitsRemaining <= 0;

    if (Math.random() > adjustedSuccessChance) {
      player.lastActionText = this.deps.interpolateTemplate(resourceConfig.messages.gatherFail, {
        resourceName: this.deps.getResourceName(resourceConfig.id, resourceConfig.id.replaceAll('_', ' ')),
      });

      if (depletedAfterThisHit) {
        node.depletedUntil = nowMs + this.deps.rollDepletionDurationMs(resourceConfig, node.respawnMs);
        node.hitsRemaining = this.deps.rollDepletionHits(resourceConfig);
        player.activeInteractionNodeId = null;
      }

      return;
    }

    const selectedDrop = this.deps.pickWeightedDrop(resourceConfig.drops);
    if (!selectedDrop) {
      player.lastActionText = 'No drop config for resource';
      return;
    }

    const rewardItem = this.deps.getItemDefinition(selectedDrop.itemId);
    if (!rewardItem) {
      player.lastActionText = 'Invalid reward item config';
      return;
    }

    const rewardQuantity = this.deps.randomIntBetween(selectedDrop.quantity.min, selectedDrop.quantity.max);

    const added = this.deps.addItemToInventory(player, rewardItem.id, rewardQuantity);
    if (!added) {
      player.lastActionText = 'Inventory full';
      return;
    }

    this.deps.applyQuestObjectiveProgress(player, 'gather', rewardItem.id, rewardQuantity);

    const xpResult = this.deps.addSkillXp(player, resourceConfig.skill, selectedDrop.xp);
    player.lastActionText = this.deps.interpolateTemplate(resourceConfig.messages.success, {
      quantity: rewardQuantity,
      itemName: rewardItem.name.toLowerCase(),
      xp: selectedDrop.xp,
    });

    if (depletedAfterThisHit) {
      node.depletedUntil = nowMs + this.deps.rollDepletionDurationMs(resourceConfig, node.respawnMs);
      node.hitsRemaining = this.deps.rollDepletionHits(resourceConfig);
      player.activeInteractionNodeId = null;
    }

    if (xpResult?.leveledUp) {
      player.lastActionText = this.deps.interpolateTemplate(resourceConfig.messages.levelUp, {
        level: xpResult.newLevel,
      });
    }
  }
}

export function createInteractionOrchestrator(deps) {
  return new InteractionOrchestrator(deps);
}