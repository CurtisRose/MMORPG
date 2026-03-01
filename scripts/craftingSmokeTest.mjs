import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';

const PORT = Number(process.env.MULTIPLAYER_PORT ?? 3568);
const SERVER_URL = `ws://127.0.0.1:${PORT}`;
const SERVER_START_TIMEOUT_MS = 5000;
const STEP_TIMEOUT_MS = 12000;

function timeoutError(message) {
  return new Error(`Crafting smoke test failed: ${message}`);
}

async function waitForServerReady(serverProcess) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    function onData(chunk) {
      const output = chunk.toString();
      if (output.includes('Multiplayer server listening')) {
        cleanup();
        resolve(undefined);
      }
    }

    function onExit() {
      cleanup();
      reject(timeoutError('Server exited before becoming ready.'));
    }

    function cleanup() {
      clearInterval(timeoutPoll);
      serverProcess.stdout.off('data', onData);
      serverProcess.off('exit', onExit);
    }

    const timeoutPoll = setInterval(() => {
      if (Date.now() - startedAt > SERVER_START_TIMEOUT_MS) {
        cleanup();
        reject(timeoutError('Timed out waiting for server startup.'));
      }
    }, 50);

    serverProcess.stdout.on('data', onData);
    serverProcess.on('exit', onExit);
  });
}

function createClient() {
  const socket = new WebSocket(SERVER_URL);
  const username = `craft_smoke_${Math.random().toString(36).slice(2, 9)}`;
  const password = `craft_pw_${Math.random().toString(36).slice(2, 12)}A!`;

  const client = {
    socket,
    id: null,
    latestSnapshot: null,
    lastShopOpen: null,
    lastCraftingOpen: null,
    authToken: null,
    username,
    password,
  };

  socket.on('message', (rawData) => {
    const message = JSON.parse(rawData.toString());

    if (message.type === 'authRequired') {
      socket.send(
        JSON.stringify({
          type: 'authRegister',
          username,
          password,
        }),
      );
      return;
    }

    if (message.type === 'authOk') {
      client.authToken = String(message.token ?? '');
      return;
    }

    if (message.type === 'welcome') {
      client.id = message.id;
      client.latestSnapshot = message;
      return;
    }

    if (message.type === 'state') {
      client.latestSnapshot = message;
      return;
    }

    if (message.type === 'shopOpen') {
      client.lastShopOpen = message;
      return;
    }

    if (message.type === 'craftingOpen') {
      client.lastCraftingOpen = message;
    }
  });

  return client;
}

async function waitForCondition(check, errorMessage, timeoutMs = STEP_TIMEOUT_MS) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const result = check();
    if (result) {
      return result;
    }

    await delay(50);
  }

  throw timeoutError(errorMessage);
}

function getLocalPlayerState(client) {
  if (!client.id || !client.latestSnapshot?.players) {
    return null;
  }

  return client.latestSnapshot.players[client.id] ?? null;
}

function getInventoryItemCount(playerState, itemId) {
  if (!playerState?.inventory?.slots) {
    return 0;
  }

  const slot = playerState.inventory.slots.find((entry) => entry.itemId === itemId);
  return Number(slot?.quantity ?? 0);
}

function isAdjacentTo(tileX, tileY, targetX, targetY) {
  const distance = Math.abs(tileX - targetX) + Math.abs(tileY - targetY);
  return distance <= 1;
}

async function moveAdjacentTo(client, targetX, targetY, label) {
  const current = getLocalPlayerState(client);
  if (!current) {
    throw timeoutError(`Missing local player state while moving to ${label}.`);
  }

  if (isAdjacentTo(current.tileX, current.tileY, targetX, targetY)) {
    return;
  }

  const candidateTiles = [
    { x: targetX - 1, y: targetY },
    { x: targetX + 1, y: targetY },
    { x: targetX, y: targetY - 1 },
    { x: targetX, y: targetY + 1 },
    { x: targetX - 1, y: targetY - 1 },
    { x: targetX + 1, y: targetY - 1 },
    { x: targetX - 1, y: targetY + 1 },
    { x: targetX + 1, y: targetY + 1 },
  ];

  client.socket.send(
    JSON.stringify({
      type: 'moveTo',
      tileX: candidateTiles[0].x,
      tileY: candidateTiles[0].y,
    }),
  );

  await waitForCondition(() => {
    const state = getLocalPlayerState(client);
    if (!state) {
      return false;
    }

    return isAdjacentTo(state.tileX, state.tileY, targetX, targetY) ? state : false;
  }, `Timed out moving adjacent to ${label}.`);
}

async function run() {
  const serverProcess = spawn(process.execPath, ['server/multiplayerServer.mjs'], {
    env: {
      ...process.env,
      MULTIPLAYER_PORT: String(PORT),
      DEBUG_MULTIPLAYER: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let client = null;

  try {
    await waitForServerReady(serverProcess);
    client = createClient();
    await once(client.socket, 'open');

    await waitForCondition(
      () => Boolean(client.id && client.latestSnapshot?.players?.[client.id]),
      'Did not receive welcome/player snapshot.',
    );

    const snapshot = client.latestSnapshot;
    const shopkeeper = Object.values(snapshot.npcs ?? {}).find((entry) => entry.type === 'shopkeeper');
    if (!shopkeeper) {
      throw timeoutError('Shopkeeper NPC not found in snapshot.');
    }

    const smeltingStation = Object.values(snapshot.objects ?? {}).find(
      (entry) => entry.objectTypeId === 'smelting_station',
    );
    const smithingStation = Object.values(snapshot.objects ?? {}).find(
      (entry) => entry.objectTypeId === 'smithing_station',
    );
    const fletchingStation = Object.values(snapshot.objects ?? {}).find(
      (entry) => entry.objectTypeId === 'fletching_station',
    );

    if (!smeltingStation || !smithingStation || !fletchingStation) {
      throw timeoutError('One or more crafting stations are missing from world objects.');
    }

    await moveAdjacentTo(client, shopkeeper.tileX, shopkeeper.tileY, 'shopkeeper');

    client.lastShopOpen = null;
    client.socket.send(
      JSON.stringify({
        type: 'shopOpen',
        npcId: shopkeeper.id,
      }),
    );

    const openedShop = await waitForCondition(
      () => client.lastShopOpen,
      'Did not receive shopOpen response.',
    );

    const shopId = String(openedShop.shopId ?? '');
    if (!shopId) {
      throw timeoutError('shopOpen returned an empty shop ID.');
    }

    client.socket.send(
      JSON.stringify({
        type: 'shopBuy',
        shopId,
        itemId: 'copper_ore',
        quantity: 1,
      }),
    );

    client.socket.send(
      JSON.stringify({
        type: 'shopBuy',
        shopId,
        itemId: 'tin_ore',
        quantity: 1,
      }),
    );

    await waitForCondition(() => {
      const playerState = getLocalPlayerState(client);
      if (!playerState) {
        return false;
      }

      return getInventoryItemCount(playerState, 'copper_ore') >= 1
        && getInventoryItemCount(playerState, 'tin_ore') >= 1
        ? playerState
        : false;
    }, 'Did not receive bought ores in inventory.');

    await moveAdjacentTo(client, smeltingStation.tileX, smeltingStation.tileY, 'smelting station');

    client.lastCraftingOpen = null;
    client.socket.send(
      JSON.stringify({
        type: 'craftingOpen',
        objectId: smeltingStation.id,
      }),
    );

    const smeltingOpen = await waitForCondition(
      () => (client.lastCraftingOpen?.stationType === 'smelting_station' ? client.lastCraftingOpen : false),
      'Did not receive smelting crafting panel.',
    );

    const bronzeRecipe = (smeltingOpen.recipes ?? []).find((entry) => entry.id === 'bronze_bar');
    if (!bronzeRecipe) {
      throw timeoutError('Smelting recipes did not include bronze_bar.');
    }

    client.socket.send(
      JSON.stringify({
        type: 'craftingMake',
        objectId: smeltingStation.id,
        recipeId: 'bronze_bar',
        quantity: 1,
      }),
    );

    await waitForCondition(() => {
      const playerState = getLocalPlayerState(client);
      if (!playerState) {
        return false;
      }

      return getInventoryItemCount(playerState, 'bronze_bar') >= 1 ? playerState : false;
    }, 'Bronze bar was not crafted.');

    await moveAdjacentTo(client, smithingStation.tileX, smithingStation.tileY, 'smithing station');

    client.lastCraftingOpen = null;
    client.socket.send(
      JSON.stringify({
        type: 'craftingOpen',
        objectId: smithingStation.id,
      }),
    );

    const smithingOpen = await waitForCondition(
      () => (client.lastCraftingOpen?.stationType === 'smithing_station' ? client.lastCraftingOpen : false),
      'Did not receive smithing crafting panel.',
    );

    const helmetRecipe = (smithingOpen.recipes ?? []).find((entry) => entry.id === 'bronze_helmet');
    if (!helmetRecipe) {
      throw timeoutError('Smithing recipes did not include bronze_helmet.');
    }

    client.socket.send(
      JSON.stringify({
        type: 'craftingMake',
        objectId: smithingStation.id,
        recipeId: 'bronze_helmet',
        quantity: 1,
      }),
    );

    await waitForCondition(() => {
      const playerState = getLocalPlayerState(client);
      if (!playerState) {
        return false;
      }

      return getInventoryItemCount(playerState, 'bronze_helmet') >= 1 ? playerState : false;
    }, 'Bronze helmet was not crafted.');

    await moveAdjacentTo(client, fletchingStation.tileX, fletchingStation.tileY, 'fletching station');

    client.lastCraftingOpen = null;
    client.socket.send(
      JSON.stringify({
        type: 'craftingOpen',
        objectId: fletchingStation.id,
      }),
    );

    const fletchingOpen = await waitForCondition(
      () => (client.lastCraftingOpen?.stationType === 'fletching_station' ? client.lastCraftingOpen : false),
      'Did not receive fletching crafting panel.',
    );

    const hasBowRecipe = (fletchingOpen.recipes ?? []).some((entry) => entry.id === 'wooden_shortbow');
    const hasArrowRecipe = (fletchingOpen.recipes ?? []).some((entry) => entry.id === 'wooden_arrows');
    if (!hasBowRecipe || !hasArrowRecipe) {
      throw timeoutError('Fletching recipes were missing expected outputs.');
    }

    console.log('Crafting smoke test passed: smelting + smithing + fletching panel flow verified.');
    client.socket.close();
  } finally {
    if (client?.socket && client.socket.readyState <= WebSocket.OPEN) {
      client.socket.close();
    }
    serverProcess.kill('SIGTERM');
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
