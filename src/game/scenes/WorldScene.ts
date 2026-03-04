import Phaser from 'phaser';
import {
  MAP_HEIGHT_TILES,
  MAP_WIDTH_TILES,
  TILE_SIZE,
} from '../config/gameConfig';
import {
  type CraftingOpenState,
  type CraftingProgressState,
  type CraftingRecipeState,
  type ChatMessageState,
  type EquipmentSlotName,
  type EnemyState,
  type GroundItemState,
  type ItemGearStats,
  type InventoryState,
  MultiplayerClient,
  type NpcState,
  type QuestDialogueState,
  type QuestJournalState,
  type QuestNotificationState,
  type RemotePlayerState,
  type ShopState,
  type WorldObjectState,
  type WorldNodeState,
  type WorldSnapshot,
} from '../net/MultiplayerClient';
import { generateTerrainData } from '../world/generateTerrainData';
import { InteractionTargetRuntime } from '../application/interaction/InteractionTargetRuntime';
import { WorldSceneOrchestrator } from '../application/orchestration/WorldSceneOrchestrator';
import { PendingInteractionController } from '../application/interaction/PendingInteractionController';
import { createBankPanel } from '../ui/panels/bankPanel';
import { createCharacterPanel } from '../ui/panels/characterPanel';
import { createChatPanel } from '../ui/panels/chatPanel';
import { createCraftingPanel } from '../ui/panels/craftingPanel';
import { createQuestDialoguePanel } from '../ui/panels/questDialoguePanel';
import { createQuestJournalPanel } from '../ui/panels/questJournalPanel';
import { createQuestNotificationFeed } from '../ui/panels/questNotificationFeed';
import { createShopPanel } from '../ui/panels/shopPanel';
import {
  type ClickFeedbackKind,
  type InteractionTarget,
  type InteractionTargetType,
  type SkillLevelSnapshot,
} from '../domain/interaction/interactionTypes';
import {
  styleNodeSprite as applyNodeSpriteStyling,
  styleNpcSprite as applyNpcSpriteStyling,
  styleObjectSprite as applyObjectSpriteStyling,
} from '../renderers/entitySpriteStyling';
import {
  syncNodeVisuals,
  syncNpcVisuals,
  syncObjectVisuals,
} from '../renderers/staticEntitySnapshotRenderer';
import {
  syncEnemyVisuals,
  syncGroundItemVisuals,
} from '../renderers/dynamicEntitySnapshotRenderer';
import {
  pruneRemotePlayerVisuals,
  removeRemotePlayerVisual,
  upsertRemotePlayerVisual,
} from '../renderers/remotePlayerSnapshotRenderer';

const TERRAIN_TEXTURE_KEY = 'terrain-tiles';
const PLAYER_TEXTURE_KEY = 'player';
const TREE_TEXTURE_KEY = 'resource-tree';
const ROCK_TEXTURE_KEY = 'resource-rock';
const ENEMY_TEXTURE_KEY = 'player';
const HARVEST_AXE_TEXTURE_KEY = 'harvest-indicator-axe';
const HARVEST_PICKAXE_TEXTURE_KEY = 'harvest-indicator-pickaxe';
const WATER_TILE_ID = 2;
const INPUT_SEND_INTERVAL_MS = 50;
const CARDINAL_MOVE_DURATION_MS = 200;
const DIAGONAL_MOVE_DURATION_MS = Math.round(CARDINAL_MOVE_DURATION_MS * 1.65);
const CARDINAL_MOVE_TILES_PER_MS = 1 / CARDINAL_MOVE_DURATION_MS;
const DIAGONAL_MOVE_TILES_PER_MS = Math.SQRT2 / DIAGONAL_MOVE_DURATION_MS;
const HEALTH_BAR_VISIBLE_MS = 3000;
const ACTIVE_QUESTS_EXPANDED_STORAGE_KEY = 'game-active-quests-expanded-v1';
const QUEST_DIALOGUE_RETRY_INTERVAL_MS = 350;
const QUEST_DIALOGUE_RETRY_TIMEOUT_MS = 9000;
const MINIMAP_MARGIN_PX = 12;
const MINIMAP_PADDING_PX = 12;
const MINIMAP_INNER_SIZE_PX = 320;
const MINIMAP_VIEW_RADIUS_TILES = 27;
const MINIMAP_COLLAPSED_SIZE_PX = 28;
const MINIMAP_REDRAW_INTERVAL_MS = 90;
const HEALTH_BAR_WIDTH = 26;
const HEALTH_BAR_HEIGHT = 4;
const WORLD_DEPTH_BASE = 2;
const WORLD_DEPTH_Y_SCALE = 0.01;
const WORLD_DEPTH_FOREGROUND = 45;
const DEBUG_HUD_VISIBLE_BY_DEFAULT =
  String(import.meta.env.VITE_DEBUG_HUD ?? 'false').toLowerCase() === 'true';
const DEBUG_INTERACTION_TRACE =
  String(import.meta.env.VITE_DEBUG_INTERACTION ?? 'true').toLowerCase() === 'true';
const WORLD_MAP_URL = `${import.meta.env.BASE_URL}data/worldMap.json`;
const TILE_TYPES_URL = `${import.meta.env.BASE_URL}data/tileTypes.json`;
const TERRAIN_TILESET_CONFIG_URL = `${import.meta.env.BASE_URL}data/terrainTileset.json`;
const DEFAULT_TERRAIN_TILESET_URL = `${import.meta.env.BASE_URL}assets/terrain/terrain_tileset.png`;
const PLAYER_APPEARANCE_URL = `${import.meta.env.BASE_URL}data/playerAppearance.json`;

type TerrainTileDefinition = {
  id?: unknown;
  walkable?: unknown;
  moveSpeedMultiplier?: unknown;
  damagePerSecond?: unknown;
};

type TerrainTileBehavior = {
  walkable: boolean;
  moveSpeedMultiplier: number;
  damagePerSecond: number;
};

type PlayerAppearanceConfig = {
  image?: string;
};

type TerrainTilesetRuntimeDefinition = {
  id: string;
  label: string;
  url: string;
  sourceTileSize: number;
};

type TerrainRuntimeData = {
  terrain: number[][];
  terrainTilesetIndices: number[][];
  terrainTilesets: TerrainTilesetRuntimeDefinition[];
};

const RESOURCE_MINIMAP_COLORS: Record<string, number> = {
  birch_tree: 0x9ed37c,
  oak_tree: 0x4a8f3a,
  copper_rock: 0xc9834f,
  tin_rock: 0xa8b7c7,
  iron_rock: 0x7f8c98,
};

function isValidTerrainGrid(value: unknown): value is number[][] {
  return Array.isArray(value)
    && value.length === MAP_HEIGHT_TILES
    && value.every(
      (row) => Array.isArray(row)
        && row.length === MAP_WIDTH_TILES
        && row.every((tile) => Number.isFinite(tile)),
    );
}

function toTerrainGrid(source: number[][]): number[][] {
  return source.map((row) => row.map((tile) => Number(tile)));
}

function createFilledTerrainGrid(width: number, height: number, fill: number): number[][] {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => fill));
}

function normalizeTerrainTilesetSourceTileSize(value: unknown): number {
  const parsed = Math.floor(Number(value));
  return parsed === 48 ? 48 : TILE_SIZE;
}

function normalizeTerrainTilesets(value: unknown): TerrainTilesetRuntimeDefinition[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const candidate = entry as Record<string, unknown>;
      const id = String(candidate.id ?? '').trim() || `terrain-tileset-${index + 1}`;
      const label = String(candidate.label ?? '').trim() || `Tileset ${index + 1}`;
      const url = String(candidate.url ?? '').trim();
      if (!url) {
        return null;
      }

      return {
        id,
        label,
        url,
        sourceTileSize: normalizeTerrainTilesetSourceTileSize(candidate.sourceTileSize),
      } satisfies TerrainTilesetRuntimeDefinition;
    })
    .filter((entry): entry is TerrainTilesetRuntimeDefinition => entry !== null);
}

function createFilledTerrainTilesetIndexGrid(width: number, height: number, fill: number): number[][] {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => fill));
}

function isRectangularTerrainGrid(value: unknown): value is number[][] {
  if (!Array.isArray(value) || value.length === 0) {
    return false;
  }

  const width = Array.isArray(value[0]) ? value[0].length : 0;
  if (width <= 0) {
    return false;
  }

  return value.every(
    (row) => Array.isArray(row)
      && row.length === width
      && row.every((tile) => Number.isFinite(tile)),
  );
}

function extractTerrainRuntimeDataFromWorldMap(raw: unknown): TerrainRuntimeData | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const mapData = raw as {
    terrain?: unknown;
    terrainTilesetIndices?: unknown;
    terrainTilesets?: unknown;
    chunkWidth?: unknown;
    chunkHeight?: unknown;
    chunks?: Array<{
      chunkX?: number;
      chunkY?: number;
      terrain?: unknown;
      terrainTilesetIndices?: unknown;
    }>;
  };

  const terrainTilesets = normalizeTerrainTilesets(mapData.terrainTilesets);

  if (isRectangularTerrainGrid(mapData.terrain)) {
    const terrain = toTerrainGrid(mapData.terrain);
    const height = terrain.length;
    const width = terrain[0]?.length ?? 0;
    const terrainTilesetIndices = isRectangularTerrainGrid(mapData.terrainTilesetIndices)
      && mapData.terrainTilesetIndices.length === height
      && mapData.terrainTilesetIndices.every((row) => row.length === width)
      ? toTerrainGrid(mapData.terrainTilesetIndices)
      : createFilledTerrainTilesetIndexGrid(width, height, 0);
    return {
      terrain,
      terrainTilesetIndices,
      terrainTilesets,
    };
  }

  if (isValidTerrainGrid(mapData.terrain)) {
    const terrain = toTerrainGrid(mapData.terrain);
    const terrainTilesetIndices = isValidTerrainGrid(mapData.terrainTilesetIndices)
      ? toTerrainGrid(mapData.terrainTilesetIndices)
      : createFilledTerrainTilesetIndexGrid(MAP_WIDTH_TILES, MAP_HEIGHT_TILES, 0);
    return {
      terrain,
      terrainTilesetIndices,
      terrainTilesets,
    };
  }

  if (!Array.isArray(mapData.chunks)) {
    return null;
  }

  const chunkWidth = Math.max(1, Math.floor(Number(mapData.chunkWidth ?? MAP_WIDTH_TILES)));
  const chunkHeight = Math.max(1, Math.floor(Number(mapData.chunkHeight ?? MAP_HEIGHT_TILES)));

  const validChunks = mapData.chunks
    .map((entry) => {
      const chunkX = Number(entry?.chunkX);
      const chunkY = Number(entry?.chunkY);
      const terrain = entry?.terrain;
      const terrainTilesetIndices = entry?.terrainTilesetIndices;

      const isChunkTerrainValid = Array.isArray(terrain)
        && terrain.length === chunkHeight
        && terrain.every((row) => Array.isArray(row) && row.length === chunkWidth);

      const hasValidTerrainTilesetIndices = Array.isArray(terrainTilesetIndices)
        && terrainTilesetIndices.length === chunkHeight
        && terrainTilesetIndices.every((row) => Array.isArray(row) && row.length === chunkWidth);

      if (!Number.isFinite(chunkX) || !Number.isFinite(chunkY) || !isChunkTerrainValid) {
        return null;
      }

      return {
        chunkX: Math.trunc(chunkX),
        chunkY: Math.trunc(chunkY),
        terrain: terrain as number[][],
        terrainTilesetIndices: hasValidTerrainTilesetIndices
          ? (terrainTilesetIndices as number[][])
          : createFilledTerrainTilesetIndexGrid(chunkWidth, chunkHeight, 0),
      };
    })
    .filter((entry): entry is { chunkX: number; chunkY: number; terrain: number[][]; terrainTilesetIndices: number[][] } => entry !== null);

  if (validChunks.length > 0) {
    const minChunkX = Math.min(...validChunks.map((entry) => entry.chunkX));
    const maxChunkX = Math.max(...validChunks.map((entry) => entry.chunkX));
    const minChunkY = Math.min(...validChunks.map((entry) => entry.chunkY));
    const maxChunkY = Math.max(...validChunks.map((entry) => entry.chunkY));
    const worldWidthTiles = (maxChunkX - minChunkX + 1) * chunkWidth;
    const worldHeightTiles = (maxChunkY - minChunkY + 1) * chunkHeight;
    const stitchedTerrain = createFilledTerrainGrid(worldWidthTiles, worldHeightTiles, 0);
    const stitchedTerrainTilesetIndices = createFilledTerrainTilesetIndexGrid(worldWidthTiles, worldHeightTiles, 0);

    for (const chunk of validChunks) {
      const tileOffsetX = (chunk.chunkX - minChunkX) * chunkWidth;
      const tileOffsetY = (chunk.chunkY - minChunkY) * chunkHeight;

      for (let localY = 0; localY < chunkHeight; localY += 1) {
        for (let localX = 0; localX < chunkWidth; localX += 1) {
          stitchedTerrain[tileOffsetY + localY][tileOffsetX + localX] = Number(chunk.terrain[localY][localX]);
          stitchedTerrainTilesetIndices[tileOffsetY + localY][tileOffsetX + localX] = Math.max(
            0,
            Math.floor(Number(chunk.terrainTilesetIndices[localY][localX]) || 0),
          );
        }
      }
    }

    return {
      terrain: stitchedTerrain,
      terrainTilesetIndices: stitchedTerrainTilesetIndices,
      terrainTilesets,
    };
  }

  const preferredChunk = mapData.chunks.find((entry) => entry?.chunkX === 0 && entry?.chunkY === 0);
  if (preferredChunk && isValidTerrainGrid(preferredChunk.terrain)) {
    const terrain = toTerrainGrid(preferredChunk.terrain);
    const terrainTilesetIndices = isValidTerrainGrid(preferredChunk.terrainTilesetIndices)
      ? toTerrainGrid(preferredChunk.terrainTilesetIndices)
      : createFilledTerrainTilesetIndexGrid(MAP_WIDTH_TILES, MAP_HEIGHT_TILES, 0);
    return {
      terrain,
      terrainTilesetIndices,
      terrainTilesets,
    };
  }

  const firstValidChunk = mapData.chunks.find((entry) => isValidTerrainGrid(entry?.terrain));
  if (firstValidChunk && isValidTerrainGrid(firstValidChunk.terrain)) {
    const terrain = toTerrainGrid(firstValidChunk.terrain);
    const terrainTilesetIndices = isValidTerrainGrid(firstValidChunk.terrainTilesetIndices)
      ? toTerrainGrid(firstValidChunk.terrainTilesetIndices)
      : createFilledTerrainTilesetIndexGrid(MAP_WIDTH_TILES, MAP_HEIGHT_TILES, 0);
    return {
      terrain,
      terrainTilesetIndices,
      terrainTilesets,
    };
  }

  return null;
}

interface RemotePlayerVisual {
  state: RemotePlayerState;
  sprite: Phaser.GameObjects.Sprite;
  targetTilePosition: Phaser.Math.Vector2;
  renderedTilePosition: Phaser.Math.Vector2;
  pathWaypoints: Phaser.Math.Vector2[];
  healthBar: Phaser.GameObjects.Graphics;
  healthBarVisibleUntil: number;
  harvestingIndicator: Phaser.GameObjects.Image;
  harvestingIndicatorPhase: number;
}

interface WorldNodeVisual {
  state: WorldNodeState;
  sprite: Phaser.GameObjects.Sprite;
}

interface NpcVisual {
  state: NpcState;
  sprite: Phaser.GameObjects.Sprite;
}

interface WorldObjectVisual {
  state: WorldObjectState;
  sprite: Phaser.GameObjects.Sprite;
}

interface EnemyVisual {
  state: EnemyState;
  sprite: Phaser.GameObjects.Sprite;
  targetTilePosition: Phaser.Math.Vector2;
  renderedTilePosition: Phaser.Math.Vector2;
  pathWaypoints: Phaser.Math.Vector2[];
  healthBar: Phaser.GameObjects.Graphics;
  healthBarVisibleUntil: number;
}

interface GroundItemVisual {
  state: GroundItemState;
  sprite: Phaser.GameObjects.Image;
  quantityText: Phaser.GameObjects.Text;
}

interface ContextMenuOption {
  label: string;
  onSelect?: () => void;
}

export class WorldScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Sprite;
  private terrainData: number[][] = [];
  private worldWidthTiles = MAP_WIDTH_TILES;
  private worldHeightTiles = MAP_HEIGHT_TILES;
  private localPlayerId: string | null = null;
  private localPlayerState: RemotePlayerState | null = null;
  private localTilePosition: Phaser.Math.Vector2 | null = null;
  private localRenderedTilePosition: Phaser.Math.Vector2 | null = null;
  private multiplayerClient!: MultiplayerClient;
  private debugHudRootElement: HTMLDivElement | null = null;
  private debugHudLogElement: HTMLDivElement | null = null;
  private actionStatusText!: Phaser.GameObjects.Text;
  private debugHudVisible = DEBUG_HUD_VISIBLE_BY_DEFAULT;
  private debugToggleKey: Phaser.Input.Keyboard.Key | null = null;
  private questJournalToggleKey: Phaser.Input.Keyboard.Key | null = null;
  private skillsTabToggleKey: Phaser.Input.Keyboard.Key | null = null;
  private inventoryTabToggleKey: Phaser.Input.Keyboard.Key | null = null;
  private gearTabToggleKey: Phaser.Input.Keyboard.Key | null = null;
  private lastStateUpdateAt: number | null = null;
  private snapshotCount = 0;
  private remotePlayers = new Map<string, RemotePlayerVisual>();
  private worldNodes = new Map<string, WorldNodeVisual>();
  private worldNpcs = new Map<string, NpcVisual>();
  private npcQuestMarkers = new Map<string, Phaser.GameObjects.Text>();
  private minimapRootElement: HTMLDivElement | null = null;
  private minimapCanvasElement: HTMLCanvasElement | null = null;
  private minimapCanvasContext: CanvasRenderingContext2D | null = null;
  private minimapToggleButtonElement: HTMLButtonElement | null = null;
  private minimapCollapsed = false;
  private minimapRedrawAccumulatorMs = 0;
  private worldObjects = new Map<string, WorldObjectVisual>();
  private worldEnemies = new Map<string, EnemyVisual>();
  private worldGroundItems = new Map<string, GroundItemVisual>();
  private blockedNodeTiles = new Set<string>();
  private blockedNpcTiles = new Set<string>();
  private blockedObjectTiles = new Set<string>();
  private blockedTerrainTileIds = new Set<number>([WATER_TILE_ID]);
  private pendingEntityTextureLoads = new Set<string>();
  private entityTexturePathByKey = new Map<string, string>();
  private pendingGroundItemTextureLoads = new Set<string>();
  private playerAppearance: PlayerAppearanceConfig = {
    image: '',
  };
  private terrainTilesetIndices: number[][] = [];
  private terrainTilesets: TerrainTilesetRuntimeDefinition[] = [];
  private shopDefinitions: Record<string, ShopState> = {};
  private contextMenuElement: HTMLDivElement | null = null;
  private contextMenuCloseListener: ((event: PointerEvent) => void) | null = null;
  private itemTooltipElement: HTMLDivElement | null = null;
  private chatRootElement: HTMLDivElement | null = null;
  private chatLogElement: HTMLDivElement | null = null;
  private chatInputElement: HTMLInputElement | null = null;
  private chatMessages: string[] = [];
  private characterRootElement: HTMLDivElement | null = null;
  private characterTabBarElement: HTMLDivElement | null = null;
  private activeCharacterTab: 'skills' | 'inventory' | 'gear' = 'skills';
  private skillsRootElement: HTMLDivElement | null = null;
  private skillsContentElement: HTMLDivElement | null = null;
  private inventoryContentElement: HTMLDivElement | null = null;
  private inventoryHeaderElement: HTMLDivElement | null = null;
  private inventoryGridElement: HTMLDivElement | null = null;
  private lastRenderedInventorySignature: string | null = null;
  private gearContentElement: HTMLDivElement | null = null;
  private gearGridElement: HTMLDivElement | null = null;
  private gearSummaryElement: HTMLDivElement | null = null;
  private lastRenderedGearSignature: string | null = null;
  private draggingInventoryIndex: number | null = null;
  private inventoryIconDataUrls = new Map<string, string>();
  private shopRootElement: HTMLDivElement | null = null;
  private shopContentElement: HTMLDivElement | null = null;
  private activeShopId: string | null = null;
  private lastRenderedShopSignature: string | null = null;
  private bankRootElement: HTMLDivElement | null = null;
  private bankInventoryHeaderElement: HTMLDivElement | null = null;
  private bankStorageHeaderElement: HTMLDivElement | null = null;
  private bankInventoryGridElement: HTMLDivElement | null = null;
  private bankStorageGridElement: HTMLDivElement | null = null;
  private bankInventoryState: InventoryState | null = null;
  private bankVisible = false;
  private lastRenderedBankSignature: string | null = null;
  private bankQuantityPromptElement: HTMLDivElement | null = null;
  private craftingRootElement: HTMLDivElement | null = null;
  private craftingContentElement: HTMLDivElement | null = null;
  private activeCraftingObjectId: string | null = null;
  private activeCraftingStationType: string | null = null;
  private activeCraftingTitle = 'Crafting';
  private craftingRecipes: CraftingRecipeState[] = [];
  private selectedSmithingMaterialTab: 'bronze' | 'iron' = 'bronze';
  private activeCraftingProgress: CraftingProgressState | null = null;
  private craftingVisible = false;
  private lastRenderedCraftingSignature: string | null = null;
  private questJournalRootElement: HTMLDivElement | null = null;
  private questJournalActiveContentElement: HTMLDivElement | null = null;
  private questJournalCompletedContentElement: HTMLDivElement | null = null;
  private questJournalDetailsContentElement: HTMLDivElement | null = null;
  private questDialogueRootElement: HTMLDivElement | null = null;
  private questDialogueTextContentElement: HTMLDivElement | null = null;
  private questDialogueOptionsRowElement: HTMLDivElement | null = null;
  private questNotificationContentElement: HTMLDivElement | null = null;
  private questJournalState: QuestJournalState | null = null;
  private questDialogueState: QuestDialogueState | null = null;
  private pendingQuestDialogueNpcId: string | null = null;
  private nextQuestDialogueRetryAt = 0;
  private questDialogueRetryTimeoutAt = 0;
  private selectedQuestJournalQuestId: string | null = null;
  private questNotifications: QuestNotificationState[] = [];
  private expandedActiveQuestIds = new Set<string>();
  private activeQuestExpansionLoaded = false;
  private interactionTargetRuntime = new InteractionTargetRuntime();
  private pendingInteractionController = new PendingInteractionController();
  private localHealthBar: Phaser.GameObjects.Graphics | null = null;
  private localHealthBarVisibleUntil = 0;
  private harvestingActionIndicator: Phaser.GameObjects.Image | null = null;
  private harvestingIndicatorPhase = 0;
  private previousSkillLevels: SkillLevelSnapshot | null = null;
  private timeSinceInputSendMs = 0;
  private lastSentDirection = new Phaser.Math.Vector2(0, 0);
  private localPathWaypoints: Phaser.Math.Vector2[] = [];
  private localActiveRouteId: string | null = null;
  private localCommittedDestination: Phaser.Math.Vector2 | null = null;
  private localArrivalReportedRouteId: string | null = null;
  private nextClientRouteSequence = 1;
  private localRouteLocked = false;
  private sceneOrchestrator = new WorldSceneOrchestrator({
    setLocalPlayerId: (id: string) => {
      this.localPlayerId = id;
    },
    applyPlayerSnapshot: (players: WorldSnapshot['players']) => {
      this.applyPlayerSnapshot(players);
    },
    applyNodeSnapshot: (nodes: WorldSnapshot['nodes']) => {
      this.applyNodeSnapshot(nodes);
    },
    applyNpcSnapshot: (npcs: WorldSnapshot['npcs']) => {
      this.applyNpcSnapshot(npcs);
    },
    applyObjectSnapshot: (objects: WorldSnapshot['objects']) => {
      this.applyObjectSnapshot(objects);
    },
    rebuildWalkabilityIndexes: () => {
      this.rebuildWalkabilityIndexes();
    },
    applyEnemySnapshot: (enemies: WorldSnapshot['enemies']) => {
      this.applyEnemySnapshot(enemies);
    },
    applyGroundItemSnapshot: (groundItems: NonNullable<WorldSnapshot['groundItems']>) => {
      this.applyGroundItemSnapshot(groundItems);
    },
    setShopDefinitions: (shops: WorldSnapshot['shops']) => {
      this.shopDefinitions = shops;
    },
    processPendingInteractionTarget: () => {
      this.processPendingInteractionTarget();
    },
    getActiveShopId: () => this.activeShopId,
    hasShopDefinition: (shopId: string) => Boolean(this.shopDefinitions[shopId]),
    closeShop: () => {
      this.closeShop();
    },
    incrementSnapshotStats: () => {
      this.snapshotCount += 1;
      this.lastStateUpdateAt = Date.now();
    },
    upsertRemotePlayer: (player: RemotePlayerState) => {
      this.upsertRemotePlayer(player);
    },
    removeRemotePlayer: (id: string) => {
      this.removeRemotePlayer(id);
    },
    handleChatMessage: (message: ChatMessageState) => {
      this.handleChatMessage(message);
    },
    handleQuestJournal: (journal: QuestJournalState) => {
      this.handleQuestJournal(journal);
    },
    handleQuestDialogue: (dialogue: QuestDialogueState) => {
      this.handleQuestDialogue(dialogue);
    },
    handleQuestNotification: (notification: QuestNotificationState) => {
      this.handleQuestNotification(notification);
    },
    openShop: (shopId: string) => {
      this.openShop(shopId);
    },
    openBank: (inventory: InventoryState, bank: InventoryState) => {
      this.openBank(inventory, bank);
    },
    openCrafting: (craftingState: CraftingOpenState) => {
      this.openCrafting(craftingState);
    },
    handleCraftingProgress: (progressState: CraftingProgressState) => {
      this.handleCraftingProgress(progressState);
    },
    handleAuthFailure: (reason: string) => {
      this.scene.start('splash', { errorMessage: reason });
    },
  });
  private sceneReady = false;

  constructor() {
    super('world');
  }

  async create(): Promise<void> {
    this.sceneReady = false;
    this.input.mouse?.disableContextMenu();

    const [terrainRuntimeData, terrainTileBehaviors, terrainTilesetSourceTileSize, playerAppearance] = await Promise.all([
      this.loadTerrainRuntimeData(),
      this.loadTerrainTileBehaviors(),
      this.loadTerrainTilesetSourceTileSize(),
      this.loadPlayerAppearanceConfig(),
    ]);
    this.terrainData = terrainRuntimeData.terrain;
    this.terrainTilesetIndices = terrainRuntimeData.terrainTilesetIndices;
    this.terrainTilesets = terrainRuntimeData.terrainTilesets.length > 0
      ? terrainRuntimeData.terrainTilesets
      : [{
        id: TERRAIN_TEXTURE_KEY,
        label: 'Default',
        url: DEFAULT_TERRAIN_TILESET_URL,
        sourceTileSize: terrainTilesetSourceTileSize,
      }];
    const maxTilesetIndex = Math.max(0, this.terrainTilesets.length - 1);
    this.terrainTilesetIndices = this.terrainTilesetIndices.map((row) => row.map((entry) => {
      const index = Math.floor(Number(entry));
      if (!Number.isFinite(index)) {
        return 0;
      }

      return Math.max(0, Math.min(maxTilesetIndex, index));
    }));
    this.blockedTerrainTileIds = new Set<number>(
      Array.from(terrainTileBehaviors.entries())
        .filter(([, behavior]) => behavior.walkable === false)
        .map(([tileId]) => tileId),
    );
    if (!this.blockedTerrainTileIds.size) {
      this.blockedTerrainTileIds.add(WATER_TILE_ID);
    }
    this.playerAppearance = playerAppearance;
    this.worldHeightTiles = this.terrainData.length;
    this.worldWidthTiles = this.terrainData[0]?.length ?? MAP_WIDTH_TILES;
    await this.ensureTerrainTilesetsLoaded();
    const terrainMap = this.make.tilemap({
      data: this.terrainData,
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
    });

    let createdTerrainLayerCount = 0;
    for (let tilesetIndex = 0; tilesetIndex < this.terrainTilesets.length; tilesetIndex += 1) {
      const tilesetDefinition = this.terrainTilesets[tilesetIndex];
      const textureKey = this.getTerrainTilesetTextureKey(tilesetIndex);
      const terrainTileset = terrainMap.addTilesetImage(
        textureKey,
        textureKey,
        tilesetDefinition.sourceTileSize,
        tilesetDefinition.sourceTileSize,
        0,
        0,
      );

      if (!terrainTileset) {
        continue;
      }

      const layerName = `terrain-${tilesetIndex}`;
      const terrainLayer = terrainMap.createBlankLayer(
        layerName,
        terrainTileset,
        0,
        0,
        this.worldWidthTiles,
        this.worldHeightTiles,
        TILE_SIZE,
        TILE_SIZE,
      );

      if (!terrainLayer) {
        continue;
      }

      for (let tileY = 0; tileY < this.worldHeightTiles; tileY += 1) {
        for (let tileX = 0; tileX < this.worldWidthTiles; tileX += 1) {
          if ((this.terrainTilesetIndices[tileY]?.[tileX] ?? 0) !== tilesetIndex) {
            continue;
          }

          const tileId = this.terrainData[tileY]?.[tileX] ?? 0;
          terrainLayer.putTileAt(tileId, tileX, tileY);
        }
      }

      terrainLayer.setCollision(Array.from(this.blockedTerrainTileIds));
      createdTerrainLayerCount += 1;
    }

    if (createdTerrainLayerCount === 0) {
      throw new Error('Failed to create terrain layers.');
    }

    this.player = this.add.sprite(
      this.worldWidthTiles * TILE_SIZE * 0.5,
      this.worldHeightTiles * TILE_SIZE * 0.5,
      PLAYER_TEXTURE_KEY,
    );
    this.player.setDisplaySize(TILE_SIZE, TILE_SIZE);

    this.applyPlayerSpriteAppearance(this.player);
    this.localHealthBar = this.add.graphics().setDepth(60);
    this.localHealthBar.setVisible(false);
    this.createHarvestIndicatorTextures();
    this.harvestingActionIndicator = this.add
      .image(this.player.x, this.player.y - TILE_SIZE * 0.95, HARVEST_AXE_TEXTURE_KEY)
      .setDepth(70)
      .setOrigin(0.5, 1)
      .setDisplaySize(12, 12)
      .setVisible(false);

    this.cameras.main.setBounds(
      0,
      0,
      this.worldWidthTiles * TILE_SIZE,
      this.worldHeightTiles * TILE_SIZE,
    );
    this.cameras.main.startFollow(this.player, true, 0.2, 0.2);
    this.cameras.main.setZoom(2);
    this.cameras.main.roundPixels = false;

    const keyboard = this.input.keyboard;
    if (!keyboard) {
      throw new Error('Keyboard input is unavailable.');
    }


    this.debugToggleKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F3);
    this.questJournalToggleKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.J);
    this.skillsTabToggleKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.inventoryTabToggleKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.I);
    this.gearTabToggleKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.G);
    this.initDebugHudPanel();

    this.actionStatusText = this.add
      .text(8, 116, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#f6f1dd',
        backgroundColor: '#00000099',
        padding: { x: 8, y: 6 },
      })
      .setDepth(1000)
      .setScrollFactor(0);

    this.initChatUi();
    this.initCharacterUi();
    this.initShopUi();
    this.initBankUi();
    this.initCraftingUi();
    this.initQuestJournalUi();
    this.initQuestDialogueUi();
    this.initQuestNotificationFeedUi();
    this.initMinimap();
    this.appendSystemChatMessage('Welcome to the world.');

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.handlePointerDown(pointer);
    });

    this.multiplayerClient = this.sceneOrchestrator.createMultiplayerClient();

    this.multiplayerClient.connect();
    this.sceneReady = true;

    this.events.on(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.on(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
  }

  private async loadTerrainRuntimeData(): Promise<TerrainRuntimeData> {
    try {
      const response = await fetch(WORLD_MAP_URL, { cache: 'no-store' });
      if (!response.ok) {
        const generatedTerrain = generateTerrainData();
        return {
          terrain: generatedTerrain,
          terrainTilesetIndices: createFilledTerrainTilesetIndexGrid(
            generatedTerrain[0]?.length ?? MAP_WIDTH_TILES,
            generatedTerrain.length,
            0,
          ),
          terrainTilesets: [],
        };
      }

      const raw = await response.json() as unknown;
      const runtimeData = extractTerrainRuntimeDataFromWorldMap(raw);
      if (!runtimeData) {
        const generatedTerrain = generateTerrainData();
        return {
          terrain: generatedTerrain,
          terrainTilesetIndices: createFilledTerrainTilesetIndexGrid(
            generatedTerrain[0]?.length ?? MAP_WIDTH_TILES,
            generatedTerrain.length,
            0,
          ),
          terrainTilesets: [],
        };
      }

      return runtimeData;
    } catch {
      const generatedTerrain = generateTerrainData();
      return {
        terrain: generatedTerrain,
        terrainTilesetIndices: createFilledTerrainTilesetIndexGrid(
          generatedTerrain[0]?.length ?? MAP_WIDTH_TILES,
          generatedTerrain.length,
          0,
        ),
        terrainTilesets: [],
      };
    }
  }

  private getTerrainTilesetTextureKey(tilesetIndex: number): string {
    if (tilesetIndex <= 0) {
      return TERRAIN_TEXTURE_KEY;
    }

    return `${TERRAIN_TEXTURE_KEY}-${tilesetIndex}`;
  }

  private async loadImageElement(imageUrl: string): Promise<HTMLImageElement> {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Failed to load image: ${imageUrl}`));
      image.src = imageUrl;
    });
  }

  private async ensureTerrainTilesetsLoaded(): Promise<void> {
    for (let tilesetIndex = 0; tilesetIndex < this.terrainTilesets.length; tilesetIndex += 1) {
      const textureKey = this.getTerrainTilesetTextureKey(tilesetIndex);
      if (this.textures.exists(textureKey)) {
        continue;
      }

      const tilesetUrl = this.resolveRuntimeAssetUrl(this.terrainTilesets[tilesetIndex].url);
      if (!tilesetUrl) {
        continue;
      }

      try {
        const image = await this.loadImageElement(tilesetUrl);
        this.textures.addImage(textureKey, image);
      } catch {
        if (textureKey !== TERRAIN_TEXTURE_KEY && this.textures.exists(TERRAIN_TEXTURE_KEY)) {
          continue;
        }
      }
    }
  }

  private async loadTerrainTileBehaviors(): Promise<Map<number, TerrainTileBehavior>> {
    try {
      const response = await fetch(TILE_TYPES_URL, { cache: 'no-store' });
      if (!response.ok) {
        return new Map<number, TerrainTileBehavior>([[WATER_TILE_ID, { walkable: false, moveSpeedMultiplier: 1, damagePerSecond: 0 }]]);
      }

      const raw = await response.json() as unknown;
      if (!Array.isArray(raw)) {
        return new Map<number, TerrainTileBehavior>([[WATER_TILE_ID, { walkable: false, moveSpeedMultiplier: 1, damagePerSecond: 0 }]]);
      }

      const behaviors = new Map<number, TerrainTileBehavior>();
      for (const entry of raw as TerrainTileDefinition[]) {
        const tileId = Number(entry?.id);
        if (!Number.isFinite(tileId)) {
          continue;
        }

        const walkable = typeof entry?.walkable === 'boolean' ? entry.walkable : tileId !== WATER_TILE_ID;
        const moveSpeedMultiplierRaw = Number(entry?.moveSpeedMultiplier ?? 1);
        const damagePerSecondRaw = Number(entry?.damagePerSecond ?? 0);
        behaviors.set(Math.floor(tileId), {
          walkable,
          moveSpeedMultiplier: Number.isFinite(moveSpeedMultiplierRaw)
            ? Math.max(0.1, Math.min(3, moveSpeedMultiplierRaw))
            : 1,
          damagePerSecond: Number.isFinite(damagePerSecondRaw)
            ? Math.max(0, Math.min(100, damagePerSecondRaw))
            : 0,
        });
      }

      if (!behaviors.size) {
        behaviors.set(WATER_TILE_ID, { walkable: false, moveSpeedMultiplier: 1, damagePerSecond: 0 });
      }

      return behaviors;
    } catch {
      return new Map<number, TerrainTileBehavior>([[WATER_TILE_ID, { walkable: false, moveSpeedMultiplier: 1, damagePerSecond: 0 }]]);
    }
  }

  private async loadPlayerAppearanceConfig(): Promise<PlayerAppearanceConfig> {
    try {
      const response = await fetch(PLAYER_APPEARANCE_URL, { cache: 'no-store' });
      if (!response.ok) {
        return { image: '' };
      }

      const raw = await response.json() as PlayerAppearanceConfig;
      return {
        image: String(raw?.image ?? '').trim(),
      };
    } catch {
      return { image: '' };
    }
  }

  private async loadTerrainTilesetSourceTileSize(): Promise<number> {
    try {
      const response = await fetch(TERRAIN_TILESET_CONFIG_URL, { cache: 'no-store' });
      if (!response.ok) {
        return TILE_SIZE;
      }

      const raw = await response.json() as { sourceTileSize?: unknown };
      const parsed = Math.floor(Number(raw?.sourceTileSize));
      return parsed === 48 ? 48 : TILE_SIZE;
    } catch {
      return TILE_SIZE;
    }
  }

  private resolveEntityTextureKey(
    prefix: string,
    id: string,
    imagePath: string | null | undefined,
    fallbackTextureKey: string,
  ): string {
    const normalizedImagePath = this.resolveRuntimeAssetUrl(String(imagePath ?? '').trim());
    if (!normalizedImagePath) {
      return fallbackTextureKey;
    }

    const key = `${prefix}-${id}`;
    const loaded = this.ensureEntityTextureLoaded(key, normalizedImagePath);
    return loaded ? key : fallbackTextureKey;
  }

  private resolveRuntimeAssetUrl(rawPath: string): string {
    const trimmed = String(rawPath ?? '').trim();
    if (!trimmed) {
      return '';
    }

    if (/^(?:[a-z]+:)?\/\//i.test(trimmed) || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
      return trimmed;
    }

    const normalizedAssetPath = trimmed.replace(/^\/+/, '');
    const baseUrl = String(import.meta.env.BASE_URL ?? '/');
    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    return `${normalizedBaseUrl}${normalizedAssetPath}`;
  }

  private ensureEntityTextureLoaded(textureKey: string, imagePath: string): boolean {
    const normalizedPath = String(imagePath ?? '').trim();
    if (!normalizedPath) {
      return false;
    }

    const previousPath = this.entityTexturePathByKey.get(textureKey) ?? '';
    if (this.textures.exists(textureKey) && previousPath === normalizedPath) {
      return true;
    }

    if (this.pendingEntityTextureLoads.has(textureKey)) {
      return false;
    }

    if (this.textures.exists(textureKey) && previousPath !== normalizedPath) {
      this.textures.remove(textureKey);
    }

    this.entityTexturePathByKey.set(textureKey, normalizedPath);
    this.pendingEntityTextureLoads.add(textureKey);
    this.load.image(textureKey, normalizedPath);
    this.load.once(`filecomplete-image-${textureKey}`, () => {
      this.pendingEntityTextureLoads.delete(textureKey);
    });
    this.load.once('loaderror', (file: { key?: string }): void => {
      if (file?.key === textureKey) {
        this.pendingEntityTextureLoads.delete(textureKey);
      }
    });

    if (!this.load.isLoading()) {
      this.load.start();
    }

    return false;
  }

  private applyPlayerSpriteAppearance(sprite: Phaser.GameObjects.Sprite): void {
    const playerTextureKey = this.resolveEntityTextureKey(
      'player-appearance',
      'global',
      this.playerAppearance.image,
      PLAYER_TEXTURE_KEY,
    );

    sprite.setTexture(playerTextureKey);
    sprite.setDisplaySize(TILE_SIZE, TILE_SIZE);
  }

  update(_: number, delta: number): void {
    if (!this.sceneReady) {
      return;
    }

    const directionX = 0;
    const directionY = 0;

    this.timeSinceInputSendMs += delta;
    if (this.timeSinceInputSendMs >= INPUT_SEND_INTERVAL_MS) {
      this.sendDirectionalInputIfChanged(directionX, directionY);
      this.timeSinceInputSendMs = 0;
    }

    if (this.debugToggleKey && Phaser.Input.Keyboard.JustDown(this.debugToggleKey)) {
      this.debugHudVisible = !this.debugHudVisible;
      if (this.debugHudRootElement) {
        this.debugHudRootElement.style.display = this.debugHudVisible ? 'flex' : 'none';
      }
    }

    if (this.questJournalToggleKey && Phaser.Input.Keyboard.JustDown(this.questJournalToggleKey)) {
      if (!this.isTextInputFocused()) {
        this.toggleQuestJournal();
      }
    }

    if (!this.isTextInputFocused()) {
      if (this.skillsTabToggleKey && Phaser.Input.Keyboard.JustDown(this.skillsTabToggleKey)) {
        this.setCharacterTab('skills');
      } else if (this.inventoryTabToggleKey && Phaser.Input.Keyboard.JustDown(this.inventoryTabToggleKey)) {
        this.setCharacterTab('inventory');
      } else if (this.gearTabToggleKey && Phaser.Input.Keyboard.JustDown(this.gearTabToggleKey)) {
        this.setCharacterTab('gear');
      }
    }

    this.updatePlayerSmoothing(delta);
    this.refreshWorldDepths();

    if (
      this.contextMenuElement &&
      this.localPlayerState &&
      (this.localPlayerState.targetTileX !== null || this.localPlayerState.targetTileY !== null)
    ) {
      this.hideContextMenu();
    }

    this.renderHealthBars(Date.now());
    this.updateHarvestingActionIndicator(delta);
    this.updateRemoteHarvestingActionIndicators(delta);
    this.updatePendingQuestDialogueRequest();
    this.updateMinimap(delta);
    this.applyPlayerSpriteAppearance(this.player);

    this.renderActionStatus();
    this.renderDebugHud();
  }

  private getWorldEntityDepth(worldY: number, bias = 0): number {
    return WORLD_DEPTH_BASE + worldY * WORLD_DEPTH_Y_SCALE + bias;
  }

  private resolveObjectRenderLayer(objectState: WorldObjectState): 'entity' | 'foreground' {
    const renderLayer = String((objectState as { renderLayer?: unknown }).renderLayer ?? '').trim().toLowerCase();
    return renderLayer === 'foreground' ? 'foreground' : 'entity';
  }

  private refreshWorldDepths(): void {
    const localPlayerDepth = this.getWorldEntityDepth(this.player.y);
    this.player.setDepth(localPlayerDepth);

    for (const remotePlayer of this.remotePlayers.values()) {
      remotePlayer.sprite.setDepth(this.getWorldEntityDepth(remotePlayer.sprite.y));
    }

    for (const enemyVisual of this.worldEnemies.values()) {
      enemyVisual.sprite.setDepth(this.getWorldEntityDepth(enemyVisual.sprite.y));
    }

    for (const nodeVisual of this.worldNodes.values()) {
      nodeVisual.sprite.setDepth(this.getWorldEntityDepth(nodeVisual.sprite.y));
    }

    for (const npcVisual of this.worldNpcs.values()) {
      npcVisual.sprite.setDepth(this.getWorldEntityDepth(npcVisual.sprite.y));
    }

    for (const objectVisual of this.worldObjects.values()) {
      const renderLayer = this.resolveObjectRenderLayer(objectVisual.state);
      if (renderLayer === 'foreground') {
        objectVisual.sprite.setDepth(WORLD_DEPTH_FOREGROUND);
      } else {
        let objectDepth = this.getWorldEntityDepth(objectVisual.sprite.y);
        if (objectVisual.state.blocksMovement === false) {
          objectDepth = Math.min(objectDepth, localPlayerDepth - 0.001);
        }

        objectVisual.sprite.setDepth(objectDepth);
      }
    }

    for (const [npcId, marker] of this.npcQuestMarkers.entries()) {
      const npcDepth = this.worldNpcs.get(npcId)?.sprite.depth ?? WORLD_DEPTH_BASE;
      marker.setDepth(Math.max(npcDepth + 0.1, 7));
    }
  }

  private initMinimap(): void {
    const appElement = document.querySelector<HTMLDivElement>('#app');
    if (!appElement) {
      return;
    }

    const panelSize = MINIMAP_INNER_SIZE_PX + MINIMAP_PADDING_PX * 2;
    const root = document.createElement('div');
    root.style.position = 'fixed';
    root.style.left = `${MINIMAP_MARGIN_PX}px`;
    root.style.top = `${MINIMAP_MARGIN_PX}px`;
    root.style.width = `${panelSize}px`;
    root.style.height = `${panelSize}px`;
    root.style.zIndex = '3600';
    root.style.pointerEvents = 'auto';
    root.style.background = 'rgba(0, 0, 0, 0.72)';
    root.style.border = '1px solid rgba(210, 194, 143, 0.95)';
    root.style.boxSizing = 'border-box';
    root.style.overflow = 'hidden';

    const canvas = document.createElement('canvas');
    canvas.width = panelSize;
    canvas.height = panelSize;
    canvas.style.width = `${panelSize}px`;
    canvas.style.height = `${panelSize}px`;
    canvas.style.display = 'block';
    canvas.style.pointerEvents = 'auto';

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    canvas.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.handleMinimapPointerDown(event);
    });

    const toggleButton = document.createElement('button');
    toggleButton.textContent = '−';
    toggleButton.setAttribute('aria-label', 'Toggle minimap');
    toggleButton.style.position = 'absolute';
    toggleButton.style.top = '2px';
    toggleButton.style.right = '2px';
    toggleButton.style.width = '22px';
    toggleButton.style.height = '22px';
    toggleButton.style.padding = '0';
    toggleButton.style.border = '1px solid rgba(150, 138, 102, 0.9)';
    toggleButton.style.background = 'rgba(64, 58, 41, 0.95)';
    toggleButton.style.color = '#f0e5c1';
    toggleButton.style.fontFamily = 'monospace';
    toggleButton.style.fontSize = '14px';
    toggleButton.style.cursor = 'pointer';
    toggleButton.style.pointerEvents = 'auto';
    toggleButton.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.minimapCollapsed = !this.minimapCollapsed;
      this.applyMinimapCollapsedState();
      if (!this.minimapCollapsed) {
        this.renderMinimap();
      }
    });

    root.append(canvas, toggleButton);
    appElement.appendChild(root);
    this.minimapRootElement = root;
    this.minimapCanvasElement = canvas;
    this.minimapCanvasContext = context;
    this.minimapToggleButtonElement = toggleButton;
    this.applyMinimapCollapsedState();
    this.renderMinimap();
  }

  private applyMinimapCollapsedState(): void {
    if (!this.minimapRootElement || !this.minimapCanvasElement || !this.minimapToggleButtonElement) {
      return;
    }

    const panelSize = MINIMAP_INNER_SIZE_PX + MINIMAP_PADDING_PX * 2;
    if (this.minimapCollapsed) {
      this.minimapCanvasElement.style.display = 'none';
      this.minimapRootElement.style.width = `${MINIMAP_COLLAPSED_SIZE_PX}px`;
      this.minimapRootElement.style.height = `${MINIMAP_COLLAPSED_SIZE_PX}px`;
      this.minimapToggleButtonElement.textContent = '+';
      return;
    }

    this.minimapCanvasElement.style.display = 'block';
    this.minimapRootElement.style.width = `${panelSize}px`;
    this.minimapRootElement.style.height = `${panelSize}px`;
    this.minimapToggleButtonElement.textContent = '−';
  }

  private updateMinimap(deltaMs: number): void {
    if (this.minimapCollapsed) {
      return;
    }

    this.minimapRedrawAccumulatorMs += deltaMs;
    if (this.minimapRedrawAccumulatorMs < MINIMAP_REDRAW_INTERVAL_MS) {
      return;
    }

    this.minimapRedrawAccumulatorMs = 0;
    this.renderMinimap();
  }

  private handleMinimapPointerDown(event: PointerEvent): void {
    if (this.minimapCollapsed || !this.minimapCanvasElement) {
      return;
    }

    const bounds = this.minimapCanvasElement.getBoundingClientRect();
    const localX = event.clientX - bounds.left;
    const localY = event.clientY - bounds.top;
    const innerMinX = MINIMAP_PADDING_PX;
    const innerMinY = MINIMAP_PADDING_PX;
    const innerMaxX = innerMinX + MINIMAP_INNER_SIZE_PX;
    const innerMaxY = innerMinY + MINIMAP_INNER_SIZE_PX;

    if (localX < innerMinX || localY < innerMinY || localX >= innerMaxX || localY >= innerMaxY) {
      return;
    }

    const viewDiameterTiles = MINIMAP_VIEW_RADIUS_TILES * 2 + 1;
    const pixelsPerTile = MINIMAP_INNER_SIZE_PX / viewDiameterTiles;
    const centerSource = this.localRenderedTilePosition
      ?? this.localTilePosition
      ?? new Phaser.Math.Vector2(
        Math.floor(this.player.x / TILE_SIZE),
        Math.floor(this.player.y / TILE_SIZE),
      );
    const centerTileX = Math.round(centerSource.x);
    const centerTileY = Math.round(centerSource.y);
    const startTileX = centerTileX - MINIMAP_VIEW_RADIUS_TILES;
    const startTileY = centerTileY - MINIMAP_VIEW_RADIUS_TILES;

    const tileOffsetX = Phaser.Math.Clamp(
      Math.floor((localX - innerMinX) / pixelsPerTile),
      0,
      viewDiameterTiles - 1,
    );
    const tileOffsetY = Phaser.Math.Clamp(
      Math.floor((localY - innerMinY) / pixelsPerTile),
      0,
      viewDiameterTiles - 1,
    );

    const destinationTileX = Phaser.Math.Clamp(startTileX + tileOffsetX, 0, this.worldWidthTiles - 1);
    const destinationTileY = Phaser.Math.Clamp(startTileY + tileOffsetY, 0, this.worldHeightTiles - 1);

    this.performWalkTo(destinationTileX, destinationTileY);
  }

  private renderMinimap(): void {
    if (this.minimapCollapsed || !this.minimapCanvasContext || !this.minimapCanvasElement) {
      return;
    }

    const context = this.minimapCanvasContext;
    const panelSize = MINIMAP_INNER_SIZE_PX + MINIMAP_PADDING_PX * 2;
    const viewDiameterTiles = MINIMAP_VIEW_RADIUS_TILES * 2 + 1;
    const pixelsPerTile = MINIMAP_INNER_SIZE_PX / viewDiameterTiles;
    const panelLeft = 0;
    const panelTop = 0;
    const innerLeft = panelLeft + MINIMAP_PADDING_PX;
    const innerTop = panelTop + MINIMAP_PADDING_PX;

    const centerSource = this.localRenderedTilePosition
      ?? this.localTilePosition
      ?? new Phaser.Math.Vector2(
        Math.floor(this.player.x / TILE_SIZE),
        Math.floor(this.player.y / TILE_SIZE),
      );
    const centerTileX = Math.round(centerSource.x);
    const centerTileY = Math.round(centerSource.y);

    const startTileX = centerTileX - MINIMAP_VIEW_RADIUS_TILES;
    const startTileY = centerTileY - MINIMAP_VIEW_RADIUS_TILES;

    context.clearRect(0, 0, panelSize, panelSize);

    context.fillStyle = 'rgba(0, 0, 0, 0.72)';
    context.fillRect(panelLeft, panelTop, panelSize, panelSize);
    context.strokeStyle = 'rgba(210, 194, 143, 0.95)';
    context.lineWidth = 1;
    context.strokeRect(panelLeft + 0.5, panelTop + 0.5, panelSize - 1, panelSize - 1);

    for (let localY = 0; localY < viewDiameterTiles; localY += 1) {
      const tileY = startTileY + localY;
      for (let localX = 0; localX < viewDiameterTiles; localX += 1) {
        const tileX = startTileX + localX;
        const tileId = this.terrainData[tileY]?.[tileX];
        context.fillStyle = this.toCanvasHexColor(this.getMinimapTerrainColor(tileId));
        context.fillRect(
          innerLeft + localX * pixelsPerTile,
          innerTop + localY * pixelsPerTile,
          pixelsPerTile,
          pixelsPerTile,
        );
      }
    }

    for (const nodeVisual of this.worldNodes.values()) {
      if (nodeVisual.state.isDepleted) {
        continue;
      }

      const color = RESOURCE_MINIMAP_COLORS[nodeVisual.state.resourceId]
        ?? (nodeVisual.state.type === 'tree' ? 0x6fbf64 : 0x8b939b);
      this.drawMinimapDot(startTileX, startTileY, pixelsPerTile, nodeVisual.state.tileX, nodeVisual.state.tileY, color, 0.85);
    }

    for (const npcVisual of this.worldNpcs.values()) {
      this.drawMinimapDot(startTileX, startTileY, pixelsPerTile, npcVisual.state.tileX, npcVisual.state.tileY, 0xffffff, 1.2);
    }

    for (const enemyVisual of this.worldEnemies.values()) {
      if (enemyVisual.state.isDead) {
        continue;
      }

      this.drawMinimapDot(startTileX, startTileY, pixelsPerTile, enemyVisual.state.tileX, enemyVisual.state.tileY, 0xff4d4d, 1.2);
    }

    this.drawMinimapDot(startTileX, startTileY, pixelsPerTile, centerTileX, centerTileY, 0x00d8ff, 1.35);
  }

  private drawMinimapDot(
    startTileX: number,
    startTileY: number,
    pixelsPerTile: number,
    tileX: number,
    tileY: number,
    color: number,
    radiusScale = 1,
  ): void {
    if (!this.minimapCanvasContext) {
      return;
    }

    const localTileX = tileX - startTileX;
    const localTileY = tileY - startTileY;
    const viewDiameterTiles = MINIMAP_VIEW_RADIUS_TILES * 2 + 1;
    if (localTileX < 0 || localTileY < 0 || localTileX >= viewDiameterTiles || localTileY >= viewDiameterTiles) {
      return;
    }

    const centerX = MINIMAP_PADDING_PX + (localTileX + 0.5) * pixelsPerTile;
    const centerY = MINIMAP_PADDING_PX + (localTileY + 0.5) * pixelsPerTile;
    const radius = Math.max(1, pixelsPerTile * 0.24 * radiusScale);

    this.minimapCanvasContext.fillStyle = this.toCanvasHexColor(color);
    this.minimapCanvasContext.beginPath();
    this.minimapCanvasContext.arc(centerX, centerY, radius, 0, Math.PI * 2);
    this.minimapCanvasContext.fill();
  }

  private toCanvasHexColor(color: number): string {
    const safeColor = Math.max(0, Math.min(0xffffff, Math.floor(Number(color) || 0)));
    return `#${safeColor.toString(16).padStart(6, '0')}`;
  }

  private getMinimapTerrainColor(tileId: number | undefined): number {
    if (tileId === 0) {
      return 0x3f7a3a;
    }

    if (tileId === 1) {
      return 0x7a5f3a;
    }

    if (tileId === 2) {
      return 0x2f69a8;
    }

    if (tileId === 3) {
      return 0xc8b06e;
    }

    return 0x2f2f2f;
  }

  private beginQuestDialogueRequest(npcId: string): void {
    const now = Date.now();
    this.pendingQuestDialogueNpcId = npcId;
    this.nextQuestDialogueRetryAt = now;
    this.questDialogueRetryTimeoutAt = now + QUEST_DIALOGUE_RETRY_TIMEOUT_MS;
  }

  private clearQuestDialogueRequest(): void {
    this.pendingQuestDialogueNpcId = null;
    this.nextQuestDialogueRetryAt = 0;
    this.questDialogueRetryTimeoutAt = 0;
  }

  private updatePendingQuestDialogueRequest(): void {
    if (!this.pendingQuestDialogueNpcId) {
      return;
    }

    const now = Date.now();
    if (now >= this.questDialogueRetryTimeoutAt) {
      if (this.questDialogueState?.open && this.questDialogueState.npcId === this.pendingQuestDialogueNpcId) {
        this.questDialogueState = {
          ...this.questDialogueState,
          text: 'Unable to start dialogue. Move next to the NPC and try again.',
          options: [{ id: 'close', label: 'Close', action: 'close' }],
        };
        this.renderQuestDialoguePanel();
      }

      this.clearQuestDialogueRequest();
      return;
    }

    if (now < this.nextQuestDialogueRetryAt) {
      return;
    }

    this.multiplayerClient.sendNpcTalk(this.pendingQuestDialogueNpcId);
    this.nextQuestDialogueRetryAt = now + QUEST_DIALOGUE_RETRY_INTERVAL_MS;
  }

  private createHarvestIndicatorTextures(): void {
    const createTexture = (key: string, draw: (context: CanvasRenderingContext2D) => void): void => {
      if (this.textures.exists(key)) {
        return;
      }

      const texture = this.textures.createCanvas(key, 12, 12);
      if (!texture) {
        return;
      }

      const context = texture.context;
      context.clearRect(0, 0, 12, 12);
      context.imageSmoothingEnabled = false;
      draw(context);
      texture.refresh();
    };

    createTexture(HARVEST_AXE_TEXTURE_KEY, (context) => {
      context.fillStyle = '#754f2d';
      context.fillRect(5, 3, 2, 8);
      context.fillStyle = '#b48345';
      context.fillRect(2, 3, 4, 3);
      context.fillRect(1, 4, 2, 2);
      context.fillStyle = '#000000';
      context.fillRect(5, 3, 2, 1);
    });

    createTexture(HARVEST_PICKAXE_TEXTURE_KEY, (context) => {
      context.fillStyle = '#754f2d';
      context.fillRect(5, 3, 2, 8);
      context.fillStyle = '#aab3bb';
      context.fillRect(2, 3, 8, 2);
      context.fillRect(3, 5, 2, 1);
      context.fillRect(7, 5, 2, 1);
      context.fillStyle = '#000000';
      context.fillRect(5, 3, 2, 1);
    });
  }

  private getHarvestIndicatorTextureKey(nodeType: WorldNodeState['type']): string {
    return nodeType === 'rock' ? HARVEST_PICKAXE_TEXTURE_KEY : HARVEST_AXE_TEXTURE_KEY;
  }

  private updateHarvestingActionIndicator(deltaMs: number): void {
    if (!this.harvestingActionIndicator || !this.localPlayerState || !this.localTilePosition) {
      this.harvestingActionIndicator?.setVisible(false);
      return;
    }

    const activeNodeId = this.localPlayerState.activeInteractionNodeId;
    if (!activeNodeId) {
      this.harvestingActionIndicator.setVisible(false);
      return;
    }

    const activeNode = this.worldNodes.get(activeNodeId)?.state;
    if (!activeNode || activeNode.isDepleted) {
      this.harvestingActionIndicator.setVisible(false);
      return;
    }

    const manhattanDistance =
      Math.abs(Math.round(this.localTilePosition.x) - activeNode.tileX) +
      Math.abs(Math.round(this.localTilePosition.y) - activeNode.tileY);
    const isActivelyGathering = manhattanDistance <= 1;
    if (!isActivelyGathering) {
      this.harvestingActionIndicator.setVisible(false);
      return;
    }

    this.harvestingIndicatorPhase += deltaMs * 0.012;
    const bobOffset = Math.sin(this.harvestingIndicatorPhase) * 2;
    this.harvestingActionIndicator
      .setTexture(this.getHarvestIndicatorTextureKey(activeNode.type))
      .setPosition(this.player.x, this.player.y - TILE_SIZE * 0.95 + bobOffset)
      .setVisible(true)
      .setAlpha(0.78 + (Math.sin(this.harvestingIndicatorPhase * 1.8) + 1) * 0.11);
  }

  private updateRemoteHarvestingActionIndicators(deltaMs: number): void {
    for (const remotePlayer of this.remotePlayers.values()) {
      const activeNodeId = remotePlayer.state.activeInteractionNodeId;
      if (!activeNodeId) {
        remotePlayer.harvestingIndicator.setVisible(false);
        continue;
      }

      const activeNode = this.worldNodes.get(activeNodeId)?.state;
      if (!activeNode || activeNode.isDepleted) {
        remotePlayer.harvestingIndicator.setVisible(false);
        continue;
      }

      const manhattanDistance =
        Math.abs(Math.round(remotePlayer.renderedTilePosition.x) - activeNode.tileX) +
        Math.abs(Math.round(remotePlayer.renderedTilePosition.y) - activeNode.tileY);
      const isActivelyGathering = manhattanDistance <= 1;
      if (!isActivelyGathering) {
        remotePlayer.harvestingIndicator.setVisible(false);
        continue;
      }

      remotePlayer.harvestingIndicatorPhase += deltaMs * 0.012;
      const bobOffset = Math.sin(remotePlayer.harvestingIndicatorPhase) * 2;
      remotePlayer.harvestingIndicator
        .setTexture(this.getHarvestIndicatorTextureKey(activeNode.type))
        .setPosition(remotePlayer.sprite.x, remotePlayer.sprite.y - TILE_SIZE * 0.95 + bobOffset)
        .setVisible(true)
        .setAlpha(0.7 + (Math.sin(remotePlayer.harvestingIndicatorPhase * 1.8) + 1) * 0.12);
    }
  }

  private renderHealthBars(nowMs: number): void {
    if (this.localHealthBar && this.localPlayerState && nowMs <= this.localHealthBarVisibleUntil) {
      this.drawHealthBar(
        this.localHealthBar,
        this.player.x,
        this.player.y - TILE_SIZE * 0.65,
        this.localPlayerState.hp,
        this.localPlayerState.maxHp,
      );
      this.localHealthBar.setVisible(true);
    } else {
      this.localHealthBar?.clear();
      this.localHealthBar?.setVisible(false);
    }

    for (const remotePlayer of this.remotePlayers.values()) {
      if (nowMs <= remotePlayer.healthBarVisibleUntil) {
        this.drawHealthBar(
          remotePlayer.healthBar,
          remotePlayer.sprite.x,
          remotePlayer.sprite.y - TILE_SIZE * 0.65,
          remotePlayer.state.hp,
          remotePlayer.state.maxHp,
        );
        remotePlayer.healthBar.setVisible(true);
      } else {
        remotePlayer.healthBar.clear();
        remotePlayer.healthBar.setVisible(false);
      }
    }

    for (const enemy of this.worldEnemies.values()) {
      if (enemy.state.isDead) {
        enemy.healthBar.clear();
        enemy.healthBar.setVisible(false);
        continue;
      }

      if (nowMs <= enemy.healthBarVisibleUntil) {
        this.drawHealthBar(
          enemy.healthBar,
          enemy.sprite.x,
          enemy.sprite.y - TILE_SIZE * 0.65,
          enemy.state.hp,
          enemy.state.maxHp,
        );
        enemy.healthBar.setVisible(true);
      } else {
        enemy.healthBar.clear();
        enemy.healthBar.setVisible(false);
      }
    }
  }

  private drawHealthBar(
    graphics: Phaser.GameObjects.Graphics,
    worldX: number,
    worldY: number,
    hp: number,
    maxHp: number,
  ): void {
    const safeMaxHp = Math.max(1, maxHp);
    const ratio = Phaser.Math.Clamp(hp / safeMaxHp, 0, 1);
    const left = worldX - HEALTH_BAR_WIDTH * 0.5;
    const top = worldY;

    graphics.clear();
    graphics.fillStyle(0x111111, 0.8);
    graphics.fillRect(left - 1, top - 1, HEALTH_BAR_WIDTH + 2, HEALTH_BAR_HEIGHT + 2);

    graphics.fillStyle(0x5f1515, 0.95);
    graphics.fillRect(left, top, HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT);

    graphics.fillStyle(0x45c163, 0.95);
    graphics.fillRect(left, top, Math.round(HEALTH_BAR_WIDTH * ratio), HEALTH_BAR_HEIGHT);
  }

  private showFloatingText(
    worldX: number,
    worldY: number,
    text: string,
    color: string,
    options?: { fontSize?: string; strokeThickness?: number; rise?: number; duration?: number },
  ): void {
    const popup = this.add
      .text(worldX, worldY, text, {
        fontFamily: 'monospace',
        fontSize: options?.fontSize ?? '12px',
        color,
        stroke: '#000000',
        strokeThickness: options?.strokeThickness ?? 2,
      })
      .setDepth(90)
      .setOrigin(0.5, 1);

    this.tweens.add({
      targets: popup,
      y: popup.y - (options?.rise ?? 16),
      alpha: 0,
      duration: options?.duration ?? 650,
      ease: 'Quad.Out',
      onComplete: () => popup.destroy(),
    });
  }

  private showHarvestingDebugOutcome(
    previousActionText: string | null | undefined,
    playerState: RemotePlayerState,
  ): void {
    const nextActionText = playerState.lastActionText;
    if (!playerState.activeInteractionNodeId || !nextActionText || nextActionText === previousActionText) {
      return;
    }

    const isSuccess = /\(\+\d+\s*XP\)|level up/i.test(nextActionText);
    const isFailure = /(fail|yields nothing|glances off)/i.test(nextActionText);

    if (isSuccess) {
      this.showFloatingText(this.player.x, this.player.y - TILE_SIZE * 1.05, 'HIT', '#b4ff9f');
      return;
    }

    if (isFailure) {
      this.showFloatingText(this.player.x, this.player.y - TILE_SIZE * 1.05, 'MISS', '#ff9b9b');
    }
  }

  private showCombatZeroDamageOutcome(
    previousActionText: string | null | undefined,
    playerState: RemotePlayerState,
  ): void {
    const nextActionText = playerState.lastActionText;
    if (!nextActionText || nextActionText === previousActionText) {
      return;
    }

    if (/you block .*attack/i.test(nextActionText)) {
      this.showFloatingText(this.player.x, this.player.y - TILE_SIZE * 0.7, '0', '#e2e2e2');
      return;
    }

    if (/your attack glances off/i.test(nextActionText)) {
      const targetEnemyId = playerState.combatTargetEnemyId;
      const targetEnemy = targetEnemyId ? this.worldEnemies.get(targetEnemyId) : null;
      if (!targetEnemy || targetEnemy.state.isDead) {
        return;
      }

      this.showFloatingText(
        targetEnemy.sprite.x,
        targetEnemy.sprite.y - TILE_SIZE * 0.7,
        '0',
        '#e2e2e2',
      );
    }
  }

  private updatePlayerSmoothing(deltaMs: number): void {
    if (this.localTilePosition && this.localRenderedTilePosition) {
      const hasActiveMoveTarget =
        this.localPlayerState?.targetTileX !== null
        && this.localPlayerState?.targetTileY !== null;
      const shouldHoldCommittedDestination = this.shouldHoldCommittedDestination();
      const localWaypoints =
        this.localPathWaypoints.length > 0
          ? this.localPathWaypoints
          : (hasActiveMoveTarget || shouldHoldCommittedDestination) && this.localCommittedDestination
            ? [this.localCommittedDestination.clone()]
            : [this.localTilePosition.clone()];
      this.advanceAlongWaypoints(this.localRenderedTilePosition, localWaypoints, deltaMs);

      this.maybeReportCommittedRouteArrival();

      const worldPosition = this.getWorldPositionFromTile(
        this.localRenderedTilePosition.x,
        this.localRenderedTilePosition.y,
      );
      this.player.setPosition(worldPosition.x, worldPosition.y);
    }

    for (const remotePlayer of this.remotePlayers.values()) {
      const remoteWaypoints =
        remotePlayer.pathWaypoints.length > 0
          ? remotePlayer.pathWaypoints
          : [remotePlayer.targetTilePosition.clone()];
      this.advanceAlongWaypoints(remotePlayer.renderedTilePosition, remoteWaypoints, deltaMs);

      const worldPosition = this.getWorldPositionFromTile(
        remotePlayer.renderedTilePosition.x,
        remotePlayer.renderedTilePosition.y,
      );
      remotePlayer.sprite.setPosition(worldPosition.x, worldPosition.y);
    }

    for (const enemy of this.worldEnemies.values()) {
      const enemyWaypoints =
        enemy.pathWaypoints.length > 0 ? enemy.pathWaypoints : [enemy.targetTilePosition.clone()];
      this.advanceAlongWaypoints(enemy.renderedTilePosition, enemyWaypoints, deltaMs);

      const worldPosition = this.getWorldPositionFromTile(
        enemy.renderedTilePosition.x,
        enemy.renderedTilePosition.y,
      );
      enemy.sprite.setPosition(worldPosition.x, worldPosition.y);
    }
  }

  private maybeReportCommittedRouteArrival(): void {
    if (
      !this.localRouteLocked
      || !this.localActiveRouteId
      || !this.localCommittedDestination
      || !this.localRenderedTilePosition
    ) {
      return;
    }

    if (this.localArrivalReportedRouteId === this.localActiveRouteId) {
      return;
    }

    if (this.localPathWaypoints.length > 0) {
      return;
    }

    const distanceToDestination = Phaser.Math.Distance.Between(
      this.localRenderedTilePosition.x,
      this.localRenderedTilePosition.y,
      this.localCommittedDestination.x,
      this.localCommittedDestination.y,
    );
    if (distanceToDestination > 0.02) {
      return;
    }

    this.localArrivalReportedRouteId = this.localActiveRouteId;
    this.multiplayerClient.sendRouteArrived(
      this.localActiveRouteId,
      Math.round(this.localCommittedDestination.x),
      Math.round(this.localCommittedDestination.y),
    );
  }

  private advanceAlongWaypoints(
    current: Phaser.Math.Vector2,
    waypoints: Phaser.Math.Vector2[],
    deltaMs: number,
  ): void {
    let remainingMs = deltaMs;

    while (remainingMs > 0 && waypoints.length > 0) {
      const target = waypoints[0];
      const deltaX = target.x - current.x;
      const deltaY = target.y - current.y;
      const distance = Math.hypot(deltaX, deltaY);

      if (distance <= 0.0001) {
        current.copy(target);
        waypoints.shift();
        continue;
      }

      const isDiagonalMove = Math.abs(deltaX) > 0.001 && Math.abs(deltaY) > 0.001;
      const speedTilesPerMs = isDiagonalMove
        ? DIAGONAL_MOVE_TILES_PER_MS
        : CARDINAL_MOVE_TILES_PER_MS;
      const stepDistance = speedTilesPerMs * remainingMs;

      if (stepDistance >= distance) {
        current.copy(target);
        waypoints.shift();
        const consumedMs = distance / speedTilesPerMs;
        remainingMs = Math.max(0, remainingMs - consumedMs);
        continue;
      }

      const scale = stepDistance / distance;
      current.set(current.x + deltaX * scale, current.y + deltaY * scale);
      remainingMs = 0;
    }
  }

  private buildPathWaypoints(playerState: RemotePlayerState): Phaser.Math.Vector2[] {
    if (!Array.isArray(playerState.targetPath)) {
      return [];
    }

    return playerState.targetPath.map(
      (step) =>
        new Phaser.Math.Vector2(
          Phaser.Math.Clamp(Math.round(step.tileX), 0, this.worldWidthTiles - 1),
          Phaser.Math.Clamp(Math.round(step.tileY), 0, this.worldHeightTiles - 1),
        ),
    );
  }

  private trimCommittedRouteFromRenderedPosition(route: Phaser.Math.Vector2[]): Phaser.Math.Vector2[] {
    if (!this.localRenderedTilePosition || route.length === 0) {
      return route;
    }

    let startIndex = 0;
    while (startIndex < route.length) {
      const waypoint = route[startIndex];
      const distance = Phaser.Math.Distance.Between(
        this.localRenderedTilePosition.x,
        this.localRenderedTilePosition.y,
        waypoint.x,
        waypoint.y,
      );
      if (distance > 0.2) {
        break;
      }

      startIndex += 1;
    }

    return route.slice(startIndex);
  }

  private buildCommittedLocalRoute(playerState: RemotePlayerState): Phaser.Math.Vector2[] {
    const route = this.buildPathWaypoints(playerState);
    if (route.length > 0) {
      return this.trimCommittedRouteFromRenderedPosition(route);
    }

    if (playerState.targetTileX !== null && playerState.targetTileY !== null) {
      return [
        new Phaser.Math.Vector2(
          Phaser.Math.Clamp(Math.round(playerState.targetTileX), 0, this.worldWidthTiles - 1),
          Phaser.Math.Clamp(Math.round(playerState.targetTileY), 0, this.worldHeightTiles - 1),
        ),
      ];
    }

    return [];
  }

  private shouldHoldCommittedDestination(): boolean {
    if (!this.localCommittedDestination || !this.localTilePosition) {
      return false;
    }

    const distanceToCommittedDestination = Phaser.Math.Distance.Between(
      this.localTilePosition.x,
      this.localTilePosition.y,
      this.localCommittedDestination.x,
      this.localCommittedDestination.y,
    );

    return distanceToCommittedDestination > 0.05;
  }

  private buildEnemyPathWaypoints(enemyState: EnemyState): Phaser.Math.Vector2[] {
    if (!Array.isArray(enemyState.targetPath)) {
      return [];
    }

    return enemyState.targetPath.map(
      (step) =>
        new Phaser.Math.Vector2(
          Phaser.Math.Clamp(Math.round(step.tileX), 0, this.worldWidthTiles - 1),
          Phaser.Math.Clamp(Math.round(step.tileY), 0, this.worldHeightTiles - 1),
        ),
    );
  }

  private sendDirectionalInputIfChanged(directionX: number, directionY: number): void {
    if (
      this.lastSentDirection.x === directionX &&
      this.lastSentDirection.y === directionY
    ) {
      return;
    }

    this.multiplayerClient.sendInput(directionX, directionY);
    this.lastSentDirection.set(directionX, directionY);

    if (directionX !== 0 || directionY !== 0) {
      this.pendingInteractionController.clear();
      this.closeTransientInteractionUi();
      this.multiplayerClient.sendInteractStop();
    }
  }

  private closeTransientInteractionUi(): void {
    this.hideContextMenu();
    this.closeBank();
    this.closeShop();
    this.closeCrafting();
  }

  private applyPlayerSnapshot(players: Record<string, RemotePlayerState>): void {
    for (const playerState of Object.values(players)) {
      const tilePosition = this.resolveTilePosition(playerState);

      if (playerState.id === this.localPlayerId) {
        const previousLevels = this.previousSkillLevels;
        const previousHp = this.localPlayerState?.hp;
        const previousCombatTargetEnemyId = this.localPlayerState?.combatTargetEnemyId ?? null;
        const previousActionText = this.localPlayerState?.lastActionText;
        this.localPlayerState = playerState;
        const hasActiveMoveTarget = playerState.targetTileX !== null && playerState.targetTileY !== null;
        const activeRouteId = hasActiveMoveTarget
          ? (String(playerState.routeId ?? '').trim() || `${playerState.targetTileX},${playerState.targetTileY}`)
          : null;

        if (!previousCombatTargetEnemyId && playerState.combatTargetEnemyId) {
          this.closeTransientInteractionUi();
        }

        if (!this.localTilePosition) {
          this.localTilePosition = tilePosition.clone();
        } else {
          this.localTilePosition.copy(tilePosition);
        }

        if (!hasActiveMoveTarget) {
          if (!this.shouldHoldCommittedDestination()) {
            this.localPathWaypoints.length = 0;
            this.localActiveRouteId = null;
            this.localCommittedDestination = null;
            this.localArrivalReportedRouteId = null;
            this.localRouteLocked = false;
          }
        } else if (this.localActiveRouteId !== activeRouteId) {
          const committedRoute = this.buildCommittedLocalRoute(playerState);
          this.localPathWaypoints = committedRoute;
          this.localActiveRouteId = activeRouteId;
          this.localCommittedDestination = committedRoute.length > 0
            ? committedRoute[committedRoute.length - 1].clone()
            : new Phaser.Math.Vector2(
                Phaser.Math.Clamp(Math.round(playerState.targetTileX ?? tilePosition.x), 0, this.worldWidthTiles - 1),
                Phaser.Math.Clamp(Math.round(playerState.targetTileY ?? tilePosition.y), 0, this.worldHeightTiles - 1),
              );
          this.localArrivalReportedRouteId = null;
          this.localRouteLocked = true;

          this.logInteractionTrace('move.route.commit', {
            routeId: activeRouteId,
            waypointCount: committedRoute.length,
          });
        }

        if (!this.localRenderedTilePosition) {
          this.localRenderedTilePosition = tilePosition.clone();
          const localWorldPosition = this.getWorldPositionFromTile(
            this.localRenderedTilePosition.x,
            this.localRenderedTilePosition.y,
          );
          this.player.setPosition(localWorldPosition.x, localWorldPosition.y);
        } else if (
          !this.localRouteLocked &&
          Phaser.Math.Distance.Between(
            this.localRenderedTilePosition.x,
            this.localRenderedTilePosition.y,
            this.localTilePosition.x,
            this.localTilePosition.y,
          ) > 4
        ) {
          this.localRenderedTilePosition.copy(this.localTilePosition);
        }

        this.previousSkillLevels = {
          woodcutting: playerState.skills.woodcutting.level,
          mining: playerState.skills.mining.level,
          smithing: playerState.skills.smithing.level,
          fletching: playerState.skills.fletching.level,
          strength: playerState.skills.strength.level,
          defense: playerState.skills.defense.level,
          constitution: playerState.skills.constitution.level,
        };

        if (previousLevels) {
          if (playerState.skills.woodcutting.level > previousLevels.woodcutting) {
            this.appendSystemChatMessage(
              `Woodcutting level is now ${playerState.skills.woodcutting.level}.`,
            );
          }

          if (playerState.skills.mining.level > previousLevels.mining) {
            this.appendSystemChatMessage(`Mining level is now ${playerState.skills.mining.level}.`);
          }

          if (playerState.skills.smithing.level > previousLevels.smithing) {
            this.appendSystemChatMessage(`Smithing level is now ${playerState.skills.smithing.level}.`);
          }

          if (playerState.skills.fletching.level > previousLevels.fletching) {
            this.appendSystemChatMessage(`Fletching level is now ${playerState.skills.fletching.level}.`);
          }

          if (playerState.skills.strength.level > previousLevels.strength) {
            this.appendSystemChatMessage(`Strength level is now ${playerState.skills.strength.level}.`);
          }

          if (playerState.skills.defense.level > previousLevels.defense) {
            this.appendSystemChatMessage(`Defense level is now ${playerState.skills.defense.level}.`);
          }

          if (playerState.skills.constitution.level > previousLevels.constitution) {
            this.appendSystemChatMessage(
              `Constitution level is now ${playerState.skills.constitution.level}.`,
            );
          }
        }

        if (typeof previousHp === 'number' && previousHp !== playerState.hp) {
          this.localHealthBarVisibleUntil = Date.now() + HEALTH_BAR_VISIBLE_MS;

          if (previousHp > playerState.hp) {
            this.closeTransientInteractionUi();
            const isEmpoweredIncomingHit = /crushes you for/i.test(playerState.lastActionText ?? '');
            this.showFloatingText(
              this.player.x,
              this.player.y - TILE_SIZE * 0.7,
              `-${Math.round(previousHp - playerState.hp)}`,
              isEmpoweredIncomingHit ? '#ff7a7a' : '#ffb1b1',
              isEmpoweredIncomingHit
                ? {
                    fontSize: '18px',
                    strokeThickness: 3,
                    rise: 22,
                    duration: 780,
                  }
                : undefined,
            );
          }
        }

        this.showCombatZeroDamageOutcome(previousActionText, playerState);

        this.showHarvestingDebugOutcome(previousActionText, playerState);
      } else {
        this.upsertRemotePlayer(playerState);
      }
    }

    const visibleIds = new Set(Object.keys(players));
    pruneRemotePlayerVisuals(this.remotePlayers, visibleIds);
  }

  private applyNodeSnapshot(nodes: Record<string, WorldNodeState>): void {
    syncNodeVisuals({
      nodes,
      worldNodes: this.worldNodes,
      getWorldPositionFromTile: (tileX: number, tileY: number) => this.getWorldPositionFromTile(tileX, tileY),
      createNodeSprite: (worldX: number, worldY: number, textureKey: string) =>
        this.add.sprite(worldX, worldY, textureKey).setDepth(2),
      styleNodeSprite: (sprite: Phaser.GameObjects.Sprite, nodeState: WorldNodeState) => {
        const fallbackTextureKey = nodeState.type === 'tree' ? TREE_TEXTURE_KEY : ROCK_TEXTURE_KEY;
        const resolvedTextureKey = this.resolveEntityTextureKey(
          'resource-node',
          nodeState.resourceId,
          nodeState.resourceImage,
          fallbackTextureKey,
        );
        sprite.setTexture(resolvedTextureKey);
        sprite.setDisplaySize(TILE_SIZE, TILE_SIZE);
        applyNodeSpriteStyling(sprite, nodeState);
      },
      treeTextureKey: TREE_TEXTURE_KEY,
      rockTextureKey: ROCK_TEXTURE_KEY,
    });
  }

  private applyNpcSnapshot(npcs: Record<string, NpcState>): void {
    syncNpcVisuals({
      npcs,
      worldNpcs: this.worldNpcs,
      getWorldPositionFromTile: (tileX: number, tileY: number) => this.getWorldPositionFromTile(tileX, tileY),
      createNpcSprite: (worldX: number, worldY: number, textureKey: string) =>
        this.add.sprite(worldX, worldY, textureKey).setDepth(2),
      styleNpcSprite: (sprite: Phaser.GameObjects.Sprite, npcState: NpcState) => {
        const resolvedTextureKey = this.resolveEntityTextureKey(
          'npc',
          npcState.id,
          npcState.image,
          PLAYER_TEXTURE_KEY,
        );
        sprite.setTexture(resolvedTextureKey);
        sprite.setDisplaySize(TILE_SIZE, TILE_SIZE);
        applyNpcSpriteStyling(sprite, npcState, {
          player: PLAYER_TEXTURE_KEY,
          tree: TREE_TEXTURE_KEY,
          rock: ROCK_TEXTURE_KEY,
        });
      },
      defaultTextureKey: PLAYER_TEXTURE_KEY,
    });

    this.syncNpcQuestMarkers();
  }

  private syncNpcQuestMarkers(): void {
    for (const [npcId, npcVisual] of this.worldNpcs.entries()) {
      const hasAvailableQuest = Boolean(npcVisual.state?.questAvailable);
      const marker = this.npcQuestMarkers.get(npcId);

      if (!hasAvailableQuest) {
        marker?.destroy();
        this.npcQuestMarkers.delete(npcId);
        continue;
      }

      const markerX = npcVisual.sprite.x;
      const markerY = npcVisual.sprite.y - TILE_SIZE * 0.9;
      if (marker) {
        marker.setPosition(markerX, markerY);
      } else {
        const createdMarker = this.add.text(markerX, markerY, '!', {
          fontFamily: 'monospace',
          fontSize: '18px',
          color: '#ffe07a',
          stroke: '#000000',
          strokeThickness: 3,
        });
        createdMarker.setOrigin(0.5, 1).setDepth(7);
        this.npcQuestMarkers.set(npcId, createdMarker);
      }
    }

    for (const [npcId, marker] of this.npcQuestMarkers.entries()) {
      if (this.worldNpcs.has(npcId)) {
        continue;
      }

      marker.destroy();
      this.npcQuestMarkers.delete(npcId);
    }
  }

  private applyObjectSnapshot(objects: Record<string, WorldObjectState>): void {
    syncObjectVisuals({
      objects,
      worldObjects: this.worldObjects,
      getWorldPositionFromTile: (tileX: number, tileY: number) => this.getWorldPositionFromTile(tileX, tileY),
      createObjectSprite: (worldX: number, worldY: number, textureKey: string) =>
        this.add.sprite(worldX, worldY, textureKey).setDepth(1.8),
      styleObjectSprite: (sprite: Phaser.GameObjects.Sprite, objectState: WorldObjectState) => {
        const resolvedTextureKey = this.resolveEntityTextureKey(
          'world-object',
          objectState.objectTypeId,
          objectState.image,
          ROCK_TEXTURE_KEY,
        );
        sprite.setTexture(resolvedTextureKey);
        sprite.setDisplaySize(TILE_SIZE, TILE_SIZE);
        applyObjectSpriteStyling(sprite, objectState, {
          player: PLAYER_TEXTURE_KEY,
          tree: TREE_TEXTURE_KEY,
          rock: ROCK_TEXTURE_KEY,
        });
      },
      defaultTextureKey: ROCK_TEXTURE_KEY,
    });
  }

  private applyEnemySnapshot(enemies: Record<string, EnemyState>): void {
    syncEnemyVisuals({
      enemies,
      worldEnemies: this.worldEnemies,
      getWorldPositionFromTile: (tileX: number, tileY: number) => this.getWorldPositionFromTile(tileX, tileY),
      buildEnemyPathWaypoints: (enemyState: EnemyState) => this.buildEnemyPathWaypoints(enemyState),
      createEnemySprite: (x: number, y: number, textureKey: string) => this.add.sprite(x, y, textureKey),
      createEnemyHealthBar: () => this.add.graphics(),
      showFloatingText: (worldX: number, worldY: number, text: string, color: string) => {
        this.showFloatingText(worldX, worldY, text, color);
      },
      enemyTextureKey: ENEMY_TEXTURE_KEY,
      styleEnemySprite: (sprite: Phaser.GameObjects.Sprite, enemyState: EnemyState) => {
        const textureIdentity = String(enemyState.minionTypeId ?? enemyState.type ?? enemyState.id);
        const resolvedTextureKey = this.resolveEntityTextureKey(
          'enemy',
          textureIdentity,
          enemyState.image,
          ENEMY_TEXTURE_KEY,
        );
        sprite.setTexture(resolvedTextureKey);
        sprite.setDisplaySize(TILE_SIZE, TILE_SIZE);
      },
      healthBarVisibleMs: HEALTH_BAR_VISIBLE_MS,
      tileSize: TILE_SIZE,
    });
  }

  private applyGroundItemSnapshot(groundItems: Record<string, GroundItemState>): void {
    syncGroundItemVisuals({
      groundItems,
      worldGroundItems: this.worldGroundItems,
      getWorldPositionFromTile: (tileX: number, tileY: number) => this.getWorldPositionFromTile(tileX, tileY),
      ensureGroundItemTextureLoaded: (textureKey: string, imagePath: string) =>
        this.ensureGroundItemTextureLoaded(textureKey, imagePath),
      createGroundItemSprite: (x: number, y: number, textureKey: string) =>
        this.add.image(x, y, textureKey),
      createGroundItemQuantityText: (x: number, y: number, text: string) =>
        this.add.text(x, y, text, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#fff1bd',
          stroke: '#000000',
          strokeThickness: 2,
        }),
      fallbackTextureKey: PLAYER_TEXTURE_KEY,
    });
  }

  private ensureGroundItemTextureLoaded(textureKey: string, imagePath: string): boolean {
    const resolvedPath = this.resolveRuntimeAssetUrl(imagePath);
    if (!resolvedPath) {
      return false;
    }

    if (this.textures.exists(textureKey)) {
      return true;
    }

    if (this.pendingGroundItemTextureLoads.has(textureKey)) {
      return false;
    }

    this.pendingGroundItemTextureLoads.add(textureKey);
    this.load.image(textureKey, resolvedPath);
    this.load.once(`filecomplete-image-${textureKey}`, () => {
      this.pendingGroundItemTextureLoads.delete(textureKey);
    });

    if (!this.load.isLoading()) {
      this.load.start();
    }

    return false;
  }

  private upsertRemotePlayer(playerState: RemotePlayerState): void {
    if (playerState.id === this.localPlayerId) {
      return;
    }

    upsertRemotePlayerVisual({
      remotePlayers: this.remotePlayers,
      playerState,
      resolveTilePosition: (state: RemotePlayerState) => this.resolveTilePosition(state),
      getWorldPositionFromTile: (tileX: number, tileY: number) => this.getWorldPositionFromTile(tileX, tileY),
      buildPathWaypoints: (state: RemotePlayerState) => this.buildPathWaypoints(state),
      createPlayerSprite: (x: number, y: number, textureKey: string) => this.add.sprite(x, y, textureKey),
      createHealthBar: () => this.add.graphics(),
      createHarvestingIndicator: (x: number, y: number, textureKey: string) =>
        this.add.image(x, y, textureKey),
      playerTextureKey: PLAYER_TEXTURE_KEY,
      stylePlayerSprite: (sprite: Phaser.GameObjects.Sprite) => {
        this.applyPlayerSpriteAppearance(sprite);
        sprite.setDisplaySize(TILE_SIZE, TILE_SIZE);
      },
      harvestIndicatorTextureKey: HARVEST_AXE_TEXTURE_KEY,
      healthBarVisibleMs: HEALTH_BAR_VISIBLE_MS,
      tileSize: TILE_SIZE,
      showFloatingText: (worldX: number, worldY: number, text: string, color: string) => {
        this.showFloatingText(worldX, worldY, text, color);
      },
    });
  }

  private resolveTilePosition(playerState: RemotePlayerState): Phaser.Math.Vector2 {
    const hasTileCoords =
      Number.isFinite(playerState.tileX) && Number.isFinite(playerState.tileY);

    if (hasTileCoords) {
      return new Phaser.Math.Vector2(
        Phaser.Math.Clamp(Math.round(playerState.tileX), 0, this.worldWidthTiles - 1),
        Phaser.Math.Clamp(Math.round(playerState.tileY), 0, this.worldHeightTiles - 1),
      );
    }

    const fallbackTileX = Number.isFinite(playerState.x)
      ? Math.round(playerState.x / TILE_SIZE - 0.5)
      : Math.floor(this.worldWidthTiles * 0.5);
    const fallbackTileY = Number.isFinite(playerState.y)
      ? Math.round(playerState.y / TILE_SIZE - 0.5)
      : Math.floor(this.worldHeightTiles * 0.5);

    return new Phaser.Math.Vector2(
      Phaser.Math.Clamp(fallbackTileX, 0, this.worldWidthTiles - 1),
      Phaser.Math.Clamp(fallbackTileY, 0, this.worldHeightTiles - 1),
    );
  }

  private getWorldPositionFromTile(tileX: number, tileY: number): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(
      tileX * TILE_SIZE + TILE_SIZE * 0.5,
      tileY * TILE_SIZE + TILE_SIZE * 0.5,
    );
  }

  private removeRemotePlayer(id: string): void {
    removeRemotePlayerVisual(this.remotePlayers, id);
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    this.hideBankQuantityPrompt();

    if (pointer.rightButtonDown()) {
      this.openExamineContextMenu(pointer);
      return;
    }

    this.hideContextMenu();

    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const tileX = Phaser.Math.Clamp(Math.floor(worldPoint.x / TILE_SIZE), 0, this.worldWidthTiles - 1);
    const tileY = Phaser.Math.Clamp(Math.floor(worldPoint.y / TILE_SIZE), 0, this.worldHeightTiles - 1);

    this.logInteractionTrace('pointer.down', {
      pointer: { x: pointer.x, y: pointer.y },
      worldPoint: { x: worldPoint.x, y: worldPoint.y },
      tile: { x: tileX, y: tileY },
    });

    const clickedNode = this.findNodeAtTile(tileX, tileY);

    if (clickedNode) {
      this.logInteractionTrace('pointer.target.node', {
        nodeId: clickedNode.state.id,
        tile: { x: tileX, y: tileY },
      });
      this.showTileClickFeedback(tileX, tileY, 'interact');
      this.startNodeInteraction(clickedNode.state.id);
      return;
    }

    const clickedNpc = this.findNpcAtTile(tileX, tileY);
    if (clickedNpc) {
      this.logInteractionTrace('pointer.target.npc', {
        npcId: clickedNpc.state.id,
        npcType: clickedNpc.state.type,
        tile: { x: tileX, y: tileY },
      });
      this.showTileClickFeedback(tileX, tileY, 'npc-interact');
      this.talkToNpc(clickedNpc.state.id);
      return;
    }

    const clickedEnemy = this.findEnemyAtTile(tileX, tileY);
    if (clickedEnemy && !clickedEnemy.state.isDead) {
      this.logInteractionTrace('pointer.target.enemy', {
        enemyId: clickedEnemy.state.id,
        tile: { x: tileX, y: tileY },
      });
      this.showTileClickFeedback(tileX, tileY, 'interact');
      this.attackEnemy(clickedEnemy.state.id);
      return;
    }

    const clickedObject = this.findObjectAtTile(tileX, tileY);
    if (clickedObject) {
      this.logInteractionTrace('pointer.target.object', {
        objectId: clickedObject.state.id,
        objectTypeId: clickedObject.state.objectTypeId,
        blocksMovement: clickedObject.state.blocksMovement,
        tile: { x: tileX, y: tileY },
      });

      if (!clickedObject.state.blocksMovement) {
        this.showTileClickFeedback(tileX, tileY, 'walk');
        this.performWalkTo(tileX, tileY);
        return;
      }

      this.showTileClickFeedback(tileX, tileY, 'interact');

      this.useWorldObject(clickedObject.state.id);

      return;
    }

    const clickedGroundItems = this.findGroundItemsAtTile(tileX, tileY);
    if (clickedGroundItems.length > 0) {
      this.logInteractionTrace('pointer.target.groundItem', {
        groundItemId: clickedGroundItems[0].state.id,
        tile: { x: tileX, y: tileY },
      });
      this.showTileClickFeedback(tileX, tileY, 'interact');
      this.pickupGroundItem(clickedGroundItems[0].state.id);
      return;
    }

    this.logInteractionTrace('pointer.target.walkOnly', {
      tile: { x: tileX, y: tileY },
    });
    this.performWalkTo(tileX, tileY);
  }

  private startNodeInteraction(nodeId: string): void {
    const nodeVisual = this.worldNodes.get(nodeId);
    if (!nodeVisual) {
      return;
    }

    this.queueInteractionTarget(
      {
        type: 'node-harvest',
        id: nodeVisual.state.id,
        tileX: nodeVisual.state.tileX,
        tileY: nodeVisual.state.tileY,
        name: nodeVisual.state.resourceName,
        range: 1,
      },
      'interact',
    );
  }

  private openExamineContextMenu(pointer: Phaser.Input.Pointer): void {
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const tileX = Phaser.Math.Clamp(Math.floor(worldPoint.x / TILE_SIZE), 0, this.worldWidthTiles - 1);
    const tileY = Phaser.Math.Clamp(Math.floor(worldPoint.y / TILE_SIZE), 0, this.worldHeightTiles - 1);

    const options: ContextMenuOption[] = [];
    const nodeAtTile = this.findNodeAtTile(tileX, tileY);
    const npcAtTile = this.findNpcAtTile(tileX, tileY);
    const enemyAtTile = this.findEnemyAtTile(tileX, tileY);
    const objectAtTile = this.findObjectAtTile(tileX, tileY);
    const groundItemsAtTile = this.findGroundItemsAtTile(tileX, tileY);
    const playersAtTile = this.getPlayersAtTile(tileX, tileY);
    const tileType = this.getTileTypeName(tileX, tileY);

    options.push({
      label: `${tileType} tile`,
    });

    options.push({
      label: 'Walk here',
      onSelect: () => {
        this.performWalkTo(tileX, tileY);
      },
    });

    if (nodeAtTile) {
      const name = nodeAtTile.state.resourceName;

      options.push({
        label: nodeAtTile.state.resourceActionLabel,
        onSelect: () => {
          this.startNodeInteraction(nodeAtTile.state.id);
        },
      });

      options.push({
        label: `Examine ${name}`,
        onSelect: () => {
          this.appendSystemChatMessage(nodeAtTile.state.resourceExamineText);
        },
      });
    }

    if (npcAtTile) {
      const npcHasShop = Object.values(this.shopDefinitions).some(
        (shop) => shop.npcId === npcAtTile.state.id,
      );

      options.push({
        label: `Talk-to ${npcAtTile.state.name}`,
        onSelect: () => {
          this.talkToNpc(npcAtTile.state.id);
        },
      });

      if (npcHasShop) {
        options.push({
          label: `Trade with ${npcAtTile.state.name}`,
          onSelect: () => {
            this.tradeWithNpc(npcAtTile.state.id);
          },
        });
      }

      options.push({
        label: `Examine ${npcAtTile.state.name}`,
        onSelect: () => {
          this.appendSystemChatMessage(npcAtTile.state.examineText);
        },
      });
    }

    if (enemyAtTile) {
      options.push({
        label: `Attack ${enemyAtTile.state.name}`,
        onSelect: () => {
          this.attackEnemy(enemyAtTile.state.id);
        },
      });

      options.push({
        label: `Examine ${enemyAtTile.state.name}`,
        onSelect: () => {
          this.appendSystemChatMessage(enemyAtTile.state.examineText);
        },
      });
    }

    if (objectAtTile) {
      const objectBehavior = String(objectAtTile.state.behavior ?? '').trim().toLowerCase();
      if (objectBehavior !== 'decorative') {
        options.push({
          label: `Use ${objectAtTile.state.name}`,
          onSelect: () => {
            this.useWorldObject(objectAtTile.state.id);
          },
        });
      }

      options.push({
        label: `Examine ${objectAtTile.state.name}`,
        onSelect: () => {
          this.appendSystemChatMessage(objectAtTile.state.examineText);
        },
      });
    }

    if (groundItemsAtTile.length > 0) {
      for (const groundItemAtTile of groundItemsAtTile) {
        const quantityText =
          groundItemAtTile.state.quantity > 1 ? ` x${groundItemAtTile.state.quantity}` : '';

        options.push({
          label: `Take ${groundItemAtTile.state.name}${quantityText}`,
          onSelect: () => {
            this.pickupGroundItem(groundItemAtTile.state.id);
          },
        });

        options.push({
          label: `Examine ${groundItemAtTile.state.name}`,
          onSelect: () => {
            this.appendSystemChatMessage(
              `${groundItemAtTile.state.name} x${groundItemAtTile.state.quantity} lies on the ground.`,
            );
          },
        });
      }
    }

    for (const playerEntry of playersAtTile) {
      options.push({
        label: playerEntry.isLocal
          ? `Examine ${playerEntry.displayName} (You)`
          : `Examine ${playerEntry.displayName}`,
        onSelect: () => {
          this.appendSystemChatMessage(
            playerEntry.isLocal ? 'You look ready for adventure.' : 'Another adventurer is here.',
          );
        },
      });
    }

    this.showContextMenu(pointer, options);
  }

  private showContextMenu(pointer: Phaser.Input.Pointer, options: ContextMenuOption[]): void {
    this.hideContextMenu();
    this.hideItemTooltip();

    const pointerPosition = this.getPointerClientPosition(pointer);
    this.showContextMenuAt(pointerPosition.x, pointerPosition.y, options);
  }

  private showContextMenuAt(clientX: number, clientY: number, options: ContextMenuOption[]): void {
    this.hideContextMenu();
    this.hideItemTooltip();

    const appElement = document.querySelector<HTMLDivElement>('#app');
    if (!appElement) {
      return;
    }

    const menu = this.createContextMenuElement(options);
    appElement.appendChild(menu);
    this.positionContextMenu(menu, clientX, clientY + 8);

    this.contextMenuElement = menu;
    this.contextMenuCloseListener = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && this.contextMenuElement?.contains(target)) {
        return;
      }

      this.hideContextMenu();
    };
    window.addEventListener('pointerdown', this.contextMenuCloseListener, true);
  }

  private createContextMenuElement(options: ContextMenuOption[]): HTMLDivElement {
    const menu = document.createElement('div');
    menu.style.position = 'fixed';
    menu.style.minWidth = '170px';
    menu.style.background = 'rgba(19, 19, 19, 0.96)';
    menu.style.border = '1px solid rgba(154, 144, 107, 1)';
    menu.style.padding = '6px 0';
    menu.style.zIndex = '3000';
    menu.style.pointerEvents = 'auto';
    menu.style.boxShadow = '0 2px 10px rgba(0,0,0,0.45)';
    menu.style.userSelect = 'none';

    for (const option of options) {
      const row = document.createElement('div');
      row.textContent = option.label;
      row.style.fontFamily = 'monospace';
      row.style.fontSize = '13px';
      row.style.padding = '4px 10px';
      row.style.whiteSpace = 'nowrap';

      if (option.onSelect) {
        row.style.color = '#efe8cc';
        row.style.cursor = 'pointer';

        row.addEventListener('mouseenter', () => {
          row.style.background = 'rgba(125, 109, 47, 0.45)';
          row.style.color = '#fff4c7';
        });

        row.addEventListener('mouseleave', () => {
          row.style.background = 'transparent';
          row.style.color = '#efe8cc';
        });

        row.addEventListener('mousedown', (event) => {
          event.stopPropagation();
          if (event.button !== 0) {
            return;
          }

          option.onSelect?.();
          this.hideContextMenu();
        });
      } else {
        row.style.color = '#bbb39a';
      }

      menu.appendChild(row);
    }

    return menu;
  }

  private positionContextMenu(menu: HTMLDivElement, requestedLeft: number, requestedTop: number): void {
    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;
    const left = Math.max(0, Math.min(requestedLeft, window.innerWidth - menuWidth));
    const top = Math.max(0, Math.min(requestedTop, window.innerHeight - menuHeight));

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  private hideContextMenu(): void {
    if (this.contextMenuCloseListener) {
      window.removeEventListener('pointerdown', this.contextMenuCloseListener, true);
      this.contextMenuCloseListener = null;
    }

    if (!this.contextMenuElement) {
      return;
    }

    this.contextMenuElement.remove();
    this.contextMenuElement = null;
  }

  private ensureItemTooltipElement(): HTMLDivElement | null {
    if (this.itemTooltipElement) {
      return this.itemTooltipElement;
    }

    const appElement = document.querySelector<HTMLDivElement>('#app');
    if (!appElement) {
      return null;
    }

    const tooltip = document.createElement('div');
    tooltip.style.position = 'fixed';
    tooltip.style.display = 'none';
    tooltip.style.maxWidth = '260px';
    tooltip.style.background = 'rgba(19, 19, 19, 0.96)';
    tooltip.style.border = '1px solid rgba(154, 144, 107, 1)';
    tooltip.style.padding = '6px 8px';
    tooltip.style.color = '#efe8cc';
    tooltip.style.fontFamily = 'monospace';
    tooltip.style.fontSize = '12px';
    tooltip.style.whiteSpace = 'pre-line';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.userSelect = 'none';
    tooltip.style.zIndex = '3200';
    tooltip.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.45)';

    appElement.appendChild(tooltip);
    this.itemTooltipElement = tooltip;
    return tooltip;
  }

  private hideItemTooltip(): void {
    if (!this.itemTooltipElement) {
      return;
    }

    this.itemTooltipElement.style.display = 'none';
  }

  private formatItemStatsTooltip(name: string, gearStats: ItemGearStats | null): string {
    const lines: string[] = [name];

    if (!gearStats) {
      return lines.join('\n');
    }

    const pushStatLine = (label: string, value: number | undefined, includePlus = false): void => {
      if (!Number.isFinite(value) || value === 0) {
        return;
      }

      const numericValue = Number(value);
      const text = includePlus && numericValue > 0 ? `+${numericValue}` : String(numericValue);
      lines.push(`${label} ${text}`);
    };

    pushStatLine('STR', gearStats.baseStats?.strength, true);
    pushStatLine('CON', gearStats.baseStats?.constitution, true);

    if (gearStats.armorProfile) {
      pushStatLine('Armor:', gearStats.armorProfile.armor);
      if (
        Number.isFinite(gearStats.armorProfile.damageReductionPct) &&
        gearStats.armorProfile.damageReductionPct !== 0
      ) {
        lines.push(`Damage Reduction (DR): ${gearStats.armorProfile.damageReductionPct}%`);
      }

      const armorAccuracy = gearStats.armorProfile.accuracy;
      const melee = armorAccuracy?.melee;
      const ranged = armorAccuracy?.ranged;
      const magic = armorAccuracy?.magic;
      if (
        Number.isFinite(melee) ||
        Number.isFinite(ranged) ||
        Number.isFinite(magic)
      ) {
        lines.push(
          `Accuracy M/R/Mg: ${Number.isFinite(melee) ? melee : '-'} / ${Number.isFinite(ranged) ? ranged : '-'} / ${Number.isFinite(magic) ? magic : '-'}`,
        );
      }
    }

    if (gearStats.weaponProfile) {
      lines.push(`Weapon: ${gearStats.weaponProfile.type} (${gearStats.weaponProfile.style})`);
      pushStatLine('Damage:', gearStats.weaponProfile.baseDamage);
      pushStatLine('Accuracy:', gearStats.weaponProfile.accuracy);
      if (
        Number.isFinite(gearStats.weaponProfile.attackRateSeconds) &&
        gearStats.weaponProfile.attackRateSeconds !== 0
      ) {
        lines.push(`Speed: ${gearStats.weaponProfile.attackRateSeconds}s`);
      }
      pushStatLine('Range:', gearStats.weaponProfile.range);
    }

    return lines.join('\n');
  }

  private showItemTooltip(clientX: number, clientY: number, text: string): void {
    const tooltip = this.ensureItemTooltipElement();
    if (!tooltip) {
      return;
    }

    tooltip.textContent = text;
    tooltip.style.display = 'block';

    const margin = 8;
    const offset = 12;
    let left = clientX + offset;
    let top = clientY + offset;

    if (left + tooltip.offsetWidth + margin > window.innerWidth) {
      left = window.innerWidth - tooltip.offsetWidth - margin;
    }

    if (top + tooltip.offsetHeight + margin > window.innerHeight) {
      top = clientY - tooltip.offsetHeight - offset;
    }

    tooltip.style.left = `${Math.max(margin, left)}px`;
    tooltip.style.top = `${Math.max(margin, top)}px`;
  }

  private bindItemTooltip(
    element: HTMLElement,
    name: string,
    gearStats: ItemGearStats | null,
  ): void {
    const tooltipText = this.formatItemStatsTooltip(name, gearStats);

    element.addEventListener('pointerenter', (event: PointerEvent) => {
      this.showItemTooltip(event.clientX, event.clientY, tooltipText);
    });

    element.addEventListener('pointermove', (event: PointerEvent) => {
      this.showItemTooltip(event.clientX, event.clientY, tooltipText);
    });

    element.addEventListener('pointerleave', () => {
      this.hideItemTooltip();
    });
  }

  private getPointerClientPosition(pointer: Phaser.Input.Pointer): { x: number; y: number } {
    const event = pointer.event as MouseEvent | PointerEvent | undefined;
    if (event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
      return {
        x: event.clientX,
        y: event.clientY,
      };
    }

    const bounds = this.game.canvas.getBoundingClientRect();
    return {
      x: bounds.left + (pointer.x / this.scale.width) * bounds.width,
      y: bounds.top + (pointer.y / this.scale.height) * bounds.height,
    };
  }

  private logInteractionTrace(event: string, details: Record<string, unknown>): void {
    if (!DEBUG_INTERACTION_TRACE) {
      return;
    }

    console.log(`[interaction-trace] ${event}`, {
      ...details,
      at: Date.now(),
    });
  }

  private performWalkTo(
    tileX: number,
    tileY: number,
    clearPendingActions = true,
    showClickFeedback = true,
  ): void {
    const destination = this.resolveWalkDestination(tileX, tileY);

    this.logInteractionTrace('walk.perform', {
      requested: { tileX, tileY },
      destination: { x: destination.x, y: destination.y },
      clearPendingActions,
      showClickFeedback,
      localTile: this.localTilePosition
        ? { x: Math.round(this.localTilePosition.x), y: Math.round(this.localTilePosition.y) }
        : null,
      localStateTarget: this.localPlayerState
        ? { x: this.localPlayerState.targetTileX, y: this.localPlayerState.targetTileY }
        : null,
    });

    if (clearPendingActions) {
      this.pendingInteractionController.clear();
    }

    this.closeTransientInteractionUi();
    if (showClickFeedback) {
      this.showTileClickFeedback(destination.x, destination.y, 'walk');
    }
    this.localPathWaypoints.length = 0;
    this.localActiveRouteId = null;
    this.localCommittedDestination = null;
    this.localArrivalReportedRouteId = null;
    const routeId = `client-route-${this.nextClientRouteSequence}`;
    this.nextClientRouteSequence += 1;
    this.localRouteLocked = false;
    this.multiplayerClient.sendInput(0, 0);
    this.lastSentDirection.set(0, 0);
    this.multiplayerClient.sendInteractStop();
    this.multiplayerClient.sendMoveTo(destination.x, destination.y, routeId);
  }

  private resolveWalkDestination(tileX: number, tileY: number): Phaser.Math.Vector2 {
    const nodeAtTarget = this.findNodeAtTile(tileX, tileY);
    const npcAtTarget = this.findNpcAtTile(tileX, tileY);
    const enemyAtTarget = this.findEnemyAtTile(tileX, tileY);
    const objectAtTarget = this.findObjectAtTile(tileX, tileY);
    const objectBlocksMovement = Boolean(objectAtTarget?.state.blocksMovement);
    if (!nodeAtTarget && !npcAtTarget && !enemyAtTarget && !objectBlocksMovement) {
      this.logInteractionTrace('walk.resolve.direct', {
        target: { tileX, tileY },
      });
      return new Phaser.Math.Vector2(tileX, tileY);
    }

    const candidateTiles = [
      new Phaser.Math.Vector2(tileX + 1, tileY),
      new Phaser.Math.Vector2(tileX - 1, tileY),
      new Phaser.Math.Vector2(tileX, tileY + 1),
      new Phaser.Math.Vector2(tileX, tileY - 1),
    ].filter((candidate) => this.isTileWalkable(candidate.x, candidate.y));

    if (candidateTiles.length === 0) {
      this.logInteractionTrace('walk.resolve.noCandidates', {
        target: { tileX, tileY },
      });
      return new Phaser.Math.Vector2(tileX, tileY);
    }

    const origin = this.localTilePosition
      ? this.localTilePosition
      : new Phaser.Math.Vector2(
          Math.floor(this.player.x / TILE_SIZE),
          Math.floor(this.player.y / TILE_SIZE),
        );

    const originTileX = Math.round(origin.x);
    const originTileY = Math.round(origin.y);
    const pathLengths = this.getPathLengthsToTargets(originTileX, originTileY, candidateTiles);

    const reachableCandidates = candidateTiles
      .map((candidate) => ({
        candidate,
        pathLength: pathLengths.get(this.getTileKey(candidate.x, candidate.y)),
      }))
      .filter(
        (entry): entry is { candidate: Phaser.Math.Vector2; pathLength: number } =>
          typeof entry.pathLength === 'number',
      );

    if (reachableCandidates.length === 0) {
      this.logInteractionTrace('walk.resolve.noReachableCandidates', {
        target: { tileX, tileY },
        candidateTiles: candidateTiles.map((candidate) => ({ x: candidate.x, y: candidate.y })),
      });
      return new Phaser.Math.Vector2(tileX, tileY);
    }

    reachableCandidates.sort((left, right) => {
      if (left.pathLength !== right.pathLength) {
        return left.pathLength - right.pathLength;
      }

      const leftDistance =
        Math.abs(origin.x - left.candidate.x) + Math.abs(origin.y - left.candidate.y);
      const rightDistance =
        Math.abs(origin.x - right.candidate.x) + Math.abs(origin.y - right.candidate.y);
      return leftDistance - rightDistance;
    });

    const resolved = reachableCandidates[0].candidate;
    this.logInteractionTrace('walk.resolve.reachable', {
      target: { tileX, tileY },
      resolved: { x: resolved.x, y: resolved.y },
      origin: { x: originTileX, y: originTileY },
      candidates: reachableCandidates.map((entry) => ({
        x: entry.candidate.x,
        y: entry.candidate.y,
        pathLength: entry.pathLength,
      })),
    });

    return resolved;
  }

  private getPathLengthsToTargets(
    startTileX: number,
    startTileY: number,
    targets: Phaser.Math.Vector2[],
  ): Map<string, number> {
    const distances = new Map<string, number>();
    const remainingTargetKeys = new Set<string>();

    for (const target of targets) {
      if (!this.isTileWalkable(target.x, target.y)) {
        continue;
      }

      const targetKey = this.getTileKey(target.x, target.y);
      if (target.x === startTileX && target.y === startTileY) {
        distances.set(targetKey, 0);
        continue;
      }

      remainingTargetKeys.add(targetKey);
    }

    if (remainingTargetKeys.size === 0) {
      return distances;
    }

    const queue: Array<{ x: number; y: number; distance: number }> = [
      { x: startTileX, y: startTileY, distance: 0 },
    ];
    let queueIndex = 0;
    const visited = new Set<string>([`${startTileX},${startTileY}`]);

    while (queueIndex < queue.length) {
      const current = queue[queueIndex];
      queueIndex += 1;

      const neighbors = [
        { x: current.x + 1, y: current.y },
        { x: current.x - 1, y: current.y },
        { x: current.x, y: current.y + 1 },
        { x: current.x, y: current.y - 1 },
        { x: current.x + 1, y: current.y + 1 },
        { x: current.x + 1, y: current.y - 1 },
        { x: current.x - 1, y: current.y + 1 },
        { x: current.x - 1, y: current.y - 1 },
      ];

      for (const neighbor of neighbors) {
        if (!this.canTraverseBetweenTiles(current.x, current.y, neighbor.x, neighbor.y)) {
          continue;
        }

        const key = `${neighbor.x},${neighbor.y}`;
        if (visited.has(key)) {
          continue;
        }

        const nextDistance = current.distance + 1;

        visited.add(key);
        if (remainingTargetKeys.has(key)) {
          distances.set(key, nextDistance);
          remainingTargetKeys.delete(key);
          if (remainingTargetKeys.size === 0) {
            return distances;
          }
        }

        queue.push({ x: neighbor.x, y: neighbor.y, distance: nextDistance });
      }
    }

    return distances;
  }

  private canTraverseBetweenTiles(
    fromTileX: number,
    fromTileY: number,
    toTileX: number,
    toTileY: number,
  ): boolean {
    const deltaX = toTileX - fromTileX;
    const deltaY = toTileY - fromTileY;

    if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
      return false;
    }

    if (!this.isTileWalkable(toTileX, toTileY)) {
      return false;
    }

    if (Math.abs(deltaX) === 1 && Math.abs(deltaY) === 1) {
      const sideATileX = fromTileX + deltaX;
      const sideATileY = fromTileY;
      const sideBTileX = fromTileX;
      const sideBTileY = fromTileY + deltaY;
      return (
        this.isTileWalkable(sideATileX, sideATileY) &&
        this.isTileWalkable(sideBTileX, sideBTileY)
      );
    }

    return true;
  }

  private getTileKey(tileX: number, tileY: number): string {
    return `${tileX},${tileY}`;
  }

  private rebuildWalkabilityIndexes(): void {
    this.blockedNodeTiles.clear();
    this.blockedNpcTiles.clear();
    this.blockedObjectTiles.clear();

    for (const nodeVisual of this.worldNodes.values()) {
      this.blockedNodeTiles.add(this.getTileKey(nodeVisual.state.tileX, nodeVisual.state.tileY));
    }

    for (const npcVisual of this.worldNpcs.values()) {
      this.blockedNpcTiles.add(this.getTileKey(npcVisual.state.tileX, npcVisual.state.tileY));
    }

    for (const objectVisual of this.worldObjects.values()) {
      if (objectVisual.state.blocksMovement) {
        this.blockedObjectTiles.add(this.getTileKey(objectVisual.state.tileX, objectVisual.state.tileY));
      }
    }
  }

  private isTileWalkable(tileX: number, tileY: number): boolean {
    if (tileX < 0 || tileY < 0 || tileX >= this.worldWidthTiles || tileY >= this.worldHeightTiles) {
      return false;
    }

    const tileId = this.terrainData[tileY]?.[tileX];
    if (this.blockedTerrainTileIds.has(Number(tileId))) {
      return false;
    }

    const key = this.getTileKey(tileX, tileY);
    return !this.blockedNodeTiles.has(key)
      && !this.blockedNpcTiles.has(key)
      && !this.blockedObjectTiles.has(key);
  }

  private attackEnemy(enemyId: string): void {
    this.hideContextMenu();
    this.startEnemyAttack(enemyId);
  }

  private pickupGroundItem(groundItemId: string): void {
    this.hideContextMenu();
    this.startGroundItemPickup(groundItemId);
  }

  private talkToNpc(npcId: string): void {
    this.hideContextMenu();

    const npcVisual = this.worldNpcs.get(npcId);
    this.beginQuestDialogueRequest(npcId);

    const localTile = this.localTilePosition;
    if (npcVisual && localTile) {
      const distance =
        Math.abs(Math.round(localTile.x) - npcVisual.state.tileX)
        + Math.abs(Math.round(localTile.y) - npcVisual.state.tileY);
      if (distance <= 1) {
        this.multiplayerClient.sendNpcTalk(npcId);
        this.nextQuestDialogueRetryAt = Date.now() + QUEST_DIALOGUE_RETRY_INTERVAL_MS;
        return;
      }
    }

    this.startNpcAction(npcId, 'talk');
  }

  private tradeWithNpc(npcId: string): void {
    this.hideContextMenu();
    this.startNpcAction(npcId, 'trade');
  }

  private useWorldObject(objectId: string): void {
    this.hideContextMenu();
    this.startObjectAction(objectId);
  }

  private startNpcAction(npcId: string, action: 'talk' | 'trade'): void {
    const npcVisual = this.worldNpcs.get(npcId);
    if (!npcVisual) {
      return;
    }

    const type: InteractionTargetType = action === 'trade'
        ? 'npc-trade'
        : 'npc-talk';

    this.queueInteractionTarget(
      {
        type,
        id: npcVisual.state.id,
        tileX: npcVisual.state.tileX,
        tileY: npcVisual.state.tileY,
        name: npcVisual.state.name,
        range: 1,
      },
      'npc-interact',
    );
  }

  private resolveObjectInteractionType(objectState: WorldObjectState): InteractionTargetType {
    return this.interactionTargetRuntime.resolveObjectInteractionType(objectState.objectTypeId);
  }

  private startObjectAction(objectId: string): void {
    const objectVisual = this.worldObjects.get(objectId);
    if (!objectVisual) {
      return;
    }

    const type = this.resolveObjectInteractionType(objectVisual.state);
    this.logInteractionTrace('object.action.start', {
      objectId: objectVisual.state.id,
      objectTypeId: objectVisual.state.objectTypeId,
      interactionType: type,
      tile: { x: objectVisual.state.tileX, y: objectVisual.state.tileY },
    });

    this.queueInteractionTarget(
      {
        type,
        id: objectVisual.state.id,
        tileX: objectVisual.state.tileX,
        tileY: objectVisual.state.tileY,
        name: objectVisual.state.name,
        range: 1,
      },
      'interact',
    );
  }

  private queueInteractionTarget(
    target: InteractionTarget,
    clickFeedbackKind: ClickFeedbackKind,
  ): void {
    this.logInteractionTrace('interaction.queue', {
      target,
      clickFeedbackKind,
    });

    this.pendingInteractionController.queue(target, clickFeedbackKind, this.getPendingInteractionDeps());
  }

  private resolveCurrentInteractionTarget(target: InteractionTarget): InteractionTarget | null {
    return this.interactionTargetRuntime.resolveCurrentTarget(target, {
      getNodeById: (id: string) => this.worldNodes.get(id)?.state ?? null,
      getNpcById: (id: string) => this.worldNpcs.get(id)?.state ?? null,
      getEnemyById: (id: string) => this.worldEnemies.get(id)?.state ?? null,
      getGroundItemById: (id: string) => this.worldGroundItems.get(id)?.state ?? null,
      getObjectById: (id: string) => this.worldObjects.get(id)?.state ?? null,
    });
  }

  private processPendingInteractionTarget(): void {
    this.pendingInteractionController.process(this.getPendingInteractionDeps());
  }

  private getPendingInteractionDeps() {
    return {
      hideContextMenu: () => this.hideContextMenu(),
      showTileClickFeedback: (tileX: number, tileY: number, kind: ClickFeedbackKind) => {
        this.showTileClickFeedback(tileX, tileY, kind);
      },
      isWithinInteractionRange: (target: InteractionTarget) => this.isWithinInteractionRange(target),
      executeInteractionTarget: (target: InteractionTarget) => this.executeInteractionTarget(target),
      resolveWalkDestination: (tileX: number, tileY: number) => this.resolveWalkDestination(tileX, tileY),
      performWalkTo: (
        tileX: number,
        tileY: number,
        clearPendingActions: boolean,
        showClickFeedback: boolean,
      ) => {
        this.performWalkTo(tileX, tileY, clearPendingActions, showClickFeedback);
      },
      appendSystemChatMessage: (text: string) => this.appendSystemChatMessage(text),
      resolveCurrentInteractionTarget: (target: InteractionTarget) =>
        this.resolveCurrentInteractionTarget(target),
      hasActiveMoveTarget: () =>
        Boolean(
          this.localPlayerState
          && this.localPlayerState.targetTileX !== null
          && this.localPlayerState.targetTileY !== null,
        ),
      getLocalTilePosition: () =>
        this.localTilePosition
          ? { x: Math.round(this.localTilePosition.x), y: Math.round(this.localTilePosition.y) }
          : null,
      now: () => Date.now(),
      trace: (event: string, details: Record<string, unknown>) => {
        this.logInteractionTrace(event, details);
      },
    };
  }

  private isWithinInteractionRange(target: InteractionTarget): boolean {
    if (
      Number.isFinite(target.approachTileX)
      && Number.isFinite(target.approachTileY)
    ) {
      return this.isAtApproachTile(this.localTilePosition, target)
        || this.isWithinInteractionRangeFromPosition(this.localTilePosition, target)
        || this.isWithinInteractionRangeFromPosition(this.localRenderedTilePosition, target);
    }

    return this.isWithinInteractionRangeFromPosition(this.localTilePosition, target)
      || this.isWithinInteractionRangeFromPosition(this.localRenderedTilePosition, target);
  }

  private isAtApproachTile(
    position: Phaser.Math.Vector2 | null,
    target: InteractionTarget,
  ): boolean {
    if (
      !position
      || !Number.isFinite(target.approachTileX)
      || !Number.isFinite(target.approachTileY)
    ) {
      return false;
    }

    return Math.round(position.x) === target.approachTileX
      && Math.round(position.y) === target.approachTileY;
  }

  private isWithinInteractionRangeFromPosition(
    position: Phaser.Math.Vector2 | null,
    target: InteractionTarget,
  ): boolean {
    if (!position) {
      return false;
    }

    const distance =
      Math.abs(Math.round(position.x) - target.tileX)
      + Math.abs(Math.round(position.y) - target.tileY);
    return distance <= target.range;
  }

  private executeInteractionTarget(target: InteractionTarget): void {
    this.logInteractionTrace('interaction.execute', {
      target,
      localTile: this.localTilePosition
        ? { x: Math.round(this.localTilePosition.x), y: Math.round(this.localTilePosition.y) }
        : null,
      renderedTile: this.localRenderedTilePosition
        ? { x: Math.round(this.localRenderedTilePosition.x), y: Math.round(this.localRenderedTilePosition.y) }
        : null,
    });

    this.interactionTargetRuntime.executeTarget(target, {
      executeNodeHarvest: (targetId: string) => {
        this.multiplayerClient.sendInput(0, 0);
        this.lastSentDirection.set(0, 0);
        this.multiplayerClient.sendInteractStart(targetId);
      },
      executeNpcTalk: (targetId: string) => this.multiplayerClient.sendNpcTalk(targetId),
      executeNpcTrade: (targetId: string) => this.multiplayerClient.sendShopOpen(targetId),
      executeObjectBank: (targetId: string) => this.multiplayerClient.sendBankOpen(targetId),
      executeEnemyAttack: (targetId: string) => this.multiplayerClient.sendCombatAttack(targetId),
      executeGroundPickup: (targetId: string) => this.multiplayerClient.sendGroundItemPickup(targetId),
      executeObjectCrafting: (targetId: string) => this.multiplayerClient.sendCraftingOpen(targetId),
      executeObjectUse: (targetId: string) => {
        const objectState = this.worldObjects.get(targetId)?.state;
        if (objectState) {
          this.appendSystemChatMessage(objectState.examineText);
        }
      },
    });
  }

  private startEnemyAttack(enemyId: string): void {
    const enemyVisual = this.worldEnemies.get(enemyId);
    if (!enemyVisual || enemyVisual.state.isDead) {
      return;
    }

    this.queueInteractionTarget(
      {
        type: 'enemy-attack',
        id: enemyVisual.state.id,
        tileX: enemyVisual.state.tileX,
        tileY: enemyVisual.state.tileY,
        name: enemyVisual.state.name,
        range: 1,
      },
      'interact',
    );
  }

  private startGroundItemPickup(groundItemId: string): void {
    const groundItem = this.worldGroundItems.get(groundItemId);
    if (!groundItem) {
      return;
    }

    this.queueInteractionTarget(
      {
        type: 'ground-pickup',
        id: groundItem.state.id,
        tileX: groundItem.state.tileX,
        tileY: groundItem.state.tileY,
        name: groundItem.state.name,
        range: 1,
      },
      'interact',
    );
  }

  private initChatUi(): void {
    const panel = createChatPanel(() => {
      this.sendChatFromInput();
    });

    if (!panel) {
      return;
    }

    this.chatRootElement = panel.root;
    this.chatLogElement = panel.log;
    this.chatInputElement = panel.input;
  }

  private initCharacterUi(): void {
    const panel = createCharacterPanel((tab) => {
      this.setCharacterTab(tab);
    });

    if (!panel) {
      return;
    }

    this.characterRootElement = panel.root;
    this.characterTabBarElement = panel.tabBar;
    this.skillsRootElement = panel.root;
    this.skillsContentElement = panel.skillsContent;
    this.inventoryContentElement = panel.inventoryContent;
    this.inventoryHeaderElement = panel.inventoryHeader;
    this.inventoryGridElement = panel.inventoryGrid;
    this.gearContentElement = panel.gearContent;
    this.gearGridElement = panel.gearGrid;
    this.gearSummaryElement = panel.gearSummary;
    this.updateCharacterTabState();
  }

  private setCharacterTab(tab: 'skills' | 'inventory' | 'gear'): void {
    if (this.activeCharacterTab === tab) {
      return;
    }

    this.activeCharacterTab = tab;
    this.updateCharacterTabState();
  }

  private updateCharacterTabState(): void {
    const skillsVisible = this.activeCharacterTab === 'skills';
    const inventoryVisible = this.activeCharacterTab === 'inventory';
    const gearVisible = this.activeCharacterTab === 'gear';

    if (this.skillsContentElement) {
      this.skillsContentElement.style.display = skillsVisible ? 'block' : 'none';
    }

    if (this.inventoryContentElement) {
      this.inventoryContentElement.style.display = inventoryVisible ? 'flex' : 'none';
    }

    if (this.gearContentElement) {
      this.gearContentElement.style.display = gearVisible ? 'flex' : 'none';
    }

    if (inventoryVisible) {
      this.lastRenderedInventorySignature = null;
      this.renderInventoryPanel();
    }

    if (gearVisible) {
      this.lastRenderedGearSignature = null;
      this.renderGearPanel();
    }

    const tabButtons = this.characterTabBarElement?.querySelectorAll<HTMLButtonElement>('button');
    if (!tabButtons) {
      return;
    }

    for (const button of tabButtons) {
      const isActive =
        (skillsVisible && button.textContent === 'Skills') ||
        (inventoryVisible && button.textContent === 'Inventory') ||
        (gearVisible && button.textContent === 'Gear');

      button.style.background = isActive ? 'rgba(90, 82, 56, 0.98)' : 'rgba(64, 58, 41, 0.95)';
      button.style.color = isActive ? '#fff4c7' : '#f0e5c1';
    }
  }

  private initShopUi(): void {
    const panel = createShopPanel(() => {
      this.closeShop();
    });

    if (!panel) {
      return;
    }

    this.shopRootElement = panel.root;
    this.shopContentElement = panel.content;
  }

  private sendChatFromInput(): void {
    if (!this.chatInputElement) {
      return;
    }

    const text = this.chatInputElement.value.trim();
    if (!text) {
      return;
    }

    this.multiplayerClient.sendChat(text);
    this.chatInputElement.value = '';
  }

  private handleChatMessage(message: ChatMessageState): void {
    this.appendChatLine(message.text);
  }

  private handleQuestJournal(journal: QuestJournalState): void {
    this.questJournalState = journal;
    this.selectedQuestJournalQuestId = journal.selectedQuestId;
    this.renderQuestJournalPanel();
    this.renderQuestNotificationFeed();
  }

  private handleQuestDialogue(dialogue: QuestDialogueState): void {
    if (this.pendingQuestDialogueNpcId && dialogue.npcId === this.pendingQuestDialogueNpcId) {
      this.clearQuestDialogueRequest();
    }

    this.questDialogueState = dialogue;
    if (!dialogue.open) {
      this.closeQuestDialogue(false);
      return;
    }

    this.openQuestDialogue();
    this.renderQuestDialoguePanel();
  }

  private handleQuestNotification(notification: QuestNotificationState): void {
    this.questNotifications.push(notification);
    if (this.questNotifications.length > 12) {
      this.questNotifications.shift();
    }
  }

  private getActiveQuestsExpansionStorageKey(): string {
    const username = String(window.localStorage.getItem('game-auth-username') ?? '').trim().toLowerCase();
    return `${ACTIVE_QUESTS_EXPANDED_STORAGE_KEY}:${username || 'guest'}`;
  }

  private loadActiveQuestExpansionState(): void {
    if (this.activeQuestExpansionLoaded) {
      return;
    }

    this.activeQuestExpansionLoaded = true;

    try {
      const raw = window.localStorage.getItem(this.getActiveQuestsExpansionStorageKey());
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        this.expandedActiveQuestIds = new Set(parsed.map((entry) => String(entry ?? '').trim()).filter(Boolean));
      }
    } catch {
      this.expandedActiveQuestIds = new Set();
    }
  }

  private saveActiveQuestExpansionState(): void {
    try {
      window.localStorage.setItem(
        this.getActiveQuestsExpansionStorageKey(),
        JSON.stringify(Array.from(this.expandedActiveQuestIds.values())),
      );
    } catch {
      return;
    }
  }

  private toggleActiveQuestExpanded(questId: string): void {
    const safeQuestId = String(questId ?? '').trim();
    if (!safeQuestId) {
      return;
    }

    this.loadActiveQuestExpansionState();
    if (this.expandedActiveQuestIds.has(safeQuestId)) {
      this.expandedActiveQuestIds.delete(safeQuestId);
    } else {
      this.expandedActiveQuestIds.add(safeQuestId);
    }

    this.saveActiveQuestExpansionState();
    this.renderQuestNotificationFeed();
  }

  private openQuestJournal(): void {
    if (this.questJournalRootElement) {
      this.questJournalRootElement.style.display = 'flex';
    }
  }

  private toggleQuestJournal(): void {
    if (!this.questJournalRootElement) {
      return;
    }

    const isOpen = this.questJournalRootElement.style.display === 'flex';
    if (isOpen) {
      this.closeQuestJournal();
      return;
    }

    this.openQuestJournal();
    if (this.questJournalState) {
      this.renderQuestJournalPanel();
    }
  }

  private closeQuestJournal(): void {
    if (this.questJournalRootElement) {
      this.questJournalRootElement.style.display = 'none';
    }
  }

  private openQuestDialogue(): void {
    if (this.questDialogueRootElement) {
      this.questDialogueRootElement.style.display = 'flex';
    }
  }

  private closeQuestDialogue(emitCloseAction = true): void {
    this.clearQuestDialogueRequest();

    if (emitCloseAction && this.questDialogueState?.npcId) {
      this.multiplayerClient.sendQuestDialogueAction(
        this.questDialogueState.npcId,
        'close',
        this.questDialogueState.questId ?? undefined,
      );
    }

    if (this.questDialogueRootElement) {
      this.questDialogueRootElement.style.display = 'none';
    }

  }

  private renderQuestJournalPanel(): void {
    if (!this.questJournalState) {
      this.closeQuestJournal();
      return;
    }

    if (this.questJournalActiveContentElement) {
      this.questJournalActiveContentElement.textContent = this.questJournalState.active.length > 0
        ? this.questJournalState.active.map((quest) => `${quest.title} [${quest.status}]`).join('\n')
        : 'No active quests.';
    }

    if (this.questJournalCompletedContentElement) {
      this.questJournalCompletedContentElement.textContent = this.questJournalState.completed.length > 0
        ? this.questJournalState.completed.map((quest) => quest.title).join('\n')
        : 'No completed quests.';
    }

    if (!this.questJournalDetailsContentElement) {
      return;
    }

    const selectedQuest = this.questJournalState.active.find((entry) => entry.questId === this.selectedQuestJournalQuestId)
      ?? this.questJournalState.completed.find((entry) => entry.questId === this.selectedQuestJournalQuestId)
      ?? this.questJournalState.active[0]
      ?? this.questJournalState.completed[0]
      ?? null;

    if (!selectedQuest) {
      this.questJournalDetailsContentElement.textContent = 'Select a quest to view details.';
      return;
    }

    const objectiveLines = selectedQuest.steps.flatMap((step) =>
      step.objectives.map((objective) =>
        `- ${objective.description}: ${objective.progress}/${objective.required}`,
      ),
    );

    this.questJournalDetailsContentElement.textContent = [
      selectedQuest.title,
      `Status: ${selectedQuest.status}`,
      `Current step: ${selectedQuest.currentStepIndex + 1}`,
      'Objectives:',
      ...(objectiveLines.length > 0 ? objectiveLines : ['- None']),
    ].join('\n');

    if (selectedQuest.questId !== this.selectedQuestJournalQuestId) {
      this.selectedQuestJournalQuestId = selectedQuest.questId;
      this.multiplayerClient.sendQuestJournalSelect(selectedQuest.questId);
    }
  }

  private isTextInputFocused(): boolean {
    const activeElement = document.activeElement;
    if (!activeElement) {
      return false;
    }

    const tagName = activeElement.tagName;
    if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
      return true;
    }

    return (activeElement as HTMLElement).isContentEditable;
  }

  private formatIdentifierForUi(identifier: string, fallback: string): string {
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

  private renderQuestDialoguePanel(): void {
    if (!this.questDialogueState || !this.questDialogueState.open) {
      this.closeQuestDialogue(false);
      return;
    }

    if (this.questDialogueTextContentElement) {
      this.questDialogueTextContentElement.textContent = `[${this.questDialogueState.npcName}] ${this.questDialogueState.text}`;
    }

    if (!this.questDialogueOptionsRowElement) {
      return;
    }

    this.questDialogueOptionsRowElement.replaceChildren();
    const actionableOptions = this.questDialogueState.options.filter((option) => option.action !== 'close');
    for (const option of actionableOptions) {
      const button = document.createElement('button');
      button.textContent = option.label;
      button.style.background = 'rgba(64, 58, 41, 0.95)';
      button.style.border = '1px solid rgba(150, 138, 102, 0.9)';
      button.style.color = '#f0e5c1';
      button.style.fontFamily = 'monospace';
      button.style.fontSize = '12px';
      button.style.padding = '4px 8px';
      button.style.cursor = 'pointer';
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        button.disabled = true;
        this.multiplayerClient.sendQuestDialogueAction(
          this.questDialogueState?.npcId ?? '',
          option.action,
          this.questDialogueState?.questId ?? undefined,
          option.id,
        );

        if (option.action === 'close' || option.action === 'decline' || option.action === 'continue') {
          this.closeQuestDialogue(false);
        }
      });
      this.questDialogueOptionsRowElement?.append(button);
    }

    const dialogueNpcId = String(this.questDialogueState.npcId ?? '').trim();
    const npcShop = Object.values(this.shopDefinitions).find((shop) => shop.npcId === dialogueNpcId) ?? null;
    if (dialogueNpcId && npcShop) {
      const openShopButton = document.createElement('button');
      openShopButton.textContent = 'Open shop';
      openShopButton.style.background = 'rgba(64, 58, 41, 0.95)';
      openShopButton.style.border = '1px solid rgba(150, 138, 102, 0.9)';
      openShopButton.style.color = '#f0e5c1';
      openShopButton.style.fontFamily = 'monospace';
      openShopButton.style.fontSize = '12px';
      openShopButton.style.padding = '4px 8px';
      openShopButton.style.cursor = 'pointer';
      openShopButton.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.closeQuestDialogue();
        this.tradeWithNpc(dialogueNpcId);
      });
      this.questDialogueOptionsRowElement.append(openShopButton);
    }
  }

  private renderQuestNotificationFeed(): void {
    if (!this.questNotificationContentElement) {
      return;
    }

    this.loadActiveQuestExpansionState();
    this.questNotificationContentElement.replaceChildren();

    const activeQuests = this.questJournalState?.active ?? [];
    if (activeQuests.length === 0) {
      this.questNotificationContentElement.textContent = 'No active quests.';
      return;
    }

    for (const quest of activeQuests) {
      const card = document.createElement('div');
      card.style.border = '1px solid rgba(150, 138, 102, 0.55)';
      card.style.background = 'rgba(0, 0, 0, 0.3)';
      card.style.marginBottom = '6px';

      const headerButton = document.createElement('button');
      const isExpanded = this.expandedActiveQuestIds.has(quest.questId);
      headerButton.textContent = `${isExpanded ? '▾' : '▸'} ${quest.title} [${quest.status}]`;
      headerButton.style.width = '100%';
      headerButton.style.textAlign = 'left';
      headerButton.style.background = 'rgba(64, 58, 41, 0.95)';
      headerButton.style.border = '0';
      headerButton.style.borderBottom = isExpanded ? '1px solid rgba(150, 138, 102, 0.55)' : '0';
      headerButton.style.color = '#f0e5c1';
      headerButton.style.fontFamily = 'monospace';
      headerButton.style.fontSize = '12px';
      headerButton.style.padding = '6px';
      headerButton.style.cursor = 'pointer';
      headerButton.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.toggleActiveQuestExpanded(quest.questId);
      });

      card.append(headerButton);

      if (isExpanded) {
        const body = document.createElement('div');
        body.style.padding = '6px';
        body.style.whiteSpace = 'pre-line';

        const objectiveLines = quest.steps.flatMap((step) =>
          step.objectives.map((objective) => `- ${objective.description}: ${objective.progress}/${objective.required}`),
        );
        const requirementLines = quest.requirements.map((requirement) =>
          `${requirement.met ? '✓' : '✗'} ${requirement.label}`,
        );
        const rewardLines = [
          ...(Number.isFinite(Number(quest.rewards.gold)) ? [`- Gold: ${Math.max(0, Math.floor(Number(quest.rewards.gold)))}`] : []),
          ...(Array.isArray(quest.rewards.items)
            ? quest.rewards.items.map((item) => `- Item: ${this.formatIdentifierForUi(item.itemId, 'Item')} x${item.quantity}`)
            : []),
          ...(Array.isArray(quest.rewards.xp)
            ? quest.rewards.xp.map((xp) => `- XP: ${this.formatIdentifierForUi(xp.skill, 'Skill')} +${xp.amount}`)
            : []),
        ];

        body.textContent = [
          `Current step: ${quest.currentStepIndex + 1}`,
          'Objectives:',
          ...(objectiveLines.length > 0 ? objectiveLines : ['- None']),
          ...(requirementLines.length > 0 ? ['', 'Requirements:', ...requirementLines] : []),
          ...(rewardLines.length > 0 ? ['', 'Rewards:', ...rewardLines] : []),
        ].join('\n');

        card.append(body);
      }

      this.questNotificationContentElement.append(card);
    }
  }

  private openShop(shopId: string): void {
    this.activeShopId = shopId;
    this.lastRenderedShopSignature = null;
    this.closeCrafting();
    if (this.shopRootElement) {
      this.shopRootElement.style.display = 'flex';
    }

    this.renderShopPanel();
  }

  private closeShop(): void {
    this.activeShopId = null;
    this.lastRenderedShopSignature = null;
    if (this.shopRootElement) {
      this.shopRootElement.style.display = 'none';
    }
  }

  private initBankUi(): void {
    const panel = createBankPanel(() => {
      this.closeBank();
    });

    if (!panel) {
      return;
    }

    this.bankRootElement = panel.root;
    this.bankInventoryHeaderElement = panel.inventoryHeader;
    this.bankStorageHeaderElement = panel.storageHeader;
    this.bankInventoryGridElement = panel.inventoryGrid;
    this.bankStorageGridElement = panel.storageGrid;
  }

  private openBank(inventory: InventoryState, bank: InventoryState): void {
    if (this.localPlayerState) {
      this.localPlayerState.inventory = inventory;
    }

    this.closeShop();
    this.closeCrafting();
    this.bankInventoryState = bank;
    this.bankVisible = true;
    this.lastRenderedBankSignature = null;

    if (this.bankRootElement) {
      this.bankRootElement.style.display = 'flex';
    }

    this.renderBankPanel();
  }

  private closeBank(): void {
    this.bankVisible = false;
    this.lastRenderedBankSignature = null;
    this.hideBankQuantityPrompt();
    if (this.bankRootElement) {
      this.bankRootElement.style.display = 'none';
    }
  }

  private initCraftingUi(): void {
    const panel = createCraftingPanel(() => {
      this.closeCrafting();
    });

    if (!panel) {
      return;
    }

    this.craftingRootElement = panel.root;
    this.craftingContentElement = panel.content;
  }

  private initQuestJournalUi(): void {
    const panel = createQuestJournalPanel(() => {
      this.closeQuestJournal();
    });

    if (!panel) {
      return;
    }

    this.questJournalRootElement = panel.root;
    this.questJournalActiveContentElement = panel.activeContent;
    this.questJournalCompletedContentElement = panel.completedContent;
    this.questJournalDetailsContentElement = panel.detailsContent;
  }

  private initQuestDialogueUi(): void {
    const panel = createQuestDialoguePanel(() => {
      this.closeQuestDialogue();
    });

    if (!panel) {
      return;
    }

    this.questDialogueRootElement = panel.root;
    this.questDialogueTextContentElement = panel.textContent;
    this.questDialogueOptionsRowElement = panel.optionsRow;
  }

  private initQuestNotificationFeedUi(): void {
    const panel = createQuestNotificationFeed();
    if (!panel) {
      return;
    }

    this.questNotificationContentElement = panel.content;
    this.renderQuestNotificationFeed();
  }

  private openCrafting(state: CraftingOpenState): void {
    if (this.localPlayerState) {
      this.localPlayerState.inventory = state.inventory;
    }

    this.closeShop();
    this.closeBank();
    this.activeCraftingObjectId = state.objectId;
    this.activeCraftingStationType = state.stationType;
    this.activeCraftingTitle = state.title;
    if (state.stationType !== 'smithing_station') {
      this.selectedSmithingMaterialTab = 'bronze';
    }
    this.craftingRecipes = this.getSortedCraftingRecipes(
      Array.isArray(state.recipes) ? state.recipes : [],
      state.stationType,
    );
    this.craftingVisible = true;
    this.lastRenderedCraftingSignature = null;

    if (this.craftingRootElement) {
      this.craftingRootElement.style.display = 'flex';
    }

    this.renderCraftingPanel();
  }

  private handleCraftingProgress(state: CraftingProgressState): void {
    if (!state.active) {
      this.activeCraftingProgress = null;
      this.lastRenderedCraftingSignature = null;
      return;
    }

    this.activeCraftingProgress = {
      ...state,
      durationMs: Math.max(1, Math.floor(Number(state.durationMs ?? 1))),
      totalCount: Math.max(0, Math.floor(Number(state.totalCount ?? 0))),
      completedCount: Math.max(0, Math.floor(Number(state.completedCount ?? 0))),
      cycleStartedAt: Math.max(0, Math.floor(Number(state.cycleStartedAt ?? 0))),
      cycleEndsAt: Math.max(0, Math.floor(Number(state.cycleEndsAt ?? 0))),
      cycleRemainingMs: Math.max(0, Math.floor(Number(state.cycleRemainingMs ?? 0))),
      cycleProgress: Math.max(0, Math.min(1, Number(state.cycleProgress ?? 0))),
    };
    this.lastRenderedCraftingSignature = null;
  }

  private getSortedCraftingRecipes(recipes: CraftingRecipeState[], stationType: string): CraftingRecipeState[] {
    const safeRecipes = [...recipes];
    if (stationType === 'smelting_station') {
      return safeRecipes.sort((first, second) => {
        const levelDelta = first.requiredLevel - second.requiredLevel;
        if (levelDelta !== 0) {
          return levelDelta;
        }

        return first.name.localeCompare(second.name);
      });
    }

    if (stationType !== 'smithing_station') {
      return safeRecipes;
    }

    return safeRecipes.sort((first, second) => {
      const materialDelta = this.getSmithingMaterialRank(first) - this.getSmithingMaterialRank(second);
      if (materialDelta !== 0) {
        return materialDelta;
      }

      const typeDelta = this.getSmithingTypeRank(first) - this.getSmithingTypeRank(second);
      if (typeDelta !== 0) {
        return typeDelta;
      }

      const levelDelta = first.requiredLevel - second.requiredLevel;
      if (levelDelta !== 0) {
        return levelDelta;
      }

      return first.name.localeCompare(second.name);
    });
  }

  private getSmithingMaterialRank(recipe: CraftingRecipeState): number {
    const outputItemId = String(recipe.outputs[0]?.itemId ?? '').trim().toLowerCase();
    if (outputItemId.startsWith('bronze_')) {
      return 0;
    }

    if (outputItemId.startsWith('iron_')) {
      return 1;
    }

    return 99;
  }

  private getSmithingTypeRank(recipe: CraftingRecipeState): number {
    const outputItemId = String(recipe.outputs[0]?.itemId ?? '').trim().toLowerCase();
    if (outputItemId.endsWith('_axe')) {
      return 0;
    }

    if (outputItemId.endsWith('_pickaxe')) {
      return 1;
    }

    if (outputItemId.endsWith('_dagger')) {
      return 2;
    }

    if (outputItemId.endsWith('_sword')) {
      return 3;
    }

    if (outputItemId.endsWith('_spear')) {
      return 4;
    }

    if (outputItemId.endsWith('_helmet')) {
      return 5;
    }

    if (outputItemId.endsWith('_platelegs')) {
      return 6;
    }

    if (outputItemId.endsWith('_platebody')) {
      return 7;
    }

    return 99;
  }

  private getSmithingMaterialLabel(recipe: CraftingRecipeState): string | null {
    const outputItemId = String(recipe.outputs[0]?.itemId ?? '').trim().toLowerCase();
    if (outputItemId.startsWith('bronze_')) {
      return 'Bronze';
    }

    if (outputItemId.startsWith('iron_')) {
      return 'Iron';
    }

    return null;
  }

  private getCraftingSkillLevel(): number {
    const skills = this.localPlayerState?.skills;
    if (!skills) {
      return 1;
    }

    if (this.activeCraftingStationType === 'fletching_station') {
      return Math.max(1, Math.floor(Number(skills.fletching?.level ?? 1)));
    }

    return Math.max(1, Math.floor(Number(skills.smithing?.level ?? 1)));
  }

  private getFilteredCraftingRecipes(): CraftingRecipeState[] {
    if (this.activeCraftingStationType !== 'smithing_station') {
      return this.craftingRecipes;
    }

    const selectedMaterial = this.selectedSmithingMaterialTab;
    return this.craftingRecipes.filter((recipe) => {
      const outputItemId = String(recipe.outputs[0]?.itemId ?? '').trim().toLowerCase();
      return outputItemId.startsWith(`${selectedMaterial}_`);
    });
  }

  private closeCrafting(): void {
    this.craftingVisible = false;
    this.activeCraftingProgress = null;
    this.lastRenderedCraftingSignature = null;
    if (this.craftingRootElement) {
      this.craftingRootElement.style.display = 'none';
    }
  }

  private showBankQuantityPrompt(
    clientX: number,
    clientY: number,
    maxQuantity: number,
    onConfirm: (quantity: number) => void,
  ): void {
    this.hideBankQuantityPrompt();

    const root = document.createElement('div');
    root.style.position = 'fixed';
    root.style.left = `${clientX}px`;
    root.style.top = `${clientY}px`;
    root.style.background = 'rgba(0, 0, 0, 0.95)';
    root.style.border = '1px solid rgba(183, 170, 129, 0.92)';
    root.style.padding = '6px';
    root.style.display = 'flex';
    root.style.alignItems = 'center';
    root.style.gap = '6px';
    root.style.zIndex = '2900';

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.max = String(maxQuantity);
    input.value = String(Math.min(1, maxQuantity));
    input.style.width = '86px';
    input.style.background = 'rgba(23, 23, 23, 0.95)';
    input.style.border = '1px solid rgba(150, 138, 102, 0.9)';
    input.style.color = '#f0e5c1';
    input.style.fontFamily = 'monospace';
    input.style.fontSize = '12px';
    input.style.padding = '2px 4px';

    const moveButton = document.createElement('button');
    moveButton.textContent = 'Move';
    moveButton.style.fontFamily = 'monospace';
    moveButton.style.fontSize = '11px';
    moveButton.style.cursor = 'pointer';

    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.fontFamily = 'monospace';
    cancelButton.style.fontSize = '11px';
    cancelButton.style.cursor = 'pointer';

    const confirm = () => {
      const parsed = Math.floor(Number(input.value));
      if (!Number.isFinite(parsed) || parsed < 1) {
        return;
      }

      onConfirm(Math.min(maxQuantity, parsed));
      this.hideBankQuantityPrompt();
    };

    moveButton.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      confirm();
    });

    cancelButton.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.hideBankQuantityPrompt();
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        confirm();
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        this.hideBankQuantityPrompt();
      }
    });

    root.append(input, moveButton, cancelButton);
    document.body.appendChild(root);
    this.bankQuantityPromptElement = root;
    input.focus();
    input.select();
  }

  private hideBankQuantityPrompt(): void {
    if (!this.bankQuantityPromptElement) {
      return;
    }

    this.bankQuantityPromptElement.remove();
    this.bankQuantityPromptElement = null;
  }

  private appendSystemChatMessage(text: string): void {
    this.appendChatLine(`[Examine] ${text}`);
  }

  private appendChatLine(text: string): void {
    if (!this.chatLogElement) {
      return;
    }

    this.chatMessages.push(text);
    if (this.chatMessages.length > 40) {
      this.chatMessages.shift();
    }

    this.chatLogElement.textContent = this.chatMessages.join('\n');
    this.chatLogElement.scrollTop = this.chatLogElement.scrollHeight;
  }

  private getTileTypeName(tileX: number, tileY: number): string {
    const tileId = this.terrainData[tileY]?.[tileX];
    if (!Number.isFinite(tileId)) {
      return 'Unknown';
    }

    return `Tile ${Math.floor(tileId)}`;
  }

  private getPlayersAtTile(
    tileX: number,
    tileY: number,
  ): Array<{ id: string; isLocal: boolean; displayName: string }> {
    const results: Array<{ id: string; isLocal: boolean; displayName: string }> = [];

    if (
      this.localPlayerId &&
      this.localPlayerState &&
      this.localTilePosition &&
      Math.round(this.localTilePosition.x) === tileX &&
      Math.round(this.localTilePosition.y) === tileY
    ) {
      results.push({
        id: this.localPlayerId,
        isLocal: true,
        displayName: this.localPlayerState.displayName,
      });
    }

    for (const [playerId, remotePlayer] of this.remotePlayers.entries()) {
      if (
        Math.round(remotePlayer.targetTilePosition.x) === tileX &&
        Math.round(remotePlayer.targetTilePosition.y) === tileY
      ) {
        results.push({
          id: playerId,
          isLocal: false,
          displayName: remotePlayer.state.displayName,
        });
      }
    }

    return results;
  }

  private showTileClickFeedback(
    tileX: number,
    tileY: number,
    kind: ClickFeedbackKind,
  ): void {
    const position = this.getWorldPositionFromTile(tileX, tileY);
    const marker = this.add.graphics().setDepth(50).setPosition(position.x, position.y);

    const colors =
      kind === 'interact'
        ? { outline: 0x7ed0ff, cross: 0xbfe9ff }
        : kind === 'npc-interact'
          ? { outline: 0xc59bff, cross: 0xead9ff }
          : { outline: 0xe7d27a, cross: 0xfff4c7 };

    marker.lineStyle(2, colors.outline, 1);
    marker.strokeRect(-TILE_SIZE * 0.4, -TILE_SIZE * 0.4, TILE_SIZE * 0.8, TILE_SIZE * 0.8);

    marker.lineStyle(2, colors.cross, 1);
    marker.beginPath();
    marker.moveTo(-6, 0);
    marker.lineTo(6, 0);
    marker.moveTo(0, -6);
    marker.lineTo(0, 6);
    marker.strokePath();

    marker.setScale(0.65);

    this.tweens.add({
      targets: marker,
      alpha: 0,
      scaleX: 1.25,
      scaleY: 1.25,
      duration: 260,
      ease: 'Quad.Out',
      onComplete: () => {
        marker.destroy();
      },
    });
  }

  private findNodeAtTile(tileX: number, tileY: number): WorldNodeVisual | null {
    for (const nodeVisual of this.worldNodes.values()) {
      if (nodeVisual.state.tileX === tileX && nodeVisual.state.tileY === tileY) {
        return nodeVisual;
      }
    }

    return null;
  }

  private findNpcAtTile(tileX: number, tileY: number): NpcVisual | null {
    for (const npcVisual of this.worldNpcs.values()) {
      if (npcVisual.state.tileX === tileX && npcVisual.state.tileY === tileY) {
        return npcVisual;
      }
    }

    return null;
  }

  private findEnemyAtTile(tileX: number, tileY: number): EnemyVisual | null {
    for (const enemyVisual of this.worldEnemies.values()) {
      if (enemyVisual.state.isDead) {
        continue;
      }

      if (enemyVisual.state.tileX === tileX && enemyVisual.state.tileY === tileY) {
        return enemyVisual;
      }
    }

    return null;
  }

  private findObjectAtTile(tileX: number, tileY: number): WorldObjectVisual | null {
    for (const objectVisual of this.worldObjects.values()) {
      if (objectVisual.state.tileX === tileX && objectVisual.state.tileY === tileY) {
        return objectVisual;
      }
    }

    return null;
  }

  private findGroundItemsAtTile(tileX: number, tileY: number): GroundItemVisual[] {
    const itemsAtTile: GroundItemVisual[] = [];

    for (const groundItemVisual of this.worldGroundItems.values()) {
      if (groundItemVisual.state.tileX === tileX && groundItemVisual.state.tileY === tileY) {
        itemsAtTile.push(groundItemVisual);
      }
    }

    itemsAtTile.sort((left, right) => left.state.despawnAt - right.state.despawnAt);
    return itemsAtTile;
  }

  private renderActionStatus(): void {
    if (!this.localPlayerState || !this.localTilePosition) {
      this.actionStatusText.setText('Connecting...');
      return;
    }

    let status = 'Idle';

    const activeNodeId = this.localPlayerState.activeInteractionNodeId;
    if (this.localPlayerState.combatTargetEnemyId) {
      const targetEnemy = this.worldEnemies.get(this.localPlayerState.combatTargetEnemyId)?.state;
      if (targetEnemy && !targetEnemy.isDead) {
        const nextAttackInSeconds = Math.max(
          0,
          (Number(this.localPlayerState.nextCombatAt ?? 0) - Date.now()) / 1000,
        );
        status = `Fighting ${targetEnemy.name} (${targetEnemy.hp}/${targetEnemy.maxHp}) • Next hit ${nextAttackInSeconds.toFixed(1)}s`;
      } else {
        status = 'Searching target...';
      }
    } else if (activeNodeId) {
      const activeNode = this.worldNodes.get(activeNodeId)?.state;

      if (activeNode) {
        const distance =
          Math.abs(this.localTilePosition.x - activeNode.tileX) +
          Math.abs(this.localTilePosition.y - activeNode.tileY);

        if (distance > 1) {
          status = `Out of range: ${activeNode.resourceName}`;
        } else if (activeNode.isDepleted && activeNode.respawnAt) {
          const seconds = Math.max(0, (activeNode.respawnAt - Date.now()) / 1000);
          status = `${activeNode.resourceName} respawns in ${seconds.toFixed(1)}s`;
        } else {
          status = `Gathering ${activeNode.resourceName}...`;
        }
      }
    } else if (
      this.localPlayerState.targetTileX !== null &&
      this.localPlayerState.targetTileY !== null
    ) {
      status = `Moving to (${this.localPlayerState.targetTileX}, ${this.localPlayerState.targetTileY})`;
    } else if (this.localPlayerState.lastActionText) {
      status = this.localPlayerState.lastActionText;
    }

    this.actionStatusText.setText(
      `Status: ${status}`,
    );

    this.renderSkillsPanel();
    this.renderInventoryPanel();
    this.renderGearPanel();
    this.renderShopPanel();
    this.renderBankPanel();
    this.renderCraftingPanel();
  }

  private renderSkillsPanel(): void {
    if (!this.skillsContentElement || !this.localPlayerState) {
      return;
    }

    const skillLines = [
      { label: 'Woodcutting', value: this.localPlayerState.skills.woodcutting },
      { label: 'Mining', value: this.localPlayerState.skills.mining },
      { label: 'Smithing', value: this.localPlayerState.skills.smithing },
      { label: 'Fletching', value: this.localPlayerState.skills.fletching },
      { label: 'Strength', value: this.localPlayerState.skills.strength },
      { label: 'Defense', value: this.localPlayerState.skills.defense },
      { label: 'Constitution', value: this.localPlayerState.skills.constitution },
    ].map((entry) => {
      const nextXp = this.getXpRequiredForNextLevel(entry.value.level);
      const progress = nextXp === null ? `${entry.value.xp} / MAX` : `${entry.value.xp} / ${nextXp}`;
      return `${entry.label.padEnd(12, ' ')} Lv ${entry.value.level}  XP ${progress}`;
    });

    this.skillsContentElement.textContent = skillLines.join('\n');
  }

  private getXpRequiredForNextLevel(level: number): number | null {
    if (level >= 99) {
      return null;
    }

    return this.getXpForLevel(level + 1);
  }

  private getXpForLevel(level: number): number {
    if (level <= 1) {
      return 0;
    }

    return Math.floor(80 * (level - 1) * (level - 1) + 120 * (level - 1));
  }

  private getInventoryItemIcon(itemId: string): string {
    const resolvedKey = String(itemId || 'unknown-item');
    const existing = this.inventoryIconDataUrls.get(resolvedKey);
    if (existing) {
      return existing;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const context = canvas.getContext('2d');
    if (!context) {
      return '';
    }

    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, 16, 16);

    if (resolvedKey === 'birch_logs') {
      context.fillStyle = '#6e4f2f';
      context.fillRect(3, 8, 10, 3);
      context.fillStyle = '#9a7444';
      context.fillRect(2, 5, 10, 3);
      context.fillStyle = '#c79b62';
      context.fillRect(4, 3, 8, 2);
      context.fillStyle = '#9bbd6f';
      context.fillRect(2, 11, 12, 1);
    } else if (resolvedKey === 'oak_logs') {
      context.fillStyle = '#5d3f23';
      context.fillRect(3, 8, 10, 3);
      context.fillStyle = '#7b5431';
      context.fillRect(2, 5, 10, 3);
      context.fillStyle = '#a07341';
      context.fillRect(4, 3, 8, 2);
    } else if (resolvedKey === 'copper_ore') {
      context.fillStyle = '#6f6764';
      context.fillRect(4, 4, 8, 8);
      context.fillStyle = '#b87333';
      context.fillRect(5, 5, 2, 2);
      context.fillRect(9, 6, 2, 2);
      context.fillRect(7, 9, 2, 2);
    } else if (resolvedKey === 'tin_ore') {
      context.fillStyle = '#6f767d';
      context.fillRect(4, 4, 8, 8);
      context.fillStyle = '#b7c4cf';
      context.fillRect(5, 5, 2, 2);
      context.fillRect(9, 6, 2, 2);
      context.fillRect(7, 9, 2, 2);
    } else if (resolvedKey === 'iron_ore') {
      context.fillStyle = '#5f676d';
      context.fillRect(4, 4, 8, 8);
      context.fillStyle = '#8f9da8';
      context.fillRect(5, 5, 2, 2);
      context.fillRect(9, 6, 2, 2);
      context.fillRect(7, 9, 2, 2);
    } else if (resolvedKey === 'tinderbox') {
      context.fillStyle = '#8a5a3a';
      context.fillRect(4, 4, 8, 8);
      context.fillStyle = '#d6a23f';
      context.fillRect(5, 6, 6, 2);
      context.fillStyle = '#f2d58a';
      context.fillRect(6, 5, 3, 1);
    } else if (resolvedKey === 'bronze_axe') {
      context.fillStyle = '#7b5937';
      context.fillRect(7, 3, 2, 10);
      context.fillStyle = '#b48345';
      context.fillRect(4, 4, 4, 3);
      context.fillRect(3, 5, 2, 2);
    } else if (resolvedKey === 'bronze_pickaxe') {
      context.fillStyle = '#7b5937';
      context.fillRect(7, 4, 2, 9);
      context.fillStyle = '#8c9499';
      context.fillRect(4, 4, 8, 2);
      context.fillRect(5, 6, 2, 1);
      context.fillRect(9, 6, 2, 1);
    } else {
      context.fillStyle = '#6f6f6f';
      context.fillRect(4, 4, 8, 8);
      context.fillStyle = '#9b9b9b';
      context.fillRect(5, 5, 6, 2);
    }

    const dataUrl = canvas.toDataURL('image/png');
    this.inventoryIconDataUrls.set(resolvedKey, dataUrl);
    return dataUrl;
  }

  private renderInventoryPanel(): void {
    if (
      !this.inventoryContentElement ||
      !this.inventoryHeaderElement ||
      !this.inventoryGridElement ||
      !this.localPlayerState
    ) {
      return;
    }

    const inventory = this.localPlayerState.inventory;
    const usedSlots = inventory.slots.length;
    const gold = this.localPlayerState.gold;
    const hp = this.localPlayerState.hp;
    const maxHp = this.localPlayerState.maxHp;
    const slotSize = this.applySquareGridSizing(this.inventoryGridElement, 999);

    const inventorySignature = [
      hp,
      maxHp,
      gold,
      slotSize,
      inventory.maxSlots,
      inventory.slots
        .map((slot) => `${slot.image || '/assets/items/unknown.png'}:${slot.itemId}:${slot.quantity}:${JSON.stringify(slot.gearStats)}`)
        .join('|'),
    ].join('::');

    if (this.lastRenderedInventorySignature === inventorySignature) {
      return;
    }

    this.lastRenderedInventorySignature = inventorySignature;
    this.inventoryHeaderElement.textContent = `HP: ${hp}/${maxHp}  Gold: ${gold}  Slots: ${usedSlots}/${inventory.maxSlots}`;

    this.inventoryGridElement.innerHTML = '';
    const totalSlots = Math.max(1, inventory.maxSlots);

    for (let index = 0; index < totalSlots; index += 1) {
      const slot = inventory.slots[index];
      const cell = document.createElement('div');
      cell.style.height = '100%';
      cell.style.background = slot ? 'rgba(68, 62, 44, 0.92)' : 'rgba(30, 30, 30, 0.75)';
      cell.style.border = '1px solid rgba(150, 138, 102, 0.9)';
      cell.style.padding = '0';
      cell.style.position = 'relative';
      cell.style.overflow = 'hidden';
      cell.style.display = 'flex';
      cell.style.flexDirection = 'column';
      cell.style.justifyContent = 'space-between';
      cell.style.gap = '3px';
      cell.style.userSelect = 'none';

      cell.addEventListener('dragover', (event) => {
        if (this.draggingInventoryIndex === null) {
          return;
        }

        event.preventDefault();
        cell.style.border = '1px solid rgba(225, 206, 130, 0.95)';
      });

      cell.addEventListener('dragleave', () => {
        cell.style.border = '1px solid rgba(150, 138, 102, 0.9)';
      });

      cell.addEventListener('drop', (event) => {
        event.preventDefault();

        const fallbackRaw = event.dataTransfer?.getData('text/plain');
        const fallbackFromIndex = fallbackRaw ? Number(fallbackRaw) : null;
        const fromIndex =
          this.draggingInventoryIndex !== null
            ? this.draggingInventoryIndex
            : typeof fallbackFromIndex === 'number' && Number.isFinite(fallbackFromIndex)
              ? Math.floor(fallbackFromIndex)
              : null;

        this.draggingInventoryIndex = null;
        this.clearInventoryDropHighlights();

        if (fromIndex === null || fromIndex === index) {
          return;
        }

        this.multiplayerClient.sendInventoryMove(fromIndex, index);
      });

      if (slot) {
        const primaryAction: ContextMenuOption | null = slot.equipSlot
          ? {
              label: `Equip ${slot.name}`,
              onSelect: () => {
                this.multiplayerClient.sendEquipItem(index);
              },
            }
          : slot.itemId === 'apple'
            ? {
                label: `Eat ${slot.name}`,
                onSelect: () => {
                  this.multiplayerClient.sendInventoryUse(index);
                },
              }
            : null;

        cell.draggable = !primaryAction;
        cell.style.cursor = primaryAction ? 'pointer' : 'grab';
        this.bindItemTooltip(cell, slot.name, slot.gearStats ?? null);

        const icon = document.createElement('img');
        icon.src = this.resolveRuntimeAssetUrl(slot.image);
        icon.addEventListener('error', () => {
          icon.src = this.getInventoryItemIcon(slot.itemId);
        });
        icon.alt = slot.name;
        icon.width = 1;
        icon.height = 1;
        icon.style.width = '100%';
        icon.style.height = '100%';
        icon.style.objectFit = 'contain';
        icon.style.display = 'block';
        icon.style.imageRendering = 'pixelated';
        icon.draggable = false;

        const quantity = document.createElement('div');
        quantity.textContent = slot.quantity > 1 ? `x${slot.quantity}` : '';
        quantity.style.fontSize = '11px';
        quantity.style.color = '#fff4c7';
        quantity.style.textAlign = 'right';
        quantity.style.position = 'absolute';
        quantity.style.right = '2px';
        quantity.style.top = '2px';
        quantity.style.background = 'rgba(0, 0, 0, 0.6)';
        quantity.style.padding = '0 2px';
        quantity.style.lineHeight = '1.1';

        const name = document.createElement('div');
        name.textContent = slot.name;
        name.style.position = 'absolute';
        name.style.left = '0';
        name.style.right = '0';
        name.style.bottom = '0';
        name.style.fontSize = '10px';
        name.style.color = '#fff0c2';
        name.style.background = 'rgba(0, 0, 0, 0.55)';
        name.style.padding = '0 2px';
        name.style.whiteSpace = 'nowrap';
        name.style.overflow = 'hidden';
        name.style.textOverflow = 'ellipsis';

        cell.append(icon, quantity, name);

        if (primaryAction) {
          cell.addEventListener('pointerdown', (event) => {
            if (event.button !== 0) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();
            this.hideContextMenu();
            primaryAction.onSelect?.();
          });
        }

        cell.addEventListener('dragstart', (event) => {
          if (primaryAction) {
            event.preventDefault();
            return;
          }

          this.hideContextMenu();
          this.draggingInventoryIndex = index;
          cell.style.opacity = '0.5';
          event.dataTransfer?.setData('text/plain', String(index));
          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
          }
        });

        cell.addEventListener('dragend', () => {
          this.draggingInventoryIndex = null;
          cell.style.opacity = '1';
          this.clearInventoryDropHighlights();
        });

        cell.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          event.stopPropagation();

          const options: ContextMenuOption[] = [
            ...(primaryAction ? [primaryAction] : []),
          ];

          options.push(
            {
              label: `Examine ${slot.name}`,
              onSelect: () => {
                const text = slot.examineText || `It's ${slot.name.toLowerCase()}.`;
                this.appendSystemChatMessage(text);
              },
            },
            {
              label: `Drop ${slot.name}`,
              onSelect: () => {
                this.multiplayerClient.sendInventoryDrop(index, slot.quantity);
              },
            },
          );

          this.showContextMenuAt(event.clientX, event.clientY, options);
        });
      }

      this.inventoryGridElement.appendChild(cell);
    }
  }

  private renderGearPanel(): void {
    if (!this.gearGridElement || !this.gearSummaryElement || !this.localPlayerState) {
      return;
    }

    const equipment = this.localPlayerState.equipment;
    const slotOrder: EquipmentSlotName[] = [
      'head',
      'necklace',
      'mainHand',
      'body',
      'offHand',
      'hands',
      'legs',
      'feet',
      'ring1',
      'ring2',
      'ring3',
      'ring4',
      'ring5',
    ];
    const signature = slotOrder
      .map((slotName) => {
        const item = equipment[slotName];
        return `${slotName}:${item?.itemId ?? '-'}:${item?.quantity ?? 0}:${JSON.stringify(item?.gearStats ?? null)}`;
      })
      .join('|');

    if (this.lastRenderedGearSignature === signature) {
      return;
    }

    this.lastRenderedGearSignature = signature;
    this.gearGridElement.innerHTML = '';

    const layout = document.createElement('div');
    layout.style.display = 'grid';
    layout.style.gridTemplateColumns = 'repeat(5, 48px)';
    layout.style.gridAutoRows = '48px';
    layout.style.gap = '6px';
    layout.style.padding = '2px';
    layout.style.justifyContent = 'center';

    const slotPositions: Record<EquipmentSlotName, { row: number; column: number }> = {
      head: { row: 2, column: 3 },
      necklace: { row: 3, column: 3 },
      mainHand: { row: 4, column: 1 },
      body: { row: 4, column: 3 },
      offHand: { row: 4, column: 5 },
      hands: { row: 5, column: 1 },
      legs: { row: 5, column: 3 },
      feet: { row: 6, column: 3 },
      ring1: { row: 7, column: 1 },
      ring2: { row: 7, column: 2 },
      ring3: { row: 7, column: 3 },
      ring4: { row: 7, column: 4 },
      ring5: { row: 7, column: 5 },
    };

    for (const slotName of slotOrder) {
      const equipped = equipment[slotName];
      const slotCard = document.createElement('div');
      slotCard.style.display = 'flex';
      slotCard.style.flexDirection = 'column';
      slotCard.style.justifyContent = 'space-between';
      slotCard.style.width = '100%';
      slotCard.style.height = '100%';
      slotCard.style.boxSizing = 'border-box';
      slotCard.style.padding = '4px';
      slotCard.style.background = equipped ? 'rgba(68, 62, 44, 0.92)' : 'rgba(30, 30, 30, 0.75)';
      slotCard.style.border = '1px solid rgba(150, 138, 102, 0.9)';
      slotCard.style.gridRow = String(slotPositions[slotName].row);
      slotCard.style.gridColumn = String(slotPositions[slotName].column);
      slotCard.style.userSelect = 'none';
      slotCard.style.position = 'relative';
      slotCard.style.overflow = 'hidden';

      const itemLabel = document.createElement('div');
      itemLabel.style.position = 'absolute';
      itemLabel.style.left = '0';
      itemLabel.style.right = '0';
      itemLabel.style.bottom = '0';
      itemLabel.style.zIndex = '2';
      itemLabel.style.background = 'rgba(0, 0, 0, 0.55)';
      itemLabel.style.padding = '0 2px';
      itemLabel.style.color = equipped ? '#f0e5c1' : '#90876b';
      itemLabel.style.fontSize = '9px';
      itemLabel.style.whiteSpace = 'nowrap';
      itemLabel.style.overflow = 'hidden';
      itemLabel.style.textOverflow = 'ellipsis';
      itemLabel.textContent = equipped ? equipped.name : '';

      if (equipped) {
        const icon = document.createElement('img');
        icon.src = this.resolveRuntimeAssetUrl(equipped.image);
        icon.alt = equipped.name;
        icon.width = 1;
        icon.height = 1;
        icon.style.position = 'absolute';
        icon.style.left = '0';
        icon.style.top = '0';
        icon.style.width = '100%';
        icon.style.height = '100%';
        icon.style.zIndex = '1';
        icon.style.objectFit = 'contain';
        icon.style.display = 'block';
        icon.style.imageRendering = 'pixelated';
        icon.draggable = false;
        icon.addEventListener('error', () => {
          icon.src = this.getInventoryItemIcon(equipped.itemId);
        });

        slotCard.append(icon);
      }

      slotCard.append(itemLabel);

      if (!equipped) {
        const ghostIcon = document.createElement('div');
        ghostIcon.textContent = this.getEquipmentSlotGhostIcon(slotName);
        ghostIcon.style.position = 'absolute';
        ghostIcon.style.left = '50%';
        ghostIcon.style.top = '50%';
        ghostIcon.style.transform = 'translate(-50%, -50%)';
        ghostIcon.style.fontSize = '16px';
        ghostIcon.style.opacity = '0.45';
        ghostIcon.style.color = 'rgba(185, 185, 185, 0.8)';
        ghostIcon.style.filter = 'grayscale(1) saturate(0) brightness(0.9)';
        ghostIcon.style.pointerEvents = 'none';
        slotCard.appendChild(ghostIcon);
      }

      if (equipped) {
        slotCard.style.cursor = 'pointer';
        this.bindItemTooltip(slotCard, equipped.name, equipped.gearStats ?? null);
        slotCard.addEventListener('pointerdown', (event) => {
          if (event.button !== 0) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          this.multiplayerClient.sendUnequipItem(slotName);
        });

        slotCard.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          event.stopPropagation();

          const options: ContextMenuOption[] = [
            {
              label: `Examine ${equipped.name}`,
              onSelect: () => {
                const text = equipped.examineText || `It's ${equipped.name.toLowerCase()}.`;
                this.appendSystemChatMessage(text);
              },
            },
            {
              label: `Unequip ${equipped.name}`,
              onSelect: () => {
                this.multiplayerClient.sendUnequipItem(slotName);
              },
            },
          ];

          this.showContextMenuAt(event.clientX, event.clientY, options);
        });
      }

      layout.appendChild(slotCard);
    }

    this.gearGridElement.appendChild(layout);

    const totals = {
      strength: 0,
      constitution: 0,
      armor: 0,
      damageReductionPct: 0,
      weaponBaseDamage: 0,
      accuracy: {
        melee: 0,
        ranged: 0,
        magic: 0,
      },
    };

    for (const slotName of slotOrder) {
      const equipped = equipment[slotName];
      const stats = equipped?.gearStats;
      if (!stats) {
        continue;
      }

      if (Number.isFinite(stats.baseStats?.strength)) {
        totals.strength += Number(stats.baseStats?.strength ?? 0);
      }

      if (Number.isFinite(stats.baseStats?.constitution)) {
        totals.constitution += Number(stats.baseStats?.constitution ?? 0);
      }

      if (Number.isFinite(stats.armorProfile?.armor)) {
        totals.armor += Number(stats.armorProfile?.armor ?? 0);
      }

      if (Number.isFinite(stats.armorProfile?.damageReductionPct)) {
        totals.damageReductionPct += Number(stats.armorProfile?.damageReductionPct ?? 0);
      }

      if (Number.isFinite(stats.weaponProfile?.baseDamage)) {
        totals.weaponBaseDamage += Number(stats.weaponProfile?.baseDamage ?? 0);
      }

      if (Number.isFinite(stats.armorProfile?.accuracy?.melee)) {
        totals.accuracy.melee += Number(stats.armorProfile?.accuracy?.melee ?? 0);
      }

      if (Number.isFinite(stats.armorProfile?.accuracy?.ranged)) {
        totals.accuracy.ranged += Number(stats.armorProfile?.accuracy?.ranged ?? 0);
      }

      if (Number.isFinite(stats.armorProfile?.accuracy?.magic)) {
        totals.accuracy.magic += Number(stats.armorProfile?.accuracy?.magic ?? 0);
      }
    }

    const formatSigned = (value: number): string => {
      if (value > 0) {
        return `+${value}`;
      }

      return String(value);
    };

    const effectiveConstitution = Math.max(
      1,
      this.localPlayerState.skills.constitution.level + totals.constitution,
    );
    const effectiveStrength = Math.max(1, this.localPlayerState.skills.strength.level + totals.strength);
    const strengthMaxHitBonus = Math.floor((effectiveStrength * totals.weaponBaseDamage) / 100);
    const attackMin = 4;
    const attackMax = Math.max(attackMin, 8 + strengthMaxHitBonus);
    const regenPerTick = 1 + Math.floor(effectiveConstitution * 0.2);

    this.gearSummaryElement.textContent = [
      'Totals',
      `STR ${formatSigned(totals.strength)}`,
      `CON ${formatSigned(totals.constitution)}`,
      `Armor ${totals.armor}`,
      `Damage Reduction (DR) ${(totals.damageReductionPct * 100).toFixed(1)}%`,
      `Accuracy Melee ${formatSigned(totals.accuracy.melee)}`,
      `Accuracy Ranged ${formatSigned(totals.accuracy.ranged)}`,
      `Accuracy Magic ${formatSigned(totals.accuracy.magic)}`,
      `Combat Damage ${attackMin}-${attackMax} (Base ${totals.weaponBaseDamage.toFixed(1)}, STR bonus +${strengthMaxHitBonus})`,
      `Effective CON Lv ${effectiveConstitution} (Max HP ${100 + (effectiveConstitution - 1) * 10})`,
      `Regen +${regenPerTick} HP / 10s`,
    ].join('\n');
  }

  private getEquipmentSlotGhostIcon(slotName: EquipmentSlotName): string {
    if (slotName.startsWith('ring')) {
      return '💍';
    }

    if (slotName === 'necklace') {
      return '📿';
    }

    if (slotName === 'head') {
      return '⛑️';
    }

    if (slotName === 'body') {
      return '🦺';
    }

    if (slotName === 'legs') {
      return '👖';
    }

    if (slotName === 'hands') {
      return '🧤';
    }

    if (slotName === 'feet') {
      return '🥾';
    }

    if (slotName === 'offHand') {
      return '🛡️';
    }

    if (slotName === 'mainHand') {
      return '⚔️';
    }

    return '◌';
  }

  private renderBankPanel(): void {
    if (
      !this.bankVisible ||
      !this.bankInventoryState ||
      !this.localPlayerState ||
      !this.bankInventoryHeaderElement ||
      !this.bankStorageHeaderElement ||
      !this.bankInventoryGridElement ||
      !this.bankStorageGridElement
    ) {
      return;
    }

    const inventory = this.localPlayerState.inventory;
    const bank = this.bankInventoryState;

    const signature = [
      this.applySquareGridSizing(this.bankInventoryGridElement, 74),
      this.applySquareGridSizing(this.bankStorageGridElement, 74),
      inventory.maxSlots,
      inventory.slots.map((slot) => `${slot.itemId}:${slot.quantity}`).join('|'),
      bank.maxSlots,
      bank.slots.map((slot) => `${slot.itemId}:${slot.quantity}`).join('|'),
    ].join('::');

    if (this.lastRenderedBankSignature === signature) {
      return;
    }

    this.lastRenderedBankSignature = signature;
    this.bankInventoryHeaderElement.textContent = `Inventory (${inventory.slots.length}/${inventory.maxSlots})`;
    this.bankStorageHeaderElement.textContent = `Bank (${bank.slots.length}/${bank.maxSlots})`;
    this.bankInventoryGridElement.innerHTML = '';
    this.bankStorageGridElement.innerHTML = '';

    this.renderBankContainerGrid(this.bankInventoryGridElement, inventory, 'inventory', 'bank');
    this.renderBankContainerGrid(this.bankStorageGridElement, bank, 'bank', 'inventory');
  }

  private renderBankContainerGrid(
    gridElement: HTMLDivElement,
    container: InventoryState,
    from: 'inventory' | 'bank',
    to: 'inventory' | 'bank',
  ): void {
    const totalSlots = Math.max(1, container.maxSlots);

    for (let index = 0; index < totalSlots; index += 1) {
      const slot = container.slots[index];
      const cell = document.createElement('div');
      cell.style.height = '100%';
      cell.style.background = slot ? 'rgba(68, 62, 44, 0.92)' : 'rgba(30, 30, 30, 0.75)';
      cell.style.border = '1px solid rgba(150, 138, 102, 0.9)';
      cell.style.padding = '0';
      cell.style.position = 'relative';
      cell.style.overflow = 'hidden';
      cell.style.userSelect = 'none';

      if (slot) {
        cell.style.cursor = 'pointer';
        this.bindItemTooltip(cell, slot.name, slot.gearStats ?? null);

        const icon = document.createElement('img');
        icon.src = this.resolveRuntimeAssetUrl(slot.image);
        icon.alt = slot.name;
        icon.width = 1;
        icon.height = 1;
        icon.style.width = '100%';
        icon.style.height = '100%';
        icon.style.objectFit = 'contain';
        icon.style.display = 'block';
        icon.style.imageRendering = 'pixelated';
        icon.draggable = false;
        icon.addEventListener('error', () => {
          icon.src = this.getInventoryItemIcon(slot.itemId);
        });

        const quantity = document.createElement('div');
        quantity.textContent = slot.quantity > 1 ? `x${slot.quantity}` : '';
        quantity.style.fontSize = '11px';
        quantity.style.color = '#fff4c7';
        quantity.style.textAlign = 'right';
        quantity.style.position = 'absolute';
        quantity.style.right = '2px';
        quantity.style.top = '2px';
        quantity.style.background = 'rgba(0, 0, 0, 0.6)';
        quantity.style.padding = '0 2px';
        quantity.style.lineHeight = '1.1';

        const name = document.createElement('div');
        name.textContent = slot.name;
        name.style.position = 'absolute';
        name.style.left = '0';
        name.style.right = '0';
        name.style.bottom = '0';
        name.style.fontSize = '10px';
        name.style.color = '#fff0c2';
        name.style.background = 'rgba(0, 0, 0, 0.55)';
        name.style.padding = '0 2px';
        name.style.whiteSpace = 'nowrap';
        name.style.overflow = 'hidden';
        name.style.textOverflow = 'ellipsis';

        cell.append(icon, quantity, name);

        cell.addEventListener('pointerdown', (event) => {
          if (event.button !== 0) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          this.multiplayerClient.sendBankTransfer(from, to, index, 1);
        });

        cell.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          event.stopPropagation();

          const options: ContextMenuOption[] = [
            {
              label: `Move X ${slot.name}`,
              onSelect: () => {
                this.showBankQuantityPrompt(event.clientX, event.clientY, slot.quantity, (quantityValue) => {
                  this.multiplayerClient.sendBankTransfer(from, to, index, quantityValue);
                });
              },
            },
            {
              label: `Move all ${slot.name}`,
              onSelect: () => {
                if (from === 'inventory' && this.localPlayerState) {
                  const totalMatching = this.localPlayerState.inventory.slots
                    .filter((entry) => entry.itemId === slot.itemId)
                    .reduce((total, entry) => total + Math.max(0, entry.quantity), 0);
                  this.multiplayerClient.sendBankTransfer(from, to, index, Math.max(1, totalMatching));
                  return;
                }

                this.multiplayerClient.sendBankTransfer(from, to, index, slot.quantity);
              },
            },
          ];

          this.showContextMenuAt(event.clientX, event.clientY, options);
        });
      }

      gridElement.appendChild(cell);
    }
  }

  private applySquareGridSizing(gridElement: HTMLDivElement, maxSlotSize: number): number {
    const columns = 4;
    const gap = 4;
    const minSlotSize = 40;
    const availableWidth = Math.max(0, gridElement.clientWidth - gap * (columns - 1));
    const slotSize = Math.max(minSlotSize, Math.min(maxSlotSize, Math.floor(availableWidth / columns)));

    gridElement.style.gridTemplateColumns = `repeat(${columns}, ${slotSize}px)`;
    gridElement.style.gridAutoRows = `${slotSize}px`;
    gridElement.style.justifyContent = 'start';
    return slotSize;
  }

  private clearInventoryDropHighlights(): void {
    if (!this.inventoryGridElement) {
      return;
    }

    for (const child of this.inventoryGridElement.children) {
      const cell = child as HTMLDivElement;
      cell.style.border = '1px solid rgba(150, 138, 102, 0.9)';
    }
  }

  private renderShopPanel(): void {
    if (!this.shopContentElement || !this.activeShopId || !this.localPlayerState) {
      return;
    }

    const shop = this.shopDefinitions[this.activeShopId];
    if (!shop) {
      this.closeShop();
      return;
    }

    const inventorySignature = this.localPlayerState.inventory.slots
      .map((slot) => `${slot.itemId}:${slot.quantity}`)
      .sort()
      .join('|');
    const signature = [
      this.activeShopId,
      this.localPlayerState.gold,
      inventorySignature,
      shop.listings.map((listing) => `${listing.itemId}:${listing.buyPrice}:${listing.sellPrice}`).join('|'),
    ].join('::');

    if (this.lastRenderedShopSignature === signature) {
      return;
    }

    this.lastRenderedShopSignature = signature;

    this.shopContentElement.innerHTML = '';

    const title = document.createElement('div');
    title.textContent = `${shop.name} (Gold: ${this.localPlayerState.gold})`;
    title.style.color = '#fff4c7';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '4px';
    this.shopContentElement.appendChild(title);

    for (const listing of shop.listings) {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '6px';
      row.style.marginBottom = '4px';

      const ownedQuantity = this.localPlayerState.inventory.slots
        .filter((slot) => slot.itemId === listing.itemId)
        .reduce((total, slot) => total + Math.max(0, slot.quantity), 0);

      const icon = document.createElement('img');
      icon.alt = listing.name;
      icon.width = 18;
      icon.height = 18;
      icon.style.width = '18px';
      icon.style.height = '18px';
      icon.style.objectFit = 'contain';
      icon.style.imageRendering = 'pixelated';
      icon.style.border = '1px solid rgba(150, 138, 102, 0.9)';
      icon.style.background = 'rgba(20, 20, 20, 0.5)';
      icon.style.padding = '1px';
      icon.src = listing.image
        ? this.resolveRuntimeAssetUrl(listing.image)
        : this.getInventoryItemIcon(listing.itemId);
      icon.addEventListener('error', () => {
        icon.src = this.getInventoryItemIcon(listing.itemId);
      });

      const label = document.createElement('div');
      label.textContent = `${listing.name} (B:${listing.buyPrice} / S:${listing.sellPrice})`;
      label.style.flex = '1';

      const ownedText = document.createElement('div');
      ownedText.textContent = `You: ${ownedQuantity}`;
      ownedText.style.minWidth = '56px';
      ownedText.style.textAlign = 'right';
      ownedText.style.color = '#d8cba0';
      ownedText.style.fontSize = '11px';

      const buyButton = document.createElement('button');
      buyButton.textContent = 'Buy';
      buyButton.style.fontFamily = 'monospace';
      buyButton.style.fontSize = '11px';
      buyButton.style.cursor = 'pointer';
      buyButton.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.multiplayerClient.sendShopBuy(shop.id, listing.itemId, 1);
      });

      const sellButton = document.createElement('button');
      sellButton.textContent = 'Sell';
      sellButton.style.fontFamily = 'monospace';
      sellButton.style.fontSize = '11px';
      const canSell = ownedQuantity > 0;
      sellButton.disabled = !canSell;
      sellButton.style.cursor = canSell ? 'pointer' : 'default';
      sellButton.style.opacity = canSell ? '1' : '0.45';
      sellButton.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!canSell) {
          return;
        }
        this.multiplayerClient.sendShopSell(shop.id, listing.itemId, 1);
      });

      row.append(icon, label, ownedText, buyButton, sellButton);
      this.shopContentElement.appendChild(row);
    }

  }

  private renderCraftingPanel(): void {
    if (!this.craftingVisible || !this.craftingContentElement || !this.localPlayerState) {
      return;
    }

    const craftingProgress = this.activeCraftingProgress;
    const progressIsForActiveStation = Boolean(
      craftingProgress
      && craftingProgress.active
      && craftingProgress.objectId
      && craftingProgress.objectId === this.activeCraftingObjectId,
    );
    const cycleRemainingMs = progressIsForActiveStation
      ? Math.max(0, (craftingProgress?.cycleEndsAt ?? 0) - Date.now())
      : 0;
    const cycleProgress = progressIsForActiveStation
      ? Math.max(
        0,
        Math.min(
          1,
          1 - cycleRemainingMs / Math.max(1, craftingProgress?.durationMs ?? 1),
        ),
      )
      : 0;

    const inventorySignature = this.localPlayerState.inventory.slots
      .map((slot) => `${slot.itemId}:${slot.quantity}`)
      .sort()
      .join('|');
    const recipeSignature = this.craftingRecipes
      .map((recipe) => `${recipe.id}:${recipe.requiredLevel}:${recipe.inputs.length}:${recipe.outputs.length}`)
      .join('|');
    const signature = [
      this.activeCraftingObjectId ?? '',
      this.activeCraftingStationType ?? '',
      this.activeCraftingTitle,
      this.selectedSmithingMaterialTab,
      progressIsForActiveStation ? 'busy' : 'idle',
      progressIsForActiveStation ? String(craftingProgress?.recipeId ?? '') : '',
      progressIsForActiveStation ? `${craftingProgress?.completedCount ?? 0}/${craftingProgress?.totalCount ?? 0}` : '',
      progressIsForActiveStation ? String(Math.floor(cycleProgress * 100)) : '',
      progressIsForActiveStation ? String(Math.floor(cycleRemainingMs / 100)) : '',
      inventorySignature,
      recipeSignature,
    ].join('::');

    if (this.lastRenderedCraftingSignature === signature) {
      return;
    }

    this.lastRenderedCraftingSignature = signature;
    this.craftingContentElement.innerHTML = '';

    const title = document.createElement('div');
    title.textContent = this.activeCraftingTitle;
    title.style.color = '#fff4c7';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '6px';
    this.craftingContentElement.appendChild(title);

    if (progressIsForActiveStation && craftingProgress) {
      const progressContainer = document.createElement('div');
      progressContainer.style.display = 'flex';
      progressContainer.style.flexDirection = 'column';
      progressContainer.style.gap = '4px';
      progressContainer.style.marginBottom = '8px';
      progressContainer.style.padding = '6px';
      progressContainer.style.border = '1px solid rgba(150, 138, 102, 0.65)';
      progressContainer.style.background = 'rgba(30, 27, 20, 0.72)';

      const progressLabel = document.createElement('div');
      progressLabel.style.color = '#f0e5c1';
      progressLabel.textContent = `Crafting ${craftingProgress.recipeName ?? 'Recipe'} • ${Math.max(0, craftingProgress.completedCount)}/${Math.max(0, craftingProgress.totalCount)}`;

      const progressTrack = document.createElement('div');
      progressTrack.style.height = '8px';
      progressTrack.style.border = '1px solid rgba(150, 138, 102, 0.8)';
      progressTrack.style.background = 'rgba(0, 0, 0, 0.5)';
      progressTrack.style.position = 'relative';

      const progressFill = document.createElement('div');
      progressFill.style.height = '100%';
      progressFill.style.width = `${Math.max(0, Math.min(100, cycleProgress * 100)).toFixed(1)}%`;
      progressFill.style.background = 'rgba(215, 187, 94, 0.95)';

      const progressMeta = document.createElement('div');
      progressMeta.style.color = '#d8cba0';
      progressMeta.style.fontSize = '11px';
      progressMeta.textContent = `${(cycleRemainingMs / 1000).toFixed(1)}s remaining on current item`;

      const cancelButton = document.createElement('button');
      cancelButton.textContent = 'Cancel';
      cancelButton.style.fontFamily = 'monospace';
      cancelButton.style.fontSize = '11px';
      cancelButton.style.cursor = 'pointer';
      cancelButton.style.width = 'fit-content';
      cancelButton.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.multiplayerClient.sendCraftingCancel(this.activeCraftingObjectId ?? undefined);
      });

      progressTrack.appendChild(progressFill);
      progressContainer.append(progressLabel, progressTrack, progressMeta, cancelButton);
      this.craftingContentElement.appendChild(progressContainer);
    }

    if (this.activeCraftingStationType === 'smithing_station') {
      const tabRow = document.createElement('div');
      tabRow.style.display = 'flex';
      tabRow.style.gap = '6px';
      tabRow.style.marginBottom = '6px';

      const bronzeTab = document.createElement('button');
      bronzeTab.textContent = 'Bronze';
      bronzeTab.style.fontFamily = 'monospace';
      bronzeTab.style.fontSize = '11px';
      bronzeTab.style.cursor = 'pointer';
      bronzeTab.style.background = this.selectedSmithingMaterialTab === 'bronze'
        ? 'rgba(90, 82, 56, 0.98)'
        : 'rgba(64, 58, 41, 0.95)';
      bronzeTab.style.color = this.selectedSmithingMaterialTab === 'bronze' ? '#fff4c7' : '#f0e5c1';
      bronzeTab.style.border = '1px solid rgba(150, 138, 102, 0.9)';
      bronzeTab.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (this.selectedSmithingMaterialTab === 'bronze') {
          return;
        }

        this.selectedSmithingMaterialTab = 'bronze';
        this.lastRenderedCraftingSignature = null;
        this.renderCraftingPanel();
      });

      const ironTab = document.createElement('button');
      ironTab.textContent = 'Iron';
      ironTab.style.fontFamily = 'monospace';
      ironTab.style.fontSize = '11px';
      ironTab.style.cursor = 'pointer';
      ironTab.style.background = this.selectedSmithingMaterialTab === 'iron'
        ? 'rgba(90, 82, 56, 0.98)'
        : 'rgba(64, 58, 41, 0.95)';
      ironTab.style.color = this.selectedSmithingMaterialTab === 'iron' ? '#fff4c7' : '#f0e5c1';
      ironTab.style.border = '1px solid rgba(150, 138, 102, 0.9)';
      ironTab.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (this.selectedSmithingMaterialTab === 'iron') {
          return;
        }

        this.selectedSmithingMaterialTab = 'iron';
        this.lastRenderedCraftingSignature = null;
        this.renderCraftingPanel();
      });

      tabRow.append(bronzeTab, ironTab);
      this.craftingContentElement.appendChild(tabRow);
    }

    const visibleRecipes = this.getFilteredCraftingRecipes();

    if (visibleRecipes.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = this.activeCraftingStationType === 'smithing_station'
        ? 'No recipes available for this material yet.'
        : 'No recipes available here.';
      this.craftingContentElement.appendChild(empty);
      return;
    }

    let previousMaterialLabel: string | null = null;
    const craftingLevel = this.getCraftingSkillLevel();

    for (const recipe of visibleRecipes) {
      if (this.activeCraftingStationType === 'smithing_station') {
        const currentMaterialLabel = this.getSmithingMaterialLabel(recipe);
        if (currentMaterialLabel && currentMaterialLabel !== previousMaterialLabel) {
          const sectionLabel = document.createElement('div');
          sectionLabel.textContent = `${currentMaterialLabel} Gear`;
          sectionLabel.style.marginTop = previousMaterialLabel ? '8px' : '2px';
          sectionLabel.style.marginBottom = '2px';
          sectionLabel.style.color = '#fff4c7';
          sectionLabel.style.fontWeight = 'bold';
          this.craftingContentElement.appendChild(sectionLabel);
          previousMaterialLabel = currentMaterialLabel;
        }
      }

      const row = document.createElement('div');
      row.style.display = 'grid';
      row.style.gridTemplateColumns = '1fr auto auto';
      row.style.gap = '8px';
      row.style.alignItems = 'center';
      row.style.padding = '4px 0';
      row.style.borderBottom = '1px solid rgba(160, 145, 103, 0.3)';

      const inputText = recipe.inputs
        .map((entry) => `${entry.name} x${entry.quantity}`)
        .join(', ');
      const outputText = recipe.outputs
        .map((entry) => `${entry.name} x${entry.quantity}`)
        .join(', ');

      const detail = document.createElement('div');
      const hasRequiredLevel = craftingLevel >= recipe.requiredLevel;
      const levelStatus = hasRequiredLevel ? '' : ` [Locked: requires level ${recipe.requiredLevel}]`;
      detail.textContent = `${recipe.name} (Lv ${recipe.requiredLevel}, XP ${recipe.xp})${levelStatus}\nIn: ${inputText}\nOut: ${outputText}`;

      const hasAllInputs = recipe.inputs.every((entry) => {
        const count = this.localPlayerState?.inventory.slots
          .find((slot) => slot.itemId === entry.itemId)?.quantity ?? 0;
        return count >= entry.quantity;
      });
      const canCraftRecipe = hasRequiredLevel && hasAllInputs && !progressIsForActiveStation;

      const makeOneButton = document.createElement('button');
      makeOneButton.textContent = 'Make 1';
      makeOneButton.style.fontFamily = 'monospace';
      makeOneButton.style.fontSize = '11px';
      makeOneButton.style.cursor = canCraftRecipe ? 'pointer' : 'default';
      makeOneButton.disabled = !canCraftRecipe;
      makeOneButton.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!this.activeCraftingObjectId) {
          return;
        }
        this.multiplayerClient.sendCraftingMake(recipe.id, 1, this.activeCraftingObjectId);
      });

      const makeAllButton = document.createElement('button');
      makeAllButton.textContent = 'Make all';
      makeAllButton.style.fontFamily = 'monospace';
      makeAllButton.style.fontSize = '11px';
      makeAllButton.style.cursor = canCraftRecipe ? 'pointer' : 'default';
      makeAllButton.disabled = !canCraftRecipe;
      makeAllButton.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!this.activeCraftingObjectId) {
          return;
        }
        this.multiplayerClient.sendCraftingMake(recipe.id, 28, this.activeCraftingObjectId);
      });

      row.append(detail, makeOneButton, makeAllButton);
      this.craftingContentElement.appendChild(row);
    }
  }

  private renderDebugHud(): void {
    if (!this.debugHudVisible || !this.debugHudLogElement) {
      if (this.debugHudRootElement) this.debugHudRootElement.style.display = 'none';
      return;
    }
    if (this.debugHudRootElement) this.debugHudRootElement.style.display = 'flex';

    const stats = this.multiplayerClient.getStats();
    const stateAgeMs = this.lastStateUpdateAt
      ? Math.max(0, Date.now() - this.lastStateUpdateAt)
      : -1;
    const lines = [
      'F3: Toggle Debug HUD',
      `Local ID: ${this.localPlayerId ? this.localPlayerId.slice(0, 8) : 'pending'}`,
      `Conn: ${stats.connectionState}`,
      `Player Pos: (${this.player.x.toFixed(1)}, ${this.player.y.toFixed(1)})`,
      `Player Tile: ${
        this.localTilePosition
          ? `(${Math.round(this.localTilePosition.x)}, ${Math.round(this.localTilePosition.y)})`
          : '(pending)'
      }`,
      `Nodes: ${this.worldNodes.size}`,
      `NPCs: ${this.worldNpcs.size}`,
      `Objects: ${this.worldObjects.size}`,
      `Enemies: ${this.worldEnemies.size}`,
      `Ground Items: ${this.worldGroundItems.size}`,
      `Remote Players: ${this.remotePlayers.size}`,
      `Snapshots: ${this.snapshotCount}`,
      `Last Snapshot: ${stateAgeMs >= 0 ? `${stateAgeMs}ms ago` : 'n/a'}`,
      `Net RX/TX: ${stats.messagesReceived}/${stats.messagesSent}`,
    ];
    this.debugHudLogElement.textContent = lines.join('\n');
  }

  private initDebugHudPanel(): void {
    const appElement = document.querySelector<HTMLDivElement>('#app');
    if (!appElement) return;
    const root = document.createElement('div');
    root.style.position = 'fixed';
    root.style.top = '12px';
    root.style.left = '50%';
    root.style.transform = 'translateX(-50%)';
    root.style.width = '340px';
    root.style.maxHeight = '220px';
    root.style.background = 'rgba(0,0,0,0.82)';
    root.style.border = '1px solid #b7aa81';
    root.style.display = this.debugHudVisible ? 'flex' : 'none';
    root.style.flexDirection = 'column';
    root.style.zIndex = '2000';
    root.style.pointerEvents = 'auto';
    root.style.color = '#d6ecff';
    root.style.fontFamily = 'monospace';
    root.style.fontSize = '13px';
    root.style.boxShadow = '0 2px 10px rgba(0,0,0,0.45)';
    root.style.borderRadius = '7px';
    root.style.overflow = 'hidden';

    const log = document.createElement('div');
    log.style.flex = '1';
    log.style.overflowY = 'auto';
    log.style.whiteSpace = 'pre-line';
    log.style.padding = '10px 12px 10px 12px';
    log.style.userSelect = 'text';

    root.appendChild(log);
    appElement.appendChild(root);
    this.debugHudRootElement = root;
    this.debugHudLogElement = log;
  }

  private shutdown(): void {
    this.multiplayerClient.disconnect();

    for (const remotePlayer of this.remotePlayers.values()) {
      remotePlayer.sprite.destroy();
      remotePlayer.healthBar.destroy();
      remotePlayer.harvestingIndicator.destroy();
    }

    for (const nodeVisual of this.worldNodes.values()) {
      nodeVisual.sprite.destroy();
    }

    for (const npcVisual of this.worldNpcs.values()) {
      npcVisual.sprite.destroy();
    }

    for (const objectVisual of this.worldObjects.values()) {
      objectVisual.sprite.destroy();
    }

    for (const enemyVisual of this.worldEnemies.values()) {
      enemyVisual.sprite.destroy();
      enemyVisual.healthBar.destroy();
    }

    for (const groundItemVisual of this.worldGroundItems.values()) {
      groundItemVisual.sprite.destroy();
      groundItemVisual.quantityText.destroy();
    }

    this.remotePlayers.clear();
    this.worldNodes.clear();
    for (const marker of this.npcQuestMarkers.values()) {
      marker.destroy();
    }
    this.npcQuestMarkers.clear();
    this.worldNpcs.clear();
    this.worldObjects.clear();
    this.worldEnemies.clear();
    this.worldGroundItems.clear();
    this.minimapRootElement?.remove();
    this.minimapRootElement = null;
    this.minimapCanvasElement = null;
    this.minimapCanvasContext = null;
    this.minimapToggleButtonElement = null;
    this.minimapCollapsed = false;
    this.minimapRedrawAccumulatorMs = 0;
    this.blockedNodeTiles.clear();
    this.blockedNpcTiles.clear();
    this.blockedObjectTiles.clear();
    this.pendingGroundItemTextureLoads.clear();
    this.shopDefinitions = {};
    this.activeShopId = null;
    this.lastRenderedShopSignature = null;
    this.pendingInteractionController.clear();
    this.hideContextMenu();
    this.hideItemTooltip();
    this.localPlayerState = null;
    this.localTilePosition = null;
    this.localRenderedTilePosition = null;
    this.localPathWaypoints.length = 0;
    this.localActiveRouteId = null;
    this.localCommittedDestination = null;
    this.localArrivalReportedRouteId = null;
    this.nextClientRouteSequence = 1;
    this.localRouteLocked = false;
    this.previousSkillLevels = null;
    this.chatRootElement?.remove();
    this.chatRootElement = null;
    this.chatLogElement = null;
    this.chatInputElement = null;
    this.chatMessages = [];
    this.characterRootElement?.remove();
    this.characterRootElement = null;
    this.characterTabBarElement = null;
    this.activeCharacterTab = 'skills';
    this.skillsRootElement?.remove();
    this.skillsRootElement = null;
    this.skillsContentElement = null;
    this.inventoryHeaderElement = null;
    this.inventoryGridElement = null;
    this.inventoryContentElement = null;
    this.lastRenderedInventorySignature = null;
    this.gearContentElement = null;
    this.gearGridElement = null;
    this.gearSummaryElement = null;
    this.lastRenderedGearSignature = null;
    this.draggingInventoryIndex = null;
    this.inventoryIconDataUrls.clear();
    this.shopRootElement?.remove();
    this.shopRootElement = null;
    this.shopContentElement = null;
    this.bankRootElement?.remove();
    this.bankRootElement = null;
    this.bankInventoryHeaderElement = null;
    this.bankStorageHeaderElement = null;
    this.bankInventoryGridElement = null;
    this.bankStorageGridElement = null;
    this.bankInventoryState = null;
    this.bankVisible = false;
    this.lastRenderedBankSignature = null;
    this.hideBankQuantityPrompt();
    this.craftingRootElement?.remove();
    this.craftingRootElement = null;
    this.craftingContentElement = null;
    this.activeCraftingObjectId = null;
    this.activeCraftingStationType = null;
    this.activeCraftingTitle = 'Crafting';
    this.craftingRecipes = [];
    this.activeCraftingProgress = null;
    this.craftingVisible = false;
    this.lastRenderedCraftingSignature = null;
    this.itemTooltipElement?.remove();
    this.itemTooltipElement = null;
    this.localHealthBar?.destroy();
    this.localHealthBar = null;
    this.localHealthBarVisibleUntil = 0;
    this.harvestingActionIndicator?.destroy();
    this.harvestingActionIndicator = null;
    this.harvestingIndicatorPhase = 0;
    if (this.debugHudRootElement) {
      this.debugHudRootElement.remove();
      this.debugHudRootElement = null;
      this.debugHudLogElement = null;
    }
    this.actionStatusText?.destroy();
    this.snapshotCount = 0;
    this.lastStateUpdateAt = null;
  }
}
 