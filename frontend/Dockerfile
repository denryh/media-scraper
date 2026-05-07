FROM oven/bun:1-alpine AS build
WORKDIR /app

COPY package.json bun.lock ./
COPY packages/types/package.json ./packages/types/package.json
COPY packages/types/src ./packages/types/src/
COPY frontend/package.json ./frontend/package.json
COPY backend/package.json ./backend/package.json

RUN bun install --frozen-lockfile

COPY frontend/ ./frontend/
WORKDIR /app/frontend
RUN bun run build

FROM nginx:alpine
COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
