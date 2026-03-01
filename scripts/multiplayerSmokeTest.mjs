import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';

const PORT = Number(process.env.MULTIPLAYER_PORT ?? 3567);
const SERVER_URL = `ws://127.0.0.1:${PORT}`;
const SERVER_START_TIMEOUT_MS = 4000;
const TEST_TIMEOUT_MS = 10000;

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
      reject(new Error('Server exited before becoming ready.'));
    }

    function cleanup() {
      serverProcess.stdout.off('data', onData);
      serverProcess.off('exit', onExit);
      clearInterval(timeoutPoll);
    }

    const timeoutPoll = setInterval(() => {
      if (Date.now() - startedAt > SERVER_START_TIMEOUT_MS) {
        cleanup();
        reject(new Error('Timed out waiting for multiplayer server startup.'));
      }
    }, 50);

    serverProcess.stdout.on('data', onData);
    serverProcess.on('exit', onExit);
  });
}

function createClient(label) {
  const socket = new WebSocket(SERVER_URL);
  const username = `smoke_${label.toLowerCase()}_${Math.random().toString(36).slice(2, 8)}`;
  const password = `smoke_pw_${Math.random().toString(36).slice(2, 12)}A!`;

  const client = {
    label,
    socket,
    id: null,
    latestState: null,
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
      client.latestState = message.players;
      return;
    }

    if (message.type === 'state') {
      client.latestState = message.players;
    }
  });

  return client;
}

async function waitForWelcome(client) {
  if (client.id) {
    return { id: client.id, players: client.latestState ?? {} };
  }

  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    function onMessage(rawData) {
      const message = JSON.parse(rawData.toString());
      if (message.type !== 'welcome') {
        return;
      }

      client.id = message.id;
      client.latestState = message.players;
      cleanup();
      resolve(message);
    }

    function onClose() {
      cleanup();
      reject(new Error(`Client ${client.label} closed before welcome message.`));
    }

    function cleanup() {
      client.socket.off('message', onMessage);
      client.socket.off('close', onClose);
      clearInterval(timeoutPoll);
    }

    const timeoutPoll = setInterval(() => {
      if (Date.now() - startedAt > TEST_TIMEOUT_MS) {
        cleanup();
        reject(new Error(`Timed out waiting for welcome for ${client.label}.`));
      }
    }, 50);

    client.socket.on('message', onMessage);
    client.socket.on('close', onClose);
  });
}

async function waitForStateContaining(client, playerIds) {
  if (
    client.latestState &&
    playerIds.every((id) => Boolean(client.latestState[id]))
  ) {
    return client.latestState;
  }

  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    function onMessage(rawData) {
      const message = JSON.parse(rawData.toString());
      if (message.type !== 'state') {
        return;
      }

      client.latestState = message.players;
      const hasAllPlayers = playerIds.every((id) => Boolean(message.players[id]));
      if (!hasAllPlayers) {
        return;
      }

      cleanup();
      resolve(message.players);
    }

    function cleanup() {
      client.socket.off('message', onMessage);
      clearInterval(timeoutPoll);
    }

    const timeoutPoll = setInterval(() => {
      if (Date.now() - startedAt > TEST_TIMEOUT_MS) {
        cleanup();
        reject(new Error(`Timed out waiting for state visibility on ${client.label}.`));
      }
    }, 50);

    client.socket.on('message', onMessage);
  });
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

  try {
    await waitForServerReady(serverProcess);

    const clientA = createClient('A');
    const clientB = createClient('B');

    await Promise.all([once(clientA.socket, 'open'), once(clientB.socket, 'open')]);
    await Promise.all([waitForWelcome(clientA), waitForWelcome(clientB)]);

    if (!clientA.id || !clientB.id) {
      throw new Error('One or more clients did not receive IDs.');
    }

    await Promise.all([
      waitForStateContaining(clientA, [clientA.id, clientB.id]),
      waitForStateContaining(clientB, [clientA.id, clientB.id]),
    ]);

    const startX = clientB.latestState?.[clientA.id]?.x;
    const startY = clientB.latestState?.[clientA.id]?.y;
    if (typeof startX !== 'number' || typeof startY !== 'number') {
      throw new Error('Could not read baseline player position.');
    }

    const directions = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ];

    let distanceMoved = 0;
    for (const direction of directions) {
      for (let index = 0; index < 10; index += 1) {
        clientA.socket.send(
          JSON.stringify({ type: 'input', directionX: direction.x, directionY: direction.y }),
        );
        await delay(50);
      }

      clientA.socket.send(JSON.stringify({ type: 'input', directionX: 0, directionY: 0 }));
      await delay(300);

      const endX = clientB.latestState?.[clientA.id]?.x;
      const endY = clientB.latestState?.[clientA.id]?.y;
      if (typeof endX !== 'number' || typeof endY !== 'number') {
        throw new Error('Could not read updated player position.');
      }

      distanceMoved = Math.hypot(endX - startX, endY - startY);
      if (distanceMoved >= 25) {
        break;
      }
    }

    if (distanceMoved < 25) {
      throw new Error(
        `Expected remote movement >= 25px but observed ${distanceMoved.toFixed(2)}px.`,
      );
    }

    console.log(
      `Smoke test passed: remote movement propagated (${distanceMoved.toFixed(2)}px).`,
    );

    clientA.socket.close();
    clientB.socket.close();
  } finally {
    serverProcess.kill('SIGTERM');
  }
}

run().catch((error) => {
  console.error(`Smoke test failed: ${error.message}`);
  process.exitCode = 1;
});
