import { z } from "zod";
import { buildTriageReport, classifySeverity } from "./triage";
import { TriageInput, TriageReport } from "./types";

const geminiResponseSchema = z.object({
  severity: z.enum(["Critical", "High", "Medium", "Low"]),
  confidence: z.number().min(0).max(1),
  probableCause: z.string().min(1).max(1000),
  recommendedActions: z.array(z.string().min(1).max(500)).min(3).max(6),
  safetyNotes: z.array(z.string().min(1).max(500)).min(1).max(5),
  estimatedDowntime: z.string().min(1).max(100)
});

const systemPrompt = `You are MaintainAI, a cautious industrial equipment maintenance triage assistant.
Analyze the operator report and return ONLY valid JSON with these exact keys:
severity ("Critical", "High", "Medium", or "Low"), confidence (number from 0 to 1),
probableCause (string), recommendedActions (array of 3 to 6 strings),
safetyNotes (array of 1 to 5 strings), estimatedDowntime (string).
Critical means immediate danger such as fire, smoke, sparks, injury, exposed live electricity,
burst pressure systems, or uncontrolled hazardous leaks. High means a likely equipment failure
requiring same-shift inspection. Never claim certainty. Always include lockout/tagout or
equivalent isolation guidance when there may be mechanical, electrical, pressure, or thermal danger.
Recommendations are advisory only and must require qualified human review.`;

export function parseJson(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("Gemini returned no JSON object.");
  return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
}

export function enforceSafety(report: z.infer<typeof geminiResponseSchema>, input: TriageInput): z.infer<typeof geminiResponseSchema> {
  const minimumSeverity = classifySeverity(input.issueDescription);
  const severityRank = { Low: 0, Medium: 1, High: 2, Critical: 3 };
  const severity = severityRank[report.severity] < severityRank[minimumSeverity] ? minimumSeverity : report.severity;
  const requiredSafety = "Do not bypass guards, interlocks, or pressure relief devices.";
  return {
    ...report,
    severity,
    safetyNotes: report.safetyNotes.includes(requiredSafety) ? report.safetyNotes : [requiredSafety, ...report.safetyNotes].slice(0, 5)
  };
}

export function isGeminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function getGeminiModel() {
  return process.env.GEMINI_MODEL || "gemini-2.5-flash";
}

export async function buildGeminiTriageReport(input: TriageInput): Promise<TriageReport> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  const model = getGeminiModel();
  const baseUrl = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${baseUrl}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: JSON.stringify({ equipment: input.equipmentName, type: input.equipmentType, location: input.location, operatingSince: input.operatingSince || null, symptoms: input.issueDescription, reporter: input.reporterName }) }] }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
      })
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Gemini request failed (${response.status}): ${detail.slice(0, 300)}`);
    }
    const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
    if (!text) throw new Error("Gemini returned an empty response.");
    const parsed = geminiResponseSchema.parse(enforceSafety(geminiResponseSchema.parse(parseJson(text)), input));
    const localBase = buildTriageReport(input);
    return {
      ...localBase,
      severity: parsed.severity,
      confidence: parsed.confidence,
      probableCause: parsed.probableCause,
      recommendedActions: parsed.recommendedActions,
      safetyNotes: parsed.safetyNotes,
      estimatedDowntime: parsed.estimatedDowntime,
      provider: "gemini"
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function assessIssue(input: TriageInput): Promise<TriageReport> {
  if (!isGeminiConfigured()) return buildTriageReport(input);
  try {
    return await buildGeminiTriageReport(input);
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError" ? "Gemini timed out" : "Gemini was unavailable";
    console.warn("[gemini] falling back to local triage engine", error instanceof Error ? error.message : error);
    return { ...buildTriageReport(input), providerNote: `${reason}; the local safety rules engine produced this assessment.` };
  }
}
