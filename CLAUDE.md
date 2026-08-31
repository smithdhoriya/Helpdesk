# Helpdesk - AI-Powered Ticket Management System

## Project Overview
A ticket management system that uses AI to classify support emails, summarize
tickets, and suggest replies — reducing manual work for support agents.

## Tech Stack
- **Frontend**: React + TypeScript, Tailwind CSS, shadcn/ui, React Router, axios + TanStack Query for data fetching
- **Backend**: Node.js + Express + TypeScript (Bun runtime)
- **Database**: PostgreSQL + Prisma
- **AI**: Ollama running a local model, via the Vercel AI SDK (`ai` + `ollama-ai-provider-v2`) — free and offline, no API key. Used for reply polishing (`server/src/lib/polish-reply.ts`), ticket summarizing (`server/src/lib/summarize-ticket.ts`), inbound-ticket classification (`server/src/lib/classify-ticket.ts`), and knowledge-base auto-resolution (`server/src/lib/auto-resolve-ticket.ts`); model and daemon URL come from `OLLAMA_MODEL` / `OLLAMA_BASE_URL`.
- **Background jobs**: pg-boss (`server/src/queue/`), a PostgreSQL-backed durable job queue that reuses `DATABASE_URL` (it manages its own `pgboss` schema — no Prisma migration). The inbound-email webhook enqueues two independent jobs per new ticket — classification and auto-resolution — instead of running the models inline; workers started in `server/src/index.ts` consume the queues off the request path, so both are durable across restarts and retried (exponential backoff) on transient model/daemon failures. Enqueue on the request path, model calls in the workers.
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
- Client: `authClient` (`client/src/lib/auth-client.ts`, `better-auth/react`) points at the API `baseURL` and registers the `inferAdditionalFields` plugin (with an explicit `role` schema built from `Object.values(UserRole)`, since `client/` can't import the server's `auth` export across packages) so `session.user.role` is typed as the client's own `UserRole` (`client/src/lib/users.ts`). `ProtectedRoute` (`client/src/components/ProtectedRoute.tsx`) gates routes on `authClient.useSession()`, redirecting to `/login` when there's no session. `AdminRoute` (`client/src/components/AdminRoute.tsx`) additionally redirects to `/` when `session.user.role !== UserRole.admin` — nest routes under it for admin-only pages (e.g. `/users` in `client/src/App.tsx`). `NavBar` conditionally shows admin-only links based on `session.user.role === UserRole.admin`.
- Required env vars are documented in `server/.env.example` (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `TRUSTED_ORIGIN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`).

## AI Auto-Resolution
- When a ticket arrives, the auto-resolve worker (`server/src/queue/auto-resolve-ticket-worker.ts`) asks the model whether the ticket can be safely answered from the support knowledge base at `server/knowledge-base.md` alone (`autoResolveTicket` in `server/src/lib/auto-resolve-ticket.ts`). The knowledge base is read via `loadKnowledgeBase()` (cached, path derived from the source file — no env var) and passed into the pure resolver, so the resolution logic stays testable without the filesystem or a model.
- The model must **withhold** (`canResolve: false`, leaving the ticket for a human) whenever the knowledge base doesn't clearly and completely answer, an escalation rule applies (legal threats, refunds outside the 30-day window, chargebacks/disputes, account-security), the ticket needs account-specific action, or it's otherwise unsure — a false negative just routes to a human, a false positive sends a wrong answer. The greeting (from the captured `senderName`, first name only) and the fixed `Code with Mosh Support` sign-off are spliced in deterministically by `frameReply`; the model never invents customer or agent names.
- On a successful resolution the worker posts the AI's answer **as a reply in the thread** and marks the ticket resolved, in a single `$transaction`. The reply carries `authorId: null` and `isAi: true` (schema: `Reply.authorId` is nullable with an `isAi` flag; the FK is `ON DELETE SET NULL`). The worker is idempotent (no-ops if the ticket is gone, already `resolvedByAi`, or no longer `open`) so a pg-boss retry can't double-post or clobber an agent's work.
- AI-resolved tickets are **hidden from the ticket list by default** (`Ticket.resolvedByAi`, default `false`). `GET /api/tickets` applies `resolvedByAi: false` unless `?resolvedByAi=true` opts into showing them (the filter is dropped entirely when opted in). Client: the "Show AI-resolved" checkbox in `TicketsFilterBar` toggles it; `ReplyThread` labels a null-author reply as "AI Assistant" with an AI badge.

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
- Default to component tests. Pure UI rendering (list rows, badges/labels, detail fields, loading/error states, client-side navigation on click) belongs in a component test, even when the feature was originally built alongside an E2E flow — see `client/src/pages/TicketDetail.test.tsx` and the trimmed `e2e/tests/inbound-email-ticket.spec.ts` for the split.
- **E2E**: Playwright tests in `/e2e`. Use the `e2e-test-writer` subagent (`.claude/agents/e2e-test-writer.md`) for writing, updating, or debugging these — it knows the project's test DB (`helpdesk_test`), isolated ports, and locator/test-design conventions. Don't hand-write E2E tests directly; delegate to it.
  - E2E tests must only cover functionality that genuinely requires a real browser and server. Never duplicate functionality already covered by unit/component tests.
  - **Valid E2E scenarios**: auth redirects, cross-page navigation, data persistence after reload, and full-stack integration flows such as webhook → data → UI.
  - **Invalid E2E scenarios**: rendering, display logic, component states, API-call verification, form validation, and error-message testing.
  - Run the suite with `bun run test:e2e` from the project root.
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
  - For single-select dropdowns, use `SelectField` (`client/src/components/SelectField.tsx`) with a flat `items={[{ value, label }]}` list and a `label` (its `aria-label`) instead of repeating the `Select`/`SelectTrigger`/`SelectValue`/`SelectContent` + `items.map` scaffolding by hand. See `client/src/pages/TicketDetail.tsx` and `client/src/components/TicketsFilterBar.tsx`. Reach for the raw `@/components/ui/select` primitives only when a dropdown needs custom item rendering the flat list can't express.
- For calling the backend API, use the `api` axios instance (`client/src/lib/api.ts`) with TanStack Query (`useQuery`/`useMutation`) rather than raw `fetch`/`useEffect`. `QueryClientProvider` is already set up in `client/src/main.tsx`.
  - In a mutation's `catch` block, surface the server's error text with `getApiErrorMessage(err, fallback)` (`client/src/lib/api.ts`) rather than re-checking `axios.isAxiosError` and digging into `err.response?.data` by hand — it pulls out the server's `{ error: string }` message and falls back to the supplied default. See `client/src/components/ReplyForm.tsx`, `UserForm.tsx`, `DeleteUserDialog.tsx`.
- Use Zod for all data validation, client and server — don't hand-roll `typeof`/regex checks:
  - **Client forms**: define the schema with `z.object({...})`, wire it up via `useForm({ resolver: zodResolver(schema) })` (`@hookform/resolvers/zod`), and add `noValidate` to the `<form>` so the browser's native HTML5 constraint validation (e.g. `type="email"`) can't silently swallow the submit event before Zod/React Hook Form ever sees it — see `client/src/components/UserForm.tsx`.
  - **Server routes**: define the same kind of schema in the route file and validate the request body with `schema.safeParse(req.body)`. On failure, call `sendValidationError(res, parsed.error)` (`server/src/lib/validation.ts`) rather than hand-rolling `res.status(400).json({ error: ... })` — see `server/src/routes/users.ts` and `server/src/routes/webhooks.ts`. `zod` is a direct dependency of both `client/package.json` and `server/package.json` (not just a transitive one via `better-auth`).
- Always compare/assign user roles via a `UserRole` enum — never a bare `"admin"`/`"agent"` string literal, on either side:
  - **Server**: import the generated `UserRole` from `server/src/generated/client/enums.ts` (e.g. `UserRole.admin` / `UserRole.agent`) — see `server/src/middleware/require-admin.ts`, `server/src/routes/users.ts`, `server/src/auth.ts`, `server/prisma/seed.ts`.
  - **Client**: import `UserRole` from `client/src/lib/users.ts` (a `const ... as const` object mirroring the server's generated enum shape, since `client/` can't reach across to the server package) — see `client/src/lib/auth-client.ts`, `client/src/components/AdminRoute.tsx`, `client/src/components/NavBar.tsx`, `client/src/components/UsersTable.tsx`. This applies to tests too — build fixtures with `role: UserRole.agent`, not `role: "agent"`.
- Never render a raw enum value as UI text — map it through a `Record<Enum, string>` labels constant instead, even if the enum values happen to look presentable. Define the map next to the enum in `client/src/lib/*.ts` (e.g. `ticketStatusLabels` / `ticketCategoryLabels` in `client/src/lib/tickets.ts`) and use it wherever the value is displayed (e.g. `client/src/components/TicketsTable.tsx`, `client/src/pages/TicketDetail.tsx`). Component tests should assert against the label (e.g. `ticketStatusLabels[TicketStatus.open]`), not the raw enum value.
- Write clean, modular code — no unnecessary abstractions.
- Do not change the locked tech stack without explicit approval.
