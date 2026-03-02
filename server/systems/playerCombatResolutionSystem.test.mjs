import assert from 'node:assert/strict';

import { PlayerCombatResolutionService } from './playerCombatResolutionSystem.mjs';

export function runPlayerCombatResolutionSystemTests() {
  const missedService = new PlayerCombatResolutionService({
    enemyArmor: 8,
    combatPlayerBaseAffinityPct: 55,
    combatPlayerHitModifierPct: 0,
    playerAttackDamageMin: 4,
    playerAttackDamageMax: 8,
    strengthXpPerHit: 16,
    constitutionXpPerHit: 6,
    getPlayerMeleeAccuracyRating: () => 10,
    getCombatHitChance: () => 0.2,
    getPlayerAttackCooldownMs: () => 900,
    getPlayerCombatBonuses: () => ({ minDamageBonus: 0, maxDamageBonus: 0 }),
    getPlayerWeaponBaseDamageTotal: () => 0,
    getPlayerEffectiveStrength: () => 1,
    randomIntBetween: () => 4,
    addSkillXp: () => {
      throw new Error('addSkillXp should not be called on miss');
    },
    applyQuestObjectiveProgress: () => {},
    applyMinionDropsToPlayer: () => ({ droppedDrops: [], lootTableDrops: [] }),
    forEachClient: () => {},
    getClientById: () => null,
    sendChatToSocket: () => {},
    rollChance: () => 0.99,
  });

  const missPlayer = {
    id: 'player-1',
    nextCombatAt: 0,
    lastActionText: '',
    combatTargetEnemyId: 'enemy-1',
  };
  const missEnemy = {
    id: 'enemy-1',
    name: 'Goblin',
    armor: 12,
    hp: 20,
    respawnMs: 6000,
  };

  missedService.resolvePlayerAttack(missPlayer, missEnemy, 1000);
  assert.equal(missPlayer.nextCombatAt, 1900);
  assert.equal(missEnemy.hp, 20);
  assert.equal(missPlayer.lastActionText, "Your attack glances off Goblin's armor.");

  const xpAwards = [];
  const chatMessages = [];
  const clients = new Map([
    ['killer', { player: { combatTargetEnemyId: 'enemy-2' }, socket: 'killer-socket' }],
    ['other', { player: { combatTargetEnemyId: 'enemy-2' }, socket: 'other-socket' }],
  ]);

  const lethalService = new PlayerCombatResolutionService({
    enemyArmor: 8,
    combatPlayerBaseAffinityPct: 55,
    combatPlayerHitModifierPct: 0,
    playerAttackDamageMin: 4,
    playerAttackDamageMax: 8,
    strengthXpPerHit: 16,
    constitutionXpPerHit: 6,
    getPlayerMeleeAccuracyRating: () => 30,
    getCombatHitChance: () => 1,
    getPlayerAttackCooldownMs: () => 900,
    getPlayerCombatBonuses: () => ({ minDamageBonus: 2, maxDamageBonus: 3 }),
    getPlayerWeaponBaseDamageTotal: () => 10,
    getPlayerEffectiveStrength: () => 20,
    randomIntBetween: () => 50,
    addSkillXp: (player, skillName, amount) => {
      xpAwards.push({ playerId: player.id, skillName, amount });
    },
    applyQuestObjectiveProgress: (player, type, targetId, amount) => {
      player.questProgress = { type, targetId, amount };
    },
    applyMinionDropsToPlayer: () => ({
      droppedDrops: [{ quantity: 2, name: 'Bone' }],
      lootTableDrops: [{
        quantity: 2,
        itemName: 'Bone',
        sourceLootTableName: 'Skeleton Basic',
      }],
    }),
    forEachClient: (handler) => {
      for (const client of clients.values()) {
        handler(client);
      }
    },
    getClientById: () => ({ socket: 'killer-socket' }),
    sendChatToSocket: (socket, message) => {
      chatMessages.push({ socket, message });
    },
    rollChance: () => 0,
  });

  const lethalPlayer = {
    id: 'player-2',
    nextCombatAt: 0,
    lastActionText: '',
    combatTargetEnemyId: 'enemy-2',
  };

  const lethalEnemy = {
    id: 'enemy-2',
    name: 'Skeleton',
    type: 'skeleton',
    armor: 8,
    hp: 40,
    respawnMs: 6000,
    targetPlayerId: 'player-2',
    targetTileX: 5,
    targetTileY: 5,
    targetPath: [{ tileX: 5, tileY: 5 }],
    nextMoveAllowedAt: 0,
  };

  lethalService.resolvePlayerAttack(lethalPlayer, lethalEnemy, 2000);

  assert.equal(lethalPlayer.nextCombatAt, 2900);
  assert.equal(lethalPlayer.combatTargetEnemyId, null);
  assert.equal(lethalPlayer.lastActionText, 'You defeated Skeleton. Ground loot: 2 bone.');
  assert.deepEqual(lethalPlayer.questProgress, {
    type: 'kill',
    targetId: 'skeleton',
    amount: 1,
  });

  assert.equal(lethalEnemy.hp, 0);
  assert.equal(lethalEnemy.deadUntil, 8000);
  assert.equal(lethalEnemy.targetPlayerId, null);
  assert.equal(lethalEnemy.targetTileX, null);
  assert.equal(lethalEnemy.targetTileY, null);
  assert.deepEqual(lethalEnemy.targetPath, []);
  assert.equal(lethalEnemy.nextMoveAllowedAt, 2000);

  assert.deepEqual(xpAwards, [
    { playerId: 'player-2', skillName: 'strength', amount: 16 },
    { playerId: 'player-2', skillName: 'constitution', amount: 6 },
  ]);
  assert.equal(clients.get('killer').player.combatTargetEnemyId, null);
  assert.equal(clients.get('other').player.combatTargetEnemyId, null);
  assert.equal(chatMessages.length, 1);
  assert.equal(chatMessages[0].socket, 'killer-socket');
  assert.equal(
    chatMessages[0].message,
    '[Loot] You got Bone x2 from the Skeleton Basic loot table!',
  );
}