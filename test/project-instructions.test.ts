import { existsSync, readFileSync } from "node:fs";
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

  it("keeps Grove in AGENTS, and Trellis out of both files entirely", () => {
    for (const marker of ["<!-- grove:begin", "<!-- grove:end -->"]) {
      expect(agents.split(marker)).toHaveLength(2);
      expect(claude).not.toContain(marker);
    }
    // Trellis USED to require a managed block in CLAUDE.md importing a vendored
    // overlay. Trellis `decision-0065` moved rule delivery to the plugin's own
    // SessionStart hook, so the block and the overlay are both retired — this
    // guard is inverted rather than deleted, because a block reappearing would
    // mean rules arriving twice, and a silently-absent guard would not say so.
    for (const marker of ["<!-- trellis:begin", "<!-- trellis:end -->"]) {
      expect(claude).not.toContain(marker);
      expect(agents).not.toContain(marker);
    }
    expect(claude).not.toContain("@.trellis/internal/");
    expect(existsSync(resolve(root, ".trellis/internal"))).toBe(false);
    // `.trellis/rules.toml` is the opt-in signal the hook's config-only path
    // requires: without it the plugin governs nothing here, by design.
    expect(existsSync(resolve(root, ".trellis/rules.toml"))).toBe(true);
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
