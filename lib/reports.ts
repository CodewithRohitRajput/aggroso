import { allowedTransitions, ReviewStatus, TriageReport } from "./types";

const storageKey = "maintainai.reports";
const maxReports = 200;

export type ReviewResult = { ok: true; report: TriageReport } | { ok: false; error: string };

export function applyReview(report: TriageReport, status: ReviewStatus, reviewer: string, note = "", now = new Date()): ReviewResult {
  const name = reviewer.trim();
  const reason = note.trim();
  if (name.length < 2) return { ok: false, error: "Enter your name to record this review." };
  if (status === "Rejected" && !reason) return { ok: false, error: "Please add a note explaining why the assessment is rejected." };
  const allowed = allowedTransitions[report.status];
  if (!allowed.includes(status)) return { ok: false, error: `A report that is "${report.status}" cannot be moved to "${status}".${allowed.length ? ` Allowed: ${allowed.join(", ")}.` : ""}` };
  const at = now.toISOString();
  const history = report.history ?? [{ status: "Pending review", by: report.input.reporterName, at: report.createdAt }];
  return {
    ok: true,
    report: { ...report, status, reviewedBy: name, reviewedAt: at, history: [...history, { status, by: name, at, ...(reason ? { note: reason } : {}) }] }
  };
}

export function loadReports(): TriageReport[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
    return Array.isArray(parsed) ? parsed as TriageReport[] : [];
  } catch {
    return [];
  }
}

export function saveReports(reports: TriageReport[]) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(reports.slice(0, maxReports)));
    return true;
  } catch {
    return false;
  }
}
