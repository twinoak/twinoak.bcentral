// WCAG contrast over the CSS custom properties in src/app.css (P1-09). Pure: reads a CSS
// text, resolves the colour tokens of the normal and the high-contrast mode, and checks the
// pairs below against the task's thresholds — 7:1 for text, 3:1 for UI chrome. The CLI
// (check-contrast.mjs) runs it in `npm run test`; src/lib/contrast.test.ts runs it in vitest.
// Plain JavaScript with a .d.mts beside it, so Node runs it without a loader.

export const TEXT_MIN = 7;
export const CHROME_MIN = 3;
// The two numbers the task fixes for the base type.
export const MIN_FONT_SIZE_PX = 18;
export const MIN_LINE_HEIGHT = 1.4;

// Which token is read on which, and why. `text` pairs must reach TEXT_MIN, `chrome` pairs
// CHROME_MIN, in both modes. A token used both as text and as a boundary is listed twice.
export const PAIRS = [
  // Body text and the greys it is set in.
  { fg: "--ink", bg: "--light", kind: "text", what: "body text on the page" },
  { fg: "--ink", bg: "--surface", kind: "text", what: "body text in a panel or a table" },
  { fg: "--ink", bg: "--surface-in", kind: "text", what: "an incoming row's text" },
  { fg: "--ink", bg: "--surface-given-up", kind: "text", what: "a given-up row's text" },
  { fg: "--muted", bg: "--light", kind: "text", what: "help text on the page" },
  { fg: "--muted", bg: "--surface", kind: "text", what: "help text, strips, times in a panel" },
  {
    fg: "--muted",
    bg: "--surface-in",
    kind: "text",
    what: "the transport word on an incoming row",
  },
  { fg: "--muted", bg: "--surface-given-up", kind: "text", what: "the strip on a given-up row" },
  // Links, primary text colour and the status words.
  { fg: "--navy", bg: "--light", kind: "text", what: "links and the sent status on the page" },
  { fg: "--navy", bg: "--surface", kind: "text", what: "links and secondary buttons in a panel" },
  { fg: "--navy", bg: "--surface-in", kind: "text", what: "the answered link on an incoming row" },
  { fg: "--error", bg: "--light", kind: "text", what: "error text on the page" },
  { fg: "--error", bg: "--surface", kind: "text", what: "error text in a panel" },
  { fg: "--error", bg: "--surface-given-up", kind: "text", what: "given up on its tinted row" },
  { fg: "--ok", bg: "--light", kind: "text", what: "delivered / roger on the page" },
  { fg: "--ok", bg: "--surface", kind: "text", what: "delivered / roger in a panel" },
  // Text on the coloured surfaces: the top bar, the notices, the drill band.
  { fg: "--on-navy", bg: "--navy", kind: "text", what: "the top bar and primary buttons" },
  { fg: "--ink", bg: "--warn-bg", kind: "text", what: "the clock notice, the update banner" },
  { fg: "--ink", bg: "--alert-bg", kind: "text", what: "the folder and storage notices" },
  { fg: "--ink", bg: "--drill-bg", kind: "text", what: "the drill band" },
  // UI chrome: field borders, panel borders, the focus ring, button boundaries.
  { fg: "--line", bg: "--surface", kind: "chrome", what: "field and panel borders in a panel" },
  { fg: "--line", bg: "--light", kind: "chrome", what: "field and panel borders on the page" },
  { fg: "--focus", bg: "--surface", kind: "chrome", what: "the focus ring in a panel" },
  { fg: "--focus", bg: "--light", kind: "chrome", what: "the focus ring on the page" },
  { fg: "--focus", bg: "--surface-in", kind: "chrome", what: "the focus ring on an incoming row" },
  { fg: "--focus-on-navy", bg: "--navy", kind: "chrome", what: "the focus ring in the top bar" },
  { fg: "--navy", bg: "--surface", kind: "chrome", what: "a primary button's boundary" },
  { fg: "--error", bg: "--surface", kind: "chrome", what: "an invalid field's border" },
  { fg: "--drill-line", bg: "--drill-bg", kind: "chrome", what: "the drill band's lower edge" },
];

// --- colour maths (WCAG 2.x relative luminance and contrast ratio) ----------------------

export function parseHex(value) {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (match === null) {
    throw new Error(`not a hex colour: ${value}`);
  }
  let hex = match[1];
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

function channel(byte) {
  const c = byte / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex) {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

// --- reading the tokens out of the CSS ----------------------------------------------------

// The CSS without its comments and without the at-rule blocks (@media, @page): the tokens
// live in top-level rules, and a `:root` inside `@media print` is the paper's, not the
// screen's. Braces are counted so a nested block is dropped whole.
export function topLevelCss(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let out = "";
  let i = 0;
  while (i < text.length) {
    const at = text.indexOf("@", i);
    if (at === -1) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, at);
    const open = text.indexOf("{", at);
    if (open === -1) {
      break;
    }
    let depth = 0;
    let j = open;
    for (; j < text.length; j++) {
      if (text[j] === "{") {
        depth += 1;
      } else if (text[j] === "}") {
        depth -= 1;
        if (depth === 0) {
          break;
        }
      }
    }
    i = j + 1;
  }
  return out;
}

// The declarations of one rule block, by selector text, as written: `--ink: #1b1f24` and
// `font-size: 18px` alike. Comments and at-rule blocks are dropped first.
export function blockDeclarations(css, selector) {
  const text = topLevelCss(css);
  const declarations = {};
  let found = false;
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match[1].trim() !== selector) {
      continue;
    }
    found = true;
    for (const part of match[2].split(";")) {
      const colon = part.indexOf(":");
      if (colon === -1) {
        continue;
      }
      declarations[part.slice(0, colon).trim()] = part.slice(colon + 1).trim();
    }
  }
  if (!found) {
    throw new Error(`no block for ${selector} in the CSS`);
  }
  return declarations;
}

export const NORMAL_SELECTOR = ":root";
export const HIGH_CONTRAST_SELECTOR = ':root[data-contrast="high"]';

// The tokens of both modes: the high-contrast block overrides the normal one, as in CSS.
export function readTokens(css) {
  const normal = blockDeclarations(css, NORMAL_SELECTOR);
  const high = { ...normal, ...blockDeclarations(css, HIGH_CONTRAST_SELECTOR) };
  return { normal, high };
}

// A token's value as a hex colour, following `var(--other)` references.
export function resolveColour(tokens, name, seen = []) {
  const value = tokens[name];
  if (value === undefined) {
    throw new Error(`token ${name} is not declared`);
  }
  const reference = /^var\((--[\w-]+)\)$/.exec(value);
  if (reference !== null) {
    if (seen.includes(name)) {
      throw new Error(`token ${name} refers to itself`);
    }
    return resolveColour(tokens, reference[1], [...seen, name]);
  }
  return value;
}

// --- the check ---------------------------------------------------------------------------

// Every pair in one mode: the ratio, the threshold and whether it passes.
export function checkPairs(tokens, pairs = PAIRS) {
  return pairs.map((pair) => {
    const fg = resolveColour(tokens, pair.fg);
    const bg = resolveColour(tokens, pair.bg);
    const ratio = contrastRatio(fg, bg);
    const min = pair.kind === "text" ? TEXT_MIN : CHROME_MIN;
    return { ...pair, fgValue: fg, bgValue: bg, ratio, min, ok: ratio >= min };
  });
}

function parsePx(value) {
  const match = /^([\d.]+)px$/.exec(value ?? "");
  return match === null ? null : Number(match[1]);
}

// The base type: font-size at least 18 px and line-height at least 1.4 on :root.
export function checkType(tokens) {
  const fontSizePx = parsePx(tokens["font-size"]);
  const lineHeight = Number(tokens["line-height"]);
  return {
    fontSizePx,
    lineHeight,
    fontSizeOk: fontSizePx !== null && fontSizePx >= MIN_FONT_SIZE_PX,
    lineHeightOk: Number.isFinite(lineHeight) && lineHeight >= MIN_LINE_HEIGHT,
  };
}

// The whole check over a CSS text: both modes' pairs, the base type, and the failures as
// one list of sentences (empty when everything passes).
export function checkCss(css) {
  const { normal, high } = readTokens(css);
  const modes = {
    normal: checkPairs(normal),
    high: checkPairs(high),
  };
  const type = checkType(normal);
  const failures = [];
  for (const [mode, results] of Object.entries(modes)) {
    for (const result of results) {
      if (!result.ok) {
        failures.push(
          `${mode}: ${result.fg} ${result.fgValue} on ${result.bg} ${result.bgValue} is ` +
            `${result.ratio.toFixed(2)}:1, needs ${result.min}:1 (${result.what})`,
        );
      }
    }
  }
  if (!type.fontSizeOk) {
    failures.push(
      `:root font-size is ${normal["font-size"]}, needs at least ${MIN_FONT_SIZE_PX}px`,
    );
  }
  if (!type.lineHeightOk) {
    failures.push(
      `:root line-height is ${normal["line-height"]}, needs at least ${MIN_LINE_HEIGHT}`,
    );
  }
  return { modes, type, failures };
}

// One line per pair, for the terminal.
export function formatResult(mode, result) {
  const mark = result.ok ? "ok  " : "FAIL";
  return `${mark} ${mode.padEnd(6)} ${result.ratio.toFixed(2).padStart(6)}:1 >= ${result.min}  ${result.fg} on ${result.bg}  (${result.what})`;
}
