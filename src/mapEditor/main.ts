import '../mapEditor/styles.css';
import { MAP_HEIGHT_TILES, MAP_WIDTH_TILES } from '../game/config/gameConfig';
import { generateTerrainData } from '../game/world/generateTerrainData';

type LayerMode = 'terrain' | 'resources' | 'monsters' | 'objects' | 'npcs';
type ToolMode = 'paint' | 'select';
const WORLD_DATA_VERSION = 1;
const MAX_HISTORY_STEPS = 100;
const CANONICAL_WORLD_MAP_URL = `${import.meta.env.BASE_URL}data/worldMap.json`;
const DEBUG_LOG_MAX_LINES = 160;

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

type NpcPlacement = {
  id: string;
  type: string;
  name: string;
  tileX: number;
  tileY: number;
  examineText: string;
  talkText: string;
  quest: NpcQuestPlacement | null;
};

type NpcQuestPlacement = {
  id: string;
  title: string;
  missionText: string;
  startText: string;
  progressText: string;
  completeText: string;
  objectiveType: 'kill' | 'gather';
  objectiveTargetId: string;
  requiredCount: number;
  rewardGold: number;
  rewardItemId: string;
  rewardItemQuantity: number;
};

type EditorChunkData = {
  version: number;
  chunkX: number;
  chunkY: number;
  width: number;
  height: number;
  terrain: number[][];
  resources: ResourcePlacement[];
  monsters: MonsterPlacement[];
  objects: ObjectPlacement[];
  npcs: NpcPlacement[];
};


type ChunkSnapshot = {
  terrain: number[][];
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

const TILE_TYPES = [
  { id: 0, label: 'Grass', color: '#4f8f4a' },
  { id: 1, label: 'Dirt', color: '#7c6642' },
  { id: 2, label: 'Water', color: '#355f9c' },
  { id: 3, label: 'Sand', color: '#b9a56d' },
] as const;

const RESOURCE_TYPES: Array<{ id: string; label: string; nodeType: 'tree' | 'rock'; respawnMs: number }> = [
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

const OBJECT_TYPES: Array<{ id: string; label: string; name: string; blocksMovement: boolean; examineText: string }> = [
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

const NPC_TYPES: Array<{ id: string; label: string; defaultName: string; examineText: string; talkText: string }> = [
  {
    id: 'shopkeeper',
    label: 'Shopkeeper',
    defaultName: 'Bob',
    examineText: 'A friendly general store shopkeeper.',
    talkText: 'Hello there! Need supplies or want to sell your goods?',
  },
  {
    id: 'bank_chest',
    label: 'Bank Chest',
    defaultName: 'Bank chest',
    examineText: 'A sturdy chest for secure item storage.',
    talkText: 'Your valuables are safe inside.',
  },
  {
    id: 'villager',
    label: 'Villager',
    defaultName: 'Villager',
    examineText: 'A local villager going about their day.',
    talkText: 'Lovely weather for skilling, isn\'t it?',
  },
];

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('Map editor root not found');
}

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
  selectedTileType: number;
  selectedResourceId: string;
  selectedMonsterId: string;
  selectedObjectTypeId: string;
  selectedNpcTypeId: string;
  selectedMonsterTier: number;
  tilePixelSize: number;
  isPainting: boolean;
  pendingStrokeSnapshot: ChunkSnapshot | null;
  selectedTile: SelectedTile | null;
  npcFormDirty: boolean;
  npcFormSelectionKey: string | null;
} = {
  data: createChunkData(0, 0),
  chunks: new Map<string, EditorChunkData>(),
  loadedChunkKeys: new Set<string>(),
  histories: new Map<string, ChunkHistory>(),
  activeChunkKey: getChunkKey(0, 0),
  toolMode: 'paint',
  layer: 'terrain',
  selectedTileType: 0,
  selectedResourceId: RESOURCE_TYPES[0].id,
  selectedMonsterId: MONSTER_TYPES[0].id,
  selectedObjectTypeId: OBJECT_TYPES[0].id,
  selectedNpcTypeId: NPC_TYPES[0].id,
  selectedMonsterTier: 1,
  tilePixelSize: 16,
  isPainting: false,
  pendingStrokeSnapshot: null,
  selectedTile: null,
  npcFormDirty: false,
  npcFormSelectionKey: null,
};

state.chunks.set(state.activeChunkKey, state.data);
state.loadedChunkKeys.add(state.activeChunkKey);
state.histories.set(state.activeChunkKey, { undo: [], redo: [] });

const resourceSelectOptions = RESOURCE_TYPES.map(
  (entry) => `<option value="${entry.id}">${entry.label}</option>`,
).join('');
const monsterSelectOptions = MONSTER_TYPES.map(
  (entry) => `<option value="${entry.id}">${entry.label}</option>`,
).join('');
const objectSelectOptions = OBJECT_TYPES.map(
  (entry) => `<option value="${entry.id}">${entry.label}</option>`,
).join('');
const npcSelectOptions = NPC_TYPES.map(
  (entry) => `<option value="${entry.id}">${entry.label}</option>`,
).join('');
const tileSelectOptions = TILE_TYPES.map(
  (entry) => `<option value="${entry.id}">${entry.label}</option>`,
).join('');

app.innerHTML = `
  <aside class="sidebar">
    <div class="panel">
      <h3>Map Making</h3>
      <div class="note">Editor auto-loads the live game map from ${CANONICAL_WORLD_MAP_URL} when available.</div>
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
          <label for="selectionNpcQuestEnabled">Quest</label>
          <input id="selectionNpcQuestEnabled" type="checkbox" />
        </div>
        <div id="selectionNpcQuestFields" style="display:none;">
          <div class="row">
            <label for="selectionNpcQuestTitle">Quest Title</label>
            <input id="selectionNpcQuestTitle" type="text" maxlength="80" />
          </div>
          <div class="row">
            <label for="selectionNpcQuestMission">Mission</label>
            <textarea id="selectionNpcQuestMission" rows="2" maxlength="220"></textarea>
          </div>
          <div class="row">
            <label for="selectionNpcQuestStart">Quest Start</label>
            <textarea id="selectionNpcQuestStart" rows="2" maxlength="220"></textarea>
          </div>
          <div class="row">
            <label for="selectionNpcQuestProgress">Quest Progress</label>
            <textarea id="selectionNpcQuestProgress" rows="2" maxlength="220"></textarea>
          </div>
          <div class="row">
            <label for="selectionNpcQuestEnd">Quest End</label>
            <textarea id="selectionNpcQuestEnd" rows="2" maxlength="220"></textarea>
          </div>
          <div class="row">
            <label for="selectionNpcQuestObjectiveType">Objective</label>
            <select id="selectionNpcQuestObjectiveType">
              <option value="kill">Kill</option>
              <option value="gather">Gather</option>
            </select>
          </div>
          <div class="row">
            <label for="selectionNpcQuestTarget">Target ID</label>
            <input id="selectionNpcQuestTarget" type="text" maxlength="80" />
          </div>
          <div class="row">
            <label for="selectionNpcQuestCount">Required</label>
            <input id="selectionNpcQuestCount" type="number" min="1" step="1" value="1" />
          </div>
          <div class="row">
            <label for="selectionNpcQuestRewardGold">Reward Gold</label>
            <input id="selectionNpcQuestRewardGold" type="number" min="0" step="1" value="0" />
          </div>
          <div class="row">
            <label for="selectionNpcQuestRewardItem">Reward Item</label>
            <input id="selectionNpcQuestRewardItem" type="text" maxlength="80" />
          </div>
          <div class="row">
            <label for="selectionNpcQuestRewardQty">Reward Qty</label>
            <input id="selectionNpcQuestRewardQty" type="number" min="1" step="1" value="1" />
          </div>
        </div>
        <div class="row row-buttons"><button id="selectionNpcUpdate" class="secondary">Update NPC</button></div>
        <div class="row row-buttons"><button id="selectionNpcDelete" class="secondary">Delete NPC</button></div>
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

  <main class="canvas-wrap">
    <div class="canvas-shell">
      <canvas id="editorCanvas"></canvas>
    </div>
  </main>
`;

const canvas = requireElement<HTMLCanvasElement>('#editorCanvas', 'Editor canvas not found');
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
const selectionNpcQuestEnabledInput = requireElement<HTMLInputElement>('#selectionNpcQuestEnabled', 'Selection npc quest enabled checkbox not found');
const selectionNpcQuestFields = requireElement<HTMLDivElement>('#selectionNpcQuestFields', 'Selection npc quest fields not found');
const selectionNpcQuestTitleInput = requireElement<HTMLInputElement>('#selectionNpcQuestTitle', 'Selection npc quest title not found');
const selectionNpcQuestMissionInput = requireElement<HTMLTextAreaElement>('#selectionNpcQuestMission', 'Selection npc quest mission not found');
const selectionNpcQuestStartInput = requireElement<HTMLTextAreaElement>('#selectionNpcQuestStart', 'Selection npc quest start not found');
const selectionNpcQuestProgressInput = requireElement<HTMLTextAreaElement>('#selectionNpcQuestProgress', 'Selection npc quest progress not found');
const selectionNpcQuestEndInput = requireElement<HTMLTextAreaElement>('#selectionNpcQuestEnd', 'Selection npc quest end not found');
const selectionNpcQuestObjectiveTypeSelect = requireElement<HTMLSelectElement>('#selectionNpcQuestObjectiveType', 'Selection npc quest objective type not found');
const selectionNpcQuestTargetInput = requireElement<HTMLInputElement>('#selectionNpcQuestTarget', 'Selection npc quest target not found');
const selectionNpcQuestCountInput = requireElement<HTMLInputElement>('#selectionNpcQuestCount', 'Selection npc quest required count not found');
const selectionNpcQuestRewardGoldInput = requireElement<HTMLInputElement>('#selectionNpcQuestRewardGold', 'Selection npc quest reward gold not found');
const selectionNpcQuestRewardItemInput = requireElement<HTMLInputElement>('#selectionNpcQuestRewardItem', 'Selection npc quest reward item not found');
const selectionNpcQuestRewardQtyInput = requireElement<HTMLInputElement>('#selectionNpcQuestRewardQty', 'Selection npc quest reward quantity not found');
const selectionNpcUpdateButton = requireElement<HTMLButtonElement>('#selectionNpcUpdate', 'Selection npc update button not found');
const selectionNpcDeleteButton = requireElement<HTMLButtonElement>('#selectionNpcDelete', 'Selection npc delete button not found');
const hoverSummaryElement = requireElement<HTMLDivElement>('#hoverSummary', 'Hover summary not found');
const debugLogElement = requireElement<HTMLDivElement>('#debugLog', 'Debug log element not found');
const clearDebugLogButton = requireElement<HTMLButtonElement>('#clearDebugLog', 'Clear debug log button not found');

let isMiddleMousePanning = false;
let panStartClientX = 0;
let panStartClientY = 0;
let panStartScrollLeft = 0;
let panStartScrollTop = 0;
let renderOriginChunkX = 0;
let renderOriginChunkY = 0;
let rafChunkLoadRequest: number | null = null;

// Track which chunks have been explicitly added (including the original)
const addedChunkKeys = new Set<string>([getChunkKey(0, 0)]);
const debugLogLines: string[] = [];

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

  return getTintedEditorIcon('rock', '#9b9b9b');
}

function getNpcIcon(npcType: string): HTMLCanvasElement {
  if (npcType === 'bank_chest') {
    return getTintedEditorIcon('rock', '#b08b4f');
  }

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
        id: 'npc-shopkeeper-1', type: 'shopkeeper', name: 'Bob', tileX: 44, tileY: 36, examineText: 'A friendly general store shopkeeper.', talkText: 'Hello there! Need supplies or want to sell your goods?', quest: null
      },
      {
        id: 'npc-bank_chest-1', type: 'bank_chest', name: 'Bank chest', tileX: 41, tileY: 36, examineText: 'A sturdy chest for secure item storage.', talkText: 'Your valuables are safe inside.', quest: null
      },
      {
        id: 'npc-villager-1', type: 'villager', name: 'Villager', tileX: 38, tileY: 38, examineText: 'A local villager going about their day.', talkText: "Lovely weather for skilling, isn't it?", quest: null
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

  return {
    version: WORLD_DATA_VERSION,
    chunkX,
    chunkY,
    width: MAP_WIDTH_TILES,
    height: MAP_HEIGHT_TILES,
    terrain: defaultTerrain,
    resources,
    monsters,
    objects,
    npcs,
  };

  return {
    version: WORLD_DATA_VERSION,
    chunkX,
    chunkY,
    width: MAP_WIDTH_TILES,
    height: MAP_HEIGHT_TILES,
    terrain: defaultTerrain,
    resources: [],
    monsters: [],
    objects,
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
    resources: snapshot.resources.map((entry) => ({ ...entry })),
    monsters: snapshot.monsters.map((entry) => ({ ...entry })),
    objects: snapshot.objects.map((entry) => ({ ...entry })),
    npcs: snapshot.npcs.map((entry) => ({ ...entry })),
  };
}

function captureChunkSnapshot(chunk: EditorChunkData): ChunkSnapshot {
  return {
    terrain: chunk.terrain.map((row) => [...row]),
    resources: chunk.resources.map((entry) => ({ ...entry })),
    monsters: chunk.monsters.map((entry) => ({ ...entry })),
    objects: chunk.objects.map((entry) => ({ ...entry })),
    npcs: chunk.npcs.map((entry) => ({ ...entry })),
  };
}

function applyChunkSnapshot(chunk: EditorChunkData, snapshot: ChunkSnapshot): void {
  chunk.terrain = snapshot.terrain.map((row) => [...row]);
  chunk.resources = snapshot.resources.map((entry) => ({ ...entry }));
  chunk.monsters = snapshot.monsters.map((entry) => ({ ...entry }));
  chunk.objects = snapshot.objects.map((entry) => ({ ...entry }));
  chunk.npcs = snapshot.npcs.map((entry) => ({ ...entry }));
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

function normalizeNonNegativeInt(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.floor(value));
}

function normalizeText(value: string, fallback = ''): string {
  const trimmed = String(value ?? '').trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function setNpcQuestFieldsVisible(visible: boolean): void {
  selectionNpcQuestFields.style.display = visible ? 'block' : 'none';
}

function getSelectedNpcFormKey(): string | null {
  if (!state.selectedTile) {
    return null;
  }

  const mapped = worldToChunkCoords(state.selectedTile.worldTileX, state.selectedTile.worldTileY);
  return `${mapped.chunkX},${mapped.chunkY}:${mapped.localTileX},${mapped.localTileY}`;
}

function markNpcFormDirty(): void {
  if (!state.selectedTile) {
    return;
  }

  state.npcFormDirty = true;
  state.npcFormSelectionKey = getSelectedNpcFormKey();
}

function populateNpcQuestInputs(quest: NpcQuestPlacement | null): void {
  const hasQuest = Boolean(quest);
  selectionNpcQuestEnabledInput.checked = hasQuest;
  setNpcQuestFieldsVisible(hasQuest);

  selectionNpcQuestTitleInput.value = quest?.title ?? '';
  selectionNpcQuestMissionInput.value = quest?.missionText ?? '';
  selectionNpcQuestStartInput.value = quest?.startText ?? '';
  selectionNpcQuestProgressInput.value = quest?.progressText ?? '';
  selectionNpcQuestEndInput.value = quest?.completeText ?? '';
  selectionNpcQuestObjectiveTypeSelect.value = quest?.objectiveType ?? 'kill';
  selectionNpcQuestTargetInput.value = quest?.objectiveTargetId ?? '';
  selectionNpcQuestCountInput.value = String(quest?.requiredCount ?? 1);
  selectionNpcQuestRewardGoldInput.value = String(quest?.rewardGold ?? 0);
  selectionNpcQuestRewardItemInput.value = quest?.rewardItemId ?? '';
  selectionNpcQuestRewardQtyInput.value = String(quest?.rewardItemQuantity ?? 1);
}

function buildQuestFromSelectionInputs(fallbackQuestId: string): NpcQuestPlacement | null {
  if (!selectionNpcQuestEnabledInput.checked) {
    return null;
  }

  const title = normalizeText(selectionNpcQuestTitleInput.value);
  const objectiveTargetId = normalizeText(selectionNpcQuestTargetInput.value);
  if (!title || !objectiveTargetId) {
    return null;
  }

  const rewardItemId = normalizeText(selectionNpcQuestRewardItemInput.value);
  return {
    id: normalizeText(fallbackQuestId, `quest-${Date.now()}`),
    title,
    missionText: normalizeText(selectionNpcQuestMissionInput.value, title),
    startText: normalizeText(selectionNpcQuestStartInput.value, `Can you help with ${title}?`),
    progressText: normalizeText(selectionNpcQuestProgressInput.value, 'Keep going, you are making progress.'),
    completeText: normalizeText(selectionNpcQuestEndInput.value, 'Excellent work. Here is your reward.'),
    objectiveType: selectionNpcQuestObjectiveTypeSelect.value === 'gather' ? 'gather' : 'kill',
    objectiveTargetId,
    requiredCount: normalizePositiveInt(Number(selectionNpcQuestCountInput.value), 1),
    rewardGold: normalizeNonNegativeInt(Number(selectionNpcQuestRewardGoldInput.value), 0),
    rewardItemId,
    rewardItemQuantity: normalizePositiveInt(Number(selectionNpcQuestRewardQtyInput.value), 1),
  };
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

  return {
    version: Number(parsed.version ?? WORLD_DATA_VERSION),
    chunkX: targetChunkX,
    chunkY: targetChunkY,
    width: MAP_WIDTH_TILES,
    height: MAP_HEIGHT_TILES,
    terrain: parsed.terrain as number[][],
    resources: Array.isArray(parsed.resources) ? parsed.resources as ResourcePlacement[] : [],
    monsters: Array.isArray(parsed.monsters) ? parsed.monsters as MonsterPlacement[] : [],
    objects: Array.isArray((parsed as Partial<EditorChunkData>).objects)
      ? (parsed as Partial<EditorChunkData>).objects as ObjectPlacement[]
      : [],
    npcs: Array.isArray((parsed as Partial<EditorChunkData>).npcs)
      ? (parsed as Partial<EditorChunkData>).npcs as NpcPlacement[]
      : [],
  };
}

async function loadCanonicalWorldMapIfAvailable(): Promise<void> {
  try {
    const response = await fetch(CANONICAL_WORLD_MAP_URL, { cache: 'no-store' });
    if (!response.ok) {
      appendDebugLog('map-load', 'Failed to fetch worldMap.json');
      return;
    }

    const parsed = await response.json();
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

function updateSelectionPanel(): void {
  selectionTerrainRow.style.display = 'none';
  selectionResourceRow.style.display = 'none';
  selectionMonsterRow.style.display = 'none';
  selectionObjectRow.style.display = 'none';
  selectionNpcRow.style.display = 'none';

  if (!state.selectedTile) {
    selectionSummaryElement.textContent = 'No tile selected.';
    return;
  }

  const { worldTileX, worldTileY } = state.selectedTile;
  const mapped = ensureChunkVisibleByWorldTile(worldTileX, worldTileY);
  const terrainId = mapped.chunk.terrain[mapped.localTileY]?.[mapped.localTileX] ?? 0;
  const terrainLabel = TILE_TYPES.find((entry) => entry.id === terrainId)?.label ?? `Tile ${terrainId}`;
  const resource = getResourceAt(mapped.localTileX, mapped.localTileY, mapped.chunk);
  const monster = getMonsterAt(mapped.localTileX, mapped.localTileY, mapped.chunk);
  const object = getObjectAt(mapped.localTileX, mapped.localTileY, mapped.chunk);
  const npc = getNpcAt(mapped.localTileX, mapped.localTileY, mapped.chunk);

  selectionSummaryElement.textContent = [
    `Chunk: (${mapped.chunkX}, ${mapped.chunkY})`,
    `Local: (${mapped.localTileX}, ${mapped.localTileY})`,
    `World: (${worldTileX}, ${worldTileY})`,
    `Terrain: ${terrainLabel}`,
    `Resource: ${resource ? resource.resourceId : 'None'}`,
    `Monster: ${monster ? `${monster.minionTypeId} (T${monster.tier})` : 'None'}`,
    `Object: ${object ? object.objectTypeId : 'None'}`,
    `NPC: ${npc ? `${npc.type} (${npc.name})` : 'None'}`,
    `Quest: ${npc?.quest ? npc.quest.title : 'None'}`,
  ].join('\n');

  if (state.layer === 'terrain') {
    selectionTerrainRow.style.display = 'block';
    selectionTerrainTypeSelect.value = String(terrainId);
  } else if (state.layer === 'resources') {
    selectionResourceRow.style.display = 'block';
    if (resource) {
      selectionResourceTypeSelect.value = resource.resourceId;
      selectionResourceRespawnInput.value = String(resource.respawnMs);
    } else {
      selectionResourceTypeSelect.value = state.selectedResourceId;
      const defaultResource = RESOURCE_TYPES.find((entry) => entry.id === state.selectedResourceId) ?? RESOURCE_TYPES[0];
      selectionResourceRespawnInput.value = String(defaultResource.respawnMs);
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
    selectionObjectTypeSelect.value = object?.objectTypeId ?? state.selectedObjectTypeId;
  } else if (state.layer === 'npcs') {
    selectionNpcRow.style.display = 'block';
    const selectionKey = `${mapped.chunkX},${mapped.chunkY}:${mapped.localTileX},${mapped.localTileY}`;
    const shouldHydrateNpcForm = !state.npcFormDirty || state.npcFormSelectionKey !== selectionKey;
    if (shouldHydrateNpcForm) {
      selectionNpcTypeSelect.value = npc?.type ?? state.selectedNpcTypeId;
      selectionNpcNameInput.value = npc?.name ?? '';
      selectionNpcExamineInput.value = npc?.examineText ?? '';
      selectionNpcTalkInput.value = npc?.talkText ?? '';
      populateNpcQuestInputs(npc?.quest ?? null);
      state.npcFormSelectionKey = selectionKey;
      state.npcFormDirty = false;
    }
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
    parts.push(`NPC: ${npc.name} (${npc.type})${npc.quest ? ` [Quest: ${npc.quest.title}]` : ''}`);
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
  const entry = TILE_TYPES.find((tile) => tile.id === tileId);
  return entry?.color ?? '#222833';
}

function drawGrid(): void {
  const tileSize = state.tilePixelSize;
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
  for (const entry of chunkEntries) {
    const chunkOffsetTileX = (entry.chunkX - minChunkX) * MAP_WIDTH_TILES;
    const chunkOffsetTileY = (entry.chunkY - minChunkY) * MAP_HEIGHT_TILES;
    for (let y = 0; y < MAP_HEIGHT_TILES; y += 1) {
      for (let x = 0; x < MAP_WIDTH_TILES; x += 1) {
        const tileId = entry.chunk.terrain[y]?.[x] ?? 0;
        context.fillStyle = getTileColor(tileId);
        context.fillRect(
          (chunkOffsetTileX + x) * tileSize,
          (chunkOffsetTileY + y) * tileSize,
          tileSize,
          tileSize,
        );
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
      const centerX = (chunkOffsetTileX + monster.tileX) * tileSize + tileSize * 0.5;
      const centerY = (chunkOffsetTileY + monster.tileY) * tileSize + tileSize * 0.5;
      drawEditorEntityIcon(context, getMonsterIcon(), centerX, centerY, tileSize);
    }

    for (const object of entry.chunk.objects) {
      const centerX = (chunkOffsetTileX + object.tileX) * tileSize + tileSize * 0.5;
      const centerY = (chunkOffsetTileY + object.tileY) * tileSize + tileSize * 0.5;
      drawEditorEntityIcon(context, getObjectIcon(object.objectTypeId), centerX, centerY, tileSize);
    }

    for (const npc of entry.chunk.npcs) {
      const centerX = (chunkOffsetTileX + npc.tileX) * tileSize + tileSize * 0.5;
      const centerY = (chunkOffsetTileY + npc.tileY) * tileSize + tileSize * 0.5;
      drawEditorEntityIcon(context, getNpcIcon(npc.type), centerX, centerY, tileSize);
    }
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
  state.data.resources = state.data.resources.filter(
    (entry) => entry.tileX !== tileX || entry.tileY !== tileY,
  );
}

function removeMonsterAt(tileX: number, tileY: number): void {
  state.data.monsters = state.data.monsters.filter(
    (entry) => entry.tileX !== tileX || entry.tileY !== tileY,
  );
}

function removeObjectAt(tileX: number, tileY: number): void {
  state.data.objects = state.data.objects.filter(
    (entry) => entry.tileX !== tileX || entry.tileY !== tileY,
  );
}

function removeNpcAt(tileX: number, tileY: number): void {
  state.data.npcs = state.data.npcs.filter(
    (entry) => entry.tileX !== tileX || entry.tileY !== tileY,
  );
}

function nextResourceId(resourceId: string): string {
  const count = state.data.resources.filter((entry) => entry.resourceId === resourceId).length + 1;
  return `${resourceId}-${count}`;
}

function nextMonsterId(monsterId: string): string {
  const count = state.data.monsters.filter((entry) => entry.minionTypeId === monsterId).length + 1;
  return `${monsterId}-${count}`;
}

function nextObjectId(objectTypeId: string): string {
  const count = state.data.objects.filter((entry) => entry.objectTypeId === objectTypeId).length + 1;
  return `${objectTypeId}-${count}`;
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
      const resourceDef = RESOURCE_TYPES.find((entry) => entry.id === state.selectedResourceId) ?? RESOURCE_TYPES[0];
      state.data.resources.push({
        id: nextResourceId(resourceDef.id),
        nodeType: resourceDef.nodeType,
        resourceId: resourceDef.id,
        tileX: localTileX,
        tileY: localTileY,
        respawnMs: resourceDef.respawnMs,
      });
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
        const objectType = OBJECT_TYPES.find((entry) => entry.id === state.selectedObjectTypeId) ?? OBJECT_TYPES[0];
        state.data.objects.push({
          id: nextObjectId(objectType.id),
          objectTypeId: objectType.id,
          name: objectType.name,
          tileX: localTileX,
          tileY: localTileY,
          blocksMovement: objectType.blocksMovement,
          examineText: objectType.examineText,
        });
      }
    } else if (state.layer === 'npcs') {
      removeNpcAt(localTileX, localTileY);
      if (!erase) {
        const npcType = NPC_TYPES.find((entry) => entry.id === state.selectedNpcTypeId) ?? NPC_TYPES[0];
        state.data.npcs.push({
          id: nextNpcId(npcType.id),
          type: npcType.id,
          name: npcType.defaultName,
          tileX: localTileX,
          tileY: localTileY,
          examineText: npcType.examineText,
          talkText: npcType.talkText,
          quest: null,
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
  state.selectedResourceId = resourceTypeSelect.value;
});

monsterTypeSelect.addEventListener('change', () => {
  state.selectedMonsterId = monsterTypeSelect.value;
});

objectTypeSelect.addEventListener('change', () => {
  state.selectedObjectTypeId = objectTypeSelect.value;
});

npcTypeSelect.addEventListener('change', () => {
  state.selectedNpcTypeId = npcTypeSelect.value;
});

selectionNpcQuestEnabledInput.addEventListener('change', () => {
  markNpcFormDirty();
  setNpcQuestFieldsVisible(selectionNpcQuestEnabledInput.checked);
});

selectionNpcTypeSelect.addEventListener('change', markNpcFormDirty);
selectionNpcNameInput.addEventListener('input', markNpcFormDirty);
selectionNpcExamineInput.addEventListener('input', markNpcFormDirty);
selectionNpcTalkInput.addEventListener('input', markNpcFormDirty);
selectionNpcQuestTitleInput.addEventListener('input', markNpcFormDirty);
selectionNpcQuestMissionInput.addEventListener('input', markNpcFormDirty);
selectionNpcQuestStartInput.addEventListener('input', markNpcFormDirty);
selectionNpcQuestProgressInput.addEventListener('input', markNpcFormDirty);
selectionNpcQuestEndInput.addEventListener('input', markNpcFormDirty);
selectionNpcQuestObjectiveTypeSelect.addEventListener('change', markNpcFormDirty);
selectionNpcQuestTargetInput.addEventListener('input', markNpcFormDirty);
selectionNpcQuestCountInput.addEventListener('input', markNpcFormDirty);
selectionNpcQuestRewardGoldInput.addEventListener('input', markNpcFormDirty);
selectionNpcQuestRewardItemInput.addEventListener('input', markNpcFormDirty);
selectionNpcQuestRewardQtyInput.addEventListener('input', markNpcFormDirty);

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
    state.data.resources = [];
    state.data.monsters = [];
    state.data.objects = [];
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
  const resourceId = selectionResourceTypeSelect.value;
  const resourceDef = RESOURCE_TYPES.find((entry) => entry.id === resourceId) ?? RESOURCE_TYPES[0];
  const respawnMs = normalizePositiveInt(Number(selectionResourceRespawnInput.value), resourceDef.respawnMs);

  mutateActiveChunk(() => {
    removeResourceAt(mapped.localTileX, mapped.localTileY);
    state.data.resources.push({
      id: existing?.id ?? nextResourceId(resourceDef.id),
      nodeType: resourceDef.nodeType,
      resourceId: resourceDef.id,
      tileX: mapped.localTileX,
      tileY: mapped.localTileY,
      respawnMs,
    });
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
  const objectType = OBJECT_TYPES.find((entry) => entry.id === selectionObjectTypeSelect.value) ?? OBJECT_TYPES[0];

  mutateActiveChunk(() => {
    removeObjectAt(mapped.localTileX, mapped.localTileY);
    state.data.objects.push({
      id: existing?.id ?? nextObjectId(objectType.id),
      objectTypeId: objectType.id,
      name: objectType.name,
      tileX: mapped.localTileX,
      tileY: mapped.localTileY,
      blocksMovement: objectType.blocksMovement,
      examineText: objectType.examineText,
    });
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
  const existingQuestId = existing?.quest?.id ?? `quest-${existingNpcId}`;
  const quest = buildQuestFromSelectionInputs(existingQuestId);
  const npcName = normalizeText(selectionNpcNameInput.value, npcType.defaultName);
  const npcExamineText = normalizeText(selectionNpcExamineInput.value, npcType.examineText);
  const npcTalkText = normalizeText(selectionNpcTalkInput.value, npcType.talkText);

  mutateActiveChunk(() => {
    removeNpcAt(mapped.localTileX, mapped.localTileY);
    state.data.npcs.push({
      id: existingNpcId,
      type: npcType.id,
      name: npcName,
      tileX: mapped.localTileX,
      tileY: mapped.localTileY,
      examineText: npcExamineText,
      talkText: npcTalkText,
      quest,
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

  const payloadMap = {
    version: WORLD_DATA_VERSION,
    chunkWidth: MAP_WIDTH_TILES,
    chunkHeight: MAP_HEIGHT_TILES,
    chunks: chunkKeysToSave.map((key) => {
      const chunk = state.chunks.get(key);
      if (!chunk) return null;
      return {
        ...chunk,
        terrain: chunk.terrain.map((row) => [...row]),
        resources: [...chunk.resources],
        monsters: [...chunk.monsters],
        objects: [...chunk.objects],
        npcs: [...chunk.npcs],
      };
    }).filter(Boolean),
  };
  const payload = JSON.stringify(payloadMap, null, 2);
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
drawGrid();
scheduleVisibleChunkLoading();
updateStatus();
void loadCanonicalWorldMapIfAvailable();
