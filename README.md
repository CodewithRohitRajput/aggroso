# MaintainAI

MaintainAI is an AI-assisted equipment maintenance triage app. Operators describe a machine issue, Gemini turns the symptoms into a structured assessment, and a human reviewer must approve or assign the recommendation before work proceeds.

It is a single Next.js app: the UI and the API run together, so it deploys to Vercel as one project.

## Run locally

```powershell
cd C:\Users\rohit\Desktop\aggroso
Copy-Item .env.example .env.local
# Edit .env.local and set GEMINI_API_KEY=your_key_here
npm install
npm run dev
```

Open `http://localhost:3000`.

The Gemini key is read only by the server-side API routes, sent in the `x-goog-api-key` header, and never exposed to the browser. If `GEMINI_API_KEY` is blank, the app uses the deterministic local triage engine so the demo still works. If Gemini is configured but fails (timeout, quota, invalid output), the request automatically falls back to the local engine and the report is labelled accordingly.

## Deploy to Vercel

1. Push this folder to a GitHub repository and import it in Vercel. No build settings need to change; Vercel detects Next.js.
2. In **Settings → Environment Variables**, add `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`).
3. Redeploy.

There is no database. Reports and reviews are saved in the browser's localStorage, so each browser keeps its own reports and clearing site data removes them.

## Workflow

1. An operator submits equipment, location, and symptoms.
2. Gemini (or the local engine) returns severity, confidence, probable cause, next steps, safety notes, and downtime. The server enforces a minimum severity from hazard keywords such as smoke, fire, sparks, or leaks.
3. A reviewer records their name and an optional note, then approves, assigns, or rejects (a reason is required to reject).
4. Approved or assigned work is marked resolved when complete. Every change is written to the report's audit trail.

Allowed status transitions:

| From | To |
| --- | --- |
| Pending review | Approved, In progress, Rejected |
| Approved | In progress, Resolved |
| In progress | Resolved |

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Status and active AI provider |
| POST | `/api/triage` | Run triage and return a pending report (400 with field errors on invalid input). Nothing is stored on the server. |

## Architecture

- `app/page.tsx`: the frontend.
- `app/api/**/route.ts`: Next.js route handlers for the API.
- `lib/handlers.ts`: request parsing, Zod validation, and JSON error responses.
- `lib/gemini.ts`: Gemini REST integration, strict JSON validation, safety floor enforcement, 20 s timeout, and automatic fallback to the local engine.
- `lib/triage.ts`: deterministic fallback triage engine.
- `lib/reports.ts`: review transitions and audit trail, plus localStorage persistence (newest 200 reports).

Gemini output is constrained to severity, confidence, probable cause, recommended actions, safety notes, and estimated downtime. The backend always adds a pending human-review status and enforces a minimum severity based on obvious hazard signals.

## Validate

18 tests cover the triage engine, Gemini parsing/safety floor/fallback (with a mocked `fetch`), the triage API routes, and the review workflow.

```powershell
cd C:\Users\rohit\Desktop\aggroso
npm test
npm run build
```

## Deliberate limitations

This demo has no authentication (reviewer names are self-reported), shared storage (reports live in each browser), CMMS integration, image analysis, or notifications. Add a database and authentication before production use.
