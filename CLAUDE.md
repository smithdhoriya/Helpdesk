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
- **Testing**: Vitest + React Testing Library (component tests), Playwright (E2E)
- **Validation**: Zod, on both client and server (see Key Conventions)

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

## Testing
- **E2E**: Playwright tests in `/e2e`. Use the `e2e-test-writer` subagent (`.claude/agents/e2e-test-writer.md`) for writing, updating, or debugging these — it knows the project's test DB (`helpdesk_test`), isolated ports, and locator/test-design conventions. Don't hand-write E2E tests directly; delegate to it.
- **Component tests**: Vitest + React Testing Library, colocated with the component/page as `<Name>.test.tsx` (e.g. `client/src/pages/Users.test.tsx`). Write these directly — no subagent.
  - Config lives in `client/vitest.config.ts` (jsdom environment, `@` alias matching Vite's) with a setup file at `client/src/test/setup.ts` (registers `@testing-library/jest-dom` matchers and calls RTL's `cleanup()` after each test).
  - Use `renderWithQuery` (`client/src/test/render.tsx`) to render any component that uses `useQuery`/`useMutation` — it wraps the component in its own `QueryClientProvider` (with `retry: false`, so failed-request tests don't retry/hang) rather than relying on the app's real `QueryClientProvider` from `main.tsx`.
  - Mock the `api` axios instance with `vi.mock("@/lib/api", () => ({ api: { get: vi.fn() } }))` instead of hitting the network, then assert on the actual states the component renders (loading skeletons, populated rows, error text) — not implementation details.
  - Compute locale-sensitive assertions (e.g. `toLocaleDateString()`) the same way the component does rather than hardcoding a formatted string, so tests don't depend on the machine's locale.
  - Commands (run from `client/`): `bun run test` (single run, CI), `bun run test:watch` (watch mode while writing tests), `bun run test:ui` (Vitest's browser UI for interactive debugging).

## Key Conventions
- Always use Context7 to fetch the latest official docs before writing code.
- Follow `implementation-plan.md` and build one phase at a time.
- Build UI with shadcn/ui components on top of Tailwind CSS; add new components via `bunx shadcn@latest add <component>` rather than hand-rolling primitives.
- For calling the backend API, use the `api` axios instance (`client/src/lib/api.ts`) with TanStack Query (`useQuery`/`useMutation`) rather than raw `fetch`/`useEffect`. `QueryClientProvider` is already set up in `client/src/main.tsx`.
- Use Zod for all data validation, client and server — don't hand-roll `typeof`/regex checks:
  - **Client forms**: define the schema with `z.object({...})`, wire it up via `useForm({ resolver: zodResolver(schema) })` (`@hookform/resolvers/zod`), and add `noValidate` to the `<form>` so the browser's native HTML5 constraint validation (e.g. `type="email"`) can't silently swallow the submit event before Zod/React Hook Form ever sees it — see `client/src/components/CreateUserDialog.tsx`.
  - **Server routes**: define the same kind of schema in the route file and validate the request body with `schema.safeParse(req.body)`, returning `400 { error: parsed.error.issues[0].message }` on failure — see `server/src/routes/users.ts`. `zod` is a direct dependency of both `client/package.json` and `server/package.json` (not just a transitive one via `better-auth`).
- Server-side, compare/assign user roles via the generated `UserRole` enum (`server/src/generated/client/enums.ts`, e.g. `UserRole.admin` / `UserRole.agent`) — never a bare `"admin"`/`"agent"` string literal (see `server/src/middleware/require-admin.ts`, `server/src/routes/users.ts`, `server/src/auth.ts`, `server/prisma/seed.ts`). Client-side there's no equivalent enum to import (it can't reach across to the server package, same reason `auth-client.ts` redeclares the `role` field schema) — the `"admin" | "agent"` union type is the client's source of truth for role literals.
- Write clean, modular code — no unnecessary abstractions.
- Do not change the locked tech stack without explicit approval.
