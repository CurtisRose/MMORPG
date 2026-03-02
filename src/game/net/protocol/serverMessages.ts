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

export interface QuestObjectiveView {
  id: string;
  description: string;
  progress: number;
  required: number;
}

export interface QuestStepView {
  id: string;
  description: string;
  completed: boolean;
  objectives: QuestObjectiveView[];
}

export interface QuestRequirementView {
  label: string;
  met: boolean;
}

export interface QuestRewardView {
  gold?: number;
  items?: Array<{ itemId: string; quantity: number }>;
  xp?: Array<{ skill: string; amount: number }>;
}

export interface QuestChainView {
  nextQuestIds?: string[];
}

export interface QuestJournalEntry {
  questId: string;
  title: string;
  status: 'active' | 'completable' | 'completed' | 'locked';
  currentStepIndex: number;
  steps: QuestStepView[];
  requirements: QuestRequirementView[];
  rewards: QuestRewardView;
  chain: QuestChainView;
}

export interface QuestJournalState {
  active: QuestJournalEntry[];
  completed: QuestJournalEntry[];
  selectedQuestId: string | null;
}

export interface QuestDialogueOption {
  id: string;
  label: string;
  action: 'accept' | 'decline' | 'turnin' | 'continue' | 'close';
}

export interface QuestDialogueState {
  open: boolean;
  npcId: string;
  npcName: string;
  questId: string | null;
  mode: 'ambient' | 'offer' | 'progress' | 'turnin' | 'completed' | 'locked';
  text: string;
  options: QuestDialogueOption[];
}

export interface QuestNotification {
  id: string;
  type: 'progress' | 'step_complete' | 'quest_complete' | 'quest_unlocked' | 'failed';
  questId: string;
  text: string;
  timestamp: number;
}

export interface QuestJournalMessage {
  type: 'questJournal';
  journal: QuestJournalState;
}

export interface QuestDialogueMessage {
  type: 'questDialogue';
  dialogue: QuestDialogueState;
}

export interface QuestNotificationMessage {
  type: 'questNotification';
  notification: QuestNotification;
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
  | QuestJournalMessage
  | QuestDialogueMessage
  | QuestNotificationMessage
  | ShopOpenMessage
  | BankOpenMessage
  | CraftingOpenMessage
  | AuthRequiredMessage
  | AuthOkMessage
  | AuthErrorMessage;
