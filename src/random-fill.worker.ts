import { TETROMINOS } from "./game/tetrominos";

type Point = [number, number];

type Cell = { color: string; pieceInstanceId: string } | null;

type PlacedPiece = {
  pieceInstanceId: string;
  tetrominoId: string;
  color: string;
  rotation: number;
  anchorRow: number;
  anchorCol: number;
};

type ShapeVariant = {
  shape: Point[];
  rotation: number;
};

type CandidatePlacement = {
  tetrominoId: string;
  rotation: number;
  cells: Point[];
};

const BOARD_SIZE = 9;

const createEmptyBoard = () =>
  Array.from({ length: BOARD_SIZE }, () => Array.from({ length: BOARD_SIZE }, () => null as Cell));

const rotatePointClockwise = ([row, col]: Point): Point => [col, -row];

const normalizeShape = (shape: Point[]): Point[] => {
  const minRow = Math.min(...shape.map(([row]) => row));
  const minCol = Math.min(...shape.map(([, col]) => col));

  return shape.map(([row, col]) => [row - minRow, col - minCol]);
};

const rotateShape = (shape: Point[], turns: number): Point[] => {
  let next = shape;

  for (let i = 0; i < turns; i += 1) {
    next = normalizeShape(next.map(rotatePointClockwise));
  }

  return next;
};

const shuffle = <T>(items: T[]) => {
  const next = [...items];

  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }

  return next;
};

const shapeKey = (shape: Point[]) =>
  shape
    .map(([row, col]) => `${row}:${col}`)
    .sort()
    .join("|");

const getShapeVariants = (shape: Point[]): ShapeVariant[] => {
  const variants: ShapeVariant[] = [];
  const seen = new Set<string>();

  for (let rotation = 0; rotation < 4; rotation += 1) {
    const rotated = rotateShape(shape, rotation);
    const key = shapeKey(rotated);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    variants.push({ shape: rotated, rotation });
  }

  return variants;
};

const createRandomUsageCounts = () => {
  const counts: Record<string, number> = {};

  for (const piece of TETROMINOS) {
    counts[piece.id] = 2;
  }

  for (const piece of shuffle(TETROMINOS).slice(0, 6)) {
    counts[piece.id] = 3;
  }

  return counts;
};

const createRandomArrangement = () => {
  const usageLeft = createRandomUsageCounts();
  const holeRow = Math.floor(Math.random() * BOARD_SIZE);
  const holeCol = Math.floor(Math.random() * BOARD_SIZE);
  const occupied = Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => false),
  );
  occupied[holeRow][holeCol] = true;

  const variantsByTetromino = Object.fromEntries(
    TETROMINOS.map((piece) => [piece.id, getShapeVariants(piece.shape)]),
  ) as Record<string, ShapeVariant[]>;

  const placements: CandidatePlacement[] = [];

  const isSolved = () => Object.values(usageLeft).every((count) => count === 0);

  const getCellCandidates = (row: number, col: number) => {
    const candidates: CandidatePlacement[] = [];

    for (const piece of shuffle(TETROMINOS)) {
      if (usageLeft[piece.id] <= 0) {
        continue;
      }

      for (const variant of shuffle(variantsByTetromino[piece.id])) {
        for (const [offsetRow, offsetCol] of variant.shape) {
          const anchorRow = row - offsetRow;
          const anchorCol = col - offsetCol;
          const cells = variant.shape.map(
            ([deltaRow, deltaCol]) => [anchorRow + deltaRow, anchorCol + deltaCol] as Point,
          );

          if (
            cells.every(
              ([cellRow, cellCol]) =>
                cellRow >= 0 &&
                cellRow < BOARD_SIZE &&
                cellCol >= 0 &&
                cellCol < BOARD_SIZE &&
                !occupied[cellRow][cellCol],
            )
          ) {
            candidates.push({
              tetrominoId: piece.id,
              rotation: variant.rotation,
              cells,
            });
          }
        }
      }
    }

    return candidates;
  };

  const chooseNextCell = () => {
    let bestCell: Point | null = null;
    let bestCandidates: CandidatePlacement[] | null = null;

    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        if (occupied[row][col]) {
          continue;
        }

        const candidates = getCellCandidates(row, col);

        if (candidates.length === 0) {
          return { cell: [row, col] as Point, candidates };
        }

        if (!bestCandidates || candidates.length < bestCandidates.length) {
          bestCell = [row, col];
          bestCandidates = candidates;
        }
      }
    }

    return bestCell && bestCandidates ? { cell: bestCell, candidates: bestCandidates } : null;
  };

  const solve = (): boolean => {
    if (isSolved()) {
      return true;
    }

    const next = chooseNextCell();

    if (!next || next.candidates.length === 0) {
      return false;
    }

    for (const candidate of shuffle(next.candidates)) {
      usageLeft[candidate.tetrominoId] -= 1;

      for (const [row, col] of candidate.cells) {
        occupied[row][col] = true;
      }

      placements.push(candidate);

      if (solve()) {
        return true;
      }

      placements.pop();

      for (const [row, col] of candidate.cells) {
        occupied[row][col] = false;
      }

      usageLeft[candidate.tetrominoId] += 1;
    }

    return false;
  };

  if (!solve()) {
    return null;
  }

  const board = createEmptyBoard();
  const placedPieces: Record<string, PlacedPiece> = {};
  let nextInstance = 1;

  for (const candidate of placements) {
    const tetromino = TETROMINOS.find((item) => item.id === candidate.tetrominoId);

    if (!tetromino) {
      continue;
    }

    const minRow = Math.min(...candidate.cells.map(([row]) => row));
    const minCol = Math.min(...candidate.cells.map(([, col]) => col));
    const colorClass = `board-piece-bg-${tetromino.id.toLowerCase()}`;
    const pieceInstanceId = `piece-${nextInstance}`;
    nextInstance += 1;

    placedPieces[pieceInstanceId] = {
      pieceInstanceId,
      tetrominoId: tetromino.id,
      color: colorClass,
      rotation: candidate.rotation,
      anchorRow: minRow,
      anchorCol: minCol,
    };

    for (const [row, col] of candidate.cells) {
      board[row][col] = { color: colorClass, pieceInstanceId };
    }
  }

  return {
    board,
    placedPieces,
    nextInstance,
  };
};

self.onmessage = (event: MessageEvent<{ type: "generate" }>) => {
  if (event.data.type !== "generate") {
    return;
  }

  const arrangement = createRandomArrangement();

  self.postMessage(arrangement ? { type: "success", arrangement } : { type: "failure" });

  return;
};
