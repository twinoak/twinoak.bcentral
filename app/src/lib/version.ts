// The version of the running code, fixed at build time by `define` in vite.config.ts:
// package.json version, short commit hash, build time as ISO 8601. The running code is by
// definition the installed one, so this is also what settings shows as "installed version".

export const version: string = __APP_VERSION__;
export const commit: string = __APP_COMMIT__;
export const builtAt: string = __APP_BUILT_AT__;

// One string for the top bar's tooltip and the settings page: "0.0.1 (a4f9afe, 2026-10-28)".
export function versionLabel(): string {
  return `${version} (${commit}, ${builtAt.slice(0, 10)})`;
}
