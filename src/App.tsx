import { useEffect, useMemo, useRef, useState } from "react";
import {
  BOARD_SIZE,
  DEFAULT_DIFFICULTY,
  DIFFICULTY_CLUE_PIECES,
  GENERATION_MAX_RETRIES,
  GENERATION_TIMEOUT_MS,
} from "./game/constants";
import { findDuplicateNumberKeys } from "./game/duplicates";
import { boardEquals, createPuzzleFromArrangement } from "./game/puzzle";
import { TETROMINOS } from "./game/tetrominos";
import type {
  ActiveDrag,
  Cell,
  PlacedPiece,
  Point,
  PreviewState,
  RandomFillArrangement,
} from "./game/types";
import {
  clearPieceFromBoard,
  cloneBoard,
  createEmptyBoard,
  getAbsoluteCells,
  getPieceShape,
  rotatePieceCells,
  shapeBounds,
  toCellKey,
} from "./game/utils";

export const App = () => {
  type Difficulty = keyof typeof DIFFICULTY_CLUE_PIECES;

  const [board, setBoard] = useState<Cell[][]>(createEmptyBoard);
  const [placedPieces, setPlacedPieces] = useState<Record<string, PlacedPiece>>({});
  const [trayPieces, setTrayPieces] = useState<PlacedPiece[]>([]);
  const [solutionBoard, setSolutionBoard] = useState<Cell[][] | null>(null);
  const [fixedPieceIds, setFixedPieceIds] = useState<Set<string>>(new Set());
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>(DEFAULT_DIFFICULTY);
  const [hoveredPieceId, setHoveredPieceId] = useState<string | null>(null);
  const generationToken = useRef(0);

  const tetrominoById = useMemo(
    () => Object.fromEntries(TETROMINOS.map((piece) => [piece.id, piece])),
    [],
  );

  const isSolved = solutionBoard !== null && boardEquals(board, solutionBoard);
  const duplicateNumberKeys = useMemo(() => findDuplicateNumberKeys(board), [board]);
  const fireworks = useMemo(() => Array.from({ length: 72 }, (_, index) => index), []);

  const canPlace = (shape: Point[], startRow: number, startCol: number, ignorePieceId?: string) =>
    shape.every(([deltaRow, deltaCol]) => {
      const row = startRow + deltaRow;
      const col = startCol + deltaCol;
      const occupiedCell =
        row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE ? board[row][col] : null;

      return (
        row >= 0 &&
        row < BOARD_SIZE &&
        col >= 0 &&
        col < BOARD_SIZE &&
        (!occupiedCell || occupiedCell.pieceInstanceId === ignorePieceId)
      );
    });

  const setPreviewAt = (shape: Point[], startRow: number, startCol: number) => {
    const absoluteCells = getAbsoluteCells(shape, startRow, startCol);
    const valid = canPlace(
      shape,
      startRow,
      startCol,
      activeDrag?.source === "board" ? activeDrag.pieceInstanceId : undefined,
    );

    setPreview({
      valid,
      keys: new Set(absoluteCells.map(([row, col]) => toCellKey(row, col))),
    });
  };

  const startGeneration = (targetDifficulty: Difficulty = difficulty) => {
    const token = generationToken.current + 1;
    generationToken.current = token;
    const targetCluePieces = DIFFICULTY_CLUE_PIECES[targetDifficulty];

    setIsGenerating(true);
    setSolutionBoard(null);
    const runAttempt = (attempt: number) => {
      if (generationToken.current !== token) {
        return;
      }

      const worker = new Worker(new URL("./random-fill.worker.ts", import.meta.url), {
        type: "module",
      });

      let settled = false;

      const finish = () => {
        if (settled) {
          return;
        }

        settled = true;
        worker.terminate();
      };

      const applyPuzzle = (arrangement: RandomFillArrangement) => {
        if (generationToken.current !== token) {
          return;
        }

        const puzzle = createPuzzleFromArrangement(arrangement, targetCluePieces);

        finish();
        setBoard(puzzle.board);
        setPlacedPieces(puzzle.placedPieces);
        setTrayPieces(puzzle.trayPieces);
        setSolutionBoard(puzzle.solutionBoard);
        setFixedPieceIds(puzzle.fixedPieceIds);
        setActiveDrag(null);
        setPreview(null);
        setIsGenerating(false);
      };

      const retryOrFail = () => {
        if (generationToken.current !== token) {
          return;
        }

        finish();

        if (attempt < GENERATION_MAX_RETRIES) {
          runAttempt(attempt + 1);
          return;
        }

        setIsGenerating(false);
      };

      const timeoutId = window.setTimeout(() => {
        retryOrFail();
      }, GENERATION_TIMEOUT_MS);

      worker.onmessage = (
        event: MessageEvent<
          { type: "success"; arrangement: RandomFillArrangement } | { type: "failure" }
        >,
      ) => {
        if (settled) {
          return;
        }

        window.clearTimeout(timeoutId);

        if (event.data.type === "success") {
          applyPuzzle(event.data.arrangement);
          return;
        }

        retryOrFail();
      };

      worker.onerror = () => {
        if (settled) {
          return;
        }

        window.clearTimeout(timeoutId);
        retryOrFail();
      };

      worker.postMessage({ type: "generate" });
    };

    runAttempt(1);
  };

  useEffect(() => {
    startGeneration();

    return () => {
      generationToken.current += 1;
    };
  }, []);

  const rotateTrayPiece = (pieceInstanceId: string) => {
    setTrayPieces((prev) =>
      prev.map((piece) =>
        piece.pieceInstanceId === pieceInstanceId
          ? {
              ...piece,
              rotation: (piece.rotation + 1) % 4,
              cells: rotatePieceCells(piece.cells),
            }
          : piece,
      ),
    );
  };

  const dropActivePiece = (targetRow: number, targetCol: number) => {
    if (!activeDrag) {
      return;
    }

    const shape = activeDrag.shape;
    const ignorePieceId = activeDrag.source === "board" ? activeDrag.pieceInstanceId : undefined;

    if (!canPlace(shape, targetRow, targetCol, ignorePieceId)) {
      return;
    }

    if (activeDrag.source === "tray") {
      const piece = activeDrag.piece;
      const placedPiece = {
        ...piece,
        anchorRow: targetRow,
        anchorCol: targetCol,
      };

      setTrayPieces((prev) =>
        prev.filter((item) => item.pieceInstanceId !== piece.pieceInstanceId),
      );
      setPlacedPieces((prev) => ({
        ...prev,
        [piece.pieceInstanceId]: placedPiece,
      }));

      setBoard((prev) => {
        const next = cloneBoard(prev);

        for (const [index, { deltaRow, deltaCol }] of piece.cells.entries()) {
          const row = targetRow + deltaRow;
          const col = targetCol + deltaCol;
          next[row][col] = {
            color: piece.color,
            pieceInstanceId: piece.pieceInstanceId,
            number: piece.cells[index].number,
          };
        }

        return next;
      });

      return;
    }

    const piece = placedPieces[activeDrag.pieceInstanceId];

    if (!piece) {
      return;
    }

    setBoard((prev) => {
      const cleared = clearPieceFromBoard(prev, piece);
      const next = cloneBoard(cleared);

      for (const [index, { deltaRow, deltaCol }] of piece.cells.entries()) {
        const row = targetRow + deltaRow;
        const col = targetCol + deltaCol;
        next[row][col] = {
          color: piece.color,
          pieceInstanceId: piece.pieceInstanceId,
          number: piece.cells[index].number,
        };
      }

      return next;
    });

    setPlacedPieces((prev) => ({
      ...prev,
      [piece.pieceInstanceId]: {
        ...piece,
        anchorRow: targetRow,
        anchorCol: targetCol,
      },
    }));
  };

  const handleDrop = (
    event: React.DragEvent<HTMLDivElement>,
    targetRow: number,
    targetCol: number,
  ) => {
    event.preventDefault();

    dropActivePiece(targetRow, targetCol);
    setPreview(null);
    setActiveDrag(null);
  };

  const dropPieceIntoTray = () => {
    if (!activeDrag || activeDrag.source !== "board") {
      return;
    }

    const piece = placedPieces[activeDrag.pieceInstanceId];

    if (!piece || fixedPieceIds.has(piece.pieceInstanceId)) {
      return;
    }

    setBoard((prev) => clearPieceFromBoard(prev, piece));
    setPlacedPieces((prev) => {
      const next = { ...prev };
      delete next[piece.pieceInstanceId];
      return next;
    });
    setTrayPieces((prev) => [...prev, piece]);
    setActiveDrag(null);
    setPreview(null);
  };

  const onTrayDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const startTrayDrag = (event: React.DragEvent<HTMLButtonElement>, piece: PlacedPiece) => {
    const shape = getPieceShape(piece);
    event.dataTransfer.setData("text/plain", piece.pieceInstanceId);

    setActiveDrag({
      source: "tray",
      piece,
      shape,
    });
  };

  const endTrayDrag = () => {
    setActiveDrag((prev) => (prev?.source === "tray" ? null : prev));
    setPreview(null);
  };

  const startBoardPieceDrag = (
    event: React.DragEvent<HTMLDivElement>,
    pieceInstanceId: string,
    piece: PlacedPiece,
  ) => {
    if (fixedPieceIds.has(pieceInstanceId)) {
      return;
    }

    event.dataTransfer.setData("text/plain", pieceInstanceId);

    const shape = getPieceShape(piece);
    setActiveDrag({ source: "board", pieceInstanceId, shape });
    setPreview(null);
  };

  const endBoardPieceDrag = (pieceInstanceId: string) => {
    setActiveDrag((prev) =>
      prev?.source === "board" && prev.pieceInstanceId === pieceInstanceId ? null : prev,
    );
    setPreview(null);
  };

  const onBoardCellDragOver = (
    event: React.DragEvent<HTMLDivElement>,
    rowIndex: number,
    colIndex: number,
  ) => {
    event.preventDefault();

    if (!activeDrag) {
      return;
    }

    setPreviewAt(activeDrag.shape, rowIndex, colIndex);
  };

  const getCellBackgroundClass = (rowIndex: number, colIndex: number, cell: Cell) => {
    const key = toCellKey(rowIndex, colIndex);

    if (preview?.keys.has(key)) {
      return preview.valid ? "board-cell-bg-preview-valid" : "board-cell-bg-preview-invalid";
    }

    return cell ? "board-cell-bg-filled" : "board-cell-bg-empty";
  };

  const getCellAdjacencyClasses = (rowIndex: number, colIndex: number) => {
    const currentPieceId = board[rowIndex][colIndex]?.pieceInstanceId;

    if (!currentPieceId) {
      return "board-cell-empty";
    }

    const hasSamePieceAbove =
      rowIndex > 0 && board[rowIndex - 1][colIndex]?.pieceInstanceId === currentPieceId;
    const hasSamePieceRight =
      colIndex < BOARD_SIZE - 1 &&
      board[rowIndex][colIndex + 1]?.pieceInstanceId === currentPieceId;
    const hasSamePieceBelow =
      rowIndex < BOARD_SIZE - 1 &&
      board[rowIndex + 1][colIndex]?.pieceInstanceId === currentPieceId;
    const hasSamePieceLeft =
      colIndex > 0 && board[rowIndex][colIndex - 1]?.pieceInstanceId === currentPieceId;

    const adjacencyClasses = ["board-cell-filled"];

    if (hasSamePieceAbove) {
      adjacencyClasses.push("has-same-piece-above");
    }

    if (hasSamePieceRight) {
      adjacencyClasses.push("has-same-piece-right");
    }

    if (hasSamePieceBelow) {
      adjacencyClasses.push("has-same-piece-below");
    }

    if (hasSamePieceLeft) {
      adjacencyClasses.push("has-same-piece-left");
    }

    return adjacencyClasses.join(" ");
  };

  const handleDifficultyChange = (nextDifficulty: Difficulty) => {
    if (nextDifficulty === difficulty) {
      return;
    }

    setDifficulty(nextDifficulty);
    startGeneration(nextDifficulty);
  };

  return (
    <div className="app">
      <div className="app-shell">
        <header className="app-header">
          <h1 className="app-title">sutetdorisku</h1>
          <p className="app-intro">
            Solve the sudoku puzzle by placing tetrominoes on the grid. In sudoku each number may
            only appear once in each row, column, and 3x3 square. Duplicate numbers will appear in
            red. Click tetrominoes in the box to rotate them. One tile will remain empty.
          </p>
        </header>

        <div className="app-controls">
          <label className="app-control-label">
            Difficulty
            <select
              value={difficulty}
              onChange={(event) => handleDifficultyChange(event.target.value as Difficulty)}
              className="app-select"
              disabled={isGenerating}
            >
              <option value="easy">Easy (14 clues)</option>
              <option value="medium">Medium (10 clues)</option>
              <option value="hard">Hard (6 clues)</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => startGeneration()}
            className="app-button app-button-new"
          >
            {isGenerating ? "Generating..." : "New puzzle"}
          </button>
        </div>

        <div className="game-layout">
          <div>
            <div className="board-scroll-wrap">
              <div className="board-grid">
                {board.map((row, rowIndex) =>
                  row.map((cell, colIndex) => {
                    const piece = cell ? placedPieces[cell.pieceInstanceId] : null;
                    const isFixed = piece ? fixedPieceIds.has(piece.pieceInstanceId) : false;
                    const isHoveredPiece =
                      !!cell && hoveredPieceId === cell.pieceInstanceId && !isFixed;
                    const isDuplicate = duplicateNumberKeys.has(toCellKey(rowIndex, colIndex));
                    const cellBackgroundClass = getCellBackgroundClass(rowIndex, colIndex, cell);
                    const cellAdjacencyClass = getCellAdjacencyClasses(rowIndex, colIndex);
                    const pieceColorClass = cell ? cell.color : "";

                    return (
                      <div
                        key={`${rowIndex}-${colIndex}`}
                        onDragOver={(event) => onBoardCellDragOver(event, rowIndex, colIndex)}
                        onDrop={(event) => handleDrop(event, rowIndex, colIndex)}
                        onMouseEnter={() => cell && setHoveredPieceId(cell.pieceInstanceId)}
                        onMouseLeave={() => setHoveredPieceId(null)}
                        className={`board-cell ${cellBackgroundClass} ${cellAdjacencyClass} ${pieceColorClass}${isHoveredPiece ? " board-cell-hovered" : ""}${isFixed ? " board-cell-fixed" : ""}`}
                      >
                        {cell ? (
                          <div
                            draggable={!isFixed}
                            onDragStart={(event) =>
                              piece
                                ? startBoardPieceDrag(event, cell.pieceInstanceId, piece)
                                : undefined
                            }
                            onDragEnd={() => endBoardPieceDrag(cell.pieceInstanceId)}
                            className={`board-piece ${pieceColorClass}${isDuplicate ? " board-piece-duplicate" : ""}${isFixed ? " board-piece-fixed" : " board-piece-movable"}`}
                          >
                            <span>{cell.number}</span>
                          </div>
                        ) : null}
                      </div>
                    );
                  }),
                )}
                <div className="board-overlay" />
                <div className="board-divider board-divider-v board-divider-v-1" />
                <div className="board-divider board-divider-v board-divider-v-2" />
                <div className="board-divider board-divider-h board-divider-h-1" />
                <div className="board-divider board-divider-h board-divider-h-2" />
              </div>
            </div>
          </div>

          <aside className="tray-panel" onDragOver={onTrayDragOver} onDrop={dropPieceIntoTray}>
            <div className="tray-list">
              {trayPieces.map((piece) => {
                const tetromino = tetrominoById[piece.tetrominoId];
                const shape = getPieceShape(piece);
                const { rows, cols } = shapeBounds(shape);
                const shapeCellKeys = new Set(shape.map(([row, col]) => `${row}-${col}`));
                const traySizeClass = `tray-piece-size-r${rows}-c${cols}`;
                const trayGridClass = `tray-piece-grid-r${rows}-c${cols}`;
                const trayColorClass = `board-piece-bg-${tetromino.id.toLowerCase()}`;

                return (
                  <button
                    key={piece.pieceInstanceId}
                    type="button"
                    onClick={() => rotateTrayPiece(piece.pieceInstanceId)}
                    draggable
                    onDragStart={(event) => startTrayDrag(event, piece)}
                    onDragEnd={endTrayDrag}
                    className={`tray-piece-button ${traySizeClass}`}
                    aria-label={`Move tetromino ${tetromino.id}`}
                  >
                    <div className={`tray-piece-grid ${trayGridClass}`}>
                      {shape.map(([row, col]) => {
                        const hasAbove = shapeCellKeys.has(`${row - 1}-${col}`);
                        const hasRight = shapeCellKeys.has(`${row}-${col + 1}`);
                        const hasBelow = shapeCellKeys.has(`${row + 1}-${col}`);
                        const hasLeft = shapeCellKeys.has(`${row}-${col - 1}`);
                        const adjacencyClass = [
                          "tray-piece-cell-filled",
                          hasAbove ? "tray-has-above" : "",
                          hasRight ? "tray-has-right" : "",
                          hasBelow ? "tray-has-below" : "",
                          hasLeft ? "tray-has-left" : "",
                        ]
                          .filter(Boolean)
                          .join(" ");

                        return (
                          <span
                            key={`${row}-${col}`}
                            className={`tray-piece-cell tray-cell-r${row + 1} tray-cell-c${col + 1} ${trayColorClass} ${adjacencyClass}`}
                          >
                            {
                              piece.cells.find(
                                (cellCell) =>
                                  cellCell.deltaRow === row && cellCell.deltaCol === col,
                              )?.number
                            }
                          </span>
                        );
                      })}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      </div>

      {isSolved ? (
        <div className="solved-overlay">
          <div className="solved-fireworks" aria-hidden="true">
            {fireworks.map((sparkIndex) => (
              <span
                key={sparkIndex}
                className={`solved-spark solved-spark-left-${sparkIndex % 12} solved-spark-top-${sparkIndex % 10} solved-spark-size-${sparkIndex % 4} solved-spark-color-${sparkIndex % 6} solved-spark-delay-${sparkIndex % 12} solved-spark-duration-${sparkIndex % 5} solved-spark-drift-${sparkIndex % 8}`}
              />
            ))}
          </div>

          <div className="solved-dialog">
            <h2 className="solved-title">Solved!</h2>
            <p>Thanks for playing!</p>
            <button type="button" onClick={() => startGeneration()} className="app-button">
              Play again
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
