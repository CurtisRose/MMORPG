import './styles.css';

type EditorTab = 'items' | 'npcs' | 'minions';

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

type PendingImageImport = {
  targetId: string;
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
const DEBUG_PREFIX = '[DataEditor Debug]';

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
  worldMap: WorldMapData | null;
  projectDirectoryHandle: any | null;
  projectDirectoryName: string | null;
  pendingItemImageImport: PendingImageImport | null;
  pendingNpcImageImport: PendingImageImport | null;
  pendingMinionImageImport: PendingImageImport | null;
  selectedItemId: string | null;
  selectedNpcId: string | null;
  selectedMinionId: string | null;
} = {
  tab: 'items',
  items: [],
  minions: [],
  npcs: [],
  worldMap: null,
  projectDirectoryHandle: null,
  projectDirectoryName: null,
  pendingItemImageImport: null,
  pendingNpcImageImport: null,
  pendingMinionImageImport: null,
  selectedItemId: null,
  selectedNpcId: null,
  selectedMinionId: null,
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
      hint.textContent = 'No image path set.';
      return;
    }

    const url = resolveAssetUrl(rawPath);
    image.style.display = 'block';
    image.src = url;
    hint.textContent = rawPath;
  };

  image.addEventListener('error', () => {
    image.style.display = 'none';
    hint.textContent = `Image not found: ${input.value}`;
  });
  image.addEventListener('load', () => {
    image.style.display = 'block';
  });

  input.addEventListener('input', update);
  update();
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
  image.src = pending.objectUrl;
  hint.textContent = `Selected local file: ${pending.file.name}`;
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
      <div class="toolbar">
        <button id="tab-items" class="tab-button">Items</button>
        <button id="tab-npcs" class="tab-button">NPCs</button>
        <button id="tab-minions" class="tab-button">Minions</button>
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
      button.textContent = `${record.item.id} — ${record.item.name}`;
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
        image: '/assets/items/new_item.svg',
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
      button.textContent = `${npc.id} (${npc.chunkX},${npc.chunkY})`;
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
      image: '/assets/npcs/new_npc.svg',
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
      button.textContent = `${minion.id} — ${minion.name}`;
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
      image: '/assets/minions/new_minion.svg',
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

  renderMinionsTab(workspace);
}

async function init(): Promise<void> {
  renderShell();

  try {
    const [itemsRaw, gearRaw, minionsRaw, worldMapRaw] = await Promise.all([
      loadJson<ItemDefinition[]>(ITEMS_URL),
      loadJson<GearDefinition[]>(GEAR_URL),
      loadJson<MinionDefinition[]>(MINIONS_URL),
      loadJson<WorldMapData>(WORLD_MAP_URL),
    ]);

    const gearByItemId = new Map<string, GearDefinition>();
    for (const gear of gearRaw) {
      gearByItemId.set(gear.itemId, gear);
    }

    state.items = itemsRaw.map((item) => ({
      item: { ...item },
      gear: gearByItemId.get(item.id) ? { ...gearByItemId.get(item.id)! } : null,
    }));

    state.minions = Array.isArray(minionsRaw) ? minionsRaw.map((entry) => ({ ...entry })) : [];
    state.worldMap = worldMapRaw;
    state.npcs = [];

    const chunks = Array.isArray(worldMapRaw?.chunks) ? worldMapRaw.chunks : [];
    for (const chunk of chunks) {
      const chunkX = Number(chunk?.chunkX ?? 0);
      const chunkY = Number(chunk?.chunkY ?? 0);
      const chunkNpcs = Array.isArray(chunk?.npcs) ? chunk.npcs : [];
      for (const rawNpc of chunkNpcs) {
        state.npcs.push({
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
        });
      }
    }

    state.selectedItemId = state.items[0]?.item.id ?? null;
    state.selectedNpcId = state.npcs[0]?.id ?? null;
    state.selectedMinionId = state.minions[0]?.id ?? null;

    setStatus('Loaded items, NPCs, and minions. Edit values and use Save buttons to export updated files.');
    render();
  } catch (error) {
    setStatus((error as Error).message);
  }
}

void init();
