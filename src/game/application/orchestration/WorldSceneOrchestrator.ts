import {
  type ChatMessageState,
  type CraftingOpenState,
  type CraftingProgressState,
  type InventoryState,
  MultiplayerClient,
  type QuestDialogueState,
  type QuestJournalState,
  type QuestNotificationState,
  type RemotePlayerState,
  type WorldSnapshot,
} from '../../net/MultiplayerClient';

export interface WorldSceneOrchestratorDeps {
  setLocalPlayerId: (id: string) => void;
  applyPlayerSnapshot: (players: WorldSnapshot['players']) => void;
  applyNodeSnapshot: (nodes: WorldSnapshot['nodes']) => void;
  applyNpcSnapshot: (npcs: WorldSnapshot['npcs']) => void;
  applyObjectSnapshot: (objects: WorldSnapshot['objects']) => void;
  rebuildWalkabilityIndexes: () => void;
  applyEnemySnapshot: (enemies: WorldSnapshot['enemies']) => void;
  applyGroundItemSnapshot: (groundItems: NonNullable<WorldSnapshot['groundItems']>) => void;
  setShopDefinitions: (shops: WorldSnapshot['shops']) => void;
  processPendingInteractionTarget: () => void;
  getActiveShopId: () => string | null;
  hasShopDefinition: (shopId: string) => boolean;
  closeShop: () => void;
  incrementSnapshotStats: () => void;
  upsertRemotePlayer: (player: RemotePlayerState) => void;
  removeRemotePlayer: (id: string) => void;
  handleChatMessage: (message: ChatMessageState) => void;
  handleQuestJournal: (journal: QuestJournalState) => void;
  handleQuestDialogue: (dialogue: QuestDialogueState) => void;
  handleQuestNotification: (notification: QuestNotificationState) => void;
  openShop: (shopId: string) => void;
  openBank: (inventory: InventoryState, bank: InventoryState) => void;
  openCrafting: (state: CraftingOpenState) => void;
  handleCraftingProgress: (state: CraftingProgressState) => void;
  handleAuthFailure: (reason: string) => void;
}

export class WorldSceneOrchestrator {
  constructor(private readonly deps: WorldSceneOrchestratorDeps) {}

  applySnapshot(snapshot: WorldSnapshot): void {
    this.deps.applyPlayerSnapshot(snapshot.players);
    this.deps.applyNodeSnapshot(snapshot.nodes);
    this.deps.applyNpcSnapshot(snapshot.npcs);
    this.deps.applyObjectSnapshot(snapshot.objects ?? {});
    this.deps.rebuildWalkabilityIndexes();
    this.deps.applyEnemySnapshot(snapshot.enemies);
    this.deps.applyGroundItemSnapshot(snapshot.groundItems ?? {});
    this.deps.setShopDefinitions(snapshot.shops);

    this.deps.processPendingInteractionTarget();

    const activeShopId = this.deps.getActiveShopId();
    if (activeShopId && !this.deps.hasShopDefinition(activeShopId)) {
      this.deps.closeShop();
    }
  }

  createMultiplayerClient(): MultiplayerClient {
    return new MultiplayerClient(
      (id, snapshot) => {
        this.deps.setLocalPlayerId(id);
        this.applySnapshot(snapshot);
      },
      (snapshot) => {
        this.deps.incrementSnapshotStats();
        this.applySnapshot(snapshot);
      },
      (player) => {
        this.deps.upsertRemotePlayer(player);
      },
      (id) => {
        this.deps.removeRemotePlayer(id);
      },
      (message) => {
        this.deps.handleChatMessage(message);
      },
      (journal) => {
        this.deps.handleQuestJournal(journal);
      },
      (dialogue) => {
        this.deps.handleQuestDialogue(dialogue);
      },
      (notification) => {
        this.deps.handleQuestNotification(notification);
      },
      (shopId) => {
        this.deps.openShop(shopId);
      },
      (inventory, bank) => {
        this.deps.openBank(inventory, bank);
      },
      (craftingState) => {
        this.deps.openCrafting(craftingState);
      },
      (progressState) => {
        this.deps.handleCraftingProgress(progressState);
      },
      (reason) => {
        this.deps.handleAuthFailure(reason);
      },
    );
  }
}
