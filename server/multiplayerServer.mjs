import { WebSocketServer } from 'ws';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
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
const WOODCUTTING_XP_PER_GATHER_DEFAULT = 22;
const MINING_XP_PER_GATHER_DEFAULT = 26;
const GATHER_INTERVAL_MS_DEFAULT = 1200;
const HARVEST_SUCCESS_CHANCE_BONUS_PER_LEVEL = 0.005;
const HARVEST_SUCCESS_CHANCE_BONUS_MAX = 0.3;
const STRENGTH_XP_PER_HIT = 16;
const CONSTITUTION_XP_PER_HIT = 6;
const DEFENSE_XP_PER_HIT_TAKEN = 12;
const INVENTORY_MAX_SLOTS = 28;
const BANK_MAX_SLOTS = 112;
const STARTING_GOLD = 150;
const PLAYER_BASE_HP = 100;
const PLAYER_HP_PER_CONSTITUTION_LEVEL = 10;
const PLAYER_HP_REGEN_INTERVAL_MS = 10000;
const PLAYER_ATTACK_RANGE_TILES = 1;
const PLAYER_ATTACK_COOLDOWN_MS = 900;
const PLAYER_ATTACK_DAMAGE_MIN = 4;
const PLAYER_ATTACK_DAMAGE_MAX = 8;
const ENEMY_AGGRO_RANGE_TILES = 5;
const ENEMY_ATTACK_RANGE_TILES = 1;
const ENEMY_ATTACK_COOLDOWN_MS = 1300;
const ENEMY_ATTACK_DAMAGE_MIN = 3;
const ENEMY_ATTACK_DAMAGE_MAX = 7;
const ENEMY_ATTACK_ACCURACY = 16;
const ENEMY_ARMOR = 8;
const ENEMY_RESPAWN_MS = 6000;
const ENEMY_MAX_CHASE_DISTANCE_TILES = 12;
const ENEMY_HP_REGEN_INTERVAL_MS = 2500;
const ENEMY_HP_REGEN_AMOUNT = 1;
const PROFILE_AUTOSAVE_INTERVAL_MS = 5000;
const COMBAT_PLAYER_BASE_AFFINITY_PCT = 55;
const COMBAT_ENEMY_BASE_AFFINITY_PCT = 55;
const COMBAT_PLAYER_HIT_MODIFIER_PCT = 0;
const COMBAT_ENEMY_HIT_MODIFIER_PCT = 0;
const COMBAT_HIT_CHANCE_MIN = 0.1;
const COMBAT_HIT_CHANCE_MAX = 0.95;

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT_DIR = path.dirname(SERVER_DIR);
const PUBLIC_DIR = path.join(PROJECT_ROOT_DIR, 'public');
const DATA_DIR = path.join(SERVER_DIR, 'data');
const PLAYER_PROFILES_PATH = path.join(DATA_DIR, 'playerProfiles.json');
const SKILL_DATA_DIR = path.join(DATA_DIR, 'skills');
const HARVESTING_SKILL_DATA_DIR = path.join(SKILL_DATA_DIR, 'harvesting');
const CRAFTING_SKILL_DATA_DIR = path.join(SKILL_DATA_DIR, 'crafting');
const COMBAT_SKILL_DATA_DIR = path.join(SKILL_DATA_DIR, 'combat');
const CONTENT_DATA_DIR = path.join(DATA_DIR, 'content');
const ITEM_CONTENT_PATH = path.join(CONTENT_DATA_DIR, 'items.json');
const RESOURCE_CONTENT_PATH = path.join(CONTENT_DATA_DIR, 'resources.json');
const GEAR_CONTENT_PATH = path.join(CONTENT_DATA_DIR, 'gear.json');
const LOOT_TABLE_CONTENT_PATH = path.join(CONTENT_DATA_DIR, 'lootTables.json');
const MINION_CONTENT_PATH = path.join(CONTENT_DATA_DIR, 'minions.json');
const EQUIPMENT_SLOTS = [
  'head',
  'body',
  'legs',
  'hands',
  'feet',
  'offHand',
  'mainHand',
  'necklace',
  'ring1',
  'ring2',
  'ring3',
  'ring4',
  'ring5',
];
const RING_EQUIPMENT_SLOTS = ['ring1', 'ring2', 'ring3', 'ring4', 'ring5'];

function loadItemDefinitions() {
  const raw = loadRequiredJsonFile(ITEM_CONTENT_PATH);
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`Item catalog must be a non-empty array: ${ITEM_CONTENT_PATH}`);
  }

  const map = {};
  for (const [index, entry] of raw.entries()) {
    const itemId = String(entry?.id ?? '').trim();
    if (!itemId) {
      throw new Error(`Item catalog entry ${index} is missing a valid id`);
    }

    if (map[itemId]) {
      throw new Error(`Item catalog has duplicate id '${itemId}'`);
    }

    const itemName = String(entry?.name ?? '').trim();
    const examineText = String(entry?.examineText ?? '').trim();
    const image = String(entry?.image ?? '').trim();
    if (!itemName || !examineText || !image) {
      throw new Error(`Item catalog entry '${itemId}' must include name, image, and examineText`);
    }

    if (!image.startsWith('/')) {
      throw new Error(`Item catalog entry '${itemId}' image must start with '/' (web path)`);
    }

    const imagePath = path.join(PUBLIC_DIR, image.slice(1));
    if (!existsSync(imagePath)) {
      throw new Error(`Item catalog entry '${itemId}' image file not found: ${imagePath}`);
    }

    map[itemId] = {
      id: itemId,
      name: itemName,
      stackable: Boolean(entry?.stackable),
      image,
      examineText,
    };
  }

  return map;
}

function loadResourceDefinitions() {
  const raw = loadRequiredJsonFile(RESOURCE_CONTENT_PATH);
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`Resource catalog must be a non-empty array: ${RESOURCE_CONTENT_PATH}`);
  }

  const map = {};
  for (const [index, entry] of raw.entries()) {
    const resourceId = String(entry?.id ?? '').trim();
    if (!resourceId) {
      throw new Error(`Resource catalog entry ${index} is missing a valid id`);
    }

    if (map[resourceId]) {
      throw new Error(`Resource catalog has duplicate id '${resourceId}'`);
    }

    const nodeType = String(entry?.nodeType ?? '').trim();
    if (nodeType !== 'tree' && nodeType !== 'rock') {
      throw new Error(`Resource catalog '${resourceId}' has invalid nodeType '${nodeType}'`);
    }

    const resourceName = String(entry?.name ?? '').trim();
    const examineText = String(entry?.examineText ?? '').trim();
    const image = String(entry?.image ?? '').trim();
    if (!resourceName || !examineText || !image) {
      throw new Error(
        `Resource catalog entry '${resourceId}' must include name, image, and examineText`,
      );
    }

    if (!image.startsWith('/')) {
      throw new Error(`Resource catalog entry '${resourceId}' image must start with '/' (web path)`);
    }

    const imagePath = path.join(PUBLIC_DIR, image.slice(1));
    if (!existsSync(imagePath)) {
      throw new Error(`Resource catalog entry '${resourceId}' image file not found: ${imagePath}`);
    }

    map[resourceId] = {
      id: resourceId,
      name: resourceName,
      nodeType,
      tier: Math.max(1, Math.floor(Number(entry?.tier ?? 1))),
      actionLabel: String(entry?.actionLabel ?? '').trim(),
      image,
      examineText,
    };
  }

  return map;
}

function loadGearDefinitions() {
  const raw = loadRequiredJsonFile(GEAR_CONTENT_PATH);
  if (!Array.isArray(raw)) {
    throw new Error(`Gear config must be an array: ${GEAR_CONTENT_PATH}`);
  }

  const map = {};
  for (const [index, entry] of raw.entries()) {
    const itemId = String(entry?.itemId ?? '').trim();
    if (!itemId) {
      throw new Error(`Gear config entry ${index} is missing itemId`);
    }

    const itemDefinition = getItemDefinition(itemId);
    if (!itemDefinition) {
      throw new Error(`Gear config entry '${itemId}' references unknown item`);
    }

    if (itemDefinition.stackable) {
      throw new Error(`Gear config entry '${itemId}' must be non-stackable`);
    }

    const slot = String(entry?.slot ?? '').trim();
    const isSupportedRingSlot = slot === 'ring';
    if (!EQUIPMENT_SLOTS.includes(slot) && !isSupportedRingSlot) {
      throw new Error(
        `Gear config entry '${itemId}' has invalid slot '${slot}'. Expected one of: ${EQUIPMENT_SLOTS.join(', ')}, ring`,
      );
    }

    const normalizeNonZeroNumber = (value) => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed === 0) {
        return undefined;
      }

      return parsed;
    };

    const normalizeAccuracyMap = (source) => {
      const accuracy = {
        melee: normalizeNonZeroNumber(source?.melee),
        ranged: normalizeNonZeroNumber(source?.ranged),
        magic: normalizeNonZeroNumber(source?.magic),
      };

      if (
        accuracy.melee === undefined &&
        accuracy.ranged === undefined &&
        accuracy.magic === undefined
      ) {
        return undefined;
      }

      return accuracy;
    };

    const rawStats = entry?.stats ?? {};
    const baseStats = {
      strength: normalizeNonZeroNumber(rawStats?.baseStats?.strength),
      constitution: normalizeNonZeroNumber(rawStats?.baseStats?.constitution),
    };

    const hasBaseStats = baseStats.strength !== undefined || baseStats.constitution !== undefined;

    const armorProfileRaw = rawStats?.armorProfile;
    const armorProfile =
      armorProfileRaw && typeof armorProfileRaw === 'object'
        ? {
            style: String(armorProfileRaw.style ?? 'melee'),
            damageReductionPct: normalizeNonZeroNumber(armorProfileRaw.damageReductionPct),
            armor: normalizeNonZeroNumber(armorProfileRaw.armor),
            accuracy: normalizeAccuracyMap(armorProfileRaw.accuracy),
          }
        : null;

    const weaponProfileRaw = rawStats?.weaponProfile;
    const weaponProfile =
      weaponProfileRaw && typeof weaponProfileRaw === 'object'
        ? {
            type: String(weaponProfileRaw.type ?? ''),
            style: String(weaponProfileRaw.style ?? ''),
            accuracy: normalizeNonZeroNumber(weaponProfileRaw.accuracy),
            attackRateSeconds: normalizeNonZeroNumber(weaponProfileRaw.attackRateSeconds),
            range: normalizeNonZeroNumber(weaponProfileRaw.range),
            baseDamage: normalizeNonZeroNumber(weaponProfileRaw.baseDamage),
          }
        : null;

    map[itemId] = {
      itemId,
      slot,
      stats: {
        baseStats: hasBaseStats ? baseStats : undefined,
        armorProfile,
        weaponProfile,
      },
      combat: {
        minDamageBonus: Math.floor(Number(entry?.combat?.minDamageBonus ?? 0)),
        maxDamageBonus: Math.floor(Number(entry?.combat?.maxDamageBonus ?? 0)),
      },
      skills: {
        mining: {
          successChanceBonus: Number(entry?.skills?.mining?.successChanceBonus ?? 0),
          gatherIntervalMultiplier: Number(entry?.skills?.mining?.gatherIntervalMultiplier ?? 1),
        },
        woodcutting: {
          successChanceBonus: Number(entry?.skills?.woodcutting?.successChanceBonus ?? 0),
          gatherIntervalMultiplier: Number(entry?.skills?.woodcutting?.gatherIntervalMultiplier ?? 1),
        },
      },
    };
  }

  return map;
}

function loadMinionDefinitions() {
  const raw = loadRequiredJsonFile(MINION_CONTENT_PATH);
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`Minion config must be a non-empty array: ${MINION_CONTENT_PATH}`);
  }

  const map = {};
  const seenIds = new Set();

  for (const [index, entry] of raw.entries()) {
    const id = String(entry?.id ?? '').trim();
    if (!id) {
      throw new Error(`Minion config entry ${index} is missing id`);
    }

    if (seenIds.has(id)) {
      throw new Error(`Minion config has duplicate id '${id}'`);
    }
    seenIds.add(id);

    const type = String(entry?.type ?? '').trim();
    if (type !== 'goblin') {
      throw new Error(`Minion config entry '${id}' has unsupported type '${type}'`);
    }

    const name = String(entry?.name ?? '').trim();
    const examineText = String(entry?.examineText ?? '').trim();
    if (!name || !examineText) {
      throw new Error(`Minion config entry '${id}' must include name and examineText`);
    }

    const maxHp = Math.max(1, Math.floor(Number(entry?.maxHp ?? 1)));
    const attackDamageMin = Math.max(1, Math.floor(Number(entry?.attackDamageMin ?? ENEMY_ATTACK_DAMAGE_MIN)));
    const attackDamageMax = Math.max(
      attackDamageMin,
      Math.floor(Number(entry?.attackDamageMax ?? ENEMY_ATTACK_DAMAGE_MAX)),
    );
    const attackAccuracy = Math.max(1, Math.floor(Number(entry?.attackAccuracy ?? ENEMY_ATTACK_ACCURACY)));
    const armor = Math.max(0, Math.floor(Number(entry?.armor ?? ENEMY_ARMOR)));
    const attackCooldownMs = Math.max(200, Math.floor(Number(entry?.attackCooldownMs ?? ENEMY_ATTACK_COOLDOWN_MS)));
    const aggroRangeTiles = Math.max(1, Math.floor(Number(entry?.aggroRangeTiles ?? ENEMY_AGGRO_RANGE_TILES)));
    const respawnMs = Math.max(250, Math.floor(Number(entry?.respawnMs ?? ENEMY_RESPAWN_MS)));
    const maxChaseDistanceTiles = Math.max(
      1,
      Math.floor(Number(entry?.maxChaseDistanceTiles ?? ENEMY_MAX_CHASE_DISTANCE_TILES)),
    );
    const hpRegenIntervalMs = Math.max(
      250,
      Math.floor(Number(entry?.hpRegenIntervalMs ?? ENEMY_HP_REGEN_INTERVAL_MS)),
    );
    const hpRegenAmount = Math.max(1, Math.floor(Number(entry?.hpRegenAmount ?? ENEMY_HP_REGEN_AMOUNT)));

    const parseDropQuantity = (quantitySource, fallbackQuantity = 1) => {
      if (quantitySource && typeof quantitySource === 'object') {
        const minRaw = Number(quantitySource.min ?? fallbackQuantity);
        const maxRaw = Number(quantitySource.max ?? fallbackQuantity);
        const min = Math.max(1, Math.floor(Number.isFinite(minRaw) ? minRaw : fallbackQuantity));
        const max = Math.max(min, Math.floor(Number.isFinite(maxRaw) ? maxRaw : min));
        return { min, max };
      }

      const scalarRaw = Number(quantitySource ?? fallbackQuantity);
      const scalar = Math.max(1, Math.floor(Number.isFinite(scalarRaw) ? scalarRaw : fallbackQuantity));
      return { min: scalar, max: scalar };
    };

    const parseDropList = (source, label, requiresChance = false) => {
      if (source === undefined) {
        return [];
      }

      if (!Array.isArray(source)) {
        throw new Error(`Minion config entry '${id}' ${label} must be an array`);
      }

      return source.map((dropEntry, dropIndex) => {
        const dropPath = `${label}[${dropIndex}]`;
        if (!requiresChance) {
          const itemId = String(dropEntry?.itemId ?? '').trim();
          if (!itemId) {
            throw new Error(`Minion config entry '${id}' ${dropPath} is missing itemId`);
          }

          const itemDefinition = getItemDefinition(itemId);
          if (!itemDefinition) {
            throw new Error(`Minion config entry '${id}' ${dropPath} references unknown item '${itemId}'`);
          }

          const quantity = parseDropQuantity(dropEntry?.quantity, 1);
          return {
            dropType: 'item',
            itemId: itemDefinition.id,
            quantity,
          };
        }

        const itemId = String(dropEntry?.itemId ?? '').trim();
        const lootTableIdRaw = String(dropEntry?.lootTableId ?? dropEntry?.tableId ?? '').trim();
        const chancePctRaw = Number(dropEntry?.chancePct);
        if (!Number.isFinite(chancePctRaw) || chancePctRaw < 0 || chancePctRaw > 100) {
          throw new Error(`Minion config entry '${id}' ${dropPath}.chancePct must be between 0 and 100`);
        }

        const resolvedLootTableId = lootTableIdRaw || itemId;
        const lootTableDefinition = getLootTableDefinition(resolvedLootTableId);
        if (lootTableDefinition) {
          return {
            dropType: 'lootTable',
            lootTableId: lootTableDefinition.id,
            chancePct: chancePctRaw,
          };
        }

        if (!itemId) {
          throw new Error(
            `Minion config entry '${id}' ${dropPath} is missing itemId or lootTableId`,
          );
        }

        const itemDefinition = getItemDefinition(itemId);
        if (!itemDefinition) {
          throw new Error(
            `Minion config entry '${id}' ${dropPath} references unknown item or loot table '${itemId}'`,
          );
        }

        const quantity = parseDropQuantity(dropEntry?.quantity, 1);

        return {
          dropType: 'item',
          itemId: itemDefinition.id,
          chancePct: chancePctRaw,
          quantity,
        };
      });
    };

    const guaranteedDrops = parseDropList(entry?.guaranteedDrops, 'guaranteedDrops');
    const lootTable = parseDropList(entry?.lootTable, 'lootTable', true);

    const tierScalingRaw = entry?.tierScaling;
    const tierScaling =
      tierScalingRaw && typeof tierScalingRaw === 'object'
        ? {
            statMultiplierPerTier: Math.max(
              0,
              Number(tierScalingRaw.statMultiplierPerTier ?? 0),
            ),
            lootMultiplierPerTier: Math.max(
              0,
              Number(tierScalingRaw.lootMultiplierPerTier ?? 0),
            ),
          }
        : {
            statMultiplierPerTier: 0,
            lootMultiplierPerTier: 0,
          };

    const tierExamineTextSource = entry?.tierExamineText;
    const tierExamineText = {};
    if (tierExamineTextSource !== undefined) {
      if (!tierExamineTextSource || typeof tierExamineTextSource !== 'object' || Array.isArray(tierExamineTextSource)) {
        throw new Error(`Minion config entry '${id}' tierExamineText must be an object`);
      }

      for (const [tierKey, tierTextRaw] of Object.entries(tierExamineTextSource)) {
        const tier = Math.max(1, Math.floor(Number(tierKey)));
        const tierText = String(tierTextRaw ?? '').trim();
        if (!tierText) {
          continue;
        }

        tierExamineText[String(tier)] = tierText;
      }
    }

    map[id] = {
      id,
      type,
      name,
      maxHp,
      attackDamageMin,
      attackDamageMax,
      attackAccuracy,
      armor,
      attackCooldownMs,
      aggroRangeTiles,
      respawnMs,
      maxChaseDistanceTiles,
      hpRegenIntervalMs,
      hpRegenAmount,
      guaranteedDrops,
      lootTable,
      examineText,
      tierScaling,
      tierExamineText,
    };
  }

  return map;
}

function loadLootTableDefinitions() {
  const raw = loadRequiredJsonFile(LOOT_TABLE_CONTENT_PATH);
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`Loot table config must be a non-empty array: ${LOOT_TABLE_CONTENT_PATH}`);
  }

  const parseDropQuantity = (quantitySource, fallbackQuantity = 1) => {
    if (quantitySource && typeof quantitySource === 'object') {
      const minRaw = Number(quantitySource.min ?? fallbackQuantity);
      const maxRaw = Number(quantitySource.max ?? fallbackQuantity);
      const min = Math.max(1, Math.floor(Number.isFinite(minRaw) ? minRaw : fallbackQuantity));
      const max = Math.max(min, Math.floor(Number.isFinite(maxRaw) ? maxRaw : min));
      return { min, max };
    }

    const scalarRaw = Number(quantitySource ?? fallbackQuantity);
    const scalar = Math.max(1, Math.floor(Number.isFinite(scalarRaw) ? scalarRaw : fallbackQuantity));
    return { min: scalar, max: scalar };
  };

  const map = {};
  const seenIds = new Set();

  for (const [index, entry] of raw.entries()) {
    const id = String(entry?.id ?? '').trim();
    if (!id) {
      throw new Error(`Loot table config entry ${index} is missing id`);
    }

    if (seenIds.has(id)) {
      throw new Error(`Loot table config has duplicate id '${id}'`);
    }
    seenIds.add(id);

    const entries = entry?.entries;
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new Error(`Loot table config entry '${id}' must include a non-empty entries array`);
    }

    map[id] = {
      id,
      name: String(entry?.name ?? id),
      entries: entries.map((dropEntry, dropIndex) => {
        const dropPath = `entries[${dropIndex}]`;
        const itemId = String(dropEntry?.itemId ?? '').trim();
        if (!itemId) {
          throw new Error(`Loot table config entry '${id}' ${dropPath} is missing itemId`);
        }

        const itemDefinition = getItemDefinition(itemId);
        if (!itemDefinition) {
          throw new Error(`Loot table config entry '${id}' ${dropPath} references unknown item '${itemId}'`);
        }

        const chancePctRaw = Number(dropEntry?.chancePct);
        if (!Number.isFinite(chancePctRaw) || chancePctRaw < 0 || chancePctRaw > 100) {
          throw new Error(`Loot table config entry '${id}' ${dropPath}.chancePct must be between 0 and 100`);
        }

        return {
          itemId: itemDefinition.id,
          chancePct: chancePctRaw,
          quantity: parseDropQuantity(dropEntry?.quantity, 1),
        };
      }),
    };
  }

  return map;
}

const ITEM_DEFINITIONS = loadItemDefinitions();
const RESOURCE_DEFINITIONS = loadResourceDefinitions();
const GEAR_DEFINITIONS = loadGearDefinitions();
const LOOT_TABLE_DEFINITIONS = loadLootTableDefinitions();
const MINION_DEFINITIONS = loadMinionDefinitions();

function getMinionDefinition(minionTypeId) {
  return MINION_DEFINITIONS[String(minionTypeId ?? '')] ?? null;
}

function getLootTableDefinition(lootTableId) {
  return LOOT_TABLE_DEFINITIONS[String(lootTableId ?? '')] ?? null;
}

function getItemDefinition(itemId) {
  return ITEM_DEFINITIONS[String(itemId ?? '')] ?? null;
}

function getItemExamineText(itemId, fallbackName = 'item') {
  const itemDefinition = getItemDefinition(itemId);
  if (itemDefinition?.examineText) {
    return itemDefinition.examineText;
  }

  const name = String(fallbackName || 'item').toLowerCase();
  return `It's ${name}.`;
}

function getResourceDefinition(resourceId) {
  return RESOURCE_DEFINITIONS[String(resourceId ?? '')] ?? null;
}

function getResourceName(resourceId, fallback = 'resource') {
  return getResourceDefinition(resourceId)?.name ?? fallback;
}

function getGearDefinition(itemId) {
  return GEAR_DEFINITIONS[String(itemId ?? '')] ?? null;
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
  bankChest: {
    id: 'npc-bank-chest',
    type: 'bank_chest',
    name: 'Bank chest',
    tileX: 42,
    tileY: 38,
    examineText: 'A sturdy chest for secure item storage.',
  },
};

const SHOP_DEFINITIONS = {
  generalStore: {
    id: 'shop-general-store',
    npcId: NPC_DEFINITIONS.shopkeeperBob.id,
    name: 'Bob\'s General Store',
    listings: [
      {
        itemId: 'birch_logs',
        name: getItemDefinition('birch_logs')?.name ?? 'Birch logs',
        buyPrice: 10,
        sellPrice: 4,
      },
      {
        itemId: 'copper_ore',
        name: getItemDefinition('copper_ore')?.name ?? 'Copper ore',
        buyPrice: 16,
        sellPrice: 7,
      },
      {
        itemId: 'tin_ore',
        name: getItemDefinition('tin_ore')?.name ?? 'Tin ore',
        buyPrice: 16,
        sellPrice: 7,
      },
      {
        itemId: 'tinderbox',
        name: getItemDefinition('tinderbox')?.name ?? 'Tinderbox',
        buyPrice: 20,
        sellPrice: 8,
      },
      {
        itemId: 'bronze_axe',
        name: getItemDefinition('bronze_axe')?.name ?? 'Bronze axe',
        buyPrice: 50,
        sellPrice: 22,
      },
      {
        itemId: 'bronze_pickaxe',
        name: getItemDefinition('bronze_pickaxe')?.name ?? 'Bronze pickaxe',
        buyPrice: 50,
        sellPrice: 22,
      },
      {
        itemId: 'bronze_helmet',
        name: getItemDefinition('bronze_helmet')?.name ?? 'Bronze helmet',
        buyPrice: 70,
        sellPrice: 30,
      },
      {
        itemId: 'bronze_platebody',
        name: getItemDefinition('bronze_platebody')?.name ?? 'Bronze platebody',
        buyPrice: 120,
        sellPrice: 52,
      },
      {
        itemId: 'bronze_platelegs',
        name: getItemDefinition('bronze_platelegs')?.name ?? 'Bronze platelegs',
        buyPrice: 95,
        sellPrice: 42,
      },
      {
        itemId: 'leather_gloves',
        name: getItemDefinition('leather_gloves')?.name ?? 'Leather gloves',
        buyPrice: 35,
        sellPrice: 15,
      },
      {
        itemId: 'leather_boots',
        name: getItemDefinition('leather_boots')?.name ?? 'Leather boots',
        buyPrice: 35,
        sellPrice: 15,
      },
      {
        itemId: 'wooden_shield',
        name: getItemDefinition('wooden_shield')?.name ?? 'Wooden shield',
        buyPrice: 55,
        sellPrice: 24,
      },
      {
        itemId: 'copper_amulet',
        name: getItemDefinition('copper_amulet')?.name ?? 'Copper amulet',
        buyPrice: 90,
        sellPrice: 39,
      },
      {
        itemId: 'copper_ring',
        name: getItemDefinition('copper_ring')?.name ?? 'Copper ring',
        buyPrice: 45,
        sellPrice: 19,
      },
      {
        itemId: 'apple',
        name: getItemDefinition('apple')?.name ?? 'Apple',
        buyPrice: 5,
        sellPrice: 2,
      },
    ],
  },
};

const MINION_SPAWN_DEFINITIONS = [
  {
    id: 'enemy-goblin-1',
    minionTypeId: 'goblin',
    tier: 1,
    tileX: 33,
    tileY: 39,
  },
  {
    id: 'enemy-goblin-2',
    minionTypeId: 'goblin',
    tier: 1,
    tileX: 47,
    tileY: 41,
  },
  {
    id: 'enemy-goblin-3',
    minionTypeId: 'goblin',
    tier: 2,
    tileX: 25,
    tileY: 36,
  },
  {
    id: 'enemy-goblin-4',
    minionTypeId: 'goblin',
    tier: 2,
    tileX: 55,
    tileY: 44,
  },
  {
    id: 'enemy-goblin-5',
    minionTypeId: 'goblin',
    tier: 3,
    tileX: 20,
    tileY: 34,
  },
  {
    id: 'enemy-goblin-6',
    minionTypeId: 'goblin',
    tier: 4,
    tileX: 60,
    tileY: 46,
  },
];

const DEFAULT_HARVESTING_SKILL_CONFIGS = {
  woodcutting: {
    skill: 'woodcutting',
    resources: [
      {
        id: 'birch_tree',
        nodeType: 'tree',
        requiredLevel: 1,
        successChance: 0.25,
        gatherIntervalMs: GATHER_INTERVAL_MS_DEFAULT,
        depletionHits: { min: 3, max: 5 },
        depletionDurationMs: { min: 4500, max: 5500 },
        drops: [
          {
            itemId: 'birch_logs',
            weight: 75,
            quantity: { min: 1, max: 1 },
            xp: WOODCUTTING_XP_PER_GATHER_DEFAULT,
          },
          {
            itemId: 'leaf',
            weight: 25,
            quantity: { min: 1, max: 1 },
            xp: 1,
          },
        ],
      },
      {
        id: 'oak_tree',
        nodeType: 'tree',
        requiredLevel: 15,
        successChance: 0.18,
        gatherIntervalMs: GATHER_INTERVAL_MS_DEFAULT + 150,
        depletionHits: { min: 5, max: 8 },
        depletionDurationMs: { min: 6000, max: 7000 },
        drops: [
          {
            itemId: 'oak_logs',
            weight: 85,
            quantity: { min: 1, max: 1 },
            xp: 37,
          },
          {
            itemId: 'leaf',
            weight: 15,
            quantity: { min: 1, max: 2 },
            xp: 2,
          },
        ],
      },
    ],
    messages: {
      locked: 'Requires Woodcutting level {requiredLevel}.',
      gatherFail: 'You fail to chop any usable material from the tree.',
      success: '+{quantity} {itemName} (+{xp} XP)',
      levelUp: 'Woodcutting level up! Level {level}',
      depleted: '{resourceName} is depleted.',
    },
  },
  mining: {
    skill: 'mining',
    resources: [
      {
        id: 'copper_rock',
        nodeType: 'rock',
        requiredLevel: 1,
        successChance: 0.3,
        gatherIntervalMs: GATHER_INTERVAL_MS_DEFAULT,
        depletionHits: { min: 3, max: 5 },
        depletionDurationMs: { min: 6000, max: 7000 },
        drops: [
          {
            itemId: 'copper_ore',
            weight: 80,
            quantity: { min: 1, max: 1 },
            xp: MINING_XP_PER_GATHER_DEFAULT,
          },
          {
            itemId: 'stone',
            weight: 20,
            quantity: { min: 1, max: 1 },
            xp: 4,
          },
        ],
      },
      {
        id: 'iron_rock',
        nodeType: 'rock',
        requiredLevel: 15,
        successChance: 0.2,
        gatherIntervalMs: GATHER_INTERVAL_MS_DEFAULT + 150,
        depletionHits: { min: 4, max: 7 },
        depletionDurationMs: { min: 7000, max: 8000 },
        drops: [
          {
            itemId: 'iron_ore',
            weight: 75,
            quantity: { min: 1, max: 1 },
            xp: 35,
          },
          {
            itemId: 'stone',
            weight: 25,
            quantity: { min: 1, max: 2 },
            xp: 5,
          },
        ],
      },
      {
        id: 'tin_rock',
        nodeType: 'rock',
        requiredLevel: 1,
        successChance: 0.28,
        gatherIntervalMs: GATHER_INTERVAL_MS_DEFAULT,
        depletionHits: { min: 3, max: 5 },
        depletionDurationMs: { min: 6000, max: 7000 },
        drops: [
          {
            itemId: 'tin_ore',
            weight: 80,
            quantity: { min: 1, max: 1 },
            xp: 24,
          },
          {
            itemId: 'stone',
            weight: 20,
            quantity: { min: 1, max: 1 },
            xp: 4,
          },
        ],
      },
    ],
    messages: {
      locked: 'Requires Mining level {requiredLevel}.',
      gatherFail: 'Your swing glances off and yields nothing useful.',
      success: '+{quantity} {itemName} (+{xp} XP)',
      levelUp: 'Mining level up! Level {level}',
      depleted: '{resourceName} is depleted.',
    },
  },
};

function interpolateTemplate(template, values) {
  let result = String(template ?? '');

  for (const [key, value] of Object.entries(values)) {
    result = result.replaceAll(`{${key}}`, String(value));
  }

  return result;
}

function loadJsonFile(filePath) {
  try {
    const raw = readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function loadRequiredJsonFile(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Missing required config file: ${filePath}`);
  }

  try {
    const raw = readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown parse error';
    throw new Error(`Invalid JSON in ${filePath}: ${message}`);
  }
}

function validateHarvestingConfig(rawConfig, sourceFilePath) {
  const errors = [];
  const pushError = (pathLabel, message) => {
    errors.push(`${pathLabel}: ${message}`);
  };

  const skillNames = Object.keys(createSkills());

  if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
    pushError('$', 'must be an object');
    return errors;
  }

  if (typeof rawConfig.skill !== 'string' || rawConfig.skill.trim().length === 0) {
    pushError('skill', 'must be a non-empty string');
  } else if (!skillNames.includes(rawConfig.skill)) {
    pushError('skill', `must be one of: ${skillNames.join(', ')}`);
  }

  if (!Array.isArray(rawConfig.resources) || rawConfig.resources.length === 0) {
    pushError('resources', 'must be a non-empty array');
  }

  if (!rawConfig.messages || typeof rawConfig.messages !== 'object' || Array.isArray(rawConfig.messages)) {
    pushError('messages', 'must be an object');
  } else {
    for (const field of ['locked', 'gatherFail', 'success', 'levelUp', 'depleted']) {
      const value = rawConfig.messages[field];
      if (typeof value !== 'string' || value.trim().length === 0) {
        pushError(`messages.${field}`, 'must be a non-empty string');
      }
    }
  }

  if (Array.isArray(rawConfig.resources)) {
    const seenResourceIds = new Set();

    rawConfig.resources.forEach((resource, resourceIndex) => {
      const resourcePath = `resources[${resourceIndex}]`;

      if (!resource || typeof resource !== 'object' || Array.isArray(resource)) {
        pushError(resourcePath, 'must be an object');
        return;
      }

      if (typeof resource.id !== 'string' || resource.id.trim().length === 0) {
        pushError(`${resourcePath}.id`, 'must be a non-empty string');
      } else if (seenResourceIds.has(resource.id)) {
        pushError(`${resourcePath}.id`, `duplicate resource id '${resource.id}'`);
      } else {
        seenResourceIds.add(resource.id);

        const resourceDefinition = getResourceDefinition(resource.id);
        if (!resourceDefinition) {
          pushError(`${resourcePath}.id`, `unknown resource '${resource.id}'`);
        } else if (resource.nodeType !== resourceDefinition.nodeType) {
          pushError(
            `${resourcePath}.nodeType`,
            `must match resource catalog nodeType '${resourceDefinition.nodeType}'`,
          );
        }
      }

      if (typeof resource.nodeType !== 'string' || resource.nodeType.trim().length === 0) {
        pushError(`${resourcePath}.nodeType`, 'must be a non-empty string');
      }

      if (!Number.isFinite(resource.requiredLevel) || resource.requiredLevel < 1) {
        pushError(`${resourcePath}.requiredLevel`, 'must be a number >= 1');
      }

      if (!Number.isFinite(resource.successChance) || resource.successChance < 0 || resource.successChance > 1) {
        pushError(`${resourcePath}.successChance`, 'must be a number between 0 and 1');
      }

      if (!Number.isFinite(resource.gatherIntervalMs) || resource.gatherIntervalMs < 250) {
        pushError(`${resourcePath}.gatherIntervalMs`, 'must be a number >= 250');
      }

      if (!resource.depletionHits || typeof resource.depletionHits !== 'object') {
        pushError(`${resourcePath}.depletionHits`, 'must be an object with min/max');
      } else {
        const min = resource.depletionHits.min;
        const max = resource.depletionHits.max;
        if (!Number.isFinite(min) || min < 1) {
          pushError(`${resourcePath}.depletionHits.min`, 'must be a number >= 1');
        }
        if (!Number.isFinite(max) || max < 1) {
          pushError(`${resourcePath}.depletionHits.max`, 'must be a number >= 1');
        }
        if (Number.isFinite(min) && Number.isFinite(max) && max < min) {
          pushError(`${resourcePath}.depletionHits`, 'max must be >= min');
        }
      }

      if (!resource.depletionDurationMs || typeof resource.depletionDurationMs !== 'object') {
        pushError(`${resourcePath}.depletionDurationMs`, 'must be an object with min/max');
      } else {
        const min = resource.depletionDurationMs.min;
        const max = resource.depletionDurationMs.max;
        if (!Number.isFinite(min) || min < 250) {
          pushError(`${resourcePath}.depletionDurationMs.min`, 'must be a number >= 250');
        }
        if (!Number.isFinite(max) || max < 250) {
          pushError(`${resourcePath}.depletionDurationMs.max`, 'must be a number >= 250');
        }
        if (Number.isFinite(min) && Number.isFinite(max) && max < min) {
          pushError(`${resourcePath}.depletionDurationMs`, 'max must be >= min');
        }
      }

      if (!Array.isArray(resource.drops) || resource.drops.length === 0) {
        pushError(`${resourcePath}.drops`, 'must be a non-empty array');
      } else {
        resource.drops.forEach((drop, dropIndex) => {
          const dropPath = `${resourcePath}.drops[${dropIndex}]`;

          if (!drop || typeof drop !== 'object' || Array.isArray(drop)) {
            pushError(dropPath, 'must be an object');
            return;
          }

          if (typeof drop.itemId !== 'string' || drop.itemId.trim().length === 0) {
            pushError(`${dropPath}.itemId`, 'must be a non-empty string');
          } else if (!getItemDefinition(drop.itemId)) {
            pushError(`${dropPath}.itemId`, `unknown item '${drop.itemId}'`);
          }

          if (!Number.isFinite(drop.weight) || drop.weight <= 0) {
            pushError(`${dropPath}.weight`, 'must be a number > 0');
          }

          if (!drop.quantity || typeof drop.quantity !== 'object') {
            pushError(`${dropPath}.quantity`, 'must be an object with min/max');
          } else {
            const min = drop.quantity.min;
            const max = drop.quantity.max;
            if (!Number.isFinite(min) || min < 1) {
              pushError(`${dropPath}.quantity.min`, 'must be a number >= 1');
            }
            if (!Number.isFinite(max) || max < 1) {
              pushError(`${dropPath}.quantity.max`, 'must be a number >= 1');
            }
            if (Number.isFinite(min) && Number.isFinite(max) && max < min) {
              pushError(`${dropPath}.quantity`, 'max must be >= min');
            }
          }

          if (!Number.isFinite(drop.xp) || drop.xp < 0) {
            pushError(`${dropPath}.xp`, 'must be a number >= 0');
          }
        });
      }
    });
  }

  if (errors.length > 0) {
    const details = errors.map((error) => `- ${error}`).join('\n');
    throw new Error(`Harvesting config validation failed for ${sourceFilePath}:\n${details}`);
  }
}

function validateCraftingConfig(rawConfig, sourceFilePath) {
  const errors = [];
  const pushError = (pathLabel, message) => {
    errors.push(`${pathLabel}: ${message}`);
  };

  if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
    pushError('$', 'must be an object');
    return errors;
  }

  if (typeof rawConfig.skill !== 'string' || rawConfig.skill.trim().length === 0) {
    pushError('skill', 'must be a non-empty string');
  }

  if (!Array.isArray(rawConfig.recipes) || rawConfig.recipes.length === 0) {
    pushError('recipes', 'must be a non-empty array');
  }

  if (rawConfig.messages !== undefined) {
    if (!rawConfig.messages || typeof rawConfig.messages !== 'object' || Array.isArray(rawConfig.messages)) {
      pushError('messages', 'must be an object when present');
    }
  }

  if (Array.isArray(rawConfig.recipes)) {
    const seenRecipeIds = new Set();

    rawConfig.recipes.forEach((recipe, recipeIndex) => {
      const recipePath = `recipes[${recipeIndex}]`;
      if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) {
        pushError(recipePath, 'must be an object');
        return;
      }

      if (typeof recipe.id !== 'string' || recipe.id.trim().length === 0) {
        pushError(`${recipePath}.id`, 'must be a non-empty string');
      } else if (seenRecipeIds.has(recipe.id)) {
        pushError(`${recipePath}.id`, `duplicate recipe id '${recipe.id}'`);
      } else {
        seenRecipeIds.add(recipe.id);
      }

      if (!Number.isFinite(recipe.requiredLevel) || recipe.requiredLevel < 1) {
        pushError(`${recipePath}.requiredLevel`, 'must be a number >= 1');
      }

      if (!Number.isFinite(recipe.durationMs) || recipe.durationMs < 100) {
        pushError(`${recipePath}.durationMs`, 'must be a number >= 100');
      }

      if (!Number.isFinite(recipe.successChance) || recipe.successChance < 0 || recipe.successChance > 1) {
        pushError(`${recipePath}.successChance`, 'must be a number between 0 and 1');
      }

      if (!Number.isFinite(recipe.xp) || recipe.xp < 0) {
        pushError(`${recipePath}.xp`, 'must be a number >= 0');
      }

      for (const listName of ['inputs', 'outputs']) {
        const list = recipe[listName];
        if (!Array.isArray(list) || list.length === 0) {
          pushError(`${recipePath}.${listName}`, 'must be a non-empty array');
          continue;
        }

        list.forEach((entry, entryIndex) => {
          const entryPath = `${recipePath}.${listName}[${entryIndex}]`;
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            pushError(entryPath, 'must be an object');
            return;
          }

          if (typeof entry.itemId !== 'string' || entry.itemId.trim().length === 0) {
            pushError(`${entryPath}.itemId`, 'must be a non-empty string');
          } else if (!getItemDefinition(entry.itemId)) {
            pushError(`${entryPath}.itemId`, `unknown item '${entry.itemId}'`);
          }

          if (!Number.isFinite(entry.quantity) || entry.quantity < 1) {
            pushError(`${entryPath}.quantity`, 'must be a number >= 1');
          }
        });
      }
    });
  }

  if (errors.length > 0) {
    const details = errors.map((error) => `- ${error}`).join('\n');
    throw new Error(`Crafting config validation failed for ${sourceFilePath}:\n${details}`);
  }
}

function validateCombatConfig(rawConfig, sourceFilePath) {
  const errors = [];
  const pushError = (pathLabel, message) => {
    errors.push(`${pathLabel}: ${message}`);
  };

  if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
    pushError('$', 'must be an object');
    return errors;
  }

  if (typeof rawConfig.skill !== 'string' || rawConfig.skill.trim().length === 0) {
    pushError('skill', 'must be a non-empty string');
  }

  if (!Array.isArray(rawConfig.abilities) || rawConfig.abilities.length === 0) {
    pushError('abilities', 'must be a non-empty array');
  }

  if (!rawConfig.scaling || typeof rawConfig.scaling !== 'object' || Array.isArray(rawConfig.scaling)) {
    pushError('scaling', 'must be an object');
  } else {
    for (const field of ['baseMaxHit', 'bonusPerLevel']) {
      const value = rawConfig.scaling[field];
      if (!Number.isFinite(value) || value < 0) {
        pushError(`scaling.${field}`, 'must be a number >= 0');
      }
    }
  }

  if (Array.isArray(rawConfig.abilities)) {
    const seenAbilityIds = new Set();

    rawConfig.abilities.forEach((ability, abilityIndex) => {
      const abilityPath = `abilities[${abilityIndex}]`;
      if (!ability || typeof ability !== 'object' || Array.isArray(ability)) {
        pushError(abilityPath, 'must be an object');
        return;
      }

      if (typeof ability.id !== 'string' || ability.id.trim().length === 0) {
        pushError(`${abilityPath}.id`, 'must be a non-empty string');
      } else if (seenAbilityIds.has(ability.id)) {
        pushError(`${abilityPath}.id`, `duplicate ability id '${ability.id}'`);
      } else {
        seenAbilityIds.add(ability.id);
      }

      if (typeof ability.name !== 'string' || ability.name.trim().length === 0) {
        pushError(`${abilityPath}.name`, 'must be a non-empty string');
      }

      if (!Number.isFinite(ability.requiredLevel) || ability.requiredLevel < 1) {
        pushError(`${abilityPath}.requiredLevel`, 'must be a number >= 1');
      }

      if (!Number.isFinite(ability.cooldownMs) || ability.cooldownMs < 0) {
        pushError(`${abilityPath}.cooldownMs`, 'must be a number >= 0');
      }

      if (!Number.isFinite(ability.accuracy) || ability.accuracy < 0 || ability.accuracy > 1) {
        pushError(`${abilityPath}.accuracy`, 'must be a number between 0 and 1');
      }

      if (!Number.isFinite(ability.xp) || ability.xp < 0) {
        pushError(`${abilityPath}.xp`, 'must be a number >= 0');
      }
    });
  }

  if (errors.length > 0) {
    const details = errors.map((error) => `- ${error}`).join('\n');
    throw new Error(`Combat config validation failed for ${sourceFilePath}:\n${details}`);
  }
}

function clamp01(value, fallbackValue) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallbackValue;
  }

  return Math.max(0, Math.min(1, parsed));
}

function normalizeQuantityRange(rawQuantity, fallbackQuantity = { min: 1, max: 1 }) {
  const min = Math.max(1, Math.floor(Number(rawQuantity?.min ?? fallbackQuantity.min ?? 1)));
  const max = Math.max(min, Math.floor(Number(rawQuantity?.max ?? fallbackQuantity.max ?? min)));
  return { min, max };
}

function normalizeHitRange(rawRange, fallbackRange = { min: 1, max: 1 }) {
  const min = Math.max(1, Math.floor(Number(rawRange?.min ?? fallbackRange.min ?? 1)));
  const max = Math.max(min, Math.floor(Number(rawRange?.max ?? fallbackRange.max ?? min)));
  return { min, max };
}

function normalizeDurationRange(rawRange, fallbackRange = { min: 5000, max: 5000 }) {
  const min = Math.max(250, Math.floor(Number(rawRange?.min ?? fallbackRange.min ?? 5000)));
  const max = Math.max(min, Math.floor(Number(rawRange?.max ?? fallbackRange.max ?? min)));
  return { min, max };
}

function normalizeHarvestDrops(rawDrops, fallbackDrops) {
  const sourceDrops = Array.isArray(rawDrops) && rawDrops.length > 0 ? rawDrops : fallbackDrops;
  const normalized = [];

  for (const drop of sourceDrops) {
    const itemId = String(drop?.itemId ?? '');
    const itemDefinition = getItemDefinition(itemId);
    if (!itemDefinition) {
      continue;
    }

    const weight = Math.max(0, Number(drop?.weight ?? 0));
    const quantity = normalizeQuantityRange(drop?.quantity, { min: 1, max: 1 });
    const xp = Math.max(0, Math.floor(Number(drop?.xp ?? 0)));

    normalized.push({
      itemId: itemDefinition.id,
      weight,
      quantity,
      xp,
    });
  }

  if (normalized.length === 0) {
    const fallbackItem = getItemDefinition('birch_logs');
    if (fallbackItem) {
      normalized.push({
        itemId: fallbackItem.id,
        weight: 1,
        quantity: { min: 1, max: 1 },
        xp: 1,
      });
    }
  }

  return normalized;
}

function normalizeHarvestResource(rawResource, fallbackResource, skill) {
  const id = String(rawResource?.id ?? fallbackResource?.id ?? `${skill}_resource`);
  const nodeType = String(rawResource?.nodeType ?? fallbackResource?.nodeType ?? 'tree');
  const requiredLevel = Math.max(
    1,
    Math.floor(Number(rawResource?.requiredLevel ?? fallbackResource?.requiredLevel ?? 1)),
  );
  const successChance = clamp01(
    rawResource?.successChance,
    clamp01(fallbackResource?.successChance, 0.25),
  );
  const gatherIntervalMs = Math.max(
    250,
    Math.floor(Number(rawResource?.gatherIntervalMs ?? fallbackResource?.gatherIntervalMs ?? 1200)),
  );
  const depletionHits = normalizeHitRange(rawResource?.depletionHits, fallbackResource?.depletionHits);
  const depletionDurationMs = normalizeDurationRange(
    rawResource?.depletionDurationMs,
    fallbackResource?.depletionDurationMs,
  );
  const drops = normalizeHarvestDrops(rawResource?.drops, fallbackResource?.drops ?? []);

  return {
    id,
    skill,
    nodeType,
    requiredLevel,
    successChance,
    gatherIntervalMs,
    depletionHits,
    depletionDurationMs,
    drops,
    messages: {
      locked: String(rawResource?.messages?.locked ?? ''),
      gatherFail: String(rawResource?.messages?.gatherFail ?? ''),
      success: String(rawResource?.messages?.success ?? ''),
      levelUp: String(rawResource?.messages?.levelUp ?? ''),
      depleted: String(rawResource?.messages?.depleted ?? ''),
    },
  };
}

function normalizeHarvestingSkillConfig(rawConfig, fallbackConfig) {
  const configuredSkill = String(rawConfig?.skill ?? fallbackConfig.skill);
  const skill = configuredSkill in createSkills() ? configuredSkill : fallbackConfig.skill;
  const sourceResources =
    Array.isArray(rawConfig?.resources) && rawConfig.resources.length > 0
      ? rawConfig.resources
      : fallbackConfig.resources;

  const resources = sourceResources.map((resource, index) => {
    const fallbackResource = fallbackConfig.resources[Math.min(index, fallbackConfig.resources.length - 1)];
    return normalizeHarvestResource(resource, fallbackResource, skill);
  });

  return {
    skill,
    resources,
    messages: {
      locked: String(rawConfig?.messages?.locked ?? fallbackConfig.messages.locked),
      gatherFail: String(rawConfig?.messages?.gatherFail ?? fallbackConfig.messages.gatherFail),
      success: String(rawConfig?.messages?.success ?? fallbackConfig.messages.success),
      levelUp: String(rawConfig?.messages?.levelUp ?? fallbackConfig.messages.levelUp),
      depleted: String(rawConfig?.messages?.depleted ?? fallbackConfig.messages.depleted),
    },
  };
}

function loadHarvestingSkillConfigs() {
  const woodcuttingPath = path.join(HARVESTING_SKILL_DATA_DIR, 'woodcutting.json');
  const miningPath = path.join(HARVESTING_SKILL_DATA_DIR, 'mining.json');

  const woodcuttingRaw = loadRequiredJsonFile(woodcuttingPath);
  validateHarvestingConfig(woodcuttingRaw, woodcuttingPath);

  const miningRaw = loadRequiredJsonFile(miningPath);
  validateHarvestingConfig(miningRaw, miningPath);

  return {
    woodcutting: normalizeHarvestingSkillConfig(
      woodcuttingRaw,
      DEFAULT_HARVESTING_SKILL_CONFIGS.woodcutting,
    ),
    mining: normalizeHarvestingSkillConfig(
      miningRaw,
      DEFAULT_HARVESTING_SKILL_CONFIGS.mining,
    ),
  };
}

function loadCraftingSkillConfigs() {
  if (!existsSync(CRAFTING_SKILL_DATA_DIR)) {
    return {};
  }

  const craftingConfigs = {};
  const entries = readdirSync(CRAFTING_SKILL_DATA_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name === 'schema.json') {
      continue;
    }

    const filePath = path.join(CRAFTING_SKILL_DATA_DIR, entry.name);
    const raw = loadRequiredJsonFile(filePath);
    validateCraftingConfig(raw, filePath);

    const skillKey = String(raw.skill || path.basename(entry.name, '.json'));
    craftingConfigs[skillKey] = raw;
  }

  return craftingConfigs;
}

function loadCombatSkillConfigs() {
  if (!existsSync(COMBAT_SKILL_DATA_DIR)) {
    return {};
  }

  const combatConfigs = {};
  const entries = readdirSync(COMBAT_SKILL_DATA_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name === 'schema.json') {
      continue;
    }

    const filePath = path.join(COMBAT_SKILL_DATA_DIR, entry.name);
    const raw = loadRequiredJsonFile(filePath);
    validateCombatConfig(raw, filePath);

    const skillKey = String(raw.skill || path.basename(entry.name, '.json'));
    combatConfigs[skillKey] = raw;
  }

  return combatConfigs;
}

function buildHarvestResourceConfigMap(harvestingSkillConfigs) {
  const resourcesById = {};

  for (const skillConfig of Object.values(harvestingSkillConfigs)) {
    for (const resource of skillConfig.resources) {
      const skillMessages = skillConfig.messages;
      resourcesById[resource.id] = {
        ...resource,
        messages: {
          locked: resource.messages.locked || skillMessages.locked,
          gatherFail: resource.messages.gatherFail || skillMessages.gatherFail,
          success: resource.messages.success || skillMessages.success,
          levelUp: resource.messages.levelUp || skillMessages.levelUp,
          depleted: resource.messages.depleted || skillMessages.depleted,
        },
      };
    }
  }

  return resourcesById;
}

const HARVESTING_SKILL_CONFIGS = loadHarvestingSkillConfigs();
const HARVEST_RESOURCE_CONFIGS = buildHarvestResourceConfigMap(HARVESTING_SKILL_CONFIGS);
const CRAFTING_SKILL_CONFIGS = loadCraftingSkillConfigs();
const COMBAT_SKILL_CONFIGS = loadCombatSkillConfigs();

function getHarvestResourceConfig(resourceId, nodeType) {
  if (resourceId && HARVEST_RESOURCE_CONFIGS[resourceId]) {
    return HARVEST_RESOURCE_CONFIGS[resourceId];
  }

  return (
    Object.values(HARVEST_RESOURCE_CONFIGS).find((resource) => resource.nodeType === nodeType) ?? null
  );
}

function rollDepletionHits(resourceConfig) {
  return randomIntBetween(resourceConfig.depletionHits.min, resourceConfig.depletionHits.max);
}

function rollDepletionDurationMs(resourceConfig, fallbackMs = 5000) {
  const min = Number(resourceConfig?.depletionDurationMs?.min);
  const max = Number(resourceConfig?.depletionDurationMs?.max);

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    const resolvedFallback = Math.max(250, Math.floor(Number(fallbackMs) || 5000));
    return resolvedFallback;
  }

  const safeMin = Math.max(250, Math.floor(min));
  const safeMax = Math.max(safeMin, Math.floor(max));
  return randomIntBetween(safeMin, safeMax);
}

function pickWeightedDrop(drops) {
  const totalWeight = drops.reduce((sum, drop) => sum + Math.max(0, drop.weight), 0);
  if (totalWeight <= 0) {
    return drops[0] ?? null;
  }

  let roll = Math.random() * totalWeight;
  for (const drop of drops) {
    const weight = Math.max(0, drop.weight);
    roll -= weight;
    if (roll <= 0) {
      return drop;
    }
  }

  return drops[drops.length - 1] ?? null;
}

function createSkills() {
  return {
    woodcutting: { xp: 0, level: 1 },
    mining: { xp: 0, level: 1 },
    strength: { xp: 0, level: 1 },
    defense: { xp: 0, level: 1 },
    constitution: { xp: 0, level: 1 },
  };
}

function createInventory(maxSlots = INVENTORY_MAX_SLOTS) {
  return {
    maxSlots,
    slots: [],
  };
}

function createEquipment() {
  return {
    head: null,
    body: null,
    legs: null,
    hands: null,
    feet: null,
    offHand: null,
    mainHand: null,
    necklace: null,
    ring1: null,
    ring2: null,
    ring3: null,
    ring4: null,
    ring5: null,
  };
}

function createInventorySlot(itemDefinition, quantity = 1) {
  const gearDefinition = getGearDefinition(itemDefinition.id);
  return {
    itemId: itemDefinition.id,
    quantity,
    name: itemDefinition.name,
    stackable: itemDefinition.stackable,
    image: itemDefinition.image,
    examineText: itemDefinition.examineText,
    equipSlot: gearDefinition?.slot ?? null,
    gearStats: gearDefinition?.stats ?? null,
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
    slots.push(createInventorySlot(itemDefinition, quantity));
    return true;
  }

  for (let index = 0; index < quantity; index += 1) {
    slots.push(createInventorySlot(itemDefinition, 1));
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

function getPlayerGoldAmount(player) {
  return getInventoryItemCount(player, 'gold_coins');
}

function canSpendPlayerGold(player, amount) {
  const required = Math.max(0, Math.floor(Number(amount ?? 0)));
  return getPlayerGoldAmount(player) >= required;
}

function spendPlayerGold(player, amount) {
  const required = Math.max(0, Math.floor(Number(amount ?? 0)));
  if (required <= 0) {
    return true;
  }

  return removeItemFromInventory(player, 'gold_coins', required);
}

function addPlayerGold(player, amount) {
  const quantity = Math.max(0, Math.floor(Number(amount ?? 0)));
  if (quantity <= 0) {
    return true;
  }

  return addItemToInventory(player, 'gold_coins', quantity);
}

function rollMinionDrops(minionDefinition) {
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

        const nestedLootTableDefinition = getLootTableDefinition(nestedLootTableId);
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
      const quantity = randomIntBetween(scaledMin, scaledMax);
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

function applyMinionDropsToPlayer(player, minionDefinition) {
  const rolledDrops = rollMinionDrops(minionDefinition);
  if (rolledDrops.length === 0) {
    return {
      awardedDrops: [],
      lootTableDrops: [],
    };
  }

  const mergedDrops = new Map();
  const rolledLootTableDropsByItemId = new Map();
  for (const drop of rolledDrops) {
    const current = mergedDrops.get(drop.itemId) ?? 0;
    mergedDrops.set(drop.itemId, current + drop.quantity);

    const sourceLootTableId = String(drop.sourceLootTableId ?? '').trim();
    const sourceLootTableName = String(drop.sourceLootTableName ?? '').trim();
    if (!sourceLootTableId) {
      continue;
    }

    const itemList = rolledLootTableDropsByItemId.get(drop.itemId) ?? [];
    itemList.push({
      sourceLootTableId,
      sourceLootTableName,
      quantity: drop.quantity,
    });
    rolledLootTableDropsByItemId.set(drop.itemId, itemList);
  }

  const awardedDrops = [];
  const mergedLootTableDrops = new Map();
  for (const [itemId, quantity] of mergedDrops.entries()) {
    const added = addItemToInventory(player, itemId, quantity);
    if (!added) {
      continue;
    }

    const itemDefinition = getItemDefinition(itemId);
    awardedDrops.push({
      itemId,
      quantity,
      name: itemDefinition?.name ?? itemId,
    });

    const sourceLootTableDrops = rolledLootTableDropsByItemId.get(itemId) ?? [];
    for (const sourceDrop of sourceLootTableDrops) {
      const mergeKey = `${sourceDrop.sourceLootTableId}::${itemId}`;
      const currentMerged = mergedLootTableDrops.get(mergeKey);
      if (currentMerged) {
        currentMerged.quantity += sourceDrop.quantity;
      } else {
        mergedLootTableDrops.set(mergeKey, {
          sourceLootTableId: sourceDrop.sourceLootTableId,
          sourceLootTableName: sourceDrop.sourceLootTableName,
          itemId,
          itemName: itemDefinition?.name ?? itemId,
          quantity: sourceDrop.quantity,
        });
      }
    }
  }

  return {
    awardedDrops,
    lootTableDrops: Array.from(mergedLootTableDrops.values()),
  };
}

function toInventorySnapshot(inventory) {
  return {
    maxSlots: inventory.maxSlots,
    slots: inventory.slots.map((slot) => ({
      itemId: slot.itemId,
      quantity: slot.quantity,
      name: slot.name,
      stackable: slot.stackable,
      image: slot.image,
      examineText: slot.examineText,
      equipSlot: slot.equipSlot ?? null,
      gearStats: slot.gearStats ?? null,
    })),
  };
}

function toEquipmentSnapshot(equipment) {
  const snapshot = createEquipment();

  for (const slotName of EQUIPMENT_SLOTS) {
    const slot = equipment?.[slotName] ?? null;
    snapshot[slotName] = slot
      ? {
          itemId: slot.itemId,
          quantity: 1,
          name: slot.name,
          stackable: slot.stackable,
          image: slot.image,
          examineText: slot.examineText,
          equipSlot: slot.equipSlot ?? slotName,
          gearStats: slot.gearStats ?? null,
        }
      : null;
  }

  return snapshot;
}

function canAddItemToContainer(container, itemDefinition, quantity) {
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

function addItemToContainer(container, itemDefinition, quantity) {
  if (!canAddItemToContainer(container, itemDefinition, quantity)) {
    return false;
  }

  if (itemDefinition.stackable) {
    const existingSlot = container.slots.find((slot) => slot.itemId === itemDefinition.id);
    if (existingSlot) {
      existingSlot.quantity += quantity;
      return true;
    }

    container.slots.push(createInventorySlot(itemDefinition, quantity));
    return true;
  }

  for (let index = 0; index < quantity; index += 1) {
    container.slots.push(createInventorySlot(itemDefinition, 1));
  }

  return true;
}

function transferContainerSlot(source, destination, slotIndex, quantity) {
  const index = Math.floor(Number(slotIndex));
  if (!Number.isFinite(index) || index < 0 || index >= source.slots.length) {
    return null;
  }

  const sourceSlot = source.slots[index];
  if (!sourceSlot) {
    return null;
  }

  const itemDefinition = getItemDefinition(sourceSlot.itemId);
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

  const moved = addItemToContainer(destination, itemDefinition, transferQuantity);
  if (!moved) {
    return null;
  }

  return {
    quantity: transferQuantity,
    itemName: itemDefinition.name,
  };
}

function equipInventoryItem(player, slotIndex) {
  const index = Math.floor(Number(slotIndex));
  if (!Number.isFinite(index) || index < 0 || index >= player.inventory.slots.length) {
    return { ok: false, reason: 'Invalid inventory slot.' };
  }

  const sourceSlot = player.inventory.slots[index];
  if (!sourceSlot) {
    return { ok: false, reason: 'Item not found.' };
  }

  const gearDefinition = getGearDefinition(sourceSlot.itemId);
  if (!gearDefinition) {
    return { ok: false, reason: 'This item is not equippable.' };
  }

  const itemDefinition = getItemDefinition(sourceSlot.itemId);
  if (!itemDefinition) {
    return { ok: false, reason: 'Unknown item.' };
  }

  let targetSlot = gearDefinition.slot;

  if (targetSlot.startsWith('ring')) {
    const firstEmptyRingSlot = RING_EQUIPMENT_SLOTS.find((slotName) => !player.equipment[slotName]);
    if (!firstEmptyRingSlot) {
      return { ok: false, reason: 'All ring slots are full. Unequip a ring first.' };
    }

    targetSlot = firstEmptyRingSlot;
  }

  const currentlyEquipped = player.equipment[targetSlot];

  if (currentlyEquipped) {
    const equippedDefinition = getItemDefinition(currentlyEquipped.itemId);
    if (!equippedDefinition) {
      return { ok: false, reason: 'Equipped item is invalid.' };
    }

    if (!canAddItemToContainer(player.inventory, equippedDefinition, 1)) {
      return { ok: false, reason: 'No inventory space to swap equipment.' };
    }
  }

  if (sourceSlot.quantity > 1) {
    sourceSlot.quantity -= 1;
  } else {
    player.inventory.slots.splice(index, 1);
  }

  if (currentlyEquipped) {
    const equippedDefinition = getItemDefinition(currentlyEquipped.itemId);
    if (equippedDefinition) {
      addItemToContainer(player.inventory, equippedDefinition, 1);
    }
  }

  player.equipment[targetSlot] = createInventorySlot(itemDefinition, 1);
  applyPlayerMaxHpFromConstitution(player, true);
  return {
    ok: true,
    itemName: itemDefinition.name,
    slot: targetSlot,
  };
}

function useInventoryItem(player, slotIndex) {
  const index = Math.floor(Number(slotIndex));
  if (!Number.isFinite(index) || index < 0 || index >= player.inventory.slots.length) {
    return { ok: false, reason: 'Invalid inventory slot.' };
  }

  const sourceSlot = player.inventory.slots[index];
  if (!sourceSlot) {
    return { ok: false, reason: 'Item not found.' };
  }

  if (sourceSlot.itemId !== 'apple') {
    return { ok: false, reason: 'You cannot use that item.' };
  }

  if (player.hp >= player.maxHp) {
    return { ok: false, reason: 'You are already at full health.' };
  }

  const previousHp = player.hp;
  player.hp = Math.min(player.maxHp, player.hp + 20);
  const healedAmount = player.hp - previousHp;

  sourceSlot.quantity -= 1;
  if (sourceSlot.quantity <= 0) {
    player.inventory.slots.splice(index, 1);
  }

  player.lastActionText = `You eat an apple and restore ${healedAmount} HP.`;
  return {
    ok: true,
    itemName: sourceSlot.name,
    healedAmount,
  };
}

function unequipItem(player, slotName) {
  const resolvedSlot = String(slotName ?? '');
  if (!EQUIPMENT_SLOTS.includes(resolvedSlot)) {
    return { ok: false, reason: 'Invalid equipment slot.' };
  }

  const equipped = player.equipment[resolvedSlot];
  if (!equipped) {
    return { ok: false, reason: 'No item equipped there.' };
  }

  const itemDefinition = getItemDefinition(equipped.itemId);
  if (!itemDefinition) {
    player.equipment[resolvedSlot] = null;
    return { ok: false, reason: 'Equipped item is invalid.' };
  }

  if (!canAddItemToContainer(player.inventory, itemDefinition, 1)) {
    return { ok: false, reason: 'No inventory space to unequip.' };
  }

  player.equipment[resolvedSlot] = null;
  addItemToContainer(player.inventory, itemDefinition, 1);
  applyPlayerMaxHpFromConstitution(player, true);
  return {
    ok: true,
    itemName: itemDefinition.name,
    slot: resolvedSlot,
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

  if (skillName === 'constitution') {
    applyPlayerMaxHpFromConstitution(player, true);
  }

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

  const player = {
    id,
    displayName: createUniqueDisplayName(id),
    tileX: spawn.tileX,
    tileY: spawn.tileY,
    previousTraversedTileX: null,
    previousTraversedTileY: null,
    directionX: 0,
    directionY: 0,
    targetTileX: null,
    targetTileY: null,
    targetPath: [],
    activeInteractionNodeId: null,
    nextMoveAllowedAt: 0,
    nextInteractionAt: 0,
    nextCombatAt: 0,
    nextHpRegenAt: Date.now() + PLAYER_HP_REGEN_INTERVAL_MS,
    hp: PLAYER_BASE_HP,
    maxHp: PLAYER_BASE_HP,
    combatTargetEnemyId: null,
    activeBankNpcId: null,
    inventory: createInventory(),
    bank: createInventory(BANK_MAX_SLOTS),
    equipment: createEquipment(),
    skills: createSkills(),
    lastActionText: null,
    lastInputAt: Date.now(),
  };

  addPlayerGold(player, STARTING_GOLD);
  return player;
}

function cloneInventory(inventory, defaultMaxSlots = INVENTORY_MAX_SLOTS) {
  const maxSlots = Number(inventory?.maxSlots);
  const slots = Array.isArray(inventory?.slots) ? inventory.slots : [];
  const maxAllowedSlots = Math.max(defaultMaxSlots, BANK_MAX_SLOTS);
  const resolvedMaxSlots = Number.isFinite(maxSlots)
    ? Math.max(1, Math.min(maxAllowedSlots, Math.floor(maxSlots)))
    : defaultMaxSlots;

  const normalizedSlots = [];

  for (const slot of slots) {
    const itemId = String(slot?.itemId ?? '');
    const itemDefinition = getItemDefinition(itemId);
    const gearDefinition = getGearDefinition(itemId);
    const fallbackName = String(slot?.name ?? itemId ?? 'item');

    if (itemId.length === 0 || fallbackName.length === 0) {
      continue;
    }

    const quantity = Math.max(1, Math.floor(Number(slot?.quantity ?? 1)));
    const stackable = itemDefinition?.stackable ?? Boolean(slot?.stackable);
    const normalizedSlot = {
      itemId,
      quantity: 1,
      name: itemDefinition?.name ?? fallbackName,
      stackable,
      image: itemDefinition?.image ?? String(slot?.image ?? ''),
      examineText: itemDefinition?.examineText ?? getItemExamineText(itemId, fallbackName),
      equipSlot: gearDefinition?.slot ?? null,
      gearStats: gearDefinition?.stats ?? null,
    };

    if (stackable) {
      const existing = normalizedSlots.find((entry) => entry.itemId === itemId && entry.stackable);
      if (existing) {
        existing.quantity += quantity;
      } else {
        normalizedSlots.push({
          ...normalizedSlot,
          quantity,
        });
      }

      continue;
    }

    const availableSlots = Math.max(0, resolvedMaxSlots - normalizedSlots.length);
    const copiesToAdd = Math.min(quantity, availableSlots);
    for (let index = 0; index < copiesToAdd; index += 1) {
      normalizedSlots.push({
        ...normalizedSlot,
        quantity: 1,
      });
    }
  }

  return {
    maxSlots: resolvedMaxSlots,
    slots: normalizedSlots,
  };
}

function normalizePlayerContainersForCurrentItems(player) {
  player.inventory = cloneInventory(player.inventory, INVENTORY_MAX_SLOTS);
  player.bank = cloneInventory(player.bank, BANK_MAX_SLOTS);
  applyPlayerMaxHpFromConstitution(player, true);
}

function getPlayerGearBaseStatBonus(player, statName) {
  let total = 0;

  for (const slotName of EQUIPMENT_SLOTS) {
    const equipped = player?.equipment?.[slotName] ?? null;
    if (!equipped) {
      continue;
    }

    const value = Number(equipped?.gearStats?.baseStats?.[statName]);
    if (!Number.isFinite(value)) {
      continue;
    }

    total += value;
  }

  return total;
}

function getPlayerEffectiveConstitutionLevel(player) {
  const constitutionLevel = Math.max(1, Math.floor(Number(player?.skills?.constitution?.level ?? 1)));
  const gearConstitutionBonus = getPlayerGearBaseStatBonus(player, 'constitution');
  return Math.max(1, constitutionLevel + gearConstitutionBonus);
}

function getMaxHpForConstitutionLevel(constitutionLevel) {
  return PLAYER_BASE_HP + (constitutionLevel - 1) * PLAYER_HP_PER_CONSTITUTION_LEVEL;
}

function applyPlayerMaxHpFromConstitution(player, applyDelta = false) {
  const previousMaxHpRaw = Number(player?.maxHp);
  const previousMaxHp =
    Number.isFinite(previousMaxHpRaw) && previousMaxHpRaw > 0
      ? Math.floor(previousMaxHpRaw)
      : PLAYER_BASE_HP;
  const nextMaxHp = getMaxHpForConstitutionLevel(getPlayerEffectiveConstitutionLevel(player));
  const hpRaw = Number(player?.hp);
  const currentHp = Number.isFinite(hpRaw) ? Math.floor(hpRaw) : nextMaxHp;
  const nextHp = applyDelta
    ? currentHp + (nextMaxHp - previousMaxHp)
    : currentHp;

  player.maxHp = nextMaxHp;
  player.hp = Math.max(1, Math.min(nextMaxHp, nextHp));
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

function cloneEquipment(equipment) {
  const normalized = createEquipment();

  for (const slotName of EQUIPMENT_SLOTS) {
    const rawItem = equipment?.[slotName] ?? null;
    if (!rawItem || typeof rawItem !== 'object') {
      normalized[slotName] = null;
      continue;
    }

    const itemId = String(rawItem.itemId ?? '');
    const itemDefinition = getItemDefinition(itemId);
    const gearDefinition = getGearDefinition(itemId);
    const expectedSlot = String(gearDefinition?.slot ?? '');
    const isRingSlotMatch = expectedSlot.startsWith('ring') && slotName.startsWith('ring');
    const isCompatibleSlot = expectedSlot === slotName || isRingSlotMatch;
    if (!itemDefinition || !gearDefinition || !isCompatibleSlot) {
      normalized[slotName] = null;
      continue;
    }

    normalized[slotName] = createInventorySlot(itemDefinition, 1);
  }

  return normalized;
}

function sanitizePlayerProfile(rawProfile) {
  const inventory = cloneInventory(rawProfile?.inventory);
  const bank = cloneInventory(rawProfile?.bank, BANK_MAX_SLOTS);
  const equipment = cloneEquipment(rawProfile?.equipment);
  const skills = cloneSkills(rawProfile?.skills);
  skills.woodcutting.level = getLevelForXp(skills.woodcutting.xp);
  skills.mining.level = getLevelForXp(skills.mining.xp);
  skills.strength.level = getLevelForXp(skills.strength.xp);
  skills.defense.level = getLevelForXp(skills.defense.xp);
  skills.constitution.level = getLevelForXp(skills.constitution.xp);

  const tileX = Math.max(1, Math.min(WORLD_WIDTH_TILES - 2, Math.round(Number(rawProfile?.tileX ?? 40))));
  const tileY = Math.max(1, Math.min(WORLD_HEIGHT_TILES - 2, Math.round(Number(rawProfile?.tileY ?? 40))));
  const maxHp = Math.max(1, Math.floor(Number(rawProfile?.maxHp ?? PLAYER_BASE_HP)));
  const hp = Math.max(1, Math.min(maxHp, Math.floor(Number(rawProfile?.hp ?? maxHp))));

  const legacyGold = Math.max(0, Math.floor(Number(rawProfile?.gold ?? 0)));
  const hasCoinStack = inventory.slots.some((slot) => slot.itemId === 'gold_coins');
  if (!hasCoinStack && legacyGold > 0) {
    const goldItemDefinition = getItemDefinition('gold_coins');
    if (goldItemDefinition) {
      addItemToContainer(inventory, goldItemDefinition, legacyGold);
    }
  }

  return {
    displayName: String(rawProfile?.displayName ?? '').trim(),
    tileX,
    tileY,
    hp,
    maxHp,
    inventory,
    bank,
    equipment,
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
    inventory: player.inventory,
    bank: player.bank,
    equipment: player.equipment,
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
  player.previousTraversedTileX = safeProfile.tileX;
  player.previousTraversedTileY = safeProfile.tileY;
  player.hp = safeProfile.hp;
  player.maxHp = safeProfile.maxHp;
  player.inventory = cloneInventory(safeProfile.inventory);
  player.bank = cloneInventory(safeProfile.bank, BANK_MAX_SLOTS);
  player.equipment = cloneEquipment(safeProfile.equipment);
  player.skills = cloneSkills(safeProfile.skills);
  player.skills.woodcutting.level = getLevelForXp(player.skills.woodcutting.xp);
  player.skills.mining.level = getLevelForXp(player.skills.mining.xp);
  player.skills.strength.level = getLevelForXp(player.skills.strength.xp);
  player.skills.defense.level = getLevelForXp(player.skills.defense.xp);
  player.skills.constitution.level = getLevelForXp(player.skills.constitution.xp);
  applyPlayerMaxHpFromConstitution(player, true);
  player.nextHpRegenAt = Date.now() + PLAYER_HP_REGEN_INTERVAL_MS;
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

  const scaleDropList = (drops, lootMultiplier) =>
    drops.map((drop) => {
      if (drop.dropType === 'lootTable' || drop.lootTableId) {
        return {
          ...drop,
          dropType: 'lootTable',
          lootTableId: String(drop.lootTableId ?? ''),
        };
      }

      const scaledMin = Math.max(1, Math.floor(drop.quantity.min * lootMultiplier));
      const scaledMax = Math.max(scaledMin, Math.floor(drop.quantity.max * lootMultiplier));
      return {
        ...drop,
        dropType: 'item',
        quantity: {
          min: scaledMin,
          max: scaledMax,
        },
      };
    });

  for (const spawnDefinition of MINION_SPAWN_DEFINITIONS) {
    if (!isBaseWalkableTile(spawnDefinition.tileX, spawnDefinition.tileY)) {
      continue;
    }

    const minionDefinition = getMinionDefinition(spawnDefinition.minionTypeId);
    if (!minionDefinition) {
      continue;
    }

    const tier = Math.max(1, Math.floor(Number(spawnDefinition.tier ?? 1)));
    const tierDelta = Math.max(0, tier - 1);
    const tierScaling = minionDefinition.tierScaling ?? {
      statMultiplierPerTier: 0,
      lootMultiplierPerTier: 0,
    };
    const statMultiplier = 1 + (tierDelta * Number(tierScaling.statMultiplierPerTier ?? 0));
    const lootMultiplier = 1 + (tierDelta * Number(tierScaling.lootMultiplierPerTier ?? 0));
    const tierExamineText =
      minionDefinition?.tierExamineText?.[String(tier)] ?? minionDefinition.examineText;

    enemies.set(spawnDefinition.id, {
      ...minionDefinition,
      id: spawnDefinition.id,
      tier,
      maxHp: Math.max(1, Math.floor(minionDefinition.maxHp * statMultiplier)),
      attackDamageMin: Math.max(1, Math.floor(minionDefinition.attackDamageMin * statMultiplier)),
      attackDamageMax: Math.max(
        Math.floor(minionDefinition.attackDamageMin * statMultiplier),
        Math.floor(minionDefinition.attackDamageMax * statMultiplier),
      ),
      attackAccuracy: Math.max(1, Math.floor(minionDefinition.attackAccuracy * statMultiplier)),
      armor: Math.max(0, Math.floor(minionDefinition.armor * statMultiplier)),
      lootMultiplier,
      guaranteedDrops: scaleDropList(minionDefinition.guaranteedDrops, lootMultiplier),
      lootTable: scaleDropList(minionDefinition.lootTable, lootMultiplier),
      examineText: String(spawnDefinition.examineText ?? tierExamineText ?? minionDefinition.examineText),
      tileX: spawnDefinition.tileX,
      tileY: spawnDefinition.tileY,
      spawnTileX: spawnDefinition.tileX,
      spawnTileY: spawnDefinition.tileY,
      directionX: 0,
      directionY: 0,
      targetTileX: null,
      targetTileY: null,
      targetPath: [],
      nextMoveAllowedAt: 0,
      hp: minionDefinition.maxHp,
      maxHp: minionDefinition.maxHp,
      targetPlayerId: null,
      nextAttackAt: 0,
      nextHpRegenAt: Date.now() + minionDefinition.hpRegenIntervalMs,
      deadUntil: 0,
    });
  }

  return enemies;
}

function createWorldNodes() {
  const nodes = new Map();
  const definitions = [
    { id: 'tree-1', type: 'tree', resourceId: 'birch_tree', tileX: 35, tileY: 36, respawnMs: 5000 },
    { id: 'tree-2', type: 'tree', resourceId: 'oak_tree', tileX: 46, tileY: 35, respawnMs: 6500 },
    { id: 'rock-1', type: 'rock', resourceId: 'copper_rock', tileX: 34, tileY: 43, respawnMs: 6500 },
    { id: 'rock-3', type: 'rock', resourceId: 'tin_rock', tileX: 39, tileY: 44, respawnMs: 6500 },
    { id: 'rock-2', type: 'rock', resourceId: 'iron_rock', tileX: 45, tileY: 44, respawnMs: 7500 },
  ];

  for (const definition of definitions) {
    if (!isBaseWalkableTile(definition.tileX, definition.tileY)) {
      continue;
    }

    const resourceConfig = getHarvestResourceConfig(definition.resourceId, definition.type);
    const gatherIntervalMs = resourceConfig?.gatherIntervalMs ?? GATHER_INTERVAL_MS_DEFAULT;
    const hitsRemaining = resourceConfig ? rollDepletionHits(resourceConfig) : 1;

    nodes.set(definition.id, {
      ...definition,
      depletedUntil: 0,
      gatherIntervalMs,
      hitsRemaining,
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
    player.targetTileX === null &&
    player.targetTileY === null
  );
}

function isPlayerMoving(player) {
  return (
    player.targetTileX !== null ||
    player.targetTileY !== null ||
    player.directionX !== 0 ||
    player.directionY !== 0
  );
}

function getPlayerSkillActionBonuses(player, skillName) {
  let successChanceBonus = 0;
  let gatherIntervalMultiplier = 1;

  for (const slotName of EQUIPMENT_SLOTS) {
    const equipped = player.equipment?.[slotName] ?? null;
    if (!equipped) {
      continue;
    }

    const gearDefinition = getGearDefinition(equipped.itemId);
    const skillBonuses = gearDefinition?.skills?.[skillName] ?? null;
    if (!skillBonuses) {
      continue;
    }

    successChanceBonus += Number(skillBonuses.successChanceBonus ?? 0);
    const multiplier = Number(skillBonuses.gatherIntervalMultiplier ?? 1);
    if (Number.isFinite(multiplier) && multiplier > 0) {
      gatherIntervalMultiplier *= multiplier;
    }
  }

  return {
    successChanceBonus,
    gatherIntervalMultiplier,
  };
}

function getPlayerCombatBonuses(player) {
  let minDamageBonus = 0;
  let maxDamageBonus = 0;

  for (const slotName of EQUIPMENT_SLOTS) {
    const equipped = player.equipment?.[slotName] ?? null;
    if (!equipped) {
      continue;
    }

    const gearDefinition = getGearDefinition(equipped.itemId);
    if (!gearDefinition?.combat) {
      continue;
    }

    minDamageBonus += Math.floor(Number(gearDefinition.combat.minDamageBonus ?? 0));
    maxDamageBonus += Math.floor(Number(gearDefinition.combat.maxDamageBonus ?? 0));
  }

  return {
    minDamageBonus,
    maxDamageBonus,
  };
}

function getPlayerMeleeAccuracyRating(player) {
  const strengthLevel = Math.max(1, Math.floor(Number(player?.skills?.strength?.level ?? 1)));
  let total = 18 + strengthLevel * 2;

  for (const slotName of EQUIPMENT_SLOTS) {
    const equipped = player.equipment?.[slotName] ?? null;
    if (!equipped) {
      continue;
    }

    const weaponAccuracy = Number(equipped?.gearStats?.weaponProfile?.accuracy);
    if (Number.isFinite(weaponAccuracy)) {
      total += weaponAccuracy;
    }

    const armorMeleeAccuracy = Number(equipped?.gearStats?.armorProfile?.accuracy?.melee);
    if (Number.isFinite(armorMeleeAccuracy)) {
      total += armorMeleeAccuracy;
    }
  }

  return Math.max(1, Math.floor(total));
}

function getPlayerArmorRating(player) {
  const defenseLevel = Math.max(1, Math.floor(Number(player?.skills?.defense?.level ?? 1)));
  let total = defenseLevel * 3;

  for (const slotName of EQUIPMENT_SLOTS) {
    const equipped = player.equipment?.[slotName] ?? null;
    if (!equipped) {
      continue;
    }

    const armor = Number(equipped?.gearStats?.armorProfile?.armor);
    if (Number.isFinite(armor) && armor > 0) {
      total += armor;
    }
  }

  return Math.max(0, Math.floor(total));
}

function getCombatHitChance(
  attackerAccuracy,
  defenderArmor,
  affinityPct = COMBAT_PLAYER_BASE_AFFINITY_PCT,
  additiveModifierPct = 0,
) {
  const normalizedAccuracy = Math.max(1, Math.floor(Number(attackerAccuracy ?? 1)));
  const normalizedArmor = Math.max(1, Math.floor(Number(defenderArmor ?? 0)));
  const resolvedAffinityPct = Number.isFinite(Number(affinityPct)) ? Number(affinityPct) : 0;
  const resolvedAdditiveModifierPct =
    Number.isFinite(Number(additiveModifierPct)) ? Number(additiveModifierPct) : 0;
  const rawChancePct = (resolvedAffinityPct * (normalizedAccuracy / normalizedArmor)) + resolvedAdditiveModifierPct;
  const rawChance = rawChancePct / 100;
  return clamp(rawChance, COMBAT_HIT_CHANCE_MIN, COMBAT_HIT_CHANCE_MAX);
}

function getPlayerWeaponBaseDamageTotal(player) {
  let total = 0;

  for (const slotName of EQUIPMENT_SLOTS) {
    const equipped = player.equipment?.[slotName] ?? null;
    if (!equipped) {
      continue;
    }

    const baseDamage = Number(equipped?.gearStats?.weaponProfile?.baseDamage);
    if (!Number.isFinite(baseDamage) || baseDamage <= 0) {
      continue;
    }

    total += baseDamage;
  }

  return total;
}

function getPlayerAttackCooldownMs(player) {
  let attackRateSeconds = PLAYER_ATTACK_COOLDOWN_MS / 1000;

  for (const slotName of EQUIPMENT_SLOTS) {
    const equipped = player.equipment?.[slotName] ?? null;
    if (!equipped) {
      continue;
    }

    const weaponAttackRateSeconds = Number(equipped?.gearStats?.weaponProfile?.attackRateSeconds);
    if (!Number.isFinite(weaponAttackRateSeconds) || weaponAttackRateSeconds <= 0) {
      continue;
    }

    attackRateSeconds = Math.min(attackRateSeconds, weaponAttackRateSeconds);
  }

  return Math.max(250, Math.floor(attackRateSeconds * 1000));
}

function beginPlayerCombatTarget(player, enemyId, nowMs) {
  const isNewTarget = player.combatTargetEnemyId !== enemyId;
  player.combatTargetEnemyId = enemyId;

  if (isNewTarget) {
    player.nextCombatAt = nowMs + getPlayerAttackCooldownMs(player);
  }
}

function getPlayerEffectiveStrength(player) {
  const strengthLevel = Math.max(1, Math.floor(Number(player?.skills?.strength?.level ?? 1)));
  const gearStrengthBonus = getPlayerGearBaseStatBonus(player, 'strength');
  return Math.max(1, strengthLevel + gearStrengthBonus);
}

function processPlayerHealthRegeneration(player, nowMs) {
  if (player.hp >= player.maxHp) {
    player.nextHpRegenAt = nowMs + PLAYER_HP_REGEN_INTERVAL_MS;
    return;
  }

  if (!Number.isFinite(player.nextHpRegenAt) || player.nextHpRegenAt <= 0) {
    player.nextHpRegenAt = nowMs + PLAYER_HP_REGEN_INTERVAL_MS;
    return;
  }

  if (nowMs < player.nextHpRegenAt) {
    return;
  }

  const effectiveConstitution = getPlayerEffectiveConstitutionLevel(player);
  const constitutionBonus = Math.floor(effectiveConstitution * 0.2);
  const regenAmount = Math.max(1, 1 + constitutionBonus);

  player.hp = Math.min(player.maxHp, player.hp + regenAmount);
  player.nextHpRegenAt = nowMs + PLAYER_HP_REGEN_INTERVAL_MS;
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
        name: getItemDefinition(listing.itemId)?.name ?? listing.name,
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

function getBankNpcById(npcId) {
  return NPC_DEFINITIONS.bankChest.id === npcId ? NPC_DEFINITIONS.bankChest : null;
}

function sendBankSnapshotToSocket(socket, player) {
  socket.send(
    JSON.stringify({
      type: 'bankOpen',
      inventory: toInventorySnapshot(player.inventory),
      bank: toInventorySnapshot(player.bank),
    }),
  );
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
    const resourceDefinition = getResourceDefinition(node.resourceId);
    nodes[id] = {
      id,
      type: node.type,
      resourceId: node.resourceId,
      resourceName: resourceDefinition?.name ?? node.resourceId,
      resourceExamineText: resourceDefinition?.examineText ?? `It's a ${node.type}.`,
      resourceActionLabel:
        resourceDefinition?.actionLabel ?? (node.type === 'tree' ? 'Chop Tree' : 'Mine Rock'),
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
      nextCombatAt: client.player.nextCombatAt,
      activeInteractionNodeId: client.player.activeInteractionNodeId,
      gold: getPlayerGoldAmount(client.player),
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
        ...toInventorySnapshot(client.player.inventory),
      },
      equipment: toEquipmentSnapshot(client.player.equipment),
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

  player.previousTraversedTileX = player.tileX;
  player.previousTraversedTileY = player.tileY;
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

  if (
    Object.prototype.hasOwnProperty.call(entity, 'previousTraversedTileX') &&
    Object.prototype.hasOwnProperty.call(entity, 'previousTraversedTileY')
  ) {
    entity.previousTraversedTileX = entity.tileX;
    entity.previousTraversedTileY = entity.tileY;
  }

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
    player.lastActionText = `Out of range for ${getResourceName(node.resourceId, node.type)}`;
    return;
  }

  if (nowMs < player.nextInteractionAt) {
    return;
  }

  if (node.depletedUntil > nowMs) {
    const depletedConfig = getHarvestResourceConfig(node.resourceId, node.type);
    if (depletedConfig) {
      player.lastActionText = interpolateTemplate(depletedConfig.messages.depleted, {
        resourceName: getResourceName(depletedConfig.id, depletedConfig.id.replaceAll('_', ' ')),
      });
    } else {
      player.lastActionText = `${getResourceName(node.resourceId, node.type)} depleted`;
    }

    player.activeInteractionNodeId = null;
    return;
  }

  const resourceConfig = getHarvestResourceConfig(node.resourceId, node.type);
  if (!resourceConfig) {
    player.lastActionText = `No resource config for ${node.resourceId}`;
    return;
  }

  const playerSkill = player.skills[resourceConfig.skill];
  if (!playerSkill || playerSkill.level < resourceConfig.requiredLevel) {
    player.lastActionText = interpolateTemplate(resourceConfig.messages.locked, {
      requiredLevel: resourceConfig.requiredLevel,
    });
    player.activeInteractionNodeId = null;
    return;
  }

  if (!Number.isFinite(node.hitsRemaining) || node.hitsRemaining <= 0) {
    node.hitsRemaining = rollDepletionHits(resourceConfig);
  }

  const skillBonuses = getPlayerSkillActionBonuses(player, resourceConfig.skill);
  const playerSkillLevel = Math.max(
    1,
    Math.floor(Number(player.skills?.[resourceConfig.skill]?.level ?? 1)),
  );
  const levelDifference = Math.max(0, playerSkillLevel - resourceConfig.requiredLevel);
  const levelSuccessChanceBonus = Math.min(
    HARVEST_SUCCESS_CHANCE_BONUS_MAX,
    levelDifference * HARVEST_SUCCESS_CHANCE_BONUS_PER_LEVEL,
  );
  const adjustedSuccessChance = clamp01(
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
    player.lastActionText = interpolateTemplate(resourceConfig.messages.gatherFail, {
      resourceName: getResourceName(resourceConfig.id, resourceConfig.id.replaceAll('_', ' ')),
    });

    if (depletedAfterThisHit) {
      node.depletedUntil = nowMs + rollDepletionDurationMs(resourceConfig, node.respawnMs);
      node.hitsRemaining = rollDepletionHits(resourceConfig);
      player.activeInteractionNodeId = null;
    }

    return;
  }

  const selectedDrop = pickWeightedDrop(resourceConfig.drops);
  if (!selectedDrop) {
    player.lastActionText = 'No drop config for resource';
    return;
  }

  const rewardItem = getItemDefinition(selectedDrop.itemId);
  if (!rewardItem) {
    player.lastActionText = 'Invalid reward item config';
    return;
  }

  const rewardQuantity = randomIntBetween(selectedDrop.quantity.min, selectedDrop.quantity.max);

  const added = addItemToInventory(player, rewardItem.id, rewardQuantity);
  if (!added) {
    player.lastActionText = 'Inventory full';
    return;
  }

  const xpResult = addSkillXp(player, resourceConfig.skill, selectedDrop.xp);
  player.lastActionText = interpolateTemplate(resourceConfig.messages.success, {
    quantity: rewardQuantity,
    itemName: rewardItem.name.toLowerCase(),
    xp: selectedDrop.xp,
  });

  if (depletedAfterThisHit) {
    node.depletedUntil = nowMs + rollDepletionDurationMs(resourceConfig, node.respawnMs);
    node.hitsRemaining = rollDepletionHits(resourceConfig);
    player.activeInteractionNodeId = null;
  }

  if (xpResult?.leveledUp) {
    player.lastActionText = interpolateTemplate(resourceConfig.messages.levelUp, {
      level: xpResult.newLevel,
    });
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

  if (player.tileX === enemy.tileX && player.tileY === enemy.tileY) {
    const fallbackTileX = Number(player.previousTraversedTileX);
    const fallbackTileY = Number(player.previousTraversedTileY);
    const hasValidFallback =
      Number.isFinite(fallbackTileX) &&
      Number.isFinite(fallbackTileY) &&
      fallbackTileX >= 1 &&
      fallbackTileX <= WORLD_WIDTH_TILES - 2 &&
      fallbackTileY >= 1 &&
      fallbackTileY <= WORLD_HEIGHT_TILES - 2 &&
      isWalkableTile(fallbackTileX, fallbackTileY) &&
      (fallbackTileX !== enemy.tileX || fallbackTileY !== enemy.tileY);

    if (hasValidFallback) {
      player.tileX = fallbackTileX;
      player.tileY = fallbackTileY;
      player.targetTileX = null;
      player.targetTileY = null;
      player.targetPath = [];
      return;
    }

    if (player.targetTileX === null || player.targetTileY === null) {
      const adjacentTile = findBestAdjacentTileToTarget(player, enemy.tileX, enemy.tileY);
      if (adjacentTile) {
        setPathTarget(player, adjacentTile.tileX, adjacentTile.tileY);
      }
    }
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

  const playerAccuracy = getPlayerMeleeAccuracyRating(player);
  const enemyArmor = Math.max(0, Math.floor(Number(enemy.armor ?? ENEMY_ARMOR)));
  const hitChance = getCombatHitChance(
    playerAccuracy,
    enemyArmor,
    COMBAT_PLAYER_BASE_AFFINITY_PCT,
    COMBAT_PLAYER_HIT_MODIFIER_PCT,
  );
  if (Math.random() > hitChance) {
    player.nextCombatAt = nowMs + getPlayerAttackCooldownMs(player);
    player.lastActionText = `Your attack glances off ${enemy.name}'s armor.`;
    return;
  }

  const combatBonuses = getPlayerCombatBonuses(player);
  const weaponBaseDamageTotal = getPlayerWeaponBaseDamageTotal(player);
  const effectiveStrength = getPlayerEffectiveStrength(player);
  const strengthMaxHitBonus = Math.floor((effectiveStrength * weaponBaseDamageTotal) / 100);
  const attackMin = Math.max(1, PLAYER_ATTACK_DAMAGE_MIN + combatBonuses.minDamageBonus);
  const attackMax = Math.max(
    attackMin,
    PLAYER_ATTACK_DAMAGE_MAX + combatBonuses.maxDamageBonus + strengthMaxHitBonus,
  );
  const damage = randomIntBetween(attackMin, attackMax);
  enemy.hp = Math.max(0, enemy.hp - damage);
  player.nextCombatAt = nowMs + getPlayerAttackCooldownMs(player);

  addSkillXp(player, 'strength', STRENGTH_XP_PER_HIT);
  addSkillXp(player, 'constitution', CONSTITUTION_XP_PER_HIT);

  player.lastActionText = `You hit ${enemy.name} for ${damage}.`;

  if (enemy.hp <= 0) {
    const dropResult = applyMinionDropsToPlayer(player, enemy);
    const awardedDrops = dropResult.awardedDrops;
    enemy.deadUntil = nowMs + enemy.respawnMs;
    enemy.hp = 0;
    enemy.targetPlayerId = null;
    enemy.targetTileX = null;
    enemy.targetTileY = null;
    enemy.targetPath = [];
    enemy.nextMoveAllowedAt = nowMs;
    player.combatTargetEnemyId = null;
    if (awardedDrops.length > 0) {
      const dropSummary = awardedDrops
        .map((drop) => `${drop.quantity > 1 ? `${drop.quantity} ` : ''}${drop.name.toLowerCase()}`)
        .join(', ');
      player.lastActionText = `You defeated ${enemy.name}. Loot: ${dropSummary}.`;
    } else {
      player.lastActionText = `You defeated ${enemy.name}.`;
    }

    for (const client of clients.values()) {
      if (client.player.combatTargetEnemyId === enemy.id) {
        client.player.combatTargetEnemyId = null;
      }
    }

    const killerClient = clients.get(player.id);
    if (killerClient && dropResult.lootTableDrops.length > 0) {
      for (const lootTableDrop of dropResult.lootTableDrops) {
        const itemQuantityText = lootTableDrop.quantity > 1
          ? `${lootTableDrop.itemName} x${lootTableDrop.quantity}`
          : lootTableDrop.itemName;
        const lootTableName = String(
          lootTableDrop.sourceLootTableName || lootTableDrop.sourceLootTableId || 'Unknown',
        ).trim();
        sendChatToSocket(
          killerClient.socket,
          `[Loot] You got ${itemQuantityText} from the ${lootTableName} loot table!`,
        );
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
      enemy.nextHpRegenAt = nowMs + enemy.hpRegenIntervalMs;
    }

    if (enemy.hp < enemy.maxHp && nowMs >= enemy.nextHpRegenAt) {
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.hpRegenAmount);
      enemy.nextHpRegenAt = nowMs + enemy.hpRegenIntervalMs;
    }

    const distanceFromSpawn =
      Math.abs(enemy.tileX - enemy.spawnTileX) + Math.abs(enemy.tileY - enemy.spawnTileY);
    if (distanceFromSpawn > enemy.maxChaseDistanceTiles) {
      enemy.targetPlayerId = null;
      const shouldReturnToSpawn =
        enemy.targetTileX !== enemy.spawnTileX ||
        enemy.targetTileY !== enemy.spawnTileY ||
        enemy.targetPath.length === 0;
      if (shouldReturnToSpawn) {
        setPathTarget(enemy, enemy.spawnTileX, enemy.spawnTileY);
      }

      if (nowMs >= enemy.nextMoveAllowedAt) {
        const moveDelayMs = stepTowardTarget(enemy);
        if (moveDelayMs > 0) {
          enemy.nextMoveAllowedAt = nowMs + moveDelayMs;
        }
      }

      continue;
    }

    let targetEntry = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const [playerId, client] of clients.entries()) {
      if (client.player.hp <= 0) {
        continue;
      }

      const distance =
        Math.abs(client.player.tileX - enemy.tileX) + Math.abs(client.player.tileY - enemy.tileY);

      if (distance < bestDistance && distance <= enemy.aggroRangeTiles) {
        bestDistance = distance;
        targetEntry = { playerId, player: client.player };
      }
    }

    enemy.targetPlayerId = targetEntry?.playerId ?? null;
    if (!targetEntry) {
      const atSpawn = enemy.tileX === enemy.spawnTileX && enemy.tileY === enemy.spawnTileY;
      if (atSpawn) {
        enemy.targetTileX = null;
        enemy.targetTileY = null;
        enemy.targetPath = [];
        continue;
      }

      const shouldReturnToSpawn =
        enemy.targetTileX !== enemy.spawnTileX ||
        enemy.targetTileY !== enemy.spawnTileY ||
        enemy.targetPath.length === 0;
      if (shouldReturnToSpawn) {
        setPathTarget(enemy, enemy.spawnTileX, enemy.spawnTileY);
      }

      if (nowMs >= enemy.nextMoveAllowedAt) {
        const moveDelayMs = stepTowardTarget(enemy);
        if (moveDelayMs > 0) {
          enemy.nextMoveAllowedAt = nowMs + moveDelayMs;
        }
      }

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
        const isTargetingThisEnemy = targetPlayer.combatTargetEnemyId === enemy.id;
        const nonTargetOffenseMultiplier = isTargetingThisEnemy ? 1 : 2;
        const enemyAccuracy = Math.max(
          1,
          Math.floor(Number(enemy.attackAccuracy ?? ENEMY_ATTACK_ACCURACY) * nonTargetOffenseMultiplier),
        );
        const playerArmor = getPlayerArmorRating(targetPlayer);
        const hitChance = getCombatHitChance(
          enemyAccuracy,
          playerArmor,
          COMBAT_ENEMY_BASE_AFFINITY_PCT,
          COMBAT_ENEMY_HIT_MODIFIER_PCT,
        );
        const didHit = Math.random() <= hitChance;

        if (didHit) {
          const attackDamageMin = Math.max(
            1,
            Math.floor(enemy.attackDamageMin * nonTargetOffenseMultiplier),
          );
          const attackDamageMax = Math.max(
            attackDamageMin,
            Math.floor(enemy.attackDamageMax * nonTargetOffenseMultiplier),
          );
          const damage = randomIntBetween(attackDamageMin, attackDamageMax);
          targetPlayer.hp = Math.max(1, targetPlayer.hp - damage);
          addSkillXp(targetPlayer, 'defense', DEFENSE_XP_PER_HIT_TAKEN);
          targetPlayer.lastActionText = nonTargetOffenseMultiplier > 1
            ? `${enemy.name} crushes you for ${damage}.`
            : `${enemy.name} hits you for ${damage}.`;
        } else {
          targetPlayer.lastActionText = `You block ${enemy.name}'s attack with your armor.`;
        }

        enemy.nextAttackAt = nowMs + enemy.attackCooldownMs;

        if (!isPlayerMoving(targetPlayer) && !targetPlayer.combatTargetEnemyId) {
          targetPlayer.activeInteractionNodeId = null;
          beginPlayerCombatTarget(targetPlayer, enemy.id, nowMs);
          continue;
        }

        if (canAutoRetaliate(targetPlayer) && !targetPlayer.combatTargetEnemyId) {
          targetPlayer.activeInteractionNodeId = null;
          beginPlayerCombatTarget(targetPlayer, enemy.id, nowMs);
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
    normalizePlayerContainersForCurrentItems(client.player);
    stepPlayerIfPossible(client.player, now);
    processInteraction(client.player, now);
    processPlayerCombat(client.player, now);
    processPlayerHealthRegeneration(client.player, now);
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
      gold: getPlayerGoldAmount(player),
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
        ...toInventorySnapshot(player.inventory),
      },
      equipment: toEquipmentSnapshot(player.equipment),
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
        player.activeBankNpcId = null;

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
        player.activeBankNpcId = null;

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
        player.activeBankNpcId = null;

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
        const nowMs = Date.now();
        const enemyId = String(message.enemyId ?? '');
        const enemy = worldEnemies.get(enemyId);
        if (!enemy || enemy.deadUntil > nowMs) {
          return;
        }

        player.activeInteractionNodeId = null;
        player.activeBankNpcId = null;
        beginPlayerCombatTarget(player, enemy.id, nowMs);

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

      if (message.type === 'inventoryUse') {
        const result = useInventoryItem(player, message.slotIndex);
        if (!result.ok) {
          sendChatToSocket(socket, `[Inventory] ${result.reason}`);
          return;
        }

        sendChatToSocket(socket, `[Inventory] Ate ${result.itemName} and restored ${result.healedAmount} HP.`);
        return;
      }

      if (message.type === 'equipItem') {
        const result = equipInventoryItem(player, message.slotIndex);
        if (!result.ok) {
          sendChatToSocket(socket, `[Gear] ${result.reason}`);
          return;
        }

        player.lastActionText = `Equipped ${result.itemName}`;
        sendChatToSocket(socket, `[Gear] Equipped ${result.itemName}.`);
        return;
      }

      if (message.type === 'unequipItem') {
        const result = unequipItem(player, message.slot);
        if (!result.ok) {
          sendChatToSocket(socket, `[Gear] ${result.reason}`);
          return;
        }

        player.lastActionText = `Unequipped ${result.itemName}`;
        sendChatToSocket(socket, `[Gear] Unequipped ${result.itemName}.`);
        return;
      }

      if (message.type === 'npcTalk') {
        const npcId = String(message.npcId ?? '');
        const npc = Object.values(NPC_DEFINITIONS).find((entry) => entry.id === npcId) ?? null;
        if (!npc || !isWithinNpcRange(player, npc)) {
          return;
        }

        if (npc.type === 'bank_chest') {
          sendChatToSocket(socket, `[${npc.name}] Your valuables are safe inside.`);
          return;
        }

        sendChatToSocket(socket, `[${npc.name}] ${npc.talkText}`);
        return;
      }

      if (message.type === 'bankOpen') {
        const npcId = String(message.npcId ?? '');
        const bankNpc = getBankNpcById(npcId);
        if (!bankNpc || !isWithinNpcRange(player, bankNpc)) {
          sendChatToSocket(socket, '[Bank] You are too far away.');
          return;
        }

        player.activeBankNpcId = bankNpc.id;
        sendBankSnapshotToSocket(socket, player);
        return;
      }

      if (message.type === 'bankTransfer') {
        const from = message.from === 'bank' ? 'bank' : 'inventory';
        const to = message.to === 'bank' ? 'bank' : 'inventory';
        const slotIndex = message.slotIndex;
        const requestedQuantity = Number(message.quantity ?? 1);
        const quantity = Number.isFinite(requestedQuantity)
          ? Math.max(1, Math.floor(requestedQuantity))
          : 1;

        if (from === to) {
          return;
        }

        const activeBankNpc = player.activeBankNpcId
          ? getBankNpcById(player.activeBankNpcId)
          : null;
        if (!activeBankNpc || !isWithinNpcRange(player, activeBankNpc)) {
          player.activeBankNpcId = null;
          sendChatToSocket(socket, '[Bank] Move closer to the bank chest.');
          return;
        }

        const sourceContainer = from === 'bank' ? player.bank : player.inventory;
        const destinationContainer = to === 'bank' ? player.bank : player.inventory;
        const transferResult = transferContainerSlot(sourceContainer, destinationContainer, slotIndex, quantity);

        if (!transferResult) {
          sendChatToSocket(socket, '[Bank] Could not move that item.');
          return;
        }

        const quantityText = transferResult.quantity > 1 ? ` x${transferResult.quantity}` : '';
        player.lastActionText = `${from === 'inventory' ? 'Deposited' : 'Withdrew'} ${transferResult.itemName}${quantityText}`;
        sendBankSnapshotToSocket(socket, player);
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
        if (!canSpendPlayerGold(player, totalCost)) {
          sendChatToSocket(socket, '[Shop] Not enough gold.');
          return;
        }

        const added = addItemToInventory(player, listing.itemId, quantity);
        if (!added) {
          sendChatToSocket(socket, '[Shop] Not enough inventory space.');
          return;
        }

        spendPlayerGold(player, totalCost);
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
        addPlayerGold(player, totalGold);
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
