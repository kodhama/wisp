import { realpath, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { WispError } from "./runtime.ts";

export interface McpRoot {
  uri: string;
  name?: string;
}

export class ProjectResolver {
  readonly #environmentRoot: string | undefined;
  readonly #rootsSupported: boolean;
  readonly #listRoots: () => Promise<McpRoot[]>;
  #resolution: Promise<string> | undefined;

  constructor(
    environmentRoot: string | undefined,
    rootsSupported: boolean,
    listRoots: () => Promise<McpRoot[]>,
  ) {
    this.#environmentRoot = environmentRoot;
    this.#rootsSupported = rootsSupported;
    this.#listRoots = listRoots;
  }

  resolve(): Promise<string> {
    this.#resolution ??= this.#resolveOnce();
    return this.#resolution;
  }

  async #resolveOnce(): Promise<string> {
    if (this.#environmentRoot !== undefined) {
      if (this.#environmentRoot.trim() === "" || !isAbsolute(this.#environmentRoot)) {
        throw unresolved("invalid_environment_root", "environment");
      }
      return canonicalDirectory(this.#environmentRoot, "invalid_environment_root", "environment");
    }

    if (!this.#rootsSupported) throw unresolved("roots_unsupported", "roots");
    let roots: McpRoot[];
    try {
      roots = await this.#listRoots();
    } catch {
      throw unresolved("roots_list_failed", "roots");
    }
    if (roots.length === 0) throw unresolved("roots_absent", "roots");
    if (roots.length !== 1) throw unresolved("roots_ambiguous", "roots");
    const uri = roots[0]!.uri;
    let url: URL;
    try {
      url = new URL(uri);
    } catch {
      throw unresolved("invalid_file_root", "roots");
    }
    if (
      url.protocol !== "file:" ||
      url.search !== "" ||
      url.hash !== "" ||
      (url.hostname !== "" && url.hostname !== "localhost")
    ) {
      throw unresolved("invalid_file_root", "roots");
    }
    let path: string;
    try {
      path = fileURLToPath(url);
    } catch {
      throw unresolved("invalid_file_root", "roots");
    }
    return canonicalDirectory(path, "invalid_file_root", "roots");
  }
}

function unresolved(reason: string, source: "environment" | "roots"): WispError {
  return new WispError("project_unresolved", "Wisp could not resolve the project", { reason, source });
}

async function canonicalDirectory(
  path: string,
  reason: "invalid_environment_root" | "invalid_file_root",
  source: "environment" | "roots",
): Promise<string> {
  try {
    const info = await stat(path);
    if (!info.isDirectory()) throw new Error("not directory");
    return await realpath(path);
  } catch {
    throw unresolved(reason, source);
  }
}
