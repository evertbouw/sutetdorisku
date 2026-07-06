export type Point = [number, number];

export type PieceCell = {
  deltaRow: number;
  deltaCol: number;
  number: number;
};

export type Cell = { color: string; pieceInstanceId: string; number: number } | null;

export type PlacedPiece = {
  pieceInstanceId: string;
  tetrominoId: string;
  color: string;
  rotation: number;
  anchorRow: number;
  anchorCol: number;
  cells: PieceCell[];
};

export type ActiveDrag =
  | {
      source: "tray";
      piece: PlacedPiece;
      shape: Point[];
    }
  | {
      source: "board";
      pieceInstanceId: string;
      shape: Point[];
    };

export type PreviewState = {
  valid: boolean;
  keys: Set<string>;
};

export type RandomFillArrangement = {
  board: Cell[][];
  placedPieces: Record<string, PlacedPiece>;
  nextInstance: number;
};

export type Tetromino = {
  id: string;
  shape: Point[];
};
