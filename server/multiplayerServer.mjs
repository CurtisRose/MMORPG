import { WebSocketServer } from 'ws';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_PORT = Number(process.env.MULTIPLAYER_PORT ?? 2567);
const WORLD_WIDTH = 80 * 32;
const WORLD_HEIGHT = 80 * 32;
const TILE_SIZE = 32;
const WORLD_WIDTH_TILES = WORLD_WIDTH / TILE_SIZE;
const WORLD_HEIGHT_TILES = WORLD_HEIGHT / TILE_SIZE;
const BROADCAST_RATE_MS = 100;
const TILE_STEP_INTERVAL_MS = 200;
const DIAGONAL_STEP_MULTIPLIER = 1.65;
const INTERACTION_RANGE_TILES = 1;
const MOVE_FALLBACK_SEARCH_RADIUS = 12;
const DEBUG_MULTIPLAYER =
  String(process.env.DEBUG_MULTIPLAYER ?? '').toLowerCase() === 'true';
const STATE_LOG_INTERVAL_MS = 2000;
const MAX_CHAT_MESSAGE_LENGTH = 120;
const WOODCUTTING_XP_PER_GATHER = 22;
const MINING_XP_PER_GATHER = 26;
const STRENGTH_XP_PER_HIT = 16;
const CONSTITUTION_XP_PER_HIT = 6;
const DEFENSE_XP_PER_HIT_TAKEN = 12;
const INVENTORY_MAX_SLOTS = 28;
const STARTING_GOLD = 150;
const PLAYER_MAX_HP = 20;
const PLAYER_ATTACK_RANGE_TILES = 1;
const PLAYER_ATTACK_COOLDOWN_MS = 900;
const PLAYER_ATTACK_DAMAGE_MIN = 1;
const PLAYER_ATTACK_DAMAGE_MAX = 3;
const ENEMY_AGGRO_RANGE_TILES = 5;
const ENEMY_ATTACK_RANGE_TILES = 1;
const ENEMY_ATTACK_COOLDOWN_MS = 1300;
const ENEMY_ATTACK_DAMAGE_MIN = 1;
const ENEMY_ATTACK_DAMAGE_MAX = 2;
const ENEMY_RESPAWN_MS = 6000;
const PROFILE_AUTOSAVE_INTERVAL_MS = 5000;

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(SERVER_DIR, 'data');
const PLAYER_PROFILES_PATH = path.join(DATA_DIR, 'playerProfiles.json');

const ITEM_DEFINITIONS = {
  logs: {
    id: 'logs',
    name: 'Logs',
    stackable: true,
    examineText: 'A bundle of sturdy logs.',
  },
  copperOre: {
    id: 'copper_ore',
    name: 'Copper ore',
    stackable: true,
    examineText: 'A chunk of copper-bearing ore.',
  },
  tinderbox: {
    id: 'tinderbox',
    name: 'Tinderbox',
    stackable: false,
    examineText: 'Useful for starting fires.',
  },
  bronzeAxe: {
    id: 'bronze_axe',
    name: 'Bronze axe',
    stackable: false,
    examineText: 'A basic axe for chopping trees.',
  },
  bronzePickaxe: {
    id: 'bronze_pickaxe',
    name: 'Bronze pickaxe',
    stackable: false,
    examineText: 'A basic pickaxe for mining rocks.',
  },
};

function getItemDefinition(itemId) {
  return Object.values(ITEM_DEFINITIONS).find((item) => item.id === itemId) ?? null;
}

function getItemExamineText(itemId, fallbackName = 'item') {
  const itemDefinition = getItemDefinition(itemId);
  if (itemDefinition?.examineText) {
    return itemDefinition.examineText;
  }

  const name = String(fallbackName || 'item').toLowerCase();
  return `It's ${name}.`;
}

const NPC_DEFINITIONS = {
  shopkeeperBob: {
    id: 'npc-shopkeeper-bob',
    type: 'shopkeeper',
    name: 'Bob',
    tileX: 40,
    tileY: 40,
    examineText: 'A friendly general store shopkeeper.',
    talkText: 'Hello there! Need supplies or want to sell your goods?',
  },
};

const SHOP_DEFINITIONS = {
  generalStore: {
    id: 'shop-general-store',
    npcId: NPC_DEFINITIONS.shopkeeperBob.id,
    name: 'Bob\'s General Store',
    listings: [
      { itemId: ITEM_DEFINITIONS.logs.id, name: ITEM_DEFINITIONS.logs.name, buyPrice: 10, sellPrice: 4 },
      {
        itemId: ITEM_DEFINITIONS.copperOre.id,
        name: ITEM_DEFINITIONS.copperOre.name,
        buyPrice: 16,
        sellPrice: 7,
      },
      {
        itemId: ITEM_DEFINITIONS.tinderbox.id,
        name: ITEM_DEFINITIONS.tinderbox.name,
        buyPrice: 20,
        sellPrice: 8,
      },
      {
        itemId: ITEM_DEFINITIONS.bronzeAxe.id,
        name: ITEM_DEFINITIONS.bronzeAxe.name,
        buyPrice: 50,
        sellPrice: 22,
      },
      {
        itemId: ITEM_DEFINITIONS.bronzePickaxe.id,
        name: ITEM_DEFINITIONS.bronzePickaxe.name,
        buyPrice: 50,
        sellPrice: 22,
      },
    ],
  },
};

const ENEMY_DEFINITIONS = [
  {
    id: 'enemy-goblin-1',
    type: 'goblin',
    name: 'Goblin',
    tileX: 33,
    tileY: 39,
    maxHp: 12,
    examineText: 'A grumpy little goblin.',
  },
  {
    id: 'enemy-goblin-2',
    type: 'goblin',
    name: 'Goblin',
    tileX: 47,
    tileY: 41,
    maxHp: 12,
    examineText: 'A grumpy little goblin.',
  },
];

function createSkills() {
  return {
    woodcutting: { xp: 0, level: 1 },
    mining: { xp: 0, level: 1 },
    strength: { xp: 0, level: 1 },
    defense: { xp: 0, level: 1 },
    constitution: { xp: 0, level: 1 },
  };
}

function createInventory() {
  return {
    maxSlots: INVENTORY_MAX_SLOTS,
    slots: [],
  };
}

function addItemToInventory(player, itemId, quantity) {
  const itemDefinition = getItemDefinition(itemId);
  if (!itemDefinition) {
    return false;
  }

  const slots = player.inventory.slots;

  if (itemDefinition.stackable) {
    const existingSlot = slots.find((slot) => slot.itemId === itemId);
    if (existingSlot) {
      existingSlot.quantity += quantity;
      return true;
    }
  }

  const neededSlots = itemDefinition.stackable ? 1 : quantity;
  const availableSlots = player.inventory.maxSlots - slots.length;
  if (availableSlots < neededSlots) {
    return false;
  }

  if (itemDefinition.stackable) {
    slots.push({
      itemId,
      quantity,
      name: itemDefinition.name,
      stackable: itemDefinition.stackable,
      examineText: itemDefinition.examineText,
    });
    return true;
  }

  for (let index = 0; index < quantity; index += 1) {
    slots.push({
      itemId,
      quantity: 1,
      name: itemDefinition.name,
      stackable: itemDefinition.stackable,
      examineText: itemDefinition.examineText,
    });
  }

  return true;
}

function getInventoryItemCount(player, itemId) {
  const slots = player.inventory.slots.filter((slot) => slot.itemId === itemId);
  return slots.reduce((sum, slot) => sum + slot.quantity, 0);
}

function removeItemFromInventory(player, itemId, quantity) {
  let remaining = quantity;

  for (let index = player.inventory.slots.length - 1; index >= 0; index -= 1) {
    const slot = player.inventory.slots[index];
    if (slot.itemId !== itemId) {
      continue;
    }

    if (slot.quantity <= remaining) {
      remaining -= slot.quantity;
      player.inventory.slots.splice(index, 1);
    } else {
      slot.quantity -= remaining;
      remaining = 0;
    }

    if (remaining <= 0) {
      return true;
    }
  }

  return false;
}

function moveInventorySlot(player, fromIndex, toIndex) {
  const slots = player.inventory.slots;
  if (slots.length === 0) {
    return false;
  }

  const from = Math.floor(Number(fromIndex));
  if (!Number.isFinite(from) || from < 0 || from >= slots.length) {
    return false;
  }

  const target = Math.max(0, Math.min(slots.length, Math.floor(Number(toIndex))));
  if (!Number.isFinite(target)) {
    return false;
  }

  if (from === target || from === target - 1) {
    return true;
  }

  const [slot] = slots.splice(from, 1);
  if (!slot) {
    return false;
  }

  const insertionIndex = from < target ? target - 1 : target;
  slots.splice(insertionIndex, 0, slot);
  return true;
}

function dropInventorySlot(player, slotIndex, quantity) {
  const slots = player.inventory.slots;
  const index = Math.floor(Number(slotIndex));
  if (!Number.isFinite(index) || index < 0 || index >= slots.length) {
    return null;
  }

  const slot = slots[index];
  if (!slot) {
    return null;
  }

  const dropQuantity = Math.max(1, Math.floor(Number(quantity)));
  const removedQuantity = Math.min(dropQuantity, slot.quantity);
  slot.quantity -= removedQuantity;

  if (slot.quantity <= 0) {
    slots.splice(index, 1);
  }

  return {
    name: slot.name,
    quantity: removedQuantity,
  };
}

function getXpForLevel(level) {
  if (level <= 1) {
    return 0;
  }

  return Math.floor(80 * (level - 1) * (level - 1) + 120 * (level - 1));
}

function getLevelForXp(xp) {
  let level = 1;
  while (level < 99 && xp >= getXpForLevel(level + 1)) {
    level += 1;
  }

  return level;
}

function addSkillXp(player, skillName, xpAmount) {
  const skill = player.skills[skillName];
  if (!skill) {
    return null;
  }

  const previousLevel = skill.level;
  skill.xp += xpAmount;
  skill.level = getLevelForXp(skill.xp);

  const leveledUp = skill.level > previousLevel;
  return {
    leveledUp,
    newLevel: skill.level,
    gainedXp: xpAmount,
  };
}

const clients = new Map();
const worldNodes = createWorldNodes();
const worldEnemies = createWorldEnemies();

const wss = new WebSocketServer({ port: SERVER_PORT });

function createPlayer(id) {
  const spawn = findSpawnTile();

  return {
    id,
    displayName: createUniqueDisplayName(id),
    tileX: spawn.tileX,
    tileY: spawn.tileY,
    directionX: 0,
    directionY: 0,
    targetTileX: null,
    targetTileY: null,
    targetPath: [],
    activeInteractionNodeId: null,
    nextMoveAllowedAt: 0,
    nextInteractionAt: 0,
    nextCombatAt: 0,
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    combatTargetEnemyId: null,
    gold: STARTING_GOLD,
    inventory: createInventory(),
    skills: createSkills(),
    lastActionText: null,
    lastInputAt: Date.now(),
  };
}

function cloneInventory(inventory) {
  const maxSlots = Number(inventory?.maxSlots);
  const slots = Array.isArray(inventory?.slots) ? inventory.slots : [];

  return {
    maxSlots: Number.isFinite(maxSlots) ? Math.max(1, Math.min(56, Math.floor(maxSlots))) : INVENTORY_MAX_SLOTS,
    slots: slots
      .map((slot) => ({
        itemId: String(slot?.itemId ?? ''),
        quantity: Math.max(1, Math.floor(Number(slot?.quantity ?? 1))),
        name: String(slot?.name ?? ''),
        stackable: Boolean(slot?.stackable),
        examineText: String(
          slot?.examineText ??
            getItemExamineText(String(slot?.itemId ?? ''), String(slot?.name ?? 'item')),
        ),
      }))
      .filter((slot) => slot.itemId.length > 0 && slot.name.length > 0),
  };
}

function cloneSkills(skills) {
  const woodcuttingXp = Number(skills?.woodcutting?.xp ?? 0);
  const miningXp = Number(skills?.mining?.xp ?? 0);
  const strengthXp = Number(skills?.strength?.xp ?? 0);
  const defenseXp = Number(skills?.defense?.xp ?? 0);
  const constitutionXp = Number(skills?.constitution?.xp ?? 0);

  return {
    woodcutting: {
      xp: Math.max(0, Math.floor(Number.isFinite(woodcuttingXp) ? woodcuttingXp : 0)),
      level: 1,
    },
    mining: {
      xp: Math.max(0, Math.floor(Number.isFinite(miningXp) ? miningXp : 0)),
      level: 1,
    },
    strength: {
      xp: Math.max(0, Math.floor(Number.isFinite(strengthXp) ? strengthXp : 0)),
      level: 1,
    },
    defense: {
      xp: Math.max(0, Math.floor(Number.isFinite(defenseXp) ? defenseXp : 0)),
      level: 1,
    },
    constitution: {
      xp: Math.max(0, Math.floor(Number.isFinite(constitutionXp) ? constitutionXp : 0)),
      level: 1,
    },
  };
}

function sanitizePlayerProfile(rawProfile) {
  const inventory = cloneInventory(rawProfile?.inventory);
  const skills = cloneSkills(rawProfile?.skills);
  skills.woodcutting.level = getLevelForXp(skills.woodcutting.xp);
  skills.mining.level = getLevelForXp(skills.mining.xp);
  skills.strength.level = getLevelForXp(skills.strength.xp);
  skills.defense.level = getLevelForXp(skills.defense.xp);
  skills.constitution.level = getLevelForXp(skills.constitution.xp);

  const tileX = Math.max(1, Math.min(WORLD_WIDTH_TILES - 2, Math.round(Number(rawProfile?.tileX ?? 40))));
  const tileY = Math.max(1, Math.min(WORLD_HEIGHT_TILES - 2, Math.round(Number(rawProfile?.tileY ?? 40))));
  const maxHp = Math.max(1, Math.min(99, Math.floor(Number(rawProfile?.maxHp ?? PLAYER_MAX_HP))));
  const hp = Math.max(1, Math.min(maxHp, Math.floor(Number(rawProfile?.hp ?? maxHp))));

  return {
    displayName: String(rawProfile?.displayName ?? '').trim(),
    tileX,
    tileY,
    hp,
    maxHp,
    gold: Math.max(0, Math.floor(Number(rawProfile?.gold ?? STARTING_GOLD))),
    inventory,
    skills,
  };
}

function loadPlayerProfiles() {
  if (!existsSync(PLAYER_PROFILES_PATH)) {
    return {};
  }

  try {
    const rawText = readFileSync(PLAYER_PROFILES_PATH, 'utf8');
    const parsed = JSON.parse(rawText);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    const profiles = {};
    for (const [profileId, profile] of Object.entries(parsed)) {
      profiles[profileId] = sanitizePlayerProfile(profile);
    }

    return profiles;
  } catch {
    return {};
  }
}

function savePlayerProfiles(profiles) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(PLAYER_PROFILES_PATH, `${JSON.stringify(profiles, null, 2)}\n`, 'utf8');
}

const playerProfiles = loadPlayerProfiles();

function capturePlayerProfile(player) {
  return sanitizePlayerProfile({
    displayName: player.displayName,
    tileX: player.tileX,
    tileY: player.tileY,
    hp: player.hp,
    maxHp: player.maxHp,
    gold: player.gold,
    inventory: player.inventory,
    skills: player.skills,
  });
}

function persistAllConnectedProfiles() {
  for (const client of clients.values()) {
    playerProfiles[client.profileId] = capturePlayerProfile(client.player);
  }

  savePlayerProfiles(playerProfiles);
}

function applyPersistedProfile(player, profile) {
  const safeProfile = sanitizePlayerProfile(profile);

  player.displayName = safeProfile.displayName || player.displayName;
  player.tileX = safeProfile.tileX;
  player.tileY = safeProfile.tileY;
  player.hp = safeProfile.hp;
  player.maxHp = safeProfile.maxHp;
  player.gold = safeProfile.gold;
  player.inventory = cloneInventory(safeProfile.inventory);
  player.skills = cloneSkills(safeProfile.skills);
  player.skills.woodcutting.level = getLevelForXp(player.skills.woodcutting.xp);
  player.skills.mining.level = getLevelForXp(player.skills.mining.xp);
  player.skills.strength.level = getLevelForXp(player.skills.strength.xp);
  player.skills.defense.level = getLevelForXp(player.skills.defense.xp);
  player.skills.constitution.level = getLevelForXp(player.skills.constitution.xp);
}

function resolveProfileIdFromRequest(request) {
  const rawUrl = request?.url ?? '/';
  const parsedUrl = new URL(rawUrl, 'ws://127.0.0.1');
  const profileId = parsedUrl.searchParams.get('profileId') ?? '';

  if (/^[a-zA-Z0-9_-]{8,64}$/.test(profileId)) {
    return profileId;
  }

  return randomUUID().replace(/-/g, '').slice(0, 24);
}

function createWorldEnemies() {
  const enemies = new Map();

  for (const definition of ENEMY_DEFINITIONS) {
    if (!isBaseWalkableTile(definition.tileX, definition.tileY)) {
      continue;
    }

    enemies.set(definition.id, {
      ...definition,
      spawnTileX: definition.tileX,
      spawnTileY: definition.tileY,
      directionX: 0,
      directionY: 0,
      targetTileX: null,
      targetTileY: null,
      targetPath: [],
      nextMoveAllowedAt: 0,
      hp: definition.maxHp,
      maxHp: definition.maxHp,
      targetPlayerId: null,
      nextAttackAt: 0,
      deadUntil: 0,
    });
  }

  return enemies;
}

function createWorldNodes() {
  const nodes = new Map();
  const definitions = [
    { id: 'tree-1', type: 'tree', tileX: 35, tileY: 36, respawnMs: 5000 },
    { id: 'tree-2', type: 'tree', tileX: 46, tileY: 35, respawnMs: 5000 },
    { id: 'rock-1', type: 'rock', tileX: 34, tileY: 43, respawnMs: 6500 },
    { id: 'rock-2', type: 'rock', tileX: 45, tileY: 44, respawnMs: 6500 },
  ];

  for (const definition of definitions) {
    if (!isBaseWalkableTile(definition.tileX, definition.tileY)) {
      continue;
    }

    nodes.set(definition.id, {
      ...definition,
      depletedUntil: 0,
      gatherIntervalMs: 1200,
    });
  }

  return nodes;
}

function broadcast(data) {
  const payload = JSON.stringify(data);

  for (const client of clients.values()) {
    if (client.socket.readyState === 1) {
      client.socket.send(payload);
    }
  }
}

function makeChatId() {
  return randomUUID();
}

function makePlayerDisplayName(playerId) {
  return `Player ${String(playerId).slice(0, 4)}`;
}

const PLAYER_NAME_ADJECTIVES = [
  'Amber',
  'Brisk',
  'Clever',
  'Daring',
  'Ember',
  'Fabled',
  'Golden',
  'Iron',
  'Jade',
  'Lucky',
  'Merry',
  'Nimble',
  'Quiet',
  'Rugged',
  'Swift',
  'Valiant',
];

const PLAYER_NAME_NOUNS = [
  'Badger',
  'Falcon',
  'Fox',
  'Knight',
  'Lynx',
  'Miner',
  'Otter',
  'Pioneer',
  'Ranger',
  'Sailor',
  'Scout',
  'Smith',
  'Stag',
  'Walker',
  'Warden',
  'Wolf',
];

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function getTakenPlayerNames() {
  const takenNames = new Set();

  for (const client of clients.values()) {
    takenNames.add(client.player.displayName);
  }

  return takenNames;
}

function createUniqueDisplayName(playerId) {
  const takenNames = getTakenPlayerNames();

  for (let attempt = 0; attempt < 200; attempt += 1) {
    const name = `${pickRandom(PLAYER_NAME_ADJECTIVES)}${pickRandom(PLAYER_NAME_NOUNS)}${Math.floor(Math.random() * 1000)}`;
    if (!takenNames.has(name)) {
      return name;
    }
  }

  return makePlayerDisplayName(playerId);
}

function broadcastChatFromPlayer(playerId, messageText) {
  const trimmed = String(messageText ?? '').trim();
  if (!trimmed) {
    return;
  }

  const client = clients.get(playerId);
  const speakerName = client?.player.displayName ?? makePlayerDisplayName(playerId);
  const safeText = trimmed.slice(0, MAX_CHAT_MESSAGE_LENGTH);
  broadcast({
    type: 'chat',
    message: {
      id: makeChatId(),
      text: `${speakerName}: ${safeText}`,
      timestamp: Date.now(),
    },
  });
}

function sendChatToSocket(socket, text) {
  socket.send(
    JSON.stringify({
      type: 'chat',
      message: {
        id: makeChatId(),
        text,
        timestamp: Date.now(),
      },
    }),
  );
}

function log(event, details = {}) {
  if (!DEBUG_MULTIPLAYER) {
    return;
  }

  console.log(
    JSON.stringify({
      scope: 'multiplayer-server',
      event,
      ...details,
      at: new Date().toISOString(),
    }),
  );
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isWaterTile(tileX, tileY) {
  const edgeDistance = Math.min(
    tileY,
    tileX,
    WORLD_HEIGHT_TILES - 1 - tileY,
    WORLD_WIDTH_TILES - 1 - tileX,
  );

  return edgeDistance < 3;
}

function isBaseWalkableTile(tileX, tileY) {
  if (tileX < 0 || tileY < 0 || tileX >= WORLD_WIDTH_TILES || tileY >= WORLD_HEIGHT_TILES) {
    return false;
  }

  return !isWaterTile(tileX, tileY);
}

function isNodeBlockingTile(tileX, tileY) {
  for (const node of worldNodes.values()) {
    if (node.tileX === tileX && node.tileY === tileY) {
      return true;
    }
  }

  return false;
}

function isNpcBlockingTile(tileX, tileY) {
  for (const npc of Object.values(NPC_DEFINITIONS)) {
    if (npc.tileX === tileX && npc.tileY === tileY) {
      return true;
    }
  }

  return false;
}

function isEnemyBlockingTile(tileX, tileY) {
  for (const enemy of worldEnemies.values()) {
    if (enemy.deadUntil > Date.now()) {
      continue;
    }

    if (enemy.tileX === tileX && enemy.tileY === tileY) {
      return true;
    }
  }

  return false;
}

function isWalkableTile(tileX, tileY) {
  if (!isBaseWalkableTile(tileX, tileY)) {
    return false;
  }

  return !isNodeBlockingTile(tileX, tileY) && !isNpcBlockingTile(tileX, tileY);
}

function findSpawnTile() {
  const centerX = Math.floor(WORLD_WIDTH_TILES * 0.5);
  const centerY = Math.floor(WORLD_HEIGHT_TILES * 0.5);

  for (let radius = 0; radius < 20; radius += 1) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const tileX = centerX + Math.floor(Math.random() * (radius * 2 + 1)) - radius;
      const tileY = centerY + Math.floor(Math.random() * (radius * 2 + 1)) - radius;

      if (isWalkableTile(tileX, tileY)) {
        return { tileX, tileY };
      }
    }
  }

  return { tileX: centerX, tileY: centerY };
}

function findBestAdjacentTileToTarget(player, targetTileX, targetTileY) {
  const candidates = [
    { tileX: targetTileX + 1, tileY: targetTileY },
    { tileX: targetTileX - 1, tileY: targetTileY },
    { tileX: targetTileX, tileY: targetTileY + 1 },
    { tileX: targetTileX, tileY: targetTileY - 1 },
  ];

  const walkable = candidates.filter((candidate) => isWalkableTile(candidate.tileX, candidate.tileY));
  if (walkable.length === 0) {
    return null;
  }

  const reachable = walkable
    .map((candidate) => ({
      candidate,
      pathLength: findPath(player.tileX, player.tileY, candidate.tileX, candidate.tileY)?.length ?? null,
    }))
    .filter((entry) => entry.pathLength !== null);

  if (reachable.length === 0) {
    return null;
  }

  reachable.sort((left, right) => {
    if (left.pathLength !== right.pathLength) {
      return left.pathLength - right.pathLength;
    }

    const leftDistance =
      Math.abs(player.tileX - left.candidate.tileX) + Math.abs(player.tileY - left.candidate.tileY);
    const rightDistance =
      Math.abs(player.tileX - right.candidate.tileX) + Math.abs(player.tileY - right.candidate.tileY);
    return leftDistance - rightDistance;
  });

  return reachable[0].candidate;
}

function findBestAdjacentTile(player, node) {
  return findBestAdjacentTileToTarget(player, node.tileX, node.tileY);
}

function isWithinRange(fromTileX, fromTileY, toTileX, toTileY, maxDistance) {
  const distance = Math.abs(fromTileX - toTileX) + Math.abs(fromTileY - toTileY);
  return distance <= maxDistance;
}

function canAutoRetaliate(player) {
  return (
    player.hp > 0 &&
    player.combatTargetEnemyId === null &&
    player.activeInteractionNodeId === null &&
    player.targetTileX === null &&
    player.targetTileY === null
  );
}

function randomIntBetween(minValue, maxValue) {
  return Math.floor(Math.random() * (maxValue - minValue + 1)) + minValue;
}

function makeTileKey(tileX, tileY) {
  return `${tileX},${tileY}`;
}

function canTraverseBetween(fromTileX, fromTileY, toTileX, toTileY) {
  const deltaX = toTileX - fromTileX;
  const deltaY = toTileY - fromTileY;

  if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
    return false;
  }

  if (!isWalkableTile(toTileX, toTileY)) {
    return false;
  }

  if (Math.abs(deltaX) === 1 && Math.abs(deltaY) === 1) {
    const sideATileX = fromTileX + deltaX;
    const sideATileY = fromTileY;
    const sideBTileX = fromTileX;
    const sideBTileY = fromTileY + deltaY;
    return isWalkableTile(sideATileX, sideATileY) && isWalkableTile(sideBTileX, sideBTileY);
  }

  return true;
}

function reconstructPath(cameFrom, startX, startY, targetX, targetY) {
  const path = [];
  let currentKey = makeTileKey(targetX, targetY);
  const startKey = makeTileKey(startX, startY);

  while (currentKey !== startKey) {
    const [tileX, tileY] = currentKey.split(',').map(Number);
    path.push({ tileX, tileY });

    const previousKey = cameFrom.get(currentKey);
    if (!previousKey) {
      return [];
    }

    currentKey = previousKey;
  }

  path.reverse();
  return path;
}

function findPath(startX, startY, targetX, targetY) {
  if (startX === targetX && startY === targetY) {
    return [];
  }

  const targetWalkable = isWalkableTile(targetX, targetY);
  if (!targetWalkable) {
    return null;
  }

  const queue = [{ tileX: startX, tileY: startY }];
  let queueIndex = 0;
  const visited = new Set([makeTileKey(startX, startY)]);
  const cameFrom = new Map();

  while (queueIndex < queue.length) {
    const current = queue[queueIndex];
    queueIndex += 1;

    const neighbors = [
      { tileX: current.tileX + 1, tileY: current.tileY },
      { tileX: current.tileX - 1, tileY: current.tileY },
      { tileX: current.tileX, tileY: current.tileY + 1 },
      { tileX: current.tileX, tileY: current.tileY - 1 },
      { tileX: current.tileX + 1, tileY: current.tileY + 1 },
      { tileX: current.tileX + 1, tileY: current.tileY - 1 },
      { tileX: current.tileX - 1, tileY: current.tileY + 1 },
      { tileX: current.tileX - 1, tileY: current.tileY - 1 },
    ];

    for (const neighbor of neighbors) {
      if (!canTraverseBetween(current.tileX, current.tileY, neighbor.tileX, neighbor.tileY)) {
        continue;
      }

      const neighborKey = makeTileKey(neighbor.tileX, neighbor.tileY);
      if (visited.has(neighborKey)) {
        continue;
      }

      visited.add(neighborKey);
      cameFrom.set(neighborKey, makeTileKey(current.tileX, current.tileY));

      if (neighbor.tileX === targetX && neighbor.tileY === targetY) {
        return reconstructPath(cameFrom, startX, startY, targetX, targetY);
      }

      queue.push(neighbor);
    }
  }

  return null;
}

function getPerimeterCandidates(centerX, centerY, radius) {
  const candidates = [];

  for (let dx = -radius; dx <= radius; dx += 1) {
    candidates.push({ tileX: centerX + dx, tileY: centerY - radius });
    candidates.push({ tileX: centerX + dx, tileY: centerY + radius });
  }

  for (let dy = -radius + 1; dy <= radius - 1; dy += 1) {
    candidates.push({ tileX: centerX - radius, tileY: centerY + dy });
    candidates.push({ tileX: centerX + radius, tileY: centerY + dy });
  }

  return candidates;
}

function findNearestReachableDestination(player, targetX, targetY) {
  for (let radius = 1; radius <= MOVE_FALLBACK_SEARCH_RADIUS; radius += 1) {
    const perimeter = getPerimeterCandidates(targetX, targetY, radius);
    let best = null;

    for (const candidate of perimeter) {
      if (!isWalkableTile(candidate.tileX, candidate.tileY)) {
        continue;
      }

      const path = findPath(player.tileX, player.tileY, candidate.tileX, candidate.tileY);
      if (!path) {
        continue;
      }

      if (!best || path.length < best.path.length) {
        best = {
          tileX: candidate.tileX,
          tileY: candidate.tileY,
          path,
        };
      }
    }

    if (best) {
      return best;
    }
  }

  return null;
}

function setPathTarget(entity, tileX, tileY) {
  const path = findPath(entity.tileX, entity.tileY, tileX, tileY);
  if (path) {
    entity.directionX = 0;
    entity.directionY = 0;
    entity.targetTileX = tileX;
    entity.targetTileY = tileY;
    entity.targetPath = path;
    return true;
  }

  const fallback = findNearestReachableDestination(entity, tileX, tileY);
  if (!fallback) {
    return false;
  }

  entity.directionX = 0;
  entity.directionY = 0;
  entity.targetTileX = fallback.tileX;
  entity.targetTileY = fallback.tileY;
  entity.targetPath = fallback.path;
  return true;
}

function getNpcSnapshot() {
  const npcs = {};

  for (const npc of Object.values(NPC_DEFINITIONS)) {
    npcs[npc.id] = {
      id: npc.id,
      type: npc.type,
      name: npc.name,
      tileX: npc.tileX,
      tileY: npc.tileY,
      examineText: npc.examineText,
    };
  }

  return npcs;
}

function getShopSnapshot() {
  const shops = {};

  for (const shop of Object.values(SHOP_DEFINITIONS)) {
    shops[shop.id] = {
      id: shop.id,
      npcId: shop.npcId,
      name: shop.name,
      listings: shop.listings.map((listing) => ({
        itemId: listing.itemId,
        name: listing.name,
        buyPrice: listing.buyPrice,
        sellPrice: listing.sellPrice,
      })),
    };
  }

  return shops;
}

function getShopByNpcId(npcId) {
  return Object.values(SHOP_DEFINITIONS).find((shop) => shop.npcId === npcId) ?? null;
}

function getEnemySnapshot(now) {
  const enemies = {};

  for (const enemy of worldEnemies.values()) {
    const isDead = enemy.deadUntil > now;
    enemies[enemy.id] = {
      id: enemy.id,
      type: enemy.type,
      name: enemy.name,
      tileX: enemy.tileX,
      tileY: enemy.tileY,
      targetTileX: enemy.targetTileX,
      targetTileY: enemy.targetTileY,
      targetPath: enemy.targetPath.map((step) => ({
        tileX: step.tileX,
        tileY: step.tileY,
      })),
      hp: isDead ? 0 : enemy.hp,
      maxHp: enemy.maxHp,
      isDead,
      respawnAt: isDead ? enemy.deadUntil : null,
      examineText: enemy.examineText,
    };
  }

  return enemies;
}

function isWithinNpcRange(player, npc) {
  const manhattanDistance = Math.abs(player.tileX - npc.tileX) + Math.abs(player.tileY - npc.tileY);
  return manhattanDistance <= INTERACTION_RANGE_TILES;
}

function getNodeSnapshot(now) {
  const nodes = {};

  for (const [id, node] of worldNodes.entries()) {
    const isDepleted = node.depletedUntil > now;
    nodes[id] = {
      id,
      type: node.type,
      tileX: node.tileX,
      tileY: node.tileY,
      isDepleted,
      respawnAt: isDepleted ? node.depletedUntil : null,
    };
  }

  return nodes;
}

function makeSnapshot(now) {
  const players = {};

  for (const [id, client] of clients.entries()) {
    players[id] = {
      id,
      displayName: client.player.displayName,
      tileX: client.player.tileX,
      tileY: client.player.tileY,
      x: client.player.tileX * TILE_SIZE + TILE_SIZE * 0.5,
      y: client.player.tileY * TILE_SIZE + TILE_SIZE * 0.5,
      targetTileX: client.player.targetTileX,
      targetTileY: client.player.targetTileY,
      targetPath: client.player.targetPath.map((step) => ({
        tileX: step.tileX,
        tileY: step.tileY,
      })),
      hp: client.player.hp,
      maxHp: client.player.maxHp,
      combatTargetEnemyId: client.player.combatTargetEnemyId,
      activeInteractionNodeId: client.player.activeInteractionNodeId,
      gold: client.player.gold,
      skills: {
        woodcutting: {
          xp: client.player.skills.woodcutting.xp,
          level: client.player.skills.woodcutting.level,
        },
        mining: {
          xp: client.player.skills.mining.xp,
          level: client.player.skills.mining.level,
        },
        strength: {
          xp: client.player.skills.strength.xp,
          level: client.player.skills.strength.level,
        },
        defense: {
          xp: client.player.skills.defense.xp,
          level: client.player.skills.defense.level,
        },
        constitution: {
          xp: client.player.skills.constitution.xp,
          level: client.player.skills.constitution.level,
        },
      },
      inventory: {
        maxSlots: client.player.inventory.maxSlots,
        slots: client.player.inventory.slots.map((slot) => ({
          itemId: slot.itemId,
          quantity: slot.quantity,
          name: slot.name,
          stackable: slot.stackable,
          examineText: slot.examineText,
        })),
      },
      lastActionText: client.player.lastActionText,
    };
  }

  return {
    players,
    nodes: getNodeSnapshot(now),
    npcs: getNpcSnapshot(),
    shops: getShopSnapshot(),
    enemies: getEnemySnapshot(now),
  };
}

function attemptStep(player, stepX, stepY) {
  const nextTileX = clamp(player.tileX + stepX, 1, WORLD_WIDTH_TILES - 2);
  const nextTileY = clamp(player.tileY + stepY, 1, WORLD_HEIGHT_TILES - 2);

  if (!isWalkableTile(nextTileX, nextTileY)) {
    return false;
  }

  player.tileX = nextTileX;
  player.tileY = nextTileY;
  return true;
}

function hasReachedTarget(player) {
  return player.targetTileX === player.tileX && player.targetTileY === player.tileY;
}

function stepTowardTarget(entity) {
  if (entity.targetTileX === null || entity.targetTileY === null) {
    return false;
  }

  if (hasReachedTarget(entity)) {
    entity.targetTileX = null;
    entity.targetTileY = null;
    return false;
  }

  if (!Array.isArray(entity.targetPath) || entity.targetPath.length === 0) {
    const rebuilt = findPath(entity.tileX, entity.tileY, entity.targetTileX, entity.targetTileY);
    if (!rebuilt) {
      entity.targetTileX = null;
      entity.targetTileY = null;
      entity.targetPath = [];
      return false;
    }

    entity.targetPath = rebuilt;
  }

  const nextStep = entity.targetPath[0];
  if (!nextStep) {
    return false;
  }

  if (!canTraverseBetween(entity.tileX, entity.tileY, nextStep.tileX, nextStep.tileY)) {
    const rebuilt = findPath(entity.tileX, entity.tileY, entity.targetTileX, entity.targetTileY);
    if (!rebuilt) {
      entity.targetTileX = null;
      entity.targetTileY = null;
      entity.targetPath = [];
      return false;
    }

    entity.targetPath = rebuilt;
    return stepTowardTarget(entity);
  }

  const deltaX = nextStep.tileX - entity.tileX;
  const deltaY = nextStep.tileY - entity.tileY;
  const isDiagonalStep = Math.abs(deltaX) === 1 && Math.abs(deltaY) === 1;

  entity.tileX = nextStep.tileX;
  entity.tileY = nextStep.tileY;
  entity.targetPath.shift();
  const moved = true;
  const moveDelayMs = isDiagonalStep
    ? Math.round(TILE_STEP_INTERVAL_MS * DIAGONAL_STEP_MULTIPLIER)
    : TILE_STEP_INTERVAL_MS;

  if (hasReachedTarget(entity)) {
    entity.targetTileX = null;
    entity.targetTileY = null;
    entity.targetPath = [];
  }

  return moved ? moveDelayMs : 0;
}

function stepWithDirection(player) {
  if (player.directionX === 0 && player.directionY === 0) {
    return 0;
  }

  const moved = attemptStep(player, player.directionX, player.directionY);
  if (!moved) {
    return 0;
  }

  const isDiagonalStep =
    Math.abs(player.directionX) === 1 && Math.abs(player.directionY) === 1;
  return isDiagonalStep
    ? Math.round(TILE_STEP_INTERVAL_MS * DIAGONAL_STEP_MULTIPLIER)
    : TILE_STEP_INTERVAL_MS;
}

function stepPlayerIfPossible(player, nowMs) {
  if (nowMs < player.nextMoveAllowedAt) {
    return;
  }

  const moveDelayMs =
    (player.targetTileX !== null || player.targetTileY !== null)
      ? stepTowardTarget(player)
      : stepWithDirection(player);

  if (moveDelayMs > 0) {
    player.nextMoveAllowedAt = nowMs + moveDelayMs;
  }
}

function isWithinInteractionRange(player, node) {
  const manhattanDistance = Math.abs(player.tileX - node.tileX) + Math.abs(player.tileY - node.tileY);
  return manhattanDistance <= INTERACTION_RANGE_TILES;
}

function processInteraction(player, nowMs) {
  if (!player.activeInteractionNodeId) {
    return;
  }

  const node = worldNodes.get(player.activeInteractionNodeId);
  if (!node) {
    player.activeInteractionNodeId = null;
    return;
  }

  if (!isWithinInteractionRange(player, node)) {
    player.lastActionText = `Out of range for ${node.type}`;
    return;
  }

  if (nowMs < player.nextInteractionAt) {
    return;
  }

  if (node.depletedUntil > nowMs) {
    player.lastActionText = `${node.type} depleted`;
    return;
  }

  node.depletedUntil = nowMs + node.respawnMs;
  player.nextInteractionAt = nowMs + node.gatherIntervalMs;

  if (node.type === 'tree') {
    const added = addItemToInventory(player, ITEM_DEFINITIONS.logs.id, 1);
    if (!added) {
      player.lastActionText = 'Inventory full';
      return;
    }

    const xpResult = addSkillXp(player, 'woodcutting', WOODCUTTING_XP_PER_GATHER);
    player.lastActionText = `+1 logs (+${WOODCUTTING_XP_PER_GATHER} XP)`;

    if (xpResult?.leveledUp) {
      player.lastActionText = `Woodcutting level up! Level ${xpResult.newLevel}`;
    }
  }

  if (node.type === 'rock') {
    const added = addItemToInventory(player, ITEM_DEFINITIONS.copperOre.id, 1);
    if (!added) {
      player.lastActionText = 'Inventory full';
      return;
    }

    const xpResult = addSkillXp(player, 'mining', MINING_XP_PER_GATHER);
    player.lastActionText = `+1 copper ore (+${MINING_XP_PER_GATHER} XP)`;

    if (xpResult?.leveledUp) {
      player.lastActionText = `Mining level up! Level ${xpResult.newLevel}`;
    }
  }
}

function processPlayerCombat(player, nowMs) {
  if (!player.combatTargetEnemyId) {
    return;
  }

  const enemy = worldEnemies.get(player.combatTargetEnemyId);
  if (!enemy || enemy.deadUntil > nowMs) {
    player.combatTargetEnemyId = null;
    return;
  }

  if (!isWithinRange(player.tileX, player.tileY, enemy.tileX, enemy.tileY, PLAYER_ATTACK_RANGE_TILES)) {
    if (player.targetTileX === null || player.targetTileY === null) {
      const adjacentTile = findBestAdjacentTileToTarget(player, enemy.tileX, enemy.tileY);
      if (adjacentTile) {
        setPathTarget(player, adjacentTile.tileX, adjacentTile.tileY);
      }
    }
    return;
  }

  if (nowMs < player.nextCombatAt) {
    return;
  }

  player.targetTileX = null;
  player.targetTileY = null;
  player.targetPath = [];

  const damage = randomIntBetween(PLAYER_ATTACK_DAMAGE_MIN, PLAYER_ATTACK_DAMAGE_MAX);
  enemy.hp = Math.max(0, enemy.hp - damage);
  player.nextCombatAt = nowMs + PLAYER_ATTACK_COOLDOWN_MS;

  addSkillXp(player, 'strength', STRENGTH_XP_PER_HIT);
  addSkillXp(player, 'constitution', CONSTITUTION_XP_PER_HIT);

  player.lastActionText = `You hit ${enemy.name} for ${damage}.`;

  if (enemy.hp <= 0) {
    enemy.deadUntil = nowMs + ENEMY_RESPAWN_MS;
    enemy.hp = 0;
    enemy.targetPlayerId = null;
    enemy.targetTileX = null;
    enemy.targetTileY = null;
    enemy.targetPath = [];
    enemy.nextMoveAllowedAt = nowMs;
    player.combatTargetEnemyId = null;
    player.lastActionText = `You defeated ${enemy.name}.`;

    for (const client of clients.values()) {
      if (client.player.combatTargetEnemyId === enemy.id) {
        client.player.combatTargetEnemyId = null;
      }
    }
  }
}

function processEnemyAi(nowMs) {
  for (const enemy of worldEnemies.values()) {
    if (enemy.deadUntil > nowMs) {
      continue;
    }

    if (enemy.deadUntil !== 0 && enemy.deadUntil <= nowMs) {
      enemy.deadUntil = 0;
      enemy.hp = enemy.maxHp;
      enemy.tileX = enemy.spawnTileX;
      enemy.tileY = enemy.spawnTileY;
      enemy.targetTileX = null;
      enemy.targetTileY = null;
      enemy.targetPath = [];
      enemy.targetPlayerId = null;
      enemy.nextMoveAllowedAt = nowMs;
      enemy.nextAttackAt = nowMs;
    }

    let targetEntry = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const [playerId, client] of clients.entries()) {
      if (client.player.hp <= 0) {
        continue;
      }

      const distance =
        Math.abs(client.player.tileX - enemy.tileX) + Math.abs(client.player.tileY - enemy.tileY);

      if (distance < bestDistance && distance <= ENEMY_AGGRO_RANGE_TILES) {
        bestDistance = distance;
        targetEntry = { playerId, player: client.player };
      }
    }

    enemy.targetPlayerId = targetEntry?.playerId ?? null;
    if (!targetEntry) {
      enemy.targetTileX = null;
      enemy.targetTileY = null;
      enemy.targetPath = [];
      continue;
    }

    const targetPlayer = targetEntry.player;
    const inAttackRange = isWithinRange(
      enemy.tileX,
      enemy.tileY,
      targetPlayer.tileX,
      targetPlayer.tileY,
      ENEMY_ATTACK_RANGE_TILES,
    );

    if (inAttackRange) {
      enemy.targetTileX = null;
      enemy.targetTileY = null;
      enemy.targetPath = [];

      if (nowMs >= enemy.nextAttackAt) {
        const damage = randomIntBetween(ENEMY_ATTACK_DAMAGE_MIN, ENEMY_ATTACK_DAMAGE_MAX);
        targetPlayer.hp = Math.max(1, targetPlayer.hp - damage);
        addSkillXp(targetPlayer, 'defense', DEFENSE_XP_PER_HIT_TAKEN);
        targetPlayer.lastActionText = `${enemy.name} hits you for ${damage}.`;
        enemy.nextAttackAt = nowMs + ENEMY_ATTACK_COOLDOWN_MS;

        if (canAutoRetaliate(targetPlayer)) {
          targetPlayer.combatTargetEnemyId = enemy.id;
          targetPlayer.nextCombatAt = 0;
        }
      }
      continue;
    }

    const adjacentTile = findBestAdjacentTileToTarget(enemy, targetPlayer.tileX, targetPlayer.tileY);
    if (adjacentTile) {
      const targetChanged =
        enemy.targetTileX !== adjacentTile.tileX || enemy.targetTileY !== adjacentTile.tileY;
      if (targetChanged || enemy.targetPath.length === 0) {
        setPathTarget(enemy, adjacentTile.tileX, adjacentTile.tileY);
      }
    }

    if (nowMs >= enemy.nextMoveAllowedAt) {
      const moveDelayMs = stepTowardTarget(enemy);
      if (moveDelayMs > 0) {
        enemy.nextMoveAllowedAt = nowMs + moveDelayMs;
      }
    }
  }
}

let previousTick = Date.now();
let lastStateLogAt = 0;
setInterval(() => {
  const now = Date.now();
  const dtMs = Math.min(now - previousTick, 150);
  previousTick = now;

  for (const client of clients.values()) {
    stepPlayerIfPossible(client.player, now);
    processInteraction(client.player, now);
    processPlayerCombat(client.player, now);
  }

  processEnemyAi(now);

  broadcast({ type: 'state', ...makeSnapshot(now) });

  const nowForLog = Date.now();
  if (nowForLog - lastStateLogAt >= STATE_LOG_INTERVAL_MS) {
    lastStateLogAt = nowForLog;
    log('state_tick', {
      players: clients.size,
      dtMs,
    });
  }
}, BROADCAST_RATE_MS);

setInterval(() => {
  persistAllConnectedProfiles();
}, PROFILE_AUTOSAVE_INTERVAL_MS);

wss.on('connection', (socket, request) => {
  const id = randomUUID();
  const profileId = resolveProfileIdFromRequest(request);
  const player = createPlayer(id);

  const persistedProfile = playerProfiles[profileId];
  if (persistedProfile) {
    applyPersistedProfile(player, persistedProfile);
  } else {
    playerProfiles[profileId] = capturePlayerProfile(player);
    savePlayerProfiles(playerProfiles);
  }

  clients.set(id, { socket, player, profileId });
  log('player_connected', { id, players: clients.size });

  socket.send(
    JSON.stringify({
      type: 'welcome',
      id,
      ...makeSnapshot(Date.now()),
    }),
  );

  broadcast({
    type: 'playerJoined',
    player: {
      id,
      displayName: player.displayName,
      tileX: player.tileX,
      tileY: player.tileY,
      x: player.tileX * TILE_SIZE + TILE_SIZE * 0.5,
      y: player.tileY * TILE_SIZE + TILE_SIZE * 0.5,
      targetTileX: player.targetTileX,
      targetTileY: player.targetTileY,
      targetPath: player.targetPath.map((step) => ({
        tileX: step.tileX,
        tileY: step.tileY,
      })),
      hp: player.hp,
      maxHp: player.maxHp,
      combatTargetEnemyId: player.combatTargetEnemyId,
      activeInteractionNodeId: player.activeInteractionNodeId,
      gold: player.gold,
      skills: {
        woodcutting: {
          xp: player.skills.woodcutting.xp,
          level: player.skills.woodcutting.level,
        },
        mining: {
          xp: player.skills.mining.xp,
          level: player.skills.mining.level,
        },
        strength: {
          xp: player.skills.strength.xp,
          level: player.skills.strength.level,
        },
        defense: {
          xp: player.skills.defense.xp,
          level: player.skills.defense.level,
        },
        constitution: {
          xp: player.skills.constitution.xp,
          level: player.skills.constitution.level,
        },
      },
      inventory: {
        maxSlots: player.inventory.maxSlots,
        slots: player.inventory.slots.map((slot) => ({
          itemId: slot.itemId,
          quantity: slot.quantity,
          name: slot.name,
          stackable: slot.stackable,
          examineText: slot.examineText,
        })),
      },
      lastActionText: player.lastActionText,
    },
  });

  socket.on('message', (rawMessage) => {
    try {
      const message = JSON.parse(rawMessage.toString());

      if (message.type === 'input') {
        const directionX = Number(message.directionX ?? 0);
        const directionY = Number(message.directionY ?? 0);
        const length = Math.hypot(directionX, directionY);

        player.targetTileX = null;
        player.targetTileY = null;
        player.targetPath = [];
        player.combatTargetEnemyId = null;

        if (length === 0) {
          player.directionX = 0;
          player.directionY = 0;
        } else {
          player.directionX = Math.round(directionX / length);
          player.directionY = Math.round(directionY / length);
          stepPlayerIfPossible(player, Date.now());
        }

        player.lastInputAt = Date.now();

        log('player_input', {
          id,
          directionX,
          directionY,
        });
        return;
      }

      if (message.type === 'moveTo') {
        const requestedTileX = Number(message.tileX);
        const requestedTileY = Number(message.tileY);

        if (!Number.isFinite(requestedTileX) || !Number.isFinite(requestedTileY)) {
          return;
        }

        const tileX = clamp(Math.round(requestedTileX), 1, WORLD_WIDTH_TILES - 2);
        const tileY = clamp(Math.round(requestedTileY), 1, WORLD_HEIGHT_TILES - 2);

        const hasPath = setPathTarget(player, tileX, tileY);
        if (!hasPath) {
          player.lastActionText = 'No path to destination';
          return;
        }

        player.combatTargetEnemyId = null;

        stepPlayerIfPossible(player, Date.now());

        log('player_move_to', {
          id,
          tileX,
          tileY,
        });
        return;
      }

      if (message.type === 'interactStart') {
        const nodeId = String(message.nodeId ?? '');
        const node = worldNodes.get(nodeId);
        if (!node) {
          return;
        }

        player.activeInteractionNodeId = nodeId;
        player.nextInteractionAt = 0;
        player.combatTargetEnemyId = null;

        if (!isWithinInteractionRange(player, node)) {
          const adjacentTile = findBestAdjacentTile(player, node);
          if (adjacentTile) {
            const hasPath = setPathTarget(player, adjacentTile.tileX, adjacentTile.tileY);
            if (!hasPath) {
              player.lastActionText = 'No path to node';
            }
          } else {
            player.lastActionText = 'No free tile next to node';
          }
        }

        log('player_interact_start', {
          id,
          nodeId,
        });
        return;
      }

      if (message.type === 'interactStop') {
        player.activeInteractionNodeId = null;

        log('player_interact_stop', {
          id,
        });
        return;
      }

      if (message.type === 'combatAttack') {
        const enemyId = String(message.enemyId ?? '');
        const enemy = worldEnemies.get(enemyId);
        if (!enemy || enemy.deadUntil > Date.now()) {
          return;
        }

        player.activeInteractionNodeId = null;
        player.combatTargetEnemyId = enemy.id;
        player.nextCombatAt = 0;
        processPlayerCombat(player, Date.now());

        log('player_combat_attack', {
          id,
          enemyId,
        });
        return;
      }

      if (message.type === 'chat') {
        broadcastChatFromPlayer(id, message.text);
        return;
      }

      if (message.type === 'inventoryMove') {
        const moved = moveInventorySlot(player, message.fromIndex, message.toIndex);
        if (!moved) {
          sendChatToSocket(socket, '[Inventory] Could not move that item.');
        }
        return;
      }

      if (message.type === 'inventoryDrop') {
        const dropped = dropInventorySlot(player, message.slotIndex, message.quantity);
        if (!dropped) {
          sendChatToSocket(socket, '[Inventory] Could not drop that item.');
          return;
        }

        const quantityText = dropped.quantity > 1 ? ` x${dropped.quantity}` : '';
        player.lastActionText = `Dropped ${dropped.name}${quantityText}`;
        sendChatToSocket(socket, `[Inventory] Dropped ${dropped.name}${quantityText}.`);
        return;
      }

      if (message.type === 'npcTalk') {
        const npcId = String(message.npcId ?? '');
        const npc = NPC_DEFINITIONS.shopkeeperBob.id === npcId ? NPC_DEFINITIONS.shopkeeperBob : null;
        if (!npc || !isWithinNpcRange(player, npc)) {
          return;
        }

        sendChatToSocket(socket, `[${npc.name}] ${npc.talkText}`);
        return;
      }

      if (message.type === 'shopOpen') {
        const npcId = String(message.npcId ?? '');
        const npc = NPC_DEFINITIONS.shopkeeperBob.id === npcId ? NPC_DEFINITIONS.shopkeeperBob : null;
        const shop = getShopByNpcId(npcId);
        if (!npc || !shop || !isWithinNpcRange(player, npc)) {
          return;
        }

        socket.send(
          JSON.stringify({
            type: 'shopOpen',
            shopId: shop.id,
          }),
        );
        return;
      }

      if (message.type === 'shopBuy') {
        const shopId = String(message.shopId ?? '');
        const itemId = String(message.itemId ?? '');
        const quantity = Math.max(1, Math.min(999, Number(message.quantity ?? 1)));

        const shop = SHOP_DEFINITIONS.generalStore.id === shopId ? SHOP_DEFINITIONS.generalStore : null;
        if (!shop) {
          return;
        }

        const npc = NPC_DEFINITIONS.shopkeeperBob;
        if (!isWithinNpcRange(player, npc)) {
          sendChatToSocket(socket, '[Shop] You are too far away.');
          return;
        }

        const listing = shop.listings.find((entry) => entry.itemId === itemId);
        if (!listing) {
          return;
        }

        const totalCost = listing.buyPrice * quantity;
        if (player.gold < totalCost) {
          sendChatToSocket(socket, '[Shop] Not enough gold.');
          return;
        }

        const added = addItemToInventory(player, listing.itemId, quantity);
        if (!added) {
          sendChatToSocket(socket, '[Shop] Not enough inventory space.');
          return;
        }

        player.gold -= totalCost;
        player.lastActionText = `Bought ${listing.name} x${quantity}`;
        sendChatToSocket(socket, `[Shop] Bought ${listing.name} x${quantity}.`);
        return;
      }

      if (message.type === 'shopSell') {
        const shopId = String(message.shopId ?? '');
        const itemId = String(message.itemId ?? '');
        const quantity = Math.max(1, Math.min(999, Number(message.quantity ?? 1)));

        const shop = SHOP_DEFINITIONS.generalStore.id === shopId ? SHOP_DEFINITIONS.generalStore : null;
        if (!shop) {
          return;
        }

        const npc = NPC_DEFINITIONS.shopkeeperBob;
        if (!isWithinNpcRange(player, npc)) {
          sendChatToSocket(socket, '[Shop] You are too far away.');
          return;
        }

        const listing = shop.listings.find((entry) => entry.itemId === itemId);
        if (!listing) {
          return;
        }

        const currentCount = getInventoryItemCount(player, itemId);
        if (currentCount < quantity) {
          sendChatToSocket(socket, '[Shop] Not enough items to sell.');
          return;
        }

        const removed = removeItemFromInventory(player, itemId, quantity);
        if (!removed) {
          sendChatToSocket(socket, '[Shop] Could not complete sale.');
          return;
        }

        const totalGold = listing.sellPrice * quantity;
        player.gold += totalGold;
        player.lastActionText = `Sold ${listing.name} x${quantity}`;
        sendChatToSocket(socket, `[Shop] Sold ${listing.name} x${quantity}.`);
      }
    } catch {
      // ignore malformed payloads
    }
  });

  socket.on('close', () => {
    const client = clients.get(id);
    if (client) {
      playerProfiles[client.profileId] = capturePlayerProfile(client.player);
      savePlayerProfiles(playerProfiles);
    }

    clients.delete(id);
    broadcast({ type: 'playerLeft', id });
    log('player_disconnected', { id, players: clients.size });
  });
});

console.log(`Multiplayer server listening on ws://127.0.0.1:${SERVER_PORT}`);
