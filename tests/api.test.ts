import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import * as healthRoute from "../app/api/health/route";
import * as reportRoute from "../app/api/triage/[id]/route";
import * as triageRoute from "../app/api/triage/route";

const validInput = {
  equipmentName: "Line 3 Conveyor",
  equipmentType: "Conveyor",
  location: "Bay 4",
  issueDescription: "The belt has heavy vibration at full speed",
  reporterName: "Alex"
};

function request(method: string, body?: unknown) {
  return new Request("http://localhost/api/triage", { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
}

async function read(response: Response | Promise<Response>) {
  const resolved = await response;
  return { status: resolved.status, data: await resolved.json() };
}

const create = (body: unknown) => read(triageRoute.POST(request("POST", body)));
const review = (id: string, body: unknown) => read(reportRoute.PATCH(request("PATCH", body), { params: { id } }));
const list = () => read(triageRoute.GET());

describe("triage api", () => {
  let dataDir: string;

  before(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.KV_REST_API_URL;
    delete process.env.UPSTASH_REDIS_REST_URL;
    dataDir = mkdtempSync(path.join(tmpdir(), "maintainai-"));
    process.env.DATA_FILE = path.join(dataDir, "reports.json");
  });

  after(() => {
    delete process.env.DATA_FILE;
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("reports health, the active provider, and storage", async () => {
    const { status, data } = await read(healthRoute.GET());
    assert.equal(status, 200);
    assert.equal(data.ai.provider, "local");
    assert.equal(data.storage, "file");
  });

  it("rejects invalid input with field errors", async () => {
    const { status, data } = await create({ ...validInput, issueDescription: "short" });
    assert.equal(status, 400);
    assert.ok(data.fields.issueDescription);
  });

  it("rejects malformed JSON", async () => {
    assert.equal((await create("{bad")).status, 400);
  });

  it("runs the full review lifecycle with enforced transitions", async () => {
    const created = await create(validInput);
    assert.equal(created.status, 201);
    const id = created.data.report.id;
    assert.equal(created.data.report.severity, "High");

    assert.equal((await list()).data.reports[0].id, id);

    assert.equal((await review(id, { status: "Resolved", reviewer: "Jordan" })).status, 409);

    const assigned = await review(id, { status: "In progress", reviewer: "Jordan", note: "Assigned to night shift" });
    assert.equal(assigned.status, 200);

    const resolved = await read(triageRoute.PATCH(request("PATCH", { id, status: "Resolved", reviewer: "Jordan" })));
    assert.equal(resolved.status, 200);
    assert.deepEqual(resolved.data.report.history.map((event: { status: string }) => event.status), ["Pending review", "In progress", "Resolved"]);
    assert.equal(resolved.data.report.history[1].note, "Assigned to night shift");

    const fetched = await read(reportRoute.GET(request("GET"), { params: { id } }));
    assert.equal(fetched.data.report.status, "Resolved");
  });

  it("requires a reason to reject", async () => {
    const id = (await create(validInput)).data.report.id;
    assert.equal((await review(id, { status: "Rejected", reviewer: "Jordan" })).status, 400);
    assert.equal((await review(id, { status: "Rejected", reviewer: "Jordan", note: "Duplicate of earlier report" })).status, 200);
  });

  it("keeps every report when many are created at once", async () => {
    const before = (await list()).data.reports.length;
    const results = await Promise.all(Array.from({ length: 10 }, () => create(validInput)));
    assert.equal(new Set(results.map((result) => result.data.report.id)).size, 10);
    assert.equal((await list()).data.reports.length, before + 10);
  });

  it("returns 404 for unknown reports", async () => {
    assert.equal((await read(reportRoute.GET(request("GET"), { params: { id: "TR-NOPE" } }))).status, 404);
    assert.equal((await review("TR-NOPE", { status: "Approved", reviewer: "Jordan" })).status, 404);
  });
});
