# Content + Art Workflow (Items, Crafting, Tiles/Tilesets)

This is the practical checklist for adding/updating game content and visuals in this repo.

---

## 1) Add a New Item

### Files you will edit
- `server/data/content/items.json`
- `public/assets/items/*` (new art file)
- Optional, depending on usage:
  - `server/data/content/gear.json` (if equippable)
  - `server/data/skills/crafting/*.json` (if craftable input/output)
  - `server/data/content/lootTables.json` / `server/data/content/minions.json` (if dropped)
  - shop data in `server/multiplayerServer.mjs` (if sold by shop)

### Steps
1. Add item art to `public/assets/items/` (usually SVG).
2. Add item entry to `server/data/content/items.json`:
   - required: `id`, `name`, `stackable`, `image`, `examineText`
   - `image` must be a web path starting with `/`, e.g. `/assets/items/iron_dagger.svg`
3. If the item is equippable, add a matching `itemId` entry in `server/data/content/gear.json`.
4. If the item is craftable, add recipe references in crafting skill files.
5. If dropped by enemies/loot tables, add references in loot/minion config.

### Validation
- Start server (`npm run dev:server`) or run build (`npm run build`).
- Server fails fast if:
  - item IDs are duplicate/missing
  - required fields are missing
  - image file does not exist under `public/`

---

## 2) Add New Crafting (Recipe)

### Files you will edit
- `server/data/skills/crafting/smelting.json`
- `server/data/skills/crafting/smithing.json`
- `server/data/skills/crafting/fletching.json`
- (or add another `.json` skill file under `server/data/skills/crafting/`)

### Recipe schema (required)
Each recipe must include:
- `id`
- `requiredLevel`
- `durationMs`
- `successChance` (0..1)
- `xp`
- `inputs` (`itemId`, `quantity`)
- `outputs` (`itemId`, `quantity`)

Reference: `server/data/skills/crafting/schema.json`

### Important wiring rules
- Every `itemId` in `inputs/outputs` must already exist in `server/data/content/items.json`.
- Recipes appear in UI based on station type. Current station mapping is in `server/multiplayerServer.mjs` (`CRAFTING_STATIONS`).

### If adding a brand new crafting station type
You must update all of these:
1. `server/multiplayerServer.mjs`
   - Add station in `CRAFTING_STATIONS`
   - Ensure object type maps via `getCraftingStationByObjectType`
2. `src/game/application/interaction/InteractionTargetRuntime.ts`
   - Include the new `objectTypeId` as `object-crafting`
3. `src/mapEditor/main.ts`
   - Add new object type to `OBJECT_TYPES`
4. `src/game/renderers/entitySpriteStyling.ts`
   - Add visual style mapping for new object type

### Validation
- `npm run build`
- Optional smoke: `npm run smoke:crafting`

---

## 3) Add New Tiles / Tile IDs (Terrain Behavior)

Current IDs are effectively:
- `0` Grass
- `1` Dirt
- `2` Water (blocked)
- `3` Sand

### Files you will edit
- `src/game/scenes/BootScene.ts`
  - `tileCount`
  - `paintTile(...)` calls (visual atlas order)
- `src/mapEditor/main.ts`
  - `TILE_TYPES` (editor labels/colors)
- `src/game/scenes/WorldScene.ts`
  - `getTileTypeName(...)` (debug/context menu naming)
  - walkability checks if tile should be blocked
- `server/multiplayerServer.mjs`
  - terrain blocking logic (`isWaterTile` / walkability rules)

### If you add a new blocked tile type
Update both client and server blocking logic, not just one side:
- Client pathing/walkability (`WorldScene.ts`)
- Server authoritative walkability (`multiplayerServer.mjs`)

If they diverge, click-to-move and interaction movement will feel wrong/desync.

---

## 4) New Tilesets / Terrain Art Style

Right now terrain is generated procedurally in `BootScene.ts` via a runtime canvas texture (`terrain-tiles`), not loaded from an external sprite sheet.

### Option A (current pattern, easiest)
- Keep canvas-generated terrain.
- Change colors/patterns in `BootScene.ts` (`paintTile` and tile palette).

### Option B (external tileset art)
If you want a real tileset image, refactor to:
1. Place tileset image in `public/assets/...`
2. Load texture in Boot/Scene preload
3. Replace runtime canvas `terrain-tiles` creation
4. Ensure `addTilesetImage(...)` in `WorldScene.ts` points to correct key/atlas layout
5. Keep tile index meaning consistent with map data

---

## 5) Update Object / NPC / Resource Visuals (Art-wise)

### Object + NPC style tint/shape mappings
- `src/game/renderers/entitySpriteStyling.ts`
  - `styleObjectSprite(...)`
  - `styleNpcSprite(...)`

### Map editor icons for object/NPC previews
- `src/mapEditor/main.ts`
  - `getObjectIcon(...)`
  - `getNpcIcon(...)`

### Harvestable resource/item art
- `server/data/content/resources.json` -> image path in `public/assets/resources/...`
- `server/data/content/items.json` -> image path in `public/assets/items/...`

Server validates referenced files exist.

---

## 6) Updating World Layout / Art Placement (Map Editor)

### Run
- Start app: `npm run dev:all` (or server/client separately)
- Open editor: `/map-editor.html`

### Use editor
- Paint terrain/resources/objects/npcs/monsters
- Click **Save Map**
  - It tries PUT/POST to `public/data/worldMap.json`
  - If direct save fails, it downloads `worldMap.json` so you can replace manually

### Authoritative map file
- `public/data/worldMap.json`

---

## 7) Recommended Verification After Any Content/Art Change

1. `npm run build`
2. Start game and verify in-world visuals
3. For crafting/content changes:
   - `npm run smoke:crafting`
4. For multiplayer movement/interaction feeling:
   - `npm run smoke:multiplayer`

---

## 8) Common Gotchas

- Image paths in content JSON must start with `/` and file must exist under `public/`.
- New crafting station types need updates in multiple places (server mapping + client interaction type + editor + styling).
- New blocked terrain tile IDs must be recognized by both client and server walkability logic.
- Map editor data and runtime assumptions must stay aligned (tile IDs, objectTypeId values, npc type IDs).

---

## 9) Quick Minimal Examples

### New item in `items.json`
```json
{
  "id": "iron_dagger",
  "name": "Iron dagger",
  "stackable": false,
  "image": "/assets/items/iron_dagger.svg",
  "examineText": "A short iron blade."
}
```

### New recipe entry in crafting file
```json
{
  "id": "iron_dagger_recipe",
  "requiredLevel": 5,
  "durationMs": 1600,
  "successChance": 1,
  "xp": 12,
  "inputs": [{ "itemId": "iron_bar", "quantity": 1 }],
  "outputs": [{ "itemId": "iron_dagger", "quantity": 1 }]
}
```
