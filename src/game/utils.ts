import { BOARD_SIZE } from "./constants";
import type { Cell, PieceCell, PlacedPiece, Point } from "./types";

export const createEmptyBoard = () =>
  Array.from({ length: BOARD_SIZE }, () => Array.from({ length: BOARD_SIZE }, () => null as Cell));

export const cloneBoard = (board: Cell[][]) => board.map((row) => [...row]);

export const rotatePieceCells = (cells: PieceCell[], turns = 1): PieceCell[] => {
  let next = cells;

  for (let i = 0; i < turns; i += 1) {
    const rotated = next.map(({ deltaRow, deltaCol, number }) => ({
      deltaRow: deltaCol,
      deltaCol: -deltaRow,
      number,
    }));
    const minRow = Math.min(...rotated.map((cell) => cell.deltaRow));
    const minCol = Math.min(...rotated.map((cell) => cell.deltaCol));

    next = rotated.map((cell) => ({
      ...cell,
      deltaRow: cell.deltaRow - minRow,
      deltaCol: cell.deltaCol - minCol,
    }));
  }

  return next;
};

export const shapeBounds = (shape: Point[]) => {
  const maxRow = Math.max(...shape.map(([row]) => row));
  const maxCol = Math.max(...shape.map(([, col]) => col));

  return { rows: maxRow + 1, cols: maxCol + 1 };
};

export const shuffle = <T>(items: T[]) => {
  const next = [...items];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }

  return next;
};

export const toCellKey = (row: number, col: number) => `${row}-${col}`;

export const getAbsoluteCells = (shape: Point[], anchorRow: number, anchorCol: number) =>
  shape.map(([deltaRow, deltaCol]) => [anchorRow + deltaRow, anchorCol + deltaCol] as Point);

export const clearPieceFromBoard = (board: Cell[][], piece: PlacedPiece) => {
  const next = cloneBoard(board);
  const shape = piece.cells.map(({ deltaRow, deltaCol }) => [deltaRow, deltaCol] as Point);

  for (const [row, col] of getAbsoluteCells(shape, piece.anchorRow, piece.anchorCol)) {
    if (row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE) {
      next[row][col] = null;
    }
  }

  return next;
};

export const getPieceShape = (piece: PlacedPiece) =>
  piece.cells.map(({ deltaRow, deltaCol }) => [deltaRow, deltaCol] as Point);

export const getTrayPiecePose = (pieceInstanceId: string) => {
  void pieceInstanceId;

  return {
    transform: "none",
  };
};
