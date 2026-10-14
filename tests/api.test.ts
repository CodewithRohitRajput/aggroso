import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import * as healthRoute from "../app/api/health/route";
import * as triageRoute from "../app/api/triage/route";

const validInput = {
  equipmentName: "Line 3 Conveyor",
  equipmentType: "Conveyor",
  location: "Bay 4",
  issueDescription: "The belt has heavy vibration at full speed",
  reporterName: "Alex"
};

async function create(body: unknown) {
  const response = await triageRoute.POST(new Request("http://localhost/api/triage", { method: "POST", headers: { "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));
  return { status: response.status, data: await response.json() };
}

describe("triage api", () => {
  before(() => {
    delete process.env.GEMINI_API_KEY;
  });

  it("reports health and the active provider", async () => {
    const response = healthRoute.GET();
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ai.provider, "local");
  });

  it("rejects invalid input with field errors", async () => {
    const { status, data } = await create({ ...validInput, issueDescription: "short" });
    assert.equal(status, 400);
    assert.ok(data.fields.issueDescription);
  });

  it("rejects malformed JSON", async () => {
    assert.equal((await create("{bad")).status, 400);
  });

  it("returns a pending report without storing anything", async () => {
    const { status, data } = await create(validInput);
    assert.equal(status, 201);
    assert.equal(data.report.severity, "High");
    assert.equal(data.report.status, "Pending review");
    assert.equal(data.report.input.equipmentName, "Line 3 Conveyor");
  });

  it("gives every report a unique id", async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => create(validInput)));
    assert.equal(new Set(results.map((result) => result.data.report.id)).size, 10);
  });
});
