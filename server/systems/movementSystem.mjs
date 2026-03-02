export class GridMovementService {
  constructor({
    clamp,
    isWalkableTile,
    getWorldWidthTiles,
    getWorldHeightTiles,
    tileStepIntervalMs,
    diagonalStepMultiplier,
    findPath,
    canTraverseBetween,
  }) {
    this.clamp = clamp;
    this.isWalkableTile = isWalkableTile;
    this.getWorldWidthTiles = getWorldWidthTiles;
    this.getWorldHeightTiles = getWorldHeightTiles;
    this.tileStepIntervalMs = tileStepIntervalMs;
    this.diagonalStepMultiplier = diagonalStepMultiplier;
    this.findPath = findPath;
    this.canTraverseBetween = canTraverseBetween;
  }

  attemptStep(player, stepX, stepY) {
    const nextTileX = this.clamp(player.tileX + stepX, 1, this.getWorldWidthTiles() - 2);
    const nextTileY = this.clamp(player.tileY + stepY, 1, this.getWorldHeightTiles() - 2);

    if (!this.isWalkableTile(nextTileX, nextTileY)) {
      return false;
    }

    player.previousTraversedTileX = player.tileX;
    player.previousTraversedTileY = player.tileY;
    player.tileX = nextTileX;
    player.tileY = nextTileY;
    return true;
  }

  hasReachedTarget(entity) {
    return entity.targetTileX === entity.tileX && entity.targetTileY === entity.tileY;
  }

  stepTowardTarget(entity) {
    if (entity.targetTileX === null || entity.targetTileY === null) {
      return false;
    }

    if (this.hasReachedTarget(entity)) {
      entity.targetTileX = null;
      entity.targetTileY = null;
      return false;
    }

    if (!Array.isArray(entity.targetPath) || entity.targetPath.length === 0) {
      const rebuilt = this.findPath(entity.tileX, entity.tileY, entity.targetTileX, entity.targetTileY);
      if (!rebuilt) {
        entity.targetTileX = null;
        entity.targetTileY = null;
        entity.targetPath = [];
        return false;
      }

      entity.targetPath = rebuilt;
    }

    const nextStep = entity.targetPath[0];
    if (!nextStep) {
      return false;
    }

    if (!this.canTraverseBetween(entity.tileX, entity.tileY, nextStep.tileX, nextStep.tileY)) {
      const rebuilt = this.findPath(entity.tileX, entity.tileY, entity.targetTileX, entity.targetTileY);
      if (!rebuilt) {
        entity.targetTileX = null;
        entity.targetTileY = null;
        entity.targetPath = [];
        return false;
      }

      entity.targetPath = rebuilt;
      return this.stepTowardTarget(entity);
    }

    const deltaX = nextStep.tileX - entity.tileX;
    const deltaY = nextStep.tileY - entity.tileY;
    const isDiagonalStep = Math.abs(deltaX) === 1 && Math.abs(deltaY) === 1;

    if (
      Object.prototype.hasOwnProperty.call(entity, 'previousTraversedTileX') &&
      Object.prototype.hasOwnProperty.call(entity, 'previousTraversedTileY')
    ) {
      entity.previousTraversedTileX = entity.tileX;
      entity.previousTraversedTileY = entity.tileY;
    }

    entity.tileX = nextStep.tileX;
    entity.tileY = nextStep.tileY;
    entity.targetPath.shift();
    const moved = true;
    const moveDelayMs = isDiagonalStep
      ? Math.round(this.tileStepIntervalMs * this.diagonalStepMultiplier)
      : this.tileStepIntervalMs;

    if (this.hasReachedTarget(entity)) {
      entity.targetTileX = null;
      entity.targetTileY = null;
      entity.targetPath = [];
    }

    return moved ? moveDelayMs : 0;
  }

  stepWithDirection(player) {
    if (player.directionX === 0 && player.directionY === 0) {
      return 0;
    }

    const moved = this.attemptStep(player, player.directionX, player.directionY);
    if (!moved) {
      return 0;
    }

    const isDiagonalStep =
      Math.abs(player.directionX) === 1 && Math.abs(player.directionY) === 1;
    return isDiagonalStep
      ? Math.round(this.tileStepIntervalMs * this.diagonalStepMultiplier)
      : this.tileStepIntervalMs;
  }

  stepPlayerIfPossible(player, nowMs) {
    if (nowMs < player.nextMoveAllowedAt) {
      return;
    }

    const moveDelayMs =
      (player.targetTileX !== null || player.targetTileY !== null)
        ? this.stepTowardTarget(player)
        : this.stepWithDirection(player);

    if (moveDelayMs > 0) {
      player.nextMoveAllowedAt = nowMs + moveDelayMs;
    }
  }
}

export function createGridMovementService(options) {
  return new GridMovementService(options);
}