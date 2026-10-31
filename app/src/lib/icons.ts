// The icon set (docs/design.md §Components, P2-01): sixteen stroke icons, drawn on a 20 × 20
// grid so a 1.75 unit stroke is 1.75 px at the 20 px size, in currentColor. Each icon is a
// list of SVG path data; components/Icon.svelte draws them (aria-hidden unless given a
// label). No icon font, no emoji; an icon is an action or a state, never decoration.

export type IconName =
  | "radio"
  | "clock"
  | "storage"
  | "update"
  | "drill"
  | "reply"
  | "send"
  | "print"
  | "export"
  | "import"
  | "history"
  | "retry"
  | "close"
  | "check"
  | "warning"
  | "chevron";

export const ICON_SIZE = 20;
export const ICON_STROKE = 1.75;

export const ICONS: Record<IconName, readonly string[]> = {
  // A dot with two arcs each side: the radio.
  radio: [
    "M10 10m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0",
    "M6.8 6.8a4.5 4.5 0 0 0 0 6.4",
    "M13.2 6.8a4.5 4.5 0 0 1 0 6.4",
    "M4 4a8.5 8.5 0 0 0 0 12",
    "M16 4a8.5 8.5 0 0 1 0 12",
  ],
  clock: ["M10 2.5a7.5 7.5 0 1 0 0 15a7.5 7.5 0 1 0 0-15", "M10 6v4.5l3 1.5"],
  // A drum: storage.
  storage: [
    "M3.5 5.5a6.5 2.5 0 1 0 13 0a6.5 2.5 0 1 0-13 0",
    "M3.5 5.5v9a6.5 2.5 0 0 0 13 0v-9",
    "M3.5 10a6.5 2.5 0 0 0 13 0",
  ],
  // One arrow round a circle: an update waits.
  update: ["M16.5 10a6.5 6.5 0 1 1-2.2-4.9", "M14.3 1.5v3.6h-3.6"],
  // A flag: the drill.
  drill: ["M5 18V3", "M5 3.5h10l-2.5 3.5 2.5 3.5H5"],
  reply: ["M8 4L3 9l5 5", "M3 9h8a6 6 0 0 1 6 6v2"],
  send: ["M17.5 2.5L2.5 8.5l6.5 2.5 2.5 6.5z", "M17.5 2.5L9 11"],
  print: [
    "M6 7V2.5h8V7",
    "M6 14H3.5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H14",
    "M6 11.5h8v6H6z",
  ],
  export: ["M10 13V3", "M6 7l4-4 4 4", "M3 13v3.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V13"],
  import: ["M10 3v10", "M6 9l4 4 4-4", "M3 13v3.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V13"],
  // A clock face with an arrow back round it: the history of a row.
  history: ["M3.5 10a6.5 6.5 0 1 0 1.9-4.6", "M2.5 5.4h2.9V2.5", "M10 6.5V10l2.5 1.5"],
  // Two arrows round each other: try again.
  retry: [
    "M4 10a6 6 0 0 1 6-6h6",
    "M13 1.5L16.5 4 13 6.5",
    "M16 10a6 6 0 0 1-6 6H4",
    "M7 13.5L3.5 16 7 18.5",
  ],
  close: ["M5 5l10 10", "M15 5L5 15"],
  check: ["M3.5 10.5l4 4 9-9"],
  warning: ["M10 3L2.5 16h15z", "M10 8v3.5", "M10 14v0.01"],
  chevron: ["M6 8l4 4 4-4"],
};

export const ICON_NAMES = Object.keys(ICONS) as IconName[];
