# Helpdesk - AI-Powered Ticket Management System

## Project Overview
A ticket management system that uses AI to classify support emails, summarize
tickets, and suggest replies — reducing manual work for support agents.

## Tech Stack
- **Frontend**: React + TypeScript, Tailwind CSS, shadcn/ui, React Router, axios + TanStack Query for data fetching
- **Backend**: Node.js + Express + TypeScript (Bun runtime)
- **Database**: PostgreSQL + Prisma
- **AI**: Claude API (Anthropic)
- **Authentication**: Better Auth, email/password with database-backed sessions (via Prisma)

## Authentication
- Better Auth (`server/src/auth.ts`) with the Prisma adapter (`postgresql`), mounted at `/api/auth/*` via `toNodeHandler` — mounted before `express.json()` so Better Auth's own body parsing isn't interfered with.
- Email/password only; sign-up is disabled (`disableSignUp: true`). New users are provisioned only via `bun run db:seed` (`server/prisma/seed.ts`), which reads `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` from the environment.
- Users have a `role` field (`UserRole` enum: `admin` / `agent`), defaulting to `agent`.
- `requireAuth` middleware (`server/src/middleware/require-auth.ts`) validates the session server-side and attaches `req.user` / `req.session`; use it on any route that needs auth.
- CORS is locked to `TRUSTED_ORIGIN` (server) / `http://localhost:5173` with `credentials: true`, since Better Auth relies on cookies.
- Rate limiting on `/api/auth/*` (`rateLimit.enabled: process.env.NODE_ENV === "production"` in `auth.ts`) is explicitly tied to `NODE_ENV` so it's off in local dev but on in production — deployment must set `NODE_ENV=production` for it to take effect.
- Client: `authClient` (`client/src/lib/auth-client.ts`, `better-auth/react`) points at the API `baseURL` and registers the `inferAdditionalFields` plugin (with an explicit `role` schema, since `client/` can't import the server's `auth` export across packages) so `session.user.role` is typed as `"admin" | "agent"`. `ProtectedRoute` (`client/src/components/ProtectedRoute.tsx`) gates routes on `authClient.useSession()`, redirecting to `/login` when there's no session. `AdminRoute` (`client/src/components/AdminRoute.tsx`) additionally redirects to `/` when `session.user.role !== "admin"` — nest routes under it for admin-only pages (e.g. `/users` in `client/src/App.tsx`). `NavBar` conditionally shows admin-only links based on `session.user.role`.
- Required env vars are documented in `server/.env.example` (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `TRUSTED_ORIGIN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`).

## Project Structure
```
/client   # React frontend
/server   # Express API
/e2e      # Playwright E2E tests
```

## Development
```sh
# Frontend
cd client && bun run dev

# Backend
cd server && bun run dev
```

## Deployment
Both apps are containerized with Docker and deployed to a cloud provider
(Railway, Fly.io, or AWS), with PostgreSQL migrations run via
`prisma migrate deploy`.

## Key Conventions
- Always use Context7 to fetch the latest official docs before writing code.
- Use the `e2e-test-writer` subagent (`.claude/agents/e2e-test-writer.md`) for writing, updating, or debugging Playwright E2E tests in `/e2e` — it knows the project's test DB (`helpdesk_test`), isolated ports, and locator/test-design conventions. Don't hand-write E2E tests directly; delegate to it.
- Follow `implementation-plan.md` and build one phase at a time.
- Build UI with shadcn/ui components on top of Tailwind CSS; add new components via `bunx shadcn@latest add <component>` rather than hand-rolling primitives.
- For calling the backend API, use the `api` axios instance (`client/src/lib/api.ts`) with TanStack Query (`useQuery`/`useMutation`) rather than raw `fetch`/`useEffect`. `QueryClientProvider` is already set up in `client/src/main.tsx`.
- Write clean, modular code — no unnecessary abstractions.
- Do not change the locked tech stack without explicit approval.
