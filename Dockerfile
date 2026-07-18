# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
WORKDIR /app

# ---------------------------------------------------------------------------
# deps: instala as dependencias da API (incluindo dev) para poder buildar
# ---------------------------------------------------------------------------
FROM base AS deps
COPY apps/api/package.json apps/api/package-lock.json* ./
RUN npm install

# ---------------------------------------------------------------------------
# build: compila TypeScript da API -> dist/
# ---------------------------------------------------------------------------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY apps/api/package.json apps/api/package-lock.json* ./
COPY apps/api/tsconfig.json ./
COPY apps/api/src ./src
RUN npm run build

# ---------------------------------------------------------------------------
# web-build: compila o painel React/Vite (servido na raiz) -> dist/
# ---------------------------------------------------------------------------
FROM node:20-alpine AS web-build
WORKDIR /app/web
COPY apps/web/package.json apps/web/package-lock.json* ./
RUN npm install
COPY apps/web ./
RUN npm run build

# ---------------------------------------------------------------------------
# runtime: imagem final, so com dependencias de producao + dist/
# Servidor HTTP e agendamentos (cron) rodam no mesmo processo "app"
# (ver src/scheduler.ts). O painel web/dist e servido por ele tambem
# (ver src/routes/admin.ts).
# ---------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
COPY apps/api/package.json apps/api/package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=web-build /app/web/dist ./web/dist

EXPOSE 3000

CMD ["node", "dist/server.js"]
