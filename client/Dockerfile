# Build context is the repo root (see ../.dockerignore) so this can reach the
# shared `core` workspace, which client/ depends on via "core": "workspace:*".
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
COPY client client
# Vite inlines VITE_* vars at build time, so they must be passed as build args.
# Railway auto-forwards a service's config variables as build args for any ARG
# declared here with a matching name.
ARG VITE_API_URL
ARG VITE_SENTRY_DSN
ARG VITE_SENTRY_ENVIRONMENT
RUN cd client && bun run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/client/dist client/dist
COPY client/serve.ts client/serve.ts
WORKDIR /app/client
USER bun
EXPOSE 4173
CMD ["bun", "serve.ts"]
