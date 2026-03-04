import { WebSocketServer } from 'ws';
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addSkillXp as addSkillXpFromSystem,
  getLevelForXp,
} from './systems/skillProgressionSystem.mjs';
import {
  addItemToContainer as addItemToContainerFromSystem,
  canAddItemToContainer as canAddItemToContainerFromSystem,
  transferContainerSlot as transferContainerSlotFromSystem,
} from './systems/inventorySystem.mjs';
import {
  createGroundItem,
  isGroundItemVisibleToPlayer as isGroundItemVisibleToPlayerFromSystem,
  processGroundItemLifecycle as processGroundItemLifecycleFromSystem,
  tryPickupGroundItem as tryPickupGroundItemFromSystem,
} from './systems/groundItemSystem.mjs';
import {
  applyMinionDropsToPlayer as applyMinionDropsToPlayerFromSystem,
} from './systems/minionDropSystem.mjs';
import { createServerSystems } from './systems/createServerSystems.mjs';
import { processEnemyAi as processEnemyAiFromSystem } from './systems/enemyAiSystem.mjs';
import { processInteraction as processInteractionFromSystem } from './systems/harvestingSystem.mjs';
import {
  performCraftingAtStation as performCraftingAtStationFromSystem,
  sendCraftingOpenToSocket as sendCraftingOpenToSocketFromSystem,
  toCraftingRecipeSnapshot as toCraftingRecipeSnapshotFromSystem,
} from './systems/craftingSystem.mjs';
import {
  buyFromShop,
  getShopOpenPayload,
  openBankForPlayer,
  sellToShop,
  transferBankItem,
} from './systems/commerceSystem.mjs';
import { processPlayerCombat as processPlayerCombatFromSystem } from './systems/playerCombatSystem.mjs';

const SERVER_PORT = Number(process.env.MULTIPLAYER_PORT ?? 2567);
const TILE_SIZE = 32;
const DEFAULT_WORLD_WIDTH_TILES = 80;
const DEFAULT_WORLD_HEIGHT_TILES = 80;
const PROFILE_COORDINATE_SPACE_VERSION = 2;
const QUEST_PROGRESS_VERSION = 2;
const NEW_PLAYER_SPAWN_LOCAL_TILE_X = 40;
const NEW_PLAYER_SPAWN_LOCAL_TILE_Y = 36;
let WORLD_WIDTH_TILES = DEFAULT_WORLD_WIDTH_TILES;
let WORLD_HEIGHT_TILES = DEFAULT_WORLD_HEIGHT_TILES;
const BROADCAST_RATE_MS = 100;
const TILE_STEP_INTERVAL_MS = 200;
const DIAGONAL_STEP_MULTIPLIER = 1.65;
const INTERACTION_RANGE_TILES = 1;
const MOVE_FALLBACK_SEARCH_RADIUS = 12;
const DEBUG_MULTIPLAYER =
  String(process.env.DEBUG_MULTIPLAYER ?? '').toLowerCase() === 'true';
const DEBUG_INTERACTION_TRACE =
  String(process.env.DEBUG_INTERACTION_TRACE ?? 'true').toLowerCase() === 'true';
const STATE_LOG_INTERVAL_MS = 2000;
const MAX_CHAT_MESSAGE_LENGTH = 120;
const WOODCUTTING_XP_PER_GATHER_DEFAULT = 22;
const MINING_XP_PER_GATHER_DEFAULT = 26;
const GATHER_INTERVAL_MS_DEFAULT = 1200;
const HARVEST_SUCCESS_CHANCE_BONUS_PER_LEVEL = 0.005;
const HARVEST_SUCCESS_CHANCE_BONUS_MAX = 0.3;
const HARVEST_HAND_SUCCESS_CHANCE_PENALTY = 0.08;
const HARVEST_HAND_GATHER_INTERVAL_MULTIPLIER = 1.2;
const HARVEST_CORRECT_TOOL_SUCCESS_CHANCE_BONUS = 0.05;
const HARVEST_CORRECT_TOOL_GATHER_INTERVAL_MULTIPLIER = 0.9;
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
const CRAFTING_PROGRESS_UPDATE_INTERVAL_MS = 120;
const DEBUG_CRAFTING_TRACE =
  String(process.env.DEBUG_CRAFTING_TRACE ?? 'true').toLowerCase() === 'true';
const COMBAT_PLAYER_BASE_AFFINITY_PCT = 55;
const COMBAT_ENEMY_BASE_AFFINITY_PCT = 55;
const COMBAT_PLAYER_HIT_MODIFIER_PCT = 0;
const COMBAT_ENEMY_HIT_MODIFIER_PCT = 0;
const COMBAT_HIT_CHANCE_MIN = 0.1;
const COMBAT_HIT_CHANCE_MAX = 0.95;
const GROUND_ITEM_LIFETIME_MS = 120000;
const GROUND_ITEM_OWNER_PRIORITY_MS = 60000;
const GROUND_ITEM_PICKUP_RANGE_TILES = 1;
const WATER_TILE_ID = 2;
const AUTH_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const MAX_AUTH_ATTEMPTS_PER_CONNECTION = 12;

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT_DIR = path.dirname(SERVER_DIR);
const PUBLIC_DIR = path.join(PROJECT_ROOT_DIR, 'public');
const DATA_DIR = path.join(SERVER_DIR, 'data');
const PLAYER_PROFILES_PATH = path.join(DATA_DIR, 'playerProfiles.json');
const ACCOUNTS_PATH = path.join(DATA_DIR, 'accounts.json');
const AUTH_SECRET_PATH = path.join(DATA_DIR, 'authSecret.txt');
const SKILL_DATA_DIR = path.join(DATA_DIR, 'skills');
const HARVESTING_SKILL_DATA_DIR = path.join(SKILL_DATA_DIR, 'harvesting');
const CRAFTING_SKILL_DATA_DIR = path.join(SKILL_DATA_DIR, 'crafting');
const COMBAT_SKILL_DATA_DIR = path.join(SKILL_DATA_DIR, 'combat');
const CONTENT_DATA_DIR = path.join(DATA_DIR, 'content');
const QUEST_DATA_DIR = path.join(DATA_DIR, 'quests');
const WORLD_MAP_PATH = path.join(PUBLIC_DIR, 'data', 'worldMap.json');
const WORLD_OBJECT_TYPES_PATH = path.join(PUBLIC_DIR, 'data', 'worldObjectTypes.json');
const TILE_TYPES_PATH = path.join(PUBLIC_DIR, 'data', 'tileTypes.json');
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

const DEFAULT_MINION_SPAWN_DEFINITIONS = [
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

const DEFAULT_WORLD_NODE_DEFINITIONS = [
  { id: 'tree-1', type: 'tree', resourceId: 'birch_tree', tileX: 35, tileY: 36, respawnMs: 5000 },
  { id: 'tree-2', type: 'tree', resourceId: 'oak_tree', tileX: 46, tileY: 35, respawnMs: 6500 },
  { id: 'rock-1', type: 'rock', resourceId: 'copper_rock', tileX: 34, tileY: 43, respawnMs: 6500 },
  { id: 'rock-3', type: 'rock', resourceId: 'tin_rock', tileX: 39, tileY: 44, respawnMs: 6500 },
  { id: 'rock-2', type: 'rock', resourceId: 'iron_rock', tileX: 45, tileY: 44, respawnMs: 7500 },
];

const DEFAULT_NPC_DEFINITIONS = [
  {
    id: 'npc-shopkeeper-bob',
    type: 'shopkeeper',
    name: 'Bob',
    tileX: 40,
    tileY: 40,
    examineText: 'A friendly general store shopkeeper.',
    talkText: 'Hello there! Need supplies or want to sell your goods?',
  },
];

const DEFAULT_OBJECT_DEFINITIONS = [
  {
    id: 'obj-bank-building',
    objectTypeId: 'bank_building',
    name: 'Bank building',
    tileX: 42,
    tileY: 37,
    blocksMovement: true,
    examineText: 'A sturdy building that houses the bank chest.',
  },
  {
    id: 'obj-bank-chest',
    objectTypeId: 'bank_chest',
    name: 'Bank chest',
    tileX: 42,
    tileY: 38,
    blocksMovement: true,
    examineText: 'A sturdy chest for secure item storage.',
  },
  {
    id: 'obj-smelting-station',
    objectTypeId: 'smelting_station',
    name: 'Smelting furnace',
    tileX: 39,
    tileY: 40,
    blocksMovement: true,
    examineText: 'A blazing furnace used to smelt ores into bars.',
  },
  {
    id: 'obj-smithing-station',
    objectTypeId: 'smithing_station',
    name: 'Smithing anvil',
    tileX: 41,
    tileY: 40,
    blocksMovement: true,
    examineText: 'A sturdy anvil for shaping bars into equipment.',
  },
  {
    id: 'obj-fletching-station',
    objectTypeId: 'fletching_station',
    name: 'Fletching bench',
    tileX: 43,
    tileY: 40,
    blocksMovement: true,
    examineText: 'A crafting bench for carving logs into bows and arrows.',
  },
];

function generateDefaultTerrainData() {
  const rows = [];

  for (let rowIndex = 0; rowIndex < WORLD_HEIGHT_TILES; rowIndex += 1) {
    const row = [];
    for (let columnIndex = 0; columnIndex < WORLD_WIDTH_TILES; columnIndex += 1) {
      const edgeDistance = Math.min(
        rowIndex,
        columnIndex,
        WORLD_HEIGHT_TILES - 1 - rowIndex,
        WORLD_WIDTH_TILES - 1 - columnIndex,
      );

      if (edgeDistance < 3) {
        row.push(2);
        continue;
      }

      if (edgeDistance < 5) {
        row.push(3);
        continue;
      }

      const onHorizontalRoad = rowIndex > 34 && rowIndex < 38;
      const onVerticalRoad = columnIndex > 38 && columnIndex < 42;
      if (onHorizontalRoad || onVerticalRoad) {
        row.push(1);
        continue;
      }

      row.push(0);
    }

    rows.push(row);
  }

  return rows;
}

function createDefaultWorldMapData() {
  return {
    version: 1,
    chunkX: 0,
    chunkY: 0,
    width: WORLD_WIDTH_TILES,
    height: WORLD_HEIGHT_TILES,
    terrain: generateDefaultTerrainData(),
    resources: DEFAULT_WORLD_NODE_DEFINITIONS.map((entry) => ({
      id: entry.id,
      nodeType: entry.type,
      resourceId: entry.resourceId,
      tileX: entry.tileX,
      tileY: entry.tileY,
      respawnMs: entry.respawnMs,
    })),
    monsters: DEFAULT_MINION_SPAWN_DEFINITIONS.map((entry) => ({
      id: entry.id,
      minionTypeId: entry.minionTypeId,
      tier: entry.tier,
      tileX: entry.tileX,
      tileY: entry.tileY,
    })),
    npcs: DEFAULT_NPC_DEFINITIONS.map((entry) => ({ ...entry })),
    objects: DEFAULT_OBJECT_DEFINITIONS.map((entry) => ({ ...entry })),
  };
}

function createFilledTerrainGrid(width, height, fill) {
  const safeWidth = Math.max(1, Math.floor(Number(width) || 1));
  const safeHeight = Math.max(1, Math.floor(Number(height) || 1));
  return Array.from({ length: safeHeight }, () => Array.from({ length: safeWidth }, () => fill));
}

function normalizeQuestStringList(rawList) {
  if (!Array.isArray(rawList)) {
    return [];
  }

  return Array.from(
    new Set(
      rawList
        .map((entry) => String(entry ?? '').trim())
        .filter((entry) => entry.length > 0),
    ),
  );
}

function normalizeQuestDialogue(rawQuest, title) {
  const missionText = String(rawQuest?.missionText ?? rawQuest?.summary ?? `Complete: ${title}`).trim();
  const startText = String(rawQuest?.startText ?? `I need help with ${title}.`).trim();
  const progressText = String(rawQuest?.progressText ?? 'Keep going, you are making progress.').trim();
  const completeText = String(rawQuest?.completeText ?? 'Excellent work. Here is your reward.').trim();

  return {
    missionText,
    startText,
    progressText,
    completeText,
  };
}

function normalizeQuestRequirementsV2(rawRequirements) {
  if (!rawRequirements || typeof rawRequirements !== 'object' || Array.isArray(rawRequirements)) {
    return null;
  }

  const requiredQuestIds = normalizeQuestStringList(rawRequirements.requiredQuestIds);
  const requiredSkillLevels = Array.isArray(rawRequirements.requiredSkillLevels)
    ? rawRequirements.requiredSkillLevels
      .map((entry) => ({
        skill: String(entry?.skill ?? '').trim(),
        level: Math.max(1, Math.floor(Number(entry?.level ?? 1))),
      }))
      .filter((entry) => entry.skill.length > 0)
    : [];
  const requiredItems = Array.isArray(rawRequirements.requiredItems)
    ? rawRequirements.requiredItems
      .map((entry) => ({
        itemId: String(entry?.itemId ?? '').trim(),
        quantity: Math.max(1, Math.floor(Number(entry?.quantity ?? 1))),
      }))
      .filter((entry) => entry.itemId.length > 0)
    : [];

  if (requiredQuestIds.length === 0 && requiredSkillLevels.length === 0 && requiredItems.length === 0) {
    return null;
  }

  return {
    ...(requiredQuestIds.length > 0 ? { requiredQuestIds } : {}),
    ...(requiredSkillLevels.length > 0 ? { requiredSkillLevels } : {}),
    ...(requiredItems.length > 0 ? { requiredItems } : {}),
  };
}

function normalizeQuestRewardsV2(rawRewards) {
  const rewardsSource = rawRewards && typeof rawRewards === 'object' && !Array.isArray(rawRewards)
    ? rawRewards
    : {};
  const gold = Math.max(0, Math.floor(Number(rewardsSource.gold ?? 0)));
  const items = Array.isArray(rewardsSource.items)
    ? rewardsSource.items
      .map((entry) => ({
        itemId: String(entry?.itemId ?? '').trim(),
        quantity: Math.max(1, Math.floor(Number(entry?.quantity ?? 1))),
      }))
      .filter((entry) => entry.itemId.length > 0)
    : [];

  const xp = Array.isArray(rewardsSource.xp)
    ? rewardsSource.xp
      .map((entry) => ({
        skill: String(entry?.skill ?? '').trim(),
        amount: Math.max(1, Math.floor(Number(entry?.amount ?? 1))),
      }))
      .filter((entry) => entry.skill.length > 0)
    : [];
  const unlockQuestIds = normalizeQuestStringList(rewardsSource.unlockQuestIds);

  return {
    ...(gold > 0 ? { gold } : {}),
    ...(items.length > 0 ? { items } : {}),
    ...(xp.length > 0 ? { xp } : {}),
    ...(unlockQuestIds.length > 0 ? { unlockQuestIds } : {}),
  };
}

function normalizeQuestObjectiveV2(rawObjective, index) {
  const normalizeConstraints = () => {
    const zoneId = String(rawObjective?.zoneId ?? '').trim();
    const timeLimitMsRaw = Number(rawObjective?.timeLimitMs);
    const requiredItems = Array.isArray(rawObjective?.requiredItems)
      ? rawObjective.requiredItems
        .map((entry) => ({
          itemId: String(entry?.itemId ?? '').trim(),
          quantity: Math.max(1, Math.floor(Number(entry?.quantity ?? 1))),
        }))
        .filter((entry) => entry.itemId.length > 0)
      : [];
    const requiredQuestIds = normalizeQuestStringList(rawObjective?.requiredQuestIds);

    return {
      ...(zoneId ? { zoneId } : {}),
      ...(Number.isFinite(timeLimitMsRaw) && timeLimitMsRaw > 0
        ? { timeLimitMs: Math.floor(timeLimitMsRaw) }
        : {}),
      ...(requiredItems.length > 0 ? { requiredItems } : {}),
      ...(requiredQuestIds.length > 0 ? { requiredQuestIds } : {}),
    };
  };

  const type = String(rawObjective?.type ?? '').trim();
  const baseCount = Math.max(1, Math.floor(Number(rawObjective?.count ?? 1)));
  const constraints = normalizeConstraints();

  if (type === 'kill') {
    const targetId = String(rawObjective?.targetId ?? '').trim();
    if (!targetId) {
      return null;
    }

    return {
      id: String(rawObjective?.id ?? `objective-${index + 1}`).trim() || `objective-${index + 1}`,
      type,
      targetId,
      count: baseCount,
      ...constraints,
    };
  }

  if (type === 'gather') {
    const itemId = String(rawObjective?.itemId ?? '').trim();
    if (!itemId) {
      return null;
    }

    return {
      id: String(rawObjective?.id ?? `objective-${index + 1}`).trim() || `objective-${index + 1}`,
      type,
      itemId,
      count: baseCount,
      ...constraints,
    };
  }

  if (type === 'delivery') {
    const itemId = String(rawObjective?.itemId ?? '').trim();
    const toNpcId = String(rawObjective?.toNpcId ?? '').trim();
    if (!itemId || !toNpcId) {
      return null;
    }

    return {
      id: String(rawObjective?.id ?? `objective-${index + 1}`).trim() || `objective-${index + 1}`,
      type,
      itemId,
      quantity: Math.max(1, Math.floor(Number(rawObjective?.quantity ?? 1))),
      toNpcId,
      ...constraints,
    };
  }

  if (type === 'travel') {
    const travelZoneId = String(rawObjective?.zoneId ?? '').trim();
    if (!travelZoneId) {
      return null;
    }

    const tileXRaw = Number(rawObjective?.tileX);
    const tileYRaw = Number(rawObjective?.tileY);
    const radiusRaw = Number(rawObjective?.radius);
    return {
      id: String(rawObjective?.id ?? `objective-${index + 1}`).trim() || `objective-${index + 1}`,
      type,
      zoneId: travelZoneId,
      ...(Number.isFinite(tileXRaw) ? { tileX: Math.floor(tileXRaw) } : {}),
      ...(Number.isFinite(tileYRaw) ? { tileY: Math.floor(tileYRaw) } : {}),
      ...(Number.isFinite(radiusRaw) ? { radius: Math.max(1, Math.floor(radiusRaw)) } : {}),
      ...(constraints.timeLimitMs != null ? { timeLimitMs: constraints.timeLimitMs } : {}),
      ...(constraints.requiredItems ? { requiredItems: constraints.requiredItems } : {}),
      ...(constraints.requiredQuestIds ? { requiredQuestIds: constraints.requiredQuestIds } : {}),
    };
  }

  if (type === 'item_retrieval') {
    const itemId = String(rawObjective?.itemId ?? '').trim();
    if (!itemId) {
      return null;
    }

    return {
      id: String(rawObjective?.id ?? `objective-${index + 1}`).trim() || `objective-${index + 1}`,
      type,
      itemId,
      quantity: Math.max(1, Math.floor(Number(rawObjective?.quantity ?? 1))),
      ...constraints,
    };
  }

  if (type === 'interact_object') {
    const objectTypeId = String(rawObjective?.objectTypeId ?? '').trim();
    const objectId = String(rawObjective?.objectId ?? '').trim();
    if (!objectTypeId && !objectId) {
      return null;
    }

    return {
      id: String(rawObjective?.id ?? `objective-${index + 1}`).trim() || `objective-${index + 1}`,
      type,
      ...(objectTypeId ? { objectTypeId } : {}),
      ...(objectId ? { objectId } : {}),
      ...(rawObjective?.count != null ? { count: baseCount } : {}),
      ...constraints,
    };
  }

  if (type === 'talk_to_npc') {
    const npcId = String(rawObjective?.npcId ?? '').trim();
    if (!npcId) {
      return null;
    }

    return {
      id: String(rawObjective?.id ?? `objective-${index + 1}`).trim() || `objective-${index + 1}`,
      type,
      npcId,
      ...constraints,
    };
  }

  return null;
}

function normalizeQuestStepsV2(rawSteps) {
  const normalizedSteps = Array.isArray(rawSteps)
    ? rawSteps
      .map((step, stepIndex) => {
        const objectives = Array.isArray(step?.objectives)
          ? step.objectives
            .map((objective, objectiveIndex) => normalizeQuestObjectiveV2(objective, objectiveIndex))
            .filter((entry) => entry !== null)
          : [];

        if (objectives.length === 0) {
          return null;
        }

        const stepId = String(step?.id ?? `step-${stepIndex + 1}`).trim() || `step-${stepIndex + 1}`;
        const description = String(step?.description ?? '').trim() || `Step ${stepIndex + 1}`;
        const completion = step?.completion === 'any' ? 'any' : 'all';

        return {
          id: stepId,
          description,
          objectives,
          completion,
        };
      })
      .filter((entry) => entry !== null)
    : [];

  return normalizedSteps;
}

function normalizeQuestDefinitionV2(rawQuest, fallbackQuestId, fallbackStartNpcId = null) {
  if (!rawQuest || typeof rawQuest !== 'object' || Array.isArray(rawQuest)) {
    return null;
  }

  const id = String(rawQuest.id ?? fallbackQuestId ?? '').trim();
  const title = String(rawQuest.title ?? '').trim();
  if (!id || !title) {
    return null;
  }

  const summary = String(rawQuest.summary ?? `Complete: ${title}`).trim() || `Complete: ${title}`;
  const startNpcId = String(rawQuest.startNpcId ?? fallbackStartNpcId ?? '').trim();
  const repeatable = Boolean(rawQuest.repeatable);
  const cooldownMs = Math.max(0, Math.floor(Number(rawQuest.cooldownMs ?? 0)));
  const requirements = normalizeQuestRequirementsV2(rawQuest.requirements);
  const steps = normalizeQuestStepsV2(rawQuest.steps);
  if (steps.length === 0) {
    return null;
  }

  const rewards = normalizeQuestRewardsV2(rawQuest.rewards);
  const chain = rawQuest.chain && typeof rawQuest.chain === 'object' && !Array.isArray(rawQuest.chain)
    ? {
      ...(normalizeQuestStringList(rawQuest.chain.nextQuestIds).length > 0
        ? { nextQuestIds: normalizeQuestStringList(rawQuest.chain.nextQuestIds) }
        : {}),
      ...(rawQuest.chain.autoStartNext != null
        ? { autoStartNext: Boolean(rawQuest.chain.autoStartNext) }
        : {}),
    }
    : null;
  const dialogue = normalizeQuestDialogue(rawQuest, title);

  return {
    version: 2,
    id,
    title,
    summary,
    ...(startNpcId ? { startNpcId } : {}),
    ...(repeatable ? { repeatable: true } : {}),
    ...(cooldownMs > 0 ? { cooldownMs } : {}),
    ...(requirements ? { requirements } : {}),
    steps,
    rewards,
    ...(chain && (Array.isArray(chain.nextQuestIds) || chain.autoStartNext != null) ? { chain } : {}),
    dialogue,
    missionText: dialogue.missionText,
    startText: dialogue.startText,
    progressText: dialogue.progressText,
    completeText: dialogue.completeText,
  };
}

function normalizeQuestZones(
  rawZones,
  worldWidth,
  worldHeight,
  options = {},
) {
  if (!Array.isArray(rawZones)) {
    return [];
  }

  const chunkWidth = Math.max(1, Math.floor(Number(options?.chunkWidth ?? worldWidth)));
  const chunkHeight = Math.max(1, Math.floor(Number(options?.chunkHeight ?? worldHeight)));
  const chunkZeroOriginTileX = Math.floor(Number(options?.chunkZeroOriginTileX ?? 0));
  const chunkZeroOriginTileY = Math.floor(Number(options?.chunkZeroOriginTileY ?? 0));

  return rawZones
    .map((zone, index) => {
      const id = String(zone?.id ?? `zone-${index + 1}`).trim();
      const name = String(zone?.name ?? id).trim() || id;
      const hasZoneChunkX = Number.isFinite(Number(zone?.chunkX));
      const hasZoneChunkY = Number.isFinite(Number(zone?.chunkY));
      const zoneChunkX = hasZoneChunkX ? Math.trunc(Number(zone?.chunkX)) : 0;
      const zoneChunkY = hasZoneChunkY ? Math.trunc(Number(zone?.chunkY)) : 0;
      const zoneOriginTileX = hasZoneChunkX
        ? chunkZeroOriginTileX + (zoneChunkX * chunkWidth)
        : chunkZeroOriginTileX;
      const zoneOriginTileY = hasZoneChunkY
        ? chunkZeroOriginTileY + (zoneChunkY * chunkHeight)
        : chunkZeroOriginTileY;
      const rects = Array.isArray(zone?.rects)
        ? zone.rects
          .map((rect) => {
            const x = Math.floor(Number(rect?.x ?? 0));
            const y = Math.floor(Number(rect?.y ?? 0));
            const width = Math.max(1, Math.floor(Number(rect?.width ?? 1)));
            const height = Math.max(1, Math.floor(Number(rect?.height ?? 1)));
            return {
              x: clamp(zoneOriginTileX + x, 0, Math.max(0, worldWidth - 1)),
              y: clamp(zoneOriginTileY + y, 0, Math.max(0, worldHeight - 1)),
              width,
              height,
            };
          })
          .filter((rect) => rect.width > 0 && rect.height > 0)
        : [];

      if (!id || rects.length === 0) {
        return null;
      }

      return {
        id,
        name,
        rects,
      };
    })
    .filter((zone) => zone !== null);
}

function normalizeWorldResourceEntry(entry, index, width, height, tileX, tileY) {
  const nodeType = String(entry?.nodeType ?? '').trim();
  const normalizedNodeType = nodeType === 'rock' ? 'rock' : 'tree';
  const resourceId = String(entry?.resourceId ?? '').trim();

  return {
    id: String(entry?.id ?? `resource-${index + 1}`),
    nodeType: normalizedNodeType,
    resourceId,
    image: String(entry?.image ?? '').trim(),
    tileX: clamp(Math.floor(Number(tileX ?? entry?.tileX ?? 0)), 0, width - 1),
    tileY: clamp(Math.floor(Number(tileY ?? entry?.tileY ?? 0)), 0, height - 1),
    respawnMs: Math.max(250, Math.floor(Number(entry?.respawnMs ?? 5000))),
  };
}

function normalizeWorldObjectEntry(entry, index, width, height, tileX, tileY) {
  const objectTypeId = String(entry?.objectTypeId ?? 'object');
  const hasRenderLayer = typeof entry?.renderLayer === 'string' && String(entry.renderLayer).trim().length > 0;

  return {
    id: String(entry?.id ?? `object-${index + 1}`),
    objectTypeId,
    name: String(entry?.name ?? `Object ${index + 1}`),
    tileX: clamp(Math.floor(Number(tileX ?? entry?.tileX ?? 0)), 0, width - 1),
    tileY: clamp(Math.floor(Number(tileY ?? entry?.tileY ?? 0)), 0, height - 1),
    blocksMovement: Boolean(entry?.blocksMovement),
    ...(hasRenderLayer ? { renderLayer: normalizeWorldObjectRenderLayer(entry?.renderLayer) } : {}),
    examineText: String(entry?.examineText ?? "It's an object."),
  };
}

function normalizeChunkWorldObjectEntry(entry, index, width, height, tileX, tileY) {
  const normalizedObject = normalizeWorldObjectEntry(entry, index, width, height, tileX, tileY);
  const nodeTypeRaw = String(entry?.nodeType ?? '').trim().toLowerCase();

  return {
    ...normalizedObject,
    resourceId: String(entry?.resourceId ?? '').trim(),
    nodeType: nodeTypeRaw === 'rock' ? 'rock' : 'tree',
    respawnMs: Math.max(250, Math.floor(Number(entry?.respawnMs ?? 5000))),
  };
}

function normalizeWorldMapData(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('World map must be an object. Expected map-editor worldMap.json format.');
  }

  if (!Array.isArray(raw?.chunks) || raw.chunks.length === 0) {
    throw new Error('World map must include a non-empty chunks array. Legacy map format is not supported.');
  }

  const rawChunkWidth = Math.floor(Number(raw?.chunkWidth ?? DEFAULT_WORLD_WIDTH_TILES));
  const rawChunkHeight = Math.floor(Number(raw?.chunkHeight ?? DEFAULT_WORLD_HEIGHT_TILES));
  const chunkWidth = Math.max(1, Number.isFinite(rawChunkWidth) ? rawChunkWidth : DEFAULT_WORLD_WIDTH_TILES);
  const chunkHeight = Math.max(1, Number.isFinite(rawChunkHeight) ? rawChunkHeight : DEFAULT_WORLD_HEIGHT_TILES);
  const validChunks = raw.chunks
    .map((entry) => {
      const chunkX = Number(entry?.chunkX);
      const chunkY = Number(entry?.chunkY);
      const terrain = entry?.terrain;
      const isTerrainValid =
        Array.isArray(terrain)
        && terrain.length === chunkHeight
        && terrain.every((row) => Array.isArray(row) && row.length === chunkWidth);

      if (!Number.isFinite(chunkX) || !Number.isFinite(chunkY) || !isTerrainValid) {
        return null;
      }

      return {
        chunkX: Math.trunc(chunkX),
        chunkY: Math.trunc(chunkY),
        terrain,
        worldObjects: Array.isArray(entry?.worldObjects) ? entry.worldObjects : null,
        monsters: Array.isArray(entry?.monsters) ? entry.monsters : [],
        npcs: Array.isArray(entry?.npcs) ? entry.npcs : [],
      };
    })
    .filter((entry) => entry !== null);

  if (validChunks.some((entry) => !Array.isArray(entry.worldObjects))) {
    throw new Error('World map chunks must include worldObjects arrays. Legacy resources/objects chunk format is not supported.');
  }

  if (validChunks.length === 0) {
    throw new Error('World map chunks are invalid. Ensure chunks contain chunkX, chunkY, and full terrain grids.');
  }

  const minChunkX = Math.min(...validChunks.map((entry) => entry.chunkX));
  const maxChunkX = Math.max(...validChunks.map((entry) => entry.chunkX));
  const minChunkY = Math.min(...validChunks.map((entry) => entry.chunkY));
  const maxChunkY = Math.max(...validChunks.map((entry) => entry.chunkY));
  const worldWidthTiles = (maxChunkX - minChunkX + 1) * chunkWidth;
  const worldHeightTiles = (maxChunkY - minChunkY + 1) * chunkHeight;
  const chunkZeroOriginTileX = (0 - minChunkX) * chunkWidth;
  const chunkZeroOriginTileY = (0 - minChunkY) * chunkHeight;
  const terrain = createFilledTerrainGrid(worldWidthTiles, worldHeightTiles, 0);

  const resources = [];
  const monsters = [];
  const npcs = [];
  const objects = [];

  for (const chunk of validChunks) {
    const chunkOriginTileX = (chunk.chunkX - minChunkX) * chunkWidth;
    const chunkOriginTileY = (chunk.chunkY - minChunkY) * chunkHeight;

    for (let localY = 0; localY < chunkHeight; localY += 1) {
      for (let localX = 0; localX < chunkWidth; localX += 1) {
        terrain[chunkOriginTileY + localY][chunkOriginTileX + localX] = Math.max(
          0,
          Math.floor(Number(chunk.terrain[localY][localX]) || 0),
        );
      }
    }

    const chunkWorldObjects = Array.isArray(chunk.worldObjects) ? chunk.worldObjects : [];

    for (const entry of chunkWorldObjects) {
      const globalTileX = chunkOriginTileX + Math.floor(Number(entry?.tileX ?? 0));
      const globalTileY = chunkOriginTileY + Math.floor(Number(entry?.tileY ?? 0));
      const worldObjectEntry = normalizeChunkWorldObjectEntry(
        entry,
        resources.length + objects.length,
        worldWidthTiles,
        worldHeightTiles,
        globalTileX,
        globalTileY,
      );
      const definition = getWorldObjectTypeDefinition(worldObjectEntry.objectTypeId);
      const behavior = definition?.behavior ?? 'decorative';
      const behaviorConfig =
        definition?.behaviorConfig && typeof definition.behaviorConfig === 'object' && !Array.isArray(definition.behaviorConfig)
          ? definition.behaviorConfig
          : {};

      if (behavior === 'harvestable') {
        const configResourceId = String(behaviorConfig.resourceId ?? '').trim();
        const resourceId = worldObjectEntry.resourceId || configResourceId || worldObjectEntry.objectTypeId;
        const configNodeType = String(behaviorConfig.nodeType ?? '').trim().toLowerCase() === 'rock' ? 'rock' : 'tree';
        const nodeType = String(worldObjectEntry.nodeType ?? '').trim().toLowerCase() === 'rock' ? 'rock' : configNodeType;
        const configRespawnMs = Number(behaviorConfig.respawnMs ?? 5000);

        resources.push(
          normalizeWorldResourceEntry(
            {
              id: worldObjectEntry.id,
              resourceId,
              nodeType,
              image: String(definition?.image ?? '').trim() || String(entry?.image ?? '').trim(),
              respawnMs: Number.isFinite(configRespawnMs) ? configRespawnMs : worldObjectEntry.respawnMs,
              tileX: worldObjectEntry.tileX,
              tileY: worldObjectEntry.tileY,
            },
            resources.length,
            worldWidthTiles,
            worldHeightTiles,
            worldObjectEntry.tileX,
            worldObjectEntry.tileY,
          ),
        );
        continue;
      }

      if (behavior !== 'npc') {
        objects.push(
          normalizeWorldObjectEntry(
            {
              id: worldObjectEntry.id,
              objectTypeId: worldObjectEntry.objectTypeId,
              name: worldObjectEntry.name || definition?.name || worldObjectEntry.objectTypeId,
              tileX: worldObjectEntry.tileX,
              tileY: worldObjectEntry.tileY,
              blocksMovement:
                typeof worldObjectEntry.blocksMovement === 'boolean'
                  ? worldObjectEntry.blocksMovement
                  : Boolean(definition?.blocksMovement),
              ...(typeof worldObjectEntry.renderLayer === 'string'
                ? { renderLayer: normalizeWorldObjectRenderLayer(worldObjectEntry.renderLayer) }
                : {}),
              examineText: worldObjectEntry.examineText || definition?.examineText || "It's an object.",
            },
            objects.length,
            worldWidthTiles,
            worldHeightTiles,
            worldObjectEntry.tileX,
            worldObjectEntry.tileY,
          ),
        );
      }
    }

    for (const entry of chunk.monsters) {
      const globalTileX = chunkOriginTileX + Math.floor(Number(entry?.tileX ?? 0));
      const globalTileY = chunkOriginTileY + Math.floor(Number(entry?.tileY ?? 0));
      monsters.push({
        id: String(entry?.id ?? `enemy-${monsters.length + 1}`),
        minionTypeId: String(entry?.minionTypeId ?? ''),
        tier: Math.max(1, Math.floor(Number(entry?.tier ?? 1))),
        tileX: clamp(globalTileX, 0, worldWidthTiles - 1),
        tileY: clamp(globalTileY, 0, worldHeightTiles - 1),
      });
    }

    for (const entry of chunk.npcs) {
      const globalTileX = chunkOriginTileX + Math.floor(Number(entry?.tileX ?? 0));
      const globalTileY = chunkOriginTileY + Math.floor(Number(entry?.tileY ?? 0));
      const npcId = String(entry?.id ?? `npc-${npcs.length + 1}`);
      const npcType = String(entry?.type ?? 'villager');
      if (npcType === 'bank_chest') {
        const bankObjectIdSource = npcId || `bank-chest-${objects.length + 1}`;
        const bankObjectId = bankObjectIdSource.startsWith('obj-')
          ? bankObjectIdSource
          : `obj-${bankObjectIdSource.replace(/^npc-/, '')}`;
        objects.push(
          normalizeWorldObjectEntry(
            {
              id: bankObjectId,
              objectTypeId: 'bank_chest',
              name: String(entry?.name ?? 'Bank chest'),
              tileX: clamp(globalTileX, 0, worldWidthTiles - 1),
              tileY: clamp(globalTileY, 0, worldHeightTiles - 1),
              blocksMovement: true,
              examineText: String(entry?.examineText ?? 'A sturdy chest for secure item storage.'),
            },
            objects.length,
            worldWidthTiles,
            worldHeightTiles,
            globalTileX,
            globalTileY,
          ),
        );
        continue;
      }

      npcs.push({
        id: npcId,
        type: npcType,
        name: String(entry?.name ?? `NPC ${npcs.length + 1}`),
        image: String(entry?.image ?? '').trim(),
        tileX: clamp(globalTileX, 0, worldWidthTiles - 1),
        tileY: clamp(globalTileY, 0, worldHeightTiles - 1),
        examineText: String(entry?.examineText ?? "It's someone."),
        talkText: String(entry?.talkText ?? 'Hello there.'),
        questStartIds: normalizeQuestStringList(entry?.questStartIds),
        shop:
          entry?.shop && typeof entry.shop === 'object' && !Array.isArray(entry.shop)
            ? {
                id: String(entry.shop.id ?? '').trim(),
                name: String(entry.shop.name ?? '').trim(),
                listings: Array.isArray(entry.shop.listings)
                  ? entry.shop.listings
                      .map((listing) => ({
                        itemId: String(listing?.itemId ?? '').trim(),
                        buyPrice: Math.max(0, Math.floor(Number(listing?.buyPrice ?? 0) || 0)),
                        sellPrice: Math.max(0, Math.floor(Number(listing?.sellPrice ?? 0) || 0)),
                      }))
                      .filter((listing) => listing.itemId.length > 0)
                  : [],
              }
            : null,
      });
    }

  }

  const questZones = normalizeQuestZones(raw?.questZones, worldWidthTiles, worldHeightTiles, {
    chunkWidth,
    chunkHeight,
    chunkZeroOriginTileX,
    chunkZeroOriginTileY,
  });

  return {
    version: Math.max(1, Math.floor(Number(raw?.version ?? 1))),
    chunkX: 0,
    chunkY: 0,
    chunkWidth,
    chunkHeight,
    chunkZeroOriginTileX,
    chunkZeroOriginTileY,
    width: worldWidthTiles,
    height: worldHeightTiles,
    terrain,
    resources,
    monsters,
    npcs,
    objects,
    questZones,
  };
}

function loadWorldMapData() {
  if (!existsSync(WORLD_MAP_PATH)) {
    throw new Error(`World map file is required and must be created by the map editor: ${WORLD_MAP_PATH}`);
  }

  const raw = loadRequiredJsonFile(WORLD_MAP_PATH);
  return normalizeWorldMapData(raw);
}

function normalizeTileBehaviorEntry(entry, index) {
  const tileId = Number(entry?.id);
  if (!Number.isFinite(tileId)) {
    throw new Error(`Tile types entry ${index} is missing a valid numeric id`);
  }

  const walkable = typeof entry?.walkable === 'boolean' ? entry.walkable : Math.floor(tileId) !== WATER_TILE_ID;
  const moveSpeedMultiplierRaw = Number(entry?.moveSpeedMultiplier ?? 1);
  const damagePerSecondRaw = Number(entry?.damagePerSecond ?? 0);

  return {
    id: Math.floor(tileId),
    walkable,
    moveSpeedMultiplier: Number.isFinite(moveSpeedMultiplierRaw)
      ? Math.max(0.1, Math.min(3, moveSpeedMultiplierRaw))
      : 1,
    damagePerSecond: Number.isFinite(damagePerSecondRaw)
      ? Math.max(0, Math.min(100, damagePerSecondRaw))
      : 0,
  };
}

function loadTileBehaviorDefinitions() {
  if (!existsSync(TILE_TYPES_PATH)) {
    return new Map([[WATER_TILE_ID, { id: WATER_TILE_ID, walkable: false, moveSpeedMultiplier: 1, damagePerSecond: 0 }]]);
  }

  const raw = loadRequiredJsonFile(TILE_TYPES_PATH);
  if (!Array.isArray(raw)) {
    throw new Error(`Tile types must be an array: ${TILE_TYPES_PATH}`);
  }

  const definitions = new Map();

  for (const [index, entry] of raw.entries()) {
    const normalized = normalizeTileBehaviorEntry(entry, index);
    definitions.set(normalized.id, normalized);
  }

  if (!definitions.size) {
    definitions.set(WATER_TILE_ID, { id: WATER_TILE_ID, walkable: false, moveSpeedMultiplier: 1, damagePerSecond: 0 });
  }

  return definitions;
}

function normalizeWorldObjectBehavior(value) {
  const behavior = String(value ?? '').trim().toLowerCase();
  if (
    behavior === 'harvestable'
    || behavior === 'station'
    || behavior === 'bank'
    || behavior === 'shop'
    || behavior === 'npc'
  ) {
    return behavior;
  }

  return 'decorative';
}

function normalizeWorldObjectRenderLayer(value) {
  const renderLayer = String(value ?? '').trim().toLowerCase();
  return renderLayer === 'foreground' ? 'foreground' : 'entity';
}

function loadWorldObjectTypeDefinitions() {
  if (!existsSync(WORLD_OBJECT_TYPES_PATH)) {
    return {};
  }

  const raw = loadRequiredJsonFile(WORLD_OBJECT_TYPES_PATH);
  if (!Array.isArray(raw)) {
    throw new Error(`World object types must be an array: ${WORLD_OBJECT_TYPES_PATH}`);
  }

  const definitions = {};

  for (const [index, entry] of raw.entries()) {
    const id = String(entry?.id ?? '').trim();
    if (!id) {
      throw new Error(`World object types entry ${index} is missing a valid id`);
    }

    if (definitions[id]) {
      throw new Error(`World object types has duplicate id '${id}'`);
    }

    definitions[id] = {
      id,
      name: String(entry?.name ?? id).trim() || id,
      behavior: normalizeWorldObjectBehavior(entry?.behavior),
      blocksMovement: Boolean(entry?.blocksMovement),
      renderLayer: normalizeWorldObjectRenderLayer(entry?.renderLayer),
      image: String(entry?.image ?? '').trim(),
      examineText: String(entry?.examineText ?? '').trim(),
      behaviorConfig:
        entry?.behaviorConfig && typeof entry.behaviorConfig === 'object' && !Array.isArray(entry.behaviorConfig)
          ? { ...entry.behaviorConfig }
          : {},
    };
  }

  return definitions;
}

const WORLD_OBJECT_TYPE_DEFINITIONS = loadWorldObjectTypeDefinitions();
const TILE_BEHAVIOR_DEFINITIONS = loadTileBehaviorDefinitions();

function getWorldObjectTypeDefinition(objectTypeId) {
  return WORLD_OBJECT_TYPE_DEFINITIONS[String(objectTypeId ?? '')] ?? null;
}

function getTileBehaviorForTileId(tileId) {
  const normalizedTileId = Math.max(0, Math.floor(Number(tileId) || 0));
  const behavior = TILE_BEHAVIOR_DEFINITIONS.get(normalizedTileId);
  if (behavior) {
    return behavior;
  }

  return {
    id: normalizedTileId,
    walkable: normalizedTileId !== WATER_TILE_ID,
    moveSpeedMultiplier: 1,
    damagePerSecond: 0,
  };
}

function getTileBehaviorAt(tileX, tileY) {
  const tileId = WORLD_MAP_DATA.terrain[tileY]?.[tileX];
  return getTileBehaviorForTileId(tileId);
}

const WORLD_MAP_DATA = loadWorldMapData();
WORLD_WIDTH_TILES = Math.max(1, Math.floor(Number(WORLD_MAP_DATA.width) || DEFAULT_WORLD_WIDTH_TILES));
WORLD_HEIGHT_TILES = Math.max(1, Math.floor(Number(WORLD_MAP_DATA.height) || DEFAULT_WORLD_HEIGHT_TILES));
const CHUNK_ZERO_ORIGIN_TILE_X = clamp(
  Math.floor(Number(WORLD_MAP_DATA.chunkZeroOriginTileX ?? 0)),
  0,
  Math.max(0, WORLD_WIDTH_TILES - 1),
);
const CHUNK_ZERO_ORIGIN_TILE_Y = clamp(
  Math.floor(Number(WORLD_MAP_DATA.chunkZeroOriginTileY ?? 0)),
  0,
  Math.max(0, WORLD_HEIGHT_TILES - 1),
);
const ORIGINAL_CHUNK_WIDTH_TILES = Math.max(
  1,
  Math.floor(Number(WORLD_MAP_DATA.chunkWidth ?? DEFAULT_WORLD_WIDTH_TILES)),
);
const ORIGINAL_CHUNK_HEIGHT_TILES = Math.max(
  1,
  Math.floor(Number(WORLD_MAP_DATA.chunkHeight ?? DEFAULT_WORLD_HEIGHT_TILES)),
);
const ORIGINAL_CHUNK_CENTER_TILE_X = clamp(
  CHUNK_ZERO_ORIGIN_TILE_X + Math.floor(ORIGINAL_CHUNK_WIDTH_TILES * 0.5),
  1,
  Math.max(1, WORLD_WIDTH_TILES - 2),
);
const ORIGINAL_CHUNK_CENTER_TILE_Y = clamp(
  CHUNK_ZERO_ORIGIN_TILE_Y + Math.floor(ORIGINAL_CHUNK_HEIGHT_TILES * 0.5),
  1,
  Math.max(1, WORLD_HEIGHT_TILES - 2),
);
const NEW_PLAYER_SPAWN_TILE_X = clamp(
  CHUNK_ZERO_ORIGIN_TILE_X + NEW_PLAYER_SPAWN_LOCAL_TILE_X,
  1,
  Math.max(1, WORLD_WIDTH_TILES - 2),
);
const NEW_PLAYER_SPAWN_TILE_Y = clamp(
  CHUNK_ZERO_ORIGIN_TILE_Y + NEW_PLAYER_SPAWN_LOCAL_TILE_Y,
  1,
  Math.max(1, WORLD_HEIGHT_TILES - 2),
);

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
      image: String(entry?.image ?? '').trim(),
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
const QUEST_DEFINITIONS_V2 = loadQuestDefinitionsV2();

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

function getQuestDefinitionV2(questId) {
  return QUEST_DEFINITIONS_V2[String(questId ?? '')] ?? null;
}

function resolveNpcQuestDefinition(entry) {
  const questStartIds = normalizeQuestStringList(entry?.questStartIds);

  for (const questId of questStartIds) {
    const loadedQuest = getQuestDefinitionV2(questId);
    if (loadedQuest) {
      return {
        ...loadedQuest,
        startNpcId: String(loadedQuest.startNpcId ?? entry?.id ?? '').trim() || undefined,
      };
    }
  }

  return null;
}

function getNpcQuestDefinitions(npc) {
  const questDefinitions = [];
  const seenQuestIds = new Set();
  const questStartIds = normalizeQuestStringList(npc?.questStartIds);

  for (const questId of questStartIds) {
    const loadedQuest = getQuestDefinitionV2(questId);
    if (!loadedQuest) {
      continue;
    }

    const safeQuestId = String(loadedQuest.id ?? '').trim();
    if (!safeQuestId || seenQuestIds.has(safeQuestId)) {
      continue;
    }

    seenQuestIds.add(safeQuestId);
    questDefinitions.push({
      ...loadedQuest,
      startNpcId: String(loadedQuest.startNpcId ?? npc?.id ?? '').trim() || undefined,
    });
  }

  const legacyQuest = npc?.quest ?? null;
  const legacyQuestId = String(legacyQuest?.id ?? '').trim();
  if (legacyQuest && legacyQuestId && !seenQuestIds.has(legacyQuestId)) {
    seenQuestIds.add(legacyQuestId);
    questDefinitions.push(legacyQuest);
  }

  return questDefinitions;
}

function selectNpcDialogueQuest(player, npc, requestedQuestId = '') {
  const quests = getNpcQuestDefinitions(npc);
  if (quests.length === 0) {
    return null;
  }

  const safeRequestedQuestId = String(requestedQuestId ?? '').trim();
  if (safeRequestedQuestId) {
    return quests.find((quest) => String(quest?.id ?? '').trim() === safeRequestedQuestId) ?? null;
  }

  const statusPriority = {
    completable: 0,
    not_started: 1,
    active: 2,
    locked: 3,
    completed: 4,
    none: 5,
  };

  let selectedQuest = quests[0];
  let bestPriority = Number.POSITIVE_INFINITY;
  for (const quest of quests) {
    const status = getNpcQuestStatus(player, quest);
    const priority = statusPriority[status] ?? statusPriority.none;
    if (priority < bestPriority) {
      bestPriority = priority;
      selectedQuest = quest;
      if (bestPriority === 0) {
        break;
      }
    }
  }

  return selectedQuest;
}

const NPC_DEFINITIONS = Object.fromEntries(
  WORLD_MAP_DATA.npcs.map((entry) => {
    const quest = resolveNpcQuestDefinition(entry);
    return [entry.id, {
      ...entry,
      quest,
    }];
  }),
);

function getNpcById(npcId) {
  return NPC_DEFINITIONS[String(npcId ?? '')] ?? null;
}

function getNpcByType(npcType) {
  return Object.values(NPC_DEFINITIONS).find((entry) => entry.type === npcType) ?? null;
}

const SHOPKEEPER_NPC = getNpcByType('shopkeeper');

const DEFAULT_GENERAL_STORE_LISTINGS = [
  { itemId: 'birch_logs', buyPrice: 10, sellPrice: 4 },
  { itemId: 'copper_ore', buyPrice: 16, sellPrice: 7 },
  { itemId: 'tin_ore', buyPrice: 16, sellPrice: 7 },
  { itemId: 'tinderbox', buyPrice: 20, sellPrice: 8 },
  { itemId: 'bronze_axe', buyPrice: 50, sellPrice: 22 },
  { itemId: 'bronze_pickaxe', buyPrice: 50, sellPrice: 22 },
  { itemId: 'bronze_helmet', buyPrice: 70, sellPrice: 30 },
  { itemId: 'bronze_platebody', buyPrice: 120, sellPrice: 52 },
  { itemId: 'bronze_platelegs', buyPrice: 95, sellPrice: 42 },
  { itemId: 'leather_gloves', buyPrice: 35, sellPrice: 15 },
  { itemId: 'leather_boots', buyPrice: 35, sellPrice: 15 },
  { itemId: 'wooden_shield', buyPrice: 55, sellPrice: 24 },
  { itemId: 'copper_amulet', buyPrice: 90, sellPrice: 39 },
  { itemId: 'copper_ring', buyPrice: 45, sellPrice: 19 },
  { itemId: 'apple', buyPrice: 5, sellPrice: 2 },
];

function normalizeShopListings(rawListings) {
  if (!Array.isArray(rawListings)) {
    return [];
  }

  return rawListings
    .map((listing) => {
      const itemId = String(listing?.itemId ?? '').trim();
      if (!itemId) {
        return null;
      }

      return {
        itemId,
        name: getItemDefinition(itemId)?.name ?? formatIdentifierForUi(itemId, 'Item'),
        buyPrice: Math.max(0, Math.floor(Number(listing?.buyPrice ?? 0) || 0)),
        sellPrice: Math.max(0, Math.floor(Number(listing?.sellPrice ?? 0) || 0)),
      };
    })
    .filter((entry) => entry !== null);
}

function buildShopDefinitions() {
  const shops = {};

  for (const npc of Object.values(NPC_DEFINITIONS)) {
    const rawShop = npc?.shop;
    if (!rawShop || typeof rawShop !== 'object') {
      continue;
    }

    const shopId = String(rawShop.id ?? '').trim() || `shop-${npc.id}`;
    const listings = normalizeShopListings(rawShop.listings);
    shops[shopId] = {
      id: shopId,
      npcId: npc.id,
      name: String(rawShop.name ?? '').trim() || `${npc.name}'s Shop`,
      listings,
    };
  }

  if (!Object.keys(shops).length && SHOPKEEPER_NPC) {
    const fallbackId = 'shop-general-store';
    shops[fallbackId] = {
      id: fallbackId,
      npcId: SHOPKEEPER_NPC.id,
      name: "Bob's General Store",
      listings: normalizeShopListings(DEFAULT_GENERAL_STORE_LISTINGS),
    };
  }

  return shops;
}

const SHOP_DEFINITIONS = buildShopDefinitions();

const CRAFTING_STATIONS = {
  smelting_station: {
    stationType: 'smelting_station',
    title: 'Smelting Furnace',
    recipeSkill: 'smelting',
    xpSkill: 'smithing',
  },
  smithing_station: {
    stationType: 'smithing_station',
    title: 'Smithing Anvil',
    recipeSkill: 'smithing',
    xpSkill: 'smithing',
  },
  fletching_station: {
    stationType: 'fletching_station',
    title: 'Fletching Bench',
    recipeSkill: 'fletching',
    xpSkill: 'fletching',
  },
};

function getCraftingStationByObjectType(objectTypeId) {
  const key = String(objectTypeId ?? '').trim();
  const worldObjectType = getWorldObjectTypeDefinition(key);
  const behavior = worldObjectType?.behavior;

  if (behavior === 'station') {
    const configuredStationType = String(worldObjectType?.behaviorConfig?.stationType ?? '').trim();
    const candidateKeys = [configuredStationType, `${configuredStationType}_station`, key];
    for (const candidateKey of candidateKeys) {
      if (candidateKey && CRAFTING_STATIONS[candidateKey]) {
        return CRAFTING_STATIONS[candidateKey];
      }
    }
  }

  return CRAFTING_STATIONS[key] ?? null;
}

const MINION_SPAWN_DEFINITIONS = WORLD_MAP_DATA.monsters;

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

function loadQuestDefinitionEntriesFromFile(raw, filePath) {
  if (Array.isArray(raw)) {
    return raw.map((entry, index) => ({
      fallbackId: `${path.basename(filePath, '.json')}-${index + 1}`,
      raw: entry,
    }));
  }

  return [
    {
      fallbackId: path.basename(filePath, '.json'),
      raw,
    },
  ];
}

function loadQuestDefinitionsV2() {
  if (!existsSync(QUEST_DATA_DIR)) {
    return {};
  }

  const map = {};
  const entries = readdirSync(QUEST_DATA_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name === 'schema.json') {
      continue;
    }

    const filePath = path.join(QUEST_DATA_DIR, entry.name);
    const raw = loadRequiredJsonFile(filePath);
    const fileDefinitions = loadQuestDefinitionEntriesFromFile(raw, filePath);

    for (const definition of fileDefinitions) {
      const normalized = normalizeQuestDefinitionV2(definition.raw, definition.fallbackId);
      if (!normalized) {
        throw new Error(`Invalid quest definition in ${filePath}`);
      }

      map[normalized.id] = normalized;
    }
  }

  return map;
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
    smelting: { xp: 0, level: 1 },
    smithing: { xp: 0, level: 1 },
    fletching: { xp: 0, level: 1 },
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
      applyQuestProgressEvent(player, {
        type: 'inventory_changed',
        itemId,
        amount: Math.max(1, Math.floor(Number(quantity ?? 1))),
      });
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
    applyQuestProgressEvent(player, {
      type: 'inventory_changed',
      itemId,
      amount: Math.max(1, Math.floor(Number(quantity ?? 1))),
    });
    return true;
  }

  for (let index = 0; index < quantity; index += 1) {
    slots.push(createInventorySlot(itemDefinition, 1));
  }

  applyQuestProgressEvent(player, {
    type: 'inventory_changed',
    itemId,
    amount: Math.max(1, Math.floor(Number(quantity ?? 1))),
  });

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
      applyQuestProgressEvent(player, {
        type: 'inventory_changed',
        itemId,
        amount: Math.max(1, Math.floor(Number(quantity ?? 1))),
      });
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
    itemId: slot.itemId,
    name: slot.name,
    quantity: removedQuantity,
  };
}

function dropItemToGround({
  itemId,
  quantity,
  tileX,
  tileY,
  ownerPlayerId = null,
  nowMs = Date.now(),
}) {
  const groundItem = createGroundItem(
    {
      itemId,
      quantity,
      tileX,
      tileY,
      ownerPlayerId,
      nowMs,
    },
    {
      getItemDefinition,
      clamp,
      randomUUID,
      worldWidthTiles: WORLD_WIDTH_TILES,
      worldHeightTiles: WORLD_HEIGHT_TILES,
      groundItemOwnerPriorityMs: GROUND_ITEM_OWNER_PRIORITY_MS,
      groundItemLifetimeMs: GROUND_ITEM_LIFETIME_MS,
    },
  );
  if (!groundItem) {
    return null;
  }

  worldGroundItems.set(groundItem.id, groundItem);
  return groundItem;
}

function isGroundItemVisibleToPlayer(groundItem, viewerPlayerId, nowMs) {
  return isGroundItemVisibleToPlayerFromSystem(groundItem, viewerPlayerId, nowMs);
}

function processGroundItemLifecycle(nowMs) {
  processGroundItemLifecycleFromSystem(worldGroundItems, nowMs);
}

function tryPickupGroundItem(player, groundItemId, nowMs) {
  return tryPickupGroundItemFromSystem(player, groundItemId, nowMs, {
    worldGroundItems,
    addItemToInventory,
    groundItemPickupRangeTiles: GROUND_ITEM_PICKUP_RANGE_TILES,
  });
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

function applyMinionDropsToPlayer(player, minionDefinition) {
  return applyMinionDropsToPlayerFromSystem(player, minionDefinition, {
    getLootTableDefinition,
    randomIntBetween,
    dropItemToGround,
    getItemDefinition,
    now: () => Date.now(),
  });
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
  return canAddItemToContainerFromSystem(container, itemDefinition, quantity);
}

function addItemToContainer(container, itemDefinition, quantity) {
  return addItemToContainerFromSystem(container, itemDefinition, quantity, {
    createInventorySlot,
  });
}

function transferContainerSlot(source, destination, slotIndex, quantity, options = {}) {
  return transferContainerSlotFromSystem(source, destination, slotIndex, quantity, {
    getItemDefinition,
    createInventorySlot,
    forceDestinationStacking: options?.forceDestinationStacking === true,
  });
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

function addSkillXp(player, skillName, xpAmount) {
  return addSkillXpFromSystem(player, skillName, xpAmount, {
    applyPlayerMaxHpFromConstitution,
  });
}

const clients = new Map();
const worldNodes = createWorldNodes();
const worldEnemies = createWorldEnemies();
const worldGroundItems = new Map();
let nextRouteIdSequence = 1;

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
    routeId: null,
    routeDestinationTileX: null,
    routeDestinationTileY: null,
    targetTileX: null,
    targetTileY: null,
    targetPath: [],
    activeInteractionNodeId: null,
    nextMoveAllowedAt: 0,
    nextInteractionAt: 0,
    nextCombatAt: 0,
    nextHpRegenAt: Date.now() + PLAYER_HP_REGEN_INTERVAL_MS,
    terrainDamageCarry: 0,
    hp: PLAYER_BASE_HP,
    maxHp: PLAYER_BASE_HP,
    combatTargetEnemyId: null,
    activeBankObjectId: null,
    activeCraftingObjectId: null,
    activeCraftingStationType: null,
    activeCraftingJob: null,
    inventory: createInventory(),
    bank: createInventory(BANK_MAX_SLOTS),
    equipment: createEquipment(),
    skills: createSkills(),
    quests: sanitizeQuestProgress(null),
    questJournalSelectedQuestId: null,
    lastActionText: null,
    lastInputAt: Date.now(),
  };

  addPlayerGold(player, STARTING_GOLD);
  return player;
}

function hasRequiredItemsForCraftingRecipe(player, recipe) {
  for (const input of Array.isArray(recipe?.inputs) ? recipe.inputs : []) {
    const quantity = Math.max(1, Math.floor(Number(input.quantity ?? 1)));
    if (getInventoryItemCount(player, input.itemId) < quantity) {
      return false;
    }
  }

  return true;
}

function canReceiveCraftingRecipeOutputs(player, recipe) {
  const projectedInventory = cloneInventory(player.inventory, INVENTORY_MAX_SLOTS);

  for (const input of Array.isArray(recipe?.inputs) ? recipe.inputs : []) {
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

  for (const output of Array.isArray(recipe?.outputs) ? recipe.outputs : []) {
    const itemDefinition = getItemDefinition(output.itemId);
    if (!itemDefinition) {
      return false;
    }

    const quantity = Math.max(1, Math.floor(Number(output.quantity ?? 1)));
    if (!canAddItemToContainer(projectedInventory, itemDefinition, quantity)) {
      return false;
    }

    addItemToContainer(projectedInventory, itemDefinition, quantity);
  }

  return true;
}

function getMaxCraftableCountForRecipe(player, recipe, requestedCount = 1) {
  const maxAttempts = Math.max(1, Math.min(28, Math.floor(Number(requestedCount ?? 1))));
  const projectedInventory = cloneInventory(player.inventory, INVENTORY_MAX_SLOTS);
  let craftableCount = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let hasAllInputs = true;

    for (const input of Array.isArray(recipe?.inputs) ? recipe.inputs : []) {
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
        hasAllInputs = false;
        break;
      }
    }

    if (!hasAllInputs) {
      break;
    }

    let canReceiveAllOutputs = true;
    for (const output of Array.isArray(recipe?.outputs) ? recipe.outputs : []) {
      const itemDefinition = getItemDefinition(output.itemId);
      if (!itemDefinition) {
        return craftableCount;
      }

      const outputQuantity = Math.max(1, Math.floor(Number(output.quantity ?? 1)));
      if (!canAddItemToContainer(projectedInventory, itemDefinition, outputQuantity)) {
        canReceiveAllOutputs = false;
        break;
      }

      addItemToContainer(projectedInventory, itemDefinition, outputQuantity);
    }

    if (!canReceiveAllOutputs) {
      break;
    }

    craftableCount += 1;
  }

  return craftableCount;
}

function resolveCraftingRequest(stationType, recipeId) {
  const station = CRAFTING_STATIONS[String(stationType ?? '')] ?? null;
  if (!station) {
    return null;
  }

  const config = CRAFTING_SKILL_CONFIGS[station.recipeSkill];
  if (!config || !Array.isArray(config.recipes)) {
    return null;
  }

  const recipe = config.recipes.find((entry) => String(entry.id) === String(recipeId ?? '')) ?? null;
  if (!recipe) {
    return null;
  }

  return {
    station,
    recipe,
    snapshot: toCraftingRecipeSnapshotFromSystem(recipe, {
      clamp01,
      getItemDefinition,
    }),
  };
}

function sendCraftingProgressToPlayer(player) {
  const client = clients.get(player.id);
  if (!client || client.socket.readyState !== 1) {
    return;
  }

  const job = player.activeCraftingJob;
  if (!job) {
    client.socket.send(
      JSON.stringify({
        type: 'craftingProgress',
        active: false,
      }),
    );
    return;
  }

  const now = Date.now();
  const durationMs = Math.max(1, Math.floor(Number(job.durationMs ?? 1000)));
  const cycleRemainingMs = Math.max(0, Math.floor(Number(job.currentCraftEndsAt ?? now) - now));
  const cycleProgress = 1 - cycleRemainingMs / durationMs;

  client.socket.send(
    JSON.stringify({
      type: 'craftingProgress',
      active: true,
      objectId: job.objectId,
      stationType: job.stationType,
      recipeId: job.recipeId,
      recipeName: job.recipeName,
      durationMs,
      totalCount: job.totalCount,
      completedCount: job.completedCount,
      cycleStartedAt: job.currentCraftStartedAt,
      cycleEndsAt: job.currentCraftEndsAt,
      cycleRemainingMs,
      cycleProgress: clamp01(cycleProgress, 0),
    }),
  );
}

function sendCraftingDebugToPlayer(player, text) {
  if (!DEBUG_CRAFTING_TRACE) {
    return;
  }

  const message = String(text ?? '').trim();
  if (!message) {
    return;
  }

  console.log(
    JSON.stringify({
      scope: 'crafting-debug',
      playerId: String(player?.id ?? ''),
      message,
      at: new Date().toISOString(),
    }),
  );
}

function clearActiveCraftingJob(player) {
  if (!player.activeCraftingJob) {
    return;
  }

  player.activeCraftingJob = null;
  sendCraftingProgressToPlayer(player);
}

function clearActiveCraftingContext(player) {
  player.activeCraftingObjectId = null;
  player.activeCraftingStationType = null;
  clearActiveCraftingJob(player);
}

function processActiveCrafting(player, now) {
  const job = player.activeCraftingJob;
  if (!job) {
    return;
  }

  const client = clients.get(player.id);
  const socket = client?.socket;
  if (!socket || socket.readyState !== 1) {
    clearActiveCraftingJob(player);
    return;
  }

  const objectEntry = WORLD_MAP_DATA.objects.find((entry) => entry.id === job.objectId) ?? null;
  if (!objectEntry) {
    sendChatToSocket(socket, '[Crafting] That workstation could not be found.');
    clearActiveCraftingJob(player);
    return;
  }

  if (!isWithinRange(player.tileX, player.tileY, objectEntry.tileX, objectEntry.tileY, INTERACTION_RANGE_TILES)) {
    sendChatToSocket(socket, '[Crafting] Crafting stopped. Move closer to the workstation.');
    clearActiveCraftingJob(player);
    return;
  }

  if (now < Number(job.currentCraftEndsAt ?? 0)) {
    const remainingMs = Math.max(0, Number(job.currentCraftEndsAt ?? now) - now);
    if (now >= Number(job.nextDebugAt ?? 0)) {
      job.nextDebugAt = now + 500;
      sendCraftingDebugToPlayer(
        player,
        `waiting recipe=${job.recipeId} durationMs=${job.durationMs} startedAt=${job.currentCraftStartedAt} endsAt=${job.currentCraftEndsAt} now=${now} remainingMs=${remainingMs}`,
      );
    }

    if (now >= Number(job.nextProgressAt ?? 0)) {
      job.nextProgressAt = now + CRAFTING_PROGRESS_UPDATE_INTERVAL_MS;
      sendCraftingProgressToPlayer(player);
    }
    return;
  }

  sendCraftingDebugToPlayer(
    player,
    `executing recipe=${job.recipeId} now=${now} endsAt=${job.currentCraftEndsAt} elapsedMs=${Math.max(0, now - Number(job.currentCraftStartedAt ?? now))}`,
  );

  const craftResult = performCraftingAtStation(player, job.stationType, job.recipeId, 1);
  if (!craftResult.ok || Number(craftResult.craftedCount ?? 0) <= 0) {
    const reason = String(craftResult.reason ?? 'You do not have the required materials.');
    const completedCount = Math.max(0, Math.floor(Number(job.completedCount ?? 0)));
    if (completedCount > 0) {
      sendChatToSocket(
        socket,
        `[Crafting] Crafted ${job.recipeName} x${completedCount}, then stopped: ${reason}`,
      );
      player.lastActionText = `Crafted ${job.recipeName}`;
    } else {
      sendChatToSocket(socket, `[Crafting] ${reason}`);
    }

    sendCraftingDebugToPlayer(
      player,
      `stopped ok=${Boolean(craftResult.ok)} craftedCount=${Number(craftResult.craftedCount ?? 0)} reason=${reason}`,
    );

    clearActiveCraftingJob(player);
    return;
  }

  job.completedCount += 1;

  applyQuestProgressEvent(player, {
    type: 'interact_object',
    objectId: objectEntry.id,
    objectTypeId: objectEntry.objectTypeId,
    tileX: player.tileX,
    tileY: player.tileY,
    amount: 1,
  });

  if (job.completedCount >= job.totalCount) {
    player.lastActionText = `Crafted ${job.recipeName}`;
    const station = getCraftingStationByObjectType(objectEntry.objectTypeId);
    if (station) {
      sendCraftingOpenToSocket(socket, player, station, objectEntry.id);
    }
    const totalElapsedMs = Math.max(0, now - Number(job.startedAt ?? job.currentCraftStartedAt ?? now));
    sendChatToSocket(
      socket,
      `[Crafting] Crafted ${job.recipeName} x${job.completedCount} in ${(totalElapsedMs / 1000).toFixed(1)}s.`,
    );
    sendCraftingDebugToPlayer(
      player,
      `complete recipe=${job.recipeId} completed=${job.completedCount}/${job.totalCount} totalElapsedMs=${totalElapsedMs}`,
    );
    clearActiveCraftingJob(player);
    return;
  }

  const station = getCraftingStationByObjectType(objectEntry.objectTypeId);
  if (station) {
    sendCraftingOpenToSocket(socket, player, station, objectEntry.id);
  }

  job.currentCraftStartedAt = now;
  job.currentCraftEndsAt = now + job.durationMs;
  job.nextProgressAt = now;
  job.nextDebugAt = now;
  sendCraftingDebugToPlayer(
    player,
    `next-cycle recipe=${job.recipeId} completed=${job.completedCount}/${job.totalCount} nextEndsAt=${job.currentCraftEndsAt} durationMs=${job.durationMs}`,
  );
  sendCraftingProgressToPlayer(player);
}

function createRouteId() {
  const routeId = `route-${nextRouteIdSequence}`;
  nextRouteIdSequence += 1;
  if (nextRouteIdSequence > Number.MAX_SAFE_INTEGER - 1) {
    nextRouteIdSequence = 1;
  }

  return routeId;
}

function cloneInventory(inventory, defaultMaxSlots = INVENTORY_MAX_SLOTS, options = {}) {
  const forceStacking = options?.forceStacking === true;
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
    const stackable = forceStacking
      ? true
      : (itemDefinition?.stackable ?? Boolean(slot?.stackable));
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
  player.bank = cloneInventory(player.bank, BANK_MAX_SLOTS, { forceStacking: true });
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
  const smeltingXp = Number(skills?.smelting?.xp ?? 0);
  const smithingXp = Number(skills?.smithing?.xp ?? 0);
  const fletchingXp = Number(skills?.fletching?.xp ?? 0);
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
    smelting: {
      xp: Math.max(0, Math.floor(Number.isFinite(smeltingXp) ? smeltingXp : 0)),
      level: 1,
    },
    smithing: {
      xp: Math.max(0, Math.floor(Number.isFinite(smithingXp) ? smithingXp : 0)),
      level: 1,
    },
    fletching: {
      xp: Math.max(0, Math.floor(Number.isFinite(fletchingXp) ? fletchingXp : 0)),
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

function sanitizeQuestProgress(rawQuestProgress) {
  const activeRaw = rawQuestProgress?.active;
  const completedRaw = rawQuestProgress?.completed;

  const active = {};
  if (activeRaw && typeof activeRaw === 'object') {
    for (const [questId, value] of Object.entries(activeRaw)) {
      const normalizedQuestId = String(questId ?? '').trim();
      if (!normalizedQuestId) {
        continue;
      }

      const stepIndex = Math.max(0, Math.floor(Number(value?.stepIndex ?? 0)));
      const objectiveCountsRaw = value?.objectiveCounts;
      const objectiveCounts = {};

      if (objectiveCountsRaw && typeof objectiveCountsRaw === 'object') {
        for (const [objectiveId, objectiveValue] of Object.entries(objectiveCountsRaw)) {
          const normalizedObjectiveId = String(objectiveId ?? '').trim();
          if (!normalizedObjectiveId) {
            continue;
          }

          objectiveCounts[normalizedObjectiveId] = Math.max(
            0,
            Math.floor(Number(objectiveValue ?? 0)),
          );
        }
      }

      const startedAtRaw = Number(value?.startedAt);
      const updatedAtRaw = Number(value?.updatedAt);
      active[normalizedQuestId] = {
        stepIndex,
        objectiveCounts,
        startedAt: Number.isFinite(startedAtRaw) ? Math.floor(startedAtRaw) : null,
        updatedAt: Number.isFinite(updatedAtRaw) ? Math.floor(updatedAtRaw) : null,
      };
    }
  }

  const completed = Array.isArray(completedRaw)
    ? Array.from(
      new Set(
        completedRaw
          .map((entry) => String(entry ?? '').trim())
          .filter((entry) => entry.length > 0),
      ),
    )
    : [];

  return {
    version: QUEST_PROGRESS_VERSION,
    active,
    completed,
  };
}

function sanitizePlayerProfile(rawProfile) {
  const inventory = cloneInventory(rawProfile?.inventory);
  const bank = cloneInventory(rawProfile?.bank, BANK_MAX_SLOTS, { forceStacking: true });
  const equipment = cloneEquipment(rawProfile?.equipment);
  const skills = cloneSkills(rawProfile?.skills);
  skills.woodcutting.level = getLevelForXp(skills.woodcutting.xp);
  skills.mining.level = getLevelForXp(skills.mining.xp);
  skills.smelting.level = getLevelForXp(skills.smelting.xp);
  skills.smithing.level = getLevelForXp(skills.smithing.xp);
  skills.fletching.level = getLevelForXp(skills.fletching.xp);
  skills.strength.level = getLevelForXp(skills.strength.xp);
  skills.defense.level = getLevelForXp(skills.defense.xp);
  skills.constitution.level = getLevelForXp(skills.constitution.xp);

  const coordinateSpaceVersion = Math.max(
    1,
    Math.floor(Number(rawProfile?.coordinateSpaceVersion ?? 1)),
  );
  const savedTileX = Number(rawProfile?.tileX ?? NEW_PLAYER_SPAWN_TILE_X);
  const savedTileY = Number(rawProfile?.tileY ?? NEW_PLAYER_SPAWN_TILE_Y);
  const needsChunkZeroMigration = coordinateSpaceVersion < PROFILE_COORDINATE_SPACE_VERSION;
  const chunkZeroMaxTileX = CHUNK_ZERO_ORIGIN_TILE_X + ORIGINAL_CHUNK_WIDTH_TILES - 1;
  const chunkZeroMaxTileY = CHUNK_ZERO_ORIGIN_TILE_Y + ORIGINAL_CHUNK_HEIGHT_TILES - 1;
  const appearsAlreadyInChunkZeroWorldSpace =
    savedTileX >= CHUNK_ZERO_ORIGIN_TILE_X
    && savedTileX <= chunkZeroMaxTileX
    && savedTileY >= CHUNK_ZERO_ORIGIN_TILE_Y
    && savedTileY <= chunkZeroMaxTileY;

  const migratedTileX = needsChunkZeroMigration && !appearsAlreadyInChunkZeroWorldSpace
    ? savedTileX + CHUNK_ZERO_ORIGIN_TILE_X
    : savedTileX;
  const migratedTileY = needsChunkZeroMigration && !appearsAlreadyInChunkZeroWorldSpace
    ? savedTileY + CHUNK_ZERO_ORIGIN_TILE_Y
    : savedTileY;

  const tileX = Math.max(1, Math.min(WORLD_WIDTH_TILES - 2, Math.round(migratedTileX)));
  const tileY = Math.max(1, Math.min(WORLD_HEIGHT_TILES - 2, Math.round(migratedTileY)));
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
    coordinateSpaceVersion: PROFILE_COORDINATE_SPACE_VERSION,
    tileX,
    tileY,
    hp,
    maxHp,
    inventory,
    bank,
    equipment,
    skills,
    quests: sanitizeQuestProgress(rawProfile?.quests),
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

function toBase64Url(value) {
  const asBuffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
  return asBuffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(`${normalized}${'='.repeat(paddingLength)}`, 'base64');
}

function hashPassword(password, saltHex) {
  return scryptSync(String(password), String(saltHex), 64).toString('hex');
}

function loadOrCreateAuthSecret() {
  mkdirSync(DATA_DIR, { recursive: true });

  if (!existsSync(AUTH_SECRET_PATH)) {
    const generatedSecret = randomBytes(48).toString('hex');
    writeFileSync(AUTH_SECRET_PATH, `${generatedSecret}\n`, 'utf8');
    return generatedSecret;
  }

  const existingSecret = readFileSync(AUTH_SECRET_PATH, 'utf8').trim();
  if (existingSecret.length >= 32) {
    return existingSecret;
  }

  const regeneratedSecret = randomBytes(48).toString('hex');
  writeFileSync(AUTH_SECRET_PATH, `${regeneratedSecret}\n`, 'utf8');
  return regeneratedSecret;
}

function loadAccounts() {
  if (!existsSync(ACCOUNTS_PATH)) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(ACCOUNTS_PATH, 'utf8'));
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    const normalized = {};
    for (const [usernameKey, entry] of Object.entries(parsed)) {
      const normalizedUsername = String(usernameKey).trim().toLowerCase();
      if (!/^[a-z0-9_]{3,24}$/.test(normalizedUsername)) {
        continue;
      }

      const accountId = String(entry?.accountId ?? '').trim();
      const username = String(entry?.username ?? '').trim();
      const passwordSalt = String(entry?.passwordSalt ?? '').trim();
      const passwordHash = String(entry?.passwordHash ?? '').trim();
      const createdAt = Number(entry?.createdAt ?? Date.now());

      if (!accountId || !username || !passwordSalt || !passwordHash) {
        continue;
      }

      normalized[normalizedUsername] = {
        accountId,
        username,
        passwordSalt,
        passwordHash,
        createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
      };
    }

    return normalized;
  } catch {
    return {};
  }
}

function saveAccounts(accounts) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(ACCOUNTS_PATH, `${JSON.stringify(accounts, null, 2)}\n`, 'utf8');
}

function buildAccountsById(accountsByUsername) {
  const byId = {};
  for (const account of Object.values(accountsByUsername)) {
    byId[account.accountId] = account;
  }
  return byId;
}

function buildProfileIdForAccount(accountId) {
  return `acct_${accountId}`;
}

function normalizeUsername(value) {
  return String(value ?? '').trim().toLowerCase();
}

function isValidUsername(username) {
  return /^[a-z0-9_]{3,24}$/.test(username);
}

function isValidPassword(password) {
  const text = String(password ?? '');
  return text.length >= 8 && text.length <= 128;
}

function registerAccount(usernameInput, passwordInput) {
  const username = normalizeUsername(usernameInput);
  if (!isValidUsername(username)) {
    return { ok: false, reason: 'Username must be 3-24 chars: lowercase letters, numbers, underscore.' };
  }

  if (!isValidPassword(passwordInput)) {
    return { ok: false, reason: 'Password must be 8-128 characters.' };
  }

  if (accountsByUsername[username]) {
    return { ok: false, reason: 'That username is already taken.' };
  }

  const accountId = randomUUID().replace(/-/g, '');
  const passwordSalt = randomBytes(16).toString('hex');
  const passwordHash = hashPassword(passwordInput, passwordSalt);

  const account = {
    accountId,
    username,
    passwordSalt,
    passwordHash,
    createdAt: Date.now(),
  };

  accountsByUsername[username] = account;
  accountsById[accountId] = account;
  saveAccounts(accountsByUsername);

  return { ok: true, account };
}

function loginAccount(usernameInput, passwordInput) {
  const username = normalizeUsername(usernameInput);
  const account = accountsByUsername[username];
  if (!account || !isValidPassword(passwordInput)) {
    return { ok: false, reason: 'Invalid username or password.' };
  }

  const expectedHash = Buffer.from(account.passwordHash, 'hex');
  const providedHash = Buffer.from(hashPassword(passwordInput, account.passwordSalt), 'hex');
  if (expectedHash.length !== providedHash.length || !timingSafeEqual(expectedHash, providedHash)) {
    return { ok: false, reason: 'Invalid username or password.' };
  }

  return { ok: true, account };
}

function createAuthToken(secret, account) {
  const now = Date.now();
  const payload = {
    accountId: account.accountId,
    username: account.username,
    iat: now,
    exp: now + AUTH_TOKEN_TTL_MS,
    nonce: randomUUID().replace(/-/g, ''),
    v: 1,
  };

  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(encodedPayload).digest();
  const encodedSignature = toBase64Url(signature);
  return `${encodedPayload}.${encodedSignature}`;
}

function verifyAuthToken(secret, token) {
  const rawToken = String(token ?? '').trim();
  if (!rawToken.includes('.')) {
    return null;
  }

  const [encodedPayload, encodedSignature] = rawToken.split('.', 2);
  if (!encodedPayload || !encodedSignature) {
    return null;
  }

  const expectedSignature = createHmac('sha256', secret).update(encodedPayload).digest();
  const providedSignature = fromBase64Url(encodedSignature);
  if (providedSignature.length !== expectedSignature.length) {
    return null;
  }

  if (!timingSafeEqual(providedSignature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload).toString('utf8'));
    const accountId = String(payload?.accountId ?? '').trim();
    const username = String(payload?.username ?? '').trim();
    const exp = Number(payload?.exp ?? 0);

    if (!accountId || !username || !Number.isFinite(exp) || exp <= Date.now()) {
      return null;
    }

    return {
      accountId,
      username,
    };
  } catch {
    return null;
  }
}

const AUTH_SECRET = loadOrCreateAuthSecret();
const accountsByUsername = loadAccounts();
const accountsById = buildAccountsById(accountsByUsername);

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
    quests: player.quests,
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
  player.bank = cloneInventory(safeProfile.bank, BANK_MAX_SLOTS, { forceStacking: true });
  player.equipment = cloneEquipment(safeProfile.equipment);
  player.skills = cloneSkills(safeProfile.skills);
  player.quests = sanitizeQuestProgress(safeProfile.quests);
  player.skills.woodcutting.level = getLevelForXp(player.skills.woodcutting.xp);
  player.skills.mining.level = getLevelForXp(player.skills.mining.xp);
  player.skills.smelting.level = getLevelForXp(player.skills.smelting.xp);
  player.skills.smithing.level = getLevelForXp(player.skills.smithing.xp);
  player.skills.fletching.level = getLevelForXp(player.skills.fletching.xp);
  player.skills.strength.level = getLevelForXp(player.skills.strength.xp);
  player.skills.defense.level = getLevelForXp(player.skills.defense.xp);
  player.skills.constitution.level = getLevelForXp(player.skills.constitution.xp);
  applyPlayerMaxHpFromConstitution(player, true);
  player.nextHpRegenAt = Date.now() + PLAYER_HP_REGEN_INTERVAL_MS;
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
      minionTypeId: spawnDefinition.minionTypeId,
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
  const definitions = WORLD_MAP_DATA.resources.map((entry) => ({
    id: entry.id,
    type: entry.nodeType,
    resourceId: entry.resourceId,
    image: String(entry.image ?? '').trim(),
    tileX: entry.tileX,
    tileY: entry.tileY,
    respawnMs: entry.respawnMs,
  }));

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

function traceInteraction(event, details = {}) {
  if (!DEBUG_INTERACTION_TRACE) {
    return;
  }

  console.log(
    JSON.stringify({
      scope: 'interaction-trace',
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
  const tileId = WORLD_MAP_DATA.terrain[tileY]?.[tileX];
  return tileId === WATER_TILE_ID;
}

function isBaseWalkableTile(tileX, tileY) {
  if (tileX < 0 || tileY < 0 || tileX >= WORLD_WIDTH_TILES || tileY >= WORLD_HEIGHT_TILES) {
    return false;
  }

  const behavior = getTileBehaviorAt(tileX, tileY);
  return behavior.walkable !== false;
}

function getTileMoveSpeedMultiplier(tileX, tileY) {
  if (tileX < 0 || tileY < 0 || tileX >= WORLD_WIDTH_TILES || tileY >= WORLD_HEIGHT_TILES) {
    return 1;
  }

  const behavior = getTileBehaviorAt(tileX, tileY);
  const multiplierRaw = Number(behavior?.moveSpeedMultiplier ?? 1);
  return Number.isFinite(multiplierRaw)
    ? Math.max(0.1, Math.min(3, multiplierRaw))
    : 1;
}

function isNodeBlockingTile(tileX, tileY) {
  for (const node of worldNodes.values()) {
    if (node.tileX === tileX && node.tileY === tileY) {
      return true;
    }
  }

  return false;
}

function isObjectBlockingTile(tileX, tileY) {
  for (const object of WORLD_MAP_DATA.objects) {
    if (!object.blocksMovement) {
      continue;
    }

    if (object.tileX === tileX && object.tileY === tileY) {
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

  return !isNodeBlockingTile(tileX, tileY)
    && !isNpcBlockingTile(tileX, tileY)
    && !isObjectBlockingTile(tileX, tileY);
}

const {
  pathfindingService,
  movementService,
  combatTargetingPolicy,
  enemyCombatResolutionService,
  enemyStateService,
  enemyNavigationPolicy,
  enemyCombatPositioningPolicy,
  playerCombatResolutionService,
  playerCombatPositioningPolicy,
} = createServerSystems({
  shared: {
    clamp,
    isWalkableTile,
    getTileMoveSpeedMultiplier,
    getCombatHitChance,
    randomIntBetween,
    addSkillXp,
  },
  world: {
    moveFallbackSearchRadius: MOVE_FALLBACK_SEARCH_RADIUS,
    getWorldWidthTiles: () => WORLD_WIDTH_TILES,
    getWorldHeightTiles: () => WORLD_HEIGHT_TILES,
    worldWidthTiles: WORLD_WIDTH_TILES,
    worldHeightTiles: WORLD_HEIGHT_TILES,
  },
  movement: {
    tileStepIntervalMs: TILE_STEP_INTERVAL_MS,
    diagonalStepMultiplier: DIAGONAL_STEP_MULTIPLIER,
    findPath,
    canTraverseBetween,
    setPathTarget,
    stepTowardTarget,
    findBestAdjacentTileToTarget,
    isWithinRange,
  },
  enemyCombat: {
    getPlayerAttackCooldownMs,
    beginPlayerCombatTarget,
    enemyAttackAccuracy: ENEMY_ATTACK_ACCURACY,
    combatEnemyBaseAffinityPct: COMBAT_ENEMY_BASE_AFFINITY_PCT,
    combatEnemyHitModifierPct: COMBAT_ENEMY_HIT_MODIFIER_PCT,
    defenseXpPerHitTaken: DEFENSE_XP_PER_HIT_TAKEN,
    getPlayerArmorRating,
    enemyAttackRangeTiles: ENEMY_ATTACK_RANGE_TILES,
  },
  playerCombat: {
    enemyArmor: ENEMY_ARMOR,
    combatPlayerBaseAffinityPct: COMBAT_PLAYER_BASE_AFFINITY_PCT,
    combatPlayerHitModifierPct: COMBAT_PLAYER_HIT_MODIFIER_PCT,
    playerAttackDamageMin: PLAYER_ATTACK_DAMAGE_MIN,
    playerAttackDamageMax: PLAYER_ATTACK_DAMAGE_MAX,
    strengthXpPerHit: STRENGTH_XP_PER_HIT,
    constitutionXpPerHit: CONSTITUTION_XP_PER_HIT,
    getPlayerMeleeAccuracyRating,
    getPlayerCombatBonuses,
    getPlayerWeaponBaseDamageTotal,
    getPlayerEffectiveStrength,
    applyQuestObjectiveProgress,
    applyMinionDropsToPlayer,
    sendChatToSocket,
    playerAttackRangeTiles: PLAYER_ATTACK_RANGE_TILES,
    clients,
  },
});

function findSpawnTile() {
  const centerX = NEW_PLAYER_SPAWN_TILE_X;
  const centerY = NEW_PLAYER_SPAWN_TILE_Y;

  if (isWalkableTile(centerX, centerY)) {
    return { tileX: centerX, tileY: centerY };
  }

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
  return combatTargetingPolicy.isWithinRange(fromTileX, fromTileY, toTileX, toTileY, maxDistance);
}

function canAutoRetaliate(player) {
  return combatTargetingPolicy.canAutoRetaliate(player);
}

function isPlayerMoving(player) {
  return combatTargetingPolicy.isPlayerMoving(player);
}

function isCorrectHarvestToolEquipped(player, skillName) {
  const mainHandItemId = String(player?.equipment?.mainHand?.itemId ?? '').toLowerCase();
  if (!mainHandItemId) {
    return false;
  }

  if (skillName === 'woodcutting') {
    return mainHandItemId.includes('axe');
  }

  if (skillName === 'mining') {
    return mainHandItemId.includes('pickaxe');
  }

  return false;
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

  const hasCorrectToolEquipped = isCorrectHarvestToolEquipped(player, skillName);
  if (hasCorrectToolEquipped) {
    successChanceBonus += HARVEST_CORRECT_TOOL_SUCCESS_CHANCE_BONUS;
    gatherIntervalMultiplier *= HARVEST_CORRECT_TOOL_GATHER_INTERVAL_MULTIPLIER;
  } else {
    successChanceBonus -= HARVEST_HAND_SUCCESS_CHANCE_PENALTY;
    gatherIntervalMultiplier *= HARVEST_HAND_GATHER_INTERVAL_MULTIPLIER;
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
  return combatTargetingPolicy.beginPlayerCombatTarget(player, enemyId, nowMs);
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

function processPlayerTerrainEffects(player, dtMs) {
  if (!Number.isFinite(dtMs) || dtMs <= 0) {
    return;
  }

  const behavior = getTileBehaviorAt(player.tileX, player.tileY);
  const damagePerSecondRaw = Number(behavior?.damagePerSecond ?? 0);
  const damagePerSecond = Number.isFinite(damagePerSecondRaw)
    ? Math.max(0, Math.min(100, damagePerSecondRaw))
    : 0;

  if (damagePerSecond <= 0) {
    player.terrainDamageCarry = 0;
    return;
  }

  const previousCarry = Number(player.terrainDamageCarry ?? 0);
  const carry = Number.isFinite(previousCarry) ? previousCarry : 0;
  const accumulated = carry + (damagePerSecond * (dtMs / 1000));
  const damage = Math.floor(accumulated);
  player.terrainDamageCarry = accumulated - damage;

  if (damage <= 0) {
    return;
  }

  player.hp = Math.max(1, Math.floor(player.hp - damage));
  player.lastActionText = `The ground burns you for ${damage}.`;
}

function randomIntBetween(minValue, maxValue) {
  return Math.floor(Math.random() * (maxValue - minValue + 1)) + minValue;
}

function makeTileKey(tileX, tileY) {
  return pathfindingService.makeTileKey(tileX, tileY);
}

function canTraverseBetween(fromTileX, fromTileY, toTileX, toTileY) {
  return pathfindingService.canTraverseBetween(fromTileX, fromTileY, toTileX, toTileY);
}

function reconstructPath(cameFrom, startX, startY, targetX, targetY) {
  return pathfindingService.reconstructPath(cameFrom, startX, startY, targetX, targetY);
}

function findPath(startX, startY, targetX, targetY) {
  return pathfindingService.findPath(startX, startY, targetX, targetY);
}

function getPerimeterCandidates(centerX, centerY, radius) {
  return pathfindingService.getPerimeterCandidates(centerX, centerY, radius);
}

function findNearestReachableDestination(player, targetX, targetY) {
  return pathfindingService.findNearestReachableDestination(player, targetX, targetY);
}

function setPathTarget(entity, tileX, tileY) {
  return pathfindingService.setPathTarget(entity, tileX, tileY);
}

function hasQuestAvailableFromNpc(player, npc) {
  if (!player || !npc) {
    return false;
  }

  const quests = getNpcQuestDefinitions(npc);
  return quests.some((quest) => getNpcQuestStatus(player, quest) === 'not_started');
}

function getNpcSnapshot(viewerPlayer = null) {
  const npcs = {};

  for (const npc of Object.values(NPC_DEFINITIONS)) {
    npcs[npc.id] = {
      id: npc.id,
      type: npc.type,
      name: npc.name,
      image: String(npc.image ?? ''),
      tileX: npc.tileX,
      tileY: npc.tileY,
      examineText: npc.examineText,
      questAvailable: hasQuestAvailableFromNpc(viewerPlayer, npc),
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
        image: String(getItemDefinition(listing.itemId)?.image ?? '').trim(),
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

function getBankObjectById(objectId) {
  const safeObjectId = String(objectId ?? '').trim();
  if (!safeObjectId) {
    return null;
  }

  const objectEntry = WORLD_MAP_DATA.objects.find((entry) => entry.id === safeObjectId) ?? null;
  if (!objectEntry) {
    return null;
  }

  return objectEntry.objectTypeId === 'bank_chest' ? objectEntry : null;
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

function handleBankOpen(player, objectId) {
  return openBankForPlayer(player, objectId, {
    getBankObjectById,
    isWithinObjectRange,
  });
}

function handleBankTransfer(player, message) {
  return transferBankItem(player, message, {
    getBankObjectById,
    isWithinObjectRange,
    transferContainerSlot,
  });
}

function handleShopOpen(player, npcId) {
  return getShopOpenPayload(player, npcId, {
    getNpcById,
    getShopByNpcId,
    isWithinNpcRange,
  });
}

function handleShopBuy(player, message) {
  return buyFromShop(player, message, {
    resolveShopById: (shopId) => SHOP_DEFINITIONS[String(shopId ?? '')] ?? null,
    getNpcById,
    isWithinNpcRange,
    canSpendPlayerGold,
    addItemToInventory,
    spendPlayerGold,
  });
}

function handleShopSell(player, message) {
  return sellToShop(player, message, {
    resolveShopById: (shopId) => SHOP_DEFINITIONS[String(shopId ?? '')] ?? null,
    getNpcById,
    isWithinNpcRange,
    getInventoryItemCount,
    removeItemFromInventory,
    addPlayerGold,
  });
}

function sendCraftingOpenToSocket(socket, player, station, objectId) {
  return sendCraftingOpenToSocketFromSystem(socket, player, station, objectId, {
    craftingSkillConfigs: CRAFTING_SKILL_CONFIGS,
    sendChatToSocket,
    toInventorySnapshot,
    clamp01,
    getItemDefinition,
  });
}

function performCraftingAtStation(player, stationType, recipeId, quantity) {
  return performCraftingAtStationFromSystem(player, stationType, recipeId, quantity, {
    craftingStations: CRAFTING_STATIONS,
    craftingSkillConfigs: CRAFTING_SKILL_CONFIGS,
    clamp01,
    getItemDefinition,
    getInventoryItemCount,
    cloneInventory,
    inventoryMaxSlots: INVENTORY_MAX_SLOTS,
    canAddItemToContainer,
    addItemToContainer,
    removeItemFromInventory,
    addItemToInventory,
    addSkillXp,
  });
}

function getEnemySnapshot(now) {
  const enemies = {};

  for (const enemy of worldEnemies.values()) {
    const isDead = enemy.deadUntil > now;
    enemies[enemy.id] = {
      id: enemy.id,
      minionTypeId: String(enemy.minionTypeId ?? ''),
      type: enemy.type,
      name: enemy.name,
      image: String(enemy.image ?? ''),
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

function isWithinObjectRange(player, objectEntry) {
  const manhattanDistance = Math.abs(player.tileX - objectEntry.tileX) + Math.abs(player.tileY - objectEntry.tileY);
  return manhattanDistance <= INTERACTION_RANGE_TILES;
}

function ensureQuestProgressState(player) {
  if (!player.quests || typeof player.quests !== 'object' || player.quests.version !== QUEST_PROGRESS_VERSION) {
    player.quests = sanitizeQuestProgress(player.quests);
  }

  if (!player.quests.active || typeof player.quests.active !== 'object') {
    player.quests.active = {};
  }

  if (!Array.isArray(player.quests.completed)) {
    player.quests.completed = [];
  }
}

function getQuestDefinitionById(questId) {
  const safeQuestId = String(questId ?? '').trim();
  if (!safeQuestId) {
    return null;
  }

  const loaded = QUEST_DEFINITIONS_V2[safeQuestId];
  if (loaded) {
    return loaded;
  }

  for (const npc of Object.values(NPC_DEFINITIONS)) {
    if (npc?.quest?.id === safeQuestId) {
      return npc.quest;
    }
  }

  return null;
}

function getQuestSteps(quest) {
  return Array.isArray(quest?.steps) ? quest.steps : [];
}

function getObjectiveRequiredCount(objective) {
  return Math.max(1, Math.floor(Number(objective?.count ?? objective?.quantity ?? 1)));
}

function getQuestZoneById(zoneId) {
  const safeZoneId = String(zoneId ?? '').trim();
  if (!safeZoneId) {
    return null;
  }

  const zones = Array.isArray(WORLD_MAP_DATA?.questZones) ? WORLD_MAP_DATA.questZones : [];
  return zones.find((entry) => String(entry?.id ?? '').trim() === safeZoneId) ?? null;
}

function formatIdentifierForUi(identifier, fallback = 'Unknown') {
  const safeIdentifier = String(identifier ?? '').trim();
  if (!safeIdentifier) {
    return fallback;
  }

  return safeIdentifier
    .replace(/^(npc|quest|item|resource|enemy|minion)[-_]/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getItemDisplayName(itemId) {
  return getItemDefinition(itemId)?.name ?? formatIdentifierForUi(itemId, 'Item');
}

function getNpcDisplayName(npcId) {
  return getNpcById(npcId)?.name ?? formatIdentifierForUi(npcId, 'NPC');
}

function getQuestDisplayName(questId) {
  return getQuestDefinitionById(questId)?.title ?? formatIdentifierForUi(questId, 'Quest');
}

function getQuestZoneDisplayName(zoneId) {
  return getQuestZoneById(zoneId)?.name ?? formatIdentifierForUi(zoneId, 'Zone');
}

function getObjectiveTargetDisplayName(targetId) {
  const safeTargetId = String(targetId ?? '').trim();
  if (!safeTargetId) {
    return 'Target';
  }

  const minionName = getMinionDefinition(safeTargetId)?.name;
  if (minionName) {
    return minionName;
  }

  const npcName = getNpcById(safeTargetId)?.name;
  if (npcName) {
    return npcName;
  }

  return formatIdentifierForUi(safeTargetId, 'Target');
}

function getSkillDisplayName(skillName) {
  return formatIdentifierForUi(skillName, 'Skill');
}

function isTileInsideQuestZone(zoneId, tileX, tileY) {
  const zone = getQuestZoneById(zoneId);
  if (!zone || !Array.isArray(zone.rects)) {
    return false;
  }

  return zone.rects.some((rect) => {
    const rectX = Math.floor(Number(rect?.x ?? 0));
    const rectY = Math.floor(Number(rect?.y ?? 0));
    const rectWidth = Math.max(1, Math.floor(Number(rect?.width ?? 1)));
    const rectHeight = Math.max(1, Math.floor(Number(rect?.height ?? 1)));
    return tileX >= rectX
      && tileX < rectX + rectWidth
      && tileY >= rectY
      && tileY < rectY + rectHeight;
  });
}

function getQuestStepProgressRecord(player, quest) {
  ensureQuestProgressState(player);

  const active = player.quests.active[String(quest?.id ?? '').trim()];
  if (!active) {
    return null;
  }

  const steps = getQuestSteps(quest);
  const stepIndex = Math.max(0, Math.floor(Number(active.stepIndex ?? 0)));
  const clampedStepIndex = Math.min(stepIndex, Math.max(0, steps.length - 1));
  return {
    ...active,
    stepIndex: clampedStepIndex,
    objectiveCounts: active.objectiveCounts && typeof active.objectiveCounts === 'object'
      ? active.objectiveCounts
      : {},
  };
}

function doesPlayerMeetQuestRequirements(player, quest) {
  const requirements = quest?.requirements;
  if (!requirements || typeof requirements !== 'object') {
    return true;
  }

  if (Array.isArray(requirements.requiredQuestIds)) {
    for (const requiredQuestId of requirements.requiredQuestIds) {
      if (!isQuestCompleted(player, requiredQuestId)) {
        return false;
      }
    }
  }

  if (Array.isArray(requirements.requiredSkillLevels)) {
    for (const requirement of requirements.requiredSkillLevels) {
      const skillName = String(requirement?.skill ?? '').trim();
      if (!skillName) {
        continue;
      }

      const requiredLevel = Math.max(1, Math.floor(Number(requirement?.level ?? 1)));
      const currentLevel = Math.max(1, Math.floor(Number(player?.skills?.[skillName]?.level ?? 1)));
      if (currentLevel < requiredLevel) {
        return false;
      }
    }
  }

  if (Array.isArray(requirements.requiredItems)) {
    for (const requirement of requirements.requiredItems) {
      const itemId = String(requirement?.itemId ?? '').trim();
      if (!itemId) {
        continue;
      }

      const requiredQuantity = Math.max(1, Math.floor(Number(requirement?.quantity ?? 1)));
      if (getInventoryItemCount(player, itemId) < requiredQuantity) {
        return false;
      }
    }
  }

  return true;
}

function isQuestStepComplete(step, objectiveCounts) {
  if (!step || !Array.isArray(step.objectives) || step.objectives.length === 0) {
    return false;
  }

  const checks = step.objectives.map((objective) => {
    const objectiveId = String(objective?.id ?? '').trim();
    const required = getObjectiveRequiredCount(objective);
    const value = Math.max(0, Math.floor(Number(objectiveCounts?.[objectiveId] ?? 0)));
    return value >= required;
  });

  if (step.completion === 'any') {
    return checks.some(Boolean);
  }

  return checks.every(Boolean);
}

function getQuestRequiredCount(quest) {
  const steps = getQuestSteps(quest);
  const firstStep = steps[0] ?? null;
  const firstObjective = Array.isArray(firstStep?.objectives) ? firstStep.objectives[0] : null;
  if (!firstObjective) {
    return 1;
  }

  return getObjectiveRequiredCount(firstObjective);
}

function getQuestObjectiveType(quest) {
  const firstStep = getQuestSteps(quest)[0] ?? null;
  const firstObjective = Array.isArray(firstStep?.objectives) ? firstStep.objectives[0] : null;
  const objectiveType = String(firstObjective?.type ?? '').trim();
  if (!objectiveType) {
    return 'kill';
  }

  return objectiveType;
}

function getQuestObjectiveTargetId(quest) {
  const firstStep = getQuestSteps(quest)[0] ?? null;
  const firstObjective = Array.isArray(firstStep?.objectives) ? firstStep.objectives[0] : null;
  if (!firstObjective) {
    return '';
  }

  if (firstObjective.type === 'gather') {
    return getItemDisplayName(firstObjective.itemId);
  }

  if (firstObjective.type === 'delivery') {
    return `${getItemDisplayName(firstObjective.itemId)} to ${getNpcDisplayName(firstObjective.toNpcId)}`;
  }

  if (firstObjective.type === 'travel') {
    return getQuestZoneDisplayName(firstObjective.zoneId);
  }

  if (firstObjective.type === 'item_retrieval') {
    return getItemDisplayName(firstObjective.itemId);
  }

  if (firstObjective.type === 'talk_to_npc') {
    return getNpcDisplayName(firstObjective.npcId);
  }

  return getObjectiveTargetDisplayName(firstObjective.targetId);
}

function getQuestObjectiveLabel(quest) {
  const objectiveType = getQuestObjectiveType(quest);
  const objectiveTarget = getQuestObjectiveTargetId(quest);
  if (objectiveType === 'delivery' || objectiveType === 'travel' || objectiveType === 'talk_to_npc') {
    return `${formatIdentifierForUi(objectiveType)}: ${objectiveTarget}`;
  }

  const typeLabel = objectiveType === 'gather' ? 'Gather' : objectiveType === 'item_retrieval' ? 'Collect' : 'Defeat';
  return `${typeLabel} ${objectiveTarget} (${getQuestRequiredCount(quest)})`;
}

function getQuestProgressRecord(player, questId) {
  const quest = getQuestDefinitionById(questId);
  if (!quest) {
    return null;
  }

  const existing = getQuestStepProgressRecord(player, quest);
  if (!existing) {
    return null;
  }

  const steps = getQuestSteps(quest);
  const currentStep = steps[existing.stepIndex] ?? steps[0] ?? null;
  const firstObjective = Array.isArray(currentStep?.objectives) ? currentStep.objectives[0] : null;
  const objectiveId = String(firstObjective?.id ?? '').trim();
  if (!objectiveId) {
    return null;
  }
  const count = Math.max(
    0,
    Math.floor(Number(
      existing.objectiveCounts[objectiveId]
      ?? 0,
    )),
  );

  return {
    count,
    stepIndex: Math.max(0, Math.floor(Number(existing.stepIndex ?? 0))),
  };
}

function setQuestProgressRecord(player, questId, count) {
  const safeQuestId = String(questId ?? '').trim();
  if (!safeQuestId) {
    return;
  }

  ensureQuestProgressState(player);
  const quest = getQuestDefinitionById(safeQuestId);
  const steps = getQuestSteps(quest);
  const stepIndex = Math.max(0, Math.floor(Number(player.quests.active[safeQuestId]?.stepIndex ?? 0)));
  const currentStep = steps[stepIndex] ?? steps[0] ?? null;
  const firstObjective = Array.isArray(currentStep?.objectives) ? currentStep.objectives[0] : null;
  const objectiveId = String(firstObjective?.id ?? '').trim();
  if (!objectiveId) {
    return;
  }
  const now = Date.now();
  const existing = player.quests.active[safeQuestId] ?? null;
  player.quests.active[safeQuestId] = {
    stepIndex: Math.max(0, Math.floor(Number(existing?.stepIndex ?? 0))),
    objectiveCounts: {
      ...(existing?.objectiveCounts && typeof existing.objectiveCounts === 'object'
        ? existing.objectiveCounts
        : {}),
      [objectiveId]: Math.max(0, Math.floor(Number(count ?? 0))),
    },
    startedAt: Number.isFinite(Number(existing?.startedAt))
      ? Math.floor(Number(existing.startedAt))
      : now,
    updatedAt: now,
  };
}

function isQuestCompleted(player, questId) {
  const safeQuestId = String(questId ?? '').trim();
  if (!safeQuestId) {
    return false;
  }

  ensureQuestProgressState(player);

  return player.quests.completed.includes(safeQuestId);
}

function buildQuestRequirementEntries(player, quest) {
  const requirements = quest?.requirements && typeof quest.requirements === 'object' ? quest.requirements : {};

  return [
    ...(Array.isArray(requirements.requiredQuestIds)
      ? requirements.requiredQuestIds.map((requiredQuestId) => ({
        label: `Complete quest: ${getQuestDisplayName(requiredQuestId)}`,
        met: isQuestCompleted(player, requiredQuestId),
      }))
      : []),
    ...(Array.isArray(requirements.requiredSkillLevels)
      ? requirements.requiredSkillLevels.map((requiredSkill) => {
        const skillName = String(requiredSkill?.skill ?? '').trim();
        const requiredLevel = Math.max(1, Math.floor(Number(requiredSkill?.level ?? 1)));
        const currentLevel = Math.max(1, Math.floor(Number(player?.skills?.[skillName]?.level ?? 1)));
        return {
          label: `Reach ${getSkillDisplayName(skillName)} level ${requiredLevel}`,
          met: currentLevel >= requiredLevel,
        };
      })
      : []),
    ...(Array.isArray(requirements.requiredItems)
      ? requirements.requiredItems.map((requiredItem) => ({
        label: `Hold ${requiredItem.quantity} ${getItemDisplayName(requiredItem.itemId)}`,
        met: getInventoryItemCount(player, requiredItem.itemId) >= requiredItem.quantity,
      }))
      : []),
  ];
}

function findNpcForQuestId(questId) {
  const safeQuestId = String(questId ?? '').trim();
  if (!safeQuestId) {
    return null;
  }

  return Object.values(NPC_DEFINITIONS).find((entry) =>
    getNpcQuestDefinitions(entry).some((quest) => String(quest?.id ?? '').trim() === safeQuestId),
  ) ?? null;
}

function describeQuestObjective(objective) {
  if (!objective || typeof objective !== 'object') {
    return 'Objective';
  }

  if (objective.type === 'kill') {
    return `Defeat ${getObjectiveTargetDisplayName(objective.targetId)}`;
  }

  if (objective.type === 'gather') {
    return `Gather ${getItemDisplayName(objective.itemId)}`;
  }

  if (objective.type === 'delivery') {
    return `Deliver ${getItemDisplayName(objective.itemId)} to ${getNpcDisplayName(objective.toNpcId)}`;
  }

  if (objective.type === 'travel') {
    return `Travel to ${getQuestZoneDisplayName(objective.zoneId)}`;
  }

  if (objective.type === 'item_retrieval') {
    return `Collect ${getItemDisplayName(objective.itemId)}`;
  }

  if (objective.type === 'interact_object') {
    return `Interact with ${formatIdentifierForUi(objective.objectTypeId ?? objective.objectId ?? 'object', 'Object')}`;
  }

  if (objective.type === 'talk_to_npc') {
    return `Talk to ${getNpcDisplayName(objective.npcId)}`;
  }

  return 'Objective';
}

function buildQuestJournalEntry(player, quest, status) {
  const progress = getQuestStepProgressRecord(player, quest);
  const steps = getQuestSteps(quest);
  const rewards = quest?.rewards && typeof quest.rewards === 'object' ? quest.rewards : {};
  const requirementEntries = buildQuestRequirementEntries(player, quest);

  return {
    questId: quest.id,
    title: quest.title,
    status,
    currentStepIndex: progress?.stepIndex ?? 0,
    steps: steps.map((step, stepIndex) => {
      const objectiveCounts = progress?.objectiveCounts ?? {};
      const objectives = Array.isArray(step.objectives)
        ? step.objectives.map((objective, objectiveIndex) => {
          const objectiveId = String(objective?.id ?? '').trim();
          const required = getObjectiveRequiredCount(objective);
          const rawProgress = status === 'completed'
            ? required
            : Math.max(0, Math.floor(Number(objectiveCounts[objectiveId] ?? 0)));
          return {
            id: objectiveId || `objective-${step.id}-${objectiveIndex + 1}`,
            description: describeQuestObjective(objective),
            progress: Math.min(required, rawProgress),
            required,
          };
        })
        : [];

      return {
        id: step.id,
        description: step.description,
        completed: status === 'completed' || stepIndex < (progress?.stepIndex ?? 0) || isQuestStepComplete(step, objectiveCounts),
        objectives,
      };
    }),
    requirements: requirementEntries,
    rewards: {
      ...(Number.isFinite(Number(rewards.gold)) ? { gold: Math.max(0, Math.floor(Number(rewards.gold))) } : {}),
      ...(Array.isArray(rewards.items) ? { items: rewards.items } : {}),
      ...(Array.isArray(rewards.xp) ? { xp: rewards.xp } : {}),
    },
    chain: {
      ...(Array.isArray(quest?.chain?.nextQuestIds) ? { nextQuestIds: quest.chain.nextQuestIds } : {}),
    },
  };
}

function buildQuestJournalState(player) {
  const allQuests = Array.from(
    new Map(
      Object.values(NPC_DEFINITIONS)
        .flatMap((entry) => getNpcQuestDefinitions(entry).map((quest) => [quest.id, quest])),
    ).values(),
  );

  const active = [];
  const completed = [];
  for (const quest of allQuests) {
    const status = getNpcQuestStatus(player, quest);
    if (status === 'completed') {
      completed.push(buildQuestJournalEntry(player, quest, 'completed'));
      continue;
    }

    if (status === 'active' || status === 'completable') {
      active.push(buildQuestJournalEntry(player, quest, status));
    }
  }

  const selectedQuestId = String(player.questJournalSelectedQuestId ?? '').trim()
    || active[0]?.questId
    || completed[0]?.questId
    || null;

  return {
    active,
    completed,
    selectedQuestId,
  };
}

function sendQuestJournalToPlayer(player) {
  const client = clients.get(player.id);
  if (!client || client.socket.readyState !== 1) {
    return;
  }

  client.socket.send(
    JSON.stringify({
      type: 'questJournal',
      journal: buildQuestJournalState(player),
    }),
  );
}

function buildQuestDialogueState(player, npc, quest) {
  if (!npc) {
    return {
      open: true,
      npcId: '',
      npcName: 'NPC',
      questId: null,
      mode: 'ambient',
      text: 'Hello there.',
      options: [{ id: 'close', label: 'Close', action: 'close' }],
    };
  }

  if (!quest) {
    return {
      open: true,
      npcId: npc.id,
      npcName: npc.name,
      questId: null,
      mode: 'ambient',
      text: npc.talkText,
      options: [{ id: 'close', label: 'Close', action: 'close' }],
    };
  }

  const status = getNpcQuestStatus(player, quest);
  const progress = getQuestProgressRecord(player, quest.id) ?? { count: 0 };
  const requiredCount = getQuestRequiredCount(quest);

  if (status === 'locked') {
    const requirementEntries = buildQuestRequirementEntries(player, quest);
    const requirementLines = requirementEntries.map((entry) => `${entry.met ? '✓' : '✗'} ${entry.label}`);
    return {
      open: true,
      npcId: npc.id,
      npcName: npc.name,
      questId: quest.id,
      mode: 'locked',
      text: [
        quest.lockedText ?? 'You are not ready for this task yet.',
        ...(requirementLines.length > 0 ? ['', 'Requirements:', ...requirementLines] : []),
      ].join('\n'),
      options: [{ id: 'close', label: 'Close', action: 'close' }],
    };
  }

  if (status === 'not_started') {
    return {
      open: true,
      npcId: npc.id,
      npcName: npc.name,
      questId: quest.id,
      mode: 'offer',
      text: quest.startText,
      options: [
        { id: 'accept', label: 'Accept', action: 'accept' },
        { id: 'decline', label: 'Decline', action: 'decline' },
      ],
    };
  }

  if (status === 'completable') {
    return {
      open: true,
      npcId: npc.id,
      npcName: npc.name,
      questId: quest.id,
      mode: 'turnin',
      text: `${quest.completeText} Ready to turn in?`,
      options: [
        { id: 'turnin', label: 'Turn in', action: 'turnin' },
        { id: 'close', label: 'Close', action: 'close' },
      ],
    };
  }

  if (status === 'completed') {
    return {
      open: true,
      npcId: npc.id,
      npcName: npc.name,
      questId: quest.id,
      mode: 'completed',
      text: npc.talkText,
      options: [{ id: 'close', label: 'Close', action: 'close' }],
    };
  }

  return {
    open: true,
    npcId: npc.id,
    npcName: npc.name,
    questId: quest.id,
    mode: 'progress',
    text: `${quest.progressText} (${progress.count}/${requiredCount})`,
    options: [{ id: 'close', label: 'Close', action: 'close' }],
  };
}

function sendQuestDialogueToSocket(socket, dialogue) {
  socket.send(
    JSON.stringify({
      type: 'questDialogue',
      dialogue,
    }),
  );
}

function sendQuestNotificationToPlayer(player, notification) {
  const client = clients.get(player.id);
  if (!client || client.socket.readyState !== 1) {
    return;
  }

  client.socket.send(
    JSON.stringify({
      type: 'questNotification',
      notification,
    }),
  );
}

function getNpcQuestStatus(player, quest) {
  if (!quest) {
    return 'none';
  }

  if (isQuestCompleted(player, quest.id)) {
    return 'completed';
  }

  const progress = getQuestStepProgressRecord(player, quest);
  if (!progress) {
    if (!doesPlayerMeetQuestRequirements(player, quest)) {
      return 'locked';
    }
    return 'not_started';
  }

  const steps = getQuestSteps(quest);
  if (steps.length === 0) {
    return 'active';
  }

  const currentStep = steps[progress.stepIndex] ?? steps[steps.length - 1];
  const currentStepComplete = isQuestStepComplete(currentStep, progress.objectiveCounts);
  const finalStepComplete = progress.stepIndex >= steps.length - 1 && currentStepComplete;
  if (finalStepComplete) {
    return 'completable';
  }

  return 'active';
}

function sendQuestProgressToPlayer(player, text, questId = null, type = 'progress') {
  const safeQuestId = String(questId ?? '').trim();
  sendQuestNotificationToPlayer(player, {
    id: randomUUID(),
    type,
    questId: safeQuestId,
    text,
    timestamp: Date.now(),
  });
}

function startNpcQuestForPlayer(player, npc, quest) {
  if (!doesPlayerMeetQuestRequirements(player, quest)) {
    sendQuestProgressToPlayer(
      player,
      `[${npc.name}] ${quest.lockedText ?? 'You are not ready for this task yet.'}`,
      quest?.id,
      'failed',
    );
    return;
  }

  ensureQuestProgressState(player);
  const now = Date.now();
  player.quests.active[quest.id] = {
    stepIndex: 0,
    objectiveCounts: {},
    startedAt: now,
    updatedAt: now,
  };
  setQuestProgressRecord(player, quest.id, 0);
  applyQuestProgressEvent(player, {
    type: 'inventory_changed',
  });
  player.lastActionText = `Accepted quest: ${quest.title}`;
  sendQuestProgressToPlayer(player, `[${npc.name}] ${quest.startText}`, quest.id, 'progress');
  sendQuestProgressToPlayer(player, `[Quest] ${quest.title}: ${quest.missionText}`, quest.id, 'progress');
  sendQuestProgressToPlayer(player, `[Quest] Objective: ${getQuestObjectiveLabel(quest)}`, quest.id, 'progress');
  sendQuestJournalToPlayer(player);
}

function completeNpcQuestForPlayer(player, npc, quest) {
  const rewardGold = Math.max(
    0,
    Math.floor(Number(quest?.rewards?.gold ?? 0)),
  );
  const rewardItems = Array.isArray(quest?.rewards?.items)
    ? quest.rewards.items
      .map((entry) => ({
        itemId: String(entry?.itemId ?? '').trim(),
        quantity: Math.max(1, Math.floor(Number(entry?.quantity ?? 1))),
      }))
      .filter((entry) => entry.itemId.length > 0)
    : [];

  for (const rewardItem of rewardItems) {
    const itemDefinition = getItemDefinition(rewardItem.itemId);
    if (!itemDefinition) {
      sendQuestProgressToPlayer(player, '[Quest] Reward item configuration is invalid.', quest.id, 'failed');
      return false;
    }

    const addedItem = addItemToInventory(player, rewardItem.itemId, rewardItem.quantity);
    if (!addedItem) {
      sendQuestProgressToPlayer(player, '[Quest] Not enough inventory space for quest rewards.', quest.id, 'failed');
      return false;
    }
  }

  if (rewardGold > 0) {
    addPlayerGold(player, rewardGold);
  }

  ensureQuestProgressState(player);

  delete player.quests.active[quest.id];
  if (!player.quests.completed.includes(quest.id)) {
    player.quests.completed.push(quest.id);
  }

  const rewardParts = [];
  if (rewardGold > 0) {
    rewardParts.push(`${rewardGold} gold`);
  }
  for (const rewardItem of rewardItems) {
    const itemName = getItemDefinition(rewardItem.itemId)?.name ?? rewardItem.itemId;
    rewardParts.push(`${itemName}${rewardItem.quantity > 1 ? ` x${rewardItem.quantity}` : ''}`);
  }
  const rewardSummary = rewardParts.length > 0 ? rewardParts.join(', ') : 'no tangible rewards';

  player.lastActionText = `Completed quest: ${quest.title}`;
  sendQuestProgressToPlayer(player, `[${npc.name}] ${quest.completeText}`, quest.id, 'quest_complete');
  sendQuestProgressToPlayer(player, `[Quest] Completed: ${quest.title}. Rewards: ${rewardSummary}.`, quest.id, 'quest_complete');
  sendQuestJournalToPlayer(player);
  return true;
}

function applyQuestProgressEvent(player, event) {
  ensureQuestProgressState(player);

  for (const npc of Object.values(NPC_DEFINITIONS)) {
    const quest = npc?.quest;
    if (!quest || isQuestCompleted(player, quest.id)) {
      continue;
    }

    const progress = getQuestStepProgressRecord(player, quest);
    if (!progress) {
      continue;
    }

    const steps = getQuestSteps(quest);
    const step = steps[progress.stepIndex] ?? null;
    if (!step || !Array.isArray(step.objectives) || step.objectives.length === 0) {
      continue;
    }

    const nextObjectiveCounts = {
      ...progress.objectiveCounts,
    };
    let changed = false;

    const isConstraintSatisfied = (objective) => {
      if (Array.isArray(objective.requiredQuestIds) && objective.requiredQuestIds.some((questId) => !isQuestCompleted(player, questId))) {
        return false;
      }

      if (Array.isArray(objective.requiredItems)) {
        for (const requiredItem of objective.requiredItems) {
          if (getInventoryItemCount(player, requiredItem.itemId) < requiredItem.quantity) {
            return false;
          }
        }
      }

      const timeLimitMs = Number(objective.timeLimitMs);
      const startedAt = Number(progress.startedAt);
      if (Number.isFinite(timeLimitMs) && timeLimitMs > 0 && Number.isFinite(startedAt)) {
        if (Date.now() > startedAt + timeLimitMs) {
          return false;
        }
      }

      const objectiveZoneId = String(objective.zoneId ?? '').trim();
      if (objectiveZoneId && objective.type !== 'travel') {
        const eventTileX = Number(event.tileX ?? player.tileX);
        const eventTileY = Number(event.tileY ?? player.tileY);
        if (!isTileInsideQuestZone(objectiveZoneId, Math.floor(eventTileX), Math.floor(eventTileY))) {
          return false;
        }
      }

      return true;
    };

    const doesEventMatch = (objective) => {
      if (objective.type === 'kill') {
        return event.type === 'kill' && String(event.targetId ?? '').trim() === String(objective.targetId ?? '').trim();
      }

      if (objective.type === 'gather') {
        return event.type === 'gather' && String(event.itemId ?? '').trim() === String(objective.itemId ?? '').trim();
      }

      if (objective.type === 'talk_to_npc') {
        return event.type === 'talk_to_npc' && String(event.npcId ?? '').trim() === String(objective.npcId ?? '').trim();
      }

      if (objective.type === 'interact_object') {
        if (event.type !== 'interact_object') {
          return false;
        }

        const eventObjectId = String(event.objectId ?? '').trim();
        const eventObjectTypeId = String(event.objectTypeId ?? '').trim();
        const expectedObjectId = String(objective.objectId ?? '').trim();
        const expectedObjectTypeId = String(objective.objectTypeId ?? '').trim();
        if (expectedObjectId && eventObjectId !== expectedObjectId) {
          return false;
        }
        if (expectedObjectTypeId && eventObjectTypeId !== expectedObjectTypeId) {
          return false;
        }

        return true;
      }

      if (objective.type === 'travel') {
        if (event.type !== 'travel') {
          return false;
        }

        const eventTileX = Math.floor(Number(event.tileX ?? player.tileX));
        const eventTileY = Math.floor(Number(event.tileY ?? player.tileY));
        if (!isTileInsideQuestZone(String(objective.zoneId ?? ''), eventTileX, eventTileY)) {
          return false;
        }

        const targetXRaw = Number(objective.tileX);
        const targetYRaw = Number(objective.tileY);
        if (!Number.isFinite(targetXRaw) || !Number.isFinite(targetYRaw)) {
          return true;
        }

        const radius = Math.max(0, Math.floor(Number(objective.radius ?? 0)));
        const targetX = Math.floor(targetXRaw);
        const targetY = Math.floor(targetYRaw);
        const candidateTargets = [
          { x: targetX, y: targetY },
        ];

        if (CHUNK_ZERO_ORIGIN_TILE_X !== 0 || CHUNK_ZERO_ORIGIN_TILE_Y !== 0) {
          candidateTargets.push({
            x: targetX + CHUNK_ZERO_ORIGIN_TILE_X,
            y: targetY + CHUNK_ZERO_ORIGIN_TILE_Y,
          });
        }

        return candidateTargets.some((target) => {
          const dx = Math.abs(eventTileX - target.x);
          const dy = Math.abs(eventTileY - target.y);
          return dx + dy <= radius;
        });
      }

      if (objective.type === 'item_retrieval') {
        return event.type === 'inventory_changed'
          && (!event.itemId || String(event.itemId ?? '').trim() === String(objective.itemId ?? '').trim());
      }

      if (objective.type === 'delivery') {
        return event.type === 'talk_to_npc' && String(event.npcId ?? '').trim() === String(objective.toNpcId ?? '').trim();
      }

      return false;
    };

    for (const objective of step.objectives) {
      const objectiveId = String(objective?.id ?? '').trim();
      if (!objectiveId) {
        continue;
      }

      const required = getObjectiveRequiredCount(objective);
      const current = Math.max(0, Math.floor(Number(nextObjectiveCounts[objectiveId] ?? 0)));
      if (current >= required) {
        continue;
      }

      if (!doesEventMatch(objective) || !isConstraintSatisfied(objective)) {
        continue;
      }

      let next = current;
      if (objective.type === 'talk_to_npc' || objective.type === 'travel') {
        next = required;
      } else if (objective.type === 'item_retrieval') {
        next = Math.min(required, getInventoryItemCount(player, objective.itemId));
      } else if (objective.type === 'delivery') {
        const remaining = required - current;
        const available = getInventoryItemCount(player, objective.itemId);
        const deliverQuantity = Math.max(0, Math.min(remaining, available));
        if (deliverQuantity <= 0) {
          continue;
        }

        const removed = removeItemFromInventory(player, objective.itemId, deliverQuantity);
        if (!removed) {
          continue;
        }

        next = Math.min(required, current + deliverQuantity);
      } else {
        next = Math.min(required, current + Math.max(1, Math.floor(Number(event.amount ?? 1))));
      }

      if (next === current) {
        continue;
      }

      nextObjectiveCounts[objectiveId] = next;
      changed = true;
    }

    if (!changed) {
      continue;
    }

    player.quests.active[quest.id] = {
      ...progress,
      objectiveCounts: nextObjectiveCounts,
      updatedAt: Date.now(),
    };

    const currentStepComplete = isQuestStepComplete(step, nextObjectiveCounts);
    if (currentStepComplete) {
      const nextStepIndex = progress.stepIndex + 1;
      if (nextStepIndex < steps.length) {
        player.quests.active[quest.id].stepIndex = nextStepIndex;
        sendQuestProgressToPlayer(player, `[Quest] ${quest.title}: step ${nextStepIndex} complete.`, quest.id, 'step_complete');
      } else {
        sendQuestProgressToPlayer(player, `[Quest] ${quest.title}: objective complete. Return to ${npc.name}.`, quest.id, 'step_complete');
      }
      sendQuestJournalToPlayer(player);
      continue;
    }

    const progressRecord = getQuestProgressRecord(player, quest.id);
    if (progressRecord) {
      const requiredCount = getQuestRequiredCount(quest);
      sendQuestProgressToPlayer(player, `[Quest] ${quest.title}: ${progressRecord.count}/${requiredCount}.`, quest.id, 'progress');
      sendQuestJournalToPlayer(player);
    }
  }
}

function applyQuestObjectiveProgress(player, objectiveType, objectiveTargetId, amount = 1) {
  const safeTargetId = String(objectiveTargetId ?? '').trim();
  const objectiveCount = Math.max(1, Math.floor(Number(amount ?? 1)));
  if (!safeTargetId) {
    return;
  }

  if (objectiveType === 'kill') {
    applyQuestProgressEvent(player, {
      type: 'kill',
      targetId: safeTargetId,
      amount: objectiveCount,
      tileX: player.tileX,
      tileY: player.tileY,
    });
    return;
  }

  if (objectiveType === 'gather') {
    applyQuestProgressEvent(player, {
      type: 'gather',
      itemId: safeTargetId,
      amount: objectiveCount,
      tileX: player.tileX,
      tileY: player.tileY,
    });
  }
}

function getNodeSnapshot(now) {
  const nodes = {};

  for (const [id, node] of worldNodes.entries()) {
    const isDepleted = node.depletedUntil > now;
    const resourceDefinition = getResourceDefinition(node.resourceId);
    const worldObjectTypeDefinition = getWorldObjectTypeDefinition(node.resourceId);
    const hasWorldObjectTypeDefinition = Boolean(worldObjectTypeDefinition);
    const resourceImage = hasWorldObjectTypeDefinition
      ? String(worldObjectTypeDefinition?.image ?? '').trim()
      : (String(node.image ?? '').trim() || resourceDefinition?.image || '');
    nodes[id] = {
      id,
      type: node.type,
      resourceId: node.resourceId,
      resourceName: resourceDefinition?.name ?? node.resourceId,
      resourceImage,
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

function getGroundItemSnapshot(viewerPlayerId, now) {
  const groundItems = {};

  for (const groundItem of worldGroundItems.values()) {
    if (!isGroundItemVisibleToPlayer(groundItem, viewerPlayerId, now)) {
      continue;
    }

    groundItems[groundItem.id] = {
      id: groundItem.id,
      itemId: groundItem.itemId,
      name: groundItem.name,
      image: groundItem.image,
      quantity: groundItem.quantity,
      tileX: groundItem.tileX,
      tileY: groundItem.tileY,
      despawnAt: groundItem.despawnAt,
    };
  }

  return groundItems;
}

function getObjectSnapshot() {
  const objects = {};

  for (const object of WORLD_MAP_DATA.objects) {
    const definition = getWorldObjectTypeDefinition(object.objectTypeId);
    objects[object.id] = {
      id: object.id,
      objectTypeId: object.objectTypeId,
      name: object.name,
      image: String(definition?.image ?? ''),
      behavior: normalizeWorldObjectBehavior(definition?.behavior),
      tileX: object.tileX,
      tileY: object.tileY,
      blocksMovement: object.blocksMovement,
      renderLayer: normalizeWorldObjectRenderLayer(object.renderLayer || definition?.renderLayer),
      examineText: object.examineText,
    };
  }

  return objects;
}

function makeSnapshot(now, viewerPlayerId = null) {
  const viewerPlayer = viewerPlayerId
    ? clients.get(viewerPlayerId)?.player ?? null
    : null;
  const players = {};

  for (const [id, client] of clients.entries()) {
    players[id] = {
      id,
      displayName: client.player.displayName,
      tileX: client.player.tileX,
      tileY: client.player.tileY,
      x: client.player.tileX * TILE_SIZE + TILE_SIZE * 0.5,
      y: client.player.tileY * TILE_SIZE + TILE_SIZE * 0.5,
      routeId: client.player.routeId ?? null,
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
        smithing: {
          xp: client.player.skills.smithing.xp,
          level: client.player.skills.smithing.level,
        },
        fletching: {
          xp: client.player.skills.fletching.xp,
          level: client.player.skills.fletching.level,
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
    npcs: getNpcSnapshot(viewerPlayer),
    objects: getObjectSnapshot(),
    shops: getShopSnapshot(),
    enemies: getEnemySnapshot(now),
    groundItems: getGroundItemSnapshot(viewerPlayerId, now),
  };
}

function attemptStep(player, stepX, stepY) {
  return movementService.attemptStep(player, stepX, stepY);
}

function hasReachedTarget(player) {
  return movementService.hasReachedTarget(player);
}

function stepTowardTarget(entity) {
  return movementService.stepTowardTarget(entity);
}

function stepWithDirection(player) {
  return movementService.stepWithDirection(player);
}

function stepPlayerIfPossible(player, nowMs) {
  return movementService.stepPlayerIfPossible(player, nowMs);
}

function isWithinInteractionRange(player, node) {
  const manhattanDistance = Math.abs(player.tileX - node.tileX) + Math.abs(player.tileY - node.tileY);
  return manhattanDistance <= INTERACTION_RANGE_TILES;
}

function processInteraction(player, nowMs) {
  processInteractionFromSystem(player, nowMs, {
    getWorldNodeById: (nodeId) => worldNodes.get(nodeId),
    isWithinInteractionRange,
    getResourceName,
    getHarvestResourceConfig,
    interpolateTemplate,
    rollDepletionHits,
    getPlayerSkillActionBonuses,
    harvestSuccessChanceBonusMax: HARVEST_SUCCESS_CHANCE_BONUS_MAX,
    harvestSuccessChanceBonusPerLevel: HARVEST_SUCCESS_CHANCE_BONUS_PER_LEVEL,
    clamp01,
    rollDepletionDurationMs,
    pickWeightedDrop,
    getItemDefinition,
    randomIntBetween,
    addItemToInventory,
    applyQuestObjectiveProgress,
    addSkillXp,
  });
}

function createPlayerCombatDeps() {
  return {
    getEnemyById: (enemyId) => worldEnemies.get(enemyId),
    resolvePlayerCombatPositioning: (attacker, targetEnemy) =>
      playerCombatPositioningPolicy.resolvePositioning(attacker, targetEnemy),
    resolvePlayerAttack: (attacker, targetEnemy, tickNowMs) =>
      playerCombatResolutionService.resolvePlayerAttack(attacker, targetEnemy, tickNowMs),
  };
}

function createEnemyAiDeps() {
  return {
    forEachEnemy: (handler) => {
      for (const enemy of worldEnemies.values()) {
        handler(enemy);
      }
    },
    setPathTarget,
    stepTowardTarget,
    shouldSkipEnemyForDeath: (enemy, tickNowMs) => enemyStateService.shouldSkipForDeath(enemy, tickNowMs),
    applyEnemyRegeneration: (enemy, tickNowMs) => enemyStateService.applyRegeneration(enemy, tickNowMs),
    handleEnemyOutOfChaseRange: (enemy, tickNowMs) => enemyStateService.handleOutOfChaseRange(enemy, tickNowMs),
    handleEnemyNoTarget: (enemy, tickNowMs) => enemyStateService.handleNoTarget(enemy, tickNowMs),
    selectAggroTargetEntry: (enemy) =>
      combatTargetingPolicy.selectAggroTargetEntry(enemy, (handler) => {
        for (const [playerId, client] of clients.entries()) {
          handler(playerId, client);
        }
      }),
    isEnemyInAttackRange: (enemy, targetPlayer) =>
      enemyCombatPositioningPolicy.isInAttackRange(enemy, targetPlayer),
    enterEnemyAttackStance: (enemy) => enemyCombatPositioningPolicy.enterAttackStance(enemy),
    resolveEnemyAttack: (enemy, targetPlayer, tickNowMs) =>
      enemyCombatResolutionService.resolveEnemyAttack(enemy, targetPlayer, tickNowMs),
    updateEnemyPursuitPath: (enemy, targetPlayer) =>
      enemyNavigationPolicy.updatePursuitPath(enemy, targetPlayer),
    stepEnemyTowardPursuitTarget: (enemy, tickNowMs) =>
      enemyNavigationPolicy.stepTowardPursuitTarget(enemy, tickNowMs),
  };
}

function processPlayerCombat(player, nowMs) {
  processPlayerCombatFromSystem(player, nowMs, createPlayerCombatDeps());
}

function processEnemyAi(nowMs) {
  processEnemyAiFromSystem(nowMs, createEnemyAiDeps());
}

let previousTick = Date.now();
let lastStateLogAt = 0;
setInterval(() => {
  const now = Date.now();
  const dtMs = Math.min(now - previousTick, 150);
  previousTick = now;

  for (const client of clients.values()) {
    normalizePlayerContainersForCurrentItems(client.player);
    const previousTileX = client.player.tileX;
    const previousTileY = client.player.tileY;
    stepPlayerIfPossible(client.player, now);
    if (client.player.tileX !== previousTileX || client.player.tileY !== previousTileY) {
      applyQuestProgressEvent(client.player, {
        type: 'travel',
        tileX: client.player.tileX,
        tileY: client.player.tileY,
      });
    }
    processInteraction(client.player, now);
    processPlayerCombat(client.player, now);
    processPlayerTerrainEffects(client.player, dtMs);
    processPlayerHealthRegeneration(client.player, now);
    processActiveCrafting(client.player, now);
  }

  processEnemyAi(now);
  processGroundItemLifecycle(now);

  for (const [clientId, client] of clients.entries()) {
    if (client.socket.readyState !== 1) {
      continue;
    }

    client.socket.send(
      JSON.stringify({
        type: 'state',
        ...makeSnapshot(now, clientId),
      }),
    );
  }

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

wss.on('connection', (socket) => {
  const id = randomUUID();
  let accountId = null;
  let authAttempts = 0;

  function completeAuthentication(account, token) {
    accountId = account.accountId;
    const profileId = buildProfileIdForAccount(account.accountId);
    const player = createPlayer(id);
    player.displayName = account.username;

    const persistedProfile = playerProfiles[profileId];
    if (persistedProfile) {
      applyPersistedProfile(player, persistedProfile);
      player.displayName = account.username;
    } else {
      playerProfiles[profileId] = capturePlayerProfile(player);
      savePlayerProfiles(playerProfiles);
    }

    clients.set(id, { socket, player, profileId, accountId: account.accountId });
    log('player_connected', { id, players: clients.size, accountId: account.accountId });

    socket.send(
      JSON.stringify({
        type: 'authOk',
        token,
        username: account.username,
      }),
    );

    socket.send(
      JSON.stringify({
        type: 'welcome',
        id,
        ...makeSnapshot(Date.now(), id),
      }),
    );

    sendQuestJournalToPlayer(player);

    broadcast({
      type: 'playerJoined',
      player: {
        id,
        displayName: player.displayName,
        tileX: player.tileX,
        tileY: player.tileY,
        x: player.tileX * TILE_SIZE + TILE_SIZE * 0.5,
        y: player.tileY * TILE_SIZE + TILE_SIZE * 0.5,
        routeId: player.routeId ?? null,
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
          smithing: {
            xp: player.skills.smithing.xp,
            level: player.skills.smithing.level,
          },
          fletching: {
            xp: player.skills.fletching.xp,
            level: player.skills.fletching.level,
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
  }

  socket.send(
    JSON.stringify({
      type: 'authRequired',
      usernamePattern: '^[a-z0-9_]{3,24}$',
      passwordPolicy: '8-128 characters',
    }),
  );

  socket.on('message', (rawMessage) => {
    try {
      const message = JSON.parse(rawMessage.toString());

      const client = clients.get(id);
      if (!client) {
        const messageType = String(message?.type ?? '');
        if (messageType !== 'authRegister' && messageType !== 'authLogin' && messageType !== 'authToken') {
          socket.send(
            JSON.stringify({
              type: 'authError',
              reason: 'Authentication required before joining the world.',
            }),
          );
          return;
        }

        authAttempts += 1;
        if (authAttempts > MAX_AUTH_ATTEMPTS_PER_CONNECTION) {
          socket.close(1008, 'Too many auth attempts');
          return;
        }

        if (messageType === 'authRegister') {
          const registration = registerAccount(message.username, message.password);
          if (!registration.ok) {
            socket.send(JSON.stringify({ type: 'authError', reason: registration.reason }));
            return;
          }

          const token = createAuthToken(AUTH_SECRET, registration.account);
          completeAuthentication(registration.account, token);
          return;
        }

        if (messageType === 'authLogin') {
          const login = loginAccount(message.username, message.password);
          if (!login.ok) {
            socket.send(JSON.stringify({ type: 'authError', reason: login.reason }));
            return;
          }

          const token = createAuthToken(AUTH_SECRET, login.account);
          completeAuthentication(login.account, token);
          return;
        }

        if (messageType === 'authToken') {
          const payload = verifyAuthToken(AUTH_SECRET, message.token);
          if (!payload) {
            socket.send(JSON.stringify({ type: 'authError', reason: 'Session expired or invalid. Please login again.' }));
            return;
          }

          const account = accountsById[payload.accountId];
          if (!account || normalizeUsername(account.username) !== normalizeUsername(payload.username)) {
            socket.send(JSON.stringify({ type: 'authError', reason: 'Account session no longer valid.' }));
            return;
          }

          const refreshedToken = createAuthToken(AUTH_SECRET, account);
          completeAuthentication(account, refreshedToken);
          return;
        }

        return;
      }

      const player = client.player;

      if (message.type === 'input') {
        const directionX = Number(message.directionX ?? 0);
        const directionY = Number(message.directionY ?? 0);
        const length = Math.hypot(directionX, directionY);

        player.targetTileX = null;
        player.targetTileY = null;
        player.targetPath = [];
        player.routeId = null;
        player.routeDestinationTileX = null;
        player.routeDestinationTileY = null;
        player.combatTargetEnemyId = null;
        player.activeBankObjectId = null;
        clearActiveCraftingContext(player);

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
        const requestedRouteId = String(message.routeId ?? '').trim();

        if (!Number.isFinite(requestedTileX) || !Number.isFinite(requestedTileY)) {
          return;
        }

        const tileX = clamp(Math.round(requestedTileX), 1, WORLD_WIDTH_TILES - 2);
        const tileY = clamp(Math.round(requestedTileY), 1, WORLD_HEIGHT_TILES - 2);

        traceInteraction('server.moveTo.request', {
          id,
          requestedTileX,
          requestedTileY,
          clampedTileX: tileX,
          clampedTileY: tileY,
          playerTileX: player.tileX,
          playerTileY: player.tileY,
          currentTargetTileX: player.targetTileX,
          currentTargetTileY: player.targetTileY,
          currentTargetPathLength: Array.isArray(player.targetPath) ? player.targetPath.length : null,
        });

        const hasPath = setPathTarget(player, tileX, tileY);
        if (!hasPath) {
          traceInteraction('server.moveTo.noPath', {
            id,
            tileX,
            tileY,
            playerTileX: player.tileX,
            playerTileY: player.tileY,
          });
          player.lastActionText = 'No path to destination';
          return;
        }

        player.routeId = requestedRouteId || createRouteId();
        player.routeDestinationTileX = player.targetTileX;
        player.routeDestinationTileY = player.targetTileY;

        player.combatTargetEnemyId = null;
        player.activeBankObjectId = null;
        clearActiveCraftingContext(player);

        stepPlayerIfPossible(player, Date.now());

        traceInteraction('server.moveTo.pathSet', {
          id,
          routeId: player.routeId,
          tileX,
          tileY,
          playerTileX: player.tileX,
          playerTileY: player.tileY,
          targetTileX: player.targetTileX,
          targetTileY: player.targetTileY,
          targetPathLength: Array.isArray(player.targetPath) ? player.targetPath.length : null,
          nextMoveAllowedAt: player.nextMoveAllowedAt,
        });

        log('player_move_to', {
          id,
          routeId: player.routeId,
          tileX,
          tileY,
        });
        return;
      }

      if (message.type === 'routeArrived') {
        const arrivedRouteId = String(message.routeId ?? '').trim();
        if (!arrivedRouteId || arrivedRouteId !== String(player.routeId ?? '')) {
          return;
        }

        const expectedTileX = Number(player.routeDestinationTileX);
        const expectedTileY = Number(player.routeDestinationTileY);
        const reportedTileX = Number(message.tileX);
        const reportedTileY = Number(message.tileY);
        if (
          !Number.isFinite(expectedTileX)
          || !Number.isFinite(expectedTileY)
          || !Number.isFinite(reportedTileX)
          || !Number.isFinite(reportedTileY)
        ) {
          return;
        }

        if (Math.round(reportedTileX) !== Math.round(expectedTileX)
          || Math.round(reportedTileY) !== Math.round(expectedTileY)
        ) {
          return;
        }

        const destinationTileX = Math.round(expectedTileX);
        const destinationTileY = Math.round(expectedTileY);
        const manhattanDistance =
          Math.abs(player.tileX - destinationTileX) + Math.abs(player.tileY - destinationTileY);
        if (manhattanDistance > 1) {
          return;
        }

        player.previousTraversedTileX = player.tileX;
        player.previousTraversedTileY = player.tileY;
        player.tileX = destinationTileX;
        player.tileY = destinationTileY;
        player.targetTileX = null;
        player.targetTileY = null;
        player.targetPath = [];
        player.routeId = null;
        player.routeDestinationTileX = null;
        player.routeDestinationTileY = null;
        player.nextMoveAllowedAt = Date.now();

        traceInteraction('server.routeArrived.accepted', {
          id,
          routeId: arrivedRouteId,
          destinationTileX,
          destinationTileY,
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
        player.activeBankObjectId = null;
        clearActiveCraftingContext(player);

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
        player.activeBankObjectId = null;
        clearActiveCraftingContext(player);
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

        const groundItem = dropItemToGround({
          itemId: dropped.itemId,
          quantity: dropped.quantity,
          tileX: player.tileX,
          tileY: player.tileY,
          ownerPlayerId: player.id,
          nowMs: Date.now(),
        });
        if (!groundItem) {
          sendChatToSocket(socket, '[Inventory] Could not place that item on the ground.');
          return;
        }

        const quantityText = dropped.quantity > 1 ? ` x${dropped.quantity}` : '';
        player.lastActionText = `Dropped ${dropped.name}${quantityText}`;
        sendChatToSocket(socket, `[Inventory] Dropped ${dropped.name}${quantityText}.`);
        return;
      }

      if (message.type === 'groundItemPickup') {
        const result = tryPickupGroundItem(player, message.groundItemId, Date.now());
        if (!result.ok) {
          sendChatToSocket(socket, `[Loot] ${result.reason}`);
          return;
        }

        const quantityText = result.quantity > 1 ? ` x${result.quantity}` : '';
        player.lastActionText = `Picked up ${result.itemName}${quantityText}`;
        sendChatToSocket(socket, `[Loot] Picked up ${result.itemName}${quantityText}.`);
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
        const npcId = String(message.npcId ?? '').trim();
        const npc = getNpcById(npcId);
        if (!npc || !isWithinNpcRange(player, npc)) {
          return;
        }

        if (npcId) {
          applyQuestProgressEvent(player, {
            type: 'talk_to_npc',
            npcId,
            tileX: player.tileX,
            tileY: player.tileY,
          });
        }

        const dialogueQuest = selectNpcDialogueQuest(player, npc);
        const dialogue = buildQuestDialogueState(player, npc, dialogueQuest);
        sendQuestDialogueToSocket(socket, dialogue);
        sendQuestJournalToPlayer(player);
        return;
      }

      if (message.type === 'questDialogueAction') {
        const npcId = String(message.npcId ?? '').trim();
        const action = String(message.action ?? '').trim();
        const requestedQuestId = String(message.questId ?? '').trim();
        const npc = getNpcById(npcId);
        if (!npc || !isWithinNpcRange(player, npc)) {
          return;
        }

        const quest = selectNpcDialogueQuest(player, npc, requestedQuestId);
        if (!quest) {
          sendQuestDialogueToSocket(socket, {
            open: false,
            npcId,
            npcName: npc.name,
            questId: null,
            mode: 'ambient',
            text: '',
            options: [],
          });
          return;
        }

        if (requestedQuestId && requestedQuestId !== quest.id) {
          return;
        }

        const status = getNpcQuestStatus(player, quest);
        const dialogue = buildQuestDialogueState(player, npc, quest);
        const allowedActions = new Set(dialogue.options.map((option) => option.action));
        if (!allowedActions.has(action)) {
          return;
        }

        if (action === 'accept' && status === 'not_started') {
          startNpcQuestForPlayer(player, npc, quest);
        } else if (action === 'turnin' && status === 'completable') {
          completeNpcQuestForPlayer(player, npc, quest);
        }

        if (action === 'close' || action === 'decline' || action === 'continue') {
          sendQuestDialogueToSocket(socket, {
            open: false,
            npcId,
            npcName: npc.name,
            questId: quest.id,
            mode: 'ambient',
            text: '',
            options: [],
          });
          sendQuestJournalToPlayer(player);
          return;
        }

        const updatedDialogue = buildQuestDialogueState(player, npc, quest);
        sendQuestDialogueToSocket(socket, updatedDialogue);
        sendQuestJournalToPlayer(player);
        return;
      }

      if (message.type === 'questJournalSelect') {
        const questId = String(message.questId ?? '').trim();
        player.questJournalSelectedQuestId = questId || null;
        sendQuestJournalToPlayer(player);
        return;
      }

      if (message.type === 'bankOpen') {
        const result = handleBankOpen(player, message.objectId);
        if (!result.ok) {
          sendChatToSocket(socket, result.reason);
          return;
        }

        sendBankSnapshotToSocket(socket, player);
        return;
      }

      if (message.type === 'craftingOpen') {
        const objectId = String(message.objectId ?? '');
        const objectEntry = WORLD_MAP_DATA.objects.find((entry) => entry.id === objectId) ?? null;

        traceInteraction('server.craftingOpen.request', {
          id,
          objectId,
          playerTileX: player.tileX,
          playerTileY: player.tileY,
        });

        if (!objectEntry) {
          traceInteraction('server.craftingOpen.objectMissing', {
            id,
            objectId,
          });
          sendChatToSocket(socket, '[Crafting] That workstation could not be found.');
          return;
        }

        const station = getCraftingStationByObjectType(objectEntry.objectTypeId);
        if (!station) {
          traceInteraction('server.craftingOpen.notCraftingObject', {
            id,
            objectId,
            objectTypeId: objectEntry.objectTypeId,
          });
          sendChatToSocket(socket, '[Crafting] That object is not a crafting workstation.');
          return;
        }

        const inRange = isWithinRange(
          player.tileX,
          player.tileY,
          objectEntry.tileX,
          objectEntry.tileY,
          INTERACTION_RANGE_TILES,
        );
        traceInteraction('server.craftingOpen.rangeCheck', {
          id,
          objectId,
          objectTypeId: objectEntry.objectTypeId,
          playerTileX: player.tileX,
          playerTileY: player.tileY,
          objectTileX: objectEntry.tileX,
          objectTileY: objectEntry.tileY,
          inRange,
          interactionRangeTiles: INTERACTION_RANGE_TILES,
        });

        if (!inRange) {
          sendChatToSocket(socket, '[Crafting] Move closer to the workstation.');
          return;
        }

        player.activeBankObjectId = null;
        player.activeCraftingObjectId = objectEntry.id;
        player.activeCraftingStationType = station.stationType;

        traceInteraction('server.craftingOpen.success', {
          id,
          objectId: objectEntry.id,
          stationType: station.stationType,
        });

        applyQuestProgressEvent(player, {
          type: 'interact_object',
          objectId: objectEntry.id,
          objectTypeId: objectEntry.objectTypeId,
          tileX: player.tileX,
          tileY: player.tileY,
          amount: 1,
        });

        sendCraftingOpenToSocket(socket, player, station, objectEntry.id);
        sendCraftingProgressToPlayer(player);
        return;
      }

      if (message.type === 'craftingMake') {
        if (player.activeCraftingJob) {
          sendChatToSocket(socket, '[Crafting] You are already crafting.');
          return;
        }

        const objectId = String(message.objectId ?? player.activeCraftingObjectId ?? '');
        const objectEntry = WORLD_MAP_DATA.objects.find((entry) => entry.id === objectId) ?? null;
        if (!objectEntry) {
          sendChatToSocket(socket, '[Crafting] That workstation could not be found.');
          return;
        }

        const station = getCraftingStationByObjectType(objectEntry.objectTypeId);
        if (!station) {
          sendChatToSocket(socket, '[Crafting] That object is not a crafting workstation.');
          return;
        }

        if (!isWithinRange(player.tileX, player.tileY, objectEntry.tileX, objectEntry.tileY, INTERACTION_RANGE_TILES)) {
          sendChatToSocket(socket, '[Crafting] Move closer to the workstation.');
          return;
        }

        player.activeBankObjectId = null;
        player.activeCraftingObjectId = objectEntry.id;
        player.activeCraftingStationType = station.stationType;

        const quantity = Math.max(1, Math.min(28, Math.floor(Number(message.quantity ?? 1))));

        const resolvedRecipe = resolveCraftingRequest(station.stationType, message.recipeId);
        if (!resolvedRecipe) {
          sendChatToSocket(socket, '[Crafting] Unknown recipe.');
          return;
        }

        const skillState = player.skills?.[resolvedRecipe.station.xpSkill] ?? { level: 1 };
        const requiredLevel = Math.max(1, Math.floor(Number(resolvedRecipe.recipe.requiredLevel ?? 1)));
        if (Math.max(1, Math.floor(Number(skillState.level ?? 1))) < requiredLevel) {
          sendChatToSocket(socket, `[Crafting] Requires ${resolvedRecipe.station.xpSkill} level ${requiredLevel}.`);
          return;
        }

        if (!hasRequiredItemsForCraftingRecipe(player, resolvedRecipe.recipe)) {
          sendChatToSocket(socket, '[Crafting] You do not have the required materials.');
          return;
        }

        if (!canReceiveCraftingRecipeOutputs(player, resolvedRecipe.recipe)) {
          sendChatToSocket(socket, '[Crafting] Not enough inventory space.');
          return;
        }

        const craftableQuantity = getMaxCraftableCountForRecipe(player, resolvedRecipe.recipe, quantity);
        if (craftableQuantity <= 0) {
          sendChatToSocket(socket, '[Crafting] You do not have the required materials.');
          return;
        }

        const now = Date.now();
        player.activeCraftingJob = {
          objectId: objectEntry.id,
          stationType: station.stationType,
          recipeId: resolvedRecipe.snapshot.id,
          recipeName: resolvedRecipe.snapshot.name,
          durationMs: Math.max(100, Math.floor(Number(resolvedRecipe.snapshot.durationMs ?? 1000))),
          totalCount: craftableQuantity,
          completedCount: 0,
          startedAt: now,
          currentCraftStartedAt: now,
          currentCraftEndsAt: now + Math.max(100, Math.floor(Number(resolvedRecipe.snapshot.durationMs ?? 1000))),
          nextProgressAt: now,
          nextDebugAt: now,
        };

        player.lastActionText = `Crafting ${resolvedRecipe.snapshot.name}`;
        sendChatToSocket(
          socket,
          `[Crafting] Started crafting ${resolvedRecipe.snapshot.name} x${craftableQuantity} (${(player.activeCraftingJob.durationMs / 1000).toFixed(1)}s per item).`,
        );
        sendCraftingDebugToPlayer(
          player,
          `start station=${station.stationType} object=${objectEntry.id} recipe=${resolvedRecipe.snapshot.id} durationMs=${player.activeCraftingJob.durationMs} startedAt=${now} endsAt=${player.activeCraftingJob.currentCraftEndsAt}`,
        );

        sendCraftingOpenToSocket(socket, player, station, objectEntry.id);
        sendCraftingProgressToPlayer(player);
        return;
      }

      if (message.type === 'craftingCancel') {
        const requestedObjectId = String(message.objectId ?? '').trim();
        if (!player.activeCraftingJob) {
          sendCraftingProgressToPlayer(player);
          return;
        }

        if (requestedObjectId && requestedObjectId !== String(player.activeCraftingJob.objectId ?? '')) {
          return;
        }

        clearActiveCraftingJob(player);
        player.lastActionText = 'Crafting cancelled';
        sendChatToSocket(socket, '[Crafting] Crafting cancelled.');

        const objectId = String(player.activeCraftingObjectId ?? requestedObjectId ?? '').trim();
        const objectEntry = WORLD_MAP_DATA.objects.find((entry) => entry.id === objectId) ?? null;
        if (objectEntry) {
          const station = getCraftingStationByObjectType(objectEntry.objectTypeId);
          if (station) {
            sendCraftingOpenToSocket(socket, player, station, objectEntry.id);
          }
        }
        return;
      }

      if (message.type === 'bankTransfer') {
        const result = handleBankTransfer(player, message);
        if (result.skipped) {
          return;
        }

        if (!result.ok) {
          sendChatToSocket(socket, result.reason);
          return;
        }

        sendBankSnapshotToSocket(socket, player);
        return;
      }

      if (message.type === 'shopOpen') {
        const payload = handleShopOpen(player, message.npcId);
        if (!payload) {
          return;
        }

        socket.send(
          JSON.stringify({
            type: 'shopOpen',
            shopId: payload.shopId,
          }),
        );
        return;
      }

      if (message.type === 'shopBuy') {
        const result = handleShopBuy(player, message);
        if (!result.ok) {
          if (!result.silent) {
            sendChatToSocket(socket, result.reason);
          }
          return;
        }

        sendChatToSocket(socket, result.chatText);
        return;
      }

      if (message.type === 'shopSell') {
        const result = handleShopSell(player, message);
        if (!result.ok) {
          if (!result.silent) {
            sendChatToSocket(socket, result.reason);
          }
          return;
        }

        sendChatToSocket(socket, result.chatText);
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
    if (client) {
      broadcast({ type: 'playerLeft', id });
      log('player_disconnected', { id, players: clients.size, accountId });
    }
  });
});

console.log(`Multiplayer server listening on ws://127.0.0.1:${SERVER_PORT}`);
