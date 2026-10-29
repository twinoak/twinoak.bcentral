// Types for contrast.mjs (the check is plain JavaScript so Node runs it without a loader).

export const TEXT_MIN: number;
export const CHROME_MIN: number;
export const MIN_FONT_SIZE_PX: number;
export const MIN_LINE_HEIGHT: number;
export const NORMAL_SELECTOR: string;
export const HIGH_CONTRAST_SELECTOR: string;

export interface Pair {
  fg: string;
  bg: string;
  kind: "text" | "chrome";
  what: string;
}
export const PAIRS: readonly Pair[];

export type Tokens = Record<string, string>;

export interface PairResult extends Pair {
  fgValue: string;
  bgValue: string;
  ratio: number;
  min: number;
  ok: boolean;
}

export interface TypeResult {
  fontSizePx: number | null;
  lineHeight: number;
  fontSizeOk: boolean;
  lineHeightOk: boolean;
}

export interface CssResult {
  modes: { normal: PairResult[]; high: PairResult[] };
  type: TypeResult;
  failures: string[];
}

export function parseHex(value: string): [number, number, number];
export function luminance(hex: string): number;
export function contrastRatio(a: string, b: string): number;
export function topLevelCss(css: string): string;
export function blockDeclarations(css: string, selector: string): Tokens;
export function readTokens(css: string): { normal: Tokens; high: Tokens };
export function resolveColour(tokens: Tokens, name: string, seen?: string[]): string;
export function checkPairs(tokens: Tokens, pairs?: readonly Pair[]): PairResult[];
export function checkType(tokens: Tokens): TypeResult;
export function checkCss(css: string): CssResult;
export function formatResult(mode: string, result: PairResult): string;
