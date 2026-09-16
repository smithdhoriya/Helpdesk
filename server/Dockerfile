# Build context is the repo root (see ../.dockerignore) so this can reach the
# shared `core` workspace, which server/ depends on via "core": "workspace:*".
FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
COPY core/package.json core/package.json
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN bun install --frozen-lockfile

FROM deps AS build
COPY core core
COPY server server
# `prisma generate` only reads the schema — it never connects to the database —
# but prisma.config.ts's `env("DATABASE_URL")` still requires the var to resolve.
# This placeholder satisfies that at build time; the real URL is supplied at
# container runtime (see the CMD below) and is never used here.
RUN cd server && DATABASE_URL="postgresql://user:password@localhost:5432/db" bunx prisma generate

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/core core
COPY --from=build /app/server server
WORKDIR /app/server
USER bun
EXPOSE 4000
# `prisma migrate deploy` only applies pending migrations, so it's safe to run
# on every container start/restart — Railway has no separate release phase.
CMD ["sh", "-c", "bunx prisma migrate deploy && bun src/index.ts"]
