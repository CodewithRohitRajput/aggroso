import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { assessIssue, buildGeminiTriageReport, enforceSafety, parseJson } from "../lib/gemini";
import { TriageInput } from "../lib/types";

const input: TriageInput = {
  equipmentName: "Press 2",
  equipmentType: "Hydraulic press",
  location: "Bay 1",
  issueDescription: "Visible smoke near the hydraulic pump after startup",
  reporterName: "Sam"
};

const geminiBody = {
  severity: "Low",
  confidence: 0.6,
  probableCause: "Possible pump seal wear.",
  recommendedActions: ["Isolate the press", "Inspect the pump", "Check fluid level"],
  safetyNotes: ["Apply lockout/tagout before inspection."],
  estimatedDowntime: "2 hours"
};

function mockFetch(response: () => Promise<Response>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return response();
  }) as typeof fetch;
  return calls;
}

describe("gemini integration", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.GEMINI_API_KEY;
  });

  it("parses JSON wrapped in markdown fences", () => {
    assert.deepEqual(parseJson("```json\n{\"a\":1}\n```"), { a: 1 });
    assert.throws(() => parseJson("no json here"));
  });

  it("raises severity to the local hazard floor and adds the guard note", () => {
    const result = enforceSafety(geminiBody as Parameters<typeof enforceSafety>[0], input);
    assert.equal(result.severity, "Critical");
    assert.equal(result.safetyNotes[0], "Do not bypass guards, interlocks, or pressure relief devices.");
  });

  it("sends the key in a header and marks the report as gemini", async () => {
    const calls = mockFetch(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(geminiBody) }] } }] }), { status: 200 }));
    const report = await buildGeminiTriageReport(input);
    assert.equal(report.provider, "gemini");
    assert.equal(report.severity, "Critical");
    assert.equal(report.status, "Pending review");
    assert.ok(!calls[0].url.includes("test-key"));
    assert.equal((calls[0].init?.headers as Record<string, string>)["x-goog-api-key"], "test-key");
  });

  it("falls back to the local engine when gemini fails", async () => {
    mockFetch(async () => new Response("quota exceeded", { status: 429 }));
    const report = await assessIssue(input);
    assert.equal(report.provider, "local");
    assert.match(report.providerNote ?? "", /local safety rules engine/);
    assert.equal(report.severity, "Critical");
  });

  it("falls back when gemini returns an invalid shape", async () => {
    mockFetch(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{\"severity\":\"Unknown\"}" }] } }] }), { status: 200 }));
    const report = await assessIssue(input);
    assert.equal(report.provider, "local");
  });
});
