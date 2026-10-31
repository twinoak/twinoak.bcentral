// WCAG contrast over the colour tokens in src/styles/tokens.css (P1-09, moved onto the
// docs/design.md tokens in P2-01). Pure: reads a CSS text, resolves the tokens of the normal
// and the high-contrast mode, and checks the pairs below against the document's thresholds —
// 7:1 for text, 3:1 for UI chrome. The CLI (check-contrast.mjs) runs it in `npm run test`;
// src/lib/contrast.test.ts runs it in vitest. Plain JavaScript with a .d.mts beside it, so
// Node runs it without a loader.

export const TEXT_MIN = 7;
export const CHROME_MIN = 3;
// The base type the document fixes: 16 px and a line height of 1.45 (checked at 1.4, the
// P1-09 floor the document keeps).
export const MIN_FONT_SIZE_PX = 16;
export const MIN_LINE_HEIGHT = 1.4;

// Which token is read on which, and why. `text` pairs must reach TEXT_MIN, `chrome` pairs
// CHROME_MIN, in both modes. The grey surfaces are --bg (page), --surface (cards, bar,
// rows), --surface-2 (table header, expanded row) and --accent-weak (selected row, active
// chip); --rule, the row separator and card border, is decoration and is not checked.
export const PAIRS = [
  // Body text and secondary text on every grey surface.
  { fg: "--ink", bg: "--bg", kind: "text", what: "body text on the page" },
  { fg: "--ink", bg: "--surface", kind: "text", what: "body text in a card, the bar, a row" },
  { fg: "--ink", bg: "--surface-2", kind: "text", what: "text in a table header, an expanded row" },
  { fg: "--ink", bg: "--accent-weak", kind: "text", what: "text on a selected row" },
  { fg: "--ink-2", bg: "--bg", kind: "text", what: "meta and help text on the page" },
  { fg: "--ink-2", bg: "--surface", kind: "text", what: "labels, times, strips in a card" },
  { fg: "--ink-2", bg: "--surface-2", kind: "text", what: "a table header, a neutral chip" },
  { fg: "--ink-2", bg: "--accent-weak", kind: "text", what: "the time on a selected row" },
  // The accent as text: links, quiet buttons, active nav and tabs, the wordmark.
  { fg: "--accent", bg: "--bg", kind: "text", what: "links on the page" },
  { fg: "--accent", bg: "--surface", kind: "text", what: "links, quiet buttons, the wordmark" },
  { fg: "--accent", bg: "--surface-2", kind: "text", what: "a quiet button on an expanded row" },
  {
    fg: "--accent",
    bg: "--accent-weak",
    kind: "text",
    what: "an active chip, a selected row's link",
  },
  { fg: "--on-accent", bg: "--accent", kind: "text", what: "a primary button" },
  // The status pairs: the word on its tint (chips, inline messages) and on the greys
  // (strips, status words in text, the chip in the bar).
  { fg: "--ok", bg: "--ok-bg", kind: "text", what: "an ok chip or message" },
  { fg: "--ok", bg: "--surface", kind: "text", what: "delivered / roger in a strip" },
  { fg: "--ok", bg: "--bg", kind: "text", what: "an ok word on the page" },
  { fg: "--warn", bg: "--warn-bg", kind: "text", what: "a warn chip or message" },
  { fg: "--warn", bg: "--surface", kind: "text", what: "waiting in a strip" },
  { fg: "--warn", bg: "--bg", kind: "text", what: "a warn word on the page" },
  { fg: "--danger", bg: "--danger-bg", kind: "text", what: "a danger chip or message" },
  { fg: "--danger", bg: "--surface", kind: "text", what: "given up in a strip, a field error" },
  { fg: "--danger", bg: "--bg", kind: "text", what: "an error on the page" },
  { fg: "--drill", bg: "--drill-bg", kind: "text", what: "the drill chip, the drill bar" },
  { fg: "--drill", bg: "--surface", kind: "text", what: "the drill word in a card" },
  { fg: "--drill", bg: "--bg", kind: "text", what: "the drill word on the page" },
  // The drill bar (P2-02) carries the shell's text and links on the drill tint.
  { fg: "--ink", bg: "--drill-bg", kind: "text", what: "text on the drill bar" },
  { fg: "--ink-2", bg: "--drill-bg", kind: "text", what: "the navigation on the drill bar" },
  {
    fg: "--accent",
    bg: "--drill-bg",
    kind: "text",
    what: "the wordmark and the current screen on the drill bar",
  },
  // UI chrome: input and default-button borders, the focus ring, underlines and boundaries.
  { fg: "--rule-2", bg: "--surface", kind: "chrome", what: "a field or button border in a card" },
  { fg: "--rule-2", bg: "--bg", kind: "chrome", what: "a field or button border on the page" },
  { fg: "--rule-2", bg: "--surface-2", kind: "chrome", what: "a field border on an expanded row" },
  { fg: "--rule-2", bg: "--accent-weak", kind: "chrome", what: "a field border on a selected row" },
  { fg: "--focus", bg: "--surface", kind: "chrome", what: "the focus ring in a card" },
  { fg: "--focus", bg: "--bg", kind: "chrome", what: "the focus ring on the page" },
  { fg: "--focus", bg: "--surface-2", kind: "chrome", what: "the focus ring on an expanded row" },
  { fg: "--focus", bg: "--accent-weak", kind: "chrome", what: "the focus ring on a selected row" },
  { fg: "--focus", bg: "--drill-bg", kind: "chrome", what: "the focus ring on the drill bar" },
  {
    fg: "--rule-2",
    bg: "--drill-bg",
    kind: "chrome",
    what: "the language select on the drill bar",
  },
  {
    fg: "--accent",
    bg: "--surface",
    kind: "chrome",
    what: "a tab underline, a primary button's edge",
  },
  { fg: "--accent", bg: "--bg", kind: "chrome", what: "a primary button's edge on the page" },
  {
    fg: "--danger",
    bg: "--surface",
    kind: "chrome",
    what: "an invalid field's border, a danger button",
  },
  { fg: "--danger", bg: "--bg", kind: "chrome", what: "a danger button's border on the page" },
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

// The declarations of every rule block with this selector text, merged in order, as
// written: `--ink: #16191d` and `font-size: 16px` alike. Comments and at-rule blocks are
// dropped first.
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

// The base type: font-size at least 16 px and line-height at least 1.4 on :root.
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
