# RuneScape-Style Browser Game POC

Multiplayer foundation is now enabled (WebSocket server + synced player positions).
Player save/load persistence is enabled (server-side profiles keyed by a browser-local profile ID).

## What Exists Now
- Vite + TypeScript + Phaser 3 client
- Node WebSocket multiplayer server
- Scene framework (`BootScene` -> `WorldScene`)
- Procedural tilemap pipeline with terrain tiles
- Real-time player presence/position sync between multiple clients

## Run Locally (Multiplayer)
```bash
npm install
npm run dev:all
```

Then open the client URL (usually `http://127.0.0.1:5173/`) in two browser tabs/windows.

## Alternative: Separate Processes
```bash
npm run dev:server
npm run dev:client
```

## Debug Toolkit
- In-game HUD: press `F3` to toggle runtime debug info
- Server debug logs:
```bash
npm run dev:server:debug
```
- Automated multiplayer smoke test:
```bash
npm run smoke:multiplayer
```

## Optional Client Debug Flags
Copy `.env.example` to `.env.local` and adjust values.

```bash
copy .env.example .env.local
```

## Build
```bash
npm run build
npm run preview
```

## Persistence Notes
- Character state (position, HP, skills, inventory, gold, display name) is saved server-side.
- The browser keeps a stable profile ID in localStorage (`game-profile-id`) and sends it on connect.
- To start a fresh character in the same browser, remove that localStorage key and reconnect.

## Multiplayer Playtest Checklist
- Open two clients and confirm movement/combat sync (targeting, chasing, hits, health bars).
- Verify auto-retaliate only triggers while idle (not while gathering or actively moving elsewhere).
- Fight enemies in both clients and confirm skill XP updates for Strength/Defense/Constitution.
- Gather resources, buy/sell at shop, and verify gold/items remain consistent across clients.
- Refresh one client and confirm persisted state reloads (position, HP, skills, inventory, gold).
- Restart server and reconnect same client profile to confirm persistence survives restart.

## Current Controls
- Left-click ground: click-to-move
- Left-click tree/rock: move to node and auto-gather while in range
- Left-click enemy: attack (auto-move into range)
- Right-click: open context menu (`Walk here`, contextual `Examine`, tile type)
- Right-click NPC: `Talk-to`, `Trade with`, `Examine`
- Right-click enemy: `Attack`, `Examine`
- Chat window (bottom-left): type and send multiplayer chat messages
- Inventory panel (top-right): shows gathered item stacks and used slots
- Shop panel: buy/sell items using gold after trading with the shopkeeper
- Enemies chase nearby players and deal damage in melee range
- Other connected players appear as separate characters and update in real time
- `F3`: Toggle debug HUD
