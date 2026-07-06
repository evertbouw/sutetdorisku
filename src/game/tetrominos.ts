import type { Tetromino } from "./types";

export const TETROMINOS: Tetromino[] = [
  {
    id: "I",
    shape: [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
    ],
  },
  {
    id: "O",
    shape: [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ],
  },
  {
    id: "T",
    shape: [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, 2],
    ],
  },
  {
    id: "S",
    shape: [
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
    ],
  },
  {
    id: "Z",
    shape: [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 2],
    ],
  },
  {
    id: "J",
    shape: [
      [0, 0],
      [1, 0],
      [1, 1],
      [1, 2],
    ],
  },
  {
    id: "L",
    shape: [
      [0, 2],
      [1, 0],
      [1, 1],
      [1, 2],
    ],
  },
];
