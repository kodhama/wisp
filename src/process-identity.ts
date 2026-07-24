import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

export type ProcessObservation =
  | { state: "present"; token: string }
  | { state: "absent" }
  | { state: "inconclusive" };

export function processInstanceIsGone(
  recordedToken: string,
  observation: ProcessObservation,
): boolean | undefined {
  if (observation.state === "inconclusive") return undefined;
  if (observation.state === "absent") return true;
  return observation.token !== recordedToken;
}

const execFileAsync = promisify(execFile);
const BOOT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PS_DATE = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ([ 0-3][0-9]) ([0-2][0-9]):([0-5][0-9]):([0-5][0-9]) ([0-9]{4})$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function parseLinuxIdentity(bootIdText: string, statText: string, pid: number): string | undefined {
  const bootId = bootIdText.trim();
  if (!BOOT_ID.test(bootId)) return undefined;
  const prefix = `${pid} (`;
  if (!statText.startsWith(prefix)) return undefined;
  const close = statText.lastIndexOf(") ");
  if (close < prefix.length) return undefined;
  const fields = statText.slice(close + 2).trim().split(/\s+/u);
  const starttime = fields[19];
  if (starttime === undefined || !/^[0-9]+$/u.test(starttime)) return undefined;
  return `linux:${bootId}:${starttime}`;
}

export function parseDarwinIdentity(value: string): string | undefined {
  const lines = value.trim().split(/\r?\n/u);
  if (lines.length !== 1) return undefined;
  const match = PS_DATE.exec(lines[0]!);
  if (match === null) return undefined;
  const month = MONTHS.indexOf(match[2]!) + 1;
  const day = Number(match[3]!.trim());
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const year = Number(match[7]);
  const date = new Date(year, month - 1, day, hour, minute, second);
  if (
    date.getFullYear() !== year || date.getMonth() !== month - 1 ||
    date.getDate() !== day || date.getHours() !== hour ||
    date.getMinutes() !== minute || date.getSeconds() !== second
  ) return undefined;
  return `darwin:${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}T${match[4]}:${match[5]}:${match[6]}`;
}

export async function observeProcess(pid: number): Promise<ProcessObservation> {
  if (!Number.isInteger(pid) || pid <= 0) return { state: "inconclusive" };
  if (process.platform === "linux") {
    try {
      const [bootId, stat] = await Promise.all([
        readFile("/proc/sys/kernel/random/boot_id", "utf8"),
        readFile(`/proc/${pid}/stat`, "utf8"),
      ]);
      const token = parseLinuxIdentity(bootId, stat, pid);
      return token === undefined ? { state: "inconclusive" } : { state: "present", token };
    } catch (error) {
      return error instanceof Error && "code" in error && error.code === "ENOENT"
        ? { state: "absent" }
        : { state: "inconclusive" };
    }
  }
  if (process.platform === "darwin") {
    try {
      const { stdout } = await execFileAsync("/bin/ps", ["-p", String(pid), "-o", "lstart="], {
        env: { LC_ALL: "C" },
        timeout: 1_000,
      });
      const token = parseDarwinIdentity(stdout);
      return token === undefined ? { state: "inconclusive" } : { state: "present", token };
    } catch (error) {
      const candidate = error as { code?: number | string; stdout?: string };
      return candidate.code === 1 && (candidate.stdout ?? "").trim() === ""
        ? { state: "absent" }
        : { state: "inconclusive" };
    }
  }
  return { state: "inconclusive" };
}

export async function currentProcessIdentity(): Promise<string | undefined> {
  const observed = await observeProcess(process.pid);
  return observed.state === "present" ? observed.token : undefined;
}
