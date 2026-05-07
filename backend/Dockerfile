FROM oven/bun:1-alpine AS base
WORKDIR /app

COPY package.json bun.lock ./
COPY packages/types/package.json ./packages/types/package.json
COPY packages/types/src ./packages/types/src/
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json

RUN bun install --frozen-lockfile --production

COPY backend/drizzle.config.ts ./backend/drizzle.config.ts
COPY backend/drizzle ./backend/drizzle
COPY backend/src ./backend/src

WORKDIR /app/backend
EXPOSE 3001

CMD ["bun", "run", "src/index.ts"]
