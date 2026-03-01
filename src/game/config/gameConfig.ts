import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { SplashScene } from '../scenes/SplashScene';
import { WorldScene } from '../scenes/WorldScene';

export const TILE_SIZE = 32;
export const MAP_WIDTH_TILES = 80;
export const MAP_HEIGHT_TILES = 80;

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: 1280,
  height: 720,
  backgroundColor: '#1c1f24',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [BootScene, SplashScene, WorldScene],
};
