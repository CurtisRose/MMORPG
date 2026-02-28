export interface RemotePlayerState {
  id: string;
  displayName: string;
  x: number;
  y: number;
  tileX: number;
  tileY: number;
  targetTileX: number | null;
  targetTileY: number | null;
  targetPath: Array<{
    tileX: number;
    tileY: number;
  }>;
  hp: number;
  maxHp: number;
  combatTargetEnemyId: string | null;
  activeInteractionNodeId: string | null;
  gold: number;
  skills: {
    woodcutting: {
      xp: number;
      level: number;
    };
    mining: {
      xp: number;
      level: number;
    };
    strength: {
      xp: number;
      level: number;
    };
    defense: {
      xp: number;
      level: number;
    };
    constitution: {
      xp: number;
      level: number;
    };
  };
  inventory: {
    maxSlots: number;
    slots: Array<{
      itemId: string;
      quantity: number;
      name: string;
      stackable: boolean;
      image: string;
      examineText: string;
    }>;
  };
  lastActionText: string | null;
}

export interface WorldNodeState {
  id: string;
  type: 'tree' | 'rock';
  resourceId: string;
  resourceName: string;
  resourceExamineText: string;
  resourceActionLabel: string;
  tileX: number;
  tileY: number;
  isDepleted: boolean;
  respawnAt: number | null;
}

export interface WorldSnapshot {
  players: Record<string, RemotePlayerState>;
  nodes: Record<string, WorldNodeState>;
  npcs: Record<string, NpcState>;
  shops: Record<string, ShopState>;
  enemies: Record<string, EnemyState>;
}

export interface EnemyState {
  id: string;
  type: 'goblin';
  name: string;
  tileX: number;
  tileY: number;
  targetTileX: number | null;
  targetTileY: number | null;
  targetPath: Array<{
    tileX: number;
    tileY: number;
  }>;
  hp: number;
  maxHp: number;
  isDead: boolean;
  respawnAt: number | null;
  examineText: string;
}

export interface NpcState {
  id: string;
  type: 'shopkeeper';
  name: string;
  tileX: number;
  tileY: number;
  examineText: string;
}

export interface ShopListingState {
  itemId: string;
  name: string;
  buyPrice: number;
  sellPrice: number;
}

export interface ShopState {
  id: string;
  npcId: string;
  name: string;
  listings: ShopListingState[];
}

export interface ChatMessageState {
  id: string;
  text: string;
  timestamp: number;
}

export interface MultiplayerClientStats {
  connectionState: 'disconnected' | 'connecting' | 'connected';
  messagesReceived: number;
  messagesSent: number;
  lastMessageAt: number | null;
}

interface WelcomeMessage {
  type: 'welcome';
  id: string;
  players: Record<string, RemotePlayerState>;
  nodes: Record<string, WorldNodeState>;
  npcs: Record<string, NpcState>;
  shops: Record<string, ShopState>;
  enemies: Record<string, EnemyState>;
}

interface StateMessage {
  type: 'state';
  players: Record<string, RemotePlayerState>;
  nodes: Record<string, WorldNodeState>;
  npcs: Record<string, NpcState>;
  shops: Record<string, ShopState>;
  enemies: Record<string, EnemyState>;
}

interface ShopOpenMessage {
  type: 'shopOpen';
  shopId: string;
}

interface PlayerJoinedMessage {
  type: 'playerJoined';
  player: RemotePlayerState;
}

interface PlayerLeftMessage {
  type: 'playerLeft';
  id: string;
}

interface ChatMessage {
  type: 'chat';
  message: ChatMessageState;
}

type ServerMessage =
  | WelcomeMessage
  | StateMessage
  | PlayerJoinedMessage
  | PlayerLeftMessage
  | ChatMessage
  | ShopOpenMessage;

function resolveMultiplayerUrl(): string {
  const configuredUrl = import.meta.env.VITE_MULTIPLAYER_URL as string | undefined;
  const profileId = getOrCreateProfileId();

  const baseUrl = configuredUrl
    ? configuredUrl
    : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:2567`;

  const parsedUrl = new URL(baseUrl);
  parsedUrl.searchParams.set('profileId', profileId);
  return parsedUrl.toString();
}

function getOrCreateProfileId(): string {
  const storageKey = 'game-profile-id';
  const existing = window.localStorage.getItem(storageKey);
  if (existing && /^[a-zA-Z0-9_-]{8,64}$/.test(existing)) {
    return existing;
  }

  const generated =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 24)
      : `profile_${Math.random().toString(36).slice(2, 14)}`;

  window.localStorage.setItem(storageKey, generated);
  return generated;
}

export class MultiplayerClient {
  private socket: WebSocket | null = null;
  private localPlayerId: string | null = null;
  private readonly debugEnabled =
    String(import.meta.env.VITE_DEBUG_NET ?? '').toLowerCase() === 'true';
  private stats: MultiplayerClientStats = {
    connectionState: 'disconnected',
    messagesReceived: 0,
    messagesSent: 0,
    lastMessageAt: null,
  };

  constructor(
    private readonly onWelcome: (id: string, snapshot: WorldSnapshot) => void,
    private readonly onState: (snapshot: WorldSnapshot) => void,
    private readonly onPlayerJoined: (player: RemotePlayerState) => void,
    private readonly onPlayerLeft: (id: string) => void,
    private readonly onChatMessage: (message: ChatMessageState) => void,
    private readonly onShopOpen: (shopId: string) => void,
  ) {}

  connect(): void {
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) {
      return;
    }

    this.stats.connectionState = 'connecting';
    this.socket = new WebSocket(resolveMultiplayerUrl());

    this.socket.addEventListener('open', () => {
      this.stats.connectionState = 'connected';
      this.log('connected');
    });

    this.socket.addEventListener('close', () => {
      this.stats.connectionState = 'disconnected';
      this.log('disconnected');
    });

    this.socket.addEventListener('error', () => {
      this.log('socket error');
    });

    this.socket.addEventListener('message', (event) => {
      this.stats.messagesReceived += 1;
      this.stats.lastMessageAt = Date.now();

      const message = JSON.parse(event.data) as ServerMessage;

      if (message.type === 'welcome') {
        this.localPlayerId = message.id;
        this.onWelcome(message.id, {
          players: message.players,
          nodes: message.nodes,
          npcs: message.npcs,
          shops: message.shops,
          enemies: message.enemies,
        });
        return;
      }

      if (message.type === 'state') {
        this.onState({
          players: message.players,
          nodes: message.nodes,
          npcs: message.npcs,
          shops: message.shops,
          enemies: message.enemies,
        });
        return;
      }

      if (message.type === 'playerJoined') {
        this.onPlayerJoined(message.player);
        return;
      }

      if (message.type === 'playerLeft') {
        this.onPlayerLeft(message.id);
        return;
      }

      if (message.type === 'chat') {
        this.onChatMessage(message.message);
        return;
      }

      if (message.type === 'shopOpen') {
        this.onShopOpen(message.shopId);
      }
    });
  }

  getLocalPlayerId(): string | null {
    return this.localPlayerId;
  }

  sendInput(directionX: number, directionY: number): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.stats.messagesSent += 1;
    this.socket.send(
      JSON.stringify({
        type: 'input',
        directionX,
        directionY,
      }),
    );
  }

  sendMoveTo(tileX: number, tileY: number): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.stats.messagesSent += 1;
    this.socket.send(
      JSON.stringify({
        type: 'moveTo',
        tileX,
        tileY,
      }),
    );
  }

  sendInteractStart(nodeId: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.stats.messagesSent += 1;
    this.socket.send(
      JSON.stringify({
        type: 'interactStart',
        nodeId,
      }),
    );
  }

  sendInteractStop(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.stats.messagesSent += 1;
    this.socket.send(
      JSON.stringify({
        type: 'interactStop',
      }),
    );
  }

  sendChat(text: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.stats.messagesSent += 1;
    this.socket.send(
      JSON.stringify({
        type: 'chat',
        text,
      }),
    );
  }

  sendNpcTalk(npcId: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.stats.messagesSent += 1;
    this.socket.send(
      JSON.stringify({
        type: 'npcTalk',
        npcId,
      }),
    );
  }

  sendShopOpen(npcId: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.stats.messagesSent += 1;
    this.socket.send(
      JSON.stringify({
        type: 'shopOpen',
        npcId,
      }),
    );
  }

  sendShopBuy(shopId: string, itemId: string, quantity = 1): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.stats.messagesSent += 1;
    this.socket.send(
      JSON.stringify({
        type: 'shopBuy',
        shopId,
        itemId,
        quantity,
      }),
    );
  }

  sendShopSell(shopId: string, itemId: string, quantity = 1): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.stats.messagesSent += 1;
    this.socket.send(
      JSON.stringify({
        type: 'shopSell',
        shopId,
        itemId,
        quantity,
      }),
    );
  }

  sendCombatAttack(enemyId: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.stats.messagesSent += 1;
    this.socket.send(
      JSON.stringify({
        type: 'combatAttack',
        enemyId,
      }),
    );
  }

  sendInventoryMove(fromIndex: number, toIndex: number): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.stats.messagesSent += 1;
    this.socket.send(
      JSON.stringify({
        type: 'inventoryMove',
        fromIndex,
        toIndex,
      }),
    );
  }

  sendInventoryDrop(slotIndex: number, quantity = 1): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.stats.messagesSent += 1;
    this.socket.send(
      JSON.stringify({
        type: 'inventoryDrop',
        slotIndex,
        quantity,
      }),
    );
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
    this.localPlayerId = null;
    this.stats.connectionState = 'disconnected';
  }

  getStats(): MultiplayerClientStats {
    return { ...this.stats };
  }

  private log(message: string): void {
    if (!this.debugEnabled) {
      return;
    }

    console.debug(`[MultiplayerClient] ${message}`);
  }
}
