import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { builtAt, commit, version, versionLabel } from "./version.ts";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  version: string;
};

describe("version injected at build time", () => {
  it("version is package.json's version", () => {
    expect(version).toBe(pkg.version);
  });

  it("commit is a short hash, or dev outside git", () => {
    expect(commit).toMatch(/^([0-9a-f]{7,40}|dev)$/);
  });

  it("builtAt is an ISO 8601 instant", () => {
    expect(builtAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Number.isNaN(Date.parse(builtAt))).toBe(false);
  });

  it("versionLabel is version, commit and build date in one string", () => {
    expect(versionLabel()).toBe(`${version} (${commit}, ${builtAt.slice(0, 10)})`);
  });
});
