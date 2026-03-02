export class GridPathfindingService {
  constructor({ isWalkableTile, moveFallbackSearchRadius }) {
    this.isWalkableTile = isWalkableTile;
    this.moveFallbackSearchRadius = moveFallbackSearchRadius;
  }

  makeTileKey(tileX, tileY) {
    return `${tileX},${tileY}`;
  }

  canTraverseBetween(fromTileX, fromTileY, toTileX, toTileY) {
    const deltaX = toTileX - fromTileX;
    const deltaY = toTileY - fromTileY;

    if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
      return false;
    }

    if (!this.isWalkableTile(toTileX, toTileY)) {
      return false;
    }

    if (Math.abs(deltaX) === 1 && Math.abs(deltaY) === 1) {
      const sideATileX = fromTileX + deltaX;
      const sideATileY = fromTileY;
      const sideBTileX = fromTileX;
      const sideBTileY = fromTileY + deltaY;
      return this.isWalkableTile(sideATileX, sideATileY)
        && this.isWalkableTile(sideBTileX, sideBTileY);
    }

    return true;
  }

  reconstructPath(cameFrom, startX, startY, targetX, targetY) {
    const path = [];
    let currentKey = this.makeTileKey(targetX, targetY);
    const startKey = this.makeTileKey(startX, startY);

    while (currentKey !== startKey) {
      const [tileX, tileY] = currentKey.split(',').map(Number);
      path.push({ tileX, tileY });

      const previousKey = cameFrom.get(currentKey);
      if (!previousKey) {
        return [];
      }

      currentKey = previousKey;
    }

    path.reverse();
    return path;
  }

  findPath(startX, startY, targetX, targetY) {
    if (startX === targetX && startY === targetY) {
      return [];
    }

    const targetWalkable = this.isWalkableTile(targetX, targetY);
    if (!targetWalkable) {
      return null;
    }

    const queue = [{ tileX: startX, tileY: startY }];
    let queueIndex = 0;
    const visited = new Set([this.makeTileKey(startX, startY)]);
    const cameFrom = new Map();

    while (queueIndex < queue.length) {
      const current = queue[queueIndex];
      queueIndex += 1;

      const neighbors = [
        { tileX: current.tileX + 1, tileY: current.tileY },
        { tileX: current.tileX - 1, tileY: current.tileY },
        { tileX: current.tileX, tileY: current.tileY + 1 },
        { tileX: current.tileX, tileY: current.tileY - 1 },
        { tileX: current.tileX + 1, tileY: current.tileY + 1 },
        { tileX: current.tileX + 1, tileY: current.tileY - 1 },
        { tileX: current.tileX - 1, tileY: current.tileY + 1 },
        { tileX: current.tileX - 1, tileY: current.tileY - 1 },
      ];

      for (const neighbor of neighbors) {
        if (!this.canTraverseBetween(current.tileX, current.tileY, neighbor.tileX, neighbor.tileY)) {
          continue;
        }

        const neighborKey = this.makeTileKey(neighbor.tileX, neighbor.tileY);
        if (visited.has(neighborKey)) {
          continue;
        }

        visited.add(neighborKey);
        cameFrom.set(neighborKey, this.makeTileKey(current.tileX, current.tileY));

        if (neighbor.tileX === targetX && neighbor.tileY === targetY) {
          return this.reconstructPath(cameFrom, startX, startY, targetX, targetY);
        }

        queue.push(neighbor);
      }
    }

    return null;
  }

  getPerimeterCandidates(centerX, centerY, radius) {
    const candidates = [];

    for (let dx = -radius; dx <= radius; dx += 1) {
      candidates.push({ tileX: centerX + dx, tileY: centerY - radius });
      candidates.push({ tileX: centerX + dx, tileY: centerY + radius });
    }

    for (let dy = -radius + 1; dy <= radius - 1; dy += 1) {
      candidates.push({ tileX: centerX - radius, tileY: centerY + dy });
      candidates.push({ tileX: centerX + radius, tileY: centerY + dy });
    }

    return candidates;
  }

  findNearestReachableDestination(entity, targetX, targetY) {
    for (let radius = 1; radius <= this.moveFallbackSearchRadius; radius += 1) {
      const perimeter = this.getPerimeterCandidates(targetX, targetY, radius);
      let best = null;

      for (const candidate of perimeter) {
        if (!this.isWalkableTile(candidate.tileX, candidate.tileY)) {
          continue;
        }

        const path = this.findPath(entity.tileX, entity.tileY, candidate.tileX, candidate.tileY);
        if (!path) {
          continue;
        }

        if (!best || path.length < best.path.length) {
          best = {
            tileX: candidate.tileX,
            tileY: candidate.tileY,
            path,
          };
        }
      }

      if (best) {
        return best;
      }
    }

    return null;
  }

  setPathTarget(entity, tileX, tileY) {
    const path = this.findPath(entity.tileX, entity.tileY, tileX, tileY);
    if (path) {
      entity.directionX = 0;
      entity.directionY = 0;
      entity.targetTileX = tileX;
      entity.targetTileY = tileY;
      entity.targetPath = path;
      return true;
    }

    const fallback = this.findNearestReachableDestination(entity, tileX, tileY);
    if (!fallback) {
      return false;
    }

    entity.directionX = 0;
    entity.directionY = 0;
    entity.targetTileX = fallback.tileX;
    entity.targetTileY = fallback.tileY;
    entity.targetPath = fallback.path;
    return true;
  }
}

export function createGridPathfindingService(options) {
  return new GridPathfindingService(options);
}