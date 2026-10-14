import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyReview } from "../lib/reports";
import { buildTriageReport } from "../lib/triage";

const report = buildTriageReport({
  equipmentName: "Line 3 Conveyor",
  equipmentType: "Conveyor",
  location: "Bay 4",
  issueDescription: "The belt has heavy vibration at full speed",
  reporterName: "Alex"
});

describe("review workflow", () => {
  it("runs the full lifecycle with enforced transitions", () => {
    const early = applyReview(report, "Resolved", "Jordan");
    assert.equal(early.ok, false);

    const assigned = applyReview(report, "In progress", "Jordan", "Assigned to night shift");
    assert.ok(assigned.ok);
    const resolved = applyReview(assigned.report, "Resolved", "Jordan");
    assert.ok(resolved.ok);
    assert.deepEqual(resolved.report.history?.map((event) => event.status), ["Pending review", "In progress", "Resolved"]);
    assert.equal(resolved.report.history?.[1].note, "Assigned to night shift");
    assert.equal(resolved.report.reviewedBy, "Jordan");
    assert.equal(report.status, "Pending review");
  });

  it("requires a reviewer name", () => {
    assert.equal(applyReview(report, "Approved", " ").ok, false);
  });

  it("requires a reason to reject", () => {
    assert.equal(applyReview(report, "Rejected", "Jordan").ok, false);
    assert.equal(applyReview(report, "Rejected", "Jordan", "Duplicate of earlier report").ok, true);
  });

  it("blocks changes to closed reports", () => {
    const rejected = applyReview(report, "Rejected", "Jordan", "Duplicate");
    assert.ok(rejected.ok);
    const reopened = applyReview(rejected.report, "Approved", "Jordan");
    assert.equal(reopened.ok, false);
    if (!reopened.ok) assert.match(reopened.error, /cannot be moved/);
  });
});
