import Phaser from 'phaser';
import {
  MAP_HEIGHT_TILES,
  MAP_WIDTH_TILES,
  TILE_SIZE,
} from '../config/gameConfig';
import {
  type ChatMessageState,
  type EnemyState,
  MultiplayerClient,
  type NpcState,
  type RemotePlayerState,
  type ShopState,
  type WorldNodeState,
  type WorldSnapshot,
} from '../net/MultiplayerClient';
import { generateTerrainData } from '../world/generateTerrainData';

const TERRAIN_TEXTURE_KEY = 'terrain-tiles';
const PLAYER_TEXTURE_KEY = 'player';
const TREE_TEXTURE_KEY = 'resource-tree';
const ROCK_TEXTURE_KEY = 'resource-rock';
const ENEMY_TEXTURE_KEY = 'player';
const WATER_TILE_ID = 2;
const INPUT_SEND_INTERVAL_MS = 50;
const CARDINAL_MOVE_DURATION_MS = 200;
const DIAGONAL_MOVE_DURATION_MS = Math.round(CARDINAL_MOVE_DURATION_MS * 1.65);
const CARDINAL_MOVE_TILES_PER_MS = 1 / CARDINAL_MOVE_DURATION_MS;
const DIAGONAL_MOVE_TILES_PER_MS = Math.SQRT2 / DIAGONAL_MOVE_DURATION_MS;
const HEALTH_BAR_VISIBLE_MS = 3000;
const HEALTH_BAR_WIDTH = 26;
const HEALTH_BAR_HEIGHT = 4;
const DEBUG_HUD_VISIBLE_BY_DEFAULT =
  String(import.meta.env.VITE_DEBUG_HUD ?? 'true').toLowerCase() === 'true';

interface RemotePlayerVisual {
  state: RemotePlayerState;
  sprite: Phaser.GameObjects.Sprite;
  targetTilePosition: Phaser.Math.Vector2;
  renderedTilePosition: Phaser.Math.Vector2;
  pathWaypoints: Phaser.Math.Vector2[];
  healthBar: Phaser.GameObjects.Graphics;
  healthBarVisibleUntil: number;
}

interface WorldNodeVisual {
  state: WorldNodeState;
  sprite: Phaser.GameObjects.Sprite;
}

interface NpcVisual {
  state: NpcState;
  sprite: Phaser.GameObjects.Sprite;
}

interface EnemyVisual {
  state: EnemyState;
  sprite: Phaser.GameObjects.Sprite;
  targetTilePosition: Phaser.Math.Vector2;
  renderedTilePosition: Phaser.Math.Vector2;
  pathWaypoints: Phaser.Math.Vector2[];
  healthBar: Phaser.GameObjects.Graphics;
  healthBarVisibleUntil: number;
}

interface ContextMenuOption {
  label: string;
  onSelect?: () => void;
}

type ClickFeedbackKind = 'walk' | 'interact' | 'npc-interact';

interface PendingNpcAction {
  npcId: string;
  action: 'talk' | 'trade';
}

interface SkillLevelSnapshot {
  woodcutting: number;
  mining: number;
  strength: number;
  defense: number;
  constitution: number;
}

export class WorldScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Sprite;
  private terrainData: number[][] = [];
  private localPlayerId: string | null = null;
  private localPlayerState: RemotePlayerState | null = null;
  private localTilePosition: Phaser.Math.Vector2 | null = null;
  private localRenderedTilePosition: Phaser.Math.Vector2 | null = null;
  private multiplayerClient!: MultiplayerClient;
  private debugHudText!: Phaser.GameObjects.Text;
  private actionStatusText!: Phaser.GameObjects.Text;
  private debugHudVisible = DEBUG_HUD_VISIBLE_BY_DEFAULT;
  private debugToggleKey!: Phaser.Input.Keyboard.Key;
  private lastStateUpdateAt: number | null = null;
  private snapshotCount = 0;
  private remotePlayers = new Map<string, RemotePlayerVisual>();
  private worldNodes = new Map<string, WorldNodeVisual>();
  private worldNpcs = new Map<string, NpcVisual>();
  private worldEnemies = new Map<string, EnemyVisual>();
  private shopDefinitions: Record<string, ShopState> = {};
  private contextMenuElement: HTMLDivElement | null = null;
  private chatRootElement: HTMLDivElement | null = null;
  private chatLogElement: HTMLDivElement | null = null;
  private chatInputElement: HTMLInputElement | null = null;
  private chatMessages: string[] = [];
  private characterRootElement: HTMLDivElement | null = null;
  private characterTabBarElement: HTMLDivElement | null = null;
  private activeCharacterTab: 'skills' | 'inventory' = 'skills';
  private skillsRootElement: HTMLDivElement | null = null;
  private skillsContentElement: HTMLDivElement | null = null;
  private inventoryContentElement: HTMLDivElement | null = null;
  private inventoryHeaderElement: HTMLDivElement | null = null;
  private inventoryGridElement: HTMLDivElement | null = null;
  private lastRenderedInventorySignature: string | null = null;
  private draggingInventoryIndex: number | null = null;
  private inventoryIconDataUrls = new Map<string, string>();
  private shopRootElement: HTMLDivElement | null = null;
  private shopContentElement: HTMLDivElement | null = null;
  private activeShopId: string | null = null;
  private lastRenderedShopSignature: string | null = null;
  private pendingNpcAction: PendingNpcAction | null = null;
  private localHealthBar: Phaser.GameObjects.Graphics | null = null;
  private localHealthBarVisibleUntil = 0;
  private previousSkillLevels: SkillLevelSnapshot | null = null;
  private timeSinceInputSendMs = 0;
  private lastSentDirection = new Phaser.Math.Vector2(0, 0);
  private localPathWaypoints: Phaser.Math.Vector2[] = [];

  constructor() {
    super('world');
  }

  create(): void {
    this.input.mouse?.disableContextMenu();

    this.terrainData = generateTerrainData();
    const terrainMap = this.make.tilemap({
      data: this.terrainData,
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
    });

    const terrainTileset = terrainMap.addTilesetImage(
      TERRAIN_TEXTURE_KEY,
      TERRAIN_TEXTURE_KEY,
      TILE_SIZE,
      TILE_SIZE,
      0,
      0,
    );

    if (!terrainTileset) {
      throw new Error('Failed to create terrain tileset.');
    }

    const terrainLayer = terrainMap.createLayer(0, terrainTileset, 0, 0);
    if (!terrainLayer) {
      throw new Error('Failed to create terrain layer.');
    }

    terrainLayer.setCollision([WATER_TILE_ID]);

    this.player = this.add.sprite(
      MAP_WIDTH_TILES * TILE_SIZE * 0.5,
      MAP_HEIGHT_TILES * TILE_SIZE * 0.5,
      PLAYER_TEXTURE_KEY,
    );

    this.player.setTint(0xb8f0ff);
    this.localHealthBar = this.add.graphics().setDepth(60);
    this.localHealthBar.setVisible(false);

    this.cameras.main.setBounds(
      0,
      0,
      MAP_WIDTH_TILES * TILE_SIZE,
      MAP_HEIGHT_TILES * TILE_SIZE,
    );
    this.cameras.main.startFollow(this.player, true, 0.2, 0.2);
    this.cameras.main.setZoom(2);
    this.cameras.main.roundPixels = false;

    const keyboard = this.input.keyboard;
    if (!keyboard) {
      throw new Error('Keyboard input is unavailable.');
    }

    this.debugToggleKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F3);

    this.debugHudText = this.add
      .text(8, 8, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#d6ecff',
        backgroundColor: '#00000099',
        padding: { x: 8, y: 6 },
      })
      .setDepth(1000)
      .setScrollFactor(0)
      .setVisible(this.debugHudVisible);

    this.actionStatusText = this.add
      .text(8, 116, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#f6f1dd',
        backgroundColor: '#00000099',
        padding: { x: 8, y: 6 },
      })
      .setDepth(1000)
      .setScrollFactor(0);

    this.initChatUi();
    this.initCharacterUi();
    this.initShopUi();
    this.appendSystemChatMessage('Welcome to the world.');

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.handlePointerDown(pointer);
    });

    this.multiplayerClient = new MultiplayerClient(
      (id, snapshot) => {
        this.localPlayerId = id;
        this.applySnapshot(snapshot);
      },
      (snapshot) => {
        this.snapshotCount += 1;
        this.lastStateUpdateAt = Date.now();
        this.applySnapshot(snapshot);
      },
      (player) => {
        this.upsertRemotePlayer(player);
      },
      (id) => {
        this.removeRemotePlayer(id);
      },
      (message) => {
        this.handleChatMessage(message);
      },
      (shopId) => {
        this.openShop(shopId);
      },
    );

    this.multiplayerClient.connect();

    this.events.on(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.on(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
  }

  update(_: number, delta: number): void {
    const directionX = 0;
    const directionY = 0;

    this.timeSinceInputSendMs += delta;
    if (this.timeSinceInputSendMs >= INPUT_SEND_INTERVAL_MS) {
      this.sendDirectionalInputIfChanged(directionX, directionY);
      this.timeSinceInputSendMs = 0;
    }

    if (Phaser.Input.Keyboard.JustDown(this.debugToggleKey)) {
      this.debugHudVisible = !this.debugHudVisible;
      this.debugHudText.setVisible(this.debugHudVisible);
    }

    this.updatePlayerSmoothing(delta);
    this.renderHealthBars(Date.now());

    this.renderActionStatus();
    this.renderDebugHud();
  }

  private renderHealthBars(nowMs: number): void {
    if (this.localHealthBar && this.localPlayerState && nowMs <= this.localHealthBarVisibleUntil) {
      this.drawHealthBar(
        this.localHealthBar,
        this.player.x,
        this.player.y - TILE_SIZE * 0.65,
        this.localPlayerState.hp,
        this.localPlayerState.maxHp,
      );
      this.localHealthBar.setVisible(true);
    } else {
      this.localHealthBar?.clear();
      this.localHealthBar?.setVisible(false);
    }

    for (const remotePlayer of this.remotePlayers.values()) {
      if (nowMs <= remotePlayer.healthBarVisibleUntil) {
        this.drawHealthBar(
          remotePlayer.healthBar,
          remotePlayer.sprite.x,
          remotePlayer.sprite.y - TILE_SIZE * 0.65,
          remotePlayer.state.hp,
          remotePlayer.state.maxHp,
        );
        remotePlayer.healthBar.setVisible(true);
      } else {
        remotePlayer.healthBar.clear();
        remotePlayer.healthBar.setVisible(false);
      }
    }

    for (const enemy of this.worldEnemies.values()) {
      if (enemy.state.isDead) {
        enemy.healthBar.clear();
        enemy.healthBar.setVisible(false);
        continue;
      }

      if (nowMs <= enemy.healthBarVisibleUntil) {
        this.drawHealthBar(
          enemy.healthBar,
          enemy.sprite.x,
          enemy.sprite.y - TILE_SIZE * 0.65,
          enemy.state.hp,
          enemy.state.maxHp,
        );
        enemy.healthBar.setVisible(true);
      } else {
        enemy.healthBar.clear();
        enemy.healthBar.setVisible(false);
      }
    }
  }

  private drawHealthBar(
    graphics: Phaser.GameObjects.Graphics,
    worldX: number,
    worldY: number,
    hp: number,
    maxHp: number,
  ): void {
    const safeMaxHp = Math.max(1, maxHp);
    const ratio = Phaser.Math.Clamp(hp / safeMaxHp, 0, 1);
    const left = worldX - HEALTH_BAR_WIDTH * 0.5;
    const top = worldY;

    graphics.clear();
    graphics.fillStyle(0x111111, 0.8);
    graphics.fillRect(left - 1, top - 1, HEALTH_BAR_WIDTH + 2, HEALTH_BAR_HEIGHT + 2);

    graphics.fillStyle(0x5f1515, 0.95);
    graphics.fillRect(left, top, HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT);

    graphics.fillStyle(0x45c163, 0.95);
    graphics.fillRect(left, top, Math.round(HEALTH_BAR_WIDTH * ratio), HEALTH_BAR_HEIGHT);
  }

  private showFloatingText(worldX: number, worldY: number, text: string, color: string): void {
    const popup = this.add
      .text(worldX, worldY, text, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color,
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setDepth(90)
      .setOrigin(0.5, 1);

    this.tweens.add({
      targets: popup,
      y: popup.y - 16,
      alpha: 0,
      duration: 650,
      ease: 'Quad.Out',
      onComplete: () => popup.destroy(),
    });
  }

  private updatePlayerSmoothing(deltaMs: number): void {
    if (this.localTilePosition && this.localRenderedTilePosition) {
      const localWaypoints =
        this.localPathWaypoints.length > 0
          ? this.localPathWaypoints
          : [this.localTilePosition.clone()];
      this.advanceAlongWaypoints(this.localRenderedTilePosition, localWaypoints, deltaMs);

      const worldPosition = this.getWorldPositionFromTile(
        this.localRenderedTilePosition.x,
        this.localRenderedTilePosition.y,
      );
      this.player.setPosition(worldPosition.x, worldPosition.y);
    }

    for (const remotePlayer of this.remotePlayers.values()) {
      const remoteWaypoints =
        remotePlayer.pathWaypoints.length > 0
          ? remotePlayer.pathWaypoints
          : [remotePlayer.targetTilePosition.clone()];
      this.advanceAlongWaypoints(remotePlayer.renderedTilePosition, remoteWaypoints, deltaMs);

      const worldPosition = this.getWorldPositionFromTile(
        remotePlayer.renderedTilePosition.x,
        remotePlayer.renderedTilePosition.y,
      );
      remotePlayer.sprite.setPosition(worldPosition.x, worldPosition.y);
    }

    for (const enemy of this.worldEnemies.values()) {
      const enemyWaypoints =
        enemy.pathWaypoints.length > 0 ? enemy.pathWaypoints : [enemy.targetTilePosition.clone()];
      this.advanceAlongWaypoints(enemy.renderedTilePosition, enemyWaypoints, deltaMs);

      const worldPosition = this.getWorldPositionFromTile(
        enemy.renderedTilePosition.x,
        enemy.renderedTilePosition.y,
      );
      enemy.sprite.setPosition(worldPosition.x, worldPosition.y);
    }
  }

  private advanceAlongWaypoints(
    current: Phaser.Math.Vector2,
    waypoints: Phaser.Math.Vector2[],
    deltaMs: number,
  ): void {
    let remainingMs = deltaMs;

    while (remainingMs > 0 && waypoints.length > 0) {
      const target = waypoints[0];
      const deltaX = target.x - current.x;
      const deltaY = target.y - current.y;
      const distance = Math.hypot(deltaX, deltaY);

      if (distance <= 0.0001) {
        current.copy(target);
        waypoints.shift();
        continue;
      }

      const isDiagonalMove = Math.abs(deltaX) > 0.001 && Math.abs(deltaY) > 0.001;
      const speedTilesPerMs = isDiagonalMove
        ? DIAGONAL_MOVE_TILES_PER_MS
        : CARDINAL_MOVE_TILES_PER_MS;
      const stepDistance = speedTilesPerMs * remainingMs;

      if (stepDistance >= distance) {
        current.copy(target);
        waypoints.shift();
        const consumedMs = distance / speedTilesPerMs;
        remainingMs = Math.max(0, remainingMs - consumedMs);
        continue;
      }

      const scale = stepDistance / distance;
      current.set(current.x + deltaX * scale, current.y + deltaY * scale);
      remainingMs = 0;
    }
  }

  private buildPathWaypoints(playerState: RemotePlayerState): Phaser.Math.Vector2[] {
    if (!Array.isArray(playerState.targetPath)) {
      return [];
    }

    return playerState.targetPath.map(
      (step) =>
        new Phaser.Math.Vector2(
          Phaser.Math.Clamp(Math.round(step.tileX), 0, MAP_WIDTH_TILES - 1),
          Phaser.Math.Clamp(Math.round(step.tileY), 0, MAP_HEIGHT_TILES - 1),
        ),
    );
  }

  private buildEnemyPathWaypoints(enemyState: EnemyState): Phaser.Math.Vector2[] {
    if (!Array.isArray(enemyState.targetPath)) {
      return [];
    }

    return enemyState.targetPath.map(
      (step) =>
        new Phaser.Math.Vector2(
          Phaser.Math.Clamp(Math.round(step.tileX), 0, MAP_WIDTH_TILES - 1),
          Phaser.Math.Clamp(Math.round(step.tileY), 0, MAP_HEIGHT_TILES - 1),
        ),
    );
  }

  private sendDirectionalInputIfChanged(directionX: number, directionY: number): void {
    if (
      this.lastSentDirection.x === directionX &&
      this.lastSentDirection.y === directionY
    ) {
      return;
    }

    this.multiplayerClient.sendInput(directionX, directionY);
    this.lastSentDirection.set(directionX, directionY);

    if (directionX !== 0 || directionY !== 0) {
      this.pendingNpcAction = null;
      this.multiplayerClient.sendInteractStop();
    }
  }

  private applySnapshot(snapshot: WorldSnapshot): void {
    this.applyPlayerSnapshot(snapshot.players);
    this.applyNodeSnapshot(snapshot.nodes);
    this.applyNpcSnapshot(snapshot.npcs);
    this.applyEnemySnapshot(snapshot.enemies);
    this.shopDefinitions = snapshot.shops;

    this.processPendingNpcAction();

    if (this.activeShopId && !this.shopDefinitions[this.activeShopId]) {
      this.closeShop();
    }
  }

  private applyPlayerSnapshot(players: Record<string, RemotePlayerState>): void {
    for (const playerState of Object.values(players)) {
      const tilePosition = this.resolveTilePosition(playerState);

      if (playerState.id === this.localPlayerId) {
        const previousLevels = this.previousSkillLevels;
        const previousHp = this.localPlayerState?.hp;
        this.localPlayerState = playerState;

        if (!this.localTilePosition) {
          this.localTilePosition = tilePosition.clone();
        } else {
          this.localTilePosition.copy(tilePosition);
        }
        this.localPathWaypoints = this.buildPathWaypoints(playerState);

        if (!this.localRenderedTilePosition) {
          this.localRenderedTilePosition = tilePosition.clone();
          const localWorldPosition = this.getWorldPositionFromTile(
            this.localRenderedTilePosition.x,
            this.localRenderedTilePosition.y,
          );
          this.player.setPosition(localWorldPosition.x, localWorldPosition.y);
        } else if (
          Phaser.Math.Distance.Between(
            this.localRenderedTilePosition.x,
            this.localRenderedTilePosition.y,
            this.localTilePosition.x,
            this.localTilePosition.y,
          ) > 4
        ) {
          this.localRenderedTilePosition.copy(this.localTilePosition);
        }

        this.previousSkillLevels = {
          woodcutting: playerState.skills.woodcutting.level,
          mining: playerState.skills.mining.level,
          strength: playerState.skills.strength.level,
          defense: playerState.skills.defense.level,
          constitution: playerState.skills.constitution.level,
        };

        if (previousLevels) {
          if (playerState.skills.woodcutting.level > previousLevels.woodcutting) {
            this.appendSystemChatMessage(
              `Woodcutting level is now ${playerState.skills.woodcutting.level}.`,
            );
          }

          if (playerState.skills.mining.level > previousLevels.mining) {
            this.appendSystemChatMessage(`Mining level is now ${playerState.skills.mining.level}.`);
          }

          if (playerState.skills.strength.level > previousLevels.strength) {
            this.appendSystemChatMessage(`Strength level is now ${playerState.skills.strength.level}.`);
          }

          if (playerState.skills.defense.level > previousLevels.defense) {
            this.appendSystemChatMessage(`Defense level is now ${playerState.skills.defense.level}.`);
          }

          if (playerState.skills.constitution.level > previousLevels.constitution) {
            this.appendSystemChatMessage(
              `Constitution level is now ${playerState.skills.constitution.level}.`,
            );
          }
        }

        if (typeof previousHp === 'number' && previousHp !== playerState.hp) {
          this.localHealthBarVisibleUntil = Date.now() + HEALTH_BAR_VISIBLE_MS;

          if (previousHp > playerState.hp) {
            this.showFloatingText(
              this.player.x,
              this.player.y - TILE_SIZE * 0.7,
              `-${Math.round(previousHp - playerState.hp)}`,
              '#ffb1b1',
            );
          }
        }
      } else {
        this.upsertRemotePlayer(playerState);
      }
    }

    const visibleIds = new Set(Object.keys(players));
    for (const [id, remotePlayer] of this.remotePlayers.entries()) {
      if (visibleIds.has(id)) {
        continue;
      }

      remotePlayer.sprite.destroy();
      this.remotePlayers.delete(id);
    }
  }

  private applyNodeSnapshot(nodes: Record<string, WorldNodeState>): void {
    for (const nodeState of Object.values(nodes)) {
      const position = this.getWorldPositionFromTile(nodeState.tileX, nodeState.tileY);
      const textureKey = nodeState.type === 'tree' ? TREE_TEXTURE_KEY : ROCK_TEXTURE_KEY;

      const existingNode = this.worldNodes.get(nodeState.id);
      if (existingNode) {
        existingNode.state = nodeState;
        existingNode.sprite.setPosition(position.x, position.y);
        this.styleNodeSprite(existingNode.sprite, nodeState);
        continue;
      }

      const nodeSprite = this.add
        .sprite(position.x, position.y, textureKey)
        .setInteractive({ useHandCursor: true })
        .setDepth(2);

      nodeSprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (pointer.rightButtonDown()) {
          pointer.event.stopPropagation();
          this.openExamineContextMenu(pointer);
          return;
        }

        if (!pointer.leftButtonDown()) {
          return;
        }

        pointer.event.stopPropagation();
        this.showTileClickFeedback(nodeState.tileX, nodeState.tileY, 'interact');
        this.startNodeInteraction(nodeState.id);
      });

      this.styleNodeSprite(nodeSprite, nodeState);
      this.worldNodes.set(nodeState.id, {
        state: nodeState,
        sprite: nodeSprite,
      });
    }

    const visibleNodeIds = new Set(Object.keys(nodes));
    for (const [nodeId, nodeVisual] of this.worldNodes.entries()) {
      if (visibleNodeIds.has(nodeId)) {
        continue;
      }

      nodeVisual.sprite.destroy();
      this.worldNodes.delete(nodeId);
    }
  }

  private applyNpcSnapshot(npcs: Record<string, NpcState>): void {
    for (const npcState of Object.values(npcs)) {
      const position = this.getWorldPositionFromTile(npcState.tileX, npcState.tileY);

      const existingNpc = this.worldNpcs.get(npcState.id);
      if (existingNpc) {
        existingNpc.state = npcState;
        existingNpc.sprite.setPosition(position.x, position.y);
        continue;
      }

      const npcSprite = this.add
        .sprite(position.x, position.y, PLAYER_TEXTURE_KEY)
        .setTint(0xc9a4ff)
        .setDepth(2);

      this.worldNpcs.set(npcState.id, {
        state: npcState,
        sprite: npcSprite,
      });
    }

    const visibleNpcIds = new Set(Object.keys(npcs));
    for (const [npcId, npcVisual] of this.worldNpcs.entries()) {
      if (visibleNpcIds.has(npcId)) {
        continue;
      }

      npcVisual.sprite.destroy();
      this.worldNpcs.delete(npcId);
    }
  }

  private applyEnemySnapshot(enemies: Record<string, EnemyState>): void {
    for (const enemyState of Object.values(enemies)) {
      const position = this.getWorldPositionFromTile(enemyState.tileX, enemyState.tileY);
      const existingEnemy = this.worldEnemies.get(enemyState.id);
      const targetTilePosition = new Phaser.Math.Vector2(enemyState.tileX, enemyState.tileY);
      const waypoints = this.buildEnemyPathWaypoints(enemyState);

      if (existingEnemy) {
        const hpChanged = existingEnemy.state.hp !== enemyState.hp;
        const previousHp = existingEnemy.state.hp;
        existingEnemy.state = enemyState;
        existingEnemy.targetTilePosition.copy(targetTilePosition);
        existingEnemy.pathWaypoints = waypoints;

        if (
          Phaser.Math.Distance.Between(
            existingEnemy.renderedTilePosition.x,
            existingEnemy.renderedTilePosition.y,
            existingEnemy.targetTilePosition.x,
            existingEnemy.targetTilePosition.y,
          ) > 4
        ) {
          existingEnemy.renderedTilePosition.copy(existingEnemy.targetTilePosition);
        }

        existingEnemy.sprite.setPosition(position.x, position.y);
        existingEnemy.sprite.setVisible(!enemyState.isDead);
        existingEnemy.sprite.setAlpha(enemyState.isDead ? 0.35 : 1);

        if (hpChanged) {
          existingEnemy.healthBarVisibleUntil = Date.now() + HEALTH_BAR_VISIBLE_MS;

          if (previousHp > enemyState.hp) {
            this.showFloatingText(
              existingEnemy.sprite.x,
              existingEnemy.sprite.y - TILE_SIZE * 0.7,
              `-${Math.round(previousHp - enemyState.hp)}`,
              '#ffe08a',
            );
          }
        }
        continue;
      }

      const enemySprite = this.add
        .sprite(position.x, position.y, ENEMY_TEXTURE_KEY)
        .setTint(0xff8a8a)
        .setDepth(2)
        .setVisible(!enemyState.isDead)
        .setAlpha(enemyState.isDead ? 0.35 : 1);
      const healthBar = this.add.graphics().setDepth(60);
      healthBar.setVisible(false);

      this.worldEnemies.set(enemyState.id, {
        state: enemyState,
        sprite: enemySprite,
        targetTilePosition: targetTilePosition.clone(),
        renderedTilePosition: targetTilePosition.clone(),
        pathWaypoints: waypoints,
        healthBar,
        healthBarVisibleUntil: 0,
      });
    }

    const visibleEnemyIds = new Set(Object.keys(enemies));
    for (const [enemyId, enemyVisual] of this.worldEnemies.entries()) {
      if (visibleEnemyIds.has(enemyId)) {
        continue;
      }

      enemyVisual.sprite.destroy();
      enemyVisual.healthBar.destroy();
      this.worldEnemies.delete(enemyId);
    }
  }

  private styleNodeSprite(sprite: Phaser.GameObjects.Sprite, nodeState: WorldNodeState): void {
    sprite.setAlpha(nodeState.isDepleted ? 0.35 : 1);
    sprite.clearTint();

    if (nodeState.isDepleted) {
      sprite.setTint(0x7a7a7a);
    }
  }

  private upsertRemotePlayer(playerState: RemotePlayerState): void {
    if (playerState.id === this.localPlayerId) {
      return;
    }

    const tilePosition = this.resolveTilePosition(playerState);
    const worldPosition = this.getWorldPositionFromTile(tilePosition.x, tilePosition.y);

    const existingPlayer = this.remotePlayers.get(playerState.id);
    if (existingPlayer) {
      const hpChanged = existingPlayer.state.hp !== playerState.hp;
      const previousHp = existingPlayer.state.hp;
      existingPlayer.state = playerState;
      existingPlayer.targetTilePosition.copy(tilePosition);
      existingPlayer.pathWaypoints = this.buildPathWaypoints(playerState);

      if (hpChanged) {
        existingPlayer.healthBarVisibleUntil = Date.now() + HEALTH_BAR_VISIBLE_MS;

        if (previousHp > playerState.hp) {
          this.showFloatingText(
            existingPlayer.sprite.x,
            existingPlayer.sprite.y - TILE_SIZE * 0.7,
            `-${Math.round(previousHp - playerState.hp)}`,
            '#ffb1b1',
          );
        }
      }

      if (
        Phaser.Math.Distance.Between(
          existingPlayer.renderedTilePosition.x,
          existingPlayer.renderedTilePosition.y,
          existingPlayer.targetTilePosition.x,
          existingPlayer.targetTilePosition.y,
        ) > 4
      ) {
        existingPlayer.renderedTilePosition.copy(existingPlayer.targetTilePosition);
      }
      return;
    }

    const remotePlayer = this.add
      .sprite(worldPosition.x, worldPosition.y, PLAYER_TEXTURE_KEY)
      .setTint(0xffd38f);
    const healthBar = this.add.graphics().setDepth(60);
    healthBar.setVisible(false);

    this.remotePlayers.set(playerState.id, {
      state: playerState,
      sprite: remotePlayer,
      targetTilePosition: tilePosition.clone(),
      renderedTilePosition: tilePosition.clone(),
      pathWaypoints: this.buildPathWaypoints(playerState),
      healthBar,
      healthBarVisibleUntil: 0,
    });
  }

  private resolveTilePosition(playerState: RemotePlayerState): Phaser.Math.Vector2 {
    const hasTileCoords =
      Number.isFinite(playerState.tileX) && Number.isFinite(playerState.tileY);

    if (hasTileCoords) {
      return new Phaser.Math.Vector2(
        Phaser.Math.Clamp(Math.round(playerState.tileX), 0, MAP_WIDTH_TILES - 1),
        Phaser.Math.Clamp(Math.round(playerState.tileY), 0, MAP_HEIGHT_TILES - 1),
      );
    }

    const fallbackTileX = Number.isFinite(playerState.x)
      ? Math.round(playerState.x / TILE_SIZE - 0.5)
      : Math.floor(MAP_WIDTH_TILES * 0.5);
    const fallbackTileY = Number.isFinite(playerState.y)
      ? Math.round(playerState.y / TILE_SIZE - 0.5)
      : Math.floor(MAP_HEIGHT_TILES * 0.5);

    return new Phaser.Math.Vector2(
      Phaser.Math.Clamp(fallbackTileX, 0, MAP_WIDTH_TILES - 1),
      Phaser.Math.Clamp(fallbackTileY, 0, MAP_HEIGHT_TILES - 1),
    );
  }

  private getWorldPositionFromTile(tileX: number, tileY: number): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(
      tileX * TILE_SIZE + TILE_SIZE * 0.5,
      tileY * TILE_SIZE + TILE_SIZE * 0.5,
    );
  }

  private removeRemotePlayer(id: string): void {
    const remotePlayer = this.remotePlayers.get(id);
    if (!remotePlayer) {
      return;
    }

    remotePlayer.sprite.destroy();
    remotePlayer.healthBar.destroy();
    this.remotePlayers.delete(id);
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (pointer.rightButtonDown()) {
      this.openExamineContextMenu(pointer);
      return;
    }

    this.hideContextMenu();

    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const tileX = Phaser.Math.Clamp(Math.floor(worldPoint.x / TILE_SIZE), 0, MAP_WIDTH_TILES - 1);
    const tileY = Phaser.Math.Clamp(Math.floor(worldPoint.y / TILE_SIZE), 0, MAP_HEIGHT_TILES - 1);

    const clickedNode = this.findNodeAtTile(tileX, tileY);

    if (clickedNode) {
      this.showTileClickFeedback(tileX, tileY, 'interact');
      this.startNodeInteraction(clickedNode.state.id);
      return;
    }

    const clickedNpc = this.findNpcAtTile(tileX, tileY);
    if (clickedNpc) {
      this.showTileClickFeedback(tileX, tileY, 'npc-interact');
      this.talkToNpc(clickedNpc.state.id);
      return;
    }

    const clickedEnemy = this.findEnemyAtTile(tileX, tileY);
    if (clickedEnemy && !clickedEnemy.state.isDead) {
      this.showTileClickFeedback(tileX, tileY, 'interact');
      this.attackEnemy(clickedEnemy.state.id);
      return;
    }

    this.performWalkTo(tileX, tileY);
  }

  private startNodeInteraction(nodeId: string): void {
    this.hideContextMenu();
    this.multiplayerClient.sendInput(0, 0);
    this.lastSentDirection.set(0, 0);
    this.multiplayerClient.sendInteractStart(nodeId);
  }

  private openExamineContextMenu(pointer: Phaser.Input.Pointer): void {
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const tileX = Phaser.Math.Clamp(Math.floor(worldPoint.x / TILE_SIZE), 0, MAP_WIDTH_TILES - 1);
    const tileY = Phaser.Math.Clamp(Math.floor(worldPoint.y / TILE_SIZE), 0, MAP_HEIGHT_TILES - 1);

    const options: ContextMenuOption[] = [];
    const nodeAtTile = this.findNodeAtTile(tileX, tileY);
    const npcAtTile = this.findNpcAtTile(tileX, tileY);
    const enemyAtTile = this.findEnemyAtTile(tileX, tileY);
    const playersAtTile = this.getPlayersAtTile(tileX, tileY);
    const tileType = this.getTileTypeName(tileX, tileY);

    options.push({
      label: `${tileType} tile`,
    });

    if (nodeAtTile) {
      const name = nodeAtTile.state.type === 'tree' ? 'Tree' : 'Rock';

      options.push({
        label: nodeAtTile.state.type === 'tree' ? 'Cut Tree' : 'Mine Rock',
        onSelect: () => {
          this.startNodeInteraction(nodeAtTile.state.id);
        },
      });

      options.push({
        label: `Examine ${name}`,
        onSelect: () => {
          this.appendSystemChatMessage(`It's a ${name.toLowerCase()}.`);
        },
      });
    }

    if (npcAtTile) {
      options.push({
        label: `Talk-to ${npcAtTile.state.name}`,
        onSelect: () => {
          this.talkToNpc(npcAtTile.state.id);
        },
      });

      options.push({
        label: `Trade with ${npcAtTile.state.name}`,
        onSelect: () => {
          this.tradeWithNpc(npcAtTile.state.id);
        },
      });

      options.push({
        label: `Examine ${npcAtTile.state.name}`,
        onSelect: () => {
          this.appendSystemChatMessage(npcAtTile.state.examineText);
        },
      });
    }

    if (enemyAtTile) {
      options.push({
        label: `Attack ${enemyAtTile.state.name}`,
        onSelect: () => {
          this.attackEnemy(enemyAtTile.state.id);
        },
      });

      options.push({
        label: `Examine ${enemyAtTile.state.name}`,
        onSelect: () => {
          this.appendSystemChatMessage(enemyAtTile.state.examineText);
        },
      });
    }

    for (const playerEntry of playersAtTile) {
      options.push({
        label: playerEntry.isLocal
          ? `Examine ${playerEntry.displayName} (You)`
          : `Examine ${playerEntry.displayName}`,
        onSelect: () => {
          this.appendSystemChatMessage(
            playerEntry.isLocal ? 'You look ready for adventure.' : 'Another adventurer is here.',
          );
        },
      });
    }

    options.push({
      label: 'Walk here',
      onSelect: () => {
        this.performWalkTo(tileX, tileY);
      },
    });

    this.showContextMenu(pointer, options);
  }

  private showContextMenu(pointer: Phaser.Input.Pointer, options: ContextMenuOption[]): void {
    this.hideContextMenu();

    const pointerPosition = this.getPointerClientPosition(pointer);
    this.showContextMenuAt(pointerPosition.x, pointerPosition.y, options);
  }

  private showContextMenuAt(clientX: number, clientY: number, options: ContextMenuOption[]): void {
    this.hideContextMenu();

    const appElement = document.querySelector<HTMLDivElement>('#app');
    if (!appElement) {
      return;
    }

    const menu = this.createContextMenuElement(options);
    appElement.appendChild(menu);
    this.positionContextMenu(menu, clientX, clientY + 8);

    this.contextMenuElement = menu;
  }

  private createContextMenuElement(options: ContextMenuOption[]): HTMLDivElement {
    const menu = document.createElement('div');
    menu.style.position = 'fixed';
    menu.style.minWidth = '170px';
    menu.style.background = 'rgba(19, 19, 19, 0.96)';
    menu.style.border = '1px solid rgba(154, 144, 107, 1)';
    menu.style.padding = '6px 0';
    menu.style.zIndex = '3000';
    menu.style.pointerEvents = 'auto';
    menu.style.boxShadow = '0 2px 10px rgba(0,0,0,0.45)';
    menu.style.userSelect = 'none';

    for (const option of options) {
      const row = document.createElement('div');
      row.textContent = option.label;
      row.style.fontFamily = 'monospace';
      row.style.fontSize = '13px';
      row.style.padding = '4px 10px';
      row.style.whiteSpace = 'nowrap';

      if (option.onSelect) {
        row.style.color = '#efe8cc';
        row.style.cursor = 'pointer';

        row.addEventListener('mouseenter', () => {
          row.style.background = 'rgba(125, 109, 47, 0.45)';
          row.style.color = '#fff4c7';
        });

        row.addEventListener('mouseleave', () => {
          row.style.background = 'transparent';
          row.style.color = '#efe8cc';
        });

        row.addEventListener('mousedown', (event) => {
          event.stopPropagation();
          if (event.button !== 0) {
            return;
          }

          option.onSelect?.();
          this.hideContextMenu();
        });
      } else {
        row.style.color = '#bbb39a';
      }

      menu.appendChild(row);
    }

    return menu;
  }

  private positionContextMenu(menu: HTMLDivElement, requestedLeft: number, requestedTop: number): void {
    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;
    const left = Math.max(0, Math.min(requestedLeft, window.innerWidth - menuWidth));
    const top = Math.max(0, Math.min(requestedTop, window.innerHeight - menuHeight));

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  private hideContextMenu(): void {
    if (!this.contextMenuElement) {
      return;
    }

    this.contextMenuElement.remove();
    this.contextMenuElement = null;
  }

  private getPointerClientPosition(pointer: Phaser.Input.Pointer): { x: number; y: number } {
    const event = pointer.event as MouseEvent | PointerEvent | undefined;
    if (event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
      return {
        x: event.clientX,
        y: event.clientY,
      };
    }

    const bounds = this.game.canvas.getBoundingClientRect();
    return {
      x: bounds.left + (pointer.x / this.scale.width) * bounds.width,
      y: bounds.top + (pointer.y / this.scale.height) * bounds.height,
    };
  }

  private performWalkTo(
    tileX: number,
    tileY: number,
    clearPendingNpcAction = true,
    showClickFeedback = true,
  ): void {
    const destination = this.resolveWalkDestination(tileX, tileY);

    if (clearPendingNpcAction) {
      this.pendingNpcAction = null;
    }

    this.hideContextMenu();
    if (showClickFeedback) {
      this.showTileClickFeedback(destination.x, destination.y, 'walk');
    }
    this.multiplayerClient.sendInput(0, 0);
    this.lastSentDirection.set(0, 0);
    this.multiplayerClient.sendInteractStop();
    this.multiplayerClient.sendMoveTo(destination.x, destination.y);
  }

  private resolveWalkDestination(tileX: number, tileY: number): Phaser.Math.Vector2 {
    const nodeAtTarget = this.findNodeAtTile(tileX, tileY);
    const npcAtTarget = this.findNpcAtTile(tileX, tileY);
    const enemyAtTarget = this.findEnemyAtTile(tileX, tileY);
    if (!nodeAtTarget && !npcAtTarget && !enemyAtTarget) {
      return new Phaser.Math.Vector2(tileX, tileY);
    }

    const candidateTiles = [
      new Phaser.Math.Vector2(tileX + 1, tileY),
      new Phaser.Math.Vector2(tileX - 1, tileY),
      new Phaser.Math.Vector2(tileX, tileY + 1),
      new Phaser.Math.Vector2(tileX, tileY - 1),
    ].filter((candidate) => this.isTileWalkable(candidate.x, candidate.y));

    if (candidateTiles.length === 0) {
      return new Phaser.Math.Vector2(tileX, tileY);
    }

    const origin = this.localTilePosition
      ? this.localTilePosition
      : new Phaser.Math.Vector2(
          Math.floor(this.player.x / TILE_SIZE),
          Math.floor(this.player.y / TILE_SIZE),
        );

    const reachableCandidates = candidateTiles
      .map((candidate) => ({
        candidate,
        pathLength: this.getPathLength(
          Math.round(origin.x),
          Math.round(origin.y),
          candidate.x,
          candidate.y,
        ),
      }))
      .filter(
        (entry): entry is { candidate: Phaser.Math.Vector2; pathLength: number } =>
          entry.pathLength !== null,
      );

    if (reachableCandidates.length === 0) {
      return new Phaser.Math.Vector2(tileX, tileY);
    }

    reachableCandidates.sort((left, right) => {
      if (left.pathLength !== right.pathLength) {
        return left.pathLength - right.pathLength;
      }

      const leftDistance =
        Math.abs(origin.x - left.candidate.x) + Math.abs(origin.y - left.candidate.y);
      const rightDistance =
        Math.abs(origin.x - right.candidate.x) + Math.abs(origin.y - right.candidate.y);
      return leftDistance - rightDistance;
    });

    return reachableCandidates[0].candidate;
  }

  private getPathLength(
    startTileX: number,
    startTileY: number,
    targetTileX: number,
    targetTileY: number,
  ): number | null {
    if (startTileX === targetTileX && startTileY === targetTileY) {
      return 0;
    }

    if (!this.isTileWalkable(targetTileX, targetTileY)) {
      return null;
    }

    const queue: Array<{ x: number; y: number; distance: number }> = [
      { x: startTileX, y: startTileY, distance: 0 },
    ];
    let queueIndex = 0;
    const visited = new Set<string>([`${startTileX},${startTileY}`]);

    while (queueIndex < queue.length) {
      const current = queue[queueIndex];
      queueIndex += 1;

      const neighbors = [
        { x: current.x + 1, y: current.y },
        { x: current.x - 1, y: current.y },
        { x: current.x, y: current.y + 1 },
        { x: current.x, y: current.y - 1 },
        { x: current.x + 1, y: current.y + 1 },
        { x: current.x + 1, y: current.y - 1 },
        { x: current.x - 1, y: current.y + 1 },
        { x: current.x - 1, y: current.y - 1 },
      ];

      for (const neighbor of neighbors) {
        if (!this.canTraverseBetweenTiles(current.x, current.y, neighbor.x, neighbor.y)) {
          continue;
        }

        const key = `${neighbor.x},${neighbor.y}`;
        if (visited.has(key)) {
          continue;
        }

        const nextDistance = current.distance + 1;
        if (neighbor.x === targetTileX && neighbor.y === targetTileY) {
          return nextDistance;
        }

        visited.add(key);
        queue.push({ x: neighbor.x, y: neighbor.y, distance: nextDistance });
      }
    }

    return null;
  }

  private canTraverseBetweenTiles(
    fromTileX: number,
    fromTileY: number,
    toTileX: number,
    toTileY: number,
  ): boolean {
    const deltaX = toTileX - fromTileX;
    const deltaY = toTileY - fromTileY;

    if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
      return false;
    }

    if (!this.isTileWalkable(toTileX, toTileY)) {
      return false;
    }

    if (Math.abs(deltaX) === 1 && Math.abs(deltaY) === 1) {
      const sideATileX = fromTileX + deltaX;
      const sideATileY = fromTileY;
      const sideBTileX = fromTileX;
      const sideBTileY = fromTileY + deltaY;
      return (
        this.isTileWalkable(sideATileX, sideATileY) &&
        this.isTileWalkable(sideBTileX, sideBTileY)
      );
    }

    return true;
  }

  private isTileWalkable(tileX: number, tileY: number): boolean {
    if (tileX < 0 || tileY < 0 || tileX >= MAP_WIDTH_TILES || tileY >= MAP_HEIGHT_TILES) {
      return false;
    }

    const tileId = this.terrainData[tileY]?.[tileX];
    if (tileId === WATER_TILE_ID) {
      return false;
    }

    return !this.findNodeAtTile(tileX, tileY) && !this.findNpcAtTile(tileX, tileY);
  }

  private attackEnemy(enemyId: string): void {
    this.hideContextMenu();
    this.multiplayerClient.sendCombatAttack(enemyId);
  }

  private talkToNpc(npcId: string): void {
    this.hideContextMenu();
    this.startNpcAction(npcId, 'talk');
  }

  private tradeWithNpc(npcId: string): void {
    this.hideContextMenu();
    this.startNpcAction(npcId, 'trade');
  }

  private startNpcAction(npcId: string, action: PendingNpcAction['action']): void {
    const npcVisual = this.worldNpcs.get(npcId);
    if (!npcVisual) {
      return;
    }

    this.showTileClickFeedback(npcVisual.state.tileX, npcVisual.state.tileY, 'npc-interact');

    if (this.isAdjacentToTile(npcVisual.state.tileX, npcVisual.state.tileY)) {
      this.executeNpcAction(npcId, action);
      return;
    }

    const destination = this.resolveWalkDestination(npcVisual.state.tileX, npcVisual.state.tileY);
    if (destination.x === npcVisual.state.tileX && destination.y === npcVisual.state.tileY) {
      this.appendSystemChatMessage(`You can't reach ${npcVisual.state.name} from here.`);
      return;
    }

    this.pendingNpcAction = { npcId, action };
    this.performWalkTo(npcVisual.state.tileX, npcVisual.state.tileY, false, false);
  }

  private processPendingNpcAction(): void {
    if (!this.pendingNpcAction) {
      return;
    }

    const npcVisual = this.worldNpcs.get(this.pendingNpcAction.npcId);
    if (!npcVisual) {
      this.pendingNpcAction = null;
      return;
    }

    if (this.isAdjacentToTile(npcVisual.state.tileX, npcVisual.state.tileY)) {
      const pending = this.pendingNpcAction;
      this.pendingNpcAction = null;
      this.executeNpcAction(pending.npcId, pending.action);
      return;
    }

    if (
      this.localPlayerState &&
      this.localPlayerState.targetTileX === null &&
      this.localPlayerState.targetTileY === null
    ) {
      this.pendingNpcAction = null;
    }
  }

  private executeNpcAction(npcId: string, action: PendingNpcAction['action']): void {
    if (action === 'talk') {
      this.multiplayerClient.sendNpcTalk(npcId);
      return;
    }

    this.multiplayerClient.sendShopOpen(npcId);
  }

  private isAdjacentToTile(tileX: number, tileY: number): boolean {
    if (!this.localTilePosition) {
      return false;
    }

    const distance =
      Math.abs(Math.round(this.localTilePosition.x) - tileX) +
      Math.abs(Math.round(this.localTilePosition.y) - tileY);
    return distance <= 1;
  }

  private initChatUi(): void {
    const appElement = document.querySelector<HTMLDivElement>('#app');
    if (!appElement) {
      return;
    }

    const root = document.createElement('div');
    root.style.position = 'fixed';
    root.style.left = '12px';
    root.style.bottom = '12px';
    root.style.width = '360px';
    root.style.height = '170px';
    root.style.background = 'rgba(0, 0, 0, 0.72)';
    root.style.border = '1px solid rgba(183, 170, 129, 0.85)';
    root.style.display = 'flex';
    root.style.flexDirection = 'column';
    root.style.padding = '6px';
    root.style.gap = '6px';
    root.style.zIndex = '2500';
    root.style.pointerEvents = 'auto';
    root.style.color = '#f0e5c1';
    root.style.fontFamily = 'monospace';
    root.style.fontSize = '12px';

    const log = document.createElement('div');
    log.style.flex = '1';
    log.style.overflowY = 'auto';
    log.style.whiteSpace = 'pre-wrap';
    log.style.wordBreak = 'break-word';
    log.style.paddingRight = '4px';

    const form = document.createElement('form');
    form.style.display = 'flex';
    form.style.gap = '6px';

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 120;
    input.placeholder = 'Type message...';
    input.style.flex = '1';
    input.style.background = 'rgba(23, 23, 23, 0.95)';
    input.style.border = '1px solid rgba(150, 138, 102, 0.9)';
    input.style.color = '#f0e5c1';
    input.style.fontFamily = 'monospace';
    input.style.fontSize = '12px';
    input.style.padding = '4px 6px';
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
    });

    const button = document.createElement('button');
    button.type = 'submit';
    button.textContent = 'Send';
    button.style.background = 'rgba(64, 58, 41, 0.95)';
    button.style.border = '1px solid rgba(150, 138, 102, 0.9)';
    button.style.color = '#f0e5c1';
    button.style.fontFamily = 'monospace';
    button.style.fontSize = '12px';
    button.style.padding = '4px 10px';
    button.style.cursor = 'pointer';

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.sendChatFromInput();
    });

    form.append(input, button);
    root.append(log, form);
    appElement.append(root);

    this.chatRootElement = root;
    this.chatLogElement = log;
    this.chatInputElement = input;
  }

  private initCharacterUi(): void {
    const appElement = document.querySelector<HTMLDivElement>('#app');
    if (!appElement) {
      return;
    }

    const root = document.createElement('div');
    root.style.position = 'fixed';
    root.style.right = '12px';
    root.style.top = '12px';
    root.style.width = '230px';
    root.style.maxHeight = '260px';
    root.style.background = 'rgba(0, 0, 0, 0.72)';
    root.style.border = '1px solid rgba(183, 170, 129, 0.85)';
    root.style.display = 'flex';
    root.style.flexDirection = 'column';
    root.style.padding = '6px';
    root.style.gap = '6px';
    root.style.zIndex = '2500';
    root.style.pointerEvents = 'auto';
    root.style.color = '#f0e5c1';
    root.style.fontFamily = 'monospace';
    root.style.fontSize = '12px';

    const tabBar = document.createElement('div');
    tabBar.style.display = 'flex';
    tabBar.style.gap = '4px';

    const createTabButton = (label: string, tab: 'skills' | 'inventory'): HTMLButtonElement => {
      const button = document.createElement('button');
      button.textContent = label;
      button.style.flex = '1';
      button.style.background = 'rgba(64, 58, 41, 0.95)';
      button.style.border = '1px solid rgba(150, 138, 102, 0.9)';
      button.style.color = '#f0e5c1';
      button.style.fontFamily = 'monospace';
      button.style.fontSize = '12px';
      button.style.padding = '4px 6px';
      button.style.cursor = 'pointer';
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.activeCharacterTab = tab;
        this.updateCharacterTabState();
      });
      return button;
    };

    const skillsTabButton = createTabButton('Skills', 'skills');
    const inventoryTabButton = createTabButton('Inventory', 'inventory');
    tabBar.append(skillsTabButton, inventoryTabButton);

    const skillsContent = document.createElement('div');
    skillsContent.style.whiteSpace = 'pre-line';
    skillsContent.textContent = 'Woodcutting Lv 1\nMining Lv 1';

    const inventoryContent = document.createElement('div');
    inventoryContent.style.display = 'flex';
    inventoryContent.style.flexDirection = 'column';
    inventoryContent.style.gap = '6px';

    const inventoryHeader = document.createElement('div');
    inventoryHeader.textContent = 'HP: 0/0  Gold: 0  Slots: 0/0';
    inventoryHeader.style.color = '#fff4c7';

    const inventoryGrid = document.createElement('div');
    inventoryGrid.style.display = 'grid';
    inventoryGrid.style.gridTemplateColumns = 'repeat(4, minmax(0, 1fr))';
    inventoryGrid.style.gap = '4px';

    inventoryContent.append(inventoryHeader, inventoryGrid);

    root.append(tabBar, skillsContent, inventoryContent);
    appElement.append(root);

    this.characterRootElement = root;
    this.characterTabBarElement = tabBar;
    this.skillsRootElement = root;
    this.skillsContentElement = skillsContent;
    this.inventoryContentElement = inventoryContent;
    this.inventoryHeaderElement = inventoryHeader;
    this.inventoryGridElement = inventoryGrid;
    this.updateCharacterTabState();
  }

  private updateCharacterTabState(): void {
    const skillsVisible = this.activeCharacterTab === 'skills';

    if (this.skillsContentElement) {
      this.skillsContentElement.style.display = skillsVisible ? 'block' : 'none';
    }

    if (this.inventoryContentElement) {
      this.inventoryContentElement.style.display = skillsVisible ? 'none' : 'block';
    }

    const tabButtons = this.characterTabBarElement?.querySelectorAll<HTMLButtonElement>('button');
    if (!tabButtons) {
      return;
    }

    for (const button of tabButtons) {
      const isActive =
        (skillsVisible && button.textContent === 'Skills') ||
        (!skillsVisible && button.textContent === 'Inventory');

      button.style.background = isActive ? 'rgba(90, 82, 56, 0.98)' : 'rgba(64, 58, 41, 0.95)';
      button.style.color = isActive ? '#fff4c7' : '#f0e5c1';
    }
  }

  private initShopUi(): void {
    const appElement = document.querySelector<HTMLDivElement>('#app');
    if (!appElement) {
      return;
    }

    const root = document.createElement('div');
    root.style.position = 'fixed';
    root.style.right = '12px';
    root.style.top = '320px';
    root.style.width = '260px';
    root.style.maxHeight = '300px';
    root.style.background = 'rgba(0, 0, 0, 0.8)';
    root.style.border = '1px solid rgba(183, 170, 129, 0.9)';
    root.style.display = 'none';
    root.style.flexDirection = 'column';
    root.style.padding = '6px';
    root.style.gap = '6px';
    root.style.zIndex = '2600';
    root.style.pointerEvents = 'auto';
    root.style.color = '#f0e5c1';
    root.style.fontFamily = 'monospace';
    root.style.fontSize = '12px';

    const content = document.createElement('div');
    content.style.overflowY = 'auto';
    content.style.maxHeight = '260px';
    content.style.whiteSpace = 'pre-line';

    root.append(content);
    appElement.append(root);

    this.shopRootElement = root;
    this.shopContentElement = content;
  }

  private sendChatFromInput(): void {
    if (!this.chatInputElement) {
      return;
    }

    const text = this.chatInputElement.value.trim();
    if (!text) {
      return;
    }

    this.multiplayerClient.sendChat(text);
    this.chatInputElement.value = '';
  }

  private handleChatMessage(message: ChatMessageState): void {
    this.appendChatLine(message.text);
  }

  private openShop(shopId: string): void {
    this.activeShopId = shopId;
    this.lastRenderedShopSignature = null;
    if (this.shopRootElement) {
      this.shopRootElement.style.display = 'flex';
    }

    this.renderShopPanel();
  }

  private closeShop(): void {
    this.activeShopId = null;
    this.lastRenderedShopSignature = null;
    if (this.shopRootElement) {
      this.shopRootElement.style.display = 'none';
    }
  }

  private appendSystemChatMessage(text: string): void {
    this.appendChatLine(`[Examine] ${text}`);
  }

  private appendChatLine(text: string): void {
    if (!this.chatLogElement) {
      return;
    }

    this.chatMessages.push(text);
    if (this.chatMessages.length > 40) {
      this.chatMessages.shift();
    }

    this.chatLogElement.textContent = this.chatMessages.join('\n');
    this.chatLogElement.scrollTop = this.chatLogElement.scrollHeight;
  }

  private getTileTypeName(tileX: number, tileY: number): string {
    const tileId = this.terrainData[tileY]?.[tileX];

    if (tileId === 0) {
      return 'Grass';
    }

    if (tileId === 1) {
      return 'Dirt';
    }

    if (tileId === 2) {
      return 'Water';
    }

    if (tileId === 3) {
      return 'Sand';
    }

    return 'Unknown';
  }

  private getPlayersAtTile(
    tileX: number,
    tileY: number,
  ): Array<{ id: string; isLocal: boolean; displayName: string }> {
    const results: Array<{ id: string; isLocal: boolean; displayName: string }> = [];

    if (
      this.localPlayerId &&
      this.localPlayerState &&
      this.localTilePosition &&
      Math.round(this.localTilePosition.x) === tileX &&
      Math.round(this.localTilePosition.y) === tileY
    ) {
      results.push({
        id: this.localPlayerId,
        isLocal: true,
        displayName: this.localPlayerState.displayName,
      });
    }

    for (const [playerId, remotePlayer] of this.remotePlayers.entries()) {
      if (
        Math.round(remotePlayer.targetTilePosition.x) === tileX &&
        Math.round(remotePlayer.targetTilePosition.y) === tileY
      ) {
        results.push({
          id: playerId,
          isLocal: false,
          displayName: remotePlayer.state.displayName,
        });
      }
    }

    return results;
  }

  private showTileClickFeedback(
    tileX: number,
    tileY: number,
    kind: ClickFeedbackKind,
  ): void {
    const position = this.getWorldPositionFromTile(tileX, tileY);
    const marker = this.add.graphics().setDepth(50).setPosition(position.x, position.y);

    const colors =
      kind === 'interact'
        ? { outline: 0x7ed0ff, cross: 0xbfe9ff }
        : kind === 'npc-interact'
          ? { outline: 0xc59bff, cross: 0xead9ff }
          : { outline: 0xe7d27a, cross: 0xfff4c7 };

    marker.lineStyle(2, colors.outline, 1);
    marker.strokeRect(-TILE_SIZE * 0.4, -TILE_SIZE * 0.4, TILE_SIZE * 0.8, TILE_SIZE * 0.8);

    marker.lineStyle(2, colors.cross, 1);
    marker.beginPath();
    marker.moveTo(-6, 0);
    marker.lineTo(6, 0);
    marker.moveTo(0, -6);
    marker.lineTo(0, 6);
    marker.strokePath();

    marker.setScale(0.65);

    this.tweens.add({
      targets: marker,
      alpha: 0,
      scaleX: 1.25,
      scaleY: 1.25,
      duration: 260,
      ease: 'Quad.Out',
      onComplete: () => {
        marker.destroy();
      },
    });
  }

  private findNodeAtTile(tileX: number, tileY: number): WorldNodeVisual | null {
    for (const nodeVisual of this.worldNodes.values()) {
      if (nodeVisual.state.tileX === tileX && nodeVisual.state.tileY === tileY) {
        return nodeVisual;
      }
    }

    return null;
  }

  private findNpcAtTile(tileX: number, tileY: number): NpcVisual | null {
    for (const npcVisual of this.worldNpcs.values()) {
      if (npcVisual.state.tileX === tileX && npcVisual.state.tileY === tileY) {
        return npcVisual;
      }
    }

    return null;
  }

  private findEnemyAtTile(tileX: number, tileY: number): EnemyVisual | null {
    for (const enemyVisual of this.worldEnemies.values()) {
      if (enemyVisual.state.isDead) {
        continue;
      }

      if (enemyVisual.state.tileX === tileX && enemyVisual.state.tileY === tileY) {
        return enemyVisual;
      }
    }

    return null;
  }

  private renderActionStatus(): void {
    if (!this.localPlayerState || !this.localTilePosition) {
      this.actionStatusText.setText('Connecting...');
      return;
    }

    let status = 'Idle';

    const activeNodeId = this.localPlayerState.activeInteractionNodeId;
    if (this.localPlayerState.combatTargetEnemyId) {
      const targetEnemy = this.worldEnemies.get(this.localPlayerState.combatTargetEnemyId)?.state;
      if (targetEnemy && !targetEnemy.isDead) {
        status = `Fighting ${targetEnemy.name} (${targetEnemy.hp}/${targetEnemy.maxHp})`;
      } else {
        status = 'Searching target...';
      }
    } else if (activeNodeId) {
      const activeNode = this.worldNodes.get(activeNodeId)?.state;

      if (activeNode) {
        const distance =
          Math.abs(this.localTilePosition.x - activeNode.tileX) +
          Math.abs(this.localTilePosition.y - activeNode.tileY);

        if (distance > 1) {
          status = `Out of range: ${activeNode.type}`;
        } else if (activeNode.isDepleted && activeNode.respawnAt) {
          const seconds = Math.max(0, (activeNode.respawnAt - Date.now()) / 1000);
          status = `${activeNode.type} respawns in ${seconds.toFixed(1)}s`;
        } else {
          status = `Gathering ${activeNode.type}...`;
        }
      }
    } else if (
      this.localPlayerState.targetTileX !== null &&
      this.localPlayerState.targetTileY !== null
    ) {
      status = `Moving to (${this.localPlayerState.targetTileX}, ${this.localPlayerState.targetTileY})`;
    } else if (this.localPlayerState.lastActionText) {
      status = this.localPlayerState.lastActionText;
    }

    this.actionStatusText.setText(
      `Status: ${status}`,
    );

    this.renderSkillsPanel();
    this.renderInventoryPanel();
    this.renderShopPanel();
  }

  private renderSkillsPanel(): void {
    if (!this.skillsContentElement || !this.localPlayerState) {
      return;
    }

    const skillLines = [
      { label: 'Woodcutting', value: this.localPlayerState.skills.woodcutting },
      { label: 'Mining', value: this.localPlayerState.skills.mining },
      { label: 'Strength', value: this.localPlayerState.skills.strength },
      { label: 'Defense', value: this.localPlayerState.skills.defense },
      { label: 'Constitution', value: this.localPlayerState.skills.constitution },
    ].map((entry) => {
      const nextXp = this.getXpRequiredForNextLevel(entry.value.level);
      const progress = nextXp === null ? `${entry.value.xp} / MAX` : `${entry.value.xp} / ${nextXp}`;
      return `${entry.label.padEnd(12, ' ')} Lv ${entry.value.level}  XP ${progress}`;
    });

    this.skillsContentElement.textContent = skillLines.join('\n');
  }

  private getXpRequiredForNextLevel(level: number): number | null {
    if (level >= 99) {
      return null;
    }

    return this.getXpForLevel(level + 1);
  }

  private getXpForLevel(level: number): number {
    if (level <= 1) {
      return 0;
    }

    return Math.floor(80 * (level - 1) * (level - 1) + 120 * (level - 1));
  }

  private getInventoryItemIcon(itemId: string): string {
    const existing = this.inventoryIconDataUrls.get(itemId);
    if (existing) {
      return existing;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const context = canvas.getContext('2d');
    if (!context) {
      return '';
    }

    context.imageSmoothingEnabled = false;
    context.fillStyle = '#1a1a1a';
    context.fillRect(0, 0, 16, 16);
    context.fillStyle = '#302c21';
    context.fillRect(1, 1, 14, 14);

    if (itemId === 'logs') {
      context.fillStyle = '#6e4f2f';
      context.fillRect(3, 8, 10, 3);
      context.fillStyle = '#9a7444';
      context.fillRect(2, 5, 10, 3);
      context.fillStyle = '#c79b62';
      context.fillRect(4, 3, 8, 2);
    } else if (itemId === 'copper_ore') {
      context.fillStyle = '#6f6764';
      context.fillRect(4, 4, 8, 8);
      context.fillStyle = '#b87333';
      context.fillRect(5, 5, 2, 2);
      context.fillRect(9, 6, 2, 2);
      context.fillRect(7, 9, 2, 2);
    } else if (itemId === 'tinderbox') {
      context.fillStyle = '#8a5a3a';
      context.fillRect(4, 4, 8, 8);
      context.fillStyle = '#d6a23f';
      context.fillRect(5, 6, 6, 2);
      context.fillStyle = '#f2d58a';
      context.fillRect(6, 5, 3, 1);
    } else if (itemId === 'bronze_axe') {
      context.fillStyle = '#7b5937';
      context.fillRect(7, 3, 2, 10);
      context.fillStyle = '#b48345';
      context.fillRect(4, 4, 4, 3);
      context.fillRect(3, 5, 2, 2);
    } else if (itemId === 'bronze_pickaxe') {
      context.fillStyle = '#7b5937';
      context.fillRect(7, 4, 2, 9);
      context.fillStyle = '#8c9499';
      context.fillRect(4, 4, 8, 2);
      context.fillRect(5, 6, 2, 1);
      context.fillRect(9, 6, 2, 1);
    } else {
      context.fillStyle = '#6f6f6f';
      context.fillRect(4, 4, 8, 8);
      context.fillStyle = '#9b9b9b';
      context.fillRect(5, 5, 6, 2);
    }

    const dataUrl = canvas.toDataURL('image/png');
    this.inventoryIconDataUrls.set(itemId, dataUrl);
    return dataUrl;
  }

  private renderInventoryPanel(): void {
    if (
      !this.inventoryContentElement ||
      !this.inventoryHeaderElement ||
      !this.inventoryGridElement ||
      !this.localPlayerState
    ) {
      return;
    }

    const inventory = this.localPlayerState.inventory;
    const usedSlots = inventory.slots.length;
    const gold = this.localPlayerState.gold;
    const hp = this.localPlayerState.hp;
    const maxHp = this.localPlayerState.maxHp;

    const inventorySignature = [
      hp,
      maxHp,
      gold,
      inventory.maxSlots,
      inventory.slots.map((slot) => `${slot.itemId}:${slot.quantity}`).join('|'),
    ].join('::');

    if (this.lastRenderedInventorySignature === inventorySignature) {
      return;
    }

    this.lastRenderedInventorySignature = inventorySignature;
    this.inventoryHeaderElement.textContent = `HP: ${hp}/${maxHp}  Gold: ${gold}  Slots: ${usedSlots}/${inventory.maxSlots}`;

    this.inventoryGridElement.innerHTML = '';
    const totalSlots = Math.max(1, inventory.maxSlots);

    for (let index = 0; index < totalSlots; index += 1) {
      const slot = inventory.slots[index];
      const cell = document.createElement('div');
      cell.style.minHeight = '44px';
      cell.style.background = slot ? 'rgba(68, 62, 44, 0.92)' : 'rgba(30, 30, 30, 0.75)';
      cell.style.border = '1px solid rgba(150, 138, 102, 0.9)';
      cell.style.padding = '0';
      cell.style.position = 'relative';
      cell.style.overflow = 'hidden';
      cell.style.display = 'flex';
      cell.style.flexDirection = 'column';
      cell.style.justifyContent = 'space-between';
      cell.style.gap = '3px';
      cell.style.userSelect = 'none';

      cell.addEventListener('dragover', (event) => {
        if (this.draggingInventoryIndex === null) {
          return;
        }

        event.preventDefault();
        cell.style.border = '1px solid rgba(225, 206, 130, 0.95)';
      });

      cell.addEventListener('dragleave', () => {
        cell.style.border = '1px solid rgba(150, 138, 102, 0.9)';
      });

      cell.addEventListener('drop', (event) => {
        event.preventDefault();

        const fallbackRaw = event.dataTransfer?.getData('text/plain');
        const fallbackFromIndex = fallbackRaw ? Number(fallbackRaw) : null;
        const fromIndex =
          this.draggingInventoryIndex !== null
            ? this.draggingInventoryIndex
            : typeof fallbackFromIndex === 'number' && Number.isFinite(fallbackFromIndex)
              ? Math.floor(fallbackFromIndex)
              : null;

        this.draggingInventoryIndex = null;
        this.clearInventoryDropHighlights();

        if (fromIndex === null || fromIndex === index) {
          return;
        }

        this.multiplayerClient.sendInventoryMove(fromIndex, index);
      });

      if (slot) {
        cell.draggable = true;
        cell.style.cursor = 'grab';
        cell.title = slot.name;

        const icon = document.createElement('img');
        icon.src = this.getInventoryItemIcon(slot.itemId);
        icon.alt = slot.name;
        icon.width = 44;
        icon.height = 44;
        icon.style.width = '100%';
        icon.style.height = '100%';
        icon.style.objectFit = 'cover';
        icon.style.display = 'block';
        icon.style.imageRendering = 'pixelated';
        icon.draggable = false;

        const quantity = document.createElement('div');
        quantity.textContent = slot.quantity > 1 ? `x${slot.quantity}` : '';
        quantity.style.fontSize = '11px';
        quantity.style.color = '#fff4c7';
        quantity.style.textAlign = 'right';
        quantity.style.position = 'absolute';
        quantity.style.right = '2px';
        quantity.style.top = '2px';
        quantity.style.background = 'rgba(0, 0, 0, 0.6)';
        quantity.style.padding = '0 2px';
        quantity.style.lineHeight = '1.1';

        const name = document.createElement('div');
        name.textContent = slot.name;
        name.style.position = 'absolute';
        name.style.left = '0';
        name.style.right = '0';
        name.style.bottom = '0';
        name.style.fontSize = '10px';
        name.style.color = '#fff0c2';
        name.style.background = 'rgba(0, 0, 0, 0.55)';
        name.style.padding = '0 2px';
        name.style.whiteSpace = 'nowrap';
        name.style.overflow = 'hidden';
        name.style.textOverflow = 'ellipsis';

        cell.append(icon, quantity, name);

        cell.addEventListener('dragstart', (event) => {
          this.hideContextMenu();
          this.draggingInventoryIndex = index;
          cell.style.opacity = '0.5';
          event.dataTransfer?.setData('text/plain', String(index));
          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
          }
        });

        cell.addEventListener('dragend', () => {
          this.draggingInventoryIndex = null;
          cell.style.opacity = '1';
          this.clearInventoryDropHighlights();
        });

        cell.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          event.stopPropagation();

          const options: ContextMenuOption[] = [
            {
              label: `Examine ${slot.name}`,
              onSelect: () => {
                const text = slot.examineText || `It's ${slot.name.toLowerCase()}.`;
                this.appendSystemChatMessage(text);
              },
            },
            {
              label: `Drop ${slot.name}`,
              onSelect: () => {
                this.multiplayerClient.sendInventoryDrop(index, 1);
              },
            },
          ];

          if (slot.quantity > 1) {
            options.push({
              label: `Drop all ${slot.name}`,
              onSelect: () => {
                this.multiplayerClient.sendInventoryDrop(index, slot.quantity);
              },
            });
          }

          this.showContextMenuAt(event.clientX, event.clientY, options);
        });
      }

      this.inventoryGridElement.appendChild(cell);
    }
  }

  private clearInventoryDropHighlights(): void {
    if (!this.inventoryGridElement) {
      return;
    }

    for (const child of this.inventoryGridElement.children) {
      const cell = child as HTMLDivElement;
      cell.style.border = '1px solid rgba(150, 138, 102, 0.9)';
    }
  }

  private renderShopPanel(): void {
    if (!this.shopContentElement || !this.activeShopId || !this.localPlayerState) {
      return;
    }

    const shop = this.shopDefinitions[this.activeShopId];
    if (!shop) {
      this.closeShop();
      return;
    }

    const inventorySignature = this.localPlayerState.inventory.slots
      .map((slot) => `${slot.itemId}:${slot.quantity}`)
      .sort()
      .join('|');
    const signature = [
      this.activeShopId,
      this.localPlayerState.gold,
      inventorySignature,
      shop.listings.map((listing) => `${listing.itemId}:${listing.buyPrice}:${listing.sellPrice}`).join('|'),
    ].join('::');

    if (this.lastRenderedShopSignature === signature) {
      return;
    }

    this.lastRenderedShopSignature = signature;

    this.shopContentElement.innerHTML = '';

    const title = document.createElement('div');
    title.textContent = `${shop.name} (Gold: ${this.localPlayerState.gold})`;
    title.style.color = '#fff4c7';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '4px';
    this.shopContentElement.appendChild(title);

    for (const listing of shop.listings) {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '6px';
      row.style.marginBottom = '4px';

      const label = document.createElement('div');
      label.textContent = `${listing.name} (B:${listing.buyPrice} / S:${listing.sellPrice})`;
      label.style.flex = '1';

      const buyButton = document.createElement('button');
      buyButton.textContent = 'Buy';
      buyButton.style.fontFamily = 'monospace';
      buyButton.style.fontSize = '11px';
      buyButton.style.cursor = 'pointer';
      buyButton.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.multiplayerClient.sendShopBuy(shop.id, listing.itemId, 1);
      });

      const sellButton = document.createElement('button');
      sellButton.textContent = 'Sell';
      sellButton.style.fontFamily = 'monospace';
      sellButton.style.fontSize = '11px';
      sellButton.style.cursor = 'pointer';
      sellButton.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.multiplayerClient.sendShopSell(shop.id, listing.itemId, 1);
      });

      row.append(label, buyButton, sellButton);
      this.shopContentElement.appendChild(row);
    }

    const closeButton = document.createElement('button');
    closeButton.textContent = 'Close';
    closeButton.style.fontFamily = 'monospace';
    closeButton.style.fontSize = '11px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.marginTop = '6px';
    closeButton.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.closeShop();
    });
    this.shopContentElement.appendChild(closeButton);
  }

  private renderDebugHud(): void {
    if (!this.debugHudVisible) {
      return;
    }

    const stats = this.multiplayerClient.getStats();

    const stateAgeMs = this.lastStateUpdateAt
      ? Math.max(0, Date.now() - this.lastStateUpdateAt)
      : -1;

    const lines = [
      'F3: Toggle Debug HUD',
      `Local ID: ${this.localPlayerId ? this.localPlayerId.slice(0, 8) : 'pending'}`,
      `Conn: ${stats.connectionState}`,
      `Player Pos: (${this.player.x.toFixed(1)}, ${this.player.y.toFixed(1)})`,
      `Player Tile: ${
        this.localTilePosition
          ? `(${Math.round(this.localTilePosition.x)}, ${Math.round(this.localTilePosition.y)})`
          : '(pending)'
      }`,
      `Nodes: ${this.worldNodes.size}`,
      `NPCs: ${this.worldNpcs.size}`,
      `Enemies: ${this.worldEnemies.size}`,
      `Remote Players: ${this.remotePlayers.size}`,
      `Snapshots: ${this.snapshotCount}`,
      `Last Snapshot: ${stateAgeMs >= 0 ? `${stateAgeMs}ms ago` : 'n/a'}`,
      `Net RX/TX: ${stats.messagesReceived}/${stats.messagesSent}`,
    ];

    this.debugHudText.setText(lines);
  }

  private shutdown(): void {
    this.multiplayerClient.disconnect();

    for (const remotePlayer of this.remotePlayers.values()) {
      remotePlayer.sprite.destroy();
      remotePlayer.healthBar.destroy();
    }

    for (const nodeVisual of this.worldNodes.values()) {
      nodeVisual.sprite.destroy();
    }

    for (const npcVisual of this.worldNpcs.values()) {
      npcVisual.sprite.destroy();
    }

    for (const enemyVisual of this.worldEnemies.values()) {
      enemyVisual.sprite.destroy();
      enemyVisual.healthBar.destroy();
    }

    this.remotePlayers.clear();
    this.worldNodes.clear();
    this.worldNpcs.clear();
    this.worldEnemies.clear();
    this.shopDefinitions = {};
    this.activeShopId = null;
    this.lastRenderedShopSignature = null;
    this.pendingNpcAction = null;
    this.hideContextMenu();
    this.localPlayerState = null;
    this.localTilePosition = null;
    this.localRenderedTilePosition = null;
    this.previousSkillLevels = null;
    this.chatRootElement?.remove();
    this.chatRootElement = null;
    this.chatLogElement = null;
    this.chatInputElement = null;
    this.chatMessages = [];
    this.characterRootElement?.remove();
    this.characterRootElement = null;
    this.characterTabBarElement = null;
    this.activeCharacterTab = 'skills';
    this.skillsRootElement?.remove();
    this.skillsRootElement = null;
    this.skillsContentElement = null;
    this.inventoryHeaderElement = null;
    this.inventoryGridElement = null;
    this.inventoryContentElement = null;
    this.lastRenderedInventorySignature = null;
    this.draggingInventoryIndex = null;
    this.inventoryIconDataUrls.clear();
    this.shopRootElement?.remove();
    this.shopRootElement = null;
    this.shopContentElement = null;
    this.localHealthBar?.destroy();
    this.localHealthBar = null;
    this.localHealthBarVisibleUntil = 0;
    this.debugHudText?.destroy();
    this.actionStatusText?.destroy();
    this.snapshotCount = 0;
    this.lastStateUpdateAt = null;
  }
}
