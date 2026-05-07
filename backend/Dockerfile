# syntax=docker/dockerfile:1

# Builder: glibc-based Bun. Produces a self-contained binary that we drop
# into a minimal distroless image. The debian variant (not alpine) is required
# so the binary is glibc-linked and compatible with the final stage.
FROM oven/bun:1 AS builder
WORKDIR /app

ENV BUN_INSTALL_CACHE_DIR=/bun-cache

COPY package.json bun.lock ./
COPY packages/types/package.json ./packages/types/package.json
COPY packages/types/src ./packages/types/src/
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json

RUN --mount=type=cache,target=/bun-cache \
    bun install --frozen-lockfile --production

COPY backend/ ./backend/
WORKDIR /app/backend

# msgpackr-extract is an optional native accelerator for msgpackr (used by
# BullMQ). msgpackr already has a JS fallback, so marking it external avoids
# bundling the missing native module.
RUN bun build --compile --external msgpackr-extract --outfile /app/server src/index.ts

# busybox provides a static wget for the distroless healthcheck (no shell available there).
FROM busybox:musl AS busybox

# Distroless: glibc + libstdc++ + ca-certs, no shell, runs as nonroot (uid 65532).
FROM gcr.io/distroless/cc-debian12:nonroot
WORKDIR /app

COPY --from=builder /app/server /app/server
COPY --from=builder /app/backend/drizzle /app/drizzle
COPY --from=busybox /bin/wget /usr/bin/wget

EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["/usr/bin/wget", "-qO-", "http://localhost:3001/api/health"]

ENTRYPOINT ["/app/server"]
