import '../mapEditor/styles.css';
import { MAP_HEIGHT_TILES, MAP_WIDTH_TILES, TILE_SIZE } from '../game/config/gameConfig';
import { generateTerrainData } from '../game/world/generateTerrainData';

type LayerMode = 'terrain' | 'resources' | 'monsters' | 'objects' | 'npcs';
type ToolMode = 'paint' | 'select';
const WORLD_DATA_VERSION = 1;
const MAX_HISTORY_STEPS = 100;
const CANONICAL_WORLD_MAP_URL = `${import.meta.env.BASE_URL}data/worldMap.json`;
const TILE_TYPES_URL = `${import.meta.env.BASE_URL}data/tileTypes.json`;
const WORLD_OBJECT_TYPES_URL = `${import.meta.env.BASE_URL}data/worldObjectTypes.json`;
const TERRAIN_TILESET_URL = `${import.meta.env.BASE_URL}assets/terrain/terrain_tileset.png`;
const QUEST_INDEX_URL = `${import.meta.env.BASE_URL}data/quests/index.json`;
const PROJECT_WORLD_MAP_RELATIVE_PATH = 'public/data/worldMap.json';
const DEBUG_LOG_MAX_LINES = 160;
const SIDEBAR_WIDTH_STORAGE_KEY = 'mapEditor.sidebarWidth';
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 720;

type ResourcePlacement = {
  id: string;
  nodeType: 'tree' | 'rock';
  resourceId: string;
  tileX: number;
  tileY: number;
  respawnMs: number;
};

type MonsterPlacement = {
  id: string;
  minionTypeId: string;
  tier: number;
  tileX: number;
  tileY: number;
};

type ObjectPlacement = {
  id: string;
  objectTypeId: string;
  name: string;
  tileX: number;
  tileY: number;
  blocksMovement: boolean;
  examineText: string;
};

type WorldObjectPlacement = {
  id: string;
  objectTypeId: string;
  tileX: number;
  tileY: number;
  resourceId?: string;
  nodeType?: 'tree' | 'rock';
  respawnMs?: number;
  name?: string;
  blocksMovement?: boolean;
  examineText?: string;
};

type NpcPlacement = {
  id: string;
  type: string;
  name: string;
  image?: string;
  tileX: number;
  tileY: number;
  examineText: string;
  talkText: string;
  questStartIds: string[];
};

type QuestZoneRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type QuestZonePlacement = {
  id: string;
  name: string;
  rects: QuestZoneRect[];
};

type QuestIndexObjective = {
  type?: unknown;
  zoneId?: unknown;
  npcId?: unknown;
  toNpcId?: unknown;
  objectId?: unknown;
  objectTypeId?: unknown;
  targetId?: unknown;
  tileX?: unknown;
  tileY?: unknown;
};

type QuestIndexStep = {
  objectives?: unknown;
};

type QuestIndexEntry = Record<string, unknown> & {
  id?: unknown;
  startNpcId?: unknown;
  steps?: unknown;
};

type EditorChunkData = {
  version: number;
  chunkX: number;
  chunkY: number;
  width: number;
  height: number;
  terrain: number[][];
  worldObjects: WorldObjectPlacement[];
  resources: ResourcePlacement[];
  monsters: MonsterPlacement[];
  objects: ObjectPlacement[];
  npcs: NpcPlacement[];
};


type ChunkSnapshot = {
  terrain: number[][];
  worldObjects: WorldObjectPlacement[];
  resources: ResourcePlacement[];
  monsters: MonsterPlacement[];
  objects: ObjectPlacement[];
  npcs: NpcPlacement[];
};

type ChunkHistory = {
  undo: ChunkSnapshot[];
  redo: ChunkSnapshot[];
};

type SelectedTile = {
  worldTileX: number;
  worldTileY: number;
};

type TileTypeDefinition = {
  id: number;
  label: string;
  color: string;
  image: string;
};

type WorldObjectBehavior = 'decorative' | 'harvestable' | 'station' | 'bank' | 'shop' | 'npc';

type WorldObjectTypeDefinition = {
  id: string;
  name: string;
  behavior: WorldObjectBehavior;
  blocksMovement: boolean;
  image: string;
  examineText: string;
  tags: string[];
  behaviorConfig: Record<string, unknown>;
};

type ResourceTypeDefinition = {
  id: string;
  label: string;
  nodeType: 'tree' | 'rock';
  respawnMs: number;
};

type ObjectTypeDefinition = {
  id: string;
  label: string;
  name: string;
  blocksMovement: boolean;
  examineText: string;
};

type QuestPreviewContext = {
  questId: string | null;
  zoneIds: Set<string>;
  giverNpcIds: Set<string>;
  targetNpcIds: Set<string>;
  targetObjectIds: Set<string>;
  targetObjectTypeIds: Set<string>;
  targetMonsterTypeIds: Set<string>;
  travelTiles: Array<{ tileX: number; tileY: number }>;
};

const DEFAULT_TILE_TYPES: TileTypeDefinition[] = [
  { id: 0, label: 'Grass', color: '#4f8f4a', image: '' },
  { id: 1, label: 'Dirt', color: '#7c6642', image: '' },
  { id: 2, label: 'Water', color: '#355f9c', image: '' },
  { id: 3, label: 'Sand', color: '#b9a56d', image: '' },
];

const DEFAULT_RESOURCE_TYPES: ResourceTypeDefinition[] = [
  { id: 'birch_tree', label: 'Birch Tree', nodeType: 'tree', respawnMs: 5000 },
  { id: 'oak_tree', label: 'Oak Tree', nodeType: 'tree', respawnMs: 6500 },
  { id: 'copper_rock', label: 'Copper Rock', nodeType: 'rock', respawnMs: 6500 },
  { id: 'tin_rock', label: 'Tin Rock', nodeType: 'rock', respawnMs: 6500 },
  { id: 'iron_rock', label: 'Iron Rock', nodeType: 'rock', respawnMs: 7500 },
];

const MONSTER_TYPES: Array<{ id: string; label: string }> = [
  { id: 'goblin', label: 'Goblin' },
  { id: 'goblin_brute', label: 'Goblin Brute' },
  { id: 'goblin_archer', label: 'Goblin Archer' },
];

const DEFAULT_OBJECT_TYPES: ObjectTypeDefinition[] = [
  {
    id: 'smelting_station',
    label: 'Smelting Station',
    name: 'Smelting furnace',
    blocksMovement: true,
    examineText: 'A blazing furnace used to smelt ores into bars.',
  },
  {
    id: 'smithing_station',
    label: 'Smithing Station',
    name: 'Smithing anvil',
    blocksMovement: true,
    examineText: 'A sturdy anvil for shaping bars into equipment.',
  },
  {
    id: 'fletching_station',
    label: 'Fletching Station',
    name: 'Fletching bench',
    blocksMovement: true,
    examineText: 'A crafting bench for carving logs into bows and arrows.',
  },
  {
    id: 'bank_building',
    label: 'Bank Building',
    name: 'Bank building',
    blocksMovement: true,
    examineText: 'A sturdy building that houses the bank chest.',
  },
  {
    id: 'general_store_building',
    label: 'General Store Building',
    name: 'General store building',
    blocksMovement: true,
    examineText: 'A simple shop building for local traders.',
  },
  {
    id: 'fence',
    label: 'Fence',
    name: 'Fence',
    blocksMovement: true,
    examineText: 'A short wooden fence.',
  },
  {
    id: 'signpost',
    label: 'Signpost',
    name: 'Signpost',
    blocksMovement: false,
    examineText: 'A signpost with room for future directions.',
  },
];

const DEFAULT_WORLD_OBJECT_TYPES: WorldObjectTypeDefinition[] = [
  ...DEFAULT_RESOURCE_TYPES.map((entry) => ({
    id: entry.id,
    name: entry.label,
    behavior: 'harvestable' as WorldObjectBehavior,
    blocksMovement: true,
    image: '',
    examineText: `A ${entry.label.toLowerCase()}.`,
    tags: ['legacy-default'],
    behaviorConfig: {
      resourceId: entry.id,
      nodeType: entry.nodeType,
      respawnMs: entry.respawnMs,
    },
  })),
  ...DEFAULT_OBJECT_TYPES.map((entry) => ({
    id: entry.id,
    name: entry.label,
    behavior: entry.id.includes('station') ? 'station' as WorldObjectBehavior : 'decorative' as WorldObjectBehavior,
    blocksMovement: entry.blocksMovement,
    image: '',
    examineText: entry.examineText,
    tags: ['legacy-default'],
    behaviorConfig: entry.id.includes('station')
      ? { stationType: entry.id.replace(/_station$/i, '') }
      : {},
  })),
].sort((a, b) => a.id.localeCompare(b.id));

const NPC_TYPES: Array<{ id: string; label: string; defaultName: string; image: string; examineText: string; talkText: string }> = [
  {
    id: 'shopkeeper',
    label: 'Shopkeeper',
    defaultName: 'Bob',
    image: '/assets/npcs/shopkeeper.png',
    examineText: 'A friendly general store shopkeeper.',
    talkText: 'Hello there! Need supplies or want to sell your goods?',
  },
  {
    id: 'villager',
    label: 'Villager',
    defaultName: 'Villager',
    image: '/assets/npcs/villager.png',
    examineText: 'A local villager going about their day.',
    talkText: 'Lovely weather for skilling, isn\'t it?',
  },
];

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('Map editor root not found');
}
const appElement = app;

function requireElement<T extends Element>(selector: string, errorMessage: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(errorMessage);
  }
  return element;
}

function require2DContext(targetCanvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const drawingContext = targetCanvas.getContext('2d');
  if (!drawingContext) {
    throw new Error('2D context not available');
  }
  return drawingContext;
}

const state: {
  data: EditorChunkData;
  chunks: Map<string, EditorChunkData>;
  loadedChunkKeys: Set<string>;
  histories: Map<string, ChunkHistory>;
  activeChunkKey: string;
  toolMode: ToolMode;
  layer: LayerMode;
  tileTypes: TileTypeDefinition[];
  worldObjectTypes: WorldObjectTypeDefinition[];
  selectedTileType: number;
  selectedWorldObjectTypeId: string;
  selectedMonsterId: string;
  selectedNpcTypeId: string;
  selectedMonsterTier: number;
  tilePixelSize: number;
  isPainting: boolean;
  pendingStrokeSnapshot: ChunkSnapshot | null;
  selectedTile: SelectedTile | null;
  questZones: QuestZonePlacement[];
  questIndexEntries: QuestIndexEntry[];
  questZoneIdsByQuestId: Map<string, Set<string>>;
  npcFormDirty: boolean;
  npcFormSelectionKey: string | null;
  projectDirectoryHandle: any | null;
  projectDirectoryName: string | null;
} = {
  data: createChunkData(0, 0),
  chunks: new Map<string, EditorChunkData>(),
  loadedChunkKeys: new Set<string>(),
  histories: new Map<string, ChunkHistory>(),
  activeChunkKey: getChunkKey(0, 0),
  toolMode: 'paint',
  layer: 'terrain',
  tileTypes: DEFAULT_TILE_TYPES.map((entry) => ({ ...entry })),
  worldObjectTypes: DEFAULT_WORLD_OBJECT_TYPES.map((entry) => ({
    ...entry,
    behaviorConfig: { ...(entry.behaviorConfig ?? {}) },
    tags: [...(entry.tags ?? [])],
  })),
  selectedTileType: 0,
  selectedWorldObjectTypeId: DEFAULT_WORLD_OBJECT_TYPES[0]?.id ?? '',
  selectedMonsterId: MONSTER_TYPES[0].id,
  selectedNpcTypeId: NPC_TYPES[0].id,
  selectedMonsterTier: 1,
  tilePixelSize: 16,
  isPainting: false,
  pendingStrokeSnapshot: null,
  selectedTile: null,
  questZones: [],
  questIndexEntries: [],
  questZoneIdsByQuestId: new Map<string, Set<string>>(),
  npcFormDirty: false,
  npcFormSelectionKey: null,
  projectDirectoryHandle: null,
  projectDirectoryName: null,
};

state.chunks.set(state.activeChunkKey, state.data);
state.loadedChunkKeys.add(state.activeChunkKey);
state.histories.set(state.activeChunkKey, { undo: [], redo: [] });

const resourceSelectOptions = state.worldObjectTypes
  .filter((entry) => entry.behavior === 'harvestable')
  .map((entry) => `<option value="${entry.id}">${entry.name}</option>`)
  .join('');
const monsterSelectOptions = MONSTER_TYPES.map(
  (entry) => `<option value="${entry.id}">${entry.label}</option>`,
).join('');
const objectSelectOptions = state.worldObjectTypes
  .filter((entry) => entry.behavior !== 'harvestable' && entry.behavior !== 'npc')
  .map((entry) => `<option value="${entry.id}">${entry.name}</option>`)
  .join('');
const npcSelectOptions = NPC_TYPES.map(
  (entry) => `<option value="${entry.id}">${entry.label}</option>`,
).join('');
const tileSelectOptions = state.tileTypes.map(
  (entry) => `<option value="${entry.id}">${entry.label}</option>`,
).join('');

app.innerHTML = `
  <aside class="sidebar">
    <div class="panel">
      <h3>Map Making</h3>
      <div class="row row-buttons"><button id="connectProjectFolder" class="secondary">Connect Project Folder</button></div>
      <div class="note" id="projectFolderStatus">No project folder connected</div>
    </div>

    <div class="panel">
      <h3>Chunk</h3>
      <div class="row">
        <label for="chunkX">Chunk X</label>
        <input id="chunkX" type="number" step="1" value="0" />
      </div>
      <div class="row">
        <label for="chunkY">Chunk Y</label>
        <input id="chunkY" type="number" step="1" value="0" />
      </div>
      <div class="row row-buttons">
        <button id="loadChunk" class="secondary">Load Chunk</button>
      </div>
      <div class="note" id="chunkSummary"></div>
    </div>

    <div class="panel">
      <h3>Layer</h3>
      <div class="row">
        <label for="toolMode">Tool</label>
        <select id="toolMode">
          <option value="paint">Paint</option>
          <option value="select">Select</option>
        </select>
      </div>
      <div class="row">
        <label for="layerMode">Active Layer</label>
        <select id="layerMode">
          <option value="terrain">Terrain</option>
          <option value="resources">Resources</option>
          <option value="monsters">Monsters</option>
          <option value="objects">Objects</option>
          <option value="npcs">NPCs</option>
        </select>
      </div>
      <div class="row" id="tileRow">
        <label for="tileType">Tile Type</label>
        <select id="tileType">${tileSelectOptions}</select>
      </div>
      <div class="row" id="resourceRow" style="display:none;">
        <label for="resourceType">Resource</label>
        <select id="resourceType">${resourceSelectOptions}</select>
      </div>
      <div class="row" id="monsterRow" style="display:none;">
        <label for="monsterType">Monster</label>
        <select id="monsterType">${monsterSelectOptions}</select>
      </div>
      <div class="row" id="objectRow" style="display:none;">
        <label for="objectType">Object</label>
        <select id="objectType">${objectSelectOptions}</select>
      </div>
      <div class="row" id="npcRow" style="display:none;">
        <label for="npcType">NPC</label>
        <select id="npcType">${npcSelectOptions}</select>
      </div>
      <div class="row" id="tierRow" style="display:none;">
        <label for="monsterTier">Monster Tier</label>
        <input id="monsterTier" type="number" min="1" max="99" step="1" value="1" />
      </div>
      <div class="note">Paint mode: left click paints, right click erases. Select mode: click a tile to inspect and edit.</div>
    </div>

    <div class="panel">
      <h3>Selection</h3>
      <div class="note" id="selectionSummary">No tile selected.</div>
      <div id="selectionTerrainRow" style="display:none; margin-top:8px;">
        <div class="row">
          <label for="selectionTerrainType">Terrain</label>
          <select id="selectionTerrainType">${tileSelectOptions}</select>
        </div>
        <div class="row row-buttons"><button id="selectionTerrainApply" class="secondary">Apply Terrain</button></div>
      </div>
      <div id="selectionResourceRow" style="display:none; margin-top:8px;">
        <div class="row">
          <label for="selectionResourceType">Resource</label>
          <select id="selectionResourceType">${resourceSelectOptions}</select>
        </div>
        <div class="row">
          <label for="selectionResourceRespawn">Respawn ms</label>
          <input id="selectionResourceRespawn" type="number" min="1" step="100" value="5000" />
        </div>
        <div class="row row-buttons"><button id="selectionResourceUpdate" class="secondary">Update Resource</button></div>
        <div class="row row-buttons"><button id="selectionResourceDelete" class="secondary">Delete Resource</button></div>
      </div>
      <div id="selectionMonsterRow" style="display:none; margin-top:8px;">
        <div class="row">
          <label for="selectionMonsterType">Monster</label>
          <select id="selectionMonsterType">${monsterSelectOptions}</select>
        </div>
        <div class="row">
          <label for="selectionMonsterTier">Tier</label>
          <input id="selectionMonsterTier" type="number" min="1" max="99" step="1" value="1" />
        </div>
        <div class="row row-buttons"><button id="selectionMonsterUpdate" class="secondary">Update Monster</button></div>
        <div class="row row-buttons"><button id="selectionMonsterDelete" class="secondary">Delete Monster</button></div>
      </div>
      <div id="selectionObjectRow" style="display:none; margin-top:8px;">
        <div class="row">
          <label for="selectionObjectType">Object</label>
          <select id="selectionObjectType">${objectSelectOptions}</select>
        </div>
        <div class="row row-buttons"><button id="selectionObjectUpdate" class="secondary">Update Object</button></div>
        <div class="row row-buttons"><button id="selectionObjectDelete" class="secondary">Delete Object</button></div>
      </div>
      <div id="selectionNpcRow" style="display:none; margin-top:8px;">
        <div class="row">
          <label for="selectionNpcType">NPC</label>
          <select id="selectionNpcType">${npcSelectOptions}</select>
        </div>
        <div class="row">
          <label for="selectionNpcName">Name</label>
          <input id="selectionNpcName" type="text" maxlength="60" />
        </div>
        <div class="row">
          <label for="selectionNpcExamine">Examine</label>
          <textarea id="selectionNpcExamine" rows="2" maxlength="220"></textarea>
        </div>
        <div class="row">
          <label for="selectionNpcTalk">Talk</label>
          <textarea id="selectionNpcTalk" rows="2" maxlength="220"></textarea>
        </div>
        <div class="row">
          <label for="selectionNpcQuestStartIdsSelect">Quest Starts</label>
          <select id="selectionNpcQuestStartIdsSelect" multiple size="6"></select>
        </div>
        <div class="row row-buttons"><button id="selectionNpcUpdate" class="secondary">Update NPC</button></div>
        <div class="row row-buttons"><button id="selectionNpcDelete" class="secondary">Delete NPC</button></div>
      </div>
      <div id="selectionZoneRow" style="display:none; margin-top:8px;">
        <div class="row">
          <label for="selectionZoneId">Zone ID</label>
          <input id="selectionZoneId" type="text" maxlength="80" placeholder="zone-id" />
        </div>
        <div class="row">
          <label for="selectionZoneName">Zone Name</label>
          <input id="selectionZoneName" type="text" maxlength="120" placeholder="Zone Name" />
        </div>
        <div class="row">
          <label for="selectionZoneX">X</label>
          <input id="selectionZoneX" type="number" step="1" value="0" />
        </div>
        <div class="row">
          <label for="selectionZoneY">Y</label>
          <input id="selectionZoneY" type="number" step="1" value="0" />
        </div>
        <div class="row">
          <label for="selectionZoneWidth">Width</label>
          <input id="selectionZoneWidth" type="number" min="1" step="1" value="1" />
        </div>
        <div class="row">
          <label for="selectionZoneHeight">Height</label>
          <input id="selectionZoneHeight" type="number" min="1" step="1" value="1" />
        </div>
        <div class="row row-buttons"><button id="selectionZoneUpdate" class="secondary">Add/Update Zone</button></div>
        <div class="row row-buttons"><button id="selectionZoneDelete" class="secondary">Delete Zone</button></div>
      </div>
    </div>

    <div class="panel">
      <h3>View</h3>
      <div class="row">
        <label for="tileSize">Tile Size</label>
        <input id="tileSize" type="range" min="8" max="28" step="1" value="16" />
      </div>
      <div class="note" id="tileSizeLabel">16 px</div>
    </div>

    <div class="panel">
      <h3>Data</h3>
      <div class="row row-buttons"><button id="undoAction" class="secondary">Undo</button></div>
      <div class="row row-buttons"><button id="redoAction" class="secondary">Redo</button></div>
      <div class="row"><button id="resetDefault" class="secondary">Reset Terrain</button></div>
      <div class="row"><button id="clearEntities" class="secondary">Clear Monsters/Resources</button></div>
      <div class="row"><button id="exportJson">Save Map</button></div>
    </div>

    <div class="panel">
      <h3>Quests</h3>
      <div id="questEditorGui" class="quest-editor-gui">
        <div class="row">
          <label for="questEditorSelect">Quest List</label>
          <select id="questEditorSelect" size="6"></select>
        </div>
        <div class="row">
          <label for="questEditorId">Quest ID</label>
          <input id="questEditorId" type="text" maxlength="120" placeholder="quest-id" />
        </div>
        <div class="row">
          <label for="questEditorTitle">Title</label>
          <input id="questEditorTitle" type="text" maxlength="120" placeholder="Quest title" />
        </div>
        <div class="row">
          <label for="questEditorSummary">Summary</label>
          <textarea id="questEditorSummary" rows="2" maxlength="320"></textarea>
        </div>
        <div class="row">
          <label for="questEditorStartNpcId">Start NPC</label>
          <input id="questEditorStartNpcId" type="text" maxlength="120" placeholder="optional npc id" />
        </div>
        <div class="row">
          <label for="questEditorCooldownMs">Cooldown ms</label>
          <input id="questEditorCooldownMs" type="number" min="0" step="1000" value="0" />
        </div>
        <div class="row">
          <label for="questEditorRepeatable">Repeatable</label>
          <input id="questEditorRepeatable" type="checkbox" />
        </div>

        <div class="note">Requirements</div>
        <div class="row">
          <label for="questReqQuestIds">Quest IDs</label>
          <input id="questReqQuestIds" type="text" maxlength="280" placeholder="quest-a, quest-b" />
        </div>
        <div class="row">
          <label for="questReqItems">Items</label>
          <textarea id="questReqItems" rows="3" placeholder="itemId:quantity (one per line)"></textarea>
        </div>
        <div class="row">
          <label for="questReqSkills">Skills</label>
          <textarea id="questReqSkills" rows="3" placeholder="skill:level (one per line)"></textarea>
        </div>

        <div class="note">Rewards</div>
        <div class="row">
          <label for="questRewardGold">Gold</label>
          <input id="questRewardGold" type="number" min="0" step="1" value="0" />
        </div>
        <div class="row">
          <label for="questRewardUnlocks">Unlock IDs</label>
          <input id="questRewardUnlocks" type="text" maxlength="280" placeholder="quest-x, quest-y" />
        </div>
        <div class="row">
          <label for="questRewardItems">Items</label>
          <textarea id="questRewardItems" rows="3" placeholder="itemId:quantity (one per line)"></textarea>
        </div>
        <div class="row">
          <label for="questRewardXp">XP</label>
          <textarea id="questRewardXp" rows="3" placeholder="skill:amount (one per line)"></textarea>
        </div>

        <div class="note">Chain</div>
        <div class="row">
          <label for="questChainNextIds">Next IDs</label>
          <input id="questChainNextIds" type="text" maxlength="280" placeholder="quest-next-1, quest-next-2" />
        </div>
        <div class="row">
          <label for="questChainAutoStart">Auto Start</label>
          <input id="questChainAutoStart" type="checkbox" />
        </div>

        <div class="note">Steps</div>
        <div class="row">
          <label for="questStepSelect">Step List</label>
          <select id="questStepSelect" size="4"></select>
        </div>
        <div class="row">
          <label for="questStepId">Step ID</label>
          <input id="questStepId" type="text" maxlength="120" />
        </div>
        <div class="row">
          <label for="questStepDescription">Description</label>
          <textarea id="questStepDescription" rows="2"></textarea>
        </div>
        <div class="row">
          <label for="questStepCompletion">Completion</label>
          <select id="questStepCompletion">
            <option value="all">all</option>
            <option value="any">any</option>
          </select>
        </div>
        <div class="row row-buttons"><button id="questStepAdd" class="secondary">Add Step</button></div>
        <div class="row row-buttons"><button id="questStepApply" class="secondary">Apply Step</button></div>
        <div class="row row-buttons"><button id="questStepDelete" class="secondary">Delete Step</button></div>

        <div class="note">Objectives (selected step)</div>
        <div class="row">
          <label for="questObjectiveSelect">Objective List</label>
          <select id="questObjectiveSelect" size="5"></select>
        </div>
        <div class="row">
          <label for="questObjectiveId">Objective ID</label>
          <input id="questObjectiveId" type="text" maxlength="120" />
        </div>
        <div class="row">
          <label for="questObjectiveType">Type</label>
          <select id="questObjectiveType">
            <option value="kill">kill</option>
            <option value="gather">gather</option>
            <option value="delivery">delivery</option>
            <option value="travel">travel</option>
            <option value="item_retrieval">item_retrieval</option>
            <option value="interact_object">interact_object</option>
            <option value="talk_to_npc">talk_to_npc</option>
          </select>
        </div>
        <div class="row"><label for="questObjectiveTargetId">Target ID</label><input id="questObjectiveTargetId" type="text" maxlength="120" /></div>
        <div class="row"><label for="questObjectiveItemId">Item ID</label><input id="questObjectiveItemId" type="text" maxlength="120" /></div>
        <div class="row"><label for="questObjectiveCount">Count</label><input id="questObjectiveCount" type="number" min="0" step="1" value="1" /></div>
        <div class="row"><label for="questObjectiveQuantity">Quantity</label><input id="questObjectiveQuantity" type="number" min="0" step="1" value="1" /></div>
        <div class="row"><label for="questObjectiveZoneId">Zone ID</label><input id="questObjectiveZoneId" type="text" maxlength="120" /></div>
        <div class="row"><label for="questObjectiveNpcId">NPC ID</label><input id="questObjectiveNpcId" type="text" maxlength="120" /></div>
        <div class="row"><label for="questObjectiveToNpcId">To NPC ID</label><input id="questObjectiveToNpcId" type="text" maxlength="120" /></div>
        <div class="row"><label for="questObjectiveObjectTypeId">Object Type</label><input id="questObjectiveObjectTypeId" type="text" maxlength="120" /></div>
        <div class="row"><label for="questObjectiveObjectId">Object ID</label><input id="questObjectiveObjectId" type="text" maxlength="120" /></div>
        <div class="row"><label for="questObjectiveTileX">Tile X</label><input id="questObjectiveTileX" type="number" step="1" value="0" /></div>
        <div class="row"><label for="questObjectiveTileY">Tile Y</label><input id="questObjectiveTileY" type="number" step="1" value="0" /></div>
        <div class="row"><label for="questObjectiveRadius">Radius</label><input id="questObjectiveRadius" type="number" min="0" step="1" value="0" /></div>
        <div class="row row-buttons"><button id="questObjectiveAdd" class="secondary">Add Objective</button></div>
        <div class="row row-buttons"><button id="questObjectiveApply" class="secondary">Apply Objective</button></div>
        <div class="row row-buttons"><button id="questObjectiveDelete" class="secondary">Delete Objective</button></div>
      </div>
      <div class="row row-buttons"><button id="questEditorNew" class="secondary">New Quest</button></div>
      <div class="row row-buttons"><button id="questEditorUpsert" class="secondary">Add/Update Quest</button></div>
      <div class="row row-buttons"><button id="questEditorDelete" class="secondary">Delete Quest</button></div>
      <div class="row row-buttons"><button id="questEditorSave">Save Quests</button></div>
      <div class="note">GUI quest editor: update fields, steps, objectives, rewards, requirements, and chain; then click <strong>Add/Update Quest</strong>.</div>
    </div>

    <div class="panel">
      <h3>Quest Zones</h3>
      <div class="row">
        <label for="zoneEditorSelect">Zone List</label>
        <select id="zoneEditorSelect" size="8"></select>
      </div>
      <div class="row">
        <label for="zoneEditorId">Zone ID</label>
        <input id="zoneEditorId" type="text" maxlength="80" placeholder="zone-id" />
      </div>
      <div class="row">
        <label for="zoneEditorName">Zone Name</label>
        <input id="zoneEditorName" type="text" maxlength="120" placeholder="Zone Name" />
      </div>
      <div class="row">
        <label for="zoneEditorX">X</label>
        <input id="zoneEditorX" type="number" step="1" value="0" />
      </div>
      <div class="row">
        <label for="zoneEditorY">Y</label>
        <input id="zoneEditorY" type="number" step="1" value="0" />
      </div>
      <div class="row">
        <label for="zoneEditorWidth">Width</label>
        <input id="zoneEditorWidth" type="number" min="1" step="1" value="1" />
      </div>
      <div class="row">
        <label for="zoneEditorHeight">Height</label>
        <input id="zoneEditorHeight" type="number" min="1" step="1" value="1" />
      </div>
      <div class="row row-buttons"><button id="zoneEditorNew" class="secondary">New Zone</button></div>
      <div class="row row-buttons"><button id="zoneEditorUpsert" class="secondary">Add/Update Zone</button></div>
      <div class="row row-buttons"><button id="zoneEditorDelete" class="secondary">Delete Zone</button></div>
      <div class="note">Zones save with the map via <strong>Save Map</strong>.</div>
    </div>

    <div class="panel">
      <h3>Status</h3>
      <div class="status" id="status"></div>
      <div class="note" id="hoverSummary">Hover: -</div>
    </div>

    <div class="panel">
      <h3>Debug</h3>
      <div class="row row-buttons"><button id="clearDebugLog" class="secondary">Clear Debug Log</button></div>
      <div class="status" id="debugLog">Debug log ready.</div>
    </div>
  </aside>

  <div id="sidebarResizer" class="sidebar-resizer" role="separator" aria-orientation="vertical" aria-label="Resize sidebar"></div>

  <main class="canvas-wrap">
    <div class="canvas-shell">
      <canvas id="editorCanvas"></canvas>
    </div>
  </main>
`;

const canvas = requireElement<HTMLCanvasElement>('#editorCanvas', 'Editor canvas not found');
const sidebarElement = requireElement<HTMLElement>('.sidebar', 'Sidebar not found');
const sidebarResizerElement = requireElement<HTMLDivElement>('#sidebarResizer', 'Sidebar resizer not found');
const context = require2DContext(canvas);
const statusElement = requireElement<HTMLDivElement>('#status', 'Status element not found');
const chunkSummaryElement = requireElement<HTMLDivElement>('#chunkSummary', 'Chunk summary not found');

const chunkXInput = requireElement<HTMLInputElement>('#chunkX', 'Chunk X input not found');
const chunkYInput = requireElement<HTMLInputElement>('#chunkY', 'Chunk Y input not found');
const loadChunkButton = requireElement<HTMLButtonElement>('#loadChunk', 'Load chunk button not found');
const toolModeSelect = requireElement<HTMLSelectElement>('#toolMode', 'Tool mode select not found');
const layerModeSelect = requireElement<HTMLSelectElement>('#layerMode', 'Layer mode select not found');
const tileTypeSelect = requireElement<HTMLSelectElement>('#tileType', 'Tile type select not found');
const resourceTypeSelect = requireElement<HTMLSelectElement>('#resourceType', 'Resource type select not found');
const monsterTypeSelect = requireElement<HTMLSelectElement>('#monsterType', 'Monster type select not found');
const objectTypeSelect = requireElement<HTMLSelectElement>('#objectType', 'Object type select not found');
const npcTypeSelect = requireElement<HTMLSelectElement>('#npcType', 'NPC type select not found');
const monsterTierInput = requireElement<HTMLInputElement>('#monsterTier', 'Monster tier input not found');
const tileSizeInput = requireElement<HTMLInputElement>('#tileSize', 'Tile size input not found');
const tileSizeLabel = requireElement<HTMLDivElement>('#tileSizeLabel', 'Tile size label not found');
const tileRow = requireElement<HTMLDivElement>('#tileRow', 'Tile row not found');
const resourceRow = requireElement<HTMLDivElement>('#resourceRow', 'Resource row not found');
const monsterRow = requireElement<HTMLDivElement>('#monsterRow', 'Monster row not found');
const objectRow = requireElement<HTMLDivElement>('#objectRow', 'Object row not found');
const npcRow = requireElement<HTMLDivElement>('#npcRow', 'NPC row not found');
const tierRow = requireElement<HTMLDivElement>('#tierRow', 'Tier row not found');
const undoActionButton = requireElement<HTMLButtonElement>('#undoAction', 'Undo button not found');
const redoActionButton = requireElement<HTMLButtonElement>('#redoAction', 'Redo button not found');
const resetDefaultButton = requireElement<HTMLButtonElement>('#resetDefault', 'Reset button not found');
const clearEntitiesButton = requireElement<HTMLButtonElement>('#clearEntities', 'Clear entities button not found');
const exportButton = requireElement<HTMLButtonElement>('#exportJson', 'Save Map button not found');
const connectProjectFolderButton = requireElement<HTMLButtonElement>('#connectProjectFolder', 'Connect Project Folder button not found');
const projectFolderStatusElement = requireElement<HTMLDivElement>('#projectFolderStatus', 'Project folder status not found');
// Removed exportWorldButton and importInput
const editorViewport = requireElement<HTMLElement>('.canvas-wrap', 'Editor viewport not found');
const selectionSummaryElement = requireElement<HTMLDivElement>('#selectionSummary', 'Selection summary not found');
const selectionTerrainRow = requireElement<HTMLDivElement>('#selectionTerrainRow', 'Selection terrain row not found');
const selectionTerrainTypeSelect = requireElement<HTMLSelectElement>('#selectionTerrainType', 'Selection terrain type not found');
const selectionTerrainApplyButton = requireElement<HTMLButtonElement>('#selectionTerrainApply', 'Selection terrain apply button not found');
const selectionResourceRow = requireElement<HTMLDivElement>('#selectionResourceRow', 'Selection resource row not found');
const selectionResourceTypeSelect = requireElement<HTMLSelectElement>('#selectionResourceType', 'Selection resource type not found');
const selectionResourceRespawnInput = requireElement<HTMLInputElement>('#selectionResourceRespawn', 'Selection resource respawn input not found');
const selectionResourceUpdateButton = requireElement<HTMLButtonElement>('#selectionResourceUpdate', 'Selection resource update button not found');
const selectionResourceDeleteButton = requireElement<HTMLButtonElement>('#selectionResourceDelete', 'Selection resource delete button not found');
const selectionMonsterRow = requireElement<HTMLDivElement>('#selectionMonsterRow', 'Selection monster row not found');
const selectionMonsterTypeSelect = requireElement<HTMLSelectElement>('#selectionMonsterType', 'Selection monster type not found');
const selectionMonsterTierInput = requireElement<HTMLInputElement>('#selectionMonsterTier', 'Selection monster tier input not found');
const selectionMonsterUpdateButton = requireElement<HTMLButtonElement>('#selectionMonsterUpdate', 'Selection monster update button not found');
const selectionMonsterDeleteButton = requireElement<HTMLButtonElement>('#selectionMonsterDelete', 'Selection monster delete button not found');
const selectionObjectRow = requireElement<HTMLDivElement>('#selectionObjectRow', 'Selection object row not found');
const selectionObjectTypeSelect = requireElement<HTMLSelectElement>('#selectionObjectType', 'Selection object type not found');
const selectionObjectUpdateButton = requireElement<HTMLButtonElement>('#selectionObjectUpdate', 'Selection object update button not found');
const selectionObjectDeleteButton = requireElement<HTMLButtonElement>('#selectionObjectDelete', 'Selection object delete button not found');
const selectionNpcRow = requireElement<HTMLDivElement>('#selectionNpcRow', 'Selection npc row not found');
const selectionNpcTypeSelect = requireElement<HTMLSelectElement>('#selectionNpcType', 'Selection npc type not found');
const selectionNpcNameInput = requireElement<HTMLInputElement>('#selectionNpcName', 'Selection npc name not found');
const selectionNpcExamineInput = requireElement<HTMLTextAreaElement>('#selectionNpcExamine', 'Selection npc examine not found');
const selectionNpcTalkInput = requireElement<HTMLTextAreaElement>('#selectionNpcTalk', 'Selection npc talk not found');
const selectionNpcQuestStartIdsSelect = requireElement<HTMLSelectElement>('#selectionNpcQuestStartIdsSelect', 'Selection npc quest start IDs select not found');
const selectionNpcUpdateButton = requireElement<HTMLButtonElement>('#selectionNpcUpdate', 'Selection npc update button not found');
const selectionNpcDeleteButton = requireElement<HTMLButtonElement>('#selectionNpcDelete', 'Selection npc delete button not found');
const selectionZoneRow = requireElement<HTMLDivElement>('#selectionZoneRow', 'Selection zone row not found');
const selectionZoneIdInput = requireElement<HTMLInputElement>('#selectionZoneId', 'Selection zone ID input not found');
const selectionZoneNameInput = requireElement<HTMLInputElement>('#selectionZoneName', 'Selection zone name input not found');
const selectionZoneXInput = requireElement<HTMLInputElement>('#selectionZoneX', 'Selection zone X input not found');
const selectionZoneYInput = requireElement<HTMLInputElement>('#selectionZoneY', 'Selection zone Y input not found');
const selectionZoneWidthInput = requireElement<HTMLInputElement>('#selectionZoneWidth', 'Selection zone width input not found');
const selectionZoneHeightInput = requireElement<HTMLInputElement>('#selectionZoneHeight', 'Selection zone height input not found');
const selectionZoneUpdateButton = requireElement<HTMLButtonElement>('#selectionZoneUpdate', 'Selection zone update button not found');
const selectionZoneDeleteButton = requireElement<HTMLButtonElement>('#selectionZoneDelete', 'Selection zone delete button not found');
const questEditorSelect = requireElement<HTMLSelectElement>('#questEditorSelect', 'Quest editor list not found');
const questEditorIdInput = requireElement<HTMLInputElement>('#questEditorId', 'Quest editor ID input not found');
const questEditorTitleInput = requireElement<HTMLInputElement>('#questEditorTitle', 'Quest editor title input not found');
const questEditorSummaryInput = requireElement<HTMLTextAreaElement>('#questEditorSummary', 'Quest editor summary input not found');
const questEditorStartNpcIdInput = requireElement<HTMLInputElement>('#questEditorStartNpcId', 'Quest editor start NPC input not found');
const questEditorCooldownMsInput = requireElement<HTMLInputElement>('#questEditorCooldownMs', 'Quest editor cooldown input not found');
const questEditorRepeatableInput = requireElement<HTMLInputElement>('#questEditorRepeatable', 'Quest editor repeatable input not found');
const questReqQuestIdsInput = requireElement<HTMLInputElement>('#questReqQuestIds', 'Quest requirements quest IDs input not found');
const questReqItemsInput = requireElement<HTMLTextAreaElement>('#questReqItems', 'Quest requirements items input not found');
const questReqSkillsInput = requireElement<HTMLTextAreaElement>('#questReqSkills', 'Quest requirements skills input not found');
const questRewardGoldInput = requireElement<HTMLInputElement>('#questRewardGold', 'Quest reward gold input not found');
const questRewardUnlocksInput = requireElement<HTMLInputElement>('#questRewardUnlocks', 'Quest reward unlock IDs input not found');
const questRewardItemsInput = requireElement<HTMLTextAreaElement>('#questRewardItems', 'Quest reward items input not found');
const questRewardXpInput = requireElement<HTMLTextAreaElement>('#questRewardXp', 'Quest reward XP input not found');
const questChainNextIdsInput = requireElement<HTMLInputElement>('#questChainNextIds', 'Quest chain next IDs input not found');
const questChainAutoStartInput = requireElement<HTMLInputElement>('#questChainAutoStart', 'Quest chain auto start input not found');
const questStepSelect = requireElement<HTMLSelectElement>('#questStepSelect', 'Quest step list not found');
const questStepIdInput = requireElement<HTMLInputElement>('#questStepId', 'Quest step ID input not found');
const questStepDescriptionInput = requireElement<HTMLTextAreaElement>('#questStepDescription', 'Quest step description input not found');
const questStepCompletionSelect = requireElement<HTMLSelectElement>('#questStepCompletion', 'Quest step completion select not found');
const questStepAddButton = requireElement<HTMLButtonElement>('#questStepAdd', 'Quest step add button not found');
const questStepApplyButton = requireElement<HTMLButtonElement>('#questStepApply', 'Quest step apply button not found');
const questStepDeleteButton = requireElement<HTMLButtonElement>('#questStepDelete', 'Quest step delete button not found');
const questObjectiveSelect = requireElement<HTMLSelectElement>('#questObjectiveSelect', 'Quest objective list not found');
const questObjectiveIdInput = requireElement<HTMLInputElement>('#questObjectiveId', 'Quest objective ID input not found');
const questObjectiveTypeSelect = requireElement<HTMLSelectElement>('#questObjectiveType', 'Quest objective type select not found');
const questObjectiveTargetIdInput = requireElement<HTMLInputElement>('#questObjectiveTargetId', 'Quest objective target ID input not found');
const questObjectiveItemIdInput = requireElement<HTMLInputElement>('#questObjectiveItemId', 'Quest objective item ID input not found');
const questObjectiveCountInput = requireElement<HTMLInputElement>('#questObjectiveCount', 'Quest objective count input not found');
const questObjectiveQuantityInput = requireElement<HTMLInputElement>('#questObjectiveQuantity', 'Quest objective quantity input not found');
const questObjectiveZoneIdInput = requireElement<HTMLInputElement>('#questObjectiveZoneId', 'Quest objective zone ID input not found');
const questObjectiveNpcIdInput = requireElement<HTMLInputElement>('#questObjectiveNpcId', 'Quest objective NPC ID input not found');
const questObjectiveToNpcIdInput = requireElement<HTMLInputElement>('#questObjectiveToNpcId', 'Quest objective to-NPC ID input not found');
const questObjectiveObjectTypeIdInput = requireElement<HTMLInputElement>('#questObjectiveObjectTypeId', 'Quest objective object type input not found');
const questObjectiveObjectIdInput = requireElement<HTMLInputElement>('#questObjectiveObjectId', 'Quest objective object ID input not found');
const questObjectiveTileXInput = requireElement<HTMLInputElement>('#questObjectiveTileX', 'Quest objective tileX input not found');
const questObjectiveTileYInput = requireElement<HTMLInputElement>('#questObjectiveTileY', 'Quest objective tileY input not found');
const questObjectiveRadiusInput = requireElement<HTMLInputElement>('#questObjectiveRadius', 'Quest objective radius input not found');
const questObjectiveAddButton = requireElement<HTMLButtonElement>('#questObjectiveAdd', 'Quest objective add button not found');
const questObjectiveApplyButton = requireElement<HTMLButtonElement>('#questObjectiveApply', 'Quest objective apply button not found');
const questObjectiveDeleteButton = requireElement<HTMLButtonElement>('#questObjectiveDelete', 'Quest objective delete button not found');
const questEditorNewButton = requireElement<HTMLButtonElement>('#questEditorNew', 'Quest editor new button not found');
const questEditorUpsertButton = requireElement<HTMLButtonElement>('#questEditorUpsert', 'Quest editor add/update button not found');
const questEditorDeleteButton = requireElement<HTMLButtonElement>('#questEditorDelete', 'Quest editor delete button not found');
const questEditorSaveButton = requireElement<HTMLButtonElement>('#questEditorSave', 'Quest editor save button not found');
const zoneEditorSelect = requireElement<HTMLSelectElement>('#zoneEditorSelect', 'Zone editor list not found');
const zoneEditorIdInput = requireElement<HTMLInputElement>('#zoneEditorId', 'Zone editor ID input not found');
const zoneEditorNameInput = requireElement<HTMLInputElement>('#zoneEditorName', 'Zone editor name input not found');
const zoneEditorXInput = requireElement<HTMLInputElement>('#zoneEditorX', 'Zone editor X input not found');
const zoneEditorYInput = requireElement<HTMLInputElement>('#zoneEditorY', 'Zone editor Y input not found');
const zoneEditorWidthInput = requireElement<HTMLInputElement>('#zoneEditorWidth', 'Zone editor width input not found');
const zoneEditorHeightInput = requireElement<HTMLInputElement>('#zoneEditorHeight', 'Zone editor height input not found');
const zoneEditorNewButton = requireElement<HTMLButtonElement>('#zoneEditorNew', 'Zone editor new button not found');
const zoneEditorUpsertButton = requireElement<HTMLButtonElement>('#zoneEditorUpsert', 'Zone editor add/update button not found');
const zoneEditorDeleteButton = requireElement<HTMLButtonElement>('#zoneEditorDelete', 'Zone editor delete button not found');
const hoverSummaryElement = requireElement<HTMLDivElement>('#hoverSummary', 'Hover summary not found');
const debugLogElement = requireElement<HTMLDivElement>('#debugLog', 'Debug log element not found');
const clearDebugLogButton = requireElement<HTMLButtonElement>('#clearDebugLog', 'Clear debug log button not found');
const tileImageCache = new Map<string, HTMLImageElement | null>();

let isMiddleMousePanning = false;
let panStartClientX = 0;
let panStartClientY = 0;
let panStartScrollLeft = 0;
let panStartScrollTop = 0;
let renderOriginChunkX = 0;
let renderOriginChunkY = 0;
let rafChunkLoadRequest: number | null = null;
let isSidebarResizing = false;
let sidebarResizeStartClientX = 0;
let sidebarResizeStartWidth = 320;

// Track which chunks have been explicitly added (including the original)
const addedChunkKeys = new Set<string>([getChunkKey(0, 0)]);
const debugLogLines: string[] = [];
let questEditorDraft: QuestIndexEntry = buildDefaultQuestDefinition('');
let questEditorSelectedStepIndex = 0;
let questEditorSelectedObjectiveIndex = 0;
let tileTypesSyncSignature = '';
let worldObjectTypesSyncSignature = '';

function supportsFileSystemAccess(): boolean {
  return typeof (window as unknown as { showDirectoryPicker?: () => Promise<any> }).showDirectoryPicker === 'function';
}

async function ensureProjectFolderWritePermission(handle: any): Promise<void> {
  const queryPermission = handle?.queryPermission as ((options: { mode: 'readwrite' }) => Promise<string>) | undefined;
  const requestPermission = handle?.requestPermission as ((options: { mode: 'readwrite' }) => Promise<string>) | undefined;

  if (queryPermission) {
    const existing = await queryPermission.call(handle, { mode: 'readwrite' });
    if (existing === 'granted') {
      return;
    }
  }

  if (!requestPermission) {
    throw new Error('Browser does not support requesting write permission for this folder.');
  }

  const granted = await requestPermission.call(handle, { mode: 'readwrite' });
  if (granted !== 'granted') {
    throw new Error('Write permission denied. Please reconnect folder and allow write access.');
  }
}

async function folderHasDirectory(handle: any, name: string): Promise<boolean> {
  try {
    await handle.getDirectoryHandle(name, { create: false });
    return true;
  } catch {
    return false;
  }
}

async function folderHasFile(handle: any, name: string): Promise<boolean> {
  try {
    await handle.getFileHandle(name, { create: false });
    return true;
  } catch {
    return false;
  }
}

async function validateProjectRootFolder(handle: any): Promise<void> {
  const [hasPublicDir, hasServerDir, hasPackageJson] = await Promise.all([
    folderHasDirectory(handle, 'public'),
    folderHasDirectory(handle, 'server'),
    folderHasFile(handle, 'package.json'),
  ]);

  if (!hasPublicDir || !hasServerDir || !hasPackageJson) {
    throw new Error(
      "Selected folder is not your game project root. Pick the folder that contains 'package.json', 'public/', and 'server/' (for this workspace, that should be the Game folder).",
    );
  }
}

function updateProjectFolderStatusLabel(): void {
  if (!supportsFileSystemAccess()) {
    projectFolderStatusElement.textContent = 'Local project save unsupported in this browser';
    return;
  }

  if (!state.projectDirectoryHandle) {
    projectFolderStatusElement.textContent = 'No project folder connected';
    return;
  }

  projectFolderStatusElement.textContent = `Connected: ${state.projectDirectoryName ?? 'project folder'}`;
}

async function connectProjectFolder(): Promise<boolean> {
  if (!supportsFileSystemAccess()) {
    window.alert('This browser does not support local folder writes. Use Chrome or Edge.');
    updateProjectFolderStatusLabel();
    return false;
  }

  try {
    const picker = (window as unknown as { showDirectoryPicker: (options?: { mode?: 'readwrite' | 'read' }) => Promise<any> }).showDirectoryPicker;
    const handle = await picker({ mode: 'readwrite' });
    await ensureProjectFolderWritePermission(handle);
    await validateProjectRootFolder(handle);
    state.projectDirectoryHandle = handle;
    state.projectDirectoryName = String(handle?.name ?? 'project');
    updateProjectFolderStatusLabel();
    window.alert(`Connected project folder '${state.projectDirectoryName}'. Save Map will now write to ${PROJECT_WORLD_MAP_RELATIVE_PATH}.`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    window.alert(message ? `Project folder connection cancelled: ${message}` : 'Project folder connection cancelled.');
    updateProjectFolderStatusLabel();
    return false;
  }
}

async function getOrCreateDirectory(root: any, segments: string[]): Promise<any> {
  let current = root;
  for (const segment of segments) {
    current = await current.getDirectoryHandle(segment, { create: true });
  }

  return current;
}

async function writeProjectJsonFile(relativeFilePath: string, value: unknown): Promise<void> {
  if (!state.projectDirectoryHandle) {
    const connected = await connectProjectFolder();
    if (!connected || !state.projectDirectoryHandle) {
      throw new Error('Project folder not connected.');
    }
  }

  await ensureProjectFolderWritePermission(state.projectDirectoryHandle);
  await validateProjectRootFolder(state.projectDirectoryHandle);

  const normalized = String(relativeFilePath ?? '').replace(/\\/g, '/').replace(/^\/+/, '');
  const pathParts = normalized.split('/').filter(Boolean);
  if (pathParts.length < 2) {
    throw new Error(`Invalid relative path '${relativeFilePath}'.`);
  }

  const fileName = pathParts[pathParts.length - 1];
  const directoryParts = pathParts.slice(0, -1);
  const directoryHandle = await getOrCreateDirectory(state.projectDirectoryHandle, directoryParts);
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(`${JSON.stringify(value, null, 2)}\n`);
  await writable.close();
}

function appendDebugLog(label: string, details: string): void {
  const time = new Date().toISOString().slice(11, 23);
  const line = `${time} [${label}] ${details}`;
  debugLogLines.push(line);
  while (debugLogLines.length > DEBUG_LOG_MAX_LINES) {
    debugLogLines.shift();
  }

  debugLogElement.textContent = debugLogLines.join('\n');
  console.debug('[MapEditor]', line);
}

updateProjectFolderStatusLabel();

function normalizeTileTypes(input: unknown): TileTypeDefinition[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((entry) => {
      const candidate = entry as Record<string, unknown>;
      const id = Number(candidate?.id ?? NaN);
      const label = String(candidate?.label ?? '').trim();
      const color = String(candidate?.color ?? '').trim();
      const image = String(candidate?.image ?? '').trim();
      if (!Number.isFinite(id) || !label || !color) {
        return null;
      }

      return {
        id,
        label,
        color,
        image,
      };
    })
    .filter((entry): entry is TileTypeDefinition => entry !== null)
    .sort((a, b) => a.id - b.id);
}

function normalizeWorldObjectBehavior(value: unknown): WorldObjectBehavior {
  const parsed = String(value ?? '').trim();
  if (parsed === 'harvestable' || parsed === 'station' || parsed === 'bank' || parsed === 'shop' || parsed === 'npc') {
    return parsed;
  }

  return 'decorative';
}

function normalizeWorldObjectTypes(input: unknown): WorldObjectTypeDefinition[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((entry) => {
      const candidate = entry as Record<string, unknown>;
      const id = String(candidate?.id ?? '').trim();
      const name = String(candidate?.name ?? '').trim();
      if (!id || !name) {
        return null;
      }

      return {
        id,
        name,
        behavior: normalizeWorldObjectBehavior(candidate?.behavior),
        blocksMovement: Boolean(candidate?.blocksMovement),
        image: String(candidate?.image ?? '').trim(),
        examineText: String(candidate?.examineText ?? "It's an object."),
        tags: Array.isArray(candidate?.tags)
          ? candidate.tags.map((tag: unknown) => String(tag ?? '').trim()).filter(Boolean)
          : [],
        behaviorConfig:
          candidate?.behaviorConfig && typeof candidate.behaviorConfig === 'object'
            ? { ...(candidate.behaviorConfig as Record<string, unknown>) }
            : {},
      };
    })
    .filter((entry): entry is WorldObjectTypeDefinition => entry !== null)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function getSelectableWorldObjectTypesForLayer(layer: LayerMode): WorldObjectTypeDefinition[] {
  if (layer === 'resources') {
    return state.worldObjectTypes.filter((entry) => entry.behavior === 'harvestable');
  }

  if (layer === 'objects') {
    return state.worldObjectTypes.filter((entry) => entry.behavior !== 'harvestable' && entry.behavior !== 'npc');
  }

  return state.worldObjectTypes;
}

function getWorldObjectTypeById(objectTypeId: string): WorldObjectTypeDefinition | null {
  return state.worldObjectTypes.find((entry) => entry.id === objectTypeId) ?? null;
}

function getWorldObjectTypeByIdFromList(
  worldObjectTypes: WorldObjectTypeDefinition[],
  objectTypeId: string,
): WorldObjectTypeDefinition | null {
  return worldObjectTypes.find((entry) => entry.id === objectTypeId) ?? null;
}

function resolveSelectedWorldObjectTypeForLayer(layer: LayerMode): WorldObjectTypeDefinition | null {
  const candidates = getSelectableWorldObjectTypesForLayer(layer);
  if (candidates.length === 0) {
    return null;
  }

  const selected = candidates.find((entry) => entry.id === state.selectedWorldObjectTypeId) ?? candidates[0];
  state.selectedWorldObjectTypeId = selected.id;
  return selected;
}

function normalizeWorldObjectPlacement(rawEntry: unknown, index: number): WorldObjectPlacement | null {
  if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
    return null;
  }

  const entry = rawEntry as Record<string, unknown>;
  const objectTypeId = String(entry.objectTypeId ?? '').trim();
  if (!objectTypeId) {
    return null;
  }

  const tileX = Math.floor(Number(entry.tileX ?? 0));
  const tileY = Math.floor(Number(entry.tileY ?? 0));
  const parsedNodeType = String(entry.nodeType ?? '').trim();
  const nodeType: 'tree' | 'rock' | undefined = parsedNodeType === 'rock' ? 'rock' : parsedNodeType === 'tree' ? 'tree' : undefined;

  return {
    id: normalizeText(String(entry.id ?? ''), `world-object-${index + 1}`),
    objectTypeId,
    tileX,
    tileY,
    ...(typeof entry.resourceId === 'string' && entry.resourceId.trim() ? { resourceId: entry.resourceId.trim() } : {}),
    ...(nodeType ? { nodeType } : {}),
    ...(Number.isFinite(Number(entry.respawnMs)) ? { respawnMs: Math.max(250, Math.floor(Number(entry.respawnMs))) } : {}),
    ...(typeof entry.name === 'string' && entry.name.trim() ? { name: entry.name.trim() } : {}),
    ...(typeof entry.blocksMovement === 'boolean' ? { blocksMovement: entry.blocksMovement } : {}),
    ...(typeof entry.examineText === 'string' && entry.examineText.trim() ? { examineText: entry.examineText.trim() } : {}),
  };
}

function mapLegacyPlacementsToWorldObjects(
  resources: ResourcePlacement[],
  objects: ObjectPlacement[],
): WorldObjectPlacement[] {
  const mappedResources: WorldObjectPlacement[] = resources.map((entry, index) => ({
    id: normalizeText(entry.id, `resource-${index + 1}`),
    objectTypeId: normalizeText(entry.resourceId, `resource_type_${index + 1}`),
    tileX: Math.floor(Number(entry.tileX ?? 0)),
    tileY: Math.floor(Number(entry.tileY ?? 0)),
    resourceId: normalizeText(entry.resourceId, `resource_type_${index + 1}`),
    nodeType: (entry.nodeType === 'rock' ? 'rock' : 'tree') as 'tree' | 'rock',
    respawnMs: Math.max(250, Math.floor(Number(entry.respawnMs ?? 5000))),
  }));

  const mappedObjects: WorldObjectPlacement[] = objects.map((entry, index) => ({
    id: normalizeText(entry.id, `object-${index + 1}`),
    objectTypeId: normalizeText(entry.objectTypeId, `object_type_${index + 1}`),
    tileX: Math.floor(Number(entry.tileX ?? 0)),
    tileY: Math.floor(Number(entry.tileY ?? 0)),
    name: normalizeText(entry.name),
    blocksMovement: Boolean(entry.blocksMovement),
    examineText: normalizeText(entry.examineText),
  }));

  return [...mappedResources, ...mappedObjects];
}

function mapWorldObjectsToLegacyPlacements(
  worldObjects: WorldObjectPlacement[],
  worldObjectTypes: WorldObjectTypeDefinition[],
): { resources: ResourcePlacement[]; objects: ObjectPlacement[] } {
  const resources: ResourcePlacement[] = [];
  const objects: ObjectPlacement[] = [];

  for (const [index, entry] of worldObjects.entries()) {
    const worldObjectType = getWorldObjectTypeByIdFromList(worldObjectTypes, entry.objectTypeId);
    const behavior = worldObjectType?.behavior ?? 'decorative';
    const behaviorConfig = (worldObjectType?.behaviorConfig ?? {}) as Record<string, unknown>;

    if (behavior === 'harvestable') {
      const resourceId = normalizeText(
        entry.resourceId
          ?? String(behaviorConfig.resourceId ?? '').trim()
          ?? worldObjectType?.id
          ?? entry.objectTypeId,
        entry.objectTypeId,
      );
      const configNodeType = String(behaviorConfig.nodeType ?? '').trim() === 'rock' ? 'rock' : 'tree';
      const nodeType = entry.nodeType === 'rock' ? 'rock' : entry.nodeType === 'tree' ? 'tree' : configNodeType;
      const configRespawnMs = Number(behaviorConfig.respawnMs ?? 5000);
      const respawnMs = Math.max(
        250,
        Math.floor(Number(entry.respawnMs ?? (Number.isFinite(configRespawnMs) ? configRespawnMs : 5000))),
      );

      resources.push({
        id: normalizeText(entry.id, `resource-${index + 1}`),
        nodeType,
        resourceId,
        tileX: Math.floor(Number(entry.tileX ?? 0)),
        tileY: Math.floor(Number(entry.tileY ?? 0)),
        respawnMs,
      });
      continue;
    }

    if (behavior !== 'npc') {
      objects.push({
        id: normalizeText(entry.id, `object-${index + 1}`),
        objectTypeId: entry.objectTypeId,
        name: normalizeText(String(entry.name ?? worldObjectType?.name ?? ''), worldObjectType?.name ?? 'Object'),
        tileX: Math.floor(Number(entry.tileX ?? 0)),
        tileY: Math.floor(Number(entry.tileY ?? 0)),
        blocksMovement:
          entry.blocksMovement === undefined
            ? Boolean(worldObjectType?.blocksMovement)
            : Boolean(entry.blocksMovement),
        examineText: normalizeText(
          String(entry.examineText ?? worldObjectType?.examineText ?? ''),
          worldObjectType?.examineText ?? "It's an object.",
        ),
      });
    }
  }

  return { resources, objects };
}

function syncChunkLegacyPlacementsFromWorldObjects(chunk: EditorChunkData): void {
  const legacyPlacements = mapWorldObjectsToLegacyPlacements(chunk.worldObjects, state.worldObjectTypes);
  chunk.resources = legacyPlacements.resources;
  chunk.objects = legacyPlacements.objects;
}

function resolveTileImageUrl(input: string): string {
  const trimmed = String(input ?? '').trim();
  if (!trimmed) {
    return '';
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  const normalized = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
  return `${import.meta.env.BASE_URL}${normalized}`;
}

function getTileImageForTileId(tileId: number): HTMLImageElement | null {
  const tile = state.tileTypes.find((entry) => entry.id === tileId);
  const imagePath = String(tile?.image ?? '').trim();
  if (!imagePath) {
    return null;
  }

  const imageUrl = resolveTileImageUrl(imagePath);
  const cached = tileImageCache.get(imageUrl);
  if (typeof cached !== 'undefined') {
    return cached;
  }

  const image = new Image();
  image.decoding = 'async';
  image.onload = () => {
    tileImageCache.set(imageUrl, image);
    drawGrid();
  };
  image.onerror = () => {
    tileImageCache.set(imageUrl, null);
  };
  tileImageCache.set(imageUrl, null);
  image.src = imageUrl;
  return null;
}

function getSharedTerrainTilesetImage(): HTMLImageElement | null {
  const cached = tileImageCache.get(TERRAIN_TILESET_URL);
  if (typeof cached !== 'undefined') {
    return cached;
  }

  const image = new Image();
  image.decoding = 'async';
  image.onload = () => {
    tileImageCache.set(TERRAIN_TILESET_URL, image);
    drawGrid();
  };
  image.onerror = () => {
    tileImageCache.set(TERRAIN_TILESET_URL, null);
  };
  tileImageCache.set(TERRAIN_TILESET_URL, null);
  image.src = TERRAIN_TILESET_URL;
  return null;
}

function refreshTileTypeSelectOptions(): void {
  const optionsMarkup = state.tileTypes
    .map((entry) => `<option value="${entry.id}">${entry.label}</option>`)
    .join('');

  tileTypeSelect.innerHTML = optionsMarkup;
  selectionTerrainTypeSelect.innerHTML = optionsMarkup;

  const hasCurrent = state.tileTypes.some((entry) => entry.id === state.selectedTileType);
  if (!hasCurrent) {
    state.selectedTileType = state.tileTypes[0]?.id ?? 0;
  }

  tileTypeSelect.value = String(state.selectedTileType);
  selectionTerrainTypeSelect.value = String(state.selectedTileType);
}

function refreshWorldObjectTypeSelectOptions(): void {
  const resourceOptions = getSelectableWorldObjectTypesForLayer('resources')
    .map((entry) => `<option value="${entry.id}">${entry.name}</option>`)
    .join('');
  const objectOptions = getSelectableWorldObjectTypesForLayer('objects')
    .map((entry) => `<option value="${entry.id}">${entry.name}</option>`)
    .join('');

  resourceTypeSelect.innerHTML = resourceOptions;
  selectionResourceTypeSelect.innerHTML = resourceOptions;
  objectTypeSelect.innerHTML = objectOptions;
  selectionObjectTypeSelect.innerHTML = objectOptions;

  const selectedResourceType = resolveSelectedWorldObjectTypeForLayer('resources');
  const selectedObjectType = resolveSelectedWorldObjectTypeForLayer('objects');

  if (selectedResourceType) {
    if (resourceTypeSelect.options.length > 0) {
      resourceTypeSelect.value = selectedResourceType.id;
    }
    if (selectionResourceTypeSelect.options.length > 0) {
      selectionResourceTypeSelect.value = selectedResourceType.id;
    }
  }

  if (selectedObjectType) {
    if (objectTypeSelect.options.length > 0) {
      objectTypeSelect.value = selectedObjectType.id;
    }
    if (selectionObjectTypeSelect.options.length > 0) {
      selectionObjectTypeSelect.value = selectedObjectType.id;
    }
  }
}

async function loadTileTypesIfAvailable(): Promise<void> {
  try {
    const response = await fetch(TILE_TYPES_URL, { cache: 'no-store' });
    if (!response.ok) {
      appendDebugLog('tile-types', `Failed to fetch tileTypes.json (${response.status}); using defaults.`);
      refreshTileTypeSelectOptions();
      return;
    }

    const parsed = normalizeTileTypes(await response.json());
    if (!parsed.length) {
      appendDebugLog('tile-types', 'tileTypes.json was empty or invalid; using defaults.');
      refreshTileTypeSelectOptions();
      return;
    }

    const signature = JSON.stringify(parsed);
    if (signature === tileTypesSyncSignature) {
      return;
    }

    state.tileTypes = parsed;
    tileTypesSyncSignature = signature;
    appendDebugLog('tile-types', `Loaded tile types: ${state.tileTypes.length}`);
    refreshTileTypeSelectOptions();
    drawGrid();
    updateStatus();
  } catch (error) {
    appendDebugLog('tile-types', `Exception: ${error instanceof Error ? error.message : String(error)}`);
    refreshTileTypeSelectOptions();
  }
}

async function loadWorldObjectTypesIfAvailable(): Promise<void> {
  try {
    const response = await fetch(WORLD_OBJECT_TYPES_URL, { cache: 'no-store' });
    if (!response.ok) {
      appendDebugLog('world-object-types', `Failed to fetch worldObjectTypes.json (${response.status}); using defaults.`);
      refreshWorldObjectTypeSelectOptions();
      return;
    }

    const parsed = normalizeWorldObjectTypes(await response.json());
    if (!parsed.length) {
      appendDebugLog('world-object-types', 'worldObjectTypes.json was empty or invalid; using defaults.');
      refreshWorldObjectTypeSelectOptions();
      return;
    }

    const signature = JSON.stringify(parsed);
    if (signature === worldObjectTypesSyncSignature) {
      return;
    }

    state.worldObjectTypes = parsed;
    worldObjectTypesSyncSignature = signature;
    appendDebugLog(
      'world-object-types',
      `Loaded world object types: ${parsed.length}`,
    );
    refreshWorldObjectTypeSelectOptions();
    updateStatus();
  } catch (error) {
    appendDebugLog('world-object-types', `Exception: ${error instanceof Error ? error.message : String(error)}`);
    refreshWorldObjectTypeSelectOptions();
  }
}

function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) {
    return SIDEBAR_MIN_WIDTH;
  }

  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)));
}

function applySidebarWidth(width: number): void {
  const clamped = clampSidebarWidth(width);
  appElement.style.setProperty('--sidebar-width', `${clamped}px`);
}

function loadSavedSidebarWidth(): void {
  try {
    const saved = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    if (!saved) {
      applySidebarWidth(sidebarElement.getBoundingClientRect().width || 320);
      return;
    }

    const parsedWidth = Number(saved);
    applySidebarWidth(parsedWidth);
  } catch {
    applySidebarWidth(sidebarElement.getBoundingClientRect().width || 320);
  }
}

function saveSidebarWidth(width: number): void {
  try {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(clampSidebarWidth(width)));
  } catch {
    return;
  }
}

context.imageSmoothingEnabled = false;

type EditorBaseIconKind = 'tree' | 'rock' | 'player';

function createBaseEditorIcon(kind: EditorBaseIconKind): HTMLCanvasElement {
  const iconCanvas = document.createElement('canvas');
  iconCanvas.width = 32;
  iconCanvas.height = 32;
  const iconContext = require2DContext(iconCanvas);
  iconContext.imageSmoothingEnabled = false;

  if (kind === 'tree') {
    iconContext.clearRect(0, 0, 32, 32);
    iconContext.fillStyle = '#5e3d22';
    iconContext.fillRect(13, 16, 6, 12);
    iconContext.fillStyle = '#2b7b3d';
    iconContext.fillRect(6, 6, 20, 12);
    iconContext.fillRect(9, 2, 14, 8);
    return iconCanvas;
  }

  if (kind === 'rock') {
    iconContext.clearRect(0, 0, 32, 32);
    iconContext.fillStyle = '#777f8e';
    iconContext.fillRect(7, 13, 18, 12);
    iconContext.fillStyle = '#9aa3b2';
    iconContext.fillRect(10, 10, 12, 5);
    return iconCanvas;
  }

  iconContext.clearRect(0, 0, 32, 32);
  iconContext.fillStyle = '#2d3647';
  iconContext.fillRect(9, 6, 14, 22);
  iconContext.fillStyle = '#f0d1a5';
  iconContext.fillRect(10, 3, 12, 8);
  iconContext.fillStyle = '#5a77d4';
  iconContext.fillRect(11, 12, 10, 9);
  iconContext.fillStyle = '#1f2836';
  iconContext.fillRect(9, 22, 5, 6);
  iconContext.fillRect(18, 22, 5, 6);
  return iconCanvas;
}

function createTintedEditorIcon(baseIcon: HTMLCanvasElement, tintColor: string): HTMLCanvasElement {
  const tintedCanvas = document.createElement('canvas');
  tintedCanvas.width = baseIcon.width;
  tintedCanvas.height = baseIcon.height;
  const tintedContext = require2DContext(tintedCanvas);
  tintedContext.imageSmoothingEnabled = false;
  tintedContext.drawImage(baseIcon, 0, 0);
  tintedContext.globalCompositeOperation = 'source-atop';
  tintedContext.fillStyle = tintColor;
  tintedContext.fillRect(0, 0, tintedCanvas.width, tintedCanvas.height);
  tintedContext.globalCompositeOperation = 'source-over';
  return tintedCanvas;
}

const editorBaseIcons = {
  tree: createBaseEditorIcon('tree'),
  rock: createBaseEditorIcon('rock'),
  player: createBaseEditorIcon('player'),
} as const;

const editorTintedIconCache = new Map<string, HTMLCanvasElement>();

function getTintedEditorIcon(baseKind: EditorBaseIconKind, tintColor: string): HTMLCanvasElement {
  const cacheKey = `${baseKind}:${tintColor}`;
  const cached = editorTintedIconCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const icon = createTintedEditorIcon(editorBaseIcons[baseKind], tintColor);
  editorTintedIconCache.set(cacheKey, icon);
  return icon;
}

function drawEditorEntityIcon(
  drawingContext: CanvasRenderingContext2D,
  icon: CanvasImageSource,
  centerX: number,
  centerY: number,
  tileSize: number,
): void {
  const iconSize = Math.max(10, tileSize * 0.82);
  const iconX = centerX - iconSize * 0.5;
  const iconY = centerY - iconSize * 0.5;
  drawingContext.drawImage(icon, iconX, iconY, iconSize, iconSize);
}

function getResourceIcon(resourceId: string): HTMLCanvasElement {
  const resourceIconPalette: Record<string, { base: EditorBaseIconKind; tint: string }> = {
    birch_tree: { base: 'tree', tint: '#9ed37c' },
    oak_tree: { base: 'tree', tint: '#4a8f3a' },
    copper_rock: { base: 'rock', tint: '#c9834f' },
    tin_rock: { base: 'rock', tint: '#a8b7c7' },
    iron_rock: { base: 'rock', tint: '#7f8c98' },
  };

  const mapping = resourceIconPalette[resourceId] ?? { base: 'rock', tint: '#9b9b9b' };
  return getTintedEditorIcon(mapping.base, mapping.tint);
}

function getObjectIcon(objectTypeId: string): HTMLCanvasElement {
  if (objectTypeId === 'signpost') {
    return getTintedEditorIcon('tree', '#c9a45d');
  }
  if (objectTypeId === 'fence') {
    return getTintedEditorIcon('rock', '#8e6b45');
  }
  if (objectTypeId === 'bank_building') {
    return getTintedEditorIcon('rock', '#8a8f95');
  }
  if (objectTypeId === 'general_store_building') {
    return getTintedEditorIcon('rock', '#7e6b52');
  }
  if (objectTypeId === 'smelting_station') {
    return getTintedEditorIcon('rock', '#d07f3f');
  }
  if (objectTypeId === 'smithing_station') {
    return getTintedEditorIcon('rock', '#9a9ea8');
  }
  if (objectTypeId === 'fletching_station') {
    return getTintedEditorIcon('tree', '#8d6f47');
  }

  return getTintedEditorIcon('rock', '#9b9b9b');
}

function getNpcIcon(_npcType: string): HTMLCanvasElement {
  return getTintedEditorIcon('player', '#c9a4ff');
}

function getMonsterIcon(): HTMLCanvasElement {
  return getTintedEditorIcon('player', '#ff8a8a');
}

function getChunkKey(chunkX: number, chunkY: number): string {
  return `${chunkX},${chunkY}`;
}

function parseChunkKey(chunkKey: string): { chunkX: number; chunkY: number } {
  const [chunkXRaw, chunkYRaw] = chunkKey.split(',');
  return {
    chunkX: Number(chunkXRaw),
    chunkY: Number(chunkYRaw),
  };
}

function createGreenTerrainData(): number[][] {
  const rows: number[][] = [];
  for (let y = 0; y < MAP_HEIGHT_TILES; y += 1) {
    const row: number[] = [];
    for (let x = 0; x < MAP_WIDTH_TILES; x += 1) {
      row.push(0);
    }
    rows.push(row);
  }
  return rows;
}

function createChunkData(chunkX: number, chunkY: number): EditorChunkData {
  const defaultTerrain = chunkX === 0 && chunkY === 0
    ? generateTerrainData()
    : createGreenTerrainData();

  // Default objects/NPCs for the original chunk
  let objects: ObjectPlacement[] = [];
  let npcs: NpcPlacement[] = [];
  let monsters: MonsterPlacement[] = [];
  let resources: ResourcePlacement[] = [];
  if (chunkX === 0 && chunkY === 0) {
    // Example: Bank building at (40, 36), Bank chest at (41, 36), Shopkeeper at (44, 36), Villager at (38, 38)
    objects = [
      {
        id: 'bank_building-1', objectTypeId: 'bank_building', name: 'Bank building', tileX: 40, tileY: 36, blocksMovement: true, examineText: 'A sturdy building that houses the bank chest.'
      },
      {
        id: 'bank_chest-1', objectTypeId: 'bank_chest', name: 'Bank chest', tileX: 41, tileY: 36, blocksMovement: true, examineText: 'A sturdy chest for secure item storage.'
      },
      {
        id: 'general_store_building-1', objectTypeId: 'general_store_building', name: 'General store building', tileX: 44, tileY: 36, blocksMovement: true, examineText: 'A simple shop building for local traders.'
      },
      {
        id: 'fence-1', objectTypeId: 'fence', name: 'Fence', tileX: 39, tileY: 38, blocksMovement: true, examineText: 'A short wooden fence.'
      },
      {
        id: 'signpost-1', objectTypeId: 'signpost', name: 'Signpost', tileX: 42, tileY: 39, blocksMovement: false, examineText: 'A signpost with room for future directions.'
      },
    ];
    npcs = [
      {
        id: 'npc-shopkeeper-1', type: 'shopkeeper', name: 'Bob', image: '/assets/npcs/shopkeeper.png', tileX: 44, tileY: 36, examineText: 'A friendly general store shopkeeper.', talkText: 'Hello there! Need supplies or want to sell your goods?', questStartIds: []
      },
      {
        id: 'npc-villager-1', type: 'villager', name: 'Villager', image: '/assets/npcs/villager.png', tileX: 38, tileY: 38, examineText: 'A local villager going about their day.', talkText: "Lovely weather for skilling, isn't it?", questStartIds: []
      },
    ];
    monsters = [
      { id: 'goblin-1', minionTypeId: 'goblin', tier: 1, tileX: 46, tileY: 38 },
      { id: 'goblin_brute-1', minionTypeId: 'goblin_brute', tier: 2, tileX: 47, tileY: 37 },
      { id: 'goblin_archer-1', minionTypeId: 'goblin_archer', tier: 1, tileX: 45, tileY: 39 }
    ];
    resources = [
      { id: 'birch_tree-1', nodeType: 'tree', resourceId: 'birch_tree', tileX: 36, tileY: 36, respawnMs: 5000 },
      { id: 'oak_tree-1', nodeType: 'tree', resourceId: 'oak_tree', tileX: 36, tileY: 38, respawnMs: 6500 },
      { id: 'copper_rock-1', nodeType: 'rock', resourceId: 'copper_rock', tileX: 37, tileY: 37, respawnMs: 6500 },
      { id: 'iron_rock-1', nodeType: 'rock', resourceId: 'iron_rock', tileX: 37, tileY: 39, respawnMs: 7500 }
    ];
  }

  const worldObjects = mapLegacyPlacementsToWorldObjects(resources, objects);
  const legacyPlacements = mapWorldObjectsToLegacyPlacements(worldObjects, DEFAULT_WORLD_OBJECT_TYPES);

  return {
    version: WORLD_DATA_VERSION,
    chunkX,
    chunkY,
    width: MAP_WIDTH_TILES,
    height: MAP_HEIGHT_TILES,
    terrain: defaultTerrain,
    worldObjects,
    resources: legacyPlacements.resources,
    monsters,
    objects: legacyPlacements.objects,
    npcs,
  };
}

function ensureChunk(chunkX: number, chunkY: number): EditorChunkData {
  const key = getChunkKey(chunkX, chunkY);
  const existing = state.chunks.get(key);
  if (existing) {
    return existing;
  }

  const created = createChunkData(chunkX, chunkY);
  state.chunks.set(key, created);
  if (!state.histories.has(key)) {
    state.histories.set(key, { undo: [], redo: [] });
  }
  return created;
}

function cloneChunkSnapshot(snapshot: ChunkSnapshot): ChunkSnapshot {
  return {
    terrain: snapshot.terrain.map((row) => [...row]),
    worldObjects: snapshot.worldObjects.map((entry) => ({ ...entry })),
    resources: snapshot.resources.map((entry) => ({ ...entry })),
    monsters: snapshot.monsters.map((entry) => ({ ...entry })),
    objects: snapshot.objects.map((entry) => ({ ...entry })),
    npcs: snapshot.npcs.map((entry) => ({
      ...entry,
      questStartIds: Array.isArray(entry.questStartIds) ? [...entry.questStartIds] : [],
    })),
  };
}

function captureChunkSnapshot(chunk: EditorChunkData): ChunkSnapshot {
  return {
    terrain: chunk.terrain.map((row) => [...row]),
    worldObjects: chunk.worldObjects.map((entry) => ({ ...entry })),
    resources: chunk.resources.map((entry) => ({ ...entry })),
    monsters: chunk.monsters.map((entry) => ({ ...entry })),
    objects: chunk.objects.map((entry) => ({ ...entry })),
    npcs: chunk.npcs.map((entry) => ({
      ...entry,
      questStartIds: Array.isArray(entry.questStartIds) ? [...entry.questStartIds] : [],
    })),
  };
}

function applyChunkSnapshot(chunk: EditorChunkData, snapshot: ChunkSnapshot): void {
  chunk.terrain = snapshot.terrain.map((row) => [...row]);
  chunk.worldObjects = snapshot.worldObjects.map((entry) => ({ ...entry }));
  syncChunkLegacyPlacementsFromWorldObjects(chunk);
  chunk.monsters = snapshot.monsters.map((entry) => ({ ...entry }));
  chunk.npcs = snapshot.npcs.map((entry) => ({
    ...entry,
    questStartIds: Array.isArray(entry.questStartIds) ? [...entry.questStartIds] : [],
  }));
}

function snapshotsEqual(first: ChunkSnapshot, second: ChunkSnapshot): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

function getOrCreateHistory(chunkKey: string): ChunkHistory {
  const existing = state.histories.get(chunkKey);
  if (existing) {
    return existing;
  }

  const created: ChunkHistory = { undo: [], redo: [] };
  state.histories.set(chunkKey, created);
  return created;
}

function commitHistoryFromSnapshot(before: ChunkSnapshot): boolean {
  const after = captureChunkSnapshot(state.data);
  if (snapshotsEqual(before, after)) {
    return false;
  }

  const history = getOrCreateHistory(state.activeChunkKey);
  history.undo.push(cloneChunkSnapshot(before));
  if (history.undo.length > MAX_HISTORY_STEPS) {
    history.undo.shift();
  }
  history.redo = [];
  return true;
}

function undoActiveChunk(): void {
  const history = getOrCreateHistory(state.activeChunkKey);
  const previous = history.undo.pop();
  if (!previous) {
    return;
  }

  history.redo.push(captureChunkSnapshot(state.data));
  applyChunkSnapshot(state.data, previous);
  drawGrid();
  updateStatus();
}

function redoActiveChunk(): void {
  const history = getOrCreateHistory(state.activeChunkKey);
  const next = history.redo.pop();
  if (!next) {
    return;
  }

  history.undo.push(captureChunkSnapshot(state.data));
  applyChunkSnapshot(state.data, next);
  drawGrid();
  updateStatus();
}

function mutateActiveChunk(mutator: () => void): void {
  const before = captureChunkSnapshot(state.data);
  mutator();
  syncChunkLegacyPlacementsFromWorldObjects(state.data);
  const changed = commitHistoryFromSnapshot(before);
  if (changed) {
    addedChunkKeys.add(state.activeChunkKey);
    updateStatus();
  }
}

function switchToChunk(chunkX: number, chunkY: number): void {
  const key = getChunkKey(chunkX, chunkY);
  state.data = ensureChunk(chunkX, chunkY);
  state.activeChunkKey = key;
  state.selectedTile = null;
  chunkXInput.value = String(chunkX);
  chunkYInput.value = String(chunkY);
  drawGrid();
  scheduleVisibleChunkLoading();
  updateStatus();
}

function readIntegerInput(inputElement: HTMLInputElement): number {
  const value = Number(inputElement.value);
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.trunc(value);
}

function updateChunkSummary(): void {
  const history = getOrCreateHistory(state.activeChunkKey);
  chunkSummaryElement.textContent = [
    `Current: (${state.data.chunkX}, ${state.data.chunkY})`,
    `Loaded chunks: ${state.loadedChunkKeys.size}`,
    `Cached chunks: ${state.chunks.size}`,
    `Undo: ${history.undo.length} | Redo: ${history.redo.length}`,
  ].join('\n');
}

function shouldIgnoreHotkeys(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || tagName === 'button';
}

function panViewportByTiles(deltaTilesX: number, deltaTilesY: number): void {
  const stepPixels = state.tilePixelSize * 4;
  editorViewport.scrollBy({
    left: deltaTilesX * stepPixels,
    top: deltaTilesY * stepPixels,
    behavior: 'auto',
  });
}

function clampTileSize(value: number): number {
  return Math.max(8, Math.min(28, Math.floor(value)));
}

function setTilePixelSize(nextTileSize: number, anchor?: { viewportX: number; viewportY: number }): void {
  const clampedSize = clampTileSize(nextTileSize);
  if (clampedSize === state.tilePixelSize) {
    appendDebugLog('zoom-skip', `tileSize unchanged at ${state.tilePixelSize}`);
    return;
  }

  const previousTileSize = state.tilePixelSize;
  const previousOriginTileX = renderOriginChunkX * MAP_WIDTH_TILES;
  const previousOriginTileY = renderOriginChunkY * MAP_HEIGHT_TILES;
  let anchorWorldX = 0;
  let anchorWorldY = 0;
  const hasAnchor = typeof anchor?.viewportX === 'number' && typeof anchor?.viewportY === 'number';

  if (hasAnchor) {
    anchorWorldX = previousOriginTileX + (editorViewport.scrollLeft + anchor!.viewportX) / previousTileSize;
    anchorWorldY = previousOriginTileY + (editorViewport.scrollTop + anchor!.viewportY) / previousTileSize;
  }

  appendDebugLog(
    'zoom-start',
    `from ${previousTileSize} -> ${clampedSize}; hasAnchor=${hasAnchor}; origin=(${previousOriginTileX},${previousOriginTileY}); scroll=(${editorViewport.scrollLeft.toFixed(1)},${editorViewport.scrollTop.toFixed(1)})`,
  );

  state.tilePixelSize = clampedSize;
  tileSizeInput.value = String(clampedSize);
  tileSizeLabel.textContent = `${clampedSize} px`;
  drawGrid();

  if (hasAnchor) {
    const nextOriginTileX = renderOriginChunkX * MAP_WIDTH_TILES;
    const nextOriginTileY = renderOriginChunkY * MAP_HEIGHT_TILES;
    editorViewport.scrollLeft = (anchorWorldX - nextOriginTileX) * clampedSize - anchor!.viewportX;
    editorViewport.scrollTop = (anchorWorldY - nextOriginTileY) * clampedSize - anchor!.viewportY;

    appendDebugLog(
      'zoom-anchor',
      `anchorWorld=(${anchorWorldX.toFixed(3)},${anchorWorldY.toFixed(3)}); nextOrigin=(${nextOriginTileX},${nextOriginTileY}); postScroll=(${editorViewport.scrollLeft.toFixed(1)},${editorViewport.scrollTop.toFixed(1)})`,
    );
  }

  if (hasAnchor) {
    updateLoadedChunksForViewport({
      worldTileX: anchorWorldX,
      worldTileY: anchorWorldY,
      viewportX: anchor!.viewportX,
      viewportY: anchor!.viewportY,
    });
  } else {
    updateLoadedChunksForViewport();
  }

  updateStatus();
}

function getResourceAt(tileX: number, tileY: number, chunk: EditorChunkData = state.data): ResourcePlacement | undefined {
  return chunk.resources.find((entry) => entry.tileX === tileX && entry.tileY === tileY);
}

function getMonsterAt(tileX: number, tileY: number, chunk: EditorChunkData = state.data): MonsterPlacement | undefined {
  return chunk.monsters.find((entry) => entry.tileX === tileX && entry.tileY === tileY);
}

function getObjectAt(tileX: number, tileY: number, chunk: EditorChunkData = state.data): ObjectPlacement | undefined {
  return chunk.objects.find((entry) => entry.tileX === tileX && entry.tileY === tileY);
}

function getNpcAt(tileX: number, tileY: number, chunk: EditorChunkData = state.data): NpcPlacement | undefined {
  return chunk.npcs.find((entry) => entry.tileX === tileX && entry.tileY === tileY);
}

function normalizePositiveInt(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
}

function normalizeText(value: string, fallback = ''): string {
  const trimmed = String(value ?? '').trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function normalizeQuestStartIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) {
    return [];
  }

  const normalized = ids
    .map((entry) => String(entry ?? '').trim())
    .filter((entry) => entry.length > 0);

  return Array.from(new Set(normalized));
}

function getSelectedOptionValues(selectElement: HTMLSelectElement): string[] {
  return Array.from(selectElement.selectedOptions)
    .map((option) => option.value.trim())
    .filter((value) => value.length > 0);
}

function setSelectedOptionValues(selectElement: HTMLSelectElement, selectedValues: string[]): void {
  const selected = new Set(selectedValues.map((value) => value.trim()).filter((value) => value.length > 0));
  for (const option of Array.from(selectElement.options)) {
    option.selected = selected.has(option.value);
  }
}

function isPointInsideQuestZoneRect(worldTileX: number, worldTileY: number, rect: QuestZoneRect): boolean {
  return worldTileX >= rect.x
    && worldTileY >= rect.y
    && worldTileX < rect.x + rect.width
    && worldTileY < rect.y + rect.height;
}

function findQuestZoneAtTile(worldTileX: number, worldTileY: number): { zone: QuestZonePlacement; rect: QuestZoneRect } | null {
  for (const zone of getVisibleQuestZones()) {
    for (const rect of zone.rects) {
      if (isPointInsideQuestZoneRect(worldTileX, worldTileY, rect)) {
        return { zone, rect };
      }
    }
  }

  return null;
}

function getSelectedNpcFormKey(): string | null {
  if (!state.selectedTile) {
    return null;
  }

  const mapped = worldToChunkCoords(state.selectedTile.worldTileX, state.selectedTile.worldTileY);
  return `${mapped.chunkX},${mapped.chunkY}:${mapped.localTileX},${mapped.localTileY}`;
}

function getQuestId(entry: QuestIndexEntry): string {
  return String(entry.id ?? '').trim();
}

function getQuestZoneIdsFromEntry(entry: QuestIndexEntry): string[] {
  const zoneIds = new Set<string>();
  const steps = Array.isArray(entry.steps) ? entry.steps : [];
  for (const step of steps) {
    const objectives = Array.isArray((step as QuestIndexStep)?.objectives)
      ? ((step as QuestIndexStep).objectives as QuestIndexObjective[])
      : [];
    for (const objective of objectives) {
      const zoneId = String(objective?.zoneId ?? '').trim();
      if (zoneId) {
        zoneIds.add(zoneId);
      }
    }
  }

  return Array.from(zoneIds);
}

function buildQuestZoneIdsByQuestId(entries: QuestIndexEntry[]): Map<string, Set<string>> {
  const zoneIdsByQuestId = new Map<string, Set<string>>();
  for (const entry of entries) {
    const questId = getQuestId(entry);
    if (!questId) {
      continue;
    }

    zoneIdsByQuestId.set(questId, new Set(getQuestZoneIdsFromEntry(entry)));
  }

  return zoneIdsByQuestId;
}

function normalizeQuestIndexEntries(parsedIndex: unknown): QuestIndexEntry[] {
  if (!Array.isArray(parsedIndex)) {
    return [];
  }

  const entries: QuestIndexEntry[] = [];
  const seenQuestIds = new Set<string>();
  for (const rawEntry of parsedIndex) {
    if (!rawEntry || typeof rawEntry !== 'object') {
      continue;
    }

    const entry = { ...(rawEntry as QuestIndexEntry) };
    const questId = getQuestId(entry);
    if (!questId || seenQuestIds.has(questId)) {
      continue;
    }

    entry.id = questId;
    seenQuestIds.add(questId);
    entries.push(entry);
  }

  entries.sort((first, second) => getQuestId(first).localeCompare(getQuestId(second)));
  return entries;
}

function refreshQuestIndexDerivedState(): void {
  state.questZoneIdsByQuestId = buildQuestZoneIdsByQuestId(state.questIndexEntries);
}

function refreshQuestOptionControls(): void {
  const previousNpcSelected = new Set(getSelectedOptionValues(selectionNpcQuestStartIdsSelect));
  const previousQuestSelectedId = questEditorSelect.value;
  const questIds = state.questIndexEntries.map((entry) => getQuestId(entry));

  selectionNpcQuestStartIdsSelect.innerHTML = questIds
    .map((questId) => `<option value="${questId}">${questId}</option>`)
    .join('');
  setSelectedOptionValues(selectionNpcQuestStartIdsSelect, Array.from(previousNpcSelected));

  questEditorSelect.innerHTML = questIds
    .map((questId) => `<option value="${questId}">${questId}</option>`)
    .join('');
  if (questIds.includes(previousQuestSelectedId)) {
    questEditorSelect.value = previousQuestSelectedId;
  }
}

function setQuestEditorFormFromEntry(entry: QuestIndexEntry | null): void {
  questEditorDraft = entry ? JSON.parse(JSON.stringify(entry)) as QuestIndexEntry : buildDefaultQuestDefinition('');
  questEditorSelectedStepIndex = 0;
  questEditorSelectedObjectiveIndex = 0;
  renderQuestEditorFromDraft();
}

function buildDefaultQuestDefinition(questId: string): QuestIndexEntry {
  return {
    id: questId,
    title: '',
    summary: '',
    startNpcId: '',
    repeatable: false,
    steps: [
      {
        id: 'step-1',
        description: '',
        completion: 'all',
        objectives: [],
      },
    ],
    rewards: {
      gold: 0,
      items: [],
      xp: [],
      unlockQuestIds: [],
    },
    chain: {
      nextQuestIds: [],
      autoStartNext: false,
    },
  };
}

function parseCsv(value: string): string[] {
  return Array.from(new Set(String(value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)));
}

function getMutableQuestSteps(entry: QuestIndexEntry): Array<Record<string, unknown>> {
  if (!Array.isArray(entry.steps)) {
    entry.steps = [];
  }

  return entry.steps as Array<Record<string, unknown>>;
}

function parseIdQuantityLines(value: string): Array<{ itemId: string; quantity: number }> {
  return String(value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [itemIdRaw, quantityRaw] = line.split(':');
      return {
        itemId: normalizeText(itemIdRaw ?? ''),
        quantity: normalizePositiveInt(Number(quantityRaw), 1),
      };
    })
    .filter((entry) => entry.itemId.length > 0);
}

function formatIdQuantityLines(items: Array<{ itemId?: unknown; quantity?: unknown }>): string {
  return items
    .map((entry) => {
      const itemId = normalizeText(String(entry.itemId ?? ''));
      if (!itemId) {
        return '';
      }
      return `${itemId}:${normalizePositiveInt(Number(entry.quantity), 1)}`;
    })
    .filter((line) => line.length > 0)
    .join('\n');
}

function parseSkillLevelLines(value: string): Array<{ skill: string; level: number }> {
  return String(value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [skillRaw, levelRaw] = line.split(':');
      return {
        skill: normalizeText(skillRaw ?? ''),
        level: normalizePositiveInt(Number(levelRaw), 1),
      };
    })
    .filter((entry) => entry.skill.length > 0);
}

function formatSkillLevelLines(items: Array<{ skill?: unknown; level?: unknown }>): string {
  return items
    .map((entry) => {
      const skill = normalizeText(String(entry.skill ?? ''));
      if (!skill) {
        return '';
      }
      return `${skill}:${normalizePositiveInt(Number(entry.level), 1)}`;
    })
    .filter((line) => line.length > 0)
    .join('\n');
}

function parseSkillAmountLines(value: string): Array<{ skill: string; amount: number }> {
  return String(value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [skillRaw, amountRaw] = line.split(':');
      return {
        skill: normalizeText(skillRaw ?? ''),
        amount: normalizePositiveInt(Number(amountRaw), 1),
      };
    })
    .filter((entry) => entry.skill.length > 0);
}

function formatSkillAmountLines(items: Array<{ skill?: unknown; amount?: unknown }>): string {
  return items
    .map((entry) => {
      const skill = normalizeText(String(entry.skill ?? ''));
      if (!skill) {
        return '';
      }
      return `${skill}:${normalizePositiveInt(Number(entry.amount), 1)}`;
    })
    .filter((line) => line.length > 0)
    .join('\n');
}

function getSelectedStep(): Record<string, unknown> | null {
  const steps = getMutableQuestSteps(questEditorDraft);
  if (steps.length === 0) {
    return null;
  }

  questEditorSelectedStepIndex = Math.max(0, Math.min(steps.length - 1, questEditorSelectedStepIndex));
  return steps[questEditorSelectedStepIndex] ?? null;
}

function getMutableObjectives(step: Record<string, unknown>): Array<Record<string, unknown>> {
  if (!Array.isArray(step.objectives)) {
    step.objectives = [];
  }

  return step.objectives as Array<Record<string, unknown>>;
}

function renderStepList(): void {
  const steps = getMutableQuestSteps(questEditorDraft);
  questStepSelect.innerHTML = steps
    .map((step, index) => {
      const stepId = normalizeText(String(step.id ?? ''), `step-${index + 1}`);
      return `<option value="${index}">${index + 1}. ${stepId}</option>`;
    })
    .join('');

  if (steps.length === 0) {
    questStepSelect.innerHTML = '<option value="0">1. step-1</option>';
  }

  questStepSelect.value = String(Math.max(0, Math.min(Math.max(0, steps.length - 1), questEditorSelectedStepIndex)));
}

function renderObjectiveList(): void {
  const step = getSelectedStep();
  if (!step) {
    questObjectiveSelect.innerHTML = '';
    return;
  }

  const objectives = getMutableObjectives(step);
  questObjectiveSelect.innerHTML = objectives
    .map((objective, index) => {
      const objectiveId = normalizeText(String(objective.id ?? ''), `obj-${index + 1}`);
      const objectiveType = normalizeText(String(objective.type ?? ''), 'objective');
      return `<option value="${index}">${index + 1}. ${objectiveType} (${objectiveId})</option>`;
    })
    .join('');

  if (objectives.length > 0) {
    questEditorSelectedObjectiveIndex = Math.max(0, Math.min(objectives.length - 1, questEditorSelectedObjectiveIndex));
    questObjectiveSelect.value = String(questEditorSelectedObjectiveIndex);
  }
}

function renderStepFields(): void {
  const step = getSelectedStep();
  if (!step) {
    questStepIdInput.value = '';
    questStepDescriptionInput.value = '';
    questStepCompletionSelect.value = 'all';
    return;
  }

  questStepIdInput.value = normalizeText(String(step.id ?? ''), `step-${questEditorSelectedStepIndex + 1}`);
  questStepDescriptionInput.value = String(step.description ?? '');
  questStepCompletionSelect.value = normalizeText(String(step.completion ?? ''), 'all') === 'any' ? 'any' : 'all';
}

function renderObjectiveFields(): void {
  const step = getSelectedStep();
  if (!step) {
    return;
  }

  const objectives = getMutableObjectives(step);
  if (objectives.length === 0) {
    questObjectiveIdInput.value = '';
    questObjectiveTypeSelect.value = 'kill';
    questObjectiveTargetIdInput.value = '';
    questObjectiveItemIdInput.value = '';
    questObjectiveCountInput.value = '1';
    questObjectiveQuantityInput.value = '1';
    questObjectiveZoneIdInput.value = '';
    questObjectiveNpcIdInput.value = '';
    questObjectiveToNpcIdInput.value = '';
    questObjectiveObjectTypeIdInput.value = '';
    questObjectiveObjectIdInput.value = '';
    questObjectiveTileXInput.value = '0';
    questObjectiveTileYInput.value = '0';
    questObjectiveRadiusInput.value = '0';
    return;
  }

  questEditorSelectedObjectiveIndex = Math.max(0, Math.min(objectives.length - 1, questEditorSelectedObjectiveIndex));
  const objective = objectives[questEditorSelectedObjectiveIndex];
  questObjectiveIdInput.value = normalizeText(String(objective.id ?? ''), `obj-${questEditorSelectedObjectiveIndex + 1}`);
  questObjectiveTypeSelect.value = normalizeText(String(objective.type ?? ''), 'kill');
  questObjectiveTargetIdInput.value = String(objective.targetId ?? '');
  questObjectiveItemIdInput.value = String(objective.itemId ?? '');
  questObjectiveCountInput.value = String(Number.isFinite(Number(objective.count)) ? Math.max(0, Math.floor(Number(objective.count))) : 1);
  questObjectiveQuantityInput.value = String(Number.isFinite(Number(objective.quantity)) ? Math.max(0, Math.floor(Number(objective.quantity))) : 1);
  questObjectiveZoneIdInput.value = String(objective.zoneId ?? '');
  questObjectiveNpcIdInput.value = String(objective.npcId ?? '');
  questObjectiveToNpcIdInput.value = String(objective.toNpcId ?? '');
  questObjectiveObjectTypeIdInput.value = String(objective.objectTypeId ?? '');
  questObjectiveObjectIdInput.value = String(objective.objectId ?? '');
  questObjectiveTileXInput.value = String(Number.isFinite(Number(objective.tileX)) ? Math.floor(Number(objective.tileX)) : 0);
  questObjectiveTileYInput.value = String(Number.isFinite(Number(objective.tileY)) ? Math.floor(Number(objective.tileY)) : 0);
  questObjectiveRadiusInput.value = String(Number.isFinite(Number(objective.radius)) ? Math.max(0, Math.floor(Number(objective.radius))) : 0);
}

function renderQuestEditorFromDraft(): void {
  questEditorIdInput.value = getQuestId(questEditorDraft);
  questEditorTitleInput.value = String(questEditorDraft.title ?? '');
  questEditorSummaryInput.value = String(questEditorDraft.summary ?? '');
  questEditorStartNpcIdInput.value = String(questEditorDraft.startNpcId ?? '');
  questEditorCooldownMsInput.value = String(Number.isFinite(Number(questEditorDraft.cooldownMs)) ? Math.max(0, Math.floor(Number(questEditorDraft.cooldownMs))) : 0);
  questEditorRepeatableInput.checked = Boolean(questEditorDraft.repeatable);

  const requirements = questEditorDraft.requirements && typeof questEditorDraft.requirements === 'object' && !Array.isArray(questEditorDraft.requirements)
    ? questEditorDraft.requirements as Record<string, unknown>
    : {};
  questReqQuestIdsInput.value = Array.isArray(requirements.requiredQuestIds) ? (requirements.requiredQuestIds as string[]).join(', ') : '';
  questReqItemsInput.value = formatIdQuantityLines(Array.isArray(requirements.requiredItems) ? requirements.requiredItems as Array<{ itemId?: unknown; quantity?: unknown }> : []);
  questReqSkillsInput.value = formatSkillLevelLines(Array.isArray(requirements.requiredSkillLevels) ? requirements.requiredSkillLevels as Array<{ skill?: unknown; level?: unknown }> : []);

  const rewards = questEditorDraft.rewards && typeof questEditorDraft.rewards === 'object' && !Array.isArray(questEditorDraft.rewards)
    ? questEditorDraft.rewards as Record<string, unknown>
    : {};
  questRewardGoldInput.value = String(Number.isFinite(Number(rewards.gold)) ? Math.max(0, Math.floor(Number(rewards.gold))) : 0);
  questRewardUnlocksInput.value = Array.isArray(rewards.unlockQuestIds) ? (rewards.unlockQuestIds as string[]).join(', ') : '';
  questRewardItemsInput.value = formatIdQuantityLines(Array.isArray(rewards.items) ? rewards.items as Array<{ itemId?: unknown; quantity?: unknown }> : []);
  questRewardXpInput.value = formatSkillAmountLines(Array.isArray(rewards.xp) ? rewards.xp as Array<{ skill?: unknown; amount?: unknown }> : []);

  const chain = questEditorDraft.chain && typeof questEditorDraft.chain === 'object' && !Array.isArray(questEditorDraft.chain)
    ? questEditorDraft.chain as Record<string, unknown>
    : {};
  questChainNextIdsInput.value = Array.isArray(chain.nextQuestIds) ? (chain.nextQuestIds as string[]).join(', ') : '';
  questChainAutoStartInput.checked = Boolean(chain.autoStartNext);

  renderStepList();
  renderStepFields();
  renderObjectiveList();
  renderObjectiveFields();
}

function syncDraftTopLevelFromInputs(): void {
  const questId = normalizeText(questEditorIdInput.value);
  questEditorDraft.id = questId;
  questEditorDraft.title = normalizeText(questEditorTitleInput.value);
  questEditorDraft.summary = normalizeText(questEditorSummaryInput.value);

  const startNpcId = normalizeText(questEditorStartNpcIdInput.value);
  if (startNpcId) {
    questEditorDraft.startNpcId = startNpcId;
  } else {
    delete questEditorDraft.startNpcId;
  }

  const cooldownMs = Number(questEditorCooldownMsInput.value);
  if (Number.isFinite(cooldownMs) && cooldownMs > 0) {
    questEditorDraft.cooldownMs = Math.floor(cooldownMs);
  } else {
    delete questEditorDraft.cooldownMs;
  }
  questEditorDraft.repeatable = Boolean(questEditorRepeatableInput.checked);

  const requirements: Record<string, unknown> = {};
  const requiredQuestIds = parseCsv(questReqQuestIdsInput.value);
  if (requiredQuestIds.length > 0) {
    requirements.requiredQuestIds = requiredQuestIds;
  }
  const requiredItems = parseIdQuantityLines(questReqItemsInput.value);
  if (requiredItems.length > 0) {
    requirements.requiredItems = requiredItems;
  }
  const requiredSkillLevels = parseSkillLevelLines(questReqSkillsInput.value);
  if (requiredSkillLevels.length > 0) {
    requirements.requiredSkillLevels = requiredSkillLevels;
  }
  if (Object.keys(requirements).length > 0) {
    questEditorDraft.requirements = requirements;
  } else {
    delete questEditorDraft.requirements;
  }

  const rewards: Record<string, unknown> = {};
  const gold = Number(questRewardGoldInput.value);
  if (Number.isFinite(gold) && gold > 0) {
    rewards.gold = Math.floor(gold);
  }
  const rewardItems = parseIdQuantityLines(questRewardItemsInput.value);
  if (rewardItems.length > 0) {
    rewards.items = rewardItems;
  }
  const rewardXp = parseSkillAmountLines(questRewardXpInput.value);
  if (rewardXp.length > 0) {
    rewards.xp = rewardXp;
  }
  const unlockQuestIds = parseCsv(questRewardUnlocksInput.value);
  if (unlockQuestIds.length > 0) {
    rewards.unlockQuestIds = unlockQuestIds;
  }
  questEditorDraft.rewards = rewards;

  const chain: Record<string, unknown> = {};
  const nextQuestIds = parseCsv(questChainNextIdsInput.value);
  if (nextQuestIds.length > 0) {
    chain.nextQuestIds = nextQuestIds;
  }
  if (questChainAutoStartInput.checked) {
    chain.autoStartNext = true;
  }
  if (Object.keys(chain).length > 0) {
    questEditorDraft.chain = chain;
  } else {
    delete questEditorDraft.chain;
  }
}

function buildObjectiveTemplate(type: string, sequenceNumber: number): Record<string, unknown> {
  if (type === 'kill') {
    return { id: `obj-${sequenceNumber}`, type: 'kill', targetId: 'goblin', count: 1 };
  }
  if (type === 'gather') {
    return { id: `obj-${sequenceNumber}`, type: 'gather', itemId: 'copper_ore', count: 1 };
  }
  if (type === 'delivery') {
    return { id: `obj-${sequenceNumber}`, type: 'delivery', itemId: 'copper_ore', quantity: 1, toNpcId: '' };
  }
  if (type === 'travel') {
    return { id: `obj-${sequenceNumber}`, type: 'travel', zoneId: '' };
  }
  if (type === 'item_retrieval') {
    return { id: `obj-${sequenceNumber}`, type: 'item_retrieval', itemId: 'copper_ore', quantity: 1 };
  }
  if (type === 'interact_object') {
    return { id: `obj-${sequenceNumber}`, type: 'interact_object', objectTypeId: '', count: 1 };
  }

  return { id: `obj-${sequenceNumber}`, type: 'talk_to_npc', npcId: '' };
}

function refreshZoneEditorOptions(): void {
  const previousSelection = String(zoneEditorSelect.value ?? '').trim();
  const sortedZones = [...state.questZones].sort((first, second) => first.id.localeCompare(second.id));
  zoneEditorSelect.innerHTML = sortedZones
    .map((zone) => `<option value="${zone.id}">${zone.id}</option>`)
    .join('');

  if (previousSelection && sortedZones.some((zone) => zone.id === previousSelection)) {
    zoneEditorSelect.value = previousSelection;
  }
}

function setZoneEditorFormFromZone(zone: QuestZonePlacement | null): void {
  if (!zone) {
    zoneEditorIdInput.value = '';
    zoneEditorNameInput.value = '';
    zoneEditorXInput.value = state.selectedTile ? String(state.selectedTile.worldTileX) : '0';
    zoneEditorYInput.value = state.selectedTile ? String(state.selectedTile.worldTileY) : '0';
    zoneEditorWidthInput.value = '1';
    zoneEditorHeightInput.value = '1';
    return;
  }

  const rect = zone.rects[0] ?? { x: 0, y: 0, width: 1, height: 1 };
  zoneEditorIdInput.value = zone.id;
  zoneEditorNameInput.value = zone.name;
  zoneEditorXInput.value = String(rect.x);
  zoneEditorYInput.value = String(rect.y);
  zoneEditorWidthInput.value = String(rect.width);
  zoneEditorHeightInput.value = String(rect.height);
}

function getQuestZoneIdsForSelectedNpc(): Set<string> {
  if (!state.selectedTile) {
    return new Set<string>();
  }

  const mapped = worldToChunkCoords(state.selectedTile.worldTileX, state.selectedTile.worldTileY);
  const chunk = state.chunks.get(getChunkKey(mapped.chunkX, mapped.chunkY));
  if (!chunk) {
    return new Set<string>();
  }

  const selectedNpc = getNpcAt(mapped.localTileX, mapped.localTileY, chunk);
  if (!selectedNpc || !Array.isArray(selectedNpc.questStartIds) || selectedNpc.questStartIds.length === 0) {
    return new Set<string>();
  }

  const visibleZoneIds = new Set<string>();
  for (const questId of selectedNpc.questStartIds) {
    const zoneIds = state.questZoneIdsByQuestId.get(questId);
    if (!zoneIds) {
      continue;
    }

    for (const zoneId of zoneIds) {
      visibleZoneIds.add(zoneId);
    }
  }

  return visibleZoneIds;
}

function getSelectedQuestIdForPreview(): string | null {
  const selectedQuestId = normalizeText(String(questEditorSelect.value ?? ''));
  return selectedQuestId || null;
}

function getSelectedZoneIdForPreview(): string | null {
  const selectedZoneId = normalizeText(String(zoneEditorSelect.value ?? ''));
  return selectedZoneId || null;
}

function getQuestPreviewContext(): QuestPreviewContext {
  const questId = getSelectedQuestIdForPreview();
  const emptyContext: QuestPreviewContext = {
    questId,
    zoneIds: new Set<string>(),
    giverNpcIds: new Set<string>(),
    targetNpcIds: new Set<string>(),
    targetObjectIds: new Set<string>(),
    targetObjectTypeIds: new Set<string>(),
    targetMonsterTypeIds: new Set<string>(),
    travelTiles: [],
  };

  if (!questId) {
    return emptyContext;
  }

  for (const chunk of state.chunks.values()) {
    for (const npc of chunk.npcs) {
      if (Array.isArray(npc.questStartIds) && npc.questStartIds.includes(questId)) {
        emptyContext.giverNpcIds.add(npc.id);
      }
    }
  }

  const entry = state.questIndexEntries.find((candidate) => getQuestId(candidate) === questId);
  if (!entry) {
    return emptyContext;
  }

  const startNpcId = normalizeText(String(entry.startNpcId ?? ''));
  if (startNpcId) {
    emptyContext.giverNpcIds.add(startNpcId);
  }

  const steps = Array.isArray(entry.steps) ? (entry.steps as QuestIndexStep[]) : [];
  for (const step of steps) {
    const objectives = Array.isArray(step?.objectives) ? (step.objectives as QuestIndexObjective[]) : [];
    for (const objective of objectives) {
      const zoneId = normalizeText(String(objective.zoneId ?? ''));
      if (zoneId) {
        emptyContext.zoneIds.add(zoneId);
      }

      const npcId = normalizeText(String(objective.npcId ?? ''));
      if (npcId) {
        emptyContext.targetNpcIds.add(npcId);
      }

      const toNpcId = normalizeText(String(objective.toNpcId ?? ''));
      if (toNpcId) {
        emptyContext.targetNpcIds.add(toNpcId);
      }

      const objectId = normalizeText(String(objective.objectId ?? ''));
      if (objectId) {
        emptyContext.targetObjectIds.add(objectId);
      }

      const objectTypeId = normalizeText(String(objective.objectTypeId ?? ''));
      if (objectTypeId) {
        emptyContext.targetObjectTypeIds.add(objectTypeId);
      }

      const objectiveType = normalizeText(String(objective.type ?? ''));
      if (objectiveType === 'kill') {
        const targetId = normalizeText(String(objective.targetId ?? ''));
        if (targetId) {
          emptyContext.targetMonsterTypeIds.add(targetId);
        }
      }

      if (objectiveType === 'travel') {
        const travelTileX = Number(objective.tileX);
        const travelTileY = Number(objective.tileY);
        if (Number.isFinite(travelTileX) && Number.isFinite(travelTileY)) {
          emptyContext.travelTiles.push({
            tileX: Math.floor(travelTileX),
            tileY: Math.floor(travelTileY),
          });
        }
      }
    }
  }

  return emptyContext;
}

function getVisibleQuestZones(): QuestZonePlacement[] {
  const visibleZoneIds = getQuestZoneIdsForSelectedNpc();
  const selectedZoneId = getSelectedZoneIdForPreview();
  const questPreview = getQuestPreviewContext();

  for (const zoneId of questPreview.zoneIds) {
    visibleZoneIds.add(zoneId);
  }
  if (selectedZoneId) {
    visibleZoneIds.add(selectedZoneId);
  }

  if (visibleZoneIds.size === 0) {
    return [];
  }

  return state.questZones.filter((zone) => visibleZoneIds.has(zone.id));
}

function getReferencedQuestZoneIds(): Set<string> {
  const referencedZoneIds = new Set<string>();
  for (const zoneIds of state.questZoneIdsByQuestId.values()) {
    for (const zoneId of zoneIds) {
      referencedZoneIds.add(zoneId);
    }
  }

  return referencedZoneIds;
}

function markNpcFormDirty(): void {
  if (!state.selectedTile) {
    return;
  }

  state.npcFormDirty = true;
  state.npcFormSelectionKey = getSelectedNpcFormKey();
}

function applyImportedChunkData(chunk: EditorChunkData): void {
  const targetKey = getChunkKey(chunk.chunkX, chunk.chunkY);
  if (!state.histories.has(targetKey)) {
    state.histories.set(targetKey, { undo: [], redo: [] });
  }

  state.chunks.set(targetKey, chunk);
  addedChunkKeys.add(targetKey);
  state.data = chunk;
  state.activeChunkKey = targetKey;
  state.selectedTile = null;
  chunkXInput.value = String(chunk.chunkX);
  chunkYInput.value = String(chunk.chunkY);
  drawGrid();
  scheduleVisibleChunkLoading();
  updateStatus();
}

function normalizeChunkFromParsed(
  parsed: Partial<EditorChunkData>,
  fallbackChunkX: number,
  fallbackChunkY: number,
): EditorChunkData {
  const parsedChunkX = Number(parsed.chunkX ?? fallbackChunkX);
  const parsedChunkY = Number(parsed.chunkY ?? fallbackChunkY);
  const targetChunkX = Number.isFinite(parsedChunkX) ? Math.trunc(parsedChunkX) : 0;
  const targetChunkY = Number.isFinite(parsedChunkY) ? Math.trunc(parsedChunkY) : 0;

  const isTerrainValid = Array.isArray(parsed.terrain)
    && parsed.terrain.length === MAP_HEIGHT_TILES
    && parsed.terrain.every((row) => Array.isArray(row) && row.length === MAP_WIDTH_TILES);

  if (!isTerrainValid) {
    throw new Error('Invalid terrain dimensions. Expected 80x80.');
  }

  const rawWorldObjects = (parsed as Partial<EditorChunkData>).worldObjects;
  if (!Array.isArray(rawWorldObjects)) {
    throw new Error('Invalid chunk worldObjects. Legacy resources/objects chunk format is not supported.');
  }

  const worldObjects = (rawWorldObjects as unknown[])
      .map((entry, index) => normalizeWorldObjectPlacement(entry, index))
      .filter((entry): entry is WorldObjectPlacement => entry !== null)

  const rawNpcs = Array.isArray((parsed as Partial<EditorChunkData>).npcs)
    ? ((parsed as Partial<EditorChunkData>).npcs as NpcPlacement[])
    : [];

  for (const npc of rawNpcs) {
    const npcTypeId = normalizeText(npc?.type, 'villager');
    if (npcTypeId !== 'bank_chest') {
      continue;
    }

    const tileX = Math.max(0, Math.min(MAP_WIDTH_TILES - 1, Math.floor(Number(npc?.tileX ?? 0))));
    const tileY = Math.max(0, Math.min(MAP_HEIGHT_TILES - 1, Math.floor(Number(npc?.tileY ?? 0))));
    worldObjects.push({
      id: normalizeText(npc?.id, `bank-chest-${targetChunkX}-${targetChunkY}-${tileX}-${tileY}`).replace(/^npc-/, ''),
      objectTypeId: 'bank_chest',
      tileX,
      tileY,
      name: normalizeText(npc?.name, 'Bank chest'),
      blocksMovement: true,
      examineText: normalizeText(npc?.examineText, 'A sturdy chest for secure item storage.'),
    });
  }

  const legacyPlacements = mapWorldObjectsToLegacyPlacements(worldObjects, state.worldObjectTypes);

  return {
    version: Number(parsed.version ?? WORLD_DATA_VERSION),
    chunkX: targetChunkX,
    chunkY: targetChunkY,
    width: MAP_WIDTH_TILES,
    height: MAP_HEIGHT_TILES,
    terrain: parsed.terrain as number[][],
    worldObjects,
    resources: legacyPlacements.resources,
    monsters: Array.isArray(parsed.monsters) ? parsed.monsters as MonsterPlacement[] : [],
    objects: legacyPlacements.objects,
    npcs: rawNpcs
      .filter((npc) => normalizeText(npc?.type, 'villager') !== 'bank_chest')
      .map((npc, index) => {
        const npcTypeId = normalizeText(npc?.type, 'villager');
        const npcType = NPC_TYPES.find((entry) => entry.id === npcTypeId);
        return {
          id: normalizeText(npc?.id, `npc-${targetChunkX}-${targetChunkY}-${index + 1}`),
          type: npcTypeId,
          name: normalizeText(npc?.name, `NPC ${index + 1}`),
          image: normalizeText(String(npc?.image ?? ''), npcType?.image ?? ''),
          tileX: Math.max(0, Math.min(MAP_WIDTH_TILES - 1, Math.floor(Number(npc?.tileX ?? 0)))),
          tileY: Math.max(0, Math.min(MAP_HEIGHT_TILES - 1, Math.floor(Number(npc?.tileY ?? 0)))),
          examineText: normalizeText(npc?.examineText, 'A local villager.'),
          talkText: normalizeText(npc?.talkText, 'Hello there.'),
          questStartIds: normalizeQuestStartIds(npc?.questStartIds),
        };
      }),
  };
}

function normalizeQuestZonesFromParsed(parsedZones: unknown): QuestZonePlacement[] {
  if (!Array.isArray(parsedZones)) {
    return [];
  }

  return parsedZones
    .map((zone, index) => {
      const zoneId = normalizeText(String((zone as { id?: string })?.id ?? ''), `zone-${index + 1}`);
      const zoneName = normalizeText(String((zone as { name?: string })?.name ?? ''), zoneId);
      const rectsSource = (zone as { rects?: unknown[] })?.rects;
      const rects = Array.isArray(rectsSource)
        ? rectsSource
          .map((rect) => ({
            x: Math.floor(Number((rect as { x?: number })?.x ?? 0)),
            y: Math.floor(Number((rect as { y?: number })?.y ?? 0)),
            width: normalizePositiveInt(Number((rect as { width?: number })?.width ?? 1), 1),
            height: normalizePositiveInt(Number((rect as { height?: number })?.height ?? 1), 1),
          }))
          .filter((rect) => Number.isFinite(rect.x) && Number.isFinite(rect.y) && rect.width > 0 && rect.height > 0)
        : [];

      if (!zoneId || rects.length === 0) {
        return null;
      }

      return {
        id: zoneId,
        name: zoneName,
        rects,
      };
    })
    .filter((zone): zone is QuestZonePlacement => zone !== null);
}

async function loadCanonicalWorldMapIfAvailable(): Promise<void> {
  try {
    const response = await fetch(CANONICAL_WORLD_MAP_URL, { cache: 'no-store' });
    if (!response.ok) {
      appendDebugLog('map-load', 'Failed to fetch worldMap.json');
      return;
    }

    const parsed = await response.json();
    state.questZones = normalizeQuestZonesFromParsed(parsed?.questZones);
    refreshZoneEditorOptions();
    setZoneEditorFormFromZone(null);
    // If it's a bundle (has .chunks), load all chunks
    if (parsed && Array.isArray(parsed.chunks)) {
      state.chunks.clear();
      state.histories.clear();
      state.loadedChunkKeys.clear();
      addedChunkKeys.clear();
      appendDebugLog('map-load', `Loading bundle with ${parsed.chunks.length} chunks`);
      for (const chunkData of parsed.chunks) {
        const chunk = normalizeChunkFromParsed(chunkData, chunkData.chunkX, chunkData.chunkY);
        applyImportedChunkData(chunk);
      }

      if (state.chunks.size === 0) {
        const defaultChunk = createChunkData(0, 0);
        const defaultKey = getChunkKey(0, 0);
        state.chunks.set(defaultKey, defaultChunk);
        state.histories.set(defaultKey, { undo: [], redo: [] });
        addedChunkKeys.add(defaultKey);
      }

      appendDebugLog('map-load', `Loaded chunk keys: ${Array.from(state.chunks.keys()).join(', ')}`);
      // Switch to chunk 0,0 after loading
      switchToChunk(0, 0);
    } else {
      // Fallback: treat as single chunk
      appendDebugLog('map-load', 'Loading as single chunk');
      const chunk = normalizeChunkFromParsed(parsed, 0, 0);
      applyImportedChunkData(chunk);
    }
  } catch (err) {
    appendDebugLog('map-load', 'Exception: ' + (err instanceof Error ? err.message : String(err)));
    return;
  }
}

async function loadQuestIndexIfAvailable(): Promise<void> {
  try {
    const response = await fetch(QUEST_INDEX_URL, { cache: 'no-store' });
    if (!response.ok) {
      appendDebugLog('quest-index', 'Failed to fetch quests/index.json');
      state.questIndexEntries = [];
      state.questZoneIdsByQuestId = new Map<string, Set<string>>();
      refreshQuestOptionControls();
      setQuestEditorFormFromEntry(null);
      drawGrid();
      updateStatus();
      return;
    }

    const parsed = await response.json();
    state.questIndexEntries = normalizeQuestIndexEntries(parsed);
    refreshQuestIndexDerivedState();
    refreshQuestOptionControls();
    setQuestEditorFormFromEntry(null);
    appendDebugLog('quest-index', `Loaded quest index entries: ${state.questZoneIdsByQuestId.size}`);
    drawGrid();
    updateStatus();
  } catch (err) {
    appendDebugLog('quest-index', 'Exception: ' + (err instanceof Error ? err.message : String(err)));
    state.questIndexEntries = [];
    state.questZoneIdsByQuestId = new Map<string, Set<string>>();
    refreshQuestOptionControls();
    setQuestEditorFormFromEntry(null);
    drawGrid();
    updateStatus();
  }
}

function updateSelectionPanel(): void {
  selectionTerrainRow.style.display = 'none';
  selectionResourceRow.style.display = 'none';
  selectionMonsterRow.style.display = 'none';
  selectionObjectRow.style.display = 'none';
  selectionNpcRow.style.display = 'none';
  selectionZoneRow.style.display = 'none';

  if (!state.selectedTile) {
    selectionSummaryElement.textContent = 'No tile selected.';
    return;
  }

  const { worldTileX, worldTileY } = state.selectedTile;
  const mapped = ensureChunkVisibleByWorldTile(worldTileX, worldTileY);
  const terrainId = mapped.chunk.terrain[mapped.localTileY]?.[mapped.localTileX] ?? 0;
  const terrainLabel = state.tileTypes.find((entry) => entry.id === terrainId)?.label ?? `Tile ${terrainId}`;
  const resource = getResourceAt(mapped.localTileX, mapped.localTileY, mapped.chunk);
  const monster = getMonsterAt(mapped.localTileX, mapped.localTileY, mapped.chunk);
  const object = getObjectAt(mapped.localTileX, mapped.localTileY, mapped.chunk);
  const npc = getNpcAt(mapped.localTileX, mapped.localTileY, mapped.chunk);
  const activeZone = findQuestZoneAtTile(worldTileX, worldTileY);

  selectionSummaryElement.textContent = [
    `Chunk: (${mapped.chunkX}, ${mapped.chunkY})`,
    `Local: (${mapped.localTileX}, ${mapped.localTileY})`,
    `World: (${worldTileX}, ${worldTileY})`,
    `Terrain: ${terrainLabel}`,
    `Resource: ${resource ? resource.resourceId : 'None'}`,
    `Monster: ${monster ? `${monster.minionTypeId} (T${monster.tier})` : 'None'}`,
    `Object: ${object ? object.objectTypeId : 'None'}`,
    `NPC: ${npc ? `${npc.type} (${npc.name})` : 'None'}`,
    `Quest Starts: ${npc?.questStartIds?.length ? npc.questStartIds.join(', ') : 'None'}`,
    `Quest Zone: ${activeZone ? activeZone.zone.id : 'None'}`,
  ].join('\n');

  if (state.layer === 'terrain') {
    selectionTerrainRow.style.display = 'block';
    selectionTerrainTypeSelect.value = String(terrainId);
  } else if (state.layer === 'resources') {
    selectionResourceRow.style.display = 'block';
    if (resource) {
      selectionResourceTypeSelect.value = resource.resourceId;
      state.selectedWorldObjectTypeId = resource.resourceId;
      selectionResourceRespawnInput.value = String(resource.respawnMs);
    } else {
      const selectedType = resolveSelectedWorldObjectTypeForLayer('resources');
      selectionResourceTypeSelect.value = selectedType?.id ?? '';
      const behaviorConfig = (selectedType?.behaviorConfig ?? {}) as Record<string, unknown>;
      const respawnRaw = Number(behaviorConfig.respawnMs ?? 5000);
      selectionResourceRespawnInput.value = String(Number.isFinite(respawnRaw) ? Math.max(250, Math.floor(respawnRaw)) : 5000);
    }
  } else {
    selectionMonsterRow.style.display = 'none';
    selectionObjectRow.style.display = 'none';
    selectionNpcRow.style.display = 'none';
  }

  if (state.layer === 'monsters') {
    selectionMonsterRow.style.display = 'block';
    if (monster) {
      selectionMonsterTypeSelect.value = monster.minionTypeId;
      selectionMonsterTierInput.value = String(monster.tier);
    } else {
      selectionMonsterTypeSelect.value = state.selectedMonsterId;
      selectionMonsterTierInput.value = String(state.selectedMonsterTier);
    }
  } else if (state.layer === 'objects') {
    selectionObjectRow.style.display = 'block';
    selectionObjectTypeSelect.value = object?.objectTypeId ?? (resolveSelectedWorldObjectTypeForLayer('objects')?.id ?? '');
    if (object?.objectTypeId) {
      state.selectedWorldObjectTypeId = object.objectTypeId;
    }
  } else if (state.layer === 'npcs') {
    selectionNpcRow.style.display = 'block';
    const selectionKey = `${mapped.chunkX},${mapped.chunkY}:${mapped.localTileX},${mapped.localTileY}`;
    const shouldHydrateNpcForm = !state.npcFormDirty || state.npcFormSelectionKey !== selectionKey;
    if (shouldHydrateNpcForm) {
      selectionNpcTypeSelect.value = npc?.type ?? state.selectedNpcTypeId;
      selectionNpcNameInput.value = npc?.name ?? '';
      selectionNpcExamineInput.value = npc?.examineText ?? '';
      selectionNpcTalkInput.value = npc?.talkText ?? '';
      setSelectedOptionValues(selectionNpcQuestStartIdsSelect, npc?.questStartIds ?? []);
      state.npcFormSelectionKey = selectionKey;
      state.npcFormDirty = false;
    }
  }

  const selectedNpcZoneIds = getQuestZoneIdsForSelectedNpc();
  const shouldShowZoneRow = state.layer === 'npcs' && !!npc && selectedNpcZoneIds.size > 0;
  selectionZoneRow.style.display = shouldShowZoneRow ? 'block' : 'none';
  if (!shouldShowZoneRow) {
    return;
  }

  if (activeZone) {
    selectionZoneIdInput.value = activeZone.zone.id;
    selectionZoneNameInput.value = activeZone.zone.name;
    selectionZoneXInput.value = String(activeZone.rect.x);
    selectionZoneYInput.value = String(activeZone.rect.y);
    selectionZoneWidthInput.value = String(activeZone.rect.width);
    selectionZoneHeightInput.value = String(activeZone.rect.height);
  } else {
    selectionZoneIdInput.value = '';
    selectionZoneNameInput.value = '';
    selectionZoneXInput.value = String(worldTileX);
    selectionZoneYInput.value = String(worldTileY);
    selectionZoneWidthInput.value = '1';
    selectionZoneHeightInput.value = '1';
  }
}

function getHoverDetails(worldTileX: number, worldTileY: number): string {
  const mapped = ensureChunkVisibleByWorldTile(worldTileX, worldTileY);
  const resource = getResourceAt(mapped.localTileX, mapped.localTileY, mapped.chunk);
  const monster = getMonsterAt(mapped.localTileX, mapped.localTileY, mapped.chunk);
  const object = getObjectAt(mapped.localTileX, mapped.localTileY, mapped.chunk);
  const npc = getNpcAt(mapped.localTileX, mapped.localTileY, mapped.chunk);
  const parts: string[] = [];

  if (resource) {
    parts.push(`Resource: ${resource.resourceId} (${resource.nodeType})`);
  }
  if (monster) {
    parts.push(`Monster: ${monster.minionTypeId} T${monster.tier}`);
  }
  if (object) {
    parts.push(`Object: ${object.objectTypeId}${object.blocksMovement ? ' [blocks]' : ''}`);
  }
  if (npc) {
    parts.push(`NPC: ${npc.name} (${npc.type})`);
  }

  if (parts.length === 0) {
    return 'Hover: Empty tile';
  }

  return `Hover: C(${mapped.chunkX},${mapped.chunkY}) L(${mapped.localTileX},${mapped.localTileY}) | ${parts.join(' | ')}`;
}

function setSelectedTile(tileX: number, tileY: number): void {
  state.selectedTile = {
    worldTileX: tileX,
    worldTileY: tileY,
  };
  state.npcFormDirty = false;
  state.npcFormSelectionKey = getSelectedNpcFormKey();
  drawGrid();
  updateStatus(tileX, tileY);
}

function updateStatus(
  tileX?: number,
  tileY?: number,
  options: { refreshSelectionPanel?: boolean } = {},
): void {
  const focusedTileText =
    typeof tileX === 'number' && typeof tileY === 'number'
      ? `World: (${tileX}, ${tileY})`
      : 'Tile: -';

  statusElement.textContent = [
    focusedTileText,
    `Chunk: (${state.data.chunkX}, ${state.data.chunkY})`,
    `Tool: ${state.toolMode}`,
    `Layer: ${state.layer}`,
    `Resources: ${state.data.resources.length}`,
    `Monsters: ${state.data.monsters.length}`,
    `Objects: ${state.data.objects.length}`,
    `NPCs: ${state.data.npcs.length}`,
    `Quest Zones: ${state.questZones.length}`,
  ].join('\n');

  hoverSummaryElement.textContent =
    typeof tileX === 'number' && typeof tileY === 'number'
      ? getHoverDetails(tileX, tileY)
      : 'Hover: -';

  updateChunkSummary();
  if (options.refreshSelectionPanel !== false) {
    updateSelectionPanel();
  }
}

function getTileColor(tileId: number): string {
  const entry = state.tileTypes.find((tile) => tile.id === tileId);
  return entry?.color ?? '#222833';
}

function drawTileHighlight(
  drawingContext: CanvasRenderingContext2D,
  pixelX: number,
  pixelY: number,
  tileSize: number,
  strokeStyle: string,
): void {
  drawingContext.save();
  drawingContext.strokeStyle = strokeStyle;
  drawingContext.lineWidth = Math.max(1, Math.floor(tileSize * 0.14));
  drawingContext.strokeRect(
    pixelX + 1,
    pixelY + 1,
    Math.max(1, tileSize - 2),
    Math.max(1, tileSize - 2),
  );
  drawingContext.restore();
}

function drawGrid(): void {
  const tileSize = state.tilePixelSize;
  const questPreview = getQuestPreviewContext();
  const selectedZoneId = getSelectedZoneIdForPreview();
  // Only render chunks that have been added
  const keysToRender = Array.from(addedChunkKeys);
  const chunkEntries = keysToRender.map((key) => {
    const chunk = state.chunks.get(key);
    if (!chunk) return null;
    return { key, chunk, ...parseChunkKey(key) };
  }).filter((entry): entry is { key: string; chunk: EditorChunkData; chunkX: number; chunkY: number } => entry !== null);
  if (chunkEntries.length === 0) {
    const fallback = ensureChunk(0, 0);
    state.activeChunkKey = getChunkKey(0, 0);
    state.data = fallback;
    addedChunkKeys.add(state.activeChunkKey);
    return drawGrid();
  }
  // Always include a 1-chunk border for + buttons and panning
  const minChunkX = Math.min(...chunkEntries.map((entry) => entry.chunkX)) - 1;
  const maxChunkX = Math.max(...chunkEntries.map((entry) => entry.chunkX)) + 1;
  const minChunkY = Math.min(...chunkEntries.map((entry) => entry.chunkY)) - 1;
  const maxChunkY = Math.max(...chunkEntries.map((entry) => entry.chunkY)) + 1;
  renderOriginChunkX = minChunkX;
  renderOriginChunkY = minChunkY;
  const widthInChunks = maxChunkX - minChunkX + 1;
  const heightInChunks = maxChunkY - minChunkY + 1;
  const width = widthInChunks * MAP_WIDTH_TILES;
  const height = heightInChunks * MAP_HEIGHT_TILES;
  canvas.width = width * tileSize;
  canvas.height = height * tileSize;
  const sharedTileset = getSharedTerrainTilesetImage();
  for (const entry of chunkEntries) {
    const chunkOffsetTileX = (entry.chunkX - minChunkX) * MAP_WIDTH_TILES;
    const chunkOffsetTileY = (entry.chunkY - minChunkY) * MAP_HEIGHT_TILES;
    for (let y = 0; y < MAP_HEIGHT_TILES; y += 1) {
      for (let x = 0; x < MAP_WIDTH_TILES; x += 1) {
        const tileId = entry.chunk.terrain[y]?.[x] ?? 0;
        const pixelX = (chunkOffsetTileX + x) * tileSize;
        const pixelY = (chunkOffsetTileY + y) * tileSize;
        context.fillStyle = getTileColor(tileId);
        context.fillRect(pixelX, pixelY, tileSize, tileSize);

        const tilesetHasFrame = Boolean(
          sharedTileset
          && sharedTileset.complete
          && sharedTileset.naturalWidth >= (tileId + 1) * TILE_SIZE
          && sharedTileset.naturalHeight >= TILE_SIZE,
        );
        if (tilesetHasFrame && sharedTileset) {
          context.drawImage(
            sharedTileset,
            tileId * TILE_SIZE,
            0,
            TILE_SIZE,
            TILE_SIZE,
            pixelX,
            pixelY,
            tileSize,
            tileSize,
          );
          continue;
        }

        const tileImage = getTileImageForTileId(tileId);
        if (tileImage && tileImage.complete && tileImage.naturalWidth > 0) {
          context.drawImage(tileImage, pixelX, pixelY, tileSize, tileSize);
        }
      }
    }
  }
  // Draw + buttons for cardinal directions
  const neighborOffsets = [
    { dx: 0, dy: -1, label: 'N' },
    { dx: 0, dy: 1, label: 'S' },
    { dx: -1, dy: 0, label: 'W' },
    { dx: 1, dy: 0, label: 'E' },
  ];
  // Track where to draw + and for click detection
  (window as any)._plusChunkButtons = [];
  // Track which would-be neighbor chunks already have a + drawn
  const plusDrawn = new Set<string>();
  for (const entry of chunkEntries) {
    for (const { dx, dy } of neighborOffsets) {
      const nx = entry.chunkX + dx;
      const ny = entry.chunkY + dy;
      const nkey = getChunkKey(nx, ny);
      if (addedChunkKeys.has(nkey) || plusDrawn.has(nkey)) continue;
      // Center the + in the would-be neighbor chunk
      const px = (nx - minChunkX) * MAP_WIDTH_TILES * tileSize + (MAP_WIDTH_TILES * tileSize) / 2;
      const py = (ny - minChunkY) * MAP_HEIGHT_TILES * tileSize + (MAP_HEIGHT_TILES * tileSize) / 2;
      context.save();
      context.globalAlpha = 0.85;
      context.fillStyle = '#4f8f4a';
      context.strokeStyle = '#fff';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(px, py, tileSize * 0.8, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.fillStyle = '#fff';
      context.font = `${Math.floor(tileSize * 1.2)}px monospace`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('+', px, py + 1);
      context.restore();
      (window as any)._plusChunkButtons.push({ chunkX: nx, chunkY: ny, px: px - tileSize * 0.8, py: py - tileSize * 0.8, size: tileSize * 1.6 });
      plusDrawn.add(nkey);
    }
  }

  context.strokeStyle = 'rgba(0, 0, 0, 0.15)';
  context.lineWidth = 1;
  for (let x = 0; x <= width; x += 1) {
    context.beginPath();
    context.moveTo(x * tileSize + 0.5, 0);
    context.lineTo(x * tileSize + 0.5, canvas.height);
    context.stroke();
  }
  for (let y = 0; y <= height; y += 1) {
    context.beginPath();
    context.moveTo(0, y * tileSize + 0.5);
    context.lineTo(canvas.width, y * tileSize + 0.5);
    context.stroke();
  }

  for (const entry of chunkEntries) {
    const chunkOffsetTileX = (entry.chunkX - minChunkX) * MAP_WIDTH_TILES;
    const chunkOffsetTileY = (entry.chunkY - minChunkY) * MAP_HEIGHT_TILES;

    for (const resource of entry.chunk.resources) {
      const centerX = (chunkOffsetTileX + resource.tileX) * tileSize + tileSize * 0.5;
      const centerY = (chunkOffsetTileY + resource.tileY) * tileSize + tileSize * 0.5;
      drawEditorEntityIcon(context, getResourceIcon(resource.resourceId), centerX, centerY, tileSize);
    }

    for (const monster of entry.chunk.monsters) {
      const pixelX = (chunkOffsetTileX + monster.tileX) * tileSize;
      const pixelY = (chunkOffsetTileY + monster.tileY) * tileSize;
      const centerX = (chunkOffsetTileX + monster.tileX) * tileSize + tileSize * 0.5;
      const centerY = (chunkOffsetTileY + monster.tileY) * tileSize + tileSize * 0.5;
      drawEditorEntityIcon(context, getMonsterIcon(), centerX, centerY, tileSize);
      if (questPreview.targetMonsterTypeIds.has(monster.minionTypeId)) {
        drawTileHighlight(context, pixelX, pixelY, tileSize, 'rgba(255, 130, 130, 0.95)');
      }
    }

    for (const object of entry.chunk.objects) {
      const pixelX = (chunkOffsetTileX + object.tileX) * tileSize;
      const pixelY = (chunkOffsetTileY + object.tileY) * tileSize;
      const centerX = (chunkOffsetTileX + object.tileX) * tileSize + tileSize * 0.5;
      const centerY = (chunkOffsetTileY + object.tileY) * tileSize + tileSize * 0.5;
      drawEditorEntityIcon(context, getObjectIcon(object.objectTypeId), centerX, centerY, tileSize);
      if (questPreview.targetObjectIds.has(object.id) || questPreview.targetObjectTypeIds.has(object.objectTypeId)) {
        drawTileHighlight(context, pixelX, pixelY, tileSize, 'rgba(255, 176, 90, 0.95)');
      }
    }

    for (const npc of entry.chunk.npcs) {
      const pixelX = (chunkOffsetTileX + npc.tileX) * tileSize;
      const pixelY = (chunkOffsetTileY + npc.tileY) * tileSize;
      const centerX = (chunkOffsetTileX + npc.tileX) * tileSize + tileSize * 0.5;
      const centerY = (chunkOffsetTileY + npc.tileY) * tileSize + tileSize * 0.5;
      drawEditorEntityIcon(context, getNpcIcon(npc.type), centerX, centerY, tileSize);

      const isQuestGiver = questPreview.giverNpcIds.has(npc.id);
      const isQuestTarget = questPreview.targetNpcIds.has(npc.id);
      if (isQuestGiver && isQuestTarget) {
        drawTileHighlight(context, pixelX, pixelY, tileSize, 'rgba(177, 120, 255, 0.95)');
      } else if (isQuestGiver) {
        drawTileHighlight(context, pixelX, pixelY, tileSize, 'rgba(95, 187, 255, 0.95)');
      } else if (isQuestTarget) {
        drawTileHighlight(context, pixelX, pixelY, tileSize, 'rgba(255, 166, 105, 0.95)');
      }
    }
  }

  for (const zone of getVisibleQuestZones()) {
    for (const rect of zone.rects) {
      const localTileX = rect.x - (minChunkX * MAP_WIDTH_TILES);
      const localTileY = rect.y - (minChunkY * MAP_HEIGHT_TILES);
      const pixelX = localTileX * tileSize;
      const pixelY = localTileY * tileSize;
      const pixelWidth = rect.width * tileSize;
      const pixelHeight = rect.height * tileSize;

      context.save();
      const isSelectedZone = selectedZoneId === zone.id;
      const isQuestZone = questPreview.zoneIds.has(zone.id);
      if (isSelectedZone) {
        context.fillStyle = 'rgba(97, 208, 255, 0.20)';
        context.strokeStyle = 'rgba(97, 208, 255, 0.98)';
      } else if (isQuestZone) {
        context.fillStyle = 'rgba(177, 120, 255, 0.16)';
        context.strokeStyle = 'rgba(177, 120, 255, 0.95)';
      } else {
        context.fillStyle = 'rgba(255, 197, 71, 0.16)';
        context.strokeStyle = 'rgba(255, 197, 71, 0.95)';
      }
      context.fillRect(pixelX, pixelY, pixelWidth, pixelHeight);
      context.lineWidth = Math.max(1, Math.floor(tileSize * 0.12));
      context.strokeRect(pixelX + 0.5, pixelY + 0.5, Math.max(0, pixelWidth - 1), Math.max(0, pixelHeight - 1));
      context.restore();
    }
  }

  for (const travelTile of questPreview.travelTiles) {
    const localTileX = travelTile.tileX - (minChunkX * MAP_WIDTH_TILES);
    const localTileY = travelTile.tileY - (minChunkY * MAP_HEIGHT_TILES);
    if (localTileX < 0 || localTileY < 0 || localTileX >= width || localTileY >= height) {
      continue;
    }

    const centerX = localTileX * tileSize + tileSize * 0.5;
    const centerY = localTileY * tileSize + tileSize * 0.5;
    context.save();
    context.strokeStyle = 'rgba(255, 240, 140, 0.95)';
    context.lineWidth = Math.max(1, Math.floor(tileSize * 0.14));
    context.beginPath();
    context.moveTo(centerX - tileSize * 0.35, centerY);
    context.lineTo(centerX + tileSize * 0.35, centerY);
    context.stroke();
    context.beginPath();
    context.moveTo(centerX, centerY - tileSize * 0.35);
    context.lineTo(centerX, centerY + tileSize * 0.35);
    context.stroke();
    context.restore();
  }

  context.strokeStyle = 'rgba(220, 55, 55, 0.9)';
  context.lineWidth = Math.max(1, Math.floor(tileSize * 0.14));
  for (let chunkLineX = 0; chunkLineX <= widthInChunks; chunkLineX += 1) {
    const pixelX = chunkLineX * MAP_WIDTH_TILES * tileSize + 0.5;
    context.beginPath();
    context.moveTo(pixelX, 0);
    context.lineTo(pixelX, canvas.height);
    context.stroke();
  }
  for (let chunkLineY = 0; chunkLineY <= heightInChunks; chunkLineY += 1) {
    const pixelY = chunkLineY * MAP_HEIGHT_TILES * tileSize + 0.5;
    context.beginPath();
    context.moveTo(0, pixelY);
    context.lineTo(canvas.width, pixelY);
    context.stroke();
  }

  if (state.selectedTile) {
    const { worldTileX, worldTileY } = state.selectedTile;
    const localTileX = worldTileX - (minChunkX * MAP_WIDTH_TILES);
    const localTileY = worldTileY - (minChunkY * MAP_HEIGHT_TILES);
    if (localTileX >= 0 && localTileY >= 0 && localTileX < width && localTileY < height) {
      context.strokeStyle = '#ffe08a';
      context.lineWidth = Math.max(1, Math.floor(tileSize * 0.12));
      context.strokeRect(
        localTileX * tileSize + 1,
        localTileY * tileSize + 1,
        Math.max(1, tileSize - 2),
        Math.max(1, tileSize - 2),
      );
    }
  }
}

function refreshLayerRows(): void {
  tileRow.style.display = state.layer === 'terrain' ? 'flex' : 'none';
  resourceRow.style.display = state.layer === 'resources' ? 'flex' : 'none';
  monsterRow.style.display = state.layer === 'monsters' ? 'flex' : 'none';
  objectRow.style.display = state.layer === 'objects' ? 'flex' : 'none';
  npcRow.style.display = state.layer === 'npcs' ? 'flex' : 'none';
  tierRow.style.display = state.layer === 'monsters' ? 'flex' : 'none';
}

function worldToChunkCoords(worldTileX: number, worldTileY: number): {
  chunkX: number;
  chunkY: number;
  localTileX: number;
  localTileY: number;
} {
  const chunkX = Math.floor(worldTileX / MAP_WIDTH_TILES);
  const chunkY = Math.floor(worldTileY / MAP_HEIGHT_TILES);
  const localTileX = ((worldTileX % MAP_WIDTH_TILES) + MAP_WIDTH_TILES) % MAP_WIDTH_TILES;
  const localTileY = ((worldTileY % MAP_HEIGHT_TILES) + MAP_HEIGHT_TILES) % MAP_HEIGHT_TILES;

  return {
    chunkX,
    chunkY,
    localTileX,
    localTileY,
  };
}

function ensureChunkVisibleByWorldTile(worldTileX: number, worldTileY: number): {
  chunk: EditorChunkData;
  chunkX: number;
  chunkY: number;
  localTileX: number;
  localTileY: number;
} {
  const mapped = worldToChunkCoords(worldTileX, worldTileY);
  const chunk = ensureChunk(mapped.chunkX, mapped.chunkY);

  if (state.activeChunkKey !== getChunkKey(mapped.chunkX, mapped.chunkY)) {
    state.data = chunk;
    state.activeChunkKey = getChunkKey(mapped.chunkX, mapped.chunkY);
    chunkXInput.value = String(mapped.chunkX);
    chunkYInput.value = String(mapped.chunkY);
  }

  return {
    chunk,
    chunkX: mapped.chunkX,
    chunkY: mapped.chunkY,
    localTileX: mapped.localTileX,
    localTileY: mapped.localTileY,
  };
}

function getTileFromMouse(event: MouseEvent): { worldTileX: number; worldTileY: number } | null {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const tileX = Math.floor(x / state.tilePixelSize) + (renderOriginChunkX * MAP_WIDTH_TILES);
  const tileY = Math.floor(y / state.tilePixelSize) + (renderOriginChunkY * MAP_HEIGHT_TILES);

  if (tileX < -100000 || tileY < -100000 || tileX > 100000 || tileY > 100000) {
    return null;
  }

  return { worldTileX: tileX, worldTileY: tileY };
}

function removeResourceAt(tileX: number, tileY: number): void {
  state.data.worldObjects = state.data.worldObjects.filter((entry) => {
    if (entry.tileX !== tileX || entry.tileY !== tileY) {
      return true;
    }

    const worldObjectType = getWorldObjectTypeById(entry.objectTypeId);
    return worldObjectType?.behavior !== 'harvestable';
  });
  syncChunkLegacyPlacementsFromWorldObjects(state.data);
}

function removeMonsterAt(tileX: number, tileY: number): void {
  state.data.monsters = state.data.monsters.filter(
    (entry) => entry.tileX !== tileX || entry.tileY !== tileY,
  );
}

function removeObjectAt(tileX: number, tileY: number): void {
  state.data.worldObjects = state.data.worldObjects.filter((entry) => {
    if (entry.tileX !== tileX || entry.tileY !== tileY) {
      return true;
    }

    const worldObjectType = getWorldObjectTypeById(entry.objectTypeId);
    const behavior = worldObjectType?.behavior ?? 'decorative';
    return behavior === 'harvestable' || behavior === 'npc';
  });
  syncChunkLegacyPlacementsFromWorldObjects(state.data);
}

function removeNpcAt(tileX: number, tileY: number): void {
  state.data.npcs = state.data.npcs.filter(
    (entry) => entry.tileX !== tileX || entry.tileY !== tileY,
  );
}

function nextResourceId(resourceId: string): string {
  const count = state.data.worldObjects.filter((entry) => {
    const worldObjectType = getWorldObjectTypeById(entry.objectTypeId);
    const behavior = worldObjectType?.behavior ?? 'decorative';
    if (behavior !== 'harvestable') {
      return false;
    }

    const behaviorConfig = (worldObjectType?.behaviorConfig ?? {}) as Record<string, unknown>;
    const entryResourceId = String(entry.resourceId ?? behaviorConfig.resourceId ?? entry.objectTypeId).trim();
    return entryResourceId === resourceId;
  }).length + 1;
  return `${resourceId}-${count}`;
}

function nextMonsterId(monsterId: string): string {
  const count = state.data.monsters.filter((entry) => entry.minionTypeId === monsterId).length + 1;
  return `${monsterId}-${count}`;
}

function nextObjectId(objectTypeId: string): string {
  const count = state.data.worldObjects.filter((entry) => {
    const worldObjectType = getWorldObjectTypeById(entry.objectTypeId);
    const behavior = worldObjectType?.behavior ?? 'decorative';
    if (behavior === 'harvestable' || behavior === 'npc') {
      return false;
    }

    return entry.objectTypeId === objectTypeId;
  }).length + 1;
  return `${objectTypeId}-${count}`;
}

function addResourceWorldObjectAt(tileX: number, tileY: number, selectedType: WorldObjectTypeDefinition, id?: string): void {
  const behaviorConfig = (selectedType.behaviorConfig ?? {}) as Record<string, unknown>;
  const resourceId = String(behaviorConfig.resourceId ?? selectedType.id).trim() || selectedType.id;
  const nodeType: 'tree' | 'rock' = String(behaviorConfig.nodeType ?? '').trim() === 'rock' ? 'rock' : 'tree';
  const respawnRaw = Number(behaviorConfig.respawnMs ?? 5000);
  const respawnMs = Number.isFinite(respawnRaw) ? Math.max(250, Math.floor(respawnRaw)) : 5000;

  state.data.worldObjects.push({
    id: id ?? nextResourceId(resourceId),
    objectTypeId: selectedType.id,
    tileX,
    tileY,
    resourceId,
    nodeType,
    respawnMs,
  });
  syncChunkLegacyPlacementsFromWorldObjects(state.data);
}

function addObjectWorldObjectAt(tileX: number, tileY: number, objectType: WorldObjectTypeDefinition, id?: string): void {
  state.data.worldObjects.push({
    id: id ?? nextObjectId(objectType.id),
    objectTypeId: objectType.id,
    tileX,
    tileY,
    name: objectType.name,
    blocksMovement: objectType.blocksMovement,
    examineText: objectType.examineText,
  });
  syncChunkLegacyPlacementsFromWorldObjects(state.data);
}

function nextNpcId(npcTypeId: string): string {
  const count = state.data.npcs.filter((entry) => entry.type === npcTypeId).length + 1;
  return `npc-${npcTypeId}-${count}`;
}

function placeAt(tileX: number, tileY: number, erase: boolean): void {
  const mapped = ensureChunkVisibleByWorldTile(tileX, tileY);
  const localTileX = mapped.localTileX;
  const localTileY = mapped.localTileY;

  if (state.layer === 'terrain') {
    if (erase) {
      state.data.terrain[localTileY][localTileX] = 0;
    } else {
      state.data.terrain[localTileY][localTileX] = state.selectedTileType;
    }
  } else if (state.layer === 'resources') {
    removeResourceAt(localTileX, localTileY);
    if (!erase) {
      const selectedType = resolveSelectedWorldObjectTypeForLayer('resources');
      if (!selectedType) {
        drawGrid();
        updateStatus(tileX, tileY);
        return;
      }

      addResourceWorldObjectAt(localTileX, localTileY, selectedType);
    }
  } else {
    if (state.layer === 'monsters') {
      removeMonsterAt(localTileX, localTileY);
      if (!erase) {
        state.data.monsters.push({
          id: nextMonsterId(state.selectedMonsterId),
          minionTypeId: state.selectedMonsterId,
          tier: Math.max(1, Math.floor(state.selectedMonsterTier)),
          tileX: localTileX,
          tileY: localTileY,
        });
      }
    } else if (state.layer === 'objects') {
      removeObjectAt(localTileX, localTileY);
      if (!erase) {
        const objectType = resolveSelectedWorldObjectTypeForLayer('objects');
        if (!objectType) {
          drawGrid();
          updateStatus(tileX, tileY);
          return;
        }

        addObjectWorldObjectAt(localTileX, localTileY, objectType);
      }
    } else if (state.layer === 'npcs') {
      removeNpcAt(localTileX, localTileY);
      if (!erase) {
        const npcType = NPC_TYPES.find((entry) => entry.id === state.selectedNpcTypeId) ?? NPC_TYPES[0];
        state.data.npcs.push({
          id: nextNpcId(npcType.id),
          type: npcType.id,
          name: npcType.defaultName,
          image: npcType.image,
          tileX: localTileX,
          tileY: localTileY,
          examineText: npcType.examineText,
          talkText: npcType.talkText,
          questStartIds: [],
        });
      }
    }
  }

  drawGrid();
  updateStatus(tileX, tileY);
}

function scheduleVisibleChunkLoading(): void {
  if (rafChunkLoadRequest !== null) {
    return;
  }

  rafChunkLoadRequest = window.requestAnimationFrame(() => {
    rafChunkLoadRequest = null;
    updateLoadedChunksForViewport();
  });
}

function updateLoadedChunksForViewport(anchor?: {
  worldTileX: number;
  worldTileY: number;
  viewportX: number;
  viewportY: number;
}): void {
  const originTileX = renderOriginChunkX * MAP_WIDTH_TILES;
  const originTileY = renderOriginChunkY * MAP_HEIGHT_TILES;

  const anchorWorldTileX = anchor
    ? anchor.worldTileX
    : originTileX + (editorViewport.scrollLeft / state.tilePixelSize);
  const anchorWorldTileY = anchor
    ? anchor.worldTileY
    : originTileY + (editorViewport.scrollTop / state.tilePixelSize);
  const anchorViewportX = anchor?.viewportX ?? 0;
  const anchorViewportY = anchor?.viewportY ?? 0;

  const leftWorldTile = originTileX + (editorViewport.scrollLeft / state.tilePixelSize);
  const topWorldTile = originTileY + (editorViewport.scrollTop / state.tilePixelSize);
  const rightWorldTile = leftWorldTile + (editorViewport.clientWidth / state.tilePixelSize);
  const bottomWorldTile = topWorldTile + (editorViewport.clientHeight / state.tilePixelSize);

  const visibleMinChunkX = Math.floor(leftWorldTile / MAP_WIDTH_TILES);
  const visibleMaxChunkX = Math.floor((Math.max(leftWorldTile, rightWorldTile - Number.EPSILON)) / MAP_WIDTH_TILES);
  const visibleMinChunkY = Math.floor(topWorldTile / MAP_HEIGHT_TILES);
  const visibleMaxChunkY = Math.floor((Math.max(topWorldTile, bottomWorldTile - Number.EPSILON)) / MAP_HEIGHT_TILES);

  const viewportLeftTileOffset = editorViewport.scrollLeft / state.tilePixelSize;
  const viewportTopTileOffset = editorViewport.scrollTop / state.tilePixelSize;
  const viewportRightTileGap = (canvas.width - editorViewport.clientWidth - editorViewport.scrollLeft) / state.tilePixelSize;
  const viewportBottomTileGap = (canvas.height - editorViewport.clientHeight - editorViewport.scrollTop) / state.tilePixelSize;

  const needsLeftBuffer = viewportLeftTileOffset <= MAP_WIDTH_TILES;
  const needsTopBuffer = viewportTopTileOffset <= MAP_HEIGHT_TILES;
  const needsRightBuffer = viewportRightTileGap <= MAP_WIDTH_TILES;
  const needsBottomBuffer = viewportBottomTileGap <= MAP_HEIGHT_TILES;

  const minChunkX = visibleMinChunkX - (needsLeftBuffer ? 1 : 0);
  const maxChunkX = visibleMaxChunkX + (needsRightBuffer ? 1 : 0);
  const minChunkY = visibleMinChunkY - (needsTopBuffer ? 1 : 0);
  const maxChunkY = visibleMaxChunkY + (needsBottomBuffer ? 1 : 0);

  const nextLoadedKeys = new Set<string>();
  for (let chunkY = minChunkY; chunkY <= maxChunkY; chunkY += 1) {
    for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX += 1) {
      const key = getChunkKey(chunkX, chunkY);
      nextLoadedKeys.add(key);
      if (!state.chunks.has(key)) {
        ensureChunk(chunkX, chunkY);
      }
    }
  }

  let changed = nextLoadedKeys.size !== state.loadedChunkKeys.size;
  if (!changed) {
    for (const key of state.loadedChunkKeys) {
      if (!nextLoadedKeys.has(key)) {
        changed = true;
        break;
      }
    }
  }

  if (!changed) {
    appendDebugLog(
      'chunks-stable',
      `size=${state.loadedChunkKeys.size}; rangeX=${minChunkX}..${maxChunkX}; rangeY=${minChunkY}..${maxChunkY}; worldRect=(${leftWorldTile.toFixed(2)},${topWorldTile.toFixed(2)})-(${rightWorldTile.toFixed(2)},${bottomWorldTile.toFixed(2)})`,
    );
    return;
  }

  const previousSize = state.loadedChunkKeys.size;
  const previousKeys = new Set(state.loadedChunkKeys);

  state.loadedChunkKeys = nextLoadedKeys;

  if (!state.loadedChunkKeys.has(state.activeChunkKey)) {
    const fallbackKey = Array.from(state.loadedChunkKeys)[0] ?? state.activeChunkKey;
    const fallbackChunk = state.chunks.get(fallbackKey);
    if (fallbackChunk) {
      state.activeChunkKey = fallbackKey;
      state.data = fallbackChunk;
    }
  }

  drawGrid();
  const nextOriginTileX = renderOriginChunkX * MAP_WIDTH_TILES;
  const nextOriginTileY = renderOriginChunkY * MAP_HEIGHT_TILES;
  editorViewport.scrollLeft = (anchorWorldTileX - nextOriginTileX) * state.tilePixelSize - anchorViewportX;
  editorViewport.scrollTop = (anchorWorldTileY - nextOriginTileY) * state.tilePixelSize - anchorViewportY;

  let added = 0;
  let removed = 0;
  for (const key of state.loadedChunkKeys) {
    if (!previousKeys.has(key)) {
      added += 1;
    }
  }
  for (const key of previousKeys) {
    if (!state.loadedChunkKeys.has(key)) {
      removed += 1;
    }
  }

  appendDebugLog(
    'chunks-update',
    `size ${previousSize} -> ${state.loadedChunkKeys.size}; +${added}/-${removed}; rangeX=${minChunkX}..${maxChunkX}; rangeY=${minChunkY}..${maxChunkY}; worldRect=(${leftWorldTile.toFixed(2)},${topWorldTile.toFixed(2)})-(${rightWorldTile.toFixed(2)},${bottomWorldTile.toFixed(2)}); postScroll=(${editorViewport.scrollLeft.toFixed(1)},${editorViewport.scrollTop.toFixed(1)})`,
  );

  updateStatus();
}

canvas.addEventListener('mousedown', (event) => {
  // Check for + button click first
  const plusButtons = (window as any)._plusChunkButtons as Array<{ chunkX: number, chunkY: number, px: number, py: number, size: number }>;
  if (plusButtons) {
    const rect = canvas.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    for (const btn of plusButtons) {
      const cx = btn.px + btn.size / 2;
      const cy = btn.py + btn.size / 2;
      const dist = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2);
      if (dist < btn.size / 2) {
        // Add chunk at btn.chunkX, btn.chunkY
        if (!addedChunkKeys.has(getChunkKey(btn.chunkX, btn.chunkY))) {
          const newChunk = ensureChunk(btn.chunkX, btn.chunkY);
          // Overwrite terrain to all grass
          newChunk.terrain = createGreenTerrainData();
          addedChunkKeys.add(getChunkKey(btn.chunkX, btn.chunkY));
          drawGrid();
        }
        return;
      }
    }
  }
  if (event.button === 1) {
    event.preventDefault();
    state.isPainting = false;
    state.pendingStrokeSnapshot = null;
    isMiddleMousePanning = true;
    panStartClientX = event.clientX;
    panStartClientY = event.clientY;
    panStartScrollLeft = editorViewport.scrollLeft;
    panStartScrollTop = editorViewport.scrollTop;
    editorViewport.style.cursor = 'grabbing';
    return;
  }
  const tile = getTileFromMouse(event);
  if (!tile) {
    return;
  }
  if (state.toolMode === 'paint') {
    state.isPainting = true;
    state.pendingStrokeSnapshot = captureChunkSnapshot(state.data);
    placeAt(tile.worldTileX, tile.worldTileY, event.button === 2);
  } else if (state.toolMode === 'select') {
    setSelectedTile(tile.worldTileX, tile.worldTileY);
  }
});

window.addEventListener('mouseup', () => {
  if (isMiddleMousePanning) {
    isMiddleMousePanning = false;
    editorViewport.style.cursor = '';
    scheduleVisibleChunkLoading();
  }

  if (state.isPainting && state.pendingStrokeSnapshot) {
    commitHistoryFromSnapshot(state.pendingStrokeSnapshot);
  }
  state.isPainting = false;
  state.pendingStrokeSnapshot = null;
  updateStatus();
});

window.addEventListener('mousemove', (event) => {
  if (!isMiddleMousePanning) {
    return;
  }

  event.preventDefault();
  const deltaX = event.clientX - panStartClientX;
  const deltaY = event.clientY - panStartClientY;
  editorViewport.scrollLeft = panStartScrollLeft - deltaX;
  editorViewport.scrollTop = panStartScrollTop - deltaY;
});

canvas.addEventListener('mousemove', (event) => {
  if (isMiddleMousePanning) {
    return;
  }

  const tile = getTileFromMouse(event);
  if (!tile) {
    return;
  }

  updateStatus(tile.worldTileX, tile.worldTileY, { refreshSelectionPanel: false });

  if (state.toolMode !== 'paint') {
    return;
  }

  if (!state.isPainting || (event.buttons & 1) === 0 && (event.buttons & 2) === 0) {
    return;
  }

  const erase = (event.buttons & 2) !== 0;
  placeAt(tile.worldTileX, tile.worldTileY, erase);
});

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  appendDebugLog('wheel', `deltaY=${event.deltaY.toFixed(2)}; tileSize=${state.tilePixelSize}`);
  const viewportBounds = editorViewport.getBoundingClientRect();
  const anchor = {
    viewportX: event.clientX - viewportBounds.left,
    viewportY: event.clientY - viewportBounds.top,
  };

  if (event.deltaY < 0) {
    setTilePixelSize(state.tilePixelSize + 1, anchor);
    scheduleVisibleChunkLoading();
    return;
  }

  if (event.deltaY > 0) {
    setTilePixelSize(state.tilePixelSize - 1, anchor);
    scheduleVisibleChunkLoading();
  }
}, { passive: false });

editorViewport.addEventListener('scroll', () => {
  scheduleVisibleChunkLoading();
});

clearDebugLogButton.addEventListener('click', () => {
  debugLogLines.length = 0;
  debugLogElement.textContent = 'Debug log cleared.';
});

connectProjectFolderButton.addEventListener('click', () => {
  void connectProjectFolder();
});

sidebarResizerElement.addEventListener('mousedown', (event) => {
  event.preventDefault();
  isSidebarResizing = true;
  sidebarResizeStartClientX = event.clientX;
  sidebarResizeStartWidth = sidebarElement.getBoundingClientRect().width;
  document.body.classList.add('sidebar-resizing');
});

window.addEventListener('mousemove', (event) => {
  if (!isSidebarResizing) {
    return;
  }

  event.preventDefault();
  const deltaX = event.clientX - sidebarResizeStartClientX;
  const targetWidth = sidebarResizeStartWidth + deltaX;
  applySidebarWidth(targetWidth);
});

window.addEventListener('mouseup', () => {
  if (!isSidebarResizing) {
    return;
  }

  isSidebarResizing = false;
  document.body.classList.remove('sidebar-resizing');
  saveSidebarWidth(sidebarElement.getBoundingClientRect().width);
});

toolModeSelect.addEventListener('change', () => {
  state.toolMode = toolModeSelect.value as ToolMode;
  updateStatus();
});

layerModeSelect.addEventListener('change', () => {
  state.layer = layerModeSelect.value as LayerMode;
  refreshLayerRows();
  updateStatus();
});

tileTypeSelect.addEventListener('change', () => {
  state.selectedTileType = Number(tileTypeSelect.value);
});

resourceTypeSelect.addEventListener('change', () => {
  state.selectedWorldObjectTypeId = resourceTypeSelect.value;
});

monsterTypeSelect.addEventListener('change', () => {
  state.selectedMonsterId = monsterTypeSelect.value;
});

objectTypeSelect.addEventListener('change', () => {
  state.selectedWorldObjectTypeId = objectTypeSelect.value;
});

npcTypeSelect.addEventListener('change', () => {
  state.selectedNpcTypeId = npcTypeSelect.value;
});

selectionNpcTypeSelect.addEventListener('change', markNpcFormDirty);
selectionNpcNameInput.addEventListener('input', markNpcFormDirty);
selectionNpcExamineInput.addEventListener('input', markNpcFormDirty);
selectionNpcTalkInput.addEventListener('input', markNpcFormDirty);
selectionNpcQuestStartIdsSelect.addEventListener('change', markNpcFormDirty);

monsterTierInput.addEventListener('change', () => {
  const value = Number(monsterTierInput.value);
  state.selectedMonsterTier = Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
  monsterTierInput.value = String(state.selectedMonsterTier);
});

tileSizeInput.addEventListener('input', () => {
  setTilePixelSize(Number(tileSizeInput.value));
});

resetDefaultButton.addEventListener('click', () => {
  mutateActiveChunk(() => {
    state.data.terrain = generateTerrainData();
    drawGrid();
  });
});

clearEntitiesButton.addEventListener('click', () => {
  mutateActiveChunk(() => {
    state.data.worldObjects = [];
    state.data.monsters = [];
    syncChunkLegacyPlacementsFromWorldObjects(state.data);
    state.data.npcs = [];
    drawGrid();
  });
});

undoActionButton.addEventListener('click', () => {
  undoActiveChunk();
});

redoActionButton.addEventListener('click', () => {
  redoActiveChunk();
});

loadChunkButton.addEventListener('click', () => {
  const chunkX = readIntegerInput(chunkXInput);
  const chunkY = readIntegerInput(chunkYInput);
  switchToChunk(chunkX, chunkY);
});

selectionTerrainApplyButton.addEventListener('click', () => {
  if (!state.selectedTile) {
    return;
  }

  const tileType = Number(selectionTerrainTypeSelect.value);
  const mapped = ensureChunkVisibleByWorldTile(state.selectedTile.worldTileX, state.selectedTile.worldTileY);
  mutateActiveChunk(() => {
    state.data.terrain[mapped.localTileY][mapped.localTileX] = Number.isFinite(tileType)
      ? Math.floor(tileType)
      : 0;
    drawGrid();
  });
});

selectionResourceUpdateButton.addEventListener('click', () => {
  if (!state.selectedTile) {
    return;
  }

  const mapped = ensureChunkVisibleByWorldTile(state.selectedTile.worldTileX, state.selectedTile.worldTileY);
  const existing = getResourceAt(mapped.localTileX, mapped.localTileY);
  const selectedType = getWorldObjectTypeById(selectionResourceTypeSelect.value)
    ?? resolveSelectedWorldObjectTypeForLayer('resources');
  if (!selectedType) {
    return;
  }

  state.selectedWorldObjectTypeId = selectedType.id;
  const behaviorConfig = (selectedType.behaviorConfig ?? {}) as Record<string, unknown>;
  const resourceId = String(behaviorConfig.resourceId ?? selectedType.id).trim() || selectedType.id;
  const defaultRespawnRaw = Number(behaviorConfig.respawnMs ?? 5000);
  const defaultRespawnMs = Number.isFinite(defaultRespawnRaw) ? Math.max(250, Math.floor(defaultRespawnRaw)) : 5000;
  const respawnMs = normalizePositiveInt(Number(selectionResourceRespawnInput.value), defaultRespawnMs);
  const placementId = existing?.id ?? nextResourceId(resourceId);

  mutateActiveChunk(() => {
    removeResourceAt(mapped.localTileX, mapped.localTileY);
    addResourceWorldObjectAt(mapped.localTileX, mapped.localTileY, selectedType, placementId);
    const placedWorldObject = state.data.worldObjects.find((entry) => entry.id === placementId);
    if (placedWorldObject) {
      placedWorldObject.respawnMs = respawnMs;
      syncChunkLegacyPlacementsFromWorldObjects(state.data);
    }
    drawGrid();
  });
});

selectionResourceDeleteButton.addEventListener('click', () => {
  if (!state.selectedTile) {
    return;
  }

  const mapped = ensureChunkVisibleByWorldTile(state.selectedTile.worldTileX, state.selectedTile.worldTileY);
  mutateActiveChunk(() => {
    removeResourceAt(mapped.localTileX, mapped.localTileY);
    drawGrid();
  });
});

selectionMonsterUpdateButton.addEventListener('click', () => {
  if (!state.selectedTile) {
    return;
  }

  const mapped = ensureChunkVisibleByWorldTile(state.selectedTile.worldTileX, state.selectedTile.worldTileY);
  const existing = getMonsterAt(mapped.localTileX, mapped.localTileY);
  const minionTypeId = selectionMonsterTypeSelect.value;
  const tier = normalizePositiveInt(Number(selectionMonsterTierInput.value), 1);

  mutateActiveChunk(() => {
    removeMonsterAt(mapped.localTileX, mapped.localTileY);
    state.data.monsters.push({
      id: existing?.id ?? nextMonsterId(minionTypeId),
      minionTypeId,
      tier,
      tileX: mapped.localTileX,
      tileY: mapped.localTileY,
    });
    drawGrid();
  });
});

selectionMonsterDeleteButton.addEventListener('click', () => {
  if (!state.selectedTile) {
    return;
  }

  const mapped = ensureChunkVisibleByWorldTile(state.selectedTile.worldTileX, state.selectedTile.worldTileY);
  mutateActiveChunk(() => {
    removeMonsterAt(mapped.localTileX, mapped.localTileY);
    drawGrid();
  });
});

selectionObjectUpdateButton.addEventListener('click', () => {
  if (!state.selectedTile) {
    return;
  }

  const mapped = ensureChunkVisibleByWorldTile(state.selectedTile.worldTileX, state.selectedTile.worldTileY);
  const existing = getObjectAt(mapped.localTileX, mapped.localTileY);
  const objectType = getWorldObjectTypeById(selectionObjectTypeSelect.value)
    ?? resolveSelectedWorldObjectTypeForLayer('objects');
  if (!objectType) {
    return;
  }

  state.selectedWorldObjectTypeId = objectType.id;

  mutateActiveChunk(() => {
    removeObjectAt(mapped.localTileX, mapped.localTileY);
    addObjectWorldObjectAt(mapped.localTileX, mapped.localTileY, objectType, existing?.id ?? nextObjectId(objectType.id));
    drawGrid();
  });
});

selectionObjectDeleteButton.addEventListener('click', () => {
  if (!state.selectedTile) {
    return;
  }

  const mapped = ensureChunkVisibleByWorldTile(state.selectedTile.worldTileX, state.selectedTile.worldTileY);
  mutateActiveChunk(() => {
    removeObjectAt(mapped.localTileX, mapped.localTileY);
    drawGrid();
  });
});

selectionNpcUpdateButton.addEventListener('click', () => {
  if (!state.selectedTile) {
    return;
  }

  const mapped = ensureChunkVisibleByWorldTile(state.selectedTile.worldTileX, state.selectedTile.worldTileY);
  const existing = getNpcAt(mapped.localTileX, mapped.localTileY);
  const npcType = NPC_TYPES.find((entry) => entry.id === selectionNpcTypeSelect.value) ?? NPC_TYPES[0];
  const existingNpcId = existing?.id ?? nextNpcId(npcType.id);
  const questStartIds = Array.from(new Set(getSelectedOptionValues(selectionNpcQuestStartIdsSelect)));
  const npcName = normalizeText(selectionNpcNameInput.value, npcType.defaultName);
  const npcExamineText = normalizeText(selectionNpcExamineInput.value, npcType.examineText);
  const npcTalkText = normalizeText(selectionNpcTalkInput.value, npcType.talkText);

  mutateActiveChunk(() => {
    removeNpcAt(mapped.localTileX, mapped.localTileY);
    const nextNpcImage = npcType.id === existing?.type
      ? normalizeText(String(existing?.image ?? ''), npcType.image)
      : npcType.image;
    state.data.npcs.push({
      id: existingNpcId,
      type: npcType.id,
      name: npcName,
      image: nextNpcImage,
      tileX: mapped.localTileX,
      tileY: mapped.localTileY,
      examineText: npcExamineText,
      talkText: npcTalkText,
      questStartIds,
    });
    drawGrid();
  });

  state.npcFormDirty = false;
  state.npcFormSelectionKey = getSelectedNpcFormKey();
});

selectionNpcDeleteButton.addEventListener('click', () => {
  if (!state.selectedTile) {
    return;
  }

  const mapped = ensureChunkVisibleByWorldTile(state.selectedTile.worldTileX, state.selectedTile.worldTileY);
  mutateActiveChunk(() => {
    removeNpcAt(mapped.localTileX, mapped.localTileY);
    drawGrid();
  });

  state.npcFormDirty = false;
  state.npcFormSelectionKey = getSelectedNpcFormKey();
});

selectionZoneUpdateButton.addEventListener('click', () => {
  const zoneId = normalizeText(selectionZoneIdInput.value);
  if (!zoneId) {
    return;
  }

  const zoneName = normalizeText(selectionZoneNameInput.value, zoneId);
  const parsedX = Number(selectionZoneXInput.value);
  const parsedY = Number(selectionZoneYInput.value);
  const rect: QuestZoneRect = {
    x: Number.isFinite(parsedX) ? Math.floor(parsedX) : (state.selectedTile?.worldTileX ?? 0),
    y: Number.isFinite(parsedY) ? Math.floor(parsedY) : (state.selectedTile?.worldTileY ?? 0),
    width: normalizePositiveInt(Number(selectionZoneWidthInput.value), 1),
    height: normalizePositiveInt(Number(selectionZoneHeightInput.value), 1),
  };

  const existingIndex = state.questZones.findIndex((zone) => zone.id === zoneId);
  if (existingIndex >= 0) {
    state.questZones[existingIndex] = {
      id: zoneId,
      name: zoneName,
      rects: [rect],
    };
  } else {
    state.questZones.push({
      id: zoneId,
      name: zoneName,
      rects: [rect],
    });
  }

  refreshZoneEditorOptions();

  drawGrid();
  if (state.selectedTile) {
    updateStatus(state.selectedTile.worldTileX, state.selectedTile.worldTileY);
    return;
  }
  updateStatus();
});

selectionZoneDeleteButton.addEventListener('click', () => {
  const zoneId = normalizeText(selectionZoneIdInput.value);
  if (!zoneId) {
    return;
  }

  state.questZones = state.questZones.filter((zone) => zone.id !== zoneId);
  refreshZoneEditorOptions();
  drawGrid();
  if (state.selectedTile) {
    updateStatus(state.selectedTile.worldTileX, state.selectedTile.worldTileY);
    return;
  }
  updateStatus();
});

async function didServerPersistMap(expectedMap: unknown): Promise<boolean> {
  try {
    const response = await fetch(CANONICAL_WORLD_MAP_URL, { cache: 'no-store' });
    if (!response.ok) {
      return false;
    }
    const persistedMap = await response.json();
    return JSON.stringify(persistedMap) === JSON.stringify(expectedMap);
  } catch {
    return false;
  }
}

async function didServerPersistQuestIndex(expectedIndex: unknown): Promise<boolean> {
  try {
    const response = await fetch(QUEST_INDEX_URL, { cache: 'no-store' });
    if (!response.ok) {
      return false;
    }

    const persistedIndex = await response.json();
    return JSON.stringify(persistedIndex) === JSON.stringify(expectedIndex);
  } catch {
    return false;
  }
}

questEditorSelect.addEventListener('change', () => {
  const selectedQuestId = String(questEditorSelect.value ?? '').trim();
  const entry = state.questIndexEntries.find((candidate) => getQuestId(candidate) === selectedQuestId) ?? null;
  setQuestEditorFormFromEntry(entry);
  drawGrid();
  updateStatus();
});

questStepSelect.addEventListener('change', () => {
  questEditorSelectedStepIndex = Math.max(0, Math.floor(Number(questStepSelect.value) || 0));
  questEditorSelectedObjectiveIndex = 0;
  renderStepFields();
  renderObjectiveList();
  renderObjectiveFields();
});

questObjectiveSelect.addEventListener('change', () => {
  questEditorSelectedObjectiveIndex = Math.max(0, Math.floor(Number(questObjectiveSelect.value) || 0));
  renderObjectiveFields();
});

questStepAddButton.addEventListener('click', () => {
  const steps = getMutableQuestSteps(questEditorDraft);
  const nextIndex = steps.length + 1;
  steps.push({ id: `step-${nextIndex}`, description: '', completion: 'all', objectives: [] });
  questEditorSelectedStepIndex = steps.length - 1;
  questEditorSelectedObjectiveIndex = 0;
  renderStepList();
  renderStepFields();
  renderObjectiveList();
  renderObjectiveFields();
});

questStepApplyButton.addEventListener('click', () => {
  const step = getSelectedStep();
  if (!step) {
    return;
  }

  step.id = normalizeText(questStepIdInput.value, `step-${questEditorSelectedStepIndex + 1}`);
  step.description = normalizeText(questStepDescriptionInput.value);
  step.completion = questStepCompletionSelect.value === 'any' ? 'any' : 'all';
  renderStepList();
  renderStepFields();
});

questStepDeleteButton.addEventListener('click', () => {
  const steps = getMutableQuestSteps(questEditorDraft);
  if (steps.length === 0) {
    return;
  }

  steps.splice(questEditorSelectedStepIndex, 1);
  questEditorSelectedStepIndex = Math.max(0, Math.min(steps.length - 1, questEditorSelectedStepIndex));
  questEditorSelectedObjectiveIndex = 0;
  renderStepList();
  renderStepFields();
  renderObjectiveList();
  renderObjectiveFields();
});

questObjectiveAddButton.addEventListener('click', () => {
  const step = getSelectedStep();
  if (!step) {
    return;
  }

  const objectives = getMutableObjectives(step);
  const nextObjective = buildObjectiveTemplate(questObjectiveTypeSelect.value, objectives.length + 1);
  objectives.push(nextObjective);
  questEditorSelectedObjectiveIndex = objectives.length - 1;
  renderObjectiveList();
  renderObjectiveFields();
});

questObjectiveApplyButton.addEventListener('click', () => {
  const step = getSelectedStep();
  if (!step) {
    return;
  }

  const objectives = getMutableObjectives(step);
  if (objectives.length === 0) {
    return;
  }

  questEditorSelectedObjectiveIndex = Math.max(0, Math.min(objectives.length - 1, questEditorSelectedObjectiveIndex));
  const objective = objectives[questEditorSelectedObjectiveIndex];
  objective.id = normalizeText(questObjectiveIdInput.value, `obj-${questEditorSelectedObjectiveIndex + 1}`);
  objective.type = questObjectiveTypeSelect.value;
  objective.targetId = normalizeText(questObjectiveTargetIdInput.value);
  objective.itemId = normalizeText(questObjectiveItemIdInput.value);
  objective.count = normalizePositiveInt(Number(questObjectiveCountInput.value), 1);
  objective.quantity = normalizePositiveInt(Number(questObjectiveQuantityInput.value), 1);
  objective.zoneId = normalizeText(questObjectiveZoneIdInput.value);
  objective.npcId = normalizeText(questObjectiveNpcIdInput.value);
  objective.toNpcId = normalizeText(questObjectiveToNpcIdInput.value);
  objective.objectTypeId = normalizeText(questObjectiveObjectTypeIdInput.value);
  objective.objectId = normalizeText(questObjectiveObjectIdInput.value);
  objective.tileX = Number.isFinite(Number(questObjectiveTileXInput.value)) ? Math.floor(Number(questObjectiveTileXInput.value)) : undefined;
  objective.tileY = Number.isFinite(Number(questObjectiveTileYInput.value)) ? Math.floor(Number(questObjectiveTileYInput.value)) : undefined;
  objective.radius = Number.isFinite(Number(questObjectiveRadiusInput.value)) ? Math.max(0, Math.floor(Number(questObjectiveRadiusInput.value))) : undefined;
  renderObjectiveList();
  renderObjectiveFields();
});

questObjectiveDeleteButton.addEventListener('click', () => {
  const step = getSelectedStep();
  if (!step) {
    return;
  }

  const objectives = getMutableObjectives(step);
  if (objectives.length === 0) {
    return;
  }

  objectives.splice(questEditorSelectedObjectiveIndex, 1);
  questEditorSelectedObjectiveIndex = Math.max(0, Math.min(objectives.length - 1, questEditorSelectedObjectiveIndex));
  renderObjectiveList();
  renderObjectiveFields();
});

questEditorNewButton.addEventListener('click', () => {
  questEditorSelect.value = '';
  setQuestEditorFormFromEntry(null);
  questEditorIdInput.focus();
  drawGrid();
  updateStatus();
});

questEditorUpsertButton.addEventListener('click', () => {
  syncDraftTopLevelFromInputs();

  const activeStep = getSelectedStep();
  if (activeStep) {
    activeStep.id = normalizeText(questStepIdInput.value, `step-${questEditorSelectedStepIndex + 1}`);
    activeStep.description = normalizeText(questStepDescriptionInput.value);
    activeStep.completion = questStepCompletionSelect.value === 'any' ? 'any' : 'all';

    const objectives = getMutableObjectives(activeStep);
    if (objectives.length > 0) {
      questEditorSelectedObjectiveIndex = Math.max(0, Math.min(objectives.length - 1, questEditorSelectedObjectiveIndex));
      const activeObjective = objectives[questEditorSelectedObjectiveIndex];
      activeObjective.id = normalizeText(questObjectiveIdInput.value, `obj-${questEditorSelectedObjectiveIndex + 1}`);
      activeObjective.type = questObjectiveTypeSelect.value;
      activeObjective.targetId = normalizeText(questObjectiveTargetIdInput.value);
      activeObjective.itemId = normalizeText(questObjectiveItemIdInput.value);
      activeObjective.count = normalizePositiveInt(Number(questObjectiveCountInput.value), 1);
      activeObjective.quantity = normalizePositiveInt(Number(questObjectiveQuantityInput.value), 1);
      activeObjective.zoneId = normalizeText(questObjectiveZoneIdInput.value);
      activeObjective.npcId = normalizeText(questObjectiveNpcIdInput.value);
      activeObjective.toNpcId = normalizeText(questObjectiveToNpcIdInput.value);
      activeObjective.objectTypeId = normalizeText(questObjectiveObjectTypeIdInput.value);
      activeObjective.objectId = normalizeText(questObjectiveObjectIdInput.value);
      activeObjective.tileX = Number.isFinite(Number(questObjectiveTileXInput.value)) ? Math.floor(Number(questObjectiveTileXInput.value)) : undefined;
      activeObjective.tileY = Number.isFinite(Number(questObjectiveTileYInput.value)) ? Math.floor(Number(questObjectiveTileYInput.value)) : undefined;
      activeObjective.radius = Number.isFinite(Number(questObjectiveRadiusInput.value)) ? Math.max(0, Math.floor(Number(questObjectiveRadiusInput.value))) : undefined;
    }
  }

  const questId = normalizeText(String(questEditorDraft.id ?? ''));
  if (!questId) {
    window.alert('Quest ID is required.');
    return;
  }

  questEditorDraft.id = questId;
  const existingIndex = state.questIndexEntries.findIndex((entry) => getQuestId(entry) === questId);

  const nextEntry = JSON.parse(JSON.stringify(questEditorDraft)) as QuestIndexEntry;
  if (existingIndex >= 0) {
    state.questIndexEntries[existingIndex] = nextEntry;
  } else {
    state.questIndexEntries.push(nextEntry);
    state.questIndexEntries.sort((first, second) => getQuestId(first).localeCompare(getQuestId(second)));
  }

  refreshQuestIndexDerivedState();
  refreshQuestOptionControls();
  questEditorSelect.value = questId;
  questEditorIdInput.value = questId;
  setQuestEditorFormFromEntry(nextEntry);
  drawGrid();
  updateStatus();
});

questEditorDeleteButton.addEventListener('click', () => {
  const questId = normalizeText(questEditorIdInput.value || questEditorSelect.value);
  if (!questId) {
    return;
  }

  state.questIndexEntries = state.questIndexEntries.filter((entry) => getQuestId(entry) !== questId);
  refreshQuestIndexDerivedState();
  refreshQuestOptionControls();
  setQuestEditorFormFromEntry(null);

  for (const chunk of state.chunks.values()) {
    for (const npc of chunk.npcs) {
      npc.questStartIds = npc.questStartIds.filter((entryId) => entryId !== questId);
    }
  }

  drawGrid();
  updateStatus();
});

questEditorSaveButton.addEventListener('click', async () => {
  const payloadIndex = state.questIndexEntries.map((entry) => ({ ...entry }));
  const payload = JSON.stringify(payloadIndex, null, 2);

  try {
    const response = await fetch(QUEST_INDEX_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });

    if (response.ok && await didServerPersistQuestIndex(payloadIndex)) {
      window.alert('Quests saved to quests/index.json!');
      return;
    }

    const postResponse = await fetch(QUEST_INDEX_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });

    if (postResponse.ok && await didServerPersistQuestIndex(payloadIndex)) {
      window.alert('Quests saved to quests/index.json!');
      return;
    }

    throw new Error('Server did not accept PUT/POST');
  } catch {
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'quest-index.json';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    window.alert(`Could not save directly to server. Downloaded quest-index.json instead. Upload it manually to ${QUEST_INDEX_URL}.`);
  }
});

zoneEditorSelect.addEventListener('change', () => {
  const selectedZoneId = normalizeText(zoneEditorSelect.value);
  const selectedZone = state.questZones.find((zone) => zone.id === selectedZoneId) ?? null;
  setZoneEditorFormFromZone(selectedZone);
  drawGrid();
  updateStatus();
});

zoneEditorNewButton.addEventListener('click', () => {
  zoneEditorSelect.value = '';
  setZoneEditorFormFromZone(null);
  zoneEditorIdInput.focus();
  drawGrid();
  updateStatus();
});

zoneEditorUpsertButton.addEventListener('click', () => {
  const zoneId = normalizeText(zoneEditorIdInput.value);
  if (!zoneId) {
    return;
  }

  const zoneName = normalizeText(zoneEditorNameInput.value, zoneId);
  const parsedX = Number(zoneEditorXInput.value);
  const parsedY = Number(zoneEditorYInput.value);
  const rect: QuestZoneRect = {
    x: Number.isFinite(parsedX) ? Math.floor(parsedX) : (state.selectedTile?.worldTileX ?? 0),
    y: Number.isFinite(parsedY) ? Math.floor(parsedY) : (state.selectedTile?.worldTileY ?? 0),
    width: normalizePositiveInt(Number(zoneEditorWidthInput.value), 1),
    height: normalizePositiveInt(Number(zoneEditorHeightInput.value), 1),
  };

  const existingIndex = state.questZones.findIndex((zone) => zone.id === zoneId);
  const nextZone: QuestZonePlacement = {
    id: zoneId,
    name: zoneName,
    rects: [rect],
  };

  if (existingIndex >= 0) {
    state.questZones[existingIndex] = nextZone;
  } else {
    state.questZones.push(nextZone);
  }

  refreshZoneEditorOptions();
  zoneEditorSelect.value = zoneId;
  setZoneEditorFormFromZone(nextZone);
  drawGrid();
  updateStatus();
});

zoneEditorDeleteButton.addEventListener('click', () => {
  const zoneId = normalizeText(zoneEditorIdInput.value || zoneEditorSelect.value);
  if (!zoneId) {
    return;
  }

  state.questZones = state.questZones.filter((zone) => zone.id !== zoneId);
  refreshZoneEditorOptions();
  setZoneEditorFormFromZone(null);
  drawGrid();
  updateStatus();
});

exportButton.addEventListener('click', async () => {
  const chunkKeysToSave = Array.from(addedChunkKeys)
    .filter((key) => state.chunks.has(key))
    .sort((first, second) => {
      const firstChunk = parseChunkKey(first);
      const secondChunk = parseChunkKey(second);

      if (firstChunk.chunkY !== secondChunk.chunkY) {
        return firstChunk.chunkY - secondChunk.chunkY;
      }

      return firstChunk.chunkX - secondChunk.chunkX;
    });

  const referencedQuestZoneIds = getReferencedQuestZoneIds();

  const payloadMap = {
    version: WORLD_DATA_VERSION,
    chunkWidth: MAP_WIDTH_TILES,
    chunkHeight: MAP_HEIGHT_TILES,
    questZones: state.questZones
      .filter((zone) => referencedQuestZoneIds.has(zone.id))
      .map((zone) => ({
      id: zone.id,
      name: zone.name,
      rects: zone.rects.map((rect) => ({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      })),
      })),
    chunks: chunkKeysToSave.map((key) => {
      const chunk = state.chunks.get(key);
      if (!chunk) return null;

      const chunkWorldObjects = chunk.worldObjects;
      return {
        version: chunk.version,
        chunkX: chunk.chunkX,
        chunkY: chunk.chunkY,
        width: chunk.width,
        height: chunk.height,
        terrain: chunk.terrain.map((row) => [...row]),
        worldObjects: chunkWorldObjects.map((entry) => ({ ...entry })),
        monsters: [...chunk.monsters],
        npcs: chunk.npcs.map((npc) => ({
          ...npc,
          questStartIds: Array.isArray(npc.questStartIds) ? [...npc.questStartIds] : [],
        })),
      };
    }).filter(Boolean),
  };
  const payload = JSON.stringify(payloadMap, null, 2);

  if (supportsFileSystemAccess()) {
    try {
      await writeProjectJsonFile(PROJECT_WORLD_MAP_RELATIVE_PATH, payloadMap);
      updateProjectFolderStatusLabel();
      window.alert(`Map saved to ${PROJECT_WORLD_MAP_RELATIVE_PATH}.`);
      return;
    } catch (error) {
      appendDebugLog('map-save', `Local folder save failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  try {
    const response = await fetch(CANONICAL_WORLD_MAP_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    if (response.ok && await didServerPersistMap(payloadMap)) {
      window.alert('Map saved to worldMap.json!');
      return;
    }

    const postResponse = await fetch(CANONICAL_WORLD_MAP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    if (postResponse.ok && await didServerPersistMap(payloadMap)) {
      window.alert('Map saved to worldMap.json!');
      return;
    }

    throw new Error('Server did not accept PUT/POST');
  } catch {
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'worldMap.json';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    window.alert(`Could not save directly to server. Downloaded worldMap.json instead. Upload it manually to ${CANONICAL_WORLD_MAP_URL}.`);
  }
});



window.addEventListener('keydown', (event) => {
  if (shouldIgnoreHotkeys(event.target)) {
    return;
  }

  const key = event.key.toLowerCase();
  if (!event.ctrlKey && !event.metaKey && !event.altKey) {
    if (key === 'w') {
      event.preventDefault();
      panViewportByTiles(0, -1);
      scheduleVisibleChunkLoading();
      return;
    }

    if (key === 'a') {
      event.preventDefault();
      panViewportByTiles(-1, 0);
      scheduleVisibleChunkLoading();
      return;
    }

    if (key === 's') {
      event.preventDefault();
      panViewportByTiles(0, 1);
      scheduleVisibleChunkLoading();
      return;
    }

    if (key === 'd') {
      event.preventDefault();
      panViewportByTiles(1, 0);
      scheduleVisibleChunkLoading();
      return;
    }
  }

  if (!(event.ctrlKey || event.metaKey)) {
    return;
  }

  if (key === 'z') {
    event.preventDefault();
    if (event.shiftKey) {
      redoActiveChunk();
    } else {
      undoActiveChunk();
    }
    return;
  }

  if (key === 'y') {
    event.preventDefault();
    redoActiveChunk();
  }
});

refreshLayerRows();
refreshWorldObjectTypeSelectOptions();
loadSavedSidebarWidth();
drawGrid();
scheduleVisibleChunkLoading();
updateStatus();
refreshZoneEditorOptions();
setZoneEditorFormFromZone(null);
void loadCanonicalWorldMapIfAvailable();
void loadTileTypesIfAvailable();
void loadWorldObjectTypesIfAvailable();
void loadQuestIndexIfAvailable();

window.addEventListener('focus', () => {
  void loadTileTypesIfAvailable();
  void loadWorldObjectTypesIfAvailable();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    void loadTileTypesIfAvailable();
    void loadWorldObjectTypesIfAvailable();
  }
});

window.setInterval(() => {
  void loadTileTypesIfAvailable();
  void loadWorldObjectTypesIfAvailable();
}, 4000);
