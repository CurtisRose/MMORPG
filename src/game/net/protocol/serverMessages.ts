import type {
  ChatMessageState,
  CraftingRecipeState,
  EnemyState,
  GroundItemState,
  InventoryState,
  NpcState,
  RemotePlayerState,
  ShopState,
  WorldNodeState,
  WorldObjectState,
} from '../MultiplayerClient';

export interface WelcomeMessage {
  type: 'welcome';
  id: string;
  players: Record<string, RemotePlayerState>;
  nodes: Record<string, WorldNodeState>;
  npcs: Record<string, NpcState>;
  objects: Record<string, WorldObjectState>;
  shops: Record<string, ShopState>;
  enemies: Record<string, EnemyState>;
  groundItems: Record<string, GroundItemState>;
}

export interface StateMessage {
  type: 'state';
  players: Record<string, RemotePlayerState>;
  nodes: Record<string, WorldNodeState>;
  npcs: Record<string, NpcState>;
  objects: Record<string, WorldObjectState>;
  shops: Record<string, ShopState>;
  enemies: Record<string, EnemyState>;
  groundItems: Record<string, GroundItemState>;
}

export interface ShopOpenMessage {
  type: 'shopOpen';
  shopId: string;
}

export interface BankOpenMessage {
  type: 'bankOpen';
  inventory: InventoryState;
  bank: InventoryState;
}

export interface CraftingOpenMessage {
  type: 'craftingOpen';
  stationType: string;
  title: string;
  objectId: string;
  inventory: InventoryState;
  recipes: CraftingRecipeState[];
}

export interface PlayerJoinedMessage {
  type: 'playerJoined';
  player: RemotePlayerState;
}

export interface PlayerLeftMessage {
  type: 'playerLeft';
  id: string;
}

export interface ChatMessage {
  type: 'chat';
  message: ChatMessageState;
}

export interface AuthRequiredMessage {
  type: 'authRequired';
  usernamePattern: string;
  passwordPolicy: string;
}

export interface AuthOkMessage {
  type: 'authOk';
  token: string;
  username: string;
}

export interface AuthErrorMessage {
  type: 'authError';
  reason: string;
}

export type ServerMessage =
  | WelcomeMessage
  | StateMessage
  | PlayerJoinedMessage
  | PlayerLeftMessage
  | ChatMessage
  | ShopOpenMessage
  | BankOpenMessage
  | CraftingOpenMessage
  | AuthRequiredMessage
  | AuthOkMessage
  | AuthErrorMessage;
