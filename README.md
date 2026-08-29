# VenderCRM

Multi-tenant sales CRM. `plan.md` is the build plan for this (Swedish) edition;
`docs/VENDERCRM-PLAN.md` is the inherited architecture spec it builds on and is
what the `PLAN.md §…` citations in the source refer to.

## Getting started

```bash
cp .env.example .env   # fill in DATABASE_URL, APP_ENCRYPTION_KEY, CRON_SECRET
npm install
npm run db:migrate
npm run dev
```

The job queue worker starts in-process automatically (via
`src/instrumentation.ts`). To run it standalone: `npm run worker`.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js app |
| `npm run lint` / `typecheck` / `test` | CI checks |
| `npm run db:generate` | Generate a Drizzle migration from schema changes |
| `npm run db:migrate` | Apply migrations |
| `npm run db:studio` | Drizzle Studio |
| `npm run worker` | Run the job queue worker as a standalone process |

## Deploy on Vercel

Not applicable — this project targets Hostinger managed Node.js hosting per
`docs/VENDERCRM-PLAN.md` §2.1.
