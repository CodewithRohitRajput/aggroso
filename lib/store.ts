import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { allowedTransitions, ReviewStatus, TriageReport } from "./types";

const maxReports = 200;
const hashKey = "maintainai:reports";
const indexKey = "maintainai:report-index";
let writeQueue: Promise<unknown> = Promise.resolve();

export type StorageKind = "redis" | "file" | "temporary";

function redisConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

export function getStorageKind(): StorageKind {
  if (redisConfig()) return "redis";
  return process.env.VERCEL && !process.env.DATA_FILE ? "temporary" : "file";
}

async function redis<T>(commands: (string | number)[][]): Promise<T[]> {
  const config = redisConfig();
  if (!config) throw new Error("Redis is not configured.");
  const response = await fetch(`${config.url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Redis request failed (${response.status}): ${(await response.text()).slice(0, 200)}`);
  const results = await response.json() as Array<{ result?: T; error?: string }>;
  const failed = results.find((item) => item.error);
  if (failed) throw new Error(`Redis command failed: ${failed.error}`);
  return results.map((item) => item.result as T);
}

function getDataPath() {
  if (process.env.DATA_FILE) return path.resolve(process.env.DATA_FILE);
  if (process.env.VERCEL) return path.join(tmpdir(), "triage-reports.json");
  return path.join(process.cwd(), "data", "triage-reports.json");
}

async function ensureStore() {
  const dataPath = getDataPath();
  await fs.mkdir(path.dirname(dataPath), { recursive: true });
  try {
    await fs.access(dataPath);
  } catch {
    await fs.writeFile(dataPath, "[]", "utf8");
  }
}

async function readFileReports(): Promise<TriageReport[]> {
  await ensureStore();
  const content = await fs.readFile(getDataPath(), "utf8");
  return JSON.parse(content || "[]") as TriageReport[];
}

async function writeFileReports(reports: TriageReport[]) {
  const dataPath = getDataPath();
  const tempPath = `${dataPath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(reports.slice(0, maxReports), null, 2), "utf8");
  await fs.rename(tempPath, dataPath);
}

function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(task, task);
  writeQueue = run.catch(() => undefined);
  return run;
}

export async function listReports(): Promise<TriageReport[]> {
  if (!redisConfig()) return readFileReports();
  const [ids] = await redis<string[]>([["ZRANGE", indexKey, 0, maxReports - 1, "REV"]]);
  if (!ids.length) return [];
  const [values] = await redis<(string | null)[]>([["HMGET", hashKey, ...ids]]);
  return values.filter((value): value is string => Boolean(value)).map((value) => JSON.parse(value) as TriageReport);
}

export async function getReport(id: string) {
  if (!redisConfig()) return (await readFileReports()).find((item) => item.id === id) ?? null;
  const [value] = await redis<string | null>([["HGET", hashKey, id]]);
  return value ? JSON.parse(value) as TriageReport : null;
}

export async function saveReport(report: TriageReport) {
  if (redisConfig()) {
    await redis([["HSET", hashKey, report.id, JSON.stringify(report)], ["ZADD", indexKey, Date.parse(report.createdAt), report.id]]);
    const [stale] = await redis<string[]>([["ZRANGE", indexKey, 0, -(maxReports + 1)]]);
    if (stale.length) await redis([["HDEL", hashKey, ...stale], ["ZREM", indexKey, ...stale]]);
    return report;
  }
  return serialized(async () => {
    const reports = await readFileReports();
    reports.unshift(report);
    await writeFileReports(reports);
    return report;
  });
}

export type UpdateResult = { ok: true; report: TriageReport } | { ok: false; reason: "not-found" } | { ok: false; reason: "invalid-transition"; current: TriageReport };

function applyStatus(report: TriageReport, status: ReviewStatus, reviewer: string, note?: string): UpdateResult {
  if (!allowedTransitions[report.status].includes(status)) return { ok: false, reason: "invalid-transition", current: report };
  const at = new Date().toISOString();
  const history = report.history ?? [{ status: "Pending review", by: report.input.reporterName, at: report.createdAt }];
  report.status = status;
  report.reviewedBy = reviewer;
  report.reviewedAt = at;
  report.history = [...history, { status, by: reviewer, at, ...(note ? { note } : {}) }];
  return { ok: true, report };
}

export async function updateReportStatus(id: string, status: ReviewStatus, reviewer: string, note?: string): Promise<UpdateResult> {
  if (redisConfig()) {
    const report = await getReport(id);
    if (!report) return { ok: false, reason: "not-found" };
    const result = applyStatus(report, status, reviewer, note);
    if (result.ok) await redis([["HSET", hashKey, id, JSON.stringify(result.report)]]);
    return result;
  }
  return serialized(async (): Promise<UpdateResult> => {
    const reports = await readFileReports();
    const report = reports.find((item) => item.id === id);
    if (!report) return { ok: false, reason: "not-found" };
    const result = applyStatus(report, status, reviewer, note);
    if (result.ok) await writeFileReports(reports);
    return result;
  });
}
