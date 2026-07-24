import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("project instruction entrypoints", () => {
  const agents = read("AGENTS.md");
  const claude = read("CLAUDE.md");

  it("keeps shared rules canonical in AGENTS with one Claude adapter", () => {
    expect(claude.startsWith("@AGENTS.md\n")).toBe(true);
    expect(claude.match(/^@AGENTS\.md$/gm)).toHaveLength(1);
    expect(agents).toContain(
      "`AGENTS.md` is the canonical home for instructions shared by Codex and Claude",
    );
  });

  it("keeps Grove in AGENTS and Trellis in CLAUDE", () => {
    for (const marker of ["<!-- grove:begin", "<!-- grove:end -->"]) {
      expect(agents.split(marker)).toHaveLength(2);
      expect(claude).not.toContain(marker);
    }
    for (const marker of ["<!-- trellis:begin", "<!-- trellis:end -->"]) {
      expect(claude.split(marker)).toHaveLength(2);
      expect(agents).not.toContain(marker);
    }
    expect(claude).toContain("@.trellis/internal/trellis.md");
    expect(claude).toContain("@.trellis/rules.toml");
  });

  it("routes Grove convention lookups and current docs to AGENTS", () => {
    expect(read(".grove/config.toml")).toContain(
      'CONVENTIONS_PATH = "AGENTS.md"',
    );
    for (const path of [
      ".grove/README.md",
      "decisions/README.md",
      "specs/README.md",
    ]) {
      expect(read(path)).not.toMatch(/repo's CLAUDE\.md|CLAUDE\.md managed block/);
    }
  });
});
