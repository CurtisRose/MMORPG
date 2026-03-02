export class PlayerCombatPositioningPolicy {
  constructor({
    worldWidthTiles,
    worldHeightTiles,
    isWalkableTile,
    findBestAdjacentTileToTarget,
    setPathTarget,
    isWithinRange,
    playerAttackRangeTiles,
  }) {
    this.worldWidthTiles = worldWidthTiles;
    this.worldHeightTiles = worldHeightTiles;
    this.isWalkableTile = isWalkableTile;
    this.findBestAdjacentTileToTarget = findBestAdjacentTileToTarget;
    this.setPathTarget = setPathTarget;
    this.isWithinRange = isWithinRange;
    this.playerAttackRangeTiles = playerAttackRangeTiles;
  }

  resolvePositioning(player, enemy) {
    if (player.tileX === enemy.tileX && player.tileY === enemy.tileY) {
      const fallbackTileX = Number(player.previousTraversedTileX);
      const fallbackTileY = Number(player.previousTraversedTileY);
      const hasValidFallback =
        Number.isFinite(fallbackTileX) &&
        Number.isFinite(fallbackTileY) &&
        fallbackTileX >= 1 &&
        fallbackTileX <= this.worldWidthTiles - 2 &&
        fallbackTileY >= 1 &&
        fallbackTileY <= this.worldHeightTiles - 2 &&
        this.isWalkableTile(fallbackTileX, fallbackTileY) &&
        (fallbackTileX !== enemy.tileX || fallbackTileY !== enemy.tileY);

      if (hasValidFallback) {
        player.tileX = fallbackTileX;
        player.tileY = fallbackTileY;
        player.targetTileX = null;
        player.targetTileY = null;
        player.targetPath = [];
        return false;
      }

      this.tryPathToAdjacentTile(player, enemy);
      return false;
    }

    const inRange = this.isWithinRange(
      player.tileX,
      player.tileY,
      enemy.tileX,
      enemy.tileY,
      this.playerAttackRangeTiles,
    );
    if (!inRange) {
      this.tryPathToAdjacentTile(player, enemy);
      return false;
    }

    return true;
  }

  tryPathToAdjacentTile(player, enemy) {
    if (player.targetTileX !== null && player.targetTileY !== null) {
      return;
    }

    const adjacentTile = this.findBestAdjacentTileToTarget(player, enemy.tileX, enemy.tileY);
    if (adjacentTile) {
      this.setPathTarget(player, adjacentTile.tileX, adjacentTile.tileY);
    }
  }
}

export function createPlayerCombatPositioningPolicy(options) {
  return new PlayerCombatPositioningPolicy(options);
}