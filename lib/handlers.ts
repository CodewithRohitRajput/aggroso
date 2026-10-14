import { z } from "zod";
import { assessIssue, getGeminiModel, isGeminiConfigured } from "./gemini";
import { equipmentTypes } from "./types";

const maxBodyBytes = 100 * 1024;

const inputSchema = z.object({
  equipmentName: z.string().trim().min(2, "Equipment name is required").max(100),
  equipmentType: z.enum(equipmentTypes),
  location: z.string().trim().min(2, "Location is required").max(100),
  issueDescription: z.string().trim().min(10, "Describe the issue in at least 10 characters").max(2000),
  operatingSince: z.string().trim().max(50).optional(),
  reporterName: z.string().trim().min(2, "Your name is required").max(100)
});

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export function health() {
  return json({ status: "ok", ai: isGeminiConfigured() ? { provider: "gemini", model: getGeminiModel() } : { provider: "local" } });
}

export async function createTriage(request: Request) {
  const text = await request.text();
  if (Buffer.byteLength(text) > maxBodyBytes) return json({ error: "Request body is too large." }, 413);
  let body: unknown;
  try {
    body = JSON.parse(text || "{}");
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }
  try {
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) return json({ error: "Please check the highlighted fields.", fields: parsed.error.flatten().fieldErrors }, 400);
    const report = await assessIssue(parsed.data);
    console.info("[triage][created]", JSON.stringify({ id: report.id, severity: report.severity, provider: report.provider, fallback: Boolean(report.providerNote) }));
    return json({ report }, 201);
  } catch (error) {
    console.error("[triage][POST] failed to assess report", error);
    return json({ error: "The triage assessment could not be completed. Please try again." }, 500);
  }
}
