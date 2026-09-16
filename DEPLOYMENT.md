# Deploying to Railway

This repo deploys as **three Railway resources** in one project: a PostgreSQL
plugin, the `server` API, and the `client` static SPA. `server/Dockerfile` and
`client/Dockerfile` both build with the **repo root as context** (not their
own folder) because both workspaces depend on the shared `core` package via
`"core": "workspace:*"`.

## 1. Create the project and database

1. Railway dashboard → New Project → **Deploy from GitHub repo** → select this repo.
2. Delete the service Railway auto-creates from the repo (you'll add two services manually below, each pointed at a different Dockerfile).
3. **New → Database → PostgreSQL.** Railway provisions it and exposes `DATABASE_URL` on that plugin.

## 2. `server` service

New → GitHub Repo → same repo. Then in **Settings**:

- **Root Directory**: leave blank (repo root) — needed so the build can see `core/`.
- **Builder**: Dockerfile, **Dockerfile Path**: `server/Dockerfile`.
- **Healthcheck Path**: `/api/health` (already implemented in `server/src/app.ts`).

**Variables** (Variables tab):

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (variable reference to the plugin) |
| `NODE_ENV` | `production` — required: `server/src/auth.ts` only enables Better Auth's rate limiting when this is set |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | the server's own public URL (fill in after step 4 generates it, e.g. `https://helpdesk-server.up.railway.app`) |
| `TRUSTED_ORIGIN` | the **client's** public URL (fill in after the client service has a domain) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | used once by the seed script, see step 5 |
| `INBOUND_EMAIL_WEBHOOK_SECRET` | `openssl rand -base64 32` |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | from https://aistudio.google.com/apikey (model defaults to `gemini-2.5-flash`) |
| `RESEND_API_KEY`, `MAIL_FROM` | from https://resend.com/api-keys; leave blank to disable outbound email |
| `SENTRY_DSN`, `SENTRY_ENVIRONMENT` | from the `helpdesk-express` Sentry project; optional |

Deploy, then **Settings → Networking → Generate Domain** to get the server's public URL.

## 3. `client` service

New → GitHub Repo → same repo again. Settings:

- **Root Directory**: blank (repo root), same reason as above.
- **Builder**: Dockerfile, **Dockerfile Path**: `client/Dockerfile`.

**Variables** — these are Vite build-time vars, inlined at `bun run build` time, so they must be set *before* deploying and the service must be **redeployed** (not just restarted) whenever they change:

| Variable | Value |
|---|---|
| `VITE_API_URL` | the server's public URL from step 2 |
| `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT` | from the `helpdesk-react` Sentry project; optional |

Deploy, then **Settings → Networking → Generate Domain** to get the client's public URL.

## 4. Close the loop

Now that both public URLs exist:

1. On the **server** service, set `TRUSTED_ORIGIN` to the client's URL and `BETTER_AUTH_URL` to the server's own URL, then redeploy.
2. If `VITE_API_URL` wasn't already the final server URL, update it on the **client** service and redeploy (rebuild is required, since it's baked into the static bundle).

## 5. Seed the admin user

Sign-up is disabled (`disableSignUp: true`); the only user is created by the seed script, once, against the production database:

```sh
railway run --service server bun prisma/seed.ts
```

This reads `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` from the service's variables. Re-running is safe to skip once the admin exists — check `Users` in the app.

## Notes

- Migrations run automatically on every server deploy/restart via the Dockerfile's `CMD` (`prisma migrate deploy` before `bun src/index.ts`) — there's no separate Railway release phase to configure.
- pg-boss (the job queue) reuses `DATABASE_URL` and manages its own `pgboss` schema; no extra setup needed.
- The client is served by a small Bun static-file script (`client/serve.ts`) with SPA fallback to `index.html`, not Nginx — kept consistent with the stack's Bun runtime rather than adding a new tool.
- Both Dockerfiles run as the image's built-in non-root `bun` user.
