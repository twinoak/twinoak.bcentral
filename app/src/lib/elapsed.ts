// "12 s", "3 min", "1 h 5 min": how long ago something happened, for the top bar. Whole
// units, rounded down; never negative.

import { t } from "../i18n/index.svelte.ts";

export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) {
    return t("elapsed.seconds", { n: seconds });
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return t("elapsed.minutes", { n: minutes });
  }
  const hours = Math.floor(minutes / 60);
  return t("elapsed.hours", { h: hours, m: minutes % 60 });
}
