import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTriageReport, classifySeverity } from "../lib/triage";

describe("equipment triage engine", () => {
  it("escalates immediate hazards to critical", () => {
    assert.equal(classifySeverity("Smoke and sparks are coming from the motor"), "Critical");
  });
  it("recognizes developing mechanical faults", () => {
    assert.equal(classifySeverity("The conveyor has excessive vibration and a loud noise"), "High");
  });
  it("matches whole words only", () => {
    assert.equal(classifySeverity("Engine misfired once during the cold start"), "Low");
    assert.equal(classifySeverity("Operator noticed a small fire near the panel"), "Critical");
  });
  it("creates a reviewable report with a safety gate", () => {
    const report = buildTriageReport({
      equipmentName: "Line 3 Conveyor",
      equipmentType: "Conveyor",
      location: "Bay 4",
      issueDescription: "The belt is making a strange noise",
      reporterName: "Alex"
    }, new Date("2026-01-01T00:00:00.000Z"));
    assert.equal(report.status, "Pending review");
    assert.match(report.id, /^TR-[A-Z0-9]+$/);
    assert.ok(report.recommendedActions.length >= 3);
    assert.ok(report.safetyNotes.length >= 1);
    assert.equal(report.provider, "local");
    assert.equal(report.history?.[0].status, "Pending review");
  });
});
