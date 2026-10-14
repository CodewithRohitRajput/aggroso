import { randomBytes } from "node:crypto";
import { Severity, TriageInput, TriageReport } from "./types";

const criticalSignals = ["smoke", "smoking", "fire", "flames?", "sparks?", "sparking", "electric shock", "shocked", "injury", "injured", "burst", "leak", "leaking", "gas smell"];
const highSignals = ["overheating", "overheat", "overheated", "loud bang", "vibration", "vibrating", "pressure", "jam", "jammed", "oil", "grinding", "burning smell"];
const mediumSignals = ["noise", "noisy", "slow", "quality", "squeak", "squeaking", "rattle", "rattling", "intermittent"];

function includesSignal(text: string, signals: string[]) {
  return signals.some((signal) => new RegExp(`\\b${signal}\\b`).test(text));
}

export function classifySeverity(description: string): Severity {
  const normalized = description.toLowerCase();
  if (includesSignal(normalized, criticalSignals)) return "Critical";
  if (includesSignal(normalized, highSignals)) return "High";
  if (includesSignal(normalized, mediumSignals)) return "Medium";
  return "Low";
}

export function createReportId(now = new Date()) {
  return `TR-${now.getTime().toString(36).toUpperCase()}${randomBytes(2).toString("hex").toUpperCase()}`;
}

function getCause(input: TriageInput, severity: Severity) {
  const text = input.issueDescription.toLowerCase();
  if (text.includes("vibrat") || text.includes("noise")) return "Likely imbalance, bearing wear, or a loose mounting point.";
  if (text.includes("overheat") || text.includes("temperature")) return "Likely restricted cooling, lubrication loss, or an overloaded component.";
  if (text.includes("leak") || text.includes("oil") || text.includes("pressure")) return "Likely seal degradation, a loose connection, or pressure-system wear.";
  if (text.includes("jam") || text.includes("stuck")) return "Likely material obstruction, misalignment, or a failed sensor interlock.";
  if (severity === "Critical") return "A hazardous electrical or mechanical fault is possible and requires isolation before diagnosis.";
  return "The symptom pattern is consistent with a developing component fault; inspection is needed to confirm the root cause.";
}

export function buildTriageReport(input: TriageInput, now = new Date()): TriageReport {
  const severity = classifySeverity(input.issueDescription);
  const isCritical = severity === "Critical";
  const isHigh = severity === "High";
  const actions = [
    ...(isCritical || isHigh ? ["Stop the equipment and apply lockout/tagout before anyone approaches the fault."] : ["Pause the affected cycle and notify the area lead."]),
    "Capture a photo of the fault area and check the last maintenance entry.",
    "Have a qualified technician inspect the relevant guards, connections, and wear points.",
    ...(severity === "Low" ? ["Schedule inspection during the next planned maintenance window."] : ["Escalate to the maintenance supervisor for a same-shift inspection."])
  ];
  const safetyNotes = [
    "Do not bypass guards, interlocks, or pressure relief devices.",
    ...(isCritical ? ["Keep personnel clear and contact the site emergency response lead if smoke, fire, or injury is present."] : [])
  ];
  return {
    id: createReportId(now),
    createdAt: now.toISOString(),
    input,
    severity,
    confidence: severity === "Low" ? 0.76 : severity === "Medium" ? 0.84 : 0.92,
    probableCause: getCause(input, severity),
    recommendedActions: actions,
    safetyNotes,
    estimatedDowntime: severity === "Critical" ? "Immediate shutdown" : severity === "High" ? "2–8 hours" : severity === "Medium" ? "1–3 hours" : "< 1 hour",
    status: "Pending review",
    provider: "local",
    history: [{ status: "Pending review", by: input.reporterName, at: now.toISOString() }]
  };
}
