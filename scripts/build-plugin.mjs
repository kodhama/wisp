import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";

const outfile = "plugins/wisp/dist/wisp.mjs";
const result = await build({
  entryPoints: ["src/entry.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  outfile,
  metafile: true,
  sourcemap: false,
  legalComments: "none",
});

const forbidden = /(?:^|[/\\])(?:@hono|hono|express)(?:[/\\]|$)|serve-static|streamableHttp/i;
const forbiddenInputs = Object.keys(result.metafile.inputs).filter((input) => forbidden.test(input));
if (forbiddenInputs.length > 0) {
  throw new Error(`HTTP server code entered the stdio bundle:\n${forbiddenInputs.join("\n")}`);
}

const generated = await readFile(outfile, "utf8");
const normalized = generated.replace(/^[\t ]+$/gm, "");
if (normalized !== generated) await writeFile(outfile, normalized);
const bundle = Buffer.from(normalized, "utf8");
const digest = createHash("sha256").update(bundle).digest("hex");
const qualificationPath = "plugins/wisp/qualification.json";
const qualification = JSON.parse(await readFile(qualificationPath, "utf8"));
qualification.artifact_sha256 = digest;
await writeFile(qualificationPath, `${JSON.stringify(qualification, null, 2)}\n`);

process.stderr.write(`built ${outfile} (${bundle.byteLength} bytes, sha256 ${digest})\n`);
