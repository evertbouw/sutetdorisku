import type { Tetromino } from "./types";

export const TETROMINOS: Tetromino[] = [
  {
    id: "I",
    name: "I",
    color: "#ef476f",
    shape: [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
    ],
  },
  {
    id: "O",
    name: "O",
    color: "#ffd166",
    shape: [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ],
  },
  {
    id: "T",
    name: "T",
    color: "#06d6a0",
    shape: [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, 2],
    ],
  },
  {
    id: "S",
    name: "S",
    color: "#118ab2",
    shape: [
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
    ],
  },
  {
    id: "Z",
    name: "Z",
    color: "#8d99ae",
    shape: [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 2],
    ],
  },
  {
    id: "J",
    name: "J",
    color: "#f78c6b",
    shape: [
      [0, 0],
      [1, 0],
      [1, 1],
      [1, 2],
    ],
  },
  {
    id: "L",
    name: "L",
    color: "#8338ec",
    shape: [
      [0, 2],
      [1, 0],
      [1, 1],
      [1, 2],
    ],
  },
];
