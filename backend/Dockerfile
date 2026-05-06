FROM oven/bun:1-alpine AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --production

# Copy source
COPY drizzle.config.ts ./
COPY drizzle ./drizzle
COPY src ./src

EXPOSE 3001

CMD ["bun", "run", "src/index.ts"]
