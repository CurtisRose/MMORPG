import './styles.css';

type EditorTab = 'items' | 'npcs' | 'minions' | 'tiles' | 'worldObjects' | 'recipes' | 'player';

type WorldObjectBehavior = 'decorative' | 'harvestable' | 'station' | 'bank' | 'shop' | 'npc';

type ItemDefinition = {
  id: string;
  name: string;
  stackable: boolean;
  image: string;
  examineText: string;
};

type GearDefinition = {
  itemId: string;
  slot: string;
  stats?: Record<string, unknown>;
  combat?: Record<string, unknown>;
  skills?: Record<string, unknown>;
};

type ItemRecord = {
  item: ItemDefinition;
  gear: GearDefinition | null;
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
  chunkX: number;
  chunkY: number;
};

type MinionDefinition = {
  id: string;
  type: string;
  name: string;
  image?: string;
  maxHp: number;
  armor: number;
  attackAccuracy: number;
  attackDamageMin: number;
  attackDamageMax: number;
  attackCooldownMs: number;
  aggroRangeTiles: number;
  respawnMs: number;
  maxChaseDistanceTiles: number;
  hpRegenIntervalMs: number;
  hpRegenAmount: number;
  tierScaling?: Record<string, unknown>;
  guaranteedDrops?: unknown[];
  lootTable?: unknown[];
  examineText?: string;
  tierExamineText?: Record<string, string>;
};

type WorldChunk = {
  chunkX: number;
  chunkY: number;
  npcs?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

type WorldMapData = {
  chunks: WorldChunk[];
  [key: string]: unknown;
};

type TileDefinition = {
  id: number;
  label: string;
  color: string;
  image?: string;
  walkable: boolean;
};

type WorldObjectTypeDefinition = {
  id: string;
  name: string;
  behavior: WorldObjectBehavior;
  blocksMovement: boolean;
  image?: string;
  examineText: string;
  tags: string[];
  behaviorConfig: Record<string, unknown>;
};

type PlayerAppearanceConfig = {
  image: string;
};

type CraftingSkillId = 'smelting' | 'smithing' | 'fletching';

type CraftingStationType = 'smelting_station' | 'smithing_station' | 'fletching_station';

type RecipeItemStack = {
  itemId: string;
  quantity: number;
};

type CraftingRecipeDefinition = {
  id: string;
  name: string;
  requiredLevel: number;
  durationMs: number;
  successChance: number;
  xp: number;
  inputs: RecipeItemStack[];
  outputs: RecipeItemStack[];
};

type CraftingMessages = {
  locked?: string;
  missingItems?: string;
  success?: string;
  failure?: string;
};

type CraftingSkillConfig = {
  skill: CraftingSkillId;
  recipes: CraftingRecipeDefinition[];
  messages?: CraftingMessages;
};

type HiddenNpcPlacement = NpcPlacement;

type PendingImageImport = {
  targetId: string | number;
  file: File;
  objectUrl: string;
};

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('Data editor root not found.');
}
const appElement = app;

const ITEMS_URL = `${import.meta.env.BASE_URL}server/data/content/items.json`;
const GEAR_URL = `${import.meta.env.BASE_URL}server/data/content/gear.json`;
const MINIONS_URL = `${import.meta.env.BASE_URL}server/data/content/minions.json`;
const WORLD_MAP_URL = `${import.meta.env.BASE_URL}data/worldMap.json`;
const TILE_TYPES_URL = `${import.meta.env.BASE_URL}data/tileTypes.json`;
const WORLD_OBJECT_TYPES_URL = `${import.meta.env.BASE_URL}data/worldObjectTypes.json`;
const PLAYER_APPEARANCE_URL = `${import.meta.env.BASE_URL}data/playerAppearance.json`;
const SMELTING_RECIPES_URL = `${import.meta.env.BASE_URL}server/data/skills/crafting/smelting.json`;
const SMITHING_RECIPES_URL = `${import.meta.env.BASE_URL}server/data/skills/crafting/smithing.json`;
const FLETCHING_RECIPES_URL = `${import.meta.env.BASE_URL}server/data/skills/crafting/fletching.json`;
const TERRAIN_TILESET_RELATIVE_PATH = 'public/assets/terrain/terrain_tileset.png';
const TILESET_TILE_SIZE = 32;
const DEBUG_PREFIX = '[DataEditor Debug]';

const CRAFTING_SKILL_ORDER: CraftingSkillId[] = ['smelting', 'smithing', 'fletching'];
const CRAFTING_STATION_BY_SKILL: Record<CraftingSkillId, CraftingStationType> = {
  smelting: 'smelting_station',
  smithing: 'smithing_station',
  fletching: 'fletching_station',
};
const CRAFTING_SKILL_BY_STATION: Record<CraftingStationType, CraftingSkillId> = {
  smelting_station: 'smelting',
  smithing_station: 'smithing',
  fletching_station: 'fletching',
};

function debugLog(step: string, details?: unknown): void {
  if (typeof details === 'undefined') {
    console.log(`${DEBUG_PREFIX} ${step}`);
    return;
  }

  console.log(`${DEBUG_PREFIX} ${step}`, details);
}

function debugError(step: string, error: unknown): void {
  const parsed = error as Error;
  console.error(`${DEBUG_PREFIX} ${step}`, {
    name: parsed?.name,
    message: parsed?.message,
    stack: parsed?.stack,
  });
}

const state: {
  tab: EditorTab;
  items: ItemRecord[];
  minions: MinionDefinition[];
  npcs: NpcPlacement[];
  hiddenNpcs: HiddenNpcPlacement[];
  tileTypes: TileDefinition[];
  worldObjectTypes: WorldObjectTypeDefinition[];
  playerAppearance: PlayerAppearanceConfig;
  craftingConfigs: Record<CraftingSkillId, CraftingSkillConfig>;
  worldMap: WorldMapData | null;
  projectDirectoryHandle: any | null;
  projectDirectoryName: string | null;
  pendingItemImageImport: PendingImageImport | null;
  pendingNpcImageImport: PendingImageImport | null;
  pendingMinionImageImport: PendingImageImport | null;
  pendingTileImageImport: PendingImageImport | null;
  pendingWorldObjectImageImport: PendingImageImport | null;
  selectedItemId: string | null;
  selectedNpcId: string | null;
  selectedMinionId: string | null;
  selectedTileId: number | null;
  selectedWorldObjectTypeId: string | null;
  selectedRecipeSkill: CraftingSkillId;
  selectedRecipeIdBySkill: Partial<Record<CraftingSkillId, string>>;
} = {
  tab: 'items',
  items: [],
  minions: [],
  npcs: [],
  hiddenNpcs: [],
  tileTypes: [],
  worldObjectTypes: [],
  playerAppearance: {
    image: '',
  },
  craftingConfigs: {
    smelting: { skill: 'smelting', recipes: [], messages: {} },
    smithing: { skill: 'smithing', recipes: [], messages: {} },
    fletching: { skill: 'fletching', recipes: [], messages: {} },
  },
  worldMap: null,
  projectDirectoryHandle: null,
  projectDirectoryName: null,
  pendingItemImageImport: null,
  pendingNpcImageImport: null,
  pendingMinionImageImport: null,
  pendingTileImageImport: null,
  pendingWorldObjectImageImport: null,
  selectedItemId: null,
  selectedNpcId: null,
  selectedMinionId: null,
  selectedTileId: null,
  selectedWorldObjectTypeId: null,
  selectedRecipeSkill: 'smelting',
  selectedRecipeIdBySkill: {},
};

function setStatus(message: string): void {
  const element = document.querySelector<HTMLDivElement>('#status');
  if (element) {
    element.textContent = message;
  }
}

function toPrettyJson(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

function parseJsonField<T>(label: string, raw: string, fallback: T): T {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) {
    return fallback;
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch (error) {
    throw new Error(`Invalid JSON for ${label}: ${(error as Error).message}`);
  }
}

function forceNumber(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeWorldObjectBehavior(value: unknown): WorldObjectBehavior {
  const parsed = String(value ?? '').trim();
  if (parsed === 'harvestable' || parsed === 'station' || parsed === 'bank' || parsed === 'shop' || parsed === 'npc') {
    return parsed;
  }

  return 'decorative';
}

function normalizeCraftingSkillId(value: unknown): CraftingSkillId {
  const parsed = String(value ?? '').trim().toLowerCase();
  if (parsed === 'smithing' || parsed === 'fletching') {
    return parsed;
  }

  return 'smelting';
}

function normalizeRecipeItemStack(value: unknown): RecipeItemStack | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const itemId = String(raw.itemId ?? '').trim();
  const quantity = Math.max(1, Math.floor(Number(raw.quantity ?? 1)));
  if (!itemId) {
    return null;
  }

  return { itemId, quantity };
}

function normalizeCraftingRecipe(value: unknown, index: number): CraftingRecipeDefinition | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const id = String(raw.id ?? '').trim();
  if (!id) {
    return null;
  }

  const inputs = Array.isArray(raw.inputs)
    ? raw.inputs.map((entry) => normalizeRecipeItemStack(entry)).filter((entry): entry is RecipeItemStack => entry !== null)
    : [];
  const outputs = Array.isArray(raw.outputs)
    ? raw.outputs.map((entry) => normalizeRecipeItemStack(entry)).filter((entry): entry is RecipeItemStack => entry !== null)
    : [];
  const normalizedOutputs = outputs.length > 0 ? outputs : [{ itemId: `placeholder_output_${index + 1}`, quantity: 1 }];
  const configuredName = String(raw.name ?? '').trim();
  const fallbackName = getItemNameById(normalizedOutputs[0]?.itemId ?? id) || id;

  return {
    id,
    name: configuredName || fallbackName,
    requiredLevel: Math.max(1, Math.floor(Number(raw.requiredLevel ?? 1))),
    durationMs: Math.max(100, Math.floor(Number(raw.durationMs ?? 1500))),
    successChance: Math.max(0, Math.min(1, Number(raw.successChance ?? 1))),
    xp: Math.max(0, Number(raw.xp ?? 0)),
    inputs: inputs.length > 0 ? inputs : [{ itemId: 'placeholder_input', quantity: 1 }],
    outputs: normalizedOutputs,
  };
}

function normalizeCraftingMessages(value: unknown): CraftingMessages {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const raw = value as Record<string, unknown>;
  return {
    locked: String(raw.locked ?? '').trim(),
    missingItems: String(raw.missingItems ?? '').trim(),
    success: String(raw.success ?? '').trim(),
    failure: String(raw.failure ?? '').trim(),
  };
}

function normalizeCraftingSkillConfig(value: unknown, fallbackSkill: CraftingSkillId): CraftingSkillConfig {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const skill = normalizeCraftingSkillId(raw.skill ?? fallbackSkill);
  const recipes = Array.isArray(raw.recipes)
    ? raw.recipes.map((entry, index) => normalizeCraftingRecipe(entry, index)).filter((entry): entry is CraftingRecipeDefinition => entry !== null)
    : [];

  return {
    skill,
    recipes,
    messages: normalizeCraftingMessages(raw.messages),
  };
}

function getSelectedRecipe(): CraftingRecipeDefinition | null {
  const selectedId = state.selectedRecipeIdBySkill[state.selectedRecipeSkill] ?? null;
  if (!selectedId) {
    return null;
  }

  return state.craftingConfigs[state.selectedRecipeSkill].recipes.find((entry) => entry.id === selectedId) ?? null;
}

function getCraftingFilePathForSkill(skill: CraftingSkillId): string {
  return `server/data/skills/crafting/${skill}.json`;
}

function getItemNameById(itemId: string): string {
  const normalizedItemId = String(itemId ?? '').trim();
  if (!normalizedItemId) {
    return '';
  }

  const match = state.items.find((entry) => entry.item.id === normalizedItemId);
  return match?.item.name?.trim() || normalizedItemId;
}

function downloadJsonFile(fileName: string, value: unknown): void {
  debugLog('Downloading fallback JSON file', { fileName });
  const data = JSON.stringify(value, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

function resolveAssetUrl(input: string): string {
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

function buildNpcFallbackAvatarDataUrl(npc: Pick<NpcPlacement, 'name' | 'type'>): string {
  const name = String(npc?.name ?? '').trim();
  const type = String(npc?.type ?? '').trim().toLowerCase();

  const backgroundByType: Record<string, string> = {
    shopkeeper: '#a2744f',
    villager: '#5f8cc9',
    bank_chest: '#8c7b4f',
  };

  const background = backgroundByType[type] || '#7b6ba3';
  const letter = (name || type || 'N').slice(0, 1).toUpperCase().replace(/[^A-Z0-9]/g, 'N');

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <text x="32" y="21" text-anchor="middle" font-family="monospace" font-size="9" fill="${background}">NO IMG</text>
  <text x="32" y="47" text-anchor="middle" font-family="monospace" font-size="22" font-weight="700" fill="${background}">${letter}</text>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.trim())}`;
}

async function applyTintToPreviewImage(image: HTMLImageElement): Promise<void> {
  const baseSource = String(image.dataset.baseSrc ?? '').trim();
  if (!baseSource) {
    return;
  }

  if (image.src !== baseSource) {
    image.src = baseSource;
  }
}

function applyPreviewTint(imgId: string): void {
  const image = document.querySelector<HTMLImageElement>(`#${imgId}`);
  if (!image) {
    return;
  }

  void applyTintToPreviewImage(image);
}

function supportsFileSystemAccess(): boolean {
  return typeof (window as unknown as { showDirectoryPicker?: () => Promise<any> }).showDirectoryPicker === 'function';
}

async function ensureProjectFolderWritePermission(handle: any): Promise<void> {
  debugLog('Checking folder write permission', {
    hasHandle: Boolean(handle),
    handleName: String(handle?.name ?? ''),
  });
  const queryPermission = handle?.queryPermission as ((options: { mode: 'readwrite' }) => Promise<string>) | undefined;
  const requestPermission = handle?.requestPermission as ((options: { mode: 'readwrite' }) => Promise<string>) | undefined;

  if (queryPermission) {
    const existing = await queryPermission.call(handle, { mode: 'readwrite' });
    debugLog('queryPermission result', { existing });
    if (existing === 'granted') {
      return;
    }
  }

  if (!requestPermission) {
    throw new Error('Browser does not support requesting write permission for this folder.');
  }

  const granted = await requestPermission.call(handle, { mode: 'readwrite' });
  debugLog('requestPermission result', { granted });
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

  debugLog('Project folder validation', {
    handleName: String(handle?.name ?? ''),
    hasPublicDir,
    hasServerDir,
    hasPackageJson,
  });

  if (!hasPublicDir || !hasServerDir || !hasPackageJson) {
    throw new Error(
      "Selected folder is not your game project root. Pick the folder that contains 'package.json', 'public/', and 'server/' (for this workspace, that should be the Game folder).",
    );
  }
}

function sanitizeFileName(fileName: string): string {
  const trimmed = String(fileName ?? '').trim();
  const safe = trimmed.replace(/[^a-zA-Z0-9._-]/g, '_');
  return safe || `image_${Date.now()}.png`;
}

function updateFolderConnectionLabel(): void {
  const label = document.querySelector<HTMLSpanElement>('#folder-status');
  if (!label) {
    return;
  }

  if (!supportsFileSystemAccess()) {
    label.textContent = 'Local copy unsupported in this browser';
    return;
  }

  if (!state.projectDirectoryHandle) {
    label.textContent = 'No project folder connected';
    return;
  }

  label.textContent = `Connected: ${state.projectDirectoryName ?? 'project folder'}`;
}

async function connectProjectFolder(): Promise<boolean> {
  debugLog('Connect folder requested');
  if (!supportsFileSystemAccess()) {
    setStatus('This browser does not support local file writes. Use Chrome/Edge for image auto-copy.');
    updateFolderConnectionLabel();
    return false;
  }

  try {
    const picker = (window as unknown as { showDirectoryPicker: (options?: { mode?: 'readwrite' | 'read' }) => Promise<any> }).showDirectoryPicker;
    const handle = await picker({ mode: 'readwrite' });
    debugLog('Directory selected in picker', { handleName: String(handle?.name ?? '') });
    await ensureProjectFolderWritePermission(handle);
    await validateProjectRootFolder(handle);
    state.projectDirectoryHandle = handle;
    state.projectDirectoryName = String(handle?.name ?? 'project');
    updateFolderConnectionLabel();
    setStatus(`Connected folder '${state.projectDirectoryName}'. Image imports will copy into public/assets/.`);
    return true;
  } catch (error) {
    debugError('Connect folder failed/cancelled', error);
    const message = (error as Error).message;
    setStatus(message ? `Folder connection cancelled: ${message}` : 'Folder connection cancelled.');
    updateFolderConnectionLabel();
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

async function copyLocalImageToAssets(file: File, assetFolderName: string): Promise<string> {
  debugLog('Copy local image requested', {
    fileName: file?.name,
    fileType: file?.type,
    fileSize: file?.size,
    assetFolderName,
    hasConnectedFolder: Boolean(state.projectDirectoryHandle),
    projectFolderName: state.projectDirectoryName,
  });

  if (!state.projectDirectoryHandle) {
    const connected = await connectProjectFolder();
    if (!connected || !state.projectDirectoryHandle) {
      throw new Error('Project folder not connected.');
    }
  }

  await ensureProjectFolderWritePermission(state.projectDirectoryHandle);
  await validateProjectRootFolder(state.projectDirectoryHandle);

  const fileName = sanitizeFileName(file.name);
  const targetDirectory = await getOrCreateDirectory(state.projectDirectoryHandle, ['public', 'assets', assetFolderName]);
  const targetFileHandle = await targetDirectory.getFileHandle(fileName, { create: true });
  const writable = await targetFileHandle.createWritable();
  await writable.write(await file.arrayBuffer());
  await writable.close();

  debugLog('Image copied to assets', {
    fileName,
    assetFolderName,
    path: `/assets/${assetFolderName}/${fileName}`,
  });
  return `/assets/${assetFolderName}/${fileName}`;
}

async function writeProjectJsonFile(relativeFilePath: string, value: unknown): Promise<void> {
  debugLog('writeProjectJsonFile called', {
    relativeFilePath,
    hasConnectedFolder: Boolean(state.projectDirectoryHandle),
    projectFolderName: state.projectDirectoryName,
    payloadType: Array.isArray(value) ? 'array' : typeof value,
    payloadSize: Array.isArray(value) ? value.length : undefined,
  });

  try {
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
    debugLog('Resolved write target', {
      normalized,
      directoryParts,
      fileName,
    });

    const directoryHandle = await getOrCreateDirectory(state.projectDirectoryHandle, directoryParts);
    const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(`${JSON.stringify(value, null, 2)}\n`);
    await writable.close();
    debugLog('Write completed', { relativeFilePath });
  } catch (error) {
    debugError(`Write failed for ${relativeFilePath}`, error);
    throw error;
  }
}

async function writeProjectBlobFile(relativeFilePath: string, blob: Blob): Promise<void> {
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
  await writable.write(await blob.arrayBuffer());
  await writable.close();
}

async function readProjectFileAsBlob(relativeFilePath: string): Promise<Blob | null> {
  if (!state.projectDirectoryHandle) {
    return null;
  }

  const normalized = String(relativeFilePath ?? '').replace(/\\/g, '/').replace(/^\/+/, '');
  const pathParts = normalized.split('/').filter(Boolean);
  if (pathParts.length < 2) {
    return null;
  }

  const fileName = pathParts[pathParts.length - 1];
  const directoryParts = pathParts.slice(0, -1);

  try {
    let directory = state.projectDirectoryHandle;
    for (const segment of directoryParts) {
      directory = await directory.getDirectoryHandle(segment, { create: false });
    }

    const fileHandle = await directory.getFileHandle(fileName, { create: false });
    const file = await fileHandle.getFile();
    if (!file || file.size <= 0) {
      return null;
    }

    return file;
  } catch {
    return null;
  }
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to encode terrain tileset PNG.'));
        return;
      }

      resolve(blob);
    }, 'image/png');
  });
}

async function writeTileImageIntoTerrainTileset(tileImageFile: File, tileId: number): Promise<void> {
  if (!Number.isInteger(tileId) || tileId < 0) {
    throw new Error('Tile id must be a non-negative integer to write into terrain tileset.');
  }

  if (!state.projectDirectoryHandle) {
    const connected = await connectProjectFolder();
    if (!connected || !state.projectDirectoryHandle) {
      throw new Error('Project folder not connected.');
    }
  }

  await ensureProjectFolderWritePermission(state.projectDirectoryHandle);
  await validateProjectRootFolder(state.projectDirectoryHandle);

  debugLog('Writing tile image into terrain tileset', {
    tileId,
    fileName: tileImageFile.name,
    target: TERRAIN_TILESET_RELATIVE_PATH,
  });

  const existingBlob = await readProjectFileAsBlob(TERRAIN_TILESET_RELATIVE_PATH);
  const sourceImage = await createImageBitmap(tileImageFile);
  let existingImage: ImageBitmap | null = null;
  if (existingBlob) {
    existingImage = await createImageBitmap(existingBlob);
  }

  const requiredWidth = (tileId + 1) * TILESET_TILE_SIZE;
  const existingWidth = existingImage?.width ?? 0;
  const existingHeight = existingImage?.height ?? 0;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(requiredWidth, existingWidth || requiredWidth);
  canvas.height = Math.max(TILESET_TILE_SIZE, existingHeight || TILESET_TILE_SIZE);

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not get canvas context to update terrain tileset.');
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  if (existingImage) {
    context.drawImage(existingImage, 0, 0);
  }

  const targetX = tileId * TILESET_TILE_SIZE;
  context.clearRect(targetX, 0, TILESET_TILE_SIZE, TILESET_TILE_SIZE);
  context.drawImage(sourceImage, targetX, 0, TILESET_TILE_SIZE, TILESET_TILE_SIZE);

  const updatedBlob = await canvasToPngBlob(canvas);
  await writeProjectBlobFile(TERRAIN_TILESET_RELATIVE_PATH, updatedBlob);

  sourceImage.close?.();
  existingImage?.close?.();
}

function buildWorldMapWithNpcChanges(): WorldMapData {
  if (!state.worldMap) {
    throw new Error('World map data is not loaded.');
  }

  const grouped = new Map<string, NpcPlacement[]>();
  for (const npc of state.npcs) {
    const key = `${npc.chunkX},${npc.chunkY}`;
    const list = grouped.get(key) ?? [];
    list.push(npc);
    grouped.set(key, list);
  }

  for (const npc of state.hiddenNpcs) {
    const key = `${npc.chunkX},${npc.chunkY}`;
    const list = grouped.get(key) ?? [];
    list.push(npc);
    grouped.set(key, list);
  }

  return {
    ...state.worldMap,
    chunks: state.worldMap.chunks.map((chunk) => {
      const key = `${chunk.chunkX},${chunk.chunkY}`;
      const chunkNpcs = grouped.get(key) ?? [];
      return {
        ...chunk,
        npcs: chunkNpcs.map((npc) => ({
          id: npc.id,
          type: npc.type,
          name: npc.name,
          image: npc.image,
          tileX: npc.tileX,
          tileY: npc.tileY,
          examineText: npc.examineText,
          talkText: npc.talkText,
          questStartIds: npc.questStartIds,
        })),
      };
    }),
  };
}

function bindImagePreview(inputId: string, imgId: string, hintId: string): void {
  const input = document.querySelector<HTMLInputElement>(`#${inputId}`);
  const image = document.querySelector<HTMLImageElement>(`#${imgId}`);
  const hint = document.querySelector<HTMLDivElement>(`#${hintId}`);
  if (!input || !image || !hint) {
    return;
  }

  const update = () => {
    const rawPath = String(input.value ?? '').trim();
    if (!rawPath) {
      image.style.display = 'none';
      image.removeAttribute('src');
      delete image.dataset.baseSrc;
      hint.textContent = 'No image path set.';
      return;
    }

    const url = resolveAssetUrl(rawPath);
    image.style.display = 'block';
    image.dataset.baseSrc = url;
    delete image.dataset.tintedKey;
    delete image.dataset.tintedSrc;
    image.src = url;
    hint.textContent = rawPath;
    applyPreviewTint(imgId);
  };

  image.addEventListener('error', () => {
    image.style.display = 'none';
    hint.textContent = `Image not found: ${input.value}`;
  });
  image.addEventListener('load', () => {
    image.style.display = 'block';
    if (image.dataset.baseSrc && image.src === image.dataset.baseSrc) {
      applyPreviewTint(imgId);
    }
  });

  input.addEventListener('input', update);
  update();
  requestAnimationFrame(() => {
    applyPreviewTint(imgId);
  });
}

function setPreviewFromPendingImport(
  pending: PendingImageImport | null,
  imgId: string,
  hintId: string,
): void {
  if (!pending) {
    return;
  }

  const image = document.querySelector<HTMLImageElement>(`#${imgId}`);
  const hint = document.querySelector<HTMLDivElement>(`#${hintId}`);
  if (!image || !hint) {
    return;
  }

  image.style.display = 'block';
  image.dataset.baseSrc = pending.objectUrl;
  delete image.dataset.tintedKey;
  delete image.dataset.tintedSrc;
  image.src = pending.objectUrl;
  hint.textContent = `Selected local file: ${pending.file.name}`;
  applyPreviewTint(imgId);
}

function clearPendingImport(entry: PendingImageImport | null): void {
  if (!entry) {
    return;
  }

  URL.revokeObjectURL(entry.objectUrl);
}

async function loadJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load ${url} (${response.status})`);
  }

  return await response.json() as T;
}

function renderShell(): void {
  appElement.innerHTML = `
    <div class="editor-root">
      <div class="toolbar toolbar-shortcuts">
        <a class="action-button shortcut-link" href="${import.meta.env.BASE_URL}">Game</a>
        <a class="action-button shortcut-link" href="${import.meta.env.BASE_URL}map-editor.html">Map Editor</a>
        <a class="action-button shortcut-link" href="${import.meta.env.BASE_URL}data-editor.html">Data Editor</a>
      </div>
      <div class="toolbar">
        <button id="tab-items" class="tab-button">Items</button>
        <button id="tab-npcs" class="tab-button">NPCs</button>
        <button id="tab-minions" class="tab-button">Minions</button>
        <button id="tab-recipes" class="tab-button">Recipes</button>
        <button id="tab-tiles" class="tab-button">Tiles</button>
        <button id="tab-world-objects" class="tab-button">World Objects</button>
        <button id="tab-player" class="tab-button">Player</button>
        <button id="connect-folder" class="action-button">Connect Project Folder</button>
        <span id="folder-status" class="folder-status"></span>
      </div>
      <div id="status" class="status">Loading data...</div>
      <div id="workspace" class="workspace"></div>
    </div>
  `;

  document.querySelector<HTMLButtonElement>('#tab-items')?.addEventListener('click', () => {
    state.tab = 'items';
    render();
  });
  document.querySelector<HTMLButtonElement>('#tab-npcs')?.addEventListener('click', () => {
    state.tab = 'npcs';
    render();
  });
  document.querySelector<HTMLButtonElement>('#tab-minions')?.addEventListener('click', () => {
    state.tab = 'minions';
    render();
  });
  document.querySelector<HTMLButtonElement>('#tab-recipes')?.addEventListener('click', () => {
    state.tab = 'recipes';
    render();
  });
  document.querySelector<HTMLButtonElement>('#tab-tiles')?.addEventListener('click', () => {
    state.tab = 'tiles';
    render();
  });
  document.querySelector<HTMLButtonElement>('#tab-world-objects')?.addEventListener('click', () => {
    state.tab = 'worldObjects';
    render();
  });
  document.querySelector<HTMLButtonElement>('#tab-player')?.addEventListener('click', () => {
    state.tab = 'player';
    render();
  });
  document.querySelector<HTMLButtonElement>('#connect-folder')?.addEventListener('click', () => {
    void connectProjectFolder();
  });
  updateFolderConnectionLabel();
}

function renderTabsActiveState(): void {
  const buttonMap: Record<EditorTab, string> = {
    items: '#tab-items',
    npcs: '#tab-npcs',
    minions: '#tab-minions',
    recipes: '#tab-recipes',
    tiles: '#tab-tiles',
    worldObjects: '#tab-world-objects',
    player: '#tab-player',
  };

  for (const [tab, selector] of Object.entries(buttonMap) as Array<[EditorTab, string]>) {
    const button = document.querySelector<HTMLButtonElement>(selector);
    if (!button) {
      continue;
    }

    button.classList.toggle('active', state.tab === tab);
  }
}

function getSelectedItem(): ItemRecord | null {
  if (!state.selectedItemId) {
    return null;
  }

  return state.items.find((entry) => entry.item.id === state.selectedItemId) ?? null;
}

function getSelectedNpc(): NpcPlacement | null {
  if (!state.selectedNpcId) {
    return null;
  }

  return state.npcs.find((entry) => entry.id === state.selectedNpcId) ?? null;
}

function getSelectedMinion(): MinionDefinition | null {
  if (!state.selectedMinionId) {
    return null;
  }

  return state.minions.find((entry) => entry.id === state.selectedMinionId) ?? null;
}

function getSelectedTileDefinition(): TileDefinition | null {
  if (state.selectedTileId === null || state.selectedTileId === undefined) {
    return null;
  }

  return state.tileTypes.find((entry) => entry.id === state.selectedTileId) ?? null;
}

function getSelectedWorldObjectType(): WorldObjectTypeDefinition | null {
  if (!state.selectedWorldObjectTypeId) {
    return null;
  }

  return state.worldObjectTypes.find((entry) => entry.id === state.selectedWorldObjectTypeId) ?? null;
}

function renderWorldObjectsTab(workspace: HTMLDivElement): void {
  const selected = getSelectedWorldObjectType();

  workspace.innerHTML = `
    <div class="list-panel">
      <h3>World Object Types</h3>
      <div class="form-actions">
        <button id="world-object-add" class="action-button">Add Type</button>
        <button id="world-object-delete" class="action-button">Delete</button>
      </div>
      <div id="world-object-list" class="list-items"></div>
    </div>
    <div class="form-panel">
      <h3>World Object Type</h3>
      <div class="preview-card">
        <h4>Image Preview</h4>
        <div class="preview-frame"><img id="world-object-image-preview" alt="World object preview" style="display:none;" /></div>
        <div id="world-object-image-preview-hint" class="preview-hint">No image path set.</div>
        <div class="form-actions">
          <button id="world-object-choose-image" class="action-button" type="button">Choose Local Image</button>
          <input id="world-object-choose-image-input" type="file" accept="image/*" style="display:none;" />
        </div>
      </div>
      <div class="form-grid">
        <label class="form-field"><span>ID</span><input id="world-object-id" value="${selected?.id ?? ''}" /></label>
        <label class="form-field"><span>Name</span><input id="world-object-name" value="${selected?.name ?? ''}" /></label>
        <label class="form-field"><span>Behavior</span>
          <select id="world-object-behavior">
            <option value="decorative">decorative</option>
            <option value="harvestable">harvestable</option>
            <option value="station">station</option>
            <option value="bank">bank</option>
            <option value="shop">shop</option>
            <option value="npc">npc</option>
          </select>
        </label>
        <label class="form-field"><span>Blocks Movement</span>
          <select id="world-object-blocks-movement">
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </label>
        <label class="form-field full"><span>Image</span><input id="world-object-image" value="${selected?.image ?? ''}" /></label>
        <label class="form-field full"><span>Examine Text</span><textarea id="world-object-examine">${selected?.examineText ?? ''}</textarea></label>
        <label class="form-field full"><span>Tags (comma-separated)</span><input id="world-object-tags" value="${(selected?.tags ?? []).join(', ')}" /></label>
        <label class="form-field full"><span>Behavior Config JSON</span><textarea id="world-object-config">${toPrettyJson(selected?.behaviorConfig ?? {})}</textarea></label>
      </div>
      <div class="form-actions">
        <button id="world-object-save-row" class="action-button">Apply Changes</button>
        <button id="world-object-export" class="action-button">Save worldObjectTypes.json</button>
      </div>
      <div class="preview-hint">Unified object type definitions: <strong>public/data/worldObjectTypes.json</strong>.</div>
    </div>
  `;

  const behaviorSelect = document.querySelector<HTMLSelectElement>('#world-object-behavior');
  const blocksMovementSelect = document.querySelector<HTMLSelectElement>('#world-object-blocks-movement');
  if (behaviorSelect) {
    behaviorSelect.value = normalizeWorldObjectBehavior(selected?.behavior);
  }
  if (blocksMovementSelect) {
    blocksMovementSelect.value = selected?.blocksMovement === false ? 'false' : 'true';
  }

  const listRoot = document.querySelector<HTMLDivElement>('#world-object-list');
  if (listRoot) {
    const sorted = [...state.worldObjectTypes].sort((a, b) => a.id.localeCompare(b.id));
    for (const entry of sorted) {
      const button = document.createElement('button');
      button.className = `list-button${entry.id === state.selectedWorldObjectTypeId ? ' selected' : ''}`;
      button.textContent = entry.name;
      button.addEventListener('click', () => {
        state.selectedWorldObjectTypeId = entry.id;
        render();
      });
      listRoot.appendChild(button);
    }
  }

  bindImagePreview('world-object-image', 'world-object-image-preview', 'world-object-image-preview-hint');

  document.querySelector<HTMLButtonElement>('#world-object-choose-image')?.addEventListener('click', () => {
    document.querySelector<HTMLInputElement>('#world-object-choose-image-input')?.click();
  });
  document.querySelector<HTMLInputElement>('#world-object-choose-image-input')?.addEventListener('change', async (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      const current = getSelectedWorldObjectType();
      if (!current) {
        throw new Error('Select a world object type first.');
      }

      clearPendingImport(state.pendingWorldObjectImageImport);
      state.pendingWorldObjectImageImport = {
        targetId: current.id,
        file,
        objectUrl: URL.createObjectURL(file),
      };
      setPreviewFromPendingImport(state.pendingWorldObjectImageImport, 'world-object-image-preview', 'world-object-image-preview-hint');
      setStatus(`Selected local image '${file.name}'. Click Apply Changes to copy it into public/assets/world-objects.`);
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      input.value = '';
    }
  });

  setPreviewFromPendingImport(state.pendingWorldObjectImageImport, 'world-object-image-preview', 'world-object-image-preview-hint');

  document.querySelector<HTMLButtonElement>('#world-object-add')?.addEventListener('click', () => {
    const id = `world_object_${Date.now()}`;
    state.worldObjectTypes.push({
      id,
      name: 'New World Object',
      behavior: 'decorative',
      blocksMovement: false,
      image: '/assets/world-objects/new_world_object.png',
      examineText: 'A world object.',
      tags: [],
      behaviorConfig: {},
    });
    state.selectedWorldObjectTypeId = id;
    render();
  });

  document.querySelector<HTMLButtonElement>('#world-object-delete')?.addEventListener('click', () => {
    if (!state.selectedWorldObjectTypeId) {
      return;
    }

    state.worldObjectTypes = state.worldObjectTypes.filter((entry) => entry.id !== state.selectedWorldObjectTypeId);
    state.selectedWorldObjectTypeId = state.worldObjectTypes[0]?.id ?? null;
    render();
  });

  document.querySelector<HTMLButtonElement>('#world-object-save-row')?.addEventListener('click', async () => {
    const current = getSelectedWorldObjectType();
    if (!current) {
      return;
    }

    try {
      const previousId = current.id;
      const nextId = String(document.querySelector<HTMLInputElement>('#world-object-id')?.value ?? '').trim();
      const nextName = String(document.querySelector<HTMLInputElement>('#world-object-name')?.value ?? '').trim();
      const nextBehavior = normalizeWorldObjectBehavior(document.querySelector<HTMLSelectElement>('#world-object-behavior')?.value ?? 'decorative');
      const nextBlocksMovement = document.querySelector<HTMLSelectElement>('#world-object-blocks-movement')?.value !== 'false';
      const nextImage = String(document.querySelector<HTMLInputElement>('#world-object-image')?.value ?? '').trim();
      const nextExamineText = String(document.querySelector<HTMLTextAreaElement>('#world-object-examine')?.value ?? '').trim();
      const nextTags = String(document.querySelector<HTMLInputElement>('#world-object-tags')?.value ?? '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
      const nextBehaviorConfig = parseJsonField('behavior config', document.querySelector<HTMLTextAreaElement>('#world-object-config')?.value ?? '{}', {});

      if (!nextId) {
        throw new Error('World object type id is required.');
      }
      if (!nextName) {
        throw new Error('World object type name is required.');
      }

      const duplicate = state.worldObjectTypes.find((entry) => entry.id === nextId && entry !== current);
      if (duplicate) {
        throw new Error(`World object type id '${nextId}' already exists.`);
      }

      current.id = nextId;
      current.name = nextName;
      current.behavior = nextBehavior;
      current.blocksMovement = nextBlocksMovement;
      current.image = nextImage;
      current.examineText = nextExamineText;
      current.tags = nextTags;
      current.behaviorConfig = nextBehaviorConfig as Record<string, unknown>;

      if (state.pendingWorldObjectImageImport && state.pendingWorldObjectImageImport.targetId === previousId) {
        const imagePath = await copyLocalImageToAssets(state.pendingWorldObjectImageImport.file, 'world-objects');
        current.image = imagePath;
        const imageInput = document.querySelector<HTMLInputElement>('#world-object-image');
        if (imageInput) {
          imageInput.value = imagePath;
          imageInput.dispatchEvent(new Event('input'));
        }
        clearPendingImport(state.pendingWorldObjectImageImport);
        state.pendingWorldObjectImageImport = null;
      }

      state.worldObjectTypes.sort((a, b) => a.id.localeCompare(b.id));
      await writeProjectJsonFile('public/data/worldObjectTypes.json', state.worldObjectTypes);

      state.selectedWorldObjectTypeId = current.id;
      setStatus(`Updated world object type '${current.id}' and saved to public/data/worldObjectTypes.json.`);
      render();
    } catch (error) {
      debugError('World object type apply failed', error);
      setStatus((error as Error).message);
    }
  });

  document.querySelector<HTMLButtonElement>('#world-object-export')?.addEventListener('click', async () => {
    try {
      await writeProjectJsonFile('public/data/worldObjectTypes.json', state.worldObjectTypes);
      setStatus('Saved directly to public/data/worldObjectTypes.json.');
    } catch (error) {
      debugError('World object type save fell back to download', error);
      downloadJsonFile('worldObjectTypes.json', state.worldObjectTypes);
      setStatus(`Could not write to project folder, downloaded worldObjectTypes.json instead: ${(error as Error).message}`);
    }
  });
}

function renderTilesTab(workspace: HTMLDivElement): void {
  const selected = getSelectedTileDefinition();

  workspace.innerHTML = `
    <div class="list-panel">
      <h3>Tiles</h3>
      <div class="form-actions">
        <button id="tile-add" class="action-button">Add Tile</button>
        <button id="tile-delete" class="action-button">Delete</button>
      </div>
      <div id="tile-list" class="list-items"></div>
    </div>
    <div class="form-panel">
      <h3>Tile Definition</h3>
      <div class="preview-card">
        <h4>Tile Preview</h4>
        <div class="preview-frame">
          <canvas id="tile-image-preview-canvas" width="32" height="32"></canvas>
          <div id="tile-fallback-preview" class="tile-fallback-preview"></div>
        </div>
        <div id="tile-image-preview-hint" class="preview-hint">No image path set.</div>
        <div class="form-actions">
          <button id="tile-choose-image" class="action-button" type="button">Choose Local Image</button>
          <span class="preview-inline-note">Image should be 32x32</span>
          <input id="tile-choose-image-input" type="file" accept="image/*" style="display:none;" />
        </div>
      </div>
      <div class="form-grid">
        <label class="form-field"><span>ID</span><input id="tile-id" type="number" value="${selected?.id ?? ''}" /></label>
        <label class="form-field"><span>Label</span><input id="tile-label" value="${selected?.label ?? ''}" /></label>
        <label class="form-field"><span>Color</span><input id="tile-color" value="${selected?.color ?? ''}" /></label>
        <label class="form-field"><span>Walkable</span><select id="tile-walkable"><option value="true">true</option><option value="false">false</option></select></label>
        <label class="form-field full"><span>Image</span><input id="tile-image" value="${selected?.image ?? ''}" /></label>
      </div>
      <div class="form-actions">
        <button id="tile-save-row" class="action-button">Apply Changes</button>
        <button id="tile-export" class="action-button">Save tileTypes.json</button>
      </div>
      <div class="preview-hint">Map Editor reads tiles from: <strong>public/data/tileTypes.json</strong>.</div>
    </div>
  `;

  const listRoot = document.querySelector<HTMLDivElement>('#tile-list');
  if (listRoot) {
    const sorted = [...state.tileTypes].sort((a, b) => a.id - b.id);
    for (const tile of sorted) {
      const button = document.createElement('button');
      button.className = `list-button${tile.id === state.selectedTileId ? ' selected' : ''}`;
      button.textContent = `${tile.id} — ${tile.label}`;
      button.addEventListener('click', () => {
        state.selectedTileId = tile.id;
        render();
      });
      listRoot.appendChild(button);
    }
  }

  const tileImageInput = document.querySelector<HTMLInputElement>('#tile-image');
  const tileColorInput = document.querySelector<HTMLInputElement>('#tile-color');
  const tileLabelInput = document.querySelector<HTMLInputElement>('#tile-label');
  const tileWalkableSelect = document.querySelector<HTMLSelectElement>('#tile-walkable');
  const tileIdInput = document.querySelector<HTMLInputElement>('#tile-id');
  const tileImagePreviewCanvas = document.querySelector<HTMLCanvasElement>('#tile-image-preview-canvas');
  const tileImagePreviewHint = document.querySelector<HTMLDivElement>('#tile-image-preview-hint');
  const tileFallbackPreview = document.querySelector<HTMLDivElement>('#tile-fallback-preview');
  if (tileWalkableSelect) {
    tileWalkableSelect.value = selected?.walkable === false ? 'false' : 'true';
  }
  const drawPreviewImageFromSource = (sourceUrl: string, tileId: number, cropTileset: boolean): Promise<boolean> => {
    return new Promise((resolve) => {
    if (!tileImagePreviewCanvas || !tileFallbackPreview) {
      resolve(false);
      return;
    }

    const context = tileImagePreviewCanvas.getContext('2d');
    if (!context) {
      resolve(false);
      return;
    }

    const image = new Image();
    image.onload = () => {
      context.clearRect(0, 0, 32, 32);
      if (cropTileset && image.naturalWidth >= (tileId + 1) * 32 && image.naturalHeight >= 32) {
        context.drawImage(image, tileId * 32, 0, 32, 32, 0, 0, 32, 32);
        if (tileImagePreviewHint) {
          tileImagePreviewHint.textContent = `${tileImageInput?.value ?? ''} (slot ${tileId})`;
        }
      } else {
        context.drawImage(image, 0, 0, 32, 32);
        if (tileImagePreviewHint) {
          tileImagePreviewHint.textContent = String(tileImageInput?.value ?? '').trim() || 'Selected local tile image';
        }
      }

      tileFallbackPreview.style.display = 'none';
      tileImagePreviewCanvas.style.display = 'block';
      resolve(true);
    };
    image.onerror = () => {
      if (tileImagePreviewHint) {
        tileImagePreviewHint.textContent = `Image not found: ${tileImageInput?.value ?? ''}`;
      }
      tileImagePreviewCanvas.style.display = 'none';
      tileFallbackPreview.style.display = 'flex';
      resolve(false);
    };
    image.src = sourceUrl;
    });
  };

  const refreshTileFallbackPreview = async () => {
    if (!tileFallbackPreview || !tileImagePreviewCanvas) {
      return;
    }

    const color = String(tileColorInput?.value ?? '').trim() || '#4f8f4a';
    const label = String(tileLabelInput?.value ?? '').trim() || 'Tile';
    const tileId = forceNumber(tileIdInput?.value ?? String(selected?.id ?? 0), selected?.id ?? 0);
    tileFallbackPreview.style.background = color;
    tileFallbackPreview.textContent = label;

    const pending = state.pendingTileImageImport;
    if (pending && pending.targetId === tileId) {
      await drawPreviewImageFromSource(pending.objectUrl, tileId, false);
      return;
    }

    const sharedTilesetUrl = resolveAssetUrl('/assets/terrain/terrain_tileset.png');
    const drewSharedTilesetSlot = await drawPreviewImageFromSource(sharedTilesetUrl, tileId, true);
    if (drewSharedTilesetSlot) {
      if (tileImagePreviewHint) {
        tileImagePreviewHint.textContent = `Shared tileset slot ${tileId} from /assets/terrain/terrain_tileset.png`;
      }
      return;
    }

    const imagePath = String(tileImageInput?.value ?? '').trim();
    if (!imagePath) {
      tileImagePreviewCanvas.style.display = 'none';
      tileFallbackPreview.style.display = 'flex';
      if (tileImagePreviewHint) {
        tileImagePreviewHint.textContent = 'No image path set.';
      }
      return;
    }

    const imageUrl = resolveAssetUrl(imagePath);
    const shouldCropTileset = /terrain_tileset\.png$/i.test(imagePath) || /terrain_tileset\.png$/i.test(imageUrl);
    await drawPreviewImageFromSource(imageUrl, tileId, shouldCropTileset);
  };

  tileImageInput?.addEventListener('input', refreshTileFallbackPreview);
  tileColorInput?.addEventListener('input', refreshTileFallbackPreview);
  tileLabelInput?.addEventListener('input', refreshTileFallbackPreview);
  tileIdInput?.addEventListener('input', refreshTileFallbackPreview);

  document.querySelector<HTMLButtonElement>('#tile-choose-image')?.addEventListener('click', () => {
    document.querySelector<HTMLInputElement>('#tile-choose-image-input')?.click();
  });
  document.querySelector<HTMLInputElement>('#tile-choose-image-input')?.addEventListener('change', async (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      const current = getSelectedTileDefinition();
      if (!current) {
        throw new Error('Select a tile first.');
      }

      clearPendingImport(state.pendingTileImageImport);
      state.pendingTileImageImport = {
        targetId: current.id,
        file,
        objectUrl: URL.createObjectURL(file),
      };
      setStatus(`Selected local image '${file.name}'. Click Apply Changes to copy it into public/assets/tiles.`);
      void refreshTileFallbackPreview();
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      input.value = '';
    }
  });

  void refreshTileFallbackPreview();

  document.querySelector<HTMLButtonElement>('#tile-add')?.addEventListener('click', () => {
    const maxId = state.tileTypes.reduce((highest, tile) => Math.max(highest, tile.id), -1);
    const id = maxId + 1;
    state.tileTypes.push({
      id,
      label: `Tile ${id}`,
      color: '#4f8f4a',
      walkable: true,
    });
    state.selectedTileId = id;
    render();
  });

  document.querySelector<HTMLButtonElement>('#tile-delete')?.addEventListener('click', () => {
    if (state.selectedTileId === null || state.selectedTileId === undefined) {
      return;
    }

    state.tileTypes = state.tileTypes.filter((entry) => entry.id !== state.selectedTileId);
    state.selectedTileId = state.tileTypes[0]?.id ?? null;
    render();
  });

  document.querySelector<HTMLButtonElement>('#tile-save-row')?.addEventListener('click', async () => {
    const current = getSelectedTileDefinition();
    if (!current) {
      return;
    }

    try {
      debugLog('Tile apply clicked', {
        selectedTileId: current.id,
        hasPendingImage: Boolean(state.pendingTileImageImport),
        hasConnectedFolder: Boolean(state.projectDirectoryHandle),
        projectFolderName: state.projectDirectoryName,
      });

      const previousTileId = current.id;
      const nextId = forceNumber(document.querySelector<HTMLInputElement>('#tile-id')?.value ?? '0', current.id);
      const nextLabel = String(document.querySelector<HTMLInputElement>('#tile-label')?.value ?? '').trim();
      const nextColor = String(document.querySelector<HTMLInputElement>('#tile-color')?.value ?? '').trim();
      const nextImage = String(document.querySelector<HTMLInputElement>('#tile-image')?.value ?? '').trim();
      const nextWalkable = document.querySelector<HTMLSelectElement>('#tile-walkable')?.value !== 'false';

      if (!Number.isFinite(nextId)) {
        throw new Error('Tile id must be a valid number.');
      }

      if (!nextLabel) {
        throw new Error('Tile label is required.');
      }

      if (!nextColor) {
        throw new Error('Tile color is required.');
      }

      const duplicate = state.tileTypes.find((entry) => entry.id === nextId && entry !== current);
      if (duplicate) {
        throw new Error(`Tile id ${nextId} already exists.`);
      }

      current.id = nextId;
      current.label = nextLabel;
      current.color = nextColor;
      current.image = nextImage;
      current.walkable = nextWalkable;

      if (state.pendingTileImageImport && state.pendingTileImageImport.targetId === previousTileId) {
        await writeTileImageIntoTerrainTileset(state.pendingTileImageImport.file, current.id);
        current.image = '/assets/terrain/terrain_tileset.png';
        const imageInput = document.querySelector<HTMLInputElement>('#tile-image');
        if (imageInput) {
          imageInput.value = current.image;
          imageInput.dispatchEvent(new Event('input'));
        }
        clearPendingImport(state.pendingTileImageImport);
        state.pendingTileImageImport = null;
      }

      state.tileTypes.sort((a, b) => a.id - b.id);
      await writeProjectJsonFile('public/data/tileTypes.json', state.tileTypes);

      state.selectedTileId = current.id;
      setStatus(`Updated tile '${current.label}' and saved to public/data/tileTypes.json.`);
      render();
    } catch (error) {
      debugError('Tile apply failed', error);
      setStatus((error as Error).message);
    }
  });

  document.querySelector<HTMLButtonElement>('#tile-export')?.addEventListener('click', async () => {
    try {
      debugLog('Tile save clicked', {
        tileCount: state.tileTypes.length,
        hasConnectedFolder: Boolean(state.projectDirectoryHandle),
        projectFolderName: state.projectDirectoryName,
      });
      await writeProjectJsonFile('public/data/tileTypes.json', state.tileTypes);
      setStatus('Saved directly to public/data/tileTypes.json.');
    } catch (error) {
      debugError('Tile save fell back to download', error);
      downloadJsonFile('tileTypes.json', state.tileTypes);
      setStatus(`Could not write to project folder, downloaded tileTypes.json instead: ${(error as Error).message}`);
    }
  });
}

function renderItemsTab(workspace: HTMLDivElement): void {
  const selected = getSelectedItem();

  workspace.innerHTML = `
    <div class="list-panel">
      <h3>Items</h3>
      <div class="form-actions">
        <button id="item-add" class="action-button">Add Item</button>
        <button id="item-delete" class="action-button">Delete</button>
      </div>
      <div id="item-list" class="list-items"></div>
    </div>
    <div class="form-panel">
      <h3>Item + Gear</h3>
      <div class="preview-card">
        <h4>Image Preview</h4>
        <div class="preview-frame"><img id="item-image-preview" alt="Item preview" style="display:none;" /></div>
        <div id="item-image-preview-hint" class="preview-hint">No image path set.</div>
        <div class="form-actions">
          <button id="item-choose-image" class="action-button" type="button">Choose Local Image</button>
          <input id="item-choose-image-input" type="file" accept="image/*" style="display:none;" />
        </div>
      </div>
      <div class="form-grid">
        <label class="form-field"><span>ID</span><input id="item-id" value="${selected?.item.id ?? ''}" /></label>
        <label class="form-field"><span>Name</span><input id="item-name" value="${selected?.item.name ?? ''}" /></label>
        <label class="form-field"><span>Image</span><input id="item-image" value="${selected?.item.image ?? ''}" /></label>
        <label class="form-field"><span>Stackable</span><select id="item-stackable"><option value="false">false</option><option value="true">true</option></select></label>
        <label class="form-field full"><span>Examine</span><textarea id="item-examine">${selected?.item.examineText ?? ''}</textarea></label>
        <label class="form-field"><span>Gear Slot (optional)</span><input id="gear-slot" value="${selected?.gear?.slot ?? ''}" /></label>
        <label class="form-field"><span>Gear Stats JSON</span><textarea id="gear-stats">${toPrettyJson(selected?.gear?.stats ?? {})}</textarea></label>
        <label class="form-field"><span>Gear Combat JSON</span><textarea id="gear-combat">${toPrettyJson(selected?.gear?.combat ?? {})}</textarea></label>
        <label class="form-field"><span>Gear Skills JSON</span><textarea id="gear-skills">${toPrettyJson(selected?.gear?.skills ?? {})}</textarea></label>
      </div>
      <div class="form-actions">
        <button id="item-save-row" class="action-button">Apply Changes</button>
        <button id="item-export" class="action-button">Save Items + Gear Files</button>
      </div>
      <div class="preview-hint">Place exported files in: <strong>server/data/content/items.json</strong> and <strong>server/data/content/gear.json</strong>.</div>
    </div>
  `;

  const stackSelect = document.querySelector<HTMLSelectElement>('#item-stackable');
  if (stackSelect) {
    stackSelect.value = selected?.item.stackable ? 'true' : 'false';
  }

  const listRoot = document.querySelector<HTMLDivElement>('#item-list');
  if (listRoot) {
    const sorted = [...state.items].sort((a, b) => a.item.id.localeCompare(b.item.id));
    for (const record of sorted) {
      const button = document.createElement('button');
      button.className = `list-button${record.item.id === state.selectedItemId ? ' selected' : ''}`;
      button.textContent = record.item.name;
      button.addEventListener('click', () => {
        state.selectedItemId = record.item.id;
        render();
      });
      listRoot.appendChild(button);
    }
  }

  document.querySelector<HTMLButtonElement>('#item-add')?.addEventListener('click', () => {
    const id = `new_item_${Date.now()}`;
    state.items.push({
      item: {
        id,
        name: 'New item',
        stackable: false,
        image: '/assets/items/new_item.png',
        examineText: 'An unfinished item.',
      },
      gear: null,
    });
    state.selectedItemId = id;
    render();
  });

  bindImagePreview('item-image', 'item-image-preview', 'item-image-preview-hint');

  document.querySelector<HTMLButtonElement>('#item-choose-image')?.addEventListener('click', () => {
    document.querySelector<HTMLInputElement>('#item-choose-image-input')?.click();
  });
  document.querySelector<HTMLInputElement>('#item-choose-image-input')?.addEventListener('change', async (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      const current = getSelectedItem();
      if (!current) {
        throw new Error('Select an item first.');
      }

      clearPendingImport(state.pendingItemImageImport);
      state.pendingItemImageImport = {
        targetId: current.item.id,
        file,
        objectUrl: URL.createObjectURL(file),
      };
      setPreviewFromPendingImport(state.pendingItemImageImport, 'item-image-preview', 'item-image-preview-hint');
      setStatus(`Selected local image '${file.name}'. Click Apply Changes to copy it into public/assets/items.`);
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      input.value = '';
    }
  });

  setPreviewFromPendingImport(state.pendingItemImageImport, 'item-image-preview', 'item-image-preview-hint');

  document.querySelector<HTMLButtonElement>('#item-delete')?.addEventListener('click', () => {
    if (!state.selectedItemId) {
      return;
    }

    state.items = state.items.filter((entry) => entry.item.id !== state.selectedItemId);
    state.selectedItemId = state.items[0]?.item.id ?? null;
    render();
  });

  document.querySelector<HTMLButtonElement>('#item-save-row')?.addEventListener('click', async () => {
    const current = getSelectedItem();
    if (!current) {
      return;
    }

    try {
      debugLog('Item apply clicked', {
        selectedItemId: current.item.id,
        hasPendingImage: Boolean(state.pendingItemImageImport),
        hasConnectedFolder: Boolean(state.projectDirectoryHandle),
        projectFolderName: state.projectDirectoryName,
      });
      const previousItemId = current.item.id;
      const id = String((document.querySelector<HTMLInputElement>('#item-id')?.value ?? '').trim());
      if (!id) {
        throw new Error('Item id is required.');
      }

      current.item.id = id;
      current.item.name = String(document.querySelector<HTMLInputElement>('#item-name')?.value ?? '').trim();
      current.item.image = String(document.querySelector<HTMLInputElement>('#item-image')?.value ?? '').trim();
      current.item.examineText = String(document.querySelector<HTMLTextAreaElement>('#item-examine')?.value ?? '').trim();
      current.item.stackable = document.querySelector<HTMLSelectElement>('#item-stackable')?.value === 'true';

      if (state.pendingItemImageImport && state.pendingItemImageImport.targetId === previousItemId) {
        const imagePath = await copyLocalImageToAssets(state.pendingItemImageImport.file, 'items');
        current.item.image = imagePath;
        const imageInput = document.querySelector<HTMLInputElement>('#item-image');
        if (imageInput) {
          imageInput.value = imagePath;
          imageInput.dispatchEvent(new Event('input'));
        }
        clearPendingImport(state.pendingItemImageImport);
        state.pendingItemImageImport = null;
      }

      const gearSlot = String(document.querySelector<HTMLInputElement>('#gear-slot')?.value ?? '').trim();
      if (!gearSlot) {
        current.gear = null;
      } else {
        current.gear = {
          itemId: current.item.id,
          slot: gearSlot,
          stats: parseJsonField('gear stats', document.querySelector<HTMLTextAreaElement>('#gear-stats')?.value ?? '{}', {}),
          combat: parseJsonField('gear combat', document.querySelector<HTMLTextAreaElement>('#gear-combat')?.value ?? '{}', {}),
          skills: parseJsonField('gear skills', document.querySelector<HTMLTextAreaElement>('#gear-skills')?.value ?? '{}', {}),
        };
      }

      const itemsPayload = state.items.map((entry) => entry.item);
      const gearPayload = state.items
        .map((entry) => entry.gear)
        .filter((entry): entry is GearDefinition => Boolean(entry));
      await writeProjectJsonFile('server/data/content/items.json', itemsPayload);
      await writeProjectJsonFile('server/data/content/gear.json', gearPayload);

      state.selectedItemId = current.item.id;
      setStatus(`Updated item '${current.item.id}' and saved to server/data/content/items.json + gear.json.`);
      render();
    } catch (error) {
      debugError('Item apply failed', error);
      setStatus((error as Error).message);
    }
  });

  document.querySelector<HTMLButtonElement>('#item-export')?.addEventListener('click', async () => {
    const items = state.items.map((entry) => entry.item);
    const gear = state.items
      .map((entry) => entry.gear)
      .filter((entry): entry is GearDefinition => Boolean(entry));

    try {
      debugLog('Item save clicked', {
        itemsCount: items.length,
        gearCount: gear.length,
        hasConnectedFolder: Boolean(state.projectDirectoryHandle),
        projectFolderName: state.projectDirectoryName,
      });
      await writeProjectJsonFile('server/data/content/items.json', items);
      await writeProjectJsonFile('server/data/content/gear.json', gear);
      setStatus('Saved directly to server/data/content/items.json and server/data/content/gear.json.');
    } catch (error) {
      debugError('Item save fell back to download', error);
      downloadJsonFile('items.json', items);
      downloadJsonFile('gear.json', gear);
      setStatus(`Could not write to project folder, downloaded files instead: ${(error as Error).message}`);
    }
  });
}

function renderNpcsTab(workspace: HTMLDivElement): void {
  const selected = getSelectedNpc();

  workspace.innerHTML = `
    <div class="list-panel">
      <h3>NPCs</h3>
      <div class="form-actions">
        <button id="npc-add" class="action-button">Add NPC</button>
        <button id="npc-delete" class="action-button">Delete</button>
      </div>
      <div id="npc-list" class="list-items"></div>
    </div>
    <div class="form-panel">
      <h3>NPC / Object</h3>
      <div class="preview-card">
        <h4>Image Preview</h4>
        <div class="preview-frame"><img id="npc-image-preview" alt="NPC preview" style="display:none;" /></div>
        <div id="npc-image-preview-hint" class="preview-hint">No image path set.</div>
        <div class="form-actions">
          <button id="npc-choose-image" class="action-button" type="button">Choose Local Image</button>
          <input id="npc-choose-image-input" type="file" accept="image/*" style="display:none;" />
        </div>
      </div>
      <div class="form-grid">
        <label class="form-field"><span>ID</span><input id="npc-id" value="${selected?.id ?? ''}" /></label>
        <label class="form-field"><span>Type</span><input id="npc-type" value="${selected?.type ?? ''}" /></label>
        <label class="form-field"><span>Name</span><input id="npc-name" value="${selected?.name ?? ''}" /></label>
        <label class="form-field full"><span>Image</span><input id="npc-image" value="${selected?.image ?? ''}" /></label>
        <label class="form-field"><span>Chunk X</span><input id="npc-chunk-x" value="${selected?.chunkX ?? 0}" /></label>
        <label class="form-field"><span>Chunk Y</span><input id="npc-chunk-y" value="${selected?.chunkY ?? 0}" /></label>
        <label class="form-field"><span>Tile X</span><input id="npc-tile-x" value="${selected?.tileX ?? 0}" /></label>
        <label class="form-field"><span>Tile Y</span><input id="npc-tile-y" value="${selected?.tileY ?? 0}" /></label>
        <label class="form-field full"><span>Examine</span><textarea id="npc-examine">${selected?.examineText ?? ''}</textarea></label>
        <label class="form-field full"><span>Talk Text</span><textarea id="npc-talk">${selected?.talkText ?? ''}</textarea></label>
        <label class="form-field full"><span>Quest Start IDs (comma-separated)</span><input id="npc-quests" value="${(selected?.questStartIds ?? []).join(', ')}" /></label>
      </div>
      <div class="form-actions">
        <button id="npc-save-row" class="action-button">Apply Changes</button>
        <button id="npc-export" class="action-button">Save worldMap.json</button>
      </div>
    </div>
  `;

  const listRoot = document.querySelector<HTMLDivElement>('#npc-list');
  if (listRoot) {
    const sorted = [...state.npcs].sort((a, b) => a.id.localeCompare(b.id));
    for (const npc of sorted) {
      const button = document.createElement('button');
      button.className = `list-button${npc.id === state.selectedNpcId ? ' selected' : ''}`;
      button.style.display = 'flex';
      button.style.alignItems = 'center';
      button.style.gap = '8px';

      const image = document.createElement('img');
      image.alt = `${npc.name} preview`;
      image.width = 24;
      image.height = 24;
      image.style.width = '24px';
      image.style.height = '24px';
      image.style.objectFit = 'cover';
      image.style.borderRadius = '4px';
      image.style.border = '1px solid rgba(255,255,255,0.25)';
      const fallbackImage = buildNpcFallbackAvatarDataUrl(npc);
      const configuredImage = String(npc.image ?? '').trim();
      image.src = configuredImage ? resolveAssetUrl(configuredImage) : fallbackImage;
      image.addEventListener('error', () => {
        image.src = fallbackImage;
      });

      const label = document.createElement('span');
      label.textContent = npc.name;

      button.append(image, label);
      button.addEventListener('click', () => {
        state.selectedNpcId = npc.id;
        render();
      });
      listRoot.appendChild(button);
    }
  }

  document.querySelector<HTMLButtonElement>('#npc-add')?.addEventListener('click', () => {
    const firstChunk = state.worldMap?.chunks[0];
    const id = `npc-new-${Date.now()}`;
    state.npcs.push({
      id,
      type: 'villager',
      name: 'New NPC',
      image: '/assets/npcs/new_npc.png',
      chunkX: Number(firstChunk?.chunkX ?? 0),
      chunkY: Number(firstChunk?.chunkY ?? 0),
      tileX: 0,
      tileY: 0,
      examineText: 'A newly created NPC.',
      talkText: 'Hello there.',
      questStartIds: [],
    });
    state.selectedNpcId = id;
    render();
  });

  document.querySelector<HTMLButtonElement>('#npc-delete')?.addEventListener('click', () => {
    if (!state.selectedNpcId) {
      return;
    }

    state.npcs = state.npcs.filter((entry) => entry.id !== state.selectedNpcId);
    state.selectedNpcId = state.npcs[0]?.id ?? null;
    render();
  });

  document.querySelector<HTMLButtonElement>('#npc-save-row')?.addEventListener('click', async () => {
    const current = getSelectedNpc();
    if (!current) {
      return;
    }

    try {
      debugLog('NPC apply clicked', {
        selectedNpcId: current.id,
        hasPendingImage: Boolean(state.pendingNpcImageImport),
        hasConnectedFolder: Boolean(state.projectDirectoryHandle),
        projectFolderName: state.projectDirectoryName,
      });
      const previousNpcId = current.id;
      current.id = String(document.querySelector<HTMLInputElement>('#npc-id')?.value ?? '').trim();
      current.type = String(document.querySelector<HTMLInputElement>('#npc-type')?.value ?? '').trim();
      current.name = String(document.querySelector<HTMLInputElement>('#npc-name')?.value ?? '').trim();
      current.image = String(document.querySelector<HTMLInputElement>('#npc-image')?.value ?? '').trim();
      current.chunkX = forceNumber(document.querySelector<HTMLInputElement>('#npc-chunk-x')?.value ?? '0');
      current.chunkY = forceNumber(document.querySelector<HTMLInputElement>('#npc-chunk-y')?.value ?? '0');
      current.tileX = forceNumber(document.querySelector<HTMLInputElement>('#npc-tile-x')?.value ?? '0');
      current.tileY = forceNumber(document.querySelector<HTMLInputElement>('#npc-tile-y')?.value ?? '0');
      current.examineText = String(document.querySelector<HTMLTextAreaElement>('#npc-examine')?.value ?? '').trim();
      current.talkText = String(document.querySelector<HTMLTextAreaElement>('#npc-talk')?.value ?? '').trim();
      current.questStartIds = String(document.querySelector<HTMLInputElement>('#npc-quests')?.value ?? '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);

      if (state.pendingNpcImageImport && state.pendingNpcImageImport.targetId === previousNpcId) {
        const imagePath = await copyLocalImageToAssets(state.pendingNpcImageImport.file, 'npcs');
        current.image = imagePath;
        const imageInput = document.querySelector<HTMLInputElement>('#npc-image');
        if (imageInput) {
          imageInput.value = imagePath;
          imageInput.dispatchEvent(new Event('input'));
        }
        clearPendingImport(state.pendingNpcImageImport);
        state.pendingNpcImageImport = null;
      }

      const updatedMap = buildWorldMapWithNpcChanges();
      await writeProjectJsonFile('public/data/worldMap.json', updatedMap);

      state.selectedNpcId = current.id;
      setStatus(`Updated NPC '${current.id}' and saved to public/data/worldMap.json.`);
      render();
    } catch (error) {
      debugError('NPC apply failed', error);
      setStatus((error as Error).message);
    }
  });

  document.querySelector<HTMLButtonElement>('#npc-export')?.addEventListener('click', async () => {
    if (!state.worldMap) {
      setStatus('World map data is not loaded.');
      return;
    }

    const updatedMap = buildWorldMapWithNpcChanges();

    try {
      debugLog('NPC save clicked', {
        npcCount: state.npcs.length,
        hasConnectedFolder: Boolean(state.projectDirectoryHandle),
        projectFolderName: state.projectDirectoryName,
      });
      await writeProjectJsonFile('public/data/worldMap.json', updatedMap);
      setStatus('Saved directly to public/data/worldMap.json.');
    } catch (error) {
      debugError('NPC save fell back to download', error);
      downloadJsonFile('worldMap.json', updatedMap);
      setStatus(`Could not write to project folder, downloaded worldMap.json instead: ${(error as Error).message}`);
    }
  });

  bindImagePreview('npc-image', 'npc-image-preview', 'npc-image-preview-hint');

  const applyNpcPreviewFallback = (): void => {
    const activeNpc = getSelectedNpc();
    if (!activeNpc || String(activeNpc.image ?? '').trim()) {
      return;
    }

    const image = document.querySelector<HTMLImageElement>('#npc-image-preview');
    const hint = document.querySelector<HTMLDivElement>('#npc-image-preview-hint');
    if (!image || !hint) {
      return;
    }

    image.style.display = 'block';
    image.src = buildNpcFallbackAvatarDataUrl(activeNpc);
    hint.textContent = 'Using generated preview (no image path set).';
  };

  document.querySelector<HTMLButtonElement>('#npc-choose-image')?.addEventListener('click', () => {
    document.querySelector<HTMLInputElement>('#npc-choose-image-input')?.click();
  });
  document.querySelector<HTMLInputElement>('#npc-choose-image-input')?.addEventListener('change', async (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      const current = getSelectedNpc();
      if (!current) {
        throw new Error('Select an NPC first.');
      }

      clearPendingImport(state.pendingNpcImageImport);
      state.pendingNpcImageImport = {
        targetId: current.id,
        file,
        objectUrl: URL.createObjectURL(file),
      };
      setPreviewFromPendingImport(state.pendingNpcImageImport, 'npc-image-preview', 'npc-image-preview-hint');
      setStatus(`Selected local image '${file.name}'. Click Apply Changes to copy it into public/assets/npcs.`);
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      input.value = '';
    }
  });

  setPreviewFromPendingImport(state.pendingNpcImageImport, 'npc-image-preview', 'npc-image-preview-hint');
  if (!state.pendingNpcImageImport) {
    applyNpcPreviewFallback();
  }
}

function renderMinionsTab(workspace: HTMLDivElement): void {
  const selected = getSelectedMinion();

  workspace.innerHTML = `
    <div class="list-panel">
      <h3>Minions</h3>
      <div class="form-actions">
        <button id="minion-add" class="action-button">Add Minion</button>
        <button id="minion-delete" class="action-button">Delete</button>
      </div>
      <div id="minion-list" class="list-items"></div>
    </div>
    <div class="form-panel">
      <h3>Minion</h3>
      <div class="preview-card">
        <h4>Image Preview</h4>
        <div class="preview-frame"><img id="minion-image-preview" alt="Minion preview" style="display:none;" /></div>
        <div id="minion-image-preview-hint" class="preview-hint">No image path set.</div>
        <div class="form-actions">
          <button id="minion-choose-image" class="action-button" type="button">Choose Local Image</button>
          <input id="minion-choose-image-input" type="file" accept="image/*" style="display:none;" />
        </div>
      </div>
      <div class="form-grid">
        <label class="form-field"><span>ID</span><input id="minion-id" value="${selected?.id ?? ''}" /></label>
        <label class="form-field"><span>Type</span><input id="minion-type" value="${selected?.type ?? ''}" /></label>
        <label class="form-field"><span>Name</span><input id="minion-name" value="${selected?.name ?? ''}" /></label>
        <label class="form-field full"><span>Image</span><input id="minion-image" value="${selected?.image ?? ''}" /></label>
        <label class="form-field"><span>Max HP</span><input id="minion-maxHp" value="${selected?.maxHp ?? 0}" /></label>
        <label class="form-field"><span>Armor</span><input id="minion-armor" value="${selected?.armor ?? 0}" /></label>
        <label class="form-field"><span>Attack Accuracy</span><input id="minion-attackAccuracy" value="${selected?.attackAccuracy ?? 0}" /></label>
        <label class="form-field"><span>Damage Min</span><input id="minion-attackDamageMin" value="${selected?.attackDamageMin ?? 0}" /></label>
        <label class="form-field"><span>Damage Max</span><input id="minion-attackDamageMax" value="${selected?.attackDamageMax ?? 0}" /></label>
        <label class="form-field"><span>Attack Cooldown (ms)</span><input id="minion-attackCooldownMs" value="${selected?.attackCooldownMs ?? 0}" /></label>
        <label class="form-field"><span>Aggro Range</span><input id="minion-aggroRangeTiles" value="${selected?.aggroRangeTiles ?? 0}" /></label>
        <label class="form-field"><span>Respawn (ms)</span><input id="minion-respawnMs" value="${selected?.respawnMs ?? 0}" /></label>
        <label class="form-field"><span>Max Chase Distance</span><input id="minion-maxChaseDistanceTiles" value="${selected?.maxChaseDistanceTiles ?? 0}" /></label>
        <label class="form-field"><span>HP Regen Interval (ms)</span><input id="minion-hpRegenIntervalMs" value="${selected?.hpRegenIntervalMs ?? 0}" /></label>
        <label class="form-field"><span>HP Regen Amount</span><input id="minion-hpRegenAmount" value="${selected?.hpRegenAmount ?? 0}" /></label>
        <label class="form-field full"><span>Examine</span><textarea id="minion-examineText">${selected?.examineText ?? ''}</textarea></label>
        <label class="form-field"><span>Tier Scaling JSON</span><textarea id="minion-tierScaling">${toPrettyJson(selected?.tierScaling ?? {})}</textarea></label>
        <label class="form-field"><span>Guaranteed Drops JSON</span><textarea id="minion-guaranteedDrops">${toPrettyJson(selected?.guaranteedDrops ?? [])}</textarea></label>
        <label class="form-field"><span>Loot Table JSON</span><textarea id="minion-lootTable">${toPrettyJson(selected?.lootTable ?? [])}</textarea></label>
        <label class="form-field"><span>Tier Examine JSON</span><textarea id="minion-tierExamineText">${toPrettyJson(selected?.tierExamineText ?? {})}</textarea></label>
      </div>
      <div class="form-actions">
        <button id="minion-save-row" class="action-button">Apply Changes</button>
        <button id="minion-export" class="action-button">Save minions.json</button>
      </div>
    </div>
  `;

  const listRoot = document.querySelector<HTMLDivElement>('#minion-list');
  if (listRoot) {
    const sorted = [...state.minions].sort((a, b) => a.id.localeCompare(b.id));
    for (const minion of sorted) {
      const button = document.createElement('button');
      button.className = `list-button${minion.id === state.selectedMinionId ? ' selected' : ''}`;
      button.textContent = minion.name;
      button.addEventListener('click', () => {
        state.selectedMinionId = minion.id;
        render();
      });
      listRoot.appendChild(button);
    }
  }

  document.querySelector<HTMLButtonElement>('#minion-add')?.addEventListener('click', () => {
    const id = `new_minion_${Date.now()}`;
    state.minions.push({
      id,
      type: 'custom',
      name: 'New Minion',
      image: '/assets/minions/new_minion.png',
      maxHp: 50,
      armor: 5,
      attackAccuracy: 10,
      attackDamageMin: 2,
      attackDamageMax: 5,
      attackCooldownMs: 1200,
      aggroRangeTiles: 4,
      respawnMs: 7000,
      maxChaseDistanceTiles: 10,
      hpRegenIntervalMs: 2500,
      hpRegenAmount: 1,
      tierScaling: { statMultiplierPerTier: 0.1, lootMultiplierPerTier: 0.1 },
      guaranteedDrops: [],
      lootTable: [],
      examineText: 'A newly created minion.',
      tierExamineText: {},
    });
    state.selectedMinionId = id;
    render();
  });

  document.querySelector<HTMLButtonElement>('#minion-delete')?.addEventListener('click', () => {
    if (!state.selectedMinionId) {
      return;
    }

    state.minions = state.minions.filter((entry) => entry.id !== state.selectedMinionId);
    state.selectedMinionId = state.minions[0]?.id ?? null;
    render();
  });

  document.querySelector<HTMLButtonElement>('#minion-save-row')?.addEventListener('click', async () => {
    const current = getSelectedMinion();
    if (!current) {
      return;
    }

    try {
      debugLog('Minion apply clicked', {
        selectedMinionId: current.id,
        hasPendingImage: Boolean(state.pendingMinionImageImport),
        hasConnectedFolder: Boolean(state.projectDirectoryHandle),
        projectFolderName: state.projectDirectoryName,
      });
      const previousMinionId = current.id;
      current.id = String(document.querySelector<HTMLInputElement>('#minion-id')?.value ?? '').trim();
      current.type = String(document.querySelector<HTMLInputElement>('#minion-type')?.value ?? '').trim();
      current.name = String(document.querySelector<HTMLInputElement>('#minion-name')?.value ?? '').trim();
      current.image = String(document.querySelector<HTMLInputElement>('#minion-image')?.value ?? '').trim();
      current.maxHp = forceNumber(document.querySelector<HTMLInputElement>('#minion-maxHp')?.value ?? '0');
      current.armor = forceNumber(document.querySelector<HTMLInputElement>('#minion-armor')?.value ?? '0');
      current.attackAccuracy = forceNumber(document.querySelector<HTMLInputElement>('#minion-attackAccuracy')?.value ?? '0');
      current.attackDamageMin = forceNumber(document.querySelector<HTMLInputElement>('#minion-attackDamageMin')?.value ?? '0');
      current.attackDamageMax = forceNumber(document.querySelector<HTMLInputElement>('#minion-attackDamageMax')?.value ?? '0');
      current.attackCooldownMs = forceNumber(document.querySelector<HTMLInputElement>('#minion-attackCooldownMs')?.value ?? '0');
      current.aggroRangeTiles = forceNumber(document.querySelector<HTMLInputElement>('#minion-aggroRangeTiles')?.value ?? '0');
      current.respawnMs = forceNumber(document.querySelector<HTMLInputElement>('#minion-respawnMs')?.value ?? '0');
      current.maxChaseDistanceTiles = forceNumber(document.querySelector<HTMLInputElement>('#minion-maxChaseDistanceTiles')?.value ?? '0');
      current.hpRegenIntervalMs = forceNumber(document.querySelector<HTMLInputElement>('#minion-hpRegenIntervalMs')?.value ?? '0');
      current.hpRegenAmount = forceNumber(document.querySelector<HTMLInputElement>('#minion-hpRegenAmount')?.value ?? '0');
      current.examineText = String(document.querySelector<HTMLTextAreaElement>('#minion-examineText')?.value ?? '').trim();
      current.tierScaling = parseJsonField('tierScaling', document.querySelector<HTMLTextAreaElement>('#minion-tierScaling')?.value ?? '{}', {});
      current.guaranteedDrops = parseJsonField('guaranteedDrops', document.querySelector<HTMLTextAreaElement>('#minion-guaranteedDrops')?.value ?? '[]', []);
      current.lootTable = parseJsonField('lootTable', document.querySelector<HTMLTextAreaElement>('#minion-lootTable')?.value ?? '[]', []);
      current.tierExamineText = parseJsonField('tierExamineText', document.querySelector<HTMLTextAreaElement>('#minion-tierExamineText')?.value ?? '{}', {});

      if (state.pendingMinionImageImport && state.pendingMinionImageImport.targetId === previousMinionId) {
        const imagePath = await copyLocalImageToAssets(state.pendingMinionImageImport.file, 'minions');
        current.image = imagePath;
        const imageInput = document.querySelector<HTMLInputElement>('#minion-image');
        if (imageInput) {
          imageInput.value = imagePath;
          imageInput.dispatchEvent(new Event('input'));
        }
        clearPendingImport(state.pendingMinionImageImport);
        state.pendingMinionImageImport = null;
      }

      await writeProjectJsonFile('server/data/content/minions.json', state.minions);

      state.selectedMinionId = current.id;
      setStatus(`Updated minion '${current.id}' and saved to server/data/content/minions.json.`);
      render();
    } catch (error) {
      debugError('Minion apply failed', error);
      setStatus((error as Error).message);
    }
  });

  document.querySelector<HTMLButtonElement>('#minion-export')?.addEventListener('click', async () => {
    try {
      debugLog('Minion save clicked', {
        minionCount: state.minions.length,
        hasConnectedFolder: Boolean(state.projectDirectoryHandle),
        projectFolderName: state.projectDirectoryName,
      });
      await writeProjectJsonFile('server/data/content/minions.json', state.minions);
      setStatus('Saved directly to server/data/content/minions.json.');
    } catch (error) {
      debugError('Minion save fell back to download', error);
      downloadJsonFile('minions.json', state.minions);
      setStatus(`Could not write to project folder, downloaded minions.json instead: ${(error as Error).message}`);
    }
  });

  bindImagePreview('minion-image', 'minion-image-preview', 'minion-image-preview-hint');

  document.querySelector<HTMLButtonElement>('#minion-choose-image')?.addEventListener('click', () => {
    document.querySelector<HTMLInputElement>('#minion-choose-image-input')?.click();
  });
  document.querySelector<HTMLInputElement>('#minion-choose-image-input')?.addEventListener('change', async (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      const current = getSelectedMinion();
      if (!current) {
        throw new Error('Select a minion first.');
      }

      clearPendingImport(state.pendingMinionImageImport);
      state.pendingMinionImageImport = {
        targetId: current.id,
        file,
        objectUrl: URL.createObjectURL(file),
      };
      setPreviewFromPendingImport(state.pendingMinionImageImport, 'minion-image-preview', 'minion-image-preview-hint');
      setStatus(`Selected local image '${file.name}'. Click Apply Changes to copy it into public/assets/minions.`);
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      input.value = '';
    }
  });

  setPreviewFromPendingImport(state.pendingMinionImageImport, 'minion-image-preview', 'minion-image-preview-hint');
}

function renderRecipesTab(workspace: HTMLDivElement): void {
  const skill = state.selectedRecipeSkill;
  const config = state.craftingConfigs[skill];
  const selected = getSelectedRecipe();
  const stationType = CRAFTING_STATION_BY_SKILL[skill];

  workspace.innerHTML = `
    <div class="list-panel">
      <h3>Recipes</h3>
      <div class="row">
        <label for="recipe-skill-select">Skill</label>
        <select id="recipe-skill-select">
          ${CRAFTING_SKILL_ORDER.map((entry) => `<option value="${entry}">${entry}</option>`).join('')}
        </select>
      </div>
      <div class="form-actions">
        <button id="recipe-add" class="action-button">Add Recipe</button>
        <button id="recipe-delete" class="action-button">Delete</button>
      </div>
      <div id="recipe-list" class="list-items"></div>
    </div>
    <div class="form-panel">
      <h3>Recipe</h3>
      <div class="form-grid">
        <label class="form-field"><span>ID</span><input id="recipe-id" value="${selected?.id ?? ''}" /></label>
        <label class="form-field"><span>Name</span><input id="recipe-name" value="${selected?.name ?? ''}" /></label>
        <label class="form-field"><span>Required Level</span><input id="recipe-required-level" type="number" min="1" value="${selected?.requiredLevel ?? 1}" /></label>
        <label class="form-field"><span>Duration (ms)</span><input id="recipe-duration-ms" type="number" min="100" value="${selected?.durationMs ?? 1500}" /></label>
        <label class="form-field"><span>Success Chance</span><input id="recipe-success-chance" type="number" min="0" max="1" step="0.01" value="${selected?.successChance ?? 1}" /></label>
        <label class="form-field"><span>XP</span><input id="recipe-xp" type="number" min="0" step="0.1" value="${selected?.xp ?? 0}" /></label>
        <label class="form-field"><span>Crafting Table</span>
          <select id="recipe-station-type">
            <option value="smelting_station">smelting_station</option>
            <option value="smithing_station">smithing_station</option>
            <option value="fletching_station">fletching_station</option>
          </select>
        </label>
        <label class="form-field full"><span>Inputs JSON (itemId + quantity)</span><textarea id="recipe-inputs">${toPrettyJson(selected?.inputs ?? [])}</textarea></label>
        <label class="form-field full"><span>Outputs JSON (itemId + quantity)</span><textarea id="recipe-outputs">${toPrettyJson(selected?.outputs ?? [])}</textarea></label>
      </div>

      <h3>Skill Messages</h3>
      <div class="form-grid">
        <label class="form-field full"><span>Locked</span><textarea id="recipe-message-locked">${config.messages?.locked ?? ''}</textarea></label>
        <label class="form-field full"><span>Missing Items</span><textarea id="recipe-message-missing">${config.messages?.missingItems ?? ''}</textarea></label>
        <label class="form-field full"><span>Success</span><textarea id="recipe-message-success">${config.messages?.success ?? ''}</textarea></label>
        <label class="form-field full"><span>Failure</span><textarea id="recipe-message-failure">${config.messages?.failure ?? ''}</textarea></label>
      </div>

      <div class="form-actions">
        <button id="recipe-save-row" class="action-button">Apply Recipe</button>
        <button id="recipe-save-skill" class="action-button">Save Current Skill</button>
        <button id="recipe-save-all" class="action-button">Save All Recipe Files</button>
      </div>
      <div class="preview-hint">Files: <strong>server/data/skills/crafting/smelting.json</strong>, <strong>smithing.json</strong>, <strong>fletching.json</strong>.</div>
    </div>
  `;

  const skillSelect = document.querySelector<HTMLSelectElement>('#recipe-skill-select');
  const stationSelect = document.querySelector<HTMLSelectElement>('#recipe-station-type');
  if (skillSelect) {
    skillSelect.value = skill;
  }
  if (stationSelect) {
    stationSelect.value = stationType;
  }

  const listRoot = document.querySelector<HTMLDivElement>('#recipe-list');
  if (listRoot) {
    const sorted = [...config.recipes].sort((a, b) => a.id.localeCompare(b.id));
    for (const recipe of sorted) {
      const button = document.createElement('button');
      button.className = `list-button${recipe.id === state.selectedRecipeIdBySkill[skill] ? ' selected' : ''}`;
      button.textContent = recipe.name;
      button.addEventListener('click', () => {
        state.selectedRecipeIdBySkill[skill] = recipe.id;
        render();
      });
      listRoot.appendChild(button);
    }
  }

  skillSelect?.addEventListener('change', () => {
    state.selectedRecipeSkill = normalizeCraftingSkillId(skillSelect.value);
    if (!state.selectedRecipeIdBySkill[state.selectedRecipeSkill]) {
      state.selectedRecipeIdBySkill[state.selectedRecipeSkill] = state.craftingConfigs[state.selectedRecipeSkill].recipes[0]?.id;
    }
    render();
  });

  document.querySelector<HTMLButtonElement>('#recipe-add')?.addEventListener('click', () => {
    const targetSkill = state.selectedRecipeSkill;
    const targetConfig = state.craftingConfigs[targetSkill];
    const id = `new_recipe_${Date.now()}`;
    targetConfig.recipes.push({
      id,
      name: 'New Recipe',
      requiredLevel: 1,
      durationMs: 1500,
      successChance: 1,
      xp: 1,
      inputs: [{ itemId: 'placeholder_input', quantity: 1 }],
      outputs: [{ itemId: 'placeholder_output', quantity: 1 }],
    });
    state.selectedRecipeIdBySkill[targetSkill] = id;
    render();
  });

  document.querySelector<HTMLButtonElement>('#recipe-delete')?.addEventListener('click', () => {
    const targetSkill = state.selectedRecipeSkill;
    const selectedRecipeId = state.selectedRecipeIdBySkill[targetSkill];
    if (!selectedRecipeId) {
      return;
    }

    const targetConfig = state.craftingConfigs[targetSkill];
    targetConfig.recipes = targetConfig.recipes.filter((entry) => entry.id !== selectedRecipeId);
    state.selectedRecipeIdBySkill[targetSkill] = targetConfig.recipes[0]?.id;
    render();
  });

  document.querySelector<HTMLButtonElement>('#recipe-save-row')?.addEventListener('click', async () => {
    const currentSkill = state.selectedRecipeSkill;
    const currentConfig = state.craftingConfigs[currentSkill];
    const currentRecipeId = state.selectedRecipeIdBySkill[currentSkill];
    const currentRecipe = currentConfig.recipes.find((entry) => entry.id === currentRecipeId);
    if (!currentRecipe) {
      return;
    }

    try {
      const nextId = String(document.querySelector<HTMLInputElement>('#recipe-id')?.value ?? '').trim();
      if (!nextId) {
        throw new Error('Recipe id is required.');
      }

      const targetStation = String(document.querySelector<HTMLSelectElement>('#recipe-station-type')?.value ?? stationType) as CraftingStationType;
      const targetSkill = CRAFTING_SKILL_BY_STATION[targetStation] ?? currentSkill;
      const targetConfig = state.craftingConfigs[targetSkill];

      const inputsRaw = parseJsonField<unknown[]>('recipe inputs', document.querySelector<HTMLTextAreaElement>('#recipe-inputs')?.value ?? '[]', []);
      const outputsRaw = parseJsonField<unknown[]>('recipe outputs', document.querySelector<HTMLTextAreaElement>('#recipe-outputs')?.value ?? '[]', []);

      const inputs = inputsRaw.map((entry) => normalizeRecipeItemStack(entry)).filter((entry): entry is RecipeItemStack => entry !== null);
      const outputs = outputsRaw.map((entry) => normalizeRecipeItemStack(entry)).filter((entry): entry is RecipeItemStack => entry !== null);

      if (inputs.length === 0) {
        throw new Error('Recipe requires at least one valid input item stack.');
      }
      if (outputs.length === 0) {
        throw new Error('Recipe requires at least one valid output item stack.');
      }

      const duplicateInTarget = targetConfig.recipes.find((entry) => entry.id === nextId && entry !== currentRecipe);
      if (duplicateInTarget) {
        throw new Error(`Recipe id '${nextId}' already exists in ${targetSkill}.`);
      }

      currentRecipe.id = nextId;
      currentRecipe.name = String(document.querySelector<HTMLInputElement>('#recipe-name')?.value ?? '').trim() || getItemNameById(outputs[0]?.itemId ?? nextId) || nextId;
      currentRecipe.requiredLevel = Math.max(1, Math.floor(Number(document.querySelector<HTMLInputElement>('#recipe-required-level')?.value ?? '1')));
      currentRecipe.durationMs = Math.max(100, Math.floor(Number(document.querySelector<HTMLInputElement>('#recipe-duration-ms')?.value ?? '1500')));
      currentRecipe.successChance = Math.max(0, Math.min(1, Number(document.querySelector<HTMLInputElement>('#recipe-success-chance')?.value ?? '1')));
      currentRecipe.xp = Math.max(0, Number(document.querySelector<HTMLInputElement>('#recipe-xp')?.value ?? '0'));
      currentRecipe.inputs = inputs;
      currentRecipe.outputs = outputs;

      currentConfig.messages = {
        locked: String(document.querySelector<HTMLTextAreaElement>('#recipe-message-locked')?.value ?? '').trim(),
        missingItems: String(document.querySelector<HTMLTextAreaElement>('#recipe-message-missing')?.value ?? '').trim(),
        success: String(document.querySelector<HTMLTextAreaElement>('#recipe-message-success')?.value ?? '').trim(),
        failure: String(document.querySelector<HTMLTextAreaElement>('#recipe-message-failure')?.value ?? '').trim(),
      };

      if (targetSkill !== currentSkill) {
        currentConfig.recipes = currentConfig.recipes.filter((entry) => entry !== currentRecipe);
        targetConfig.recipes.push(currentRecipe);
        state.selectedRecipeSkill = targetSkill;
      }

      state.selectedRecipeIdBySkill[currentSkill] = state.craftingConfigs[currentSkill].recipes[0]?.id;
      state.selectedRecipeIdBySkill[state.selectedRecipeSkill] = nextId;
      setStatus(`Updated recipe '${nextId}' in ${state.selectedRecipeSkill}.`);
      render();
    } catch (error) {
      setStatus((error as Error).message);
    }
  });

  document.querySelector<HTMLButtonElement>('#recipe-save-skill')?.addEventListener('click', async () => {
    const targetSkill = state.selectedRecipeSkill;
    const targetConfig = state.craftingConfigs[targetSkill];

    try {
      await writeProjectJsonFile(getCraftingFilePathForSkill(targetSkill), targetConfig);
      setStatus(`Saved ${targetSkill} recipes to ${getCraftingFilePathForSkill(targetSkill)}.`);
    } catch (error) {
      downloadJsonFile(`${targetSkill}.json`, targetConfig);
      setStatus(`Could not write ${targetSkill}.json directly; downloaded fallback file: ${(error as Error).message}`);
    }
  });

  document.querySelector<HTMLButtonElement>('#recipe-save-all')?.addEventListener('click', async () => {
    try {
      for (const skillId of CRAFTING_SKILL_ORDER) {
        await writeProjectJsonFile(getCraftingFilePathForSkill(skillId), state.craftingConfigs[skillId]);
      }
      setStatus('Saved all crafting recipe files.');
    } catch (error) {
      for (const skillId of CRAFTING_SKILL_ORDER) {
        downloadJsonFile(`${skillId}.json`, state.craftingConfigs[skillId]);
      }
      setStatus(`Could not write all recipe files directly; downloaded fallback JSON files: ${(error as Error).message}`);
    }
  });
}

function renderPlayerTab(workspace: HTMLDivElement): void {
  const playerAppearance = state.playerAppearance;

  workspace.innerHTML = `
    <div class="list-panel">
      <h3>Player Appearance</h3>
      <div class="preview-hint">Global player visuals used by local + remote players.</div>
    </div>
    <div class="form-panel">
      <h3>Player</h3>
      <div class="preview-card">
        <h4>Image Preview</h4>
        <div class="preview-frame"><img id="player-image-preview" alt="Player preview" style="display:none;" /></div>
        <div id="player-image-preview-hint" class="preview-hint">No image path set.</div>
        <div class="form-actions">
          <button id="player-choose-image" class="action-button" type="button">Choose Local Image</button>
          <input id="player-choose-image-input" type="file" accept="image/*" style="display:none;" />
        </div>
      </div>
      <div class="form-grid">
        <label class="form-field full"><span>Image</span><input id="player-image" value="${playerAppearance.image}" /></label>
      </div>
      <div class="form-actions">
        <button id="player-save-row" class="action-button">Apply Changes</button>
        <button id="player-export" class="action-button">Save playerAppearance.json</button>
      </div>
      <div class="preview-hint">File: <strong>public/data/playerAppearance.json</strong>.</div>
    </div>
  `;

  bindImagePreview('player-image', 'player-image-preview', 'player-image-preview-hint');

  document.querySelector<HTMLButtonElement>('#player-choose-image')?.addEventListener('click', () => {
    document.querySelector<HTMLInputElement>('#player-choose-image-input')?.click();
  });
  document.querySelector<HTMLInputElement>('#player-choose-image-input')?.addEventListener('change', async (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      const imagePath = await copyLocalImageToAssets(file, 'players');
      state.playerAppearance.image = imagePath;
      const imageInput = document.querySelector<HTMLInputElement>('#player-image');
      if (imageInput) {
        imageInput.value = imagePath;
        imageInput.dispatchEvent(new Event('input'));
      }
      setStatus(`Copied player image '${file.name}' to ${imagePath}. Click Apply Changes to save config.`);
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      input.value = '';
    }
  });

  document.querySelector<HTMLButtonElement>('#player-save-row')?.addEventListener('click', async () => {
    try {
      state.playerAppearance.image = String(document.querySelector<HTMLInputElement>('#player-image')?.value ?? '').trim();
      await writeProjectJsonFile('public/data/playerAppearance.json', state.playerAppearance);
      setStatus('Saved player appearance to public/data/playerAppearance.json.');
      render();
    } catch (error) {
      debugError('Player appearance apply failed', error);
      setStatus((error as Error).message);
    }
  });

  document.querySelector<HTMLButtonElement>('#player-export')?.addEventListener('click', async () => {
    try {
      await writeProjectJsonFile('public/data/playerAppearance.json', state.playerAppearance);
      setStatus('Saved directly to public/data/playerAppearance.json.');
    } catch (error) {
      debugError('Player appearance save fell back to download', error);
      downloadJsonFile('playerAppearance.json', state.playerAppearance);
      setStatus(`Could not write to project folder, downloaded playerAppearance.json instead: ${(error as Error).message}`);
    }
  });
}

function render(): void {
  renderTabsActiveState();

  const workspace = document.querySelector<HTMLDivElement>('#workspace');
  if (!workspace) {
    return;
  }

  if (state.tab === 'items') {
    renderItemsTab(workspace);
    return;
  }

  if (state.tab === 'npcs') {
    renderNpcsTab(workspace);
    return;
  }

  if (state.tab === 'recipes') {
    renderRecipesTab(workspace);
    return;
  }

  if (state.tab === 'tiles') {
    renderTilesTab(workspace);
    return;
  }

  if (state.tab === 'worldObjects') {
    renderWorldObjectsTab(workspace);
    return;
  }

  if (state.tab === 'player') {
    renderPlayerTab(workspace);
    return;
  }

  renderMinionsTab(workspace);
}

async function init(): Promise<void> {
  renderShell();

  try {
    const [
      itemsRaw,
      gearRaw,
      minionsRaw,
      worldMapRaw,
      tileTypesRaw,
      worldObjectTypesRaw,
      playerAppearanceRaw,
      smeltingRecipesRaw,
      smithingRecipesRaw,
      fletchingRecipesRaw,
    ] = await Promise.all([
      loadJson<ItemDefinition[]>(ITEMS_URL),
      loadJson<GearDefinition[]>(GEAR_URL),
      loadJson<MinionDefinition[]>(MINIONS_URL),
      loadJson<WorldMapData>(WORLD_MAP_URL),
      loadJson<TileDefinition[]>(TILE_TYPES_URL),
      loadJson<WorldObjectTypeDefinition[]>(WORLD_OBJECT_TYPES_URL),
      loadJson<PlayerAppearanceConfig>(PLAYER_APPEARANCE_URL).catch(() => ({ image: '' })),
      loadJson<CraftingSkillConfig>(SMELTING_RECIPES_URL),
      loadJson<CraftingSkillConfig>(SMITHING_RECIPES_URL),
      loadJson<CraftingSkillConfig>(FLETCHING_RECIPES_URL),
    ]);

    const gearByItemId = new Map<string, GearDefinition>();
    for (const gear of gearRaw) {
      gearByItemId.set(gear.itemId, gear);
    }

    state.items = itemsRaw.map((item) => ({
      item: { ...item },
      gear: gearByItemId.get(item.id) ? { ...gearByItemId.get(item.id)! } : null,
    }));

    state.minions = Array.isArray(minionsRaw)
      ? minionsRaw.map((entry) => {
        const { visualTint: _legacyVisualTint, ...rest } = entry as MinionDefinition & { visualTint?: unknown };
        void _legacyVisualTint;
        return rest;
      })
      : [];
    state.tileTypes = Array.isArray(tileTypesRaw)
      ? tileTypesRaw
        .map((entry) => ({
          id: Number(entry?.id ?? 0),
          label: String(entry?.label ?? ''),
          color: String(entry?.color ?? '#4f8f4a'),
          image: String(entry?.image ?? ''),
          walkable: typeof entry?.walkable === 'boolean' ? entry.walkable : Number(entry?.id ?? 0) !== 2,
        }))
        .filter((entry) => Number.isFinite(entry.id) && entry.label.trim().length > 0)
      : [];
    state.worldObjectTypes = Array.isArray(worldObjectTypesRaw)
      ? worldObjectTypesRaw
        .map((entry) => ({
          id: String(entry?.id ?? '').trim(),
          name: String(entry?.name ?? '').trim(),
          behavior: normalizeWorldObjectBehavior(entry?.behavior),
          blocksMovement: Boolean(entry?.blocksMovement),
          image: String(entry?.image ?? '').trim(),
          examineText: String(entry?.examineText ?? 'A world object.').trim(),
          tags: Array.isArray(entry?.tags)
            ? entry.tags.map((value: unknown) => String(value ?? '').trim()).filter(Boolean)
            : [],
          behaviorConfig:
            entry?.behaviorConfig && typeof entry.behaviorConfig === 'object'
              ? { ...(entry.behaviorConfig as Record<string, unknown>) }
              : {},
        }))
        .filter((entry) => entry.id.length > 0 && entry.name.length > 0)
      : [];
    state.playerAppearance = {
      image: String(playerAppearanceRaw?.image ?? '').trim(),
    };
    state.tileTypes.sort((a, b) => a.id - b.id);
    state.worldObjectTypes.sort((a, b) => a.id.localeCompare(b.id));
    state.craftingConfigs = {
      smelting: normalizeCraftingSkillConfig(smeltingRecipesRaw, 'smelting'),
      smithing: normalizeCraftingSkillConfig(smithingRecipesRaw, 'smithing'),
      fletching: normalizeCraftingSkillConfig(fletchingRecipesRaw, 'fletching'),
    };
    state.worldMap = worldMapRaw;
    state.npcs = [];
    state.hiddenNpcs = [];

    const chunks = Array.isArray(worldMapRaw?.chunks) ? worldMapRaw.chunks : [];
    for (const chunk of chunks) {
      const chunkX = Number(chunk?.chunkX ?? 0);
      const chunkY = Number(chunk?.chunkY ?? 0);
      const chunkNpcs = Array.isArray(chunk?.npcs) ? chunk.npcs : [];
      for (const rawNpc of chunkNpcs) {
        const normalizedNpc = {
          id: String(rawNpc?.id ?? ''),
          type: String(rawNpc?.type ?? 'villager'),
          name: String(rawNpc?.name ?? 'NPC'),
          image: String(rawNpc?.image ?? ''),
          tileX: forceNumber(String(rawNpc?.tileX ?? 0), 0),
          tileY: forceNumber(String(rawNpc?.tileY ?? 0), 0),
          examineText: String(rawNpc?.examineText ?? 'A non-player character.'),
          talkText: String(rawNpc?.talkText ?? 'Hello there.'),
          questStartIds: Array.isArray(rawNpc?.questStartIds)
            ? rawNpc.questStartIds.map((entry: unknown) => String(entry ?? '').trim()).filter(Boolean)
            : [],
          chunkX,
          chunkY,
        };

        if (normalizedNpc.type === 'bank_chest') {
          state.hiddenNpcs.push(normalizedNpc);
          continue;
        }

        state.npcs.push(normalizedNpc);
      }
    }

    state.selectedItemId = state.items[0]?.item.id ?? null;
    state.selectedNpcId = state.npcs[0]?.id ?? null;
    state.selectedMinionId = state.minions[0]?.id ?? null;
    state.selectedTileId = state.tileTypes[0]?.id ?? null;
    state.selectedWorldObjectTypeId = state.worldObjectTypes[0]?.id ?? null;
    state.selectedRecipeSkill = 'smelting';
    for (const skillId of CRAFTING_SKILL_ORDER) {
      state.selectedRecipeIdBySkill[skillId] = state.craftingConfigs[skillId].recipes[0]?.id;
    }

    setStatus('Loaded items, NPCs, minions, recipes, tiles, and world object types. Edit values and use Save buttons to export updated files.');
    render();
  } catch (error) {
    setStatus((error as Error).message);
  }
}

void init();
