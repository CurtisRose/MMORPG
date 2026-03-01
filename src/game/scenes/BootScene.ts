import Phaser from 'phaser';
import { TILE_SIZE } from '../config/gameConfig';

const TERRAIN_TEXTURE_KEY = 'terrain-tiles';
const PLAYER_TEXTURE_KEY = 'player';
const TREE_TEXTURE_KEY = 'resource-tree';
const ROCK_TEXTURE_KEY = 'resource-rock';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    this.createTerrainTexture();
    this.createPlayerTexture();
    this.createTreeTexture();
    this.createRockTexture();
    this.scene.start('splash');
  }

  private createTerrainTexture(): void {
    const tileCount = 4;
    const terrainTexture = this.textures.createCanvas(
      TERRAIN_TEXTURE_KEY,
      TILE_SIZE * tileCount,
      TILE_SIZE,
    );

    if (!terrainTexture) {
      throw new Error('Failed to create terrain texture.');
    }

    const context = terrainTexture.context;

    this.paintTile(context, 0, '#4f9d4d', '#3f7f3e');
    this.paintTile(context, 1, '#7a5637', '#62442b');
    this.paintTile(context, 2, '#2e6ea6', '#255982');
    this.paintTile(context, 3, '#cbb37a', '#a58f61');

    terrainTexture.refresh();
  }

  private createPlayerTexture(): void {
    const playerTexture = this.textures.createCanvas(
      PLAYER_TEXTURE_KEY,
      TILE_SIZE,
      TILE_SIZE,
    );

    if (!playerTexture) {
      throw new Error('Failed to create player texture.');
    }

    const context = playerTexture.context;

    context.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
    context.fillStyle = '#2d3647';
    context.fillRect(9, 6, 14, 22);

    context.fillStyle = '#f0d1a5';
    context.fillRect(10, 3, 12, 8);

    context.fillStyle = '#5a77d4';
    context.fillRect(11, 12, 10, 9);

    context.fillStyle = '#1f2836';
    context.fillRect(9, 22, 5, 6);
    context.fillRect(18, 22, 5, 6);

    playerTexture.refresh();
  }

  private createTreeTexture(): void {
    const texture = this.textures.createCanvas(TREE_TEXTURE_KEY, TILE_SIZE, TILE_SIZE);
    if (!texture) {
      throw new Error('Failed to create tree texture.');
    }

    const context = texture.context;
    context.clearRect(0, 0, TILE_SIZE, TILE_SIZE);

    context.fillStyle = '#5e3d22';
    context.fillRect(13, 16, 6, 12);

    context.fillStyle = '#2b7b3d';
    context.fillRect(6, 6, 20, 12);
    context.fillRect(9, 2, 14, 8);

    texture.refresh();
  }

  private createRockTexture(): void {
    const texture = this.textures.createCanvas(ROCK_TEXTURE_KEY, TILE_SIZE, TILE_SIZE);
    if (!texture) {
      throw new Error('Failed to create rock texture.');
    }

    const context = texture.context;
    context.clearRect(0, 0, TILE_SIZE, TILE_SIZE);

    context.fillStyle = '#777f8e';
    context.fillRect(7, 13, 18, 12);

    context.fillStyle = '#9aa3b2';
    context.fillRect(10, 10, 12, 5);

    texture.refresh();
  }

  private paintTile(
    context: CanvasRenderingContext2D,
    tileIndex: number,
    fillColor: string,
    accentColor: string,
  ): void {
    const xOffset = tileIndex * TILE_SIZE;

    context.fillStyle = fillColor;
    context.fillRect(xOffset, 0, TILE_SIZE, TILE_SIZE);

    context.fillStyle = accentColor;
    context.fillRect(xOffset + 4, 4, 8, 8);
    context.fillRect(xOffset + 18, 8, 10, 6);
    context.fillRect(xOffset + 10, 20, 12, 8);
  }
}
