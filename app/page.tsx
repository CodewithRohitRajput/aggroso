"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { applyReview, loadReports, saveReports } from "@/lib/reports";
import { allowedTransitions, equipmentTypes, HealthResponse, reportStatuses, ReviewStatus, Severity, TriageInput, TriageReport } from "@/lib/types";

const initialForm: TriageInput = {
  equipmentName: "",
  equipmentType: "Conveyor",
  location: "",
  issueDescription: "",
  operatingSince: "",
  reporterName: ""
};

const severities: Severity[] = ["Critical", "High", "Medium", "Low"];
const reviewerKey = "maintainai.reviewer";
const pageSize = 8;

const actionLabels: Record<ReviewStatus, string> = {
  Approved: "Approve plan ✓",
  "In progress": "Assign to maintenance",
  Resolved: "Mark resolved ✓",
  Rejected: "Reject"
};

type FieldErrors = Partial<Record<keyof TriageInput, string[]>>;

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(date));
}

function statusClass(status: string) {
  return `status ${status.toLowerCase().replace(/\s+/g, "-")}`;
}

function readStoredReviewer() {
  try {
    return window.localStorage.getItem(reviewerKey) || "";
  } catch {
    return "";
  }
}

function storeReviewer(name: string) {
  try {
    window.localStorage.setItem(reviewerKey, name);
  } catch {
    return;
  }
}

export default function Home() {
  const [form, setForm] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [reports, setReports] = useState<TriageReport[]>([]);
  const [selected, setSelected] = useState<TriageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success" | "warning"; text: string } | null>(null);
  const [severityFilter, setSeverityFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [health, setHealth] = useState<HealthResponse | "offline" | null>(null);

  useEffect(() => {
    setReports(loadReports());
    setLoading(false);
    fetch("/api/health").then((response) => response.ok ? response.json() : null).then((data) => setHealth(data ?? "offline")).catch(() => setHealth("offline"));
  }, []);

  const stats = useMemo(() => ({
    total: reports.length,
    open: reports.filter((report) => report.status === "Pending review").length,
    urgent: reports.filter((report) => (report.severity === "Critical" || report.severity === "High") && report.status !== "Resolved" && report.status !== "Rejected").length,
    inProgress: reports.filter((report) => report.status === "In progress" || report.status === "Approved").length,
    resolved: reports.filter((report) => report.status === "Resolved").length
  }), [reports]);

  const filteredReports = useMemo(() => {
    const query = search.trim().toLowerCase();
    return reports.filter((report) => {
      if (severityFilter !== "All" && report.severity !== severityFilter) return false;
      if (statusFilter !== "All" && report.status !== statusFilter) return false;
      if (!query) return true;
      return [report.id, report.input.equipmentName, report.input.location, report.input.reporterName, report.input.issueDescription].some((value) => value.toLowerCase().includes(query));
    });
  }, [reports, severityFilter, statusFilter, search]);
  const visibleReports = showAll ? filteredReports : filteredReports.slice(0, pageSize);

  function commit(next: TriageReport[]) {
    setReports(next);
    if (!saveReports(next)) setMessage({ type: "warning", text: "This browser blocked saving, so reports will be lost when you leave the page." });
  }

  function updateField(field: keyof TriageInput, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setFieldErrors({});
    try {
      const response = await fetch("/api/triage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) {
        if (data.fields) setFieldErrors(data.fields);
        throw new Error(data.error || "Unable to submit report.");
      }
      const report: TriageReport = data.report;
      commit([report, ...reports]);
      setSelected(report);
      setForm(initialForm);
      setMessage(report.providerNote
        ? { type: "warning", text: `Triage complete using the backup rules engine. ${report.providerNote}` }
        : { type: "success", text: "Triage complete. Review the recommendation before taking action." });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Unable to submit report." });
    } finally {
      setSubmitting(false);
    }
  }

  async function review(status: ReviewStatus, reviewer: string, note: string) {
    if (!selected) return false;
    const result = applyReview(selected, status, reviewer, note);
    if (!result.ok) {
      setMessage({ type: "error", text: result.error });
      return false;
    }
    storeReviewer(reviewer);
    commit(reports.map((report) => report.id === result.report.id ? result.report : report));
    setSelected(result.report);
    setMessage({ type: "success", text: `Report ${result.report.id} marked ${status.toLowerCase()}.` });
    return true;
  }

  function fieldError(field: keyof TriageInput) {
    const error = fieldErrors[field]?.[0];
    return error ? <span className="field-error">{error}</span> : null;
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">M</span><span>maintain<span className="brand-accent">ai</span></span></div>
        <div className="topbar-meta">
          <span className={`live-dot ${health === "offline" ? "offline" : ""}`} />
          {health === null ? "Connecting..." : health === "offline" ? "Server offline" : health.ai.provider === "gemini" ? `Gemini · ${health.ai.model}` : "Local rules engine"}
          <span className="avatar">OP</span>
        </div>
      </header>
      <section className="hero">
        <div><p className="eyebrow">OPERATIONS / MAINTENANCE</p><h1>Catch the fault<br /><em>before it catches you.</em></h1><p className="hero-copy">Turn equipment symptoms into a clear, reviewable action plan in seconds. AI-assisted, human-approved.</p></div>
        <div className="hero-art"><div className="ring ring-one" /><div className="ring ring-two" /><div className="hero-badge">AI<br /><small>ASSISTED</small></div></div>
      </section>
      <section className="stats-row">
        <div className="stat"><span>Total reports</span><strong>{stats.total}</strong></div>
        <div className="stat"><span>Awaiting review</span><strong>{stats.open}</strong></div>
        <div className="stat urgent"><span>Open high-risk</span><strong>{stats.urgent}</strong></div>
        <div className="stat"><span>Active work</span><strong>{stats.inProgress}</strong></div>
        <div className="stat done"><span>Resolved</span><strong>{stats.resolved}</strong></div>
      </section>
      <div className="content-grid">
        <section className="panel intake-panel">
          <div className="panel-heading"><div><p className="eyebrow">NEW WORK ORDER</p><h2>Describe the issue</h2></div><span className="step-count">01 <span>/ 02</span></span></div>
          <p className="muted">Give the agent enough context to make a useful first assessment.</p>
          <form onSubmit={submit} noValidate>
            <div className="field-row">
              <label>Equipment name<input required value={form.equipmentName} onChange={(e) => updateField("equipmentName", e.target.value)} placeholder="e.g. Line 3 Conveyor" className={fieldErrors.equipmentName ? "invalid" : ""} />{fieldError("equipmentName")}</label>
              <label>Equipment type<select value={form.equipmentType} onChange={(e) => updateField("equipmentType", e.target.value)}>{equipmentTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
            </div>
            <div className="field-row">
              <label>Location<input required value={form.location} onChange={(e) => updateField("location", e.target.value)} placeholder="e.g. North plant · Bay 4" className={fieldErrors.location ? "invalid" : ""} />{fieldError("location")}</label>
              <label>Operating since <span className="optional">optional</span><input value={form.operatingSince} onChange={(e) => updateField("operatingSince", e.target.value)} placeholder="e.g. 2019 / last overhaul" /></label>
            </div>
            <label>What happened? <span className="optional">{form.issueDescription.length}/2000</span><textarea required minLength={10} maxLength={2000} value={form.issueDescription} onChange={(e) => updateField("issueDescription", e.target.value)} placeholder="Describe sounds, smells, visible damage, alarms, or changes in performance..." rows={5} className={fieldErrors.issueDescription ? "invalid" : ""} />{fieldError("issueDescription")}</label>
            <label>Reported by<input required value={form.reporterName} onChange={(e) => updateField("reporterName", e.target.value)} placeholder="Your name" className={fieldErrors.reporterName ? "invalid" : ""} />{fieldError("reporterName")}</label>
            <button className="primary-button" disabled={submitting}>{submitting ? <><span className="spinner" /> Analyzing signals...</> : <>Run AI triage <span>→</span></>}</button>
          </form>
          {message && <div className={`message ${message.type}`} role="status">{message.text}</div>}
          <div className="trust-note"><span>✦</span><div><strong>Human review is always required</strong><br />AI recommendations are suggestions, not work authorization.</div></div>
        </section>
        <section className="panel result-panel">
          {!selected ? <div className="empty-state"><div className="empty-icon">✦</div><h2>Your assessment will appear here</h2><p>Submit an equipment issue, or pick one from the activity log, to see severity, likely cause, and the safest next steps.</p></div> : <ReportView key={selected.id} report={selected} onReview={review} />}
        </section>
      </div>
      <section className="history-section">
        <div className="section-heading">
          <div><p className="eyebrow">ACTIVITY LOG</p><h2>Triage reports</h2></div>
          <div className="filters">{["All", ...severities].map((item) => <button className={severityFilter === item ? "active" : ""} key={item} onClick={() => setSeverityFilter(item)}>{item}</button>)}</div>
        </div>
        <div className="toolbar">
          <input className="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search equipment, location, reporter, or ID..." />
          <select className="status-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="All">All statuses</option>{reportStatuses.map((status) => <option key={status}>{status}</option>)}</select>
        </div>
        {loading ? <div className="loading-row"><span className="spinner dark" /> Loading reports...</div> : filteredReports.length === 0 ? <div className="empty-table">{reports.length === 0 ? "No reports yet. Your submitted triage reports will appear here." : "No reports match these filters."}</div> : <>
          <div className="report-table">
            <div className="table-head"><span>Equipment</span><span>Risk</span><span>Location</span><span>Created</span><span>Status</span></div>
            {visibleReports.map((report) => <button className={`table-row ${selected?.id === report.id ? "selected" : ""}`} key={report.id} onClick={() => setSelected(report)}><strong>{report.input.equipmentName}<small>{report.input.equipmentType} · {report.id}</small></strong><span><b className={`severity-dot ${report.severity.toLowerCase()}`} />{report.severity}</span><span>{report.input.location}</span><span>{formatDate(report.createdAt)}</span><span className={statusClass(report.status)}>{report.status}</span></button>)}
          </div>
          {filteredReports.length > pageSize && <button className="show-more" onClick={() => setShowAll((current) => !current)}>{showAll ? "Show fewer" : `Show all ${filteredReports.length} reports`}</button>}
        </>}
      </section>
      <footer><span>maintainai</span> · AI-assisted maintenance triage · v1.1 <span>Reports are saved in this browser only</span></footer>
    </main>
  );
}

function ReportView({ report, onReview }: { report: TriageReport; onReview: (status: ReviewStatus, reviewer: string, note: string) => Promise<boolean> }) {
  const [reviewer, setReviewer] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<ReviewStatus | null>(null);
  const [localError, setLocalError] = useState("");
  const actions = allowedTransitions[report.status];
  const history = report.history ?? [{ status: "Pending review" as const, by: report.input.reporterName, at: report.createdAt }];

  useEffect(() => {
    setReviewer(readStoredReviewer());
  }, []);

  async function act(status: ReviewStatus) {
    if (reviewer.trim().length < 2) {
      setLocalError("Enter your name to record this review.");
      return;
    }
    if (status === "Rejected" && !note.trim()) {
      setLocalError("Add a note explaining why you are rejecting this assessment.");
      return;
    }
    setLocalError("");
    setBusy(status);
    const ok = await onReview(status, reviewer.trim(), note.trim());
    setBusy(null);
    if (ok) setNote("");
  }

  return (
    <div className="report-view">
      <div className="report-top">
        <div><p className="eyebrow">AI ASSESSMENT · {report.id}</p><h2>{report.input.equipmentName}</h2><p className="muted">{report.input.equipmentType} · {report.input.location} · submitted by {report.input.reporterName} · {formatDate(report.createdAt)}</p></div>
        <span className={`severity-pill ${report.severity.toLowerCase()}`}>{report.severity} risk</span>
      </div>
      <div className="provider-row">
        <span className={`provider-badge ${report.provider === "gemini" ? "gemini" : ""}`}>{report.provider === "gemini" ? "✦ Gemini assessment" : "⚙ Local rules engine"}</span>
        {report.providerNote && <span className="provider-note">{report.providerNote}</span>}
      </div>
      <details className="symptoms"><summary>Reported symptoms</summary><p>{report.input.issueDescription}</p>{report.input.operatingSince && <p className="muted">Operating since: {report.input.operatingSince}</p>}</details>
      <div className="confidence"><span>Assessment confidence</span><strong>{Math.round(report.confidence * 100)}%</strong><div className="progress"><i style={{ width: `${report.confidence * 100}%` }} /></div></div>
      <div className="cause-box"><span className="mini-label">PROBABLE CAUSE</span><p>{report.probableCause}</p></div>
      <div className="recommendations"><span className="mini-label">RECOMMENDED NEXT STEPS</span>{report.recommendedActions.map((action, index) => <div className="recommendation" key={`${index}-${action}`}><span>{String(index + 1).padStart(2, "0")}</span>{action}</div>)}</div>
      <div className="safety-box"><strong>⚠ Safety gate</strong>{report.safetyNotes.map((note, index) => <p key={`${index}-${note}`}>{note}</p>)}</div>
      <div className="report-footer"><span>Estimated downtime: <strong>{report.estimatedDowntime}</strong></span><span className={statusClass(report.status)}>{report.status}</span></div>
      {actions.length > 0 && <div className="review-box">
        <span className="mini-label">HUMAN REVIEW · STEP 02</span>
        <div className="field-row">
          <label>Reviewer name<input value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="Your name" /></label>
          <label>Note <span className="optional">{actions.includes("Rejected") ? "required to reject" : "optional"}</span><input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Assigned to night shift" /></label>
        </div>
        {localError && <span className="field-error">{localError}</span>}
        <div className="review-actions">{actions.map((status) => <button key={status} disabled={busy !== null} className={status === "Rejected" ? "reject-button" : status === "In progress" ? "secondary-button" : "approve-button"} onClick={() => act(status)}>{busy === status ? "Saving..." : actionLabels[status]}</button>)}</div>
      </div>}
      <div className="timeline">
        <span className="mini-label">AUDIT TRAIL</span>
        {history.map((event, index) => <div className="timeline-item" key={`${event.at}-${index}`}><b className={statusClass(event.status)}>●</b><div><strong>{event.status}</strong> · {event.by} <small>{formatDate(event.at)}</small>{event.note && <p>“{event.note}”</p>}</div></div>)}
      </div>
    </div>
  );
}
