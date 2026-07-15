# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
WORKDIR /app

# ---------------------------------------------------------------------------
# deps: instala todas as dependencias (incluindo dev) para poder buildar
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install

# ---------------------------------------------------------------------------
# build: compila TypeScript -> dist/
# ---------------------------------------------------------------------------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json* ./
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---------------------------------------------------------------------------
# runtime: imagem final, so com dependencias de producao + dist/
# O mesmo build serve tanto para o servico "app" quanto para o "worker" -
# o docker-compose.yml decide qual entrypoint rodar via "command".
# ---------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/server.js"]
