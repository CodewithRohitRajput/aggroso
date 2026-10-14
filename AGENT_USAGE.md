# Agent usage

The application was implemented as a direct vertical slice, first as a Next.js client with an Express server, then merged into a single Next.js app (API route handlers) so it deploys to Vercel as one project. Server-side storage was then removed: reports and reviews are kept in the browser's localStorage, and the API only runs triage. No external delegated agents were used.

Representative implementation prompt: build an equipment maintenance triage workflow with a usable frontend, Node backend, persistence, human approval, validation, logs, and focused tests.

Gemini was added as a server-side REST integration. If Gemini fails, the API falls back to the local engine instead of returning an error, and each report records which provider produced it. The API key is intentionally represented only by `.env.example`; no real credential is stored. Gemini responses are validated with Zod, and dangerous low-severity output is raised to the locally detected minimum severity.

Verification performed:

- `npm test`: 18 tests passed (triage engine, Gemini integration with mocked fetch, API route handlers, review workflow).
- `npm run build` and `tsc --noEmit` passed.
