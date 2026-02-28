import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig';

let gameInstance: Phaser.Game | null = null;

export function createGame(): Phaser.Game {
  if (gameInstance) {
    return gameInstance;
  }

  gameInstance = new Phaser.Game(gameConfig);
  return gameInstance;
}
