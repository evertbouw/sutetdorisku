import { BLOCK_SIZE, BOARD_SIZE, CLUE_PIECES } from "./constants";
import type { Cell, PieceCell, PlacedPiece, RandomFillArrangement } from "./types";
import { createEmptyBoard, rotatePieceCells, shuffle } from "./utils";

const createBaseSudokuSolution = () =>
  Array.from({ length: BOARD_SIZE }, (_, rowIndex) =>
    Array.from(
      { length: BOARD_SIZE },
      (_, colIndex) =>
        ((rowIndex * BLOCK_SIZE + Math.floor(rowIndex / BLOCK_SIZE) + colIndex) % BOARD_SIZE) + 1,
    ),
  );

const createSudokuSolution = () => {
  const digitMap = shuffle(Array.from({ length: BOARD_SIZE }, (_, index) => index + 1));
  const rowGroups = shuffle([0, 1, 2]);
  const colGroups = shuffle([0, 1, 2]);

  const rowOrder = rowGroups.flatMap((group) =>
    shuffle([0, 1, 2]).map((offset) => group * BLOCK_SIZE + offset),
  );
  const colOrder = colGroups.flatMap((group) =>
    shuffle([0, 1, 2]).map((offset) => group * BLOCK_SIZE + offset),
  );

  const base = createBaseSudokuSolution();

  return rowOrder.map((rowIndex) =>
    colOrder.map((colIndex) => digitMap[base[rowIndex][colIndex] - 1]),
  );
};

const getPieceCellsFromBoard = (
  board: Cell[][],
  pieceInstanceId: string,
  sudokuSolution: number[][],
): PieceCell[] => {
  const occupied: Array<{ row: number; col: number }> = [];

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (board[row][col]?.pieceInstanceId === pieceInstanceId) {
        occupied.push({ row, col });
      }
    }
  }

  const minRow = Math.min(...occupied.map((cell) => cell.row));
  const minCol = Math.min(...occupied.map((cell) => cell.col));

  return occupied.map((cell) => ({
    deltaRow: cell.row - minRow,
    deltaCol: cell.col - minCol,
    number: sudokuSolution[cell.row][cell.col],
  }));
};

export const createPuzzleFromArrangement = (arrangement: RandomFillArrangement) => {
  const allPieces = Object.values(arrangement.placedPieces);
  const cluePieces = shuffle(allPieces).slice(0, CLUE_PIECES);
  const cluePieceIds = new Set(cluePieces.map((piece) => piece.pieceInstanceId));
  const fixedPieceIds = new Set(cluePieceIds);
  const sudokuSolution = createSudokuSolution();
  const board = createEmptyBoard();
  const placedPieces: Record<string, PlacedPiece> = {};
  const solutionBoard = createEmptyBoard();

  for (const piece of cluePieces) {
    const cells = getPieceCellsFromBoard(arrangement.board, piece.pieceInstanceId, sudokuSolution);
    const placedPiece = {
      ...piece,
      cells,
    };

    placedPieces[piece.pieceInstanceId] = placedPiece;

    for (const [index, { deltaRow, deltaCol }] of cells.entries()) {
      const row = piece.anchorRow + deltaRow;
      const col = piece.anchorCol + deltaCol;
      const number = cells[index].number;
      board[row][col] = { color: piece.color, pieceInstanceId: piece.pieceInstanceId, number };
    }
  }

  const trayPieces = shuffle(
    allPieces.filter((piece) => !fixedPieceIds.has(piece.pieceInstanceId)),
  ).map((piece) => {
    const cells = getPieceCellsFromBoard(arrangement.board, piece.pieceInstanceId, sudokuSolution);
    const rotation = Math.floor(Math.random() * 4);

    return {
      ...piece,
      cells: rotatePieceCells(cells, rotation),
      rotation,
    };
  });

  for (const piece of allPieces) {
    const cells = getPieceCellsFromBoard(arrangement.board, piece.pieceInstanceId, sudokuSolution);

    for (const [index, { deltaRow, deltaCol }] of cells.entries()) {
      const row = piece.anchorRow + deltaRow;
      const col = piece.anchorCol + deltaCol;
      solutionBoard[row][col] = {
        color: piece.color,
        pieceInstanceId: piece.pieceInstanceId,
        number: cells[index].number,
      };
    }
  }

  return {
    board,
    placedPieces,
    trayPieces,
    fixedPieceIds,
    solutionBoard,
  };
};

export const boardEquals = (left: Cell[][], right: Cell[][]) =>
  left.every((row, rowIndex) =>
    row.every((cell, colIndex) => {
      const other = right[rowIndex][colIndex];

      if (!cell || !other) {
        return cell === other;
      }

      return (
        cell.color === other.color &&
        cell.pieceInstanceId === other.pieceInstanceId &&
        cell.number === other.number
      );
    }),
  );
