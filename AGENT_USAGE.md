# Agent usage

The application was implemented as a direct vertical slice, first as a Next.js client with an Express server, then merged into a single Next.js app (API route handlers) so it deploys to Vercel as one project. No external delegated agents were used.

Representative implementation prompt: build an equipment maintenance triage workflow with a usable frontend, Node backend, persistence, human approval, validation, logs, and focused tests.

Gemini was added as a server-side REST integration. If Gemini fails, the API falls back to the local engine instead of returning an error, and each report records which provider produced it. The API key is intentionally represented only by `.env.example`; no real credential is stored. Gemini responses are validated with Zod, and dangerous low-severity output is raised to the locally detected minimum severity.

Verification performed:

- `npm test`: 16 tests passed (triage engine, Gemini integration with mocked fetch, API route handlers).
- `npm run build` and `tsc --noEmit` passed.
- `next start` smoke test of `/api/health`, `/api/triage` create and list, and the unknown-endpoint 404.
- Redis store exercised against an in-memory fake of the Upstash REST pipeline (ordering, 200-report cap, review, 404).
