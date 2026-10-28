// tasks/CONVENTIONS.md: no `new Promise`, no `Promise.all`. This runs the project's own
// ESLint configuration against small fixtures, so the rules cannot silently disappear.

import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";
import { fileURLToPath } from "node:url";

const appDir = fileURLToPath(new URL("..", import.meta.url));

async function lint(code: string): Promise<string[]> {
  const eslint = new ESLint({ cwd: appDir });
  const results = await eslint.lintText(code, { filePath: "src/conventions-fixture.ts" });
  return results.flatMap((result) => result.messages.map((m) => `${m.ruleId}: ${m.message}`));
}

describe("ESLint conventions", () => {
  it("fails on new Promise(", async () => {
    const messages = await lint(
      "export function wait(): Promise<void> {\n  return new Promise((resolve) => resolve());\n}\n",
    );
    expect(messages.some((m) => m.startsWith("no-restricted-syntax:"))).toBe(true);
  });

  it("fails on Promise.all(", async () => {
    const messages = await lint(
      "export async function both(a: Promise<number>, b: Promise<number>) {\n  return Promise.all([a, b]);\n}\n",
    );
    expect(messages.some((m) => m.startsWith("no-restricted-syntax:"))).toBe(true);
  });

  it("fails on Promise.allSettled, Promise.race and Promise.any as well", async () => {
    for (const method of ["allSettled", "race", "any"]) {
      const messages = await lint(
        `export async function run(a: Promise<number>) {\n  return Promise.${method}([a]);\n}\n`,
      );
      expect(messages.some((m) => m.startsWith("no-restricted-syntax:"))).toBe(true);
    }
  });

  it("passes plain linear async/await, including a loop that awaits", async () => {
    const messages = await lint(
      "export async function sum(items: Promise<number>[]): Promise<number> {\n" +
        "  let total = 0;\n" +
        "  for (const item of items) {\n" +
        "    total += await item;\n" +
        "  }\n" +
        "  return total;\n" +
        "}\n",
    );
    expect(messages).toEqual([]);
  });
});
