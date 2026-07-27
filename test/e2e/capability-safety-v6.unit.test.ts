// SPEC-0001@v16 S64/S72/R87/R91; SPEC-0002@v9 S12/S17/R14/R20.
import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  CAPABILITY_REDACTION_ERROR,
  assertCapabilityAbsent,
  directoryIsAbsentOrEmpty,
  persistPreparedBrowserEvidence,
  prepareBrowserEvidence,
  runSanitizedCommand,
  validateBrowserEvidence,
  writeBrowserEvidence,
} from "../../scripts/capability-safety.mjs";
import {
  failureCasePassed,
} from "../../scripts/run-capability-failure-campaign.mjs";

const capability = "A".repeat(43);
const secondCapability = "B".repeat(43);

describe("SPEC-0002@v9 capability-safe evidence boundary", () => {
  it("rejects observed, fragment-shaped, and bearer-shaped capability bytes", () => {
    for (const value of [
      capability,
      `#capability=${capability}`,
      `Bearer ${capability}`,
    ]) {
      expect(() => assertCapabilityAbsent(Buffer.from(value), [capability]))
        .toThrow(CAPABILITY_REDACTION_ERROR.trim());
    }
  });

  it("validates the exact typed browser evidence grammar and pass invariants", async () => {
    const pass = {
      schema: 1,
      result: "pass",
      failure_stage: null,
      loopback_origin: "http://127.0.0.1:43123",
      dashboard_url_shape:
        "http://127.0.0.1:43123/#capability=<redacted>",
      authorization_shape: "Bearer <redacted>",
      fragment_removed: true,
      authenticated_health_status: 200,
      external_request_count: 0,
    };
    expect(validateBrowserEvidence(pass)).toEqual(pass);

    for (const invalid of [
      { ...pass, schema: 2 },
      { ...pass, extra: true },
      { ...pass, failure_stage: "navigation" },
      { ...pass, loopback_origin: "http://localhost:43123" },
      { ...pass, dashboard_url_shape:
        "http://127.0.0.1:43124/#capability=<redacted>" },
      { ...pass, fragment_removed: false },
      { ...pass, authenticated_health_status: 204 },
      { ...pass, external_request_count: 1 },
      { ...pass, result: "fail", failure_stage: null },
      { ...pass, result: "fail", failure_stage: "unknown" },
    ]) {
      expect(() => validateBrowserEvidence(invalid))
        .toThrow(CAPABILITY_REDACTION_ERROR.trim());
    }

    const fail = {
      schema: 1,
      result: "fail",
      failure_stage: "cleanup",
      loopback_origin: null,
      dashboard_url_shape: null,
      authorization_shape: null,
      fragment_removed: null,
      authenticated_health_status: null,
      external_request_count: 0,
    };
    expect(validateBrowserEvidence(fail)).toEqual(fail);
    const root = await mkdtemp(join(tmpdir(), "wisp-browser-evidence-"));
    const target = join(root, "browser-evidence.json");
    await writeBrowserEvidence(target, pass, [capability]);
    expect(JSON.parse(await readFile(target, "utf8"))).toEqual(pass);
  });

  it("freezes, validates, serializes once, scans before discard, and persists the same buffer", async () => {
    const evidence = {
      schema: 1,
      result: "pass",
      failure_stage: null,
      loopback_origin: "http://127.0.0.1:43123",
      dashboard_url_shape:
        "http://127.0.0.1:43123/#capability=<redacted>",
      authorization_shape: "Bearer <redacted>",
      fragment_removed: true,
      authenticated_health_status: 200,
      external_request_count: 0,
    };
    const order: string[] = [];
    const capabilities = [capability];
    const prepared = prepareBrowserEvidence(evidence, capabilities, {
      onFreeze: () => order.push("freeze"),
      onValidate: () => order.push("validate"),
      onSerialize: () => order.push("serialize"),
      onScan: () => order.push("scan"),
      onDiscard: () => {
        order.push("discard");
        capabilities.splice(0);
      },
    });
    expect(order).toEqual(["freeze", "validate", "serialize", "scan", "discard"]);
    expect(Object.isFrozen(prepared.evidence)).toBe(true);
    const root = await mkdtemp(join(tmpdir(), "wisp-prepared-browser-"));
    const target = join(root, "browser-evidence.json");
    await persistPreparedBrowserEvidence(target, prepared.bytes);
    expect(await readFile(target)).toEqual(prepared.bytes);
  });

  it("prevents frozen browser evidence mutation before serialization", () => {
    const evidence = {
      schema: 1,
      result: "pass",
      failure_stage: null,
      loopback_origin: "http://127.0.0.1:43123",
      dashboard_url_shape:
        "http://127.0.0.1:43123/#capability=<redacted>",
      authorization_shape: "Bearer <redacted>",
      fragment_removed: true,
      authenticated_health_status: 200,
      external_request_count: 0,
    };
    let mutationSucceeded = true;
    const prepared = prepareBrowserEvidence(evidence, [capability], {
      onFreeze: (frozen) => {
        mutationSucceeded = Reflect.set(frozen, "result", "fail");
      },
    });
    evidence.result = "fail";

    expect(mutationSucceeded).toBe(false);
    expect(prepared.evidence.result).toBe("pass");
    expect(JSON.parse(prepared.bytes.toString("utf8")).result).toBe("pass");
  });

  it.each([
    "onFreeze",
    "onValidate",
    "onSerialize",
    "onScan",
    "onDiscard",
  ] as const)("writes nothing when browser evidence preparation fails at %s", async (
    stage,
  ) => {
    const root = await mkdtemp(join(tmpdir(), "wisp-browser-no-write-"));
    const target = join(root, "browser-evidence.json");
    const discarded = vi.fn();
    const evidence = {
      schema: 1,
      result: "pass",
      failure_stage: null,
      loopback_origin: "http://127.0.0.1:43123",
      dashboard_url_shape:
        "http://127.0.0.1:43123/#capability=<redacted>",
      authorization_shape: "Bearer <redacted>",
      fragment_removed: true,
      authenticated_health_status: 200,
      external_request_count: 0,
    };
    const failPreparation = () => {
      throw new Error(`Bearer ${capability}`);
    };
    const hooks = {
      ...(stage === "onDiscard" ? {} : { [stage]: failPreparation }),
      onDiscard: () => {
        discarded();
        if (stage === "onDiscard") failPreparation();
      },
    };

    await expect(writeBrowserEvidence(
      target,
      evidence,
      [capability],
      hooks,
    )).rejects.toThrow(CAPABILITY_REDACTION_ERROR.trim());
    expect(discarded).toHaveBeenCalledTimes(1);
    await expect(readFile(target)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("strips authenticated control frames and redacts bare, fragment, and bearer forms", async () => {
    const nonce = "test-control-nonce";
    const script = [
      `const cap = ${JSON.stringify(capability)};`,
      `process.stdout.write("\\x1eWISP_CAPABILITY:${nonce}:" + cap + "\\x1f");`,
      `process.stdout.write("\\x1eWISP_STAGE:${nonce}:navigation:assertion\\x1f");`,
      `process.stdout.write("\\x1eWISP_FAILURE:${nonce}:navigation:assertion\\x1f");`,
      `process.stdout.write("bare=" + cap + "\\n");`,
      `process.stderr.write("#capability=" + cap + " Bearer " + cap + "\\n");`,
    ].join("");
    const result = await runSanitizedCommand(
      process.execPath,
      ["-e", script],
      { emit: false, controlNonce: nonce, redactStandaloneCapabilities: true },
    );
    expect(result.safetyFailed).toBe(false);
    expect(result.controlStages).toEqual(["navigation:assertion"]);
    expect(result.controlFailures).toEqual(["navigation:assertion"]);
    expect(result.stdout?.toString()).toBe("bare=<redacted>\n");
    expect(result.stderr?.toString()).toBe(
      "#capability=<redacted> Bearer <redacted>\n",
    );
    expect(() => assertCapabilityAbsent(
      Buffer.concat([result.stdout!, result.stderr!]),
      [capability],
    )).not.toThrow();
  });

  it("fails closed on malformed control frames and bounded-output overflow", async () => {
    const malformed = await runSanitizedCommand(
      process.execPath,
      ["-e", 'process.stdout.write("\\x1eWISP_CAPABILITY:malformed")'],
      { emit: false, controlNonce: "valid-control-nonce" },
    );
    expect(malformed).toMatchObject({ status: 1, safetyFailed: true });

    const overflow = await runSanitizedCommand(
      process.execPath,
      ["-e", 'process.stdout.write("x".repeat(1024))'],
      { emit: false, maxOutputBytes: 10 },
    );
    expect(overflow).toMatchObject({ status: 1, safetyFailed: true });
  });

  it("emits exactly the fixed error when sanitizer safety cannot be proved", () => {
    const result = spawnSync(
      process.execPath,
      [resolve("test/e2e/fixtures/sanitizer-fixed-error.mjs")],
    );
    expect(result.status).toBe(0);
    expect(result.stdout.toString()).toBe("");
    expect(result.stderr.toString()).toBe(CAPABILITY_REDACTION_ERROR);
  });

  it("rejects expected failures that never reached their browser stage", () => {
    const preFixtureFailure = {
      status: 1,
      signal: null,
      safetyFailed: false,
      controlStages: [],
      controlFailures: [],
    };
    expect(failureCasePassed(
      "navigation",
      "assertion",
      preFixtureFailure,
      true,
    )).toBe(false);
    expect(failureCasePassed(
      "navigation",
      "assertion",
      {
        ...preFixtureFailure,
        controlStages: ["navigation:assertion"],
        controlFailures: [],
      },
      true,
    )).toBe(false);
    expect(failureCasePassed(
      "navigation",
      "assertion",
      {
        ...preFixtureFailure,
        controlStages: ["navigation:assertion"],
        controlFailures: ["navigation:assertion"],
      },
      true,
    )).toBe(true);
    expect(failureCasePassed(
      "redaction",
      "assertion",
      {
        status: 1,
        signal: null,
        safetyFailed: true,
        controlStages: [],
        controlFailures: [],
      },
      true,
    )).toBe(false);
    expect(failureCasePassed(
      "redaction",
      "assertion",
      {
        status: 1,
        signal: null,
        safetyFailed: true,
        controlStages: ["redaction:assertion"],
        controlFailures: ["redaction:assertion"],
      },
      true,
    )).toBe(true);
  });

  it("blocks Playwright artifact writes before the filesystem sink", async () => {
    const root = await mkdtemp(join(tmpdir(), "wisp-playwright-guard-"));
    const output = join(root, "playwright");
    const guard = resolve("scripts/playwright-artifact-guard.cjs");
    const attempt = spawnSync(
      process.execPath,
      [
        "--require",
        guard,
        "-e",
        [
          'require("node:fs").promises.mkdir(process.env.WISP_PLAYWRIGHT_OUTPUT_DIR,',
          "{recursive:true}).then(() =>",
          'require("node:fs").promises.writeFile(',
          'process.env.WISP_PLAYWRIGHT_OUTPUT_DIR + "/error-context.md","secret"))',
          ".then(() => process.exit(90),() => process.exit(0));",
        ].join(""),
      ],
      {
        env: {
          ...process.env,
          WISP_PLAYWRIGHT_OUTPUT_DIR: output,
        },
      },
    );
    expect(attempt.status, attempt.stderr.toString()).toBe(0);
    expect(await readdir(output)).toEqual([]);
  });

  it("blocks callback writers and every destination-bearing filesystem API", async () => {
    const root = await mkdtemp(join(tmpdir(), "wisp-playwright-destinations-"));
    const output = join(root, "playwright");
    const guard = resolve("scripts/playwright-artifact-guard.cjs");
    const script = [
      'const fs=require("node:fs");',
      'const p=require("node:fs/promises");',
      "const path=require('node:path');",
      'const out=process.env.WISP_PLAYWRIGHT_OUTPUT_DIR;',
      'const source=path.join(path.dirname(out),"source");',
      'fs.mkdirSync(out,{recursive:true});fs.writeFileSync(source,"safe");',
      'const blocked=fn=>Promise.resolve().then(fn).then(()=>false,()=>true);',
      "Promise.all([",
      'blocked(()=>p.copyFile(source,path.join(out,"copy"))),',
      'blocked(()=>new Promise((r,j)=>fs.writeFile(path.join(out,"callback"),"x",e=>e?j(e):r()))),',
      'Promise.resolve().then(()=>{try{fs.renameSync(source,path.join(out,"rename"));return false}catch{return true}})',
      "]).then(v=>process.exit(v.every(Boolean)?0:90));",
    ].join("");
    const attempt = spawnSync(
      process.execPath,
      ["--require", guard, "-e", script],
      {
        env: {
          ...process.env,
          WISP_PLAYWRIGHT_OUTPUT_DIR: output,
        },
      },
    );
    expect(attempt.status, attempt.stderr.toString()).toBe(0);
    expect(await readdir(output)).toEqual([]);
  });

  it("terminates the complete POSIX process group at the sanitizer deadline", async () => {
    if (process.platform === "win32") return;
    const result = await runSanitizedCommand(
      process.execPath,
      [
        "-e",
        [
          'const{spawn}=require("node:child_process");',
          'const c=spawn(process.execPath,["-e","process.on(\\"SIGTERM\\",()=>{});setInterval(()=>{},1000)"],',
          '{stdio:"ignore"});console.log(c.pid);setInterval(()=>{},1000);',
        ].join(""),
      ],
      { emit: false, timeoutMs: 1_000, killGraceMs: 30 },
    );
    const descendantPid = Number(result.stdout?.toString().trim());
    expect(result.timedOut).toBe(true);
    expect(descendantPid).toBeGreaterThan(0);
    await expect.poll(() => {
      try {
        process.kill(descendantPid, 0);
        return true;
      } catch {
        return false;
      }
    }).toBe(false);
  });

  it("redacts a real Playwright reporter failure and blocks error-context.md", async () => {
    const root = await mkdtemp(join(tmpdir(), "wisp-playwright-failure-"));
    const output = join(root, "playwright");
    const nonce = "playwright-failure-nonce";
    const guard = resolve("scripts/playwright-artifact-guard.cjs");
    const result = await runSanitizedCommand(
      process.execPath,
      [
        "node_modules/@playwright/test/cli.js",
        "test",
        "--config",
        "test/e2e/fixtures/playwright-capability-failure.config.ts",
      ],
      {
        emit: false,
        controlNonce: nonce,
        redactStandaloneCapabilities: true,
        env: {
          ...process.env,
          NODE_OPTIONS: `--require=${JSON.stringify(guard)}`,
          PLAYWRIGHT_LAST_RUN_OUTPUT_FILE: "/dev/null",
          PLAYWRIGHT_NO_COPY_PROMPT: "1",
          WISP_E2E_CONTROL_NONCE: nonce,
          WISP_FAILURE_CAPABILITY: capability,
          WISP_PLAYWRIGHT_OUTPUT_DIR: output,
        },
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.safetyFailed).toBe(false);
    const emitted = Buffer.concat([result.stdout!, result.stderr!]);
    expect(() => assertCapabilityAbsent(emitted, [capability])).not.toThrow();
    expect(await directoryIsAbsentOrEmpty(output)).toBe(true);
  });

  it("treats empty framework directories as safe but rejects any nested file", async () => {
    const root = await mkdtemp(join(tmpdir(), "wisp-empty-output-"));
    await mkdir(join(root, "worker", "test"), { recursive: true });
    expect(await directoryIsAbsentOrEmpty(root)).toBe(true);
    await writeFile(join(root, "worker", "test", "error-context.md"), "unsafe");
    expect(await directoryIsAbsentOrEmpty(root)).toBe(false);
  });
});
