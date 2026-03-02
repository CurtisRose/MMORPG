export class PlayerCombatResolutionService {
  constructor({
    enemyArmor,
    combatPlayerBaseAffinityPct,
    combatPlayerHitModifierPct,
    playerAttackDamageMin,
    playerAttackDamageMax,
    strengthXpPerHit,
    constitutionXpPerHit,
    getPlayerMeleeAccuracyRating,
    getCombatHitChance,
    getPlayerAttackCooldownMs,
    getPlayerCombatBonuses,
    getPlayerWeaponBaseDamageTotal,
    getPlayerEffectiveStrength,
    randomIntBetween,
    addSkillXp,
    applyQuestObjectiveProgress,
    applyMinionDropsToPlayer,
    forEachClient,
    getClientById,
    sendChatToSocket,
    rollChance = Math.random,
  }) {
    this.enemyArmor = enemyArmor;
    this.combatPlayerBaseAffinityPct = combatPlayerBaseAffinityPct;
    this.combatPlayerHitModifierPct = combatPlayerHitModifierPct;
    this.playerAttackDamageMin = playerAttackDamageMin;
    this.playerAttackDamageMax = playerAttackDamageMax;
    this.strengthXpPerHit = strengthXpPerHit;
    this.constitutionXpPerHit = constitutionXpPerHit;
    this.getPlayerMeleeAccuracyRating = getPlayerMeleeAccuracyRating;
    this.getCombatHitChance = getCombatHitChance;
    this.getPlayerAttackCooldownMs = getPlayerAttackCooldownMs;
    this.getPlayerCombatBonuses = getPlayerCombatBonuses;
    this.getPlayerWeaponBaseDamageTotal = getPlayerWeaponBaseDamageTotal;
    this.getPlayerEffectiveStrength = getPlayerEffectiveStrength;
    this.randomIntBetween = randomIntBetween;
    this.addSkillXp = addSkillXp;
    this.applyQuestObjectiveProgress = applyQuestObjectiveProgress;
    this.applyMinionDropsToPlayer = applyMinionDropsToPlayer;
    this.forEachClient = forEachClient;
    this.getClientById = getClientById;
    this.sendChatToSocket = sendChatToSocket;
    this.rollChance = rollChance;
  }

  resolvePlayerAttack(player, enemy, nowMs) {
    const playerAccuracy = this.getPlayerMeleeAccuracyRating(player);
    const resolvedEnemyArmor = Math.max(0, Math.floor(Number(enemy.armor ?? this.enemyArmor)));
    const hitChance = this.getCombatHitChance(
      playerAccuracy,
      resolvedEnemyArmor,
      this.combatPlayerBaseAffinityPct,
      this.combatPlayerHitModifierPct,
    );

    if (this.rollChance() > hitChance) {
      player.nextCombatAt = nowMs + this.getPlayerAttackCooldownMs(player);
      player.lastActionText = `Your attack glances off ${enemy.name}'s armor.`;
      return;
    }

    const combatBonuses = this.getPlayerCombatBonuses(player);
    const weaponBaseDamageTotal = this.getPlayerWeaponBaseDamageTotal(player);
    const effectiveStrength = this.getPlayerEffectiveStrength(player);
    const strengthMaxHitBonus = Math.floor((effectiveStrength * weaponBaseDamageTotal) / 100);
    const attackMin = Math.max(1, this.playerAttackDamageMin + combatBonuses.minDamageBonus);
    const attackMax = Math.max(
      attackMin,
      this.playerAttackDamageMax + combatBonuses.maxDamageBonus + strengthMaxHitBonus,
    );
    const damage = this.randomIntBetween(attackMin, attackMax);
    enemy.hp = Math.max(0, enemy.hp - damage);
    player.nextCombatAt = nowMs + this.getPlayerAttackCooldownMs(player);

    this.addSkillXp(player, 'strength', this.strengthXpPerHit);
    this.addSkillXp(player, 'constitution', this.constitutionXpPerHit);

    player.lastActionText = `You hit ${enemy.name} for ${damage}.`;

    if (enemy.hp <= 0) {
      const questTargetId = String(enemy.minionTypeId ?? enemy.type ?? '').trim();
      if (questTargetId) {
        this.applyQuestObjectiveProgress(player, 'kill', questTargetId, 1);
      }

      const dropResult = this.applyMinionDropsToPlayer(player, enemy);
      const droppedDrops = dropResult.droppedDrops;
      enemy.deadUntil = nowMs + enemy.respawnMs;
      enemy.hp = 0;
      enemy.targetPlayerId = null;
      enemy.targetTileX = null;
      enemy.targetTileY = null;
      enemy.targetPath = [];
      enemy.nextMoveAllowedAt = nowMs;
      player.combatTargetEnemyId = null;
      if (droppedDrops.length > 0) {
        const dropSummary = droppedDrops
          .map((drop) => `${drop.quantity > 1 ? `${drop.quantity} ` : ''}${drop.name.toLowerCase()}`)
          .join(', ');
        player.lastActionText = `You defeated ${enemy.name}. Ground loot: ${dropSummary}.`;
      } else {
        player.lastActionText = `You defeated ${enemy.name}.`;
      }

      this.forEachClient((client) => {
        if (client.player.combatTargetEnemyId === enemy.id) {
          client.player.combatTargetEnemyId = null;
        }
      });

      const killerClient = this.getClientById(player.id);
      if (killerClient && dropResult.lootTableDrops.length > 0) {
        for (const lootTableDrop of dropResult.lootTableDrops) {
          const itemQuantityText = lootTableDrop.quantity > 1
            ? `${lootTableDrop.itemName} x${lootTableDrop.quantity}`
            : lootTableDrop.itemName;
          const lootTableName = String(
            lootTableDrop.sourceLootTableName || lootTableDrop.sourceLootTableId || 'Unknown',
          ).trim();
          this.sendChatToSocket(
            killerClient.socket,
            `[Loot] You got ${itemQuantityText} from the ${lootTableName} loot table!`,
          );
        }
      }
    }
  }
}

export function createPlayerCombatResolutionService(options) {
  return new PlayerCombatResolutionService(options);
}