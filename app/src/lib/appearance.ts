// How the type and the contrast settings reach the page (P1-09): two attributes on the root
// element that styles/tokens.css keys its font size and its colour tokens on. Pure, so a
// test can hand it a fake root; App.svelte applies it on every change, main.ts once before
// the mount so the first paint is already at the chosen size. The drill attribute (P2-02)
// works the same way: `data-drill="true"` on the root while the current incident is a drill,
// which components.css keys the top bar's drill tint on.

import type { FontSize } from "./settings.svelte.ts";

export interface Appearance {
  fontSize: FontSize;
  highContrast: boolean;
}

export interface RootLike {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

export const FONT_SIZE_ATTRIBUTE = "data-font-size";
export const CONTRAST_ATTRIBUTE = "data-contrast";
export const DRILL_ATTRIBUTE = "data-drill";

export function applyDrill(root: RootLike, active: boolean): void {
  if (active) {
    root.setAttribute(DRILL_ATTRIBUTE, "true");
  } else {
    root.removeAttribute(DRILL_ATTRIBUTE);
  }
}

export function applyAppearance(root: RootLike, appearance: Appearance): void {
  if (appearance.fontSize === "normal") {
    root.removeAttribute(FONT_SIZE_ATTRIBUTE);
  } else {
    root.setAttribute(FONT_SIZE_ATTRIBUTE, appearance.fontSize);
  }
  if (appearance.highContrast) {
    root.setAttribute(CONTRAST_ATTRIBUTE, "high");
  } else {
    root.removeAttribute(CONTRAST_ATTRIBUTE);
  }
}
