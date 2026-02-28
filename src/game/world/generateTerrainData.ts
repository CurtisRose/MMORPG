import { MAP_HEIGHT_TILES, MAP_WIDTH_TILES } from '../config/gameConfig';

const GRASS_TILE = 0;
const DIRT_TILE = 1;
const WATER_TILE = 2;
const SAND_TILE = 3;

export function generateTerrainData(): number[][] {
  const rows: number[][] = [];

  for (let rowIndex = 0; rowIndex < MAP_HEIGHT_TILES; rowIndex += 1) {
    const row: number[] = [];

    for (let columnIndex = 0; columnIndex < MAP_WIDTH_TILES; columnIndex += 1) {
      const edgeDistance = Math.min(
        rowIndex,
        columnIndex,
        MAP_HEIGHT_TILES - 1 - rowIndex,
        MAP_WIDTH_TILES - 1 - columnIndex,
      );

      if (edgeDistance < 3) {
        row.push(WATER_TILE);
        continue;
      }

      if (edgeDistance < 5) {
        row.push(SAND_TILE);
        continue;
      }

      const onHorizontalRoad = rowIndex > 34 && rowIndex < 38;
      const onVerticalRoad = columnIndex > 38 && columnIndex < 42;
      if (onHorizontalRoad || onVerticalRoad) {
        row.push(DIRT_TILE);
        continue;
      }

      row.push(GRASS_TILE);
    }

    rows.push(row);
  }

  return rows;
}
