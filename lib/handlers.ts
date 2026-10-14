import { z } from "zod";
import { assessIssue, getGeminiModel, isGeminiConfigured } from "./gemini";
import { getReport, getStorageKind, listReports, saveReport, updateReportStatus } from "./store";
import { allowedTransitions, equipmentTypes } from "./types";

const maxBodyBytes = 100 * 1024;

const inputSchema = z.object({
  equipmentName: z.string().trim().min(2, "Equipment name is required").max(100),
  equipmentType: z.enum(equipmentTypes),
  location: z.string().trim().min(2, "Location is required").max(100),
  issueDescription: z.string().trim().min(10, "Describe the issue in at least 10 characters").max(2000),
  operatingSince: z.string().trim().max(50).optional(),
  reporterName: z.string().trim().min(2, "Your name is required").max(100)
});

const reviewSchema = z.object({
  id: z.string().min(1, "Report id is required"),
  status: z.enum(["Approved", "In progress", "Resolved", "Rejected"]),
  reviewer: z.string().trim().min(2, "Reviewer name is required").max(100),
  note: z.string().trim().max(500).optional()
});

type BodyResult = { ok: true; body: unknown } | { ok: false; response: Response };

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

async function readBody(request: Request): Promise<BodyResult> {
  const text = await request.text();
  if (Buffer.byteLength(text) > maxBodyBytes) return { ok: false, response: json({ error: "Request body is too large." }, 413) };
  if (!text) return { ok: true, body: {} };
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, response: json({ error: "Request body must be valid JSON." }, 400) };
  }
}

export function health() {
  return json({ status: "ok", ai: isGeminiConfigured() ? { provider: "gemini", model: getGeminiModel() } : { provider: "local" }, storage: getStorageKind() });
}

export async function listTriage() {
  try {
    return json({ reports: await listReports() });
  } catch (error) {
    console.error("[triage][GET] failed to load reports", error);
    return json({ error: "Unable to load triage reports." }, 500);
  }
}

export async function getTriage(id: string) {
  try {
    const report = await getReport(id);
    if (!report) return json({ error: "Report not found." }, 404);
    return json({ report });
  } catch (error) {
    console.error("[triage][GET:id] failed to load report", error);
    return json({ error: "Unable to load this report." }, 500);
  }
}

export async function createTriage(request: Request) {
  const body = await readBody(request);
  if (!body.ok) return body.response;
  try {
    const parsed = inputSchema.safeParse(body.body);
    if (!parsed.success) return json({ error: "Please check the highlighted fields.", fields: parsed.error.flatten().fieldErrors }, 400);
    const report = await saveReport(await assessIssue(parsed.data));
    console.info("[triage][created]", JSON.stringify({ id: report.id, severity: report.severity, status: report.status, provider: report.provider, fallback: Boolean(report.providerNote) }));
    return json({ report }, 201);
  } catch (error) {
    console.error("[triage][POST] failed to create report", error);
    return json({ error: "The triage assessment could not be saved. Please try again." }, 500);
  }
}

export async function reviewTriage(request: Request, id?: string) {
  const body = await readBody(request);
  if (!body.ok) return body.response;
  try {
    const source = typeof body.body === "object" && body.body !== null ? body.body : {};
    const parsed = reviewSchema.safeParse({ ...source, ...(id ? { id } : {}) });
    if (!parsed.success) return json({ error: "A report, a valid status, and a reviewer name are required.", fields: parsed.error.flatten().fieldErrors }, 400);
    const { status, reviewer, note } = parsed.data;
    if (status === "Rejected" && !note) return json({ error: "Please add a note explaining why the assessment is rejected.", fields: { note: ["A reason is required when rejecting"] } }, 400);
    const result = await updateReportStatus(parsed.data.id, status, reviewer, note || undefined);
    if (!result.ok && result.reason === "not-found") return json({ error: "Report not found." }, 404);
    if (!result.ok) {
      const current = result.current.status;
      const allowed = allowedTransitions[current];
      return json({ error: `A report that is "${current}" cannot be moved to "${status}".${allowed.length ? ` Allowed: ${allowed.join(", ")}.` : ""}` }, 409);
    }
    console.info("[triage][reviewed]", JSON.stringify({ id: result.report.id, status: result.report.status, reviewer: result.report.reviewedBy }));
    return json({ report: result.report });
  } catch (error) {
    console.error("[triage][PATCH] failed to review report", error);
    return json({ error: "Unable to update this report." }, 500);
  }
}
