import { BOARD_SIZE } from "./constants";
import type { Cell } from "./types";
import { toCellKey } from "./utils";

export const findDuplicateNumberKeys = (board: Cell[][]) => {
  const duplicates = new Set<string>();

  for (let rowIndex = 0; rowIndex < BOARD_SIZE; rowIndex += 1) {
    const rowCounts = new Map<number, number>();

    for (let colIndex = 0; colIndex < BOARD_SIZE; colIndex += 1) {
      const cell = board[rowIndex][colIndex];

      if (!cell) {
        continue;
      }

      rowCounts.set(cell.number, (rowCounts.get(cell.number) ?? 0) + 1);
    }

    for (let colIndex = 0; colIndex < BOARD_SIZE; colIndex += 1) {
      const cell = board[rowIndex][colIndex];

      if (cell && (rowCounts.get(cell.number) ?? 0) > 1) {
        duplicates.add(toCellKey(rowIndex, colIndex));
      }
    }
  }

  for (let colIndex = 0; colIndex < BOARD_SIZE; colIndex += 1) {
    const colCounts = new Map<number, number>();

    for (let rowIndex = 0; rowIndex < BOARD_SIZE; rowIndex += 1) {
      const cell = board[rowIndex][colIndex];

      if (!cell) {
        continue;
      }

      colCounts.set(cell.number, (colCounts.get(cell.number) ?? 0) + 1);
    }

    for (let rowIndex = 0; rowIndex < BOARD_SIZE; rowIndex += 1) {
      const cell = board[rowIndex][colIndex];

      if (cell && (colCounts.get(cell.number) ?? 0) > 1) {
        duplicates.add(toCellKey(rowIndex, colIndex));
      }
    }
  }

  return duplicates;
};
