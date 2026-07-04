import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  BOARD_SIZE,
  CELL_SIZE,
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
  getTrayPiecePose,
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
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const [, setMessage] = useState("Generate a fresh board and recover the missing tetrominoes.");
  const generationToken = useRef(0);

  const tetrominoById = useMemo(
    () => Object.fromEntries(TETROMINOS.map((piece) => [piece.id, piece])),
    [],
  );

  const isSolved = solutionBoard !== null && boardEquals(board, solutionBoard);
  const isPortraitMobile = viewport.height >= viewport.width && viewport.width <= 900;
  const isCompactPhone = viewport.width <= 430;
  const boardCellSize = isCompactPhone ? 32 : isPortraitMobile ? 34 : CELL_SIZE;
  const pagePadding = isPortraitMobile ? "10px" : "24px";
  const boardFramePadding = isPortraitMobile ? "10px" : "12px";
  const duplicateNumberKeys = useMemo(() => findDuplicateNumberKeys(board), [board]);
  const fireworks = useMemo(() => {
    const palette = ["#ffd166", "#ff6b6b", "#7bdff2", "#cdb4db", "#9bf6b0", "#f9c74f"];

    return Array.from({ length: 72 }, (_, index) => {
      const angle = ((index * 37) % 360) * (Math.PI / 180);
      const radius = 70 + (index % 6) * 24;

      return {
        id: index,
        left: `${10 + ((index * 17) % 78)}%`,
        top: `${12 + ((index * 11) % 70)}%`,
        dx: Math.cos(angle) * radius,
        dy: Math.sin(angle) * radius,
        size: 6 + (index % 4) * 2,
        color: palette[index % palette.length],
        delay: (index % 12) * 0.08,
        duration: 1.6 + (index % 5) * 0.22,
      };
    });
  }, []);

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

      setMessage(`Generating puzzle... attempt ${attempt}/${GENERATION_MAX_RETRIES}.`);

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
        setMessage(
          `${targetCluePieces} clue pieces are fixed on the board. Rebuild the rest from the tray.`,
        );
      };

      const retryOrFail = (reason: string) => {
        if (generationToken.current !== token) {
          return;
        }

        finish();

        if (attempt < GENERATION_MAX_RETRIES) {
          runAttempt(attempt + 1);
          return;
        }

        setIsGenerating(false);
        setMessage(`Could not generate a puzzle (${reason}). Try again.`);
      };

      const timeoutId = window.setTimeout(() => {
        retryOrFail("timed out");
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

        retryOrFail("no solution");
      };

      worker.onerror = () => {
        if (settled) {
          return;
        }

        window.clearTimeout(timeoutId);
        retryOrFail("worker error");
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

  useEffect(() => {
    if (isSolved) {
      setMessage("Solved. The board now matches the hidden arrangement.");
    }
  }, [isSolved]);

  useEffect(() => {
    const updateViewport = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener("resize", updateViewport);
    window.addEventListener("orientationchange", updateViewport);

    return () => {
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
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
      setMessage("That tetromino does not fit there.");
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

      setMessage(`${piece.tetrominoId} placed.`);
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

    setMessage(`${piece.tetrominoId} moved.`);
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
    setMessage(`${piece.tetrominoId} returned to the box.`);
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

    setMessage(`Dragging ${piece.tetrominoId}.`);
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
    setMessage(`Moving ${piece.tetrominoId}.`);
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

  const getCellBackground = (rowIndex: number, colIndex: number, cell: Cell) => {
    const key = toCellKey(rowIndex, colIndex);

    if (preview?.keys.has(key)) {
      return preview.valid ? "rgba(127, 255, 176, 0.55)" : "rgba(255, 99, 132, 0.55)";
    }

    return cell?.color ?? "rgba(255, 255, 255, 0.04)";
  };

  const getCellSpacing = (rowIndex: number, colIndex: number) => {
    const currentPieceId = board[rowIndex][colIndex]?.pieceInstanceId;

    if (!currentPieceId) {
      return {
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
      };
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

    const edgeGap = 3;

    return {
      paddingTop: hasSamePieceAbove ? 0 : edgeGap,
      paddingRight: hasSamePieceRight ? 0 : edgeGap,
      paddingBottom: hasSamePieceBelow ? 0 : edgeGap,
      paddingLeft: hasSamePieceLeft ? 0 : edgeGap,
    };
  };

  const getCellRadius = (rowIndex: number, colIndex: number) => {
    const currentPieceId = board[rowIndex][colIndex]?.pieceInstanceId;

    if (!currentPieceId) {
      return "6px";
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

    const radius = "10px";

    return [
      hasSamePieceAbove || hasSamePieceLeft ? "0" : radius,
      hasSamePieceAbove || hasSamePieceRight ? "0" : radius,
      hasSamePieceBelow || hasSamePieceRight ? "0" : radius,
      hasSamePieceBelow || hasSamePieceLeft ? "0" : radius,
    ].join(" ");
  };

  const handleDifficultyChange = (nextDifficulty: Difficulty) => {
    if (nextDifficulty === difficulty) {
      return;
    }

    setDifficulty(nextDifficulty);
    startGeneration(nextDifficulty);
  };

  return (
    <div
      style={{
        padding: pagePadding,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        color: "#f8f9fa",
      }}
    >
      <style>{`
        @keyframes firework-burst {
          0% {
            opacity: 0;
            transform: translate(0, 0) scale(0.2);
          }
          18% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translate(var(--dx), var(--dy)) scale(1);
          }
        }

        @keyframes solved-pop {
          0% {
            opacity: 0;
            transform: translateY(14px) scale(0.92);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
      <div style={{ margin: "0 auto", width: "100%" }}>
        <header style={{ marginBottom: "20px" }}>
          <h1
            style={{
              marginTop: 0,
              marginBottom: "8px",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#fcd34d",
            }}
          >
            sutetdorisku
          </h1>
          <p style={{ marginTop: 0, maxWidth: "66ch", opacity: 0.84, lineHeight: 1.6 }}>
            Solve the sudoku puzzle by placing tetrominoes on the grid. Click pieces to rotate them.
          </p>
        </header>

        <div
          style={{
            display: "flex",
            gap: "12px",
            marginBottom: "14px",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: isPortraitMobile ? "center" : "flex-start",
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 600 }}>
            Difficulty
            <select
              value={difficulty}
              onChange={(event) => handleDifficultyChange(event.target.value as Difficulty)}
              style={selectStyle}
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
            style={{ ...buttonStyle, width: isCompactPhone ? "100%" : undefined }}
          >
            {isGenerating ? "Generating..." : "New puzzle"}
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gap: isPortraitMobile ? "14px" : "18px",
            alignItems: "start",
            gridTemplateColumns: isPortraitMobile ? "1fr" : "max-content minmax(320px, 1fr)",
          }}
        >
          <div>
            <div
              style={{
                width: "100%",
                overflowX: "auto",
                paddingBottom: "2px",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${BOARD_SIZE}, ${boardCellSize}px)`,
                  gridTemplateRows: `repeat(${BOARD_SIZE}, ${boardCellSize}px)`,
                  gap: 0,
                  padding: boardFramePadding,
                  borderRadius: "22px",
                  background: "rgba(255, 255, 255, 0.06)",
                  boxShadow: "0 20px 60px rgba(0, 0, 0, 0.35)",
                  width: "fit-content",
                  margin: isPortraitMobile ? "0 auto" : undefined,
                  userSelect: "none",
                  WebkitUserSelect: "none",
                }}
              >
                {board.map((row, rowIndex) =>
                  row.map((cell, colIndex) => {
                    const piece = cell ? placedPieces[cell.pieceInstanceId] : null;
                    const isFixed = piece ? fixedPieceIds.has(piece.pieceInstanceId) : false;
                    const isBlockBoundary =
                      rowIndex % 3 === 0 ||
                      colIndex % 3 === 0 ||
                      rowIndex === BOARD_SIZE - 1 ||
                      colIndex === BOARD_SIZE - 1;

                    return (
                      <div
                        key={`${rowIndex}-${colIndex}`}
                        onDragOver={(event) => onBoardCellDragOver(event, rowIndex, colIndex)}
                        onDrop={(event) => handleDrop(event, rowIndex, colIndex)}
                        onMouseEnter={() => cell && setHoveredPieceId(cell.pieceInstanceId)}
                        onMouseLeave={() => setHoveredPieceId(null)}
                        style={{
                          width: `${boardCellSize}px`,
                          height: `${boardCellSize}px`,
                          borderRadius: getCellRadius(rowIndex, colIndex),
                          border: `1px solid ${isBlockBoundary ? "rgba(255, 255, 255, 0.18)" : "rgba(255, 255, 255, 0.08)"}`,
                          background: getCellBackground(rowIndex, colIndex, cell),
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          color: "#0b1020",
                          transition:
                            "background 120ms ease, transform 120ms ease, box-shadow 120ms ease",
                          boxShadow:
                            cell && hoveredPieceId === cell.pieceInstanceId && !isFixed
                              ? "inset 0 0 0 2px rgba(255, 255, 255, 0.7)"
                              : isFixed
                                ? "inset 0 0 0 1px rgba(255, 255, 255, 0.22)"
                                : undefined,
                          boxSizing: "border-box",
                          ...getCellSpacing(rowIndex, colIndex),
                        }}
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
                            style={{
                              width: "100%",
                              height: "100%",
                              borderRadius: "inherit",
                              background: cell.color,
                              boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.18)",
                              opacity: isFixed ? 0.95 : 1,
                              cursor: isFixed ? "default" : "grab",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: duplicateNumberKeys.has(toCellKey(rowIndex, colIndex))
                                ? "#ef4444"
                                : "#f8fafc",
                              textShadow: "0 1px 2px rgba(0, 0, 0, 0.45)",
                              fontSize: isCompactPhone ? "0.92rem" : "1.05rem",
                              fontWeight: 900,
                              boxSizing: "border-box",
                            }}
                          >
                            <span>{cell.number}</span>
                          </div>
                        ) : null}
                      </div>
                    );
                  }),
                )}
              </div>
            </div>
          </div>

          <aside
            style={{
              display: "flex",
              flexDirection: "column",
              height: isPortraitMobile ? "auto" : `${BOARD_SIZE * boardCellSize + 24}px`,
              minHeight: isPortraitMobile ? "220px" : undefined,
              width: isPortraitMobile ? "100%" : undefined,
              padding: "18px",
              borderRadius: "26px",
              boxSizing: "border-box",
              background: "linear-gradient(180deg, #c89d67 0%, #b6844f 100%)",
              border: "1px solid rgba(89, 56, 27, 0.45)",
              boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 20px 60px rgba(0, 0, 0, 0.28)",
            }}
            onDragOver={onTrayDragOver}
            onDrop={dropPieceIntoTray}
          >
            <div
              style={{
                display: "flex",
                flex: isPortraitMobile ? "initial" : 1,
                flexWrap: "wrap",
                gap: "10px",
                padding: "12px",
                borderRadius: "20px",
                minHeight: isPortraitMobile ? "170px" : 0,
                background:
                  "linear-gradient(180deg, rgba(240, 216, 181, 0.62), rgba(224, 189, 145, 0.66))",
                border: "none",
                alignContent: "flex-start",
                userSelect: "none",
                WebkitUserSelect: "none",
              }}
            >
              {trayPieces.map((piece) => {
                const tetromino = tetrominoById[piece.tetrominoId];
                const shape = getPieceShape(piece);
                const { rows, cols } = shapeBounds(shape);
                const pose = getTrayPiecePose(piece.pieceInstanceId);
                const shapeCellKeys = new Set(shape.map(([row, col]) => `${row}-${col}`));

                const getTrayCellRadius = (row: number, col: number) => {
                  const hasAbove = shapeCellKeys.has(`${row - 1}-${col}`);
                  const hasRight = shapeCellKeys.has(`${row}-${col + 1}`);
                  const hasBelow = shapeCellKeys.has(`${row + 1}-${col}`);
                  const hasLeft = shapeCellKeys.has(`${row}-${col - 1}`);
                  const radius = "8px";

                  return [
                    hasAbove || hasLeft ? "0" : radius,
                    hasAbove || hasRight ? "0" : radius,
                    hasBelow || hasRight ? "0" : radius,
                    hasBelow || hasLeft ? "0" : radius,
                  ].join(" ");
                };

                return (
                  <button
                    key={piece.pieceInstanceId}
                    type="button"
                    onClick={() => rotateTrayPiece(piece.pieceInstanceId)}
                    draggable
                    onDragStart={(event) => startTrayDrag(event, piece)}
                    onDragEnd={endTrayDrag}
                    style={{
                      ...trayButtonStyle,
                      width: `${cols * boardCellSize + 8}px`,
                      minHeight: `${rows * boardCellSize + 8}px`,
                      padding: "4px",
                      background: "transparent",
                      border: "none",
                      boxShadow: "none",
                      alignItems: "center",
                      justifyContent: "center",
                      flexDirection: "column",
                      gap: "8px",
                      ...pose,
                    }}
                    aria-label={`Move tetromino ${tetromino.name}`}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: `repeat(${cols}, ${boardCellSize}px)`,
                        gridTemplateRows: `repeat(${rows}, ${boardCellSize}px)`,
                        gap: 0,
                        justifyContent: "end",
                      }}
                    >
                      {shape.map(([row, col]) => (
                        <span
                          key={`${row}-${col}`}
                          style={{
                            gridRow: row + 1,
                            gridColumn: col + 1,
                            width: `${boardCellSize}px`,
                            height: `${boardCellSize}px`,
                            borderRadius: getTrayCellRadius(row, col),
                            background: tetromino.color,
                            color: "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: isCompactPhone ? "0.92rem" : "1.05rem",
                            fontWeight: 900,
                            textShadow: "0 1px 2px rgba(0, 0, 0, 0.45)",
                          }}
                        >
                          {
                            piece.cells.find(
                              (cellCell) => cellCell.deltaRow === row && cellCell.deltaCol === col,
                            )?.number
                          }
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      </div>

      {isSolved ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(8, 12, 24, 0.76)",
            backdropFilter: "blur(2px)",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              overflow: "hidden",
              pointerEvents: "none",
            }}
            aria-hidden="true"
          >
            {fireworks.map((spark) => (
              <span
                key={spark.id}
                style={
                  {
                    position: "absolute",
                    left: spark.left,
                    top: spark.top,
                    width: `${spark.size}px`,
                    height: `${spark.size}px`,
                    borderRadius: "999px",
                    background: spark.color,
                    boxShadow: `0 0 14px ${spark.color}`,
                    animationName: "firework-burst",
                    animationDuration: `${spark.duration}s`,
                    animationDelay: `${spark.delay}s`,
                    animationTimingFunction: "ease-out",
                    animationIterationCount: "infinite",
                    ["--dx" as string]: `${spark.dx}px`,
                    ["--dy" as string]: `${spark.dy}px`,
                  } as CSSProperties
                }
              />
            ))}
          </div>

          <div
            style={{
              position: "relative",
              zIndex: 1,
              textAlign: "center",
              padding: "26px 30px",
              borderRadius: "24px",
              background: "rgba(16, 22, 38, 0.85)",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              boxShadow: "0 24px 80px rgba(0, 0, 0, 0.45)",
              animation: "solved-pop 320ms ease-out",
            }}
          >
            <h2
              style={{
                margin: "0 0 12px",
                fontSize: "clamp(2.2rem, 8vw, 5rem)",
                lineHeight: 1,
                color: "#fef08a",
                textShadow: "0 6px 24px rgba(254, 240, 138, 0.38)",
              }}
            >
              Solved!
            </h2>
            <button type="button" onClick={() => startGeneration()} style={buttonStyle}>
              Retry
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

const buttonStyle: CSSProperties = {
  border: "none",
  borderRadius: "999px",
  padding: "12px 18px",
  fontWeight: 700,
  color: "#0f1425",
  background: "#f8f9fa",
  cursor: "pointer",
};

const trayButtonStyle: CSSProperties = {
  ...buttonStyle,
  width: "100%",
  borderRadius: "0",
  display: "flex",
  gap: "12px",
  textAlign: "left",
};

const selectStyle: CSSProperties = {
  border: "1px solid rgba(255, 255, 255, 0.28)",
  borderRadius: "999px",
  padding: "10px 14px",
  fontWeight: 700,
  color: "#f8f9fa",
  background: "rgba(15, 20, 37, 0.65)",
  cursor: "pointer",
};
