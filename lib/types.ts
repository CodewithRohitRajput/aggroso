export const equipmentTypes = [
  "Conveyor",
  "Hydraulic press",
  "CNC machine",
  "Compressor",
  "Packaging line",
  "Other"
] as const;

export const reportStatuses = ["Pending review", "Approved", "In progress", "Resolved", "Rejected"] as const;

export type EquipmentType = (typeof equipmentTypes)[number];
export type Severity = "Critical" | "High" | "Medium" | "Low";
export type ReportStatus = (typeof reportStatuses)[number];
export type ReviewStatus = Exclude<ReportStatus, "Pending review">;
export type AssessmentProvider = "gemini" | "local";

export const allowedTransitions: Record<ReportStatus, ReviewStatus[]> = {
  "Pending review": ["Approved", "In progress", "Rejected"],
  Approved: ["In progress", "Resolved"],
  "In progress": ["Resolved"],
  Resolved: [],
  Rejected: []
};

export interface TriageInput {
  equipmentName: string;
  equipmentType: EquipmentType;
  location: string;
  issueDescription: string;
  operatingSince?: string;
  reporterName: string;
}

export interface StatusEvent {
  status: ReportStatus;
  by: string;
  at: string;
  note?: string;
}

export interface TriageReport {
  id: string;
  createdAt: string;
  input: TriageInput;
  severity: Severity;
  confidence: number;
  probableCause: string;
  recommendedActions: string[];
  safetyNotes: string[];
  estimatedDowntime: string;
  status: ReportStatus;
  provider?: AssessmentProvider;
  providerNote?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  history?: StatusEvent[];
}

export interface HealthResponse {
  status: string;
  ai: { provider: AssessmentProvider; model?: string };
}
